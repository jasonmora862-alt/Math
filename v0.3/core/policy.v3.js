// TNPO/MSVO v0.3 — Tutor policy (next-action selection). Pure; proposes, never certifies. [TNPO_TUTOR_POLICY_STATE_MACHINE_v1.0]
// Returns STRUCTURED CODES only — no learner-facing prose and no identifiers in text (translation lives in
// core/present.v3.js). [H_c^(4) contract INV-C3]
//
// ctx: {
//   focusState      learner state of the TARGET,
//   focusTasks      tasks of the target,
//   completed       Set(task_id) completed in the current persisted round,
//   diagnosticDone  ordinary diagnostic completed in the current round,
//   prereq          optional { requiresNodeId, prereqState, prereqTasks } for a genuine REQUIRES edge,
//   onPrereqFocus   true when the presentation being replaced (or re-authorized) is focused on the prerequisite
//   exposure        persisted learner–task exposure record of the learner's data scope (H_c^(5) INV-V1)
//   currentPresentationId  the presentation being re-authorized (null when a new presentation is being created)
// }
// Result: { action, policy_action, reasoning_state, focus, task, action_kind, target_preserved, returned, hold_reason }
import { mayAdvance, hasActiveConcern, evaluateValidationEligibility } from './governance.v3.js';

export const ACTION_KINDS = Object.freeze(['PRACTICE', 'DIAGNOSTIC_CHECK', 'CONFLICT_PROBE', 'CONFLICT_RESOLUTION',
  'INDEPENDENT_VALIDATION', 'PT08_TRANSFER', 'PT08_RECHECK']);

export function actionKindOf(task, focusState) {
  if (!task) return null;
  if (task.validation_role === 'PRACTICE') return 'PRACTICE';
  if (task.validation_role === 'INDEPENDENT_VALIDATION') return 'INDEPENDENT_VALIDATION';
  if (task.validation_role === 'DIAGNOSTIC_CHECK') {
    if (task.is_resolution) return 'CONFLICT_RESOLUTION';
    if (task.is_conflict_session) return 'CONFLICT_PROBE';
    if (task.is_transfer_check) return hasActiveConcern(focusState) ? 'PT08_RECHECK' : 'PT08_TRANSFER';
    return 'DIAGNOSTIC_CHECK';
  }
  return null;   // unknown -> not authorized
}
const POLICY_ACTION = { PRACTICE: 'SELECT_PRACTICE_TASK', DIAGNOSTIC_CHECK: 'SELECT_DIAGNOSTIC_TASK', CONFLICT_PROBE: 'SELECT_DIAGNOSTIC_TASK',
  CONFLICT_RESOLUTION: 'SELECT_DIAGNOSTIC_TASK', PT08_TRANSFER: 'SELECT_DIAGNOSTIC_TASK', PT08_RECHECK: 'SELECT_DIAGNOSTIC_TASK',
  INDEPENDENT_VALIDATION: 'SELECT_VALIDATION_TASK' };

function first(tasks, completed, pred) { return (tasks || []).find(t => !completed.has(t.task_id) && pred(t)) || null; }
const isOrdinaryDiagnostic = (t) => t.validation_role === 'DIAGNOSTIC_CHECK' && !t.is_resolution && !t.is_transfer_check;

function present(task, focusState, reasoning, extra = {}) {
  const kind = actionKindOf(task, focusState);
  return { action: 'PRESENT_TASK', policy_action: POLICY_ACTION[kind], reasoning_state: reasoning, focus: focusState.node_id,
    task, action_kind: kind, target_preserved: null, returned: false, hold_reason: null, ...extra };
}
function hold(focusState, reason, reasoning = 'HOLD_INSUFFICIENT_EVIDENCE', extra = {}) {
  return { action: 'HOLD', policy_action: 'HOLD', reasoning_state: reasoning, focus: focusState.node_id, task: null,
    action_kind: null, target_preserved: null, returned: false, hold_reason: reason, ...extra };
}

