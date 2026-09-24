// TNPO/MSVO v0.3 — Governed commit layer (ROOT A + ROOT B of the H_c^(4) architectural contract; extended by the
// H_c^(5) remediation contract: learner DATA_SCOPE, pilot lifecycle, validation exposure/freshness).
//
// A learner-facing control is only a REQUEST. Final authority belongs here: `decide()` runs INSIDE one IndexedDB
// readwrite transaction (see db.governedTx) over data read in that transaction, and:
//   0. checks the request belongs to the AUTHORITATIVE learner data scope (resolved in-tx by the db layer)
//   1. recognises an already-committed logical action by its receipt            -> DUPLICATE_ALREADY_COMMITTED
//   2. checks the persisted presentation is the ACTIVE one for the current target/round -> else STALE_NOT_AUTHORIZED
//   3. re-derives governance from CURRENT persisted state (policy + default-deny action guard + validation freshness)
//   4. builds OBSERVATION -> EVALUATION -> INFERENCE -> DECISION -> STATE_TRANSITION, then the next policy
//      DECISION + presentation, with commit_seq / event_ordinal / prior_event_refs (canonical ledger order)
//   5. returns every write (events, state, meta, receipt, presentation lifecycle, round, exposure, pilot) for ONE commit.
// decide() is PURE and synchronous (uuid/clock injected), so it is unit-testable and transaction-safe. It never names
// a physical store: the db layer routes every write into the resolved scope (core/scope.v3.js).
import { applyAuthorizedTransition, mayAdvance, hasActiveConcern, normalizeLearnerState, GovernanceError, SELF_REPORT_OPTIONS,
  evaluateValidationEligibility, emptyExposure, exposureEntry } from './governance.v3.js';
import { evaluateResponse, learnerDisplayPrompt } from './task.v3.js';
import { evaluateProbe, combineConflictInference, resolveConflictInference } from './conflict.v3.js';
import { selectNextAction, actionKindOf } from './policy.v3.js';
import { PARTICIPANT_ID_RE, ORDINARY, AFM_SCOPE } from './scope.v3.js';

export const POLICY_VERSION = 'TNPO_MSVO_V0_3_POLICY/0.3.0';
export const ARCHITECTURE_VERSION = 'TNPO_BASELINE_ARCHITECTURE_v1.0';
export const OUTCOMES = Object.freeze({ COMMITTED: 'COMMITTED', DUPLICATE: 'DUPLICATE_ALREADY_COMMITTED', STALE: 'STALE_NOT_AUTHORIZED',
  HOLD: 'GOVERNED_HOLD', ABORTED: 'PERSISTENCE_ABORTED', RENDER: 'POST_COMMIT_RENDER_FAILURE' });
export const LEARNER_KINDS = Object.freeze(['ANSWER', 'TARGET_SELECT', 'CHANGE_TARGET', 'RESTART_ROUND', 'ENSURE_PRESENTATION', 'SELF_REPORT']);
export const LIFECYCLE_KINDS = Object.freeze(['CONSENT', 'COMPLETE_PILOT', 'WITHDRAW']);
export const REQUEST_KINDS = Object.freeze([...LEARNER_KINDS, ...LIFECYCLE_KINDS]);
export const WITHDRAW_DISPOSITIONS = Object.freeze(['DELETE_WHERE_FEASIBLE', 'RETAIN_DEIDENTIFIED']);
export const DISCLOSURE_VERSION = 'CONSENT_WITHDRAWAL_SUPPLEMENT_v1.0_FROZEN';

// ---------------- content access (static, hash-bound data) ----------------
export function makeContent(engine, slice, map) {
  const nodeToTarget = new Map(engine.listTargets().map(t => [t.node_id, t.target_id]));
  const tasksForNode = (id) => { const t = nodeToTarget.get(id); return t ? engine.tasksForTarget(t) : (slice?.slice_tasks || []).filter(x => x.node_id === id); };
  const requiresEdge = (id) => (slice?.requires_edges || []).find(r => r.source === id && r.relation === 'REQUIRES' && r.classification === 'GENUINE_PROVENANCE_BACKED_REQUIRES') || null;
  const mapVersions = [`${map?.domain_map_id || 'MSVO_CANONICAL'}@${map?.domain_map_version || 'v0.3.0'}`, `${slice?.domain_map_id || 'GPCS_PREREQ_SLICE'}@${slice?.domain_map_version || 'v0.3.0'}`];
  return { engine, slice, tasksForNode, requiresEdge, getTask: (id) => engine.getTask(id), isLearnable: (id) => tasksForNode(id).length > 0, mapVersions };
}

// ---------------- read plan (learner keys are un-prefixed; the db layer applies the resolved scope) ----------------
export function readPlan(req) {
  const lifecycle = LIFECYCLE_KINDS.includes(req.kind);
  return {
    phase0: () => ({ global: lifecycle ? [`receipt::${logicalActionId(req)}`] : [] }),
    phase1: () => ({ meta: ['commit_seq', 'active_learn', 'current_target', 'chooser_epoch', 'task_exposure',
      req.presentation_id ? `pres::${req.presentation_id}` : null] }),
    phase2: (r) => {
      const active = r.meta.active_learn;
      const target = r.meta.current_target;
      const laid = lifecycle ? null : logicalActionId(req, r);
      return { meta: [laid ? `receipt::${laid}` : null, active ? `pres::${active}` : null, target ? `round::${target}` : null,
        req.kind === 'TARGET_SELECT' && req.node ? `round::${req.node}` : null],
        pilotKey: req.kind === 'CONSENT' ? req.participant_id : undefined,
        adminKey: req.kind === 'CONSENT' ? req.participant_id : undefined };
    }
  };
}

