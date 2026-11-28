/**
 * HYDRO-TERRAIN-AWARE MULTI-CANDIDATE ROUTE ENGINE
 * Kết hợp mô hình địa hình Copernicus DEM GLO-30, phương trình chảy tràn Manning,
 * tiêu chuẩn mất ổn định phương tiện D×V (Martínez-Gomariz et al., 2016)
 * và hành lang rủi ro thực địa để đề xuất đường vòng nền cao & vẽ mặt cắt dọc tuyến.
 */

import { sampleAnyDemGrid, computeTerrainGradient } from './hydro-surface.js';
import { computeHydrodynamicInstability } from '../ai/distress-inference.js';
import { haversineMeters } from '../../citizen-logic.js';

export const VEHICLE_HYDRO_PROFILES = Object.freeze({
  foot: {
    id: 'foot',
    label: 'Đi bộ',
    warnCm: 12,
    dangerCm: 28,
    dangerDv: 0.25,
    warnLabel: 'Ngập quá mắt cá — Cần đi đường vòng',
    dangerLabel: 'Ngập sâu nguy hiểm — Không lội bộ',
    osrmProfile: 'foot'
  },
  scooter: {
    id: 'scooter',
    label: 'Xe tay ga',
    warnCm: 12,
    dangerCm: 20,
    dangerDv: 0.14,
    warnLabel: 'Xe tay ga cổ hút thấp — Rất dễ chết máy',
    dangerLabel: 'Quá ngưỡng xe tay ga (≥20 cm) — Không đi qua',
    osrmProfile: 'driving'
  },
  motorbike: {
    id: 'motorbike',
    label: 'Xe số',
    warnCm: 18,
    dangerCm: 30,
    dangerDv: 0.18,
    warnLabel: 'Nên chạy số thấp & giữ ga đều nếu buộc phải qua',
    dangerLabel: 'Ngập sâu nguy hiểm (≥30 cm) — Không nên đi qua',
    osrmProfile: 'driving'
  },
  bike: {
    id: 'bike',
    label: 'Xe số',
    warnCm: 18,
    dangerCm: 30,
    dangerDv: 0.18,
    warnLabel: 'Nên chạy số thấp & giữ ga đều nếu buộc phải qua',
    dangerLabel: 'Ngập sâu nguy hiểm (≥30 cm) — Không nên đi qua',
    osrmProfile: 'driving'
  },
  sedan: {
    id: 'sedan',
    label: 'Ô tô con (Sedan)',
    warnCm: 15,
    dangerCm: 25,
    dangerDv: 0.22,
    warnLabel: 'Gầm thấp dễ tạt nước lọc gió — Cân nhắc tránh',
    dangerLabel: 'Nguy cơ thủy kích Sedan (≥25 cm) — Cấm đi qua',
    osrmProfile: 'driving'
  },
  suv: {
    id: 'suv',
    label: 'Gầm cao (SUV/Bán tải)',
    warnCm: 28,
    dangerCm: 45,
    dangerDv: 0.35,
    warnLabel: 'Nước chạm gầm — Đi chậm tránh tạo sóng',
    dangerLabel: 'Ngập cực sâu (≥45 cm) — Nguy hiểm kể cả gầm cao',
    osrmProfile: 'driving'
  }
});

export function resolveVehicleHydroProfile(mode = 'motorbike') {
  return VEHICLE_HYDRO_PROFILES[String(mode || '').toLowerCase()] || VEHICLE_HYDRO_PROFILES.motorbike;
}

function distToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng) {
  const ax = aLng;
  const ay = aLat;
  const bx = bLng;
  const by = bLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-12) return haversineMeters(lat, lng, aLat, aLng);
  const t = Math.max(0, Math.min(1, ((lng - ax) * dx + (lat - ay) * dy) / len2));
  return haversineMeters(lat, lng, ay + t * dy, ax + t * dx);
}

