/**
 * Lõi tính toán không gian GIS & Chuẩn hóa Hồ sơ Tin cậy A/B/C (WGS84 & UTM Zone 48N)
 * Phục vụ Bản đồ Cộng đồng Mở khu vực ĐH Mỏ - Địa chất — Phường Đông Ngạc, Hà Nội
 */

import { WATER_LEVEL_SCALES, HAZARD_FLAGS_META, CONFIDENCE_TIERS } from './humg-data.js';

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const UTM_K0 = 0.9996;

export function latLngToUTM(lat, lng, forcedZone = null) {
  const zone = forcedZone || (Math.floor((lng + 180) / 6) + 1);
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const lngOriginRad = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;

  const ep2 = WGS84_E2 / (1 - WGS84_E2);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = cosLat * (lngRad - lngOriginRad);

  const e4 = WGS84_E2 * WGS84_E2;
  const e6 = e4 * WGS84_E2;

  const M =
    WGS84_A *
    ((1 - WGS84_E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latRad -
      ((3 * WGS84_E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latRad) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latRad) -
      ((35 * e6) / 3072) * Math.sin(6 * latRad));

  const easting =
    UTM_K0 *
      N *
      (A +
        ((1 - T + C) * Math.pow(A, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5)) / 120) +
    500000.0;

  let northing =
    UTM_K0 *
    (M +
      N *
        tanLat *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6)) / 720));

  const hemisphere = lat >= 0 ? 'N' : 'S';
  if (lat < 0) northing += 10000000.0;

  return {
    zone,
    hemisphere,
    epsg: hemisphere === 'N' ? `EPSG:326${String(zone).padStart(2, '0')}` : `EPSG:327${String(zone).padStart(2, '0')}`,
    easting: Math.round(easting * 10) / 10,
    northing: Math.round(northing * 10) / 10
  };
}

export function formatBearingVN(bearingDeg) {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  const dirs = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
  const idx = Math.round(normalized / 45) % 8;
  return {
    degrees: Math.round(normalized),
    direction: dirs[idx],
    label: `${dirs[idx]} (${Math.round(normalized)}°)`
  };
}

export function roundPrivacyCoord(val, enable20m = false) {
  const num = Number(val);
  if (enable20m) return Math.round(num * 5000) / 5000;
  return Math.round(num * 1000000) / 1000000;
}

export function buildGeodesicBuffer(turfLib, centerLat, centerLng, radiusKm = 2, steps = 128) {
  const centerCoord = [Number(centerLng), Number(centerLat)];
  const polygon = turfLib.circle(centerCoord, Number(radiusKm), {
    steps,
    units: 'kilometers',
    properties: {
      featureType: 'buffer_zone',
      name: `Vùng khảo sát bán kính ${radiusKm} km`,
      radiusKm: Number(radiusKm),
      centerLat: Number(centerLat),
      centerLng: Number(centerLng)
    }
  });
  const areaSqMeters = turfLib.area(polygon);
  polygon.properties.areaKm2 = Math.round((areaSqMeters / 1e6) * 100) / 100;
  return polygon;
}

export function buildConcentricRings(turfLib, centerLat, centerLng, radiusKm = 2) {
  const stepKm = radiusKm <= 2 ? 0.5 : radiusKm <= 5 ? 1 : 2;
  const rings = [];
  for (let r = stepKm; r < radiusKm - 0.001; r = Math.round((r + stepKm) * 100) / 100) {
    rings.push({
      radiusKm: r,
      polygon: turfLib.circle([Number(centerLng), Number(centerLat)], r, {
        steps: 96,
        units: 'kilometers'
      })
    });
  }
  return rings;
}

export const SEVERITY_LABELS = {
  severe: 'Rủi ro cao',
  moderate: 'Đáng chú ý',
  minor: 'Cục bộ',
  safe: 'Điểm an toàn / Hỗ trợ'
};

export const CATEGORY_LABELS = {
  flood: 'Ngập úng mưa lớn',
  heat: 'Nắng gắt / Thiếu bóng mát',
  traffic: 'Đường xấu / Cống nguy hiểm',
  shelter: 'Điểm tránh trú / Mảng xanh',
  medical: 'Bệnh viện / Trạm Y tế'
};

export function normalizePointRecord(pt, idx = 0) {
  const category = pt.category || (pt.layerGroup === 'safe' ? 'shelter' : 'flood');
  const layerGroup = pt.layerGroup || (['shelter', 'medical'].includes(category) ? 'safe' : 'risk');
  const confirmCount = Math.max(1, Number(pt.confirmCount) || 1);
  let confidenceTier = pt.confidenceTier || 'C';
  if (confidenceTier === 'C' && confirmCount >= 3) {
    confidenceTier = 'B';
  }
  const waterScale = pt.waterScale || (layerGroup === 'safe' ? 'none' : 'half_wheel');
  const scaleMeta = WATER_LEVEL_SCALES[waterScale] || WATER_LEVEL_SCALES.half_wheel;
  const severity =
    layerGroup === 'safe'
      ? 'safe'
      : pt.severity || (scaleMeta.rank >= 4 ? 'severe' : scaleMeta.rank >= 2 ? 'moderate' : 'minor');

  return {
    ...pt,
    id: pt.id || `CD-${idx + 1}`,
    layerGroup,
    category,
    severity,
    waterScale,
    waterScaleLabel: scaleMeta.label,
    confirmCount,
    confidenceTier,
    confidenceLabel: CONFIDENCE_TIERS[confidenceTier]?.shortLabel || confidenceTier,
    hazardFlags: Array.isArray(pt.hazardFlags) ? pt.hazardFlags : [],
    sourceType: pt.sourceType || 'Người dân báo trên Web',
    sourceCitation: pt.sourceCitation || 'Khảo sát cộng đồng trực tuyến',
    observedDate: pt.observedDate || ''
  };
}

