/**
 * NATIONAL HYDRO-TERRAIN WATER INUNDATION, SLOPE GRADIENT & RUNOFF VECTOR ENGINE (v4)
 * Chuẩn trực quan hóa tổng hợp từ USGS Flood Inundation Mapper (FIM),
 * NOAA NWPS, Copernicus EFAS/GloFAS, Japan JMA Kikikuru & MLIT Hazard Map:
 *
 * 1. Lưới địa hình vệ tinh mật độ cao:
 *    - Vùng lõi Đông Ngạc (≤ 2 km): Lưới 25×25 = 625 điểm Copernicus GLO-30 (0 ms offline).
 *    - Toàn lãnh thổ Việt Nam (63 tỉnh/thành): Lưới động 14×14 = 196 điểm Copernicus GLO-30
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
      if (rainMm <= 4 && dischargeRatio < 1.35) return;

      const cLat = Number(ctxState.centerLat);
      const cLng = Number(ctxState.centerLng);
      const rKm = Math.max(1, Number(ctxState.radiusKm) || 5);
      const cosLat = Math.max(0.35, Math.cos((cLat * Math.PI) / 180));
      const maxRadiusDegSq = Math.pow((rKm / 110.574) * 1.02, 2);
      const fadeStartSq = maxRadiusDegSq * 0.62;

      const demGrid = ctxState.demGrid;
      const stats = demGrid?.stats || { minM: 6, p25M: 8.5, p45M: 10.5, p65M: 13, maxM: 18, steepPct: 0 };
      const relief = Math.max(1.5, Math.min(34, stats.p65M - stats.minM));
      const rainFrac = Math.min(1.3, rainMm / 140) + Math.max(0, (dischargeRatio - 1.1) * 0.22);
      const waterSurfaceThreshold = stats.minM + relief * (0.26 + 0.68 * rainFrac);
      const hasMountainousRelief = (stats.maxSlopeDeg || 0) >= 8;

      const scale = 5;
      const wSmall = Math.max(1, Math.ceil(size.x / scale));
      const hSmall = Math.max(1, Math.ceil(size.y / scale));
      const off = document.createElement('canvas');
      off.width = wSmall;
      off.height = hSmall;
      const octx = off.getContext('2d');
      const img = octx.createImageData(wSmall, hSmall);
      const data = img.data;

      const zoom = this._map.getZoom();
      const spotRadiusSmall = Math.max(3.5, Math.min(12, Math.pow(1.36, zoom - 12) * 3.4));
      const spotRadSq = spotRadiusSmall * spotRadiusSmall;

      const floodSpots = (ctxState.points || [])
        .filter((p) => p.status !== 'hidden' && p.layerGroup === 'risk' && p.category !== 'heat')
        .map((p) => {
          const px = this._map.latLngToContainerPoint([Number(p.lat), Number(p.lng)]);
          return {
            sx: px.x / scale,
            sy: px.y / scale,
            isLandslide: p.category === 'landslide',
            weight: p.severity === 'severe' ? 1.3 : 0.95
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

      for (let py = 0; py < hSmall; py++) {
        const screenY = py * scale + scale * 0.5;
        for (let px = 0; px < wSmall; px++) {
          const screenX = px * scale + scale * 0.5;
          const ll = this._map.containerPointToLatLng([screenX, screenY]);
          const dLat = ll.lat - cLat;
          const dLng = (ll.lng - cLng) * cosLat;
          const distSq = dLat * dLat + dLng * dLng;
          if (distSq > maxRadiusDegSq) continue;

          const edgeFade =
            distSq <= fadeStartSq ? 1 : Math.max(0, 1 - (distSq - fadeStartSq) / (maxRadiusDegSq - fadeStartSq));

          let depthScore = 0;
          const dem = sampleAnyDemGrid(demGrid, ll.lat, ll.lng);
          if (dem !== null && dem < waterSurfaceThreshold) {
            const normDepth = (waterSurfaceThreshold - dem) / Math.max(1.2, relief * 0.55);
            depthScore += Math.min(1.85, normDepth * 0.92);
          }

          if (rainMm >= 20 || dischargeRatio >= 1.25) {
            const rFactor = Math.min(1.4, rainMm / 70 + Math.max(0, (dischargeRatio - 1) * 0.35));
            for (let k = 0; k < floodSpots.length; k++) {
              const sp = floodSpots[k];
              if (sp.isLandslide) continue;
              const dx = px - sp.sx;
              const dy = py - sp.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < spotRadSq) {
                depthScore += (1 - d2 / spotRadSq) * sp.weight * 0.9 * rFactor;
              }
            }
            const wwRadSq = spotRadSq * 0.6;
            for (let w = 0; w < waterwayVertices.length; w++) {
              const wv = waterwayVertices[w];
              const dx = px - wv.sx;
              const dy = py - wv.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < wwRadSq) {
                depthScore += (1 - d2 / wwRadSq) * 0.5 * rFactor * Math.min(1.5, dischargeRatio);
                break;
              }
            }
          }

          depthScore *= edgeFade;
          const idx = (py * wSmall + px) * 4;

          if (depthScore > 0.22) {
            if (depthScore >= 1.32) {
              data[idx] = 29;
              data[idx + 1] = 78;
              data[idx + 2] = 216;
              data[idx + 3] = Math.round(Math.min(176, 96 + depthScore * 28) * opacityMul);
            } else if (depthScore >= 0.65) {
              data[idx] = 2;
              data[idx + 1] = 132;
              data[idx + 2] = 199;
              data[idx + 3] = Math.round(Math.min(144, 66 + depthScore * 34) * opacityMul);
            } else {
              data[idx] = 14;
              data[idx + 1] = 165;
              data[idx + 2] = 233;
              data[idx + 3] = Math.round(Math.min(98, 34 + depthScore * 46) * opacityMul);
            }
            continue;
          }

          // Vùng đồi núi (Sa Pa, Lào Cai, Đà Lạt...): Tô cảnh báo sườn dốc nguy cơ sạt lở khi mưa >= 35 mm
          if (hasMountainousRelief && ctxState.showSlope && rainMm >= 35) {
            const grad = computeTerrainGradient(demGrid, ll.lat, ll.lng);
            if (grad && grad.slopeDeg >= 8) {
              const slopeFactor = Math.min(1.45, ((grad.slopeDeg - 6.5) / 14) * (rainMm / 85)) * edgeFade;
              if (slopeFactor > 0.16) {
                data[idx] = grad.slopeDeg >= 14 ? 194 : 217;
                data[idx + 1] = grad.slopeDeg >= 14 ? 65 : 119;
                data[idx + 2] = 12;
                data[idx + 3] = Math.round(Math.min(130, 42 + slopeFactor * 66) * opacityMul);
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
 * Lớp Vector Hướng Dòng Chảy Địa Hình Tụ Thủy (Surface Runoff Flow Arrows — 60fps Canvas)
 * Biểu diễn hướng nước mưa chảy tràn trên bề mặt từ gò cao xuống rốn trũng.
 */
