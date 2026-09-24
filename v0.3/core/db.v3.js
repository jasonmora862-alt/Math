// TNPO/MSVO v0.3 — Persistence layer. [V03-FLOW-030..034, V03-GOV-013, H_c^(4) contract §2/§4, H_c^(5) contract §3/§4]
// - ONE shared connection per page; versionchange/unexpected close -> connection retired + honest UI state.
// - DB_VERSION 2 (H_c^(5) C2 plan): adds participant-keyed pilot stores + the minimal withdrawal-record store; no
//   existing store/keyPath changes; the upgrade only ADDS derived exposure indexes rebuilt from existing ledgers.
// - `governedTx` is the single write path for governed actions: ONE readwrite transaction whose scope always
//   includes `meta`, transaction-bound reads (request callbacks only), a PURE synchronous decide(), writes queued
//   in the same callback, success declared only on `oncomplete`.
// - DATA_SCOPE (core/scope.v3.js) is resolved INSIDE every transaction — governed or read-only — from global
//   `active_pilot` + that participant's session row. Every learner read and write is confined to that scope at this
//   boundary; views never filter someone else's records. [INV-P1/P2]
import { txStores, readStores, resolveScope, routeWrite, strip, participantKeyRange, participantMetaRange, GLOBAL_META_KEYS } from './scope.v3.js';
import { exposureFromLedger } from './governance.v3.js';

const DB_NAME = 'tnpo-msvo-navigator-v0_3';
export const DB_VERSION = 2;

let _db = null, _opening = null, _retired = null;
const listeners = new Set();
export function onStateChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(detail) { for (const fn of [...listeners]) { try { fn(detail); } catch (e) { console.error(e); } } }

export function connectionStatus() { return _retired ? { ok: false, reason: _retired } : { ok: true }; }

// C2 upgrade (versionchange transaction). Creates missing stores; from v1 it additionally rebuilds the validation
// exposure index of the ordinary and AFM scopes from their persisted ledgers (history preservation, F-03).
function upgrade(db, tx, oldVersion) {
  for (const [s, keyPath] of [['learnerState', 'node_id'], ['events', 'event_id'], ['meta', 'key'],
    ['afmLearnerState', 'node_id'], ['afmEvents', 'event_id'], ['pilotSessions', 'participant_id'],
    ['pilotLearnerState', ['participant_id', 'node_id']], ['pilotEvents', ['participant_id', 'event_id']], ['pilotAdmin', 'participant_id']])
    if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath });
  if (oldVersion >= 1 && oldVersion < 2) {
    for (const [ns, ev, st] of [['', 'events', 'learnerState'], ['afm::', 'afmEvents', 'afmLearnerState']]) {
      const meta = tx.objectStore('meta');
      meta.get(`${ns}task_exposure`).onsuccess = (g) => {
        if (g.target.result) return;
        tx.objectStore(ev).getAll().onsuccess = (a) => {
          const events = a.target.result || [];
          tx.objectStore(st).getAll().onsuccess = (b) => {
            const X = exposureFromLedger(events, b.target.result || []);
            if (Object.keys(X.items).length) meta.put({ key: `${ns}task_exposure`, value: { ...X, migrated_from_db_version: oldVersion } });
          };
        };
      };
    }
  }
}

export function openDB() {
  if (_retired) return Promise.reject(new Error(_retired));
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;
  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgrade(req.result, req.transaction, e.oldVersion || 0);
    req.onblocked = () => emit({ kind: 'db', status: 'blocked' });
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch (_) {} retire('DB_VERSION_CHANGED_ELSEWHERE'); };
      db.onclose = () => retire('DB_CLOSED_UNEXPECTEDLY');
      _db = db; _opening = null; resolve(db);
    };
    req.onerror = () => { _opening = null; reject(req.error); };
  });
  return _opening;
}
function retire(reason) { _db = null; _opening = null; _retired = reason; emit({ kind: 'db', status: 'retired', reason }); }

