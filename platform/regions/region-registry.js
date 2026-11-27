/**
 * OPEN RESILIENCE INTELLIGENCE PLATFORM — MULTI-REGION REGISTRY (4 TIERS)
 * Loại bỏ việc gắn cứng tọa độ và cấu hình Đông Ngạc/HUMG vào logic lõi.
 * Hỗ trợ từ Cấp 1 (HUMG - Đông Ngạc - Cổ Nhuế - Đức Thắng) đến Cấp 4 (Địa phương tùy biến).
 */

export const REGION_TIERS = Object.freeze({
  TIER_1_WARD_CLUSTER: 1,
  TIER_2_DISTRICT_CLUSTER: 2,
  TIER_3_METROPOLITAN: 3,
  TIER_4_CUSTOM_LOCALITY: 4
});

export const BUILTIN_REGIONS = Object.freeze({
  'vn-hn-dong-ngac-humg': Object.freeze({
    id: 'vn-hn-dong-ngac-humg',
    slug: 'dong-ngac-humg',
    tier: REGION_TIERS.TIER_1_WARD_CLUSTER,
    parentRegionId: 'vn-hn-bac-tu-liem-uni',
    name: 'Cụm ĐH Mỏ - Địa chất · Đông Ngạc · Cổ Nhuế · Đức Thắng',
    shortName: 'HUMG – Đông Ngạc',
    countryCode: 'VN',
    timezone: 'Asia/Bangkok',
    crs: {
      storage: 'EPSG:4326',
      projectedMetric: 'EPSG:32648',
      nationalReference: 'VN-2000 / Zone 105°00′E (3°)'
    },
    center: { lat: 21.072514, lng: 105.77387, label: 'Trường ĐH Mỏ - Địa chất (18 Phố Viên, P. Đông Ngạc)' },
    defaultRadiusKm: 2.0,
    maxGeofenceMeters: 6500,
    // [minLng, minLat, maxLng, maxLat]
    bbox: [105.745, 21.045, 105.805, 21.102],
    enabledModules: ['flood', 'heat', 'air_quality', 'extreme_weather', 'environment', 'community'],
    dataSources: {
      dem: 'ds-copernicus-dem-glo30',
      climateArchive: 'ds-era5-2024-2026',
      weatherForecast: 'ds-openmeteo-forecast',
      airQuality: 'ds-openmeteo-cams-aqi',
      radar: 'ds-rainviewer-radar'
    },
    governance: {
      managingOrg: 'Nhóm Nghiên cứu & Cộng đồng Mở HUMG · Cụm Đông Ngạc',
      alertApprovalRequired: true,
      autoPromoteConfirmThreshold: 3,
      duplicateMergeRadiusMeters: 50
    },
    status: 'active'
  }),

  'vn-hn-bac-tu-liem-uni': Object.freeze({
    id: 'vn-hn-bac-tu-liem-uni',
    slug: 'bac-tu-liem-uni',
    tier: REGION_TIERS.TIER_2_DISTRICT_CLUSTER,
    parentRegionId: 'vn-hn-city',
    name: 'Khu vực Bắc Từ Liêm & Cụm Trường Đại học',
    shortName: 'Bắc Từ Liêm & Cụm ĐH',
    countryCode: 'VN',
    timezone: 'Asia/Bangkok',
    crs: {
      storage: 'EPSG:4326',
      projectedMetric: 'EPSG:32648',
      nationalReference: 'VN-2000 / Zone 105°00′E (3°)'
    },
    center: { lat: 21.0665, lng: 105.7645, label: 'Trung tâm cụm Đại học Bắc Từ Liêm (HUMG · HVTC · HUNRE · HaUI)' },
    defaultRadiusKm: 6.0,
    maxGeofenceMeters: 12000,
    bbox: [105.705, 21.028, 105.815, 21.118],
    enabledModules: ['flood', 'heat', 'air_quality', 'extreme_weather', 'environment', 'community'],
    dataSources: {
      dem: 'ds-copernicus-dem-glo30',
      climateArchive: 'ds-era5-2024-2026',
      weatherForecast: 'ds-openmeteo-forecast',
      airQuality: 'ds-openmeteo-cams-aqi',
      radar: 'ds-rainviewer-radar'
    },
    governance: {
      managingOrg: 'Liên minh Nghiên cứu Cụm ĐH Bắc Từ Liêm',
      alertApprovalRequired: true,
      autoPromoteConfirmThreshold: 3,
      duplicateMergeRadiusMeters: 50
    },
    status: 'configured_pilot'
  }),

  'vn-hn-city': Object.freeze({
    id: 'vn-hn-city',
    slug: 'hanoi-city',
    tier: REGION_TIERS.TIER_3_METROPOLITAN,
    parentRegionId: null,
    name: 'Toàn Thành phố Hà Nội',
    shortName: 'TP. Hà Nội',
    countryCode: 'VN',
    timezone: 'Asia/Bangkok',
    crs: {
      storage: 'EPSG:4326',
      projectedMetric: 'EPSG:32648',
      nationalReference: 'VN-2000 / Zone 105°00′E (3°)'
    },
    center: { lat: 21.028511, lng: 105.804817, label: 'Trung tâm TP. Hà Nội' },
    defaultRadiusKm: 18.0,
    maxGeofenceMeters: 65000,
    bbox: [105.285, 20.564, 106.020, 21.385],
    enabledModules: ['flood', 'heat', 'air_quality', 'extreme_weather', 'environment', 'community'],
    dataSources: {
      dem: 'ds-copernicus-dem-glo30',
      climateArchive: 'ds-era5-2024-2026',
      weatherForecast: 'ds-openmeteo-forecast',
      airQuality: 'ds-openmeteo-cams-aqi',
      radar: 'ds-rainviewer-radar'
    },
    governance: {
      managingOrg: 'Mạng lưới Trí tuệ Khả năng Chống chịu Mở Hà Nội',
      alertApprovalRequired: true,
      autoPromoteConfirmThreshold: 4,
      duplicateMergeRadiusMeters: 60
    },
    status: 'planned_expansion'
  })
});

