/**
 * KHO DỮ LIỆU NỀN THỰC TẾ ĐÃ KIỂM CHỨNG — BÁN KÍNH 2 KM QUANH ĐH MỎ - ĐỊA CHẤT (P. ĐÔNG NGẠC MỚI, HÀ NỘI)
 * Tổng hợp 32 điểm thực tế (17 Điểm Rủi ro Ngập / Nắng nóng / Điểm chờ buýt / Chợ dân sinh + 15 Điểm An toàn / Y tế / Hành chính / Mặt nước OSM).
 * Mọi con số ghi trong mô tả đều trích trực tiếp từ báo chí chính thống ghi rõ ngày đăng, ECMWF ERA5, Copernicus DEM và OSM.
 */

export const HUMG_CENTER = {
  lat: 21.072514,
  lng: 105.77387,
  label: 'Trường ĐH Mỏ - Địa chất (18 Phố Viên, P. Đông Ngạc)'
};

export const ERA5_CLIMATE_FACTS = {
  gridCoord: '21.0725°N, 105.7739°E',
  source: 'ECMWF ERA5 Historical Archive (Open-Meteo, truy xuất 26/11/2026)',
  years: [
    {
      year: 2024,
      hotDays35: 27,
      hotDays37: 5,
      apparentHot40: 71,
      maxTempC: 41.2,
      maxTempDate: '2024-04-27',
      maxApparentC: 46.3,
      rainDays50mm: 7,
      peakRainMm: 135.3,
      peakRainDate: '2024-07-23',
      notableEvents: '23/07/2024 (135,3 mm); 07/09/2024 Bão Yagi (121,9 mm)'
    },
    {
      year: 2025,
      hotDays35: 20,
      hotDays37: 4,
      apparentHot40: 63,
      maxTempC: 38.1,
      maxTempDate: '2025-06-01',
      maxApparentC: 45.2,
      rainDays50mm: 6,
      peakRainMm: 133.8,
      peakRainDate: '2025-10-07',
      notableEvents: '26/08/2025 (72,1 mm); 29/09/2025 (78,3 mm); 07/10/2025 (133,8 mm)'
    },
    {
      year: 2026,
      periodNote: '01/01 – 20/11/2026',
      hotDays35: 30,
      hotDays37: 10,
      apparentHot40: 76,
      maxTempC: 39.1,
      maxTempDate: '2026-04-06',
      maxApparentC: 44.9,
      rainDays50mm: 6,
      peakRainMm: 116.0,
      peakRainDate: '2026-08-23',
      notableEvents: 'Bão số 4 21–24/08/2026 (329,8 mm, đỉnh 116 mm; Đông Ngạc đo 99,6 mm); 15/09/2026 (71,3 mm)'
    }
  ]
};

/**
 * Chuỗi khí tượng theo từng tháng năm 2026 (01/01 – 20/11/2026) tại ĐH Mỏ - Địa chất (ECMWF ERA5 / Open-Meteo Archive)
 * Tổng lượng mưa tích lũy 11 tháng: 2.120,4 mm; đỉnh mưa tháng 8/2026 đạt 624,8 mm; đỉnh nắng cảm nhận tháng 6/2026 có 19 ngày ≥40°C.
 */
export const MONTHLY_2026_CLIMATE = [
  { month: '01/2026', label: 'T1', rainMm: 26.9, maxTempC: 26.7, maxApparentC: 28.6, daysApparent40: 0, daysRain30: 0 },
  { month: '02/2026', label: 'T2', rainMm: 65.8, maxTempC: 29.5, maxApparentC: 32.8, daysApparent40: 0, daysRain30: 0 },
  { month: '03/2026', label: 'T3', rainMm: 26.3, maxTempC: 36.8, maxApparentC: 42.0, daysApparent40: 1, daysRain30: 0 },
  { month: '04/2026', label: 'T4', rainMm: 117.5, maxTempC: 39.1, maxApparentC: 44.8, daysApparent40: 12, daysRain30: 1 },
  { month: '05/2026', label: 'T5', rainMm: 295.9, maxTempC: 37.7, maxApparentC: 44.9, daysApparent40: 11, daysRain30: 3 },
  { month: '06/2026', label: 'T6', rainMm: 173.8, maxTempC: 38.8, maxApparentC: 43.9, daysApparent40: 19, daysRain30: 2 },
  { month: '07/2026', label: 'T7', rainMm: 377.6, maxTempC: 34.9, maxApparentC: 43.2, daysApparent40: 13, daysRain30: 4 },
  { month: '08/2026', label: 'T8', rainMm: 624.8, maxTempC: 36.3, maxApparentC: 44.1, daysApparent40: 13, daysRain30: 6 },
  { month: '09/2026', label: 'T9', rainMm: 233.6, maxTempC: 34.6, maxApparentC: 41.4, daysApparent40: 5, daysRain30: 3 },
  { month: '10/2026', label: 'T10', rainMm: 50.3, maxTempC: 34.8, maxApparentC: 41.3, daysApparent40: 2, daysRain30: 0 },
  { month: '11/2026', label: 'T11*', rainMm: 127.9, maxTempC: 31.8, maxApparentC: 36.6, daysApparent40: 0, daysRain30: 0 }
];

export const EMERGENCY_DIRECTORY = [
  {
    org: 'Cấp cứu Y tế Toàn quốc',
    phone: '115',
    address: 'Trực cấp cứu sốc nhiệt, tai nạn 24/7 (gần nhất: BV Đa khoa Phương Đông — Số 9 Phố Viên, cách 310 m)',
    source: 'Bộ Y tế & osm:way/570572630'
  },
  {
    org: 'Cứu nạn Cứu hộ & PCCC',
    phone: '114',
    address: 'Trực cứu hộ ngập sâu, cây đổ, sự cố mắc kẹt mùa mưa bão 24/7',
    source: 'Cảnh sát PCCC & CNCH'
  },
  {
    org: 'Tổng đài Báo sự cố & Rò điện mùa ngập EVNHANOI',
    phone: '1900 1288',
    address: 'Nhánh 1 (hoặc 1558 / App EVNHANOI) — Báo cắt điện khẩn cấp khi nước tràn nhà trọ, chạm cột/hộp công tơ',
    source: 'Tổng công ty Điện lực TP. Hà Nội (evnhanoi.vn)'
  },
  {
    org: 'Đường dây nóng Báo ngập Thoát nước Hà Nội (HSDC)',
    phone: '024 3974 6225',
    address: 'Số phụ: 024 3976 2245 · Ứng dụng thời gian thực: HSDC Maps & iHanoi',
    source: 'Cổng TTĐT Chính phủ (chinhphu.vn) & Công ty TNHH MTV Thoát nước HN'
  },
  {
    org: 'UBND Phường Đông Ngạc (mới, sau sáp nhập 01/07/2025)',
    phone: '024 2217 5455',
    address: 'Phố Văn Hội, Tổ dân phố số 2, P. Đông Ngạc (trụ sở P. Đức Thắng cũ, cách ĐH Mỏ ~747 m) · ĐU/MTTQ: 86 Cầu Noi',
    source: 'Cổng TTĐT TP. Hà Nội (hanoi.gov.vn) & osm:way/596707178'
  },
  {
    org: 'Công an Phường Đông Ngạc',
    phone: '024 3223 3119',
    address: 'Số 125 đường Thụy Phương, TDP Đông Sen, P. Đông Ngạc (hỗ trợ an ninh trật tự & cứu trợ địa bàn)',
    source: 'Danh bạ hành chính P. Đông Ngạc mới'
  }
];

