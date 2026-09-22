# TNPO Interface Governance Layer
## Baseline Specification v1.0 — FROZEN BEFORE UI CORE-WAVE EXECUTION

**Parent architecture:** TNPO Baseline Architecture v1.0 FROZEN  
**Runtime parent:** TNPO Runtime Schema & Policy v1.0 FROZEN  
**Purpose:** govern what the learner-facing interface is allowed to claim, omit, simplify, and expose.

---

# 1. Why this is a separate governance layer

TNPO already governs:
- what the architecture represents;
- what evidence means;
- what the runtime may decide.

The interface adds a new failure surface:

`correct internal state -> misleading learner-facing statement`

Therefore:

\[
\boxed{
\text{INTERNAL ARCHITECTURE STATE}
\neq
\text{LEARNER-FACING REPRESENTATION}
}
\]

and:

\[
\boxed{
\text{RUNTIME AUTHORIZATION}
\neq
\text{UI WORDING}
}
\]

The interface must simplify without changing semantic meaning.

---

# 2. Frozen interface-governance invariants

## UIG-01 — No certainty laundering

The UI may not turn:
- UNKNOWN;
- INSUFFICIENT_EVIDENCE;
- CONFLICTING_EVIDENCE;
- provisional inference

into a confident learner-facing claim.

## UIG-02 — Claim type is deterministic

Learner-facing provenance badges are derived from the authoritative record type, not chosen by an LLM.

Allowed initial badge types:

- `MAP FACT`
- `OBSERVATION`
- `INFERENCE`
- `DECISION`

Mapping:

`MAP FACT`
= resolved record from authoritative versioned domain/TNPO map.

`OBSERVATION`
= immutable Event/Observation record describing what happened.

`INFERENCE`
= Evidence Model inference derived from observations/evaluations.

`DECISION`
= governed Runtime/Policy authorization.

No LLM may reclassify a record into a different badge.

## UIG-03 — Evidence status is not "confidence"

The UI must not use one generic confidence scalar for all claim types.

Initial learner-facing evidence-status vocabulary:

- `ESTABLISHED`
- `SUPPORTED_NOT_ESTABLISHED`
- `CONFLICTING_EVIDENCE`
- `INSUFFICIENT_EVIDENCE`

### ESTABLISHED

Allowed only when one of these is true:

1. the displayed claim is an authoritative version-resolved map fact; or
2. the displayed learner-state claim has been authorized as `VALIDATED` for the exact displayed scope under the applicable frozen evidence policy, with no unresolved conflict invalidating that displayed scope.

### SUPPORTED_NOT_ESTABLISHED

Use when evidence supports an inference strongly enough to license a reversible instructional/diagnostic action, but does not authorize validation/certification.

### CONFLICTING_EVIDENCE

Use when current evidence materially supports incompatible interpretations or states and no governed resolution has yet been authorized.

### INSUFFICIENT_EVIDENCE

Use when evidence is absent, unknown, stale for the intended inference, or otherwise insufficient to license the displayed inference.

These are semantic states, not numerical probability bins.

## UIG-04 — Learner correction is evidence, not command

A learner-facing correction such as:
- "I guessed";
- "I already knew this";
- "I've seen this before";
- "I used outside help";
- "This prerequisite isn't my issue"

creates a self-report observation.

It may:
- trigger clarification;
- change exposure metadata;
- motivate new diagnostics;
- affect an inference after Evidence Model review.

It may not directly:
- mark VALIDATED;
- remove VALIDATED;
- skip a required validation;
- rewrite map structure;
- erase prior evidence.

## UIG-05 — No unsupported "gaming" diagnosis

Repeated learner self-reports may be recorded as a pattern.

The UI/runtime may not label the learner as dishonest, gaming, lazy, avoidant, or manipulative unless a separately governed evidence policy licenses a specific behavioral inference.

For v1.0:
- conflicting self-report is preserved;
- state is not overwritten;
- validation requirements are not waived;
- clarification or additional evidence may be requested.

