# TNPO / MSVO Navigator
## Real-User Pilot Preregistration v1.0 — FROZEN BEFORE PARTICIPANT 1

**Pilot code:** `TNPO-PILOT-01`  
**Target build:** learner-first PWA v0.2 pilot build  
**Status:** FROZEN BEFORE REAL-USER DATA COLLECTION  
**Parent governance:** Architecture Governance v1.0 + Runtime Governance v1.0 + Interface Governance v1.0

---

# 1. What this pilot is actually testing

This is a **formative real-user usability / semantic-integrity pilot**.

It is designed to test whether a real learner can use and correctly interpret the governed interface without the interface corrupting TNPO/MSVO semantics.

It is **not** designed to establish that TNPO improves learning outcomes compared with another tutoring system.

Therefore the primary pilot question is:

> Can representative adult learners use the TNPO/MSVO Navigator v0.2, understand its critical learner-facing distinctions, and complete representative learning-navigation tasks without governance failures or systematic semantic misunderstanding?

A later controlled study is required for:

> Does TNPO improve learning, retention, transfer, or learning experience relative to a baseline condition?

`PILOT_USABILITY_CLAIM != LEARNING_EFFICACY_CLAIM`

---

# 2. Why a separate pilot is required

Synthetic testing established:
- architecture coherence;
- runtime guard behavior;
- interface-governance consistency.

It did not establish:
- learner comprehension;
- usability;
- intuitive interpretation;
- trust calibration;
- usefulness during real learning;
- educational effectiveness.

NIST human-centered design and usability guidance treats real-user evaluation with representative tasks as a separate step from design/inspection, and current NIST ARIA guidance likewise treats User Testing as distinct from Model Testing and Red Teaming.

---

# 3. Participant scope

## Target cohort

`N = 5 adult participants`

Reason:
this pilot is qualitative/formative problem discovery, not population estimation.

Participants should:
- be age 18+;
- be able to read English comfortably enough to use the interface;
- have at least one genuine learning goal that can be represented in MSVO or the pilot toy map;
- not need prior knowledge of TNPO/MSVO terminology.

The project owner may participate in an engineering shakedown before the cohort, but that shakedown is **not** counted among the five preregistered pilot participants if it causes implementation changes.

## Explicit statistical boundary

`N = 5` is not sufficient for population-level efficacy or usability-rate estimation.

No inferential claim such as:
- "80% of learners will understand this";
- "TNPO improves learning";
- "the interface is validated for the population"

may be made from this pilot.

---

# 4. Version freeze

Before Participant P01:

- deployed PWA build hash/version is recorded;
- MSVO map version is recorded;
- TNPO branch/root versions are recorded;
- Runtime Policy version is recorded;
- Interface Governance version is recorded;
- pilot task set is frozen;
- comprehension questions are frozen;
- moderator instructions are frozen.

No UI wording, workflow, task, or scoring rule may be changed during the P01–P05 cohort except under the predefined STOP-THE-LINE rules.

If a permitted emergency correction changes behavior:
1. preserve all prior sessions;
2. increment pilot build version;
3. do not pool pre-change and post-change results as if they came from one unchanged interface;
4. restart the affected gate on the new version.

---

# 5. Representative pilot tasks

Each participant completes the same functional task classes. Domain content may vary only where the task script explicitly allows map-target substitution.

## PT-01 — Start a learning target

Participant:
- uses `Learn`;
- finds/selects a target;
- identifies what the system says happens next.

Measure:
- task completion;
- navigation hesitation;
- moderator rescue.

## PT-02 — Understand a prerequisite backtrack

Scenario:
current target B routes temporarily to prerequisite A.

Participant must be able to identify:
- current focus = A;
- intended target remains B;
- why the focus changed;
- what would allow return to B.

## PT-03 — Distinguish task role

Participant is shown:
- PRACTICE;
- DIAGNOSTIC CHECK;
- INDEPENDENT VALIDATION.

Participant must identify which task:
- may use hints;
- contributes practice evidence;
- may support independent validation.

## PT-04 — Interpret uncertainty

Participant opens `Why this step?` in a conflicting-evidence case.

Participant must distinguish:
- what was observed;
- what is inferred;
- what remains unresolved;
- why another diagnostic is being requested.

## PT-05 — Interpret provenance badges

Participant sees:
- MAP FACT;
- OBSERVATION;
- INFERENCE;
- DECISION.

