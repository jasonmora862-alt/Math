# TNPO / MSVO Navigator v0.2
## Rendered-Device Manual Conformance Protocol v1.1 — FROZEN BEFORE DEVICE REVIEW

**Target runtime build:** `v0.2.0`  
**Target runtime SHA-256:** `5ffb351b599934a496f5def7a0f62e8a8e78ab08e62cfc7ebb3cffbae251d2a0`  
**Status:** FROZEN BEFORE MANUAL / DEVICE EXECUTION

This protocol supplements the frozen implementation-conformance audit. It does not modify the runtime build or its hash.

**Revision boundary:** v1.1 supersedes v1.0 for the first rendered-device execution. The v1.0 artifact is preserved unchanged as the prior frozen protocol. v1.1 changes only the MAN-001 review setup and the matching R2 instruction/evidence-record rule so that semantic clarity is tested with ordinary learner context rather than a decontextualized screen. MAN-002 through MAN-007 pass/fail criteria are unchanged.

`RUNTIME_CHANGE = NO`  
`RUNTIME_HASH_CHANGE = NO`  
`DEVICE_REVIEW_STARTED_BEFORE_V1.1_FREEZE = NO`

---

# 1. Reviewer roles

## R1 — Device/conformance reviewer

R1 runs the exact hash-pinned build on the intended iPhone and executes MAN-001 through MAN-007.

R1 may know the specification. Their job is primarily conformance and device-behavior verification.

## R2 — Cold semantic reviewer

R2 must:
- be an adult;
- not be one of Pilot-01 participants P01–P05;
- not read the TNPO/MSVO governance documents before review;
- receive only the learner-facing interaction/context that an ordinary first-use learner would encounter, plus neutral navigation instructions;
- receive no explanation, category definition, contrast, or hint about the intended meaning of `CONFLICTING_EVIDENCE` versus `INSUFFICIENT_EVIDENCE` before scoring.

R2 is **required** for MAN-001 and MAN-006, because those checks are especially vulnerable to an author reading intended meaning into ambiguous language.

R2 is **recommended** for MAN-003, MAN-004, and MAN-005.

No demographic or learner-performance inference is drawn from R2. This is an implementation review, not Pilot 01.

---

# 2. General adjudication rule

Each MAN check receives exactly one result:

- `PASS`
- `FAIL_MAJOR`
- `FAIL_BLOCKER`
- `NOT_RUN`

A rendered-device conformance pass requires:

`MAN-001 ... MAN-007 = PASS`

No averaging is allowed. A failure on one check is not canceled by passes elsewhere.

If a runtime-semantic change is required to fix a failure, the build hash changes and the affected automated/conformance checks must be rerun under the frozen re-audit policy.

---

# 3. Frozen pass/fail criteria

## MAN-001 — Uncertainty wording

**Requirements:** UIG-01 / UIG-03 / UIG-12

### Setup
Render at least:
1. one `CONFLICTING_EVIDENCE` case; and
2. one `INSUFFICIENT_EVIDENCE` case.

For **R2**, each case must be reached through a short, believable learner-facing mini-session that supplies the topic/task context a real learner would ordinarily have before seeing the uncertainty state. Do **not** test MAN-001 by presenting an isolated uncertainty screen with its preceding learner context removed.

The contextual-entry procedure is frozen as follows:
- use ordinary learner-facing content already available in the runtime;
- provide only the minimum prior interaction needed to make the current task/evidence intelligible;
- where practicable, keep the general topic/task framing comparable across the two uncertainty cases so context difficulty itself is not the main changing variable;
- R1 may give neutral navigation instructions only;
- R1 may not name, define, paraphrase, contrast, or hint at the hidden semantic distinction being tested;
- the mini-session may not contain reviewer-authored explanatory text that is absent from the learner-facing runtime;
- score R2's interpretation only after the state is reached through that ordinary context.

This rule is intended to distinguish **semantic ambiguity in the rendered wording** from **artificial confusion caused by stripping away context a real learner would possess**. It does not permit coaching or governance-document briefing.

### PASS iff all are true

