# TNPO / MSVO Rendered-Device Protocol v1.1 — Change Record

**Status:** FROZEN BEFORE DEVICE REVIEW  
**Runtime:** v0.2.0  
**Runtime SHA-256:** `5ffb351b599934a496f5def7a0f62e8a8e78ab08e62cfc7ebb3cffbae251d2a0`

## Reason for revision

v1.0 correctly required an independent cold reviewer for MAN-001, but it did not explicitly require that reviewer to reach the uncertainty states with the ordinary topic/task context a real learner would have accumulated in-session. That left a possible confound between:

- genuinely ambiguous uncertainty wording; and
- confusion created only by presenting the state without its normal learner context.

## Change made

MAN-001 now requires contextual entry through a short learner-facing mini-session. R1 may provide neutral navigation help only and may not define, contrast, paraphrase, or hint at the intended uncertainty categories before scoring. The context must come from the learner-facing runtime rather than reviewer-authored explanation.

The audit record now captures protocol version and a MAN-001 context/case reference.

## Unchanged

- runtime code;
- runtime version;
- runtime hash;
- MAN-001 substantive PASS / FAIL_MAJOR / FAIL_BLOCKER semantic thresholds;
- MAN-002 through MAN-007 pass/fail criteria;
- R2 exclusion from P01–P05;
- 7/7 PASS requirement for pilot-build freeze.

## Sequencing declaration

`V1.1_FROZEN_BEFORE_FIRST_DEVICE_REVIEW = TRUE`

`V1.0_PRESERVED_UNCHANGED = TRUE`

`RUNTIME_REBUILD_REQUIRED = FALSE`
