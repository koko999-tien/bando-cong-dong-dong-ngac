/**
 * NATIONAL HYDRO-TERRAIN WATER INUNDATION, SLOPE GRADIENT & RUNOFF VECTOR ENGINE (v4)
 * Chuẩn trực quan hóa tổng hợp từ USGS Flood Inundation Mapper (FIM),
 * NOAA NWPS, Copernicus EFAS/GloFAS, Japan JMA Kikikuru & MLIT Hazard Map:
 *
 * 1. Lưới địa hình vệ tinh mật độ cao:
 *    - Vùng lõi Đông Ngạc (≤ 2 km): Lưới 25×25 = 625 điểm Copernicus GLO-30 (0 ms offline).
 *    - Toàn lãnh thổ Việt Nam (34 tỉnh/thành sau NQ 202/2025): Lưới động 14×14 = 196 điểm Copernicus GLO-30
 *      (2 truy vấn song song 98 điểm qua Open-Meteo Elevation API, lưu đệm RAM + sessionStorage).
 * 2. Giải tích Địa hình Vi phân (∇z = ∂z/∂x, ∂z/∂y):
 *    - Tính độ dốc thực tế (Slope Angle °) và hướng dốc tụ thủy (Downhill Aspect rad).
 *    - Kết xuất đồng thời: Mặt phủ ngập nước 3 tầng ở vùng trũng + Cảnh báo sườn dốc sạt lở (≥ 16°) ở vùng núi.
 * 3. Lớp Vector Mũi tên Hướng Dòng chảy Mặt (Downhill Runoff Vectors 60fps Canvas).
 * 4. Lấy mẫu Mặt cắt Địa hình Tức thì (sampleElevationProfile) phục vụ công cụ đo mặt cắt 1 chạm.
 */

import { DEM_GRID_2KM, sampleDemBilinear } from '../../dem-grid-2km.js';

const ZONE_DEM_CACHE = new Map();
const SESSION_DEM_PREFIX = 'vn_zone_dem196_v2:';

function computePercentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor((p / 100) * (sortedArr.length - 1))));
  return sortedArr[idx];
}

function isCoveredByCoreDem2km(lat, lng, radiusKm) {
  const dDeg = (radiusKm * 0.75) / 111;
  return (
    lat - dDeg >= DEM_GRID_2KM.minLat - 0.004 &&
    lat + dDeg <= DEM_GRID_2KM.maxLat + 0.004 &&
    lng - dDeg >= DEM_GRID_2KM.minLng - 0.004 &&
    lng + dDeg <= DEM_GRID_2KM.maxLng + 0.004
  );
}

function summarizeGridSlopeStats(gridObj) {
  const { rows, cols, minLat, maxLat, minLng, maxLng, grid } = gridObj;
  const midLat = (minLat + maxLat) * 0.5;
  const dyMeters = Math.max(10, ((maxLat - minLat) / Math.max(1, rows - 1)) * 110574);
  const dxMeters = Math.max(
    10,
    ((maxLng - minLng) / Math.max(1, cols - 1)) * 111320 * Math.max(0.35, Math.cos((midLat * Math.PI) / 180))
  );

  let maxSlopeDeg = 0;
  let steepCells = 0;
  let totalInner = 0;
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const dzDx = (grid[r][c + 1] - grid[r][c - 1]) / (2 * dxMeters);
      const dzDy = (grid[r + 1][c] - grid[r - 1][c]) / (2 * dyMeters);
      const slopeDeg = (Math.atan(Math.hypot(dzDx, dzDy)) * 180) / Math.PI;
      if (slopeDeg > maxSlopeDeg) maxSlopeDeg = slopeDeg;
      if (slopeDeg >= 8) steepCells++;
      totalInner++;
    }
  }
  return {
    maxSlopeDeg: Math.round(maxSlopeDeg * 10) / 10,
    steepPct: totalInner > 0 ? Math.round((steepCells / totalInner) * 100) : 0
  };
}

/**
 * Truy xuất lưới địa hình vệ tinh 14×14 (196 điểm — 2 lô song song 98 điểm Open-Meteo Elevation API)
 * hoặc lưới 25×25 (625 điểm) tại vùng lõi Đông Ngạc.
 */