export function analyzeSurveyPoints(turfLib, rawPoints, centerLat, centerLng, radiusKm = 2) {
  const bufferPoly = buildGeodesicBuffer(turfLib, centerLat, centerLng, radiusKm, 128);
  const centerPt = turfLib.point([Number(centerLng), Number(centerLat)]);

  const enriched = rawPoints.map((raw, idx) => {
    const pt = normalizePointRecord(raw, idx);
    const geoPt = turfLib.point([Number(pt.lng), Number(pt.lat)]);
    const distanceMeters = Math.round(turfLib.distance(centerPt, geoPt, { units: 'meters' }));
    const rawBearing = turfLib.bearing(centerPt, geoPt);
    const bearingInfo = formatBearingVN(rawBearing);
    const inPoly = turfLib.booleanPointInPolygon(geoPt, bufferPoly) || distanceMeters <= radiusKm * 1000;
    const utm = latLngToUTM(Number(pt.lat), Number(pt.lng), 48);

    return {
      ...pt,
      distanceMeters,
      bearingDeg: bearingInfo.degrees,
      bearingDir: bearingInfo.direction,
      bearingLabel: bearingInfo.label,
      insideBuffer: inPoly,
      utm
    };
  });

  const insidePoints = enriched.filter((p) => p.insideBuffer);
  const riskInside = insidePoints.filter((p) => p.layerGroup === 'risk');
  const safeInside = insidePoints.filter((p) => p.layerGroup === 'safe');
  const tierABInside = insidePoints.filter((p) => p.confidenceTier === 'A' || p.confidenceTier === 'B');
  const tierCInside = insidePoints.filter((p) => p.confidenceTier === 'C');
  const totalConfirmations = enriched.reduce((sum, p) => sum + (Number(p.confirmCount) || 1), 0);

  return {
    bufferPolygon: bufferPoly,
    areaKm2: bufferPoly.properties.areaKm2,
    points: enriched,
    stats: {
      total: enriched.length,
      inside: insidePoints.length,
      outside: enriched.length - insidePoints.length,
      riskInside: riskInside.length,
      safeInside: safeInside.length,
      floodInside: riskInside.filter((p) => p.category === 'flood').length,
      heatInside: riskInside.filter((p) => p.category === 'heat').length,
      verifiedABInside: tierABInside.length,
      communityPendingC: tierCInside.length,
      totalConfirmations
    }
  };
}

export const analyzeFloodPoints = analyzeSurveyPoints;

export function findNearestSafePoint(turfLib, fromLat, fromLng, allPoints) {
  const verifiedSafe = allPoints.filter(
    (p) =>
      (p.layerGroup || (['shelter', 'medical'].includes(p.category) ? 'safe' : 'risk')) === 'safe' &&
      p.confidenceTier !== 'C'
  );
  // Ưu tiên cơ sở y tế và công trình có mái che kiên cố (tránh điều hướng ra hồ/công viên ngoài trời khi mưa dông)
  const coveredSafe = verifiedSafe.filter((p) => !p.outdoorOnly);
  const safePts = coveredSafe.length > 0 ? coveredSafe : verifiedSafe;
  if (safePts.length === 0) return null;

  const origin = turfLib.point([Number(fromLng), Number(fromLat)]);
  let best = null;
  let minDist = Infinity;

  for (const sp of safePts) {
    const target = turfLib.point([Number(sp.lng), Number(sp.lat)]);
    const d = Math.round(turfLib.distance(origin, target, { units: 'meters' }));
    if (d < minDist) {
      minDist = d;
      const bearing = formatBearingVN(turfLib.bearing(origin, target));
      best = {
        point: sp,
        distanceMeters: d,
        walkingMinutes: Math.max(1, Math.round(d / 75)),
        bearingLabel: bearing.label
      };
    }
  }
  return best;
}

/**
 * Tự động kiểm tra xem điểm người dân vừa chấm có nằm trong bán kính 50m của điểm cùng loại đã có không
 */
export function findNearbyDuplicatePoint(turfLib, points, lat, lng, category, thresholdMeters = 50) {
  const candidate = turfLib.point([Number(lng), Number(lat)]);
  for (const p of points) {
    if (p.status === 'hidden') continue;
    if (category && p.category !== category) continue;
    const d = turfLib.distance(candidate, turfLib.point([Number(p.lng), Number(p.lat)]), { units: 'meters' });
    if (d <= thresholdMeters) return p;
  }
  return null;
}