export const ROUTE_PRESETS = [
  { id: 'humg_a', label: 'Cổng Khu A ĐH Mỏ (18 Phố Viên — DEM 17m)', lat: 21.072514, lng: 105.77387 },
  { id: 'humg_b', label: 'Khu B ĐH Mỏ – Phạm Văn Nghị (DEM 8–10m)', lat: 21.067813, lng: 105.757184 },
  { id: 'cuoi_pho_vien', label: 'Cuối Phố Viên – Thượng Cát (DEM 12m)', lat: 21.069413, lng: 105.772544 },
  { id: 'cau_noi', label: 'Cầu Noi – Sông Nhuệ (DEM 12m)', lat: 21.061634, lng: 105.772358 },
  { id: 'resco', label: 'KĐT Resco & Trạm buýt 138 Phạm Văn Đồng', lat: 21.0738, lng: 105.7858 },
  { id: 'ecohome', label: 'Cụm chung cư Ecohome 1–3 Đông Thắng (DEM 9m)', lat: 21.084909, lng: 105.784291 },
  { id: 'cho_co_nhue', label: 'Chợ Cổ Nhuế – Ngõ 103 Cổ Nhuế (DEM 14m)', lat: 21.060682, lng: 105.78088 },
  { id: 'ubnd_dong_ngac', label: 'UBND Phường Đông Ngạc – Phố Văn Hội (DEM 12m)', lat: 21.079219, lng: 105.773375 }
];

export const TRANSECT_PRESETS = [
  {
    id: 'khu_a_to_khu_b',
    label: 'Tuyến 1: Gò Khu A ĐH Mỏ (17m) → Sông Nhuệ → Hồ Thụy Phương 2 → Khu B (8m)',
    start: { lat: 21.072514, lng: 105.77387, name: 'Khu A ĐH Mỏ (18 Phố Viên)' },
    end: { lat: 21.067813, lng: 105.757184, name: 'Khu B ĐH Mỏ (Phạm Văn Nghị)' }
  },
  {
    id: 'khu_a_to_tan_nhue',
    label: 'Tuyến 2: Khu A ĐH Mỏ (17m) → Phố Văn Hội → Rốn trũng Đường Tân Nhuệ (6m)',
    start: { lat: 21.072514, lng: 105.77387, name: 'Khu A ĐH Mỏ' },
    end: { lat: 21.086397, lng: 105.771402, name: 'Đường Tân Nhuệ (DEM 6m)' }
  },
  {
    id: 'pho_vien_to_tay_thang_long',
    label: 'Tuyến 3: Cổng 18 Phố Viên (17m) → Cuối Phố Viên (12m) → Tây Thăng Long (7m)',
    start: { lat: 21.072514, lng: 105.77387, name: '18 Phố Viên' },
    end: { lat: 21.062764, lng: 105.769676, name: 'Tây Thăng Long – Sông Nhuệ' }
  },
  {
    id: 'de_dong_ngac_to_ecohome',
    label: 'Tuyến 4: Hành lang Kênh Thụy Phương (16m) → Cụm chung cư Ecohome 1–3 (9m)',
    start: { lat: 21.085283, lng: 105.778152, name: 'Đầu tuyến Hoàng Tăng Bí' },
    end: { lat: 21.084909, lng: 105.784291, name: 'Cụm Ecohome Đông Thắng' }
  }
];

export const WEATHER_SCENARIOS = {
  normal: {
    key: 'normal',
    shortLabel: 'Mặc định (Tất cả 32 điểm)',
    headline: 'Hiển thị đầy đủ 32 điểm dữ liệu thực tế trong bán kính 2 km',
    desc: 'Bao gồm toàn bộ 17 điểm rủi ro ngập/nắng/điểm chờ buýt và 15 cơ sở y tế, nhà thuốc, trụ sở hành chính, hồ điều hòa.'
  },
  rain_30: {
    key: 'rain_30',
    shortLabel: 'Mưa lớn 30–50 mm',
    headline: 'Mô phỏng phân tầng: Mưa rào lớn 30–50 mm (Đọng nước dải trũng DEM ≤ 11 m)',
    desc: 'Các vùng trũng thấp dọc sông Nhuệ (Tân Nhuệ 6m, Tây Thăng Long 7m, Phạm Văn Nghị 8m, ngõ thấp Cổ Nhuế) bắt đầu đọng nước cục bộ.'
  },
  rain_70: {
    key: 'rain_70',
    shortLabel: 'Mưa rất to ≥ 70 mm (Kiểu 15/09/2026)',
    headline: 'Mô phỏng phân tầng: Mưa > 70 mm (Kích hoạt cảnh báo xoáy cống Cuối Phố Viên & Cầu Noi)',
    desc: 'Dựa trên trận mưa thực tế 15/09/2026 (71,3 mm): tuyệt đối tránh đi qua Cuối Phố Viên, Cầu Noi, Tân Nhuệ; ưu tiên dừng ở nền cao 14–17 m.'
  },
  rain_120: {
    key: 'rain_120',
    shortLabel: 'Mưa đặc biệt lớn > 115 mm (Kiểu Yagi / Bão số 4)',
    headline: 'Mô phỏng phân tầng: Mưa cực đoan > 115–135 mm & Lũ sông Nhuệ dâng cao',
    desc: 'Dựa trên đợt 07/09/2024 (121,9 mm), 07/10/2025 (133,8 mm) & 23/08/2026 (116 mm): cảnh báo toàn lưu vực, kiểm tra an toàn điện tầng 1 và điểm sơ tán.'
  },
  heat_uhi: {
    key: 'heat_uhi',
    shortLabel: 'Nắng nóng UHI > 41°C (Kiểu 04/08/2025)',
    headline: 'Mô phỏng phân tầng: Đảo nhiệt Đô thị > 41°C cảm nhận & Trọ mái tôn 45–50°C',
    desc: 'Làm nổi bật trục bê tông Phạm Văn Đồng, 4 trạm xe buýt (09A, 28, 31), Chợ Cổ Nhuế, xóm trọ mái tôn cùng mạng lưới Nhà thuốc Oresol & Thư viện mát.'
  }
};

export const WATER_LEVEL_SCALES = {
  none: { label: 'Không ngập / Điểm khô ráo', approxCm: 0, rank: 0 },
  surface: { label: 'Đọng nước mặt đường, chưa ướt giày (<5 cm)', approxCm: 5, rank: 1 },
  ankle: { label: 'Ngập mắt cá chân / ngập lốp dưới (~10–15 cm)', approxCm: 15, rank: 2 },
  half_wheel: { label: 'Ngập bắp chân / nửa bánh xe máy (~20–30 cm)', approxCm: 25, rank: 3 },
  knee_stall: { label: 'Ngập đầu gối / quá nửa bánh xe — chết máy (~40–50 cm)', approxCm: 45, rank: 4 },
  enter_house: { label: 'Ngập trên đầu gối / nước tràn sảnh, nhà trọ (>50 cm – >1 m)', approxCm: 100, rank: 5 }
};

