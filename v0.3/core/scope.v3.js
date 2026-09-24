// TNPO/MSVO v0.3 — Learner DATA_SCOPE (H_c^(5) contract §3, INV-P1/P2). Pure; no I/O.
// Every persisted learner record has exactly ONE data scope, resolved INSIDE the transaction from authoritative
// persisted pilot state (global `active_pilot` + that participant's session row), never from the caller:
//   ORDINARY    the local learner            stores learnerState / events,          meta keys unprefixed
//   AFM         audit fixture mode           stores afmLearnerState / afmEvents,    meta keys 'afm::'
//   PILOT(P,S)  pilot participant P, session S  stores pilotLearnerState / pilotEvents (primary key [P, …]),
//                                                meta keys 'pilot::P::'
//   UNRESOLVED  a pilot is marked active but has no ACTIVE session row -> learner reads/writes fail closed
// A caller's scope token is a consistency check only; it never selects the scope.
// [V03-GOV-009, Consent Addendum §4/§5, Supplement §1, V03-AUDIT-010]

export const GLOBAL_META_KEYS = Object.freeze(['active_pilot', 'pilot_epoch']);
export const PARTICIPANT_ID_RE = /^P\d{2,3}$/;
export const PILOT_RECEIPT_PREFIX = 'receipt::PILOT:';
export const DATA_SCOPE_PILOT = 'PILOT_PARTICIPANT';

// Stores a governed transaction may touch. The pilot stores are always in scope outside AFM so that scope can be
// resolved (and lifecycle actions applied) inside the one transaction.
export function txStores(afm) {
  return afm ? ['afmEvents', 'afmLearnerState', 'meta']
    : ['events', 'learnerState', 'meta', 'pilotEvents', 'pilotLearnerState', 'pilotSessions', 'pilotAdmin'];
}
export function readStores(afm) {
  return afm ? ['meta', 'afmLearnerState', 'afmEvents'] : ['meta', 'learnerState', 'events', 'pilotLearnerState', 'pilotEvents', 'pilotSessions'];
}

export const ORDINARY = Object.freeze({ kind: 'ORDINARY', token: 'ORDINARY', prefix: '', stores: Object.freeze({ state: 'learnerState', events: 'events' }) });
export const AFM_SCOPE = Object.freeze({ kind: 'AFM', token: 'AFM', prefix: 'afm::', stores: Object.freeze({ state: 'afmLearnerState', events: 'afmEvents' }) });
export function pilotScope(participant_id, pilot_session_id) {
  return Object.freeze({ kind: 'PILOT', participant_id, pilot_session_id, token: `PILOT:${participant_id}:${pilot_session_id}`,
    prefix: `pilot::${participant_id}::`, stores: Object.freeze({ state: 'pilotLearnerState', events: 'pilotEvents' }) });
}
function unresolved(participant_id) {
  return Object.freeze({ kind: 'UNRESOLVED', participant_id, token: `UNRESOLVED:${participant_id}`, prefix: null, stores: null });
}

// An ACTIVE session: consented, identified by a pilot_session_id, not completed, not withdrawn.
export function sessionIsActive(row) {
  return !!(row && row.consent_obtained === true && row.pilot_session_id && !row.completed_at && !row.withdrawn_at);
}
export function resolveScope({ afm = false, activePilot = null, sessionRow = null } = {}) {
  if (afm) return AFM_SCOPE;
  if (!activePilot) return ORDINARY;
  if (sessionIsActive(sessionRow) && sessionRow.participant_id === activePilot) return pilotScope(activePilot, sessionRow.pilot_session_id);
  return unresolved(activePilot);
}

// Key ranges covering exactly one participant's records.
export const participantKeyRange = (pid) => ({ lower: [pid], upper: [pid, []] });
export const participantMetaRange = (pid) => ({ lower: `pilot::${pid}::`, upper: `pilot::${pid}::￿` });

export class ScopeError extends Error { constructor(code, message) { super(message || code); this.name = 'ScopeError'; this.code = code; } }