/**
 * Quét toàn bộ cơ sở dữ liệu tìm các cặp điểm nằm gần nhau ≤ thresholdMeters để hỗ trợ Quản trị viên gộp phiếu
 */
export function findDuplicatePairs(turfLib, points, thresholdMeters = 50) {
  const active = points.filter((p) => p.status !== 'hidden');
  const pairs = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const distM = Math.round(
        turfLib.distance([Number(a.lng), Number(a.lat)], [Number(b.lng), Number(b.lat)], { units: 'meters' })
      );
      if (distM <= thresholdMeters) {
        pairs.push({ primary: a, secondary: b, distanceMeters: distM, sameCategory: a.category === b.category });
      }
    }
  }
  return pairs.sort((x, y) => x.distanceMeters - y.distanceMeters);
}

/**
 * Kiểm toán chất lượng dữ liệu GIS (Data QA) dành cho Trung tâm Quản trị
 */
export function auditPointsQuality(turfLib, points, centerLat, centerLng, radiusKm = 2) {
  const center = [Number(centerLng), Number(centerLat)];
  const issues = [];
  let validCount = 0;

  for (const p of points) {
    if (p.status === 'hidden') continue;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const ptIssues = [];

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      ptIssues.push('Tọa độ WGS84 không hợp lệ');
    } else {
      const d = Math.round(turfLib.distance(center, [lng, lat], { units: 'meters' }));
      if (d > radiusKm * 1000) {
        ptIssues.push(`Nằm ngoài vùng ${radiusKm}km (cách ${d}m)`);
      }
    }
    if (!p.sourceCitation || String(p.sourceCitation).trim().length < 8) {
      ptIssues.push('Thiếu trích dẫn nguồn kiểm chứng chi tiết');
    }
    if (p.elevationM === null || p.elevationM === undefined || p.elevationM === '') {
      ptIssues.push('Chưa có cao độ DEM GLO-30');
    }
    if (p.depthCm !== undefined || p.tempC !== undefined) {
      ptIssues.push('Chứa trường số đo cm/nhiệt độ chưa qua kiểm chứng');
    }

    if (ptIssues.length > 0) {
      issues.push({ id: p.id, name: p.name, confidenceTier: p.confidenceTier, problems: ptIssues });
    } else {
      validCount++;
    }
  }

  return {
    checkedCount: points.filter((p) => p.status !== 'hidden').length,
    cleanCount: validCount,
    issueCount: issues.length,
    issues
  };
}

/**
 * Phân tích hành lang lộ trình di chuyển giữa Điểm đi và Điểm đến để cảnh báo các điểm ngập / xoáy cống / nắng gắt nằm dọc đường
 */
export function analyzeRouteCorridor(turfLib, origin, destination, rawPoints, corridorMeters = 165) {
  const startCoord = [Number(origin.lng), Number(origin.lat)];
  const endCoord = [Number(destination.lng), Number(destination.lat)];
  const directDistanceMeters = Math.round(turfLib.distance(startCoord, endCoord, { units: 'meters' }));

  const line =
    directDistanceMeters < 15
      ? turfLib.lineString([startCoord, [endCoord[0] + 0.0001, endCoord[1] + 0.0001]])
      : turfLib.lineString([startCoord, endCoord]);

  const normalized = rawPoints.filter((p) => p.status !== 'hidden').map((p, idx) => normalizePointRecord(p, idx));
  const nearbyRisks = [];
  const nearbySafe = [];

  for (const pt of normalized) {
    const gPt = turfLib.point([Number(pt.lng), Number(pt.lat)]);
    const distToLineM = Math.round(turfLib.pointToLineDistance(gPt, line, { units: 'meters' }));
    if (pt.layerGroup === 'risk' && distToLineM <= corridorMeters) {
      nearbyRisks.push({ ...pt, distToCorridorM: distToLineM });
    } else if (pt.layerGroup === 'safe' && !pt.outdoorOnly && pt.confidenceTier !== 'C' && distToLineM <= Math.max(380, corridorMeters * 2)) {
      nearbySafe.push({ ...pt, distToCorridorM: distToLineM });
    }
  }

  nearbyRisks.sort((a, b) => a.distToCorridorM - b.distToCorridorM);
  nearbySafe.sort((a, b) => a.distToCorridorM - b.distToCorridorM);

  const hasVortexOrSevere = nearbyRisks.some(
    (r) => r.severity === 'severe' || (r.hazardFlags || []).includes('open_drain_vortex')
  );
  const status = hasVortexOrSevere ? 'danger' : nearbyRisks.length > 0 ? 'caution' : 'clear';

  // Đề xuất lộ trình vòng qua nền cao (18 Phố Viên 17m -> BV Phương Đông 11m -> Cổ Nhuế cao 14m) nếu đi cắt qua vùng nguy hiểm
  const highGroundWaypoints = hasVortexOrSevere
    ? [
        [origin.lat, origin.lng],
        [21.072514, 105.77387],
        [21.070783, 105.777269],
        [destination.lat, destination.lng]
      ]
    : [
        [origin.lat, origin.lng],
        [destination.lat, destination.lng]
      ];

  return {
    directDistanceMeters,
    estWalkMinutes: Math.max(1, Math.round(directDistanceMeters / 75)),
    estBikeMinutes: Math.max(1, Math.round(directDistanceMeters / 320)),
    status,
    nearbyRisks,
    nearbySafe: nearbySafe.slice(0, 3),
    corridorCoords: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng]
    ],
    recommendedHighGroundCoords: highGroundWaypoints
  };
}