export const HAZARD_FLAGS_META = {
  open_drain_vortex: 'Cống hở / miệng thu nước tạo xoáy nguy hiểm',
  uneven_pothole: 'Mặt đường gồ ghề, ổ gà khuất dưới nước',
  isolation_deep: 'Ngập cô lập lối ra vào khu dân cư',
  elec_leak_risk: 'Nhà trọ / tầng 1 nền thấp, nguy cơ mất điện & rò điện',
  lack_shade_heat: 'Mặt đường rộng thiếu bóng cây, bức xạ nhiệt gắt 11h–15h'
};

export const CONFIDENCE_TIERS = {
  A: {
    code: 'A',
    shortLabel: 'Hạng A · Xác thực chính thức',
    desc: 'Xác thực từ cơ quan chức năng, báo chí có tên bài & ngày đăng cụ thể, đối tượng OSM chính thức hoặc nhóm đo thực địa.'
  },
  B: {
    code: 'B',
    shortLabel: 'Hạng B · Cộng đồng kiểm chứng',
    desc: 'Có từ 3 người dân/sinh viên độc lập xác nhận trùng khớp hoặc báo chí phản ánh định kỳ theo lưu vực.'
  },
  C: {
    code: 'C',
    shortLabel: 'Hạng C · Mới báo (Chờ xác minh)',
    desc: 'Mới có 1–2 báo cáo từ người dân trên Web, đang chờ thêm xác nhận hoặc khảo sát thực địa.'
  }
};

/**
 * 32 Điểm nền thực tế nằm trọn trong bán kính ≤ 2,0 km quanh ĐH Mỏ - Địa chất (17 Rủi ro/Ngập/Nắng + 15 An toàn/Y tế/Hành chính OSM)
 */