Participant explains what each means using the provided interface, not prior TNPO knowledge.

## PT-06 — Use learner correction

Participant uses one correction such as:
- I guessed;
- I've seen this before;
- I used outside help.

Participant must not be told or led to believe that the correction directly rewrites validation state.

## PT-07 — Interpret Progress

Participant interprets:
- Exposure;
- Practice;
- Validation;
- Retention;
- Evidence.

No mastery percentage is shown.

## PT-08 — Interpret historical validation

Scenario:
previous validation exists, later transfer/retention evidence is negative.

Participant must distinguish:
- previous validation history;
- current concern;
- current next step.

---

# 6. Critical comprehension checks

The following are asked after the relevant task but before debrief/correction.

## CC-01 Practice vs validation

Correct interpretation:

`Correct practice does not by itself mean independently validated.`

## CC-02 Supported vs established

Correct interpretation:

`SUPPORTED_NOT_ESTABLISHED` means evidence supports a reversible next action/inference, but the displayed learner-state claim has not been independently validated/certified.

## CC-03 Conflicting vs insufficient

Correct interpretation:

`CONFLICTING_EVIDENCE` = meaningful evidence points toward incompatible interpretations.

`INSUFFICIENT_EVIDENCE` = evidence is not adequate to license the inference.

## CC-04 Map fact vs inference

Correct interpretation:

`MAP FACT` is derived from the authoritative versioned map.

`INFERENCE` is a conclusion drawn from learner evidence.

## CC-05 Self-report authority

Correct interpretation:

Learner correction becomes evidence; it does not directly set/unset validation.

## CC-06 Historical validation

Correct interpretation:

Later failure can create a current concern/revalidation need without deleting the earlier validation event.

---

# 7. Preregistered pilot gates

These are **engineering decision thresholds**, not population estimates.

## Gate A — Governance integrity

Required:

`0 system-level governance violations across P01–P05`

A governance violation includes:
- inference displayed as MAP FACT;
- correct practice retroactively displayed as validation;
- self-report directly mutating validation state;
- later failure rewriting historical validation;
- ungoverned mastery percentage displayed;
- review-due message without authorized retention trigger;
- UI wording asserting a stronger claim than runtime authority supports.

Any Gate-A violation blocks the tested build from being called pilot-ready.

## Gate B — Critical semantic interpretability

For each CC-01 through CC-06:

`at least 4 of 5 participants must answer correctly before debrief`

Additionally:

`no critical item may be misinterpreted by 2 or more participants`

This is a conservative formative release gate.

It is not a statistical claim that ≥80% of future users will understand the item.

## Gate C — Core task completion

For PT-01, PT-02, PT-03, PT-04, PT-06, and PT-07:

`at least 4 of 5 participants complete the task without moderator rescue`

PT-05 and PT-08 are interpretation tasks scored by comprehension rather than navigation completion.

## Gate D — No unrecoverable navigation breakdown

Across the cohort:

`0 participants become unable to determine how to continue without moderator intervention because the interface provides no visible recovery path.`

Ordinary hesitation does not trigger Gate D.

## Overall formative pilot result

`PILOT_FEASIBILITY_PASS`

iff Gates A, B, C, and D all pass and no STOP-THE-LINE failure invalidates the cohort.

A pass licenses:
- iteration toward v0.3 / wider pilot;
- more formal comparative study design.

It does not license:
- learning-efficacy claims;
- Tutor MVC;
- model training.

---

# 8. Descriptive measures — recorded but not used as pass/fail gates

## Task metrics

For each pilot task:
- completion yes/no;
- moderator rescue yes/no;
- number of visible navigation reversals;
- notable hesitation;
- time on task.

Time is descriptive only in Pilot 01.

## UMUX-LITE

After the session, administer the two standard UMUX-LITE items on the standard 1–7 response scale:
- system capabilities meet requirements;
- system is easy to use.

Report:
- individual responses;
- cohort median/mean descriptively.

Do not use a population benchmark or statistical significance test for this N=5 pilot.

## Open feedback

Ask:
1. What was easiest to understand?
2. What was most confusing?
3. Was there a moment when the system seemed more certain than it should have been?
4. Did you understand why the system moved you backward/sideways in the learning path?
5. Did any status make you feel you had "passed" or "failed" when that was not what it actually meant?
6. What would you change first?

---

# 9. STOP-THE-LINE exception boundary

The default rule is:

`unexpected behavior -> preserve -> log -> continue`

