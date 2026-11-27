/**
 * OPEN RESILIENCE INTELLIGENCE PLATFORM — EPISTEMIC DATA PROVENANCE & 12-FIELD METADATA CATALOG
 * Bắt buộc phân tách 6 lớp dữ liệu nhận thức luận; tuyệt đối không trộn lẫn dữ liệu quan trắc,
 * mô hình, vệ tinh, dự báo, cộng đồng và mô phỏng mà không thể hiện rõ trên giao diện.
 */

export const DATA_CLASSES = Object.freeze({
  OBSERVED_DATA: 'OBSERVED_DATA',
  MODELLED_DATA: 'MODELLED_DATA',
  SATELLITE_DATA: 'SATELLITE_DATA',
  FORECAST_DATA: 'FORECAST_DATA',
  COMMUNITY_REPORTS: 'COMMUNITY_REPORTS',
  SIMULATED_DATA: 'SIMULATED_DATA'
});

export const DATA_CLASS_BADGES = Object.freeze({
  OBSERVED_DATA: Object.freeze({
    code: 'OBSERVED_DATA',
    labelVi: 'Quan trắc / Thực địa',
    shortTag: 'OBSERVED',
    tone: 'emerald',
    disclaimerVi: 'Dữ liệu đo đạc trực tiếp hoặc khảo sát thực địa có trích dẫn nguồn.'
  }),
  MODELLED_DATA: Object.freeze({
    code: 'MODELLED_DATA',
    labelVi: 'Mô hình hóa / Tái phân tích',
    shortTag: 'MODELLED',
    tone: 'blue',
    disclaimerVi: 'Đầu ra mô hình khí hậu/khí quyển trên lưới không gian; không phải đo tại chỗ từng con ngõ.'
  }),
  SATELLITE_DATA: Object.freeze({
    code: 'SATELLITE_DATA',
    labelVi: 'Viễn thám Vệ tinh / Radar',
    shortTag: 'SATELLITE',
    tone: 'indigo',
    disclaimerVi: 'Dữ liệu cảm biến vệ tinh/radar có sai số độ phân giải và vật cản bề mặt (mái nhà, mây).'
  }),
  FORECAST_DATA: Object.freeze({
    code: 'FORECAST_DATA',
    labelVi: 'Dự báo Khí tượng',
    shortTag: 'FORECAST',
    tone: 'amber',
    disclaimerVi: 'Ước lượng trạng thái tương lai có độ bất định; không thay thế cảnh báo thiên tai chính thức của KTTV.'
  }),
  COMMUNITY_REPORTS: Object.freeze({
    code: 'COMMUNITY_REPORTS',
    labelVi: 'Phản ánh Cộng đồng',
    shortTag: 'COMMUNITY',
    tone: 'orange',
    disclaimerVi: 'Dữ liệu cư dân đóng góp; cần đối chiếu hạng tin cậy (C/B/A) và thời gian cập nhật.'
  }),
  SIMULATED_DATA: Object.freeze({
    code: 'SIMULATED_DATA',
    labelVi: 'Kịch bản Mô phỏng',
    shortTag: 'SIMULATED',
    tone: 'purple',
    disclaimerVi: 'KỊCH BẢN GIẢ ĐỊNH ĐỂ THAM KHẢO & DIỄN TẬP — KHÔNG PHẢI DỰ BÁO HAY ĐỘ SÂU NGẬP THỰC TẾ.'
  })
});

export const REQUIRED_METADATA_FIELDS = Object.freeze([
  'name',
  'source',
  'license',
  'collectedAt',
  'updatedAt',
  'crs',
  'spatialResolution',
  'spatialExtent',
  'temporalResolution',
  'processingMethod',
  'confidenceLevel',
  'knownLimitations'
]);

/**
 * Kiểm định một tập dữ liệu đáp ứng đủ 12 trường siêu dữ liệu bắt buộc và thuộc đúng 1 trong 6 lớp epistemic.
 */
