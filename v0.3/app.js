// TNPO/MSVO Navigator v0.3 — application layer (H_c^(4) architecture).
// Every view is a PROJECTION of persisted governed state. Every learner control submits a REQUEST to the
// governed commit layer (core/commit.v3.js via db.governedTx), which re-derives authority from CURRENT persisted
// state inside one IndexedDB transaction. The DOM carries only identities (presentation id, epoch, probe id),
// never authority. Learner-facing text comes only from the translation layer (core/present.v3.js).
import { evidencePresentation, badgeForRecordType } from './core/evidence.v3.js';
import { normalizeLearnerState, historicalValidationPasses, hasActiveConcern, SELF_REPORT_OPTIONS } from './core/governance.v3.js';
import { makeTaskEngine, learnerDisplayPrompt } from './core/task.v3.js';
import { decide, readPlan, makeContent, logicalActionId, OUTCOMES, LEARNER_KINDS } from './core/commit.v3.js';
import * as db from './core/db.v3.js';
import { initFeedback, feedback, feedbackFor, __resetFeedback } from './core/feedback.v3.js';
import { makePresenter } from './core/present.v3.js';
import { AFM_SCENARIOS } from './core/afm.v3.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

const app = {
  map: null, slice: null, engine: null, content: null, P: null,
  sessionId: uuid(), booted: false, view: 'learn',
  // The DATA_SCOPE this page last rendered (read from persistence). It is sent with learner requests as a consistency
  // token only — the commit layer resolves the authoritative scope itself and refuses on mismatch. [H_c^(5) INV-P1]
  scope: null, scopeToken: null,
  resumeAck: {},   // per-scope view flag only (no governance meaning)
  lastResults: new Map(), results: [], inflight: 0, __failNextRender: false
};
const ackKey = () => db.isAFM() ? 'AFM' : (app.scopeToken && app.scopeToken !== 'AFM' ? app.scopeToken : 'ORDINARY');
async function refreshScope() {
  const s = await db.getScope();
  const pilotish = (t) => !!t && t !== 'ORDINARY' && t !== 'AFM';
  if (app.scopeToken && s.token !== app.scopeToken && (pilotish(app.scopeToken) || pilotish(s.token))) { app.resumeAck = {}; expanded.clear(); }   // another learner: drop view caches
  app.scope = s; app.scopeToken = s.token;
  $('#pilotBadge') && $('#pilotBadge').classList.toggle('hidden', s.kind !== 'PILOT');
  return s;
}

// ---------------- governed request submission ----------------
// Every learner-initiated async UI action is tracked, so tests (and nothing else) can wait for it to settle.
const track = (fn) => (...args) => { app.inflight++; return Promise.resolve().then(() => fn(...args)).catch(e => console.error(e)).finally(() => { app.inflight--; }); };
function envFor(ns) { return { ns, content: app.content, uuid, now: new Date().toISOString(), sessionId: app.sessionId }; }
async function commitRequest(req) {
  const ns = db.currentNS();
  let r = await db.governedTx(ns, {}, readPlan(req), (reads) => decide(req, reads, envFor(ns)));
  if (r.outcome === OUTCOMES.ABORTED && r.constraint)   // insert-only receipt collision -> re-read: reconciles as DUPLICATE
    r = await db.governedTx(ns, {}, readPlan(req), (reads) => decide(req, reads, envFor(ns)));
  return r;
}
const feedbackKind = (r) => r.outcome === OUTCOMES.COMMITTED ? (r.result && (r.result.code === 'VALIDATION_CONTAMINATED' || r.result.contaminated) ? 'info' : 'success')
  : (r.outcome === OUTCOMES.DUPLICATE ? 'info' : 'refusal');

// Submit a learner request; acknowledge ONLY after the transaction completed; then rebuild the view from persisted
// state. A render failure after a successful commit is reported as such and never resubmits. [contract §3]
async function submit(req, opts = {}) {
  app.inflight++;
  try { return await submitInner(req, opts); } finally { app.inflight--; }
}
async function submitInner(req0, { quiet = false, render = true } = {}) {
  const req = LEARNER_KINDS.includes(req0.kind) && req0.scope_token === undefined && app.scopeToken ? { ...req0, scope_token: app.scopeToken } : req0;
  const laid = logicalActionId(req, null) || `ENSURE:${uuid()}`;
  const r = await commitRequest(req);
  r.logical_action_id = laid;
  // post-commit forensic verification of what persistence retained for this participant [INV-P4]
  if (r.outcome === OUTCOMES.COMMITTED && (req.kind === 'WITHDRAW' || req.kind === 'COMPLETE_PILOT'))
    r.footprint = await db.participantFootprint(req.participant_id).catch((e) => { console.error(e); return null; });
  app.lastResults.set(laid, r);
  app.results.push({ laid, outcome: r.outcome, reason: r.result && r.result.reason, code: r.result && r.result.code });
  if (!quiet) feedback(app.P.feedbackText(r.outcome, r.result || {}, { submitted: req, footprint: r.footprint }), feedbackKind(r), { actionId: laid });
  if (r.outcome === OUTCOMES.COMMITTED) {
    announceCommit();
    if (LEARNER_KINDS.includes(req.kind) && !['SELF_REPORT', 'ENSURE_PRESENTATION'].includes(req.kind)) app.resumeAck[ackKey()] = true;  // learner is active in this page
  }
  if (render) {
    try { await renderActive(); }
    catch (err) {
      console.error(err);
      if (r.outcome === OUTCOMES.COMMITTED || r.outcome === OUTCOMES.DUPLICATE) {
        r.render_failure = true;
        feedback(app.P.feedbackText(OUTCOMES.RENDER), 'info', { actionId: laid });
        try { await renderActive(); } catch (e2) { console.error(e2); }
      }
    }
  }
  return r;
}

