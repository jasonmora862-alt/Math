export const BUILD_VERSION = '0.2.0';

export const RECORD_BADGES = Object.freeze({
  MAP_RECORD: 'MAP FACT',
  OBSERVATION: 'OBSERVATION',
  INFERENCE: 'INFERENCE',
  DECISION: 'DECISION'
});

export const EVIDENCE_STATES = Object.freeze({
  ESTABLISHED: {
    code: 'ESTABLISHED',
    label: 'Established',
    description: 'This displayed claim is authoritative for its stated scope.'
  },
  SUPPORTED_NOT_ESTABLISHED: {
    code: 'SUPPORTED_NOT_ESTABLISHED',
    label: 'Supported, not established',
    description: 'Current evidence can support a reversible next step, but does not establish independent validation.'
  },
  CONFLICTING_EVIDENCE: {
    code: 'CONFLICTING_EVIDENCE',
    label: 'Conflicting evidence',
    description: 'Meaningful evidence currently supports incompatible interpretations.'
  },
  INSUFFICIENT_EVIDENCE: {
    code: 'INSUFFICIENT_EVIDENCE',
    label: 'Insufficient evidence',
    description: 'Current evidence is not adequate to license the stronger inference.'
  }
});

export const TASK_ROLES = Object.freeze({
  PRACTICE: {
    code: 'PRACTICE',
    label: 'Practice',
    preface: 'Hints or other support may be used. This task does not independently validate the topic.'
  },
  DIAGNOSTIC_CHECK: {
    code: 'DIAGNOSTIC_CHECK',
    label: 'Diagnostic check',
    preface: 'This task gathers evidence to distinguish possible explanations. It is not an independent validation task.'
  },
  INDEPENDENT_VALIDATION: {
    code: 'INDEPENDENT_VALIDATION',
    label: 'Independent validation',
    preface: 'No hints or outside help may be used for this task. A governed evaluator may use the result as validation evidence.'
  }
});

export function badgeForRecordType(recordType) {
  return RECORD_BADGES[recordType] || null;
}

export function evidencePresentation(code) {
  return EVIDENCE_STATES[code] || EVIDENCE_STATES.INSUFFICIENT_EVIDENCE;
}

export function taskRolePresentation(code) {
  return TASK_ROLES[code] || null;
}

export function defaultLearnerState(nodeId) {
  return {
    node_id: nodeId,
    exposure_state: 'UNEXPOSED',
    practice_state: 'NOT_PRACTICED',
    validation_state: 'NOT_VALIDATED',
    retention_state: 'NOT_ASSESSED',
    evidence_state: 'INSUFFICIENT_EVIDENCE',
    retention_trigger_authorized: false,
    retention_policy_id: null,
    validation_history: [],
    updated_at: null
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class GovernanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
  }
}

/**
 * The only supported learner-state mutation path.
 * Caller must append an immutable authorization/transition event after success.
 */
