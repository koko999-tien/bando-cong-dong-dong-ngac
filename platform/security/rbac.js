/**
 * OPEN RESILIENCE INTELLIGENCE PLATFORM — REGION-SCOPED RBAC (5 ROLES)
 * Đóng triệt để lỗ hổng leo thang tin cậy (không bao giờ cho phép client ẩn danh tự nhận Hạng A).
 */

export const ROLES = Object.freeze({
  CITIZEN: 'citizen',
  FIELD_VERIFIER: 'field_verifier',
  RESEARCHER: 'researcher',
  WARD_OPERATOR: 'ward_operator',
  SUPER_ADMIN: 'super_admin'
});

export const PERMISSIONS = Object.freeze({
  MAP_READ_PUBLIC: 'map:read_public',
  REPORT_SUBMIT_PUBLIC: 'report:submit_public',
  REPORT_CONFIRM_PUBLIC: 'report:confirm_public',
  LIVE_CHECKIN_SUBMIT: 'live_checkin:submit',
  REPORT_SUBMIT_VERIFIED_FIELD: 'report:submit_verified_field',
  REPORT_MODERATE: 'report:moderate',
  REPORT_DELETE: 'report:delete',
  DATASET_EXPORT_RESEARCH: 'dataset:export_research',
  AI_QUERY_PUBLIC: 'ai:query_public',
  AI_QUERY_RESEARCH: 'ai:query_research',
  ALERT_DRAFT: 'alert:draft',
  ALERT_VERIFY_HUMAN: 'alert:verify_human',
  ALERT_APPROVE_OFFICIAL: 'alert:approve_official',
  AUDIT_LOG_READ: 'audit_log:read',
  REGION_CONFIG_MANAGE: 'region_config:manage',
  RBAC_MANAGE: 'rbac:manage',
  AI_PROVIDER_CONFIGURE: 'ai_provider:configure'
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.CITIZEN]: Object.freeze([
    PERMISSIONS.MAP_READ_PUBLIC,
    PERMISSIONS.REPORT_SUBMIT_PUBLIC,
    PERMISSIONS.REPORT_CONFIRM_PUBLIC,
    PERMISSIONS.LIVE_CHECKIN_SUBMIT,
    PERMISSIONS.AI_QUERY_PUBLIC
  ]),
  [ROLES.FIELD_VERIFIER]: Object.freeze([
    PERMISSIONS.MAP_READ_PUBLIC,
    PERMISSIONS.REPORT_SUBMIT_PUBLIC,
    PERMISSIONS.REPORT_CONFIRM_PUBLIC,
    PERMISSIONS.LIVE_CHECKIN_SUBMIT,
    PERMISSIONS.REPORT_SUBMIT_VERIFIED_FIELD,
    PERMISSIONS.AI_QUERY_PUBLIC,
    PERMISSIONS.ALERT_VERIFY_HUMAN
  ]),
  [ROLES.RESEARCHER]: Object.freeze([
    PERMISSIONS.MAP_READ_PUBLIC,
    PERMISSIONS.DATASET_EXPORT_RESEARCH,
    PERMISSIONS.AI_QUERY_PUBLIC,
    PERMISSIONS.AI_QUERY_RESEARCH
  ]),
  [ROLES.WARD_OPERATOR]: Object.freeze([
    PERMISSIONS.MAP_READ_PUBLIC,
    PERMISSIONS.REPORT_SUBMIT_PUBLIC,
    PERMISSIONS.REPORT_SUBMIT_VERIFIED_FIELD,
    PERMISSIONS.REPORT_MODERATE,
    PERMISSIONS.REPORT_DELETE,
    PERMISSIONS.DATASET_EXPORT_RESEARCH,
    PERMISSIONS.AI_QUERY_PUBLIC,
    PERMISSIONS.AI_QUERY_RESEARCH,
    PERMISSIONS.ALERT_DRAFT,
    PERMISSIONS.ALERT_VERIFY_HUMAN,
    PERMISSIONS.ALERT_APPROVE_OFFICIAL,
    PERMISSIONS.AUDIT_LOG_READ
  ]),
  [ROLES.SUPER_ADMIN]: Object.freeze(Object.values(PERMISSIONS))
});

const MFA_REQUIRED_PERMISSIONS = new Set([
  PERMISSIONS.ALERT_APPROVE_OFFICIAL,
  PERMISSIONS.REGION_CONFIG_MANAGE,
  PERMISSIONS.RBAC_MANAGE,
  PERMISSIONS.AI_PROVIDER_CONFIGURE,
  PERMISSIONS.REPORT_DELETE
]);

const REGION_SCOPED_ROLES = new Set([ROLES.FIELD_VERIFIER, ROLES.WARD_OPERATOR]);

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Kiểm tra phân quyền đầy đủ (vai trò + phạm vi vùng + yêu cầu MFA cho tác vụ nhạy cảm).
 * @param {{ userId?: string, role: string, authenticated?: boolean, mfaVerified?: boolean, regionIds?: string[] }} principal
 * @param {string} permission
 * @param {{ regionId?: string }} [context]
 */
export function authorize(principal, permission, context = {}) {
  const role = principal?.role || ROLES.CITIZEN;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) {
    return { allowed: false, reason: `Vai trò không hợp lệ: ${role}` };
  }

  // Mọi vai trò ngoài citizen bắt buộc đã xác thực phiên hợp lệ
  if (role !== ROLES.CITIZEN && !principal?.authenticated) {
    return { allowed: false, reason: 'Phiên chưa được xác thực cho vai trò đặc quyền.' };
  }

  if (!perms.includes(permission)) {
    return { allowed: false, reason: `Vai trò "${role}" không có quyền "${permission}".` };
  }

  if (MFA_REQUIRED_PERMISSIONS.has(permission) && !principal?.mfaVerified) {
    return { allowed: false, reason: `Tác vụ nhạy cảm "${permission}" yêu cầu xác thực đa yếu tố (MFA).` };
  }

  if (REGION_SCOPED_ROLES.has(role) && context?.regionId) {
    const allowedRegions = Array.isArray(principal?.regionIds) ? principal.regionIds : [];
    if (!allowedRegions.includes('*') && !allowedRegions.includes(context.regionId)) {
      return {
        allowed: false,
        reason: `Tài khoản không thuộc phạm vi quản trị vùng "${context.regionId}".`
      };
    }
  }

  return { allowed: true, role, permission };
}

/**
 * Quyết định hạng tin cậy & trạng thái duyệt ban đầu khi tiếp nhận báo cáo mới.
 * TUYỆT ĐỐI KHÔNG dựa vào chuỗi reporterRole tự khai từ client chưa xác thực (vá lỗ hổng SEC-01).
 */
export function resolveInitialReportTrust(principal, { regionId, photoQualityFlag = 'ok' } = {}) {
  const canSubmitFieldVerified = authorize(principal, PERMISSIONS.REPORT_SUBMIT_VERIFIED_FIELD, { regionId }).allowed;
  if (canSubmitFieldVerified && photoQualityFlag !== 'suspect_spam') {
    return {
      confidenceTier: 'A',
      status: 'approved',
      dataClass: 'OBSERVED_DATA',
      verifiedByRole: principal.role
    };
  }
  return {
    confidenceTier: 'C',
    status: 'pending',
    dataClass: 'COMMUNITY_REPORTS',
    verifiedByRole: null
  };
}