// ---------------- cross-tab freshness (auxiliary only; never authority) [contract §5] ----------------
let channel = null;
// Re-render only when the governed ACTIVE presentation actually changed, so an answer being typed is never wiped by
// an unrelated commit elsewhere. (Correctness never depends on this: stale submissions are refused at commit.)
async function refreshIfChanged() {
  if (!app.booted) return;
  if (app.view !== 'learn') return renderActive();
  const s = await db.getScope();
  if (s.token !== app.scopeToken) return renderActive();
  const id = await db.getMeta('active_learn', null); const tgt = await db.getMeta('current_target', null);
  if (id !== app.renderedPid || tgt !== app.renderedTarget) return renderActive();
}
try { channel = new BroadcastChannel('tnpo-msvo-v0.3'); channel.onmessage = (m) => { if (m.data && m.data.ns === db.currentNS()) refreshIfChanged().catch(() => {}); }; } catch (_) {}
function announceCommit() { try { channel && channel.postMessage({ ns: db.currentNS(), at: Date.now() }); } catch (_) {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfChanged().catch(() => {}); });

// ---------------- rendering helpers ----------------
function badge(recordType) {
  const label = badgeForRecordType(recordType); if (!label) return '';
  const cls = recordType === 'MAP_RECORD' ? 'map' : recordType === 'OBSERVATION' ? 'obs' : recordType === 'INFERENCE' ? 'inf' : 'dec';
  return `<span class="claim-badge ${cls}">${esc(label)}</span>`;
}
function evPill(code) { const e = evidencePresentation(code); return `<span class="evidence-pill ${code}" title="${esc(e.description)}">${esc(e.label)}</span>`; }
async function stateFor(nodeId) { return normalizeLearnerState(await db.getLearnerState(nodeId), nodeId).state; }
async function activePresentation() { const id = await db.getMeta('active_learn', null); return id ? db.getMeta(`pres::${id}`, null) : null; }

function navigate(name) {
  app.view = name;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${name}`).classList.add('active');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  window.scrollTo({ top: 0 });
  return renderActive();
}
$$('[data-nav]').forEach(b => b.addEventListener('click', track(() => navigate(b.dataset.nav))));
async function renderActive() {
  if (!app.booted) return;
  await refreshScope();
  if (app.view === 'learn') return renderLearn();
  if (app.view === 'map') return renderMap();
  if (app.view === 'progress') return renderProgress();
  if (app.view === 'more') { renderAFM(); return renderPilot(); }
}

// ---------------- LEARN ----------------
async function selectTarget(node, epoch) {
  app.inflight++;
  try {
    const current = await db.getMeta('current_target', null);
    app.resumeAck[ackKey()] = true;
    if (current === node) return await navigate('learn');
    app.view = 'learn';
    const r = await submit({ kind: 'TARGET_SELECT', node, epoch }, { render: false });
    await navigate('learn');
    return r;
  } finally { app.inflight--; }
}

async function renderLearn() {
  if (app.__failNextRender) { app.__failNextRender = false; throw new Error('SIMULATED_RENDER_FAILURE'); }   // ?test=1 only
  const body = $('#learnBody');
  const ns = ackKey();
  if (app.scope && app.scope.kind === 'UNRESOLVED') {
    app.renderedPid = null; app.renderedTarget = null;
    body.innerHTML = `<div class="card"><h2>Pilot session paused</h2><p class="muted">The pilot session on this device is incomplete, so learning is paused and nothing is recorded. Open More to stop the session.</p></div>`;
    return;
  }
  const [target, epoch] = await Promise.all([db.getMeta('current_target', null), db.getMeta('chooser_epoch', 0)]);
  if (!target || !app.resumeAck[ns]) {
    const P = app.P;
    app.renderedPid = null; app.renderedTarget = target || null;
    const pilotNote = app.scope && app.scope.kind === 'PILOT'
      ? `<div class="notice subtle top-gap">Pilot session ${esc(app.scope.participant_id)}: this session’s activity is kept separately from anyone else’s on this device.</div>` : '';
    const resume = target ? `<button class="primary-btn full-btn" data-resume>Resume: ${esc(P.nodeTitle(target))}</button>` : '';
    const suggestions = [...app.engine.listTargets().map(t => ({ id: t.node_id, title: P.nodeTitle(t.node_id), sub: 'Governed content slice' })),
      ...(app.slice?.nodes || []).filter(n => app.content.requiresEdge(n.node_id)).map(n => ({ id: n.node_id, title: P.nodeTitle(n.node_id), sub: 'Has a genuine prerequisite' }))];
    body.innerHTML = `
      <div class="card">
        <div class="eyebrow">CHOOSE A LEARNING TARGET</div>
        <h2>${target ? 'Welcome back' : 'Start here'}</h2>
        <p class="muted">${target ? 'Your progress is saved. Resume your target, or pick a different one.' : 'Pick a target to begin. Each has real tasks and a governed evaluator.'}</p>
        ${resume}${pilotNote}
        <div class="suggest-grid top-gap">
          ${suggestions.map(t => `<button class="suggest-card" data-target="${esc(t.id)}" data-epoch="${epoch}"><strong>${esc(t.title)}</strong><span>${esc(t.sub)}</span></button>`).join('')}
        </div>
      </div>
      <div class="card"><div class="eyebrow">WHAT THIS APP WILL NOT DO</div>
        <p class="muted small">No mastery percentage · no invented prerequisites · your self-report is evidence, not a command · a task's role is shown before you answer.</p></div>`;
    $$('[data-target]', body).forEach(b => b.addEventListener('click', () => selectTarget(b.dataset.target, Number(b.dataset.epoch))));
    const rb = $('[data-resume]', body);
    if (rb) rb.addEventListener('click', track(() => { app.resumeAck[ns] = true; feedback(`Resumed “${app.P.nodeTitle(target)}”. Your progress is intact.`, 'success', { actionId: `RESUME:${target}` }); return renderLearn(); }));
    return;
  }
  let pres = await activePresentation();
  if (!pres || pres.status !== 'ACTIVE' || pres.target !== target) {
    // no valid persisted ACTIVE presentation for the current target (legacy data / first resume): governed reconcile
    await submit({ kind: 'ENSURE_PRESENTATION' }, { quiet: true, render: false });
    pres = await activePresentation();
  }
  if (!pres) { body.innerHTML = `<div class="card"><h2>Couldn’t prepare your next step</h2><p class="muted">Nothing was recorded. Reload to try again.</p></div>`; return; }
  await renderPresentation(body, pres);
}