// LOGICAL_ACTION_ID — fixed before any handler runs (contract §2).
export function logicalActionId(req, reads) {
  switch (req.kind) {
    case 'ANSWER': return req.probe_id ? `${req.presentation_id}:${req.probe_id}` : req.presentation_id;
    case 'TARGET_SELECT': return `CHOOSER:${req.epoch}:${req.node}`;
    case 'CHANGE_TARGET': return `CHANGE:${req.presentation_id}`;
    case 'RESTART_ROUND': return `RESTART:${req.presentation_id}`;
    case 'ENSURE_PRESENTATION': return reads ? `ENSURE:${reads.meta.current_target}:${reads.meta.commit_seq || 0}` : null;
    case 'SELF_REPORT': return `SELFREPORT:${req.dialog_id}`;
    case 'CONSENT': return `PILOT:${req.epoch}:CONSENT:${req.participant_id}`;
    case 'COMPLETE_PILOT': return `PILOT:${req.epoch}:COMPLETE:${req.participant_id}`;
    case 'WITHDRAW': return `PILOT:${req.epoch}:WITHDRAW:${req.disposition}`;
    default: return null;
  }
}

// ---------------- helpers ----------------
const clone = (v) => v === undefined || v === null ? v : JSON.parse(JSON.stringify(v));
const stateOf = (reads, id) => normalizeLearnerState(reads.states[id], id).state;
const stateRef = (env, s) => `${env.refPrefix}${s.node_id}@r${s.revision || 0}`;
const dims = (s) => ({ exposure_state: s.exposure_state, practice_state: s.practice_state, validation_state: s.validation_state,
  retention_state: s.retention_state, evidence_state: s.evidence_state, competing_hypotheses: s.competing_hypotheses || [],
  current_concern: s.current_concern ? { status: s.current_concern.status, kind: s.current_concern.kind } : null, validation_history_len: (s.validation_history || []).length });
const dateOnly = (iso) => (iso ? String(iso).slice(0, 10) : null);

function newRound(env, target, restart = false) { return { round_id: env.uuid(), target, completed: [], diagnostic_done: false, started_at: env.now, restart }; }

function policyCtx(content, target, states, round, onPrereqFocus, exposure, currentPresentationId = null) {
  const edge = content.requiresEdge(target);
  const ctx = { focusState: states(target), focusTasks: content.tasksForNode(target), completed: new Set(round.completed || []),
    diagnosticDone: !!round.diagnostic_done, onPrereqFocus: !!onPrereqFocus, exposure, currentPresentationId };
  if (edge) ctx.prereq = { requiresNodeId: edge.target, prereqState: states(edge.target), prereqTasks: content.tasksForNode(edge.target) };
  return { ctx, edge };
}
function relevantNodes(content, target) { const e = content.requiresEdge(target); return e ? [target, e.target] : [target]; }

// Chain builder — the single producer of governed events (INV-B1).
function makeChain(env, seq, laid, pid, firstPrior) {
  const commit_id = env.uuid(); const events = []; let prev = firstPrior || null;
  return {
    commit_id, events,
    add(type, record_type, payload, { actor, object_refs = [], payload_ref = null } = {}) {
      const e = { event_id: env.uuid(), event_type: type, type, record_type, timestamp: env.now, session_id: env.sessionId,
        learner_id: env.learnerId || 'LOCAL', actor, commit_seq: seq, event_ordinal: events.length, object_refs, payload_ref,
        prior_event_refs: prev ? [prev] : [], architecture_version: ARCHITECTURE_VERSION, policy_version: POLICY_VERSION,
        map_versions: env.content.mapVersions,
        provenance: { commit_id, logical_action_id: laid, presentation_id: pid || null, source: 'GOVERNED_COMMIT_LAYER', build: '0.3.0' },
        authorization_id: record_type === 'DECISION' ? 'GOV_0.3' : null, afm: !!env.ns, payload };
      events.push(e); prev = e.event_id; return e;
    }
  };
}
function decisionRecord(env, { prior, inferenceRefs, action, resulting }) {
  return { record_type: 'DECISION', decision_id: `dec_${env.uuid()}`, prior_state_ref: prior, inference_refs: inferenceRefs || [],
    policy_version: POLICY_VERSION, authorized_action: action, resulting_state_ref: resulting || null };
}

// Learner–task exposure (H_c^(5) INV-V1): appended in the SAME transaction as the presentation / attempt.
// noteExposure mutates the in-transaction exposure record (so policy in the same commit already sees it);
// exposureEvent emits the matching EXPOSURE_UPDATED ledger event.
function noteExposure(X, task, { presentation_id, target, focus, seq, now, change, attempt = null }) {
  const it = (X.value.items[task.task_id] ||= exposureEntry(task, { target, focus }));
  if (change === 'PRESENTED') it.exposures.push({ presentation_id, seq, at: now });
  else it.attempts.push({ presentation_id, seq, at: now, ...attempt });
  X.dirty = true;
  return { it, task, presentation_id, target, focus, change, attempt };
}
function exposureEvent(chain, { it, task, presentation_id, target, focus, change, attempt }) {
  chain.add('EXPOSURE_UPDATED', 'EXPOSURE_RECORD', { node_id: focus, target, task_id: task.task_id, task_version: task.task_version, presentation_id,
    exposure_record_ref: it.exposure_id, change, result: attempt ? attempt.result : null, exposures: it.exposures.length, attempts: it.attempts.length },
    { actor: 'TASK_ENGINE', object_refs: [task.task_id], payload_ref: it.exposure_id });
}

