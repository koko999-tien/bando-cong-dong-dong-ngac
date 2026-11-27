/**
 * OPEN RESILIENCE INTELLIGENCE PLATFORM — OPERATIONS COMMAND & ALERT WORKFLOW STATE MACHINE
 * Quy trình chuẩn 8 bước:
 * DATA_DETECTED -> RISK_ANALYSIS -> HUMAN_VERIFICATION -> ALERT_APPROVED ->
 * DISTRIBUTED -> ACKNOWLEDGED -> CLOSED -> AFTER_ACTION_REPORT
 *
 * Phân tách rõ 3 kênh cảnh báo: automatic | community | official_verified.
 * Bắt buộc xác minh & phê duyệt người thật (có MFA + đúng phạm vi vùng) cho cảnh báo official_verified.
 */

import { authorize, PERMISSIONS } from '../security/rbac.js';

export const ALERT_CHANNELS = Object.freeze({
  AUTOMATIC: 'automatic',
  COMMUNITY: 'community',
  OFFICIAL_VERIFIED: 'official_verified'
});

export const WORKFLOW_STATES = Object.freeze({
  DATA_DETECTED: 'DATA_DETECTED',
  RISK_ANALYSIS: 'RISK_ANALYSIS',
  HUMAN_VERIFICATION: 'HUMAN_VERIFICATION',
  ALERT_APPROVED: 'ALERT_APPROVED',
  DISTRIBUTED: 'DISTRIBUTED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  CLOSED: 'CLOSED',
  AFTER_ACTION_REPORT: 'AFTER_ACTION_REPORT'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [WORKFLOW_STATES.DATA_DETECTED]: [WORKFLOW_STATES.RISK_ANALYSIS, WORKFLOW_STATES.CLOSED],
  [WORKFLOW_STATES.RISK_ANALYSIS]: [WORKFLOW_STATES.HUMAN_VERIFICATION, WORKFLOW_STATES.CLOSED],
  [WORKFLOW_STATES.HUMAN_VERIFICATION]: [WORKFLOW_STATES.ALERT_APPROVED, WORKFLOW_STATES.CLOSED],
  [WORKFLOW_STATES.ALERT_APPROVED]: [WORKFLOW_STATES.DISTRIBUTED, WORKFLOW_STATES.CLOSED],
  [WORKFLOW_STATES.DISTRIBUTED]: [WORKFLOW_STATES.ACKNOWLEDGED, WORKFLOW_STATES.CLOSED],
  [WORKFLOW_STATES.ACKNOWLEDGED]: [WORKFLOW_STATES.CLOSED],
  [WORKFLOW_STATES.CLOSED]: [WORKFLOW_STATES.AFTER_ACTION_REPORT],
  [WORKFLOW_STATES.AFTER_ACTION_REPORT]: []
});

export function createAlertIncident({
  id,
  regionId,
  channel = ALERT_CHANNELS.COMMUNITY,
  severity = 'yellow',
  title,
  summary,
  dataClasses = [],
  detectedBy = 'system'
}) {
  if (!regionId) throw new Error('Thiếu regionId khi khởi tạo sự cố cảnh báo.');
  if (!Object.values(ALERT_CHANNELS).includes(channel)) {
    throw new Error(`Kênh cảnh báo không hợp lệ: ${channel}`);
  }
  const nowIso = new Date().toISOString();
  return {
    id: id || `INC-${Date.now().toString(36).toUpperCase()}`,
    regionId,
    channel,
    severity: ['info', 'yellow', 'red'].includes(severity) ? severity : 'yellow',
    title: String(title || '').trim(),
    summary: String(summary || '').trim(),
    dataClasses: [...new Set(dataClasses)],
    state: WORKFLOW_STATES.DATA_DETECTED,
    verifiedBy: null,
    approvedBy: null,
    afterActionReport: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    history: [
      {
        fromState: null,
        toState: WORKFLOW_STATES.DATA_DETECTED,
        actorId: detectedBy,
        actorRole: 'system',
        at: nowIso,
        note: 'Phát hiện tín hiệu rủi ro ban đầu'
      }
    ]
  };
}

export function transitionAlertState(incident, nextState, { principal, note = '', afterActionReport = null } = {}) {
  if (!incident || !WORKFLOW_STATES[incident.state]) {
    throw new Error('Trạng thái sự cố hiện tại không hợp lệ.');
  }
  const allowedNext = ALLOWED_TRANSITIONS[incident.state] || [];
  if (!allowedNext.includes(nextState)) {
    throw new Error(`Không được chuyển trực tiếp từ ${incident.state} sang ${nextState}.`);
  }

  // Tuyệt đối cấm AI tự xác minh hoặc tự phê duyệt/phát cảnh báo chính thức
  if (
    principal?.isAi &&
    [WORKFLOW_STATES.HUMAN_VERIFICATION, WORKFLOW_STATES.ALERT_APPROVED, WORKFLOW_STATES.DISTRIBUTED].includes(nextState)
  ) {
    throw new Error('AI không được phép tự xác minh, phê duyệt hoặc phát cảnh báo chính thức.');
  }

  if (nextState === WORKFLOW_STATES.HUMAN_VERIFICATION) {
    const auth = authorize(principal, PERMISSIONS.ALERT_VERIFY_HUMAN, { regionId: incident.regionId });
    if (!auth.allowed) throw new Error(`Từ chối xác minh hiện trường: ${auth.reason}`);
  }

  if (nextState === WORKFLOW_STATES.ALERT_APPROVED || nextState === WORKFLOW_STATES.DISTRIBUTED) {
    if (incident.channel === ALERT_CHANNELS.OFFICIAL_VERIFIED) {
      if (!incident.verifiedBy) {
        throw new Error('Cảnh báo official_verified bắt buộc có bước HUMAN_VERIFICATION trước khi phê duyệt/phát.');
      }
      const auth = authorize(principal, PERMISSIONS.ALERT_APPROVE_OFFICIAL, { regionId: incident.regionId });
      if (!auth.allowed) throw new Error(`Từ chối phê duyệt cảnh báo chính thức: ${auth.reason}`);
    }
  }

  if (nextState === WORKFLOW_STATES.AFTER_ACTION_REPORT && (!afterActionReport || String(afterActionReport).trim().length < 20)) {
    throw new Error('Bước AFTER_ACTION_REPORT yêu cầu nội dung báo cáo hậu kiểm tối thiểu 20 ký tự.');
  }

  const nowIso = new Date().toISOString();
  const nextIncident = {
    ...incident,
    state: nextState,
    updatedAt: nowIso,
    verifiedBy: nextState === WORKFLOW_STATES.HUMAN_VERIFICATION ? principal.userId || principal.role : incident.verifiedBy,
    approvedBy: nextState === WORKFLOW_STATES.ALERT_APPROVED ? principal.userId || principal.role : incident.approvedBy,
    afterActionReport: nextState === WORKFLOW_STATES.AFTER_ACTION_REPORT ? String(afterActionReport).trim() : incident.afterActionReport,
    history: [
      ...incident.history,
      {
        fromState: incident.state,
        toState: nextState,
        actorId: principal?.userId || 'system',
        actorRole: principal?.role || 'system',
        at: nowIso,
        note: String(note || '').trim()
      }
    ]
  };
  return nextIncident;
}
