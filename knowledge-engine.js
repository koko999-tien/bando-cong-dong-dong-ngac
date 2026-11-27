/**
 * CỖ MÁY TRI THỨC ĐỊA PHƯƠNG CÓ TRÍCH DẪN NGUỒN ("NOTEBOOK TRI THỨC P. ĐÔNG NGẠC — TƯƠNG THÍCH GOOGLE NOTEBOOKLM")
 * - Hỗ trợ tìm kiếm tiếng Việt có dấu & không dấu siêu tốc trên trình duyệt (< 5ms).
 * - Mọi câu trả lời đều bám chặt vào kho chứng cứ thực tế (ECMWF ERA5, Copernicus DEM, OpenStreetMap, Báo chí 2024–2026, Bộ Y tế, EVNHANOI, HSDC).
 * - Tích hợp trình xuất gói nguồn chuẩn Markdown (.md) để nạp trực tiếp vào Google NotebookLM (notebooklm.google.com) tạo Podcast / Sơ đồ tư duy.
 */

import {
  HUMG_CENTER,
  ERA5_CLIMATE_FACTS,
  MONTHLY_2026_CLIMATE,
  EMERGENCY_DIRECTORY,
  ROUTE_PRESETS,
  SAMPLE_HUMG_POINTS
} from './humg-data.js';
import { CATEGORY_LABELS } from './gis-utils.js';

