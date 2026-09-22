# TNPO / MSVO Navigator
## Implementation Conformance Audit Specification v1.0 — FROZEN BEFORE EXECUTION

**Target:** TNPO/MSVO Navigator PWA v0.2 pilot build  
**Status:** FROZEN BEFORE IMPLEMENTATION-CONFORMANCE EXECUTION  
**Parent specifications:** Architecture Governance, Runtime Governance, Interface Governance, Pilot Preregistration, Consent/Withdrawal Addendum, Consent/Withdrawal Supplement

---

# 1. Purpose

This audit answers:

> Does the shipped PWA v0.2 faithfully implement the frozen specifications, without adding ungoverned learner-facing behavior?

It is a conformance audit, not a usability study and not a learning-efficacy study.

---

# 2. Two top-level engineering invariants

## CA-INV-01 — Learner-facing claim traceability

Every learner-facing claim, state, badge, warning, explanation, or status must trace to:
- an authoritative frozen rule;
- an authoritative runtime record;
- or an explicitly permitted rendering transformation.

No learner-facing semantic output may exist without a governed source.

## CA-INV-02 — State-transition traceability

Every state-changing action must trace to:
- an authorized transition;
- a governed policy decision;
- and an immutable event/provenance record.

No UI control, LLM output, learner self-report, or developer convenience path may mutate governed state directly unless explicitly authorized.

---

# 3. Bidirectional traceability requirement

The audit MUST run both directions.

## Forward traceability

For every frozen requirement:

`SPEC REQUIREMENT -> IMPLEMENTATION -> TEST / MANUAL CHECK -> RESULT`

Question:
> Is every specified rule actually implemented?

## Reverse traceability

For every distinct implemented learner-facing semantic behavior:

`IMPLEMENTED OUTPUT / STATE / BADGE / ACTION -> GOVERNING RULE -> AUTHORITATIVE RECORD / TRANSITION`

Question:
> Does every implemented behavior have a frozen rule behind it?

Reverse traceability includes, at minimum:
- learner-facing strings with semantic meaning;
- badges;
- evidence-state labels;
- progress states;
- warnings;
- task-role labels;
- retention messages;
- validation messages;
- learner-correction outcomes;
- navigation/backtracking states;
- consent/withdrawal messages;
- state-changing UI controls;
- policy-triggered prompts.

Purely decorative text, layout labels, accessibility labels, and nonsemantic visual chrome may be grouped, but any text that could change learner interpretation must be individually traceable or mapped to a governed template.

`FORWARD_PASS_ONLY != CONFORMANCE_PASS`

---

# 4. Audit domains

## Domain A — Architecture conformance

Verify:
- MSVO/TNPO authority boundaries;
- map-version integrity;
- ontology vs learning-graph separation;
- no unsupported prerequisite invention;
- no ungoverned module promotion;
- version identifiers correctly surfaced where required.

## Domain B — Runtime conformance

Verify:
- observation/evaluation/inference/decision separation;
- learner-state update authority;
- validation-role prospectivity;
- self-report as evidence, not command;
- event-ledger append-only behavior;
- preservation of historical validation;
- retention triggers;
- unknown/conflicting-evidence handling;
- no unauthorized direct mutation.

## Domain C — Interface conformance

Verify:
- deterministic provenance badges;
- evidence-state rendering;
- no certainty laundering;
- cyclic navigation shown honestly;
- practice/diagnostic/validation roles surfaced prospectively;
- no ungrounded mastery percentage;
- `Why this step?` reflects unresolved uncertainty when present;
- reverse traceability of every semantic learner-facing output.

## Domain D — Pilot / research-ethics conformance

Verify:
- voluntary-participation language;
- consent-understanding wording;
- consent check unscored;
- participant can stop at any time;
- withdrawal never becomes learner-state evidence;
- default data disposition implemented as specified;
- STOP-THE-LINE behavior;
- no audio/video capture unless separately authorized;
- participant IDs and data-minimization rules.

---

# 5. Audit method split

The audit is explicitly HYBRID.

## Automated checks

Use automated tests where behavior is deterministic and machine-verifiable.

Examples:
- record-type -> provenance-badge mapping;
- LLM cannot override badge type;
- self-report handler cannot directly set VALIDATED;
- practice cannot be retroactively relabeled as validation;
- historical validation cannot be deleted by later failure;
- retention warning requires authorized trigger;
- mastery percentage renderer is disabled absent governed scalar;
- event ledger append-only constraints;
- state-changing handlers require authorized transition;
- semantic-output registry entries all contain governing-rule IDs.

Automated tests must record:
- test ID;
- requirement ID;
- build hash;
- expected result;
- actual result;
- PASS/FAIL.

## Manual conformance review

Use human review where semantics, wording, or completeness cannot be reliably reduced to code assertions.

Examples:
- consent wording clearly says the check is not scored;
- `Why this step?` wording does not overstate uncertainty;
- backtracking explanation is understandable without implying failure;
- learner-facing phrase does not exceed runtime authority;
- all semantic strings/states are present in the reverse-traceability registry;
- withdrawal copy does not imply blame, penalty, or learner failure;
- UI wording matches the frozen evidence vocabulary.

Manual review must be performed against the frozen spec line by line, not by general impression.

## Dual-verification items