export function validateDatasetMetadata(dataset) {
  const errors = [];
  if (!dataset || typeof dataset !== 'object') {
    return { valid: false, errors: ['Dataset metadata phải là đối tượng JSON.'] };
  }
  if (!dataset.id || typeof dataset.id !== 'string') {
    errors.push('Thiếu trường id tập dữ liệu.');
  }
  if (!DATA_CLASSES[dataset.dataClass]) {
    errors.push(`dataClass "${dataset.dataClass}" không thuộc 6 lớp chuẩn (${Object.keys(DATA_CLASSES).join(', ')}).`);
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    const val = dataset[field];
    if (field === 'knownLimitations') {
      const hasList = Array.isArray(val) && val.length > 0 && val.every((x) => typeof x === 'string' && x.trim().length >= 10);
      const hasText = typeof val === 'string' && val.trim().length >= 15;
      if (!hasList && !hasText) {
        errors.push('Trường knownLimitations bắt buộc nêu rõ tối thiểu 1 hạn chế khoa học cụ thể.');
      }
    } else if (val === undefined || val === null || String(val).trim().length < 2) {
      errors.push(`Thiếu hoặc rỗng trường siêu dữ liệu bắt buộc: ${field}`);
    }
  }
  if (!['high', 'medium', 'low'].includes(dataset.confidenceLevel)) {
    errors.push(`confidenceLevel phải là "high", "medium" hoặc "low" (nhận được: ${dataset.confidenceLevel}).`);
  }
  return { valid: errors.length === 0, errors };
}

export function getDataClassBadge(dataClass) {
  return DATA_CLASS_BADGES[dataClass] || null;
}

/**
 * Kho Siêu dữ liệu chuẩn hóa của các tập dữ liệu đang vận hành trong hệ thống.
 */