export async function ensureZoneDemGrid(centerLat, centerLng, radiusKm = 5) {
  const lat = Number(centerLat);
  const lng = Number(centerLng);
  const rKm = Math.max(1.5, Math.min(25, Number(radiusKm) || 5));

  if (isCoveredByCoreDem2km(lat, lng, rKm)) {
    const flat = DEM_GRID_2KM.grid.flat().filter(Number.isFinite).sort((a, b) => a - b);
    const baseObj = {
      source: 'core_dem_625',
      rows: DEM_GRID_2KM.rows,
      cols: DEM_GRID_2KM.cols,
      minLat: DEM_GRID_2KM.minLat,
      maxLat: DEM_GRID_2KM.maxLat,
      minLng: DEM_GRID_2KM.minLng,
      maxLng: DEM_GRID_2KM.maxLng,
      grid: DEM_GRID_2KM.grid
    };
    const slopeStats = summarizeGridSlopeStats(baseObj);
    return {
      ...baseObj,
      stats: {
        minM: flat[0] ?? 4,
        p25M: computePercentile(flat, 25),
        p45M: computePercentile(flat, 45),
        p50M: computePercentile(flat, 50),
        p65M: computePercentile(flat, 65),
        maxM: flat[flat.length - 1] ?? 20,
        lowlandPct: DEM_GRID_2KM.stats.belowOrEqual11mPct,
        ...slopeStats
      }
    };
  }

  const cacheKey = `${lat.toFixed(2)}:${lng.toFixed(2)}:${Math.round(rKm)}`;
  if (ZONE_DEM_CACHE.has(cacheKey)) {
    return ZONE_DEM_CACHE.get(cacheKey);
  }

  try {
    const rawSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_DEM_PREFIX + cacheKey) : null;
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed && Array.isArray(parsed.grid)) {
        ZONE_DEM_CACHE.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }

  const rows = 14;
  const cols = 14;
  const latSpan = (rKm * 1.05) / 110.574;
  const lngSpan = (rKm * 1.05) / (111.32 * Math.max(0.35, Math.cos((lat * Math.PI) / 180)));
  const minLat = lat - latSpan;
  const maxLat = lat + latSpan;
  const minLng = lng - lngSpan;
  const maxLng = lng + lngSpan;

  const lats = [];
  const lngs = [];
  for (let r = 0; r < rows; r++) {
    const py = minLat + (r / (rows - 1)) * (maxLat - minLat);
    for (let c = 0; c < cols; c++) {
      const px = minLng + (c / (cols - 1)) * (maxLng - minLng);
      lats.push(py.toFixed(4));
      lngs.push(px.toFixed(4));
    }
  }

  // Chia 196 điểm thành 2 batch 98 điểm (giới hạn Open-Meteo Elevation ≤ 100 điểm/request)
  const mid = 98;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const [resA, resB] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats.slice(0, mid).join(',')}&longitude=${lngs.slice(0, mid).join(',')}`,
        { signal: ctrl.signal }
      ),
      fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats.slice(mid).join(',')}&longitude=${lngs.slice(mid).join(',')}`,
        { signal: ctrl.signal }
      )
    ]);
    clearTimeout(timer);
    if (!resA.ok || !resB.ok) return null;
    const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
    const elevs = [...(dataA?.elevation || []), ...(dataB?.elevation || [])].map((v) =>
      Number.isFinite(Number(v)) ? Number(v) : 0
    );
    if (elevs.length !== rows * cols) return null;

    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid.push(elevs.slice(r * cols, (r + 1) * cols));
    }
    const sorted = [...elevs].sort((a, b) => a - b);
    const p45M = computePercentile(sorted, 45);
    const belowCount = sorted.filter((v) => v <= p45M).length;

    const baseObj = {
      source: 'live_copernicus_196',
      rows,
      cols,
      minLat,
      maxLat,
      minLng,
      maxLng,
      grid
    };
    const slopeStats = summarizeGridSlopeStats(baseObj);

    const gridObj = {
      ...baseObj,
      stats: {
        minM: Math.round(sorted[0] * 10) / 10,
        p25M: Math.round(computePercentile(sorted, 25) * 10) / 10,
        p45M: Math.round(p45M * 10) / 10,
        p50M: Math.round(computePercentile(sorted, 50) * 10) / 10,
        p65M: Math.round(computePercentile(sorted, 65) * 10) / 10,
        maxM: Math.round(sorted[sorted.length - 1] * 10) / 10,
        lowlandPct: Math.round((belowCount / sorted.length) * 100),
        ...slopeStats
      }
    };

    if (ZONE_DEM_CACHE.size >= 40) {
      const firstK = ZONE_DEM_CACHE.keys().next().value;
      if (firstK) ZONE_DEM_CACHE.delete(firstK);
    }
    ZONE_DEM_CACHE.set(cacheKey, gridObj);
    try {
      sessionStorage?.setItem(SESSION_DEM_PREFIX + cacheKey, JSON.stringify(gridObj));
    } catch {
      // ignore quota
    }
    return gridObj;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export function sampleAnyDemGrid(gridObj, lat, lng) {
  const coreVal = sampleDemBilinear(lat, lng);
  if (coreVal !== null) return coreVal;
  if (!gridObj || !Array.isArray(gridObj.grid)) return null;
  const { rows, cols, minLat, maxLat, minLng, maxLng, grid } = gridObj;
  if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) return null;
  const fy = ((lat - minLat) / (maxLat - minLat)) * (rows - 1);
  const fx = ((lng - minLng) / (maxLng - minLng)) * (cols - 1);
  const r0 = Math.min(rows - 2, Math.max(0, Math.floor(fy)));
  const c0 = Math.min(cols - 2, Math.max(0, Math.floor(fx)));
  const ty = fy - r0;
  const tx = fx - c0;
  const z00 = grid[r0][c0];
  const z01 = grid[r0][c0 + 1];
  const z10 = grid[r0 + 1][c0];
  const z11 = grid[r0 + 1][c0 + 1];
  const z0 = z00 * (1 - tx) + z01 * tx;
  const z1 = z10 * (1 - tx) + z11 * tx;
  return z0 * (1 - ty) + z1 * ty;
}

