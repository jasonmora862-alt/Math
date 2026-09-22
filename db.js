const DB_NAME = 'tnpo-msvo-navigator';
const DB_VERSION = 2;

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('learnerState')) db.createObjectStore('learnerState', { keyPath: 'node_id' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'event_id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pilotLearnerState')) {
        const store = db.createObjectStore('pilotLearnerState', { keyPath: 'pilot_state_id' });
        store.createIndex('participant_id', 'participant_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('pilotEvents')) {
        const store = db.createObjectStore('pilotEvents', { keyPath: 'event_id' });
        store.createIndex('participant_id', 'participant_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('pilotSessions')) db.createObjectStore('pilotSessions', { keyPath: 'participant_id' });
      if (!db.objectStoreNames.contains('pilotAdmin')) db.createObjectStore('pilotAdmin', { keyPath: 'admin_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getRecord(storeName, key) {
  const db = await openDB();
  return reqPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const db = await openDB();
  return reqPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function putRecord(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

/** Append-only: intentionally uses add(), never put(). */
export async function addRecord(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).add(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRecord(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function setMeta(key, value) {
  return putRecord('meta', { key, value, updated_at: new Date().toISOString() });
}

export async function getMeta(key, fallback = null) {
  const rec = await getRecord('meta', key);
  return rec ? rec.value : fallback;
}

export async function getActivePilotId() {
  return getMeta('active_pilot_participant', null);
}

function pilotStateKey(participantId, nodeId) {
  return `${participantId}::${nodeId}`;
}

export async function getLearnerState(nodeId) {
  const participantId = await getActivePilotId();
  if (participantId) {
    const rec = await getRecord('pilotLearnerState', pilotStateKey(participantId, nodeId));
    if (!rec) return null;
    const { pilot_state_id, participant_id, ...state } = rec;
    return state;
  }
  return getRecord('learnerState', nodeId);
}

export async function putLearnerState(state) {
  const participantId = await getActivePilotId();
  if (participantId) {
    return putRecord('pilotLearnerState', {
      ...state,
      pilot_state_id: pilotStateKey(participantId, state.node_id),
      participant_id: participantId
    });
  }
  return putRecord('learnerState', state);
}

export async function listLearnerStates() {
  const participantId = await getActivePilotId();
  if (!participantId) return getAll('learnerState');
  const all = await getAll('pilotLearnerState');
  return all.filter(x => x.participant_id === participantId).map(({ pilot_state_id, participant_id, ...state }) => state);
}

export async function appendEvent(type, payload = {}, options = {}) {
  const participantId = await getActivePilotId();
  const event = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    record_type: options.record_type || 'OBSERVATION',
    authorization_id: options.authorization_id || null,
    participant_id: participantId || null,
    payload
  };
  await addRecord(participantId ? 'pilotEvents' : 'events', event);
  return event;
}

export async function startPilotSession(participantId, consentVersion) {
  const existing = await getRecord('pilotSessions', participantId);
  if (existing && existing.withdrawn_at) throw new Error('This participant ID already has a withdrawn session. Use a new participant ID or a versioned replacement protocol.');
  const session = {
    participant_id: participantId,
    consent_obtained: true,
    consent_version: consentVersion,
    started_at: existing?.started_at || new Date().toISOString(),
    withdrawn_at: null,
    data_disposition: null,
    build_version: '0.2.0'
  };
  await putRecord('pilotSessions', session);
  await setMeta('active_pilot_participant', participantId);
  return session;
}

async function deleteByParticipant(storeName, participantId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const idx = store.index('participant_id');
    const req = idx.openCursor(IDBKeyRange.only(participantId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function withdrawPilotSession(participantId, disposition = 'DELETE_WHERE_FEASIBLE') {
  const session = await getRecord('pilotSessions', participantId);
  if (!session) throw new Error('Pilot session not found.');
  const withdrawnAt = new Date().toISOString();

  // Minimal administrative record is kept separately. It contains no learner-state inference.
  await addRecord('pilotAdmin', {
    admin_id: crypto.randomUUID(),
    participant_id: participantId,
    event: 'WITHDRAWAL',
    timestamp: withdrawnAt,
    data_disposition: disposition
  });

  if (disposition === 'DELETE_WHERE_FEASIBLE') {
    await deleteByParticipant('pilotEvents', participantId);
    await deleteByParticipant('pilotLearnerState', participantId);
    await deleteRecord('pilotSessions', participantId);
  } else {
    await putRecord('pilotSessions', { ...session, withdrawn_at: withdrawnAt, data_disposition: disposition });
  }

  const active = await getActivePilotId();
  if (active === participantId) await setMeta('active_pilot_participant', null);
}

export async function endPilotSessionWithoutWithdrawal(participantId) {
  const session = await getRecord('pilotSessions', participantId);
  if (!session) return;
  await putRecord('pilotSessions', { ...session, completed_at: new Date().toISOString() });
  const active = await getActivePilotId();
  if (active === participantId) await setMeta('active_pilot_participant', null);
}

export async function exportLocalData() {
  return {
    exported_at: new Date().toISOString(),
    personal: {
      learnerState: await getAll('learnerState'),
      events: await getAll('events')
    },
    pilot: {
      learnerState: await getAll('pilotLearnerState'),
      events: await getAll('pilotEvents'),
      sessions: await getAll('pilotSessions'),
      admin: await getAll('pilotAdmin')
    }
  };
}