/**
 * Phân tích hành lang dọc theo tuyến đường bộ thực tế (từ OSRM GeoJSON coordinates [[lng,lat], ...])
 */
export function analyzePolylineCorridor(turfLib, coordsLngLat, rawPoints, corridorMeters = 125) {
  if (!Array.isArray(coordsLngLat) || coordsLngLat.length < 2) return null;
  const line = turfLib.lineString(coordsLngLat);
  const lengthMeters = Math.round(turfLib.length(line, { units: 'kilometers' }) * 1000);

  const normalized = rawPoints.filter((p) => p.status !== 'hidden').map((p, idx) => normalizePointRecord(p, idx));
  const nearbyRisks = [];
  const nearbySafe = [];

  for (const pt of normalized) {
    const gPt = turfLib.point([Number(pt.lng), Number(pt.lat)]);
    const distToLineM = Math.round(turfLib.pointToLineDistance(gPt, line, { units: 'meters' }));
    if (pt.layerGroup === 'risk' && distToLineM <= corridorMeters) {
      nearbyRisks.push({ ...pt, distToCorridorM: distToLineM });
    } else if (pt.layerGroup === 'safe' && !pt.outdoorOnly && pt.confidenceTier !== 'C' && distToLineM <= 320) {
      nearbySafe.push({ ...pt, distToCorridorM: distToLineM });
    }
  }

  nearbyRisks.sort((a, b) => a.distToCorridorM - b.distToCorridorM);
  nearbySafe.sort((a, b) => a.distToCorridorM - b.distToCorridorM);

  const hasVortexOrSevere = nearbyRisks.some(
    (r) => r.severity === 'severe' || (r.hazardFlags || []).includes('open_drain_vortex')
  );
  const status = hasVortexOrSevere ? 'danger' : nearbyRisks.length > 0 ? 'caution' : 'clear';

  return {
    distanceMeters: lengthMeters,
    estWalkMinutes: Math.max(1, Math.round(lengthMeters / 75)),
    estBikeMinutes: Math.max(1, Math.round(lengthMeters / 300)),
    status,
    nearbyRisks,
    nearbySafe: nearbySafe.slice(0, 3),
    latLngPath: coordsLngLat.map(([lng, lat]) => [lat, lng])
  };
}

/**
 * Nội suy tọa độ & ước tính sơ bộ cao độ IDW dọc lát cắt địa hình (dùng ngay lập tức và nâng cấp bằng API Copernicus DEM)
 */
export function buildTransectSamples(turfLib, startPt, endPt, sampleCount = 12, knownPoints = []) {
  const from = [Number(startPt.lng), Number(startPt.lat)];
  const to = [Number(endPt.lng), Number(endPt.lat)];
  const totalDistM = Math.round(turfLib.distance(from, to, { units: 'meters' }));
  const line = turfLib.lineString([from, to]);
  const totalKm = Math.max(0.01, totalDistM / 1000);

  const ptsWithDem = knownPoints.filter((p) => Number.isFinite(Number(p.elevationM)));
  const samples = [];

  for (let i = 0; i < sampleCount; i++) {
    const frac = sampleCount === 1 ? 0 : i / (sampleCount - 1);
    const alongPt = turfLib.along(line, totalKm * frac, { units: 'kilometers' });
    const [lng, lat] = alongPt.geometry.coordinates;

    // Nội suy nghịch đảo khoảng cách (IDW) từ 32 điểm thực tế đã biết DEM làm giá trị dự phòng tức thì khi mất mạng
    let num = 0;
    let den = 0;
    for (const kp of ptsWithDem) {
      const d = Math.max(25, turfLib.distance([lng, lat], [Number(kp.lng), Number(kp.lat)], { units: 'meters' }));
      const w = 1 / (d * d);
      num += w * Number(kp.elevationM);
      den += w;
    }
    const fallbackDem = den > 0 ? Math.round((num / den) * 10) / 10 : 12;

    samples.push({
      index: i,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      distanceM: Math.round(totalDistM * frac),
      elevationM: fallbackDem
    });
  }

  return summarizeTransectProfile(samples, totalDistM);
}

export function summarizeTransectProfile(samples, totalDistM) {
  const elevs = samples.map((s) => Number(s.elevationM) || 0);
  const minElevM = Math.min(...elevs);
  const maxElevM = Math.max(...elevs);
  const lowCount = elevs.filter((e) => e <= 12).length;
  return {
    totalDistM,
    minElevM: Math.round(minElevM * 10) / 10,
    maxElevM: Math.round(maxElevM * 10) / 10,
    reliefM: Math.round((maxElevM - minElevM) * 10) / 10,
    lowBasinPct: Math.round((lowCount / Math.max(1, samples.length)) * 100),
    samples
  };
}

/**
 * Phân tầng điểm kích hoạt theo Kịch bản Thời tiết Cực đoan (dựa trên cao độ DEM GLO-30 & lịch sử sự kiện xác thực)
 */