async function renderPresentation(body, pres) {
  const P = app.P;
  app.renderedPid = pres.presentation_id; app.renderedTarget = pres.target;
  const fState = await stateFor(pres.focus);
  const task = pres.task_id ? app.engine.getTask(pres.task_id) : null;
  const edge = app.content.requiresEdge(pres.target);
  const prov = P.provenance(edge);
  const provHtml = prov ? `<div class="kv small"><div>Relation</div><div>${esc(prov.relation)}</div><div>Status</div><div>${esc(prov.classification)}</div><div>Kind</div><div>${esc(prov.evidenceClass)}</div><div>Definition</div><div>${esc(prov.definition)}</div><div>Source</div><div>${esc(prov.source)}</div><div>Map</div><div>${esc(prov.map)}</div></div>` : '';
  let context;
  if (pres.backtrack) context = `<div class="prereq-box">${badge('MAP_RECORD')} <strong>Prerequisite (map fact)</strong>${provHtml}<p class="top-gap">${badge('DECISION')} ${esc(P.backtrackText(pres))}</p></div>`;
  else if (prov) context = `<div class="prereq-box">${badge('MAP_RECORD')} <strong>Prerequisite (map fact)</strong>${provHtml}</div>`;
  else context = `<div class="notice subtle top-gap">${badge('OBSERVATION')} No prerequisite (requires) relation is present for this target, so the app will not invent one.</div>`;
  const returnBanner = pres.returned ? `<div class="notice subtle top-gap">${badge('DECISION')} <strong>${esc(P.returnText(pres))}</strong></div>` : '';
  const lastPass = historicalValidationPasses(fState).at(-1);
  const historyBox = lastPass ? `<div class="notice subtle top-gap">${badge('DECISION')} <strong>Validation history:</strong> independently validated on ${esc(new Date(lastPass.timestamp).toLocaleDateString())}. History is preserved (append-only).</div>` : '';
  const concern = hasActiveConcern(fState) ? P.concernText(fState) : null;
  const concernNext = pres.action_kind === 'PT08_RECHECK' ? ' Your next step, below, is a re-check of this concern.' : (pres.kind === 'HOLD' ? ' See the options below.' : '');
  const concernBox = concern ? `<div class="notice subtle top-gap">${badge('INFERENCE')} <strong>Current concern.</strong> ${esc(concern + concernNext)}</div>` : '';

  let actionHtml;
  if (pres.kind === 'TASK' && task) {
    const isProbe = !!(task.is_conflict_session || task.is_resolution);
    const probe = isProbe ? task.probes[(pres.mini || { index: 0 }).index] : null;
    const role = pres.role;
    const shown = learnerDisplayPrompt(task, probe);          // the one learner-facing prompt source (INV-F4)
    const prompt = isProbe ? `Question ${(pres.mini?.index || 0) + 1} of ${task.probes.length}: ${shown}` : shown;
    const idAttrs = `data-pid="${esc(pres.presentation_id)}"${probe ? ` data-probe="${esc(probe.probe_id)}"` : ''}`;
    actionHtml = `
      <div class="action-card">
        <div class="action-topline"><span class="role-pill ${esc(role)}">${esc(P.ROLE[role])}</span>${badge('DECISION')}</div>
        <p class="small muted">${esc(P.ROLE_PREFACE[role])}</p>
        ${P.KIND_NOTE[pres.action_kind] ? `<p class="small muted">${esc(P.KIND_NOTE[pres.action_kind])}</p>` : ''}
        <p class="task-prompt">${esc(prompt)}</p>
        <label class="field-label" for="ans">Your answer</label>
        <input id="ans" class="text-input" inputmode="${task.response_format === 'boolean' ? 'text' : 'numeric'}" autocomplete="off" placeholder="${task.response_format === 'boolean' ? 'yes / no' : 'one integer'}" />
        <div class="button-row top-gap">
          ${role === 'PRACTICE'
            ? `<button class="primary-btn" data-submit="none" ${idAttrs}>Submit (no help)</button><button class="secondary-btn" data-submit="assisted" ${idAttrs}>Submit (used help)</button>`
            : `<button class="primary-btn" data-submit="none" ${idAttrs}>Submit${role === 'INDEPENDENT_VALIDATION' ? ' (no hints)' : ''}</button>`}
        </div>
      </div>`;
  } else {
    const ctl = new Set(pres.controls || []);
    actionHtml = `<div class="action-card"><p>${badge('DECISION')} ${esc(P.stepText(pres))}</p>
      <div class="button-row top-gap">
        ${ctl.has('RESTART_ROUND') ? `<button class="secondary-btn" data-restart="${esc(pres.presentation_id)}">Start a new round</button>` : ''}
        ${ctl.has('CHANGE_TARGET') ? `<button class="secondary-btn" data-change-target="${esc(pres.presentation_id)}">Choose another target</button>` : ''}
      </div></div>`;
  }

  body.innerHTML = `
    <div class="card">
      <div class="section-title-row align-start">
        <div><div class="eyebrow">CURRENT FOCUS</div><h2>${badge('MAP_RECORD')} ${esc(P.nodeTitle(pres.focus))}</h2><p class="small muted">${esc(P.nodeMeta(pres.focus))}</p></div>
        ${evPill(fState.evidence_state)}
      </div>
      <p class="target-question">${esc((P.node(pres.focus) && P.node(pres.focus).core_question) || 'No core question recorded.')}</p>
      <div class="button-row top-gap">
        <button class="secondary-btn" id="whyBtn">Why this step?</button>
        <button class="ghost-btn" id="selfReportBtn">Something’s wrong</button>
        <button class="ghost-btn" data-change-target="${esc(pres.presentation_id)}">Change target</button>
      </div>
      ${historyBox}${concernBox}${returnBanner}${context}${actionHtml}
    </div>`;

  $('#whyBtn', body).addEventListener('click', track(() => openWhy(pres.focus)));
  $('#selfReportBtn', body).addEventListener('click', () => openSelfReport(pres.focus, pres.presentation_id));
  $$('[data-change-target]', body).forEach(b => b.addEventListener('click', () => submit({ kind: 'CHANGE_TARGET', presentation_id: b.dataset.changeTarget })));
  $$('[data-restart]', body).forEach(b => b.addEventListener('click', () => submit({ kind: 'RESTART_ROUND', presentation_id: b.dataset.restart })));
  $$('[data-submit]', body).forEach(b => b.addEventListener('click', () => submit({ kind: 'ANSWER', presentation_id: b.dataset.pid,
    probe_id: b.dataset.probe || undefined, response: ($('#ans') || {}).value || '', support_used: b.dataset.submit === 'assisted' })));
}

