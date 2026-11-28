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
  VIETNAM_VERIFIED_BASINS,
  filterCorridorsInZone,
  filterBasinsInZone
} from '../platform/data/vietnam-verified-hotspots.js';
import { GET as researchGET, POST as researchPOST, OPTIONS as researchOPTIONS } from '../api/research-portal.js';
import {
  ensureZoneDemGrid,
  sampleAnyDemGrid,
  computeTerrainGradient,
  sampleElevationProfile
} from '../platform/gis/hydro-surface.js';
import { lookupCentralMeridian, wgs84ToVn2000Local, vn2000ToWgs84Local } from '../platform/gis/vn2000.js';
import { GET as vnGisGET } from '../api/vn-gis.js';
import { GET as sosGET, POST as sosPOST } from '../api/sos-dispatch.js';
import {
  computeHydrodynamicInstability,
  evaluateUserDistressProbability
} from '../platform/ai/distress-inference.js';

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
  assert.ok(VIETNAM_VERIFIED_BASINS.length >= 10, 'Phải có >= 10 đa giác rốn ngập đô thị đa tỉnh/thành');
  const hueBasins = filterBasinsInZone(VIETNAM_VERIFIED_BASINS, 16.4637, 107.5909, 8);
  assert.ok(hueBasins.length >= 2, 'Khoanh vùng TP. Huế phải có đa giác rốn trũng ven sông Hương / Đông Ba');

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
  assert.ok(html.includes('data-basemap="dark"'), 'Phải có nút chuyển nền Tối (Dark Ops)');
  assert.ok(html.includes('data-map-layer="hydroSurface"'), 'Phải có nút bật/tắt Mặt phủ ngập nước');
  assert.ok(html.includes('data-map-layer="basins"'), 'Phải có nút bật/tắt Rốn trũng & Vành đai');
  assert.ok(html.includes('data-map-layer="heatmap"'), 'Phải có nút bật/tắt Nhiệt rủi ro');
  assert.ok(html.includes('id="hydro-sim-strip"'), 'Phải có thanh điều khiển mô phỏng mặt nước (USGS/NOAA style)');
  assert.ok(html.includes('data-map-layer="flowVectors"'), 'Phải có lớp Vector Hướng chảy & Độ dốc');
  assert.ok(html.includes('id="river-discharge-card"'), 'Phải có biểu đồ Lưu lượng dòng chảy lưu vực 21 ngày (GloFAS)');
  assert.ok(html.includes('id="radar-timeline-bar"'), 'Phải có thanh tua chuỗi thời gian Radar mưa 2 giờ');
  assert.ok(html.includes('data-drawmode="polygon"'), 'Cổng Nghiên cứu phải hỗ trợ vẽ Đa giác (Polygon) & Tuyến (LineString)');
  assert.ok(!html.includes('id="pillar-dev"'), 'Trang chính tuyệt đối KHÔNG được chứa khu vực Quản trị & Dev');
  assert.ok(!html.includes('data-pillar="dev"'), 'Thanh điều hướng trang chính KHÔNG được hiện nút Quản trị & Dev');
  assert.ok(!html.includes('id="reviewer-panel"'), 'Trang chính KHÔNG được chứa khung nhập ADMIN_PASSCODE');
  assert.ok(!html.includes('ADMIN_PASSCODE'), 'Trang chính KHÔNG được lộ nhãn ADMIN_PASSCODE');
  assert.ok(html.includes('id="hourly-rain-bars"'), 'Phải có biểu đồ lượng mưa 24 giờ tới');
  assert.ok(!html.includes('Đề tài 08'), 'Phải bỏ nhãn bài tập Đề tài 08 trên nền tảng thực tế');
  assert.ok(!html.includes('Pre-test'), 'Phải bỏ thẻ khảo sát học thuật Pre-test');
  assert.ok(!html.includes('Video 45s'), 'Phải bỏ thẻ Video 45s sáo rỗng');

  // 2A. KIỂM TRA WEB QUẢN TRỊ & DEV TÁCH RIÊNG HOÀN TOÀN (ops-console/) + CORS BẢO MẬT
  const opsHtml = await fs.readFile(path.join(rootDir, 'ops-console', 'index.html'), 'utf8');
  assert.ok(opsHtml.includes('VN Resilience Ops Console'), 'Phải có ứng dụng web Quản trị & Dev độc lập tại ops-console/');
  assert.ok(opsHtml.includes('noindex, nofollow'), 'Web Quản trị riêng phải gắn thẻ chống lập chỉ mục tìm kiếm');

  const corsAllowedPreflight = await researchOPTIONS(
    new Request('http://localhost/api/research-portal', {
      method: 'OPTIONS',
      headers: { Origin: 'https://vn-resilience-ops.vercel.app' }
    })
  );
  assert.equal(corsAllowedPreflight.status, 204);
  assert.equal(
    corsAllowedPreflight.headers.get('access-control-allow-origin'),
    'https://vn-resilience-ops.vercel.app',
    'API phải cho phép CORS từ tên miền Web Quản trị riêng https://vn-resilience-ops.vercel.app'
  );

  const corsBlockedPreflight = await researchOPTIONS(
    new Request('http://localhost/api/research-portal', {
      method: 'OPTIONS',
      headers: { Origin: 'https://malicious-site.example.com' }
    })
  );
  assert.equal(
    corsBlockedPreflight.headers.get('access-control-allow-origin'),
    null,
    'API phải từ chối CORS từ tên miền lạ không ủy quyền'
  );

  // 2B. KIỂM TRA LỚP MẶT PHỦ NGẬP NƯỚC ĐỊA HÌNH & CSS THANH CUỘN MẢNH (KHÔNG CÒN NÚT ▼ WINDOWS)
  const coreDem = await ensureZoneDemGrid(21.072514, 105.77387, 2);
  assert.equal(coreDem.source, 'core_dem_625', 'Vùng lõi Đông Ngạc phải dùng lưới DEM 25x25 (625 điểm)');
  assert.equal(coreDem.rows, 25);
  assert.equal(coreDem.cols, 25);
  const humgElev = sampleAnyDemGrid(coreDem, 21.072514, 105.77387);
  assert.ok(Number.isFinite(humgElev) && humgElev > 0 && humgElev < 30, 'Nội suy song tuyến tính cao độ HUMG hợp lệ');
  assert.ok(coreDem.stats.lowlandPct > 20, 'Thống kê tỷ lệ vùng trũng hợp lệ');
  const grad = computeTerrainGradient(coreDem, 21.072514, 105.77387);
  assert.ok(grad && Number.isFinite(grad.slopeDeg) && grad.slopeDeg >= 0, 'Giải tích gradient độ dốc & hướng chảy hợp lệ');
  const prof = sampleElevationProfile(coreDem, 21.0725, 105.768, 21.0725, 105.779, 15);
  assert.equal(prof.length, 15, 'Lấy mẫu mặt cắt địa hình tức thì hợp lệ');

  // 2C. KIỂM TRA HỆ QUY CHIẾU VN-2000 (SAI SỐ <= 0.01M SO VỚI VN2000.VN) & PROXY /api/vn-gis
  assert.equal(lookupCentralMeridian('Đà Nẵng'), 107.75);
  assert.equal(lookupCentralMeridian('Hà Nội'), 105.0);
  const dnVn2k = wgs84ToVn2000Local(16.030263, 107.904724, 107.75, 3);
  assert.ok(Math.abs(dnVn2k.x - 1772933.818) < 0.02, `Sai số X VN-2000 phải < 2cm (thực tế: ${dnVn2k.x})`);
  assert.ok(Math.abs(dnVn2k.y - 516361.586) < 0.02, `Sai số Y VN-2000 phải < 2cm (thực tế: ${dnVn2k.y})`);
  const backWgs = vn2000ToWgs84Local(dnVn2k.x, dnVn2k.y, 107.75, 3);
  assert.ok(Math.abs(backWgs.lat - 16.030263) < 1e-6 && Math.abs(backWgs.lng - 107.904724) < 1e-6);

  const badVnGis = await vnGisGET(new Request('http://localhost/api/vn-gis?action=spot_info&lat=35.67&lng=139.65'));
  assert.equal(badVnGis.status, 400, '/api/vn-gis phải chặn tọa độ ngoài lãnh thổ Việt Nam');
  const goodVnGis = await vnGisGET(new Request('http://localhost/api/vn-gis?action=wgs84_to_vn2000&lat=21.072514&lng=105.77387&province=H%C3%A0%20N%E1%BB%99i'));
  assert.equal(goodVnGis.status, 200);
  const goodVnGisJson = await goodVnGis.json();
  assert.equal(goodVnGisJson.ok, true);
  assert.equal(goodVnGisJson.centralMeridian, 105);
  assert.ok(html.includes('id="vn-cadastral-card"'), 'Web Chính phải hiển thị thẻ Địa giới trước/sau sáp nhập & Dân cư');
  assert.ok(html.includes('id="btn-vn2k-to-map"'), 'Cổng Nghiên cứu phải có bộ quy đổi VN-2000 <-> WGS84');

  const css = await fs.readFile(path.join(rootDir, 'citizen.css'), 'utf8');
  assert.ok(css.includes('::-webkit-scrollbar-button'), 'CSS phải ẩn nút mũi tên ▼ thanh cuộn mặc định Windows');
  assert.ok(css.includes('scrollbar-width: thin'), 'CSS phải dùng thanh cuộn mảnh toàn cục');

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

  // =========================================================================
  // 5. KIỂM TOÁN BẢO MẬT ZERO-TRUST SOS (CHỐNG TẮC ĐƯỜNG, CHỐNG KẺ XẤU, ẨN VỊ TRÍ) & AI THỰC CHỨNG
  // =========================================================================
  const mkSosPost = (body, headers = {}) =>
    new Request('http://localhost/api/sos-dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.88', ...headers },
      body: JSON.stringify(body)
    });

  // 5A. Không ai xem được bản đồ vị trí người tải App (exposedUserCoordinates === 0)
  const shieldRes = await (await sosGET(new Request('http://localhost/api/sos-dispatch?action=zone_shield_summary&lat=21.072514&lng=105.77387'))).json();
  assert.equal(shieldRes.ok, true);
  assert.equal(shieldRes.exposedUserCoordinates, 0, 'Tuyệt đối không lộ bất kỳ tọa độ người dùng nào');

  // 5B. Đăng nhập Google cho người gặp nạn & Đăng ký tài khoản thường (kẻ lạ chưa xác minh)
  const victimAuth = await (
    await sosPOST(mkSosPost({ action: 'google_auth', quickGoogleProfile: { fullName: 'Nguyễn An Toàn', email: 'antoan.user@gmail.com' } }))
  ).json();
  assert.equal(victimAuth.ok, true);

  const strangerAuth = await (
    await sosPOST(
      mkSosPost({
        action: 'register_citizen',
        fullName: 'Tài Khoản Chưa Duyệt',
        email: 'stranger@example.vn',
        password: 'Password#12345',
        requestResponderVetting: true
      })
    )
  ).json();
  assert.equal(strangerAuth.ok, true);
  assert.equal(strangerAuth.profile.trustTier, 'pending_responder');

  // Kẻ lạ chưa được Ops Console thẩm định CỐ TÌNH đọc hộp thư SOS -> BỊ CHẶN 403!
  const blockedInbox = await sosGET(
    new Request('http://localhost/api/sos-dispatch?action=responder_inbox&lat=21.0725&lng=105.7738', {
      headers: { Authorization: `Bearer ${strangerAuth.token}` }
    })
  );
  assert.equal(blockedInbox.status, 403, 'Tài khoản chưa thẩm định tuyệt đối không được xem danh sách người cần cứu trợ');

  // 5C. Sự cố ngập quá sâu (>= 55 cm) -> Tự động khóa luồng dân sự (maxResponders = 0) chuyển thẳng 112!
  const deepSos = await (
    await sosPOST(
      mkSosPost(
        { action: 'create_sos', lat: 21.0725, lng: 105.7738, category: 'trapped_deep_water', waterDepthM: 0.55 },
        { Authorization: `Bearer ${victimAuth.token}` }
      )
    )
  ).json();
  assert.equal(deepSos.ticket.maxResponders, 0, 'Ngập nguy hiểm tính mạng phải khóa luồng cá nhân tự phát');
  assert.equal(deepSos.ticket.escalate112, true);

  // 5D. Sự cố chết máy thông thường -> Khóa cứng K=2 chỗ chống tắc đường + Làm mờ tọa độ trước khi nhận
  const stallSos = await (
    await sosPOST(
      mkSosPost(
        { action: 'create_sos', lat: 21.072514, lng: 105.77387, category: 'stalled_vehicle', waterDepthM: 0.26, areaHint: 'Đầu Phố Viên' },
        { Authorization: `Bearer ${victimAuth.token}` }
      )
    )
  ).json();
  assert.equal(stallSos.ticket.maxResponders, 2);
  assert.equal(stallSos.ticket.safetyPin.length, 4, 'Phải sinh Mã PIN đối chiếu 4 chữ số');

  // Phiên Đội xung kích 1 xem hộp thư trước khi nhận: CHỈ thấy tọa độ làm mờ, KHÔNG thấy tọa độ thật!
  const squad1 = await (await sosPOST(mkSosPost({ action: 'demo_squad_session', squadId: 'SQUAD-HN-DONGNGAC' }))).json();
  const inboxBefore = await (
    await sosGET(
      new Request('http://localhost/api/sos-dispatch?action=responder_inbox&lat=21.0725&lng=105.7738', {
        headers: { Authorization: `Bearer ${squad1.token}` }
      })
    )
  ).json();
  const seenTicket = inboxBefore.tickets.find((t) => t.id === stallSos.ticket.id);
  assert.ok(seenTicket, 'Đội xung kích cùng ô Geohash phải thấy ca đang mở');
  assert.equal(seenTicket.locationUnlocked, false, 'Trước khi nhận ca tuyệt đối không mở khóa tọa độ chính xác');
  assert.equal(seenTicket.exactLat, undefined, 'Không được trả exactLat khi chưa khóa slot');
  assert.equal(seenTicket.safetyPin, undefined, 'Người ứng cứu không được biết trước safetyPin của nạn nhân');

  // Ops Console duyệt thêm 2 tình nguyện viên để kiểm chứng khóa trần K=2 chỗ chống ùn tắc
  const r2Reg = await (
    await sosPOST(mkSosPost({ action: 'register_citizen', fullName: 'TNV Hai', email: 'tnv2@vn.org', password: 'Password#12345' }))
  ).json();
  const r3Reg = await (
    await sosPOST(mkSosPost({ action: 'register_citizen', fullName: 'TNV Ba', email: 'tnv3@vn.org', password: 'Password#12345' }))
  ).json();
  await sosPOST(
    mkSosPost(
      { action: 'admin_vet_account', accountId: r2Reg.profile.id, trustTier: 'verified_responder', status: 'active' },
      { Authorization: 'Bearer local-dev-admin-token' }
    )
  );
  await sosPOST(
    mkSosPost(
      { action: 'admin_vet_account', accountId: r3Reg.profile.id, trustTier: 'verified_responder', status: 'active' },
      { Authorization: 'Bearer local-dev-admin-token' }
    )
  );
  const r2Login = await (await sosPOST(mkSosPost({ action: 'login_citizen', email: 'tnv2@vn.org', password: 'Password#12345' }))).json();
  const r3Login = await (await sosPOST(mkSosPost({ action: 'login_citizen', email: 'tnv3@vn.org', password: 'Password#12345' }))).json();

  // Người 1 nhận chỗ (1/2) -> Mở khóa tọa độ phiên
  const claim1 = await (
    await sosPOST(
      mkSosPost({ action: 'claim_slot', ticketId: stallSos.ticket.id, pledgedFreeSupport: true }, { Authorization: `Bearer ${squad1.token}` })
    )
  ).json();
  assert.equal(claim1.ticket.slotsFilled, 1);
  assert.equal(claim1.ticket.locationUnlocked, true);

  // Người 2 nhận chỗ (2/2) -> Đủ hạn ngạch -> Chuyển sang locked_full
  const claim2 = await (
    await sosPOST(
      mkSosPost({ action: 'claim_slot', ticketId: stallSos.ticket.id, pledgedFreeSupport: true }, { Authorization: `Bearer ${r2Login.token}` })
    )
  ).json();
  assert.equal(claim2.ticket.slotsFilled, 2);
  assert.equal(claim2.ticket.status, 'locked_full');

  // Người 3 cố bấm nhận thêm -> BỊ CHẶN 409 CONFLICT (Chống kéo đám đông gây tắc đường!)
  const claim3Res = await sosPOST(
    mkSosPost({ action: 'claim_slot', ticketId: stallSos.ticket.id, pledgedFreeSupport: true }, { Authorization: `Bearer ${r3Login.token}` })
  );
  assert.equal(claim3Res.status, 409, 'Đủ 2 người hỗ trợ phải khóa cứng không cho người thứ 3 nhận thêm gây tắc đường');

  // Đối chiếu PIN 4 số tại hiện trường
  const badPinRes = await sosPOST(
    mkSosPost({ action: 'verify_pin', ticketId: stallSos.ticket.id, pin: '0000' }, { Authorization: `Bearer ${squad1.token}` })
  );
  if (stallSos.ticket.safetyPin !== '0000') assert.equal(badPinRes.status, 400);
  const goodPin = await (
    await sosPOST(
      mkSosPost({ action: 'verify_pin', ticketId: stallSos.ticket.id, pin: stallSos.ticket.safetyPin }, { Authorization: `Bearer ${squad1.token}` })
    )
  ).json();
  assert.equal(goodPin.ok, true);

  // Nạn nhân báo cáo TNV 2 đòi tiền chặt chém -> Khóa vĩnh viễn TNV 2 ngay lập tức!
  const abuseRes = await (
    await sosPOST(
      mkSosPost(
        { action: 'report_abuse', ticketId: stallSos.ticket.id, responderId: r2Reg.profile.id, reason: 'Đòi phí kéo xe trái cam kết' },
        { Authorization: `Bearer ${victimAuth.token}` }
      )
    )
  ).json();
  assert.equal(abuseRes.ok, true);
  const bannedCheck = await sosGET(
    new Request('http://localhost/api/sos-dispatch?action=responder_inbox&lat=21.0725&lng=105.7738', {
      headers: { Authorization: `Bearer ${r2Login.token}` }
    })
  );
  assert.equal(bannedCheck.status, 403, 'Tài khoản bị tố cáo lợi dụng phải bị tước quyền ngay lập tức');

  // Nạn nhân xác nhận đã an toàn -> Tọa độ thật bị XÓA TRẮNG ngay lập tức (Auto-Shred)!
  const resolved = await (
    await sosPOST(mkSosPost({ action: 'resolve_sos', ticketId: stallSos.ticket.id }, { Authorization: `Bearer ${victimAuth.token}` }))
  ).json();
  assert.equal(resolved.ticket.shreddedLocation, true);
  assert.equal(resolved.ticket.locationUnlocked, false);
  assert.equal(resolved.ticket.exactLat, undefined, 'Sau khi kết thúc ca, tọa độ chính xác phải bị xóa trắng hoàn toàn');

  // 5E. Kiểm chứng mô hình AI Thủy động lực (Manning + Martínez-Gomariz 2016) & Chống báo động giả
  const dryHydro = computeHydrodynamicInstability({ elevM: 15, medianElevM: 13.5, rainMmPerHour: 0, dailyRainMm: 0 });
  const redLightCheck = evaluateUserDistressProbability({
    hydro: dryHydro,
    kinematics: { prevSpeedKmh: 28, currentSpeedKmh: 0, stationarySeconds: 95 }
  });
  assert.equal(redLightCheck.triggerProactivePrompt, false, 'Dừng đèn đỏ 95 giây ở đường khô ráo tuyệt đối KHÔNG được báo động giả');

  const floodHydro = computeHydrodynamicInstability({
    elevM: 8.0,
    medianElevM: 13.5,
    minElevM: 7.2,
    slopeDeg: 1.8,
    rainMmPerHour: 40,
    dailyRainMm: 88,
    nearFloodSpotMeters: 40
  });
  assert.ok(floodHydro.depthM >= 0.24 && floodHydro.dvProduct >= 0.15, 'Rốn ngập mưa lớn phải vượt ngưỡng mất ổn định xe hai bánh');
  const stallAnomaly = evaluateUserDistressProbability({
    hydro: floodHydro,
    slopeDeg: 1.8,
    dailyRainMm: 88,
    kinematics: { prevSpeedKmh: 22, currentSpeedKmh: 0, stationarySeconds: 125 }
  });
  assert.equal(stallAnomaly.triggerProactivePrompt, true, 'Đột ngột dừng kẹt 125s giữa rốn ngập sâu phải kích hoạt hỏi thăm an toàn chủ động');

  console.log('VERIFIED VIETNAM NATIONAL 4-PILLAR + ZERO-TRUST SOS + HYDRO-AI TESTS PASSED:', {
    provincesCovered: uniqueProvinces.size,
    dongNgacPointsInZone: inDongNgac.length,
    daNangPublishedAfterReview: afterDaNang.features.length,
    canThoZeroLagIsolation: afterCanTho.features.length,
    zeroExposedUserCoords: shieldRes.exposedUserCoordinates === 0,
    antiCongestionSlotCap2: claim3Res.status === 409,
    proactiveAiDistressPct: stallAnomaly.probabilityPct
  });
} finally {
  await fs.rm(localSimPath, { force: true }).catch(() => {});
}