unless one of the following predefined exceptions occurs.

## STL-A — Participant autonomy / welfare

Stop the session immediately if:
- participant asks to stop or withdraw;
- participant declines to continue after confusion/frustration;
- continuing would knowingly expose the participant to avoidable harmful or demeaning content.

No attempt is made to persuade the participant to continue.

## STL-B — Factually wrong authoritative instructional content

Stop the affected learning task/session if the interface presents materially incorrect mathematical/domain content as authoritative in a way that could misteach the participant.

Preserve:
- displayed content;
- map/source version;
- event history.

Do not silently correct and continue as though nothing happened.

## STL-C — Governance integrity breach

Stop the affected session if any of these occurs:
- unauthorized validation-state mutation;
- inference labeled MAP FACT;
- validation contamination that invalidates the task;
- historical learner-state record overwritten;
- learner self-report directly changes a governed validation decision;
- unversioned runtime/interface rule changes during the session.

## STL-D — Data/provenance failure

Stop the affected session if:
- event ledger is lost/corrupted;
- task role cannot be reconstructed;
- relevant version/provenance cannot be established;
- participant data are exposed outside the intended storage boundary.

## STL-E — Nonrecoverable application failure

Stop if the application becomes unusable and the participant cannot continue without changing the test build.

---

# 10. What does NOT justify a mid-pilot change

The following are normally data, not stop conditions:

- participant dislikes wording;
- participant needs time to understand a status;
- participant initially misreads a noncritical label;
- participant prefers another navigation structure;
- participant ignores `Why this step?`;
- participant uses learner correction unexpectedly;
- participant asks a question not anticipated by the script;
- participant finds Progress confusing;
- participant disagrees with an inference;
- one task takes much longer than expected.

These are logged and adjudicated after the frozen cohort.

---

# 11. Handling a STOP-THE-LINE event

If an STL event occurs:

1. stop the affected session/task;
2. preserve all records;
3. classify STL type;
4. do not alter historical data;
5. determine whether the issue invalidates:
   - one task;
   - one participant session;
   - the whole build/cohort;
6. issue a versioned correction;
7. preregister any changed test element before collecting replacement evidence.

No patched result replaces the failed historical result.

---

# 12. Learner self-report conflict policy for Pilot 01

Pilot 01 intentionally does **not** implement gaming/dishonesty detection.

If a self-report conflicts with existing evidence:

1. record the report verbatim as `SELF_REPORT`;
2. preserve prior evidence/state;
3. do not automatically obey or reject the report;
4. if needed, ask neutral clarification;
5. allow the Evidence/Policy layer to request additional evidence;
6. do not assign characterological labels.

Repeated conflicting self-reports may be counted descriptively.

No threshold converts repetition into a dishonesty inference.

---

# 13. Data handling

Use participant IDs:

`P01 ... P05`

Do not require real names in the event ledger.

Minimum data:
- task/event records;
- task completion;
- comprehension answers;
- moderator rescue;
- UMUX-LITE responses;
- participant comments;
- app/runtime/map version.

Audio/video recording is **not required**.

If any recording is added later, explicit participant consent and a versioned pilot revision are required.

Participants may stop at any time.

If this work is later conducted under an institution or intended as regulated/formal human-subjects research, obtain the applicable ethics/IRB review before recruitment/use under that framework.

---

# 14. Pilot adjudication

After P05, produce:

- governance-integrity adjudication;
- comprehension matrix;
- task-completion matrix;
- usability issue registry;
- STOP-THE-LINE ledger, including zero events if none;
- qualitative theme summary;
- UMUX-LITE descriptive summary;
- versioned proposed changes.

Do not modify the current pilot's result after seeing later versions.

---

# 15. What Pilot 01 can conclude

If passed:

> TNPO/MSVO Navigator v0.2 survived a preregistered five-person formative user pilot without system-level interface-governance violations, and its six critical semantic distinctions met the preregistered interpretability gate in that pilot cohort.

It may not conclude:

> TNPO improves learning.

That requires a later comparative efficacy/learning study with:
- explicit baseline/control;
- learning outcome;
- larger or justified sample;
- prespecified analysis;
- appropriate independence/carryover controls.

---

# 16. Freeze statement

`TNPO_REAL_USER_PILOT_PREREG_v1.0 = FROZEN`

`REAL_USER_DATA_COLLECTION = NOT STARTED`

`LEARNING_EFFICACY_CLAIM = NOT TESTED`