function minDistanceToCorridorsMeters(lat, lng, corridors = []) {
  let best = 9999;
  for (const cor of corridors) {
    const pts = cor?.coordinates || [];
    for (let i = 1; i < pts.length; i++) {
      const [lngA, latA] = pts[i - 1];
      const [lngB, latB] = pts[i];
      const d = distToSegmentMeters(lat, lng, latA, lngA, latB, lngB);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Quét địa hình ngang trục xuất phát → đích để tìm tối đa 3 điểm dẫn đường nền cao ít rủi ro ngập.
 */
export function selectHighGroundWaypoints(start, end, demGrid, riskPoints = [], corridors = [], liveFloodPointIds = null) {
  const sLat = Number(start?.lat);
  const sLng = Number(start?.lng);
  const eLat = Number(end?.lat);
  const eLng = Number(end?.lng);
  if (![sLat, sLng, eLat, eLng].every(Number.isFinite)) return [];

  const midLat = (sLat + eLat) / 2;
  const midLng = (sLng + eLng) / 2;
  const cosLat = Math.max(0.35, Math.cos((midLat * Math.PI) / 180));
  const vx = (eLng - sLng) * cosLat;
  const vy = eLat - sLat;
  const vLen = Math.hypot(vx, vy) || 0.005;
  // Vector pháp tuyến đơn vị vuông góc với trục đường đi
  const nxLat = -vx / vLen;
  const nxLng = vy / (vLen * cosLat);

  const baseDistM = Math.max(300, haversineMeters(sLat, sLng, eLat, eLng));
  const latOffsets = [0.0045, -0.0045, 0.0085, -0.0085, 0.013, -0.013, 0.018, -0.018];
  const alongFracs = [0.35, 0.5, 0.65];

  const floodRisks = (riskPoints || []).filter((p) => p.layerGroup === 'risk');
  const liveSet = liveFloodPointIds instanceof Set ? liveFloodPointIds : null;
  const candidates = [];

  for (const frac of alongFracs) {
    const anchorLat = sLat + (eLat - sLat) * frac;
    const anchorLng = sLng + (eLng - sLng) * frac;
    for (const off of latOffsets) {
      const cLat = Math.round((anchorLat + nxLat * off) * 1_000_000) / 1_000_000;
      const cLng = Math.round((anchorLng + nxLng * off) * 1_000_000) / 1_000_000;
      const elev = sampleAnyDemGrid(demGrid, cLat, cLng);
      const elevScore = elev !== null ? elev : demGrid?.stats?.p50M ?? 12;

      let minRiskDistM = 1200;
      let minLiveFloodDistM = 1200;
      for (const rp of floodRisks) {
        const d = haversineMeters(cLat, cLng, Number(rp.lat), Number(rp.lng));
        if (d < minRiskDistM) minRiskDistM = d;
        if (liveSet && liveSet.has(rp.id) && d < minLiveFloodDistM) {
          minLiveFloodDistM = d;
        }
      }
      const corDist = minDistanceToCorridorsMeters(cLat, cLng, corridors);
      const effectiveRiskDistM = Math.min(minRiskDistM, corDist);

      const viaDist = haversineMeters(sLat, sLng, cLat, cLng) + haversineMeters(cLat, cLng, eLat, eLng);
      const extraDetourM = Math.max(0, viaDist - baseDistM);
      const livePenalty = minLiveFloodDistM < 260 ? (260 - minLiveFloodDistM) * 0.18 : 0;
      const score = elevScore * 2.6 + Math.min(700, effectiveRiskDistM) * 0.025 - extraDetourM * 0.0022 - livePenalty;

      candidates.push({ lat: cLat, lng: cLng, elevM: Math.round(elevScore * 10) / 10, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of candidates) {
    if (picked.some((p) => haversineMeters(p.lat, p.lng, c.lat, c.lng) < 280)) continue;
    picked.push(c);
    if (picked.length >= 3) break;
  }
  return picked;
}

/**
 * Chấm điểm thủy-địa hình 28 trạm dọc theo đường đi (tọa độ GeoJSON [lng, lat])
 */
export function evaluateRouteHydroTerrain({
  coordsLngLat = [],
  demGrid = null,
  rainMm = 70,
  dischargeRatio = 1,
  riskPoints = [],
  corridors = [],
  travelMode = 'bike',
  liveFloodPointIds = null
}) {
  const veh = resolveVehicleHydroProfile(travelMode);
  const pts = Array.isArray(coordsLngLat) && coordsLngLat.length >= 2 ? coordsLngLat : [];
  if (pts.length < 2) {
    return {
      minElevM: 0,
      maxElevM: 0,
      maxSlopeDeg: 0,
      maxDepthCm: 0,
      maxDv: 0,
      floodedLengthM: 0,
      nearRiskCount: 0,
      nearRisks: [],
      passability: 'passable',
      passabilityLabel: `Thông thoáng cho ${veh.label} theo dữ liệu hiện có`,
      vehicleLabel: veh.label,
      vehicleClearanceCm: veh.dangerCm,
      compositeScore: 0,
      profile: []
    };
  }

  const cumulativeDistM = [0];
  for (let i = 1; i < pts.length; i++) {
    const seg = haversineMeters(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]);
    cumulativeDistM.push(cumulativeDistM[i - 1] + seg);
  }
  const totalDistM = Math.max(50, cumulativeDistM[cumulativeDistM.length - 1]);

  const sampleCount = 28;
  const stats = demGrid?.stats || { minM: 8, p50M: 12.5, p65M: 14 };
  const floodPts = (riskPoints || []).filter((p) => p.layerGroup === 'risk');
  const liveSet = liveFloodPointIds instanceof Set ? liveFloodPointIds : null;
  const rainVal = Math.max(0, Number(rainMm) || 0);
  const effectiveDailyRain = rainVal * Math.max(1, (Number(dischargeRatio || 1) - 1) * 0.45 + 1);
  const effectiveHourlyRain = rainVal * 0.36;

  const profile = [];
  let minElevM = Infinity;
  let maxElevM = -Infinity;
  let maxSlopeDeg = 0;
  let maxDepthM = 0;
  let maxDv = 0;
  let floodedSegments = 0;
  let liveFloodHits = 0;
  const matchedRiskMap = new Map();

  for (let s = 0; s < sampleCount; s++) {
    const targetD = (s / (sampleCount - 1)) * totalDistM;
    let idx = 0;
    while (idx < cumulativeDistM.length - 2 && cumulativeDistM[idx + 1] < targetD) idx++;
    const d0 = cumulativeDistM[idx];
    const d1 = cumulativeDistM[idx + 1];
    const frac = d1 > d0 ? Math.max(0, Math.min(1, (targetD - d0) / (d1 - d0))) : 0;
    const lng = pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * frac;
    const lat = pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * frac;

    const elevRaw = sampleAnyDemGrid(demGrid, lat, lng);
    const elevM = elevRaw !== null ? elevRaw : stats.p50M ?? 12;
    const grad = computeTerrainGradient(demGrid, lat, lng);
    const slopeDeg = grad?.slopeDeg ?? 1.1;

    let nearFloodSpotM = 999;
    let nearLiveFloodM = 999;
    for (const rp of floodPts) {
      const dist = haversineMeters(lat, lng, Number(rp.lat), Number(rp.lng));
      if (dist <= 130 && !matchedRiskMap.has(rp.id)) {
        matchedRiskMap.set(rp.id, rp);
      }
      if (rp.category === 'flood' && dist < nearFloodSpotM) {
        nearFloodSpotM = dist;
      }
      if (liveSet && liveSet.has(rp.id) && dist < nearLiveFloodM) {
        nearLiveFloodM = dist;
      }
    }
    const corDist = minDistanceToCorridorsMeters(lat, lng, corridors);
    const effectiveFloodProxM = Math.min(nearFloodSpotM, corDist);

    const hydro = computeHydrodynamicInstability({
      elevM,
      medianElevM: stats.p50M ?? 12.5,
      minElevM: stats.minM ?? 7.5,
      slopeDeg,
      rainMmPerHour: effectiveHourlyRain,
      dailyRainMm: effectiveDailyRain,
      nearFloodSpotMeters: effectiveFloodProxM
    });

    let effectiveDepthM = hydro.depthM;
    if (nearLiveFloodM <= 150) {
      effectiveDepthM = Math.max(effectiveDepthM, 0.28);
      liveFloodHits += 1;
    }

    if (elevM < minElevM) minElevM = elevM;
    if (elevM > maxElevM) maxElevM = elevM;
    if (slopeDeg > maxSlopeDeg) maxSlopeDeg = slopeDeg;
    if (effectiveDepthM > maxDepthM) maxDepthM = effectiveDepthM;
    if (hydro.dvProduct > maxDv) maxDv = hydro.dvProduct;
    if (effectiveDepthM >= 0.08 || (rainVal >= 30 && effectiveFloodProxM <= 85)) {
      floodedSegments++;
    }

    profile.push({
      distKm: Math.round((targetD / 1000) * 100) / 100,
      elevM: Math.round(elevM * 10) / 10,
      depthCm: Math.round(effectiveDepthM * 100),
      waterTopM: Math.round((elevM + effectiveDepthM) * 100) / 100
    });
  }

  const nearRisks = [...matchedRiskMap.values()];
  const floodedLengthM = Math.round((floodedSegments / sampleCount) * totalDistM);
  const maxDepthCm = Math.round(maxDepthM * 100);

  let passability = 'passable';
  let passabilityLabel = `Thông thoáng cho ${veh.label} theo kịch bản mưa`;
  if (maxDepthCm >= veh.dangerCm) {
    passability = 'impassable_deep';
    passabilityLabel = veh.dangerLabel;
  } else if (maxDv >= veh.dangerDv) {
    passability = 'impassable_deep';
    passabilityLabel = `Dòng chảy xiết (~${maxDepthCm} cm, lực đẩy nước mạnh) — Không nên đi qua`;
  } else if (
    maxDepthCm >= veh.warnCm ||
    maxDv >= veh.dangerDv * 0.6 ||
    floodedLengthM >= 140 ||
    nearRisks.length >= 2 ||
    liveFloodHits > 0
  ) {
    passability = 'caution_stall';
    passabilityLabel = liveFloodHits > 0 && maxDepthCm < veh.warnCm ? 'Đang có ngập thực tế quanh tuyến — Nên đi vòng' : veh.warnLabel;
  }

  const compositeScore = Math.round(
    nearRisks.length * 36 +
      liveFloodHits * 45 +
      floodedLengthM * 0.11 +
      maxDepthCm * 1.45 +
      maxDv * 110 +
      (maxSlopeDeg >= 16 ? 20 : 0)
  );

  return {
    minElevM: Number.isFinite(minElevM) ? Math.round(minElevM * 10) / 10 : 0,
    maxElevM: Number.isFinite(maxElevM) ? Math.round(maxElevM * 10) / 10 : 0,
    maxSlopeDeg: Math.round(maxSlopeDeg * 10) / 10,
    maxDepthCm,
    maxDv: Math.round(maxDv * 1000) / 1000,
    floodedLengthM,
    nearRiskCount: nearRisks.length,
    nearRisks,
    passability,
    passabilityLabel,
    vehicleLabel: veh.label,
    vehicleClearanceCm: veh.dangerCm,
    compositeScore,
    profile
  };
}

/**
 * Kết xuất SVG mặt cắt kép cao độ mặt đất & lớp nước đọng dọc tuyến (Tuyến chính vs Tuyến đề xuất)
 */
export function renderRouteHydroProfileSvg(directEval, detourEval) {
  const p1 = directEval?.profile || [];
  const p2 = detourEval?.profile || [];
  if (p1.length < 2) return '';

  const allVals = [
    ...p1.map((x) => x.elevM),
    ...p1.map((x) => x.waterTopM),
    ...p2.map((x) => x.elevM)
  ].filter(Number.isFinite);
  const minYVal = Math.min(...allVals);
  const maxYVal = Math.max(minYVal + 1.5, ...allVals);
  const span = maxYVal - minYVal;

  const W = 360;
  const H = 108;
  const padL = 12;
  const padR = 12;
  const padT = 12;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const mapY = (v) => padT + plotH - ((v - minYVal) / span) * plotH;
  const toLine = (arr, key) =>
    arr
      .map((pt, idx) => {
        const x = padL + (idx / Math.max(1, arr.length - 1)) * plotW;
        const y = mapY(pt[key]);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const directGroundPts = toLine(p1, 'elevM');
  const directWaterPts = toLine(p1, 'waterTopM');
  const reverseDirectGround = [...p1]
    .reverse()
    .map((pt, rIdx) => {
      const idx = p1.length - 1 - rIdx;
      const x = padL + (idx / Math.max(1, p1.length - 1)) * plotW;
      const y = mapY(pt.elevM);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const waterRibbon = `${directWaterPts} ${reverseDirectGround}`;
  const detourGroundPts = p2.length >= 2 ? toLine(p2, 'elevM') : '';

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:112px;display:block;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:8px;" role="img" aria-label="Biểu đồ mặt cắt cao độ và mực nước ước tính dọc tuyến đường">
      <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="#F1F5F9" />
      <line x1="${padL}" y1="${(padT + plotH * 0.5).toFixed(1)}" x2="${W - padR}" y2="${(padT + plotH * 0.5).toFixed(1)}" stroke="#E2E8F0" stroke-dasharray="3 3" />
      <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#94A3B8" />
      <polygon fill="rgba(14, 165, 233, 0.28)" points="${waterRibbon}" />
      <polyline fill="none" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="5 3" points="${directGroundPts}" />
      ${detourGroundPts ? `<polyline fill="none" stroke="#0F766E" stroke-width="2.3" points="${detourGroundPts}" />` : ''}
      <text x="${padL}" y="${H - 4}" font-size="8.5" fill="#64748B">Xuất phát (${minYVal.toFixed(1)}–${maxYVal.toFixed(1)} m)</text>
      <text x="${W - padR}" y="${H - 4}" font-size="8.5" fill="#64748B" text-anchor="end">Đích đến</text>
    </svg>
    <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:0.72rem;color:#475569;margin-top:5px;">
      <span><strong style="color:#DC2626;">---</strong> Nền tuyến thẳng (${directEval.minElevM}m thấp nhất)</span>
      <span><strong style="color:#0284C7;">■</strong> Lớp nước ngập tối đa ~${directEval.maxDepthCm} cm</span>
      ${directEval.vehicleClearanceCm ? `<span><strong>•</strong> Ngưỡng ${directEval.vehicleLabel || 'xe'}: &lt;${directEval.vehicleClearanceCm} cm</span>` : ''}
      ${p2.length >= 2 ? `<span><strong style="color:#0F766E;">—</strong> Nền tuyến đề xuất (${detourEval.minElevM}m thấp nhất)</span>` : ''}
    </div>`;
}
