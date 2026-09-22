# TNPO Runtime Schema & Policy Freeze
## Version 1.0

**Status:** FROZEN BEFORE CORE-WAVE EXECUTION

## 1. Frozen components

- Learner Model Schema v1.0
- Learner–Task Exposure Schema v1.0
- Task Model Schema v1.0
- Evidence / Assessment Model Schema v1.0
- Observation / Event Ledger Schema v1.0
- Tutor Policy State Machine v1.0

## 2. Why this freeze occurs now

The four-evaluation gate, branch freeze, module cross-layer resolution, and v0.2 runtime audit are complete.

The runtime structures are sufficiently normalized to support controlled synthetic Core-Wave execution.

## 3. Frozen cross-component rules

1. `OBSERVATION != EVALUATION != INFERENCE != DECISION`
2. `STATE_UPDATE != HISTORY_REWRITE`
3. `TASK != LEARNER-TASK EXPOSURE`
4. `TASK TARGET != DEMONSTRATED CLAIM`
5. `ASSISTED PERFORMANCE != INDEPENDENT VALIDATION`
6. `NEW TASK ID != FRESH VALIDATION`
7. `EVIDENCE COUNT != INDEPENDENT EVIDENCE COUNT`
8. `LLM PROPOSAL != AUTHORIZATION`
9. `VALIDATION ROLE IS PROSPECTIVE`
10. `UNKNOWN / INSUFFICIENT_EVIDENCE` is a legal runtime outcome.

## 4. What remains unfrozen

- 102 active pedagogical module candidates;
- module-level effect claims;
- domain-specific rubrics;
- mastery thresholds;
- exact evidence aggregation statistics;
- future model choice;
- model-training procedure.

## 5. Execution permission

This freeze authorizes:

`SYNTHETIC CORE-WAVE COMPONENT/RED-TEAM EXECUTION`

It does **not** authorize:
- claiming real learner effectiveness;
- claiming Tutor MVC from synthetic-only evidence;
- dedicated model training.

## 6. Freeze

`TNPO_RUNTIME_SCHEMA_POLICY_v1.0 = FROZEN`