export const SAMPLE_HUMG_POINTS = [
  // ================= LỚP 1: 17 ĐIỂM RỦI RO NGẬP, THỦY VĂN & PHƠI NHIỄM NẮNG NÓNG (≤ 2 KM) =================
  {
    id: 'R-01',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Cuối Phố Viên (giáp ranh Đông Ngạc – Thượng Cát)',
    lat: 21.069413,
    lng: 105.772544,
    severity: 'severe',
    waterScale: 'knee_stall',
    hazardFlags: ['open_drain_vortex', 'uneven_pothole'],
    frequency: 'Mỗi đợt mưa lớn kéo dài (>50 mm)',
    drainDuration: 'Đọng nước kéo dài không rút hết',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 5,
    sourceType: 'Báo Lao Động (18/09/2026) & Đại Đoàn Kết',
    sourceCitation: 'Báo Lao Động 18/09/2026 ("Người dân mong xử lý dứt điểm úng ngập cuối phố Viên, Hà Nội"); ERA5 15/09/2026: 71,3 mm',
    observedDate: '2026-09-18',
    notes: 'Cách cổng trường ~372 m. Báo Lao Động ghi nhận mặt đường gồ ghề nhiều ổ gà, mưa lớn ngập sâu kèm dòng xoáy miệng cống (từng xảy ra tai nạn thương tâm tháng 9/2026). Người dân/SV thường phải quay đầu tìm đường vòng.'
  },
  {
    id: 'R-02',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Khu vực Cầu Phố Viên – Bờ Tây sông Nhuệ',
    lat: 21.07168,
    lng: 105.771249,
    severity: 'moderate',
    waterScale: 'half_wheel',
    hazardFlags: ['uneven_pothole'],
    frequency: 'Khi mưa lớn kết hợp mực nước sông Nhuệ lên cao',
    drainDuration: '30 phút – 2 giờ',
    elevationM: 12,
    confidenceTier: 'B',
    confirmCount: 3,
    sourceType: 'OSM & Báo chí lưu vực sông Nhuệ',
    sourceCitation: 'OpenStreetMap Cầu Phố Viên; Hà Nội Mới & Kinh tế Đô thị (áp lực thoát nước sông Nhuệ)',
    observedDate: '2025-10-07',
    notes: 'Cách cổng 18 Phố Viên ~287 m; nằm sát mép sông Nhuệ, khi lũ sông dâng báo động II–III nước nội khu mất khả năng tự chảy.'
  },
  {
    id: 'R-03',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Ngõ 521 & Cụm ngõ dân sinh Cổ Nhuế (Ngõ 401 – 487)',
    lat: 21.068619,
    lng: 105.776973,
    severity: 'moderate',
    waterScale: 'half_wheel',
    hazardFlags: ['elec_leak_risk'],
    frequency: 'Các trận mưa rào lớn mùa hè – thu',
    drainDuration: 'Phụ thuộc vận hành trạm bơm Cổ Nhuế',
    elevationM: 11,
    confidenceTier: 'B',
    confirmCount: 3,
    sourceType: 'Báo Dân Việt (2025), Lao Động / VTV (2024–2026) & OSM',
    sourceCitation: 'Báo Dân Việt (ngập ngõ sâu Cổ Nhuế); Lao Động, VTV & Dân Trí (phòng trọ mái tôn sinh viên Hà Nội 45–50°C, giá điện 3.500–4.000 đ/kWh); osm:way/699218408',
    observedDate: '2025-09-29',
    notes: 'Cách trường ~540 m, DEM 11 m. Cụm ngõ hẹp tập trung đông nhà trọ sinh viên chịu rủi ro kép: dễ đọng nước khi mưa lớn và nóng hầm hập (báo chí ghi nhận trọ mái tôn Hà Nội đạt 45–50°C khung 11h–16h, giá điện 3.500–4.000 đ/kWh). Mời cư dân bấm "+ Báo điểm ngõ bạn" ghim từng ngõ.'
  },
  {
    id: 'R-04',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Vùng trũng nhà trọ ven sông Nhuệ – Học viện Tài chính',
    lat: 21.079688,
    lng: 105.77964,
    severity: 'moderate',
    waterScale: 'knee_stall',
    hazardFlags: ['elec_leak_risk'],
    frequency: 'Khi mưa bão lớn & lũ sông Nhuệ dâng cao',
    drainDuration: '> 2 giờ',
    elevationM: 10,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'Thông báo khẩn HV Tài chính (10/09/2024) & VnExpress',
    sourceCitation: 'Thông báo khẩn Học viện Tài chính 10/09/2024 & VnExpress; osm:way/1198891357',
    observedDate: '2024-09-10',
    notes: 'Cách ĐH Mỏ ~995 m, DEM 10 m. Trong bão số 3 Yagi tháng 9/2024, trường phải rà soát và sơ tán sinh viên ngoại trú vùng trũng ven sông Nhuệ.'
  },
  {
    id: 'R-05',
    layerGroup: 'risk',
    category: 'traffic',
    name: 'Khu vực thi công đường Tây Thăng Long qua sông Nhuệ – Cổ Nhuế',
    lat: 21.062764,
    lng: 105.769676,
    severity: 'moderate',
    waterScale: 'half_wheel',
    hazardFlags: ['uneven_pothole'],
    frequency: 'Mưa lớn trong giai đoạn thi công & GPMB (2025–2026)',
    drainDuration: '30 phút – 2 giờ',
    elevationM: 7,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'Báo Sức khỏe & Đời sống, VietnamPlus (2025–2026)',
    sourceCitation: 'Sức khỏe & Đời sống, VietnamPlus, VOV (dự án Tây Thăng Long >3,2 km); osm:way/1434617049',
    observedDate: '2026-08-23',
    notes: 'Cách trường ~1.168 m, DEM rất thấp (7 m). Khu vực thi công mở rộng 10 làn xe & cầu qua sông Nhuệ chưa đồng bộ cống ngầm dọc tuyến, dễ đọng nước bùn lầy khi mưa.'
  },
  {
    id: 'R-06',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Khu vực Cầu Noi – Đường Cổ Nhuế (ven sông Nhuệ)',
    lat: 21.061634,
    lng: 105.772358,
    severity: 'severe',
    waterScale: 'knee_stall',
    hazardFlags: ['uneven_pothole'],
    frequency: 'Mỗi đợt mưa lớn diện rộng & đỉnh lũ sông Nhuệ',
    drainDuration: '> 2 giờ',
    elevationM: 12,
    confidenceTier: 'B',
    confirmCount: 4,
    sourceType: 'Hà Nội Mới, Thanh Tra & VietnamPlus',
    sourceCitation: 'Hà Nội Mới / Thanh Tra / VietnamPlus (2024–2026); tọa độ Cầu Noi OpenStreetMap',
    observedDate: '2025-10-07',
    notes: 'Cách ĐH Mỏ ~1.220 m. Nút thắt giao thông & tiêu thoát nước ven sông Nhuệ nối Cổ Nhuế – Đông Ngạc.'
  },
  {
    id: 'R-07',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Khu đô thị Resco Cổ Nhuế (Cụm tòa OCT1, OCT2)',
    lat: 21.0738,
    lng: 105.7858,
    severity: 'severe',
    waterScale: 'enter_house',
    hazardFlags: ['isolation_deep', 'elec_leak_risk'],
    frequency: 'Các trận mưa bão lớn (cải thiện dần từ giữa 2026)',
    drainDuration: '> 2 giờ (2025); rút nhanh hơn trong bão số 4/2026',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 6,
    sourceType: 'Công ty Thoát nước HN, Tuổi Trẻ & VOV Giao thông',
    sourceCitation: 'Danh sách điểm ngập Cty Thoát nước HN; Tuổi Trẻ, VOV Giao thông & Báo Tin Tức (2025–2026)',
    observedDate: '2025-10-07',
    notes: 'Cách trường ~1.246 m. Cốt nền nội khu thấp hơn đường Phạm Văn Đồng; ngập sâu diện rộng năm 2025, đến mùa mưa 2026 đã giảm thời gian ngập nhờ thông tuyến kênh Thụy Phương.'
  },
  {
    id: 'R-08',
    layerGroup: 'risk',
    category: 'heat',
    name: 'Trục đường Phạm Văn Đồng (đoạn Cổ Nhuế – Công viên Hòa Bình)',
    lat: 21.064249,
    lng: 105.784295,
    severity: 'severe',
    waterScale: 'ankle',
    hazardFlags: ['lack_shade_heat'],
    frequency: '63–76 ngày nhiệt cảm nhận ≥40°C/năm (ERA5) & đọng nước khi mưa lớn',
    drainDuration: '30 phút – 2 giờ khi mưa lớn',
    elevationM: 12,
    confidenceTier: 'B',
    confirmCount: 3,
    sourceType: 'KTTV Quốc gia (Trạm Láng), ECMWF ERA5, Lao Động & Thanh Niên',
    sourceCitation: 'Trạm Láng lập kỷ lục tháng 8 đạt 40,3°C ngày 04/08/2025 (VnExpress); ECMWF ERA5 (63–76 ngày nhiệt cảm nhận ≥40°C); Lao Động & Thanh Niên (di dời ~1.300 cây xanh Vành đai 3); Báo Tin Tức',
    observedDate: '2026-05-28',
    notes: 'Cách trường ~1.422 m. Trục Vành đai 3 nhiều làn bê tông nhựa chịu hiệu ứng đảo nhiệt đô thị (UHI) làm nhiệt cảm nhận mặt đường cao hơn lều khí tượng 2–4°C sau giai đoạn đánh chuyển gần 1.300 cây xanh; đồng thời có các điểm trũng đọng nước khi mưa dồn dập.'
  },
  {
    id: 'R-09',
    layerGroup: 'risk',
    category: 'traffic',
    name: 'Tuyến Kênh Thụy Phương – Đường Hoàng Tăng Bí / Kẻ Vẽ (Dự án 920 tỷ)',
    lat: 21.085283,
    lng: 105.778152,
    severity: 'moderate',
    waterScale: 'half_wheel',
    hazardFlags: ['uneven_pothole'],
    frequency: 'Hành lang tiêu thoát trọng điểm đang hoàn thiện năm 2026',
    drainDuration: 'Hạ tải ngập cho tiểu lưu vực Cổ Nhuế – Đông Ngạc',
    elevationM: 16,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'QĐ 5520/QĐ-UBND (10/11/2025) & VnExpress, CafeF',
    sourceCitation: 'QĐ 5520/QĐ-UBND TP. Hà Nội; VnExpress, CafeF & HĐND TP. HN (2026); osm:way/1530168567',
    observedDate: '2026-08-23',
    notes: 'Cách trường ~1.488 m. Dự án khẩn cấp >920 tỷ đồng (>3,5 km kênh hở + ~4 km cống hộp nối sông Tô Lịch, trạm bơm 5 m³/s). VnExpress phản ánh có sụt lún/nứt cục bộ một số nhà dọc tuyến thi công.'
  },
  {
    id: 'R-10',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Tân Nhuệ (Vùng trũng thấp nhất bán kính 2 km — DEM 6 m)',
    lat: 21.086397,
    lng: 105.771402,
    severity: 'severe',
    waterScale: 'knee_stall',
    hazardFlags: ['uneven_pothole'],
    frequency: 'Mưa lớn & thời điểm rào chắn thi công cống kết nối',
    drainDuration: '30 phút – 2 giờ',
    elevationM: 6,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'VietnamPlus, Báo Lao Động & Copernicus DEM',
    sourceCitation: 'VietnamPlus & Lao Động (cống qua đường Tân Nhuệ); osm:way/146724866; DEM GLO-30 = 6 m',
    observedDate: '2026-08-23',
    notes: 'Cách trường ~1.565 m, cao độ bề mặt chỉ 6 m (thấp nhất trong bán kính 2 km). Khu vực đặt cống qua đường Tân Nhuệ kết nối tiêu thoát cho cụm Đông Ngạc – Ecohome.'
  },
  {
    id: 'R-11',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Cụm chung cư Ecohome 1, 2, 3 (Đường Đông Thắng – Đông Ngạc)',
    lat: 21.084909,
    lng: 105.784291,
    severity: 'severe',
    waterScale: 'enter_house',
    hazardFlags: ['isolation_deep', 'elec_leak_risk'],
    frequency: 'Ngập lịch sử 08 & 10/2025; cải thiện rõ trong bão số 4 (23/08/2026)',
    drainDuration: 'Từng ngập cô lập 48 giờ (2025); rút nhanh hơn từ giữa 2026',
    elevationM: 9,
    confidenceTier: 'A',
    confirmCount: 6,
    sourceType: 'Dân Trí (27/08/2025) & VietNamNet (26/08, 27/08, 02/10/2025)',
    sourceCitation: 'Dân Trí 27/08/2025 & VietNamNet 02/10/2025 (ngập cổng 1–1,4 m, 16 thang máy dừng); Báo Mới 23/08/2026 (mưa 99,6 mm rút tốt hơn); osm:node/12117023197',
    observedDate: '2026-08-23',
    notes: 'Cách trường ~1.636–1.800 m, DEM 9–10 m. Năm 2025 ngập 1–1,4 m ở cổng rào gần trường học, tràn sảnh 60 cm–1 m làm tê liệt 16 thang máy Ecohome 1. Bão số 4 (23/08/2026) đã cải thiện đáng kể nhờ thông kênh Thụy Phương.'
  },
  {
    id: 'R-12',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Phạm Văn Nghị – Khu vực Khu B ĐH Mỏ (Bờ Tây sông Nhuệ)',
    lat: 21.067813,
    lng: 105.757184,
    severity: 'moderate',
    waterScale: 'ankle',
    hazardFlags: ['lack_shade_heat'],
    frequency: 'Cần khảo sát thêm từ sinh viên Khu B & HV Cảnh sát',
    drainDuration: 'Đang chờ cộng đồng xác nhận',
    elevationM: 8,
    confidenceTier: 'B',
    confirmCount: 3,
    sourceType: 'OpenStreetMap & Copernicus DEM GLO-30',
    sourceCitation: 'osm:way/965882635 (Đường Phạm Văn Nghị) & osm:way/1294976834 (Khu B ĐH Mỏ); DEM = 8–10 m',
    observedDate: '2026-11-26',
    notes: 'Cách Khu A ~1.370–1.808 m ở phía Tây sông Nhuệ (DEM 8 m). Mời sinh viên Khu B & cư dân lân cận tích +1 xác nhận tình trạng ngập cục bộ và đoạn thiếu bóng mát giờ trưa.'
  },
  {
    id: 'R-13',
    layerGroup: 'risk',
    category: 'heat',
    name: 'Điểm dừng xe buýt 138 Phạm Văn Đồng – Cầu vượt bộ hành (Điểm chờ nắng gắt)',
    lat: 21.074511,
    lng: 105.785454,
    severity: 'severe',
    waterScale: 'none',
    hazardFlags: ['lack_shade_heat'],
    frequency: 'Nắng gắt khung 11h00–15h30 (63–76 ngày nhiệt cảm nhận ≥40°C/năm)',
    drainDuration: '',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'OpenStreetMap, KTTV Quốc gia & Báo Lao Động / Thanh Niên',
    sourceCitation: 'osm:node/7294677886 (138 Phạm Văn Đồng – Cầu vượt bộ hành); VnExpress (Trạm Láng 40,3°C ngày 04/08/2025, UHI +2–4°C); Lao Động (mất bóng mát Vành đai 3)',
    observedDate: '2025-08-04',
    notes: 'Cách ĐH Mỏ ~1.222 m, sát cửa ngõ KĐT Resco. Điểm chờ buýt có lưu lượng sinh viên và người lao động cao trên mặt đường bê tông nhựa rộng, dễ phơi nhiễm nắng bức xạ và sốc nhiệt khung giờ trưa.'
  },
  {
    id: 'R-14',
    layerGroup: 'risk',
    category: 'heat',
    name: 'Điểm dừng xe buýt Phố Viên – Cổng ĐH Mỏ / BV Phương Đông (Tuyến 09A, 28, 31)',
    lat: 21.071475,
    lng: 105.774225,
    severity: 'moderate',
    waterScale: 'none',
    hazardFlags: ['lack_shade_heat'],
    frequency: 'Giờ tan ca sáng 11h30–13h30 các ngày nắng nóng gay gắt',
    drainDuration: '',
    elevationM: 13,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'OpenStreetMap, TimBus Hà Nội & ECMWF ERA5',
    sourceCitation: 'osm:node/11515782290 (Điểm dừng xe buýt BV Đa khoa Phương Đông); TimBus / Thư viện Pháp luật (lộ trình buýt 09A, 28, 31 qua ĐH Mỏ - Phố Viên)',
    observedDate: '2026-06-15',
    notes: 'Cách cổng 18 Phố Viên chỉ ~121 m — trạm trung chuyển chính của sinh viên đi tuyến buýt 09A, 28 và 31. Cần chuẩn bị mũ, nước/Oresol trước khi ra đứng đợi xe trong những ngày nhiệt cảm nhận vượt 40°C.'
  },
  {
    id: 'R-15',
    layerGroup: 'risk',
    category: 'heat',
    name: 'Khu vực Chợ Cổ Nhuế – Ngõ 103 Đường Cổ Nhuế (Tiểu thương & xóm trọ đông đúc)',
    lat: 21.060682,
    lng: 105.78088,
    severity: 'moderate',
    waterScale: 'ankle',
    hazardFlags: ['lack_shade_heat', 'elec_leak_risk'],
    frequency: 'Nắng nóng hầm hập khung 11h00–15h30 & ứ đọng cục bộ khi mưa lớn',
    drainDuration: '30 phút – 1 giờ',
    elevationM: 14,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực & ECMWF ERA5',
    sourceCitation: 'osm:way/699065704 — Chợ Cổ Nhuế (Ngõ 103 Đường Cổ Nhuế, cách ĐH Mỏ ~1.503 m); ECMWF ERA5 (76 ngày nhiệt cảm nhận ≥40°C năm 2026)',
    observedDate: '2026-06-20',
    notes: 'Tập trung đông tiểu thương bán hàng ngoài trời, người giao hàng và cụm nhà trọ mật độ cao; không gian mái tôn/bạt hấp nhiệt lớn vào trưa hè và dễ đọng nước bẩn lối vào chợ sau mưa rào.'
  },
  {
    id: 'R-16',
    layerGroup: 'risk',
    category: 'heat',
    name: 'Điểm dừng xe buýt 51 Hoàng Tăng Bí (Tuyến 09A, 28 — Hành lang thi công hạ tầng)',
    lat: 21.081945,
    lng: 105.784032,
    severity: 'moderate',
    waterScale: 'ankle',
    hazardFlags: ['lack_shade_heat', 'uneven_pothole'],
    frequency: 'Nắng nóng bức xạ khung 11h–15h & bụi/đọng nước mặt đường khi mưa',
    drainDuration: '30 phút – 1 giờ',
    elevationM: 13,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap, TimBus & Báo Dân Việt / CafeF',
    sourceCitation: 'osm:node/8954351040 (Điểm dừng xe buýt 51 Hoàng Tăng Bí, cách ĐH Mỏ ~1.487 m); Dân Việt & CafeF (xe tải vật liệu & hạ tầng Hoàng Tăng Bí)',
    observedDate: '2026-06-15',
    notes: 'Trạm đón tuyến buýt 09A, 28 trên trục Hoàng Tăng Bí nối Đức Thắng – Tân Xuân; mặt đường chịu áp lực xe tải thi công dự án thoát nước gây bụi nóng ngày nắng và trơn trượt ngày mưa.'
  },
  {
    id: 'R-17',
    layerGroup: 'risk',
    category: 'heat',
    name: 'Điểm dừng xe buýt 31 Tân Xuân – Cửa ngõ Ecohome / Chân đê (Tuyến 09A)',
    lat: 21.082815,
    lng: 105.785074,
    severity: 'moderate',
    waterScale: 'ankle',
    hazardFlags: ['lack_shade_heat'],
    frequency: 'Phơi nắng khung giờ cao điểm trưa & chiều hè (63–76 ngày cảm nhận ≥40°C)',
    drainDuration: '30 phút – 1 giờ',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap, TimBus & ECMWF ERA5',
    sourceCitation: 'osm:node/8920049629 (Điểm dừng xe buýt 31 Tân Xuân, cách ĐH Mỏ ~1.632 m); Thư viện Pháp luật (lộ trình tuyến 09A)',
    observedDate: '2026-06-15',
    notes: 'Điểm trung chuyển xe buýt phục vụ cư dân cụm Ecohome và người lao động khu vực Tân Xuân – Đông Ngạc; ít mái che cây xanh lớn vào khung 11h30–15h00.'
  },

  // ================= LỚP 2: 15 ĐIỂM AN TOÀN, Y TẾ, HÀNH CHÍNH & KHÔNG GIAN HẠ NHIỆT (OSM XÁC THỰC ≤ 2 KM) =================
  {
    id: 'S-01',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa Phương Đông (Số 9 Phố Viên)',
    lat: 21.069922,
    lng: 105.774942,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Trực cấp cứu 24/7',
    drainDuration: '',
    elevationM: 11,
    confidenceTier: 'A',
    confirmCount: 5,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/570572630 — Bệnh viện Đa khoa Phương Đông, Phố Viên',
    observedDate: '2026-11-26',
    notes: 'Bệnh viện đa khoa lớn cách cổng 18 Phố Viên ~310 m (cách cuối Phố Viên ~255 m); tiếp nhận cấp cứu sốc nhiệt nặng, tai nạn giao thông mùa mưa bão.'
  },
  {
    id: 'S-02',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Trạm Y tế Đức Thắng (Phường Đông Ngạc mới)',
    lat: 21.079948,
    lng: 105.773625,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Y tế cơ sở phường',
    drainDuration: '',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:node/10213910252 — Trạm y tế phường Đức Thắng',
    observedDate: '2026-11-26',
    notes: 'Điểm sơ cứu y tế ban đầu cho cư dân và sinh viên khu vực Đức Thắng – Lê Văn Hiến (~826 m từ ĐH Mỏ).'
  },
  {
    id: 'S-03',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Trạm Y tế Cổ Nhuế',
    lat: 21.061801,
    lng: 105.780118,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Y tế cơ sở khu vực Cổ Nhuế',
    drainDuration: '',
    elevationM: 14,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/699065687 — Trạm Y tế Cổ Nhuế',
    observedDate: '2026-11-26',
    notes: 'Điểm hỗ trợ y tế gần cụm dân cư và xóm trọ Chợ Cổ Nhuế (~1,35 km về phía Nam ĐH Mỏ).'
  },
  {
    id: 'S-04',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa Phạm Ngọc Thạch & ĐH Y tế Công cộng',
    lat: 21.082084,
    lng: 105.779261,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Cơ sở y tế tuyến trên',
    drainDuration: '',
    elevationM: 11,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:node/13703724841 & osm:way/699218281',
    observedDate: '2026-11-26',
    notes: 'Cụm cơ sở y tế phía Đông Bắc bán kính ~1,2 km quanh ĐH Mỏ - Địa chất.'
  },
  {
    id: 'S-05',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Khuôn viên Khu A & Thư viện Trường ĐH Mỏ - Địa chất (18 Phố Viên)',
    lat: 21.072565,
    lng: 105.773765,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Mở cửa theo giờ học tập / hành chính của trường',
    drainDuration: '',
    elevationM: 17,
    confidenceTier: 'A',
    confirmCount: 6,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/699218352 (Khu A HUMG) & osm:way/1118081920 (Thư viện)',
    observedDate: '2026-11-26',
    notes: 'Nền khuôn viên cao ráo (DEM 17 m DSM); không gian tránh nắng gắt giờ trưa và tạm dừng chờ mưa ngớt cho sinh viên, cán bộ nhà trường.'
  },
  {
    id: 'S-06',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Học viện Tài chính – Khu Hội trường 58 Lê Văn Hiến (Điểm sơ tán tiền lệ)',
    lat: 21.075851,
    lng: 105.772858,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Kích hoạt theo thông báo khẩn cấp khi mưa lũ lớn',
    drainDuration: '',
    elevationM: 13,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'Thông báo chính thức & OSM',
    sourceCitation: 'osm:way/699218317 & Thông báo HV Tài chính ngày 10/09/2024 (mở Hội trường A8–A11)',
    observedDate: '2024-09-10',
    notes: 'Trong đợt lũ bão Yagi tháng 9/2024, nhà trường đã mở các Hội trường A8, A9, A10, A11 đón tiếp miễn phí sinh viên và người dân vùng nguy cơ ngập ven sông Nhuệ.'
  },
  {
    id: 'S-07',
    layerGroup: 'safe',
    category: 'shelter',
    outdoorOnly: true,
    name: 'Công viên Hòa Bình (Không gian cây xanh hạ nhiệt đô thị)',
    lat: 21.066323,
    lng: 105.78671,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Mở cửa công cộng hằng ngày',
    drainDuration: '',
    elevationM: 7,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/208188482 — Công viên Hòa Bình (cách ~1,5 km)',
    observedDate: '2026-11-26',
    notes: 'Vùng đệm cây xanh – mặt nước lớn giúp giảm bức xạ nhiệt ngày nắng. Lưu ý an toàn: CHỈ dùng nghỉ mát khi nắng, tuyệt đối không đứng dưới tán cây khi có mưa dông sấm sét.'
  },
  {
    id: 'S-08',
    layerGroup: 'safe',
    category: 'shelter',
    outdoorOnly: true,
    name: 'Hồ điều hòa Thụy Phương 2 (Vùng đệm mặt nước tiêu thoát & hạ nhiệt)',
    lat: 21.0668,
    lng: 105.7693,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Không gian mặt nước công cộng (lưu vực tiêu thoát tự nhiên)',
    drainDuration: '',
    elevationM: 9,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực & Copernicus DEM',
    sourceCitation: 'osm:way/1555357769 — Hồ điều hòa Thụy Phương 2 (cách ĐH Mỏ ~793 m); Copernicus DEM GLO-30 = 9 m',
    observedDate: '2026-11-26',
    notes: 'Mặt nước điều hòa quy mô lớn ngay trong vòng 800 m quanh trường giúp trữ nước đệm tiểu lưu vực và hạ nhiệt vi khí hậu. Lưu ý an toàn: chỉ là mảng mặt nước hạ nhiệt khi khô ráo, tuyệt đối tránh xa mép hồ khi có mưa dông, gió giật.'
  },
  {
    id: 'S-09',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Cụm Nhà thuốc Phố Viên – Ngõ 32 Phố Viên (Đức Huy / Thu Hương — Oresol & sơ cứu sát trường)',
    lat: 21.072734,
    lng: 105.772904,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Mở cửa hằng ngày phục vụ sinh viên & cư dân',
    drainDuration: '',
    elevationM: 15,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:node/10258564238 (Nhà thuốc Đức Huy 152) & osm:node/8353977344 (Nhà thuốc Thu Hương) — cách cổng ĐH Mỏ 103–148 m',
    observedDate: '2026-11-26',
    notes: 'Điểm cung cấp nhanh gói điện giải Oresol, gạc mát, nhiệt kế hỗ trợ xử trí say nắng nhẹ ngay sát cổng 18 Phố Viên (nền cao 14–15 m DSM).'
  },
  {
    id: 'S-10',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Trụ sở UBND Phường Đông Ngạc mới – Phố Văn Hội (Đầu mối Phòng chống thiên tai phường)',
    lat: 21.079219,
    lng: 105.773375,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Cơ quan hành chính & Ban Chỉ huy PCTT phường (ĐT: 024 2217 5455)',
    drainDuration: '',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'Cổng TTĐT TP. Hà Nội & OpenStreetMap',
    sourceCitation: 'hanoi.gov.vn (trụ sở UBND P. Đông Ngạc mới từ 01/07/2025 tại Phố Văn Hội, TDP số 2 — ĐT 024 2217 5455); osm:way/596707178',
    observedDate: '2025-07-01',
    notes: 'Cách ĐH Mỏ ~747 m (trước sáp nhập là trụ sở UBND P. Đức Thắng cũ). Đầu mối tiếp nhận phản ánh dân sinh, điều phối lực lượng xung kích phòng chống thiên tai và cứu trợ trên địa bàn phường.'
  },
  {
    id: 'S-11',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Trụ sở Công an khu vực Cổ Nhuế – Phố Phạm Tiến Duật (Hỗ trợ an ninh & cứu hộ)',
    lat: 21.06715,
    lng: 105.782311,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Trực ban an ninh trật tự 24/7',
    drainDuration: '',
    elevationM: 9,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/335347845 — Công an phường Cổ Nhuế 2, Phố Phạm Tiến Duật (cách ĐH Mỏ ~1.060 m)',
    observedDate: '2026-11-26',
    notes: 'Điểm trực hỗ trợ an ninh, hướng dẫn phân luồng giao thông và tiếp nhận tin báo sự cố khẩn cấp khu vực KĐT Cổ Nhuế – Phạm Văn Đồng.'
  },
  {
    id: 'S-12',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Trường THCS Đông Ngạc – Ngõ 429 Hoàng Tăng Bí (Công trình kiên cố khu dân cư phía Bắc)',
    lat: 21.082728,
    lng: 105.773359,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Công trình giáo dục kiên cố (kích hoạt hỗ trợ cộng đồng theo điều phối phường)',
    drainDuration: '',
    elevationM: 12,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/897569850 — Trường THCS Đông Ngạc, Ngõ 429 Đường Hoàng Tăng Bí (cách ĐH Mỏ ~1.137 m)',
    observedDate: '2026-11-26',
    notes: 'Công trình trường học nhiều tầng kiên cố nằm gần dải dân cư Hoàng Tăng Bí – Đức Thắng – Tân Nhuệ.'
  },
  {
    id: 'S-13',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Học viện Cảnh sát Nhân dân – Đường Phạm Văn Nghị (Cụm công trình kiên cố bờ Tây sông Nhuệ)',
    lat: 21.066949,
    lng: 105.764436,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Khuôn viên cơ sở đào tạo lớn phía Tây sông Nhuệ',
    drainDuration: '',
    elevationM: 10,
    confidenceTier: 'A',
    confirmCount: 4,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:way/699218280 — Học viện Cảnh sát Nhân dân, Đường Phạm Văn Nghị (cách Khu A ĐH Mỏ ~1.158 m, sát Khu B)',
    observedDate: '2026-11-26',
    notes: 'Cụm hạ tầng kiên cố nằm ở bờ Tây sông Nhuệ trên trục nối sang Khu B ĐH Mỏ - Địa chất.'
  },
  {
    id: 'S-14',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Học viện Cảnh sát Nhân dân – Cơ sở 2 (Số 29 Lê Văn Hiến — Đỉnh gò cao 17 m)',
    lat: 21.073432,
    lng: 105.774979,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Khuôn viên cơ sở đào tạo kiên cố trên dải gò cao sát ĐH Mỏ',
    drainDuration: '',
    elevationM: 17,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực & Copernicus DEM',
    sourceCitation: 'osm:way/699218328 — Học viện Cảnh sát nhân dân Cơ sở 2, 29 Lê Văn Hiến (cách ĐH Mỏ ~154 m, DEM = 17 m)',
    observedDate: '2026-11-26',
    notes: 'Cùng nằm trên gò địa hình cao ráo nhất vùng (17 m DSM) liền kề Khu A ĐH Mỏ - Địa chất, không ngập trong các đợt mưa cực đoan.'
  },
  {
    id: 'S-15',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Cụm Nhà thuốc Đường Cổ Nhuế (Số 149 Cổ Nhuế — Oresol & sơ cứu khu dân cư phía Nam)',
    lat: 21.062195,
    lng: 105.780551,
    severity: 'safe',
    waterScale: 'none',
    hazardFlags: [],
    frequency: 'Nhà thuốc dân sinh mở cửa hằng ngày gần Trạm Y tế & Chợ Cổ Nhuế',
    drainDuration: '',
    elevationM: 15,
    confidenceTier: 'A',
    confirmCount: 3,
    sourceType: 'OpenStreetMap xác thực',
    sourceCitation: 'osm:node/8442194667 (Nhà thuốc số 9, 149 Đường Cổ Nhuế) & osm:way/1115657568 (Nhà thuốc Ngọc Hà) — cách ĐH Mỏ ~1.341 m',
    observedDate: '2026-11-26',
    notes: 'Điểm tiếp cận nhanh Oresol bù điện giải và vật tư sơ cứu ban đầu trên dải nền cao 15 m phục vụ cụm xóm trọ và tiểu thương Chợ Cổ Nhuế.'
  }
];