/**
 * Tính độ dốc mặt đất (Slope °) và vector hướng chảy tụ thủy (Downhill Screen Vector) tại (lat, lng)
 */
export function computeTerrainGradient(gridObj, lat, lng) {
  const stepDeg = 0.0012; // ~130 m
  const eW = sampleAnyDemGrid(gridObj, lat, lng - stepDeg);
  const eE = sampleAnyDemGrid(gridObj, lat, lng + stepDeg);
  const eS = sampleAnyDemGrid(gridObj, lat - stepDeg, lng);
  const eN = sampleAnyDemGrid(gridObj, lat + stepDeg, lng);
  if (eW === null || eE === null || eS === null || eN === null) {
    return null;
  }
  const dxMeters = 2 * stepDeg * 111320 * Math.max(0.35, Math.cos((lat * Math.PI) / 180));
  const dyMeters = 2 * stepDeg * 110574;
  const dzDx = (eE - eW) / dxMeters; // + nếu cao dần về phía Đông
  const dzDy = (eN - eS) / dyMeters; // + nếu cao dần về phía Bắc
  const mag = Math.hypot(dzDx, dzDy);
  const slopeDeg = Math.round(((Math.atan(mag) * 180) / Math.PI) * 10) / 10;

  // Trên màn hình: +X là hướng Đông, +Y là hướng Nam -> hướng nước chảy xuống dốc là (-dzDx, +dzDy)
  const flowVx = mag > 0.0004 ? -dzDx / mag : 0;
  const flowVy = mag > 0.0004 ? dzDy / mag : 0;
  return {
    slopeDeg,
    gradientMag: mag,
    flowVx,
    flowVy
  };
}

/**
 * Lấy mẫu mặt cắt cao độ theo đoạn thẳng từ (lat1, lng1) đến (lat2, lng2)
 */
export function sampleElevationProfile(gridObj, lat1, lng1, lat2, lng2, samples = 25) {
  const out = [];
  const n = Math.max(5, samples);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const la = lat1 + (lat2 - lat1) * t;
    const ln = lng1 + (lng2 - lng1) * t;
    const z = sampleAnyDemGrid(gridObj, la, ln);
    out.push({
      frac: t,
      lat: la,
      lng: ln,
      elevM: z !== null ? Math.round(z * 10) / 10 : null
    });
  }
  return out;
}

/**
 * Tạo lớp Canvas Mặt phủ Ngập Thủy văn 3 Tầng & Cảnh báo Sườn dốc Sạt lở 60fps
 */
