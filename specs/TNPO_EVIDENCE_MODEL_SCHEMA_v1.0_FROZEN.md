# TNPO Evidence / Assessment Model
## Schema v1.0 — FROZEN

**Status:** FROZEN BASELINE / STRUCTURE AND SEMANTICS

Frozen chain:

`OBSERVATION -> EVALUATION -> INFERENCE -> DECISION`

## Observation

```text
Observation
    observation_id
    learner_id
    task_id
    task_version
    response_artifact_ref
    timestamp
    support_used[]
    retries
    tool_use[]
    exposure_record_ref
    tutor_action_refs[]
```

## Evaluation

```text
Evaluation
    evaluation_id
    observation_id
    evaluator_id
    evaluator_version
    rubric_version
    scored_features{}
    error_observations[]
    evaluator_uncertainty
    evaluator_independence_metadata
```

## Inference

```text
Inference
    inference_id
    claim_id
    evidence_refs[]
    dependency_groups[]
    inference_model_version
    support_direction
    evidence_sufficiency
    uncertainty
    competing_hypotheses[]
```

## Decision

```text
Decision
    decision_id
    prior_state_ref
    inference_refs[]
    policy_version
    authorized_action
    resulting_state_ref?
```

## Invariants

- evaluator output is evidence, not truth;
- observed error != error cause;
- dependence groups must be preserved;
- ambiguous/conflicting inference is legal;
- evidence does not execute its own decision.

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