// Create the next governed presentation (policy DECISION + FOCUS_SET/TASK_SELECTED/TASK_PRESENTED) — INV-B2.
function presentNext(env, W, chain, X, { target, states, round, prevPres, inferenceRefs, seq }) {
  const onPrereq = !!(prevPres && prevPres.target === target && prevPres.backtrack);
  const { ctx, edge } = policyCtx(env.content, target, states, round, onPrereq, X.value, null);
  const a = selectNextAction(ctx);
  const pid = env.uuid();
  const nodes = relevantNodes(env.content, target);
  const expected = Object.fromEntries(nodes.map(n => [n, states(n).revision || 0]));
  const priorRefs = nodes.map(n => stateRef(env, states(n)));
  const infRefs = (inferenceRefs && inferenceRefs.length) ? inferenceRefs : nodes.map(n => states(n).last_inference_ref).filter(Boolean);
  const focus = a.focus;
  const common = { node_id: focus, target, presentation_id: pid };
  // explicit backtrack / return decisions (AT-012 / AT-013) — recorded only on the actual transition
  if (a.backtrack && !(prevPres && prevPres.backtrack && prevPres.target === target))
    chain.add('DECISION_AUTHORIZED', 'DECISION', { ...common, reasoning_state: 'REMEDIATION_NEED', kind: 'PREREQUISITE_BACKTRACK',
      requires_edge_id: edge?.edge_id || null, target_preserved: target,
      record: decisionRecord(env, { prior: priorRefs, inferenceRefs: infRefs, action: 'AUTHORIZE_REMEDIATION' }) }, { actor: 'POLICY_RUNTIME', object_refs: [edge?.edge_id].filter(Boolean) });
  if (a.returned)
    chain.add('DECISION_AUTHORIZED', 'DECISION', { ...common, reasoning_state: 'ADVANCEMENT_REVIEW', kind: 'PREREQUISITE_RETURN',
      requires_edge_id: edge?.edge_id || null, prerequisite: edge?.target || null,
      prerequisite_evidence_state: edge ? states(edge.target).evidence_state : null,
      record: decisionRecord(env, { prior: priorRefs, inferenceRefs: infRefs, action: 'AUTHORIZE_ADVANCEMENT' }) }, { actor: 'POLICY_RUNTIME', object_refs: [edge?.edge_id].filter(Boolean) });
  const kind = a.task ? 'TASK' : (a.action === 'GOAL_REACHED' ? 'GOAL_REACHED' : 'HOLD');
  const polDec = chain.add('DECISION_AUTHORIZED', 'DECISION', { ...common, kind: 'POLICY_NEXT_ACTION', reasoning_state: a.reasoning_state,
    presentation_kind: kind, action_kind: a.action_kind, task_id: a.task?.task_id || null, hold_reason: a.hold_reason,
    record: decisionRecord(env, { prior: priorRefs, inferenceRefs: infRefs, action: a.policy_action }) }, { actor: 'POLICY_RUNTIME', object_refs: [a.task?.task_id].filter(Boolean) });
  let presentedEvent = polDec;
  if (!prevPres || prevPres.focus !== focus || prevPres.target !== target || a.returned || (a.backtrack && !prevPres.backtrack))
    presentedEvent = chain.add('FOCUS_SET', 'DECISION', { ...common, backtrack: !!a.backtrack, returned: !!a.returned }, { actor: 'POLICY_RUNTIME', object_refs: [focus] });
  const isProbe = !!(a.task && (a.task.is_conflict_session || a.task.is_resolution));
  const display_prompt = a.task ? learnerDisplayPrompt(a.task, isProbe ? a.task.probes[0] : null) : null;
  if (a.task) {
    chain.add('TASK_SELECTED', 'DECISION', { ...common, task_id: a.task.task_id, task_version: a.task.task_version, role: a.task.validation_role, action_kind: a.action_kind }, { actor: 'POLICY_RUNTIME', object_refs: [a.task.task_id] });
    presentedEvent = chain.add('TASK_PRESENTED', 'DECISION', { ...common, task_id: a.task.task_id, task_version: a.task.task_version, role: a.task.validation_role,
      action_kind: a.action_kind, support_policy: a.task.support_policy, role_frozen_before_response: true, display_prompt }, { actor: 'TASK_ENGINE', object_refs: [a.task.task_id] });
    if (a.task.validation_role === 'INDEPENDENT_VALIDATION')
      exposureEvent(chain, noteExposure(X, a.task, { presentation_id: pid, target, focus, seq, now: env.now, change: 'PRESENTED' }));
  }
  const pres = { presentation_id: pid, surface: 'LEARN', status: 'ACTIVE', target, focus, kind,
    task_id: a.task?.task_id || null, task_version: a.task?.task_version || null, role: a.task?.validation_role || null, action_kind: a.action_kind,
    display_prompt,
    policy: { action: a.policy_action, reasoning_state: a.reasoning_state, hold_reason: a.hold_reason },
    backtrack: a.backtrack ? { target_preserved: target, requires_edge_id: edge?.edge_id || null, prerequisite: edge?.target || null } : null,
    returned: !!a.returned, expected_revisions: expected, round_id: round.round_id,
    mini: isProbe ? { index: 0, evals: [] } : null,
    controls: kind === 'TASK' ? (a.task.validation_role === 'PRACTICE' ? ['SUBMIT', 'SUBMIT_ASSISTED'] : ['SUBMIT']) : (kind === 'HOLD' ? ['RESTART_ROUND', 'CHANGE_TARGET'] : ['CHANGE_TARGET']),
    created_seq: seq, created_at: env.now, presented_event_id: presentedEvent.event_id, policy_decision_id: polDec.payload.record.decision_id };
  W.push({ store: 'meta', op: 'put', key: `pres::${pid}`, value: pres });
  W.push({ store: 'meta', op: 'put', key: 'active_learn', value: pid });
  return pres;
}
function supersede(W, pres, seq, status = 'SUPERSEDED') {
  if (!pres) return;
  W.push({ store: 'meta', op: 'put', key: `pres::${pres.presentation_id}`, value: { ...pres, status, [status === 'CONSUMED' ? 'consumed_seq' : 'superseded_seq']: seq } });
}

// Re-derive what current governance would present for this presentation's target (default-deny comparison).
function rederive(env, reads, pres, round, X) {
  const states = (id) => stateOf(reads, id);
  const { ctx } = policyCtx(env.content, pres.target, states, round, !!pres.backtrack, X.value, pres.presentation_id);
  return selectNextAction(ctx);
}

