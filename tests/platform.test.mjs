import assert from 'node:assert/strict';
import path from 'node:path';
import {
  REGION_TIERS,
  DEFAULT_REGION_ID,
  getRegionConfig,
  resolveRegionForCoordinate,
  validateCoordinateInRegion,
  createRegionConfig,
  registerCustomRegion,
  unregisterCustomRegion
} from '../platform/regions/region-registry.js';
import {
  DATA_CLASSES,
  CORE_DATA_CATALOG,
  validateDatasetMetadata,
  summarizeDataClasses,
  getDataClassBadge
} from '../platform/data/provenance-catalog.js';
import {
  ROLES,
  PERMISSIONS,
  authorize,
  resolveInitialReportTrust
} from '../platform/security/rbac.js';
import {
  cleanText,
  hasSpamContent,
  validateImageDataUrl,
  isSafeSubpath,
  createBoundedRateLimiter
} from '../platform/security/validators.js';
import {
  PROVIDER_TYPES,
  AiProviderRouter,
  applyScientificGuardrails,
  createOfflineGroundedAdapter
} from '../platform/ai/provider-layer.js';
import {
  ALERT_CHANNELS,
  WORKFLOW_STATES,
  createAlertIncident,
  transitionAlertState
} from '../platform/operations/alert-workflow.js';

// =========================================================================
// 1. MULTI-REGION REGISTRY (4 TIERS — ZERO HARDCODED SINGLE-WARD COUPLING)
// =========================================================================
const tier1 = getRegionConfig(DEFAULT_REGION_ID);
const tier2 = getRegionConfig('vn-hn-bac-tu-liem-uni');
const tier3 = getRegionConfig('vn-hn-city');
assert.equal(tier1.tier, REGION_TIERS.TIER_1_WARD_CLUSTER);
assert.equal(tier2.tier, REGION_TIERS.TIER_2_DISTRICT_CLUSTER);
assert.equal(tier3.tier, REGION_TIERS.TIER_3_METROPOLITAN);

// Tọa độ tại HUMG phải phân giải vào vùng chi tiết nhất (Tier 1)
const resolvedHumg = resolveRegionForCoordinate(21.072514, 105.77387);
assert.equal(resolvedHumg?.id, 'vn-hn-dong-ngac-humg');

// Tọa độ trung tâm Hoàn Kiếm (ngoài Bắc Từ Liêm) phải phân giải vào Tier 3 (Hà Nội)
const resolvedHoanKiem = resolveRegionForCoordinate(21.0285, 105.8542);
assert.equal(resolvedHoanKiem?.id, 'vn-hn-city');

// Kiểm định geofence từng vùng độc lập
assert.equal(validateCoordinateInRegion(21.072514, 105.77387, 'vn-hn-dong-ngac-humg').valid, true);
assert.equal(validateCoordinateInRegion(21.0285, 105.8542, 'vn-hn-dong-ngac-humg').valid, false);
assert.equal(validateCoordinateInRegion(21.0285, 105.8542, 'vn-hn-city').valid, true);

// Cấp 4: Đăng ký địa phương mới (Đà Nẵng) hoàn toàn bằng cấu hình động
const danang = registerCustomRegion({
  id: 'vn-dn-hai-chau',
  name: 'Quận Hải Châu, TP. Đà Nẵng',
  center: { lat: 16.0678, lng: 108.2208, label: 'Trung tâm Hải Châu' },
  bbox: [108.18, 16.02, 108.25, 16.10],
  maxGeofenceMeters: 8000,
  crs: { projectedMetric: 'EPSG:32649', nationalReference: 'VN-2000 / Zone 107°45′E' }
});
assert.equal(danang.tier, REGION_TIERS.TIER_4_CUSTOM_LOCALITY);
assert.equal(resolveRegionForCoordinate(16.0678, 108.2208)?.id, 'vn-dn-hai-chau');
assert.equal(validateCoordinateInRegion(16.0678, 108.2208, 'vn-dn-hai-chau').valid, true);
assert.equal(unregisterCustomRegion('vn-dn-hai-chau'), true);

