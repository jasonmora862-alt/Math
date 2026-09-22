# TNPO — Tutor Navigation & Pedagogy Ontology
## Baseline Architecture v1.0 — FROZEN

**Status:** FROZEN AFTER FOUR-EVALUATION GATE  
**Freeze basis:** TNPO Evaluations 1–4 completed and passed the staged architecture gate.  
**Purpose:** establish the authoritative baseline architecture before branch/module construction, Tutor Core-Wave preregistration, runtime implementation, or model training.

---

# 1. System identity

TNPO is not a domain-knowledge map like MSVO.

TNPO governs:

- how a tutor represents pedagogical actions;
- how learner evidence is collected and interpreted;
- how tasks are represented;
- how learner-state claims are updated;
- how the tutor chooses the next instructional action;
- how validation is protected from contamination;
- how map navigation remains external, versioned and auditable.

MSVO or a future subject map supplies **domain structure**.

TNPO supplies **tutor-navigation and pedagogy structure**.

---

# 2. Frozen architectural components

The baseline contains nine distinct components.

## A. Domain / Competency Map

Examples:
- MSVO;
- future physics map;
- future robotics map;
- future ML map.

Purpose:

`what domain knowledge / competencies exist and how they relate`

The tutor may query this component.

The tutor may not silently mutate it.

---

## B. Optional Learning Progression Model

Purpose:

`how competence may develop through intermediate forms / levels`

Rules:
- optional;
- domain-specific;
- evidence/provenance required;
- may contain misconceptions/intermediate conceptions;
- does not automatically create prerequisite edges;
- may be revised prospectively.

---

## C. Learner Model

Purpose:

`current evidence-grounded claims about a specific learner`

Learner state is inferential.

It is not a direct copy of raw responses.

---

## D. Immutable Observation / Event Ledger

Purpose:

`what actually happened`

Examples:
- task shown;
- response;
- hint;
- scaffold;
- feedback;
- timing;
- tool use;
- exposure;
- evaluator output;
- state transition.

Historical events are append-only.

Later interpretation may change without rewriting the historical event.

---

## E. Task Model

Purpose:

`what a task targets, requires, permits and can elicit`

Task identity/version and validation role must be known prospectively.

---

## F. Evidence / Assessment Model

Purpose:

`how observations bear on learner claims`

Frozen reasoning chain:

`OBSERVATION -> EVALUATION -> INFERENCE -> DECISION`

These are not interchangeable.

---

## G. Pedagogical Action Ontology

Frozen top-level roots:

1. `P01 Explanation & Representation`
2. `P02 Scaffolding & Guided Support`
3. `P03 Practice & Learning Activities`
4. `P04 Feedback`
5. `P05 Metacognitive & Self-Regulatory Support`

A concrete intervention may instantiate multiple roots.

The ontology classifies pedagogical functions, not mutually exclusive message types.

---

## H. Tutor Policy State Machine

Purpose:

`goal + maps + learner state + evidence + task inventory -> next authorized action`

Frozen representation:

`GUARDED CYCLIC STATE MACHINE`

Not a DAG.

Runtime loops are legitimate:
- practice -> evidence review -> remediation -> practice;
- validation -> remediation -> revalidation;
- prior validation -> later revalidation.

---

## I. Governance / Quality Layer

Purpose:
- versioning;
- provenance;
- authority control;
- contamination prevention;
- accessibility/fairness/safety/privacy constraints;
- non-retroactivity;
- auditability;
- negative-evidence preservation.

---

# 3. Frozen root semantics

## P01 — Explanation & Representation

Core function:

`make target knowledge, relationships, procedures or representations more intelligible`

This root includes explanatory and representational instructional actions.

It does not own learner-state inference or task selection.

## P02 — Scaffolding & Guided Support

Core function:

`provide temporary / contingent support that helps a learner perform or reason beyond current independent capability`

Support should be removable/fadeable where independence is the target.

## P03 — Practice & Learning Activities

Core function:

`cause the learner to retrieve, generate, solve, apply, discriminate, rehearse or otherwise act in ways intended to change or stabilize learning`

Task selection itself belongs to tutor policy.

## P04 — Feedback

Core function:

`provide information about performance relative to a goal, criterion, model or intended outcome`

Remediation is not a feedback root.
Remediation is a policy outcome that may select one or more pedagogical actions.

## P05 — Metacognitive & Self-Regulatory Support

Core function:

`help the learner plan, monitor, evaluate and regulate their own learning`

Learner metacognition itself belongs in the Learner / Competency model.

---

# 4. Frozen cross-layer invariants

