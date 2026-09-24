// TNPO/MSVO v0.3 — Task engine. [V03-TASK-001..016]
// Loads GPCS tasks, enforces role-before-response + support policy, and runs a DETERMINISTIC
// governed evaluator producing OBSERVATION -> EVALUATION -> INFERENCE records.
import { makeObservation, makeEvaluation, makeInference } from './evidence.v3.js';

export const TASK_ROLES = Object.freeze({
  PRACTICE: { code: 'PRACTICE', label: 'Practice', preface: 'Hints or support may be used. This task does not independently validate the topic.' },
  DIAGNOSTIC_CHECK: { code: 'DIAGNOSTIC_CHECK', label: 'Diagnostic check', preface: 'This gathers evidence to distinguish explanations. It is not an independent validation task.' },
  INDEPENDENT_VALIDATION: { code: 'INDEPENDENT_VALIDATION', label: 'Independent validation', preface: 'No hints or outside help. A governed evaluator may use the result as validation evidence.' }
});
export function rolePreface(role) { return (TASK_ROLES[role] || {}).preface || null; }

// A TaskRecord is valid iff it declares identity+version, role (before response), response_format,
// support/tool policy, provenance, and evidence/scoring refs. [V03-TASK-002..008]
export function validateTask(t) {
  const req = ['task_id', 'task_version', 'validation_role', 'response_format', 'support_policy', 'tool_policy', 'generator_provenance', 'evidence_model_ref', 'scoring_model_ref'];
  const missing = req.filter(k => t[k] === undefined || t[k] === null);
  if (missing.length) return { ok: false, missing };
  if (!TASK_ROLES[t.validation_role]) return { ok: false, missing: ['valid validation_role'] };
  return { ok: true, missing: [] };
}

// Deterministic governed scoring. Returns boolean `correct`.
function score(task, response) {
  switch (task.scoring_model_ref) {
    case 'exact_integer': return Number(response) === Number(task.answer);
    case 'exact_boolean': {
      const s = String(response).trim().toLowerCase();
      const v = ['yes', 'true', 'y', 't', '1'].includes(s) ? true : ['no', 'false', 'n', 'f', '0'].includes(s) ? false : null;
      return v === task.answer;
    }
    default: throw new Error(`Unknown scoring_model_ref: ${task.scoring_model_ref}`);
  }
}

// Evaluate a learner response through the governed chain. Does NOT mutate learner state.
// support_used reflects whether the learner used help (relevant for validation contamination guard).
export function evaluateResponse(task, response, { learner_id = 'LOCAL', support_used = false, timestamp } = {}) {
  const correct = score(task, response);
  const observation = makeObservation({ learner_id, task_id: task.task_id, task_version: task.task_version, response_artifact: String(response), support_used: support_used ? ['support'] : [], timestamp });
  const evaluation = makeEvaluation({ observation_id: observation.observation_id, evaluator_id: task.evaluator_id || 'GOV_EVAL_v0.3', evaluator_version: '0.3', rubric_version: task.scoring_model_ref, scored_features: { correct }, error_observations: correct ? [] : ['incorrect_response'], timestamp });
  // A single graded task supports at most ONE interpretation -> never CONFLICTING by itself. [V03-EVID-031]
  const hypotheses = correct ? [{ id: 'competent_here', label: 'competent on this item', live: true, supported: true, support_refs: [evaluation.evaluation_id] }] : [];
  const inference = makeInference({ claim_id: task.task_id, evidence_refs: [evaluation.evaluation_id], hypotheses, incompatiblePairs: [], supportVolume: correct ? 1 : 0, timestamp });
  return { correct, observation, evaluation, inference };
}

// LEARNER_DISPLAY_PROMPT — the ONE source of the question text a learner is shown (rendered by the app, persisted with
// the presentation and the OBSERVATION, quoted by Why). The internal `inferential_question` is never displayed.
// [H_c^(5) INV-F4; V03-GOV-010 / AT-048]
export function learnerDisplayPrompt(task, probe = null) {
  if (!task) return null;
  if (probe) return probe.prompt || null;
  return task.prompt || null;
}

// GPCS accessors over an injected content object (env-agnostic; loader handles fetch/read).
export function makeTaskEngine(gpcs, slice = null) {
  const targets = gpcs.targets;
  const taskIndex = new Map();
  for (const tg of targets) for (const t of tg.tasks) taskIndex.set(t.task_id, { ...t, target_id: tg.target_id, node_id: tg.node_id });
  if (slice) for (const t of (slice.slice_tasks || [])) taskIndex.set(t.task_id, { ...t, domain_map_id: slice.domain_map_id });
  return {
    targets,
    listTargets: () => targets.map(t => ({ target_id: t.target_id, node_id: t.node_id, title: t.title })),
    tasksForTarget: (target_id) => (targets.find(t => t.target_id === target_id)?.tasks || []),
    getTask: (task_id) => taskIndex.get(task_id) || null,
    slice
  };
}