export function createHydroFlowVectorsLayer(L, getContextFn) {
  const FlowVectors = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '227';
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

      if (!ctxState.enabled || !ctxState.demGrid) return;

      const cLat = Number(ctxState.centerLat);
      const cLng = Number(ctxState.centerLng);
      const rKm = Math.max(1, Number(ctxState.radiusKm) || 5);
      const cosLat = Math.max(0.35, Math.cos((cLat * Math.PI) / 180));
      const maxRadiusDegSq = Math.pow((rKm / 110.574) * 0.96, 2);

      const stepPx = 54;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

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

          ctx.strokeStyle =
            grad.slopeDeg >= 8
              ? 'rgba(194, 65, 12, 0.82)'
              : ctxState.isDark
                ? 'rgba(125, 211, 252, 0.72)'
                : 'rgba(3, 105, 161, 0.65)';

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          const angle = Math.atan2(y1 - y0, x1 - x0);
          const head = 4.2;
          ctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 6), y1 - head * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 6), y1 - head * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
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
        g.addColorStop(0, 'rgba(220, 38, 38, 0.46)');
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

export function buildMapPictogramIcon(L, pt) {
  const size = pt.isOsmLive ? 22 : 26;
  const key = `${pt.confidenceTier}|${pt.layerGroup}|${pt.category}|${size}`;
  let html = MARKER_SVG_CACHE.get(key);
  if (!html) {
    if (pt.confidenceTier === 'C') {
      html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11" fill="#D97706" stroke="#FFFFFF" stroke-width="2.4" stroke-dasharray="3 2"/>
        <text x="14" y="18" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="800" font-family="sans-serif">?</text>
      </svg>`;
    } else if (pt.layerGroup === 'safe') {
      if (pt.category === 'medical') {
        html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
          <circle cx="14" cy="14" r="11.2" fill="#15803D" stroke="#FFFFFF" stroke-width="2.4"/>
          <path d="M14 8.8v10.4M8.8 14h10.4" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>
        </svg>`;
      } else {
        html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
          <circle cx="14" cy="14" r="11.2" fill="#0F766E" stroke="#FFFFFF" stroke-width="2.4"/>
          <path d="M9.4 14.4l3 3 6.2-6.4" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      }
    } else if (pt.category === 'landslide') {
      html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11.2" fill="#C2410C" stroke="#FFFFFF" stroke-width="2.4"/>
        <path d="M14 8.2L20 18.8H8L14 8.2z" fill="#FFFFFF"/>
      </svg>`;
    } else if (pt.category === 'heat' || pt.category === 'salinity') {
      html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11.2" fill="#EA580C" stroke="#FFFFFF" stroke-width="2.4"/>
        <circle cx="14" cy="14" r="4" fill="#FFFFFF"/>
      </svg>`;
    } else {
      html = `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11.2" fill="#DC2626" stroke="#FFFFFF" stroke-width="2.4"/>
        <path d="M8.5 15.6c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0M14 8.6v4.2" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
    }
    MARKER_SVG_CACHE.set(key, html);
  }

  return L.divIcon({
    className: 'vn-pictogram-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}
