import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import {
  latLngToUTM,
  roundPrivacyCoord,
  normalizePointRecord,
  analyzeSurveyPoints,
  analyzeRouteCorridor,
  analyzePolylineCorridor,
  buildTransectSamples,
  evaluateWeatherScenario,
  computeHydrologicalSpotRisk,
  computeAddressClimateScorecard,
  classifyUsAqi,
  computePrePostEvaluation,
  findDuplicatePairs,
  auditPointsQuality,
  findNearestSafePoint,
  findNearbyDuplicatePoint,
  exportToGeoJSON,
  exportToKML,
  exportToCSV,
  parseImportedPoints
} from './gis-utils.js';
import { HUMG_CENTER, ERA5_CLIMATE_FACTS, MONTHLY_2026_CLIMATE, EMERGENCY_DIRECTORY, ROUTE_PRESETS, TRANSECT_PRESETS, FLOOD_STREET_CORRIDORS, LOW_DEM_BASINS, SAMPLE_HUMG_POINTS } from './humg-data.js';
import { DEM_GRID_2KM, sampleDemBilinear } from './dem-grid-2km.js';
import { searchKnowledgeNotebook, synthesizeSituationalAnswer, buildNotebookLmSourceMarkdown } from './knowledge-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Đảm bảo 100% điểm dữ liệu nền có nguồn xác thực & KHÔNG còn trường depthCm/tempC tự đặt
assert.equal(SAMPLE_HUMG_POINTS.length, 60);
assert.equal(FLOOD_STREET_CORRIDORS.length, 18);
assert.equal(DEM_GRID_2KM.rows * DEM_GRID_2KM.cols, 625);
assert.ok(sampleDemBilinear(HUMG_CENTER.lat, HUMG_CENTER.lng) >= 14);
for (const pt of SAMPLE_HUMG_POINTS) {
  assert.ok(pt.sourceCitation && pt.sourceCitation.length > 10, `Thiếu trích dẫn nguồn cho ${pt.id}`);
  assert.ok(['A', 'B'].includes(pt.confidenceTier), `Điểm gốc phải đạt Hạng A hoặc B: ${pt.id}`);
  assert.equal(pt.depthCm, undefined, `Không được chứa số đo cm tự đặt ở điểm gốc: ${pt.id}`);
  assert.equal(pt.tempC, undefined, `Không được chứa nhiệt độ mặt đường tự đặt ở điểm gốc: ${pt.id}`);
}

// 1b. Kiểm tra chuỗi tháng 2026, danh bạ khẩn cấp, tìm kiếm Notebook và Data QA
assert.equal(MONTHLY_2026_CLIMATE.length, 11);
assert.equal(MONTHLY_2026_CLIMATE[7].rainMm, 624.8); // Tháng 8/2026
assert.ok(EMERGENCY_DIRECTORY.length >= 6);

const qaRes = auditPointsQuality(turf, SAMPLE_HUMG_POINTS, HUMG_CENTER.lat, HUMG_CENTER.lng, 2.0);
assert.equal(qaRes.issueCount, 0, 'Tất cả 60 điểm gốc phải vượt qua kiểm toán Data QA 100%');

const nbHit = searchKnowledgeNotebook('kenh 920 ty cuoi pho vien', SAMPLE_HUMG_POINTS);
assert.ok(nbHit.matchedCards.length > 0 && nbHit.matchedCards[0].id === 'KB-01', 'Tìm kiếm không dấu Notebook phải trả đúng thẻ KB-01');

// 1b-2. Kiểm tra Bộ máy Tổng hợp Tình huống Ngôn ngữ Tự nhiên (Situational Q&A)
const sitRoute = synthesizeSituationalAnswer('Mưa lớn từ ĐH Mỏ về Cầu Noi đi đường nào an toàn?', SAMPLE_HUMG_POINTS, {
  temp: 29.5,
  apparentTemp: 34.2,
  rainMm: 18.4,
  dailyRainMm: 65.0,
  uvMax: 6
});
assert.ok(sitRoute && sitRoute.riskLevel === 'danger', 'Câu hỏi đi qua vùng ngập phải kích hoạt mức danger');
assert.ok(sitRoute.routeAction && sitRoute.routeAction.originIdx === 0 && sitRoute.routeAction.destIdx === 3, 'Phải bắt đúng cặp Khu A (0) -> Cầu Noi (3)');
assert.ok(sitRoute.recommendedSafePt && sitRoute.recommendedSafePt.distanceMeters <= 400, 'Phải gợi ý điểm an toàn có mái che gần nhất');

const sitElec = synthesizeSituationalAnswer('Phòng trọ ngõ Cổ Nhuế nước tràn vào ổ điện làm sao?', SAMPLE_HUMG_POINTS);
assert.ok(sitElec.hotlines.some((h) => h.phone === '1900 1288'), 'Câu hỏi rò điện phải trả tổng đài EVNHANOI 1900 1288');