export function createNationalHydroSurfaceLayer(L, getContextFn) {
  const HydroSurface = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '225';
      map.getPanes().overlayPane.appendChild(this._canvas);
      this._boundRedraw = () => {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => this.redraw());
      };
      map.on('moveend zoomend resize', this._boundRedraw);
      this.redraw();
    },
    onRemove(map) {
      map.off('moveend zoomend resize', this._boundRedraw);
      if (this._raf) cancelAnimationFrame(this._raf);
      this._canvas?.remove();
      this._canvas = null;
    },
    redraw() {
      if (!this._map || !this._canvas) return;
      const ctxState = getContextFn();
      const size = this._map.getSize();
      if (size.x <= 0 || size.y <= 0) return;

      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, size.x, size.y);

      if (!ctxState.enabled) return;

      const rainMm = Math.max(0, Number(ctxState.simRainMm) || 0);
      const opacityMul = Math.max(0.2, Math.min(1, Number(ctxState.opacity) || 0.72));
      const dischargeRatio = Math.max(0.6, Math.min(2.4, Number(ctxState.dischargeRatio) || 1));
      const showHydroWater = rainMm > 4 || dischargeRatio >= 1.35;

      const cLat = Number(ctxState.centerLat);
      const cLng = Number(ctxState.centerLng);
      const rKm = Math.max(1, Number(ctxState.radiusKm) || 5);
      const cosLat = Math.max(0.35, Math.cos((cLat * Math.PI) / 180));
      const maxRadiusDegSq = Math.pow((rKm / 110.574) * 1.02, 2);
      const fadeStartSq = maxRadiusDegSq * 0.65;

      const demGrid = ctxState.demGrid;
      const stats = demGrid?.stats || { minM: 6, p25M: 8.5, p45M: 10.5, p65M: 13, maxM: 18, steepPct: 0 };
      const relief = Math.max(1.5, Math.min(34, stats.p65M - stats.minM));
      const rainFrac = Math.min(1.3, rainMm / 140) + Math.max(0, (dischargeRatio - 1.1) * 0.22);
      const waterSurfaceThreshold = stats.minM + relief * (0.26 + 0.68 * rainFrac);
      const hasMountainousRelief = (stats.maxSlopeDeg || 0) >= 8;

      const isMobile =
        (typeof window !== 'undefined' &&
          (window.innerWidth < 1024 ||
            ('ontouchstart' in window) ||
            navigator.maxTouchPoints > 0)) ||
        false;

      // Trên điện thoại: Tăng hệ số downscale lên 5 để giảm 65% tải pixel CPU/GPU, giữ mượt 60fps
      const scale = isMobile ? 5 : 3;
      const wSmall = Math.max(1, Math.ceil(size.x / scale));
      const hSmall = Math.max(1, Math.ceil(size.y / scale));
      const off = document.createElement('canvas');
      off.width = wSmall;
      off.height = hSmall;
      const octx = off.getContext('2d');
      const img = octx.createImageData(wSmall, hSmall);
      const data = img.data;
      const depthField = new Float32Array(wSmall * hSmall);
      const insideMask = new Uint8Array(wSmall * hSmall);

      const zoom = this._map.getZoom();
      const spotRadiusSmall = Math.max(4.5, Math.min(18, Math.pow(1.36, zoom - 12) * 5.2));
      const spotRadSq = spotRadiusSmall * spotRadiusSmall;

      const floodSpots = (ctxState.points || [])
        .filter((p) => p.status !== 'hidden' && p.layerGroup === 'risk' && p.category !== 'heat')
        .map((p) => {
          const px = this._map.latLngToContainerPoint([Number(p.lat), Number(p.lng)]);
          return {
            sx: px.x / scale,
            sy: px.y / scale,
            isLandslide: p.category === 'landslide',
            weight: p.severity === 'severe' ? 1.32 : 0.96
          };
        });

      const waterwayVertices = [];
      if (Array.isArray(ctxState.waterways)) {
        for (const ww of ctxState.waterways) {
          const coords = ww.coordinates || [];
          for (let i = 0; i < coords.length; i += 2) {
            const px = this._map.latLngToContainerPoint(coords[i]);
            waterwayVertices.push({ sx: px.x / scale, sy: px.y / scale });
          }
        }
      }

      const gradStepDeg = 0.0011;
      const shadeStepMeters = 2 * gradStepDeg * 110574;

      for (let py = 0; py < hSmall; py++) {
        const screenY = py * scale + scale * 0.5;
        for (let px = 0; px < wSmall; px++) {
          const screenX = px * scale + scale * 0.5;
          const ll = this._map.containerPointToLatLng([screenX, screenY]);
          const dLat = ll.lat - cLat;
          const dLng = (ll.lng - cLng) * cosLat;
          const distSq = dLat * dLat + dLng * dLng;
          if (distSq > maxRadiusDegSq) continue;

          const cellIdx = py * wSmall + px;
          insideMask[cellIdx] = 1;
          const edgeFade =
            distSq <= fadeStartSq ? 1 : Math.max(0, 1 - (distSq - fadeStartSq) / (maxRadiusDegSq - fadeStartSq));

          let depthScore = 0;
          const dem = sampleAnyDemGrid(demGrid, ll.lat, ll.lng);
          if (showHydroWater && dem !== null && dem < waterSurfaceThreshold) {
            const normDepth = (waterSurfaceThreshold - dem) / Math.max(1.2, relief * 0.55);
            depthScore += Math.min(1.9, normDepth * 0.94);
          }

          if (showHydroWater && (rainMm >= 20 || dischargeRatio >= 1.25)) {
            const rFactor = Math.min(1.4, rainMm / 70 + Math.max(0, (dischargeRatio - 1) * 0.35));
            for (let k = 0; k < floodSpots.length; k++) {
              const sp = floodSpots[k];
              if (sp.isLandslide) continue;
              const dx = px - sp.sx;
              const dy = py - sp.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < spotRadSq) {
                depthScore += (1 - d2 / spotRadSq) * sp.weight * 0.92 * rFactor;
              }
            }
            const wwRadSq = spotRadSq * 0.6;
            for (let w = 0; w < waterwayVertices.length; w++) {
              const wv = waterwayVertices[w];
              const dx = px - wv.sx;
              const dy = py - wv.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < wwRadSq) {
                depthScore += (1 - d2 / wwRadSq) * 0.52 * rFactor * Math.min(1.5, dischargeRatio);
                break;
              }
            }
          }

          depthScore *= edgeFade;
          depthField[cellIdx] = depthScore;
          const idx = cellIdx * 4;

          if (depthScore > 0.22) {
            let rCol = 14;
            let gCol = 165;
            let bCol = 233;
            let alpha = 40;
            if (depthScore >= 1.32) {
              const t = Math.min(1, (depthScore - 1.32) / 0.85);
              rCol = Math.round(24 - t * 6);
              gCol = Math.round(58 - t * 14);
              bCol = Math.round(170 - t * 32);
              alpha = Math.min(192, 128 + t * 62);
            } else if (depthScore >= 0.65) {
              const t = (depthScore - 0.65) / (1.32 - 0.65);
              rCol = Math.round(2 + t * 27);
              gCol = Math.round(132 - t * 54);
              bCol = Math.round(199 + t * 17);
              alpha = 74 + t * 44;
            } else {
              const t = (depthScore - 0.22) / (0.65 - 0.22);
              rCol = Math.round(56 - t * 54);
              gCol = Math.round(189 - t * 57);
              bCol = Math.round(248 - t * 49);
              alpha = 32 + t * 42;
            }
            data[idx] = rCol;
            data[idx + 1] = gCol;
            data[idx + 2] = bCol;
            data[idx + 3] = Math.round(alpha * opacityMul);
            continue;
          }

          // Vùng đồi núi: Cảnh báo sườn dốc sạt lở mượt 3 sắc độ khi mưa >= 35 mm
          let paintedSlope = false;
          if (hasMountainousRelief && ctxState.showSlope && rainMm >= 35) {
            const grad = computeTerrainGradient(demGrid, ll.lat, ll.lng);
            if (grad && grad.slopeDeg >= 8) {
              const slopeFactor = Math.min(1.45, ((grad.slopeDeg - 6.5) / 14) * (rainMm / 85)) * edgeFade;
              if (slopeFactor > 0.16) {
                const severeSlope = grad.slopeDeg >= 16;
                data[idx] = severeSlope ? 153 : grad.slopeDeg >= 12 ? 194 : 217;
                data[idx + 1] = severeSlope ? 27 : grad.slopeDeg >= 12 ? 65 : 119;
                data[idx + 2] = severeSlope ? 27 : 12;
                data[idx + 3] = Math.round(Math.min(138, 44 + slopeFactor * 68) * opacityMul);
                paintedSlope = true;
              }
            }
          }

          // Hillshade 3D địa hình tinh tế trên nền khô bên trong vùng khoanh
          if (!paintedSlope && demGrid && dem !== null && (px + py) % 1 === 0) {
            const zE = sampleAnyDemGrid(demGrid, ll.lat, ll.lng + gradStepDeg);
            const zW = sampleAnyDemGrid(demGrid, ll.lat, ll.lng - gradStepDeg);
            const zN = sampleAnyDemGrid(demGrid, ll.lat + gradStepDeg, ll.lng);
            const zS = sampleAnyDemGrid(demGrid, ll.lat - gradStepDeg, ll.lng);
            if (zE !== null && zW !== null && zN !== null && zS !== null) {
              const dzX = (zE - zW) / shadeStepMeters;
              const dzY = (zN - zS) / shadeStepMeters;
              const hill = (-dzX * 0.65 + dzY * 0.65) * 3.8;
              if (hill < -0.025) {
                // Sườn khuất sáng hướng Đông Nam: bóng đổ slate rất dịu
                data[idx] = 15;
                data[idx + 1] = 23;
                data[idx + 2] = 42;
                data[idx + 3] = Math.round(Math.min(26, Math.abs(hill) * 95) * edgeFade);
              } else if (hill > 0.03) {
                // Gò cao đón sáng hướng Tây Bắc: ánh sáng relief rất nhẹ
                data[idx] = 248;
                data[idx + 1] = 250;
                data[idx + 2] = 252;
                data[idx + 3] = Math.round(Math.min(22, hill * 80) * edgeFade);
              }
            }
          }
        }
      }

      // Đường đồng mức mép nước sắc nét (Shoreline Iso-contours tại 0.24, 0.72, 1.35)
      if (showHydroWater) {
        const thresholds = [0.24, 0.72, 1.35];
        for (let py = 1; py < hSmall - 1; py++) {
          for (let px = 1; px < wSmall - 1; px++) {
            const cIdx = py * wSmall + px;
            if (!insideMask[cIdx]) continue;
            const dVal = depthField[cIdx];
            if (dVal <= 0.22) continue;
            const dRight = depthField[cIdx + 1];
            const dDown = depthField[cIdx + wSmall];
            for (let t = 0; t < thresholds.length; t++) {
              const th = thresholds[t];
              if ((dVal >= th && (dRight < th || dDown < th)) || (dVal < th && (dRight >= th || dDown >= th))) {
                const idx = cIdx * 4;
                data[idx] = t === 0 ? 186 : t === 1 ? 224 : 255;
                data[idx + 1] = t === 0 ? 230 : t === 1 ? 242 : 255;
                data[idx + 2] = 253;
                data[idx + 3] = Math.round((t === 0 ? 185 : 155) * opacityMul);
                break;
              }
            }
          }
        }
      }

      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, wSmall, hSmall, 0, 0, size.x, size.y);
    }
  });

  return new HydroSurface();
}