// Action-kind guard against CURRENT state (contract §2 table). Unknown kind => not authorized.
// `freshness` (INDEPENDENT_VALIDATION only) is the result of evaluateValidationEligibility for THIS presentation.
export function guardAction(kind, focusState, { supportUsed = false, taskHypotheses = [], freshness = null } = {}) {
  switch (kind) {
    case 'PRACTICE': return true;   // (focus/backtrack context already verified by re-derivation)
    case 'DIAGNOSTIC_CHECK': return focusState.evidence_state !== 'CONFLICTING_EVIDENCE';
    case 'CONFLICT_PROBE': return focusState.evidence_state !== 'CONFLICTING_EVIDENCE';
    case 'CONFLICT_RESOLUTION': { const c = new Set(focusState.competing_hypotheses || []);
      return focusState.evidence_state === 'CONFLICTING_EVIDENCE' && taskHypotheses.some(h => c.has(h.id)); }
    case 'INDEPENDENT_VALIDATION': return mayAdvance(focusState) && focusState.validation_state !== 'VALIDATED' && !supportUsed && !!freshness && freshness.eligible === true;
    case 'PT08_TRANSFER': return focusState.validation_state === 'VALIDATED' && !hasActiveConcern(focusState);
    case 'PT08_RECHECK': return focusState.validation_state === 'VALIDATED' && hasActiveConcern(focusState);
    default: return false;
  }
}

const verdict = (outcome, reason, result = {}) => ({ outcome, writes: [], result: { reason, ...result } });

