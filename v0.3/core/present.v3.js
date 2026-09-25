// TNPO/MSVO v0.3 — Presentation translation boundary (ROOT C of the H_c^(4) contract).
// GOVERNED INTERNAL STATE -> PRESENTATION MODEL -> LEARNER-FACING TEXT + AVAILABLE CONTROLS.
// Policy/governance/commit return CODES; every learner-facing string is produced here. Internal identifiers
// (slice node ids, task ids, raw enums, provenance classification tokens) never reach the learner. [INV-C1, INV-C3]
import { evidencePresentation } from './evidence.v3.js';

// Vocabulary that must never appear in learner-facing text (used by the standing route scan).
export const FORBIDDEN_LEARNER_VOCABULARY = Object.freeze([
  /\bSLICE\.[AB]\b/, /\bSLICE-[AB]-[A-Z0-9]+\b/, /\bT[1-3]-(?:P|D|V|TR|CONFLICT|RESOLVE)[0-9]*\b/,
  /GENUINE_PROVENANCE_BACKED_REQUIRES/, /\b[A-Z]{3,}(?:_[A-Z0-9]{2,})+\b/
]);

export function makePresenter({ map, slice, engine }) {
  const byId = new Map((map?.nodes || []).map(n => [n.node_id, n]));
  const sliceNodes = new Map((slice?.nodes || []).map(n => [n.node_id, n]));
  const hyp = new Map();
  for (const tg of engine.targets) for (const t of tg.tasks) for (const h of (t.hypotheses || [])) if (!hyp.has(h.id)) hyp.set(h.id, h.label);

  const node = (id) => byId.get(id) || sliceNodes.get(id) || null;
  const isCanonical = (id) => byId.has(id);
  // Learner-facing node title: human label only (canonical map id available separately as map metadata).
  const nodeTitle = (id) => { const n = node(id); return n ? n.label : 'this topic'; };
  const nodeMeta = (id) => isCanonical(id) ? `Map topic ${id}` : 'Prerequisite content slice';
  const hypLabel = (id) => hyp.get(id) || 'an interpretation';
  // Replace any internal node id inside authored provenance prose with its human title (centralized, not ad hoc).
  const humanize = (text) => String(text || '').replace(/\bSLICE\.[AB]\b/g, (m) => `“${nodeTitle(m)}”`).replace(/\bREQUIRES\b/g, 'requires');
  // The learner-facing prompt only (never the internal inferential question). [H_c^(5) INV-F4]
  const taskTitle = (task) => task && task.prompt ? `“${String(task.prompt).split(/(?<=[.?])\s/)[0]}”` : 'a task';
  const quote = (s, n = 60) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  // What the learner was actually shown for a recorded answer: the persisted display prompt; for legacy events the
  // task/probe prompt resolved by id. Never reconstructed from inferential metadata.
  function shownPrompt(payload, task) {
    if (payload && payload.display_prompt) return payload.display_prompt;
    if (task && payload && payload.probe_id && Array.isArray(task.probes)) { const p = task.probes.find(x => x.probe_id === payload.probe_id); if (p && p.prompt) return p.prompt; }
    return task && task.prompt ? task.prompt : null;
  }

  const ROLE = { PRACTICE: 'Practice', DIAGNOSTIC_CHECK: 'Diagnostic check', INDEPENDENT_VALIDATION: 'Independent validation' };
  const ROLE_PREFACE = {
    PRACTICE: 'Hints or support may be used. This task does not independently validate the topic.',
    DIAGNOSTIC_CHECK: 'This gathers evidence to distinguish explanations. It is not an independent validation task.',
    INDEPENDENT_VALIDATION: 'No hints or outside help. A governed evaluator may use the result as validation evidence.'
  };
  const KIND_NOTE = {
    CONFLICT_PROBE: 'A short check of which remainder convention you are using.',
    CONFLICT_RESOLUTION: 'One more question that can tell the two conventions apart.',
    PT08_TRANSFER: 'A transfer check in a changed context (larger numbers). It gathers evidence; it does not change your validation.',
    PT08_RECHECK: 'A re-check of the open transfer concern, in a changed context. It gathers evidence; it does not change your validation.',
    INDEPENDENT_VALIDATION: 'This question counts once: after it has been shown to you, it cannot be offered again as independent validation. Reloading keeps this same attempt. Using or reporting outside help means it cannot count.'
  };
  const PROVENANCE_CLASS = { GENUINE_PROVENANCE_BACKED_REQUIRES: 'Genuine prerequisite, backed by a recorded provenance record',
    SYNTHETIC_AUDIT_FIXTURE_ONLY: 'Audit fixture only — not a real prerequisite' };
  const EVIDENCE_CLASS = (s) => /DEFINITIONAL/i.test(s || '') ? 'Definitional dependency (the later idea is built from the earlier one)' : 'Recorded dependency';

  function provenance(edge) {
    if (!edge) return null;
    return { relation: `“${nodeTitle(edge.source)}” requires “${nodeTitle(edge.target)}”.`,
      classification: PROVENANCE_CLASS[edge.classification] || 'Recorded relation', evidenceClass: EVIDENCE_CLASS(edge.evidence_classification),
      definition: humanize(edge.relation_definition), source: humanize(edge.source_evidence), map: `Prerequisite content slice, version ${edge.domain_map_version}` };
  }

  // HOLD / GOAL text is generated FROM the presentation's control list (text never promises an absent action).
  function stepText(pres) {
    const ctl = new Set(pres.controls || []);
    const ways = [ctl.has('RESTART_ROUND') ? 'start a new round of this target’s tasks' : null, ctl.has('CHANGE_TARGET') ? 'choose another target' : null].filter(Boolean);
    const tail = ways.length ? ` You can ${ways.join(' or ')} using the buttons below.` : '';
    switch (pres.kind === 'GOAL_REACHED' ? 'GOAL' : pres.policy?.hold_reason) {
      case 'GOAL': return `This target is independently validated and has no open concern.${tail}`;
      case 'PREREQ_ROUND_EXHAUSTED': return `There is no more practice for “${nodeTitle(pres.focus)}” in this round, and its evidence is not yet enough, so independent validation is not offered. Your target “${nodeTitle(pres.target)}” stays saved.${tail}`;
      case 'CONFLICT_NO_RESOLVER': return `Your answers support two incompatible interpretations, and no question that can tell them apart is left in this round. Nothing is treated as settled.${tail}`;
      case 'CONCERN_NO_RECHECK': return `The transfer concern is still open, and no further re-check is available in this round. Your earlier validation stays in your history.${tail}`;
      case 'VALIDATION_ITEM_ALREADY_USED': return `Independent validation can’t be completed for this topic right now. Its independent-validation question has already been shown to you (answered, left unfinished, or used with help), so it cannot count again, and no other fresh independent-validation question is available. This is not a judgement about what you know. Your evidence and history are unchanged.${tail}`;
      default: return `No further task is available for this target in this round.${tail}`;
    }
  }
  function backtrackText(pres) {
    return `You are working on the prerequisite “${nodeTitle(pres.focus)}”. Your target “${nodeTitle(pres.target)}” is saved. You will return to it once the evidence on “${nodeTitle(pres.focus)}” is sufficient. Independent validation is not offered until then.`;
  }
  function returnText(pres) { return `Returning to your target “${nodeTitle(pres.target)}”: the prerequisite evidence is now sufficient.`; }
  function concernText(state) {
    const c = state.current_concern; if (!c) return null;
    const when = c.raised_at ? new Date(c.raised_at).toLocaleDateString() : 'recently';
    const more = c.rechecks_failed ? ` A later re-check was also not passed (${c.rechecks_failed}).` : '';
    return `Open transfer concern: a transfer check on ${when} was not passed.${more} This is a current concern, not a time-based retention result, and it does not erase your independent validation, which stays in your history.`;
  }
  function evidenceText(code) { return evidencePresentation(code).label; }

  // DUPLICATE: state what persistence holds — the step was already completed and this submission created no record.
  // The tab's own answer is called "saved" only when it equals the committed response carried by the receipt. [INV-F2]
  function duplicateText(result, submitted) {
    const rc = result.receipt || {};
    if (rc.result && rc.result.code === 'VALIDATION_CONTAMINATED')
      return 'This independent-validation question can no longer count as independent validation, because help was used. This answer was not recorded.';
    if (submitted && submitted.kind === 'ANSWER') {
      const mine = String(submitted.response ?? '').trim();
      if (typeof rc.response === 'string') {
        if (mine === rc.response) return `Already completed — this step was saved earlier with the same answer (“${quote(mine)}”), so nothing new was recorded.`;
        return `This step was already completed (for example in another tab) with the answer “${quote(rc.response)}”. Your answer “${quote(mine)}” was not recorded.`;
      }
      return 'This step was already completed earlier (for example in another tab). Your latest answer was not recorded.';
    }
    return 'This step was already completed earlier, so this submission did not create another record.';
  }
  // Withdrawal / completion text is derived from the POST-COMMIT forensic footprint, never from intent. [INV-P4]
  function lifecycleText(result, fp) {
    const stop = 'Stopping is not treated as evidence about you.';
    if (!fp) return `Pilot stopped. Your choice was saved, but this screen could not re-check what remains on this device. ${stop}`;
    const learnerLeft = (fp.learner_states || 0) + (fp.events || 0) + (fp.meta_records || 0) + (fp.ordinary_state_rows_claiming || 0) + (fp.ordinary_events_claiming || 0);
    if (result.code === 'PILOT_COMPLETED')
      return 'Pilot session ended — this is not a withdrawal. Your pilot activity is kept on this device under your participant code only (no name is recorded) for the pilot analysis. The next participant starts with no earlier data.';
    // F5-02: a session recovered after an app upgrade. Only participant-scoped records are governed by the choice; older
    // pre-upgrade activity could not be attributed to the participant and is described as exactly that. [Addendum §4]
    if (result.legacy_unattributable) {
      const wr = fp.withdrawal_record || {};
      const kept = ['your participant code', wr.consent_date ? 'the consent date' : null, wr.consent_version ? 'the consent version' : null,
        wr.withdrawn_on ? 'the withdrawal date' : null, wr.data_disposition ? 'the data choice applied' : null].filter(Boolean);
      const record = `A minimal withdrawal record is kept: ${kept.length > 1 ? `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}` : kept[0]}.`;
      const older = 'Older pre-upgrade activity on this device could not be reliably attributed to this participant, so it remains separate from the participant record';
      if (result.disposition === 'DELETE_WHERE_FEASIBLE') {
        if (learnerLeft !== 0 || fp.session_record)
          return `Pilot stopped. Deletion was requested, but ${learnerLeft + (fp.session_record ? 1 : 0)} participant-scoped pilot record(s) still remain on this device. ${older} and was not deleted. ${stop}`;
        return `Pilot stopped. Participant-scoped pilot data from this recovered session was handled according to your choice: none remains on this device. ${older} and was not deleted. ${record} ${stop}`;
      }
      const scoped = learnerLeft === 0 ? 'No participant-scoped pilot activity was recorded in this recovered session.'
        : 'Participant-scoped pilot data from this recovered session stays on this device under your participant code only (no name is recorded) and may be used in the pilot analysis.';
      return `Pilot stopped. Your choice to keep your data was recorded. ${scoped} ${older}; it is not kept under your participant code. ${record} ${stop}`;
    }
    if (result.disposition === 'DELETE_WHERE_FEASIBLE') {
      if (learnerLeft === 0 && !fp.session_record)
        return `Pilot stopped. Your pilot activity on this device (answers, progress and session record) was deleted. Only a minimal withdrawal record is kept: your participant code, the consent date and version, the withdrawal date, and the data choice applied. ${stop}`;
      return `Pilot stopped. Deletion was requested, but ${learnerLeft + (fp.session_record ? 1 : 0)} pilot record(s) still remain on this device. ${stop}`;
    }
    return `Pilot stopped. As you chose, your pilot activity stays on this device under your participant code only (no name is recorded) and may be used in the pilot analysis. A withdrawal record (code, dates and your choice) is also kept. ${stop}`;
  }

  function feedbackText(outcome, result = {}, ctx = {}) {
    const ev = result.evidence_state ? evidenceText(result.evidence_state) : null;
    switch (outcome) {
      case 'DUPLICATE_ALREADY_COMMITTED': return duplicateText(result, ctx.submitted);
      case 'STALE_NOT_AUTHORIZED': return result.reason === 'DATA_SCOPE_CHANGED'
        ? 'A pilot session started or ended on this device (for example in another tab), so that action was not recorded. Showing the current learner’s step.'
        : 'This step changed (for example in another tab), so that answer was not recorded. Showing your current step.';
      case 'PERSISTENCE_ABORTED': return 'Couldn’t save — nothing was recorded. You can try again.';
      case 'POST_COMMIT_RENDER_FAILURE': return 'Your action was saved. The screen could not update, so it is being rebuilt from your saved progress.';
      case 'GOVERNED_HOLD': return ({ VALIDATION_CONTAMINATION: 'Independent validation cannot use help. Nothing was recorded.',
        VALIDATION_NOT_FRESH: 'This independent-validation question has already been used (shown earlier, or used with help), so it cannot count as independent validation. Nothing was recorded.',
        SUPPORT_NOT_PERMITTED_FOR_ROLE: 'Help is not permitted for this task. Nothing was recorded.', EMPTY_RESPONSE: 'Enter an answer first.',
        RIGHTS_NOT_AFFIRMED: 'Pilot mode cannot begin until you confirm your rights above.', INVALID_PARTICIPANT_ID: 'Use a participant ID like P01.',
        PARTICIPANT_ID_ALREADY_USED: 'That participant ID has already been used on this device. Use a new participant ID.',
        PILOT_SCOPE_UNRESOLVED: 'The pilot session on this device is incomplete, so learning is paused. Open More to stop the session. Nothing was recorded.',
        PILOT_UNAVAILABLE_IN_AUDIT_FIXTURE_MODE: 'Pilot mode is not available in audit fixture mode.', NOT_A_LEARNABLE_TARGET: 'No governed tasks are available for that topic.' }[result.reason])
        || 'That action is not permitted right now. Nothing was recorded.';
    }
    switch (result.code) {
      case 'PRACTICE_RECORDED': return `${result.assisted ? 'Assisted' : 'Independent'} practice recorded${result.correct ? '' : ' — this attempt was not correct, so the evidence did not advance'}. Evidence: ${ev}. Practice is not independent validation.`;
      case 'VALIDATION_PASS': return `Independent validation passed. Evidence: ${ev}.`;
      case 'VALIDATION_FAIL': return `Validation not demonstrated this time. Evidence: ${ev}. Earlier history is preserved.`;
      case 'VALIDATION_CONTAMINATED': return 'Independent validation cannot use help, so this question can no longer count as independent validation. Your answer was not scored, and your evidence and history are unchanged.';
      case 'PROBE_RECORDED': return `Answer recorded (${result.n} of ${result.total}).`;
      case 'CONFLICT_CREATED': return `Your answers separately match two incompatible conventions (${(result.competing || []).map(hypLabel).join(' vs ')}), so the evidence is conflicting — competing supported interpretations, not just mixed results.`;
      case 'CONFLICT_RESOLVED': return `Your latest answer is consistent with one convention (${hypLabel(result.resolved_to)}); the competing interpretation is no longer separately supported, so the conflict is cleared. Evidence returns to ${ev} — clearing a conflict does not by itself create stronger evidence.`;
      case 'CONFLICT_UNRESOLVED': return 'Still conflicting — that answer did not distinguish the two conventions. Earlier evidence is preserved.';
      case 'DIAGNOSTIC_RECORDED':
        if (result.concern_raised) return `Transfer check recorded — it was not passed, so a transfer concern is now open. Your independent validation stays in your history. Evidence: ${ev}.`;
        if (result.concern_resolved) return `Re-check passed — the transfer concern is resolved. Evidence: ${ev}.`;
        if (result.concern_continues) return `Re-check recorded — it was not passed, so the transfer concern stays open. Evidence: ${ev}.`;
        return `Diagnostic recorded. Evidence: ${ev}. This gathers evidence; it does not certify.`;
      case 'TARGET_SET': return `Target set: “${nodeTitle(result.node)}”. Here’s your first step.`;
      case 'TARGET_CLEARED': return 'Target cleared. Choose your next target.';
      case 'ROUND_RESTARTED': return `New round started for “${nodeTitle(result.node)}”.`;
      case 'PRESENTATION_RECONCILED': return 'Your current step was restored from your saved progress.';
      case 'SELF_REPORT_RECORDED': return result.contaminated
        ? 'Self-report recorded as evidence. It does not change your validation state. Because you reported outside help, the independent-validation question you were shown can no longer count as independent validation.'
        : 'Self-report recorded as evidence. It does not change your validation state.';
      case 'CONSENT_RECORDED': return `Pilot mode started for ${result.participant_id}. This session starts with no earlier data, and its activity is kept separately from anyone else’s.`;
      case 'PILOT_COMPLETED': case 'WITHDRAWN': return lifecycleText(result, ctx.footprint);
      default: return 'Recorded.';
    }
  }

  // "Why this step?" model: four provenance tiers; decision text comes from the ACTIVE presentation. [GOV-010, EVID-021]
  function whyModel({ nodeId, state, pres, events, taskById }) {
    const own = events.filter(e => e.payload?.node_id === nodeId);
    const observed = own.filter(e => e.record_type === 'OBSERVATION').slice(-4).map(e => e.type === 'SELF_REPORT'
      ? `Self-report (evidence, not a command): “${e.payload.value}”${e.payload.note ? ' — ' + e.payload.note : ''}.`
      : (() => { const q = shownPrompt(e.payload, taskById(e.payload.task_id));
          const n = e.payload.probe_ordinal || (e.payload.probe_id ? Number(String(e.payload.probe_id).replace(/\D/g, '')) || null : null);
          return `You answered ${q ? `“${q}”` : 'a question'}${n ? ` (question ${n})` : ''} with “${e.payload.response}”.`; })());
    const evaluations = own.filter(e => e.record_type === 'EVALUATION').slice(-3).map(e => {
      const r = e.payload.record || {}; const f = r.scored_features || {};
      const rubric = r.rubric_version === 'conflict_signature' ? 'remainder-convention signature' : r.rubric_version === 'exact_boolean' ? 'exact yes/no match' : 'exact integer match';
      const res = 'correct' in f ? (f.correct ? 'correct' : 'not correct')
        : (f.supported_hypotheses || []).length ? `consistent with ${(f.supported_hypotheses || []).map(hypLabel).join(' and ')}` : 'matches no listed convention';
      return `Evaluator result (${rubric}): ${res}.`;
    });
    const e = evidencePresentation(state.evidence_state);
    let uncertain = e.description;
    if (state.evidence_state === 'CONFLICTING_EVIDENCE' && (state.competing_hypotheses || []).length >= 2)
      uncertain = `Competing supported interpretations of the same question — ${state.competing_hypotheses.map(hypLabel).join(' vs ')} — are each separately supported and materially incompatible, so the evidence conflicts (this is not merely mixed results).`;
    if (state.current_concern) uncertain += ' A transfer concern is open; it is shown separately from your preserved validation history and is not treated as settled.';
    let decision;
    if (!pres) decision = 'No step is active for this topic right now.';
    else if (pres.kind === 'TASK') {
      const k = pres.action_kind;
      decision = ({ PRACTICE: 'Practice is the next authorized step', DIAGNOSTIC_CHECK: 'A diagnostic check is the next authorized step',
        CONFLICT_PROBE: 'A short diagnostic is the next authorized step', CONFLICT_RESOLUTION: 'A question that can distinguish the competing interpretations is the next authorized step',
        INDEPENDENT_VALIDATION: 'Current evidence supports a reversible step, so an independent validation task (no help) is authorized',
        PT08_TRANSFER: 'A transfer check is the next authorized step', PT08_RECHECK: 'A re-check of the open transfer concern is the next authorized step' }[k] || 'The next step is shown on the page')
        + (pres.backtrack ? ' — on the prerequisite, because your target requires it and its evidence is not yet enough.' : '.');
    } else decision = stepText(pres);
    return { know: nodeTitle(nodeId), knowMeta: nodeMeta(nodeId), observed, evaluations, uncertain, decision };
  }

  return { node, nodeTitle, nodeMeta, hypLabel, humanize, taskTitle, ROLE, ROLE_PREFACE, KIND_NOTE, provenance, stepText,
    backtrackText, returnText, concernText, evidenceText, feedbackText, whyModel };
}
