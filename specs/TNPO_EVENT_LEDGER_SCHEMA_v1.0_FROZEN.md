# TNPO Observation / Event Ledger
## Schema v1.0 — FROZEN

**Status:** FROZEN BASELINE / STRUCTURE AND SEMANTICS

```text
Event
    event_id
    session_id
    learner_id
    event_type
    timestamp
    actor
    object_refs[]
    payload_ref
    architecture_version
    policy_version
    map_versions[]
    provenance
    prior_event_refs[]
```

## Event families

### Goal / map
- GOAL_DECLARED
- MAP_QUERIED
- MAP_RESOLUTION_RESULT

### Instruction
- PEDAGOGICAL_ACTION_PROPOSED
- PEDAGOGICAL_ACTION_AUTHORIZED
- PEDAGOGICAL_ACTION_DELIVERED

### Task / response
- TASK_SELECTED
- TASK_ROLE_FROZEN
- TASK_PRESENTED
- LEARNER_RESPONSE
- TOOL_USED
- HINT_GIVEN
- SCAFFOLD_GIVEN
- FEEDBACK_GIVEN

### Evidence / state
- EVALUATION_CREATED
- INFERENCE_CREATED
- DECISION_AUTHORIZED
- STATE_TRANSITION

### Validation
- VALIDATION_STARTED
- VALIDATION_RESULT
- EXPOSURE_UPDATED

## Invariants

- append-only;
- event identity/version preserved;
- provenance supports reconstruction of validation leakage/exposure;
- proposal and authorization are separate events where governance matters.

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