/**
 * Lớp Vector & Hạt Dòng Chảy Địa Hình Tụ Thủy 60fps kiểu Windy (Surface Runoff Particles + Vectors)
 */
export function createHydroFlowVectorsLayer(L, getContextFn) {
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const FlowVectors = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '227';
      map.getPanes().overlayPane.appendChild(this._canvas);

      this._trailCanvas = document.createElement('canvas');
      this._staticCanvas = document.createElement('canvas');
      this._particles = [];
      this._field = null;
      this._rafAnim = null;
      this._lastTs = 0;
      this._animatedOverride = true;

      this._boundRedraw = () => {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => this.redraw());
      };
      this._boundVis = () => {
        if (typeof document !== 'undefined' && document.hidden) {
          this._stopAnim();
        } else {
          this._maybeStartAnim();
        }
      };
      map.on('moveend zoomend resize', this._boundRedraw);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._boundVis);
      this.redraw();
    },
    onRemove(map) {
      map.off('moveend zoomend resize', this._boundRedraw);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._boundVis);
      if (this._raf) cancelAnimationFrame(this._raf);
      this._stopAnim();
      this._canvas?.remove();
      this._canvas = null;
      this._trailCanvas = null;
      this._staticCanvas = null;
    },
    setAnimated(enabled) {
      this._animatedOverride = Boolean(enabled);
      if (!this._animatedOverride) {
        this._stopAnim();
        this._drawStaticOnly();
      } else {
        this.redraw();
      }
    },
    _stopAnim() {
      if (this._rafAnim) {
        cancelAnimationFrame(this._rafAnim);
        this._rafAnim = null;
      }
    },
    _drawStaticOnly() {
      if (!this._canvas || !this._staticCanvas) return;
      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      ctx.drawImage(this._staticCanvas, 0, 0);
    },
    _sampleField(x, y) {
      const f = this._field;
      if (!f) return null;
      const fx = (x / f.width) * (f.cols - 1);
      const fy = (y / f.height) * (f.rows - 1);
      const c = Math.round(fx);
      const r = Math.round(fy);
      if (c < 0 || c >= f.cols || r < 0 || r >= f.rows) return null;
      const idx = r * f.cols + c;
      if (!f.valid[idx]) return null;
      return { vx: f.vx[idx], vy: f.vy[idx], slope: f.slope[idx] };
    },
    _spawnParticle(w, h) {
      for (let tries = 0; tries < 10; tries++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        if (this._sampleField(x, y)) {
          return { x, y, age: Math.floor(Math.random() * 48), maxAge: 42 + Math.floor(Math.random() * 30) };
        }
      }
      return { x: Math.random() * w, y: Math.random() * h, age: 0, maxAge: 45 };
    },
    _maybeStartAnim() {
      this._stopAnim();
      const ctxState = getContextFn();
      const canAnimate =
        !prefersReduced &&
        this._animatedOverride &&
        ctxState.animated !== false &&
        ctxState.enabled &&
        ctxState.demGrid &&
        typeof document !== 'undefined' &&
        !document.hidden;
      if (!canAnimate) return;

      const tick = (ts) => {
        if (!this._map || !this._canvas || !this._trailCanvas || !this._field) return;
        const s = getContextFn();
        if (!s.enabled || s.animated === false || !this._animatedOverride || document.hidden) {
          this._stopAnim();
          this._drawStaticOnly();
          return;
        }
        const dt = this._lastTs ? Math.min(48, ts - this._lastTs) : 16;
        this._lastTs = ts;
        if (dt < 14) {
          this._rafAnim = requestAnimationFrame(tick);
          return;
        }

        const w = this._canvas.width;
        const h = this._canvas.height;
        const tctx = this._trailCanvas.getContext('2d');
        // Làm mờ đuôi hạt mượt
        tctx.globalCompositeOperation = 'destination-out';
        tctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        tctx.fillRect(0, 0, w, h);
        tctx.globalCompositeOperation = 'source-over';

        const rainSpeed = 0.75 + Math.min(1.4, (Number(s.simRainMm) || 40) / 85);
        tctx.lineWidth = 1.6;
        tctx.lineCap = 'round';

        for (let i = 0; i < this._particles.length; i++) {
          const p = this._particles[i];
          const vec = this._sampleField(p.x, p.y);
          if (!vec || p.age >= p.maxAge) {
            this._particles[i] = this._spawnParticle(w, h);
            continue;
          }
          const nx = p.x + vec.vx * (1.25 + Math.min(1.6, vec.slope * 0.12)) * rainSpeed;
          const ny = p.y + vec.vy * (1.25 + Math.min(1.6, vec.slope * 0.12)) * rainSpeed;
          tctx.strokeStyle =
            vec.slope >= 8
              ? 'rgba(249, 115, 22, 0.88)'
              : s.isDark
                ? 'rgba(103, 232, 249, 0.86)'
                : 'rgba(2, 132, 199, 0.78)';
          tctx.beginPath();
          tctx.moveTo(p.x, p.y);
          tctx.lineTo(nx, ny);
          tctx.stroke();
          p.x = nx;
          p.y = ny;
          p.age++;
        }

        const ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this._staticCanvas, 0, 0);
        ctx.drawImage(this._trailCanvas, 0, 0);
        this._rafAnim = requestAnimationFrame(tick);
      };
      this._rafAnim = requestAnimationFrame(tick);
    },
    redraw() {
      if (!this._map || !this._canvas) return;
      this._stopAnim();
      const ctxState = getContextFn();
      const size = this._map.getSize();
      if (size.x <= 0 || size.y <= 0) return;

      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      this._trailCanvas.width = size.x;
      this._trailCanvas.height = size.y;
      this._staticCanvas.width = size.x;
      this._staticCanvas.height = size.y;

      const ctx = this._canvas.getContext('2d');
      const sctx = this._staticCanvas.getContext('2d');
      const tctx = this._trailCanvas.getContext('2d');
      ctx.clearRect(0, 0, size.x, size.y);
      sctx.clearRect(0, 0, size.x, size.y);
      tctx.clearRect(0, 0, size.x, size.y);

      if (!ctxState.enabled || !ctxState.demGrid) {
        this._field = null;
        return;
      }

      const cLat = Number(ctxState.centerLat);
      const cLng = Number(ctxState.centerLng);
      const rKm = Math.max(1, Number(ctxState.radiusKm) || 5);
      const cosLat = Math.max(0.35, Math.cos((cLat * Math.PI) / 180));
      const maxRadiusDegSq = Math.pow((rKm / 110.574) * 0.96, 2);

      // Lưới trường vector 26x22 phục vụ hạt dòng chảy
      const cols = 26;
      const rows = 22;
      const vxArr = new Float32Array(cols * rows);
      const vyArr = new Float32Array(cols * rows);
      const slopeArr = new Float32Array(cols * rows);
      const validArr = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        const y = (r / (rows - 1)) * size.y;
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1)) * size.x;
          const ll = this._map.containerPointToLatLng([x, y]);
          const dLat = ll.lat - cLat;
          const dLng = (ll.lng - cLng) * cosLat;
          if (dLat * dLat + dLng * dLng > maxRadiusDegSq) continue;
          const grad = computeTerrainGradient(ctxState.demGrid, ll.lat, ll.lng);
          if (!grad || grad.gradientMag < 0.001) continue;
          const idx = r * cols + c;
          vxArr[idx] = grad.flowVx;
          vyArr[idx] = grad.flowVy;
          slopeArr[idx] = grad.slopeDeg;
          validArr[idx] = 1;
        }
      }
      this._field = { width: size.x, height: size.y, cols, rows, vx: vxArr, vy: vyArr, slope: slopeArr, valid: validArr };

      // Lớp nền mũi tên tĩnh chỉ hướng dòng chảy rõ nét nhưng nhẹ
      const stepPx = 56;
      sctx.lineWidth = 1.4;
      sctx.lineCap = 'round';
      sctx.lineJoin = 'round';

      for (let y = 36; y < size.y - 30; y += stepPx) {
        for (let x = 36; x < size.x - 30; x += stepPx) {
          const ll = this._map.containerPointToLatLng([x, y]);
          const dLat = ll.lat - cLat;
          const dLng = (ll.lng - cLng) * cosLat;
          if (dLat * dLat + dLng * dLng > maxRadiusDegSq) continue;

          const grad = computeTerrainGradient(ctxState.demGrid, ll.lat, ll.lng);
          if (!grad || grad.gradientMag < 0.0012) continue;

          const len = Math.min(15, 7 + grad.slopeDeg * 0.55);
          const x0 = x - grad.flowVx * (len * 0.45);
          const y0 = y - grad.flowVy * (len * 0.45);
          const x1 = x + grad.flowVx * (len * 0.55);
          const y1 = y + grad.flowVy * (len * 0.55);

          sctx.strokeStyle =
            grad.slopeDeg >= 8
              ? 'rgba(194, 65, 12, 0.52)'
              : ctxState.isDark
                ? 'rgba(125, 211, 252, 0.45)'
                : 'rgba(3, 105, 161, 0.42)';

          sctx.beginPath();
          sctx.moveTo(x0, y0);
          sctx.lineTo(x1, y1);
          const angle = Math.atan2(y1 - y0, x1 - x0);
          const head = 4;
          sctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 6), y1 - head * Math.sin(angle - Math.PI / 6));
          sctx.moveTo(x1, y1);
          sctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 6), y1 - head * Math.sin(angle + Math.PI / 6));
          sctx.stroke();
        }
      }

      this._drawStaticOnly();
      const isMobile =
        (typeof window !== 'undefined' &&
          (window.innerWidth < 1024 ||
            ('ontouchstart' in window) ||
            navigator.maxTouchPoints > 0)) ||
        false;
      const particleCount = isMobile ? 32 : 120;
      this._particles = Array.from({ length: particleCount }, () => this._spawnParticle(size.x, size.y));
      this._maybeStartAnim();
    }
  });

  return new FlowVectors();
}

