# TNPO Task Model
## Schema v1.0 — FROZEN

**Status:** FROZEN BASELINE / STRUCTURE AND SEMANTICS

```text
TaskRecord
    task_id
    task_version
    domain_map_id
    domain_map_version
    target_claim_ids[]
    required_task_capabilities[]
    observable_ids[]
    response_format
    task_family
    template_id?
    content_context
    representation_modes[]
    support_policy
    tool_policy
    time_policy
    scoring_model_ref
    evidence_model_ref
    validation_role
    generator_provenance
    difficulty_calibration_refs[]
    transfer_characteristics?
    accessibility_attributes[]
```

## Changes from v0.1

`exposure_class` was removed.

Reason:
exposure is learner-task relational state and now belongs in `LearnerTaskExposure`.

`difficulty_estimate` became `difficulty_calibration_refs[]`.

Reason:
difficulty may depend on population, learner, representation, support and context rather than being one intrinsic scalar.

## Invariants

- validation role fixed before response;
- task requirement != universal domain prerequisite;
- task target != demonstrated competency;
- task ID change != evidence independence;
- difficulty calibration requires context/provenance.

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