Some requirements require BOTH:
- automated enforcement; and
- manual rendering review.

Examples:
- provenance badges;
- evidence-state labels;
- task-role disclosure;
- retention messages;
- learner correction.

A mechanically correct state that is rendered misleadingly is a failure.

---

# 6. Semantic output inventory

Before audit execution, enumerate all learner-facing semantic outputs reachable in the build.

Each inventory item receives:
- `output_id`
- screen/component
- exact or templated text
- output category
- governing requirement ID
- source record type
- allowed evidence state(s)
- state-changing? YES/NO
- automated test ID if applicable
- manual review ID if applicable

No pilot build may freeze while an inventory item has:
- missing governing rule;
- missing source record;
- unclear authority;
- unresolved semantic classification.

---

# 7. Severity tiers

## BLOCKER — Pilot-build freeze prohibited

Any of the following is a BLOCKER:
- governance violation;
- untraceable learner-facing semantic claim;
- unauthorized state mutation;
- inference rendered as MAP FACT;
- practice relabeled as validation;
- self-report directly changes governed validation;
- historical validation rewritten;
- retention warning without authorized trigger;
- ungoverned mastery scalar shown;
- consent/withdrawal implementation contradicts frozen participant protections;
- missing provenance such that authorization cannot be reconstructed;
- reverse-traceability gap on a semantic output;
- any implementation behavior that materially exceeds frozen authority.

Required response:
- fix;
- version bump if build identity changed;
- rerun all directly affected tests;
- rerun full audit if shared infrastructure/authority boundaries changed.

## MAJOR — Must be fixed before pilot freeze

Examples:
- wording materially ambiguous but does not yet cross a hard governance boundary;
- a required explanation is omitted;
- a task role is technically correct but not surfaced prospectively enough;
- semantic output is traceable but rendering could induce the wrong interpretation;
- consent wording omits a required participant-facing clarification while underlying stop mechanics remain correct.

Required response:
- fix;
- targeted recheck;
- pilot build cannot freeze until cleared.

## MINOR — Log + fix-and-recheck; does not require full audit rerun by itself

Examples:
- nonsemantic wording inconsistency;
- spacing/layout issue;
- typo that does not alter meaning;
- cosmetic mismatch;
- redundant but accurate status text.

Required response:
- log;
- fix before pilot build freeze when practical;
- targeted recheck.

## OBSERVATION — No conformance failure

Examples:
- possible future UX improvement;
- optional wording simplification;
- enhancement request;
- feature idea not required by frozen v0.2 specification.

Observations may not be implemented into the pilot build unless they are nonsemantic/cosmetic or separately versioned and traced.

---

# 8. Audit pass/fail criteria

`IMPLEMENTATION_CONFORMANCE_PASS`

iff ALL are true:

1. `0 BLOCKER`
2. `0 unresolved MAJOR`
3. all frozen requirements have forward traceability
4. all semantic learner-facing outputs have reverse traceability
5. all required automated tests pass
6. all required manual checks pass
7. all dual-verification items pass both automated and manual review
8. build hash/version is recorded
9. traceability matrix is complete
10. no audit-time semantic change was silently introduced

MINOR findings may remain only if:
- explicitly documented;
- demonstrated nonsemantic;
- accepted before freeze;
- not capable of altering learner interpretation or state.

---

# 9. Re-audit policy

## Targeted recheck permitted

A targeted recheck is allowed when:
- change is isolated;
- dependency surface is known;
- no shared authority layer changed;
- no governing semantic rule changed.

## Full audit rerun required

Full rerun is required when changes affect:
- evidence-state logic;
- state-transition engine;
- event ledger;
- badge derivation;
- validation logic;
- retention logic;
- learner-correction authority;
- consent/withdrawal behavior;
- shared semantic renderer;
- map authority/version resolution;
- any component used by multiple audited domains.

---

# 10. Auditor role

The audit may be executed by:
- automated test harness;
- human reviewer;
- or the project owner assisted by a second reviewer/tool.

However:
- automated tests do not replace manual semantic review;
- manual review does not replace deterministic enforcement tests.

The final adjudication must distinguish:
- mechanically verified;
- manually verified;
- dual verified.

No item may be marked verified without identifying how it was checked.

---

# 11. Freeze sequence

Required sequence:

`BUILD v0.2`
-> `RECORD BUILD HASH`
-> `RUN CONFORMANCE AUDIT`
-> `FIX / RECHECK IF NEEDED`
-> `IMPLEMENTATION_CONFORMANCE_PASS`
-> `FREEZE PILOT BUILD`
-> `P01-P05`
-> `PILOT ADJUDICATION`

The pilot must not begin before the conformance pass.

---

# 12. Interpretation boundary

A conformance pass establishes:

> The tested build faithfully implements the frozen v0.2 specifications to the extent covered by this audit.

It does NOT establish:
- usability;
- learner comprehension;
- educational effectiveness;
- accessibility quality;
- population validity;
- Tutor MVC.

Those remain separate evidence lanes.

---

# 13. Freeze statement

`TNPO_IMPLEMENTATION_CONFORMANCE_AUDIT_SPEC_v1.0 = FROZEN`

`AUDIT_EXECUTION = NOT STARTED`

`PILOT_BUILD = NOT YET FROZEN`
