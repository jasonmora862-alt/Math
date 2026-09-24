// TNPO/MSVO v0.3 — Universal visible-feedback contract. [V03-UX-001..004, V03-UX-020..023]
// EVERY learner action -> a VISIBLE acknowledgement (toast) PLUS an additive sr-only announcement.
// Never sr-only alone. Never asserts mastery/validation not produced by runtime authority.
// Feedback is ACTION-SCOPED: each toast carries the LOGICAL_ACTION_ID that produced it, so feedback for one
// action can never satisfy or fail a check about another action. [H_c^(4) contract INV-E1]

let _root = null, _live = null, _counter = 0;
const _byAction = new Map();   // logical_action_id -> [{ seq, kind, message }]

export function initFeedback({ toastRoot, liveRegion }) { _root = toastRoot; _live = liveRegion; }

// kind: 'success' | 'info' | 'refusal'
export function feedback(message, kind = 'info', { actionId = null } = {}) {
  _counter++;
  if (actionId) { if (!_byAction.has(actionId)) _byAction.set(actionId, []); _byAction.get(actionId).push({ seq: _counter, kind, message }); }
  if (_root) {
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.setAttribute('role', kind === 'refusal' ? 'alert' : 'status');
    if (actionId) el.dataset.actionId = actionId;
    el.dataset.seq = String(_counter);
    el.innerHTML = `<span class="toast-dot"></span><span class="toast-msg"></span><span class="toast-seq"></span>`;
    el.querySelector('.toast-msg').textContent = message;
    el.querySelector('.toast-seq').textContent = `#${_counter}`;
    _root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4200);
    while (_root.children.length > 4) _root.firstChild.remove();
  }
  if (_live) { _live.textContent = ''; setTimeout(() => { _live.textContent = message; }, 20); }
  return _counter;
}

export function feedbackCount() { return _counter; }
export function feedbackFor(actionId) { return (_byAction.get(actionId) || []).slice(); }
// Test isolation only: clears the toast DOM, live region and action log (never called on an ordinary path).
export function __resetFeedback() { if (_root) _root.innerHTML = ''; if (_live) _live.textContent = ''; _byAction.clear(); }