export function applyAuthorizedTransition(previousState, transition) {
  const prev = clone(previousState);
  const next = clone(previousState);
  const now = transition.timestamp || new Date().toISOString();

  switch (transition.type) {
    case 'RECORD_EXPOSURE': {
      if (!transition.authorized) throw new GovernanceError('UNAUTHORIZED_TRANSITION', 'Exposure transition requires authorization.');
      next.exposure_state = 'SEEN_AND_EXPLAINED';
      if (next.evidence_state === 'INSUFFICIENT_EVIDENCE') next.evidence_state = 'SUPPORTED_NOT_ESTABLISHED';
      break;
    }

    case 'RECORD_PRACTICE': {
      if (!transition.authorized) throw new GovernanceError('UNAUTHORIZED_TRANSITION', 'Practice transition requires authorization.');
      if (transition.task_role !== 'PRACTICE') throw new GovernanceError('ROLE_MISMATCH', 'Practice state can only be updated from a prospectively declared practice task.');
      if (transition.support_mode === 'NONE') next.practice_state = 'INDEPENDENT_PRACTICE';
      else next.practice_state = 'ASSISTED_PRACTICE';
      if (next.validation_state !== 'VALIDATED') next.evidence_state = 'SUPPORTED_NOT_ESTABLISHED';
      break;
    }

    case 'APPLY_VALIDATION_RESULT': {
      if (!transition.authorized) throw new GovernanceError('UNAUTHORIZED_TRANSITION', 'Validation transition requires runtime authorization.');
      if (transition.task_role !== 'INDEPENDENT_VALIDATION') throw new GovernanceError('VALIDATION_CONTAMINATION', 'Only a prospectively declared independent-validation task may create validation evidence.');
      if (!transition.prospectively_declared) throw new GovernanceError('RETROACTIVE_ROLE_REWRITE', 'Validation role must be declared before the learner responds.');
      if (transition.support_used) throw new GovernanceError('VALIDATION_CONTAMINATION', 'Assisted performance cannot be used as independent validation.');
      if (!transition.evaluator_authorized) throw new GovernanceError('UNAUTHORIZED_EVALUATOR', 'Validation requires an authorized evaluator.');

      const result = transition.result;
      next.validation_history = Array.isArray(next.validation_history) ? next.validation_history : [];
      next.validation_history.push({
        timestamp: now,
        result,
        task_id: transition.task_id || null,
        evaluator_id: transition.evaluator_id || null,
        policy_id: transition.policy_id || null
      });
      if (result === 'PASS') {
        next.validation_state = 'VALIDATED';
        next.evidence_state = 'ESTABLISHED';
        next.retention_state = 'NOT_ASSESSED';
        next.retention_trigger_authorized = false;
        next.retention_policy_id = null;
      } else if (result === 'FAIL') {
        // Historical validation is never deleted.
        next.validation_state = 'NOT_VALIDATED';
        next.evidence_state = 'SUPPORTED_NOT_ESTABLISHED';
      } else {
        throw new GovernanceError('INVALID_RESULT', 'Validation result must be PASS or FAIL.');
      }
      break;
    }

    case 'AUTHORIZE_REVALIDATION_DUE': {
      if (!transition.authorized || !transition.policy_id) throw new GovernanceError('UNAUTHORIZED_RETENTION_TRIGGER', 'Revalidation due requires an authorized, versioned policy.');
      next.retention_trigger_authorized = true;
      next.retention_policy_id = transition.policy_id;
      next.retention_state = 'REVALIDATION_DUE';
      break;
    }

    case 'APPLY_RETENTION_RESULT': {
      if (!transition.authorized || !transition.policy_id) throw new GovernanceError('UNAUTHORIZED_TRANSITION', 'Retention result requires an authorized, versioned policy.');
      if (transition.result === 'PASS') {
        next.retention_state = 'CURRENT';
        next.retention_trigger_authorized = false;
        next.retention_policy_id = transition.policy_id;
      } else if (transition.result === 'FAIL') {
        next.retention_state = 'RETENTION_CONCERN';
        next.evidence_state = 'CONFLICTING_EVIDENCE';
      } else {
        throw new GovernanceError('INVALID_RESULT', 'Retention result must be PASS or FAIL.');
      }
      break;
    }

    default:
      throw new GovernanceError('UNKNOWN_TRANSITION', `Unknown governed transition: ${transition.type}`);
  }

  next.updated_at = now;
  return { previous: prev, next };
}

export function mayDisplayReviewDue(state) {
  return state?.retention_state === 'REVALIDATION_DUE' && state?.retention_trigger_authorized === true;
}

export function historicalValidation(state) {
  const history = Array.isArray(state?.validation_history) ? state.validation_history : [];
  return history.filter(x => x.result === 'PASS');
}

export function learnerCorrectionEvent(value, context = {}) {
  return {
    event_type: 'SELF_REPORT',
    record_type: 'OBSERVATION',
    value,
    context
  };
}

export function deriveWhyPanel({ evidenceState, observations = [], uncertainty = '', decision = '', mapFact = '' }) {
  const evidence = evidencePresentation(evidenceState);
  return {
    evidence,
    know: mapFact,
    observed: observations,
    uncertain: uncertainty,
    decision
  };
}
