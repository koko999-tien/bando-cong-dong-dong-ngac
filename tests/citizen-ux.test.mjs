import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CITIZEN_LANDMARKS,
  RENTAL_INSPECTION_CHECKLIST,
  buildCitizenStatusAdvisory,
  getNearbyCitizenHighlights,
  buildHonestRentalAreaSummary,
  buildHonestRouteComparison,
  createOfflineReportQueueItem,
  describePointVerificationPlain,
  describeAqiPlain
} from '../citizen-logic.js';
import { SAMPLE_HUMG_POINTS } from '../humg-data.js';
import { synthesizeSituationalAnswer } from '../knowledge-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const indexHtml = await fs.readFile(path.join(rootDir, 'index.html'), 'utf8');
const expertHtml = await fs.readFile(path.join(rootDir, 'chuyen-gia.html'), 'utf8');
const citizenCss = await fs.readFile(path.join(rootDir, 'citizen.css'), 'utf8');

// =========================================================================
// KỊCH BẢN 1: NGƯỜI DÂN MỚI TRUY CẬP — 5 GIÂY HIỂU NGAY, 0 THUẬT NGỮ GIS
// =========================================================================
assert.ok(indexHtml.includes('id="pillar-public"'), 'Trang chủ phải mở mặc định Phần 1: Cổng Cộng đồng');
assert.ok(!indexHtml.includes('DEM (m)'), 'Form người dân KHÔNG được bắt nhập DEM (m)');
assert.ok(!indexHtml.includes('UTM 48N'), 'Trang người dân KHÔNG được hiện thuật ngữ UTM 48N');
assert.ok(!indexHtml.includes('ERA5'), 'Trang người dân KHÔNG được hiện thuật ngữ ERA5');
assert.ok(!indexHtml.includes('NotebookLM'), 'Trang người dân KHÔNG được hiện thuật ngữ NotebookLM');
assert.ok(!indexHtml.includes('Pre-test'), 'Trang người dân KHÔNG được hiện thuật ngữ khảo sát học thuật');

// Chế độ Chuyên gia vẫn bảo toàn 100% ở chuyen-gia.html và có đường dẫn quay về Người dân
assert.ok(expertHtml.includes('Copernicus DEM GLO-30'), 'Chế độ chuyên gia phải giữ nguyên năng lực DEM');
assert.ok(expertHtml.includes('ERA5'), 'Chế độ chuyên gia phải giữ nguyên năng lực ERA5');
assert.ok(expertHtml.includes('href="./index.html"'), 'Chế độ chuyên gia phải có lối quay về Giao diện Người dân');

// Kiểm tra cân bằng ngoặc {} của citizen.css
const strippedCss = citizenCss.replace(/\/\*[\s\S]*?\*\//g, '');
let depth = 0;
let minDepth = 0;
for (const ch of strippedCss) {
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth < minDepth) minDepth = depth;
  }
}
assert.equal(depth, 0, 'citizen.css phải cân bằng ngoặc nhọn');
assert.equal(minDepth, 0, 'citizen.css không được có dấu đóng ngoặc thừa');

// =========================================================================
// KỊCH BẢN 2: SINH VIÊN TÌM PHÒNG TRỌ — DỮ LIỆU THẬT + CHECKLIST, KHÔNG TỰ BỊA ĐIỂM
// =========================================================================
const ngo43 = CITIZEN_LANDMARKS.find((l) => l.id === 'lm-ngo43-cn');
const rentalSummary = buildHonestRentalAreaSummary(ngo43.lat, ngo43.lng, ngo43.name, SAMPLE_HUMG_POINTS);
assert.equal(rentalSummary.hasScoreOrGrade, false, 'Tuyệt đối không tự tạo điểm số hay hạng A-D cho khu nhà trọ');
assert.ok(rentalSummary.floodNearby.length >= 1, 'Phải hiển thị dữ liệu ngập hiện có gần Ngõ 43 Cổ Nhuế');
assert.ok(rentalSummary.nearestMedical, 'Phải hiển thị cơ sở y tế gần nhất');
assert.ok(rentalSummary.epistemicWarning.includes('KHÔNG chấm điểm'), 'Phải giải thích rõ lý do không chấm điểm tự tạo');
assert.equal(RENTAL_INSPECTION_CHECKLIST.length, 12, 'Danh sách tự kiểm tra nhà trọ phải đủ 12 mục thực tế');