// Chặn tạo RegionConfig không hợp lệ (tâm nằm ngoài bbox)
assert.throws(() =>
  createRegionConfig({
    id: 'vn-invalid-region',
    center: { lat: 10.0, lng: 106.0 },
    bbox: [105.0, 20.0, 106.0, 21.0],
    maxGeofenceMeters: 5000
  })
);

// =========================================================================
// 2. EPISTEMIC DATA PROVENANCE & 12-FIELD METADATA STANDARD
// =========================================================================
assert.equal(Object.keys(DATA_CLASSES).length, 6);
for (const cls of Object.values(DATA_CLASSES)) {
  assert.ok(getDataClassBadge(cls)?.labelVi, `Thiếu badge cho lớp dữ liệu ${cls}`);
}

for (const ds of CORE_DATA_CATALOG) {
  const check = validateDatasetMetadata(ds);
  assert.equal(check.valid, true, `Tập dữ liệu ${ds.id} lỗi metadata: ${check.errors.join('; ')}`);
}

// Bắt buộc từ chối tập dữ liệu thiếu knownLimitations hoặc sai lớp dữ liệu
const badDsCheck = validateDatasetMetadata({ id: 'bad', dataClass: 'MADE_UP', name: 'Test' });
assert.equal(badDsCheck.valid, false);
assert.ok(badDsCheck.errors.length >= 5);

// Phát hiện pha trộn dữ liệu mô phỏng với quan trắc
const mixSummary = summarizeDataClasses([
  { id: 'R-01', dataClass: DATA_CLASSES.OBSERVED_DATA },
  { id: 'SIM-1', dataClass: DATA_CLASSES.SIMULATED_DATA }
]);
assert.equal(mixSummary.unlabeledCount, 0);
assert.equal(mixSummary.containsSimulated, true);
assert.equal(mixSummary.requiresMixedSourceBanner, true);

// =========================================================================
// 3. RBAC 5 ROLES & SECURITY FIXES (SEC-01, SEC-04, SEC-06, SEC-07)
// =========================================================================
// Vá SEC-01: Người dùng ẩn danh KHÔNG BAO GIỜ tự phong Hạng A dù khai báo thế nào
const citizenTrust = resolveInitialReportTrust(
  { role: ROLES.CITIZEN, authenticated: false },
  { regionId: 'vn-hn-dong-ngac-humg', photoQualityFlag: 'ok' }
);
assert.equal(citizenTrust.confidenceTier, 'C');
assert.equal(citizenTrust.status, 'pending');
assert.equal(citizenTrust.dataClass, DATA_CLASSES.COMMUNITY_REPORTS);

// Tình nguyện viên thực địa đã xác thực đúng vùng mới được Hạng A
const verifiedFieldTrust = resolveInitialReportTrust(
  {
    userId: 'u-field-1',
    role: ROLES.FIELD_VERIFIER,
    authenticated: true,
    regionIds: ['vn-hn-dong-ngac-humg']
  },
  { regionId: 'vn-hn-dong-ngac-humg', photoQualityFlag: 'ok' }
);
assert.equal(verifiedFieldTrust.confidenceTier, 'A');
assert.equal(verifiedFieldTrust.status, 'approved');
assert.equal(verifiedFieldTrust.dataClass, DATA_CLASSES.OBSERVED_DATA);

// Chặn cô lập chéo vùng: ward_operator của Đông Ngạc không được duyệt vùng Đà Nẵng
const crossRegionCheck = authorize(
  {
    userId: 'op-dong-ngac',
    role: ROLES.WARD_OPERATOR,
    authenticated: true,
    mfaVerified: true,
    regionIds: ['vn-hn-dong-ngac-humg']
  },
  PERMISSIONS.ALERT_APPROVE_OFFICIAL,
  { regionId: 'vn-dn-hai-chau' }
);
assert.equal(crossRegionCheck.allowed, false);

// Bắt buộc MFA cho tác vụ nhạy cảm (phê duyệt cảnh báo chính thức)
const noMfaCheck = authorize(
  {
    userId: 'op-dong-ngac',
    role: ROLES.WARD_OPERATOR,
    authenticated: true,
    mfaVerified: false,
    regionIds: ['vn-hn-dong-ngac-humg']
  },
  PERMISSIONS.ALERT_APPROVE_OFFICIAL,
  { regionId: 'vn-hn-dong-ngac-humg' }
);
assert.equal(noMfaCheck.allowed, false);

