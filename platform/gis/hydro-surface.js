/**
 * NATIONAL HYDRO-TERRAIN WATER INUNDATION SURFACE & PICTOGRAPHIC SYMBOL ENGINE
 * Lấy cảm hứng từ chuẩn trực quan hóa của USGS Flood Inundation Mapper (FIM),
 * NOAA National Water Prediction Service (NWPS), Japan JMA Kikikuru & MLIT Hazard Map:
 *
 * 1. Nội suy song tuyến (Bilinear DEM Interpolation) kết hợp:
 *    - Lưới siêu mịn 25×25 (625 điểm Copernicus GLO-30) tại vùng lõi Đông Ngạc (0 ms offline).
 *    - Lưới động 10×10 (100 điểm Copernicus GLO-30 truy xuất 1 lần qua Open-Meteo Elevation API)
 *      cho BẤT KỲ tỉnh/huyện/xã nào trên toàn lãnh thổ Việt Nam, có lưu đệm phiên.
 * 2. Hiển thị mặt phủ nước ngập 3 tầng độ sâu (Xanh lam nhạt -> Xanh thủy văn -> Chàm đậm cảnh báo)
 *    kết hợp phễu thoát nước đô thị quanh điểm ngập đã kiểm chứng và điều chỉnh độ đậm (Opacity).
 * 3. Ký hiệu bản đồ trực quan bằng SVG (Y tế chữ thập +, Điểm trú ✓, Ngập nước ≈, Sạt lở ▲, Chờ duyệt ?).
 */

import { DEM_GRID_2KM, sampleDemBilinear } from '../../dem-grid-2km.js';

const ZONE_DEM_CACHE = new Map();
const SESSION_DEM_PREFIX = 'vn_zone_dem100_v1:';

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

/**
 * Truy xuất lưới địa hình vệ tinh 10×10 (100 điểm — tối đa 1 batch Open-Meteo Elevation API)
 * phủ toàn bộ vòng khoanh bất kỳ tại Việt Nam để dựng mặt phủ vùng trũng ngập nước thực tế.
 */
