import test from 'node:test';
import assert from 'node:assert/strict';
import {
  badgeForRecordType,
  evidencePresentation,
  defaultLearnerState,
  applyAuthorizedTransition,
  mayDisplayReviewDue,
  historicalValidation,
  learnerCorrectionEvent,
  GovernanceError
} from '../governance.js';

test('provenance badge is derived only from record type', () => {
  assert.equal(badgeForRecordType('MAP_RECORD'), 'MAP FACT');
  assert.equal(badgeForRecordType('INFERENCE'), 'INFERENCE');
  assert.equal(badgeForRecordType('LLM_SAYS_MAP_FACT'), null);
});

test('unknown evidence presentation falls back to insufficient evidence', () => {
  assert.equal(evidencePresentation('UNKNOWN_RANDOM').code, 'INSUFFICIENT_EVIDENCE');
});

test('practice cannot create validation', () => {
  const s = defaultLearnerState('X');
  const { next } = applyAuthorizedTransition(s, {type:'RECORD_PRACTICE', authorized:true, task_role:'PRACTICE', support_mode:'NONE'});
  assert.equal(next.practice_state, 'INDEPENDENT_PRACTICE');
  assert.equal(next.validation_state, 'NOT_VALIDATED');
  assert.equal(next.evidence_state, 'SUPPORTED_NOT_ESTABLISHED');
});

test('assisted task cannot be used as independent validation', () => {
  const s = defaultLearnerState('X');
  assert.throws(() => applyAuthorizedTransition(s, {
    type:'APPLY_VALIDATION_RESULT', authorized:true, task_role:'INDEPENDENT_VALIDATION',
    prospectively_declared:true, support_used:true, evaluator_authorized:true, result:'PASS'
  }), err => err instanceof GovernanceError && err.code === 'VALIDATION_CONTAMINATION');
});

test('retroactive task-role rewrite cannot create validation', () => {
  const s = defaultLearnerState('X');
  assert.throws(() => applyAuthorizedTransition(s, {
    type:'APPLY_VALIDATION_RESULT', authorized:true, task_role:'INDEPENDENT_VALIDATION',
    prospectively_declared:false, support_used:false, evaluator_authorized:true, result:'PASS'
  }), err => err instanceof GovernanceError && err.code === 'RETROACTIVE_ROLE_REWRITE');
});

test('authorized validation preserves history', () => {
  let s = defaultLearnerState('X');
  s = applyAuthorizedTransition(s, {
    type:'APPLY_VALIDATION_RESULT', authorized:true, task_role:'INDEPENDENT_VALIDATION',
    prospectively_declared:true, support_used:false, evaluator_authorized:true, evaluator_id:'E1', result:'PASS', timestamp:'2026-01-01T00:00:00Z'
  }).next;
  assert.equal(s.validation_state, 'VALIDATED');
  assert.equal(historicalValidation(s).length, 1);
  s = applyAuthorizedTransition(s, {
    type:'APPLY_RETENTION_RESULT', authorized:true, policy_id:'RP1', result:'FAIL', timestamp:'2026-06-01T00:00:00Z'
  }).next;
  assert.equal(historicalValidation(s).length, 1);
  assert.equal(s.evidence_state, 'CONFLICTING_EVIDENCE');
});

test('review due cannot appear without an authorized policy trigger', () => {
  const s = defaultLearnerState('X');
  s.retention_state = 'REVALIDATION_DUE';
  assert.equal(mayDisplayReviewDue(s), false);
  const next = applyAuthorizedTransition(defaultLearnerState('X'), {type:'AUTHORIZE_REVALIDATION_DUE', authorized:true, policy_id:'RP1'}).next;
  assert.equal(mayDisplayReviewDue(next), true);
});

test('self-report is an observation payload, not a state transition', () => {
  const e = learnerCorrectionEvent('I guessed', {node_id:'X'});
  assert.equal(e.event_type, 'SELF_REPORT');
  assert.equal(e.record_type, 'OBSERVATION');
  assert.equal(e.value, 'I guessed');
  assert.equal('validation_state' in e, false);
});