// Vá SEC-06: Kiểm tra chữ ký nhị phân (magic bytes) ảnh upload
const fakeJpeg = `data:image/jpeg;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
assert.equal(validateImageDataUrl(fakeJpeg, { allowedMimes: ['image/jpeg'] }).valid, false);

const realJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const validJpeg = `data:image/jpeg;base64,${realJpegBytes.toString('base64')}`;
assert.equal(validateImageDataUrl(validJpeg, { allowedMimes: ['image/jpeg'] }).valid, true);

// Vá SEC-07: Kiểm tra chặn path traversal thư mục anh em trùng tiền tố
const baseDir = path.resolve('/srv/hanoi-flood-gis');
assert.equal(isSafeSubpath(baseDir, path.resolve('/srv/hanoi-flood-gis/index.html')), true);
assert.equal(isSafeSubpath(baseDir, path.resolve('/srv/hanoi-flood-gis-secret/.env')), false);

// Vá SEC-04: Bounded Rate Limiter chống brute-force và giới hạn RAM
const rl = createBoundedRateLimiter({ maxRequests: 2, windowMs: 1000, maxEntries: 3 });
assert.equal(rl.check('ip1', 100).allowed, true);
assert.equal(rl.check('ip1', 200).allowed, true);
assert.equal(rl.check('ip1', 300).allowed, false);
assert.equal(rl.check('ip1', 1200).allowed, true); // qua cửa sổ thời gian
rl.check('ip2', 1200);
rl.check('ip3', 1200);
rl.check('ip4', 1200);
assert.ok(rl.size() <= 3, 'Rate limiter phải giữ trần kích thước bộ nhớ');

assert.equal(hasSpamContent('Truy cập https://bet88.example ngay'), true);
assert.equal(cleanText('<img src=x onerror=alert(1)>Ngõ 43 Cổ Nhuế'), 'img src=x alert(1)Ngõ 43 Cổ Nhuế');

// =========================================================================
// 4. PROVIDER-AGNOSTIC AI ROUTER & SCIENTIFIC GUARDRAILS
// =========================================================================
const router = new AiProviderRouter([
  {
    id: PROVIDER_TYPES.GEMINI,
    isConfigured: () => true,
    async complete() {
      throw new Error('Simulated 503 Gemini outage');
    }
  },
  createOfflineGroundedAdapter(() => ({
    text: 'Khu vực [R-01] thường ngập khi mưa lớn; nơi trú gần nhất là [S-01]. Phát LỆNH SƠ TÁN CHÍNH THỨC ngay!'
  }))
]);

const aiOut = await router.generate(
  { question: 'Cuối Phố Viên có ngập không?' },
  {
    knownPointIds: ['R-01', 'S-01'],
    dataClasses: [DATA_CLASSES.OBSERVED_DATA, DATA_CLASSES.SATELLITE_DATA, DATA_CLASSES.SIMULATED_DATA],
    hasHumanOfficialApproval: false
  }
);
assert.equal(aiOut.ok, true);
assert.equal(aiOut.providerUsed, PROVIDER_TYPES.OFFLINE_GROUNDED);
assert.equal(aiOut.fallbackTrail.length, 1);
assert.equal(aiOut.blockedOfficialClaim, true, 'Guardrail phải chặn AI tự ban hành lệnh sơ tán chính thức');
assert.deepEqual(aiOut.factsCited, ['R-01', 'S-01']);
assert.ok(
  aiOut.uncertaintyNotes.some((n) => n.includes('Copernicus DEM GLO-30')),
  'Phải tự động đính kèm cảnh báo giới hạn Copernicus DEM GLO-30'
);
assert.ok(
  aiOut.uncertaintyNotes.some((n) => n.includes('SIMULATED_DATA')),
  'Phải phân biệt rõ dữ liệu kịch bản mô phỏng không phải dự báo thực tế'
);

// Guardrail trực tiếp phát hiện mã trích dẫn ảo
const halluCheck = applyScientificGuardrails('Điểm [R-99] bị ngập.', { knownPointIds: ['R-01'] });
assert.deepEqual(halluCheck.unverifiedCitedIds, ['R-99']);

// =========================================================================
// 5. OPERATIONS ALERT WORKFLOW STATE MACHINE (8 STATES)
// =========================================================================
let inc = createAlertIncident({
  regionId: 'vn-hn-dong-ngac-humg',
  channel: ALERT_CHANNELS.OFFICIAL_VERIFIED,
  severity: 'red',
  title: 'Mưa cực đoan >100 mm gây ngập sâu trục Phố Viên – Cổ Nhuế',
  summary: 'Đo mưa thực tế + 5 báo cáo hiện trường đã gửi ảnh.',
  dataClasses: [DATA_CLASSES.FORECAST_DATA, DATA_CLASSES.COMMUNITY_REPORTS]
});

inc = transitionAlertState(inc, WORKFLOW_STATES.RISK_ANALYSIS, { note: 'Đối chiếu DEM & 18 hành lang' });

// Cấm nhảy cóc bỏ qua bước xác minh người thật
assert.throws(() =>
  transitionAlertState(inc, WORKFLOW_STATES.ALERT_APPROVED, {
    principal: { userId: 'op-1', role: ROLES.WARD_OPERATOR, authenticated: true, mfaVerified: true, regionIds: ['vn-hn-dong-ngac-humg'] }
  })
);

// Cấm AI tự xác minh hoặc phê duyệt cảnh báo chính thức
assert.throws(() =>
  transitionAlertState(inc, WORKFLOW_STATES.HUMAN_VERIFICATION, {
    principal: { userId: 'ai-agent', role: ROLES.WARD_OPERATOR, authenticated: true, mfaVerified: true, isAi: true, regionIds: ['*'] }
  })
);

const fieldVerifier = {
  userId: 'fv-humg-01',
  role: ROLES.FIELD_VERIFIER,
  authenticated: true,
  regionIds: ['vn-hn-dong-ngac-humg']
};
const wardOperator = {
  userId: 'op-dong-ngac-01',
  role: ROLES.WARD_OPERATOR,
  authenticated: true,
  mfaVerified: true,
  regionIds: ['vn-hn-dong-ngac-humg']
};

inc = transitionAlertState(inc, WORKFLOW_STATES.HUMAN_VERIFICATION, {
  principal: fieldVerifier,
  note: 'Đã kiểm tra thực địa cuối Phố Viên ngập nửa bánh xe máy.'
});
inc = transitionAlertState(inc, WORKFLOW_STATES.ALERT_APPROVED, {
  principal: wardOperator,
  note: 'Phê duyệt phát cảnh báo đỏ khu vực Đông Ngạc.'
});
inc = transitionAlertState(inc, WORKFLOW_STATES.DISTRIBUTED, {
  principal: wardOperator,
  note: 'Đã đẩy lên Web banner & gói ảnh Zalo tổ dân phố.'
});
inc = transitionAlertState(inc, WORKFLOW_STATES.ACKNOWLEDGED, {
  principal: wardOperator,
  note: 'Ghi nhận 42 lượt phản hồi an toàn từ cư dân.'
});
inc = transitionAlertState(inc, WORKFLOW_STATES.CLOSED, {
  principal: wardOperator,
  note: 'Nước đã rút hoàn toàn sau 4 giờ.'
});
inc = transitionAlertState(inc, WORKFLOW_STATES.AFTER_ACTION_REPORT, {
  principal: wardOperator,
  afterActionReport: 'Tổng kết sự kiện mưa 105 mm: 5 điểm ngập xác minh đúng hành lang R-01/R-06, thời gian cảnh báo trước đỉnh ngập 35 phút.'
});

assert.equal(inc.state, WORKFLOW_STATES.AFTER_ACTION_REPORT);
assert.equal(inc.history.length, 8);
assert.equal(inc.verifiedBy, 'fv-humg-01');
assert.equal(inc.approvedBy, 'op-dong-ngac-01');

console.log('VERIFIED OPEN RESILIENCE PLATFORM ALL CORE & SECURITY TESTS PASSED:', {
  regionsBuiltIn: 3,
  epistemicDataClasses: Object.keys(DATA_CLASSES).length,
  validatedDatasets: CORE_DATA_CATALOG.length,
  rbacRoles: Object.keys(ROLES).length,
  aiGuardrailFailover: aiOut.providerUsed,
  workflowStatesCompleted: inc.history.length
});