// Ownership is stamped by the persistence boundary from the authoritative scope (never by the caller).
export function stamp(scope, rec) {
  if (scope.kind !== 'PILOT') return rec;
  return { ...rec, participant_id: scope.participant_id, pilot_session_id: scope.pilot_session_id, data_scope: DATA_SCOPE_PILOT };
}
// Reading a participant-owned row: it must belong to the authoritative participant (else fail closed).
export function strip(scope, rec) {
  if (!rec || scope.kind !== 'PILOT') return rec;
  if (rec.participant_id !== scope.participant_id) throw new ScopeError('FOREIGN_PARTICIPANT_RECORD');
  const { participant_id, pilot_session_id, data_scope, ...rest } = rec;
  return rest;
}

// Resolve one decision write into physical operations, or throw (the transaction then aborts: fail closed).
//   { store:'meta'|'state'|'events', op, key|value, scope?:'after' }   learner data of the resolved scope
//   { store:'global', op, key, value }                                 GLOBAL_META_KEYS / pilot lifecycle receipts
//   { store:'pilotSessions'|'pilotAdmin', op, key|value }             pilot administration (never in AFM)
//   { store:'purge', participant_id }                                  DELETE withdrawal of the resolved participant
// `scope:'after'` routes a write to decision.scope_after — only for CONSENT, from the ORDINARY scope, together with
// the new ACTIVE session row of that participant in the same decision.
export function routeWrite(scope, decision, w) {
  let s = scope;
  if (w.scope === 'after') {
    const a = decision && decision.scope_after;
    const row = a && (decision.writes || []).find(x => x.store === 'pilotSessions' && x.op === 'put' && x.value && x.value.participant_id === a.participant_id);
    if (!a || scope.kind !== 'ORDINARY' || !row || !sessionIsActive(row.value) || row.value.pilot_session_id !== a.pilot_session_id)
      throw new ScopeError('ILLEGAL_SCOPE_AFTER');
    s = pilotScope(a.participant_id, a.pilot_session_id);
  }
  switch (w.store) {
    case 'global': {
      if (!GLOBAL_META_KEYS.includes(w.key) && !String(w.key).startsWith(PILOT_RECEIPT_PREFIX)) throw new ScopeError('NOT_A_GLOBAL_KEY', String(w.key));
      if (scope.kind === 'AFM') throw new ScopeError('GLOBAL_WRITE_IN_AFM');
      return [w.op === 'delete' ? { store: 'meta', op: 'delete', key: w.key } : { store: 'meta', op: w.op, value: { key: w.key, value: w.value } }];
    }
    case 'meta': {
      if (s.prefix == null) throw new ScopeError('UNRESOLVED_SCOPE_WRITE');
      if (GLOBAL_META_KEYS.includes(w.key)) throw new ScopeError('GLOBAL_KEY_AS_SCOPED', w.key);
      const key = `${s.prefix}${w.key}`;
      return [w.op === 'delete' ? { store: 'meta', op: 'delete', key } : { store: 'meta', op: w.op, value: { key, value: w.value } }];
    }
    case 'state': case 'events': {
      if (!s.stores) throw new ScopeError('UNRESOLVED_SCOPE_WRITE');
      return [{ store: s.stores[w.store], op: w.op, value: stamp(s, w.value) }];
    }
    case 'pilotSessions': case 'pilotAdmin': {
      if (scope.kind === 'AFM') throw new ScopeError('PILOT_WRITE_IN_AFM');
      return [w.op === 'delete' ? { store: w.store, op: 'delete', key: w.key } : { store: w.store, op: w.op, value: w.value }];
    }
    case 'purge': {
      if (!(scope.kind === 'PILOT' || scope.kind === 'UNRESOLVED') || scope.participant_id !== w.participant_id || !PARTICIPANT_ID_RE.test(String(w.participant_id)))
        throw new ScopeError('PURGE_NOT_AUTHORIZED');
      const k = participantKeyRange(w.participant_id), m = participantMetaRange(w.participant_id);
      return [{ store: 'pilotLearnerState', op: 'deleteRange', range: k }, { store: 'pilotEvents', op: 'deleteRange', range: k },
        { store: 'meta', op: 'deleteRange', range: m }];
    }
    default: throw new ScopeError('UNKNOWN_WRITE_STORE', String(w.store));
  }
}