export function evaluateWeatherScenario(rawPoints, scenarioKey = 'normal') {
  const visible = rawPoints.filter((p) => p.status !== 'hidden');
  if (scenarioKey === 'normal') {
    return {
      scenarioKey,
      highlightedIds: new Set(),
      dimNonMatching: false,
      activeRiskCount: visible.filter((p) => p.layerGroup === 'risk').length,
      recommendedSafeCount: visible.filter((p) => p.layerGroup === 'safe').length
    };
  }

  const highlighted = new Set();
  let activeRiskCount = 0;
  let recommendedSafeCount = 0;

  for (const p of visible) {
    const dem = Number(p.elevationM) || 12;
    const isFlood = p.category === 'flood' || p.category === 'traffic';
    const isHeat = p.category === 'heat' || (p.hazardFlags || []).includes('lack_shade_heat');

    if (scenarioKey === 'rain_30') {
      if (p.layerGroup === 'risk' && isFlood && dem <= 11) {
        highlighted.add(p.id);
        activeRiskCount++;
      } else if (p.layerGroup === 'safe' && !p.outdoorOnly) {
        highlighted.add(p.id);
        recommendedSafeCount++;
      }
    } else if (scenarioKey === 'rain_70') {
      if (p.layerGroup === 'risk' && isFlood && (p.severity === 'severe' || dem <= 12)) {
        highlighted.add(p.id);
        activeRiskCount++;
      } else if (p.layerGroup === 'safe' && !p.outdoorOnly) {
        highlighted.add(p.id);
        recommendedSafeCount++;
      }
    } else if (scenarioKey === 'rain_120') {
      if (p.layerGroup === 'risk' && isFlood) {
        highlighted.add(p.id);
        activeRiskCount++;
      } else if (p.layerGroup === 'safe' && !p.outdoorOnly && dem >= 11) {
        highlighted.add(p.id);
        recommendedSafeCount++;
      }
    } else if (scenarioKey === 'heat_uhi') {
      if (p.layerGroup === 'risk' && (isHeat || (p.hazardFlags || []).includes('elec_leak_risk'))) {
        highlighted.add(p.id);
        activeRiskCount++;
      } else if (p.layerGroup === 'safe') {
        highlighted.add(p.id);
        recommendedSafeCount++;
      }
    }
  }

  return {
    scenarioKey,
    highlightedIds: highlighted,
    dimNonMatching: true,
    activeRiskCount,
    recommendedSafeCount
  };
}

/**
 * Máy tính thống kê hiệu quả Truyền thông Trước – Sau (Pre-test vs Post-test) cho Chương 5 Báo cáo
 */
export function computePrePostEvaluation({ nPre, nPost, preCorrectPct, postCorrectPct, preConfAvg, postConfAvg }) {
  const n1 = Math.max(1, Number(nPre) || 50);
  const n2 = Math.max(1, Number(nPost) || 40);
  const c1 = Math.min(100, Math.max(0, Number(preCorrectPct) || 0));
  const c2 = Math.min(100, Math.max(0, Number(postCorrectPct) || 0));
  const f1 = Math.min(5, Math.max(1, Number(preConfAvg) || 1));
  const f2 = Math.min(5, Math.max(1, Number(postConfAvg) || 1));

  const deltaCorrectPts = Math.round((c2 - c1) * 10) / 10;
  const deltaConfPts = Math.round((f2 - f1) * 100) / 100;
  const passKnowledge = deltaCorrectPts >= 30;
  const passConfidence = deltaConfPts >= 1.0;

  const reportParagraph = `Đối chiếu kết quả khảo sát đầu vào (Pre-test, n = ${n1}) và khảo sát đánh giá đầu ra sau chiến dịch (Post-test, n = ${n2}) ghi nhận sự chuyển biến rõ rệt: tỷ lệ trả lời đúng quy trình sơ cứu sốc nhiệt chuẩn Bộ Y tế tăng từ ${c1}% lên ${c2}% (tăng +${deltaCorrectPts} điểm phần trăm — ${passKnowledge ? 'ĐẠT và vượt' : 'tiệm cận'} chỉ tiêu ≥ 30%). Đồng thời, điểm tự tin trung bình của người học trong tra cứu điểm tránh trú và xử lý tình huống mưa ngập tăng từ ${f1.toFixed(2)}/5 lên ${f2.toFixed(2)}/5 (tăng +${deltaConfPts.toFixed(2)} điểm — ${passConfidence ? 'ĐẠT' : 'chưa đạt'} ngưỡng mục tiêu ≥ +1,0 điểm).`;

  return {
    nPre: n1,
    nPost: n2,
    preCorrectPct: c1,
    postCorrectPct: c2,
    deltaCorrectPts,
    preConfAvg: f1,
    postConfAvg: f2,
    deltaConfPts,
    passKnowledge,
    passConfidence,
    reportParagraph
  };
}

