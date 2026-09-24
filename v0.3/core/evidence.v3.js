// TNPO/MSVO v0.3 — Evidence layer
// Frozen chain: OBSERVATION -> EVALUATION -> INFERENCE -> DECISION  (four DISTINCT record types)
// [V03-EVID-020/021, V03-GOV-014]  and the CONFLICTING_EVIDENCE trigger [V03-EVID-030..033, B6, v1.2.1 E2].

export const BUILD_VERSION = '0.3.0';

// ---- Evidence-state presentation (INSUFFICIENT != CONFLICTING wording) [V03-GOV-008] ----
export const EVIDENCE_STATES = Object.freeze({
  ESTABLISHED: { code: 'ESTABLISHED', label: 'Established',
    description: 'This displayed claim is authoritative for its stated scope.' },
  SUPPORTED_NOT_ESTABLISHED: { code: 'SUPPORTED_NOT_ESTABLISHED', label: 'Supported, not established',
    description: 'Current evidence can support a reversible next step, but does not establish independent validation.' },
  CONFLICTING_EVIDENCE: { code: 'CONFLICTING_EVIDENCE', label: 'Conflicting evidence',
    description: 'Meaningful evidence currently supports at least two materially incompatible interpretations.' },
  INSUFFICIENT_EVIDENCE: { code: 'INSUFFICIENT_EVIDENCE', label: 'Insufficient evidence',
    description: 'Current evidence is not adequate to license the stronger inference yet.' }
});
export function evidencePresentation(code) {
  return EVIDENCE_STATES[code] || EVIDENCE_STATES.INSUFFICIENT_EVIDENCE;
}

// ---- Record types (the four are DISTINCT; there is no EVALUATION provenance badge, but an
//      EVALUATION record is NEVER relabelled as OBSERVATION or INFERENCE) [V03-EVID-020/021] ----
export const RECORD_TYPES = Object.freeze(['OBSERVATION', 'EVALUATION', 'INFERENCE', 'DECISION']);
// Learner-facing provenance badges (no EVALUATION badge by design).
export const PROVENANCE_BADGES = Object.freeze({
  MAP_RECORD: 'MAP FACT', OBSERVATION: 'OBSERVATION', INFERENCE: 'INFERENCE', DECISION: 'DECISION'
});
export function badgeForRecordType(t) { return PROVENANCE_BADGES[t] || null; }

let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

// An OBSERVATION record (what happened / was reported). [Evidence Model]
export function makeObservation({ learner_id, task_id, task_version, response_artifact, support_used = [], tool_use = [], timestamp }) {
  return { record_type: 'OBSERVATION', observation_id: uid('obs'), learner_id, task_id, task_version,
    response_artifact, support_used, tool_use, timestamp: timestamp || new Date().toISOString() };
}

// An EVALUATION record — evidence, NOT truth. Its own record type & authority. [V03-EVID-020, V03-GOV-014]
export function makeEvaluation({ observation_id, evaluator_id, evaluator_version, rubric_version, scored_features = {}, error_observations = [], evaluator_uncertainty = null, timestamp }) {
  return { record_type: 'EVALUATION', evaluation_id: uid('eval'), observation_id, evaluator_id,
    evaluator_version, rubric_version, scored_features, error_observations, evaluator_uncertainty,
    timestamp: timestamp || new Date().toISOString() };
}

// ---- CONFLICTING_EVIDENCE trigger [V03-EVID-030..033 / B6 / v1.2.1 E2] ----
// A "live hypothesis" here = { id, label, supported: true, support_refs:[...>=1 evidence ref] }.
// Two hypotheses are "materially incompatible" only when explicitly declared incompatible
// (never inferred from mere label difference [V03-EVID-033]).
//
// CONFLICTING_EVIDENCE is permitted IFF:
//   there exist >= 2 hypotheses that are (a) live, (b) each separately supported,
//   (c) pairwise materially incompatible for the current inferential question, and
//   (d) not yet resolved by available evidence.
// Mixed performance, ambiguity, low volume, or a single supported hypothesis are NOT sufficient. [V03-EVID-031]
export function qualifiesConflicting(hypotheses = [], { incompatiblePairs = [], resolved = false } = {}) {
  if (resolved) return false;                                   // [V03-EVID-032] resolved -> may exit
  const live = hypotheses.filter(h => h && h.live !== false && h.supported === true &&
    Array.isArray(h.support_refs) && h.support_refs.length >= 1);
  if (live.length < 2) return false;                            // needs >=2 separately supported live
  const liveIds = new Set(live.map(h => h.id));
  // material incompatibility must be explicitly declared between two LIVE supported hypotheses
  const hasIncompatiblePair = incompatiblePairs.some(([a, b]) =>
    a !== b && liveIds.has(a) && liveIds.has(b));
  return hasIncompatiblePair;
}

// Derive the evidence_state for an inference from its hypothesis set + support volume.
// Returns { code, competing_hypotheses } for building an INFERENCE record.
export function deriveEvidenceState({ hypotheses = [], incompatiblePairs = [], resolved = false, supportVolume = 0, priorEstablished = false } = {}) {
  if (qualifiesConflicting(hypotheses, { incompatiblePairs, resolved })) {
    const live = hypotheses.filter(h => h && h.live !== false && h.supported === true);
    return { code: 'CONFLICTING_EVIDENCE', competing_hypotheses: live.map(h => h.id) };
  }
  if (priorEstablished && !resolved) return { code: 'ESTABLISHED', competing_hypotheses: [] };
  const supported = hypotheses.filter(h => h && h.supported === true &&
    Array.isArray(h.support_refs) && h.support_refs.length >= 1);
  // Exactly-one supported hypothesis with adequate support => SUPPORTED; else INSUFFICIENT.
  if (supported.length >= 1 && supportVolume >= 1) return { code: 'SUPPORTED_NOT_ESTABLISHED', competing_hypotheses: [] };
  return { code: 'INSUFFICIENT_EVIDENCE', competing_hypotheses: [] };   // sparse / no competition [V03-EVID-031]
}

// An INFERENCE record (a conclusion drawn from evidence; may remain uncertain).
export function makeInference({ claim_id, evidence_refs = [], hypotheses = [], incompatiblePairs = [], resolved = false, supportVolume = 0, priorEstablished = false, timestamp }) {
  const { code, competing_hypotheses } = deriveEvidenceState({ hypotheses, incompatiblePairs, resolved, supportVolume, priorEstablished });
  return { record_type: 'INFERENCE', inference_id: uid('inf'), claim_id, evidence_refs,
    evidence_state: code, competing_hypotheses,
    uncertainty: code === 'CONFLICTING_EVIDENCE' ? 'competing-supported-interpretations'
      : code === 'INSUFFICIENT_EVIDENCE' ? 'not-enough-evidence' : null,
    timestamp: timestamp || new Date().toISOString() };
}

// A DECISION record (governed authorization of an action). Evidence never executes its own decision.
export function makeDecision({ prior_state_ref, inference_refs = [], policy_version, authorized_action, resulting_state_ref = null, timestamp }) {
  return { record_type: 'DECISION', decision_id: uid('dec'), prior_state_ref, inference_refs,
    policy_version, authorized_action, resulting_state_ref, timestamp: timestamp || new Date().toISOString() };
}
