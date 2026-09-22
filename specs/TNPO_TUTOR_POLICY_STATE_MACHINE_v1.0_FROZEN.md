# TNPO Tutor Policy State Machine
## v1.0 — FROZEN

**Status:** FROZEN BASELINE / STRUCTURE AND SEMANTICS

## 1. State/action separation

v0.2 separates persistent reasoning states from actions.

### Candidate reasoning states

- `GOAL_RESOLUTION`
- `MAP_AND_TARGET_RESOLUTION`
- `LEARNER_STATE_REVIEW`
- `DIAGNOSTIC_NEED`
- `INSTRUCTION_NEED`
- `PRACTICE_NEED`
- `EVIDENCE_REVIEW`
- `VALIDATION_READINESS`
- `REMEDIATION_NEED`
- `ADVANCEMENT_REVIEW`
- `HOLD_INSUFFICIENT_EVIDENCE`
- `HOLD_UNVALIDATED_REGION`
- `GOAL_REACHED`

### Candidate policy actions

- QUERY_MAP
- SELECT_DIAGNOSTIC_TASK
- DELIVER_INSTRUCTION
- SELECT_PRACTICE_TASK
- DELIVER_SCAFFOLD
- DELIVER_FEEDBACK
- SELECT_VALIDATION_TASK
- AUTHORIZE_REMEDIATION
- AUTHORIZE_ADVANCEMENT
- REQUEST_MORE_EVIDENCE
- REQUEST_USER_CLARIFICATION

`ADVANCE` and `REVALIDATE` are treated as actions/task roles rather than durable reasoning states.

## 2. Core guards

### Map integrity guard
No transition requiring a prerequisite closure is authorized when the relevant map/version is unresolved.

### Evidence sufficiency guard
No mastery/advancement decision is authorized from `INSUFFICIENT` or unresolved `CONFLICTING` evidence.

### Validation contamination guard
Validation requires prospectively declared:
- role;
- target claims;
- support policy;
- evidence model;
- exposure/freshness evaluation.

### Authority guard
LLM output may propose action but cannot directly authorize state mutation/certification.

### Loop guard
Repeated remediation/practice must accumulate new event/evidence records and can terminate in HOLD rather than loop indefinitely.

## 3. Transition skeleton

`GOAL_RESOLUTION -> MAP_AND_TARGET_RESOLUTION`

`MAP_AND_TARGET_RESOLUTION -> HOLD_UNVALIDATED_REGION`
if authoritative target cannot be resolved.

`MAP_AND_TARGET_RESOLUTION -> LEARNER_STATE_REVIEW`
if resolved.

`LEARNER_STATE_REVIEW -> DIAGNOSTIC_NEED`
when prerequisite/target evidence is absent/stale/conflicting.

`LEARNER_STATE_REVIEW -> INSTRUCTION_NEED`
when evidence supports an instructional target.

`DIAGNOSTIC_NEED -> EVIDENCE_REVIEW`
after diagnostic observation/evaluation.

`INSTRUCTION_NEED -> PRACTICE_NEED`
after instruction is delivered.

`PRACTICE_NEED -> EVIDENCE_REVIEW`
after practice evidence is recorded.

`EVIDENCE_REVIEW -> HOLD_INSUFFICIENT_EVIDENCE`
when no justified next inference exists.

`EVIDENCE_REVIEW -> REMEDIATION_NEED`
when evidence supports a remediable gap.

`EVIDENCE_REVIEW -> VALIDATION_READINESS`
when independent validation is warranted.

`VALIDATION_READINESS -> EVIDENCE_REVIEW`
after validation result is recorded.

`REMEDIATION_NEED -> PRACTICE_NEED`
after a remediation action is delivered.

`EVIDENCE_REVIEW -> ADVANCEMENT_REVIEW`
when validation/evidence policy permits.

`ADVANCEMENT_REVIEW -> LEARNER_STATE_REVIEW`
if another target remains.

`ADVANCEMENT_REVIEW -> GOAL_REACHED`
if the declared goal is satisfied.

## Freeze boundary

This v1.0 freezes:
- record/component identities and semantic ownership;
- required provenance/version references;
- separation invariants;
- authority boundaries relevant to this component.

This v1.0 does **not** freeze:
- universal mastery thresholds;
- statistical estimator choice;
- universal retention interval;
- universal task-difficulty calibration;
- model-specific probability cutoffs;
- domain-specific scoring rubrics.

Those require later policy/test preregistration.

`v1.0 = FROZEN`

Future changes require a separately versioned revision. Historical v1.0 semantics remain preserved.
