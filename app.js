import { PROJECT_CONFIG } from './config.js';
import {
  latLngToUTM,
  roundPrivacyCoord,
  buildConcentricRings,
  analyzeSurveyPoints,
  analyzeRouteCorridor,
  analyzePolylineCorridor,
  buildTransectSamples,
  summarizeTransectProfile,
  evaluateWeatherScenario,
  computeHydrologicalSpotRisk,
  findNearestSafePoint,
  findNearbyDuplicatePoint,
  exportToGeoJSON,
  exportToKML,
  exportToCSV,
  parseImportedPoints,
  CATEGORY_LABELS
} from './gis-utils.js';

import {
  HUMG_CENTER,
  ERA5_CLIMATE_FACTS,
  EMERGENCY_DIRECTORY,
  ROUTE_PRESETS,
  TRANSECT_PRESETS,
  WEATHER_SCENARIOS,
  HAZARD_FLAGS_META,
  SAMPLE_HUMG_POINTS,
  SAFE_DETOUR_ROUTES,
  FLOOD_STREET_CORRIDORS,
  LOW_DEM_BASINS,
  ALERT_BULLETINS,
  DRILL_QUIZ_QUESTIONS
} from './humg-data.js';

import {
  searchKnowledgeNotebook,
  synthesizeSituationalAnswer,
  buildNotebookLmSourceMarkdown
} from './knowledge-engine.js';

import { DEM_GRID_2KM, sampleDemBilinear } from './dem-grid-2km.js';

const STORAGE_KEY = 'humg_dongngac_community_gis_v9';
const VOTES_KEY = 'humg_dongngac_resident_votes_v3';
const API_URL_KEY = 'humg_dongngac_api_url_v3';
const BROADCAST_KEY = 'humg_dongngac_broadcast_v1';
const LAST_SUBMIT_KEY = 'humg_dongngac_last_submit_ms';

function debounce(fn, waitMs = 140) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/**
 * Kiểm định chất lượng ảnh hiện trường ngay trên trình duyệt bằng phân tích thống kê điểm ảnh <canvas>
 * (Chống ảnh trắng/đen spam, nhận diện ảnh chụp màn hình chat/UI so với khung cảnh đường phố thực tế;
 * tuyệt đối không tự chế số đo độ sâu cm hay nhiệt độ).
 */
function analyzeFieldPhotoHeuristics(canvas, ctx) {
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const step = 4;
  let count = 0;
  let sumLum = 0;
  let sumLumSq = 0;
  let flatExtreme = 0;
  let lowerCount = 0;
  let lowerReflective = 0;
  let brightPixels = 0;

  for (let y = 0; y < height; y += step) {
    const isLowerHalf = y >= height * 0.48;
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

      count++;
      sumLum += lum;
      sumLumSq += lum * lum;
      if (lum > 244 || lum < 11) flatExtreme++;
      if (lum > 205) brightPixels++;

      if (isLowerHalf) {
        lowerCount++;
        if (sat < 0.24 && lum >= 55 && lum <= 205 && b >= r * 0.88) {
          lowerReflective++;
        }
      }
    }
  }

  const meanLum = count ? sumLum / count : 128;
  const variance = count ? Math.max(0, sumLumSq / count - meanLum * meanLum) : 0;
  const stdDev = Math.sqrt(variance);
  const flatRatio = count ? flatExtreme / count : 0;
  const aspect = height / Math.max(1, width);
  const lowerReflectRatio = lowerCount ? lowerReflective / lowerCount : 0;
  const brightRatio = count ? brightPixels / count : 0;

  if (stdDev < 9) {
    return {
      qualityFlag: 'suspect_spam',
      isWarning: true,
      message: 'Cảnh báo kiểm định ảnh: Ảnh quá tối hoặc đơn sắc bất thường — báo cáo sẽ chuyển sang hàng đợi Quản trị viên kiểm tra.'
    };
  }
  if ((aspect > 2.08 || aspect < 0.42) && flatRatio > 0.58) {
    return {
      qualityFlag: 'suspect_spam',
      isWarning: true,
      message: 'Cảnh báo kiểm định ảnh: Tỷ lệ giống ảnh chụp màn hình ứng dụng (không phải ảnh hiện trường) — báo cáo sẽ chờ duyệt thủ công.'
    };
  }
  if (lowerReflectRatio > 0.36 && stdDev >= 16) {
    return {
      qualityFlag: 'verified_scene',
      isWarning: false,
      message: 'Kiểm định ảnh đạt: Nhận diện khung cảnh đường phố có vùng mặt nền ẩm/phản chiếu — đã xóa sạch EXIF/GPS.'
    };
  }
  if (meanLum > 172 && brightRatio > 0.28) {
    return {
      qualityFlag: 'verified_scene',
      isWarning: false,
      message: 'Kiểm định ảnh đạt: Nhận diện khung cảnh ngoài trời cường độ bức xạ sáng cao — đã xóa sạch EXIF/GPS.'
    };
  }
  return {
    qualityFlag: 'ok',
    isWarning: false,
    message: 'Kiểm định ảnh đạt: Ảnh hiện trường hợp lệ — đã xóa sạch tọa độ EXIF/GPS & nén an toàn.'
  };
}

/**
 * Xóa toàn bộ siêu dữ liệu EXIF (tọa độ GPS gốc, tên máy, giờ chụp) bằng cách vẽ lại ảnh qua <canvas>
 * ngay trên thiết bị người dùng, kiểm định điểm ảnh chống spam và nén xuống định dạng JPEG nhẹ (< 45 KB).
 */