// ---- namespaces (AFM is a per-page mode; the pilot scope is persisted and resolved per transaction) ----
let AFM = false;
export function setAFM(on) { AFM = !!on; emit({ kind: 'afm', afm: AFM }); }
export function isAFM() { return AFM; }
export function currentNS() { return AFM ? 'afm::' : ''; }

// ---- test-only fault seam (exposed to tests only under ?test=1 via app.js) ----
//   'early' : refuse before opening the transaction   'mid' : queue every write, then abort the real transaction
let FAIL_MODE = null;
export function __setFailWrites(v) { FAIL_MODE = (v === 'mid') ? 'mid' : (v ? 'early' : null); }

function reqCb(r, ok, fail) { r.onsuccess = () => ok(r.result); r.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); fail(r.error); }; }
const range = (r) => IDBKeyRange.bound(r.lower, r.upper);

// Resolve the DATA_SCOPE inside `tx` (which must include meta, and pilotSessions outside AFM).
function scopeInTx(tx, afm, cb, fail, extraGlobal = []) {
  const g = {};
  const keys = [...new Set([...GLOBAL_META_KEYS, ...extraGlobal.filter(Boolean)])];
  let n = keys.length;
  const meta = tx.objectStore('meta');
  const after = () => {
    if (afm || !g.active_pilot) return cb(resolveScope({ afm, activePilot: afm ? null : g.active_pilot }), g, null);
    reqCb(tx.objectStore('pilotSessions').get(g.active_pilot), (row) => cb(resolveScope({ afm, activePilot: g.active_pilot, sessionRow: row || null }), g, row || null), fail);
  };
  for (const k of keys) reqCb(meta.get(k), (r) => { g[k] = r ? r.value : undefined; if (--n === 0) after(); }, fail);
}
// All learner-state rows of the resolved scope (participant rows by key range; each re-checked by strip()).
function readStatesInTx(tx, scope, cb, fail) {
  if (!scope.stores) return cb([]);
  const st = tx.objectStore(scope.stores.state);
  reqCb(scope.kind === 'PILOT' ? st.getAll(range(participantKeyRange(scope.participant_id))) : st.getAll(), (rows) => {
    try { cb(rows.map(r => strip(scope, r))); } catch (e) { fail(e); }
  }, fail);
}