1. `PEDAGOGICAL_ACTION != LEARNER_PROCESS`
2. `OBSERVATION != EVALUATION != INFERENCE != DECISION`
3. `LEARNER_STATE = EVIDENCE-GROUNDED INFERENCE`
4. `PRACTICE_SUCCESS != INDEPENDENT_VALIDATION`
5. `ASSISTED_PERFORMANCE != INDEPENDENT_VALIDATION`
6. `NEW_ITEM_ID != FRESH_VALIDATION`
7. `EVIDENCE_COUNT != INDEPENDENT_EVIDENCE_COUNT`
8. `SELF_REPORT != PERFORMANCE_EVIDENCE`
9. `DOMAIN_MAP != LEARNING_PROGRESSION != LEARNER_STATE != SELECTED_CURRICULUM_PATH`
10. `FEEDBACK != REMEDIATION`
11. `TASK != TASK_SELECTION_POLICY`
12. `LEARNING_PROGRESSION != UNIVERSAL_PREREQUISITE_CHAIN`
13. `VALIDATED != PERMANENTLY_VALIDATED`
14. `STATE_UPDATE != HISTORY_REWRITE`
15. `EVIDENCE LICENSES DECISIONS; IT DOES NOT AUTOMATICALLY EXECUTE THEM`
16. `LLM PROPOSAL AUTHORITY != GOVERNANCE / WRITE AUTHORITY`

---

# 5. Frozen static relation policy

The architecture authorizes three candidate cross-model relation families for implementation work:

- `TARGETS`
- `ELICITS`
- `SUPPORTS_INFERENCE`

Their semantics are:

`TASK TARGETS CLAIM`
- task is intentionally designed to exercise/probe a claim;
- does not imply the learner demonstrated it.

`TASK ELICITS OBSERVABLE`
- task can produce the specified observable;
- does not imply the observable was successfully obtained.

`EVIDENCE SUPPORTS_INFERENCE CLAIM`
- evidence bears on a learner claim under an Evidence Model;
- does not automatically accept the claim.

These relation labels are frozen as the initial baseline vocabulary.

Future relations require versioned justification.

---

# 6. Frozen state-machine transition primitive

Primary procedural relation:

`TRANSITIONS_TO`

with metadata:
- guard;
- action;
- required evidence;
- side effects;
- failure transition;
- policy version;
- provenance.

Do not create one relation type for every runtime action if guards/actions can represent it.

---

# 7. Frozen authority boundary

## LLM may propose / generate

- explanations;
- examples;
- analogies;
- hints;
- candidate practice tasks;
- candidate diagnostic questions;
- candidate error hypotheses;
- candidate next action;
- natural-language feedback.

## Governed runtime owns

- authoritative map version;
- prerequisite closure;
- task identity/version;
- task validation role;
- exposure history;
- immutable event writes;
- evidence-sufficiency rule execution;
- learner-state transition authorization;
- certification/advancement;
- map mutation permissions;
- governance/version history.

An evaluator may itself use an LLM, but evaluator output is evidence/observation, not automatically truth.

---

# 8. Frozen Tutor Core-Wave set

The first TNPO pressure-test wave contains:

- `TW-01 Clean Acquisition`
- `TW-02 Hidden Prerequisite Failure`
- `TW-03 Misconception vs Slip / Conflicting Evidence`
- `TW-04 Assisted Success / Validation Contamination`
- `TW-05 Transfer, Delay & Revalidation`
- `TW-06 Unknown / Unvalidated Region & Portability`

Protocols are not defined by this architecture freeze.
They must be preregistered separately before execution.

---

# 9. Frozen Tutor CORE_BLOCKER classes

- `TB-01 Map / Navigation Integrity Failure`
- `TB-02 Evidence Validity Failure`
- `TB-03 Validation Contamination Failure`
- `TB-04 Learner-State / Provenance Failure`
- `TB-05 Diagnostic / Policy Failure`
- `TB-06 Runtime Authority / Governance Failure`
- `TB-07 Architecture Portability Failure`

---

# 10. Frozen Tutor MVC eligibility rule

\[
\boxed{
\text{Tutor MVC eligible}
\iff
\text{TW-01 through TW-06 pressure-tested}
\land
\text{no Tutor CORE_BLOCKER}
}
\]

`MVC_ELIGIBLE` is not the same as `MVC_ACHIEVED`.

Actual MVC requires a later adjudication.

---

# 11. Training boundary

At this freeze:

`RUNTIME_IMPLEMENTED = NO`

`TUTOR_CORE_WAVE_EXECUTED = NO`

`TUTOR_MVC = NOT_ADJUDICATED`

`DEDICATED_MODEL_TRAINING = NOT AUTHORIZED`

Training requires a governed runtime and governed interaction corpus.

---

# 12. Source basis

Primary source families used across the four evaluations and this freeze:

- ETS Evidence-Centered Design for Learning:
  https://www.ets.org/research/policy_research_reports/publications/report/2011/imbu.html

- ETS adaptive diagnostic assessment:
  https://www.ets.org/research/policy_research_reports/publications/patent/2010/00505.html

- CMU Knowledge-Learning-Instruction framework:
  https://pact.cs.cmu.edu/pubs/KLI-KoedingerCorbettPerfetti2012-pre.pdf

- IES / WWC Organizing Instruction and Study:
  https://ies.ed.gov/ncee/wwc/PracticeGuide/1

- EEF Feedback:
  https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/feedback

- EEF Metacognition and Self-Regulated Learning:
  https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition

- National Academies How People Learn II:
  https://www.nationalacademies.org/read/24783/

- NIST AI RMF and evaluation guidance:
  https://www.nist.gov/itl/ai-risk-management-framework

---

# 13. Freeze statement

`TNPO_BASELINE_ARCHITECTURE_v1.0 = FROZEN`

Future evidence may motivate a separately versioned v1.1/v2.0.

Frozen history must remain preserved.