export function exportToGeoJSON(analysisResult, centerMeta, onlyInside = false) {
  const features = [];
  const centerUtm = latLngToUTM(centerMeta.lat, centerMeta.lng, 48);

  features.push(analysisResult.bufferPolygon);
  features.push({
    type: 'Feature',
    properties: {
      featureType: 'buffer_center',
      name: centerMeta.label,
      radiusKm: centerMeta.radiusKm,
      utmZone: `${centerUtm.zone}${centerUtm.hemisphere}`,
      utmEasting: centerUtm.easting,
      utmNorthing: centerUtm.northing
    },
    geometry: {
      type: 'Point',
      coordinates: [Number(centerMeta.lng), Number(centerMeta.lat)]
    }
  });

  const targetPoints = onlyInside ? analysisResult.points.filter((p) => p.insideBuffer) : analysisResult.points;

  for (const p of targetPoints) {
    features.push({
      type: 'Feature',
      properties: {
        featureType: p.layerGroup === 'safe' ? 'safe_point' : 'risk_point',
        id: p.id,
        layerGroup: p.layerGroup,
        category: p.category,
        categoryLabel: CATEGORY_LABELS[p.category] || p.category,
        name: p.name,
        confidenceTier: p.confidenceTier,
        confirmCount: p.confirmCount,
        waterScale: p.waterScale,
        waterScaleLabel: p.waterScaleLabel,
        hazardFlags: (p.hazardFlags || []).map((f) => HAZARD_FLAGS_META[f] || f).join('; '),
        frequency: p.frequency || '',
        drainDuration: p.drainDuration || '',
        elevationDemM: p.elevationM ?? null,
        sourceType: p.sourceType,
        sourceCitation: p.sourceCitation,
        observedDate: p.observedDate,
        distanceToHUMGMeters: p.distanceMeters,
        bearingFromHUMG: p.bearingLabel,
        insideBuffer: p.insideBuffer,
        utmEasting: p.utm.easting,
        utmNorthing: p.utm.northing,
        notes: p.notes || ''
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(p.lng), Number(p.lat)]
      }
    });
  }

  return {
    type: 'FeatureCollection',
    name: `HUMG_PhuongDongNgac_CommunityMap_${centerMeta.radiusKm}km`,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
    },
    features
  };
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToKML(analysisResult, centerMeta, onlyInside = false) {
  const pts = onlyInside ? analysisResult.points.filter((p) => p.insideBuffer) : analysisResult.points;
  const riskPts = pts.filter((p) => p.layerGroup === 'risk');
  const safePts = pts.filter((p) => p.layerGroup === 'safe');

  const ringCoords = (analysisResult.bufferPolygon.geometry.coordinates[0] || [])
    .map(([lng, lat]) => `${lng},${lat},0`)
    .join(' ');

  const renderPlacemark = (p) => {
    const styleId =
      p.layerGroup === 'safe'
        ? p.category === 'medical'
          ? '#style-safe-medical'
          : '#style-safe-shelter'
        : p.severity === 'severe'
          ? '#style-risk-severe'
          : '#style-risk-moderate';

    const desc = [
      `Độ tin cậy: Hạng ${p.confidenceTier} (${p.confirmCount} xác nhận)`,
      `Nguồn dữ liệu: ${p.sourceCitation}`,
      p.observedDate ? `Mốc ghi nhận: ${p.observedDate}` : '',
      p.layerGroup === 'risk' ? `Mức ghi nhận: ${p.waterScaleLabel}` : `Hoạt động: ${p.frequency || ''}`,
      `Khoảng cách tới ĐH Mỏ - Địa chất: ${p.distanceMeters} m (${p.bearingLabel})`,
      p.notes ? `Thông tin thực tế: ${p.notes}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    return `      <Placemark>
        <name>${escapeXml(`[Hạng ${p.confidenceTier}] ${p.name}`)}</name>
        <description>${escapeXml(desc)}</description>
        <styleUrl>${styleId}</styleUrl>
        <Point>
          <coordinates>${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)},0</coordinates>
        </Point>
      </Placemark>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(`Bản đồ Cộng đồng Mở P. Đông Ngạc - ĐH Mỏ (${centerMeta.radiusKm}km)`)}</name>
    <description>${escapeXml('Dữ liệu thực tế từ OpenStreetMap, báo chí chính thống, ERA5 và khảo sát cư dân khu vực ĐH Mỏ - Địa chất.')}</description>
    <Style id="style-risk-severe"><IconStyle><color>ff1c1cb9</color><scale>1.15</scale></IconStyle></Style>
    <Style id="style-risk-moderate"><IconStyle><color>ff0c41c2</color><scale>1.05</scale></IconStyle></Style>
    <Style id="style-safe-shelter"><IconStyle><color>ff6e760f</color><scale>1.1</scale></IconStyle></Style>
    <Style id="style-safe-medical"><IconStyle><color>ff3d8015</color><scale>1.15</scale></IconStyle></Style>
    <Style id="style-buffer">
      <LineStyle><color>ff6e760f</color><width>2.5</width></LineStyle>
      <PolyStyle><color>226e760f</color></PolyStyle>
    </Style>
    <Folder>
      <name>Lớp 1: Điểm Rủi ro Ngập úng &amp; Nắng nóng</name>
${riskPts.map(renderPlacemark).join('\n')}
    </Folder>
    <Folder>
      <name>Lớp 2: Điểm An toàn, Y tế &amp; Ranh giới ${centerMeta.radiusKm}km</name>
      <Placemark>
        <name>${escapeXml(centerMeta.label)}</name>
        <styleUrl>#style-safe-shelter</styleUrl>
        <Point><coordinates>${Number(centerMeta.lng).toFixed(6)},${Number(centerMeta.lat).toFixed(6)},0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>${escapeXml(`Ranh giới khảo sát ${centerMeta.radiusKm} km`)}</name>
        <styleUrl>#style-buffer</styleUrl>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>${ringCoords}</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
${safePts.map(renderPlacemark).join('\n')}
    </Folder>
  </Document>
</kml>`;
}

function escapeCsvCell(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(analysisResult, centerMeta, onlyInside = false) {
  const headers = [
    'Mã điểm',
    'Hạng tin cậy',
    'Số lượt xác nhận',
    'Lớp bản đồ',
    'Phân loại',
    'Tên vị trí thực tế',
    'Mức ngập / Đặc điểm quan sát',
    'Cảnh báo mối nguy đi kèm',
    'Tần suất ghi nhận',
    'Nguồn dữ liệu kiểm chứng',
    'Ngày sự kiện / Cập nhật',
    'Cao độ DEM GLO-30 (m)',
    'Khoảng cách tới ĐH Mỏ (m)',
    `Trong vùng ${centerMeta.radiusKm}km`,
    'Vĩ độ (WGS84)',
    'Kinh độ (WGS84)',
    'UTM 48N X (m)',
    'UTM 48N Y (m)',
    'Mô tả & Ghi chú cộng đồng'
  ];

  const rows = (onlyInside ? analysisResult.points.filter((p) => p.insideBuffer) : analysisResult.points).map(
    (p) => [
      p.id,
      `Hạng ${p.confidenceTier}`,
      p.confirmCount,
      p.layerGroup === 'safe' ? 'Lớp An toàn' : 'Lớp Rủi ro',
      CATEGORY_LABELS[p.category] || p.category,
      p.name,
      p.waterScaleLabel,
      (p.hazardFlags || []).map((f) => HAZARD_FLAGS_META[f] || f).join('; '),
      p.frequency || '',
      p.sourceCitation || '',
      p.observedDate || '',
      p.elevationM ?? '',
      p.distanceMeters,
      p.insideBuffer ? 'Trong vùng' : 'Ngoài vùng',
      Number(p.lat).toFixed(6),
      Number(p.lng).toFixed(6),
      p.utm.easting,
      p.utm.northing,
      p.notes || ''
    ]
  );

  const lines = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))];
  return '\uFEFF' + lines.join('\r\n');
}

export function parseImportedPoints(rawText, fileName = '') {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  const isJson = fileName.toLowerCase().endsWith('.geojson') || fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('{');

  if (isJson) {
    const parsed = JSON.parse(trimmed);
    const features = parsed.type === 'FeatureCollection' ? parsed.features : parsed.type === 'Feature' ? [parsed] : [];
    const imported = [];
    for (const f of features) {
      if (!f || !f.geometry || f.geometry.type !== 'Point') continue;
      const props = f.properties || {};
      if (props.featureType === 'buffer_center') continue;
      const [lng, lat] = f.geometry.coordinates || [];
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) continue;
      const layerGroup = props.layerGroup === 'safe' || props.featureType === 'safe_point' ? 'safe' : 'risk';
      imported.push(
        normalizePointRecord(
          {
            id: props.id || `IMP-${Date.now()}-${imported.length + 1}`,
            layerGroup,
            category: props.category || (layerGroup === 'safe' ? 'shelter' : 'flood'),
            name: String(props.name || props.title || `Điểm nhập #${imported.length + 1}`),
            lat: Number(lat),
            lng: Number(lng),
            waterScale: props.waterScale || (layerGroup === 'safe' ? 'none' : 'half_wheel'),
            confidenceTier: props.confidenceTier || 'C',
            confirmCount: Number(props.confirmCount) || 1,
            sourceCitation: props.sourceCitation || 'Nhập từ tệp GeoJSON',
            observedDate: props.observedDate || '',
            elevationM: props.elevationDemM ?? props.elevationM ?? null,
            notes: String(props.notes || '')
          },
          imported.length
        )
      );
    }
    return imported;
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitCsvLine = (line) => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const findCol = (patterns) => headers.findIndex((h) => patterns.some((p) => h.includes(p)));

  const latIdx = findCol(['vĩ độ', 'lat']);
  const lngIdx = findCol(['kinh độ', 'lng', 'lon']);
  const nameIdx = findCol(['tên', 'vị trí', 'name']);
  const layerIdx = findCol(['lớp', 'layer']);
  const tierIdx = findCol(['hạng', 'tin cậy', 'tier']);
  const confirmIdx = findCol(['xác nhận', 'confirm']);
  const srcIdx = findCol(['nguồn', 'source']);
  const noteIdx = findCol(['mô tả', 'ghi chú', 'note']);

  if (latIdx === -1 || lngIdx === -1) {
    throw new Error('Không tìm thấy cột Vĩ độ và Kinh độ trong tệp CSV.');
  }

  const imported = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const lat = Number(cols[latIdx]);
    const lng = Number(cols[lngIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const isSafe = layerIdx >= 0 && cols[layerIdx].toLowerCase().includes('an toàn');
    const rawTier = tierIdx >= 0 ? cols[tierIdx].replace('Hạng ', '').trim() : 'C';
    imported.push(
      normalizePointRecord(
        {
          id: `CSV-${Date.now()}-${r}`,
          layerGroup: isSafe ? 'safe' : 'risk',
          category: isSafe ? 'shelter' : 'flood',
          name: (nameIdx >= 0 && cols[nameIdx]) || `Điểm khảo sát #${r}`,
          lat,
          lng,
          waterScale: isSafe ? 'none' : 'half_wheel',
          confidenceTier: ['A', 'B', 'C'].includes(rawTier) ? rawTier : 'C',
          confirmCount: confirmIdx >= 0 ? Number(cols[confirmIdx]) || 1 : 1,
          sourceCitation: (srcIdx >= 0 && cols[srcIdx]) || 'Nhập từ CSV khảo sát',
          notes: (noteIdx >= 0 && cols[noteIdx]) || ''
        },
        r
      )
    );
  }
  return imported;
}

