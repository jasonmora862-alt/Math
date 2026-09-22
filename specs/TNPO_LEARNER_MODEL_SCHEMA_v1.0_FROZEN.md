# TNPO Learner Model
## Schema v1.0 — FROZEN

**Status:** FROZEN BASELINE / STRUCTURE AND SEMANTICS

## 1. Unit of state

The primary unit is a learner-specific claim about a map target:

```text
LearnerClaimState
    learner_id
    map_id
    map_version
    target_id
    profile
    instructional_exposure_state
    practice_state
    validation_state
    retention_state
    evidence_sufficiency
    model_uncertainty
    last_evidence_at
    last_independent_validation_at
    evidence_refs[]
    progression_refs[]
    self_report_refs[]
    state_version
    inference_model_version
```

## 2. Orthogonal-state rule

Do not compress:
- instructional exposure;
- practice;
- validation;
- retention;
- evidence sufficiency

into one overloaded mastery status.

A learner can be:
`PRACTICED + NOT_VALIDATED + SUFFICIENT_EVIDENCE_FOR_NEXT_PRACTICE_DECISION`

without contradiction.

## 3. Self-report

Learner self-report remains referenced but not merged into performance evidence.

`SELF_REPORT != PERFORMANCE_EVIDENCE`

## 4. History

Every state transition references evidence and prior state.

`STATE_UPDATE != HISTORY_REWRITE`

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