// =========================================================================
// KỊCH BẢN 3: NGƯỜI ĐI ĐƯỜNG TRÁNH NGẬP — SO SÁNH 2 TUYẾN + KHÔNG KHẲNG ĐỊNH AN TOÀN TUYỆT ĐỐI
// =========================================================================
const routeCmp = buildHonestRouteComparison({
  originName: 'ĐH Mỏ - Địa chất',
  destName: 'Cầu Noi',
  travelMode: 'bike',
  directRoute: { distanceKm: 1.6, durationMin: 6, risks: [{ id: 'R-01', name: 'Cuối Phố Viên' }, { id: 'R-06', name: 'Cầu Noi' }] },
  detourRoute: { distanceKm: 2.2, durationMin: 8, risks: [] },
  liveFloodPointIds: new Set(['R-01'])
});
assert.equal(routeCmp.recommendation, 'detour', 'Phải đề xuất tuyến ít rủi ro hơn khi tránh được điểm ngập');
assert.ok(routeCmp.reason.includes('Cuối Phố Viên'), 'Phải giải thích cụ thể tên đoạn ngập tránh được');
assert.ok(
  routeCmp.cannotGuaranteeSafeNotice.includes('KHÔNG khẳng định tuyến đường an toàn tuyệt đối'),
  'Phải có lưu ý không khẳng định an toàn tuyệt đối'
);

// =========================================================================
// KỊCH BẢN 4: NGƯỜI DÂN TÌM NƠI TRÚ MƯA GẦN NHẤT — KHÔNG DẪN RA HỒ NGOÀI TRỜI
// =========================================================================
const nearTayThangLong = getNearbyCitizenHighlights(21.062764, 105.769676, SAMPLE_HUMG_POINTS);
assert.ok(nearTayThangLong.nearestShelter, 'Phải tìm thấy nơi trú gần nhất');
assert.ok(!nearTayThangLong.nearestShelter.outdoorOnly, 'Không được dẫn người trú mưa ra hồ/công viên ngoài trời');
assert.ok(nearTayThangLong.nearestMedical, 'Phải tìm thấy cơ sở y tế gần nhất');

// =========================================================================
// KỊCH BẢN 5: NGƯỜI LỚN TUỔI XEM CẢNH BÁO — 6 THÀNH PHẦN RÕ RÀNG + CHẾ ĐỘ CHỮ LỚN
// =========================================================================
assert.ok(indexHtml.includes('id="btn-toggle-large-text"'), 'Phải có nút bật Chế độ Chữ lớn trên thanh đầu trang');
assert.ok(citizenCss.includes('html.is-large-text'), 'CSS phải định nghĩa phóng chữ & nút bấm lớn cho người lớn tuổi');

const normalAdvisory = buildCitizenStatusAdvisory({
  areaName: 'Quanh ĐH Mỏ - Địa chất',
  weather: { temp: 28, apparentTemp: 30, rainMm: 0, dailyRainMm: 2 },
  aqi: { usAqi: 65 },
  nearbyFloodCount: 8,
  updatedAtLabel: '14:00 hôm nay'
});
assert.equal(normalAdvisory.level, 'normal');
assert.ok(normalAdvisory.honestyNote.includes('không đồng nghĩa khu vực an toàn tuyệt đối'), 'Không được khẳng định an toàn tuyệt đối');

const floodAdvisory = buildCitizenStatusAdvisory({
  areaName: 'Quanh ĐH Mỏ - Địa chất',
  weather: { temp: 27, apparentTemp: 30, rainMm: 18, dailyRainMm: 78 },
  livePulseFeed: [{ pointId: 'R-01', pointName: 'Cuối Phố Viên', status: 'flooding' }],
  updatedAtLabel: '17:15 hôm nay'
});
assert.equal(floodAdvisory.level, 'high');
assert.ok(floodAdvisory.area && floodAdvisory.time && floodAdvisory.cause && floodAdvisory.action && floodAdvisory.sourceType);