export const SAFE_DETOUR_ROUTES = [
  {
    name: 'Hướng di chuyển ưu tiên nền cao (Cổng 18 Phố Viên → BV Phương Đông → Trục Cổ Nhuế cao)',
    coordinates: [
      [105.77387, 21.072514],
      [105.774942, 21.069922],
      [105.777269, 21.070783],
      [105.780118, 21.061801]
    ]
  }
];

export const ALERT_BULLETINS = {
  yellow: {
    level: 'MẪU DIỄN TẬP CẤP ĐỘ VÀNG (TÌNH HUỐNG MÔ PHỎNG HỌC TẬP)',
    headline: '[MÔ PHỎNG] Cảnh báo nắng nóng 37–38°C, chỉ số nhiệt cảm nhận >41°C khung giờ 11h30–15h00 tại khu vực Đông Ngạc – Cổ Nhuế',
    timeframe: 'Dữ liệu nền thực tế: Khu vực ĐH Mỏ có 63–76 ngày nhiệt cảm nhận ≥40°C/năm (ERA5); Trạm Láng đạt kỷ lục tháng 8 là 40,3°C (04/08/2025); trọ mái tôn đo 45–50°C',
    actions: [
      'Trang bị mũ rộng vành, áo chống nắng thoáng khí và bình nước/Oresol trước khi chờ các tuyến xe buýt 09A, 28, 31 tại Phố Viên hoặc trạm 138 Phạm Văn Đồng.',
      'Sinh viên ở phòng trọ mái tôn hạn chế ở tầng áp mái khung 11h30–15h00; tận dụng Thư viện hoặc không gian râm mát trong khuôn viên trường để nghỉ chuyển tiết.',
      'Theo dõi dự báo nắng nóng chính thức tại Trung tâm Dự báo KTTV Quốc gia (nchmf.gov.vn).'
    ]
  },
  red: {
    level: 'MẪU DIỄN TẬP CẤP ĐỘ ĐỎ (TÌNH HUỐNG MÔ PHỎNG HỌC TẬP)',
    headline: '[MÔ PHỎNG DIỄN TẬP 17h00] Giả định mưa lớn >70 mm làm ngập sâu đoạn cuối Phố Viên, Cầu Noi và khu trũng ven sông Nhuệ',
    timeframe: 'Lưu ý: Đây là bài tập diễn tập phản xạ 30 giây cho sinh viên; xem cảnh báo ngập thời gian thực của TP. Hà Nội trên ứng dụng HSDC Maps hoặc iHanoi.',
    actions: [
      'DỪNG LẠI Ở NỀN CAO: Không cố đi xe máy qua đoạn nước ngập che khuất mặt đường hoặc khu vực có cống thoát nước xoáy tại cuối Phố Viên, Cầu Noi.',
      'AN TOÀN ĐIỆN TRỌ NỀN THẤP: Ngắt aptomat/cầu dao từ vị trí khô ráo nếu nước có dấu hiệu tràn vào sàn tầng 1 phòng trọ.',
      'TRA CỨU ĐIỂM AN TOÀN: Dùng công cụ "Tìm nơi trú gần nhất" trên bản đồ để biết vị trí cơ sở y tế (BV Phương Đông, Trạm y tế phường) hoặc điểm tránh trú.'
    ]
  }
};