export const CORE_DATA_CATALOG = Object.freeze([
  Object.freeze({
    id: 'ds-humg-baseline-60',
    dataClass: DATA_CLASSES.OBSERVED_DATA,
    name: 'Bộ 60 điểm rủi ro & an toàn nền HUMG – Phường Đông Ngạc',
    source: 'Khảo sát thực địa Đề tài 08 HUMG + OpenStreetMap + Báo chí chính thống có ngày đăng',
    license: 'CC BY 4.0 (dữ liệu tổng hợp thực địa) & ODbL 1.0 (tọa độ hạ tầng OSM)',
    collectedAt: '2024-07-01/2026-11-26',
    updatedAt: '2026-11-27',
    crs: 'EPSG:4326 (hỗ trợ chiếu EPSG:32648 UTM 48N)',
    spatialResolution: 'Điểm GPS ±5–15 m',
    spatialExtent: 'Bán kính 2,0 km quanh ĐH Mỏ - Địa chất (105.754–105.794°E, 21.054–21.091°N)',
    temporalResolution: 'Theo sự kiện ngập & đợt khảo sát thực địa',
    processingMethod: 'Chuẩn hóa schema, loại bỏ toàn bộ trường độ sâu/nhiệt độ tự bịa, kiểm toán QA 0 lỗi',
    confidenceLevel: 'high',
    knownLimitations: [
      'Mới phủ bán kính 2 km quanh HUMG, chưa bao phủ toàn quận Bắc Từ Liêm hoặc TP. Hà Nội.',
      'Một số điểm lịch sử từ báo chí cần tái khảo sát sau khi hoàn thành cải tạo cống thoát nước khu vực.'
    ]
  }),
  Object.freeze({
    id: 'ds-copernicus-dem-glo30',
    dataClass: DATA_CLASSES.SATELLITE_DATA,
    name: 'Mô hình Bề mặt Số Vệ tinh ESA Copernicus DEM GLO-30',
    source: 'European Space Agency (ESA) / Airbus qua Open-Meteo Elevation API',
    license: 'Copernicus DEM Open License',
    collectedAt: '2011–2015 (TanDEM-X mission)',
    updatedAt: '2026-11-27',
    crs: 'EPSG:4326 (WGS84), cao độ EGM2008',
    spatialResolution: 'Gốc ~30 m (1 arcsec); lưới trích hiện tại 25×25 (~160 m bước lưới)',
    spatialExtent: '4 × 4 km quanh ĐH Mỏ - Địa chất (mở rộng theo vùng ở M2+)',
    temporalResolution: 'Tĩnh (không cập nhật theo ngày)',
    processingMethod: 'Lấy mẫu lưới 625 điểm + nội suy song tuyến tính (bilinear)',
    confidenceLevel: 'medium',
    knownLimitations: [
      'Là DSM (Digital Surface Model) chứ không phải DTM — bị ảnh hưởng bởi mái nhà cao tầng và tán cây đô thị.',
      'Sai số độ cao đứng khoảng ±2–4 m; KHÔNG THỂ tự nó xác định độ sâu ngập thực tế (cm) ở từng con ngõ hẹp.',
      'Không phản ánh cao độ lòng cống, hố ga hay công trình nâng cốt đường mới xây sau năm 2015.'
    ]
  }),
  Object.freeze({
    id: 'ds-era5-2024-2026',
    dataClass: DATA_CLASSES.MODELLED_DATA,
    name: 'Chuỗi Tái phân tích Khí hậu ECMWF ERA5 (2024–2026)',
    source: 'Copernicus Climate Change Service (C3S) / ECMWF ERA5 qua Open-Meteo Archive',
    license: 'Copernicus License (CC BY 4.0 / C3S)',
    collectedAt: '2024-01-01/2026-11-20',
    updatedAt: '2026-11-26',
    crs: 'EPSG:4326',
    spatialResolution: '~0,25° (~28 km × 28 km)',
    spatialExtent: 'Ô lưới Tây Bắc nội đô Hà Nội tâm 21.0725°N, 105.7739°E',
    temporalResolution: 'Tổng hợp theo ngày, tháng và năm từ chuỗi giờ',
    processingMethod: 'Thống kê số ngày ≥35°C, cảm nhận ≥40°C, ngày mưa ≥50 mm và tổng mưa tháng',
    confidenceLevel: 'high',
    knownLimitations: [
      'Độ phân giải ~28 km làm trơn hóa các cơn mưa giông đối lưu hẹp nên có thể lệch so với trạm đo mưa cục bộ.',
      'Không đo được vi khí hậu nhiệt độ bề mặt nhựa đường hay bóng mát trong từng ngõ.'
    ]
  }),
  Object.freeze({
    id: 'ds-openmeteo-forecast',
    dataClass: DATA_CLASSES.FORECAST_DATA,
    name: 'Dự báo Thời tiết Đa mô hình Open-Meteo (24h – 7 ngày)',
    source: 'Open-Meteo Forecast API (NOAA GFS / DWD ICON / ECMWF IFS)',
    license: 'CC BY 4.0 (phi thương mại ở gói miễn phí)',
    collectedAt: 'Cập nhật liên tục theo chu kỳ mô hình toàn cầu',
    updatedAt: 'Thời gian thực (khuyến nghị cache 15 phút)',
    crs: 'EPSG:4326',
    spatialResolution: '~1–11 km tùy mô hình thành phần',
    spatialExtent: 'Toàn cầu (hỗ trợ tất cả vùng Cấp 1–4)',
    temporalResolution: 'Theo giờ (hourly) và theo ngày (daily)',
    processingMethod: 'Truy xuất JSON chuẩn hóa theo múi giờ địa phương',
    confidenceLevel: 'medium',
    knownLimitations: [
      'Mưa dông đối lưu cục bộ ở Hà Nội có độ bất định cao về vị trí và cường độ giờ.',
      'Không thay thế bản tin cảnh báo thiên tai chính thức của Trung tâm Dự báo KTTV Quốc gia.'
    ]
  }),
  Object.freeze({
    id: 'ds-openmeteo-cams-aqi',
    dataClass: DATA_CLASSES.MODELLED_DATA,
    name: 'Chất lượng Không khí Toàn cầu CAMS (PM2.5, PM10, US AQI, UV)',
    source: 'ECMWF Copernicus Atmosphere Monitoring Service (CAMS) qua Open-Meteo',
    license: 'CC BY 4.0 / Copernicus Open Access',
    collectedAt: 'Liên tục theo giờ',
    updatedAt: 'Thời gian thực (khuyến nghị cache 15 phút)',
    crs: 'EPSG:4326',
    spatialResolution: '~10–40 km (CAMS Global)',
    spatialExtent: 'Toàn cầu (hỗ trợ tất cả vùng Cấp 1–4)',
    temporalResolution: 'Theo giờ',
    processingMethod: 'Quy đổi ngưỡng US EPA AQI từ nồng độ PM2.5/PM10 mô hình hóa',
    confidenceLevel: 'medium',
    knownLimitations: [
      'Là dữ liệu mô hình hóa toàn cầu độ phân giải thô, KHÔNG phải trạm cảm biến đo thực tế tại nút giao thông.',
      'Cần đối chiếu thêm trạm quan trắc mặt đất (OpenAQ / EPA) trong mùa nghịch nhiệt mùa đông Hà Nội.'
    ]
  }),
  Object.freeze({
    id: 'ds-community-reports-live',
    dataClass: DATA_CLASSES.COMMUNITY_REPORTS,
    name: 'Phản ánh Cộng đồng, Xác nhận +1 và Live Check-in 6 giờ',
    source: 'Người dân, sinh viên và nhóm thực địa đóng góp qua Web/PWA',
    license: 'CC BY 4.0 (đã ẩn danh và xóa EXIF)',
    collectedAt: 'Liên tục theo thời gian thực',
    updatedAt: 'Thời gian thực (Live Pulse TTL = 6 giờ)',
    crs: 'EPSG:4326 (làm tròn tọa độ bảo vệ riêng tư ~11–20 m)',
    spatialResolution: 'GPS thiết bị di động (±5–30 m)',
    spatialExtent: 'Trong geofence của từng vùng đã đăng ký',
    temporalResolution: 'Theo sự kiện thời gian thực',
    processingMethod: 'Lọc spam/XSS, gộp trùng 50 m, nâng hạng tự động C→B khi ≥3 xác nhận độc lập, duyệt Hạng A qua xác minh',
    confidenceLevel: 'medium',
    knownLimitations: [
      'Phản ánh cộng đồng có độ lệch không gian (tập trung nơi đông người dùng ứng dụng) và có thể chứa nhầm lẫn trước khi xác minh.',
      'Trạng thái Live Check-in chỉ phản ánh nhận định trực quan tại thời điểm gửi, hết hiệu lực hiển thị sau 6 giờ.'
    ]
  }),
  Object.freeze({
    id: 'ds-flood-scenario-sim',
    dataClass: DATA_CLASSES.SIMULATED_DATA,
    name: 'Kịch bản Mô phỏng Nhạy cảm Ngập theo Ngưỡng Mưa (30 / 70 / >115 mm)',
    source: 'Mô hình trực quan hóa nội bộ kết hợp Copernicus DEM GLO-30 và 18 hành lang ngập lịch sử',
    license: 'CC BY 4.0 (tài liệu tham khảo nghiên cứu & truyền thông)',
    collectedAt: '2026-11-27',
    updatedAt: '2026-11-27',
    crs: 'EPSG:4326',
    spatialResolution: 'Lưới suy diễn từ DEM 30 m & hành lang OSM',
    spatialExtent: 'Vùng Đông Ngạc – HUMG (2 km)',
    temporalResolution: 'Kịch bản giả định (không gắn thời gian thực)',
    processingMethod: 'Tổ hợp trọng số tương đối giữa cao độ DSM, khoảng cách hành lang ngập lịch sử và ngưỡng mưa',
    confidenceLevel: 'low',
    knownLimitations: [
      'LÀ KỊCH BẢN MÔ PHỎNG THAM KHẢO — TUYỆT ĐỐI KHÔNG PHẢI DỰ BÁO NGẬP THỰC TẾ.',
      'Không phải mô phỏng thủy lực 1D/2D (SWMM/HEC-RAS) và không có dữ liệu đường kính cống, vận hành trạm bơm hay độ thấm mặt đất chi tiết.'
    ]
  })
]);

/**
 * Kiểm tra xem một danh sách bản ghi có đang pha trộn nhiều lớp dữ liệu mà thiếu phân nhãn rõ ràng hay không.
 */
export function summarizeDataClasses(records = []) {
  const counts = {};
  const unlabeled = [];
  for (const rec of records) {
    const cls = rec?.dataClass;
    if (!cls || !DATA_CLASSES[cls]) {
      unlabeled.push(rec?.id || 'unknown');
    } else {
      counts[cls] = (counts[cls] || 0) + 1;
    }
  }
  const presentClasses = Object.keys(counts);
  return {
    presentClasses,
    counts,
    unlabeledCount: unlabeled.length,
    unlabeledIds: unlabeled,
    containsSimulated: Boolean(counts[DATA_CLASSES.SIMULATED_DATA]),
    requiresMixedSourceBanner: presentClasses.length > 1
  };
}