// governedTx(ns, opts, plan, decide)
//   plan.phase0?(): { global:[key...] }                     (global meta keys, unprefixed)
//   plan.phase1(): { meta:[key...] }                         (learner meta keys, un-prefixed; the scope prefix is applied here)
//   plan.phase2(r1): { meta:[key...], pilotKey?, adminKey? }
//   decide(reads) -> { outcome, writes:[…], result, scope_after? }   reads = { scope, global, meta, states, activeRow, pilot, admin }
// Resolves { outcome, result, reason } — never rejects.
export async function governedTx(ns, opts, plan, decide) {
  if (FAIL_MODE === 'early') return { outcome: 'PERSISTENCE_ABORTED', reason: 'SIMULATED_STORAGE_FAILURE' };
  let db;
  try { db = await openDB(); } catch (e) { return { outcome: 'PERSISTENCE_ABORTED', reason: String(e && e.message || e) }; }
  const afm = !!ns;
  return new Promise((resolve) => {
    let tx, decision = null, settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    try { tx = db.transaction(txStores(afm), 'readwrite'); } catch (e) { return done({ outcome: 'PERSISTENCE_ABORTED', reason: String(e.message) }); }
    tx.oncomplete = () => done(decision || { outcome: 'PERSISTENCE_ABORTED', reason: 'NO_DECISION' });
    tx.onabort = () => {
      const wrote = decision && decision.writes && decision.writes.length;
      const err = tx.error;
      if (!wrote && decision) return done(decision);                  // read-only verdict stands
      done({ outcome: 'PERSISTENCE_ABORTED', reason: err ? `${err.name}` : 'TRANSACTION_ABORTED', constraint: !!(err && err.name === 'ConstraintError') });
    };
    tx.onerror = () => { /* abort follows; handled in onabort */ };
    const reads = { scope: null, global: {}, meta: {}, states: {}, activeRow: null, pilot: undefined, admin: undefined };
    const fail = (err) => { if (err) console.error(err); decision = null; try { tx.abort(); } catch (_) {} };
    const readMeta = (keys, cb) => {
      const ks = [...new Set(keys.filter(Boolean))]; let n = ks.length;
      if (!n || reads.scope.prefix == null) return cb();              // UNRESOLVED scope: no learner meta is readable
      const store = tx.objectStore('meta');
      for (const k of ks) reqCb(store.get(`${reads.scope.prefix}${k}`), (r) => { reads.meta[k] = r ? r.value : undefined; if (--n === 0) cb(); }, fail);
    };
    try {
      const p0 = plan.phase0 ? (plan.phase0() || {}) : {};
      scopeInTx(tx, afm, (scope, g, row) => {
        reads.scope = scope; reads.global = g; reads.activeRow = row;
        const p1 = plan.phase1();
        let pending = 2;
        const afterPhase1 = () => {
          if (--pending) return;
          const p2 = plan.phase2(reads) || {};
          const finish = () => {
            try {
              decision = decide(reads) || { outcome: 'GOVERNED_HOLD', writes: [], result: { reason: 'NO_DECISION' } };
              decision.writes = decision.writes || [];
              const ops = decision.writes.flatMap(w => routeWrite(scope, decision, w));   // throws => abort (fail closed)
              for (const o of ops) {
                const st = tx.objectStore(o.store);
                if (o.op === 'add') st.add(o.value);
                else if (o.op === 'delete') st.delete(o.key);
                else if (o.op === 'deleteRange') st.delete(range(o.range));
                else st.put(o.value);
              }
              if (FAIL_MODE === 'mid' && decision.writes.length) tx.abort();
            } catch (e) { console.error(e); decision = null; try { tx.abort(); } catch (_) {} }
          };
          const pk = afm ? null : p2.pilotKey, ak = afm ? null : p2.adminKey;
          let p2n = 1 + (pk ? 1 : 0) + (ak ? 1 : 0);
          const step = () => { if (--p2n === 0) finish(); };
          readMeta(p2.meta || [], step);
          if (pk) reqCb(tx.objectStore('pilotSessions').get(pk), (r) => { reads.pilot = r || null; step(); }, fail);
          if (ak) reqCb(tx.objectStore('pilotAdmin').get(ak), (r) => { reads.admin = r || null; step(); }, fail);
        };
        readMeta(p1.meta || [], afterPhase1);
        readStatesInTx(tx, scope, (rows) => { for (const r of rows) reads.states[r.node_id] = r; afterPhase1(); }, fail);
      }, fail, p0.global || []);
    } catch (e) { console.error(e); try { tx.abort(); } catch (_) {} }
  }).then((r) => { if (r.outcome === 'COMMITTED') emit({ kind: 'commit', ns }); return r; });
}