// ================================ decide ================================
// env: { ns, content, uuid(), now, sessionId }; reads.scope is the AUTHORITATIVE data scope resolved by the db layer.
export function decide(req, reads, env0) {
  if (!REQUEST_KINDS.includes(req.kind)) return verdict(OUTCOMES.HOLD, 'UNKNOWN_REQUEST_KIND');
  const scope = reads.scope || (env0.ns ? AFM_SCOPE : ORDINARY);
  const env = { ...env0, scope, learnerId: scope.kind === 'PILOT' ? scope.participant_id : 'LOCAL', refPrefix: scope.prefix == null ? `${scope.kind}::` : scope.prefix };
  if (LIFECYCLE_KINDS.includes(req.kind)) return decideLifecycle(req, reads, env, scope);
  // ---- learner request: ownership first (INV-P1/P2). The token only ever REFUSES; it never selects a scope.
  if (scope.kind === 'UNRESOLVED') return verdict(OUTCOMES.HOLD, 'PILOT_SCOPE_UNRESOLVED');
  if ((req.scope_token !== undefined || scope.kind === 'PILOT') && req.scope_token !== scope.token)
    return verdict(OUTCOMES.STALE, 'DATA_SCOPE_CHANGED');
  const M = reads.meta;
  const laid = logicalActionId(req, reads);
  const receipt = M[`receipt::${laid}`];
  if (receipt) return verdict(OUTCOMES.DUPLICATE, 'ALREADY_COMMITTED', { receipt, logical_action_id: laid });
  const seq = (M.commit_seq || 0) + 1;
  const W = [{ store: 'meta', op: 'put', key: 'commit_seq', value: seq }];
  const states = (id) => stateOf(reads, id);
  const X = { value: clone(M.task_exposure) || emptyExposure(), dirty: false };
  if (!X.value.items) X.value.items = {};
  const receiptWrite = (result) => W.push({ store: 'meta', op: 'add', key: `receipt::${laid}`,
    value: { logical_action_id: laid, kind: req.kind, commit_seq: seq, outcome: OUTCOMES.COMMITTED, result, at: env.now,
      ...(req.kind === 'ANSWER' ? { response: String(req.response ?? '').trim() } : {}) } });
  const activePres = M.active_learn ? M[`pres::${M.active_learn}`] : null;
  const committed = (chain, result) => { for (const e of chain.events) W.push({ store: 'events', op: 'add', value: e });
    if (X.dirty) W.push({ store: 'meta', op: 'put', key: 'task_exposure', value: X.value });
    receiptWrite(result);
    return { outcome: OUTCOMES.COMMITTED, writes: W, result: { ...result, logical_action_id: laid, commit_seq: seq } }; };

  switch (req.kind) {
    // ------------------------------------------------------------------ ANSWER
    case 'ANSWER': {
      const pres = M[`pres::${req.presentation_id}`];
      if (!pres) return verdict(OUTCOMES.STALE, 'NO_PERSISTED_PRESENTATION');
      if (pres.status !== 'ACTIVE' || M.active_learn !== pres.presentation_id) return verdict(OUTCOMES.STALE, `PRESENTATION_${pres.status === 'ACTIVE' ? 'NOT_CURRENT' : pres.status}`);
      if (M.current_target !== pres.target) return verdict(OUTCOMES.STALE, 'TARGET_CHANGED');
      const round = M[`round::${pres.target}`];
      if (!round || round.round_id !== pres.round_id) return verdict(OUTCOMES.STALE, 'ROUND_CHANGED');
      if (pres.kind !== 'TASK') return verdict(OUTCOMES.STALE, 'NOT_AN_ACTIONABLE_PRESENTATION');
      const task = env.content.getTask(pres.task_id);
      if (!task || task.task_version !== pres.task_version) return verdict(OUTCOMES.STALE, 'TASK_VERSION_CHANGED');
      const focusState = states(pres.focus);
      // Commit-layer freshness defence: recomputed from PERSISTED exposure history whatever the UI/policy showed. [INV-V3]
      const freshness = task.validation_role === 'INDEPENDENT_VALIDATION'
        ? evaluateValidationEligibility({ task, exposure: X.value, validationHistory: focusState.validation_history, currentPresentationId: pres.presentation_id }) : null;
      if (freshness && !freshness.eligible) return verdict(OUTCOMES.HOLD, 'VALIDATION_NOT_FRESH', { freshness: freshness.reason });
      // re-derive CURRENT governance (default deny)
      const a = rederive(env, reads, pres, round, X);
      const currentKind = actionKindOf(task, focusState);
      if (!a.task || a.task.task_id !== pres.task_id || a.focus !== pres.focus || currentKind !== pres.action_kind)
        return verdict(OUTCOMES.STALE, 'POLICY_NO_LONGER_SELECTS_THIS_ACTION');
      const revisionsChanged = Object.entries(pres.expected_revisions || {}).some(([n, r]) => (states(n).revision || 0) !== r);
      if (!guardAction(currentKind, focusState, { supportUsed: !!req.support_used, taskHypotheses: task.hypotheses || [], freshness })) {
        if (currentKind === 'INDEPENDENT_VALIDATION' && req.support_used && mayAdvance(focusState)) return verdict(OUTCOMES.HOLD, 'VALIDATION_CONTAMINATION');
        return verdict(OUTCOMES.STALE, 'NOT_AUTHORIZED_BY_CURRENT_STATE', { revisionsChanged });
      }
      const response = String(req.response ?? '').trim();
      if (!response) return verdict(OUTCOMES.HOLD, 'EMPTY_RESPONSE');
      if (task.validation_role !== 'PRACTICE' && req.support_used) return verdict(OUTCOMES.HOLD, 'SUPPORT_NOT_PERMITTED_FOR_ROLE');
      const chain = makeChain(env, seq, laid, pres.presentation_id, pres.presented_event_id);
      const prev = focusState;
      const isProbeTask = !!(task.is_conflict_session || task.is_resolution);
      let inference, transition, feedback, evalRecord, obsRecord;
      if (isProbeTask) {
        const mini = pres.mini || { index: 0, evals: [] };
        const probe = task.probes[mini.index];
        if (!probe || probe.probe_id !== req.probe_id) return verdict(OUTCOMES.STALE, 'PROBE_NOT_CURRENT');
        const r = evaluateProbe(task, probe, response, { learner_id: env.learnerId, timestamp: env.now });
        obsRecord = r.observation; evalRecord = r.evaluation;
        const obsE = chain.add('OBSERVATION', 'OBSERVATION', { node_id: pres.focus, task_id: task.task_id, probe_id: probe.probe_id, probe_ordinal: mini.index + 1,
          display_prompt: learnerDisplayPrompt(task, probe), response, record: obsRecord }, { actor: 'LEARNER', payload_ref: obsRecord.observation_id, object_refs: [task.task_id] });
        chain.add('EVALUATION', 'EVALUATION', { node_id: pres.focus, task_id: task.task_id, probe_id: probe.probe_id, record: evalRecord }, { actor: 'GOVERNED_EVALUATOR', payload_ref: evalRecord.evaluation_id, object_refs: [obsE.event_id] });
        const evals = [...mini.evals, { probe_id: probe.probe_id, evaluation_id: evalRecord.evaluation_id, supported: r.supported }];
        if (mini.index < task.probes.length - 1) {                      // intermediate probe: persisted mini-session progress (INV-A4)
          W.push({ store: 'meta', op: 'put', key: `pres::${pres.presentation_id}`, value: { ...pres, mini: { index: mini.index + 1, evals },
            display_prompt: learnerDisplayPrompt(task, task.probes[mini.index + 1]), last_seq: seq } });
          return committed(chain, { code: 'PROBE_RECORDED', n: mini.index + 1, total: task.probes.length, presentation_id: pres.presentation_id });
        }
        if (task.is_resolution) {
          const rr = resolveConflictInference(prev.competing_hypotheses || [], evals, task, { timestamp: env.now, preConflictEvidence: prev.pre_conflict_evidence });
          inference = rr.inference;
          transition = { type: 'RESOLVE_CONFLICT', authorized: true, resolved: rr.resolved, timestamp: env.now };
          feedback = rr.resolved ? { code: 'CONFLICT_RESOLVED', resolved_to: rr.resolvedTo } : { code: 'CONFLICT_UNRESOLVED' };
        } else {
          inference = combineConflictInference(task, evals, { timestamp: env.now }).inference;
          transition = { type: 'APPLY_DIAGNOSTIC_RESULT', authorized: true, task_role: 'DIAGNOSTIC_CHECK', result: 'NEUTRAL', inference, task_id: task.task_id, timestamp: env.now };
        }
        inference.evidence_refs = evals.map(e => e.evaluation_id);
      } else {
        const r = evaluateResponse(task, response, { learner_id: env.learnerId, support_used: !!req.support_used, timestamp: env.now });
        obsRecord = r.observation; evalRecord = r.evaluation; inference = r.inference;
        if (freshness) obsRecord.exposure_record_ref = freshness.exposure_record_ref;          // frozen Evidence-Model field
        const obsE = chain.add('OBSERVATION', 'OBSERVATION', { node_id: pres.focus, task_id: task.task_id, display_prompt: learnerDisplayPrompt(task),
          response, support_used: !!req.support_used, record: obsRecord }, { actor: 'LEARNER', payload_ref: obsRecord.observation_id, object_refs: [task.task_id] });
        chain.add('EVALUATION', 'EVALUATION', { node_id: pres.focus, task_id: task.task_id, record: evalRecord }, { actor: 'GOVERNED_EVALUATOR', payload_ref: evalRecord.evaluation_id, object_refs: [obsE.event_id] });
        if (task.validation_role === 'PRACTICE') transition = { type: 'RECORD_PRACTICE', authorized: true, task_role: 'PRACTICE', support_mode: req.support_used ? 'ASSISTED' : 'NONE', correct: r.correct, timestamp: env.now };
        else if (task.validation_role === 'INDEPENDENT_VALIDATION') transition = { type: 'APPLY_VALIDATION_RESULT', authorized: true, task_role: 'INDEPENDENT_VALIDATION', prospectively_declared: true, support_used: !!req.support_used, evaluator_authorized: true, result: r.correct ? 'PASS' : 'FAIL', task_id: task.task_id, evaluator_id: task.evaluator_id, policy_id: task.policy_id, freshness, timestamp: env.now };
        else transition = { type: 'APPLY_DIAGNOSTIC_RESULT', authorized: true, task_role: 'DIAGNOSTIC_CHECK', result: r.correct ? 'POSITIVE' : 'NEGATIVE', inference, task_id: task.task_id, transfer: !!task.is_transfer_check, basis: task.content_context || null, timestamp: env.now };
        feedback = { code: task.validation_role === 'PRACTICE' ? 'PRACTICE_RECORDED' : task.validation_role === 'INDEPENDENT_VALIDATION' ? (r.correct ? 'VALIDATION_PASS' : 'VALIDATION_FAIL') : 'DIAGNOSTIC_RECORDED',
          correct: r.correct, assisted: !!req.support_used, action_kind: currentKind };
      }
      let next;
      try { ({ next } = applyAuthorizedTransition(prev, transition)); }
      catch (e) { if (e instanceof GovernanceError) return verdict(OUTCOMES.HOLD, e.code); throw e; }
      next.revision = (prev.revision || 0) + 1;                              // exactly once per logical mutation
      next.last_inference_ref = inference.inference_id;
      const infE = chain.add('INFERENCE', 'INFERENCE', { node_id: pres.focus, task_id: task.task_id, record: inference }, { actor: 'INFERENCE_LAYER', payload_ref: inference.inference_id, object_refs: inference.evidence_refs || [] });
      const priorRef = stateRef(env, prev), resultRef = stateRef(env, next);
      const dec = decisionRecord(env, { prior: [priorRef], inferenceRefs: [inference.inference_id], action: transition.type, resulting: resultRef });
      chain.add('DECISION_AUTHORIZED', 'DECISION', { node_id: pres.focus, task_id: task.task_id, kind: 'STATE_TRANSITION_AUTHORIZATION', authorized_action: transition.type,
        evidence_state: next.evidence_state, freshness: freshness ? freshness.reason : undefined, record: dec }, { actor: 'GOVERNED_RUNTIME', payload_ref: dec.decision_id, object_refs: [infE.event_id] });
      chain.add('STATE_TRANSITION', 'DECISION', { node_id: pres.focus, task_id: task.task_id, transition_type: transition.type, decision_ref: dec.decision_id,
        prior_state_ref: priorRef, resulting_state_ref: resultRef, prior_revision: prev.revision || 0, resulting_revision: next.revision,
        prior: dims(prev), next: dims(next), evidence_state: next.evidence_state, competing_hypotheses: next.competing_hypotheses },
        { actor: 'GOVERNED_RUNTIME', object_refs: [pres.focus] });
      const attempted = freshness                                                // the attempt is exposure history too
        ? noteExposure(X, task, { presentation_id: pres.presentation_id, target: pres.target, focus: pres.focus, seq, now: env.now, change: 'ATTEMPTED',
          attempt: { result: transition.result, observation_id: obsRecord.observation_id, support_used: !!req.support_used } }) : null;
      W.push({ store: 'state', op: 'put', value: next });
      reads.states[next.node_id] = next;                                        // subsequent policy sees committed state
      const newRoundRec = { ...round, completed: [...new Set([...(round.completed || []), task.task_id])],
        diagnostic_done: round.diagnostic_done || (task.validation_role === 'DIAGNOSTIC_CHECK' && !task.is_resolution && !task.is_transfer_check) };
      W.push({ store: 'meta', op: 'put', key: `round::${pres.target}`, value: newRoundRec });
      supersede(W, pres, seq, 'CONSUMED');
      const nextPres = presentNext(env, W, chain, X, { target: pres.target, states, round: newRoundRec, prevPres: pres, inferenceRefs: [inference.inference_id], seq });
      if (attempted) exposureEvent(chain, attempted);
      if (!feedback || feedback.code === undefined) {
        const conflict = next.evidence_state === 'CONFLICTING_EVIDENCE' && prev.evidence_state !== 'CONFLICTING_EVIDENCE';
        feedback = conflict ? { code: 'CONFLICT_CREATED', competing: next.competing_hypotheses } : { code: 'DIAGNOSTIC_RECORDED', action_kind: currentKind };
      }
      feedback = { ...feedback, evidence_state: next.evidence_state, restored_to: transition.type === 'RESOLVE_CONFLICT' ? next.evidence_state : undefined,
        concern_raised: !hasActiveConcern(prev) && hasActiveConcern(next), concern_resolved: hasActiveConcern(prev) && !hasActiveConcern(next),
        concern_continues: hasActiveConcern(prev) && hasActiveConcern(next) && currentKind === 'PT08_RECHECK',
        next_presentation: nextPres.presentation_id, revisions_changed_since_presentation: revisionsChanged };
      return committed(chain, feedback);
    }
    // ------------------------------------------------------------------ TARGET_SELECT
    case 'TARGET_SELECT': {
      if ((M.chooser_epoch || 0) !== req.epoch) return verdict(OUTCOMES.STALE, 'CHOOSER_EPOCH_CHANGED');
      if (!env.content.isLearnable(req.node)) return verdict(OUTCOMES.HOLD, 'NOT_A_LEARNABLE_TARGET');
      const chain = makeChain(env, seq, laid, null, null);
      const round = newRound(env, req.node);
      chain.add('TARGET_SELECTED', 'DECISION', { node_id: req.node, round_id: round.round_id, prior_target: M.current_target || null,
        record: decisionRecord(env, { prior: [], inferenceRefs: [], action: 'TARGET_SELECTED' }) }, { actor: 'LEARNER', object_refs: [req.node] });
      W.push({ store: 'meta', op: 'put', key: 'current_target', value: req.node });
      W.push({ store: 'meta', op: 'put', key: 'chooser_epoch', value: (M.chooser_epoch || 0) + 1 });
      W.push({ store: 'meta', op: 'put', key: `round::${req.node}`, value: round });
      supersede(W, activePres, seq);
      const p = presentNext(env, W, chain, X, { target: req.node, states, round, prevPres: null, inferenceRefs: null, seq });
      return committed(chain, { code: 'TARGET_SET', node: req.node, next_presentation: p.presentation_id });
    }
    // ------------------------------------------------------------------ CHANGE_TARGET
    case 'CHANGE_TARGET': {
      if (!activePres || activePres.presentation_id !== req.presentation_id) return verdict(OUTCOMES.STALE, 'PRESENTATION_NOT_CURRENT');
      const chain = makeChain(env, seq, laid, req.presentation_id, activePres.presented_event_id);
      chain.add('TARGET_CLEARED', 'DECISION', { prior_target: M.current_target || null, presentation_id: req.presentation_id,
        record: decisionRecord(env, { prior: [], inferenceRefs: [], action: 'TARGET_CLEARED' }) }, { actor: 'LEARNER', object_refs: [M.current_target].filter(Boolean) });
      W.push({ store: 'meta', op: 'put', key: 'current_target', value: null });
      W.push({ store: 'meta', op: 'put', key: 'active_learn', value: null });
      W.push({ store: 'meta', op: 'put', key: 'chooser_epoch', value: (M.chooser_epoch || 0) + 1 });
      supersede(W, activePres, seq);
      return committed(chain, { code: 'TARGET_CLEARED' });
    }
    // ------------------------------------------------------------------ RESTART_ROUND (resets ROUND progression only)
    case 'RESTART_ROUND': {
      if (!activePres || activePres.presentation_id !== req.presentation_id || activePres.kind !== 'HOLD' || activePres.target !== M.current_target)
        return verdict(OUTCOMES.STALE, 'RESTART_NOT_AUTHORIZED');
      const chain = makeChain(env, seq, laid, req.presentation_id, activePres.presented_event_id);
      const round = newRound(env, activePres.target, true);
      chain.add('TARGET_SELECTED', 'DECISION', { node_id: activePres.target, round_id: round.round_id, round_restart: true,
        record: decisionRecord(env, { prior: [], inferenceRefs: [], action: 'START_NEW_ROUND' }) }, { actor: 'LEARNER', object_refs: [activePres.target] });
      W.push({ store: 'meta', op: 'put', key: `round::${activePres.target}`, value: round });
      supersede(W, activePres, seq);
      const p = presentNext(env, W, chain, X, { target: activePres.target, states, round, prevPres: activePres, inferenceRefs: null, seq });
      return committed(chain, { code: 'ROUND_RESTARTED', node: activePres.target, next_presentation: p.presentation_id });
    }
    // ------------------------------------------------------------------ ENSURE_PRESENTATION (legacy / missing active)
    case 'ENSURE_PRESENTATION': {
      const target = M.current_target;
      if (!target) return verdict(OUTCOMES.HOLD, 'NO_TARGET');
      let round = M[`round::${target}`];
      if (activePres && activePres.status === 'ACTIVE' && activePres.target === target && round && round.round_id === activePres.round_id) {
        const a = rederive(env, reads, activePres, round, X);
        const same = activePres.kind === 'TASK' ? (a.task && a.task.task_id === activePres.task_id && a.focus === activePres.focus)
          : (!a.task && a.focus === activePres.focus && ((activePres.kind === 'GOAL_REACHED') === (a.action === 'GOAL_REACHED')));
        if (same) return verdict(OUTCOMES.DUPLICATE, 'ACTIVE_PRESENTATION_VALID');
      }
      const chain = makeChain(env, seq, laid, null, activePres?.presented_event_id || null);
      if (!round) { round = newRound(env, target); W.push({ store: 'meta', op: 'put', key: `round::${target}`, value: round }); }
      supersede(W, activePres, seq);
      const p = presentNext(env, W, chain, X, { target, states, round, prevPres: activePres && activePres.target === target ? activePres : null, inferenceRefs: null, seq });
      return committed(chain, { code: 'PRESENTATION_RECONCILED', next_presentation: p.presentation_id });
    }
    // ------------------------------------------------------------------ SELF_REPORT
    case 'SELF_REPORT': {
      if (!activePres || activePres.focus !== req.node) return verdict(OUTCOMES.STALE, 'FOCUS_CHANGED');
      if (!SELF_REPORT_OPTIONS.includes(req.value)) return verdict(OUTCOMES.HOLD, 'UNKNOWN_SELF_REPORT_OPTION');
      const chain = makeChain(env, seq, laid, activePres.presentation_id, activePres.presented_event_id);
      chain.add('SELF_REPORT', 'OBSERVATION', { node_id: req.node, value: req.value, note: req.note || null }, { actor: 'LEARNER', object_refs: [req.node] });
      return committed(chain, { code: 'SELF_REPORT_RECORDED' });   // no learner-state write [V03-GOV-004]
    }
  }
  return verdict(OUTCOMES.HOLD, 'UNHANDLED');
}

