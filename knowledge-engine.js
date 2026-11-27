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
  SAMPLE_HUMG_POINTS
} from './humg-data.js';
import { CATEGORY_LABELS } from './gis-utils.js';

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