// Target-level selection (no prerequisite handling).
function selectOnTarget(ctx) {
  const s = ctx.focusState, tasks = ctx.focusTasks || [], done = ctx.completed || new Set();
  // Unresolved CONFLICTING -> only a resolver relevant to the ACTIVE competing hypotheses; else HOLD. [FLOW-016, M-F]
  if (s.evidence_state === 'CONFLICTING_EVIDENCE') {
    const competing = new Set(s.competing_hypotheses || []);
    const r = first(tasks, done, t => t.validation_role === 'DIAGNOSTIC_CHECK' && t.is_resolution &&
      Array.isArray(t.hypotheses) && t.hypotheses.some(h => competing.has(h.id)));
    return r ? present(r, s, 'DIAGNOSTIC_NEED') : hold(s, 'CONFLICT_NO_RESOLVER', 'DIAGNOSTIC_NEED');
  }
  // Validated target: PT-08 lifecycle. An ACTIVE concern is never presented as a reached goal. [FLOW-040, INV-C2]
  if (s.validation_state === 'VALIDATED') {
    if (hasActiveConcern(s)) {
      const re = first(tasks, done, t => t.is_transfer_check);
      return re ? present(re, s, 'DIAGNOSTIC_NEED') : hold(s, 'CONCERN_NO_RECHECK', 'EVIDENCE_REVIEW');
    }
    const tr = first(tasks, done, t => t.is_transfer_check && !t.is_recheck_only);
    if (tr) return present(tr, s, 'ADVANCEMENT_REVIEW');
    return { action: 'GOAL_REACHED', policy_action: 'GOAL_REACHED', reasoning_state: 'GOAL_REACHED', focus: s.node_id, task: null,
      action_kind: null, target_preserved: null, returned: false, hold_reason: null };
  }
  if (s.practice_state === 'NOT_PRACTICED') {
    const p = first(tasks, done, t => t.validation_role === 'PRACTICE');
    if (p) return present(p, s, 'PRACTICE_NEED');
  }
  if (s.practice_state !== 'NOT_PRACTICED' && !ctx.diagnosticDone) {
    const d = first(tasks, done, isOrdinaryDiagnostic);
    if (d) return present(d, s, 'DIAGNOSTIC_NEED');
  }
  // Independent validation only on an item the ONE freshness function finds eligible — persisted exposure history,
  // not the round's done-list, governs (a new round never makes an exposed item fresh again). [H_c^(5) INV-V1/V2]
  const isValidation = (t) => t.validation_role === 'INDEPENDENT_VALIDATION';
  const fresh = (t) => evaluateValidationEligibility({ task: t, exposure: ctx.exposure, validationHistory: s.validation_history,
    currentPresentationId: ctx.currentPresentationId || null }).eligible;
  if (mayAdvance(s)) {
    const v = first(tasks, done, t => isValidation(t) && fresh(t));
    if (v) return present(v, s, 'VALIDATION_READINESS');
  }
  const more = first(tasks, done, t => t.validation_role === 'PRACTICE');
  if (more) return present(more, s, 'PRACTICE_NEED');
  if (mayAdvance(s) && tasks.some(isValidation) && !tasks.some(t => isValidation(t) && fresh(t)))
    return hold(s, 'VALIDATION_ITEM_ALREADY_USED', 'EVIDENCE_REVIEW');
  return hold(s, 'ROUND_EXHAUSTED');
}

export function selectNextAction(ctx) {
  const { focusState, prereq } = ctx;
  // Genuine REQUIRES backtrack: while the prerequisite's CURRENT evidence is insufficient, focus the prerequisite,
  // preserve the target, offer ONLY prerequisite practice (never validation). [FLOW-012, FLOW-016, B-1]
  if (prereq && prereq.requiresNodeId && !mayAdvance(prereq.prereqState)) {
    const t = first(prereq.prereqTasks, ctx.completed || new Set(), x => x.validation_role === 'PRACTICE');
    const extra = { focus: prereq.requiresNodeId, target_preserved: focusState.node_id, backtrack: true };
    return t ? { ...present(t, prereq.prereqState, 'REMEDIATION_NEED'), ...extra, action: 'BACKTRACK_TO_PREREQUISITE' }
             : { ...hold(prereq.prereqState, 'PREREQ_ROUND_EXHAUSTED'), ...extra };
  }
  const onTarget = selectOnTarget(ctx);
  // Prerequisite now sufficient while the previous step was on the prerequisite: an explicit RETURN decision. [FLOW-013]
  if (prereq && prereq.requiresNodeId && ctx.onPrereqFocus) return { ...onTarget, returned: true };
  return onTarget;
}