function haversineMetersSimple(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const LANDMARK_MATCHERS = [
  { presetIdx: 0, aliases: ['dh mo', 'dai hoc mo', '18 pho vien', 'khu a', 'cong truong', 'c12'] },
  { presetIdx: 1, aliases: ['khu b', 'pham van nghi'] },
  { presetIdx: 2, aliases: ['cuoi pho vien', 'thuong cat', 'cau pho vien', 'pho vien'] },
  { presetIdx: 3, aliases: ['cau noi', 'song nhue', 'ngo 86 cau noi'] },
  { presetIdx: 4, aliases: ['resco', 'pham van dong', '138 pham van dong', 'vanh dai 3'] },
  { presetIdx: 5, aliases: ['ecohome', 'dong thang', 'ke ve', 'tan xuan'] },
  { presetIdx: 6, aliases: ['cho co nhue', 'co nhue', 'ngo 521', 'ngo 401', 'ngo 103', 'tran cung'] },
  { presetIdx: 7, aliases: ['ubnd', 'pho van hoi', 'duc thang', 'tan nhue', 'thuy phuong'] }
];

/**
 * Bộ máy Tổng hợp Tư vấn Tình huống Ngôn ngữ Tự nhiên (Deterministic Zero-Hallucination Situational Q&A)
 * Phân tích đồng thời: câu hỏi tự nhiên, điểm đi → điểm đến, mối nguy (ngập/xoáy cống/rò điện/sốc nhiệt/trọ mái tôn/buýt),
 * thời tiết trực tiếp tại 18 Phố Viên và khoảng cách tới cơ sở y tế/tránh trú có mái che gần nhất.
 */
export function synthesizeSituationalAnswer(rawQuery, currentPoints = SAMPLE_HUMG_POINTS, liveWeather = null) {
  const q = foldVietnamese(rawQuery);
  if (!q || q.length < 4) return null;

  const isFlood = /(mua|ngap|lut|nuoc dang|chet may|thuy kich|cong|xoay|di loi nao|duong nao|ve tro|khu b|cau noi)/.test(q);
  const isElec = /(dien|ro dien|giat|aptomat|cau dao|o cam|day dien|1900 1288|1558)/.test(q);
  const isHeat = /(nang|nong|soc nhiet|say nang|choang|hoa mat|oresol|uv|40|buyt|09a|28|31|pham van dong)/.test(q);
  const isDorm = /(tro|mai ton|gac xep|tien dien|dieu hoa|quat|45 50)/.test(q);
  const isAdmin = /(ubnd|phuong|cong an|so dien thoai|khan cap|sap nhap|cuu ho|115|114)/.test(q);
  const isStats = /(era5|thang 8|624|bao nhieu|thong ke|dem|cao do|long mang|920 ty|kenh thuy phuong)/.test(q);

  // Nhận diện các mốc địa danh xuất hiện theo thứ tự trong câu hỏi để bắt cặp Xuất phát -> Điểm đến
  const matchedLandmarks = [];
  for (const lm of LANDMARK_MATCHERS) {
    let bestPos = Infinity;
    for (const al of lm.aliases) {
      const idx = q.indexOf(al);
      if (idx >= 0 && idx < bestPos) bestPos = idx;
    }
    if (bestPos < Infinity) matchedLandmarks.push({ presetIdx: lm.presetIdx, pos: bestPos });
  }
  matchedLandmarks.sort((a, b) => a.pos - b.pos);

  let routeAction = null;
  if (matchedLandmarks.length >= 2 && matchedLandmarks[0].presetIdx !== matchedLandmarks[1].presetIdx) {
    const oIdx = matchedLandmarks[0].presetIdx;
    const dIdx = matchedLandmarks[1].presetIdx;
    routeAction = {
      originIdx: oIdx,
      destIdx: dIdx,
      originLabel: ROUTE_PRESETS[oIdx].label,
      destLabel: ROUTE_PRESETS[dIdx].label
    };
  } else if (isFlood && /(di|ve|duong|loi|tuyen)/.test(q) && matchedLandmarks.length === 1) {
    const targetIdx = matchedLandmarks[0].presetIdx;
    const oIdx = targetIdx === 0 ? 3 : 0;
    const dIdx = targetIdx;
    if (oIdx !== dIdx) {
      routeAction = {
        originIdx: oIdx,
        destIdx: dIdx,
        originLabel: ROUTE_PRESETS[oIdx].label,
        destLabel: ROUTE_PRESETS[dIdx].label
      };
    }
  }

  // Xác định tọa độ neo để tính khoảng cách tới Điểm An toàn có mái che gần nhất
  const activePts = currentPoints.filter((p) => p.status !== 'hidden');
  let anchorLat = HUMG_CENTER.lat;
  let anchorLng = HUMG_CENTER.lng;
  let anchorLabel = 'Cổng 18 Phố Viên (ĐH Mỏ)';

  if (matchedLandmarks.length > 0) {
    const pr = ROUTE_PRESETS[matchedLandmarks[0].presetIdx];
    anchorLat = pr.lat;
    anchorLng = pr.lng;
    anchorLabel = pr.label;
  } else {
    const directPt = activePts.find((p) => q.includes(foldVietnamese(p.name).slice(0, 12)));
    if (directPt) {
      anchorLat = Number(directPt.lat);
      anchorLng = Number(directPt.lng);
      anchorLabel = directPt.name;
    }
  }

  // Tìm cơ sở y tế / tránh trú có mái che gần nhất (ưu tiên y tế nếu câu hỏi về sốc nhiệt/cấp cứu)
  const safeCandidates = activePts
    .filter((p) => p.layerGroup === 'safe' && p.confidenceTier !== 'C' && !p.outdoorOnly)
    .map((p) => {
      const dist = haversineMetersSimple(anchorLat, anchorLng, Number(p.lat), Number(p.lng));
      const medicalBonus = isHeat && p.category === 'medical' ? -120 : 0;
      return { point: p, distanceMeters: dist, walkingMinutes: Math.max(1, Math.round(dist / 78)), rankScore: dist + medicalBonus };
    })
    .sort((a, b) => a.rankScore - b.rankScore);

  const nearestSafe = safeCandidates[0] || null;

  // Tìm các điểm rủi ro liên quan trực tiếp quanh vị trí đang hỏi
  const nearbyRisks = activePts
    .filter((p) => p.layerGroup === 'risk')
    .map((p) => ({
      ...p,
      distFromAnchor: haversineMetersSimple(anchorLat, anchorLng, Number(p.lat), Number(p.lng))
    }))
    .filter((p) => {
      if (isHeat && !isFlood) return p.category === 'heat' && p.distFromAnchor <= 1200;
      if (isFlood && !isHeat) return p.category !== 'heat' && p.distFromAnchor <= 900;
      return p.distFromAnchor <= 800;
    })
    .sort((a, b) => a.distFromAnchor - b.distFromAnchor)
    .slice(0, 3);

  const bullets = [];
  const hotlines = [];
  const citations = new Set();
  let riskLevel = 'info';
  let headline = `Tổng hợp dữ liệu thực chứng quanh ${anchorLabel}`;

  if (liveWeather && Number.isFinite(liveWeather.temp)) {
    bullets.push(
      `Thời tiết thực tế lúc này tại 18 Phố Viên: ${liveWeather.temp}°C (cảm nhận ${liveWeather.apparentTemp}°C), lượng mưa hiện tại ${liveWeather.rainMm} mm (dự báo ngày ${liveWeather.dailyRainMm} mm, UV tối đa ${liveWeather.uvMax}).`
    );
    citations.add('Trạm lưới Open-Meteo Live tại 21.0725°N, 105.7739°E');
  }

  if (isElec) {
    riskLevel = 'danger';
    headline = 'Xử trí khẩn cấp An toàn Điện khi nước tràn nhà trọ / ngập đường';
    bullets.push(
      'Đứng trên bậc khô ráo NGẮT NGAY CẦU DAO / APTOMAT TỔNG bằng tay khô trước khi kê dọn đồ; tuyệt đối không lội chân ướt rút ổ cắm kéo dài trên sàn.'
    );
    bullets.push(
      'Nếu phát hiện cột điện, hộp công tơ hoặc trạm biến áp ngập nước có nguy cơ rò điện, lùi xa tối thiểu 5–10 m, cảnh báo người xung quanh và gọi ngay Tổng đài EVNHANOI.'
    );
    hotlines.push({ label: 'Báo sự cố rò điện EVNHANOI 24/7', phone: '1900 1288' }, { label: 'Cứu nạn PCCC', phone: '114' });
    citations.add('Khuyến cáo an toàn điện mùa mưa bão — EVNHANOI (evnhanoi.vn)');
  }

  if (isFlood) {
    riskLevel = 'danger';
    if (!isElec) {
      headline = routeAction
        ? `Tư vấn di chuyển an toàn mùa mưa: ${routeAction.originLabel.split('(')[0].trim()} → ${routeAction.destLabel.split('(')[0].trim()}`
        : `Cảnh báo ngập cục bộ & định hướng tránh trú quanh ${anchorLabel}`;
    }
    bullets.push(
      'Quy tắc “Nửa bánh xe”: Không cố chạy xe máy qua đoạn ngập >20–25 cm hoặc nơi nước đục che khuất mặt đường, đặc biệt tránh dải lòng máng DEM 6–12 m (Cuối Phố Viên, Cầu Phố Viên, Cầu Noi, Tân Nhuệ, Tây Thăng Long) có ổ gà và dòng xoáy miệng cống.'
    );
    if (routeAction) {
      bullets.push(
        'Bấm nút “Phân tích & Vẽ lộ trình OSRM” bên dưới để xem vệt cảnh báo đỏ và tuyến đường vòng qua dải nền cao Cổ Nhuế (14–17 m DSM).'
      );
    }
    hotlines.push({ label: 'Đường dây nóng Thoát nước HN (HSDC)', phone: '024 3974 6225' });
    citations.add('Copernicus DEM GLO-30 & Báo Lao Động (18/09/2026 — điểm ngập xoáy cống cuối Phố Viên)');
  }

  if (isHeat) {
    if (riskLevel !== 'danger') riskLevel = 'caution';
    if (!isFlood && !isElec) {
      headline = 'Xử trí Sốc nhiệt 3 phút đầu & Điểm nghỉ mát / Y tế gần nhất';
    }
    bullets.push(
      'Quy tắc Vàng 3 phút (Bộ Y tế): Đưa ngay vào bóng râm thoáng gió, nới lỏng quần áo, chườm khăn mát vùng CỔ – NÁCH – BẸN; nếu còn tỉnh táo cho uống từng ngụm nhỏ nước mát/Oresol. Không đưa đột ngột vào điều hòa 16°C, không dùng Paracetamol.'
    );
    if (/(buyt|09a|28|31|pham van dong)/.test(q)) {
      bullets.push(
        'Với sinh viên đi buýt 09A, 28, 31: Trạm BV Phương Đông – Phố Viên cách cổng trường 121 m; tránh đứng chờ lâu không mũ nón khung 11h00–15h00 trên trục Phạm Văn Đồng do bức xạ mặt nhựa UHI chênh +2–4°C.'
      );
    }
    hotlines.push({ label: 'Cấp cứu Y tế', phone: '115' });
    citations.add('Hướng dẫn sơ cứu say nắng – sốc nhiệt Bộ Y tế & OpenStreetMap');
  }

  if (isDorm) {
    if (riskLevel === 'info') riskLevel = 'caution';
    if (!isFlood && !isElec && !isHeat) {
      headline = 'Giải pháp hạ nhiệt Phòng trọ mái tôn (45–50°C) tiết kiệm điện cho sinh viên';
    }
    bullets.push(
      'Ban ngày (10h–16h): Che rèm/tấm chắn bức xạ cửa hướng Tây và ưu tiên học tập tại Thư viện / Sảnh C12 Khu A ĐH Mỏ (cao ráo 17 m, mát mẻ miễn phí).'
    );
    bullets.push(
      'Chiều tối (sau 17h30): Mở cửa sổ và đặt quạt THỔI HƯỚNG RA NGOÀI 15 phút để đẩy túi khí nóng dưới mái tôn thoát ra trước khi bật điều hòa 26–27°C kết hợp quạt.'
    );
    citations.add('Phóng sự xóm trọ Báo Lao Động, VTV & Khuyến cáo tiết kiệm điện EVNHANOI');
  }

  if (isAdmin) {
    if (!isFlood && !isElec && !isHeat) {
      headline = 'Đầu mối Hành chính & Cứu trợ Phường Đông Ngạc (mới sau 01/07/2025)';
    }
    bullets.push(
      'UBND Phường Đông Ngạc mới đặt tại Phố Văn Hội, TDP số 2 (cách ĐH Mỏ ~747 m, ĐT: 024 2217 5455). Công an Phường đặt tại 125 đường Thụy Phương (ĐT: 024 3223 3119).'
    );
    hotlines.push(
      { label: 'UBND Phường Đông Ngạc', phone: '024 2217 5455' },
      { label: 'Công an Phường Đông Ngạc', phone: '024 3223 3119' }
    );
    citations.add('Cổng TTĐT TP. Hà Nội (hanoi.gov.vn — nghị quyết sắp xếp ĐVHC 01/07/2025)');
  }

  if (isStats || bullets.length <= (liveWeather ? 1 : 0)) {
    bullets.push(
      'Chứng cứ khí tượng & địa hình tại ĐH Mỏ: Năm 2026 (đến 20/11) ghi nhận 76 ngày nhiệt cảm nhận ≥40°C và tổng mưa 2.120,4 mm (đỉnh tháng 08/2026 đạt 624,8 mm); cao độ DEM hạ từ 17 m (Khu A ĐH Mỏ) xuống 6–12 m dọc sông Nhuệ.'
    );
    citations.add('ECMWF ERA5 Archive (2024–2026) & Copernicus DEM GLO-30');
  }

  if (nearestSafe) {
    bullets.push(
      `Điểm hỗ trợ có mái che gần ${anchorLabel.split('(')[0].trim()} nhất: ${nearestSafe.point.name} — cách ${nearestSafe.distanceMeters} m (~${nearestSafe.walkingMinutes} phút đi bộ).`
    );
  }

  // Khử trùng danh sách số điện thoại
  const seenPhones = new Set();
  const uniqueHotlines = hotlines.filter((h) => {
    if (seenPhones.has(h.phone)) return false;
    seenPhones.add(h.phone);
    return true;
  });

  return {
    headline,
    riskLevel,
    bullets,
    hotlines: uniqueHotlines,
    recommendedSafePt: nearestSafe
      ? {
          id: nearestSafe.point.id,
          name: nearestSafe.point.name,
          distanceMeters: nearestSafe.distanceMeters,
          walkingMinutes: nearestSafe.walkingMinutes
        }
      : null,
    flaggedRiskPts: nearbyRisks.map((r) => ({
      id: r.id,
      name: r.name,
      distM: r.distFromAnchor
    })),
    routeAction,
    citations: [...citations]
  };
}

export function foldVietnamese(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KNOWLEDGE_NOTEBOOK_CARDS = [
  {
    id: 'KB-01',
    topic: 'Thủy văn & Hạ tầng 2026',
    title: 'Vì sao dự án Kênh Thụy Phương 920,6 tỷ đã giảm ngập trục lớn nhưng cuối Phố Viên vẫn ngập nguy hiểm?',
    tags: ['kenh thuy phuong', '920 ty', 'cuoi pho vien', 'xoay cong', 'tai nan', 'thang 9 2026', 'ecohome', 'resco'],
    summary:
      'Dự án khẩn cấp cải tạo tuyến kênh Thụy Phương (QĐ 5520/QĐ-UBND ngày 10/11/2025, vốn 920,6 tỷ đồng, trạm bơm 5 m³/s + ~7,5 km kênh/cống hộp nối sông Tô Lịch) đã giúp cụm chung cư Ecohome 1–3 và Resco rút nước nhanh hơn hẳn trong bão số 4 ngày 23/08/2026 (mưa 99,6–116 mm). Tuy nhiên, chỉ 3 tuần sau (15–18/09/2026, mưa 71,3 mm), đoạn cuối Phố Viên (cách ĐH Mỏ 372 m) vẫn ngập sâu kèm ổ gà và dòng xoáy miệng cống gây tai nạn thương tâm. Điều này chứng minh: công trình đầu mối giải quyết lưu vực lớn, nhưng các điểm đen vi mô (ngõ trũng, cống hở, mặt đường xuống cấp) bắt buộc cần Bản đồ Cộng đồng Mở để người dân tại chỗ cảnh báo tức thời.',
    citations: [
      'QĐ 5520/QĐ-UBND TP. Hà Nội (10/11/2025) & HĐND TP. Hà Nội (2026)',
      'Báo Lao Động (18/09/2026): "Người dân mong xử lý dứt điểm úng ngập cuối phố Viên, Hà Nội"',
      'ECMWF ERA5 tại 21.0725°N, 105.7739°E (23/08/2026: 116 mm; 15/09/2026: 71,3 mm)'
    ],
    relatedPointIds: ['R-01', 'R-09', 'R-11', 'R-07']
  },
  {
    id: 'KB-02',
    topic: 'Khí tượng ERA5 2024–2026',
    title: 'Thống kê chi tiết mưa cực đoan & nắng nóng tại ĐH Mỏ - Địa chất giai đoạn 2024 – 2026 (theo năm & từng tháng)',
    tags: ['era5', 'khi tuong', 'luong mua', 'thang 8 2026', '624', '76 ngay', 'nhiet do', 'bao yagi', 'thong ke'],
    summary:
      'Tại tọa độ lưới ĐH Mỏ (21.0725°N, 105.7739°E), chuỗi ECMWF ERA5 ghi nhận: Năm 2024 có 71 ngày nhiệt cảm nhận ≥40°C (đỉnh 41,2°C / 46,3°C) và 7 ngày mưa ≥50mm (23/07: 135,3 mm; bão Yagi 07/09: 121,9 mm). Năm 2025 có 63 ngày nhiệt cảm nhận ≥40°C và đỉnh mưa 07/10 đạt 133,8 mm. Năm 2026 (tới 20/11) tăng lên 30 ngày ≥35°C, 76 ngày nhiệt cảm nhận ≥40°C (cao nhất tháng 6 với 19 ngày) và tổng mưa 11 tháng đạt 2.120,4 mm — riêng tháng 08/2026 đạt kỷ lục 624,8 mm (chuỗi 4 ngày 21–24/08 mưa 329,8 mm).',
    citations: [
      'ECMWF ERA5 Historical Archive (Open-Meteo, truy xuất 26–27/11/2026)',
      'Báo Mới / Hà Nội Mới (23/08/2026 — trạm đo Đông Ngạc ghi nhận 99,6 mm trong bão số 4)'
    ],
    relatedPointIds: ['S-05', 'R-01', 'R-08']
  },
  {
    id: 'KB-03',
    topic: 'Địa hình DEM GLO-30',
    title: 'Cấu trúc địa hình “Lòng máng” 6 m – 17 m quanh sông Nhuệ giải thích các rốn ngập như thế nào?',
    tags: ['dia hinh', 'dem', 'cao do', 'long mang', 'song nhue', 'tan nhue', '6m', '17m', 'tay thang long'],
    summary:
      'Mô hình số độ cao Copernicus DEM GLO-30 cho thấy sự chênh lệch rõ rệt giữa gò cao và lòng máng ven sông Nhuệ: Khu A ĐH Mỏ (18 Phố Viên) đạt ~17 m DSM và đê Đông Ngạc đạt ~16 m, trong khi Đường Tân Nhuệ thấp nhất chỉ 6 m, đường Tây Thăng Long & Công viên Hòa Bình 7 m, Phạm Văn Nghị (gần Khu B) 8 m, Hồ điều hòa Thụy Phương 2 & Ecohome 9 m, Học viện Tài chính 10 m, và dải Cầu Phố Viên – Cuối Phố Viên – Cầu Noi – Resco ở mức 11–12 m. Khi mực nước sông Nhuệ dâng báo động II–III, nước từ gò cao dồn xuống lòng máng 6–12 m bị nghẽn tự chảy, buộc phụ thuộc vào Trạm bơm Cổ Nhuế (12 m³/s) và Thụy Phương (5 m³/s).',
    citations: [
      'Copernicus DEM GLO-30 (Open-Meteo Elevation API)',
      'Báo Tiền Phong, Dân Việt & VnExpress (vận hành trạm bơm Cổ Nhuế 12 m³/s và Thụy Phương 5 m³/s)'
    ],
    relatedPointIds: ['R-10', 'R-05', 'S-08', 'R-02', 'R-06']
  },
  {
    id: 'KB-04',
    topic: 'Nắng nóng UHI & Xe buýt',
    title: 'Kỷ lục Trạm Láng 40,3°C, Đảo nhiệt đô thị (UHI) và 3 tuyến xe buýt sinh viên qua ĐH Mỏ (09A, 28, 31)',
    tags: ['xe buyt', '09a', '28', '31', 'pham van dong', 'tram lang', '40 3', 'dao nhiet', 'uhi', 'cay xanh'],
    summary:
      'Ngày 04/08/2025, Trạm khí tượng Láng lập kỷ lục lịch sử tháng 8 đạt 40,3°C. Do hiệu ứng đảo nhiệt đô thị (bê tông nhựa, xe cộ, cục nóng điều hòa), nhiệt độ cảm nhận ngoài mặt đường cao hơn lều khí tượng 2–4°C (hoặc hơn). Trục Phạm Văn Đồng từng đánh chuyển/chặt hạ gần 1.300 cây xanh khi mở rộng Vành đai 3 nên bức xạ nhiệt khung 11h–15h rất gắt tại trạm buýt 138 Phạm Văn Đồng (cách trường 1,22 km). Ngay sát trường (121 m) là trạm dừng BV Đa khoa Phương Đông – Phố Viên đón 3 tuyến buýt chính: 09A (Trần Khánh Dư ⇄ ĐH Mỏ), 28 (BX Nước Ngầm ⇄ ĐH Mỏ) và 31 (Bách Khoa ⇄ ĐH Mỏ / Chèm).',
    citations: [
      'VnExpress & KTTV Quốc gia (kỷ lục Trạm Láng 40,3°C ngày 04/08/2025 & chênh lệch UHI +2–4°C)',
      'Báo Lao Động & Thanh Niên (hàng cây Vành đai 3 Phạm Văn Đồng)',
      'TimBus Hà Nội, Thư viện Pháp luật & osm:node/11515782290, osm:node/7294677886'
    ],
    relatedPointIds: ['R-14', 'R-13', 'R-08', 'S-05']
  },
  {
    id: 'KB-05',
    topic: 'Đời sống Sinh viên Thuê trọ',
    title: 'Thực trạng “Lò nung” phòng trọ mái tôn 45–50°C và mẹo hạ nhiệt tiết kiệm điện (giá 3.500–4.000 đ/kWh)',
    tags: ['tro mai ton', 'nha tro', 'sinh vien', '45 50', 'gia dien', 'tiet kiem dien', 'co nhue', 'ngo 521'],
    summary:
      'Phóng sự đo thực tế mùa hè 2024–2026 tại các xóm trọ sinh viên Hà Nội (Lao Động, VTV, Dân Trí) ghi nhận khi ngoài trời 37–40°C, nhiệt độ trong phòng trọ lợp tôn / gác xép khung 11h–16h vọt lên 45–50°C, trong khi giá điện trọ phổ biến 3.500–4.000 đ/kWh. Giải pháp chi phí thấp hiệu quả nhất: (1) Che rèm/tấm phản quang cửa hướng Tây từ 10h–16h; (2) Tận dụng Thư viện Khu A ĐH Mỏ để học/nghỉ trưa; (3) Sau 17h30 mở cửa sổ và đặt quạt THỔI HƯỚNG RA NGOÀI 15 phút để đẩy túi khí nóng tích tụ dưới mái tôn ra hết trước khi đóng cửa bật điều hòa 26–27°C kèm quạt.',
    citations: [
      'Báo Lao Động, VTV Thời sự, Dân Trí & VietnamPlus (2024–2026)',
      'Khuyến cáo tiết kiệm điện mùa nắng nóng EVNHANOI'
    ],
    relatedPointIds: ['R-03', 'R-15', 'S-05', 'S-07']
  },
  {
    id: 'KB-06',
    topic: 'Y tế & Sơ cứu Chuẩn Bộ Y tế',
    title: 'Quy tắc Vàng 3 phút sơ cứu Sốc nhiệt / Say nắng & cơ sở cấp cứu gần cổng 18 Phố Viên nhất',
    tags: ['so cuu', 'soc nhiet', 'say nang', 'oresol', 'paracetamol', 'phuong dong', 'nha thuoc', '115'],
    summary:
      'Khi gặp người da nóng đỏ, choáng váng, buồn nôn, lơ mơ do nắng gắt: (1) Đưa ngay vào bóng râm thoáng gió, cởi bớt áo khoác dày; (2) Chườm khăn mát vào các vùng mạch máu lớn gồm CỔ – NÁCH – BẸN kết hợp quạt thoáng; (3) Nếu nạn nhân CÒN TỈNH TÁO, cho uống từng ngụm nhỏ nước mát hoặc Oresol (có thể mua ngay tại cụm Nhà thuốc Đức Huy / Thu Hương cách cổng trường 103–148 m). Nếu sốt >40°C hoặc lơ mơ, gọi ngay 115 hoặc đưa tới BV Đa khoa Phương Đông (Số 9 Phố Viên, cách 310 m). TUYỆT ĐỐI KHÔNG đưa đột ngột vào điều hòa 16°C, không ép uống nước đá lạnh, không cạo gió/dầu nóng và không dùng Paracetamol.',
    citations: [
      'Hướng dẫn xử trí say nắng – sốc nhiệt của Bộ Y tế',
      'OpenStreetMap: BV Đa khoa Phương Đông (osm:way/570572630) & Nhà thuốc Phố Viên (osm:node/10258564238)'
    ],
    relatedPointIds: ['S-01', 'S-09', 'S-02', 'S-04']
  },
  {
    id: 'KB-07',
    topic: 'An toàn Điện & Mưa ngập',
    title: 'Quy tắc “Nửa bánh xe”, xử trí nước tràn phòng trọ tầng 1 và Tổng đài báo rò điện EVNHANOI 1900 1288',
    tags: ['dien giat', 'ro dien', 'aptomat', 'cau dao', '1900 1288', 'evnhanoi', 'nua banh xe', 'ngap xe may'],
    summary:
      'Trong mưa lớn gây ngập: (1) Không đi xe máy qua đoạn nước ngập quá nửa bánh xe (~20–25 cm) hoặc nơi che khuất mặt đường, có dòng chảy xoáy vào miệng cống (như cuối Phố Viên, Cầu Noi); (2) Không trú mưa dông dưới gốc cây lớn, cột điện, bờ hồ điều hòa; (3) Tại nhà trọ nền thấp, ngay khi thấy nước mấp mé tràn vào sàn tầng 1, phải đứng trên bậc khô ráo NGẮT CẦU DAO / APTOMAT bằng tay khô trước khi kê dọn đồ; (4) Nếu phát hiện dây điện đứt, trạm biến áp/cột điện ngập có nguy cơ rò điện, lùi xa và gọi ngay Tổng đài EVNHANOI 1900 1288 (hoặc 1558, nhánh 1) trực 24/7.',
    citations: [
      'Tổng công ty Điện lực TP. Hà Nội — evnhanoi.vn (Tổng đài 1900 1288 / 1558)',
      'Công ty TNHH MTV Thoát nước Hà Nội — Đường dây nóng báo ngập 024 3974 6225 & App HSDC Maps'
    ],
    relatedPointIds: ['R-01', 'R-03', 'R-06', 'R-11']
  },
  {
    id: 'KB-08',
    topic: 'Hành chính & Danh bạ Khẩn cấp',
    title: 'Địa chỉ & số điện thoại UBND Phường Đông Ngạc (mới từ 01/07/2025), Công an phường và Y tế địa bàn',
    tags: ['ubnd', 'phuong dong ngac', 'sap nhap', 'pho van hoi', 'cong an', 'so dien thoai', 'khan cap', 'lien he'],
    summary:
      'Từ ngày 01/07/2025, phường Đức Thắng cũ cùng một phần Cổ Nhuế 2, Đông Ngạc, Thụy Phương, Xuân Đỉnh, Minh Khai hợp nhất thành Phường Đông Ngạc mới (~8,85 km², ~83.544 dân). Trụ sở UBND Phường Đông Ngạc đặt tại Phố Văn Hội, TDP số 2 (trụ sở P. Đức Thắng cũ, cách ĐH Mỏ ~747 m, ĐT: 024 2217 5455 / 024 3752 5819). Trụ sở Đảng ủy – MTTQ đặt tại 86 đường Cầu Noi. Công an Phường Đông Ngạc đặt tại 125 đường Thụy Phương (ĐT: 024 3223 3119), cùng điểm trực Công an khu vực Cổ Nhuế tại phố Phạm Tiến Duật (cách trường 1.060 m).',
    citations: [
      'Cổng Thông tin điện tử TP. Hà Nội (hanoi.gov.vn — sắp xếp đơn vị hành chính 01/07/2025)',
      'OpenStreetMap: osm:way/596707178 (Phố Văn Hội) & osm:way/335347845 (Phạm Tiến Duật)'
    ],
    relatedPointIds: ['S-10', 'S-11', 'S-02', 'S-03']
  },
  {
    id: 'KB-09',
    topic: 'Điểm nóng Lịch sử & Sơ tán',
    title: 'Hồ sơ ngập Ecohome 1–3, KĐT Resco (2025) và tiền lệ mở Hội trường sơ tán tại Học viện Tài chính (Yagi 2024)',
    tags: ['ecohome', 'thang may', 'hv tai chinh', 'so tan', 'hoi truong', '58 le van hien', 'yagi'],
    summary:
      'Trong bão Yagi tháng 9/2024, Học viện Tài chính đã ban hành thông báo khẩn (10/09/2024) rà soát sinh viên trọ vùng trũng ven sông Nhuệ và mở miễn phí các Hội trường A8, A9, A10, A11 tại 58 Lê Văn Hiến (cách ĐH Mỏ ~410 m) đón sinh viên và người dân tránh trú — đây là mô hình điểm sơ tán cộng đồng mẫu mực. Trong năm 2025 (26–27/08 và 02/10), cụm Ecohome 1–3 từng ngập cổng 1–1,4 m làm dừng 16 thang máy, cô lập 48 giờ; sang tháng 8/2026 đã giảm ngập rõ rệt nhờ thông kênh Thụy Phương.',
    citations: [
      'Thông báo khẩn Học viện Tài chính ngày 10/09/2024 & VnExpress',
      'Dân Trí (27/08/2025) & VietNamNet (26/08, 02/10/2025)'
    ],
    relatedPointIds: ['S-06', 'R-04', 'R-11', 'R-07']
  },
  {
    id: 'KB-10',
    topic: 'Tích hợp Google NotebookLM & Dữ liệu Mở',
    title: 'Hướng dẫn nạp kho dữ liệu thực tế này vào Google NotebookLM (Audio Podcast, Sơ đồ tư duy & Hỏi đáp)',
    tags: ['notebooklm', 'notebook klm', 'google notebook', 'ket noi', 'podcast', 'ai', 'markdown', 'du lieu mo'],
    summary:
      'Do Google NotebookLM chưa mở API nhúng trực tiếp vào trang web công cộng không đăng nhập, hệ thống đã trang bị đồng thời 2 giải pháp: (1) Trợ lý Notebook Tri thức Địa phương chạy trực tiếp ngay trên Web này (tìm kiếm tức thì có trích dẫn nguồn và bay thẳng tới điểm bản đồ); (2) Nút "Xuất Gói Nguồn Google NotebookLM (.md)" tạo tệp Markdown tổng hợp trọn vẹn 28+ điểm thực tế (cả điểm mới do người dân đóng góp), bảng khí tượng ERA5 2024–2026, địa hình DEM và danh bạ khẩn cấp. Bạn chỉ cần mở notebooklm.google.com → Tạo Notebook mới → Tải tệp .md vừa xuất lên để tạo Podcast đối thoại tiếng Việt, Mindmap ôn tập và hỏi đáp phục vụ thuyết trình cuối kỳ!',
    citations: [
      'Giấy phép Dữ liệu Mở CC BY 4.0 & ODbL 1.0 (OpenStreetMap)',
      'Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (ẩn danh 100% nguồn xuất)'
    ],
    relatedPointIds: ['S-05']
  }
];

/**
 * Tìm kiếm thông minh kết hợp Kho Thẻ Tri thức (KB) và Danh sách Điểm Không gian (GIS Points)
 */
export function searchKnowledgeNotebook(rawQuery, currentPoints = SAMPLE_HUMG_POINTS) {
  const q = foldVietnamese(rawQuery);
  if (!q) {
    return {
      query: '',
      matchedCards: KNOWLEDGE_NOTEBOOK_CARDS.slice(0, 5),
      matchedPoints: currentPoints.slice(0, 4)
    };
  }

  const tokens = q.split(' ').filter((t) => t.length >= 2);

  const scoredCards = KNOWLEDGE_NOTEBOOK_CARDS.map((card) => {
    const hayTitle = foldVietnamese(card.title);
    const hayTags = card.tags.map(foldVietnamese).join(' ');
    const hayBody = foldVietnamese(`${card.topic} ${card.summary} ${card.citations.join(' ')}`);
    let score = 0;
    if (hayTitle.includes(q)) score += 18;
    if (hayTags.includes(q)) score += 15;
    if (hayBody.includes(q)) score += 10;
    for (const tk of tokens) {
      if (hayTitle.includes(tk)) score += 5;
      if (hayTags.includes(tk)) score += 4;
      if (hayBody.includes(tk)) score += 2;
    }
    return { card, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.card);

  const scoredPoints = currentPoints
    .filter((p) => p.status !== 'hidden')
    .map((pt) => {
      const hayName = foldVietnamese(pt.name);
      const hayAll = foldVietnamese(
        `${pt.id} ${pt.name} ${CATEGORY_LABELS[pt.category] || ''} ${pt.sourceCitation || ''} ${pt.notes || ''}`
      );
      let score = 0;
      if (hayName.includes(q)) score += 16;
      if (hayAll.includes(q)) score += 8;
      for (const tk of tokens) {
        if (hayName.includes(tk)) score += 4;
        else if (hayAll.includes(tk)) score += 1.5;
      }
      return { pt, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.pt);

  return {
    query: rawQuery,
    matchedCards: scoredCards,
    matchedPoints: scoredPoints
  };
}

/**
 * Sinh tệp nguồn chuẩn Markdown (.md) tối ưu hóa cấu trúc cho Google NotebookLM
 */
export function buildNotebookLmSourceMarkdown(points = SAMPLE_HUMG_POINTS, analysisStats = null) {
  const visible = points.filter((p) => p.status !== 'hidden');
  const riskPts = visible.filter((p) => p.layerGroup === 'risk');
  const safePts = visible.filter((p) => p.layerGroup === 'safe');
  const nowStr = new Date().toLocaleString('vi-VN');

  const lines = [
    '# HỒ SƠ TRI THỨC THỰC CHỨNG — BẢN ĐỒ CỘNG ĐỒNG MỞ PHƯỜNG ĐÔNG NGẠC & ĐH MỎ - ĐỊA CHẤT (BÁN KÍNH 2 KM)',
    '',
    `- **Tâm khảo sát:** ${HUMG_CENTER.label} (${HUMG_CENTER.lat}°N, ${HUMG_CENTER.lng}°E · UTM Zone 48N: 580390.3 E, 2330368.2 N)`,
    `- **Thời điểm kết xuất gói nguồn NotebookLM:** ${nowStr}`,
    `- **Tổng số điểm không gian hiện có:** ${visible.length} điểm (${riskPts.length} Điểm Rủi ro Ngập/Nắng · ${safePts.length} Điểm An toàn/Y tế/Hành chính)`,
    analysisStats ? `- **Tổng lượt cư dân & sinh viên xác nhận (+1):** ${analysisStats.totalConfirmations} lượt` : '',
    '- **Giấy phép & Tuân thủ:** CC BY 4.0, OpenStreetMap ODbL 1.0, tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (không chứa dữ liệu định danh cá nhân).',
    '',
    '---',
    '',
    '## PHẦN 1. DỮ LIỆU KHÍ TƯỢNG THỰC TẾ ECMWF ERA5 (2024 – 2026)',
    '',
    '| Năm | Ngày ≥35°C | Ngày ≥37°C | Nhiệt cảm nhận ≥40°C | Đỉnh Tmax / Cảm nhận | Ngày mưa ≥50mm | Đỉnh mưa ngày & Sự kiện thực tế |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :--- |',
    ...ERA5_CLIMATE_FACTS.years.map(
      (y) =>
        `| ${y.year}${y.periodNote ? ` (${y.periodNote})` : ''} | ${y.hotDays35} | ${y.hotDays37} | ${y.apparentHot40} | ${y.maxTempC}°C / ${y.maxApparentC}°C | ${y.rainDays50mm} | ${y.peakRainMm} mm (${y.peakRainDate}) — ${y.notableEvents} |`
    ),
    '',
    '### Phân bố Mưa & Nắng nóng theo từng tháng năm 2026 (01/01 – 20/11/2026)',
    '',
    '| Tháng | Tổng mưa (mm) | Đỉnh Tmax (°C) | Đỉnh cảm nhận (°C) | Số ngày cảm nhận ≥40°C | Số ngày mưa ≥30mm |',
    '| :--- | :---: | :---: | :---: | :---: | :---: |',
    ...MONTHLY_2026_CLIMATE.map(
      (m) => `| ${m.month} | ${m.rainMm} | ${m.maxTempC} | ${m.maxApparentC} | ${m.daysApparent40} | ${m.daysRain30} |`
    ),
    '',
    '---',
    '',
    '## PHẦN 2. DANH BẠ KHẨN CẤP & ĐẦU MỐI PHÒNG CHỐNG THIÊN TAI PHƯỜNG ĐÔNG NGẠC (MỚI)',
    '',
    ...EMERGENCY_DIRECTORY.map(
      (d) => `- **${d.org}:** \`${d.phone}\` — ${d.address} *(Nguồn: ${d.source})*`
    ),
    '',
    '---',
    '',
    '## PHẦN 3. CÁC PHÁT HIỆN NGHIÊN CỨU TRỌNG TÂM & QUY TẮC ỨNG PHÓ',
    '',
    ...KNOWLEDGE_NOTEBOOK_CARDS.map(
      (c) =>
        `### [${c.id}] ${c.title}\n- **Chủ đề:** ${c.topic}\n- **Nội dung thực chứng:** ${c.summary}\n- **Trích dẫn nguồn:** ${c.citations.join(' | ')}\n`
    ),
    '---',
    '',
    '## PHẦN 4. DANH MỤC ĐẦY ĐỦ CÁC ĐIỂM RỦI RO & ĐIỂM AN TOÀN TRÊN BẢN ĐỒ',
    '',
    ...visible.map(
      (p) =>
        `### [${p.id}] ${p.name}\n- **Phân lớp:** ${p.layerGroup === 'safe' ? 'Lớp 2 - Điểm An toàn/Hỗ trợ' : 'Lớp 1 - Điểm Rủi ro'} (${CATEGORY_LABELS[p.category] || p.category}) · **Độ tin cậy:** Hạng ${p.confidenceTier} (${p.confirmCount || 1} xác nhận)\n- **Tọa độ WGS84:** ${p.lat}, ${p.lng} · **Cao độ DEM:** ${p.elevationM ?? 'Chưa đo'} m\n- **Nguồn xác thực:** ${p.sourceCitation || p.sourceType}\n- **Chi tiết thực tế:** ${p.notes || 'Không có ghi chú thêm'}\n`
    )
  ].filter((l) => l !== '');

  return lines.join('\n');
}