/**
 * Lớp Bản đồ Nhiệt Mật độ Rủi ro (Risk Density Heatmap — HTML5 Canvas 60fps)
 */
export function createNationalHeatmapLayer(L, getPointsFn) {
  const HeatLayer = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '228';
      map.getPanes().overlayPane.appendChild(this._canvas);
      this._boundRedraw = () => {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => this.redraw());
      };
      map.on('moveend zoomend resize', this._boundRedraw);
      this.redraw();
    },
    onRemove(map) {
      map.off('moveend zoomend resize', this._boundRedraw);
      if (this._raf) cancelAnimationFrame(this._raf);
      this._canvas?.remove();
      this._canvas = null;
    },
    redraw() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, size.x, size.y);

      const zoom = this._map.getZoom();
      const radiusPx = Math.max(26, Math.min(72, (zoom - 10) * 13));
      const pts = (getPointsFn() || []).filter((p) => p.status !== 'hidden' && p.layerGroup === 'risk');

      for (const p of pts) {
        const ptPx = this._map.latLngToContainerPoint([Number(p.lat), Number(p.lng)]);
        if (ptPx.x < -radiusPx || ptPx.y < -radiusPx || ptPx.x > size.x + radiusPx || ptPx.y > size.y + radiusPx) continue;
        const g = ctx.createRadialGradient(ptPx.x, ptPx.y, 3, ptPx.x, ptPx.y, radiusPx);
        g.addColorStop(0, 'rgba(225, 29, 72, 0.44)');
        g.addColorStop(0.55, 'rgba(249, 115, 22, 0.22)');
        g.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ptPx.x, ptPx.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  return new HeatLayer();
}

