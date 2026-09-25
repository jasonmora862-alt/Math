// TNPO/MSVO v0.3 — Governed learner-state transitions (pure; no I/O).
// Frozen invariants: Practice != Independent Validation [V03-GOV-003]; self-report != validation command
// [V03-GOV-004]; append-only history [V03-GOV-007/013]; role fixed before response [V03-TASK-004];
// CONFLICTING only via the EVID-030 trigger [V03-EVID-030..033]; no forward advancement from INSUFFICIENT or
// unresolved CONFLICTING [V03-FLOW-016].
//
// Defence in depth (H_c^(4) contract INV-A2): the transition layer itself refuses FLOW-016-prohibited
// transitions whatever its caller claims. The ONLY caller is the governed commit layer (core/commit.v3.js),
// which re-derives authority from current persisted state inside one IndexedDB transaction.
import { deriveEvidenceState } from './evidence.v3.js';

export class GovernanceError extends Error {
  constructor(code, message) { super(message); this.name = 'GovernanceError'; this.code = code; }
}

export function defaultLearnerState(nodeId) {
  return {
    node_id: nodeId,
    exposure_state: 'UNEXPOSED',
    practice_state: 'NOT_PRACTICED',
    validation_state: 'NOT_VALIDATED',
    retention_state: 'NOT_ASSESSED',
    evidence_state: 'INSUFFICIENT_EVIDENCE',
    validation_history: [],           // append-only PASS/FAIL records
    concern_history: [],              // append-only PT-08 concern lifecycle log (RAISED / CONTINUED / RESOLVED)
    current_concern: null,            // ACTIVE PT-08 concern or null; NOT a time-based retention state
    competing_hypotheses: [],
    pre_conflict_evidence: null,      // evidence authority before entering CONFLICTING; restored on resolution
    revision: 0,                      // incremented exactly once per committed logical mutation of this record
    last_inference_ref: null,         // inference_id of the most recent inference about this node
    updated_at: null
  };
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const SUFFICIENT = new Set(['SUPPORTED_NOT_ESTABLISHED', 'ESTABLISHED']);

// Evidence-sufficiency guard: no forward advancement from INSUFFICIENT or unresolved CONFLICTING. [V03-FLOW-016]
export function mayAdvance(state) {
  return !!state && state.evidence_state !== 'INSUFFICIENT_EVIDENCE' && state.evidence_state !== 'CONFLICTING_EVIDENCE';
}
export function hasActiveConcern(state) {
  return !!(state && state.current_concern && state.current_concern.status !== 'RESOLVED');
}

// The ONLY learner-state mutation function. Pure: returns { previous, next }.
export function applyAuthorizedTransition(previousState, transition) {
  const prev = clone(previousState);
  const next = clone(previousState);
  const now = transition.timestamp || new Date().toISOString();
  if (!transition.authorized) throw new GovernanceError('UNAUTHORIZED_TRANSITION', 'Transition requires runtime authorization.');

  switch (transition.type) {
    case 'RECORD_PRACTICE': {
      if (transition.task_role !== 'PRACTICE')
        throw new GovernanceError('ROLE_MISMATCH', 'Practice state can only be set from a prospectively declared PRACTICE task.');
      // Activity is always recorded; evidence advances INSUFFICIENT -> SUPPORTED only for CORRECT practice. [M4, FLOW-016]
      next.practice_state = transition.support_mode === 'NONE' ? 'INDEPENDENT_PRACTICE' : 'ASSISTED_PRACTICE';
      if (transition.correct === true && next.validation_state !== 'VALIDATED' && next.evidence_state === 'INSUFFICIENT_EVIDENCE')
        next.evidence_state = 'SUPPORTED_NOT_ESTABLISHED';
      break;   // practice never yields validation [V03-GOV-003, V03-TASK-011]
    }
    case 'APPLY_DIAGNOSTIC_RESULT': {
      // DIAGNOSTIC_CHECK gathers evidence; it never certifies or de-certifies. [V03-TASK-012/016]
      if (transition.task_role !== 'DIAGNOSTIC_CHECK')
        throw new GovernanceError('ROLE_MISMATCH', 'Diagnostic result requires a DIAGNOSTIC_CHECK task.');
      const inf = transition.inference || null;
      if (inf && inf.evidence_state === 'CONFLICTING_EVIDENCE' && Array.isArray(inf.competing_hypotheses) && inf.competing_hypotheses.length >= 2) {
        if (prev.evidence_state !== 'CONFLICTING_EVIDENCE') next.pre_conflict_evidence = prev.evidence_state;
        next.evidence_state = 'CONFLICTING_EVIDENCE';
        next.competing_hypotheses = inf.competing_hypotheses;
      }
      // PT-08 concern lifecycle — ONLY on an independently VALIDATED node and only from a transfer check.
      // RAISED on a negative transfer result; CONTINUED on a negative re-check; RESOLVED on a passing re-check.
      // Never touches validation_state / validation_history; never infers elapsed-time retention. [FLOW-040, TASK-016]
      if (transition.transfer === true && next.validation_state === 'VALIDATED') {
        next.concern_history = Array.isArray(next.concern_history) ? next.concern_history : [];
        const active = hasActiveConcern(prev);
        if (transition.result === 'NEGATIVE') {
          const entry = { event: active ? 'CONTINUED' : 'RAISED', timestamp: now, kind: 'TRANSFER_CONCERN',
            basis: transition.basis || null, task_id: transition.task_id || null };
          next.concern_history.push(entry);
          next.current_concern = active
            ? { ...prev.current_concern, status: 'ACTIVE', rechecks_failed: (prev.current_concern.rechecks_failed || 0) + 1, last_task_id: entry.task_id, last_at: now }
            : { status: 'ACTIVE', kind: 'TRANSFER_CONCERN', raised_at: now, raised_by_task: entry.task_id, basis: entry.basis, rechecks_failed: 0, last_task_id: entry.task_id, last_at: now };
        } else if (transition.result === 'POSITIVE' && active) {
          next.concern_history.push({ event: 'RESOLVED', timestamp: now, kind: 'TRANSFER_CONCERN', task_id: transition.task_id || null });
          next.current_concern = null;
        }
      }   // on an unvalidated target no TRANSFER_CONCERN is ever created [M-F]; the evidence is still recorded by the caller.
      break;
    }
    case 'APPLY_VALIDATION_RESULT': {
      if (transition.task_role !== 'INDEPENDENT_VALIDATION')
        throw new GovernanceError('VALIDATION_CONTAMINATION', 'Only a prospectively declared INDEPENDENT_VALIDATION task may create validation evidence.');
      if (!transition.prospectively_declared)
        throw new GovernanceError('RETROACTIVE_ROLE_REWRITE', 'Validation role must be declared before the learner responds.');
      if (transition.support_used)
        throw new GovernanceError('VALIDATION_CONTAMINATION', 'Assisted performance cannot be used as independent validation.');
      if (!transition.evaluator_authorized)
        throw new GovernanceError('UNAUTHORIZED_EVALUATOR', 'Validation requires an authorized evaluator.');
      // Tutor-Policy contamination guard: a prospective exposure/freshness evaluation must have found the item fresh.
      // Defence in depth — the caller cannot certify by skipping the evaluation. [H_c^(5) INV-V2/V3]
      if (!transition.freshness || transition.freshness.eligible !== true)
        throw new GovernanceError('VALIDATION_CONTAMINATION', 'Independent validation requires an exposure/freshness evaluation that found the item eligible.');
      // FLOW-016 at the transition layer: validation cannot be reached from INSUFFICIENT or unresolved CONFLICTING.
      if (!SUFFICIENT.has(prev.evidence_state))
        throw new GovernanceError('EVIDENCE_GUARD', 'Independent validation is not authorized from insufficient or unresolved conflicting evidence.');
      next.validation_history = Array.isArray(next.validation_history) ? next.validation_history : [];
      next.validation_history.push({ timestamp: now, result: transition.result,
        task_id: transition.task_id || null, evaluator_id: transition.evaluator_id || null, policy_id: transition.policy_id || null });
      if (transition.result === 'PASS') {
        next.validation_state = 'VALIDATED'; next.evidence_state = 'ESTABLISHED';
        next.retention_state = 'NOT_ASSESSED'; next.competing_hypotheses = [];
      } else if (transition.result === 'FAIL') {
        next.validation_state = 'NOT_VALIDATED';   // FLOW-014: FAIL -> NOT_VALIDATED, history retained
        // a FAIL never promotes evidence and never deletes earlier history [B-1, V03-GOV-007]
      } else {
        throw new GovernanceError('INVALID_RESULT', 'Validation result must be PASS or FAIL.');
      }
      break;
    }
    case 'RESOLVE_CONFLICT': {
      if (prev.evidence_state !== 'CONFLICTING_EVIDENCE')
        throw new GovernanceError('NOT_CONFLICTING', 'Conflict resolution requires a current CONFLICTING state.');
      if (transition.resolved) {
        // resolution removes the competition; authority returns to the pre-conflict level, never higher [M-A, EVID-032]
        const pre = next.pre_conflict_evidence;
        next.evidence_state = SUFFICIENT.has(pre) ? pre : 'INSUFFICIENT_EVIDENCE';
        next.competing_hypotheses = [];
        next.pre_conflict_evidence = null;
      } else {
        next.evidence_state = 'CONFLICTING_EVIDENCE';   // not disambiguated: stays CONFLICTING, competing set kept
      }
      break;
    }
    default:
      throw new GovernanceError('UNKNOWN_TRANSITION', `Unknown governed transition: ${transition.type}`);
  }
  next.updated_at = now;
  return { previous: prev, next };
}

// SELF_REPORT is learner OBSERVATION evidence, never a transition. [V03-GOV-004, CC-05]
export const SELF_REPORT_OPTIONS = Object.freeze([
  'I guessed', "I've seen this before", 'I used outside help', 'I already knew this', 'Other'
]);
export function learnerSelfReportEvent(value, context = {}) {
  return { event_type: 'SELF_REPORT', record_type: 'OBSERVATION', value, context };
}

// Stale/older-shape learner-state safety: merge onto defaults, PRESERVE history, coerce unknown enums. [AT-036]
const VALID_EVIDENCE = new Set(['ESTABLISHED', 'SUPPORTED_NOT_ESTABLISHED', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE']);
const VALID_ENUMS = Object.freeze({
  exposure_state: new Set(['UNEXPOSED', 'SEEN_AND_EXPLAINED']),
  practice_state: new Set(['NOT_PRACTICED', 'ASSISTED_PRACTICE', 'INDEPENDENT_PRACTICE']),
  validation_state: new Set(['NOT_VALIDATED', 'VALIDATED']),
  retention_state: new Set(['NOT_ASSESSED', 'RETENTION_CONCERN', 'REVALIDATION_DUE'])
});
export function normalizeLearnerState(raw, nodeId) {
  const base = defaultLearnerState(nodeId);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: base, reconciled: !!raw };
  const out = { ...base, ...raw, node_id: raw.node_id || nodeId };
  out.validation_history = Array.isArray(raw.validation_history) ? raw.validation_history : [];
  out.concern_history = Array.isArray(raw.concern_history) ? raw.concern_history : [];
  out.competing_hypotheses = Array.isArray(raw.competing_hypotheses) ? raw.competing_hypotheses : [];
  out.revision = Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;   // documented default 0
  let reconciled = false;
  if (!VALID_EVIDENCE.has(out.evidence_state)) { out.evidence_state = 'INSUFFICIENT_EVIDENCE'; reconciled = true; }
  for (const k of Object.keys(VALID_ENUMS)) {
    if (typeof out[k] !== 'string' || !VALID_ENUMS[k].has(out[k])) { out[k] = base[k]; reconciled = true; }
  }
  if (out.evidence_state !== 'CONFLICTING_EVIDENCE') out.pre_conflict_evidence = null;
  else if (!VALID_EVIDENCE.has(out.pre_conflict_evidence)) out.pre_conflict_evidence = null;
  // legacy (H_c^(1..3)) concern shape {timestamp, kind, ...} without status -> ACTIVE only on a VALIDATED node
  if (out.current_concern && typeof out.current_concern === 'object') {
    if (out.validation_state !== 'VALIDATED') { out.current_concern = null; reconciled = true; }
    else if (!out.current_concern.status) out.current_concern = { status: 'ACTIVE', kind: out.current_concern.kind || 'TRANSFER_CONCERN',
      raised_at: out.current_concern.timestamp || null, raised_by_task: out.current_concern.task_id || null, basis: out.current_concern.basis || null, rechecks_failed: 0 };
  } else out.current_concern = null;
  return { state: out, reconciled };
}

// ---------------- Learner–task exposure and validation freshness (H_c^(5) contract §6) ----------------
// Exposure is persistent learner–task relational state (`TASK != LEARNER-TASK EXPOSURE`), recorded per learner data
// scope, append-only, and independent of rounds, targets, tabs and reloads. It is kept in the scoped meta record
// `task_exposure` = { version: 1, items: { [task_id]: LearnerTaskExposure } } and mirrored in the ledger by
// EXPOSURE_UPDATED events. An item is EXPOSED once a governed presentation of it exists for the learner.
// H_c^(6): the item's lifecycle state is defined by the Validation Exposure and Freshness Amendment v1.0 (A1, FR-2);
// explicit closures (`closures[]`: CONSUMED_ABANDONED / CONSUMED_CONTAMINATED) are persisted in the same transaction
// as the governed action that causes them (FR-11a). Records written before closures existed have no `closures`.
export const ELIGIBILITY = Object.freeze({
  FRESH: 'ELIGIBLE_FRESH', CURRENT: 'ELIGIBLE_CURRENT_EXPOSURE', FAILURE: 'INELIGIBLE_DUE_TO_FAILURE',
  PRIOR: 'INELIGIBLE_DUE_TO_PRIOR_EXPOSURE', HELP: 'INELIGIBLE_DUE_TO_HELP', ABANDONED: 'INELIGIBLE_DUE_TO_ABANDONMENT',
  NOT_VALIDATION: 'NOT_A_VALIDATION_TASK'
});
export const ITEM_STATE = Object.freeze({
  UNEXPOSED: 'UNEXPOSED', ACTIVE: 'ACTIVE_EXPOSURE', PASS: 'CONSUMED_PASS', FAIL: 'CONSUMED_FAIL',
  ABANDONED: 'CONSUMED_ABANDONED', CONTAMINATED: 'CONSUMED_CONTAMINATED'
});
const REASON_OF_STATE = { UNEXPOSED: ELIGIBILITY.FRESH, ACTIVE_EXPOSURE: ELIGIBILITY.CURRENT, CONSUMED_PASS: ELIGIBILITY.PRIOR,
  CONSUMED_FAIL: ELIGIBILITY.FAILURE, CONSUMED_ABANDONED: ELIGIBILITY.ABANDONED, CONSUMED_CONTAMINATED: ELIGIBILITY.HELP };
export const emptyExposure = () => ({ version: 1, items: {} });
export function exposureEntry(task, { target = null, focus = null } = {}) {
  return { exposure_id: `LTE:${task.task_id}`, task_id: task.task_id, task_version: task.task_version || null, template_id: task.template_id || null,
    validation_role: task.validation_role, target, focus, exposures: [], attempts: [], closures: [] };
}

// A1 FR-2 lifecycle state of one validation item in one learner data scope, from PERSISTED history only.
// `currentPresentationId` is the governed attempt being (re)authorized; an exposure under any other presentation
// with no attempt is a terminated attempt (FR-5; A1 D-3 for records without an explicit closure).
export function validationItemState({ task, exposure = null, validationHistory = [], currentPresentationId = null } = {}) {
  const items = (exposure && exposure.items) || {};
  const related = Object.values(items).filter(x => x && (x.task_id === task.task_id || (task.template_id && x.template_id === task.template_id)));
  const attempts = [...related.flatMap(x => x.attempts || []),
    ...(Array.isArray(validationHistory) ? validationHistory : []).filter(h => h && h.task_id === task.task_id)];
  const closures = related.flatMap(x => x.closures || []);
  if (closures.some(c => c.state === ITEM_STATE.CONTAMINATED) || attempts.some(a => a.support_used)) return ITEM_STATE.CONTAMINATED;
  if (attempts.some(a => a.result === 'FAIL')) return ITEM_STATE.FAIL;
  if (attempts.length) return ITEM_STATE.PASS;
  if (closures.some(c => c.state === ITEM_STATE.ABANDONED)) return ITEM_STATE.ABANDONED;
  const shows = related.flatMap(x => x.exposures || []);
  if (!shows.length) return ITEM_STATE.UNEXPOSED;
  if (currentPresentationId && shows.every(s => s.presentation_id === currentPresentationId)) return ITEM_STATE.ACTIVE;
  return ITEM_STATE.ABANDONED;
}

// THE single freshness function, used by policy selection, commit-time authorization and (through the transition's
// `freshness` field) the transition layer. Exact item identity; a declared Task-Model template_id shared with an
// exposed item counts as the same item (`task ID change != evidence independence`). No other equivalence is invented.
// Eligible only while UNEXPOSED (a new attempt) or ACTIVE_EXPOSURE of this very presentation (A1 FR-2/FR-3).
export function evaluateValidationEligibility({ task, exposure = null, validationHistory = [], currentPresentationId = null } = {}) {
  if (!task || task.validation_role !== 'INDEPENDENT_VALIDATION') return { eligible: true, reason: ELIGIBILITY.NOT_VALIDATION, item_state: null, exposure_record_ref: null };
  const items = (exposure && exposure.items) || {};
  const ref = items[task.task_id] ? items[task.task_id].exposure_id : null;
  const item_state = validationItemState({ task, exposure, validationHistory, currentPresentationId });
  return { eligible: item_state === ITEM_STATE.UNEXPOSED || item_state === ITEM_STATE.ACTIVE, reason: REASON_OF_STATE[item_state], item_state, exposure_record_ref: ref };
}

// Rebuild the exposure index of one scope from its persisted ledger + learner states (DB v1 -> v2 upgrade; tests).
export function exposureFromLedger(events = [], states = []) {
  const X = emptyExposure();
  const entry = (p) => (X.items[p.task_id] ||= { exposure_id: `LTE:${p.task_id}`, task_id: p.task_id, task_version: p.task_version || null, template_id: null,
    validation_role: 'INDEPENDENT_VALIDATION', target: p.target || null, focus: p.node_id || null, exposures: [], attempts: [], closures: [] });
  for (const e of events) {
    const p = e && e.payload; if (!p || !p.task_id) continue;
    if ((e.type === 'TASK_PRESENTED' || e.event_type === 'TASK_PRESENTED') && p.role === 'INDEPENDENT_VALIDATION')
      entry(p).exposures.push({ presentation_id: p.presentation_id || null, seq: Number.isInteger(e.commit_seq) ? e.commit_seq : null, at: e.timestamp || null, reconstructed: true });
  }
  for (const s of states) for (const h of ((s && s.validation_history) || [])) {
    if (!h || !h.task_id) continue;
    entry({ task_id: h.task_id, node_id: s.node_id }).attempts.push({ presentation_id: null, seq: null, at: h.timestamp || null, result: h.result, support_used: false, reconstructed: true });
  }
  return X;
}

export function historicalValidationPasses(state) {
  const h = Array.isArray(state?.validation_history) ? state.validation_history : [];
  return h.filter(x => x.result === 'PASS');
}

export { deriveEvidenceState };
