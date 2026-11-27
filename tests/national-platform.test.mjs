import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VIETNAM_ZONES,
  isInsideVietnam,
  searchVietnamZones,
  filterFeaturesInZone,
  findNearestVietnamZone
} from '../platform/regions/vietnam-directory.js';
import { SAMPLE_HUMG_POINTS } from '../humg-data.js';
import {
  VIETNAM_VERIFIED_HOTSPOTS,
  VIETNAM_VERIFIED_CORRIDORS,
  filterCorridorsInZone
} from '../platform/data/vietnam-verified-hotspots.js';
import { GET as researchGET, POST as researchPOST } from '../api/research-portal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const localSimPath = path.join(rootDir, '.local-data', 'national-platform.json');

// Dọn tệp tạm trước khi chạy test độc lập
await fs.rm(localSimPath, { force: true }).catch(() => {});

try {
  // 1. PHỦ TOÀN LÃNH THỔ VIỆT NAM (63 TỈNH/THÀNH + KHOANH VÙNG CHỐNG LAG)
  const uniqueProvinces = new Set(VIETNAM_ZONES.map((z) => z.province));
  assert.equal(uniqueProvinces.size, 63, `Phải phủ đủ 63 tỉnh/thành Việt Nam (thực tế: ${uniqueProvinces.size})`);

  assert.equal(isInsideVietnam(21.0285, 105.8542), true, 'Hà Nội phải nằm trong Việt Nam');
  assert.equal(isInsideVietnam(16.0544, 108.2022), true, 'Đà Nẵng phải nằm trong Việt Nam');
  assert.equal(isInsideVietnam(10.0452, 105.7469), true, 'Cần Thơ phải nằm trong Việt Nam');
  assert.equal(isInsideVietnam(35.6762, 139.6503), false, 'Tokyo phải bị chặn ngoài Việt Nam');

  assert.ok(searchVietnamZones('da nang').some((z) => z.id === 'vn-danang'), 'Tìm không dấu "da nang" phải khớp Đà Nẵng');
  assert.ok(searchVietnamZones('can tho').some((z) => z.id === 'vn-cantho'), 'Tìm không dấu "can tho" phải khớp Cần Thơ');
  assert.equal(findNearestVietnamZone(16.4637, 107.5909)?.province, 'Thừa Thiên Huế');

  // Chống lag: Khoanh vùng tại Đà Nẵng KHÔNG được đổ 60 điểm Đông Ngạc (Hà Nội) ra bản đồ!
  const inDongNgac = filterFeaturesInZone(SAMPLE_HUMG_POINTS, 21.072514, 105.77387, 2);
  const inDaNang = filterFeaturesInZone(SAMPLE_HUMG_POINTS, 16.0544, 108.2022, 10);
  assert.equal(inDongNgac.length, 60, 'Khoanh 2 km quanh Đông Ngạc phải hiện đủ 60 điểm thực địa');
  assert.equal(inDaNang.length, 0, 'Khoanh 10 km quanh Đà Nẵng phải trả 0 điểm Hà Nội (chống lag tuyệt đối)');

  // 1B. KHO ĐIỂM NÓNG & HÀNH LANG ĐA ĐÔ THỊ + LÀM GIÀU VÙNG KHOANH (GIẢI QUYẾT DATA CLIFF)
  assert.ok(VIETNAM_VERIFIED_HOTSPOTS.length >= 45, `Phải có >= 45 điểm nóng đa đô thị (thực tế: ${VIETNAM_VERIFIED_HOTSPOTS.length})`);
  const hotspotProvinces = new Set(VIETNAM_VERIFIED_HOTSPOTS.map((p) => p.province));
  assert.ok(hotspotProvinces.size >= 10, `Kho điểm nóng phải phủ >= 10 tỉnh/thành trọng điểm (thực tế: ${hotspotProvinces.size})`);
  for (const hp of VIETNAM_VERIFIED_HOTSPOTS) {
    assert.equal(isInsideVietnam(hp.lat, hp.lng), true, `Điểm ${hp.id} phải nằm trong lãnh thổ Việt Nam`);
    assert.equal(hp.dataClass, 'OBSERVED_DATA', `Điểm ${hp.id} phải gắn nhãn OBSERVED_DATA`);
  }
  assert.ok(VIETNAM_VERIFIED_CORRIDORS.length >= 12, 'Phải có >= 12 hành lang rủi ro đa đô thị');
  const daNangCorridors = filterCorridorsInZone(VIETNAM_VERIFIED_CORRIDORS, 16.0544, 108.2022, 10);
  assert.ok(daNangCorridors.length >= 2, 'Khoanh vùng Đà Nẵng phải có hành lang ngập kiểm chứng');

  // Kiểm tra endpoint zone_osm chặn tọa độ ngoài Việt Nam và trả JSON chuẩn trong Việt Nam
  const badOsm = await researchGET(new Request('http://localhost/api/research-portal?action=zone_osm&lat=35.67&lng=139.65&radiusKm=4'));
  assert.equal(badOsm.status, 400, 'zone_osm phải chặn tọa độ ngoài Việt Nam');
  const daNangOsmRes = await researchGET(new Request('http://localhost/api/research-portal?action=zone_osm&lat=16.0544&lng=108.2022&radiusKm=4'));
  assert.equal(daNangOsmRes.status, 200);
  const daNangOsmJson = await daNangOsmRes.json();
  assert.equal(daNangOsmJson.ok, true);
  assert.ok(Array.isArray(daNangOsmJson.pois) && Array.isArray(daNangOsmJson.waterways), 'zone_osm phải trả mảng pois & waterways');

  // 2. BỎ HOÀN TOÀN NHÃN BÀI TẬP / ĐÁNH SỐ TRẺ CON & XÁC NHẬN GIAO DIỆN ĐA LỚP CHUYÊN NGHIỆP
  const html = await fs.readFile(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes('id="pillar-public"'), 'Phải có Phân hệ Bản đồ & Cảnh báo');
  assert.ok(html.includes('id="pillar-research"'), 'Phải có Phân hệ Cổng Nghiên cứu');
  assert.ok(html.includes('id="pillar-news"'), 'Phải có Phân hệ Bản tin & Công bố');
  assert.ok(!html.includes('1. Cộng đồng'), 'Phải bỏ cách đánh số kiểu bài tập "1. Cộng đồng"');
  assert.ok(!html.includes('2. Nghiên cứu'), 'Phải bỏ cách đánh số kiểu bài tập "2. Nghiên cứu"');
  assert.ok(!html.includes('3. Bản tin'), 'Phải bỏ cách đánh số kiểu bài tập "3. Bản tin"');
  assert.ok(html.includes('data-basemap="satellite"'), 'Phải có nút chuyển nền Vệ tinh chuyên sâu');
  assert.ok(html.includes('id="hourly-rain-bars"'), 'Phải có biểu đồ lượng mưa 24 giờ tới');
  assert.ok(!html.includes('Đề tài 08'), 'Phải bỏ nhãn bài tập Đề tài 08 trên nền tảng thực tế');
  assert.ok(!html.includes('Pre-test'), 'Phải bỏ thẻ khảo sát học thuật Pre-test');
  assert.ok(!html.includes('Video 45s'), 'Phải bỏ thẻ Video 45s sáo rỗng');

  // 3. PHẦN 2: BẮT BUỘC ĐĂNG KÝ & ĐĂNG NHẬP NHÀ NGHIÊN CỨU
  const mkPost = (body, headers = {}) =>
    new Request('http://localhost/api/research-portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.20', ...headers },
      body: JSON.stringify(body)
    });

  // Chưa đăng nhập -> Bắt buộc từ chối 401 khi gửi nghiên cứu
  const unauthSubmit = await researchPOST(mkPost({ action: 'submit_study', title: 'Test chưa đăng nhập' }));
  assert.equal(unauthSubmit.status, 401, 'Chưa đăng nhập Nhà nghiên cứu phải bị chặn 401');

  // Đăng ký Nhà nghiên cứu mới
  const regRes = await researchPOST(
    mkPost({
      action: 'register_researcher',
      fullName: 'TS. Trần Minh Khoa',
      organization: 'Viện Nghiên cứu Địa không gian Miền Trung',
      specialty: 'Thủy văn & Ngập úng đô thị',
      focusProvince: 'Đà Nẵng',
      email: 'khoa.tran@geo-central.vn',
      password: 'SecurePassword#2026',
      bio: 'Nghiên cứu ngập đô thị khu vực quận Hải Châu'
    })
  );
  assert.equal(regRes.status, 200);
  const regJson = await regRes.json();
  assert.equal(regJson.ok, true);
  assert.ok(regJson.token?.startsWith('rs.'), 'Phải cấp phiên token Nhà nghiên cứu hợp lệ');

  // Đăng nhập lại bằng mật khẩu đã băm scrypt
  const loginRes = await researchPOST(
    mkPost({
      action: 'login_researcher',
      email: 'khoa.tran@geo-central.vn',
      password: 'SecurePassword#2026'
    })
  );
  assert.equal(loginRes.status, 200);
  const loginJson = await loginRes.json();
  assert.equal(loginJson.ok, true);

  // 4. QUY TRÌNH KIỂM ĐỊNH ĐẨY DỮ LIỆU TỪ PHẦN 2 -> BẢN ĐỒ CHÍNH (PHẦN 1) & BÀI VIẾT (PHẦN 3)
  const subRes = await researchPOST(
    mkPost(
      {
        action: 'submit_study',
        title: 'Khảo sát ngập úng đô thị khu vực Hải Châu – Đà Nẵng mùa mưa 2026',
        province: 'Đà Nẵng',
        macroRegion: 'trung',
        centerLat: 16.0544,
        centerLng: 108.2022,
        radiusKm: 6,
        hazardType: 'flood',
        dataClass: 'OBSERVED_DATA',
        summary: 'Ghi nhận 2 điểm trũng thoát nước chậm tại trung tâm Hải Châu sau trận mưa lớn trên 80 mm.',
        methodology: 'Đo cao độ tương đối và phỏng vấn thực địa tại các nút giao thông chính.',
        limitations: 'Chưa có số liệu cảm biến mực nước liên tục trong đường cống ngầm.',
        features: [
          { name: 'Nút giao Quang Trung – Hải Châu (Điểm nghiên cứu)', lat: 16.071, lng: 108.215, category: 'flood', notes: 'Thường ngập nhanh khi mưa lớn trùng triều.' },
          { name: 'Bệnh viện Đà Nẵng (Điểm hỗ trợ y tế)', lat: 16.0725, lng: 108.2155, category: 'medical', notes: 'Cơ sở y tế tuyến thành phố.' }
        ]
      },
      { Authorization: `Bearer ${loginJson.token}` }
    )
  );
  assert.equal(subRes.status, 200);
  const subJson = await subRes.json();
  assert.equal(subJson.submission.status, 'pending_review', 'Hồ sơ mới nộp PHẢI nằm ở trạng thái chờ kiểm định');

  // Trước khi duyệt -> Bản đồ chính tại Đà Nẵng CHƯA được hiển thị điểm chưa kiểm định!
  const beforeZoneRes = await researchGET(new Request('http://localhost/api/research-portal?action=zone_data&lat=16.0544&lng=108.2022&radiusKm=8'));
  const beforeZoneJson = await beforeZoneRes.json();
  assert.equal(beforeZoneJson.features.length, 0, 'Dữ liệu chưa kiểm định tuyệt đối không tự lên Bản đồ chính');

  // Không có quyền Hội đồng kiểm duyệt -> Bị chặn 401
  const badReview = await researchPOST(
    mkPost({ action: 'review_study', submissionId: subJson.submission.id, decision: 'publish' }, { Authorization: `Bearer ${loginJson.token}` })
  );
  assert.equal(badReview.status, 401, 'Nhà nghiên cứu thường không được tự duyệt bài của mình');

  // Hội đồng kiểm duyệt duyệt xuất bản (dùng local dev admin token)
  const approveRes = await researchPOST(
    mkPost(
      { action: 'review_study', submissionId: subJson.submission.id, decision: 'publish', reviewNote: 'Đã xác minh tọa độ & nguồn.' },
      { Authorization: 'Bearer local-dev-admin-token' }
    )
  );
  assert.equal(approveRes.status, 200);
  const approveJson = await approveRes.json();
  assert.equal(approveJson.status, 'published');

  // SAU KHI DUYỆT:
  // (a) Khoanh vùng tại Đà Nẵng (Phần 1) thấy NGAY 2 điểm nghiên cứu mới!
  const afterDaNang = await (
    await researchGET(new Request('http://localhost/api/research-portal?action=zone_data&lat=16.0544&lng=108.2022&radiusKm=8'))
  ).json();
  assert.equal(afterDaNang.features.length, 2, 'Sau khi duyệt, 2 điểm Đà Nẵng phải xuất hiện ngay khi khoanh vùng Đà Nẵng');

  // (b) Khoanh vùng tại Cần Thơ vẫn trả 0 điểm Đà Nẵng (chống lag tuyệt đối!)
  const afterCanTho = await (
    await researchGET(new Request('http://localhost/api/research-portal?action=zone_data&lat=10.0452&lng=105.7469&radiusKm=10'))
  ).json();
  assert.equal(afterCanTho.features.length, 0, 'Khoanh vùng Cần Thơ không được tải lẫn điểm Đà Nẵng');

  // (c) Phần 3 (Bản tin & Bài viết) tự động xuất hiện bài nghiên cứu đã duyệt!
  const pubRes = await (await researchGET(new Request('http://localhost/api/research-portal?action=publications&kind=research_article&region=trung'))).json();
  assert.ok(
    pubRes.items.some((p) => p.submissionId === subJson.submission.id),
    'Bài nghiên cứu sau khi duyệt phải xuất hiện tự động trên Phần 3'
  );

  console.log('VERIFIED VIETNAM NATIONAL 3-PILLAR PLATFORM TESTS PASSED:', {
    provincesCovered: uniqueProvinces.size,
    dongNgacPointsInZone: inDongNgac.length,
    daNangPublishedAfterReview: afterDaNang.features.length,
    canThoZeroLagIsolation: afterCanTho.features.length,
    part3PublishedResearchInCentral: pubRes.items.length
  });
} finally {
  await fs.rm(localSimPath, { force: true }).catch(() => {});
}