// ---- read-only projections (never used for authority) — each resolves the DATA_SCOPE in its own transaction ----
function scopedRead(fn) {
  const afm = AFM;
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(readStores(afm), 'readonly');
    const fail = (e) => rej(e);
    scopeInTx(tx, afm, (scope, g) => {
      try { fn(tx, scope, g, res, fail); } catch (e) { fail(e); }
    }, fail);
  }));
}
export function getScope() { return scopedRead((tx, s, g, res) => res({ kind: s.kind, token: s.token, participant_id: s.participant_id || null })); }
export function getLearnerState(nodeId) {
  return scopedRead((tx, s, g, res, fail) => {
    if (!s.stores) return res(undefined);
    const key = s.kind === 'PILOT' ? [s.participant_id, nodeId] : nodeId;
    reqCb(tx.objectStore(s.stores.state).get(key), (r) => { try { res(r ? strip(s, r) : undefined); } catch (e) { fail(e); } }, fail);
  });
}
export function listLearnerStates() { return scopedRead((tx, s, g, res, fail) => readStatesInTx(tx, s, res, fail)); }
// Global keys (pilot lifecycle coordination) are read unprefixed; every other key is a learner key of the scope.
export function getMeta(key, fallback = null) {
  return scopedRead((tx, s, g, res, fail) => {
    if (GLOBAL_META_KEYS.includes(key)) return res(g[key] === undefined || g[key] === null ? fallback : g[key]);
    if (s.prefix == null) return res(fallback);
    reqCb(tx.objectStore('meta').get(`${s.prefix}${key}`), (r) => res(r ? r.value : fallback), fail);
  });
}
export function getGlobalMeta(key, fallback = null) {
  return GLOBAL_META_KEYS.includes(key) ? getMeta(key, fallback) : Promise.reject(new Error(`not a global key: ${key}`));
}
// Canonical ledger order: (commit_seq, event_ordinal); legacy (unsequenced) events first by timestamp.
export function ledgerOrder(a, b) {
  const sa = Number.isInteger(a.commit_seq) ? a.commit_seq : -1, sb = Number.isInteger(b.commit_seq) ? b.commit_seq : -1;
  if (sa !== sb) return sa - sb;
  if (sa === -1) return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
  return (a.event_ordinal || 0) - (b.event_ordinal || 0);
}
export function getEvents() {
  return scopedRead((tx, s, g, res, fail) => {
    if (!s.stores) return res([]);
    const st = tx.objectStore(s.stores.events);
    reqCb(s.kind === 'PILOT' ? st.getAll(range(participantKeyRange(s.participant_id))) : st.getAll(), (rows) => {
      try { res(rows.map(r => strip(s, r)).sort(ledgerOrder)); } catch (e) { fail(e); }
    }, fail);
  });
}
export function getPilotSession(pid) {
  return openDB().then(db => new Promise((res, rej) => { const r = db.transaction('pilotSessions', 'readonly').objectStore('pilotSessions').get(pid); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
}

// Forensic footprint of ONE participant after a lifecycle commit (fresh read-only transaction). Counts only; the
// translation layer states retention from these numbers, never from what the code intended to delete. [INV-P4]
export function participantFootprint(pid) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(['pilotLearnerState', 'pilotEvents', 'meta', 'pilotSessions', 'pilotAdmin', 'learnerState', 'events'], 'readonly');
    const out = {}; let n = 7;
    const set = (k) => (v) => { out[k] = v; if (--n === 0) res(out); };
    const k = range(participantKeyRange(pid)), m = range(participantMetaRange(pid));
    reqCb(tx.objectStore('pilotLearnerState').count(k), set('learner_states'), rej);
    reqCb(tx.objectStore('pilotEvents').count(k), set('events'), rej);
    reqCb(tx.objectStore('meta').count(m), set('meta_records'), rej);
    reqCb(tx.objectStore('pilotSessions').get(pid), (r) => set('session_record')(r ? { withdrawn_at: r.withdrawn_at || null, completed_at: r.completed_at || null, data_disposition: r.data_disposition || null } : null), rej);
    reqCb(tx.objectStore('pilotAdmin').get(pid), (r) => set('withdrawal_record')(r ? { ...r } : null), rej);
    // participant ownership never lands in ordinary stores: count ordinary rows that claim this participant
    reqCb(tx.objectStore('learnerState').getAll(), (rows) => set('ordinary_state_rows_claiming')(rows.filter(x => x && x.participant_id === pid).length), rej);
    reqCb(tx.objectStore('events').getAll(), (rows) => set('ordinary_events_claiming')(rows.filter(x => x && x.participant_id === pid).length), rej);
  }));
}

// Reset the AFM namespace only (never touches ordinary learner or pilot data). [V03-AUDIT-010]
export async function resetAFM() {
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(['afmLearnerState', 'afmEvents', 'meta'], 'readwrite');
    tx.objectStore('afmLearnerState').clear(); tx.objectStore('afmEvents').clear();
    tx.objectStore('meta').delete(IDBKeyRange.bound('afm::', 'afm::￿'));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
  emit({ kind: 'afm-reset' });
}