const MARKER_SVG_CACHE = new Map();

export function buildMapPictogramIcon(L, pt, zoom = 14) {
  const isOsm = Boolean(pt.isOsmLive);
  const tier = zoom <= 13 ? 'sm' : zoom === 14 ? 'md' : 'lg';
  const size =
    tier === 'sm'
      ? isOsm
        ? 10
        : 13
      : tier === 'md'
        ? isOsm
          ? 15
          : 20
        : isOsm
          ? 19
          : 25;

  const isSevere = pt.layerGroup === 'risk' && pt.severity === 'severe' && tier !== 'sm';
  const key = `${pt.confidenceTier}|${pt.layerGroup}|${pt.category}|${tier}|${size}|${isSevere ? 1 : 0}`;
  let html = MARKER_SVG_CACHE.get(key);
  if (!html) {
    let fill = '#E11D48';
    let ring = 'rgba(225, 29, 72, 0.24)';
    if (pt.confidenceTier === 'C') {
      fill = '#D97706';
      ring = 'rgba(217, 119, 6, 0.24)';
    } else if (pt.layerGroup === 'safe') {
      if (pt.category === 'medical') {
        fill = '#059669';
        ring = 'rgba(5, 150, 105, 0.22)';
      } else {
        fill = '#0F766E';
        ring = 'rgba(15, 118, 110, 0.22)';
      }
    } else if (pt.category === 'landslide') {
      fill = '#C2410C';
      ring = 'rgba(194, 65, 12, 0.26)';
    } else if (pt.category === 'heat' || pt.category === 'salinity') {
      fill = '#EA580C';
      ring = 'rgba(234, 88, 12, 0.24)';
    }

    if (tier === 'sm' || (tier === 'md' && isOsm)) {
      html = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.1" fill="${fill}" stroke="#FFFFFF" stroke-width="2"/>
      </svg>`;
    } else {
      let glyph = '';
      if (pt.confidenceTier === 'C') {
        glyph = `<text x="14" y="18" text-anchor="middle" fill="#FFFFFF" font-size="11.5" font-weight="800" font-family="sans-serif">?</text>`;
      } else if (pt.layerGroup === 'safe') {
        glyph =
          pt.category === 'medical'
            ? `<path d="M14 9.2v9.6M9.2 14h9.6" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>`
            : `<path d="M14 8.3l4.6 1.8v3.6c0 2.9-1.9 5.3-4.6 6.2-2.7-.9-4.6-3.3-4.6-6.2v-3.6L14 8.3z" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linejoin="round"/><path d="M11.7 14.1l1.7 1.7 3.3-3.4" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else if (pt.category === 'landslide') {
        glyph = `<path d="M14 8.4L19.8 18.4H8.2L14 8.4z" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linejoin="round"/><line x1="14" y1="12" x2="14" y2="15" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round"/><circle cx="14" cy="16.8" r="0.9" fill="#FFFFFF"/>`;
      } else if (pt.category === 'heat' || pt.category === 'salinity') {
        glyph = `<circle cx="14" cy="14" r="3" fill="#FFFFFF"/><path d="M14 8.4v1.7M14 17.9v1.7M8.4 14h1.7M17.9 14h1.7M10.1 10.1l1.2 1.2M16.7 16.7l1.2 1.2M17.9 10.1l-1.2 1.2M11.3 16.7l-1.2 1.2" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>`;
      } else {
        glyph = `<path d="M8.8 15.6c1.4-1.5 2.8-1.5 4.2 0s2.8 1.5 4.2 0M14 9v4.1" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round"/>`;
      }
      html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="13" fill="${ring}"/>
        <circle cx="14" cy="14" r="10.4" fill="${fill}" stroke="#FFFFFF" stroke-width="2.1"${pt.confidenceTier === 'C' ? ' stroke-dasharray="3 2"' : ''}/>
        ${glyph}
      </svg>`;
    }
    MARKER_SVG_CACHE.set(key, html);
  }

  return L.divIcon({
    className: isSevere ? 'vn-pictogram-marker is-severe-beacon' : 'vn-pictogram-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}