No numeric "three strikes" rule is frozen.

## UIG-06 — Cyclic navigation must be understandable

The UI may simplify the Tutor Policy State Machine, but may not falsely represent tutoring as irreversible linear progress.

When runtime navigation moves backward or sideways because of new evidence, the UI must surface:
- what focus changed;
- why it changed at the permitted certainty level;
- what condition would allow returning to the prior target.

The full state machine need not be shown.

## UIG-07 — Task role is surfaced prospectively

Before a learner responds, the UI must distinguish at minimum:

- `PRACTICE`
- `DIAGNOSTIC CHECK`
- `INDEPENDENT VALIDATION`

For validation, the UI must state the applicable support restriction before response.

A task may not be retroactively presented to the learner as validation because the answer happened to be correct.

## UIG-08 — Retention surfacing requires a governed trigger

The UI may always display factual history such as:

`Last independently validated: 2026-06-14`

The UI may display:

`Review due`

only if a versioned retention/revalidation policy has authorized `REVALIDATION_DUE` for that claim.

The UI may not invent a universal expiration interval.

## UIG-09 — Historical validation is preserved

If later evidence is negative, the UI must not rewrite:

`Previously validated`

into:

`Never learned`.

The interface may show:
- historical validation;
- current retention/transfer concern;
- current revalidation status

as separate facts.

## UIG-10 — No ungrounded mastery scalar

The learner interface may not show a single mastery percentage or equivalent aggregate unless:
- its construct is explicitly defined;
- its evidence model is validated;
- its interpretation is versioned.

Default v1.0 UI uses separate dimensions instead:
- exposure;
- practice;
- validation;
- retention;
- evidence sufficiency.

## UIG-11 — Inspectability without forced complexity

The learner must be able to inspect:
- why the current step was selected;
- what was observed;
- what remains uncertain;
- whether the current task is practice/diagnostic/validation;
- which map/version is authoritative when relevant.

The learner does not have to view these details to continue.

## UIG-12 — User-facing wording cannot exceed runtime authority

A UI sentence must be supportable by the record(s) it cites.

Examples:

Allowed:
`We have conflicting evidence about whether this was a slip or a stable gap.`

Not allowed:
`You have a misconception.`

unless the Evidence Model has licensed that inference.

---

# 3. "Why this step?" structure

The transparency panel has four semantic slots:

1. `What we know`
2. `What we observed`
3. `What remains uncertain`
4. `Why this next step is authorized`

Not every slot must be populated.

Example:

```text
WHY THIS STEP?

What we observed
• One incorrect sign-distribution response
• One correct sign-distribution response

What remains uncertain
• The evidence does not yet distinguish a stable rule error from a one-off slip.

Why this next step
• One short diagnostic item can help distinguish those possibilities.
```

The UI must not invent a single "Reason" when the runtime record contains unresolved competing hypotheses.

---

# 4. Progress representation

Default learner-facing progress is multidimensional:

```text
Exposure
Practice
Validation
Retention
Evidence
```

Example:

```text
Exposure    Seen and explained
Practice    Independent practice completed
Validation  Not yet independently validated
Retention   Not assessed
Evidence    Enough evidence to attempt validation
```

`Enough evidence to attempt validation`
does not mean:
`likely to pass validation`.

---

# 5. Correction channel

Initial learner correction options:

- I guessed
- I already knew this
- I've seen this exact problem before
- I've seen a very similar problem before
- I used outside help
- I don't think this prerequisite is the issue
- Other

Each produces:
`SELF_REPORT` observation + provenance.

No direct learner-state mutation is authorized by the UI.

---

# 6. Freeze boundary

This v1.0 freezes the semantic rules above.

It does not freeze:
- visual styling;
- colors;
- exact copywriting;
- animation;
- iconography;
- numeric evidence thresholds;
- retention timing policies;
- statistical aggregation.

`TNPO_INTERFACE_GOVERNANCE_v1.0 = FROZEN`
