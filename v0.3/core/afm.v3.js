// TNPO/MSVO v0.3 — Audit Fixture Mode scenarios. [V03-AUDIT-010..015]
// Deterministic PREFLIGHT scenarios that drive the REAL evidence/render paths. AFM is clearly
// labeled, isolated (afm* stores), resettable, and can NEVER be a formal MAN pass.
import { makeInference } from './evidence.v3.js';

// A deterministic CONFLICTING_EVIDENCE inference: two live, separately supported, materially
// incompatible hypotheses. [V03-EVID-030]  (NOT mixed performance; a genuine competing set.)
export function conflictingInference(claim_id = 'AFM_TARGET') {
  const hyps = [
    { id: 'stable_misconception', label: 'a stable misconception', live: true, supported: true, support_refs: ['afm_e1'] },
    { id: 'transient_slip', label: 'a transient slip', live: true, supported: true, support_refs: ['afm_e2'] }
  ];
  return makeInference({ claim_id, hypotheses: hyps, incompatiblePairs: [['stable_misconception', 'transient_slip']], resolved: false, supportVolume: 2 });
}

// A deterministic INSUFFICIENT_EVIDENCE inference: sparse, single (or no) supported hypothesis.
export function insufficientInference(claim_id = 'AFM_TARGET') {
  return makeInference({ claim_id, hypotheses: [], incompatiblePairs: [], supportVolume: 0 });
}

export const AFM_SCENARIOS = [
  { id: 'AFM-CONFLICT', title: 'Conflicting evidence (preflight)', build: conflictingInference },
  { id: 'AFM-INSUFFICIENT', title: 'Insufficient evidence (preflight)', build: insufficientInference }
];