R1 verifies:
- `CONFLICTING_EVIDENCE` describes materially incompatible supported interpretations rather than merely saying “we are unsure”;
- `INSUFFICIENT_EVIDENCE` describes inadequate/absent/stale evidence rather than implying a conflict that is not present;
- neither screen turns an unresolved inference into a definitive learner diagnosis;
- `Why this step?` names the next evidence-gathering/diagnostic action without inventing a single proven cause.

R2, after viewing the two screens without governance-document briefing, can correctly state in ordinary language that:
- one case has evidence pulling toward competing interpretations; and
- the other case simply does not have enough evidence yet.

### FAIL_BLOCKER
- UI states a definitive diagnosis unsupported by runtime authority; or
- conflicting evidence is presented as established fact.

### FAIL_MAJOR
- underlying state is correct, but the rendered wording fails to distinguish conflict from insufficiency for R2.

---

## MAN-002 — Provenance badge integrity in the rendered UI

**Requirement:** UIG-02

### Setup
Render one example of each:
- `MAP FACT`
- `OBSERVATION`
- `INFERENCE`
- `DECISION`

### PASS iff all are true
- displayed label exactly matches deterministic record-type mapping;
- badge is legible at normal phone viewing size;
- badge meaning does not rely on color alone—the textual label remains present;
- no badge is clipped, overlapped, or visually attached to the wrong claim;
- the source record inspected for each rendered item matches the badge.

### FAIL_BLOCKER
Any claim is rendered with the wrong provenance type.

### FAIL_MAJOR
Mapping is correct in code but rendered placement makes the badge reasonably attributable to the wrong statement.

---

## MAN-003 — Cyclic prerequisite backtracking

**Requirement:** UIG-06

### Setup
Render a governed transition from target `B` to prerequisite focus `A`.

### PASS iff all are true
The screen visibly communicates:
- current focus is now `A`;
- intended target `B` is still preserved;
- why the focus changed, at no stronger certainty than runtime evidence permits;
- what condition allows return to `B`;
- no “failure”, “reset”, “lost progress”, or equivalent blame framing unless separately supported.

If R2 is used, R2 can answer:
1. “What are you working on right now?” → A;
2. “What is the original goal?” → B;
3. “Did the system erase your progress?” → No.

### FAIL_BLOCKER
Backtracking rewrites learner history/state or falsely reports a governed failure.

### FAIL_MAJOR
State is correct but the rendered UI makes the navigation appear arbitrary or like a permanent reset.

---

## MAN-004 — Practice / diagnostic / validation roles are prospectively distinct

**Requirement:** UIG-07

### Setup
Open one task of each role **before answering**:
- PRACTICE
- DIAGNOSTIC CHECK
- INDEPENDENT VALIDATION

### PASS iff all are true
- role label is visible before response;
- role is expressed in text, not only by color/icon;
- validation screen states applicable support restriction before response;
- practice with hints does not visually imply certification;
- diagnostic wording does not imply that the probe itself proves a diagnosis.

If R2 is used, R2 can identify before answering:
- which task may allow support/hints;
- which task is intended to gather diagnostic evidence;
- which task may contribute to independent validation.

### FAIL_BLOCKER
A task role is retrospectively changed because of the learner’s answer, or assisted practice is presented as independent validation.

### FAIL_MAJOR
Correct role exists in code but is not reasonably visible/understandable before response.

---

## MAN-005 — Multidimensional Progress does not collapse into a mastery scalar

**Requirement:** UIG-10

### Setup
Open Progress for a target with mixed states (for example practice complete, validation absent, retention not assessed).

### PASS iff all are true
- Exposure, Practice, Validation, Retention, and Evidence are separately visible;
- no ungoverned overall mastery percentage, score, ring, progress bar, grade, or equivalent aggregate is shown;
- visual hierarchy does not make one combined “completion” value appear authoritative;
- validation status remains independently legible from practice status;
- retention does not silently imply permanent validation.

If R2 is used, after viewing the screen they should not reasonably conclude that an overall mastery score has been assigned when none exists.

### FAIL_BLOCKER
Ungoverned aggregate mastery state/percentage is displayed.