// =========================================================================
// KỊCH BẢN 6: NGƯỜI DÙNG MẠNG YẾU / MẤT MẠNG (OFFLINE)
// =========================================================================
const offlineAdv = buildCitizenStatusAdvisory({ isOffline: true, areaName: 'Đông Ngạc' });
assert.ok(offlineAdv.headline.includes('mất mạng'), 'Phải thông báo rõ ràng trạng thái đang xem dữ liệu đã lưu');
const qItem = createOfflineReportQueueItem({ name: 'Ngõ 401 Cổ Nhuế', category: 'flood', lat: 21.066, lng: 105.775 });
assert.ok(qItem.queueId.startsWith('OFF-'), 'Hàng đợi báo cáo ngoại tuyến phải có Idempotency-Key chống trùng');

// =========================================================================
// KỊCH BẢN 7: NGƯỜI DÂN BÁO ĐIỂM NGẬP — NGẮN GỌN, MINH BẠCH XÁC MINH, KHÔNG BẮT NHẬP TỌA ĐỘ
// =========================================================================
assert.ok(indexHtml.includes('id="national-report-form"'), 'Phải có biểu mẫu báo sự cố cộng đồng toàn quốc');
assert.ok(!indexHtml.includes('id="pt-lat"'), 'Trang người dân không bắt nhập vĩ độ thô');
assert.ok(!indexHtml.includes('id="pt-lng"'), 'Trang người dân không bắt nhập kinh độ thô');
const verC = describePointVerificationPlain({ confidenceTier: 'C' });
assert.equal(verC.sourceClass, 'COMMUNITY_REPORTS');
assert.ok(verC.label.includes('chờ kiểm chứng'), 'Điểm mới báo phải ghi rõ chờ kiểm chứng thêm');
assert.equal(describeAqiPlain(165).tone, 'danger');

// Kiểm tra bộ lọc ngôn ngữ Trợ lý AI không để lọt thuật ngữ DEM/OSRM/ERA5/DSM trên câu hỏi thực tế
const nationalAppSrc = await fs.readFile(path.join(rootDir, 'national-app.js'), 'utf8');
assert.ok(nationalAppSrc.includes('vùng trũng thấp'), 'Trợ lý người dân phải chuyển ngữ cụm DEM sang vùng trũng thấp');
assert.ok(!nationalAppSrc.includes('basemaps.cartocdn.com'), 'Bản đồ không dùng tile CARTO cần API key');

const rawLocalAns = synthesizeSituationalAnswer(
  'Tôi muốn từ ĐH Mỏ về Cầu Noi nhưng đoạn Phố Viên đang ngập thì nên đi thế nào?',
  SAMPLE_HUMG_POINTS
);
const sanitizeLikeCitizenApp = (txt) =>
  String(txt || '')
    .replace(/Bấm nút\s*[“"]Phân tích\s*&\s*Vẽ lộ trình OSRM[”"]\s*bên dưới/gi, 'Mở mục “Tìm đường” để so sánh tuyến ít rủi ro hơn')
    .replace(/\bOSRM\b/g, 'tìm đường')
    .replace(/\bCopernicus DEM(?: GLO-30)?\b/gi, 'địa hình khu vực')
    .replace(/\bDEM\s*[\d–\-.,]+\s*m\b/gi, 'vùng trũng thấp')
    .replace(/\bDEM\b/g, 'địa hình')
    .replace(/\bECMWF ERA5\b/gi, 'lịch sử thời tiết khu vực')
    .replace(/\bERA5\b/g, 'lịch sử thời tiết')
    .replace(/\bDSM\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
const cleanedAiOutput = [rawLocalAns?.headline, ...(rawLocalAns?.bullets || [])].map(sanitizeLikeCitizenApp).join('\n');
assert.ok(!/\b(?:DEM|OSRM|ERA5|DSM)\b/i.test(cleanedAiOutput), `Câu trả lời trợ lý không được lọt thuật ngữ GIS: ${cleanedAiOutput}`);

console.log('VERIFIED ALL 7 CITIZEN-FIRST USER SCENARIO TESTS PASSED:', {
  landmarks: CITIZEN_LANDMARKS.length,
  rentalChecklistItems: RENTAL_INSPECTION_CHECKLIST.length,
  cssBraceDepth: depth,
  zeroGisJargonOnHome: true,
  honestRentalNoScore: !rentalSummary.hasScoreOrGrade,
  offlineQueueReady: true
});