export async function ensureZoneDemGrid(centerLat, centerLng, radiusKm = 5) {
  const lat = Number(centerLat);
  const lng = Number(centerLng);
  const rKm = Math.max(1.5, Math.min(25, Number(radiusKm) || 5));

  // Nếu nằm trọn trong vùng lõi Đông Ngạc 2km -> dùng ngay lưới 25×25 (625 điểm) độ phân giải cao
  if (isCoveredByCoreDem2km(lat, lng, rKm)) {
    const flat = DEM_GRID_2KM.grid.flat().filter(Number.isFinite).sort((a, b) => a - b);
    return {
      source: 'core_dem_625',
      rows: DEM_GRID_2KM.rows,
      cols: DEM_GRID_2KM.cols,
      minLat: DEM_GRID_2KM.minLat,
      maxLat: DEM_GRID_2KM.maxLat,
      minLng: DEM_GRID_2KM.minLng,
      maxLng: DEM_GRID_2KM.maxLng,
      grid: DEM_GRID_2KM.grid,
      stats: {
        minM: flat[0] ?? 4,
        p25M: computePercentile(flat, 25),
        p45M: computePercentile(flat, 45),
        p65M: computePercentile(flat, 65),
        maxM: flat[flat.length - 1] ?? 20,
        lowlandPct: DEM_GRID_2KM.stats.belowOrEqual11mPct
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

  const rows = 10;
  const cols = 10;
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5500);
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const elevs = Array.isArray(data?.elevation) ? data.elevation.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)) : [];
    if (elevs.length !== rows * cols) return null;

    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid.push(elevs.slice(r * cols, (r + 1) * cols));
    }
    const sorted = [...elevs].sort((a, b) => a - b);
    const p45M = computePercentile(sorted, 45);
    const belowCount = sorted.filter((v) => v <= p45M).length;

    const gridObj = {
      source: 'live_copernicus_100',
      rows,
      cols,
      minLat,
      maxLat,
      minLng,
      maxLng,
      grid,
      stats: {
        minM: Math.round(sorted[0] * 10) / 10,
        p25M: Math.round(computePercentile(sorted, 25) * 10) / 10,
        p45M: Math.round(p45M * 10) / 10,
        p65M: Math.round(computePercentile(sorted, 65) * 10) / 10,
        maxM: Math.round(sorted[sorted.length - 1] * 10) / 10,
        lowlandPct: Math.round((belowCount / sorted.length) * 100)
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
 * Tạo lớp Canvas Mặt phủ Ngập Thủy văn & Đảo nhiệt 60fps trên Leaflet
 * Hỗ trợ toàn quốc dựa trên phân vị địa hình tương đối của vùng khoanh + phễu điểm ngập thực địa.
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
      if (rainMm <= 4) return;

      const cLat = Number(ctxState.centerLat);
      const cLng = Number(ctxState.centerLng);
      const rKm = Math.max(1, Number(ctxState.radiusKm) || 5);
      const cosLat = Math.max(0.35, Math.cos((cLat * Math.PI) / 180));
      const maxRadiusDegSq = Math.pow((rKm / 110.574) * 1.02, 2);
      const fadeStartSq = maxRadiusDegSq * 0.62;

      const demGrid = ctxState.demGrid;
      const stats = demGrid?.stats || { minM: 6, p25M: 8.5, p45M: 10.5, p65M: 13, maxM: 18 };
      const relief = Math.max(1.5, Math.min(32, stats.p65M - stats.minM));
      // Mực dâng tương đối thích ứng mọi địa hình (đồng bằng châu thổ 1–4m, nội đô 6–14m, thung lũng miền núi 100–800m)
      const rainFrac = Math.min(1.25, rainMm / 140);
      const waterSurfaceThreshold = stats.minM + relief * (0.26 + 0.68 * rainFrac);

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
            weight: p.severity === 'severe' ? 1.3 : 0.95
          };
        });

      // Các đoạn sông/kênh trong vùng cũng tạo hành lang dâng nước tự nhiên khi mưa lớn
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

          if (rainMm >= 20) {
            const rFactor = Math.min(1.35, rainMm / 70);
            for (let k = 0; k < floodSpots.length; k++) {
              const sp = floodSpots[k];
              const dx = px - sp.sx;
              const dy = py - sp.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < spotRadSq) {
                depthScore += (1 - d2 / spotRadSq) * sp.weight * 0.9 * rFactor;
              }
            }
            const wwRadSq = spotRadSq * 0.55;
            for (let w = 0; w < waterwayVertices.length; w++) {
              const wv = waterwayVertices[w];
              const dx = px - wv.sx;
              const dy = py - wv.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < wwRadSq) {
                depthScore += (1 - d2 / wwRadSq) * 0.45 * rFactor;
                break;
              }
            }
          }

          depthScore *= edgeFade;
          if (depthScore <= 0.22) continue;

          const idx = (py * wSmall + px) * 4;
          if (depthScore >= 1.32) {
            // Tầng 3: Rốn ngập sâu / lòng máng thấp nhất (Chàm đậm Cobalt-Indigo kiểu JMA/USGS)
            data[idx] = 29;
            data[idx + 1] = 78;
            data[idx + 2] = 216;
            data[idx + 3] = Math.round(Math.min(175, 96 + depthScore * 28) * opacityMul);
          } else if (depthScore >= 0.65) {
            // Tầng 2: Ngập trung bình / hành lang trũng (Xanh thủy văn rõ nét)
            data[idx] = 2;
            data[idx + 1] = 132;
            data[idx + 2] = 199;
            data[idx + 3] = Math.round(Math.min(142, 66 + depthScore * 34) * opacityMul);
          } else {
            // Tầng 1: Đọng nước mặt đường / vùng trũng nhẹ (Xanh lam sáng trong trẻo)
            data[idx] = 14;
            data[idx + 1] = 165;
            data[idx + 2] = 233;
            data[idx + 3] = Math.round(Math.min(98, 34 + depthScore * 46) * opacityMul);
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

/**
 * Biểu tượng ký hiệu bản đồ chuẩn quốc tế (SVG Pictograms):
 * - Cơ sở y tế: Chữ thập trắng trên nền xanh lục bảo (#15803D)
 * - Điểm trú / Hành chính: Dấu kiểm an toàn trên nền xanh ngọc (#0F766E)
 * - Sạt lở đất đá: Tam giác cảnh báo dốc núi (#C2410C)
 * - Điểm ngập nước: Sóng nước trắng trên nền đỏ (#DC2626)
 * - Phản ánh mới chờ kiểm chứng: Vòng tròn nét đứt màu hổ phách (#D97706)
 */
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