/**
 * Chẩn đoán Thủy văn & Độ nhạy cảm Ngập cục bộ (0–100) tại bất kỳ tọa độ nào trên bản đồ
 * Kết hợp thực chứng: (1) Độ trũng địa hình Copernicus DEM GLO-30 so với ngưỡng 13,8m,
 * (2) Khoảng cách tới 18 hành lang ngõ/phố ngập OSM, (3) Khoảng cách tới 45 điểm rủi ro xác thực.
 */
export function computeHydrologicalSpotRisk(turfLib, lat, lng, demM, floodCorridors = [], points = []) {
  const ptGeo = turfLib.point([Number(lng), Number(lat)]);
  const dem = demM !== null && demM !== undefined && Number.isFinite(Number(demM)) ? Math.round(Number(demM) * 10) / 10 : null;
  const diffVsHumgM = dem !== null ? Math.round((dem - 17.0) * 10) / 10 : null;

  let nearestCorridor = null;
  let corridorDistM = Infinity;
  for (const fc of floodCorridors) {
    if (!Array.isArray(fc.coordinates) || fc.coordinates.length < 2) continue;
    const d = Math.round(turfLib.pointToLineDistance(ptGeo, turfLib.lineString(fc.coordinates), { units: 'meters' }));
    if (d < corridorDistM) {
      corridorDistM = d;
      nearestCorridor = fc;
    }
  }

  let nearestFloodPoint = null;
  let floodPointDistM = Infinity;
  for (const p of points) {
    if (p.status === 'hidden' || (p.category !== 'flood' && p.category !== 'traffic')) continue;
    const d = Math.round(turfLib.distance(ptGeo, turfLib.point([Number(p.lng), Number(p.lat)]), { units: 'meters' }));
    if (d < floodPointDistM) {
      floodPointDistM = d;
      nearestFloodPoint = p;
    }
  }

  const nearestSafe = findNearestSafePoint(turfLib, lat, lng, points);

  const demScore = dem === null ? 18 : Math.max(0, Math.min(54, (13.8 - dem) * 13.5));
  const corridorScore =
    nearestCorridor && corridorDistM <= 185
      ? (1 - corridorDistM / 185) * (nearestCorridor.severity === 'severe' ? 28 : 20)
      : 0;
  const pointScore =
    nearestFloodPoint && floodPointDistM <= 230
      ? (1 - floodPointDistM / 230) * 20
      : 0;

  const score = Math.min(98, Math.max(4, Math.round(demScore + corridorScore + pointScore)));

  let level = 'low';
  let levelLabel = 'THẤP — Dải nền cao thoát nước tốt';
  let colorHex = '#15803d';
  let bgHex = '#f0fdf4';
  if (score >= 70) {
    level = 'very_high';
    levelLabel = 'RẤT CAO — Lòng máng trũng / Sát rốn ngập';
    colorHex = '#b91c1c';
    bgHex = '#fef2f2';
  } else if (score >= 45) {
    level = 'high';
    levelLabel = 'KHÁ CAO — Dễ ngập cục bộ khi mưa ≥50mm';
    colorHex = '#c2410c';
    bgHex = '#fff7ed';
  } else if (score >= 25) {
    level = 'moderate';
    levelLabel = 'TRUNG BÌNH — Chú ý đọng nước cống ngõ';
    colorHex = '#b45309';
    bgHex = '#fffbeb';
  }

  return {
    lat: Number(Number(lat).toFixed(6)),
    lng: Number(Number(lng).toFixed(6)),
    dem,
    diffVsHumgM,
    score,
    level,
    levelLabel,
    colorHex,
    bgHex,
    nearestCorridor: nearestCorridor ? { id: nearestCorridor.id, name: nearestCorridor.name, rainThresholdMm: nearestCorridor.rainThresholdMm, distanceMeters: corridorDistM } : null,
    nearestFloodPoint: nearestFloodPoint ? { id: nearestFloodPoint.id, name: nearestFloodPoint.name, distanceMeters: floodPointDistM, waterScaleLabel: nearestFloodPoint.waterScaleLabel } : null,
    nearestSafe
  };
}