// 1c. Kiểm tra phân tích lộ trình, lát cắt địa hình DEM, mô phỏng kịch bản mưa & máy tính Pre/Post
const routeCheck = analyzeRouteCorridor(turf, ROUTE_PRESETS[0], ROUTE_PRESETS[3], SAMPLE_HUMG_POINTS, 165);
assert.equal(routeCheck.status, 'danger', 'Lộ trình thẳng Khu A -> Cầu Noi phải phát hiện điểm nguy hiểm R-01/R-06 dọc hành lang');
assert.ok(routeCheck.nearbyRisks.some((r) => r.id === 'R-01'));

const polyCheck = analyzePolylineCorridor(
  turf,
  [
    [105.77387, 21.072514],
    [105.772544, 21.069413],
    [105.772358, 21.061634]
  ],
  SAMPLE_HUMG_POINTS,
  125
);
assert.equal(polyCheck.status, 'danger');

const transectRes = buildTransectSamples(turf, TRANSECT_PRESETS[0].start, TRANSECT_PRESETS[0].end, 12, SAMPLE_HUMG_POINTS);
assert.equal(transectRes.samples.length, 12);
assert.ok(transectRes.maxElevM > transectRes.minElevM);

const scen70 = evaluateWeatherScenario(SAMPLE_HUMG_POINTS, 'rain_70');
assert.ok(scen70.dimNonMatching && scen70.activeRiskCount >= 6);

// 1d. Kiểm tra Chẩn đoán Thủy văn Tức thì (Spot Inspector 0-100) tại Cuối Phố Viên (11m) vs Khu A ĐH Mỏ (17m)
const spotLow = computeHydrologicalSpotRisk(turf, 21.069413, 105.772544, 11.0, FLOOD_STREET_CORRIDORS, SAMPLE_HUMG_POINTS);
assert.ok(spotLow.score >= 70 && spotLow.level === 'very_high', `Cuối Phố Viên (11m) phải đạt nguy cơ Rất cao >=70 (thực tế: ${spotLow.score})`);
assert.ok(spotLow.nearestSafe && spotLow.nearestSafe.point.id === 'S-01');

const spotHigh = computeHydrologicalSpotRisk(turf, HUMG_CENTER.lat, HUMG_CENTER.lng, 17.0, FLOOD_STREET_CORRIDORS, SAMPLE_HUMG_POINTS);
assert.ok(spotHigh.score < 25 && spotHigh.level === 'low', `Khu A ĐH Mỏ (17m) phải ở mức Thấp <25 (thực tế: ${spotHigh.score})`);

// 1e. Kiểm tra Thẩm định An toàn Nhà trọ / Địa chỉ (3 trục A-D) & phân loại US AQI
const cardHigh = computeAddressClimateScorecard(turf, HUMG_CENTER.lat, HUMG_CENTER.lng, 17.0, FLOOD_STREET_CORRIDORS, SAMPLE_HUMG_POINTS, '18 Phố Viên');
assert.equal(cardHigh.grade, 'A', `Gò ĐH Mỏ phải đạt Hạng A (thực tế: ${cardHigh.grade}, điểm ${cardHigh.overallScore})`);
assert.ok(cardHigh.checklist.length >= 3);

const cardLow = computeAddressClimateScorecard(turf, 21.069413, 105.772544, 11.0, FLOOD_STREET_CORRIDORS, SAMPLE_HUMG_POINTS, 'Cuối Phố Viên');
assert.ok(['C', 'D'].includes(cardLow.grade), `Cuối Phố Viên phải ở Hạng C hoặc D (thực tế: ${cardLow.grade}, điểm ${cardLow.overallScore})`);
assert.ok(cardHigh.overallScore > cardLow.overallScore + 25);

assert.equal(classifyUsAqi(35).level, 'good');
assert.equal(classifyUsAqi(128).level, 'sensitive');
assert.equal(classifyUsAqi(175).level, 'unhealthy');

const ppStats = computePrePostEvaluation({
  nPre: 52,
  nPost: 45,
  preCorrectPct: 38.5,
  postCorrectPct: 82.2,
  preConfAvg: 2.65,
  postConfAvg: 4.12
});
assert.equal(ppStats.passKnowledge, true);
assert.equal(ppStats.passConfidence, true);

// 2. Kiểm tra dữ liệu khí tượng ERA5 2024–2026
assert.equal(ERA5_CLIMATE_FACTS.years.length, 3);
assert.equal(ERA5_CLIMATE_FACTS.years[2].year, 2026);
assert.equal(ERA5_CLIMATE_FACTS.years[2].apparentHot40, 76);