// ================================ pilot lifecycle (never AFM) ================================
// CONSENT (ORDINARY -> PILOT(P)), COMPLETE_PILOT (normal end; data retained, coded), WITHDRAW (RETAIN | DELETE).
// Lifecycle receipts and the active/epoch coordination keys are GLOBAL administrative metadata; everything a
// participant produces is routed to that participant's scope. [H_c^(5) contract §3.5; Addendum §3–§5/§8; Supplement §1]
function decideLifecycle(req, reads, env, scope) {
  if (scope.kind === 'AFM') return verdict(OUTCOMES.HOLD, 'PILOT_UNAVAILABLE_IN_AUDIT_FIXTURE_MODE');
  const G = reads.global || {};
  const laid = logicalActionId(req);
  const receipt = G[`receipt::${laid}`];
  if (receipt) return verdict(OUTCOMES.DUPLICATE, 'ALREADY_COMMITTED', { receipt, logical_action_id: laid });
  if ((G.pilot_epoch || 0) !== req.epoch) return verdict(OUTCOMES.STALE, 'PILOT_EPOCH_CHANGED');
  const W = [];
  const lifecycleEnd = () => { W.push({ store: 'global', op: 'put', key: 'active_pilot', value: null }); W.push({ store: 'global', op: 'put', key: 'pilot_epoch', value: (G.pilot_epoch || 0) + 1 }); };
  const receiptW = (result) => W.push({ store: 'global', op: 'add', key: `receipt::${laid}`, value: { logical_action_id: laid, kind: req.kind, outcome: OUTCOMES.COMMITTED, result, at: env.now } });
  const pid = String(req.participant_id || '');

  if (req.kind === 'CONSENT') {
    if (scope.kind !== 'ORDINARY' || G.active_pilot) return verdict(OUTCOMES.STALE, 'PILOT_ALREADY_ACTIVE');
    if (!PARTICIPANT_ID_RE.test(pid)) return verdict(OUTCOMES.HOLD, 'INVALID_PARTICIPANT_ID');
    if (req.affirmed !== true) return verdict(OUTCOMES.HOLD, 'RIGHTS_NOT_AFFIRMED');
    if (reads.pilot || reads.admin) return verdict(OUTCOMES.HOLD, 'PARTICIPANT_ID_ALREADY_USED');   // no participant inherits another's records
    const psid = env.uuid();
    const chain = makeChain({ ...env, learnerId: pid }, 1, laid, null, null);           // first commit of the participant ledger
    chain.add('CONSENT_OBTAINED', 'DECISION', { participant_id: pid, pilot_session_id: psid, scored: false, disclosure_version: DISCLOSURE_VERSION,
      disclosures: ['VOLUNTARY', 'STOP_ANY_TIME_NO_REASON', 'NOT_SCORED', 'DATA_DISPOSITION_ON_WITHDRAWAL', 'DEFAULT_EXCLUDE_DELETE_WHERE_FEASIBLE'] },
      { actor: 'PARTICIPANT', object_refs: [pid] });
    W.push({ store: 'pilotSessions', op: 'put', value: { participant_id: pid, pilot_session_id: psid, consent_obtained: true, consent_epoch: G.pilot_epoch || 0,
      started_at: env.now, disclosure_version: DISCLOSURE_VERSION, completed_at: null, withdrawn_at: null, data_disposition: null } });
    W.push({ store: 'meta', scope: 'after', op: 'put', key: 'commit_seq', value: 1 });
    for (const e of chain.events) W.push({ store: 'events', scope: 'after', op: 'add', value: e });
    W.push({ store: 'global', op: 'put', key: 'active_pilot', value: pid });
    W.push({ store: 'global', op: 'put', key: 'pilot_epoch', value: (G.pilot_epoch || 0) + 1 });
    receiptW({ code: 'CONSENT_RECORDED', participant_id: pid });
    return { outcome: OUTCOMES.COMMITTED, writes: W, scope_after: { participant_id: pid, pilot_session_id: psid },
      result: { code: 'CONSENT_RECORDED', participant_id: pid, logical_action_id: laid } };
  }

  // COMPLETE_PILOT / WITHDRAW: only the AUTHORITATIVE active participant, and only its own scope.
  if (!G.active_pilot || G.active_pilot !== pid || !(scope.kind === 'PILOT' || scope.kind === 'UNRESOLVED') || scope.participant_id !== pid)
    return verdict(OUTCOMES.STALE, 'NO_ACTIVE_PILOT_FOR_PARTICIPANT');
  const row = reads.activeRow || null;
  const M = reads.meta || {};
  const seq = (M.commit_seq || 0) + 1;
  const ledger = (type, payload) => {                                  // participant ledger (only when the scope is resolved)
    if (scope.kind !== 'PILOT') return;
    const chain = makeChain(env, seq, laid, null, null);
    chain.add(type, 'DECISION', payload, { actor: 'PARTICIPANT', object_refs: [pid] });
    W.push({ store: 'meta', op: 'put', key: 'commit_seq', value: seq });
    for (const e of chain.events) W.push({ store: 'events', op: 'add', value: e });
  };

  if (req.kind === 'COMPLETE_PILOT') {
    if (scope.kind !== 'PILOT') return verdict(OUTCOMES.HOLD, 'PILOT_SCOPE_UNRESOLVED');
    ledger('PILOT_SESSION_COMPLETED', { participant_id: pid, withdrawal_occurred: false, learner_state_inference: false });
    W.push({ store: 'pilotSessions', op: 'put', value: { ...row, completed_at: env.now } });
    lifecycleEnd();
    receiptW({ code: 'PILOT_COMPLETED' });
    return { outcome: OUTCOMES.COMMITTED, writes: W, result: { code: 'PILOT_COMPLETED', participant_id: pid, logical_action_id: laid } };
  }

  // WITHDRAW — minimal administrative record (Supplement §1 limits; Addendum §8 documentation; no reason, no inference)
  if (!WITHDRAW_DISPOSITIONS.includes(req.disposition)) return verdict(OUTCOMES.HOLD, 'INVALID_DISPOSITION');
  const admin = { participant_id: pid, record_type: 'PILOT_WITHDRAWAL_RECORD', consent_obtained: row ? row.consent_obtained === true : null,
    consent_version: row ? row.disclosure_version || null : null, consent_date: row ? dateOnly(row.started_at) : null,
    withdrawal_occurred: true, withdrawn_on: dateOnly(env.now), data_disposition: req.disposition, default_applied: !!req.default_choice };
  if (req.disposition === 'DELETE_WHERE_FEASIBLE') {
    // participant-level pilot data is deleted across EVERY participant-scoped class, in this one transaction
    W.push({ store: 'purge', participant_id: pid });
    W.push({ store: 'pilotSessions', op: 'delete', key: pid });
    if (row && Number.isInteger(row.consent_epoch)) W.push({ store: 'global', op: 'delete', key: `receipt::PILOT:${row.consent_epoch}:CONSENT:${pid}` });
  } else {
    ledger('PILOT_WITHDRAWN', { participant_id: pid, disposition: req.disposition, default_applied: !!req.default_choice, learner_state_inference: false });
    W.push({ store: 'pilotSessions', op: 'put', value: { ...(row || { participant_id: pid }), withdrawn_at: env.now, data_disposition: req.disposition } });
  }
  W.push({ store: 'pilotAdmin', op: 'put', value: admin });
  lifecycleEnd();
  receiptW({ code: 'WITHDRAWN', disposition: req.disposition });
  return { outcome: OUTCOMES.COMMITTED, writes: W, result: { code: 'WITHDRAWN', disposition: req.disposition, participant_id: pid, logical_action_id: laid } };
}