### FAIL_MAJOR
No scalar exists technically, but visual composition strongly implies one combined mastery/completion judgment.

---

## MAN-006 — Consent / withdrawal presentation is voluntary and visibly non-evaluative

**Requirements:** Consent Addendum v1.0 + Consent Supplement v1.0

### Setup
Open the exact participant-facing consent/withdrawal screen used before PT-01.

### PASS iff all are true
The rendered screen plainly communicates before the consent-understanding check:
- participation is voluntary;
- participant may stop at any time;
- participant need not give a reason;
- stopping does not count against them / carries no penalty;
- the consent-understanding check is about rights, not study performance;
- the check is not scored;
- asking for clarification is allowed and carries no penalty.

R2, without briefing from the governance documents, can state that:
1. they may stop without giving a reason;
2. stopping does not count against them;
3. the rights-understanding question is not a test or score.

### FAIL_BLOCKER
Rendered wording contradicts voluntariness/withdrawal rights, treats withdrawal as learner failure, or implies a penalty for stopping.

### FAIL_MAJOR
Required protection exists in source text but is visually buried/ambiguous enough that R2 interprets the rights check as part of study performance.

---

## MAN-007 — iPhone touch / viewport / focus behavior

**Requirement:** Device conformance + WCAG 2.2 touch/focus checks

### Setup
Run on the intended iPhone as a Home Screen web app and in Safari at least once.

Test:
- Learn;
- Map;
- Progress;
- More;
- search/input fields;
- `Why this step?` expansion;
- learner-correction controls;
- consent controls;
- bottom navigation;
- any modal/dialog used in Pilot 01.

### PASS iff all are true
- no primary control is clipped by the viewport or iPhone safe area;
- bottom navigation remains operable;
- opening the software keyboard does not leave the active input/action entirely hidden by author-created content;
- focused/selected controls remain identifiable;
- touch targets meet WCAG 2.2 2.5.8 minimum target-size/spacing rules (24 x 24 CSS px or a valid exception/spacing condition);
- no essential Pilot-01 action requires an unavailable hover interaction;
- semantic text does not overlap or truncate so severely that meaning changes;
- portrait orientation completes all Pilot-01 tasks without forced horizontal page scrolling (except an explicitly scrollable map/data region whose scroll behavior is clear);
- app remains usable after Add to Home Screen / Open as Web App.

### FAIL_BLOCKER
A required pilot action cannot be completed on the target iPhone or a control necessary for withdrawal/consent is inaccessible.

### FAIL_MAJOR
The task is technically completable but a layout/focus/touch failure materially obscures required semantic information or creates repeated accidental activation risk.

---

# 4. Independence / cold-read protection

For MAN-001 and MAN-006, R1 must not explain the intended interpretation to R2 before R2 answers the frozen questions.

For MAN-001 specifically, ordinary learner-facing task/topic context is required under the contextual-entry rule above, but interpretive briefing remains prohibited.

Record only:
- PASS/FAIL outcome;
- short verbatim or near-verbatim interpretation needed to justify adjudication.

Do not coach R2 until after the check is scored.

R2 must not later be counted as P01–P05 because prior exposure would contaminate Pilot-01 first-use conditions.

---

# 5. Device-review evidence to record

For each MAN item record:
- protocol version;
- build version;
- build hash;
- device/iOS version;
- Safari/Home-Screen mode;
- reviewer ID (`R1`, `R2` only; no real name required in audit artifact);
- PASS/FAIL;
- screenshot filename if captured;
- short adjudication rationale;
- issue severity;
- fix version if applicable.

For MAN-001 also record a short learner-facing context/case identifier or summary for each of the two uncertainty paths so the review can later distinguish wording failure from setup/context failure without exposing governance coaching to R2.

Screenshots must not contain participant personal data.

---

# 6. Freeze statement

`TNPO_RENDERED_DEVICE_AUDIT_PROTOCOL_v1.1 = FROZEN`

`DEVICE_REVIEW = NOT_YET_RUN`

`PILOT_BUILD_FREEZE = NOT_AUTHORIZED_UNTIL_MAN-001..MAN-007_PASS`
