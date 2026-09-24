// TNPO/MSVO v0.3 — Ordinary conflict-diagnostic mini-session. [AT-030 organic, V03-EVID-030..033]
// Produces CONFLICTING_EVIDENCE through the normal governed path ONLY when the learner's own
// probe responses separately signature-match >=2 materially incompatible, internally-consistent
// hypotheses about the SAME inferential question. A response that matches no hypothesis signature
// supports nothing — so mixed correct/incorrect performance alone can NEVER create conflict.
import { makeObservation, makeEvaluation, makeInference } from './evidence.v3.js';

// Evaluate one probe response. `supported` = the hypotheses whose exact predicted answer matches.
export function evaluateProbe(sessionTask, probe, response, { learner_id = 'LOCAL', timestamp } = {}) {
  const key = String(response).trim();
  const supported = (probe.signatures && probe.signatures[key]) ? probe.signatures[key].slice() : [];
  const observation = makeObservation({ learner_id, task_id: `${sessionTask.task_id}:${probe.probe_id}`, task_version: sessionTask.task_version, response_artifact: key, timestamp });
  const evaluation = makeEvaluation({ observation_id: observation.observation_id, evaluator_id: 'GOV_EVAL_v0.3', evaluator_version: '0.3', rubric_version: 'conflict_signature', scored_features: { response: key, supported_hypotheses: supported }, timestamp });
  return { supported, observation, evaluation };
}

// Combine the mini-session's per-probe evaluations into one governed INFERENCE.
// Each hypothesis keeps its OWN support provenance (the evaluation_ids that signature-matched it).
// CONFLICTING only when deriveEvidenceState finds >=2 live, separately supported, incompatible ones.
export function combineConflictInference(sessionTask, probeEvaluations, { resolved = false, timestamp } = {}) {
  // probeEvaluations: [{ evaluation_id, supported: [hypId,...] }]
  const support = new Map();  // hypId -> [evaluation_id,...]
  for (const pe of probeEvaluations) for (const h of (pe.supported || [])) {
    if (!support.has(h)) support.set(h, []);
    support.get(h).push(pe.evaluation_id);
  }
  const hypotheses = (sessionTask.hypotheses || []).map(h => ({
    id: h.id, label: h.label, live: true,
    supported: support.has(h.id), support_refs: support.get(h.id) || []
  }));
  const inference = makeInference({
    claim_id: sessionTask.task_id,
    evidence_refs: probeEvaluations.map(pe => pe.evaluation_id),
    hypotheses, incompatiblePairs: sessionTask.incompatible_pairs || [],
    resolved, supportVolume: probeEvaluations.length, timestamp
  });
  return { inference, hypotheses };
}

// Evidence-driven resolution [M1, M-A, V03-EVID-032]. Exit CONFLICTING ONLY when the NEW resolution
// evidence supports exactly one of the prior competing hypotheses and the other(s) are no longer
// separately supported. Arbitrary completion of a "resolution task" is never sufficient; matching neither
// hypothesis stays unresolved (CONFLICTING re-asserted). Resolving the conflict REMOVES the competition; it
// does NOT create forward evidence — the resolved inference carries the authority that existed BEFORE the
// conflict (`preConflictEvidence`), never higher. Prior evidence/history is untouched (append-only elsewhere).
export function resolveConflictInference(priorCompeting, resolutionEvals, sessionTask, { timestamp, preConflictEvidence = 'INSUFFICIENT_EVIDENCE' } = {}) {
  const support = new Map();
  for (const pe of resolutionEvals) for (const h of (pe.supported || [])) {
    if (!support.has(h)) support.set(h, []); support.get(h).push(pe.evaluation_id);
  }
  const supportedPrior = (priorCompeting || []).filter(h => support.has(h));
  if (supportedPrior.length === 1) {
    // one competing hypothesis is now supported by fresh evidence; the other(s) no longer separately
    // supported -> resolved. Authority returns to the pre-conflict level (SUPPORTED/ESTABLISHED preserved;
    // INSUFFICIENT stays INSUFFICIENT — resolution never manufactures a forward upgrade). [M-A]
    const id = supportedPrior[0];
    const restored = (preConflictEvidence === 'SUPPORTED_NOT_ESTABLISHED' || preConflictEvidence === 'ESTABLISHED')
      ? preConflictEvidence : 'INSUFFICIENT_EVIDENCE';
    const hyps = [{ id, label: id, live: true, supported: true, support_refs: support.get(id) }];
    const inference = makeInference({ claim_id: sessionTask.task_id, evidence_refs: resolutionEvals.map(e => e.evaluation_id),
      hypotheses: hyps, incompatiblePairs: [], resolved: true, supportVolume: 1, timestamp });
    inference.evidence_state = restored;           // restored authority, not a fabricated SUPPORTED
    inference.competing_hypotheses = [];
    inference.resolved_to = id;
    inference.uncertainty = restored === 'INSUFFICIENT_EVIDENCE' ? 'not-enough-evidence' : null;
    return { resolved: true, resolvedTo: id, restoredTo: restored, inference };
  }
  // unresolved: re-assert the prior conflict (fresh evidence did not disambiguate)
  const hyps = (priorCompeting || []).map(id => ({ id, label: id, live: true, supported: true, support_refs: ['prior:' + id] }));
  const inference = makeInference({ claim_id: sessionTask.task_id, evidence_refs: resolutionEvals.map(e => e.evaluation_id),
    hypotheses: hyps, incompatiblePairs: (priorCompeting || []).length >= 2 ? [[priorCompeting[0], priorCompeting[1]]] : [],
    resolved: false, supportVolume: (priorCompeting || []).length, timestamp });
  return { resolved: false, resolvedTo: null, restoredTo: 'CONFLICTING_EVIDENCE', inference };  // stays CONFLICTING (>=2 competing)
}

// Human-readable labels for competing hypotheses (for Why this step?).
export function hypothesisLabels(sessionTask, ids) {
  const byId = new Map((sessionTask.hypotheses || []).map(h => [h.id, h.label]));
  return (ids || []).map(id => byId.get(id) || id);
}