async function stripExifAndCompressImage(file, maxDimension = 720, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp ảnh không hợp lệ.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const inspection = analyzeFieldPhotoHeuristics(canvas, ctx);

        // Giảm dần chất lượng nếu vượt quá ngưỡng 42KB để đồng bộ nhanh lên Cloud Blob & thiết bị 4G yếu
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        while (dataUrl.length > 44000 && q > 0.35) {
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        const approxKb = Math.max(1, Math.round((dataUrl.length * 3) / 4 / 1024));
        resolve({ dataUrl, width, height, approxKb, ...inspection });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICON_SVG_CACHE = new Map();

function createMarkerSvg(pt, sizePx = 28) {
  const cacheKey = `${pt.confidenceTier}|${pt.layerGroup}|${pt.category}|${pt.severity}|${sizePx}`;
  const cached = ICON_SVG_CACHE.get(cacheKey);
  if (cached) return cached;

  let svg = '';
  if (pt.confidenceTier === 'C') {
    svg = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" fill="#F59E0B" stroke="#FFFFFF" stroke-width="2.5" stroke-dasharray="3 2"/>
      <text x="14" y="18" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="700" font-family="sans-serif">?</text>
    </svg>`;
  } else if (pt.layerGroup === 'safe') {
    if (pt.category === 'medical') {
      svg = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11.5" fill="#15803D" stroke="#FFFFFF" stroke-width="2.5"/>
        <path d="M14 9v10M9 14h10" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;
    } else {
      svg = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11.5" fill="#0F766E" stroke="#FFFFFF" stroke-width="2.5"/>
        <path d="M9.5 14.5l3 3 6-6.5" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
  } else if (pt.category === 'heat') {
    svg = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11.5" fill="#EA580C" stroke="#FFFFFF" stroke-width="2.5"/>
      <circle cx="14" cy="14" r="4" fill="#FFFFFF"/>
    </svg>`;
  } else {
    const fill = pt.severity === 'severe' ? '#DC2626' : '#EA580C';
    svg = `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11.5" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/>
      <path d="M8.5 15.5c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0M14 8.5v4" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }
  ICON_SVG_CACHE.set(cacheKey, svg);
  return svg;
}

/**
 * Lớp Bản đồ Nhiệt Mật độ Rủi ro bằng HTML5 Canvas siêu nhẹ (0 thư viện ngoài, 60fps với requestAnimationFrame)
 */
function createRiskHeatmapLayer(L, getPointsFn) {
  const HeatLayer = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '250';
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
      const radiusPx = Math.max(28, Math.min(76, (zoom - 11) * 14));
      const pts = (getPointsFn() || []).filter((p) => p.status !== 'hidden' && p.layerGroup === 'risk');

      for (const p of pts) {
        const ptPx = this._map.latLngToContainerPoint([Number(p.lat), Number(p.lng)]);
        if (ptPx.x < -radiusPx || ptPx.y < -radiusPx || ptPx.x > size.x + radiusPx || ptPx.y > size.y + radiusPx) continue;
        const weight = Math.min(1, (p.severity === 'severe' ? 0.52 : 0.36) + Math.min(0.28, (Number(p.confirmCount) || 1) * 0.04));
        const grad = ctx.createRadialGradient(ptPx.x, ptPx.y, 3, ptPx.x, ptPx.y, radiusPx);
        if (p.category === 'heat') {
          grad.addColorStop(0, `rgba(234, 88, 12, ${weight})`);
          grad.addColorStop(0.55, `rgba(251, 146, 60, ${weight * 0.45})`);
          grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        } else {
          grad.addColorStop(0, `rgba(185, 28, 28, ${weight})`);
          grad.addColorStop(0.55, `rgba(239, 68, 68, ${weight * 0.42})`);
          grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ptPx.x, ptPx.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  return new HeatLayer();
}

/**
 * Lớp Mô hình Thủy văn Vùng Ngập Thực tế (Continuous Satellite DEM 625-point Raster + Urban Pluvial Bottlenecks)
 * Giải quyết triệt để hiện tượng ngập diện rộng ngoài thực tế: kết hợp cả (1) ngập lòng máng địa hình DEM <=12m (chiếm 78,5% vùng 2km)
 * và (2) ngập phễu cống hộp quá tải tại các ngõ xóm trọ bê tông hóa dày đặc. Chạy mượt 60fps trên HTML5 Canvas.
 */
function createHydrologicalInundationLayer(L, getStateFn) {
  const HydroLayer = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      this._canvas.style.pointerEvents = 'none';
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '220';
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
      const st = getStateFn();
      const size = this._map.getSize();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, size.x, size.y);

      if (!st.showFloodCorridors || st.activeScenario === 'heat_uhi' || st.simRainMm <= 5) return;

      const rainMm = Number(st.simRainMm) || 70;
      // Ngưỡng mặt nước dâng tương đương theo lượng mưa trên địa hình lòng máng sông Nhuệ (từ 9.4m khi mưa 20mm lên 13.0m khi mưa 140mm)
      const waterElevThreshold = 8.8 + (rainMm / 140) * 4.3;
      const cLat = st.center.lat;
      const cLng = st.center.lng;
      const maxRadiusDegSq = Math.pow((st.radiusKm / 110.5) * 1.03, 2);

      // Vẽ lên offscreen canvas nhỏ rồi phóng mượt bilinear lên màn hình -> đạt 60fps tuyệt đối mà dải nước tự nhiên mềm mại
      const scale = 6;
      const wSmall = Math.max(1, Math.ceil(size.x / scale));
      const hSmall = Math.max(1, Math.ceil(size.y / scale));
      const off = document.createElement('canvas');
      off.width = wSmall;
      off.height = hSmall;
      const octx = off.getContext('2d');
      const img = octx.createImageData(wSmall, hSmall);
      const data = img.data;

      // Chuẩn bị tâm các phễu ngập cục bộ (cống ngõ quá tải ngay cả nơi nền 13–14m)
      const floodSpots = (st.points || [])
        .filter((p) => p.status !== 'hidden' && (p.category === 'flood' || p.category === 'traffic'))
        .map((p) => {
          const px = this._map.latLngToContainerPoint([Number(p.lat), Number(p.lng)]);
          return {
            sx: px.x / scale,
            sy: px.y / scale,
            weight: p.severity === 'severe' ? 1.35 : 0.95
          };
        });

      const zoom = this._map.getZoom();
      const spotRadiusSmall = Math.max(3.5, Math.min(14, Math.pow(1.45, zoom - 12) * 3.8));
      const spotRadSq = spotRadiusSmall * spotRadiusSmall;

      for (let py = 0; py < hSmall; py++) {
        const screenY = py * scale + scale * 0.5;
        for (let px = 0; px < wSmall; px++) {
          const screenX = px * scale + scale * 0.5;
          const ll = this._map.containerPointToLatLng([screenX, screenY]);
          const dLat = ll.lat - cLat;
          const dLng = (ll.lng - cLng) * 0.933;
          if (dLat * dLat + dLng * dLng > maxRadiusDegSq) continue;

          const dem = sampleDemBilinear(ll.lat, ll.lng);
          let depthScore = 0;
          if (dem !== null && dem < waterElevThreshold) {
            depthScore += (waterElevThreshold - dem) * 0.48;
          }

          // Cộng hiệu ứng phễu thoát nước đô thị quanh các ngõ/phố ngập xác thực
          if (rainMm >= 25) {
            const rainFactor = Math.min(1.35, rainMm / 70);
            for (let k = 0; k < floodSpots.length; k++) {
              const sp = floodSpots[k];
              const dx = px - sp.sx;
              const dy = py - sp.sy;
              const d2 = dx * dx + dy * dy;
              if (d2 < spotRadSq) {
                depthScore += (1 - d2 / spotRadSq) * sp.weight * 0.85 * rainFactor;
              }
            }
          }

          if (depthScore <= 0.12) continue;
          const idx = (py * wSmall + px) * 4;
          if (depthScore >= 1.55) {
            // Rốn ngập sâu / xoáy cống (Xanh chàm đậm cảnh báo cao)
            data[idx] = 29;
            data[idx + 1] = 78;
            data[idx + 2] = 216;
            data[idx + 3] = Math.min(158, Math.round(95 + depthScore * 26));
          } else if (depthScore >= 0.65) {
            // Ngập bắp chân / nửa bánh xe (Xanh dương thủy văn rõ nét)
            data[idx] = 2;
            data[idx + 1] = 132;
            data[idx + 2] = 199;
            data[idx + 3] = Math.min(128, Math.round(68 + depthScore * 36));
          } else {
            // Vùng đọng nước mặt đường / ngõ thấp (Xanh lam nhạt)
            data[idx] = 14;
            data[idx + 1] = 165;
            data[idx + 2] = 233;
            data[idx + 3] = Math.min(92, Math.round(36 + depthScore * 55));
          }
        }
      }

      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, wSmall, hSmall, 0, 0, size.x, size.y);
    }
  });
  return new HydroLayer();
}

function setupFormValidationAria() {
  const linkError = (el, shown) => {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);
  let announceTimer;

  const syncAria = (el, announce = false) => {
    if (!el.matches?.('input, select, textarea')) return;
    const supportsUserInvalid = CSS.supports('selector(:user-invalid)');
    const invalid = supportsUserInvalid ? el.matches(':user-invalid') : el.classList.contains('user-invalid-fallback');
    if (invalid) {
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      if (announce && el.dataset.error) {
        const errNode = document.getElementById(el.dataset.error);
        if (errNode) {
          clearTimeout(announceTimer);
          announceTimer = setTimeout(() => {
            announcer.textContent = errNode.textContent.trim();
          }, 450);
        }
      }
    } else {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
    }
  };

  document.querySelectorAll('input, select, textarea').forEach((el) => syncAria(el));
  document.addEventListener('blur', (e) => syncAria(e.target, true), true);
  document.addEventListener('change', (e) => syncAria(e.target, true), true);
  document.addEventListener('input', (e) => syncAria(e.target, false));
  document.addEventListener(
    'invalid',
    (e) => {
      e.target.classList?.add('user-invalid-fallback');
      syncAria(e.target, false);
    },
    true
  );
}

function setupDialogFallbacks() {
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    }
  }
}

async function fetchElevationM(lat, lng) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${Number(lat).toFixed(5)}&longitude=${Number(lng).toFixed(5)}`, {
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const val = data?.elevation?.[0];
    return Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
  } catch {
    return null;
  }
}

async function reverseGeocodeVN(lat, lng) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${Number(lat).toFixed(6)}&lon=${Number(lng).toFixed(6)}&accept-language=vi`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return '';
    const data = await res.json();
    const addr = data?.address || {};
    return [addr.road || addr.pedestrian || data?.name, addr.suburb || addr.quarter].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

function initApp() {
  registerServiceWorker();
  setupFormValidationAria();
  setupDialogFallbacks();

  const L = window.L;
  const turf = window.turf;

  const urlParams = new URLSearchParams(window.location.search);
  const queryApi = urlParams.get('api');
  if (queryApi && queryApi.startsWith('https://script.google.com/')) {
    try {
      localStorage.setItem(API_URL_KEY, queryApi);
    } catch { /* ignore */ }
  }

  let saved = null;
  let votedIds = {};
  let storedApiUrl = '';
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    votedIds = JSON.parse(localStorage.getItem(VOTES_KEY) || '{}') || {};
    storedApiUrl = localStorage.getItem(API_URL_KEY) || '';
  } catch {
    saved = null;
  }

  const state = {
    center: saved?.center || structuredClone(HUMG_CENTER),
    radiusKm: Number(saved?.radiusKm) || PROJECT_CONFIG.defaultRadiusKm,
    showRings: false,
    isExpertMode: false,
    showFloodCorridors: saved?.showFloodCorridors !== undefined ? Boolean(saved.showFloodCorridors) : true,
    showRiskLayer: true,
    showSafeLayer: true,
    showPendingLayer: true,
    showSmartCluster: true,
    activeSbTab: 'explore',
    activeScenario: 'normal',
    simRainMm: 70,
    transectFirstPt: null,
    lastInspectedSpot: null,
    mode: 'pan',
    points: Array.isArray(saved?.points) && saved.points.length > 0 ? saved.points : structuredClone(SAMPLE_HUMG_POINTS),
    filters: { layer: 'all', scope: 'all', search: '', quickCat: 'all' },
    analysis: null,
    apiUrl: storedApiUrl || PROJECT_CONFIG.communityApiUrl || '/api/community',
    pendingPhotoDataUrl: '',
    pendingPhotoQualityFlag: 'ok',
    liveWeatherSnapshot: null,
    lastCloudSyncMs: 0
  };

  function persistState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          center: state.center,
          radiusKm: state.radiusKm,
          showRings: state.showRings,
          showFloodCorridors: state.showFloodCorridors,
          points: state.points
        })
      );
      localStorage.setItem(VOTES_KEY, JSON.stringify(votedIds));
    } catch { /* ignore */ }
  }

  const baseLayers = {
    clean: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'tiles-clean-light',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)'
    }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)'
    }),
    dark: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'tiles-clean-dark',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)'
    }),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: '&copy; OpenStreetMap, SRTM | OpenTopoMap'
    }),
    sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    })
  };

  const map = L.map('map', {
    center: [state.center.lat, state.center.lng],
    zoom: 15,
    layers: [baseLayers.clean],
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  const bufferLayerGroup = L.layerGroup().addTo(map);
  const floodBasinLayerGroup = L.layerGroup().addTo(map);
  const ringsLayerGroup = L.layerGroup().addTo(map);
  const floodCorridorLayerGroup = L.layerGroup().addTo(map);
  const detourLayerGroup = L.layerGroup().addTo(map);
  const riskLayerGroup = L.layerGroup().addTo(map);
  const safeLayerGroup = L.layerGroup().addTo(map);
  const pendingLayerGroup = L.layerGroup().addTo(map);
  const nearestLinkGroup = L.layerGroup().addTo(map);
  const routeCorridorGroup = L.layerGroup().addTo(map);
  const transectLayerGroup = L.layerGroup().addTo(map);
  const spotInspectGroup = L.layerGroup().addTo(map);
  const hydroInundationLayer = createHydrologicalInundationLayer(L, () => state).addTo(map);
  const riskHeatmapLayer = createRiskHeatmapLayer(L, () => state.points);

  const centerIcon = L.divIcon({
    className: 'center-pin-wrap',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#0F766E" fill-opacity="0.22" stroke="#0F766E" stroke-width="2.2"/>
      <circle cx="16" cy="16" r="5" fill="#0F766E" stroke="#FFFFFF" stroke-width="2.2"/>
    </svg>`
  });

  const centerMarker = L.marker([state.center.lat, state.center.lng], {
    icon: centerIcon,
    draggable: false,
    title: 'Trường Đại học Mỏ - Địa chất (18 Phố Viên)'
  }).addTo(map);

  const els = {
    modePanBtn: document.getElementById('mode-pan-btn'),
    modeInspectBtn: document.getElementById('mode-inspect-btn'),
    modeMarkBtn: document.getElementById('mode-mark-btn'),
    modeNearestBtn: document.getElementById('mode-nearest-btn'),
    btnSimpleReport: document.getElementById('btn-simple-report'),
    btnToggleExpert: document.getElementById('btn-toggle-expert'),
    rainPills: document.querySelectorAll('.rain-pill'),
    btnCenterMode: document.getElementById('btn-center-mode'),
    mobBtnInspect: document.getElementById('mob-btn-inspect'),
    mobBtnReport: document.getElementById('mob-btn-report'),
    mobBtnNearest: document.getElementById('mob-btn-nearest'),
    mobBtnDrill: document.getElementById('mob-btn-drill'),
    topMoreMenu: document.getElementById('top-more-menu'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    sidebarFabLabel: document.getElementById('sidebar-fab-label'),
    sbTabBtns: document.querySelectorAll('.sb-tab-btn'),
    openSheetChips: document.querySelectorAll('.js-open-sheet'),
    contextSheet: document.getElementById('context-sheet'),
    sheetTitle: document.getElementById('sheet-title'),
    btnCloseSheet: document.getElementById('btn-close-sheet'),
    sbPaneRoute: document.getElementById('sb-pane-route'),
    sbPaneExplore: document.getElementById('sb-pane-explore'),
    sbPaneList: document.getElementById('sb-pane-list'),
    sbPaneAi: document.getElementById('sb-pane-ai'),
    qcatPills: document.querySelectorAll('.qcat-pill'),
    toggleSmartCluster: document.getElementById('toggle-smart-cluster'),
    spotInspectorCard: document.getElementById('spot-inspector-card'),
    inspTitle: document.getElementById('insp-title'),
    btnCloseInspector: document.getElementById('btn-close-inspector'),
    inspBody: document.getElementById('insp-body'),
    sbAiInput: document.getElementById('sb-ai-input'),
    btnSbAiSend: document.getElementById('btn-sb-ai-send'),
    sbAiChips: document.querySelectorAll('.js-sb-ai-chip'),
    sbAiOutput: document.getElementById('sb-ai-output'),
    sbEmergencyCards: document.getElementById('sb-emergency-cards'),
    modeBanner: document.getElementById('mode-banner'),
    modeBannerText: document.getElementById('mode-banner-text'),
    modeBannerCancel: document.getElementById('mode-banner-cancel'),
    nearestBar: document.getElementById('nearest-result-bar'),
    nearestText: document.getElementById('nearest-result-text'),
    nearestClose: document.getElementById('nearest-bar-close'),
    mapContainer: document.getElementById('map'),

    toggleLayerRisk: document.getElementById('toggle-layer-risk'),
    toggleLayerSafe: document.getElementById('toggle-layer-safe'),
    toggleLayerPending: document.getElementById('toggle-layer-pending'),
    countLayerRisk: document.getElementById('count-layer-risk'),
    countLayerSafe: document.getElementById('count-layer-safe'),
    countLayerPending: document.getElementById('count-layer-pending'),
    btnQuickShelter: document.getElementById('btn-quick-shelter'),

    basemapSelect: document.getElementById('basemap-select'),
    btnFitBuffer: document.getElementById('btn-fit-buffer'),
    cursorCoords: document.getElementById('cursor-coords'),

    searchForm: document.getElementById('search-location-form'),
    locationQuery: document.getElementById('location-query'),
    searchResults: document.getElementById('search-results'),
    btnGeolocate: document.getElementById('btn-geolocate'),
    presetBtns: document.querySelectorAll('.preset-row .chip-btn'),
    quickRadiusBtns: document.querySelectorAll('.js-set-radius'),
    radiusRange: document.getElementById('radius-range'),
    radiusNumber: document.getElementById('radius-number'),
    toggleRings: document.getElementById('toggle-rings'),
    toggleFloodCorridors: document.getElementById('toggle-flood-corridors'),
    toggleHeatmap: document.getElementById('toggle-heatmap'),
    scenarioSelect: document.getElementById('scenario-select'),
    rainSimRange: document.getElementById('rain-sim-range'),
    rainSimVal: document.getElementById('rain-sim-val'),
    scenarioSummaryNote: document.getElementById('scenario-summary-note'),

    btnToggleTransect: document.getElementById('btn-toggle-transect'),
    transectDrawer: document.getElementById('transect-drawer'),
    transectPresetSelect: document.getElementById('transect-preset-select'),
    btnDrawCustomTransect: document.getElementById('btn-draw-custom-transect'),
    btnCloseTransect: document.getElementById('btn-close-transect'),
    transectStatsLine: document.getElementById('transect-stats-line'),
    transectSvgContainer: document.getElementById('transect-svg-container'),

    btnVoiceDictate: document.getElementById('btn-voice-dictate'),
    forecast7dWrap: document.getElementById('forecast-7d-wrap'),
    forecast7dTbody: document.getElementById('forecast-7d-tbody'),

    liveWeatherPill: document.getElementById('live-weather-pill'),
    liveWeatherSummary: document.getElementById('live-weather-summary'),
    liveForecast24h: document.getElementById('live-forecast-24h'),
    netStatusBadge: document.getElementById('net-status-badge'),
    adminBroadcastBanner: document.getElementById('admin-broadcast-banner'),
    adminBroadcastText: document.getElementById('admin-broadcast-text'),
    btnDismissBroadcast: document.getElementById('btn-dismiss-broadcast'),

    btnOpenNotebook: document.getElementById('btn-open-notebook'),
    notebookDialog: document.getElementById('notebook-dialog'),
    btnCloseNotebook: document.getElementById('btn-close-notebook'),
    nbQueryInput: document.getElementById('nb-query-input'),
    btnAskAiCopilot: document.getElementById('btn-ask-ai-copilot'),
    nbAiAnswerWrap: document.getElementById('nb-ai-answer-wrap'),
    btnNbClear: document.getElementById('btn-nb-clear'),
    nbChips: document.querySelectorAll('.js-nb-chip'),
    nbResultsContainer: document.getElementById('nb-results-container'),
    nbEmergencyList: document.getElementById('nb-emergency-list'),
    btnExportNotebookLm: document.getElementById('btn-export-notebooklm'),

    btnOpenRoute: document.getElementById('btn-open-route'),
    routeDialog: document.getElementById('route-dialog'),
    btnCloseRoute: document.getElementById('btn-close-route'),
    routeOriginSelect: document.getElementById('route-origin-select'),
    routeDestSelect: document.getElementById('route-dest-select'),
    btnRunRoute: document.getElementById('btn-run-route'),
    btnSwapRoute: document.getElementById('btn-swap-route'),
    btnClearRouteMap: document.getElementById('btn-clear-route-map'),
    btnViewRouteOnMap: document.getElementById('btn-view-route-on-map'),
    routeResultContainer: document.getElementById('route-result-container'),

    centerUtm: document.getElementById('center-utm'),
    bufferArea: document.getElementById('buffer-area'),
    centerElevation: document.getElementById('center-elevation'),

    statRadiusLabel: document.getElementById('stat-radius-label'),
    statRiskInside: document.getElementById('stat-risk-inside'),
    statVerifiedAB: document.getElementById('stat-verified-ab'),
    statSafeInside: document.getElementById('stat-safe-inside'),
    statConfirmTotal: document.getElementById('stat-confirm-total'),
    statPendingC: document.getElementById('stat-pending-c'),
    shownCount: document.getElementById('shown-count'),

    filterLayer: document.getElementById('filter-layer'),
    filterScope: document.getElementById('filter-scope'),
    filterSearch: document.getElementById('filter-search'),
    exportOnlyInside: document.getElementById('export-only-inside'),
    cardsList: document.getElementById('flood-cards-list'),
    tbody: document.getElementById('flood-tbody'),
    emptyState: document.getElementById('empty-state'),

    btnLoadSample: document.getElementById('btn-load-sample'),
    btnImport: document.getElementById('btn-import'),
    importDialog: document.getElementById('import-dialog'),
    importFileInput: document.getElementById('import-file-input'),
    importReplaceCheckbox: document.getElementById('import-replace-checkbox'),
    importFeedback: document.getElementById('import-feedback'),
    btnConfirmImport: document.getElementById('btn-confirm-import'),
    btnCloseImport: document.getElementById('btn-close-import'),

    btnExportKML: document.getElementById('btn-export-kml'),
    btnExportGeoJSON: document.getElementById('btn-export-geojson'),
    btnExportCSV: document.getElementById('btn-export-csv'),

    pointDialog: document.getElementById('point-dialog'),
    btnClosePointDialog: document.getElementById('btn-close-point-dialog'),
    btnCancelPoint: document.getElementById('btn-cancel-point'),
    pointForm: document.getElementById('point-form'),
    dialogDistancePreview: document.getElementById('dialog-distance-preview'),
    ptId: document.getElementById('pt-id'),
    ptRole: document.getElementById('pt-role'),
    ptCategory: document.getElementById('pt-category'),
    ptName: document.getElementById('pt-name'),
    ptWaterScale: document.getElementById('pt-waterscale'),
    ptFrequency: document.getElementById('pt-frequency'),
    ptPhoto: document.getElementById('pt-photo'),
    ptPhotoPreviewWrap: document.getElementById('pt-photo-preview-wrap'),
    ptPhotoPreview: document.getElementById('pt-photo-preview'),
    ptPhotoMeta: document.getElementById('pt-photo-meta'),
    ptAiVisionBox: document.getElementById('pt-ai-vision-box'),
    ptAiVisionText: document.getElementById('pt-ai-vision-text'),
    btnApplyAiVision: document.getElementById('btn-apply-ai-vision'),
    btnClearPhoto: document.getElementById('btn-clear-photo'),
    ptLat: document.getElementById('pt-lat'),
    ptLng: document.getElementById('pt-lng'),
    ptElevation: document.getElementById('pt-elevation'),
    ptNotes: document.getElementById('pt-notes'),
    ptPrivacyRound: document.getElementById('pt-privacy-round'),
    ptConsent: document.getElementById('pt-consent'),

    thankyouDialog: document.getElementById('thankyou-dialog'),
    btnCloseThankyou: document.getElementById('btn-close-thankyou'),
    thankyouSummary: document.getElementById('thankyou-summary'),
    linkPretestForm: document.getElementById('link-pretest-form'),
    btnThankyouQuiz: document.getElementById('btn-thankyou-quiz'),

    btnOpenClimate: document.getElementById('btn-open-climate'),
    climateDialog: document.getElementById('climate-dialog'),
    btnCloseClimate: document.getElementById('btn-close-climate'),
    era5Tbody: document.getElementById('era5-tbody'),

    btnOpenDrill: document.getElementById('btn-open-drill'),
    drillDialog: document.getElementById('drill-dialog'),
    btnCloseDrill: document.getElementById('btn-close-drill'),
    tabAlertRed: document.getElementById('tab-alert-red'),
    tabAlertYellow: document.getElementById('tab-alert-yellow'),
    alertBox: document.getElementById('alert-bulletin-box'),
    alertBadge: document.getElementById('alert-level-badge'),
    alertHeadline: document.getElementById('alert-headline'),
    alertTimeframe: document.getElementById('alert-timeframe'),
    alertActionsList: document.getElementById('alert-actions-list'),
    btnDrillFindSafe: document.getElementById('btn-drill-find-safe'),
    linkQuizForm: document.getElementById('link-quiz-form'),
    quizContainer: document.getElementById('quiz-questions-container'),
    quizForm: document.getElementById('drill-quiz-form'),
    quizScoreBanner: document.getElementById('quiz-score-banner'),

    btnOpenSync: document.getElementById('btn-open-sync'),
    syncDialog: document.getElementById('sync-dialog'),
    btnCloseSync: document.getElementById('btn-close-sync'),
    apiUrlInput: document.getElementById('api-url-input'),
    btnSaveApi: document.getElementById('btn-save-api'),
    syncStatusMsg: document.getElementById('sync-status-msg'),
    qrUrlInput: document.getElementById('qr-url-input'),
    btnGenerateQr: document.getElementById('btn-generate-qr'),
    qrImage: document.getElementById('qr-image'),
    qrCaption: document.getElementById('qr-caption'),

    btnOpenPrivacy: document.getElementById('btn-open-privacy'),
    privacyDialog: document.getElementById('privacy-dialog'),
    btnClosePrivacy: document.getElementById('btn-close-privacy'),

    toast: document.getElementById('toast')
  };

  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 3800);
  }

  // Nối cấu hình Google Forms từ config.js
  if (PROJECT_CONFIG.preTestFormUrl) {
    els.linkPretestForm.href = PROJECT_CONFIG.preTestFormUrl;
    els.linkPretestForm.hidden = false;
  } else {
    els.linkPretestForm.hidden = true;
  }
  if (PROJECT_CONFIG.drillQuizFormUrl) {
    els.linkQuizForm.href = PROJECT_CONFIG.drillQuizFormUrl;
    els.linkQuizForm.hidden = false;
  }

  els.btnThankyouQuiz.addEventListener('click', () => {
    els.thankyouDialog.close();
    els.drillDialog.showModal();
  });

  let lastAiVisionSuggestion = null;

  // Xử lý chọn ảnh, kiểm định điểm ảnh chống spam, xóa EXIF & phân tích đa phương thức Gemini Vision
  els.ptPhoto.addEventListener('change', async () => {
    const file = els.ptPhoto.files?.[0];
    if (!file) return;
    try {
      const cleaned = await stripExifAndCompressImage(file);
      state.pendingPhotoDataUrl = cleaned.dataUrl;
      state.pendingPhotoQualityFlag = cleaned.qualityFlag || 'ok';
      lastAiVisionSuggestion = null;
      els.ptPhotoPreview.src = cleaned.dataUrl;
      els.ptPhotoMeta.style.color = cleaned.isWarning ? '#b45309' : '#15803d';
      els.ptPhotoMeta.textContent = `${cleaned.message} (${cleaned.width}×${cleaned.height}px · ~${cleaned.approxKb} KB)`;
      els.ptPhotoPreviewWrap.hidden = false;

      if (els.ptAiVisionBox) {
        els.ptAiVisionBox.hidden = false;
        els.btnApplyAiVision.hidden = true;
        els.ptAiVisionText.textContent = 'AI Vision đang kiểm định khung cảnh hiện trường...';
        try {
          const res = await fetch('/api/ai-copilot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'inspect_photo',
              photoDataUrl: cleaned.dataUrl,
              category: els.ptCategory.value
            })
          });
          const data = await res.json();
          if (data?.ok && data.vision) {
            const v = data.vision;
            lastAiVisionSuggestion = v;
            if (!v.isValidScene) {
              state.pendingPhotoQualityFlag = 'suspect_spam';
              els.ptAiVisionBox.style.background = '#fef2f2';
              els.ptAiVisionBox.style.borderColor = '#fecaca';
              els.ptAiVisionBox.style.color = '#b91c1c';
              els.ptAiVisionText.textContent = `Cảnh báo AI Vision: ${v.sceneSummary || 'Ảnh không giống hiện trường đường phố/điểm trú'} (${v.safetyNote || 'Báo cáo sẽ chuyển sang chờ duyệt thủ công'}).`;
            } else {
              state.pendingPhotoQualityFlag = 'verified_scene';
              els.ptAiVisionBox.style.background = '#f0fdfa';
              els.ptAiVisionBox.style.borderColor = '#99f6e4';
              els.ptAiVisionBox.style.color = '#115e59';
              els.ptAiVisionText.textContent = `AI Vision nhận diện: ${v.sceneSummary}${v.safetyNote ? ` — ${v.safetyNote}` : ''}`;
              els.btnApplyAiVision.hidden = false;
            }
          } else {
            els.ptAiVisionBox.hidden = true;
          }
        } catch {
          els.ptAiVisionBox.hidden = true;
        }
      }
    } catch (err) {
      state.pendingPhotoDataUrl = '';
      state.pendingPhotoQualityFlag = 'ok';
      els.ptPhotoPreviewWrap.hidden = true;
      showToast(err.message);
    }
  });

  els.btnApplyAiVision?.addEventListener('click', () => {
    if (!lastAiVisionSuggestion) return;
    if (lastAiVisionSuggestion.suggestedCategory) {
      els.ptCategory.value = lastAiVisionSuggestion.suggestedCategory;
    }
    if (lastAiVisionSuggestion.suggestedWaterScale) {
      els.ptWaterScale.value = lastAiVisionSuggestion.suggestedWaterScale;
    }
    if (Array.isArray(lastAiVisionSuggestion.suggestedHazards)) {
      els.pointForm.querySelectorAll('input[name="hazardFlags"]').forEach((chk) => {
        if (lastAiVisionSuggestion.suggestedHazards.includes(chk.value)) chk.checked = true;
      });
    }
    if (lastAiVisionSuggestion.sceneSummary && !els.ptNotes.value.trim()) {
      els.ptNotes.value = lastAiVisionSuggestion.sceneSummary;
    }
    showToast('Đã điền gợi ý mô tả & mức cảnh báo từ AI Vision!');
  });

  els.btnClearPhoto.addEventListener('click', () => {
    state.pendingPhotoDataUrl = '';
    state.pendingPhotoQualityFlag = 'ok';
    lastAiVisionSuggestion = null;
    els.ptPhoto.value = '';
    els.ptPhotoPreviewWrap.hidden = true;
    if (els.ptAiVisionBox) els.ptAiVisionBox.hidden = true;
  });

  // Bảng dữ liệu khí tượng ERA5 2024–2026
  els.era5Tbody.innerHTML = ERA5_CLIMATE_FACTS.years
    .map(
      (y) => `<tr>
        <td><strong>${y.year}</strong>${y.periodNote ? `<span class="pt-meta-sub">${escapeHtml(y.periodNote)}</span>` : ''}</td>
        <td class="mono-num"><strong>${y.hotDays35}</strong> ngày<span class="pt-meta-sub">(${y.hotDays37} ngày ≥37°C)</span></td>
        <td class="mono-num"><strong>${y.apparentHot40}</strong> ngày</td>
        <td class="mono-num">${y.maxTempC}°C<span class="pt-meta-sub">Cảm nhận: ${y.maxApparentC}°C</span></td>
        <td class="mono-num"><strong>${y.rainDays50mm}</strong> ngày</td>
        <td>${escapeHtml(y.notableEvents)}</td>
      </tr>`
    )
    .join('');

  async function syncFromCloudApi() {
    if (!state.apiUrl) {
      els.syncStatusMsg.textContent = 'Chế độ thử nghiệm cục bộ. Chưa cấu hình Endpoint đồng bộ đám mây.';
      return;
    }
    els.syncStatusMsg.textContent = 'Đang đồng bộ dữ liệu cộng đồng thời gian thực từ Đám mây...';
    try {
      const res = await fetch(state.apiUrl, { cache: 'no-store' });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Phản hồi API không hợp lệ');

      const counts = data.confirmCounts || {};
      const modMap = data.moderationMap || {};

      // 1. Áp dụng kiểm duyệt, chỉnh sửa và cộng lượt +1 toàn cầu cho 32 điểm gốc
      const byId = new Map();
      for (const basePt of SAMPLE_HUMG_POINTS) {
        const mod = modMap[basePt.id] || {};
        const merged = { ...structuredClone(basePt), ...mod };
        const extraVotes = counts[basePt.id] || 0;
        merged.confirmCount = Math.max(Number(merged.confirmCount) || 1, (basePt.confirmCount || 1) + extraVotes);
        byId.set(basePt.id, merged);
      }

      // 2. Giữ lại các điểm người dùng vừa tạo cục bộ (nếu có) và cập nhật toàn bộ báo cáo từ Cloud
      for (const localPt of state.points) {
        if (!byId.has(localPt.id)) byId.set(localPt.id, localPt);
      }
      for (const rep of data.reports || []) {
        byId.set(rep.id, rep);
      }

      state.points = [...byId.values()];
      state.lastCloudSyncMs = Date.now();

      // 3. Đồng bộ Thanh Cảnh báo Trực tiếp từ Quản trị viên Cloud xuống mọi thiết bị người dân
      if (data.broadcast && typeof data.broadcast === 'object') {
        try {
          if (data.broadcast.active && data.broadcast.message) {
            localStorage.setItem(BROADCAST_KEY, JSON.stringify(data.broadcast));
          } else {
            localStorage.removeItem(BROADCAST_KEY);
          }
        } catch { /* ignore */ }
        renderAdminBroadcast();
      }

      recomputeAndRender(false);
      persistState();
      els.syncStatusMsg.textContent = `Đã đồng bộ Cloud toàn vùng lúc ${new Date().toLocaleTimeString('vi-VN')} (${state.points.filter((p) => p.status !== 'hidden').length} điểm hiển thị).`;
    } catch (err) {
      els.syncStatusMsg.textContent = `Đang dùng bộ nhớ đệm Offline (${err.message}).`;
    }
  }

  async function postToCloudApi(payload) {
    if (!state.apiUrl) return null;
    try {
      const isSameOrigin = state.apiUrl.startsWith('/');
      const res = await fetch(state.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': isSameOrigin ? 'application/json' : 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  centerMarker.on('drag', (ev) => {
    const pos = ev.target.getLatLng();
    state.center.lat = Number(pos.lat.toFixed(6));
    state.center.lng = Number(pos.lng.toFixed(6));
    state.center.label = 'Tâm vùng tùy chỉnh';
    els.presetBtns.forEach((b) => b.classList.remove('is-selected'));
    recomputeAndRender(false);
  });

  centerMarker.on('dragend', () => {
    persistState();
    updateCenterElevation();
  });

  const SHEET_TITLES = {
    route: 'Chỉ đường an toàn né vùng ngập',
    ai: 'Hỏi Trợ lý AI & Số khẩn cấp',
    list: 'Danh sách địa điểm quanh trường',
    explore: 'Công cụ Nghiên cứu GIS (Đề tài 08)'
  };

  function closeContextSheet() {
    state.activeSbTab = '';
    if (els.contextSheet) els.contextSheet.hidden = true;
    els.openSheetChips?.forEach((c) => c.classList.remove('is-panel-open'));
  }

  function openContextSheet(paneKey) {
    if (!els.contextSheet) return;
    if (els.spotInspectorCard) els.spotInspectorCard.hidden = true;
    els.nearestBar.hidden = true;
    els.searchResults.hidden = true;

    state.activeSbTab = paneKey;
    els.contextSheet.hidden = false;
    if (els.sheetTitle) els.sheetTitle.textContent = SHEET_TITLES[paneKey] || 'Thông tin chi tiết';

    if (els.sbPaneRoute) els.sbPaneRoute.hidden = paneKey !== 'route';
    if (els.sbPaneAi) els.sbPaneAi.hidden = paneKey !== 'ai';
    if (els.sbPaneList) els.sbPaneList.hidden = paneKey !== 'list';
    if (els.sbPaneExplore) els.sbPaneExplore.hidden = paneKey !== 'explore';

    els.openSheetChips?.forEach((c) => {
      c.classList.toggle('is-panel-open', c.dataset.sheet === paneKey);
    });

    if (paneKey === 'route') {
      evaluateSelectedRoute(true);
    }
  }

  function switchSidebarTab(tabKey) {
    openContextSheet(tabKey);
  }

  els.openSheetChips?.forEach((chip) => {
    chip.addEventListener('click', () => {
      const targetPane = chip.dataset.sheet;
      if (!els.contextSheet?.hidden && state.activeSbTab === targetPane) {
        closeContextSheet();
      } else {
        openContextSheet(targetPane);
      }
    });
  });

  els.btnCloseSheet?.addEventListener('click', closeContextSheet);

  els.sbTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => openContextSheet(btn.dataset.sbtab));
  });

  els.btnToggleExpert?.addEventListener('click', () => {
    state.isExpertMode = !state.isExpertMode;
    document.body.classList.toggle('is-expert-mode', state.isExpertMode);
    els.btnToggleExpert.setAttribute('aria-pressed', String(state.isExpertMode));
    const span = els.btnToggleExpert.querySelector('span');
    if (span) span.textContent = state.isExpertMode ? 'Tắt Chế độ Nghiên cứu GIS' : 'Bật Chế độ Nghiên cứu GIS';
    state.showRings = state.isExpertMode;
    if (els.toggleRings) els.toggleRings.checked = state.isExpertMode;
    if (state.isExpertMode) {
      centerMarker.dragging?.enable();
      openContextSheet('explore');
    } else {
      centerMarker.dragging?.disable();
      closeContextSheet();
      if (els.transectDrawer && !els.transectDrawer.hidden) {
        els.transectDrawer.hidden = true;
        transectLayerGroup.clearLayers();
      }
    }
    recomputeAndRender(false);
    showToast(
      state.isExpertMode
        ? 'Đã mở Công cụ Nghiên cứu GIS (Lát cắt DEM, ERA5, Vòng bán kính & Xuất dữ liệu).'
        : 'Đã quay về giao diện Bản đồ Đơn giản cho người dân.'
    );
  });

  document.addEventListener('click', (e) => {
    if (els.topMoreMenu?.open && !els.topMoreMenu.contains(e.target)) {
      els.topMoreMenu.open = false;
    }
    if (!els.searchResults.hidden && !els.searchForm.parentElement.contains(e.target)) {
      els.searchResults.hidden = true;
    }
  });
  els.topMoreMenu?.querySelector('.nav-dropdown-menu')?.addEventListener('click', () => {
    els.topMoreMenu.open = false;
  });

  els.qcatPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const nextCat = pill.dataset.qcat || 'all';
      state.filters.quickCat = nextCat;
      els.qcatPills.forEach((p) => p.classList.toggle('is-active', p === pill));
      if (nextCat === 'safe' && !state.showSafeLayer) {
        els.toggleLayerSafe.checked = true;
        state.showSafeLayer = true;
        safeLayerGroup.addTo(map);
      } else if ((nextCat === 'flood' || nextCat === 'heat') && !state.showRiskLayer) {
        els.toggleLayerRisk.checked = true;
        state.showRiskLayer = true;
        riskLayerGroup.addTo(map);
      }
      renderFloodCorridorsAndBasins();
      renderMarkersAndTable();
    });
  });

  function setMode(nextMode) {
    state.mode = nextMode;
    for (const [btn, m] of [
      [els.modePanBtn, 'pan'],
      [els.modeInspectBtn, 'inspect'],
      [els.modeMarkBtn, 'mark'],
      [els.modeNearestBtn, 'nearest']
    ]) {
      if (!btn) continue;
      const active = m === nextMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    els.mapContainer.classList.toggle('cursor-crosshair', nextMode !== 'pan');
    if (nextMode === 'inspect') {
      els.modeBannerText.textContent = 'Chạm vào bất kỳ ngõ hoặc nhà nào trên bản đồ để kiểm tra nguy cơ ngập';
      els.modeBanner.hidden = false;
    } else if (nextMode === 'mark') {
      els.modeBannerText.textContent = 'Chạm vào đúng đoạn ngõ / đường trên bản đồ để báo điểm ngập hoặc nắng gắt';
      els.modeBanner.hidden = false;
    } else if (nextMode === 'nearest') {
      els.modeBannerText.textContent = 'Chạm vào vị trí bạn đang đứng để tìm Bệnh viện / Điểm trú mưa gần nhất';
      els.modeBanner.hidden = false;
    } else if (nextMode === 'center') {
      els.modeBannerText.textContent = `Chạm lên bản đồ để dời tâm vùng khảo sát ${state.radiusKm} km`;
      els.modeBanner.hidden = false;
    } else if (nextMode === 'transect') {
      state.transectFirstPt = null;
      els.modeBannerText.textContent = 'Bước 1/2: Chạm chọn Điểm đầu A trên bản đồ để đo mặt cắt địa hình';
      els.modeBanner.hidden = false;
    } else {
      els.modeBanner.hidden = true;
    }
    document.body.classList.toggle('has-mode-banner', !els.modeBanner.hidden);
  }

  els.modePanBtn.addEventListener('click', () => setMode('pan'));
  els.modeInspectBtn?.addEventListener('click', () => setMode(state.mode === 'inspect' ? 'pan' : 'inspect'));
  els.modeMarkBtn.addEventListener('click', () => setMode(state.mode === 'mark' ? 'pan' : 'mark'));
  els.btnSimpleReport?.addEventListener('click', () => setMode(state.mode === 'mark' ? 'pan' : 'mark'));
  els.modeNearestBtn.addEventListener('click', () => setMode(state.mode === 'nearest' ? 'pan' : 'nearest'));
  els.btnCenterMode.addEventListener('click', () => setMode(state.mode === 'center' ? 'pan' : 'center'));
  els.modeBannerCancel.addEventListener('click', () => setMode('pan'));

  // Mobile Bottom Bar triggers
  els.mobBtnInspect?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMode('pan');
    showToast('Chạm trực tiếp vào bất kỳ ngõ nào trên bản đồ để kiểm tra ngay.');
  });
  els.mobBtnReport.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMode('mark');
    showToast('Hãy chạm thẳng vào vị trí ngõ/đường trên bản đồ để đánh dấu.');
  });
  els.mobBtnNearest.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    els.btnQuickShelter.click();
  });
  els.mobBtnDrill.addEventListener('click', () => {
    switchSidebarTab('ai');
    els.sbPaneAi?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => els.sbAiInput?.focus(), 280);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (state.mode !== 'pan') setMode('pan');
      else if (!els.searchResults.hidden) els.searchResults.hidden = true;
      else if (els.spotInspectorCard && !els.spotInspectorCard.hidden) {
        els.spotInspectorCard.hidden = true;
        spotInspectGroup.clearLayers();
      } else if (!els.nearestBar.hidden) {
        els.nearestBar.hidden = true;
        closeContextSheet();
    if (els.spotInspectorCard) els.spotInspectorCard.hidden = true;
    nearestLinkGroup.clearLayers();
      } else if (els.contextSheet && !els.contextSheet.hidden) {
        closeContextSheet();
      }
    }
  });

  els.toggleLayerRisk.addEventListener('change', () => {
    state.showRiskLayer = els.toggleLayerRisk.checked;
    if (state.showRiskLayer) riskLayerGroup.addTo(map);
    else map.removeLayer(riskLayerGroup);
  });

  els.toggleLayerSafe.addEventListener('change', () => {
    state.showSafeLayer = els.toggleLayerSafe.checked;
    if (state.showSafeLayer) {
      safeLayerGroup.addTo(map);
      if (state.showRings) detourLayerGroup.addTo(map);
    } else {
      map.removeLayer(safeLayerGroup);
      map.removeLayer(detourLayerGroup);
    }
  });

  els.toggleLayerPending.addEventListener('change', () => {
    state.showPendingLayer = els.toggleLayerPending.checked;
    if (state.showPendingLayer) pendingLayerGroup.addTo(map);
    else map.removeLayer(pendingLayerGroup);
  });

  const markerMap = new Map();

  async function handleResidentUpvote(pointId) {
    const pt = state.points.find((p) => p.id === pointId);
    if (!pt) return;
    if (votedIds[pointId]) {
      showToast('Thiết bị của bạn đã tích xác nhận cho vị trí này rồi. Cảm ơn bạn!');
      return;
    }
    votedIds[pointId] = new Date().toISOString();
    pt.confirmCount = (Number(pt.confirmCount) || 1) + 1;
    let promoted = false;
    if (pt.confidenceTier === 'C' && pt.confirmCount >= PROJECT_CONFIG.autoPromoteConfirmThreshold) {
      pt.confidenceTier = 'B';
      promoted = true;
    }
    recomputeAndRender(false);
    persistState();

    await postToCloudApi({
      action: 'confirm_point',
      pointId,
      reporterRole: 'Cư dân / Sinh viên xác nhận nhanh',
      waterScale: pt.waterScale || '',
      consentAccepted: true
    });

    showToast(
      promoted
        ? `Đủ ${pt.confirmCount} người dân xác nhận — "${pt.name}" được nâng lên Hạng B (Cộng đồng kiểm chứng)!`
        : `Cảm ơn bạn đã +1 xác nhận tại "${pt.name}" (Tổng: ${pt.confirmCount} lượt).`
    );
  }

  function highlightNearestSafeFrom(lat, lng, originLabel = 'Vị trí đang chọn') {
    if (!state.showSafeLayer) {
      els.toggleLayerSafe.checked = true;
      state.showSafeLayer = true;
      safeLayerGroup.addTo(map);
    }
    const found = findNearestSafePoint(turf, lat, lng, state.points);
    if (!found) {
      showToast('Không tìm thấy điểm an toàn Hạng A/B.');
      return;
    }
    closeContextSheet();
    if (els.spotInspectorCard) els.spotInspectorCard.hidden = true;
    nearestLinkGroup.clearLayers();
    const line = L.polyline([[lat, lng], [found.point.lat, found.point.lng]], {
      color: '#15803D',
      weight: 3.5,
      dashArray: '7 6'
    }).addTo(nearestLinkGroup);

    L.circleMarker([lat, lng], {
      radius: 6,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#EA580C',
      fillOpacity: 1
    })
      .bindTooltip(originLabel)
      .addTo(nearestLinkGroup);

    map.fitBounds(line.getBounds(), { padding: [60, 60], maxZoom: 17 });
    setTimeout(() => markerMap.get(found.point.id)?.openPopup(), 280);

    els.nearestText.innerHTML = `<strong>Điểm an toàn xác thực gần nhất:</strong> ${escapeHtml(found.point.name)}<br>Cách <strong class="mono-num">${found.distanceMeters} m</strong> (${escapeHtml(found.bearingLabel)}) · Đi bộ khoảng <strong>~${found.walkingMinutes} phút</strong>.`;
    els.nearestBar.hidden = false;
  }

  els.nearestClose.addEventListener('click', () => {
    els.nearestBar.hidden = true;
    closeContextSheet();
    if (els.spotInspectorCard) els.spotInspectorCard.hidden = true;
    nearestLinkGroup.clearLayers();
  });

  els.btnQuickShelter.addEventListener('click', () => {
    if (!navigator.geolocation) {
      highlightNearestSafeFrom(21.07168, 105.771249, 'Cầu Phố Viên');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => highlightNearestSafeFrom(pos.coords.latitude, pos.coords.longitude, 'Vị trí hiện tại của bạn'),
      () => {
        highlightNearestSafeFrom(21.07168, 105.771249, 'Cầu Phố Viên (minh họa khi tắt GPS)');
        showToast('Đang minh họa định vị điểm an toàn từ Cầu Phố Viên.');
      },
      { timeout: 5000 }
    );
  });

  let currentBaseKey = 'clean';
  els.basemapSelect.addEventListener('change', () => {
    const nextKey = els.basemapSelect.value;
    if (baseLayers[nextKey] && nextKey !== currentBaseKey) {
      map.removeLayer(baseLayers[currentBaseKey]);
      baseLayers[nextKey].addTo(map);
      currentBaseKey = nextKey;
    }
  });

  els.btnFitBuffer.addEventListener('click', () => {
    map.flyTo([HUMG_CENTER.lat, HUMG_CENTER.lng], 15, { duration: 0.5 });
  });

  let moveRaf = null;
  map.on('mousemove', (e) => {
    const { lat, lng } = e.latlng;
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null;
      const dist = Math.round(turf.distance([state.center.lng, state.center.lat], [lng, lat], { units: 'meters' }));
      const demAtCursor = sampleDemBilinear(lat, lng);
      const demStr = demAtCursor !== null ? ` · DEM: ~${demAtCursor}m${demAtCursor <= 11 ? ' (Vùng trũng)' : demAtCursor >= 15 ? ' (Gò cao)' : ''}` : '';
      els.cursorCoords.textContent = `WGS84: ${lat.toFixed(5)}, ${lng.toFixed(5)} · Cách ĐH Mỏ: ${dist.toLocaleString('vi-VN')} m${demStr}`;
    });
  });

  els.btnCloseInspector?.addEventListener('click', () => {
    if (els.spotInspectorCard) els.spotInspectorCard.hidden = true;
    spotInspectGroup.clearLayers();
  });

  async function inspectSpotAt(lat, lng) {
    if (!els.spotInspectorCard || !els.inspBody) return;
    closeContextSheet();
    els.nearestBar.hidden = true;
    els.searchResults.hidden = true;
    spotInspectGroup.clearLayers();

    let dem = sampleDemBilinear(lat, lng);
    if (dem === null) {
      dem = await fetchElevationM(lat, lng);
    }

    const diag = computeHydrologicalSpotRisk(turf, lat, lng, dem, FLOOD_STREET_CORRIDORS, state.points);
    state.lastInspectedSpot = { ...diag, label: `Tọa độ ${diag.lat.toFixed(5)}, ${diag.lng.toFixed(5)}` };

    L.circleMarker([lat, lng], {
      radius: 9,
      color: '#0284c7',
      weight: 2.5,
      fillColor: '#38bdf8',
      fillOpacity: 0.35
    }).addTo(spotInspectGroup);
    L.circleMarker([lat, lng], {
      radius: 3.5,
      color: '#ffffff',
      weight: 1.5,
      fillColor: '#0284c7',
      fillOpacity: 1
    }).addTo(spotInspectGroup);

    const plainVerdict =
      diag.score >= 70
        ? 'Rất dễ ngập sâu khi mưa to'
        : diag.score >= 45
          ? 'Khá dễ đọng nước khi mưa lớn'
          : diag.score >= 25
            ? 'Ít ngập sâu — chỉ lưu ý đọng nước ngõ'
            : 'Nền đất cao ráo, thoát nước tốt';

    const plainTerrainNote =
      diag.diffVsHumgM !== null
        ? diag.diffVsHumgM <= -2
          ? `Khu đất trũng (thấp hơn cổng ĐH Mỏ khoảng ${Math.abs(diag.diffVsHumgM)}m)`
          : diag.diffVsHumgM < 0
            ? `Nền đất thấp hơn cổng ĐH Mỏ khoảng ${Math.abs(diag.diffVsHumgM)}m`
            : 'Nền đất cao ráo tương đương gò ĐH Mỏ'
        : 'Đang kiểm tra địa hình khu vực';

    const corrText =
      diag.nearestCorridor && diag.nearestCorridor.distanceMeters <= 250
        ? `Nằm gần tuyến hay ngập: <strong>${escapeHtml(diag.nearestCorridor.name)}</strong> (cách ${diag.nearestCorridor.distanceMeters}m).`
        : '';
    const safeText = diag.nearestSafe
      ? `Nơi trú mưa &amp; Y tế gần nhất: <strong>${escapeHtml(diag.nearestSafe.point.name)}</strong> (đi bộ ~${diag.nearestSafe.walkingMinutes} phút · ${diag.nearestSafe.distanceMeters}m).`
      : '';

    els.inspTitle.textContent = 'Kiểm tra nhanh vị trí này';
    els.inspBody.innerHTML = `
      <div id="insp-addr-line" style="font-size:0.78rem;color:#475569;margin-bottom:8px;">
        Đang tìm tên ngõ / đường...
      </div>
      <div style="padding:9px 11px;border-radius:9px;background:${diag.bgHex};border:1px solid ${diag.colorHex}40;margin-bottom:8px;">
        <strong style="display:block;font-size:0.86rem;color:${diag.colorHex};margin-bottom:2px;">${escapeHtml(plainVerdict)}</strong>
        <span style="font-size:0.75rem;color:#334155;">${escapeHtml(plainTerrainNote)}</span>
        <div class="expert-only" style="margin-top:6px;padding-top:5px;border-top:1px dashed ${diag.colorHex}40;font-size:0.72rem;color:#475569;">
          Copernicus DEM: <strong class="mono-num">${diag.dem !== null ? `~${diag.dem} m DSM` : '—'}</strong> · Chỉ số nhạy cảm thủy văn: <strong class="mono-num">${diag.score}/100</strong>
        </div>
      </div>
      ${corrText ? `<p style="margin:0 0 5px;font-size:0.76rem;color:#334155;line-height:1.45;">• ${corrText}</p>` : ''}
      ${safeText ? `<p style="margin:0 0 10px;font-size:0.76rem;color:#14532d;line-height:1.45;">• ${safeText}</p>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${diag.nearestSafe ? `<button type="button" class="btn btn-primary btn-compact js-insp-walk">Chỉ đường đi bộ tới nơi trú</button>` : ''}
        <button type="button" class="btn btn-secondary btn-compact js-insp-report">+ Báo ngập / nắng tại đây</button>
        <button type="button" class="btn btn-secondary btn-compact js-insp-ai">Hỏi AI</button>
      </div>
    `;
    els.spotInspectorCard.hidden = false;

    els.inspBody.querySelector('.js-insp-walk')?.addEventListener('click', async () => {
      if (!diag.nearestSafe) return;
      const sp = diag.nearestSafe.point;
      const coords = await fetchOsrmStreetPath([
        [lng, lat],
        [sp.lng, sp.lat]
      ]);
      const pathLatLngs = coords ? coords.map(([lo, la]) => [la, lo]) : [[lat, lng], [sp.lat, sp.lng]];
      const walkLine = L.polyline(pathLatLngs, {
        color: '#15803D',
        weight: 4,
        dashArray: '7 5',
        opacity: 0.95
      })
        .bindTooltip(`Lối đi bộ tới ${sp.name} (~${diag.nearestSafe.walkingMinutes} phút)`)
        .addTo(spotInspectGroup);
      map.fitBounds(walkLine.getBounds(), { padding: [70, 70], maxZoom: 17 });
      showToast(`Đã vẽ đường đi bộ tới "${sp.name}"!`);
    });

    els.inspBody.querySelector('.js-insp-ai')?.addEventListener('click', () => {
      const addrLabel = state.lastInspectedSpot?.label || 'vị trí đang chọn';
      const q = `Mưa to ở khu vực ${addrLabel} thì có dễ ngập không và đi hướng nào tới nơi trú an toàn?`;
      switchSidebarTab('ai');
      if (els.sbAiInput) els.sbAiInput.value = q;
      askInlineSidebarAi(q, {
        label: addrLabel,
        lat: diag.lat,
        lng: diag.lng,
        dem: diag.dem,
        score: diag.score,
        levelLabel: diag.levelLabel,
        nearestSafeName: diag.nearestSafe?.point?.name || '',
        nearestSafeDistM: diag.nearestSafe?.distanceMeters || null
      });
    });

    els.inspBody.querySelector('.js-insp-report')?.addEventListener('click', () => {
      openPointDialogForNew(lat, lng);
    });

    const streetName = await reverseGeocodeVN(lat, lng);
    const addrEl = document.getElementById('insp-addr-line');
    if (streetName && state.lastInspectedSpot && Math.abs(state.lastInspectedSpot.lat - diag.lat) < 1e-5) {
      state.lastInspectedSpot.label = streetName;
      if (addrEl) {
        addrEl.innerHTML = `<strong>${escapeHtml(streetName)}</strong>`;
      }
    } else if (addrEl) {
      addrEl.textContent = 'Vị trí bạn vừa chạm trên bản đồ';
    }
  }

  let isPopupOpen = false;
  map.on('popupopen', () => {
    isPopupOpen = true;
  });
  map.on('popupclose', () => {
    setTimeout(() => {
      isPopupOpen = false;
    }, 120);
  });

  map.on('click', (e) => {
    if (state.mode === 'inspect' || (state.mode === 'pan' && !isPopupOpen)) {
      inspectSpotAt(e.latlng.lat, e.latlng.lng);
    } else if (state.mode === 'mark') {
      openPointDialogForNew(e.latlng.lat, e.latlng.lng);
    } else if (state.mode === 'nearest') {
      highlightNearestSafeFrom(e.latlng.lat, e.latlng.lng, 'Vị trí đang chọn');
      setMode('pan');
    } else if (state.mode === 'center') {
      updateCenterPosition(e.latlng.lat, e.latlng.lng, 'Tâm khảo sát chọn trên bản đồ', false);
      setMode('pan');
    } else if (state.mode === 'transect') {
      if (!state.transectFirstPt) {
        state.transectFirstPt = { lat: e.latlng.lat, lng: e.latlng.lng, name: 'Điểm A tự chọn' };
        els.modeBannerText.textContent = 'Bước 2/2: Chạm chọn Điểm cuối B để hoàn tất lát cắt địa hình';
      } else {
        const ptA = state.transectFirstPt;
        const ptB = { lat: e.latlng.lat, lng: e.latlng.lng, name: 'Điểm B tự chọn' };
        state.transectFirstPt = null;
        setMode('pan');
        els.transectDrawer.hidden = false;
        runTransectProfile(ptA, ptB);
      }
    }
  });

  map.on('contextmenu', (e) => openPointDialogForNew(e.latlng.lat, e.latlng.lng));

  async function updateCenterElevation() {
    const elev = await fetchElevationM(state.center.lat, state.center.lng);
    if (elev !== null) els.centerElevation.textContent = `~${elev} m DSM`;
  }

  function updateCenterPosition(lat, lng, label, fly = true) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    state.center = { lat: Number(Number(lat).toFixed(6)), lng: Number(Number(lng).toFixed(6)), label };
    centerMarker.setLatLng([state.center.lat, state.center.lng]);
    recomputeAndRender(fly);
    persistState();
    updateCenterElevation();
  }

  els.presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      els.presetBtns.forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      updateCenterPosition(Number(btn.dataset.lat), Number(btn.dataset.lng), btn.dataset.label, true);
    });
  });

  els.btnGeolocate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Thiết bị không hỗ trợ định vị.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => updateCenterPosition(pos.coords.latitude, pos.coords.longitude, 'Vị trí hiện tại của bạn', true),
      () => showToast('Bạn đã từ chối hoặc tắt quyền vị trí GPS.'),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });

  const POPULAR_PLACES = [
    { label: 'Cổng Trường ĐH Mỏ - Địa chất (18 Phố Viên)', lat: 21.072514, lng: 105.77387, color: '#0f766e', pointId: 'S-05' },
    { label: 'Cuối Phố Viên — Đoạn giao ngõ 199 (Hay ngập sâu)', lat: 21.069413, lng: 105.772544, color: '#dc2626', pointId: 'R-01' },
    { label: 'Cầu Noi — Đường Phú Minh (Rốn ngập ven sông Nhuệ)', lat: 21.061634, lng: 105.772358, color: '#dc2626', pointId: 'R-06' },
    { label: 'Ngõ 43 Cổ Nhuế — Xóm trọ sinh viên', lat: 21.058954, lng: 105.780221, color: '#dc2626', pointId: 'R-03' },
    { label: 'Bệnh viện Đa khoa Phương Đông (Số 9 Phố Viên)', lat: 21.070783, lng: 105.777269, color: '#15803d', pointId: 'S-01' },
    { label: 'Khu đô thị Resco — Đường Phạm Văn Đồng', lat: 21.0738, lng: 105.7858, color: '#dc2626', pointId: 'R-02' }
  ];

  function normSearchVi(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .trim();
  }

  function renderInstantSuggestions(rawQuery) {
    const qNorm = normSearchVi(rawQuery);
    if (!qNorm) {
      els.searchResults.innerHTML =
        `<li class="search-group-label">Địa điểm xem nhanh quanh trường</li>` +
        POPULAR_PLACES.map(
          (p, i) => `<li>
            <button type="button" data-pop="${i}">
              <span class="sr-dot" style="background:${p.color};"></span>
              <span>${escapeHtml(p.label)}</span>
            </button>
          </li>`
        ).join('');
      els.searchResults.hidden = false;
      els.searchResults.querySelectorAll('button[data-pop]').forEach((b) => {
        b.addEventListener('click', () => {
          const item = POPULAR_PLACES[Number(b.dataset.pop)];
          els.searchResults.hidden = true;
          els.locationQuery.value = item.label;
          closeContextSheet();
          if (item.pointId && state.points.some((x) => x.id === item.pointId)) {
            flyToAndOpenPoint(item.pointId);
          } else {
            map.flyTo([item.lat, item.lng], 16, { duration: 0.45 });
          }
        });
      });
      return;
    }

    const matches = state.points
      .filter((p) => p.status !== 'hidden' && normSearchVi(`${p.name} ${p.notes || ''} ${p.id}`).includes(qNorm))
      .slice(0, 7);

    if (matches.length === 0) {
      els.searchResults.innerHTML = `<li class="search-group-label">Nhấn Enter để tìm địa chỉ "${escapeHtml(rawQuery)}" trên toàn Đông Ngạc...</li>`;
      els.searchResults.hidden = false;
      return;
    }

    els.searchResults.innerHTML =
      `<li class="search-group-label">Điểm trên bản đồ khớp ngay (${matches.length})</li>` +
      matches
        .map((pt) => {
          const dotColor = pt.layerGroup === 'safe' ? '#15803d' : pt.category === 'heat' ? '#ea580c' : '#dc2626';
          return `<li>
            <button type="button" data-ptid="${escapeHtml(pt.id)}">
              <span class="sr-dot" style="background:${dotColor};"></span>
              <span>${escapeHtml(pt.name)}</span>
            </button>
          </li>`;
        })
        .join('');
    els.searchResults.hidden = false;
    els.searchResults.querySelectorAll('button[data-ptid]').forEach((b) => {
      b.addEventListener('click', () => {
        const pid = b.dataset.ptid;
        const found = state.points.find((x) => x.id === pid);
        els.searchResults.hidden = true;
        if (found) els.locationQuery.value = found.name;
        closeContextSheet();
        flyToAndOpenPoint(pid);
      });
    });
  }

  els.locationQuery.addEventListener('focus', () => {
    renderInstantSuggestions(els.locationQuery.value);
  });
  els.locationQuery.addEventListener('input', () => {
    renderInstantSuggestions(els.locationQuery.value);
  });

  els.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = els.locationQuery.value.trim();
    if (!raw) {
      renderInstantSuggestions('');
      return;
    }
    const qNorm = normSearchVi(raw);
    const exactLocal = state.points.find((p) => p.status !== 'hidden' && normSearchVi(p.name).includes(qNorm));
    if (exactLocal) {
      els.searchResults.hidden = true;
      closeContextSheet();
      flyToAndOpenPoint(exactLocal.id);
      return;
    }
    els.searchResults.hidden = false;
    els.searchResults.innerHTML = `<li class="search-group-label">Đang tìm địa chỉ "${escapeHtml(raw)}"...</li>`;
    try {
      const q = raw.toLowerCase().includes('hà nội') ? raw : `${raw}, Đông Ngạc, Hà Nội`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`
      );
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        els.searchResults.innerHTML = `<li class="search-group-label">Không tìm thấy "${escapeHtml(raw)}". Thử gõ: Phố Viên, Ngõ 43 Cổ Nhuế, Cầu Noi...</li>`;
        return;
      }
      els.searchResults.innerHTML = items
        .map((it, idx) => `<li><button type="button" data-idx="${idx}"><span class="sr-dot" style="background:#0284c7;"></span><span>${escapeHtml(it.display_name)}</span></button></li>`)
        .join('');
      els.searchResults.querySelectorAll('button[data-idx]').forEach((b) => {
        b.addEventListener('click', () => {
          const picked = items[Number(b.dataset.idx)];
          els.searchResults.hidden = true;
          closeContextSheet();
          map.flyTo([Number(picked.lat), Number(picked.lon)], 16);
          inspectSpotAt(Number(picked.lat), Number(picked.lon));
        });
      });
    } catch {
      els.searchResults.innerHTML = `<li class="search-group-label">Tạm thời không kết nối được máy chủ tìm địa chỉ.</li>`;
    }
  });

  function applyRadius(val, fit = false) {
    const num = Math.min(10, Math.max(0.4, Number(val) || 2.0));
    state.radiusKm = Math.round(num * 10) / 10;
    els.radiusRange.value = String(Math.min(5, state.radiusKm));
    els.radiusNumber.value = String(state.radiusKm);
    recomputeAndRender(fit);
    persistState();
  }

  els.radiusRange.addEventListener('input', () => applyRadius(els.radiusRange.value, false));
  els.radiusNumber.addEventListener('change', () => applyRadius(els.radiusNumber.value, true));
  els.quickRadiusBtns.forEach((b) => b.addEventListener('click', () => applyRadius(Number(b.dataset.r), true)));

  els.toggleRings.addEventListener('change', () => {
    state.showRings = els.toggleRings.checked;
    recomputeAndRender(false);
    persistState();
  });

  if (els.toggleFloodCorridors) {
    els.toggleFloodCorridors.checked = state.showFloodCorridors;
    els.toggleFloodCorridors.addEventListener('change', () => {
      state.showFloodCorridors = els.toggleFloodCorridors.checked;
      renderFloodCorridorsAndBasins();
      hydroInundationLayer.redraw();
      persistState();
    });
  }

  if (els.toggleSmartCluster) {
    els.toggleSmartCluster.checked = state.showSmartCluster;
    els.toggleSmartCluster.addEventListener('change', () => {
      state.showSmartCluster = els.toggleSmartCluster.checked;
      renderMarkersAndTable();
    });
  }

  map.on('zoomend', () => {
    renderMarkersAndTable();
  });

  function renderFloodCorridorsAndBasins() {
    floodBasinLayerGroup.clearLayers();
    floodCorridorLayerGroup.clearLayers();
    if (!state.showFloodCorridors || state.activeScenario === 'heat_uhi') return;

    const scenRainMm = state.simRainMm || 70;
    const isRainSim = state.activeScenario.startsWith('rain_');

    for (const fc of FLOOD_STREET_CORRIDORS) {
      if (scenRainMm < fc.rainThresholdMm) continue;
      const latLngs = fc.coordinates.map(([lng, lat]) => [lat, lng]);

      L.polyline(latLngs, {
        color: '#0284c7',
        weight: isRainSim ? 9.5 : 7,
        opacity: isRainSim ? 0.42 : 0.3,
        lineCap: 'round',
        interactive: false
      }).addTo(floodCorridorLayerGroup);

      const coreLine = L.polyline(latLngs, {
        color: fc.severity === 'severe' ? '#dc2626' : '#ea580c',
        weight: isRainSim ? 3.6 : 2.6,
        dashArray: fc.severity === 'severe' ? undefined : '6 5',
        opacity: isRainSim ? 0.94 : 0.84,
        lineCap: 'round'
      }).addTo(floodCorridorLayerGroup);

      coreLine.bindPopup(
        `<div class="popup-card">
          <h3>${escapeHtml(fc.name)}</h3>
          <p class="popup-meta"><strong>Ngưỡng mưa gây ngập:</strong> ≥ <span class="mono-num">${fc.rainThresholdMm} mm</span></p>
          <div class="popup-source-box"><strong>Nguồn hình học &amp; báo chí:</strong> ${escapeHtml(fc.source)}</div>
          <p class="popup-meta">${escapeHtml(fc.note)}</p>
        </div>`
      );
    }
    hydroInundationLayer.redraw();
  }

  els.toggleHeatmap.addEventListener('change', () => {
    if (els.toggleHeatmap.checked) {
      riskHeatmapLayer.addTo(map);
    } else {
      map.removeLayer(riskHeatmapLayer);
    }
  });

  els.filterLayer.addEventListener('change', () => {
    state.filters.layer = els.filterLayer.value;
    renderFloodCorridorsAndBasins();
    renderMarkersAndTable();
  });
  els.filterScope.addEventListener('change', () => {
    state.filters.scope = els.filterScope.value;
    renderFloodCorridorsAndBasins();
    renderMarkersAndTable();
  });
  els.filterSearch.addEventListener(
    'input',
    debounce(() => {
      state.filters.search = els.filterSearch.value.trim().toLowerCase();
      renderMarkersAndTable();
    }, 140)
  );

  function recomputeAndRender(flyToBuffer = false) {
    state.analysis = analyzeSurveyPoints(turf, state.points, state.center.lat, state.center.lng, state.radiusKm);

    const utm = latLngToUTM(state.center.lat, state.center.lng, 48);
    els.centerUtm.textContent = `${utm.easting.toFixed(1)} E · ${utm.northing.toFixed(1)} N`;
    els.bufferArea.textContent = `${state.analysis.areaKm2.toFixed(2)} km²`;
    els.statRadiusLabel.textContent = String(state.radiusKm);

    els.statRiskInside.textContent = String(state.analysis.stats.riskInside);
    els.statVerifiedAB.textContent = String(state.analysis.stats.verifiedABInside);
    els.statSafeInside.textContent = String(state.analysis.stats.safeInside);
    els.statConfirmTotal.textContent = String(state.analysis.stats.totalConfirmations);
    els.statPendingC.textContent = String(state.analysis.stats.communityPendingC);

    const riskAB = state.analysis.points.filter((p) => p.layerGroup === 'risk' && p.confidenceTier !== 'C').length;
    const safeAB = state.analysis.points.filter((p) => p.layerGroup === 'safe' && p.confidenceTier !== 'C').length;
    const pendingC = state.analysis.points.filter((p) => p.confidenceTier === 'C').length;
    els.countLayerRisk.textContent = String(riskAB);
    els.countLayerSafe.textContent = String(safeAB);
    els.countLayerPending.textContent = String(pendingC);

    bufferLayerGroup.clearLayers();
    const bufferGeoLayer = L.geoJSON(state.analysis.bufferPolygon, {
      interactive: false,
      style: state.isExpertMode
        ? { color: '#0F766E', weight: 2.5, opacity: 0.95, fillColor: '#0F766E', fillOpacity: 0.06 }
        : { color: '#0F766E', weight: 1.2, opacity: 0.25, dashArray: '6 6', fill: false }
    }).addTo(bufferLayerGroup);

    ringsLayerGroup.clearLayers();
    detourLayerGroup.clearLayers();
    if (state.showRings) {
      for (const ring of buildConcentricRings(turf, state.center.lat, state.center.lng, state.radiusKm)) {
        L.geoJSON(ring.polygon, {
          interactive: false,
          style: { color: '#0F766E', weight: 1, dashArray: '4 5', opacity: 0.5, fill: false }
        }).addTo(ringsLayerGroup);

        const northPt = turf.destination([state.center.lng, state.center.lat], ring.radiusKm, 0, { units: 'kilometers' });
        const [nLng, nLat] = northPt.geometry.coordinates;
        const labelText = ring.radiusKm < 1 ? `${Math.round(ring.radiusKm * 1000)}m` : `${ring.radiusKm}km`;
        L.marker([nLat, nLng], {
          interactive: false,
          icon: L.divIcon({
            className: 'ring-label-wrapper',
            html: `<span class="ring-label-icon">${labelText}</span>`,
            iconSize: [44, 18],
            iconAnchor: [22, 9]
          })
        }).addTo(ringsLayerGroup);
      }

      for (const route of SAFE_DETOUR_ROUTES) {
        L.polyline(
          route.coordinates.map(([lng, lat]) => [lat, lng]),
          { color: '#15803D', weight: 3.2, dashArray: '8 6', opacity: 0.82 }
        )
          .bindTooltip(route.name)
          .addTo(detourLayerGroup);
      }
    }

    renderFloodCorridorsAndBasins();
    renderMarkersAndTable();
    if (els.toggleHeatmap?.checked) riskHeatmapLayer.redraw();
    if (flyToBuffer) map.fitBounds(bufferGeoLayer.getBounds(), { padding: [26, 26] });
  }

  function getFilteredPoints() {
    if (!state.analysis) return [];
    return state.analysis.points
      .filter((p) => {
        if (p.status === 'hidden') return false;
        if (state.filters.quickCat === 'flood' && p.category !== 'flood' && p.category !== 'traffic') return false;
        if (state.filters.quickCat === 'heat' && p.category !== 'heat') return false;
        if (state.filters.quickCat === 'safe' && p.layerGroup !== 'safe') return false;
        if (state.filters.layer === 'risk' && p.layerGroup !== 'risk') return false;
        if (state.filters.layer === 'safe' && p.layerGroup !== 'safe') return false;
        if (state.filters.layer === 'tierC' && p.confidenceTier !== 'C') return false;
        if (state.filters.scope === 'inside' && !p.insideBuffer) return false;
        if (state.filters.scope === 'outside' && p.insideBuffer) return false;
        if (state.filters.search) {
          const hay = `${p.id} ${p.name} ${p.sourceCitation || ''} ${p.notes || ''} ${CATEGORY_LABELS[p.category] || ''}`.toLowerCase();
          if (!hay.includes(state.filters.search)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.insideBuffer !== b.insideBuffer) return a.insideBuffer ? -1 : 1;
        return a.distanceMeters - b.distanceMeters;
      });
  }

  function flyToAndOpenPoint(pointId) {
    const pt = state.points.find((p) => p.id === pointId);
    if (!pt) return;
    const targetZoom = Math.max(map.getZoom(), 16);
    map.flyTo([pt.lat, pt.lng], targetZoom, { duration: 0.45 });
    setTimeout(() => {
      markerMap.get(pointId)?.openPopup();
    }, 480);
  }

  function buildSpatialClusters(pointsList, radiusMeters) {
    const used = new Set();
    const clusters = [];
    for (let i = 0; i < pointsList.length; i++) {
      const seed = pointsList[i];
      if (used.has(seed.id)) continue;
      used.add(seed.id);
      const groupKey = seed.confidenceTier === 'C' ? 'pending' : seed.layerGroup;
      const members = [seed];
      for (let j = i + 1; j < pointsList.length; j++) {
        const cand = pointsList[j];
        if (used.has(cand.id)) continue;
        const candGroup = cand.confidenceTier === 'C' ? 'pending' : cand.layerGroup;
        if (candGroup !== groupKey) continue;
        const d = turf.distance([Number(seed.lng), Number(seed.lat)], [Number(cand.lng), Number(cand.lat)], { units: 'meters' });
        if (d <= radiusMeters) {
          used.add(cand.id);
          members.push(cand);
        }
      }
      clusters.push({ groupKey, members });
    }
    return clusters;
  }

  function renderMarkersAndTable() {
    riskLayerGroup.clearLayers();
    safeLayerGroup.clearLayers();
    pendingLayerGroup.clearLayers();
    markerMap.clear();

    const filtered = getFilteredPoints();
    els.shownCount.textContent = String(filtered.length);
    const scenEval = evaluateWeatherScenario(state.points, state.activeScenario);
    const zoom = map.getZoom();
    const markerSizePx = zoom <= 14 ? 22 : 27;
    const enableClusterNow = Boolean(state.showSmartCluster && zoom <= 14 && state.activeScenario === 'normal');
    const clusterRadiusM = zoom <= 12 ? 420 : zoom === 13 ? 250 : 125;

    const groupsToRender = enableClusterNow
      ? buildSpatialClusters(filtered, clusterRadiusM)
      : filtered.map((pt) => ({ groupKey: pt.confidenceTier === 'C' ? 'pending' : pt.layerGroup, members: [pt] }));

    for (const grp of groupsToRender) {
      const targetGroup =
        grp.groupKey === 'pending'
          ? pendingLayerGroup
          : grp.groupKey === 'safe'
            ? safeLayerGroup
            : riskLayerGroup;

      if (grp.members.length >= 2) {
        const avgLat = grp.members.reduce((s, p) => s + Number(p.lat), 0) / grp.members.length;
        const avgLng = grp.members.reduce((s, p) => s + Number(p.lng), 0) / grp.members.length;
        const isSafeCls = grp.groupKey === 'safe' ? 'is-safe-cluster' : '';
        const previewNames = grp.members.slice(0, 3).map((m) => m.name).join(' · ');
        const clusterMarker = L.marker([avgLat, avgLng], {
          icon: L.divIcon({
            className: 'cluster-marker-wrap',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            html: `<div class="cluster-pill ${isSafeCls}">${grp.members.length}</div>`
          }),
          title: `Cụm ${grp.members.length} điểm — Bấm để phóng to`
        }).addTo(targetGroup);

        clusterMarker.bindTooltip(
          `<strong>Cụm ${grp.members.length} điểm ${grp.groupKey === 'safe' ? 'An toàn' : 'Rủi ro'}</strong><br>${escapeHtml(previewNames)}${grp.members.length > 3 ? '…' : ''}<br><em>Bấm để phóng to tách từng điểm</em>`,
          { direction: 'top', offset: [0, -14] }
        );
        clusterMarker.on('click', () => {
          map.flyTo([avgLat, avgLng], Math.min(17, zoom + 2), { duration: 0.42 });
        });
        continue;
      }

      const pt = grp.members[0];
      const isScenMatch = scenEval.highlightedIds.has(pt.id);
      const scenCls = scenEval.dimNonMatching
        ? isScenMatch
          ? 'scenario-active-marker'
          : 'scenario-dim-marker'
        : '';

      const marker = L.marker([pt.lat, pt.lng], {
        icon: L.divIcon({
          className: `flood-marker-wrap ${pt.insideBuffer ? 'inside-marker' : 'outside-marker'} ${scenCls}`,
          iconSize: [markerSizePx + 2, markerSizePx + 2],
          iconAnchor: [(markerSizePx + 2) / 2, (markerSizePx + 2) / 2],
          popupAnchor: [0, -12],
          html: createMarkerSvg(pt, markerSizePx)
        }),
        title: `[Hạng ${pt.confidenceTier}] ${pt.name}`
      }).addTo(targetGroup);

      marker.bindTooltip(`${pt.name}`, {
        direction: 'top',
        offset: [0, -10]
      });

      const hasVoted = Boolean(votedIds[pt.id]);
      const demVal = pt.elevationM ?? sampleDemBilinear(pt.lat, pt.lng);
      const hazardHtml =
        pt.hazardFlags && pt.hazardFlags.length > 0
          ? `<p class="popup-meta" style="color:#B91C1C;font-weight:600;">Lưu ý: ${pt.hazardFlags.map((f) => escapeHtml(HAZARD_FLAGS_META[f] || f)).join(' · ')}</p>`
          : '';
      const photoHtml =
        pt.photoDataUrl && pt.photoDataUrl.startsWith('data:image/')
          ? `<img class="popup-photo" src="${pt.photoDataUrl}" alt="Ảnh hiện trường">`
          : '';

      const popupEl = document.createElement('div');
      popupEl.className = 'popup-card';
      popupEl.innerHTML = `
        <h3><span class="expert-only">[${escapeHtml(pt.id)}] </span>${escapeHtml(pt.name)}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
          <span class="tier-tag tier-${escapeHtml(pt.confidenceTier)} expert-only">Hạng ${escapeHtml(pt.confidenceTier)}</span>
          <span class="sev-badge ${pt.confidenceTier === 'C' ? 'sev-pending' : pt.layerGroup === 'safe' ? 'sev-safe' : `sev-${pt.severity}`}">
            ${escapeHtml(CATEGORY_LABELS[pt.category] || pt.category)}
          </span>
          ${demVal !== null ? `<span class="dem-pill ${demVal <= 12 ? 'is-low' : ''} expert-only">DEM ~${demVal}m</span>` : ''}
        </div>
        ${photoHtml}
        ${pt.layerGroup === 'risk' ? `<p class="popup-meta"><strong>Tình trạng:</strong> ${escapeHtml(pt.waterScaleLabel)}</p>` : ''}
        ${hazardHtml}
        <p class="popup-meta" style="font-size:0.75rem;">Đã có <strong class="mono-num">${pt.confirmCount}</strong> người xác nhận · Cách ĐH Mỏ <span class="mono-num">${pt.distanceMeters} m</span></p>
        <div class="popup-source-box expert-only">
          <strong>Nguồn kiểm chứng:</strong> ${escapeHtml(pt.sourceCitation || pt.sourceType)}
          ${pt.observedDate ? `<br><strong>Mốc ghi nhận:</strong> ${escapeHtml(pt.observedDate)}` : ''}
        </div>
        ${pt.notes ? `<p class="popup-meta">${escapeHtml(pt.notes)}</p>` : ''}
        <div class="popup-actions">
          <button type="button" class="btn btn-compact btn-upvote ${hasVoted ? 'is-voted' : ''} js-upvote-pt">
            ${hasVoted ? `Đã xác nhận (${pt.confirmCount})` : `+1 Tôi cũng gặp (${pt.confirmCount})`}
          </button>
          ${pt.layerGroup === 'risk' ? `<button type="button" class="btn btn-primary btn-compact js-find-shelter">Nơi trú gần đây</button>` : ''}
          <button type="button" class="btn btn-secondary btn-compact js-share-pt" title="Sao chép đường link dẫn thẳng tới điểm này">Chia sẻ</button>
        </div>
      `;

      popupEl.querySelector('.js-upvote-pt').addEventListener('click', () => handleResidentUpvote(pt.id));
      popupEl.querySelector('.js-find-shelter')?.addEventListener('click', () => {
        marker.closePopup();
        highlightNearestSafeFrom(pt.lat, pt.lng, pt.name);
      });
      popupEl.querySelector('.js-share-pt').addEventListener('click', async () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?point=${encodeURIComponent(pt.id)}`;
        await navigator.clipboard?.writeText(shareUrl);
        showToast('Đã sao chép đường dẫn vị trí để gửi qua Zalo / Facebook!');
      });

      marker.bindPopup(popupEl, {
        autoPanPaddingTopLeft: [16, 56],
        autoPanPaddingBottomRight: [16, 48]
      });
      markerMap.set(pt.id, marker);
    }

    if (filtered.length === 0) {
      if (els.cardsList) els.cardsList.innerHTML = '';
      els.tbody.innerHTML = '';
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    if (els.cardsList) {
      els.cardsList.innerHTML = filtered
        .map((pt) => {
          const hasVoted = Boolean(votedIds[pt.id]);
          const badgeClass = pt.confidenceTier === 'C' ? 'sev-pending' : pt.layerGroup === 'safe' ? 'sev-safe' : `sev-${pt.severity}`;
          const demVal = pt.elevationM ?? sampleDemBilinear(pt.lat, pt.lng);
          const simpleSub =
            pt.layerGroup === 'risk' && pt.waterScaleLabel && pt.waterScale !== 'none'
              ? pt.waterScaleLabel
              : pt.notes
                ? pt.notes.slice(0, 90)
                : pt.sourceCitation || pt.sourceType;
          return `<article class="pt-item-card ${pt.insideBuffer ? '' : 'is-outside'}">
            <div class="pt-card-top">
              <div class="pt-card-badges">
                <span class="tier-tag tier-${escapeHtml(pt.confidenceTier)} expert-only">Hạng ${escapeHtml(pt.confidenceTier)}</span>
                <span class="sev-badge ${badgeClass}">${escapeHtml(CATEGORY_LABELS[pt.category] || pt.category)}</span>
                ${demVal !== null ? `<span class="dem-pill ${demVal <= 12 ? 'is-low' : ''} expert-only">DEM ${demVal}m</span>` : ''}
              </div>
              <span class="pt-card-dist">${pt.distanceMeters} m</span>
            </div>
            <button type="button" class="pt-title-btn js-focus-pt" data-id="${escapeHtml(pt.id)}"><span class="expert-only">[${escapeHtml(pt.id)}] </span>${escapeHtml(pt.name)}</button>
            <span class="pt-meta-sub">${escapeHtml(simpleSub)}</span>
            <div class="pt-card-foot">
              <button type="button" class="btn btn-compact btn-upvote ${hasVoted ? 'is-voted' : ''} js-upvote-row" data-id="${escapeHtml(pt.id)}">
                ${hasVoted ? `Đã xác nhận (${pt.confirmCount})` : `+1 Tôi cũng gặp (${pt.confirmCount})`}
              </button>
              <button type="button" class="btn btn-secondary btn-compact js-focus-pt" data-id="${escapeHtml(pt.id)}">Xem bản đồ →</button>
            </div>
          </article>`;
        })
        .join('');
    }
  }

  const handleListCardAction = (e) => {
    const upBtn = e.target.closest('.js-upvote-row');
    if (upBtn) {
      handleResidentUpvote(upBtn.dataset.id);
      return;
    }
    const focusBtn = e.target.closest('.js-focus-pt');
    if (focusBtn) {
      flyToAndOpenPoint(focusBtn.dataset.id);
    }
  };
  els.cardsList?.addEventListener('click', handleListCardAction);
  els.tbody.addEventListener('click', handleListCardAction);

  function updateDialogDistanceBanner() {
    const lat = Number(els.ptLat.value);
    const lng = Number(els.ptLng.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const dist = Math.round(turf.distance([state.center.lng, state.center.lat], [lng, lat], { units: 'meters' }));
    const inside = dist <= state.radiusKm * 1000;
    els.dialogDistancePreview.classList.toggle('is-outside', !inside);
    els.dialogDistancePreview.textContent = inside
      ? `Vị trí cách ĐH Mỏ ${dist.toLocaleString('vi-VN')} m — Nằm TRONG vùng khảo sát ${state.radiusKm} km`
      : `Vị trí cách ĐH Mỏ ${dist.toLocaleString('vi-VN')} m — Nằm NGOÀI ranh giới ${state.radiusKm} km`;
  }

  els.ptCategory.addEventListener('change', () => {
    if (['shelter', 'medical'].includes(els.ptCategory.value)) {
      els.ptWaterScale.value = 'none';
      els.ptFrequency.value = 'Mở cửa hỗ trợ thường xuyên';
    } else if (els.ptCategory.value === 'heat') {
      els.ptWaterScale.value = 'none';
      els.ptFrequency.value = 'Nắng gắt thường xuyên khung 11h00 – 15h00';
    } else {
      els.ptWaterScale.value = 'half_wheel';
    }
  });

  els.ptLat.addEventListener('input', updateDialogDistanceBanner);
  els.ptLng.addEventListener('input', updateDialogDistanceBanner);

  async function openPointDialogForNew(lat, lng) {
    els.pointForm.reset();
    els.ptId.value = '';
    state.pendingPhotoDataUrl = '';
    els.ptPhotoPreviewWrap.hidden = true;
    els.ptConsent.checked = false;
    els.ptConsent.classList.remove('user-invalid-fallback');
    els.ptLat.value = Number(lat).toFixed(6);
    els.ptLng.value = Number(lng).toFixed(6);
    updateDialogDistanceBanner();

    els.pointDialog.returnValue = '';
    els.pointDialog.showModal();
    els.ptName.focus();

    const [suggestedName, elev] = await Promise.all([reverseGeocodeVN(lat, lng), fetchElevationM(lat, lng)]);
    if (els.pointDialog.open && !els.ptId.value) {
      if (suggestedName && !els.ptName.value.trim()) els.ptName.value = suggestedName;
      if (elev !== null && !els.ptElevation.value) els.ptElevation.value = String(elev);
    }
  }

  els.btnClosePointDialog.addEventListener('click', () => els.pointDialog.close('cancel'));
  els.btnCancelPoint.addEventListener('click', () => els.pointDialog.close('cancel'));

  els.pointForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!els.pointForm.checkValidity()) {
      els.pointForm.querySelector(':invalid')?.focus();
      return;
    }

    // Chống gửi rác liên tục trong 20 giây trên cùng thiết bị
    const lastMs = Number(localStorage.getItem(LAST_SUBMIT_KEY) || 0);
    const nowMs = Date.now();
    if (nowMs - lastMs < PROJECT_CONFIG.enableRateLimitSeconds * 1000) {
      const waitSec = Math.ceil((PROJECT_CONFIG.enableRateLimitSeconds * 1000 - (nowMs - lastMs)) / 1000);
      showToast(`Vui lòng đợi ${waitSec} giây trước khi gửi điểm tiếp theo để chống spam.`);
      return;
    }
    try {
      localStorage.setItem(LAST_SUBMIT_KEY, String(nowMs));
    } catch { /* ignore */ }

    const cat = els.ptCategory.value;
    const layerGroup = ['shelter', 'medical'].includes(cat) ? 'safe' : 'risk';
    const round20m = els.ptPrivacyRound.checked;
    const finalLat = roundPrivacyCoord(els.ptLat.value, round20m);
    const finalLng = roundPrivacyCoord(els.ptLng.value, round20m);

    const checkedHazards = [...els.pointForm.querySelectorAll('input[name="hazardFlags"]:checked')].map((c) => c.value);
    const role = els.ptRole.value;
    const isFieldTeam = role.includes('nhóm khảo sát thực địa');

    const dup = findNearbyDuplicatePoint(turf, state.points, finalLat, finalLng, cat, PROJECT_CONFIG.duplicateMergeRadiusMeters);
    if (dup) {
      dup.confirmCount = (Number(dup.confirmCount) || 1) + 1;
      if (dup.confidenceTier === 'C' && dup.confirmCount >= PROJECT_CONFIG.autoPromoteConfirmThreshold) dup.confidenceTier = 'B';
      if (els.ptNotes.value.trim()) {
        dup.notes = `${dup.notes ? dup.notes + ' | ' : ''}Bổ sung (${role}): ${els.ptNotes.value.trim()}`;
      }
      if (state.pendingPhotoDataUrl && !dup.photoDataUrl) {
        dup.photoDataUrl = state.pendingPhotoDataUrl;
      }
      votedIds[dup.id] = new Date().toISOString();
      els.pointDialog.close('merged');
      setMode('pan');
      recomputeAndRender(false);
      persistState();
      await postToCloudApi({
        action: 'confirm_point',
        pointId: dup.id,
        reporterRole: role,
        waterScale: els.ptWaterScale.value,
        comment: els.ptNotes.value.trim(),
        consentAccepted: true
      });
      els.thankyouSummary.textContent = `Vị trí bạn chấm trùng trong bán kính 50m với "${dup.name}" — hệ thống đã tự động gộp thành ${dup.confirmCount} lượt xác nhận cộng đồng.`;
      els.thankyouDialog.showModal();
      return;
    }

    const newRecord = {
      id: `CD-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      layerGroup,
      category: cat,
      name: els.ptName.value.trim(),
      lat: finalLat,
      lng: finalLng,
      waterScale: els.ptWaterScale.value,
      frequency: els.ptFrequency.value,
      hazardFlags: checkedHazards,
      photoDataUrl: state.pendingPhotoDataUrl || '',
      elevationM: els.ptElevation.value !== '' ? Number(els.ptElevation.value) : null,
      confidenceTier: isFieldTeam ? 'A' : 'C',
      confirmCount: 1,
      status: isFieldTeam ? 'approved' : 'pending',
      sourceType: role,
      sourceCitation: `${role} đóng góp trực tuyến (${new Date().toLocaleDateString('vi-VN')})`,
      observedDate: new Date().toISOString().slice(0, 10),
      notes: els.ptNotes.value.trim()
    };

    state.points.push(newRecord);
    votedIds[newRecord.id] = new Date().toISOString();
    els.pointDialog.close('saved');
    setMode('pan');
    recomputeAndRender(false);
    persistState();

    const cloudRes = await postToCloudApi({
      action: 'submit_report',
      id: newRecord.id,
      reporterRole: role,
      layerGroup,
      category: cat,
      name: newRecord.name,
      lat: finalLat,
      lng: finalLng,
      elevationM: newRecord.elevationM,
      waterScale: newRecord.waterScale,
      frequency: newRecord.frequency,
      hazardFlags: checkedHazards,
      photoDataUrl: newRecord.photoDataUrl,
      photoQualityFlag: state.pendingPhotoQualityFlag || 'ok',
      notes: newRecord.notes,
      roundPrivacy: round20m,
      consentAccepted: true
    });

    if (cloudRes && cloudRes.ok === false) {
      state.points = state.points.filter((p) => p.id !== newRecord.id);
      recomputeAndRender(false);
      persistState();
      showToast(`Từ chối tự động: ${cloudRes.error}`);
      return;
    }

    els.thankyouSummary.textContent = isFieldTeam
      ? `Đã ghi nhận điểm thực địa Hạng A "${newRecord.name}" lên Bản đồ.`
      : `Điểm "${newRecord.name}" đã được ghi nhận vào Lớp Cộng đồng (Hạng C) và sẽ tự động nâng lên Hạng B khi có đủ ${PROJECT_CONFIG.autoPromoteConfirmThreshold} cư dân độc lập xác nhận hoặc sau khi nhóm duyệt thực địa.`;
    els.thankyouDialog.showModal();
  });

  els.btnLoadSample.addEventListener('click', () => {
    state.center = structuredClone(HUMG_CENTER);
    state.radiusKm = PROJECT_CONFIG.defaultRadiusKm;
    state.points = structuredClone(SAMPLE_HUMG_POINTS);
    centerMarker.setLatLng([state.center.lat, state.center.lng]);
    recomputeAndRender(true);
    persistState();
    showToast(`Đã khôi phục ${SAMPLE_HUMG_POINTS.length} điểm dữ liệu nền thực tế đã kiểm chứng.`);
  });

  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    els.btnOpenNotebook?.addEventListener('click', () => els.notebookDialog.showModal());
    els.btnCloseNotebook?.addEventListener('click', () => els.notebookDialog.close());
    els.btnOpenClimate.addEventListener('click', () => els.climateDialog.showModal());
    els.btnCloseClimate.addEventListener('click', () => els.climateDialog.close());
    els.btnOpenDrill.addEventListener('click', () => els.drillDialog.showModal());
    els.btnCloseDrill.addEventListener('click', () => els.drillDialog.close());
    els.btnOpenSync.addEventListener('click', () => els.syncDialog.showModal());
    els.btnCloseSync.addEventListener('click', () => els.syncDialog.close());
    els.btnOpenPrivacy.addEventListener('click', () => els.privacyDialog.showModal());
    els.btnClosePrivacy.addEventListener('click', () => els.privacyDialog.close());
    els.btnImport.addEventListener('click', () => els.importDialog.showModal());
    els.btnCloseImport.addEventListener('click', () => els.importDialog.close());
    els.btnCloseThankyou.addEventListener('click', () => els.thankyouDialog.close());
  }

  els.btnConfirmImport.addEventListener('click', async () => {
    const file = els.importFileInput.files?.[0];
    if (!file) return;
    try {
      const imported = parseImportedPoints(await file.text(), file.name);
      state.points = els.importReplaceCheckbox.checked ? imported : [...state.points, ...imported];
      els.importDialog.close();
      recomputeAndRender(true);
      persistState();
      showToast(`Đã nhập ${imported.length} điểm vào bản đồ.`);
    } catch (err) {
      els.importFeedback.hidden = false;
      els.importFeedback.textContent = err.message;
    }
  });

  function downloadBlob(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  els.btnExportKML.addEventListener('click', () => {
    const kml = exportToKML(state.analysis, { ...state.center, radiusKm: state.radiusKm }, els.exportOnlyInside.checked);
    downloadBlob(kml, `DongNgac_HUMG_BanDoCongDong_${state.radiusKm}km.kml`, 'application/vnd.google-earth.kml+xml;charset=utf-8');
    showToast('Đã xuất tệp .KML thực tế cho Google My Maps.');
  });

  els.btnExportGeoJSON.addEventListener('click', () => {
    const geo = exportToGeoJSON(state.analysis, { ...state.center, radiusKm: state.radiusKm }, els.exportOnlyInside.checked);
    downloadBlob(JSON.stringify(geo, null, 2), `DongNgac_HUMG_OpenData_${state.radiusKm}km.geojson`, 'application/geo+json;charset=utf-8');
    showToast('Đã xuất dữ liệu mở GeoJSON.');
  });

  els.btnExportCSV.addEventListener('click', () => {
    const csv = exportToCSV(state.analysis, { ...state.center, radiusKm: state.radiusKm }, els.exportOnlyInside.checked);
    downloadBlob(csv, `DongNgac_HUMG_DuLieuThucTe_${state.radiusKm}km.csv`, 'text/csv;charset=utf-8');
    showToast('Đã xuất bảng dữ liệu mở CSV (UTF-8 Excel).');
  });

  function renderAlertBulletin(levelKey) {
    const data = ALERT_BULLETINS[levelKey];
    const isRed = levelKey === 'red';
    els.tabAlertRed.classList.toggle('is-active-red', isRed);
    els.tabAlertYellow.classList.toggle('is-active-yellow', !isRed);
    els.alertBox.className = `alert-bulletin ${isRed ? 'alert-red' : 'alert-yellow'}`;
    els.alertBadge.textContent = data.level;
    els.alertHeadline.textContent = data.headline;
    els.alertTimeframe.textContent = data.timeframe;
    els.alertActionsList.innerHTML = data.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('');
  }

  els.tabAlertRed.addEventListener('click', () => renderAlertBulletin('red'));
  els.tabAlertYellow.addEventListener('click', () => renderAlertBulletin('yellow'));
  els.btnDrillFindSafe.addEventListener('click', () => {
    els.drillDialog.close();
    highlightNearestSafeFrom(21.069413, 105.772544, 'Mô phỏng diễn tập từ cuối Phố Viên');
  });

  function renderQuiz() {
    els.quizContainer.innerHTML = DRILL_QUIZ_QUESTIONS.map(
      (q, qIdx) => `<div class="quiz-card" data-qidx="${qIdx}">
        <p class="quiz-q-title">${escapeHtml(q.question)}</p>
        ${q.options
          .map(
            (opt, oIdx) => `<label class="quiz-opt" data-oidx="${oIdx}">
              <input type="radio" name="quiz_${q.id}" value="${oIdx}" required>
              <span>${escapeHtml(opt)}</span>
            </label>`
          )
          .join('')}
        <div class="quiz-explain" hidden>${escapeHtml(q.explanation)}</div>
      </div>`
    ).join('');
  }

  els.quizForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let correct = 0;
    const quizAnswers = {};
    DRILL_QUIZ_QUESTIONS.forEach((q, qIdx) => {
      const card = els.quizContainer.querySelector(`.quiz-card[data-qidx="${qIdx}"]`);
      const chosen = card.querySelector(`input[name="quiz_${q.id}"]:checked`);
      const chosenVal = chosen ? Number(chosen.value) : -1;
      quizAnswers[`q${qIdx + 1}`] = chosenVal;
      if (chosenVal === q.correctIndex) correct++;
      card.querySelectorAll('.quiz-opt').forEach((lbl) => {
        lbl.classList.remove('is-correct', 'is-wrong');
        const oIdx = Number(lbl.dataset.oidx);
        if (oIdx === q.correctIndex) lbl.classList.add('is-correct');
        else if (oIdx === chosenVal) lbl.classList.add('is-wrong');
      });
      card.querySelector('.quiz-explain').hidden = false;
    });
    const score100 = correct * 20;
    els.quizScoreBanner.hidden = false;
    els.quizScoreBanner.textContent = `Điểm của bạn: ${correct}/${DRILL_QUIZ_QUESTIONS.length} (${score100}/100 điểm) — Đã đồng bộ vào thống kê Diễn tập!`;

    const QUIZ_SYNC_KEY = 'humg_drill_quiz_synced_v1';
    if (!sessionStorage.getItem(QUIZ_SYNC_KEY)) {
      sessionStorage.setItem(QUIZ_SYNC_KEY, '1');
      await postToCloudApi({
        action: 'submit_survey',
        surveyType: 'quiz',
        quizScore: score100,
        answers: quizAnswers
      });
    }
  });

  els.quizForm.addEventListener('reset', () => {
    setTimeout(() => {
      els.quizScoreBanner.hidden = true;
      els.quizContainer.querySelectorAll('.quiz-opt').forEach((l) => l.classList.remove('is-correct', 'is-wrong'));
      els.quizContainer.querySelectorAll('.quiz-explain').forEach((ex) => {
        ex.hidden = true;
      });
    });
  });

  els.apiUrlInput.value = state.apiUrl;
  els.qrUrlInput.value = PROJECT_CONFIG.bitlyMapUrl || window.location.href;
  els.btnSaveApi.addEventListener('click', () => {
    state.apiUrl = els.apiUrlInput.value.trim();
    try {
      localStorage.setItem(API_URL_KEY, state.apiUrl);
    } catch { /* ignore */ }
    syncFromCloudApi();
  });

  function updateQrPreview() {
    const url = els.qrUrlInput.value.trim() || window.location.href;
    els.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(url)}`;
    els.qrCaption.textContent = url;
  }

  els.btnGenerateQr.addEventListener('click', updateQrPreview);

  // ================= TÍNH NĂNG MỚI 1: THỜI TIẾT TRỰC TIẾP OPEN-METEO & ĐỒNG BỘ CẢNH BÁO TỪ ADMIN =================
  function updateNetworkBadge() {
    const online = navigator.onLine !== false;
    els.netStatusBadge.textContent = online ? 'Trực tuyến · PWA' : 'Ngoại tuyến · Đang dùng Cache PWA';
    els.netStatusBadge.classList.toggle('is-offline', !online);
  }
  window.addEventListener('online', updateNetworkBadge);
  window.addEventListener('offline', updateNetworkBadge);
  updateNetworkBadge();

  async function loadLiveWeatherAtHUMG() {
    const CACHE_KEY = 'humg_live_weather_cache_v2';
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
        renderLiveWeather(cached.payload);
        return;
      }
    } catch { /* ignore */ }

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      const url =
        'https://api.open-meteo.com/v1/forecast?latitude=21.072514&longitude=105.773870&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m&daily=temperature_2m_max,apparent_temperature_max,precipitation_sum,precipitation_probability_max,uv_index_max&forecast_days=7&timezone=Asia%2FBangkok';
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload: data }));
      renderLiveWeather(data);
    } catch {
      els.liveWeatherPill.textContent = '18 Phố Viên · Sẵn sàng';
      els.liveWeatherSummary.textContent =
        'Nền khí tượng ĐH Mỏ (ERA5 2026): 76 ngày nhiệt cảm nhận ≥40°C · Đỉnh mưa tháng 8/2026 đạt 624,8 mm.';
    }
  }

  function renderLiveWeather(data) {
    const cur = data?.current;
    const daily = data?.daily;
    if (!cur) return;
    const temp = cur.temperature_2m;
    const app = cur.apparent_temperature;
    const rain = cur.precipitation || 0;
    const hum = cur.relative_humidity_2m;
    const dMax = daily?.apparent_temperature_max?.[0] ?? app;
    const dRain = daily?.precipitation_sum?.[0] ?? 0;
    const dProb = daily?.precipitation_probability_max?.[0] ?? 0;
    const uv = daily?.uv_index_max?.[0] ?? 0;

    state.liveWeatherSnapshot = {
      temp,
      apparentTemp: app,
      rainMm: rain,
      dailyRainMm: dRain,
      uvMax: uv
    };

    const roundedTemp = Math.round(Number(temp));
    if (rain >= 10 || dRain >= 40) {
      els.liveWeatherPill.className = 'live-pill live-pill-danger';
      els.liveWeatherPill.textContent = `${roundedTemp}°C · Cảnh báo mưa lớn`;
    } else if (rain > 0.2) {
      els.liveWeatherPill.className = 'live-pill live-pill-warn';
      els.liveWeatherPill.textContent = `${roundedTemp}°C · Đang có mưa (${rain}mm)`;
    } else if (app >= 38 || dMax >= 39) {
      els.liveWeatherPill.className = 'live-pill live-pill-warn';
      els.liveWeatherPill.textContent = `${roundedTemp}°C · Trời nắng gắt`;
    } else {
      els.liveWeatherPill.className = 'live-pill live-pill-ok';
      els.liveWeatherPill.textContent = `${roundedTemp}°C · Trời tạnh ráo`;
    }

    els.liveWeatherSummary.innerHTML = `Hiện tại: <strong class="mono-num">${temp}°C</strong> (cảm nhận <strong class="mono-num">${app}°C</strong>) · Độ ẩm <span class="mono-num">${hum}%</span> · Mưa hiện tại <strong class="mono-num">${rain} mm</strong>`;
    els.liveForecast24h.innerHTML = `Hôm nay: cảm nhận tối đa <span class="mono-num">${dMax}°C</span> · Xác suất mưa <span class="mono-num">${dProb}%</span> (<span class="mono-num">${dRain} mm</span>) · UV tối đa <span class="mono-num">${uv}</span>`;

    // Bảng dự báo 7 ngày trong Hộp thoại Khí tượng
    if (Array.isArray(daily?.time) && els.forecast7dTbody) {
      els.forecast7dWrap.hidden = false;
      els.forecast7dTbody.innerHTML = daily.time
        .map((dt, i) => {
          const tmax = daily.temperature_2m_max?.[i] ?? '—';
          const tapp = daily.apparent_temperature_max?.[i] ?? '—';
          const prSum = daily.precipitation_sum?.[i] ?? 0;
          const prProb = daily.precipitation_probability_max?.[i] ?? 0;
          const uvi = daily.uv_index_max?.[i] ?? 0;
          const note =
            prSum >= 35
              ? '<span style="color:#b91c1c;font-weight:700;">Cảnh giác đọng nước vùng trũng</span>'
              : tapp >= 39
                ? '<span style="color:#c2410c;font-weight:700;">Mang nước/mũ chống bức xạ</span>'
                : '<span style="color:#15803d;">Thuận lợi đi học / khảo sát</span>';
          return `<tr>
            <td class="mono-num"><strong>${escapeHtml(dt)}</strong></td>
            <td class="mono-num">${tmax}°C</td>
            <td class="mono-num"><strong>${tapp}°C</strong></td>
            <td class="mono-num">${prSum} mm (${prProb}%)</td>
            <td>UV <span class="mono-num">${uvi}</span> · ${note}</td>
          </tr>`;
        })
        .join('');
    }
  }

  function renderAdminBroadcast() {
    try {
      const bc = JSON.parse(localStorage.getItem(BROADCAST_KEY) || 'null');
      if (!bc || !bc.active || !bc.message) {
        els.adminBroadcastBanner.hidden = true;
        return;
      }
      const cls = bc.level === 'red' ? 'bc-red' : bc.level === 'info' ? 'bc-info' : 'bc-yellow';
      els.adminBroadcastBanner.className = `admin-broadcast-banner ${cls}`;
      els.adminBroadcastText.textContent = bc.message;
      els.adminBroadcastBanner.hidden = false;
    } catch {
      els.adminBroadcastBanner.hidden = true;
    }
  }

  els.btnDismissBroadcast.addEventListener('click', () => {
    els.adminBroadcastBanner.hidden = true;
  });

  // Đồng bộ tức thì giữa trang Quản trị (admin.html) và Bản đồ (index.html) không cần tải lại trang
  const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('humg_gis_sync') : null;
  const handleExternalStateSync = () => {
    try {
      const fresh = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(fresh?.points) && fresh.points.length > 0) {
        state.points = fresh.points;
        recomputeAndRender(false);
      }
    } catch { /* ignore */ }
    renderAdminBroadcast();
  };
  syncChannel?.addEventListener('message', handleExternalStateSync);
  window.addEventListener('storage', handleExternalStateSync);

  // ================= TÍNH NĂNG MỚI 2: NOTEBOOK TRI THỨC THỰC CHỨNG & TRỢ LÝ AI SONG SONG CẠNH BẢN ĐỒ =================
  els.nbEmergencyList.innerHTML = EMERGENCY_DIRECTORY.map(
    (d) => `<div class="nb-emerg-item">
      <strong>${escapeHtml(d.org)}</strong>
      <div class="nb-emerg-phone">${escapeHtml(d.phone)}</div>
      <div style="color:#475569;margin-top:2px;">${escapeHtml(d.address)}</div>
    </div>`
  ).join('');

  if (els.sbEmergencyCards) {
    els.sbEmergencyCards.innerHTML = EMERGENCY_DIRECTORY.map((d) => {
      const telHref = String(d.phone || '').replace(/[^0-9+]/g, '');
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border-radius:9px;background:#f8fafc;border:1px solid #e2e8f0;">
        <div style="min-width:0;">
          <strong style="display:block;font-size:0.78rem;color:#0f172a;">${escapeHtml(d.org)}</strong>
          <span style="display:block;font-size:0.71rem;color:#64748b;">${escapeHtml(d.address)}</span>
        </div>
        ${telHref ? `<a href="tel:${escapeHtml(telHref)}" class="btn btn-alert btn-compact mono-num" style="flex-shrink:0;">Gọi ${escapeHtml(d.phone)}</a>` : ''}
      </div>`;
    }).join('');
  }

  async function askInlineSidebarAi(customQuestion = '', spotContext = null) {
    if (!els.sbAiOutput) return;
    const q = (customQuestion || els.sbAiInput?.value || '').trim();
    if (q.length < 3) {
      showToast('Hãy nhập câu hỏi vào ô Hỏi AI trước nhé.');
      els.sbAiInput?.focus();
      return;
    }
    els.sbAiOutput.hidden = false;
    els.sbAiOutput.innerHTML = `<div style="color:#0f766e;font-weight:600;">AI Thực chứng Gemini đang đối chiếu 60 điểm GIS, 18 tuyến ngõ ngập &amp; lưới vệ tinh DEM...</div>`;
    if (els.btnSbAiSend) els.btnSbAiSend.disabled = true;

    try {
      const res = await fetch('/api/ai-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ask_copilot',
          question: q,
          liveWeather: state.liveWeatherSnapshot,
          spotContext
        })
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Chưa nhận được phản hồi AI.');

      const formattedLines = escapeHtml(data.answer)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .split('\n')
        .filter((ln) => ln.trim().length > 0)
        .map((ln) => `<p style="margin:0 0 6px;">${ln}</p>`)
        .join('');

      const citedBtns = (data.citedPointIds || [])
        .map((pid) => {
          const pt = state.points.find((x) => x.id === pid);
          return pt
            ? `<button type="button" class="btn btn-secondary btn-compact js-sb-fly" data-id="${escapeHtml(pid)}">Bay tới [${escapeHtml(pid)}] ${escapeHtml(pt.name.slice(0, 24))}…</button>`
            : '';
        })
        .filter(Boolean)
        .join('');

      els.sbAiOutput.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
          <strong style="font-size:0.74rem;color:#0f766e;">GEMINI COPILOT (${escapeHtml(data.modelUsed || 'v1')})</strong>
          <span style="font-size:0.69rem;color:#64748b;">Đối chiếu trực tiếp trên bản đồ →</span>
        </div>
        <div>${formattedLines}</div>
        ${citedBtns ? `<div class="popup-actions" style="margin-top:8px;">${citedBtns}</div>` : ''}
      `;
    } catch (err) {
      const fallback = synthesizeSituationalAnswer(q, state.points, state.liveWeatherSnapshot);
      if (fallback) {
        els.sbAiOutput.innerHTML = `
          <strong style="display:block;font-size:0.75rem;color:#0f766e;margin-bottom:4px;">TỔNG HỢP GIS CỤC BỘ (KHI OFFLINE)</strong>
          <strong style="display:block;margin-bottom:5px;">${escapeHtml(fallback.headline)}</strong>
          <ul style="margin:0;padding-left:16px;">${fallback.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
        `;
      } else {
        els.sbAiOutput.innerHTML = `<span style="color:#b45309;">${escapeHtml(err.message)}</span>`;
      }
    } finally {
      if (els.btnSbAiSend) els.btnSbAiSend.disabled = false;
    }
  }

  els.btnSbAiSend?.addEventListener('click', () => askInlineSidebarAi());
  els.sbAiInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      askInlineSidebarAi();
    }
  });
  els.sbAiChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      if (els.sbAiInput) els.sbAiInput.value = chip.dataset.q || '';
      askInlineSidebarAi(chip.dataset.q || '');
    });
  });
  els.sbAiOutput?.addEventListener('click', (e) => {
    const flyBtn = e.target.closest('.js-sb-fly');
    if (flyBtn) flyToAndOpenPoint(flyBtn.dataset.id);
  });

  function renderNotebookSearch(queryStr = '') {
    const trimmed = queryStr.trim();
    const res = searchKnowledgeNotebook(trimmed, state.points);
    const situational = trimmed.length >= 4 ? synthesizeSituationalAnswer(trimmed, state.points, state.liveWeatherSnapshot) : null;

    let advisoryHtml = '';
    if (situational) {
      const borderCol =
        situational.riskLevel === 'danger' ? '#fca5a5' : situational.riskLevel === 'caution' ? '#fcd34d' : '#99f6e4';
      const bgCol =
        situational.riskLevel === 'danger' ? '#fef2f2' : situational.riskLevel === 'caution' ? '#fffbeb' : '#f0fdfa';
      const badgeLabel =
        situational.riskLevel === 'danger'
          ? 'CẢNH BÁO AN TOÀN TRỰC TIẾP'
          : situational.riskLevel === 'caution'
            ? 'KHUYẾN NGHỊ TÌNH HUỐNG'
            : 'TỔNG HỢP THỰC CHỨNG';

      const hotlinesHtml =
        situational.hotlines.length > 0
          ? `<div style="margin-top:8px;font-size:0.78rem;"><strong>Đầu mối gọi nhanh:</strong> ${situational.hotlines
              .map((h) => `<span class="mono-num" style="margin-right:10px;">${escapeHtml(h.label)}: <strong>${escapeHtml(h.phone)}</strong></span>`)
              .join('')}</div>`
          : '';

      const actionBtns = [];
      if (situational.routeAction) {
        actionBtns.push(
          `<button type="button" class="btn btn-primary btn-compact js-nb-route" data-orig="${situational.routeAction.originIdx}" data-dest="${situational.routeAction.destIdx}">Phân tích &amp; Vẽ lộ trình OSRM</button>`
        );
      }
      if (situational.recommendedSafePt) {
        actionBtns.push(
          `<button type="button" class="btn btn-secondary btn-compact js-nb-fly" data-id="${escapeHtml(situational.recommendedSafePt.id)}">Bay tới điểm an toàn: ${escapeHtml(situational.recommendedSafePt.name)} (${situational.recommendedSafePt.distanceMeters}m)</button>`
        );
      }
      for (const rk of situational.flaggedRiskPts.slice(0, 2)) {
        actionBtns.push(
          `<button type="button" class="btn btn-secondary btn-compact js-nb-fly" data-id="${escapeHtml(rk.id)}">Xem điểm rủi ro [${escapeHtml(rk.id)}]</button>`
        );
      }

      advisoryHtml = `<section style="padding:12px 14px;border-radius:10px;border:1px solid ${borderCol};background:${bgCol};margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">
          <strong style="font-size:0.74rem;letter-spacing:0.02em;color:#0f766e;">${badgeLabel}</strong>
          <span style="font-size:0.72rem;color:#475569;">Tổng hợp đa tín hiệu GIS · 0% tự chế số liệu</span>
        </div>
        <h3 style="margin:0 0 6px;font-size:0.92rem;">${escapeHtml(situational.headline)}</h3>
        <ul style="margin:0;padding-left:18px;font-size:0.81rem;line-height:1.5;">
          ${situational.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
        </ul>
        ${hotlinesHtml}
        <div style="margin-top:6px;font-size:0.73rem;color:#475569;"><strong>Căn cứ:</strong> ${situational.citations.map(escapeHtml).join(' · ')}</div>
        ${actionBtns.length ? `<div class="popup-actions" style="margin-top:8px;">${actionBtns.join('')}</div>` : ''}
      </section>`;
    }

    const cardsHtml = res.matchedCards
      .map(
        (c) => `<article class="nb-card">
          <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
            <span class="sev-badge sev-safe">${escapeHtml(c.topic)}</span>
            <span class="mono-num" style="font-size:0.71rem;color:#64748b;">${escapeHtml(c.id)}</span>
          </div>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.summary)}</p>
          <div class="nb-cite-list">
            <strong>Nguồn kiểm chứng:</strong> ${c.citations.map(escapeHtml).join(' · ')}
          </div>
          <div class="popup-actions">
            ${(c.relatedPointIds || [])
              .map((pid) => {
                const pObj = state.points.find((x) => x.id === pid);
                return pObj
                  ? `<button type="button" class="btn btn-secondary btn-compact js-nb-fly" data-id="${escapeHtml(pid)}">Bay tới: ${escapeHtml(pObj.id)} (${escapeHtml(pObj.name.slice(0, 28))}…)</button>`
                  : '';
              })
              .join('')}
          </div>
        </article>`
      )
      .join('');

    const ptsHtml =
      res.matchedPoints.length > 0
        ? `<div class="era5-mini-box" style="margin-top:8px;">
            <strong>Điểm bản đồ khớp trực tiếp (${res.matchedPoints.length}):</strong>
            <div class="popup-actions" style="margin-top:6px;">
              ${res.matchedPoints
                .map(
                  (p) =>
                    `<button type="button" class="btn btn-secondary btn-compact js-nb-fly" data-id="${escapeHtml(p.id)}">[${escapeHtml(p.id)}] ${escapeHtml(p.name)}</button>`
                )
                .join('')}
            </div>
          </div>`
        : '';

    els.nbResultsContainer.innerHTML =
      advisoryHtml || cardsHtml || ptsHtml
        ? advisoryHtml + cardsHtml + ptsHtml
        : `<div class="empty-state"><p class="empty-title">Không tìm thấy mục khớp từ khóa "${escapeHtml(queryStr)}"</p><p class="empty-desc">Thử đặt câu hỏi tự nhiên như: "Mưa lớn từ ĐH Mỏ về Cầu Noi đi đường nào?" hoặc "Phòng trọ mái tôn Cổ Nhuế nóng quá làm sao?".</p></div>`;
  }

  async function askAiCopilot() {
    const q = (els.nbQueryInput.value || '').trim();
    if (q.length < 3) {
      showToast('Hãy nhập câu hỏi vào ô tìm kiếm trước khi bấm Hỏi AI Gemini.');
      els.nbQueryInput.focus();
      return;
    }
    if (!els.nbAiAnswerWrap) return;
    els.nbAiAnswerWrap.hidden = false;
    els.nbAiAnswerWrap.innerHTML = `<div style="padding:12px 14px;border-radius:10px;border:1px solid #99f6e4;background:#f0fdfa;font-size:0.82rem;color:#115e59;">
      <strong>AI Thực chứng Gemini đang đối chiếu 60 điểm GIS, 18 tuyến ngập, ERA5 &amp; DEM...</strong>
    </div>`;
    els.btnAskAiCopilot.disabled = true;

    try {
      const res = await fetch('/api/ai-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ask_copilot',
          question: q,
          liveWeather: state.liveWeatherSnapshot
        })
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Chưa nhận được câu trả lời từ AI.');

      const formattedLines = escapeHtml(data.answer)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .split('\n')
        .filter((ln) => ln.trim().length > 0)
        .map((ln) => `<p style="margin:0 0 6px;">${ln}</p>`)
        .join('');

      const citedBtns = (data.citedPointIds || [])
        .map((pid) => {
          const pt = state.points.find((x) => x.id === pid);
          return pt
            ? `<button type="button" class="btn btn-secondary btn-compact js-nb-fly" data-id="${escapeHtml(pid)}">Bay tới [${escapeHtml(pid)}] ${escapeHtml(pt.name.slice(0, 26))}…</button>`
            : '';
        })
        .filter(Boolean)
        .join('');

      els.nbAiAnswerWrap.innerHTML = `<section style="padding:13px 15px;border-radius:10px;border:1.5px solid #0f766e;background:#ffffff;box-shadow:0 4px 14px rgba(15,118,110,0.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <strong style="font-size:0.76rem;color:#0f766e;">TRỢ LÝ AI THỰC CHỨNG GEMINI (${escapeHtml(data.modelUsed || 'gemini')})</strong>
          <span style="font-size:0.72rem;color:#475569;">Bám sát dữ liệu OSM · ERA5 · DEM ĐH Mỏ</span>
        </div>
        <div style="font-size:0.83rem;line-height:1.55;color:#0f172a;">${formattedLines}</div>
        ${citedBtns ? `<div class="popup-actions" style="margin-top:8px;">${citedBtns}</div>` : ''}
      </section>`;
    } catch (err) {
      els.nbAiAnswerWrap.innerHTML = `<div style="padding:10px 12px;border-radius:8px;border:1px solid #fde68a;background:#fffbeb;font-size:0.8rem;color:#92400e;">
        ${escapeHtml(err.message)} (Bộ máy Hỏi-Đáp Tình huống Cục bộ bên dưới vẫn hoạt động đầy đủ).
      </div>`;
    } finally {
      els.btnAskAiCopilot.disabled = false;
    }
  }

  els.btnAskAiCopilot?.addEventListener('click', askAiCopilot);
  els.nbQueryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      renderNotebookSearch(els.nbQueryInput.value);
      askAiCopilot();
    }
  });
  els.nbAiAnswerWrap?.addEventListener('click', (e) => {
    const flyBtn = e.target.closest('.js-nb-fly');
    if (!flyBtn) return;
    const pid = flyBtn.dataset.id;
    const target = state.points.find((p) => p.id === pid);
    if (target) {
      els.notebookDialog.close();
      map.flyTo([target.lat, target.lng], 16, { duration: 0.5 });
      setTimeout(() => markerMap.get(pid)?.openPopup(), 320);
    }
  });

  els.nbQueryInput.addEventListener(
    'input',
    debounce(() => renderNotebookSearch(els.nbQueryInput.value), 120)
  );
  els.btnNbClear.addEventListener('click', () => {
    els.nbQueryInput.value = '';
    if (els.nbAiAnswerWrap) els.nbAiAnswerWrap.hidden = true;
    renderNotebookSearch('');
  });
  els.nbChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      els.nbQueryInput.value = chip.dataset.q;
      renderNotebookSearch(chip.dataset.q);
    });
  });
  els.nbResultsContainer.addEventListener('click', async (e) => {
    const routeBtn = e.target.closest('.js-nb-route');
    if (routeBtn) {
      els.routeOriginSelect.value = routeBtn.dataset.orig || '0';
      els.routeDestSelect.value = routeBtn.dataset.dest || '3';
      els.notebookDialog.close();
      openContextSheet('route');
      await evaluateSelectedRoute(true);
      if (lastRouteBounds) map.fitBounds(lastRouteBounds, { padding: [70, 70], maxZoom: 16 });
      return;
    }
    const flyBtn = e.target.closest('.js-nb-fly');
    if (!flyBtn) return;
    const pid = flyBtn.dataset.id;
    const target = state.points.find((p) => p.id === pid);
    if (target) {
      els.notebookDialog.close();
      map.flyTo([target.lat, target.lng], 16, { duration: 0.5 });
      setTimeout(() => markerMap.get(pid)?.openPopup(), 320);
    }
  });
  els.btnExportNotebookLm.addEventListener('click', () => {
    const md = buildNotebookLmSourceMarkdown(state.points, state.analysis?.stats);
    downloadBlob(md, 'HUMG_DongNgac_NotebookLM_SourcePack.md', 'text/markdown;charset=utf-8');
    showToast('Đã xuất tệp nguồn .MD — sẵn sàng tải lên notebooklm.google.com!');
  });

  // ================= TÍNH NĂNG MỚI 3: ĐỊNH TUYẾN ĐƯỜNG BỘ THỰC TẾ OSRM & NÉ VÙNG NGẬP =================
  const presetOptionsHtml = ROUTE_PRESETS.map(
    (r, idx) => `<option value="${idx}">${escapeHtml(r.label)}</option>`
  ).join('');
  els.routeOriginSelect.innerHTML = presetOptionsHtml;
  els.routeDestSelect.innerHTML = presetOptionsHtml;
  els.routeOriginSelect.value = '0'; // Khu A ĐH Mỏ
  els.routeDestSelect.value = '3'; // Cầu Noi

  let lastRouteBounds = null;
  const osrmRouteCache = new Map();

  async function fetchOsrmStreetPath(waypointsLngLat) {
    const key = waypointsLngLat.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    if (osrmRouteCache.has(key)) return osrmRouteCache.get(key);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3200);
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/foot/${key}?overview=full&geometries=geojson`,
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      if (!res.ok) return null;
      const data = await res.json();
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        osrmRouteCache.set(key, coords);
        return coords;
      }
    } catch { /* fallback to geodesic */ }
    return null;
  }

  async function evaluateSelectedRoute(drawOnMap = true) {
    const orig = ROUTE_PRESETS[Number(els.routeOriginSelect.value)] || ROUTE_PRESETS[0];
    const dest = ROUTE_PRESETS[Number(els.routeDestSelect.value)] || ROUTE_PRESETS[2];

    const streetCoords = await fetchOsrmStreetPath([
      [orig.lng, orig.lat],
      [dest.lng, dest.lat]
    ]);

    const res = streetCoords
      ? analyzePolylineCorridor(turf, streetCoords, state.points, 125)
      : (() => {
          const fallback = analyzeRouteCorridor(turf, orig, dest, state.points, 165);
          return {
            distanceMeters: fallback.directDistanceMeters,
            estWalkMinutes: fallback.estWalkMinutes,
            estBikeMinutes: fallback.estBikeMinutes,
            status: fallback.status,
            nearbyRisks: fallback.nearbyRisks,
            nearbySafe: fallback.nearbySafe,
            latLngPath: fallback.corridorCoords
          };
        })();

    const modeNote = streetCoords ? 'Định tuyến theo mặt đường phố thực tế (OSRM)' : 'Hành lang trắc địa trực tiếp';
    const statusMeta =
      res.status === 'danger'
        ? {
            cls: 'route-status-danger',
            title: 'CẢNH BÁO ĐỎ: Lộ trình đi sát điểm ngập sâu / miệng cống xoáy nguy hiểm!',
            advice:
              'Khi mưa lớn >50mm, TUYỆT ĐỐI KHÔNG đi theo vạch đỏ. Hãy ở lại nền cao (Khu A ĐH Mỏ 17m) hoặc đi theo đường bộ vòng qua dải nền cao Cổ Nhuế (vạch xanh lá nét đứt).'
          }
        : res.status === 'caution'
          ? {
              cls: 'route-status-caution',
              title: 'LƯU Ý VÀNG: Có điểm đọng nước / bức xạ nắng gắt nằm gần lộ trình',
              advice: 'Quan sát kỹ mặt đường khi mưa rào hoặc trang bị mũ, nước uống nếu di chuyển khung 11h30–15h00.'
            }
          : {
              cls: 'route-status-clear',
              title: 'LỘ TRÌNH TƯƠNG ĐỐI AN TOÀN: Không cắt qua điểm đen ngập sâu trong 125m',
              advice: 'Vẫn luôn chú ý quan sát thực tế mặt đường khi có mưa dông bất thường.'
            };

    const riskListHtml =
      res.nearbyRisks.length > 0
        ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:0.79rem;">
            ${res.nearbyRisks
              .map(
                (r) =>
                  `<li><strong>[${escapeHtml(r.id)}] ${escapeHtml(r.name)}</strong> — cách đường đi <span class="mono-num">${r.distToCorridorM} m</span> (${escapeHtml(r.waterScaleLabel)})</li>`
              )
              .join('')}
          </ul>`
        : '';

    const safeListHtml =
      res.nearbySafe.length > 0
        ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(15,23,42,0.12);font-size:0.78rem;">
            <strong>Điểm y tế / tránh trú có mái che dọc lộ trình:</strong>
            <ul style="margin:4px 0 0;padding-left:18px;">
              ${res.nearbySafe
                .map(
                  (s) =>
                    `<li><strong>${escapeHtml(s.name)}</strong> (cách đường đi <span class="mono-num">${s.distToCorridorM} m</span>)</li>`
                )
                .join('')}
            </ul>
          </div>`
        : '';

    els.routeResultContainer.innerHTML = `
      <div class="route-status-box ${statusMeta.cls}">
        <strong>${statusMeta.title}</strong>
        <div style="margin:4px 0;">Quãng đường (${modeNote}): <strong class="mono-num">${res.distanceMeters.toLocaleString('vi-VN')} m</strong> · Đi bộ ~<span class="mono-num">${res.estWalkMinutes}</span> phút · Xe máy ~<span class="mono-num">${res.estBikeMinutes}</span> phút</div>
        <div>${statusMeta.advice}</div>
        ${riskListHtml}
        ${safeListHtml}
      </div>
    `;

    if (drawOnMap) {
      routeCorridorGroup.clearLayers();
      const directLine = L.polyline(res.latLngPath, {
        color: res.status === 'danger' ? '#B91C1C' : res.status === 'caution' ? '#D97706' : '#0F766E',
        weight: 4.5,
        opacity: 0.9
      })
        .bindTooltip(`Tuyến kiểm tra: ${orig.label} → ${dest.label}`)
        .addTo(routeCorridorGroup);

      if (res.status === 'danger') {
        const bypassStreet = await fetchOsrmStreetPath([
          [orig.lng, orig.lat],
          [105.777269, 21.070783],
          [105.780118, 21.061801],
          [dest.lng, dest.lat]
        ]);
        const bypassLatLng = bypassStreet
          ? bypassStreet.map(([lng, lat]) => [lat, lng])
          : [
              [orig.lat, orig.lng],
              [21.070783, 105.777269],
              [21.061801, 105.780118],
              [dest.lat, dest.lng]
            ];
        L.polyline(bypassLatLng, {
          color: '#15803D',
          weight: 4,
          dashArray: '8 6',
          opacity: 0.92
        })
          .bindTooltip('Lộ trình đường bộ vòng qua dải nền cao Cổ Nhuế (14–17m DSM)')
          .addTo(routeCorridorGroup);
      }
      lastRouteBounds = directLine.getBounds();
    }
  }

  els.routeOriginSelect.addEventListener('change', () => evaluateSelectedRoute(true));
  els.routeDestSelect.addEventListener('change', () => evaluateSelectedRoute(true));
  els.btnRunRoute.addEventListener('click', async () => {
    await evaluateSelectedRoute(true);
    if (lastRouteBounds) map.fitBounds(lastRouteBounds, { padding: [80, 80], maxZoom: 16 });
  });
  els.btnSwapRoute.addEventListener('click', async () => {
    const tmp = els.routeOriginSelect.value;
    els.routeOriginSelect.value = els.routeDestSelect.value;
    els.routeDestSelect.value = tmp;
    await evaluateSelectedRoute(true);
    if (lastRouteBounds) map.fitBounds(lastRouteBounds, { padding: [80, 80], maxZoom: 16 });
  });
  els.btnClearRouteMap.addEventListener('click', () => {
    routeCorridorGroup.clearLayers();
    showToast('Đã xóa đường vẽ trên bản đồ.');
  });

  // ================= TÍNH NĂNG MỚI 4: MÔ PHỎNG KỊCH BẢN MƯA LỚN / UHI =================
  els.scenarioSelect.innerHTML = Object.values(WEATHER_SCENARIOS)
    .map((sc) => `<option value="${escapeHtml(sc.key)}">${escapeHtml(sc.shortLabel)}</option>`)
    .join('');

  function updateRainLabel(mm) {
    if (!els.rainSimVal) return;
    const tag =
      mm === 0
        ? 'Trời khô ráo'
        : mm < 35
          ? 'Mưa vừa'
          : mm < 65
            ? 'Mưa to'
            : mm < 105
              ? 'Mưa rất to'
              : 'Mưa lịch sử / Bão';
    els.rainSimVal.textContent = `${mm} mm (${tag})`;
  }

  function syncRainPillsUI(mm) {
    if (!els.rainPills?.length) return;
    let closestBtn = null;
    let bestDiff = Infinity;
    els.rainPills.forEach((btn) => {
      const val = Number(btn.dataset.rain) || 0;
      const diff = Math.abs(val - mm);
      if (diff < bestDiff) {
        bestDiff = diff;
        closestBtn = btn;
      }
    });
    els.rainPills.forEach((btn) => btn.classList.toggle('is-active', btn === closestBtn));
  }

  els.rainPills?.forEach((pill) => {
    pill.addEventListener('click', () => {
      const mm = Number(pill.dataset.rain) || 0;
      state.simRainMm = mm;
      if (els.rainSimRange) els.rainSimRange.value = String(mm);
      updateRainLabel(mm);
      syncRainPillsUI(mm);
      renderFloodCorridorsAndBasins();
    });
  });

  els.rainSimRange?.addEventListener('input', () => {
    state.simRainMm = Number(els.rainSimRange.value) || 0;
    updateRainLabel(state.simRainMm);
    syncRainPillsUI(state.simRainMm);
    renderFloodCorridorsAndBasins();
  });

  els.scenarioSelect.addEventListener('change', () => {
    state.activeScenario = els.scenarioSelect.value;
    if (state.activeScenario === 'rain_30') state.simRainMm = 45;
    else if (state.activeScenario === 'rain_70') state.simRainMm = 75;
    else if (state.activeScenario === 'rain_120') state.simRainMm = 125;
    else if (state.activeScenario === 'heat_uhi') state.simRainMm = 0;
    else state.simRainMm = 70;
    if (els.rainSimRange) els.rainSimRange.value = String(state.simRainMm);
    updateRainLabel(state.simRainMm);
    syncRainPillsUI(state.simRainMm);

    const scMeta = WEATHER_SCENARIOS[state.activeScenario] || WEATHER_SCENARIOS.normal;
    const ev = evaluateWeatherScenario(state.points, state.activeScenario);
    if (state.activeScenario === 'normal') {
      els.scenarioSummaryNote.hidden = true;
    } else {
      els.scenarioSummaryNote.hidden = false;
      els.scenarioSummaryNote.innerHTML = `<strong>${escapeHtml(scMeta.headline)}</strong><br>${escapeHtml(scMeta.desc)}<br>Đang làm nổi bật: <strong class="mono-num">${ev.activeRiskCount}</strong> điểm rủi ro kích hoạt &amp; <strong class="mono-num">${ev.recommendedSafeCount}</strong> điểm hỗ trợ khuyến nghị.`;
    }
    renderFloodCorridorsAndBasins();
    renderMarkersAndTable();
  });

  // ================= TÍNH NĂNG MỚI 5: LÁT CẮT ĐỊA HÌNH ĐỘNG COPERNICUS DEM =================
  els.transectPresetSelect.innerHTML = TRANSECT_PRESETS.map(
    (tp, i) => `<option value="${i}">${escapeHtml(tp.label)}</option>`
  ).join('');

  function renderTransectChart(profile, startName, endName, sourceLabel = 'Copernicus DEM GLO-30') {
    els.transectStatsLine.innerHTML = [
      `<span>Tuyến: <strong>${escapeHtml(startName)} → ${escapeHtml(endName)}</strong> (${sourceLabel})</span>`,
      `<span>Dài: <strong class="mono-num">${profile.totalDistM.toLocaleString('vi-VN')} m</strong></span>`,
      `<span>Cao nhất: <strong class="mono-num" style="color:#0f766e">${profile.maxElevM} m</strong></span>`,
      `<span>Thấp nhất: <strong class="mono-num" style="color:#b91c1c">${profile.minElevM} m</strong></span>`,
      `<span>Chênh cao: <strong class="mono-num">${profile.reliefM} m</strong></span>`,
      `<span>Đoạn trũng ≤12m: <strong class="mono-num" style="color:#b91c1c">${profile.lowBasinPct}%</strong></span>`
    ].join(' · ');

    const W = 620;
    const H = 136;
    const padL = 34;
    const padR = 18;
    const padT = 16;
    const padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxY = Math.max(20, Math.ceil(profile.maxElevM + 2));

    const coords = profile.samples.map((s, idx) => {
      const x = padL + (idx / Math.max(1, profile.samples.length - 1)) * plotW;
      const y = padT + plotH - (Math.max(0, s.elevationM) / maxY) * plotH;
      return { ...s, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    const linePts = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const areaPts = `${padL},${padT + plotH} ${linePts} ${padL + plotW},${padT + plotH}`;
    const y12 = Math.round((padT + plotH - (12 / maxY) * plotH) * 10) / 10;

    els.transectSvgContainer.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="Biểu đồ mặt cắt địa hình từ ${escapeHtml(startName)} đến ${escapeHtml(endName)}">
        <rect x="${padL}" y="${y12}" width="${plotW}" height="${padT + plotH - y12}" fill="#fef2f2" fill-opacity="0.72"/>
        <line x1="${padL}" y1="${y12}" x2="${padL + plotW}" y2="${y12}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="${padL + 6}" y="${y12 - 4}" font-size="9" fill="#b91c1c" font-weight="600">Ngưỡng lòng máng ≤ 12 m DSM</text>
        <polygon points="${areaPts}" fill="#0f766e" fill-opacity="0.16"/>
        <polyline points="${linePts}" fill="none" stroke="#0f766e" stroke-width="2.4" stroke-linejoin="round"/>
        ${coords
          .map(
            (c, i) => `
          <circle cx="${c.x}" cy="${c.y}" r="3.2" fill="${c.elevationM <= 12 ? '#b91c1c' : '#0f766e'}" stroke="#fff" stroke-width="1"/>
          ${i === 0 || i === coords.length - 1 || i % 3 === 0 ? `<text x="${c.x}" y="${Math.max(11, c.y - 6)}" text-anchor="middle" font-size="8.8" font-weight="700" fill="#0f172a" font-family="JetBrains Mono">${c.elevationM}m</text>` : ''}
        `
          )
          .join('')}
        <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#94a3b8" stroke-width="1"/>
        <text x="${padL}" y="${H - 6}" font-size="9" fill="#475569" font-family="JetBrains Mono">A (0 m)</text>
        <text x="${padL + plotW / 2}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#475569" font-family="JetBrains Mono">${Math.round(profile.totalDistM / 2)} m</text>
        <text x="${padL + plotW}" y="${H - 6}" text-anchor="end" font-size="9" fill="#475569" font-family="JetBrains Mono">B (${profile.totalDistM} m)</text>
      </svg>`;
  }

  async function runTransectProfile(startPt, endPt) {
    const initial = buildTransectSamples(turf, startPt, endPt, 12, state.points);
    renderTransectChart(initial, startPt.name || 'Điểm A', endPt.name || 'Điểm B', 'Nội suy nhanh');

    transectLayerGroup.clearLayers();
    const line = L.polyline(
      initial.samples.map((s) => [s.lat, s.lng]),
      { color: '#7C3AED', weight: 3.5, dashArray: '6 4' }
    ).addTo(transectLayerGroup);

    initial.samples.forEach((s, idx) => {
      if (idx === 0 || idx === initial.samples.length - 1) {
        L.circleMarker([s.lat, s.lng], {
          radius: 7,
          color: '#FFFFFF',
          weight: 2,
          fillColor: '#7C3AED',
          fillOpacity: 1
        })
          .bindTooltip(idx === 0 ? `Điểm A: ${startPt.name || ''}` : `Điểm B: ${endPt.name || ''}`, { permanent: true })
          .addTo(transectLayerGroup);
      }
    });
    map.fitBounds(line.getBounds(), { padding: [60, 140], maxZoom: 16 });

    // Truy vấn trực tiếp cao độ vệ tinh Copernicus DEM GLO-30 cho cả 12 điểm mẫu
    try {
      const lats = initial.samples.map((s) => s.lat).join(',');
      const lngs = initial.samples.map((s) => s.lng).join(',');
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.elevation) && json.elevation.length === initial.samples.length) {
          const updatedSamples = initial.samples.map((s, idx) => ({
            ...s,
            elevationM: Math.round(Number(json.elevation[idx]) * 10) / 10
          }));
          renderTransectChart(
            summarizeTransectProfile(updatedSamples, initial.totalDistM),
            startPt.name || 'Điểm A',
            endPt.name || 'Điểm B',
            'Vệ tinh Copernicus DEM GLO-30'
          );
        }
      }
    } catch { /* keep IDW fallback */ }
  }

  els.btnToggleTransect.addEventListener('click', () => {
    const nextHidden = !els.transectDrawer.hidden;
    els.transectDrawer.hidden = nextHidden;
    if (!nextHidden) {
      const preset = TRANSECT_PRESETS[Number(els.transectPresetSelect.value) || 0];
      runTransectProfile(preset.start, preset.end);
    } else {
      transectLayerGroup.clearLayers();
    }
  });

  els.transectPresetSelect.addEventListener('change', () => {
    const preset = TRANSECT_PRESETS[Number(els.transectPresetSelect.value) || 0];
    runTransectProfile(preset.start, preset.end);
  });

  els.btnDrawCustomTransect.addEventListener('click', () => {
    setMode('transect');
  });

  els.btnCloseTransect.addEventListener('click', () => {
    els.transectDrawer.hidden = true;
    transectLayerGroup.clearLayers();
    if (state.mode === 'transect') setMode('pan');
  });

  // ================= TÍNH NĂNG MỚI 6: NHẬP MÔ TẢ BẰNG GIỌNG NÓI TIẾNG VIỆT =================
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec && els.btnVoiceDictate) {
    els.btnVoiceDictate.hidden = false;
    let recInstance = null;
    els.btnVoiceDictate.addEventListener('click', () => {
      if (recInstance) {
        recInstance.stop();
        return;
      }
      recInstance = new SpeechRec();
      recInstance.lang = 'vi-VN';
      recInstance.interimResults = false;
      els.btnVoiceDictate.textContent = 'Đang nghe... (bấm để dừng)';
      recInstance.onresult = (ev) => {
        const spoken = ev.results?.[0]?.[0]?.transcript || '';
        if (spoken) {
          els.ptNotes.value = (els.ptNotes.value ? els.ptNotes.value + ' ' : '') + spoken;
        }
      };
      recInstance.onend = () => {
        recInstance = null;
        els.btnVoiceDictate.textContent = 'Đọc giọng nói tiếng Việt';
      };
      recInstance.onerror = () => {
        recInstance = null;
        els.btnVoiceDictate.textContent = 'Đọc giọng nói tiếng Việt';
      };
      recInstance.start();
    });
  }

  renderAlertBulletin('red');
  renderQuiz();
  renderNotebookSearch('');
  evaluateSelectedRoute(false);
  renderAdminBroadcast();
  loadLiveWeatherAtHUMG();
  updateQrPreview();
  recomputeAndRender(false);
  updateCenterElevation();
  syncFromCloudApi();

  // Tự động đồng bộ lại nhẹ nhàng khi người dùng quay lại tab sau >25 giây để nhận bản tin cảnh báo & lượt +1 mới nhất
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - state.lastCloudSyncMs > 25000) {
      syncFromCloudApi();
    }
  });

  // Hỗ trợ mở thẳng Hộp thoại Diễn tập & Mini-Quiz qua ?drill=1
  if (urlParams.get('drill') === '1') {
    setTimeout(() => els.drillDialog.showModal(), 200);
  }

  // Deep-link chia sẻ trực tiếp tới 1 điểm (?point=R-01)
  const targetPointId = urlParams.get('point');
  if (targetPointId) {
    const deepPt = state.points.find((p) => p.id.toLowerCase() === targetPointId.toLowerCase());
    if (deepPt) {
      setTimeout(() => {
        map.flyTo([deepPt.lat, deepPt.lng], 17, { duration: 0.6 });
        setTimeout(() => markerMap.get(deepPt.id)?.openPopup(), 420);
      }, 250);
    }
  }
}

initApp();