export const DEFAULT_REGION_ID = 'vn-hn-dong-ngac-humg';

const customRegions = new Map();

export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function isCoordinateInBbox(lat, lng, bbox) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Array.isArray(bbox) || bbox.length !== 4) {
    return false;
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

/**
 * Tạo và kiểm định cấu hình vùng mới cho Cấp 4 (bất kỳ tỉnh/thành/địa phương nào)
 * mà không cần sửa logic dùng chung.
 */
export function createRegionConfig(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('RegionConfig phải là một đối tượng hợp lệ.');
  }
  const id = String(input.id || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+){1,6}$/.test(id)) {
    throw new Error(`Mã vùng không hợp lệ (${id}). Dùng chữ thường và dấu gạch ngang, ví dụ: vn-dn-hai-chau.`);
  }
  const lat = Number(input.center?.lat);
  const lng = Number(input.center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Tọa độ tâm vùng không hợp lệ cho ${id}.`);
  }
  const bbox = input.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    throw new Error(`Bounding box [minLng, minLat, maxLng, maxLat] không hợp lệ cho ${id}.`);
  }
  if (!isCoordinateInBbox(lat, lng, bbox)) {
    throw new Error(`Tâm tọa độ của ${id} phải nằm trong bbox đã khai báo.`);
  }
  const maxGeofenceMeters = Number(input.maxGeofenceMeters);
  if (!Number.isFinite(maxGeofenceMeters) || maxGeofenceMeters < 500 || maxGeofenceMeters > 250000) {
    throw new Error(`maxGeofenceMeters của ${id} phải nằm trong khoảng 500..250000 m.`);
  }

  return Object.freeze({
    id,
    slug: String(input.slug || id),
    tier: Number(input.tier || REGION_TIERS.TIER_4_CUSTOM_LOCALITY),
    parentRegionId: input.parentRegionId ?? null,
    name: String(input.name || id).trim(),
    shortName: String(input.shortName || input.name || id).trim(),
    countryCode: String(input.countryCode || 'VN').toUpperCase(),
    timezone: String(input.timezone || 'Asia/Bangkok'),
    crs: Object.freeze({
      storage: 'EPSG:4326',
      projectedMetric: String(input.crs?.projectedMetric || 'EPSG:32648'),
      nationalReference: String(input.crs?.nationalReference || 'VN-2000')
    }),
    center: Object.freeze({
      lat,
      lng,
      label: String(input.center?.label || input.name || id).trim()
    }),
    defaultRadiusKm: Number(input.defaultRadiusKm || 3.0),
    maxGeofenceMeters,
    bbox: Object.freeze([...bbox]),
    enabledModules: Object.freeze(
      Array.isArray(input.enabledModules) && input.enabledModules.length > 0
        ? [...input.enabledModules]
        : ['flood', 'heat', 'air_quality', 'extreme_weather', 'environment', 'community']
    ),
    dataSources: Object.freeze({ ...(input.dataSources || {}) }),
    governance: Object.freeze({
      managingOrg: String(input.governance?.managingOrg || 'Đơn vị vận hành địa phương'),
      alertApprovalRequired: input.governance?.alertApprovalRequired !== false,
      autoPromoteConfirmThreshold: Number(input.governance?.autoPromoteConfirmThreshold || 3),
      duplicateMergeRadiusMeters: Number(input.governance?.duplicateMergeRadiusMeters || 50)
    }),
    status: String(input.status || 'configured_custom')
  });
}

export function registerCustomRegion(input) {
  const cfg = createRegionConfig(input);
  if (BUILTIN_REGIONS[cfg.id]) {
    throw new Error(`Không được ghi đè mã vùng lõi có sẵn: ${cfg.id}`);
  }
  customRegions.set(cfg.id, cfg);
  return cfg;
}

export function unregisterCustomRegion(regionId) {
  return customRegions.delete(regionId);
}

export function listAllRegions() {
  return [...Object.values(BUILTIN_REGIONS), ...customRegions.values()];
}

export function getRegionConfig(regionId = DEFAULT_REGION_ID) {
  const id = String(regionId || DEFAULT_REGION_ID).trim();
  return BUILTIN_REGIONS[id] || customRegions.get(id) || null;
}

/**
 * Tự động phân giải vùng chi tiết nhất (ưu tiên tier nhỏ hơn / cụ thể hơn) chứa tọa độ.
 */
export function resolveRegionForCoordinate(lat, lng) {
  const candidates = listAllRegions()
    .filter((r) => isCoordinateInBbox(lat, lng, r.bbox))
    .sort((a, b) => a.tier - b.tier || a.maxGeofenceMeters - b.maxGeofenceMeters);
  return candidates[0] || null;
}

/**
 * Kiểm tra tọa độ có hợp lệ trong phạm vi tiếp nhận của vùng hay không.
 */
export function validateCoordinateInRegion(lat, lng, regionId = DEFAULT_REGION_ID) {
  const region = getRegionConfig(regionId);
  if (!region) {
    return { valid: false, reason: `Không tìm thấy cấu hình vùng "${regionId}".` };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, reason: 'Tọa độ không phải số hợp lệ.' };
  }
  const distanceMeters = haversineDistanceMeters(region.center.lat, region.center.lng, lat, lng);
  const inBbox = isCoordinateInBbox(lat, lng, region.bbox);
  if (!inBbox || distanceMeters > region.maxGeofenceMeters) {
    return {
      valid: false,
      regionId: region.id,
      distanceMeters,
      maxGeofenceMeters: region.maxGeofenceMeters,
      reason: `Vị trí cách tâm vùng ${region.shortName} ${(distanceMeters / 1000).toFixed(1)} km (ngoài phạm vi tiếp nhận ${(region.maxGeofenceMeters / 1000).toFixed(1)} km).`
    };
  }
  return {
    valid: true,
    regionId: region.id,
    distanceMeters,
    maxGeofenceMeters: region.maxGeofenceMeters
  };
}
