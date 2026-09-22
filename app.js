import {
  BUILD_VERSION,
  badgeForRecordType,
  evidencePresentation,
  taskRolePresentation,
  defaultLearnerState,
  applyAuthorizedTransition,
  mayDisplayReviewDue,
  historicalValidation,
  learnerCorrectionEvent,
  deriveWhyPanel,
  GovernanceError
} from './governance.js';

import {
  getRecord,
  getAll,
  putRecord,
  clearStore,
  setMeta,
  getMeta,
  getActivePilotId,
  getLearnerState,
  putLearnerState,
  listLearnerStates,
  appendEvent,
  startPilotSession,
  withdrawPilotSession,
  endPilotSessionWithoutWithdrawal,
  exportLocalData
} from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escapeHTML = (s = '') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const app = {
  nodes: [],
  edges: [],
  tnpoRoots: [],
  tnpoBranches: [],
  tnpoModules: [],
  semanticCatalog: [],
  semanticMap: new Map(),
  nodeMap: new Map(),
  activeTargetId: null,
  selectedMapId: null,
  pilotId: null
};

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

function announce(message) {
  $('#statusAnnouncer').textContent = '';
  window.setTimeout(() => { $('#statusAnnouncer').textContent = message; }, 20);
}

function formatTemplate(template, vars = {}) {
  return String(template).replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function semanticText(outputId, vars = {}) {
  const item = app.semanticMap.get(outputId);
  if (!item) throw new Error(`Unregistered semantic output: ${outputId}`);
  return formatTemplate(item.template, vars);
}

function outputAttr(outputId) {
  return `data-output-id="${escapeHTML(outputId)}"`;
}

function provenanceBadge(recordType, outputId = null) {
  const label = badgeForRecordType(recordType);
  if (!label) return '';
  const cls = recordType === 'MAP_RECORD' ? 'map' : recordType === 'OBSERVATION' ? 'obs' : recordType === 'INFERENCE' ? 'inf' : 'dec';
  const id = outputId || (recordType === 'MAP_RECORD' ? 'PROV_MAP_FACT' : recordType === 'OBSERVATION' ? 'PROV_OBSERVATION' : recordType === 'INFERENCE' ? 'PROV_INFERENCE' : 'PROV_DECISION');
  return `<span class="claim-badge ${cls}" ${outputAttr(id)}>${escapeHTML(label)}</span>`;
}

function evidencePill(code) {
  const e = evidencePresentation(code);
  const cls = code === 'ESTABLISHED' ? 'established' : code === 'SUPPORTED_NOT_ESTABLISHED' ? 'supported' : code === 'CONFLICTING_EVIDENCE' ? 'conflicting' : 'insufficient';
  const outputId = code === 'ESTABLISHED' ? 'EVID_ESTABLISHED' : code === 'SUPPORTED_NOT_ESTABLISHED' ? 'EVID_SUPPORTED' : code === 'CONFLICTING_EVIDENCE' ? 'EVID_CONFLICTING' : 'EVID_INSUFFICIENT';
  return `<span class="evidence-pill ${cls}" ${outputAttr(outputId)} title="${escapeHTML(e.description)}">${escapeHTML(e.label)}</span>`;
}

function safeNode(id) { return app.nodeMap.get(id) || null; }
function childrenOf(id) { return app.nodes.filter(n => n.parent_id === id); }
function relationsOf(id) { return app.edges.filter(e => e.source === id || e.target === id); }
function nonTreeRelations(id) { return relationsOf(id).filter(e => !['PART_OF', 'HAS_PART'].includes(e.relation)); }

async function currentTargetKey() {
  const pid = await getActivePilotId();
  return pid ? `active_target_pilot_${pid}` : 'active_target_personal';
}

async function getCurrentTarget() {
  const key = await currentTargetKey();
  return getMeta(key, null);
}

async function setCurrentTarget(nodeId) {
  const key = await currentTargetKey();
  await setMeta(key, nodeId);
  app.activeTargetId = nodeId;
  await appendEvent('TARGET_SELECTED', { node_id: nodeId }, { record_type: 'DECISION', authorization_id: `LOCAL_POLICY_${BUILD_VERSION}` });
  await refreshLearn();
  announce(`Learning target set to ${safeNode(nodeId)?.label || nodeId}.`);
}

async function currentEventsForNode(nodeId) {
  const pid = await getActivePilotId();
  const events = await getAll(pid ? 'pilotEvents' : 'events');
  return events.filter(e => e.payload?.node_id === nodeId || e.payload?.context?.node_id === nodeId).slice(-8);
}

async function commitGovernedTransition(nodeId, transition) {
  const previous = (await getLearnerState(nodeId)) || defaultLearnerState(nodeId);
  const authorizationId = `AUTH_${crypto.randomUUID()}`;
  const authorizedTransition = { ...transition, authorized: true, timestamp: new Date().toISOString() };
  const { next } = applyAuthorizedTransition(previous, authorizedTransition);
  next.last_authorization_id = authorizationId;

  await appendEvent('DECISION_AUTHORIZED', {
    node_id: nodeId,
    transition: authorizedTransition
  }, { record_type: 'DECISION', authorization_id: authorizationId });

  await putLearnerState(next);

  await appendEvent('STATE_TRANSITION', {
    node_id: nodeId,
    transition_type: transition.type,
    previous,
    next
  }, { record_type: 'DECISION', authorization_id: authorizationId });

  return next;
}

// ---------- Navigation ----------
function navigate(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${name}`).classList.add('active');
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'learn') refreshLearn();
  if (name === 'progress') renderProgress();
  if (name === 'more') refreshMore();
}
$$('[data-nav]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.nav)));

// ---------- Connectivity ----------
function updateConnectivity() {
  const online = navigator.onLine;
  const el = $('#connectionBadge');
  el.textContent = online ? 'Online' : 'Offline';
  el.className = `mini-status ${online ? 'online' : 'offline'}`;
}
window.addEventListener('online', updateConnectivity);
window.addEventListener('offline', updateConnectivity);

// ---------- Search ----------
function searchNodes(query, limit = 14) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return app.nodes.filter(n => `${n.node_id} ${n.label} ${n.legacy_aliases || ''} ${n.core_question || ''}`.toLowerCase().includes(q)).slice(0, limit);
}

function nodeResultButton(n, action = 'learn') {
  return `<button class="result-item clickable" type="button" data-node-action="${action}" data-node-id="${escapeHTML(n.node_id)}">
    <div><div class="result-title">${escapeHTML(n.node_id)} · ${escapeHTML(n.label)}</div><div class="result-meta">${escapeHTML(n.node_type.replaceAll('_',' '))}</div></div><div aria-hidden="true">›</div>
  </button>`;
}

function bindNodeActionButtons(root) {
  $$('[data-node-action][data-node-id]', root).forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.nodeId;
    if (btn.dataset.nodeAction === 'learn') {
      await setCurrentTarget(id);
      $('#learnSearch').value = '';
      $('#learnSearchResults').innerHTML = '';
      $('#sessionCard').classList.remove('hidden');
      $('#sessionCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      await showMapNode(id);
    }
  }));
}

$('#learnSearch').addEventListener('input', e => {
  const hits = searchNodes(e.target.value, 12);
  $('#learnSearchResults').innerHTML = hits.map(n => nodeResultButton(n, 'learn')).join('') || (e.target.value.trim().length >= 2 ? '<div class="muted small">No matching map nodes.</div>' : '');
  bindNodeActionButtons($('#learnSearchResults'));
});

// ---------- Learn ----------
async function refreshLearn() {
  app.pilotId = await getActivePilotId();
  app.activeTargetId = await getCurrentTarget();
  const id = app.activeTargetId;
  if (!id || !safeNode(id)) {
    $('#continueCard').classList.add('hidden');
    $('#sessionCard').classList.add('hidden');
    return;
  }

  const n = safeNode(id);
  const state = (await getLearnerState(id)) || defaultLearnerState(id);
  $('#continueCard').classList.remove('hidden');
  $('#continueEvidenceBadge').innerHTML = evidencePill(state.evidence_state);
  $('#continueTarget').innerHTML = `<h3 ${outputAttr('MAP_NODE_TITLE')}>${escapeHTML(n.node_id)} · ${escapeHTML(n.label)}</h3><p class="target-question" ${outputAttr('MAP_NODE_QUESTION')}>${escapeHTML(n.core_question || 'No core question recorded.')}</p>`;

  $('#sessionMapBadge').innerHTML = provenanceBadge('MAP_RECORD');
  $('#sessionTarget').innerHTML = `<h3 ${outputAttr('MAP_NODE_TITLE')}>${escapeHTML(n.node_id)} · ${escapeHTML(n.label)}</h3><p class="target-question" ${outputAttr('MAP_NODE_QUESTION')}>${escapeHTML(n.core_question || 'No core question recorded.')}</p><div class="top-gap">${evidencePill(state.evidence_state)}</div>`;

  const requires = app.edges.filter(e => e.source === id && e.relation === 'REQUIRES');
  if (requires.length === 0) {
    $('#prereqAvailability').innerHTML = `${provenanceBadge('OBSERVATION')} <span ${outputAttr('PREREQ_GRAPH_UNAVAILABLE')}>${escapeHTML(semanticText('PREREQ_GRAPH_UNAVAILABLE'))}</span>`;
  } else {
    $('#prereqAvailability').innerHTML = `${provenanceBadge('MAP_RECORD')} <strong>Prerequisites in bundled map:</strong> ${requires.map(e => escapeHTML(`${e.target} — ${safeNode(e.target)?.label || 'Unknown node'}`)).join(', ')}`;
  }
}

$('#openSessionBtn').addEventListener('click', () => {
  $('#sessionCard').classList.remove('hidden');
  $('#sessionCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#changeTargetBtn').addEventListener('click', () => {
  $('#learnSearch').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#recordExposureBtn').addEventListener('click', async () => {
  if (!app.activeTargetId) return;
  try {
    await commitGovernedTransition(app.activeTargetId, { type: 'RECORD_EXPOSURE' });
    announce('Exposure recorded. This did not validate the topic.');
    await refreshLearn();
  } catch (err) { handleGovernanceError(err); }
});

$('#recordIndependentPracticeBtn').addEventListener('click', async () => {
  if (!app.activeTargetId) return;
  try {
    await commitGovernedTransition(app.activeTargetId, { type: 'RECORD_PRACTICE', task_role: 'PRACTICE', support_mode: 'NONE' });
    announce('Independent practice recorded. Practice is not independent validation.');
    await refreshLearn();
  } catch (err) { handleGovernanceError(err); }
});

$('#recordAssistedPracticeBtn').addEventListener('click', async () => {
  if (!app.activeTargetId) return;
  try {
    await commitGovernedTransition(app.activeTargetId, { type: 'RECORD_PRACTICE', task_role: 'PRACTICE', support_mode: 'ASSISTED' });
    announce('Assisted practice recorded. It did not create independent validation.');
    await refreshLearn();
  } catch (err) { handleGovernanceError(err); }
});

function handleGovernanceError(err) {
  console.error(err);
  const message = err instanceof GovernanceError ? `${err.code}: ${err.message}` : err.message;
  announce(`Action blocked: ${message}`);
  alert(`Governance blocked this action.\n\n${message}`);
}

// ---------- Why this step ----------
async function openWhyDialog() {
  const id = app.activeTargetId;
  if (!id) return;
  const n = safeNode(id);
  const state = (await getLearnerState(id)) || defaultLearnerState(id);
  const events = await currentEventsForNode(id);
  const observations = events.filter(e => ['OBSERVATION', 'SELF_REPORT'].includes(e.record_type) || e.type === 'SELF_REPORT').slice(-4).map(e => {
    if (e.type === 'SELF_REPORT') return `Self-report: ${e.payload?.value || 'correction recorded'}`;
    if (e.type === 'TARGET_SELECTED') return 'This target was selected.';
    return e.type.replaceAll('_', ' ').toLowerCase();
  });

  let uncertainty = semanticText('WHY_INSUFFICIENT');
  let decision = 'Practice or gather additional evidence. Independent validation requires a prospectively declared validation task and governed evaluator.';
  if (state.evidence_state === 'SUPPORTED_NOT_ESTABLISHED') uncertainty = semanticText('WHY_SUPPORTED');
  if (state.evidence_state === 'CONFLICTING_EVIDENCE') {
    uncertainty = semanticText('WHY_CONFLICTING');
    decision = 'Request a diagnostic check that can distinguish the competing interpretations.';
  }
  if (state.evidence_state === 'ESTABLISHED') {
    uncertainty = semanticText('WHY_ESTABLISHED');
    decision = 'Continue learning, review, or select another target. Historical validation remains preserved.';
  }

  const panel = deriveWhyPanel({
    evidenceState: state.evidence_state,
    mapFact: `${n.node_id} — ${n.label}`,
    observations,
    uncertainty,
    decision
  });

  $('#whyEvidenceState').innerHTML = evidencePill(panel.evidence.code);
  $('#whyKnow').innerHTML = `${provenanceBadge('MAP_RECORD')} <span ${outputAttr('MAP_NODE_TITLE')}>${escapeHTML(panel.know)}</span>`;
  $('#whyObserved').innerHTML = panel.observed.length ? `<div>${provenanceBadge('OBSERVATION')}</div><ul>${panel.observed.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul>` : `${provenanceBadge('OBSERVATION')} <span>No learner-specific observation has been recorded for this target yet.</span>`;
  $('#whyUncertain').innerHTML = `${provenanceBadge('INFERENCE')} <span ${outputAttr(state.evidence_state === 'CONFLICTING_EVIDENCE' ? 'WHY_CONFLICTING' : state.evidence_state === 'SUPPORTED_NOT_ESTABLISHED' ? 'WHY_SUPPORTED' : state.evidence_state === 'ESTABLISHED' ? 'WHY_ESTABLISHED' : 'WHY_INSUFFICIENT')}>${escapeHTML(panel.uncertain)}</span>`;
  $('#whyDecision').innerHTML = `${provenanceBadge('DECISION')} <span>${escapeHTML(panel.decision)}</span>`;
  $('#whyDialog').showModal();
}
$('#whyStepBtn').addEventListener('click', openWhyDialog);
$('#sessionWhyBtn').addEventListener('click', openWhyDialog);

// ---------- Learner correction ----------
$('#learnerCorrectionBtn').addEventListener('click', () => $('#correctionDialog').showModal());
$('#saveCorrectionBtn').addEventListener('click', async () => {
  const selected = $('#correctionForm input[name="correction"]:checked');
  if (!selected) { announce('Choose a correction before recording it.'); return; }
  const nodeId = app.activeTargetId;
  const eventData = learnerCorrectionEvent(selected.value, { node_id: nodeId, note: $('#correctionNote').value.trim() || null });
  await appendEvent('SELF_REPORT', { node_id: nodeId, value: eventData.value, note: eventData.context.note }, { record_type: 'OBSERVATION' });
  $('#correctionDialog').close();
  $('#correctionForm').reset();
  $('#correctionNote').value = '';
  announce(semanticText('SELF_REPORT_RECORDED'));
  alert(`${semanticText('SELF_REPORT_RECORDED')}\n\n${semanticText('NO_GAMING_INFERENCE')}`);
});

// ---------- Map ----------
function renderMapRoots() {
  const roots = app.nodes.filter(n => n.node_type === 'FIELD_ROOT');
  $('#mapRoots').innerHTML = roots.map(n => `<button class="root-card" type="button" data-map-root="${escapeHTML(n.node_id)}"><strong>${escapeHTML(n.node_id)} · ${escapeHTML(n.label)}</strong><span>${childrenOf(n.node_id).length} direct branches</span></button>`).join('');
  $$('[data-map-root]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.mapRoot;
    renderMapResults(childrenOf(id));
    showMapNode(id);
  }));
  $('#mapCount').textContent = `${app.nodes.length} nodes`;
  renderMapResults(roots);
}

function renderMapResults(items) {
  $('#mapResults').innerHTML = items.slice(0, 120).map(n => nodeResultButton(n, 'map')).join('') || '<div class="muted">No nodes found.</div>';
  bindNodeActionButtons($('#mapResults'));
}

$('#mapSearch').addEventListener('input', e => {
  const q = e.target.value.trim();
  if (!q) return renderMapResults(app.nodes.filter(n => n.node_type === 'FIELD_ROOT'));
  renderMapResults(searchNodes(q, 120));
});

async function showMapNode(id) {
  const n = safeNode(id);
  if (!n) return;
  app.selectedMapId = id;
  const kids = childrenOf(id);
  const rel = nonTreeRelations(id).slice(0, 30);
  const state = (await getLearnerState(id)) || defaultLearnerState(id);
  const ancestors = (n.ancestors || []).map(a => `<button type="button" class="chip button-chip" data-jump-node="${escapeHTML(a.node_id)}">${escapeHTML(a.node_id)} ${escapeHTML(a.label)}</button>`).join('');
  const treeParent = n.parent_id ? safeNode(n.parent_id) : null;

  $('#mapDetail').classList.remove('empty-state');
  $('#mapDetail').innerHTML = `
    <div class="section-title-row align-start"><div>${provenanceBadge('MAP_RECORD')}<h2 ${outputAttr('MAP_NODE_TITLE')}>${escapeHTML(n.node_id)} · ${escapeHTML(n.label)}</h2></div>${evidencePill(state.evidence_state)}</div>
    <p class="target-question" ${outputAttr('MAP_NODE_QUESTION')}>${escapeHTML(n.core_question || 'No core question recorded.')}</p>
    ${ancestors ? `<div class="chips top-gap">${ancestors}</div>` : ''}
    <div class="kv">
      <div>Map type</div><div>${escapeHTML(n.node_type)}</div>
      <div>Parent</div><div>${treeParent ? escapeHTML(`${treeParent.node_id} — ${treeParent.label}`) : '—'}</div>
      <div>MSC</div><div>${escapeHTML(n.msc_crosswalk || '—')}</div>
      <div>Children</div><div>${kids.length}</div>
      <div>Other relations</div><div>${rel.length}</div>
    </div>
    <button id="learnThisNodeBtn" class="primary-btn" type="button">Learn this topic</button>
    <div class="top-gap notice subtle">${provenanceBadge('OBSERVATION')} <span ${outputAttr('PREREQ_GRAPH_UNAVAILABLE')}>${escapeHTML(semanticText('PREREQ_GRAPH_UNAVAILABLE'))}</span></div>
    ${kids.length ? `<h3>Inside this topic</h3><div class="chips">${kids.slice(0, 36).map(c => `<button type="button" class="chip button-chip" data-jump-node="${escapeHTML(c.node_id)}">${escapeHTML(c.node_id)} ${escapeHTML(c.label)}</button>`).join('')}</div>` : ''}
    ${rel.length ? `<h3>Mapped relations</h3><div class="result-list compact">${rel.map(e => { const other = e.source === id ? e.target : e.source; const nn = safeNode(other); return `<button type="button" class="result-item clickable" data-jump-node="${escapeHTML(other)}"><div><div class="result-title" ${outputAttr('MAP_RELATION')}>${escapeHTML(e.relation)}: ${escapeHTML(other)} — ${escapeHTML(nn?.label || 'Unknown')}</div><div class="result-meta">${escapeHTML(e.note || '')}</div></div>${provenanceBadge('MAP_RECORD')}</button>`; }).join('')}</div>` : ''}
  `;
  $('#learnThisNodeBtn').addEventListener('click', async () => { await setCurrentTarget(id); navigate('learn'); $('#sessionCard').classList.remove('hidden'); });
  $$('[data-jump-node]', $('#mapDetail')).forEach(btn => btn.addEventListener('click', () => showMapNode(btn.dataset.jumpNode)));
}

// ---------- Progress ----------
const friendly = {
  UNEXPOSED: 'Not yet recorded', SEEN_AND_EXPLAINED: 'Seen and explained',
  NOT_PRACTICED: 'Not practiced', ASSISTED_PRACTICE: 'Assisted practice', INDEPENDENT_PRACTICE: 'Independent practice',
  NOT_VALIDATED: 'Not independently validated', VALIDATED: 'Independently validated', VALIDATION_FAILED: 'Validation not demonstrated',
  NOT_ASSESSED: 'Not assessed', CURRENT: 'Current', REVALIDATION_DUE: 'Review due', RETENTION_CONCERN: 'Current retention concern'
};

async function renderProgress() {
  const states = await listLearnerStates();
  const validated = states.filter(s => s.validation_state === 'VALIDATED').length;
  const practiced = states.filter(s => ['ASSISTED_PRACTICE','INDEPENDENT_PRACTICE'].includes(s.practice_state)).length;
  const conflicting = states.filter(s => s.evidence_state === 'CONFLICTING_EVIDENCE').length;
  $('#progressOverview').innerHTML = `<div class="stat"><b>${states.length}</b><span>Tracked topics</span></div><div class="stat"><b>${practiced}</b><span>Practiced</span></div><div class="stat"><b>${validated}</b><span>Validated scopes</span></div><div class="stat"><b>${conflicting}</b><span>Conflicting evidence</span></div>`;

  if (!states.length) {
    $('#progressList').innerHTML = '<div class="card empty-state">No learner-state records yet. Select a topic under Learn and record an exposure or practice event.</div>';
    return;
  }

  $('#progressList').innerHTML = states.sort((a,b) => (b.updated_at || '').localeCompare(a.updated_at || '')).map(s => {
    const n = safeNode(s.node_id);
    const history = historicalValidation(s);
    const lastPass = history.at(-1);
    const retention = mayDisplayReviewDue(s) ? 'Review due' : (friendly[s.retention_state] || s.retention_state);
    return `<article class="progress-card">
      <div class="section-title-row align-start"><div><div class="eyebrow">${escapeHTML(s.node_id)}</div><h3>${escapeHTML(n?.label || 'Unknown map node')}</h3></div>${evidencePill(s.evidence_state)}</div>
      <div class="dimension-grid">
        <div class="dimension-row" ${outputAttr('PROGRESS_EXPOSURE')}><span class="label">Exposure</span><span class="value">${escapeHTML(friendly[s.exposure_state] || s.exposure_state)}</span></div>
        <div class="dimension-row" ${outputAttr('PROGRESS_PRACTICE')}><span class="label">Practice</span><span class="value">${escapeHTML(friendly[s.practice_state] || s.practice_state)}</span></div>
        <div class="dimension-row" ${outputAttr('PROGRESS_VALIDATION')}><span class="label">Validation</span><span class="value">${escapeHTML(friendly[s.validation_state] || s.validation_state)}</span></div>
        <div class="dimension-row" ${outputAttr('PROGRESS_RETENTION')}><span class="label">Retention</span><span class="value">${escapeHTML(retention)}</span></div>
        <div class="dimension-row" ${outputAttr('PROGRESS_EVIDENCE')}><span class="label">Evidence</span><span class="value">${escapeHTML(evidencePresentation(s.evidence_state).label)}</span></div>
      </div>
      ${lastPass ? `<div class="history-block">${provenanceBadge('DECISION')} <span ${outputAttr('HISTORICAL_VALIDATION')}>${escapeHTML(semanticText('HISTORICAL_VALIDATION', { date: new Date(lastPass.timestamp).toLocaleDateString() }))}</span></div>` : ''}
      ${mayDisplayReviewDue(s) ? `<div class="history-block">${provenanceBadge('DECISION')} <span ${outputAttr('RETENTION_REVIEW_DUE')}>${escapeHTML(semanticText('RETENTION_REVIEW_DUE', { policy_id: s.retention_policy_id || 'authorized policy' }))}</span></div>` : ''}
      <div class="button-row top-gap"><button type="button" class="ghost-btn" data-progress-learn="${escapeHTML(s.node_id)}">Open in Learn</button></div>
    </article>`;
  }).join('');
  $$('[data-progress-learn]').forEach(btn => btn.addEventListener('click', async () => { await setCurrentTarget(btn.dataset.progressLearn); navigate('learn'); $('#sessionCard').classList.remove('hidden'); }));
}

// ---------- TNPO ----------
function renderTNPO(query = '') {
  const q = query.trim().toLowerCase();
  $('#tnpoTree').innerHTML = app.tnpoRoots.map(root => {
    const branches = app.tnpoBranches.filter(b => b.root_id === root.root_id).filter(b => !q || `${b.branch_id} ${b.branch_name} ${b.frozen_semantic_boundary}`.toLowerCase().includes(q) || app.tnpoModules.some(m => m.branch_id === b.branch_id && `${m.module_id} ${m.module_name} ${m.note || ''}`.toLowerCase().includes(q)));
    const rootMatch = `${root.root_id} ${root.root_name} ${root.definition}`.toLowerCase().includes(q);
    if (q && !rootMatch && !branches.length) return '';
    return `<div class="tnpo-root"><button type="button" data-tnpo-root="${escapeHTML(root.root_id)}"><span><strong>${escapeHTML(root.root_id)} · ${escapeHTML(root.root_name)}</strong><span class="result-meta">${escapeHTML(root.definition)}</span></span><span class="badge neutral">FROZEN</span></button><div class="tnpo-branches">${branches.map(b => {
      const mods = app.tnpoModules.filter(m => m.branch_id === b.branch_id && (!q || `${m.module_id} ${m.module_name} ${m.note || ''}`.toLowerCase().includes(q)));
      return `<div class="tnpo-branch"><strong>${escapeHTML(b.branch_id)} · ${escapeHTML(b.branch_name)}</strong><div class="result-meta">${escapeHTML(b.frozen_semantic_boundary)}</div>${mods.length ? `<div class="tnpo-modules">${mods.map(m => `<div class="tnpo-module">${escapeHTML(m.module_id)} · ${escapeHTML(m.module_name)} <span class="muted">[${escapeHTML(m.status)}]</span></div>`).join('')}</div>` : ''}</div>`;
    }).join('')}</div></div>`;
  }).join('');
}
$('#tnpoSearch').addEventListener('input', e => renderTNPO(e.target.value));

// ---------- Evidence legend ----------
function renderEvidenceLegend() {
  const codes = ['ESTABLISHED','SUPPORTED_NOT_ESTABLISHED','CONFLICTING_EVIDENCE','INSUFFICIENT_EVIDENCE'];
  $('#evidenceLegend').innerHTML = codes.map(code => { const e = evidencePresentation(code); return `<div class="legend-row"><div><strong>${escapeHTML(e.label)}</strong><p>${escapeHTML(e.description)}</p></div>${evidencePill(code)}</div>`; }).join('');
}

// ---------- Context export ----------
$('#generateContextBtn').addEventListener('click', generateContext);
async function generateContext() {
  const id = await getCurrentTarget();
  if (!id || !safeNode(id)) { $('#contextOutput').value = 'Choose a learning target first.'; return; }
  const n = safeNode(id);
  const state = (await getLearnerState(id)) || defaultLearnerState(id);
  const rel = nonTreeRelations(id).slice(0, 20).map(e => { const other = e.source === id ? e.target : e.source; return `${e.source === id ? 'OUT' : 'IN'} ${e.relation}: ${other} — ${safeNode(other)?.label || ''}`; });
  const packet = `TNPO / MSVO GOVERNED CONTEXT\nBuild: ${BUILD_VERSION}\n\nTARGET [MAP FACT]\n${n.node_id} — ${n.label}\nType: ${n.node_type}\nCore question: ${n.core_question || '—'}\n\nLEARNER STATE\nExposure: ${state.exposure_state}\nPractice: ${state.practice_state}\nValidation: ${state.validation_state}\nRetention: ${state.retention_state}\nEvidence: ${state.evidence_state}\n\nNEARBY BUNDLED MAP RELATIONS\n${rel.length ? rel.map(x => `- ${x}`).join('\n') : '- None in exported subset'}\n\nDATA AVAILABILITY\n- This bundle contains ontology/tree and other mapped relations. It currently contains no REQUIRES edges, so do not invent prerequisites.\n\nTNPO / INTERFACE GOVERNANCE\n- Observation != Evaluation != Inference != Decision.\n- Practice success != independent validation.\n- Assisted performance != independent validation.\n- Learner self-report is evidence, not a state command.\n- Use ESTABLISHED / SUPPORTED_NOT_ESTABLISHED / CONFLICTING_EVIDENCE / INSUFFICIENT_EVIDENCE accurately.\n- Do not convert uncertainty into a confident diagnosis.\n- Do not invent a mastery percentage.\n- Propose actions; do not directly certify validation.\n`;
  $('#contextOutput').value = packet;
  announce('Grounded context packet generated.');
}
$('#copyContextBtn').addEventListener('click', async () => {
  if (!$('#contextOutput').value) return;
  await navigator.clipboard.writeText($('#contextOutput').value);
  announce('Context copied.');
});

// ---------- Pilot ----------
async function refreshPilotUI() {
  app.pilotId = await getActivePilotId();
  const active = Boolean(app.pilotId);
  $('#pilotInactivePanel').classList.toggle('hidden', active);
  $('#pilotActivePanel').classList.toggle('hidden', !active);
  $('#pilotStopTopBtn').classList.toggle('hidden', !active);
  if (active) $('#pilotActiveId').textContent = app.pilotId;
  await refreshLearn();
}

$('#startPilotBtn').addEventListener('click', async () => {
  const participantId = $('#pilotParticipantId').value.trim().toUpperCase();
  if (!/^P\d{2,3}$/.test(participantId)) { announce('Use a participant ID like P01.'); return; }
  if (!$('#pilotConsentCheck').checked) { announce('Pilot mode cannot begin until the participant affirmatively indicates understanding of their rights.'); return; }
  try {
    await startPilotSession(participantId, 'CONSENT_WITHDRAWAL_SUPPLEMENT_v1.0_FROZEN');
    await appendEvent('CONSENT_OBTAINED', { participant_id: participantId, scored: false }, { record_type: 'DECISION', authorization_id: 'CONSENT_v1.0' });
    await refreshPilotUI();
    announce(`Pilot mode started for ${participantId}.`);
  } catch (err) { announce(err.message); }
});

function openWithdrawal() { $('#withdrawDialog').showModal(); }
$('#withdrawPilotBtn').addEventListener('click', openWithdrawal);
$('#pilotStopTopBtn').addEventListener('click', openWithdrawal);

async function doWithdraw(disposition) {
  const pid = await getActivePilotId();
  if (!pid) return;
  await withdrawPilotSession(pid, disposition);
  $('#withdrawDialog').close();
  await refreshPilotUI();
  announce('Pilot stopped. Withdrawal was not interpreted as learner-state evidence.');
}
$('#withdrawDeleteBtn').addEventListener('click', () => doWithdraw('DELETE_WHERE_FEASIBLE'));
$('#withdrawRetainBtn').addEventListener('click', () => doWithdraw('RETAIN_DEIDENTIFIED'));
$('#completePilotBtn').addEventListener('click', async () => {
  const pid = await getActivePilotId();
  if (!pid) return;
  await appendEvent('PILOT_SESSION_COMPLETED', { participant_id: pid }, { record_type: 'DECISION', authorization_id: 'PILOT_PROTOCOL_v1.0' });
  await endPilotSessionWithoutWithdrawal(pid);
  await refreshPilotUI();
  announce('Pilot session ended normally.');
});

// ---------- Scenario lab ----------
const scenarios = [
  {
    id:'PT-02', title:'Prerequisite backtrack',
    body:() => `<div class="scenario-box"><div class="eyebrow">CYCLIC NAVIGATION</div><h3>Target B remains the goal</h3><div class="scenario-path"><span>Target B</span><b>→</b><span>Check prerequisite A</span><b>→</b><span>Return to B when A evidence is sufficient</span></div><p ${outputAttr('BACKTRACK_EXPLANATION')}>${escapeHTML(semanticText('BACKTRACK_EXPLANATION',{focus:'Prerequisite A',target:'Target B',condition:'sufficient prerequisite evidence'}))}</p>${provenanceBadge('DECISION')}</div>`
  },
  {
    id:'PT-03', title:'Task roles',
    body:() => `<div class="scenario-box"><div class="action-card"><span class="role-pill practice">Practice</span><p ${outputAttr('TASK_PRACTICE')}>${escapeHTML(semanticText('TASK_PRACTICE'))}</p></div><div class="action-card top-gap"><span class="role-pill diagnostic">Diagnostic check</span><p ${outputAttr('TASK_DIAGNOSTIC')}>${escapeHTML(semanticText('TASK_DIAGNOSTIC'))}</p></div><div class="action-card top-gap"><span class="role-pill validation">Independent validation</span><p ${outputAttr('TASK_VALIDATION')}>${escapeHTML(semanticText('TASK_VALIDATION'))}</p></div>`
  },
  {
    id:'PT-04', title:'Conflicting evidence',
    body:() => `<div class="scenario-box"><div>${evidencePill('CONFLICTING_EVIDENCE')}</div><h3>Why this step?</h3><p>${provenanceBadge('OBSERVATION')} One incorrect sign-distribution response and one correct response.</p><p>${provenanceBadge('INFERENCE')} <span ${outputAttr('WHY_CONFLICTING')}>${escapeHTML(semanticText('WHY_CONFLICTING'))}</span></p><p>${provenanceBadge('DECISION')} Next: one short diagnostic check.</p></div>`
  },
  {
    id:'PT-05', title:'Provenance badges',
    body:() => `<div class="scenario-box"><p>${provenanceBadge('MAP_RECORD')} Authoritative map record.</p><p>${provenanceBadge('OBSERVATION')} Something observed or self-reported.</p><p>${provenanceBadge('INFERENCE')} A conclusion drawn from evidence.</p><p>${provenanceBadge('DECISION')} A governed runtime/policy authorization.</p></div>`
  },
  {
    id:'PT-06', title:'Learner correction',
    body:() => `<div class="scenario-box"><h3>“I guessed.”</h3><p>${provenanceBadge('OBSERVATION')} <span ${outputAttr('SELF_REPORT_RECORDED')}>${escapeHTML(semanticText('SELF_REPORT_RECORDED'))}</span></p><p>${provenanceBadge('INFERENCE')} <span ${outputAttr('NO_GAMING_INFERENCE')}>${escapeHTML(semanticText('NO_GAMING_INFERENCE'))}</span></p></div>`
  },
  {
    id:'PT-07', title:'Progress dimensions',
    body:() => `<div class="scenario-box"><div class="dimension-grid"><div class="dimension-row"><span class="label">Exposure</span><span class="value">Seen and explained</span></div><div class="dimension-row"><span class="label">Practice</span><span class="value">Independent practice</span></div><div class="dimension-row"><span class="label">Validation</span><span class="value">Not independently validated</span></div><div class="dimension-row"><span class="label">Retention</span><span class="value">Not assessed</span></div><div class="dimension-row"><span class="label">Evidence</span><span class="value">Supported, not established</span></div></div><p class="muted small">No mastery percentage is calculated.</p></div>`
  },
  {
    id:'PT-08', title:'History + later concern',
    body:() => `<div class="scenario-box"><p>${provenanceBadge('DECISION')} <span ${outputAttr('HISTORICAL_VALIDATION')}>Previously independently validated on June 14, 2026.</span></p><p>${provenanceBadge('OBSERVATION')} A later transfer task was not completed successfully.</p><p>${provenanceBadge('INFERENCE')} Current transfer/retention concern.</p><p>${provenanceBadge('DECISION')} Earlier validation remains in history; gather new evidence before changing the current state.</p></div>`
  }
];

function renderScenario(id) {
  const scenario = scenarios.find(s => s.id === id) || scenarios[0];
  $$('#scenarioTabs button').forEach(b => b.classList.toggle('active', b.dataset.scenarioId === scenario.id));
  $('#scenarioContent').innerHTML = scenario.body();
}

$('#openScenarioLabBtn').addEventListener('click', () => {
  $('#scenarioTabs').innerHTML = scenarios.map(s => `<button type="button" data-scenario-id="${s.id}">${s.id}</button>`).join('');
  $$('[data-scenario-id]').forEach(btn => btn.addEventListener('click', () => renderScenario(btn.dataset.scenarioId)));
  renderScenario(scenarios[0].id);
  $('#scenarioDialog').showModal();
});

// ---------- Local data ----------
$('#exportDataBtn').addEventListener('click', async () => {
  const data = await exportLocalData();
  data.schema_version = 'v0.2';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tnpo-msvo-local-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  announce('Local backup exported.');
});

$('#clearPersonalDataBtn').addEventListener('click', async () => {
  if (await getActivePilotId()) { announce('End or withdraw from pilot mode before deleting personal data.'); return; }
  if (!confirm('Delete personal learner state and personal event history stored by this app on this device?')) return;
  await clearStore('learnerState');
  await clearStore('events');
  await setMeta('active_target_personal', null);
  app.activeTargetId = null;
  await refreshLearn();
  await renderProgress();
  announce('Personal local data deleted.');
});

// ---------- Research status ----------
function renderResearchStatus() {
  $('#researchStatus').innerHTML = `
    <div class="dimension-grid top-gap">
      <div class="dimension-row"><span class="label">MSVO</span><span class="value">MVC achieved for the validated core; not all mathematics validated.</span></div>
      <div class="dimension-row"><span class="label">TNPO runtime</span><span class="value">Synthetic Core Wave passed; real-user lane not yet completed.</span></div>
      <div class="dimension-row"><span class="label">Interface</span><span class="value">Synthetic Interface Governance Core Wave passed.</span></div>
      <div class="dimension-row"><span class="label">Pilot 01</span><span class="value">Preregistered; data collection not started.</span></div>
      <div class="dimension-row"><span class="label">Learning efficacy</span><span class="value">Not tested.</span></div>
      <div class="dimension-row"><span class="label">Tutor MVC</span><span class="value">Not achieved.</span></div>
    </div>`;
}

async function refreshMore() {
  await refreshPilotUI();
}

// ---------- Install ----------
$('#installHelpBtn').addEventListener('click', () => $('#installDialog').showModal());

// ---------- Boot ----------
async function boot() {
  try {
    const [nodes, edges, roots, branches, modules, semantic] = await Promise.all([
      loadJSON('data/msvo_nodes.json'), loadJSON('data/msvo_edges.json'), loadJSON('data/tnpo_roots.json'), loadJSON('data/tnpo_branches.json'), loadJSON('data/tnpo_modules.json'), loadJSON('data/semantic_catalog.json')
    ]);
    app.nodes = nodes;
    app.edges = edges;
    app.tnpoRoots = roots;
    app.tnpoBranches = branches;
    app.tnpoModules = modules;
    app.semanticCatalog = semantic.outputs;
    app.semanticMap = new Map(semantic.outputs.map(x => [x.output_id, x]));
    app.nodeMap = new Map(nodes.map(n => [n.node_id, n]));

    updateConnectivity();
    renderMapRoots();
    renderTNPO();
    renderEvidenceLegend();
    renderResearchStatus();
    await refreshPilotUI();
    await renderProgress();

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch(console.warn);
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<main style="padding:24px"><h1>Navigator failed to start</h1><pre>${escapeHTML(err.message)}</pre></main>`;
  }
}

boot();
