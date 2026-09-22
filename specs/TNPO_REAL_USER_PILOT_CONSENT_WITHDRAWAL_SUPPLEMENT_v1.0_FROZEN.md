# TNPO / MSVO Navigator
## Consent & Withdrawal Supplement v1.0 — FROZEN BEFORE P01

**Pilot:** TNPO-PILOT-01  
**Parent documents:**  
- TNPO_REAL_USER_PILOT_PREREG_v1.0_FROZEN  
- TNPO_REAL_USER_PILOT_CONSENT_WITHDRAWAL_ADDENDUM_v1.0_FROZEN  

**Status:** FROZEN BEFORE REAL-USER DATA COLLECTION

This supplement does not alter either frozen parent document. It resolves two previously under-specified operational details.

---

# 1. Default data disposition if a withdrawing participant gives no preference

The existing addendum allows a withdrawing participant, before irreversible de-identification/aggregation, to choose either:

- retain already-collected de-identified data; or
- exclude/delete participant-level pilot data where technically feasible.

This supplement freezes the default when the participant does **not** express a preference.

## Default rule

If a participant withdraws and leaves, declines to discuss data disposition, or otherwise provides no explicit preference:

`DEFAULT_WITHDRAWAL_DATA_DISPOSITION = EXCLUDE_FROM_ANALYSIS_AND_DELETE_WHERE_TECHNICALLY_FEASIBLE`

This default is a project policy chosen to minimize reliance on participant inaction as implied permission.

It is **not** presented as a universal OHRP requirement.

## Limits

- Do not promise deletion where data have already become irreversibly de-identified or inseparable from aggregate outputs.
- Do not silently convert identifiable or coded data to de-identified form merely to preserve their use after withdrawal.
- Preserve only the minimum administrative record needed to document that withdrawal occurred and that the data-disposition rule was applied, unless applicable law/institutional policy requires otherwise.
- A participant is not required to remain present, answer questions, or make a data-disposition choice in order for withdrawal to take effect.

---

# 2. Participant-facing consent-understanding language

The existing addendum requires the moderator to check understanding before the first task.

This supplement freezes the wording needed to make clear that the check is about participant rights, not study performance.

## Required lead-in

Before asking the consent-understanding question, the moderator says:

> "This next check is only to make sure I explained your rights clearly. It is not part of the study tasks, it is not scored, and there is no penalty for asking me to explain anything again."

Then ask:

> "Do you understand that participation is voluntary, that you can stop at any time without giving a reason, and that stopping will not count against you?"

## If the participant says "no", "not sure", or asks a question

- clarify the relevant right in plain language;
- invite further questions;
- repeat the check after clarification;
- do not record the initial uncertainty as a comprehension failure;
- do not treat it as learner-state evidence;
- do not begin Pilot Task PT-01 until the participant affirmatively indicates understanding.

`CONSENT_UNDERSTANDING_CHECK != PILOT_COMPREHENSION_SCORE`

---

# 3. Governance mapping

These clarifications preserve the existing invariants:

`WITHDRAWAL != LEARNER FAILURE`

`PARTICIPANT SILENCE != DATA-RETENTION CONSENT`

`CONSENT CLARIFICATION != LEARNER-STATE EVIDENCE`

`CONSENT CHECK != STUDY PERFORMANCE`

---

# 4. Freeze statement

`TNPO_REAL_USER_PILOT_CONSENT_WITHDRAWAL_SUPPLEMENT_v1.0 = FROZEN`

`REAL_USER_DATA_COLLECTION = NOT STARTED`