export const DRILL_QUIZ_QUESTIONS = [
  {
    id: 'Q1',
    question:
      'Câu 1 (Tình huống diễn tập): Giả sử lúc tan học trời mưa rất lớn, mặt đường cuối Phố Viên và Cầu Noi ngập sâu che khuất mặt đường và miệng cống. Xử lý nào AN TOÀN nhất?',
    options: [
      'Giữ đều ga phóng nhanh qua theo vệt bánh xe phía trước để kịp về phòng trọ',
      'Dừng lại tại khu vực nền cao ráo an toàn (khuôn viên trường, sảnh kiên cố) chờ nước rút hoặc chọn lộ trình cao ráo đã kiểm chứng, tuyệt đối không đi vào vùng nước chảy xoáy',
      'Đứng trú mưa dưới gốc cây lớn sát bờ sông Nhuệ chờ tạnh',
      'Lội bộ dò đường sát miệng cống thoát nước'
    ],
    correctIndex: 1,
    explanation:
      'Đúng! Thực tế tại cuối Phố Viên (Báo Lao Động 18/09/2026) từng ghi nhận mặt đường gồ ghề và dòng xoáy miệng cống rất nguy hiểm khi ngập sâu; đứng dưới cây cao lúc mưa dông có nguy cơ sét đánh.'
  },
  {
    id: 'Q2',
    question:
      'Câu 2 (Sơ cứu sốc nhiệt chuẩn Bộ Y tế): Khi gặp người đi nắng gắt có biểu hiện da nóng đỏ, choáng váng, buồn nôn, lơ mơ, thao tác nào ĐÚNG trong 3 phút đầu?',
    options: [
      'Đưa ngay vào phòng điều hòa lạnh sâu 16°C và ép uống nước đá lạnh',
      'Để ngồi ngoài nắng xoa dầu gió nóng và cạo gió',
      'Đưa vào chỗ râm mát thoáng gió, nới lỏng quần áo, chườm mát vùng cổ – nách – bẹn, cho uống từng ngụm nước mát/Oresol (nếu còn tỉnh) và gọi 115 / đưa tới cơ sở y tế gần nhất nếu không đỡ',
      'Cho uống ngay thuốc hạ sốt Paracetamol'
    ],
    correctIndex: 2,
    explanation:
      'Chính xác! Chườm mát cổ – nách – bẹn giúp hạ thân nhiệt qua các mạch máu lớn an toàn; nước đá lạnh sâu gây co mạch đột ngột và Paracetamol không có tác dụng trong sốc nhiệt môi trường.'
  },
  {
    id: 'Q3',
    question:
      'Câu 3 (An toàn điện nhà trọ nền thấp): Khi mưa lớn làm nước ngoài ngõ bắt đầu tràn vào sàn tầng trệt dãy nhà trọ, việc ĐẦU TIÊN bắt buộc làm là gì?',
    options: [
      'Lội chân trần xuống sàn nước để nhặt ổ cắm điện kéo dài lên bàn',
      'Đứng ở bậc khô ráo ngắt ngay cầu dao / aptomat điện tổng của khu vực bị ngập bằng tay khô (hoặc vật cách điện) trước khi thu dọn đồ đạc',
      'Cắm thêm quạt thổi sàn cho nhanh ráo nước',
      'Đợi nước ngập tới đầu gối mới ngắt điện'
    ],
    correctIndex: 1,
    explanation:
      'Chuẩn xác! Ngắt nguồn điện từ vị trí khô ráo trước khi chạm vào bất kỳ thiết bị hay mặt nước nào là nguyên tắc sống còn chống điện giật.'
  },
  {
    id: 'Q4',
    question:
      'Câu 4 (Tra cứu cơ sở y tế thực tế): Theo dữ liệu OpenStreetMap trên Bản đồ số, bệnh viện đa khoa gần cổng 18 Phố Viên (ĐH Mỏ - Địa chất) nhất (chỉ khoảng 310 m) là cơ sở nào?',
    options: [
      'Bệnh viện Bạch Mai',
      'Bệnh viện Đa khoa Phương Đông (Số 9 Phố Viên)',
      'Bệnh viện Việt Đức',
      'Trạm Y tế xã Thiên Lộc'
    ],
    correctIndex: 1,
    explanation:
      'Chính xác! Bệnh viện Đa khoa Phương Đông nằm ngay tại số 9 Phố Viên (osm:way/570572630), cách cổng Khu A ĐH Mỏ khoảng 310 m.'
  },
  {
    id: 'Q5',
    question:
      'Câu 5 (Đóng góp dữ liệu cộng đồng an toàn): Khi muốn đóng góp một điểm ngập hoặc điểm nắng gắt lên Bản đồ Cộng đồng phường Đông Ngạc, nguyên tắc nào dưới đây là ĐÚNG?',
    options: [
      'Đang mưa bão sấm sét phải chạy ngay ra giữa đoạn ngập sâu để chụp ảnh cho rõ',
      'Tự ước đại con số độ sâu 80–90 cm dù chưa từng thấy để cảnh báo cho mạnh',
      'Chỉ ghi nhận khi bản thân đang ở vị trí an toàn (có thể báo hồi cứu sau khi mưa ngớt), chọn đúng mốc ngập thực tế từng chứng kiến và không đăng thông tin cá nhân của người khác',
      'Đăng kèm họ tên, số điện thoại của hàng xóm lên bản đồ công khai'
    ],
    correctIndex: 2,
    explanation:
      'Rất chuẩn! An toàn tính mạng luôn đặt lên hàng đầu, dữ liệu trung thực và tôn trọng quyền riêng tư theo Luật Bảo vệ dữ liệu cá nhân 2025 giúp bản đồ phục vụ cộng đồng bền vững.'
  }
];