// 3. Kiểm tra cơ chế nâng hạng tự động từ C -> B khi đủ >= 3 người dân xác nhận
const tierCPt = normalizePointRecord({
  id: 'CD-TEST',
  layerGroup: 'risk',
  category: 'flood',
  name: 'Ngõ thử nghiệm cộng đồng',
  lat: 21.071,
  lng: 105.775,
  confidenceTier: 'C',
  confirmCount: 2
});
assert.equal(tierCPt.confidenceTier, 'C');

const promotedPt = normalizePointRecord({ ...tierCPt, confirmCount: 3 });
assert.equal(promotedPt.confidenceTier, 'B', 'Đủ >=3 xác nhận phải tự động nâng từ C lên B');

// 4. Kiểm tra gộp điểm trùng trong bán kính 50m & làm tròn tọa độ bảo vệ quyền riêng tư ~20m
const dupFound = findNearbyDuplicatePoint(turf, SAMPLE_HUMG_POINTS, 21.06945, 105.77255, 'flood', 50);
assert.ok(dupFound && dupFound.id === 'R-01', 'Phải phát hiện trùng vị trí trong 50m với R-01 Cuối Phố Viên');

const rounded = roundPrivacyCoord(21.072589, true);
assert.equal(rounded, 21.0726);

// 5. Phân tích không gian bán kính 2km & tìm bệnh viện / nơi trú có mái che gần nhất
const res2km = analyzeSurveyPoints(turf, SAMPLE_HUMG_POINTS, HUMG_CENTER.lat, HUMG_CENTER.lng, 2.0);
assert.equal(res2km.stats.total, 60);
assert.equal(res2km.stats.inside, 60, 'Tất cả 60 điểm nền phải nằm trọn trong bán kính <= 2.0 km');
assert.equal(res2km.stats.riskInside, 45);
assert.equal(res2km.stats.floodInside, 37, 'Phải có 37 điểm ngập úng xác thực phủ kín các ngõ và khu đô thị trong 2km');
assert.equal(res2km.stats.heatInside, 6, 'Phải có 6 điểm nắng nóng / buýt / chợ dân sinh xác thực');
assert.equal(res2km.stats.safeInside, 15);

const nearestSafe = findNearestSafePoint(turf, 21.069413, 105.772544, SAMPLE_HUMG_POINTS);
assert.equal(nearestSafe.point.id, 'S-01'); // BV Đa khoa Phương Đông (osm:way/570572630)

// Kiểm tra an toàn mưa dông: từ Tây Thăng Long (R-05), không điều hướng ra hồ ngoài trời S-08 mà ưu tiên điểm y tế/mái che
const nearestFromTayThangLong = findNearestSafePoint(turf, 21.062764, 105.769676, SAMPLE_HUMG_POINTS);
assert.ok(!nearestFromTayThangLong.point.outdoorOnly, 'Không được điều hướng trú mưa ra hồ/công viên ngoài trời');
assert.notEqual(nearestFromTayThangLong.point.id, 'S-08');

// 6. Xuất lại toàn bộ tệp dữ liệu sạch (kèm Gói nguồn chuẩn Google NotebookLM .md) ra thư mục exports/
const exportDir = path.join(__dirname, 'exports');
await fs.mkdir(exportDir, { recursive: true });
const meta2km = { ...HUMG_CENTER, radiusKm: 2.0 };

const kmlStr = exportToKML(res2km, meta2km, false);
const csvStr = exportToCSV(res2km, meta2km, false);
const geoStr = JSON.stringify(exportToGeoJSON(res2km, meta2km, false), null, 2);
const nbMdStr = buildNotebookLmSourceMarkdown(SAMPLE_HUMG_POINTS, res2km.stats);

const reimported = parseImportedPoints(csvStr, 'HUMG_DuLieuThucTe.csv');
assert.equal(reimported.length, 60);
assert.ok(nbMdStr.includes('PHẦN 4. DANH MỤC ĐẦY ĐỦ CÁC ĐIỂM RỦI RO'));

await Promise.all([
  fs.writeFile(path.join(exportDir, 'HUMG_BanDo_2Lop_2km.kml'), kmlStr, 'utf8'),
  fs.writeFile(path.join(exportDir, 'HUMG_KhaoSat_ThucDia_2km.csv'), csvStr, 'utf8'),
  fs.writeFile(path.join(exportDir, 'HUMG_GIS_2km.geojson'), geoStr, 'utf8'),
  fs.writeFile(path.join(exportDir, 'HUMG_NotebookLM_SourcePack.md'), nbMdStr, 'utf8')
]);

console.log('VERIFIED COMMUNITY WEBGIS ALL TESTS PASSED:', {
  utmHUMG: latLngToUTM(HUMG_CENTER.lat, HUMG_CENTER.lng, 48),
  stats2km: res2km.stats,
  nearestSafeFromCuoiPhoVien: {
    id: nearestSafe.point.id,
    name: nearestSafe.point.name,
    distanceMeters: nearestSafe.distanceMeters
  }
});