// ---------------- Why this step ----------------
async function openWhy(nodeId) {
  const [state, pres, events] = await Promise.all([stateFor(nodeId), activePresentation(), db.getEvents()]);
  const w = app.P.whyModel({ nodeId, state, pres: pres && pres.status === 'ACTIVE' ? pres : null, events, taskById: (id) => app.engine.getTask(id) });
  $('#whyEvidenceState').innerHTML = evPill(state.evidence_state);
  $('#whyKnow').innerHTML = `${badge('MAP_RECORD')} <span>${esc(w.know)}</span> <span class="small muted">(${esc(w.knowMeta)})</span>`;
  $('#whyObserved').innerHTML =
    (w.observed.length ? `${badge('OBSERVATION')}<ul>${w.observed.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `${badge('OBSERVATION')} <span>No learner-specific observation recorded yet for this focus.</span>`)
    + (w.evaluations.length ? `<div class="top-gap"><div class="why-label">Evaluator evidence (stored as its own EVALUATION record; it feeds the inference below and is neither an observation nor the inference itself):</div><ul>${w.evaluations.map(x => `<li class="small">${esc(x)}</li>`).join('')}</ul></div>` : '');
  $('#whyUncertain').innerHTML = `${badge('INFERENCE')} <span>${esc(w.uncertain)}</span>`;
  $('#whyDecision').innerHTML = `${badge('DECISION')} <span>${esc(w.decision)}</span>`;
  $('#whyDialog').showModal();
}

// ---------------- Learner correction / self-report ----------------
function openSelfReport(nodeId, presentationId) {
  const dialogId = uuid();   // LOGICAL_ACTION_ID seed for this dialog instance (retry reuses it)
  // The learner data scope the report belongs to is the one the dialog was opened in, even if the page re-renders into
  // another scope behind the open dialog; the commit layer refuses it (DATA_SCOPE_CHANGED) unless that scope is still
  // authoritative. The token only ever refuses — it never selects a scope. (A1 FR-10; H_c^(7) F6-02 scope isolation)
  const scopeToken = app.scopeToken || undefined;
  $('#correctionChoices').innerHTML = `<legend class="sr-only">Choose a correction</legend>` +
    SELF_REPORT_OPTIONS.map((o, i) => `<label><input type="radio" name="correction" value="${esc(o)}"${i === 0 ? ' checked' : ''} /> <span>${esc(o)}</span></label>`).join('');
  $('#correctionNote').value = '';
  $('#saveCorrectionBtn').onclick = async () => {
    const sel = $('#correctionForm input[name="correction"]:checked');
    // the presentation the dialog was opened on is provenance only: the commit layer applies a help report to the
    // authoritative ACTIVE_EXPOSURE of this scope at commit time (A1 FR-6; H_c^(7) F6-02)
    const r = await submit({ kind: 'SELF_REPORT', dialog_id: dialogId, scope_token: scopeToken, node: nodeId, presentation_id: presentationId || undefined, value: sel ? sel.value : null, note: $('#correctionNote').value.trim() || null });
    if (r.outcome === OUTCOMES.COMMITTED || r.outcome === OUTCOMES.DUPLICATE || r.outcome === OUTCOMES.STALE) $('#correctionDialog').close();
  };
  $('#correctionDialog').showModal();
}

// ---------------- MAP ----------------
const expanded = new Set();
function nodeVisualState(id, states, pres) {
  if (pres && id === pres.focus) return 'CURRENT';
  if (pres && id === pres.target) return 'TARGET';
  const s = states.get(id); if (!s) return '';
  if (s.validation_state === 'VALIDATED') return 'VALIDATED';
  if (['ASSISTED_PRACTICE', 'INDEPENDENT_PRACTICE'].includes(s.practice_state)) return 'PRACTICED';
  if (s.evidence_state === 'INSUFFICIENT_EVIDENCE' || s.evidence_state === 'CONFLICTING_EVIDENCE') return 'NEEDS_EVIDENCE';
  return '';
}
async function renderMap() {
  const [rows, pres, epoch, target] = await Promise.all([db.listLearnerStates(), activePresentation(), db.getMeta('chooser_epoch', 0), db.getMeta('current_target', null)]);
  const states = new Map(rows.map(s => [s.node_id, normalizeLearnerState(s, s.node_id).state]));
  const live = pres && pres.status === 'ACTIVE' && target ? pres : null;
  $('#mapCount').textContent = `${app.map.node_count} topics`;
  const tree = $('#mapTree');
  tree.innerHTML = app.map.roots.map(id => nodeRowHtml(id, states, live)).join('');
  $$('[data-node]', tree).forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = btn.dataset.node; const n = app.P.node(id);
    track(async () => { if (n && n.children && n.children.length) { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); await renderMap(); } showMapDetail(id, states, epoch); })();
  }));
}
function nodeRowHtml(id, states, pres) {
  const n = app.P.node(id); if (!n) return '';
  const kids = n.children || [];
  const isOpen = expanded.has(id);
  return `<div class="tree-node">
    <button class="tree-row" data-node="${esc(id)}">
      <span class="twisty">${kids.length ? (isOpen ? '▾' : '▸') : '·'}</span>
      <span class="state-dot ${nodeVisualState(id, states, pres)}"></span>
      <span class="node-label">${esc(n.node_id)} · ${esc(n.label)}</span>
    </button>
    ${isOpen && kids.length ? `<div class="tree-children">${kids.map(k => nodeRowHtml(k, states, pres)).join('')}</div>` : ''}
  </div>`;
}
function showMapDetail(id, states, epoch) {
  const P = app.P; const n = P.node(id); if (!n) return;
  const s = states.get(id);
  const detail = $('#mapDetail');
  detail.classList.remove('empty-state');
  detail.innerHTML = `
    <div class="section-title-row align-start"><div>${badge('MAP_RECORD')}<h2>${esc(n.node_id)} · ${esc(n.label)}</h2></div>${s ? evPill(s.evidence_state) : ''}</div>
    <p class="target-question">${esc(n.core_question || 'No core question recorded.')}</p>
    <div class="kv"><div>Type</div><div>${esc(String(n.node_type || '').toLowerCase().replace(/_/g, ' '))}</div><div>Parent</div><div>${esc(n.parent_id ? `${n.parent_id} · ${P.nodeTitle(n.parent_id)}` : '—')}</div><div>Sub-topics</div><div>${(n.children || []).length}</div></div>
    ${(n.children || []).length === 0 ? `<div class="notice subtle">${badge('MAP_RECORD')} No sub-topics — this is a leaf topic in the map (not a loading error).</div>` : ''}
    <div class="notice subtle top-gap">${badge('OBSERVATION')} No prerequisite (requires) relation is present for this topic in the ordinary map, so none is drawn.</div>
    ${app.content.isLearnable(id) ? `<button class="primary-btn full-btn top-gap" data-learn-node="${esc(id)}" data-epoch="${epoch}">Learn this topic</button>` : `<p class="small muted top-gap">No governed tasks are authored for this topic yet.</p>`}`;
  const lb = $('[data-learn-node]', detail); if (lb) lb.addEventListener('click', () => selectTarget(lb.dataset.learnNode, Number(lb.dataset.epoch)));
}

// ---------------- PROGRESS ----------------
const friendly = {
  UNEXPOSED: 'Not yet recorded', SEEN_AND_EXPLAINED: 'Seen and explained',
  NOT_PRACTICED: 'Not practiced', ASSISTED_PRACTICE: 'Assisted practice', INDEPENDENT_PRACTICE: 'Independent practice',
  NOT_VALIDATED: 'Not independently validated', VALIDATED: 'Independently validated',
  NOT_ASSESSED: 'Not assessed', RETENTION_CONCERN: 'Current retention concern', REVALIDATION_DUE: 'Review due'
};
async function renderProgress() {
  const P = app.P;
  const [rows, epoch] = await Promise.all([db.listLearnerStates(), db.getMeta('chooser_epoch', 0)]);
  const states = rows.map(s => normalizeLearnerState(s, s.node_id).state);
  const practiced = states.filter(s => ['ASSISTED_PRACTICE', 'INDEPENDENT_PRACTICE'].includes(s.practice_state)).length;
  const validated = states.filter(s => s.validation_state === 'VALIDATED').length;
  const conflicting = states.filter(s => s.evidence_state === 'CONFLICTING_EVIDENCE').length;
  const concerns = states.filter(hasActiveConcern).length;
  $('#progressOverview').innerHTML = `<div class="stat"><b>${states.length}</b><span>Tracked topics</span></div><div class="stat"><b>${practiced}</b><span>Practiced</span></div><div class="stat"><b>${validated}</b><span>Validated</span></div><div class="stat"><b>${conflicting}</b><span>Conflicting</span></div><div class="stat"><b>${concerns}</b><span>Open concerns</span></div>`;
  if (!states.length) { $('#progressList').innerHTML = `<div class="card empty-state">No records yet. Choose a target under Learn and complete a task.</div>`; return; }
  // five separate dimensions; NO aggregate mastery scalar [V03-GOV-005/006]
  $('#progressList').innerHTML = states.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).map(s => {
    const lastPass = historicalValidationPasses(s).at(-1);
    const concern = hasActiveConcern(s) ? P.concernText(s) : null;
    return `<article class="progress-card">
      <div class="section-title-row align-start"><div><div class="eyebrow">${esc(P.nodeMeta(s.node_id))}</div><h3>${esc(P.nodeTitle(s.node_id))}</h3></div>${evPill(s.evidence_state)}</div>
      <div class="dimension-grid">
        <div class="dimension-row"><span class="label">Exposure</span><span class="value">${esc(friendly[s.exposure_state] || '—')}</span></div>
        <div class="dimension-row"><span class="label">Practice</span><span class="value">${esc(friendly[s.practice_state] || '—')}</span></div>
        <div class="dimension-row"><span class="label">Validation</span><span class="value">${esc(friendly[s.validation_state] || '—')}</span></div>
        <div class="dimension-row"><span class="label">Retention</span><span class="value">${esc(friendly[s.retention_state] || '—')}</span></div>
        <div class="dimension-row"><span class="label">Evidence</span><span class="value">${esc(evidencePresentation(s.evidence_state).label)}</span></div>
      </div>
      ${lastPass ? `<div class="history-block">${badge('DECISION')} <span>Previously independently validated on ${esc(new Date(lastPass.timestamp).toLocaleDateString())}. History is preserved.</span></div>` : ''}
      ${concern ? `<div class="history-block">${badge('INFERENCE')} <span>${esc(concern)}</span></div>` : ''}
      ${app.content.isLearnable(s.node_id) ? `<div class="button-row top-gap"><button class="ghost-btn" data-open-learn="${esc(s.node_id)}" data-epoch="${epoch}">Open in Learn</button></div>` : ''}
    </article>`;
  }).join('');
  $$('[data-open-learn]').forEach(b => b.addEventListener('click', () => selectTarget(b.dataset.openLearn, Number(b.dataset.epoch))));
}

// ---------------- MORE: legend, pilot, AFM, research ----------------
function renderLegend() {
  $('#evidenceLegend').innerHTML = ['ESTABLISHED', 'SUPPORTED_NOT_ESTABLISHED', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE']
    .map(c => { const e = evidencePresentation(c); return `<div class="legend-row"><div><strong>${esc(e.label)}</strong><p>${esc(e.description)}</p></div>${evPill(c)}</div>`; }).join('');
}
function renderResearch() {
  $('#researchStatus').innerHTML = `<div class="dimension-grid top-gap">
    <div class="dimension-row"><span class="label">Build</span><span class="value">v0.3.0 (governed learner loop).</span></div>
    <div class="dimension-row"><span class="label">Device audit</span><span class="value">Formal on-device review not executed here (separate stage).</span></div>
    <div class="dimension-row"><span class="label">Pilot 01</span><span class="value">Not started.</span></div>
    <div class="dimension-row"><span class="label">Efficacy</span><span class="value">Not tested.</span></div></div>`;
}
// Consent / withdrawal lane — restores the frozen protections (V03-GOV-009; Consent Addendum §3–§4; Supplement §1).
async function renderPilot() {
  const body = $('#pilotBody');
  if (db.isAFM()) { body.innerHTML = `<p class="notice subtle">Pilot mode is not available in audit fixture mode. Exit audit fixture mode to use the real pilot lane.</p>`; return; }
  const [active, epoch, scope] = await Promise.all([db.getGlobalMeta('active_pilot', null), db.getGlobalMeta('pilot_epoch', 0), db.getScope()]);
  if (active) {
    const resolved = scope.kind === 'PILOT' && scope.participant_id === active;
    body.innerHTML = `<p class="notice subtle">Stopping the pilot is not a learner failure and is not used as evidence about your ability or understanding.</p>
      <div class="section-title-row"><h3>Active: ${esc(active)}</h3><span class="badge neutral">Local pilot lane</span></div>
      ${resolved ? '' : `<p class="notice subtle">This pilot session record is incomplete, so learning is paused. You can stop the session below.</p>`}
      <p class="small">This session’s activity is kept separately from anyone else’s on this device. You can stop at any time, without giving a reason. You may choose what happens to your pilot data, or just stop — if you don't choose, the default applies.</p>
      <div class="button-row top-gap wrap">
        <button class="danger-btn" data-withdraw="DELETE_WHERE_FEASIBLE" data-default="1" data-epoch="${epoch}" data-pid="${esc(active)}">Stop — default: exclude my pilot data and delete it where feasible</button>
        <button class="secondary-btn" data-withdraw="RETAIN_DEIDENTIFIED" data-epoch="${epoch}" data-pid="${esc(active)}">Stop — allow de-identified pilot data to remain</button>
      </div>
      ${resolved ? `<p class="small top-gap">When the session is finished (not a withdrawal), end it here. The activity is kept under the participant code for the pilot analysis, and the next participant starts with no earlier data.</p>
      <div class="button-row top-gap wrap"><button class="secondary-btn" data-complete-pilot="${esc(active)}" data-epoch="${epoch}">End session (finished — not a withdrawal)</button></div>` : ''}`;
    $$('[data-withdraw]', body).forEach(b => b.addEventListener('click', () => submit({ kind: 'WITHDRAW', epoch: Number(b.dataset.epoch), participant_id: b.dataset.pid,
      disposition: b.dataset.withdraw, default_choice: b.dataset.default === '1' })));
    $$('[data-complete-pilot]', body).forEach(b => b.addEventListener('click', () => submit({ kind: 'COMPLETE_PILOT', epoch: Number(b.dataset.epoch), participant_id: b.dataset.completePilot })));
  } else {
    body.innerHTML = `
      <div class="consent-box">
        <p><strong>Participation is voluntary.</strong> You can stop at any time, for any reason or no stated reason, without penalty.</p>
        <p>The check below is only to make sure your rights were explained clearly. It is not part of the study tasks, it is not scored, and there is no penalty for asking for clarification.</p>
        <p>Your pilot activity is kept separately from anyone else’s on this device and is recorded under your participant code only (no name). If you finish the session normally, it is kept under that code for the pilot analysis.</p>
        <p><strong>If you stop later:</strong> you may choose either to let already-collected de-identified pilot data remain, or to have your participant-level pilot data excluded from analysis and deleted where technically feasible. If you stop and give no preference, the default is to exclude your pilot data from analysis and delete participant-level pilot data where technically feasible. Data that has already been irreversibly de-identified or combined into aggregate results may no longer be separable, and deletion that is technically impossible is not promised.</p>
      </div>
      <label class="field-label" for="pid">Participant ID</label>
      <input id="pid" class="text-input" value="P01" autocomplete="off" style="max-width:180px" />
      <label class="check-row"><input id="consentCheck" type="checkbox" /> <span>I understand participation is voluntary, I can stop without giving a reason, stopping will not count against me, and I know what happens to my data if I stop.</span></label>
      <button class="primary-btn" id="beginPilotBtn" data-epoch="${epoch}">Begin pilot mode</button>`;
    $('#beginPilotBtn').addEventListener('click', (e) => submit({ kind: 'CONSENT', epoch: Number(e.currentTarget.dataset.epoch),
      participant_id: $('#pid').value.trim().toUpperCase(), affirmed: $('#consentCheck').checked === true }));
  }
}
function renderAFM() {
  const on = db.isAFM();
  $('#afmBadge').classList.toggle('hidden', !on);
  const body = $('#afmBody');
  body.innerHTML = `
    <p class="notice subtle">Audit fixture mode is a clearly-labeled, isolated preflight. It uses separate storage, never counts toward real learner progress, and can never be a formal device-review pass.</p>
    <div class="button-row">
      <button class="secondary-btn" id="afmToggle">${on ? 'Exit' : 'Enter'} audit fixture mode</button>
      <button class="ghost-btn" id="afmReset">Reset fixtures</button>
    </div>
    <div class="button-row top-gap">${AFM_SCENARIOS.map(s => `<button class="ghost-btn" data-afm="${esc(s.id)}">${esc(s.title)}</button>`).join('')}</div>
    <div id="afmResult" class="top-gap"></div>`;
  $('#afmToggle').addEventListener('click', () => { setNamespace(!db.isAFM()); feedback(db.isAFM() ? 'Entered audit fixture mode (isolated).' : 'Exited audit fixture mode.', 'info', { actionId: `AFM_TOGGLE:${uuid()}` }); });
  $('#afmReset').addEventListener('click', track(async () => { await db.resetAFM(); app.resumeAck['AFM'] = false; feedback('Fixture state reset.', 'info', { actionId: `AFM_RESET:${uuid()}` }); await renderActive(); }));
  $$('[data-afm]', body).forEach(b => b.addEventListener('click', () => {
    const sc = AFM_SCENARIOS.find(x => x.id === b.dataset.afm); const inf = sc.build('AFM_TARGET');
    const n = (inf.competing_hypotheses || []).length;
    $('#afmResult').innerHTML = `<div class="action-card"><div class="action-topline"><strong>${esc(sc.title)}</strong>${evPill(inf.evidence_state)}</div>
      <p class="small">${badge('INFERENCE')} ${esc(evidencePresentation(inf.evidence_state).description)}</p>
      <p class="small muted">${n ? `${n} competing interpretations (${esc(inf.competing_hypotheses.map(h => h.replace(/_/g, ' ')).join(' vs '))})` : 'No competing interpretations'} · preflight only — not a formal device-review pass.</p></div>`;
  }));
}
// Namespace switch: every view cache is discarded; all governed session state is persisted per namespace. [INV-D2]
function setNamespace(afm) {
  db.setAFM(afm);
  app.scopeToken = afm ? 'AFM' : null;   // AFM is a per-page mode; outside AFM the token is unknown until re-read (none sent => pilot scope refuses)
  expanded.clear();
  app.resumeAck['AFM'] = afm ? app.resumeAck['AFM'] : false;
  $('#afmBadge').classList.toggle('hidden', !afm);
  return track(renderActive)();
}

// ---------------- connection status ----------------
db.onStateChanged((d) => {
  if (d.kind === 'db' && d.status === 'retired') {
    let el = $('#connBanner');
    if (!el) { el = document.createElement('div'); el.id = 'connBanner'; el.className = 'notice subtle conn-banner'; el.setAttribute('role', 'alert'); $('#app').prepend(el); }
    el.textContent = 'This app was updated or closed in another tab, so saving is paused here. Reload this page to continue — nothing unsaved was recorded.';
  }
  if (d.kind === 'db' && d.status === 'blocked') feedback('Waiting for another open tab of this app to close before storage can be opened.', 'info', { actionId: `DB_BLOCKED:${uuid()}` });
  if (d.kind === 'commit' && (app.view === 'map' || app.view === 'progress')) renderActive().catch(() => {});
});

// ---------------- boot ----------------
async function loadJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }
async function boot() {
  initFeedback({ toastRoot: $('#toastRoot'), liveRegion: $('#statusAnnouncer') });
  $('#connectionBadge').textContent = navigator.onLine ? 'Online' : 'Offline';
  try {
    const [map, gpcs, slice] = await Promise.all([loadJSON('data/msvo_canonical_map.v0.3.json'), loadJSON('data/gpcs_tasks.v0.3.json'), loadJSON('data/gpcs_prereq_slice.v0.3.json')]);
    app.map = map; app.slice = slice; app.engine = makeTaskEngine(gpcs, slice);
    app.content = makeContent(app.engine, slice, map);
    app.P = makePresenter({ map, slice, engine: app.engine });
    await db.openDB();
    app.booted = true;
    await refreshScope();
    renderLegend(); renderResearch(); renderAFM(); await renderPilot();
    await renderLearn();
  } catch (err) {
    console.error(err);
    $('#learnBody').innerHTML = `<div class="card"><h2>Couldn't start</h2><p class="muted">Something went wrong while loading. Nothing was recorded. Reload to try again.</p></div>`;
  }
}
$('#learnBody').innerHTML = `<div class="card"><p class="muted">Loading your learning space…</p></div>`;
boot();

// Test-only hook — exposed ONLY with ?test=1 (production has no debug/fault hook). [L4]
try {
  if (new URLSearchParams(location.search).has('test')) {
    window.__v3 = { app, db, submit, commitRequest, decide, readPlan, logicalActionId, feedbackFor, __resetFeedback, renderActive, navigate, setNamespace, OUTCOMES };
  }
} catch (_) { /* no-op */ }
