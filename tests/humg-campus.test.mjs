import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAMPUS_ZONES,
  CAMPUS_ROUTES,
  FLOOD_ZONES,
  CAMPUS_POINTS,
  QUIZ_15_QUESTIONS,
  MOCK_ADMIN_DATA
} from '../humg-campus/data/campus-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const campusDir = path.join(rootDir, 'humg-campus');

// 1. Xác nhận 3 Khu A, A1, B + Vùng ngập + Điểm ngập/nguy hiểm quanh Trường Mỏ
assert.deepEqual(
  CAMPUS_ZONES.map((z) => z.id),
  ['A', 'A1', 'B'],
  'Phải có đủ 3 khu chính quanh Mỏ: Khu A, Khu A1, Khu B'
);
for (const z of CAMPUS_ZONES) {
  assert.ok(z.lat > 21.06 && z.lat < 21.08 && z.lng > 105.755 && z.lng < 105.785, `Tọa độ ${z.code} phải nằm đúng quanh ĐH Mỏ`);
  assert.ok(Array.isArray(z.polygon) && z.polygon.length >= 5, `${z.code} phải có đa giác khoanh vùng tối thiểu 5 đỉnh`);
  const firstPt = z.polygon[0];
  const lastPt = z.polygon[z.polygon.length - 1];
  assert.deepEqual(firstPt, lastPt, `${z.code} đa giác khoanh vùng phải khép kín`);
  for (const [pLat, pLng] of z.polygon) {
    assert.ok(pLat > 21.06 && pLat < 21.08 && pLng > 105.755 && pLng < 105.785, `Đỉnh đa giác ${z.code} phải thuộc Bắc Từ Liêm / HUMG`);
  }
  assert.ok(z.osmWayId && z.osmWayId.startsWith('way/'), `${z.code} phải có osmWayId đối chiếu chuẩn`);
  assert.ok(z.googleMapsUrl && z.googleMapsUrl.startsWith('https://www.google.com/maps/'), `${z.code} phải có link đối chiếu Google Maps`);
}
const zoneMap = Object.fromEntries(CAMPUS_ZONES.map((z) => [z.id, z]));
assert.ok(zoneMap.B.lng < zoneMap.A.lng && zoneMap.A.lng < zoneMap.A1.lng, 'Thứ tự Đông–Tây phải chuẩn: Khu B < Khu A < Khu A1');
assert.ok(FLOOD_ZONES.length >= 3, 'Phải có ít nhất 3 vùng ngập đa giác quanh trường Mỏ');
assert.ok(CAMPUS_POINTS.filter((p) => p.group === 'flood').length >= 8, 'Phải có >= 8 điểm ngập/nguy hiểm quanh Mỏ');
assert.ok(CAMPUS_ROUTES.medicalRoutes.A && CAMPUS_ROUTES.medicalRoutes.A1 && CAMPUS_ROUTES.medicalRoutes.B, 'Phải có tuyến đường y tế từ cả 3 khu A, A1, B');

// 2. Xác nhận Bộ Quiz 15 câu chuẩn xác
assert.equal(QUIZ_15_QUESTIONS.length, 15, 'Bộ Quiz bắt buộc phải có đúng 15 câu');
for (const q of QUIZ_15_QUESTIONS) {
  assert.equal(q.options.length, 4, `Câu ${q.id} phải có đủ 4 đáp án`);
  assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3, `Câu ${q.id} có correctIndex hợp lệ`);
  assert.ok(q.explanation && q.explanation.length > 15, `Câu ${q.id} phải có giải thích đáp án`);
}

// 3. Xác nhận Trang Quản trị phong cách GEOENV RUN với số liệu ảo & khóa công khai
const adminHtml = await fs.readFile(path.join(campusDir, 'admin.html'), 'utf8');
const adminJs = await fs.readFile(path.join(campusDir, 'admin.js'), 'utf8');
const indexHtml = await fs.readFile(path.join(campusDir, 'index.html'), 'utf8');

assert.ok(adminHtml.includes('Đăng nhập quản trị'), 'Phải có màn hình Đăng nhập quản trị kiểu GEOENV RUN');
assert.ok(adminHtml.includes('Lượt truy cập') && adminHtml.includes('Tổng lượt') && adminHtml.includes('Hôm nay') && adminHtml.includes('Người dùng'), 'Phải có thống kê Lượt truy cập đầy đủ 3 chỉ số');
assert.ok(adminHtml.includes('Khóa khu vực công khai') && adminJs.includes('Chắc chắn đổi?'), 'Phải có nút Khóa khu vực công khai 2 bước xác nhận');
assert.ok(adminHtml.includes('overview-4-grid') && adminHtml.includes('Quản lý điểm Khu A, A1, B') && adminHtml.includes('Hòm thư góp ý &amp; phản ánh') && adminHtml.includes('Kết quả Quiz 15 câu') && adminHtml.includes('Khiếu nại &amp; Báo ngập'), 'Trang tổng quan phải có đủ 4 thẻ quản lý như GEOENV RUN');
assert.ok(
  MOCK_ADMIN_DATA.visits.total > 0 &&
    MOCK_ADMIN_DATA.visits.total < 700 &&
    MOCK_ADMIN_DATA.visits.today < 700 &&
    MOCK_ADMIN_DATA.visits.unique < 700 &&
    MOCK_ADMIN_DATA.quizStats.baseAttempts < 700,
  'Tất cả số liệu truy cập & thống kê phải dưới 700 cho thực tế'
);
assert.equal(
  MOCK_ADMIN_DATA.visits.byPage.reduce((s, p) => s + p.views, 0),
  MOCK_ADMIN_DATA.visits.total,
  'Tổng lượt xem từng trang phải khớp tổng lượt truy cập'
);
assert.equal(
  MOCK_ADMIN_DATA.visits.last7Days.reduce((s, d) => s + d.visits, 0),
  MOCK_ADMIN_DATA.visits.total,
  'Tổng lượt truy cập 7 ngày phải khớp tổng lượt truy cập'
);
assert.ok(indexHtml.includes('id="btn-quiz-submit"') && indexHtml.includes('id="public-locked-screen"'), 'Trang chính phải có Quiz 15 câu & hỗ trợ khóa công khai');

// 4. Kiểm tra cân bằng ngoặc CSS cho styles.css & admin.css
for (const cssFile of ['styles.css', 'admin.css']) {
  const raw = await fs.readFile(path.join(campusDir, cssFile), 'utf8');
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  let d = 0;
  for (const ch of stripped) {
    if (ch === '{') d++;
    else if (ch === '}') d--;
    assert.ok(d >= 0, `${cssFile} không được thừa dấu }`);
  }
  assert.equal(d, 0, `${cssFile} phải cân bằng ngoặc nhọn`);
}

console.log('VERIFIED HUMG CAMPUS SUB-APP + QUIZ 15 + GEOENV-STYLE ADMIN TESTS PASSED:', {
  zones: CAMPUS_ZONES.map((z) => z.code),
  floodPolygons: FLOOD_ZONES.length,
  totalPoints: CAMPUS_POINTS.length,
  quizQuestions: QUIZ_15_QUESTIONS.length,
  mockTotalVisits: MOCK_ADMIN_DATA.visits.total
});
