/**
 * VN RESILIENCE ATLAS — NATIONAL 4-PILLAR GEOSPATIAL & DEVOPS WORKBENCH CONTROLLER
 * - Phân hệ 1 (Bản đồ & Cảnh báo): Khoanh vùng chống lag + Mặt phủ ngập nước 3 tầng (DEM Bilinear)
 *   + Rốn trũng & Vành đai cự ly + Ký hiệu SVG + Đa nền (Phố/Vệ tinh/Địa hình/Nền Tối) + Radar mưa + Spot Inspector
 * - Phân hệ 2 (Cổng Nghiên cứu): Đăng ký / Đăng nhập, Khoanh vùng, GeoJSON, Mặt cắt địa hình, Hàng đợi kiểm định
 * - Phân hệ 3 (Bản tin & Công bố): Bản tin thiên tai & công trình khoa học liên kết 1 chạm tới Bản đồ chính
 * - Phân hệ 4 (Quản trị & Dev): Giám sát độ trễ API đa đám mây, Sổ đăng ký lớp GIS, Xóa Cache SW,
 *   Kiểm duyệt & Thêm điểm Cloud, Duyệt nghiên cứu, Phát cảnh báo khẩn cấp & API JSON Sandbox
 */

import { PROJECT_CONFIG } from './config.js';
import {
  SAMPLE_HUMG_POINTS,
  FLOOD_STREET_CORRIDORS,
  LOW_DEM_BASINS,
  SAFE_DETOUR_ROUTES
} from './humg-data.js';
import {
  VIETNAM_VERIFIED_HOTSPOTS,
  VIETNAM_VERIFIED_CORRIDORS,
  VIETNAM_VERIFIED_BASINS,
  filterCorridorsInZone,
  filterBasinsInZone
} from './platform/data/vietnam-verified-hotspots.js';
import {
  ensureZoneDemGrid,
  sampleAnyDemGrid,
  computeTerrainGradient,
  sampleElevationProfile,
  createNationalHydroSurfaceLayer,
  createHydroFlowVectorsLayer,
  createNationalHeatmapLayer,
  buildMapPictogramIcon
} from './platform/gis/hydro-surface.js';
import { lookupCentralMeridian, wgs84ToVn2000Local } from './platform/gis/vn2000.js';
import { roundPrivacyCoord, analyzePolylineCorridor } from './gis-utils.js';
import { synthesizeSituationalAnswer } from './knowledge-engine.js';
import {
  VIETNAM_ZONES,
  searchVietnamZones,
  filterFeaturesInZone,
  isInsideVietnam,
  findNearestVietnamZone
} from './platform/regions/vietnam-directory.js';
import {
  RENTAL_INSPECTION_CHECKLIST,
  PLAIN_SOURCE_LABELS,
  haversineMeters,
  formatDistancePlain,
  describePointVerificationPlain,
  describeAqiPlain,
  buildCitizenStatusAdvisory,
  buildHonestRentalAreaSummary,
  buildHonestRouteComparison,
  createOfflineReportQueueItem
} from './citizen-logic.js';

const CACHE_KEY = 'vn_resilience_cache_v2';
const CHECKLIST_KEY = 'vn_resilience_housing_checklist_v1';
const OFFLINE_QUEUE_KEY = 'vn_resilience_offline_queue_v1';
const LARGE_TEXT_KEY = 'vn_resilience_large_text_v1';
const RESEARCHER_TOKEN_KEY = 'vn_resilience_researcher_token_v1';
const REVIEWER_TOKEN_KEY = 'vn_resilience_reviewer_token_v1';

const ALL_STATIC_POINTS = [...SAMPLE_HUMG_POINTS, ...VIETNAM_VERIFIED_HOTSPOTS];
const ALL_STATIC_CORRIDORS = [...FLOOD_STREET_CORRIDORS, ...VIETNAM_VERIFIED_CORRIDORS];
const ALL_STATIC_BASINS = [...LOW_DEM_BASINS, ...VIETNAM_VERIFIED_BASINS];

const BASEMAP_PROVIDERS = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    className: '',
    attribution: '&copy; OpenStreetMap contributors'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    className: '',
    attribution: 'Tiles &copy; Esri World Imagery'
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    className: '',
    attribution: '&copy; OpenTopoMap (CC-BY-SA)'
  },
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    className: 'tiles-dark-ops',
    attribution: '&copy; OpenStreetMap · Dark Ops'
  }
};

const state = {
  pillar: 'public',
  pubTab: 'overview',
  zone: { ...VIETNAM_ZONES[0], radiusKm: VIETNAM_ZONES[0].defaultRadiusKm || 2 },
  zonePoints: [],
  osmPois: [],
  osmWaterways: [],
  zoneCorridors: [],
  publishedStudiesInZone: [],
  livePulse: { byPoint: {}, recentFeed: [] },
  broadcast: null,
  weather: null,
  hourlyForecast: null,
  riverDischarge: null,
  vnZoneIntel: null,
  zoneElevationM: null,
  aqi: null,
  lastUpdatedAt: null,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  mapFilter: 'all',
  localFilterText: '',
  mapMobileMode: 'map',
  basemap: 'osm',
  layers: {
    hydroSurface: true,
    flowVectors: true,
    basins: true,
    corridors: true,
    waterways: true,
    osmPoi: true,
    heatmap: false,
    radar: false
  },
  radarAnim: {
    frames: [],
    idx: 0,
    playing: false,
    timer: null
  },
  hydroSim: {
    rainMm: 70,
    opacity: 0.75,
    preset: '70',
    demGrid: null
  },
  travelMode: 'bike',
  reportPin: { lat: VIETNAM_ZONES[0].lat, lng: VIETNAM_ZONES[0].lng },
  reportPhotoDataUrl: '',
  // Phân hệ 2: Nhà Nghiên cứu
  researcherToken: sessionStorage.getItem(RESEARCHER_TOKEN_KEY) || '',
  researcherProfile: null,
  mySubmissions: [],
  studyDrawMode: 'point',
  draftStudyPoints: [],
  draftStudyShapes: [],
  // Phân hệ 3: Bản tin & Công bố
  newsKind: 'all',
  newsRegion: 'all',
  newsSearchText: '',
  publications: [],
  newsStats: { disasterNewsCount: 0, researchArticleCount: 0, verifiedResearchersCount: 0 }
};

let nationalMap = null;
let baseTileLayer = null;
let radarTileLayer = null;
let hydroSurfaceLayer = null;
let flowVectorsLayer = null;
let heatmapLayer = null;
let zoneCircleLayer = null;
let basinsLayer = null;
let waterwaysLayer = null;
let corridorsLayer = null;
let zoneMarkersLayer = null;
let mainRouteLayer = null;
let spotMarker = null;

let routeMap = null;
let routeLinesLayer = null;
let reportMap = null;
let reportMarker = null;
let studyMap = null;
let studyDraftLayer = null;
let studyZoneCircle = null;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg) {
  const el = document.getElementById('citizen-toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 3600);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage
  }
}

function formatTimeHm(iso) {
  if (!iso) return 'Chưa có mốc';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Vừa cập nhật';
  return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · ${d.toLocaleDateString('vi-VN')}`;
}

function downloadFile(content, fileName, mimeType) {
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

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* =========================================================================
   1. ĐIỀU HƯỚNG 3 PHÂN HỆ CÔNG CỘNG / KHOA HỌC & 4 TAB CON TRONG VÙNG
   ========================================================================= */
function switchPillar(pillarName) {
  const valid = ['public', 'research', 'news'];
  const next = valid.includes(pillarName) ? pillarName : 'public';
  state.pillar = next;

  for (const p of valid) {
    const el = document.getElementById(`pillar-${p}`);
    if (el) el.hidden = p !== next;
  }

  document.querySelectorAll('[data-pillar]').forEach((btn) => {
    const active = btn.dataset.pillar === next;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  if (next === 'public') {
    setTimeout(() => {
      nationalMap?.invalidateSize();
      hydroSurfaceLayer?.redraw();
    }, 60);
  } else if (next === 'research') {
    renderResearchPillar();
  } else if (next === 'news') {
    loadPublicationsFeed();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function switchPublicTab(tabName) {
  const valid = ['overview', 'route', 'housing', 'report'];
  const next = valid.includes(tabName) ? tabName : 'overview';
  state.pubTab = next;

  for (const t of valid) {
    const pane = document.getElementById(`pubpane-${t}`);
    if (pane) pane.hidden = t !== next;
  }
  document.querySelectorAll('[data-pubtab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.pubtab === next);
  });

  if (next !== 'overview' && window.innerWidth < 1024) {
    state.mapMobileMode = 'list';
    const layout = document.getElementById('map-split-layout');
    if (layout) layout.dataset.mobileMode = 'list';
    document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mapMode === 'list'));
  }

  if (next === 'overview') {
    setTimeout(() => nationalMap?.invalidateSize(), 60);
  } else if (next === 'housing') {
    renderHousingCheck();
  } else if (next === 'route') {
    setTimeout(() => routeMap?.invalidateSize(), 60);
  }
}

function applyLargeTextMode(enabled) {
  document.documentElement.classList.toggle('is-large-text', Boolean(enabled));
  document.getElementById('btn-toggle-large-text')?.setAttribute('aria-pressed', String(Boolean(enabled)));
  writeJson(LARGE_TEXT_KEY, Boolean(enabled));
  setTimeout(() => {
    nationalMap?.invalidateSize();
    hydroSurfaceLayer?.redraw();
  }, 60);
}

/* =========================================================================
   2. KHOANH VÙNG ĐỘNG TOÀN VIỆT NAM & ĐỒNG BỘ LƯỚI ĐỊA HÌNH VỆ TINH 10x10
   ========================================================================= */
function selectZone(zoneObj, { radiusKm, flyMap = true } = {}) {
  const r = Number(radiusKm || zoneObj.radiusKm || zoneObj.defaultRadiusKm || 5);
  const changedCoord =
    Math.abs(Number(zoneObj.lat) - Number(state.zone.lat)) > 0.002 ||
    Math.abs(Number(zoneObj.lng) - Number(state.zone.lng)) > 0.002;
  if (changedCoord) {
    state.weather = null;
    state.hourlyForecast = null;
    state.zoneElevationM = null;
    state.aqi = null;
    state.osmPois = [];
    state.osmWaterways = [];
    state.hydroSim.demGrid = null;
    state.lastUpdatedAt = null;
    const selBox = document.getElementById('map-selected-card');
    if (selBox) selBox.hidden = true;
    mainRouteLayer?.clearLayers();
  }
  state.zone = {
    id: zoneObj.id || `custom-${Date.now().toString(36)}`,
    name: zoneObj.name,
    province: zoneObj.province || zoneObj.name,
    macroRegion: zoneObj.macroRegion || findNearestVietnamZone(zoneObj.lat, zoneObj.lng)?.macroRegion || 'bac',
    lat: Number(zoneObj.lat),
    lng: Number(zoneObj.lng),
    radiusKm: Math.max(2, Math.min(50, r)),
    hazards: zoneObj.hazards || []
  };
  state.reportPin = { lat: state.zone.lat, lng: state.zone.lng };

  const radSel = document.getElementById('vn-zone-radius');
  if (radSel) {
    const allowed = ['2', '5', '10', '20'];
    radSel.value = allowed.includes(String(state.zone.radiusKm)) ? String(state.zone.radiusKm) : '5';
  }
  const pill = document.getElementById('active-zone-pill');
  if (pill) {
    pill.textContent = `${state.zone.lat.toFixed(2)}°N, ${state.zone.lng.toFixed(2)}°E · R=${state.zone.radiusKm}km`;
  }
  const elevPill = document.getElementById('env-elev-pill');
  if (elevPill) elevPill.textContent = 'Cao độ -- m';

  document.querySelectorAll('.js-quick-zone').forEach((btn) => {
    btn.classList.toggle('is-active-zone', btn.dataset.zoneid === state.zone.id);
  });

  const startRouteInput = document.getElementById('route-start-input');
  if (startRouteInput && state.pubTab !== 'route') {
    startRouteInput.value = state.zone.name;
  }

  refreshActiveZoneData({ flyMap });
}

function mergeZonePoints({ baselineInZone, commRes, researchRes, osmPois, lat, lng, radiusKm }) {
  const combinedById = new Map();
  for (const pt of baselineInZone) combinedById.set(pt.id, pt);

  if (commRes) {
    const modMap = commRes.moderationMap || {};
    const counts = commRes.confirmCounts || {};
    for (const [id, pt] of combinedById.entries()) {
      const mod = modMap[id] || {};
      combinedById.set(id, {
        ...pt,
        ...mod,
        confirmCount: Math.max(Number(pt.confirmCount) || 1, 1 + (counts[id] || 0))
      });
    }
    const cloudInZone = filterFeaturesInZone(commRes.reports || [], lat, lng, radiusKm, 200);
    for (const rep of cloudInZone) {
      if (rep.status !== 'hidden') combinedById.set(rep.id, rep);
    }
  }

  if (researchRes) {
    for (const rf of researchRes.features || []) {
      combinedById.set(rf.id, rf);
    }
  }

  if (state.layers.osmPoi && Array.isArray(osmPois) && osmPois.length > 0) {
    const existingSafe = [...combinedById.values()].filter((p) => p.layerGroup === 'safe');
    for (const op of osmPois) {
      const distMeters = haversineMeters(lat, lng, Number(op.lat), Number(op.lng));
      if (distMeters > radiusKm * 1000 + 250) continue;
      const duplicatedNear = existingSafe.some(
        (ex) => haversineMeters(Number(ex.lat), Number(ex.lng), Number(op.lat), Number(op.lng)) < 85
      );
      if (!duplicatedNear) {
        combinedById.set(op.id, { ...op, distanceMeters: distMeters });
      }
    }
  }

  return [...combinedById.values()]
    .filter((p) => p.status !== 'hidden')
    .sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
}

function updateHydroSummaryBar() {
  const el = document.getElementById('hydro-terrain-summary');
  if (!el) return;
  const g = state.hydroSim.demGrid;
  if (!g?.stats) {
    el.textContent = 'Đang quét địa hình vùng...';
    return;
  }
  const slopeHint = (g.stats.steepPct || 0) >= 6 ? ` · Sườn dốc: ${g.stats.steepPct}%` : '';
  el.textContent = `Trũng ~${g.stats.lowlandPct}%${slopeHint} · Nền ${g.stats.minM}–${g.stats.maxM} m (${g.rows}×${g.cols})`;
}

async function refreshActiveZoneData({ flyMap = true } = {}) {
  state.isOffline = !navigator.onLine;
  updateOfflineStrip();

  const { lat, lng, radiusKm } = state.zone;
  state.riverDischarge = null;
  state.vnZoneIntel = null;

  const baselineInZone = filterFeaturesInZone(ALL_STATIC_POINTS, lat, lng, radiusKm, 200);
  state.zoneCorridors = filterCorridorsInZone(ALL_STATIC_CORRIDORS, lat, lng, radiusKm);
  state.zonePoints = baselineInZone;

  ensureZoneDemGrid(lat, lng, radiusKm).then((demObj) => {
    if (demObj && Math.abs(state.zone.lat - lat) < 0.001) {
      state.hydroSim.demGrid = demObj;
      updateHydroSummaryBar();
      hydroSurfaceLayer?.redraw();
      flowVectorsLayer?.redraw();
    }
  });

  renderPublicOverview({ flyMap });

  if (state.isOffline) return;

  const osmStatusEl = document.getElementById('osm-enrich-status');
  if (osmStatusEl) osmStatusEl.textContent = 'Đang tải OSM...';

  const [weatherRes, aqiRes, floodRes, vnGisRes, commRes, researchRes, osmRes] = await Promise.allSettled([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,rain,wind_speed_10m&hourly=precipitation,precipitation_probability,temperature_2m&forecast_hours=24&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FBangkok&forecast_days=2`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FBangkok`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}&daily=river_discharge,river_discharge_mean&past_days=7&forecast_days=14`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `/api/vn-gis?action=zone_intel&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `${PROJECT_CONFIG.communityApiUrl || '/api/community'}?action=public_sync&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `/api/research-portal?action=zone_data&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `/api/research-portal?action=zone_osm&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`
    ).then((r) => (r.ok ? r.json() : null))
  ]);

  if (weatherRes.status === 'fulfilled' && weatherRes.value?.current) {
    const c = weatherRes.value.current;
    const d = weatherRes.value.daily || {};
    state.weather = {
      temp: Number(c.temperature_2m),
      apparentTemp: Number(c.apparent_temperature),
      rainMm: Number(c.rain ?? c.precipitation ?? 0),
      windKmh: Number(c.wind_speed_10m ?? 0),
      dailyRainMm: Number(d.precipitation_sum?.[0] ?? 0)
    };
    state.hourlyForecast = weatherRes.value.hourly || null;
    if (Number.isFinite(Number(weatherRes.value.elevation))) {
      state.zoneElevationM = Math.round(Number(weatherRes.value.elevation));
    }
    if (state.hydroSim.preset === 'live') {
      const liveSim = Math.max(0, Math.round(state.weather.dailyRainMm || state.weather.rainMm * 4));
      state.hydroSim.rainMm = liveSim;
      const sl = document.getElementById('hydro-rain-slider');
      const lb = document.getElementById('hydro-rain-label');
      if (sl) sl.value = String(liveSim);
      if (lb) lb.textContent = `${liveSim} mm`;
    }
  }

  if (aqiRes.status === 'fulfilled' && aqiRes.value?.current) {
    const a = aqiRes.value.current;
    state.aqi = { usAqi: Number(a.us_aqi), pm25: Number(a.pm2_5), pm10: Number(a.pm10) };
  }

  if (floodRes.status === 'fulfilled' && Array.isArray(floodRes.value?.daily?.river_discharge)) {
    const vals = floodRes.value.daily.river_discharge.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    const means = (floodRes.value.daily.river_discharge_mean || []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    const dates = floodRes.value.daily.time || [];
    const todayIdx = Math.min(7, Math.max(0, vals.length - 1));
    const todayVal = vals[todayIdx] ?? 0;
    const meanVal = means[todayIdx] || vals.reduce((s, x) => s + x, 0) / Math.max(1, vals.length);
    const forecastSlice = vals.slice(todayIdx);
    const peak14d = forecastSlice.length ? Math.max(...forecastSlice) : todayVal;
    const ratioVsMean = meanVal > 0.2 ? Math.round((todayVal / meanVal) * 100) / 100 : 1;
    state.riverDischarge = { dates, vals, means, todayIdx, todayVal, peak14d, ratioVsMean };
  } else {
    state.riverDischarge = null;
  }

  const vnGisOk = vnGisRes.status === 'fulfilled' && vnGisRes.value?.ok ? vnGisRes.value : null;
  if (vnGisOk) {
    state.vnZoneIntel = vnGisOk;
    if (vnGisOk.admin?.elevationM != null && state.zoneElevationM == null) {
      state.zoneElevationM = Math.round(Number(vnGisOk.admin.elevationM));
    }
  }

  const commOk = commRes.status === 'fulfilled' && commRes.value?.ok ? commRes.value : null;
  if (commOk) {
    state.broadcast = commOk.broadcast || null;
    state.livePulse = commOk.livePulse || { byPoint: {}, recentFeed: [] };
  }

  const researchOk = researchRes.status === 'fulfilled' && researchRes.value?.ok ? researchRes.value : null;
  if (researchOk?.storageBackend) state.devStorageBackend = researchOk.storageBackend;
  state.publishedStudiesInZone = researchOk ? researchOk.publishedStudiesInZone || [] : [];

  const osmOk = osmRes.status === 'fulfilled' && osmRes.value?.ok ? osmRes.value : null;
  if (osmOk) {
    state.osmPois = Array.isArray(osmOk.pois) ? osmOk.pois : [];
    state.osmWaterways = Array.isArray(osmOk.waterways) ? osmOk.waterways : [];
    if (osmStatusEl) {
      osmStatusEl.textContent =
        state.osmPois.length + state.osmWaterways.length > 0
          ? `+${state.osmPois.length} y tế/trú · +${state.osmWaterways.length} thủy hệ`
          : 'Đã đồng bộ vùng';
    }
  } else if (osmStatusEl) {
    osmStatusEl.textContent = 'Đang dùng dữ liệu nền';
  }

  state.zonePoints = mergeZonePoints({
    baselineInZone,
    commRes: commOk,
    researchRes: researchOk,
    osmPois: state.osmPois,
    lat,
    lng,
    radiusKm
  });

  state.lastUpdatedAt = new Date().toISOString();
  writeJson(CACHE_KEY, {
    zone: state.zone,
    weather: state.weather,
    aqi: state.aqi,
    savedAt: state.lastUpdatedAt
  });

  renderPublicOverview({ flyMap: false });
  if (state.pubTab === 'housing') renderHousingCheck();
}

function renderHourlyRainChart() {
  const container = document.getElementById('hourly-rain-bars');
  const peakEl = document.getElementById('hourly-rain-peak');
  if (!container || !peakEl) return;

  const precipArr = Array.isArray(state.hourlyForecast?.precipitation)
    ? state.hourlyForecast.precipitation.slice(0, 24).map((x) => Math.max(0, Number(x) || 0))
    : [];
  const probArr = Array.isArray(state.hourlyForecast?.precipitation_probability)
    ? state.hourlyForecast.precipitation_probability.slice(0, 24).map((x) => Math.max(0, Number(x) || 0))
    : [];

  if (precipArr.length === 0) {
    container.innerHTML = Array.from({ length: 24 }, () => `<div class="hourly-bar-col"><div class="hourly-bar-fill is-dry" style="height:6%"></div></div>`).join('');
    peakEl.textContent = 'Đang cập nhật 24h';
    return;
  }

  const maxMm = Math.max(...precipArr);
  const maxProb = probArr.length > 0 ? Math.max(...probArr) : 0;
  const scaleTop = Math.max(maxMm, 10);
  peakEl.textContent = maxMm > 0 ? `Đỉnh ${maxMm.toFixed(1)} mm/h · XS ${Math.round(maxProb)}%` : `Không mưa · XS ${Math.round(maxProb)}%`;

  container.innerHTML = precipArr
    .map((mm, idx) => {
      const pct = mm > 0 ? Math.max(12, Math.min(100, Math.round((mm / scaleTop) * 100))) : 5;
      const cls = mm >= 15 ? 'is-heavy' : mm >= 3 ? 'is-mod' : mm > 0 ? '' : 'is-dry';
      const prob = probArr[idx] != null ? ` (${Math.round(probArr[idx])}%)` : '';
      return `<div class="hourly-bar-col" title="+${idx}h: ${mm.toFixed(1)} mm/h${prob}"><div class="hourly-bar-fill ${cls}" style="height:${pct}%"></div></div>`;
    })
    .join('');
}

function renderPublicOverview({ flyMap = false } = {}) {
  const updatedStr = state.lastUpdatedAt ? formatTimeHm(state.lastUpdatedAt) : 'Dữ liệu sẵn có';
  const riskCount = state.zonePoints.filter((p) => p.layerGroup === 'risk').length;
  const safeCount = state.zonePoints.filter((p) => p.layerGroup === 'safe').length;

  const zoneIds = new Set(state.zonePoints.map((p) => p.id));
  const zonePulseFeed = (state.livePulse?.recentFeed || []).filter((x) => zoneIds.has(x.pointId));

  const advisory = buildCitizenStatusAdvisory({
    areaName: `${state.zone.name} (R=${state.zone.radiusKm} km)`,
    weather: state.weather,
    aqi: state.aqi,
    livePulseFeed: zonePulseFeed,
    broadcast: state.broadcast,
    nearbyFloodCount: riskCount,
    updatedAtLabel: updatedStr,
    isOffline: state.isOffline
  });

  const hero = document.getElementById('advisory-hero');
  const pill = document.getElementById('advisory-level-pill');
  if (hero && pill) {
    hero.className = `advisory-card is-${advisory.level}`;
    pill.className = `status-pill is-${advisory.level}`;
    pill.textContent = advisory.levelLabel;
  }
  document.getElementById('advisory-updated-time').textContent = updatedStr;
  document.getElementById('advisory-headline').textContent = advisory.headline;
  document.getElementById('advisory-area').textContent = advisory.area;
  document.getElementById('advisory-time').textContent = advisory.time;
  document.getElementById('advisory-cause').textContent =
    state.zone.hazards?.length > 0 && advisory.level === 'normal'
      ? `${advisory.cause} Đặc trưng rủi ro địa bàn: ${state.zone.hazards.join(', ')}.`
      : advisory.cause;
  document.getElementById('advisory-action').textContent = advisory.action;

  const srcBadge = document.getElementById('advisory-source-badge');
  const srcMeta = PLAIN_SOURCE_LABELS[advisory.sourceClass] || PLAIN_SOURCE_LABELS.FORECAST_DATA;
  srcBadge.className = `source-badge tone-${srcMeta.tone}`;
  srcBadge.textContent = srcMeta.short;
  document.getElementById('advisory-source-text').textContent = advisory.sourceType;
  document.getElementById('advisory-honesty-note').textContent = advisory.honestyNote;

  const elevPill = document.getElementById('env-elev-pill');
  if (elevPill && state.zoneElevationM != null) {
    elevPill.textContent = `Cao độ tâm ~${state.zoneElevationM} m`;
  }

  if (state.weather) {
    document.getElementById('env-rain-val').textContent =
      state.weather.rainMm >= 0.5 ? `${state.weather.rainMm.toFixed(1)} mm/h` : `0 mm/h`;
    document.getElementById('env-rain-desc').textContent = `Tổng ngày ${state.zone.province}: ~${Math.round(state.weather.dailyRainMm)} mm · Gió ${Math.round(state.weather.windKmh || 0)} km/h`;
    document.getElementById('env-heat-val').textContent = `${Math.round(state.weather.temp)}°C / ${Math.round(state.weather.apparentTemp)}°C`;
    document.getElementById('env-heat-desc').textContent =
      state.weather.apparentTemp >= 38
        ? 'Chỉ số nóng bức cao — tránh nắng gắt 11h–15h.'
        : 'Nhiệt độ cảm nhận ngoài trời bình thường.';
  } else {
    document.getElementById('env-rain-val').textContent = '-- mm/h';
    document.getElementById('env-rain-desc').textContent = `Đang đồng bộ mưa tại ${state.zone.province}...`;
    document.getElementById('env-heat-val').textContent = '--°C';
    document.getElementById('env-heat-desc').textContent = `Đang tải nhiệt độ thực tế...`;
  }

  const aqiInfo = describeAqiPlain(state.aqi?.usAqi);
  document.getElementById('env-aqi-val').textContent = Number.isFinite(state.aqi?.usAqi)
    ? `AQI ${Math.round(state.aqi.usAqi)}`
    : '--';
  document.getElementById('env-aqi-desc').textContent = Number.isFinite(state.aqi?.pm25)
    ? `${aqiInfo.headline} (PM2.5 ~${state.aqi.pm25.toFixed(1)} µg/m³)`
    : aqiInfo.headline;

  document.getElementById('env-zone-points-val').textContent = `${state.zonePoints.length} điểm · ${state.zoneCorridors.length} tuyến`;
  document.getElementById('env-zone-points-desc').textContent = `${riskCount} rủi ro · ${safeCount} y tế/trú · ${state.osmWaterways.length} thủy hệ`;

  renderVnCadastralCard();
  renderHourlyRainChart();
  renderRiverDischargeChart();
  renderZoneMapAndList({ flyMap });
}

function renderVnCadastralCard() {
  const postEl = document.getElementById('vn-admin-post');
  const preEl = document.getElementById('vn-admin-pre');
  const popEl = document.getElementById('vn-zone-pop');
  if (!postEl || !preEl || !popEl) return;

  const intel = state.vnZoneIntel;
  if (!intel || (!intel.admin && !intel.populationZone)) {
    postEl.textContent = `${state.zone.name}`;
    preEl.textContent = 'Đang đồng bộ địa giới...';
    popEl.textContent = `Bán kính R=${state.zone.radiusKm} km`;
    return;
  }

  const post = intel.admin?.postMerger;
  const pre = intel.admin?.preMerger;
  const pz = intel.populationZone;

  postEl.textContent = post?.fullLabel || state.zone.name;
  postEl.title = post?.mergedFrom ? `Sáp nhập từ: ${post.mergedFrom}` : '';
  preEl.textContent = pre?.fullLabel || 'Không đổi';
  popEl.textContent =
    pz?.population != null
      ? `~${Number(pz.population).toLocaleString('vi-VN')} người (${Math.round(Number(pz.densityKm2 || 0)).toLocaleString('vi-VN')} người/km²)`
      : post?.population != null
        ? `~${Number(post.population).toLocaleString('vi-VN')} cư dân cấp xã`
        : `R=${state.zone.radiusKm} km`;
}

function renderRiverDischargeChart() {
  const badgeEl = document.getElementById('river-discharge-badge');
  const metaEl = document.getElementById('river-discharge-meta');
  const svgMount = document.getElementById('river-hydrograph-svg');
  if (!badgeEl || !metaEl || !svgMount) return;

  const rd = state.riverDischarge;
  if (!rd || !Array.isArray(rd.vals) || rd.vals.length < 5) {
    badgeEl.textContent = 'Mô hình thủy văn lưu vực';
    metaEl.innerHTML = `<span>Hiện tại: <strong>-- m³/s</strong></span><span>Đỉnh 14 ngày: <strong>--</strong></span><span>So với TB mùa: <strong>--</strong></span>`;
    svgMount.innerHTML = `<svg viewBox="0 0 320 58" preserveAspectRatio="none"><line x1="0" y1="48" x2="320" y2="48" stroke="#CBD5E1" stroke-dasharray="3 3"/></svg>`;
    return;
  }

  const maxV = Math.max(1, ...rd.vals, ...(rd.means || []));
  const minV = Math.min(0, ...rd.vals);
  const span = Math.max(1, maxV - minV);
  const W = 320;
  const H = 58;
  const toPt = (v, i) => {
    const x = 6 + (i / (rd.vals.length - 1)) * (W - 12);
    const y = H - 7 - ((v - minV) / span) * (H - 16);
    return [x, y];
  };

  const allPts = rd.vals.map(toPt);
  const pastPts = allPts.slice(0, rd.todayIdx + 1);
  const futPts = allPts.slice(rd.todayIdx);
  const meanPts = (rd.means || []).length === rd.vals.length ? rd.means.map(toPt) : [];

  const polyStr = (arr) => arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [tx, ty] = allPts[rd.todayIdx] || [110, 30];
  const areaPts = `${allPts[0][0].toFixed(1)},${H - 4} ${polyStr(allPts)} ${allPts[allPts.length - 1][0].toFixed(1)},${H - 4}`;

  const statusTxt =
    rd.ratioVsMean >= 1.5
      ? `Dâng cao (×${rd.ratioVsMean.toFixed(1)} TB)`
      : rd.ratioVsMean >= 1.2
        ? `Trên TB (×${rd.ratioVsMean.toFixed(1)})`
        : 'Ổn định theo mùa';
  badgeEl.textContent = statusTxt;
  metaEl.innerHTML = `
    <span>Hiện tại: <strong>${rd.todayVal.toFixed(1)} m³/s</strong></span>
    <span>Đỉnh 14d: <strong>${rd.peak14d.toFixed(1)} m³/s</strong></span>
    <span>TB mùa: <strong>×${rd.ratioVsMean.toFixed(2)}</strong></span>
  `;

  svgMount.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Đồ thị lưu lượng sông 21 ngày">
      <polygon fill="rgba(14, 165, 233, 0.14)" points="${areaPts}" />
      ${meanPts.length ? `<polyline fill="none" stroke="#94A3B8" stroke-width="1.2" stroke-dasharray="3 3" points="${polyStr(meanPts)}" />` : ''}
      <polyline fill="none" stroke="#0F766E" stroke-width="2.1" points="${polyStr(pastPts)}" />
      <polyline fill="none" stroke="#0284C7" stroke-width="2" stroke-dasharray="4 3" points="${polyStr(futPts)}" />
      <line x1="${tx.toFixed(1)}" y1="4" x2="${tx.toFixed(1)}" y2="${H - 4}" stroke="#DC2626" stroke-width="1.2" stroke-dasharray="2 2" />
      <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="3.2" fill="#DC2626" stroke="#FFFFFF" stroke-width="1.2" />
    </svg>
  `;
}

/* =========================================================================
   3. BẢN ĐỒ ĐA LỚP + MẶT PHỦ NGẬP NƯỚC 3 TẦNG + RỐN TRŨNG & VÀNH ĐAI + KÝ HIỆU SVG
   ========================================================================= */
function ensureNationalMap() {
  if (nationalMap || typeof window.L === 'undefined') return;
  nationalMap = window.L.map('national-map', { zoomControl: true }).setView([state.zone.lat, state.zone.lng], 14);
  window.L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(nationalMap);

  const cfg = BASEMAP_PROVIDERS[state.basemap] || BASEMAP_PROVIDERS.osm;
  baseTileLayer = window.L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom,
    className: cfg.className || '',
    attribution: cfg.attribution
  }).addTo(nationalMap);

  // Lớp Mặt phủ ngập nước thủy văn 60fps Canvas (Mặc định bật)
  hydroSurfaceLayer = createNationalHydroSurfaceLayer(window.L, () => ({
    enabled: state.layers.hydroSurface,
    showSlope: state.layers.flowVectors,
    simRainMm: state.hydroSim.rainMm,
    opacity: state.hydroSim.opacity,
    dischargeRatio: state.riverDischarge?.ratioVsMean || 1,
    centerLat: state.zone.lat,
    centerLng: state.zone.lng,
    radiusKm: state.zone.radiusKm,
    demGrid: state.hydroSim.demGrid,
    points: state.zonePoints,
    waterways: state.osmWaterways
  })).addTo(nationalMap);

  flowVectorsLayer = createHydroFlowVectorsLayer(window.L, () => ({
    enabled: state.layers.flowVectors,
    isDark: state.basemap === 'dark' || state.basemap === 'satellite',
    centerLat: state.zone.lat,
    centerLng: state.zone.lng,
    radiusKm: state.zone.radiusKm,
    demGrid: state.hydroSim.demGrid
  })).addTo(nationalMap);

  heatmapLayer = createNationalHeatmapLayer(window.L, () => state.zonePoints);

  basinsLayer = window.L.layerGroup().addTo(nationalMap);
  zoneCircleLayer = window.L.layerGroup().addTo(nationalMap);
  waterwaysLayer = window.L.layerGroup().addTo(nationalMap);
  corridorsLayer = window.L.layerGroup().addTo(nationalMap);
  zoneMarkersLayer = window.L.layerGroup().addTo(nationalMap);
  mainRouteLayer = window.L.layerGroup().addTo(nationalMap);

  nationalMap.on('mousemove', (ev) => {
    const c = document.getElementById('map-cursor-coords');
    if (c) c.textContent = `${ev.latlng.lat.toFixed(4)}°N, ${ev.latlng.lng.toFixed(4)}°E · Bấm để tra cao độ & y tế gần nhất`;
  });

  nationalMap.on('click', (ev) => {
    inspectClickedCoordinate(ev.latlng.lat, ev.latlng.lng);
  });
}

function setBasemap(key) {
  if (!BASEMAP_PROVIDERS[key]) return;
  state.basemap = key;
  document.querySelectorAll('[data-basemap]').forEach((b) => {
    const active = b.dataset.basemap === key;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  if (!nationalMap) return;
  if (baseTileLayer) nationalMap.removeLayer(baseTileLayer);
  const cfg = BASEMAP_PROVIDERS[key];
  baseTileLayer = window.L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom,
    className: cfg.className || '',
    attribution: cfg.attribution
  }).addTo(nationalMap);
  baseTileLayer.bringToBack();
}

function renderRadarFrame() {
  if (!nationalMap || !state.layers.radar || state.radarAnim.frames.length === 0) return;
  const frame = state.radarAnim.frames[state.radarAnim.idx] || state.radarAnim.frames[state.radarAnim.frames.length - 1];
  if (!frame?.path) return;
  if (radarTileLayer) nationalMap.removeLayer(radarTileLayer);
  radarTileLayer = window.L.tileLayer(`https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
    opacity: 0.58,
    maxNativeZoom: 7,
    maxZoom: 18,
    attribution: 'Radar &copy; RainViewer'
  }).addTo(nationalMap);
  const timeEl = document.getElementById('radar-frame-time');
  if (timeEl && frame.time) {
    const dt = new Date(frame.time * 1000);
    timeEl.textContent = `${dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} (${state.radarAnim.idx + 1}/${state.radarAnim.frames.length})`;
  }
}

function stopRadarPlayback() {
  if (state.radarAnim.timer) {
    clearInterval(state.radarAnim.timer);
    state.radarAnim.timer = null;
  }
  state.radarAnim.playing = false;
  const playBtn = document.getElementById('btn-radar-play');
  if (playBtn) playBtn.textContent = '▶ Phát động';
}

async function toggleRadarOverlay(enable) {
  state.layers.radar = Boolean(enable);
  const bar = document.getElementById('radar-timeline-bar');
  if (!nationalMap) return;
  if (!enable) {
    stopRadarPlayback();
    if (bar) bar.hidden = true;
    if (radarTileLayer) {
      nationalMap.removeLayer(radarTileLayer);
      radarTileLayer = null;
    }
    return;
  }
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = res.ok ? await res.json() : null;
    const past = (data?.radar?.past || []).slice(-6);
    if (past.length === 0) {
      showToast('Hiện chưa có khung ảnh Radar RainViewer mới.');
      return;
    }
    state.radarAnim.frames = past;
    state.radarAnim.idx = past.length - 1;
    if (bar) bar.hidden = false;
    renderRadarFrame();
    showToast('Đã bật lớp Radar mưa 2 giờ qua — bấm ▶ Phát động để xem hướng di chuyển mây mưa.');
  } catch {
    showToast('Không thể kết nối máy chủ Radar RainViewer lúc này.');
  }
}

async function inspectClickedCoordinate(lat, lng) {
  if (!isInsideVietnam(lat, lng)) {
    showToast('Tọa độ nằm ngoài phạm vi lãnh thổ Việt Nam.');
    return;
  }
  if (spotMarker && nationalMap) nationalMap.removeLayer(spotMarker);
  if (nationalMap) {
    spotMarker = window.L.circleMarker([lat, lng], {
      radius: 7,
      color: '#1D4ED8',
      weight: 3,
      fillColor: '#FFFFFF',
      fillOpacity: 1
    }).addTo(nationalMap);
  }

  const all = state.zonePoints;
  const nearRisks = all
    .filter((p) => p.layerGroup === 'risk')
    .map((p) => ({ ...p, d: haversineMeters(lat, lng, Number(p.lat), Number(p.lng)) }))
    .sort((a, b) => a.d - b.d);
  const nearSafe = all
    .filter((p) => p.layerGroup === 'safe')
    .map((p) => ({ ...p, d: haversineMeters(lat, lng, Number(p.lat), Number(p.lng)) }))
    .sort((a, b) => a.d - b.d);

  const box = document.getElementById('map-selected-card');
  if (!box) return;
  box.hidden = false;

  const localDem = sampleAnyDemGrid(state.hydroSim.demGrid, lat, lng);
  const grad = computeTerrainGradient(state.hydroSim.demGrid, lat, lng);
  const medianM = state.hydroSim.demGrid?.stats?.p50M ?? state.hydroSim.demGrid?.stats?.p45M ?? null;

  const renderCard = (elevNum, spotIntel = null) => {
    const r0 = nearRisks[0];
    const s0 = nearSafe[0];
    const relDiff = elevNum !== null && medianM !== null ? Math.round((elevNum - medianM) * 10) / 10 : null;
    const relText =
      relDiff === null
        ? 'Đang đối chiếu mặt bằng vùng'
        : relDiff <= -1.2
          ? `Thấp hơn mặt bằng ${relDiff} m (Dễ tụ nước)`
          : relDiff >= 1.5
            ? `Cao hơn mặt bằng +${relDiff} m (Thoát tốt)`
            : `Ngang mặt bằng vùng (${relDiff >= 0 ? '+' : ''}${relDiff} m)`;
    const slopeTxt = grad ? `${grad.slopeDeg}° (${grad.slopeDeg >= 14 ? 'Sườn dốc cao' : 'Thoải / Bằng'})` : 'Đang tính...';
    const postAdmin = spotIntel?.admin?.postMerger?.fullLabel;
    const preAdmin = spotIntel?.admin?.preMerger?.fullLabel;
    const pop500 = spotIntel?.pop500m?.population;
    const mapUrl = spotIntel?.cadastralMapUrl || `https://vn2000.vn/map?center=${lat.toFixed(6)},${lng.toFixed(6)}&zoom=17`;

    box.innerHTML = `
      <div class="section-head-row" style="margin-bottom:4px;">
        <strong>Chẩn đoán Vi mô Tọa độ Chạm</strong>
        <button type="button" id="btn-close-selected-pt" class="text-btn">Đóng</button>
      </div>
      ${
        postAdmin
          ? `<div class="place-card-meta" style="margin-bottom:4px;">
               <span class="source-tag tone-verified">${esc(postAdmin)}</span>
               ${preAdmin ? `<span class="muted-meta">Trước sáp nhập: ${esc(preAdmin)}</span>` : ''}
             </div>`
          : ''
      }
      <div class="spot-diag-grid">
        <div class="spot-diag-cell"><span>Tọa độ</span><strong>${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</strong></div>
        <div class="spot-diag-cell"><span>Cao độ mặt đất</span><strong>${elevNum !== null ? `~${elevNum.toFixed(1)} m` : 'Đang đo...'}</strong></div>
        <div class="spot-diag-cell"><span>Độ dốc bề mặt</span><strong>${esc(slopeTxt)}</strong></div>
        <div class="spot-diag-cell"><span>${pop500 != null ? 'Dân cư quanh 500 m' : 'Tương quan địa hình'}</span><strong>${pop500 != null ? `~${Number(pop500).toLocaleString('vi-VN')} người` : esc(relText)}</strong></div>
      </div>
      <p class="place-card-desc">
        ${r0 ? `<strong>Điểm rủi ro gần nhất:</strong> ${esc(r0.name)} (${esc(formatDistancePlain(r0.d))})<br>` : ''}
        ${s0 ? `<strong>Y tế / Điểm trú gần nhất:</strong> ${esc(s0.name)} (${esc(formatDistancePlain(s0.d))})` : 'Chưa tìm thấy cơ sở hỗ trợ gần hơn trong vùng khoanh.'}
      </p>
      <div id="spot-dynamic-extra"></div>
      <div class="place-card-actions" style="margin-top:6px;">
        ${s0 ? `<button type="button" class="btn btn-sm btn-primary js-spot-evacuate" data-lat="${lat}" data-lng="${lng}" data-slat="${s0.lat}" data-slng="${s0.lng}" data-sname="${esc(s0.name)}">Dẫn đường tới Y tế/Trú</button>` : ''}
        <button type="button" class="btn btn-sm btn-secondary js-spot-profile" data-lat="${lat}" data-lng="${lng}">Mặt cắt 2 km</button>
        <a href="${esc(mapUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">Thửa đất ↗</a>
        <button type="button" class="btn btn-sm btn-secondary js-spot-report" data-lat="${lat}" data-lng="${lng}" data-addr="${esc(postAdmin || '')}">Báo sự cố</button>
      </div>
    `;
    document.getElementById('btn-close-selected-pt')?.addEventListener('click', () => {
      box.hidden = true;
    });
  };

  renderCard(localDem !== null ? localDem : null, null);
  try {
    const spotRes = await fetch(`/api/vn-gis?action=spot_info&lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);
    const spotJson = spotRes.ok ? await spotRes.json() : null;
    if (spotJson?.ok) {
      const finalElev = localDem !== null ? localDem : spotJson.admin?.elevationM != null ? Number(spotJson.admin.elevationM) : null;
      renderCard(finalElev, spotJson);
    }
  } catch {
    // keep local card
  }
}

function getFilteredZonePoints() {
  const q = state.localFilterText.trim().toLowerCase();
  return state.zonePoints.filter((p) => {
    if (state.mapFilter === 'risk' && p.layerGroup !== 'risk') return false;
    if (state.mapFilter === 'safe' && p.layerGroup !== 'safe') return false;
    if (q) {
      const hay = `${p.name || ''} ${p.notes || ''} ${p.sourceCitation || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderZoneMapAndList({ flyMap = false } = {}) {
  ensureNationalMap();

  const riskCount = state.zonePoints.filter((p) => p.layerGroup === 'risk').length;
  const safeCount = state.zonePoints.filter((p) => p.layerGroup === 'safe').length;
  document.getElementById('mf-count-all').textContent = String(state.zonePoints.length);
  document.getElementById('mf-count-risk').textContent = String(riskCount);
  document.getElementById('mf-count-safe').textContent = String(safeCount);
  const mobCnt = document.getElementById('mob-pts-count');
  if (mobCnt) mobCnt.textContent = String(state.zonePoints.length);

  const filtered = getFilteredZonePoints();
  document.getElementById('map-list-count-title').textContent = `${filtered.length} đối tượng trong R=${state.zone.radiusKm} km`;

  const listEl = document.getElementById('zone-places-list');
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="card-panel">
        <p class="muted-body">
          Trong vòng khoanh <strong>${state.zone.radiusKm} km quanh ${esc(state.zone.name)}</strong> chưa có điểm nào khớp bộ lọc hiện tại.
        </p>
        <div class="form-actions-row">
          <button type="button" class="btn btn-sm btn-primary" data-pubtab-jump="report">+ Báo điểm sự cố</button>
          <button type="button" class="btn btn-sm btn-secondary js-jump-research-zone">Nộp dữ liệu Nghiên cứu</button>
        </div>
      </div>`;
  } else {
    listEl.innerHTML = filtered.slice(0, 75).map((pt) => renderPointCardHtml(pt)).join('');
  }

  if (!nationalMap) return;
  basinsLayer.clearLayers();
  zoneCircleLayer.clearLayers();
  waterwaysLayer.clearLayers();
  corridorsLayer.clearLayers();
  zoneMarkersLayer.clearLayers();

  const ring = window.L.circle([state.zone.lat, state.zone.lng], {
    radius: state.zone.radiusKm * 1000,
    color: '#0F766E',
    weight: 2.3,
    dashArray: '7 5',
    fillColor: '#0F766E',
    fillOpacity: 0.03
  }).addTo(zoneCircleLayer);

  // Vành đai cự ly đồng tâm + Đa giác rốn trũng địa hình + Tuyến thoát hiểm nền cao
  if (state.layers.basins) {
    for (const frac of [0.25, 0.5, 0.75]) {
      const subKm = Math.round(state.zone.radiusKm * frac * 100) / 100;
      window.L.circle([state.zone.lat, state.zone.lng], {
        radius: subKm * 1000,
        color: '#475569',
        weight: 1,
        dashArray: '4 6',
        fill: false,
        interactive: false
      }).addTo(basinsLayer);

      const labelLat = state.zone.lat + (subKm / 110.574);
      window.L.marker([labelLat, state.zone.lng], {
        interactive: false,
        icon: window.L.divIcon({
          className: '',
          html: `<span class="ring-dist-label">${subKm >= 1 ? `${subKm} km` : `${Math.round(subKm * 1000)} m`}</span>`,
          iconSize: [44, 16],
          iconAnchor: [22, 8]
        })
      }).addTo(basinsLayer);
    }

    // Vẽ các rốn trũng đa đô thị (Đông Ngạc + Hà Nội, Huế, Đà Nẵng, Hội An, TP.HCM, Cần Thơ...) nếu giao cắt vùng khoanh
    const localBasins = filterBasinsInZone(ALL_STATIC_BASINS, state.zone.lat, state.zone.lng, state.zone.radiusKm);
    for (const basin of localBasins) {
      window.L.polygon(basin.coordinates, {
        color: '#0284C7',
        weight: 1.7,
        dashArray: '5 4',
        fillColor: '#0EA5E9',
        fillOpacity: 0.13
      })
        .bindPopup(
          `<strong>${esc(basin.name)}</strong><br><small>Ngưỡng mưa tích nước tham chiếu: ~${basin.rainThresholdMm} mm · Cao độ nền: ${esc(String(basin.demRange || '').replace('DSM', ''))}</small>`
        )
        .addTo(basinsLayer);
    }

    // Tuyến di chuyển ưu tiên nền cao tại Đông Ngạc (nếu nằm trong vùng)
    for (const dr of SAFE_DETOUR_ROUTES) {
      const latLngs = (dr.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (!latLngs.length) continue;
      const near = latLngs.some(([la, ln]) => haversineMeters(state.zone.lat, state.zone.lng, la, ln) <= state.zone.radiusKm * 1000);
      if (!near) continue;
      window.L.polyline(latLngs, {
        color: '#15803D',
        weight: 4,
        dashArray: '6 5',
        opacity: 0.85
      })
        .bindTooltip(dr.name)
        .addTo(basinsLayer);
    }
  }

  window.L.circleMarker([state.zone.lat, state.zone.lng], {
    radius: 6,
    color: '#0F766E',
    weight: 2.5,
    fillColor: '#FFFFFF',
    fillOpacity: 1
  })
    .bindTooltip(`Tâm vùng khoanh: ${state.zone.name}`)
    .addTo(zoneCircleLayer);

  if (state.layers.waterways && state.osmWaterways.length > 0) {
    for (const ww of state.osmWaterways) {
      window.L.polyline(ww.coordinates, {
        color: '#0284C7',
        weight: 2.8,
        opacity: 0.8
      })
        .bindTooltip(`${ww.name} (${ww.waterwayType})`)
        .addTo(waterwaysLayer);
    }
  }

  if (state.layers.corridors && state.zoneCorridors.length > 0) {
    for (const cor of state.zoneCorridors) {
      const latLngs = (cor.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (latLngs.length < 2) continue;
      window.L.polyline(latLngs, {
        color: cor.severity === 'severe' ? '#DC2626' : '#D97706',
        weight: 5,
        opacity: 0.85
      })
        .bindPopup(`<strong>${esc(cor.name)}</strong><br><small>Ngưỡng mưa tham chiếu ~${cor.rainThresholdMm} mm · ${esc(cor.source)}</small><br>${esc(cor.note)}`)
        .addTo(corridorsLayer);
    }
  }

  // Ký hiệu bản đồ trực quan bằng SVG Pictograms
  for (const pt of filtered) {
    window.L.marker([Number(pt.lat), Number(pt.lng)], {
      icon: buildMapPictogramIcon(window.L, pt),
      title: pt.name
    })
      .on('click', (ev) => {
        window.L.DomEvent.stopPropagation(ev);
        showSelectedPointCard(pt);
      })
      .addTo(zoneMarkersLayer);
  }

  hydroSurfaceLayer?.redraw();
  flowVectorsLayer?.redraw();
  if (state.layers.heatmap) heatmapLayer?.redraw();

  if (flyMap && ring.getBounds().isValid()) {
    nationalMap.fitBounds(ring.getBounds(), { padding: [24, 24], maxZoom: 15 });
  }
}

function renderPointCardHtml(pt) {
  const ver = describePointVerificationPlain(pt);
  const pulse = state.livePulse?.byPoint?.[pt.id];
  const cardType = pt.layerGroup === 'safe' ? 'is-safe' : pt.category === 'heat' ? 'is-heat' : 'is-risk';
  const catNames = {
    flood: 'Điểm ngập úng',
    landslide: 'Nguy cơ sạt lở',
    heat: 'Nắng nóng / Ô nhiễm',
    traffic: 'Đường nguy hiểm',
    air_quality: 'Điểm ô nhiễm khí',
    salinity: 'Hạn mặn',
    shelter: 'Trụ sở / Điểm trú',
    medical: 'Cơ sở y tế'
  };
  const pulseTag = pulse
    ? `<span class="source-tag ${pulse.status === 'flooding' ? 'tone-community' : 'tone-verified'}">Trực tiếp: ${
        pulse.status === 'flooding' ? 'Đang ngập' : pulse.status === 'receding' ? 'Đang rút' : 'Khô ráo'
      }</span>`
    : '';
  const researchTag = pt.submissionId ? `<span class="source-tag tone-verified">Nghiên cứu đã duyệt</span>` : '';
  const osmTag = pt.isOsmLive ? `<span class="source-tag tone-model">OSM Vùng khoanh</span>` : '';

  return `
    <article class="place-card ${cardType}">
      <div class="place-card-top">
        <h3 class="place-card-title">${esc(pt.name)}</h3>
        <span class="place-card-dist">${esc(formatDistancePlain(pt.distanceMeters))}</span>
      </div>
      <div class="place-card-meta">
        <span class="source-tag ${pt.layerGroup === 'safe' ? 'tone-verified' : 'tone-community'}">${esc(catNames[pt.category] || 'Điểm ghi nhận')}</span>
        ${osmTag || `<span class="source-tag tone-${ver.badgeTone}">${esc(ver.label)}</span>`}
        ${researchTag}
        ${pulseTag}
      </div>
      <p class="place-card-desc">${esc((pt.notes || '').slice(0, 175))}</p>
      <div class="place-card-actions">
        <button type="button" class="btn btn-sm btn-secondary js-focus-map-pt" data-lat="${pt.lat}" data-lng="${pt.lng}" data-ptid="${esc(pt.id)}">Định vị</button>
        ${
          pt.layerGroup === 'risk'
            ? `<button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="flooding">Đang ngập</button>
               <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="clear">Khô ráo</button>`
            : ''
        }
      </div>
    </article>`;
}

function showSelectedPointCard(pt) {
  const box = document.getElementById('map-selected-card');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `
    <div class="section-head-row" style="margin-bottom:6px;">
      <strong>Chi tiết đối tượng trong vùng khoanh</strong>
      <button type="button" id="btn-close-selected-pt" class="text-btn">Đóng</button>
    </div>
    ${renderPointCardHtml(pt)}
  `;
  document.getElementById('btn-close-selected-pt')?.addEventListener('click', () => {
    box.hidden = true;
  });
}

/* =========================================================================
   4. TÌM KIẾM KHU VỰC TOÀN VIỆT NAM (63 TỈNH/THÀNH + NOMINATIM VN)
   ========================================================================= */
function renderZoneSuggestions(query) {
  const list = document.getElementById('vn-zone-suggestions');
  if (!list) return;
  const matches = searchVietnamZones(query, 'all', 10);
  if (matches.length === 0) {
    list.hidden = true;
    return;
  }
  list.innerHTML = matches
    .map(
      (z) => `
      <li>
        <button type="button" class="js-pick-suggestion" data-zoneid="${esc(z.id)}">
          <strong>${esc(z.name)}</strong>
          <span>${esc(z.hazards.join(' · '))}</span>
        </button>
      </li>`
    )
    .join('');
  list.hidden = false;
}

async function handleVietnamZoneSearch() {
  const q = (document.getElementById('vn-zone-search')?.value || '').trim();
  const radiusKm = Number(document.getElementById('vn-zone-radius')?.value || 5);
  document.getElementById('vn-zone-suggestions').hidden = true;

  if (!q) {
    selectZone(state.zone, { radiusKm, flyMap: true });
    return;
  }

  const localHit = searchVietnamZones(q, 'all', 1)[0];
  if (localHit) {
    selectZone(localHit, { radiusKm, flyMap: true });
    showToast(`Đã khoanh vùng ${radiusKm} km quanh ${localHit.name}.`);
    return;
  }

  if (!state.isOffline) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&q=${encodeURIComponent(q)}`
      );
      const arr = res.ok ? await res.json() : [];
      if (arr[0] && isInsideVietnam(Number(arr[0].lat), Number(arr[0].lon))) {
        const lat = Number(arr[0].lat);
        const lng = Number(arr[0].lon);
        const nearest = findNearestVietnamZone(lat, lng);
        selectZone(
          {
            id: `nom-${Date.now().toString(36)}`,
            name: arr[0].display_name.split(',').slice(0, 3).join(', '),
            province: nearest?.province || q,
            macroRegion: nearest?.macroRegion || 'bac',
            lat,
            lng,
            hazards: nearest?.hazards || []
          },
          { radiusKm, flyMap: true }
        );
        showToast(`Đã khoanh vùng ${radiusKm} km tại ${q}.`);
        return;
      }
    } catch {
      // xử lý thông báo bên dưới
    }
  }
  showToast(`Chưa tìm thấy "${q}" tại Việt Nam. Hãy thử nhập tên tỉnh/thành hoặc quận/huyện.`);
}

/* =========================================================================
   5. PHÂN TÍCH LỘ TRÌNH, KIỂM TRA NƠI Ở & BÁO SỰ CỐ TOÀN QUỐC
   ========================================================================= */
async function geocodeVietnamPlace(text) {
  const q = String(text || '').trim();
  const zoneHit = searchVietnamZones(q, 'all', 1)[0];
  if (zoneHit) return { name: zoneHit.name, lat: zoneHit.lat, lng: zoneHit.lng };
  const localPt = state.zonePoints.find((p) => (p.name || '').toLowerCase().includes(q.toLowerCase()));
  if (localPt) return { name: localPt.name, lat: Number(localPt.lat), lng: Number(localPt.lng) };
  if (!state.isOffline) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&q=${encodeURIComponent(q)}`
      );
      const arr = res.ok ? await res.json() : [];
      if (arr[0]) return { name: q, lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
    } catch {
      // fallback
    }
  }
  return { name: state.zone.name, lat: state.zone.lat, lng: state.zone.lng };
}

async function fetchOsrm(waypoints, travelMode) {
  if (state.isOffline) return null;
  const profile = travelMode === 'foot' ? 'foot' : 'driving';
  const str = waypoints.map(([la, ln]) => `${ln},${la}`).join(';');
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${str}?overview=full&geometries=geojson`);
    if (!res.ok) return null;
    const d = await res.json();
    const r = d?.routes?.[0];
    if (!r?.geometry?.coordinates) return null;
    return {
      coordsLngLat: r.geometry.coordinates,
      distanceKm: Math.round((r.distance / 1000) * 100) / 100,
      durationMin: Math.max(2, Math.round((r.duration / 60) * (travelMode === 'foot' ? 1 : 1.15)))
    };
  } catch {
    return null;
  }
}

async function runNationalRouteComparison(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-compare-routes');
  btn.disabled = true;
  btn.textContent = 'Đang tính toán lộ trình...';
  try {
    const start = await geocodeVietnamPlace(document.getElementById('route-start-input')?.value);
    const end = await geocodeVietnamPlace(document.getElementById('route-end-input')?.value);

    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;
    const altOffset = 0.008;
    const direct = (await fetchOsrm([[start.lat, start.lng], [end.lat, end.lng]], state.travelMode)) || {
      coordsLngLat: [[start.lng, start.lat], [end.lng, end.lat]],
      distanceKm: Math.round((haversineMeters(start.lat, start.lng, end.lat, end.lng) * 1.25) / 10) / 100,
      durationMin: Math.max(3, Math.round(haversineMeters(start.lat, start.lng, end.lat, end.lng) / 300))
    };
    const alt1 = await fetchOsrm([[start.lat, start.lng], [midLat + altOffset, midLng + altOffset], [end.lat, end.lng]], state.travelMode);
    const alt2 = await fetchOsrm([[start.lat, start.lng], [midLat - altOffset, midLng - altOffset], [end.lat, end.lng]], state.travelMode);

    const riskPoints = state.zonePoints.filter((p) => p.layerGroup === 'risk');
    const directEval = analyzePolylineCorridor(window.turf, direct.coordsLngLat, riskPoints, 130);
    const candidates = [alt1, alt2].filter(Boolean).map((c) => ({
      geom: c,
      ev: analyzePolylineCorridor(window.turf, c.coordsLngLat, riskPoints, 130)
    }));
    candidates.sort((a, b) => a.ev.nearbyRisks.length - b.ev.nearbyRisks.length || a.geom.distanceKm - b.geom.distanceKm);
    const bestAlt = candidates[0] || { geom: direct, ev: directEval };

    const cmp = buildHonestRouteComparison({
      originName: start.name,
      destName: end.name,
      travelMode: state.travelMode,
      directRoute: { distanceKm: direct.distanceKm, durationMin: direct.durationMin, risks: directEval.nearbyRisks },
      detourRoute: { distanceKm: bestAlt.geom.distanceKm, durationMin: bestAlt.geom.durationMin, risks: bestAlt.ev.nearbyRisks }
    });

    document.getElementById('route-comparison-output').hidden = false;
    document.getElementById('route-reason-banner').innerHTML = `<strong>${esc(start.name)} → ${esc(end.name)}:</strong><br>${esc(cmp.reason)}`;
    const dRisk = cmp.directSummary.riskCount;
    const aRisk = cmp.detourSummary.riskCount;
    const altNote =
      aRisk < dRisk
        ? `Đi gần <strong>${aRisk} vị trí</strong> rủi ro — ít hơn tuyến thông thường (${dRisk}).`
        : aRisk === 0
          ? 'Không đi sát điểm rủi ro đã ghi nhận nào.'
          : `Đi gần <strong>${aRisk} vị trí</strong> rủi ro (tương đương tuyến chính).`;

    document.getElementById('route-compare-cards').innerHTML = `
      <article class="route-option-card ${cmp.recommendation !== 'detour' ? 'is-recommended' : ''}">
        <span class="source-tag ${dRisk > 0 ? 'tone-community' : 'tone-verified'}">Tuyến thông thường</span>
        <div class="route-metrics"><span>${cmp.directSummary.distanceKm} km</span><span>~${cmp.directSummary.durationMin} phút</span></div>
        <p class="muted-body">${dRisk > 0 ? `Đi gần <strong>${dRisk} vị trí</strong> rủi ro.` : 'Không đi sát điểm rủi ro đã ghi nhận.'}</p>
      </article>
      <article class="route-option-card ${cmp.recommendation === 'detour' ? 'is-recommended' : ''}">
        <span class="source-tag ${aRisk < dRisk ? 'tone-verified' : 'tone-model'}">${aRisk < dRisk ? 'Tuyến ít rủi ro (Đề xuất)' : 'Tuyến vòng tham khảo'}</span>
        <div class="route-metrics"><span>${cmp.detourSummary.distanceKm} km</span><span>~${cmp.detourSummary.durationMin} phút</span></div>
        <p class="muted-body">${altNote}</p>
      </article>
    `;
    document.getElementById('route-honesty-banner').textContent = cmp.cannotGuaranteeSafeNotice;

    if (typeof window.L !== 'undefined') {
      const directCoords = direct.coordsLngLat.map(([ln, la]) => [la, ln]);
      const altCoords = bestAlt.geom.coordsLngLat.map(([ln, la]) => [la, ln]);

      if (!routeMap) {
        routeMap = window.L.map('route-mini-map').setView([start.lat, start.lng], 13);
        window.L.tileLayer(BASEMAP_PROVIDERS.osm.url, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(routeMap);
        routeLinesLayer = window.L.layerGroup().addTo(routeMap);
      }
      routeLinesLayer.clearLayers();
      const l1 = window.L.polyline(directCoords, { color: dRisk > 0 ? '#DC2626' : '#64748B', weight: 4.5, dashArray: '7 5' }).addTo(routeLinesLayer);
      const l2 = window.L.polyline(altCoords, { color: '#16A34A', weight: 5.5 }).addTo(routeLinesLayer);
      setTimeout(() => {
        routeMap.invalidateSize();
        const b = window.L.featureGroup([l1, l2]).getBounds();
        if (b.isValid()) routeMap.fitBounds(b, { padding: [20, 20] });
      }, 80);

      if (nationalMap && mainRouteLayer) {
        mainRouteLayer.clearLayers();
        const ml1 = window.L.polyline(directCoords, { color: dRisk > 0 ? '#DC2626' : '#64748B', weight: 4.5, dashArray: '7 5' }).addTo(mainRouteLayer);
        const ml2 = window.L.polyline(altCoords, { color: '#16A34A', weight: 5.5 }).addTo(mainRouteLayer);
        const mb = window.L.featureGroup([ml1, ml2]).getBounds();
        if (mb.isValid()) nationalMap.fitBounds(mb, { padding: [32, 32] });
      }
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đối chiếu 2 phương án tuyến đường';
  }
}

function renderHousingCheck() {
  const summary = buildHonestRentalAreaSummary(state.zone.lat, state.zone.lng, state.zone.name, state.zonePoints);
  document.getElementById('housing-area-heading').textContent = `Ghi nhận hiện có quanh ${state.zone.name}`;
  document.getElementById('housing-observations-list').innerHTML = summary.observations.map((o) => `<li>${esc(o)}</li>`).join('');
  document.getElementById('housing-epistemic-warning').textContent = summary.epistemicWarning;

  const saved = readJson(CHECKLIST_KEY, { checked: {}, note: '' });
  const groups = new Map();
  for (const item of RENTAL_INSPECTION_CHECKLIST) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  document.getElementById('rental-checklist-groups').innerHTML = [...groups.entries()]
    .map(
      ([gName, items]) => `
      <div class="checklist-group-box">
        <strong class="checklist-group-title">${esc(gName)}</strong>
        ${items
          .map((item) => {
            const checked = Boolean(saved.checked?.[item.id]);
            return `
              <label class="checklist-item ${checked ? 'is-checked' : ''}">
                <input type="checkbox" class="js-rental-chk" data-chkid="${esc(item.id)}" ${checked ? 'checked' : ''}>
                <div><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></div>
              </label>`;
          })
          .join('')}
      </div>`
    )
    .join('');
  document.getElementById('rental-personal-note').value = saved.note || '';
  updateChecklistProgress();
}

function updateChecklistProgress() {
  const saved = readJson(CHECKLIST_KEY, { checked: {}, note: '' });
  const done = RENTAL_INSPECTION_CHECKLIST.filter((i) => saved.checked?.[i.id]).length;
  document.getElementById('checklist-progress-badge').textContent = `${done}/${RENTAL_INSPECTION_CHECKLIST.length} mục`;
}

async function stripExifClientSide(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp ảnh không hợp lệ.'));
      img.onload = () => {
        const maxDim = 680;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let q = 0.7;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        while (dataUrl.length > 44000 && q > 0.35) {
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleNationalReportSubmit(e) {
  e.preventDefault();
  const fb = document.getElementById('rep-form-feedback');
  const locName = (document.getElementById('rep-location-name')?.value || '').trim();
  const consent = document.getElementById('rep-consent')?.checked;
  const category = document.querySelector('input[name="repCategory"]:checked')?.value || 'flood';
  const waterScale = document.getElementById('rep-water-scale')?.value || 'half_wheel';
  const notes = (document.getElementById('rep-notes')?.value || '').trim();

  if (locName.length < 3 || !consent) {
    fb.hidden = false;
    fb.className = 'form-feedback is-error';
    fb.textContent = locName.length < 3 ? 'Vui lòng nhập tên vị trí (tối thiểu 3 ký tự).' : 'Vui lòng tích ô đồng ý chia sẻ ẩn danh.';
    return;
  }

  const payload = {
    name: locName,
    category,
    province: state.zone.province,
    lat: roundPrivacyCoord(state.reportPin.lat, true),
    lng: roundPrivacyCoord(state.reportPin.lng, true),
    waterScale,
    notes,
    photoDataUrl: state.reportPhotoDataUrl || '',
    reporterRole: 'Cư dân đóng góp'
  };

  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_report', ...payload })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      fb.hidden = false;
      fb.className = 'form-feedback is-error';
      fb.textContent = data?.error || 'Không gửi được phản ánh.';
      return;
    }
    fb.hidden = false;
    fb.className = 'form-feedback is-ok';
    fb.textContent = 'Đã tiếp nhận phản ánh! Điểm mới hiển thị trong vùng khoanh với nhãn “Phản ánh cộng đồng (chờ kiểm chứng)”.';
    document.getElementById('national-report-form').reset();
    state.reportPhotoDataUrl = '';
    refreshActiveZoneData({ flyMap: false });
  } catch {
    const queue = readJson(OFFLINE_QUEUE_KEY, []);
    queue.push(createOfflineReportQueueItem(payload));
    writeJson(OFFLINE_QUEUE_KEY, queue);
    updateOfflineStrip();
    fb.hidden = false;
    fb.className = 'form-feedback is-ok';
    fb.textContent = 'Đang ngoại tuyến — phản ánh đã lưu tạm an toàn trên máy và sẽ gửi lại khi có mạng.';
  }
}

/* =========================================================================
   6. PHÂN HỆ 2: CỔNG NHÀ NGHIÊN CỨU
   ========================================================================= */
function populateProvinceSelects() {
  const opts = VIETNAM_ZONES.map(
    (z) => `<option value="${esc(z.id)}" data-province="${esc(z.province)}" data-lat="${z.lat}" data-lng="${z.lng}" data-region="${esc(z.macroRegion)}">${esc(z.name)}</option>`
  ).join('');
  const regProv = document.getElementById('rs-reg-province');
  const subProv = document.getElementById('sub-province');
  if (regProv) regProv.innerHTML = opts;
  if (subProv) subProv.innerHTML = opts;
}

async function renderResearchPillar() {
  const gate = document.getElementById('research-auth-gate');
  const workspace = document.getElementById('research-workspace');
  if (!state.researcherToken) {
    gate.hidden = false;
    workspace.hidden = true;
    return;
  }

  try {
    const res = await fetch('/api/research-portal?action=my_workspace', {
      headers: { Authorization: `Bearer ${state.researcherToken}` }
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      sessionStorage.removeItem(RESEARCHER_TOKEN_KEY);
      state.researcherToken = '';
      gate.hidden = false;
      workspace.hidden = true;
      return;
    }

    state.researcherProfile = data.profile;
    state.mySubmissions = data.submissions || [];
    gate.hidden = true;
    workspace.hidden = false;

    document.getElementById('rs-profile-name').textContent = `${data.profile.fullName} · ${data.profile.specialty}`;
    document.getElementById('rs-profile-meta').textContent = `${data.profile.organization} · Địa bàn: ${data.profile.focusProvince} · Kho lưu trữ: ${data.storageBackend}`;

    renderMySubmissionsList();
    ensureStudyStudioMap();
  } catch {
    showToast('Chưa kết nối được máy chủ Cổng Nghiên cứu.');
  }
}

function renderMySubmissionsList() {
  const el = document.getElementById('my-submissions-list');
  if (!el) return;
  if (state.mySubmissions.length === 0) {
    el.innerHTML = `<p class="muted-body">Bạn chưa gửi hồ sơ nghiên cứu nào. Hãy chọn tỉnh, chấm điểm hoặc nạp GeoJSON bên trái rồi gửi kiểm định.</p>`;
    return;
  }
  const statusBadge = {
    pending_review: { label: 'Chờ kiểm định', cls: 'tone-community' },
    published: { label: 'Đã xuất bản lên Bản đồ & Bản tin', cls: 'tone-verified' },
    rejected: { label: 'Cần bổ sung', cls: 'tone-simulated' }
  };
  el.innerHTML = state.mySubmissions
    .map((s) => {
      const st = statusBadge[s.status] || statusBadge.pending_review;
      return `
        <article class="place-card ${s.status === 'published' ? 'is-safe' : 'is-heat'}">
          <div class="place-card-top">
            <h3 class="place-card-title">${esc(s.title)}</h3>
            <span class="source-tag ${st.cls}">${esc(st.label)}</span>
          </div>
          <p class="place-card-desc">${esc(s.province)} · R=${s.radiusKm} km · ${s.featureCount} điểm tọa độ</p>
          ${s.reviewNote ? `<p class="field-status-note">Phản hồi: ${esc(s.reviewNote)}</p>` : ''}
        </article>`;
    })
    .join('');
}

function getSelectedStudyProvinceMeta() {
  const sel = document.getElementById('sub-province');
  const opt = sel?.selectedOptions?.[0];
  return {
    province: opt?.dataset?.province || 'Hà Nội',
    macroRegion: opt?.dataset?.region || 'bac',
    lat: Number(opt?.dataset?.lat || 21.0285),
    lng: Number(opt?.dataset?.lng || 105.8542),
    radiusKm: Number(document.getElementById('sub-radius')?.value || 5)
  };
}

function ensureStudyStudioMap() {
  if (typeof window.L === 'undefined') return;
  const meta = getSelectedStudyProvinceMeta();
  if (!studyMap) {
    studyMap = window.L.map('research-studio-map').setView([meta.lat, meta.lng], 12);
    window.L.tileLayer(BASEMAP_PROVIDERS.osm.url, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(studyMap);
    studyDraftLayer = window.L.layerGroup().addTo(studyMap);
    studyMap.on('click', (ev) => {
      const lat = Math.round(ev.latlng.lat * 1_000_000) / 1_000_000;
      const lng = Math.round(ev.latlng.lng * 1_000_000) / 1_000_000;
      const cat = document.getElementById('sub-hazard')?.value || 'flood';
      const prov = getSelectedStudyProvinceMeta().province;
      const l0 = Number(document.getElementById('vn2k-l0')?.value) || lookupCentralMeridian(prov, lng);
      const zw = Number(document.getElementById('vn2k-zone')?.value || 3);
      const vn2k = wgs84ToVn2000Local(lat, lng, l0, zw);
      const rd = document.getElementById('vn2k-readout');
      if (rd) {
        rd.textContent = `VN-2000 (${prov}, L0=${l0}°, Múi ${zw}°): X = ${vn2k.x.toFixed(3)} m · Y = ${vn2k.y.toFixed(3)} m`;
      }

      if (state.studyDrawMode === 'point') {
        const idx = state.draftStudyPoints.length + 1;
        state.draftStudyPoints.push({
          name: `Điểm khảo sát ${idx} (${prov})`,
          lat,
          lng,
          category: cat,
          notes: 'Điểm khảo sát do nhà nghiên cứu gắn trực tiếp trên bản đồ.'
        });
      } else {
        const kind = state.studyDrawMode; // 'line' | 'polygon'
        let activeShape = state.draftStudyShapes[state.draftStudyShapes.length - 1];
        if (!activeShape || activeShape.kind !== kind) {
          activeShape = {
            kind,
            name: `${kind === 'polygon' ? 'Vùng đa giác' : 'Tuyến khảo sát'} ${state.draftStudyShapes.length + 1} (${prov})`,
            category: cat,
            coords: []
          };
          state.draftStudyShapes.push(activeShape);
        }
        activeShape.coords.push([lat, lng]);
        // Đồng bộ đỉnh đại diện vào danh sách điểm kiểm định để hiển thị ngay trên bản đồ vùng khoanh
        state.draftStudyPoints.push({
          name: `${activeShape.name} · Đỉnh ${activeShape.coords.length}`,
          lat,
          lng,
          category: cat,
          notes: `Thuộc ${kind === 'polygon' ? 'đa giác vùng ngập/rủi ro' : 'hành lang tuyến khảo sát'}.`
        });
      }
      renderStudyDraftOverlay();
    });
  }
  renderStudyDraftOverlay();
  setTimeout(() => studyMap.invalidateSize(), 80);
}

function renderStudyDraftOverlay() {
  const prev = document.getElementById('sub-points-preview');
  if (prev) {
    const shapeInfo = state.draftStudyShapes.length > 0 ? ` + ${state.draftStudyShapes.length} tuyến/vùng đa giác` : '';
    prev.textContent =
      state.draftStudyPoints.length > 0
        ? `Đã chuẩn bị ${state.draftStudyPoints.length} tọa độ${shapeInfo} sẵn sàng gửi kiểm định.`
        : 'Chưa có đối tượng nào được vẽ. Chọn Điểm / Tuyến / Vùng rồi chạm bản đồ hoặc nạp tệp GeoJSON.';
  }
  if (!studyMap || !studyDraftLayer) return;
  studyDraftLayer.clearLayers();
  const meta = getSelectedStudyProvinceMeta();
  studyZoneCircle = window.L.circle([meta.lat, meta.lng], {
    radius: meta.radiusKm * 1000,
    color: '#0F766E',
    weight: 2,
    dashArray: '6 5',
    fillOpacity: 0.05
  }).addTo(studyDraftLayer);

  for (const sh of state.draftStudyShapes) {
    if (sh.kind === 'polygon' && sh.coords.length >= 3) {
      window.L.polygon(sh.coords, { color: '#0284C7', weight: 2, fillColor: '#0EA5E9', fillOpacity: 0.2 })
        .bindTooltip(sh.name)
        .addTo(studyDraftLayer);
    } else if (sh.coords.length >= 2) {
      window.L.polyline(sh.coords, { color: '#DC2626', weight: 3.5 })
        .bindTooltip(sh.name)
        .addTo(studyDraftLayer);
    }
  }

  for (const pt of state.draftStudyPoints) {
    window.L.circleMarker([pt.lat, pt.lng], {
      radius: 6.5,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#0F766E',
      fillOpacity: 0.95
    })
      .bindTooltip(pt.name)
      .addTo(studyDraftLayer);
  }
}

function exportStudyDraftGeoJson() {
  if (state.draftStudyPoints.length === 0 && state.draftStudyShapes.length === 0) {
    showToast('Chưa có đối tượng không gian nào trên bản đồ nghiên cứu để xuất.');
    return;
  }
  const meta = getSelectedStudyProvinceMeta();
  const features = [
    ...state.draftStudyPoints.map((p) => ({
      type: 'Feature',
      properties: { name: p.name, category: p.category, province: meta.province, notes: p.notes },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
    })),
    ...state.draftStudyShapes
      .filter((s) => s.coords.length >= (s.kind === 'polygon' ? 3 : 2))
      .map((s) => ({
        type: 'Feature',
        properties: { name: s.name, category: s.category, province: meta.province },
        geometry:
          s.kind === 'polygon'
            ? {
                type: 'Polygon',
                coordinates: [[...s.coords.map(([la, ln]) => [ln, la]), [s.coords[0][1], s.coords[0][0]]]]
              }
            : {
                type: 'LineString',
                coordinates: s.coords.map(([la, ln]) => [ln, la])
              }
      }))
  ];
  downloadFile(
    JSON.stringify({ type: 'FeatureCollection', crs: 'EPSG:4326', generatedAt: new Date().toISOString(), features }, null, 2),
    `vn-research-draft-${Date.now()}.geojson`,
    'application/geo+json;charset=utf-8'
  );
  showToast(`Đã tải xuống tệp .GeoJSON (${features.length} đối tượng).`);
}

async function runVietnamElevationTransect() {
  const out = document.getElementById('vn-elevation-output');
  const meta = getSelectedStudyProvinceMeta();
  out.textContent = `Đang truy xuất cao độ Copernicus 30 m quanh ${meta.province}...`;

  const lats = [];
  const lngs = [];
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const frac = i / (steps - 1) - 0.5;
    lats.push((meta.lat + frac * 0.036).toFixed(5));
    lngs.push((meta.lng + frac * 0.036).toFixed(5));
  }
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`);
    const data = await res.json();
    const elevs = Array.isArray(data?.elevation) ? data.elevation.map(Number) : [];
    if (elevs.length === 0) throw new Error('EMPTY');
    const minE = Math.min(...elevs);
    const maxE = Math.max(...elevs);
    const span = Math.max(1, maxE - minE);
    const ptsSvg = elevs
      .map((val, idx) => {
        const x = 14 + (idx / (elevs.length - 1)) * 272;
        const y = 80 - ((val - minE) / span) * 58;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const areaSvg = `14,84 ${ptsSvg} 286,84`;
    out.innerHTML = `
      <strong>Lát cắt 4 km qua ${esc(meta.province)}</strong>: Thấp nhất <strong class="mono-num">${minE.toFixed(1)} m</strong> · Cao nhất <strong class="mono-num">${maxE.toFixed(1)} m</strong> (Chênh ${(maxE - minE).toFixed(1)} m).
      <svg viewBox="0 0 300 96" style="width:100%;max-height:118px;display:block;margin-top:8px;background:#FFFFFF;border-radius:6px;border:1px solid #CBD5E1;">
        <line x1="14" y1="22" x2="286" y2="22" stroke="#E2E8F0" stroke-dasharray="3 3" />
        <line x1="14" y1="52" x2="286" y2="52" stroke="#E2E8F0" stroke-dasharray="3 3" />
        <line x1="14" y1="84" x2="286" y2="84" stroke="#CBD5E1" />
        <polygon fill="rgba(15, 118, 110, 0.14)" points="${areaSvg}" />
        <polyline fill="none" stroke="#0F766E" stroke-width="2.2" points="${ptsSvg}" />
      </svg>
      <span class="field-hint">Nguồn: ESA Copernicus GLO-30 (SATELLITE_DATA — mô hình bề mặt tham chiếu, không dùng đơn lẻ để suy độ sâu ngập cm trong ngõ hẻm).</span>
    `;
  } catch {
    out.textContent = 'Chưa tải được dữ liệu cao độ từ Open-Meteo (kiểm tra kết nối mạng).';
  }
}

async function handleResearcherLogin(e) {
  e.preventDefault();
  const fb = document.getElementById('rs-login-feedback');
  const email = document.getElementById('rs-login-email')?.value.trim();
  const password = document.getElementById('rs-login-pass')?.value || '';
  const res = await fetch('/api/research-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login_researcher', email, password })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    fb.hidden = false;
    fb.className = 'form-feedback is-error';
    fb.textContent = data?.error || 'Đăng nhập thất bại.';
    return;
  }
  state.researcherToken = data.token;
  sessionStorage.setItem(RESEARCHER_TOKEN_KEY, data.token);
  fb.hidden = true;
  showToast(`Xin chào ${data.profile.fullName}!`);
  renderResearchPillar();
}

async function handleResearcherRegister(e) {
  e.preventDefault();
  const fb = document.getElementById('rs-reg-feedback');
  const provOpt = document.getElementById('rs-reg-province')?.selectedOptions?.[0];
  const payload = {
    action: 'register_researcher',
    fullName: document.getElementById('rs-reg-name')?.value.trim(),
    organization: document.getElementById('rs-reg-org')?.value.trim(),
    specialty: document.getElementById('rs-reg-specialty')?.value,
    focusProvince: provOpt?.dataset?.province || 'Toàn quốc',
    email: document.getElementById('rs-reg-email')?.value.trim(),
    password: document.getElementById('rs-reg-pass')?.value || '',
    bio: document.getElementById('rs-reg-bio')?.value.trim()
  };
  const res = await fetch('/api/research-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    fb.hidden = false;
    fb.className = 'form-feedback is-error';
    fb.textContent = data?.error || 'Đăng ký chưa thành công.';
    return;
  }
  state.researcherToken = data.token;
  sessionStorage.setItem(RESEARCHER_TOKEN_KEY, data.token);
  fb.hidden = true;
  showToast('Đăng ký tài khoản Nhà nghiên cứu thành công!');
  renderResearchPillar();
}

async function handleStudySubmission(e) {
  e.preventDefault();
  const fb = document.getElementById('sub-feedback');
  const meta = getSelectedStudyProvinceMeta();
  const payload = {
    action: 'submit_study',
    title: document.getElementById('sub-title')?.value.trim(),
    province: meta.province,
    macroRegion: meta.macroRegion,
    centerLat: meta.lat,
    centerLng: meta.lng,
    radiusKm: meta.radiusKm,
    hazardType: document.getElementById('sub-hazard')?.value,
    dataClass: document.getElementById('sub-dataclass')?.value,
    summary: document.getElementById('sub-summary')?.value.trim(),
    methodology: document.getElementById('sub-methodology')?.value.trim(),
    articleBody: document.getElementById('sub-methodology')?.value.trim(),
    limitations: document.getElementById('sub-limitations')?.value.trim(),
    features: state.draftStudyPoints
  };
  const res = await fetch('/api/research-portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.researcherToken}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    fb.hidden = false;
    fb.className = 'form-feedback is-error';
    fb.textContent = data?.error || 'Không gửi được hồ sơ nghiên cứu.';
    return;
  }
  fb.hidden = false;
  fb.className = 'form-feedback is-ok';
  fb.textContent = data.message;
  state.draftStudyPoints = [];
  document.getElementById('study-submission-form').reset();
  renderStudyDraftOverlay();
  renderResearchPillar();
}

function renderReviewerSubmissionCards(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return `<p class="muted-body">Hiện chưa có hồ sơ nghiên cứu nào trong hàng đợi.</p>`;
  }
  return list
    .map(
      (s) => `
      <article class="place-card ${s.status === 'published' ? 'is-safe' : 'is-heat'}">
        <div class="place-card-top">
          <h3 class="place-card-title">${esc(s.title)}</h3>
          <span class="source-tag ${s.status === 'published' ? 'tone-verified' : 'tone-community'}">${esc(s.status)}</span>
        </div>
        <p class="place-card-desc"><strong>${esc(s.authorName)}</strong> (${esc(s.organization)}) · ${esc(s.province)} · ${s.featureCount} điểm · ${esc(s.dataClass)}</p>
        <p class="muted-body">${esc(s.summary)}</p>
        <p class="field-hint">Hạn chế đã khai báo: ${esc(s.limitations)}</p>
        ${
          s.status === 'pending_review'
            ? `<div class="form-actions-row">
                 <button type="button" class="btn btn-sm btn-primary js-review-decision" data-subid="${esc(s.id)}" data-decision="publish">Duyệt &amp; Xuất bản</button>
                 <button type="button" class="btn btn-sm btn-secondary js-review-decision" data-subid="${esc(s.id)}" data-decision="reject">Yêu cầu bổ sung</button>
               </div>`
            : ''
        }
      </article>`
    )
    .join('');
}

async function loadReviewerQueue() {
  const queueBox = document.getElementById('reviewer-queue-list');
  if (!state.reviewerToken) return;
  const res = await fetch('/api/research-portal?action=review_queue', {
    headers: { Authorization: `Bearer ${state.reviewerToken}` }
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    sessionStorage.removeItem(REVIEWER_TOKEN_KEY);
    state.reviewerToken = '';
    if (queueBox) queueBox.hidden = true;
    showToast(data?.error || 'Phiên kiểm duyệt đã hết hạn.');
    return;
  }
  const authRow = document.getElementById('reviewer-auth-row');
  if (authRow) authRow.hidden = true;
  state.devReviewQueue = data.submissions || [];
  const html = renderReviewerSubmissionCards(state.devReviewQueue);
  if (queueBox) {
    queueBox.hidden = false;
    queueBox.innerHTML = html;
  }
  const devRev = document.getElementById('dev-review-list');
  if (devRev) devRev.innerHTML = html;
  const pendCnt = document.getElementById('dev-pending-studies-cnt');
  if (pendCnt) pendCnt.textContent = String(state.devReviewQueue.filter((x) => x.status === 'pending_review').length);
}

/* =========================================================================
   7. PHÂN HỆ 3: BẢN TIN THIÊN TAI & CÔNG BỐ KHOA HỌC MỞ
   ========================================================================= */
async function loadPublicationsFeed() {
  const listEl = document.getElementById('publications-feed-list');
  if (!listEl) return;
  try {
    const res = await fetch(
      `/api/research-portal?action=publications&kind=${encodeURIComponent(state.newsKind)}&region=${encodeURIComponent(state.newsRegion)}`
    );
    const data = await res.json();
    if (res.ok && data?.ok) {
      state.publications = data.items || [];
      state.newsStats = data.stats || state.newsStats;
      if (data.storageBackend) state.devStorageBackend = data.storageBackend;
    }
  } catch {
    // giữ danh sách đã tải
  }

  document.getElementById('stat-news-count').textContent = String(state.newsStats.disasterNewsCount || 0);
  document.getElementById('stat-research-count').textContent = String(state.newsStats.researchArticleCount || 0);
  document.getElementById('stat-researcher-count').textContent = String(state.newsStats.verifiedResearchersCount || 0);

  const kw = state.newsSearchText.trim().toLowerCase();
  const shownPubs = kw
    ? state.publications.filter((p) => `${p.title || ''} ${p.summary || ''} ${p.province || ''} ${p.authorName || ''}`.toLowerCase().includes(kw))
    : state.publications;

  if (shownPubs.length === 0) {
    listEl.innerHTML = `<div class="card-panel"><p class="muted-body">Chưa có bài viết nào khớp bộ lọc / từ khóa hiện tại.</p></div>`;
    return;
  }

  listEl.innerHTML = shownPubs
    .map((item) => {
      const isResearch = item.kind === 'research_article';
      const cardCls = isResearch
        ? 'is-research'
        : item.severity === 'high'
          ? 'is-news-high'
          : 'is-news-attention';
      const citeText = `${item.authorName} (${new Date(item.publishedAt || Date.now()).getFullYear()}). ${item.title}. ${item.organization} — VN Resilience Atlas (${item.province}).`;
      return `
        <article class="pub-card ${cardCls}">
          <div class="place-card-meta">
            <span class="source-tag ${isResearch ? 'tone-verified' : 'tone-community'}">${isResearch ? 'Công bố Nghiên cứu' : 'Bản tin Thiên tai'}</span>
            <span class="source-tag tone-model">${esc(item.province)}</span>
            <span class="muted-meta mono-num">${esc(formatTimeHm(item.publishedAt))}</span>
          </div>
          <h2 class="pub-card-title">${esc(item.title)}</h2>
          <p class="muted-body">${esc(item.summary)}</p>
          <div class="muted-meta"><strong>${esc(item.authorName)}</strong> · ${esc(item.organization)}${item.featureCount ? ` · ${item.featureCount} điểm bản đồ` : ''}</div>
          <details>
            <summary class="text-btn" style="display:inline-block;">Xem chi tiết tài liệu</summary>
            <div class="pub-card-body">${esc(item.body)}</div>
          </details>
          <div class="form-actions-row">
            <button type="button" class="btn btn-sm btn-primary js-open-pub-zone" data-lat="${item.focusLat}" data-lng="${item.focusLng}" data-radius="${item.focusRadiusKm}" data-name="${esc(item.province)}">
              Mở vùng trên Bản đồ chính
            </button>
            <button type="button" class="btn btn-sm btn-secondary js-copy-citation" data-cite="${esc(citeText)}">
              Chép trích dẫn
            </button>
          </div>
        </article>`;
    })
    .join('');
}

/* =========================================================================
   8. TRỢ LÝ DIỄN GIẢI DỮ LIỆU & TRẠNG THÁI NGOẠI TUYẾN
   ========================================================================= */
function updateOfflineStrip() {
  const strip = document.getElementById('offline-status-strip');
  const txt = document.getElementById('offline-status-text');
  const retry = document.getElementById('btn-retry-offline-queue');
  if (!strip || !txt) return;
  const q = readJson(OFFLINE_QUEUE_KEY, []);
  if (state.isOffline) {
    strip.hidden = false;
    txt.textContent = `Đang ngoại tuyến — vẫn tra được vùng đã lưu, danh sách kiểm tra nơi ở và số khẩn cấp.${q.length ? ` (${q.length} phản ánh đang chờ)` : ''}`;
    if (retry) retry.hidden = true;
  } else if (q.length > 0) {
    strip.hidden = false;
    txt.textContent = `Đã có mạng trở lại — còn ${q.length} phản ánh lưu tạm chưa gửi.`;
    if (retry) retry.hidden = false;
  } else {
    strip.hidden = true;
  }
}

async function askAssistant(question) {
  const q = String(question || '').trim();
  const out = document.getElementById('assistant-answer-box');
  if (!out || q.length < 3) return;
  out.hidden = false;
  out.innerHTML = `<p class="muted-body">Đang tổng hợp dữ liệu vùng ${esc(state.zone.name)}...</p>`;

  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const res = await fetch('/api/ai-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ask_copilot', question: `[Vùng đang xem: ${state.zone.name}] ${q}`, liveWeather: state.weather, liveAqi: state.aqi })
    });
    const data = await res.json();
    if (res.ok && data?.ok && data.answer) {
      out.innerHTML = `
        <span class="source-tag tone-verified">Tổng hợp từ dữ liệu hiện có</span>
        <div class="assistant-answer-text">${esc(data.answer)}</div>
        <p class="honesty-note">Trợ lý không thay thế cảnh báo thiên tai chính thức của cơ quan KTTV/PCTT.</p>
      `;
      return;
    }
    throw new Error('FALLBACK');
  } catch {
    const localAns = synthesizeSituationalAnswer(q, state.zonePoints, state.weather);
    const clean = (t) =>
      String(t || '')
        .replace(/Bấm nút\s*[“"]Phân tích\s*&\s*Vẽ lộ trình OSRM[”"]\s*bên dưới/gi, 'Mở mục “Lộ trình” để đối chiếu tuyến đường')
        .replace(/\bDEM\s*[\d–\-.,]+\s*m\b/gi, 'vùng trũng thấp')
        .replace(/\b(?:OSRM|DEM|ERA5|DSM)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const lines = [
      `• Vùng khoanh hiện tại: ${state.zone.name} (bán kính ${state.zone.radiusKm} km, ${state.zonePoints.length} đối tượng nội vùng).`,
      localAns?.headline ? `• ${clean(localAns.headline)}` : '',
      ...(Array.isArray(localAns?.bullets) ? localAns.bullets.map((b) => `• ${clean(b)}`) : [])
    ].filter(Boolean);
    out.innerHTML = `
      <span class="source-tag tone-model">Trả lời từ dữ liệu đã nạp</span>
      <div class="assistant-answer-text">${esc(lines.join('\n'))}</div>
      <p class="honesty-note">Trợ lý chỉ diễn giải dữ liệu hiện có, không thay thế cảnh báo chính thức của cơ quan KTTV/PCTT.</p>
    `;
  }
}

/* =========================================================================
   10. GẮN SỰ KIỆN & KHỞI CHẠY
   ========================================================================= */
function bindEvents() {
  document.querySelectorAll('[data-pillar]').forEach((btn) => {
    btn.addEventListener('click', () => switchPillar(btn.dataset.pillar));
  });
  document.getElementById('btn-brand-reset')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchPillar('public');
  });

  document.querySelectorAll('[data-pubtab]').forEach((btn) => {
    btn.addEventListener('click', () => switchPublicTab(btn.dataset.pubtab));
  });

  const searchInput = document.getElementById('vn-zone-search');
  searchInput?.addEventListener('input', () => renderZoneSuggestions(searchInput.value));
  searchInput?.addEventListener('focus', () => renderZoneSuggestions(searchInput.value));
  searchInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      handleVietnamZoneSearch();
    } else if (ev.key === 'Escape') {
      document.getElementById('vn-zone-suggestions').hidden = true;
    }
  });
  document.getElementById('btn-vn-search-submit')?.addEventListener('click', handleVietnamZoneSearch);
  document.getElementById('vn-zone-radius')?.addEventListener('change', (ev) => {
    selectZone(state.zone, { radiusKm: Number(ev.target.value), flyMap: true });
  });
  document.getElementById('btn-refresh-zone')?.addEventListener('click', () => refreshActiveZoneData({ flyMap: false }));
  document.getElementById('btn-vn-gps')?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('Thiết bị không hỗ trợ GPS — hãy nhập tên tỉnh/huyện ở ô tìm kiếm.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isInsideVietnam(lat, lng)) {
          showToast('Vị trí GPS nằm ngoài phạm vi lãnh thổ Việt Nam.');
          return;
        }
        const near = findNearestVietnamZone(lat, lng);
        selectZone(
          { id: 'gps-vn', name: `Vị trí hiện tại (${near?.province || 'Việt Nam'})`, province: near?.province || 'Việt Nam', macroRegion: near?.macroRegion || 'bac', lat, lng },
          { radiusKm: Number(document.getElementById('vn-zone-radius')?.value || 5), flyMap: true }
        );
        showToast('Đã khoanh vùng theo tọa độ GPS hiện tại.');
      },
      () => showToast('Chưa lấy được GPS — hãy nhập tên khu vực thủ công.')
    );
  });

  // Bộ chuyển nền bản đồ & lớp chuyên đề
  document.querySelectorAll('[data-basemap]').forEach((btn) => {
    btn.addEventListener('click', () => setBasemap(btn.dataset.basemap));
  });
  document.querySelectorAll('[data-map-layer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.mapLayer;
      const next = !state.layers[layer];
      state.layers[layer] = next;
      btn.classList.toggle('is-active', next);
      btn.setAttribute('aria-pressed', String(next));

      if (layer === 'radar') {
        toggleRadarOverlay(next);
      } else if (layer === 'flowVectors') {
        flowVectorsLayer?.redraw();
        hydroSurfaceLayer?.redraw();
      } else if (layer === 'hydroSurface') {
        const strip = document.getElementById('hydro-sim-strip');
        if (strip) strip.hidden = !next;
        setTimeout(() => {
          nationalMap?.invalidateSize();
          hydroSurfaceLayer?.redraw();
        }, 40);
      } else if (layer === 'heatmap') {
        if (nationalMap && heatmapLayer) {
          if (next) heatmapLayer.addTo(nationalMap);
          else nationalMap.removeLayer(heatmapLayer);
        }
      } else {
        const baselineInZone = filterFeaturesInZone(ALL_STATIC_POINTS, state.zone.lat, state.zone.lng, state.zone.radiusKm, 200);
        state.zonePoints = mergeZonePoints({
          baselineInZone,
          commRes: null,
          researchRes: null,
          osmPois: state.osmPois,
          lat: state.zone.lat,
          lng: state.zone.lng,
          radiusKm: state.zone.radiusKm
        });
        renderZoneMapAndList({ flyMap: false });
      }
    });
  });

  // Thanh điều khiển mô phỏng Mặt phủ ngập thủy văn (Presets + Rainfall Slider + Opacity Slider)
  document.querySelectorAll('[data-rain-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.rainPreset;
      state.hydroSim.preset = p;
      document.querySelectorAll('[data-rain-preset]').forEach((b) => b.classList.toggle('is-active', b === btn));
      const mm =
        p === 'live'
          ? Math.max(0, Math.round(state.weather?.dailyRainMm || (state.weather?.rainMm || 0) * 4))
          : Number(p);
      state.hydroSim.rainMm = mm;
      const sl = document.getElementById('hydro-rain-slider');
      const lb = document.getElementById('hydro-rain-label');
      if (sl) sl.value = String(mm);
      if (lb) lb.textContent = `${mm} mm`;
      hydroSurfaceLayer?.redraw();
    });
  });
  document.getElementById('hydro-rain-slider')?.addEventListener('input', (ev) => {
    const mm = Number(ev.target.value);
    state.hydroSim.rainMm = mm;
    state.hydroSim.preset = 'custom';
    document.querySelectorAll('[data-rain-preset]').forEach((b) => b.classList.remove('is-active'));
    const lb = document.getElementById('hydro-rain-label');
    if (lb) lb.textContent = `${mm} mm`;
    hydroSurfaceLayer?.redraw();
  });
  document.getElementById('hydro-opacity-slider')?.addEventListener('input', (ev) => {
    const pct = Number(ev.target.value);
    state.hydroSim.opacity = pct / 100;
    const lb = document.getElementById('hydro-opacity-label');
    if (lb) lb.textContent = `${pct}%`;
    hydroSurfaceLayer?.redraw();
  });

  document.getElementById('btn-radar-prev')?.addEventListener('click', () => {
    if (!state.radarAnim.frames.length) return;
    stopRadarPlayback();
    state.radarAnim.idx = (state.radarAnim.idx - 1 + state.radarAnim.frames.length) % state.radarAnim.frames.length;
    renderRadarFrame();
  });
  document.getElementById('btn-radar-next')?.addEventListener('click', () => {
    if (!state.radarAnim.frames.length) return;
    stopRadarPlayback();
    state.radarAnim.idx = (state.radarAnim.idx + 1) % state.radarAnim.frames.length;
    renderRadarFrame();
  });
  document.getElementById('btn-radar-play')?.addEventListener('click', () => {
    if (!state.radarAnim.frames.length) return;
    if (state.radarAnim.playing) {
      stopRadarPlayback();
      return;
    }
    state.radarAnim.playing = true;
    document.getElementById('btn-radar-play').textContent = '⏸ Tạm dừng';
    state.radarAnim.timer = setInterval(() => {
      state.radarAnim.idx = (state.radarAnim.idx + 1) % state.radarAnim.frames.length;
      renderRadarFrame();
    }, 850);
  });

  // Lọc đối tượng & chế độ mobile
  document.querySelectorAll('[data-map-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mapFilter = btn.dataset.mapFilter;
      document.querySelectorAll('[data-map-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderZoneMapAndList({ flyMap: false });
    });
  });
  document.querySelectorAll('[data-map-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mapMobileMode = btn.dataset.mapMode;
      document.getElementById('map-split-layout').dataset.mobileMode = state.mapMobileMode;
      document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      if (state.mapMobileMode === 'map') {
        setTimeout(() => {
          nationalMap?.invalidateSize();
          hydroSurfaceLayer?.redraw();
        }, 60);
      }
    });
  });
  document.getElementById('zone-local-filter')?.addEventListener('input', (ev) => {
    state.localFilterText = ev.target.value;
    renderZoneMapAndList({ flyMap: false });
  });

  // Lộ trình, Nơi ở, Báo sự cố
  document.querySelectorAll('[data-travel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.travelMode = btn.dataset.travel;
      document.querySelectorAll('[data-travel]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
  document.getElementById('btn-route-use-zone')?.addEventListener('click', () => {
    document.getElementById('route-start-input').value = state.zone.name;
  });
  document.getElementById('btn-route-swap')?.addEventListener('click', () => {
    const a = document.getElementById('route-start-input');
    const b = document.getElementById('route-end-input');
    [a.value, b.value] = [b.value, a.value];
  });
  document.getElementById('national-route-form')?.addEventListener('submit', runNationalRouteComparison);

  document.getElementById('rental-checklist-groups')?.addEventListener('change', (ev) => {
    const chk = ev.target.closest('.js-rental-chk');
    if (!chk) return;
    const saved = readJson(CHECKLIST_KEY, { checked: {}, note: '' });
    saved.checked[chk.dataset.chkid] = chk.checked;
    writeJson(CHECKLIST_KEY, saved);
    chk.closest('.checklist-item')?.classList.toggle('is-checked', chk.checked);
    updateChecklistProgress();
  });
  document.getElementById('rental-personal-note')?.addEventListener('input', (ev) => {
    const saved = readJson(CHECKLIST_KEY, { checked: {}, note: '' });
    saved.note = ev.target.value;
    writeJson(CHECKLIST_KEY, saved);
  });
  document.getElementById('btn-reset-checklist')?.addEventListener('click', () => {
    writeJson(CHECKLIST_KEY, { checked: {}, note: '' });
    renderHousingCheck();
  });
  document.getElementById('btn-copy-rental-summary')?.addEventListener('click', async () => {
    const saved = readJson(CHECKLIST_KEY, { checked: {}, note: '' });
    const done = RENTAL_INSPECTION_CHECKLIST.filter((i) => saved.checked?.[i.id]).length;
    const text = `Kiểm tra khu vực: ${state.zone.name} · Đã kiểm tra ${done}/${RENTAL_INSPECTION_CHECKLIST.length} mục.${saved.note ? ` Ghi chú: ${saved.note}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã sao chép tóm tắt.');
    } catch {
      showToast('Trình duyệt không hỗ trợ sao chép tự động.');
    }
  });

  document.querySelectorAll('input[name="repCategory"]').forEach((r) => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.cat-tile').forEach((t) => t.classList.remove('is-selected'));
      r.closest('.cat-tile')?.classList.add('is-selected');
    });
  });
  document.getElementById('btn-rep-use-zone')?.addEventListener('click', () => {
    state.reportPin = { lat: state.zone.lat, lng: state.zone.lng };
    document.getElementById('rep-location-status').textContent = `Đã gắn vị trí tại tâm vùng ${state.zone.name} (tự làm tròn ~20 m).`;
  });
  document.getElementById('btn-rep-use-gps')?.addEventListener('click', () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        state.reportPin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        document.getElementById('rep-location-status').textContent = 'Đã lấy GPS hiện tại (tự làm tròn ~20 m).';
      },
      () => showToast('Không lấy được GPS — hãy chấm trực tiếp trên bản đồ.')
    );
  });
  document.getElementById('btn-rep-pick-map')?.addEventListener('click', () => {
    const wrap = document.getElementById('rep-mini-map-wrap');
    wrap.hidden = !wrap.hidden;
    if (!wrap.hidden && typeof window.L !== 'undefined') {
      if (!reportMap) {
        reportMap = window.L.map('report-pick-map').setView([state.reportPin.lat, state.reportPin.lng], 14);
        window.L.tileLayer(BASEMAP_PROVIDERS.osm.url, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(reportMap);
        reportMarker = window.L.circleMarker([state.reportPin.lat, state.reportPin.lng], { radius: 8, color: '#DC2626', fillColor: '#fff', fillOpacity: 1 }).addTo(reportMap);
        reportMap.on('click', (ev) => {
          state.reportPin = { lat: ev.latlng.lat, lng: ev.latlng.lng };
          reportMarker.setLatLng(ev.latlng);
          document.getElementById('rep-location-status').textContent = 'Đã chọn điểm trên bản đồ (tự làm tròn ~20 m).';
        });
      }
      setTimeout(() => reportMap.invalidateSize(), 60);
    }
  });
  document.getElementById('rep-photo')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    const st = document.getElementById('rep-photo-status');
    if (!file) return;
    try {
      state.reportPhotoDataUrl = await stripExifClientSide(file);
      st.hidden = false;
      st.textContent = 'Đã xóa sạch EXIF/GPS ẩn và nén ảnh an toàn.';
    } catch (err) {
      st.hidden = false;
      st.textContent = err.message;
    }
  });
  document.getElementById('national-report-form')?.addEventListener('submit', handleNationalReportSubmit);

  // Phân hệ 2: Nhà Nghiên cứu
  document.querySelectorAll('[data-authmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.authmode;
      document.querySelectorAll('[data-authmode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.getElementById('research-login-form').hidden = mode !== 'login';
      document.getElementById('research-register-form').hidden = mode !== 'register';
    });
  });
  document.getElementById('research-login-form')?.addEventListener('submit', handleResearcherLogin);
  document.getElementById('research-register-form')?.addEventListener('submit', handleResearcherRegister);
  document.getElementById('btn-rs-logout')?.addEventListener('click', () => {
    sessionStorage.removeItem(RESEARCHER_TOKEN_KEY);
    state.researcherToken = '';
    state.researcherProfile = null;
    renderResearchPillar();
    showToast('Đã đăng xuất khỏi Cổng Nghiên cứu.');
  });

  document.getElementById('sub-province')?.addEventListener('change', () => {
    const meta = getSelectedStudyProvinceMeta();
    const l0Input = document.getElementById('vn2k-l0');
    if (l0Input) l0Input.value = String(lookupCentralMeridian(meta.province, meta.lng));
    studyMap?.setView([meta.lat, meta.lng], 12);
    renderStudyDraftOverlay();
  });

  document.getElementById('btn-vn2k-to-map')?.addEventListener('click', async () => {
    const x = Number(document.getElementById('vn2k-x')?.value);
    const y = Number(document.getElementById('vn2k-y')?.value);
    const l0 = Number(document.getElementById('vn2k-l0')?.value || 105);
    const zw = Number(document.getElementById('vn2k-zone')?.value || 3);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      showToast('Vui lòng nhập đầy đủ tọa độ X (Bắc) và Y (Đông) hệ VN-2000.');
      return;
    }
    const res = await fetch(`/api/vn-gis?action=vn2000_to_wgs84&x=${x}&y=${y}&centralMeridian=${l0}&zoneWidth=${zw}`);
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      showToast(data?.error || 'Không thể quy đổi tọa độ VN-2000.');
      return;
    }
    const meta = getSelectedStudyProvinceMeta();
    state.draftStudyPoints.push({
      name: `Điểm VN-2000 (${x.toFixed(1)}, ${y.toFixed(1)})`,
      lat: Math.round(data.lat * 1_000_000) / 1_000_000,
      lng: Math.round(data.lng * 1_000_000) / 1_000_000,
      category: document.getElementById('sub-hazard')?.value || 'flood',
      notes: `Quy đổi chuẩn từ VN-2000 (X=${x}, Y=${y}, L0=${l0}°, Múi ${zw}°).`
    });
    ensureStudyStudioMap();
    studyMap?.setView([data.lat, data.lng], 15);
    renderStudyDraftOverlay();
    document.getElementById('vn2k-readout').textContent = `Đã ghim WGS84: ${data.lat.toFixed(6)}°N, ${data.lng.toFixed(6)}°E (từ X=${x}, Y=${y})`;
    showToast('Đã quy đổi VN-2000 sang WGS84 và ghim lên Bản đồ Nghiên cứu!');
  });
  document.getElementById('sub-radius')?.addEventListener('change', renderStudyDraftOverlay);
  document.getElementById('btn-add-sample-study-pts')?.addEventListener('click', () => {
    const meta = getSelectedStudyProvinceMeta();
    state.draftStudyPoints.push(
      { name: `Điểm khảo sát A (${meta.province})`, lat: meta.lat + 0.004, lng: meta.lng + 0.003, category: document.getElementById('sub-hazard')?.value || 'flood', notes: 'Điểm khảo sát thực địa trong vùng khoanh.' },
      { name: `Điểm trú / hỗ trợ B (${meta.province})`, lat: meta.lat - 0.003, lng: meta.lng - 0.004, category: 'shelter', notes: 'Vị trí nền cao hỗ trợ tránh trú.' }
    );
    renderStudyDraftOverlay();
  });
  document.querySelectorAll('[data-drawmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.studyDrawMode = btn.dataset.drawmode;
      document.querySelectorAll('[data-drawmode]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
  document.getElementById('btn-export-draft-geojson')?.addEventListener('click', exportStudyDraftGeoJson);
  document.getElementById('btn-clear-study-pts')?.addEventListener('click', () => {
    state.draftStudyPoints = [];
    state.draftStudyShapes = [];
    renderStudyDraftOverlay();
  });
  document.getElementById('sub-geojson-file')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rawArr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.features) ? parsed.features : [];
      for (const f of rawArr.slice(0, 150)) {
        const lat = Number(f.lat ?? f.geometry?.coordinates?.[1]);
        const lng = Number(f.lng ?? f.geometry?.coordinates?.[0]);
        if (!isInsideVietnam(lat, lng)) continue;
        state.draftStudyPoints.push({
          name: f.properties?.name || f.name || 'Điểm GeoJSON',
          lat,
          lng,
          category: f.properties?.category || f.category || 'flood',
          notes: f.properties?.notes || f.notes || ''
        });
      }
      renderStudyDraftOverlay();
      showToast(`Đã nạp ${state.draftStudyPoints.length} điểm hợp lệ từ GeoJSON.`);
    } catch {
      showToast('Tệp GeoJSON không đúng định dạng JSON hợp lệ.');
    }
  });
  document.getElementById('study-submission-form')?.addEventListener('submit', handleStudySubmission);
  document.getElementById('btn-run-vn-elevation')?.addEventListener('click', runVietnamElevationTransect);

  // Phân hệ 3: Bản tin
  document.querySelectorAll('[data-news-kind]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.newsKind = btn.dataset.newsKind;
      document.querySelectorAll('[data-news-kind]').forEach((b) => b.classList.toggle('is-active', b === btn));
      loadPublicationsFeed();
    });
  });
  document.querySelectorAll('[data-news-region]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.newsRegion = btn.dataset.newsRegion;
      document.querySelectorAll('[data-news-region]').forEach((b) => b.classList.toggle('is-active', b === btn));
      loadPublicationsFeed();
    });
  });
  document.getElementById('news-search-input')?.addEventListener('input', (ev) => {
    state.newsSearchText = ev.target.value || '';
    loadPublicationsFeed();
  });
  document.getElementById('btn-news-to-publish')?.addEventListener('click', () => switchPillar('research'));

  // Tiện ích toàn cục
  document.getElementById('btn-toggle-large-text')?.addEventListener('click', () => {
    applyLargeTextMode(!document.documentElement.classList.contains('is-large-text'));
  });
  document.getElementById('btn-open-emergency')?.addEventListener('click', () => {
    document.getElementById('emergency-dialog')?.showModal();
  });
  document.getElementById('assistant-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    askAssistant(document.getElementById('assistant-input')?.value || '');
  });

  // Sự kiện ủy quyền
  document.addEventListener('click', async (ev) => {
    if (!ev.target.closest('.zone-search-box')) {
      const sug = document.getElementById('vn-zone-suggestions');
      if (sug) sug.hidden = true;
    }

    const suggestion = ev.target.closest('.js-pick-suggestion');
    if (suggestion) {
      const z = VIETNAM_ZONES.find((x) => x.id === suggestion.dataset.zoneid);
      if (z) {
        document.getElementById('vn-zone-search').value = z.name;
        document.getElementById('vn-zone-suggestions').hidden = true;
        selectZone(z, { radiusKm: z.defaultRadiusKm, flyMap: true });
      }
      return;
    }

    const quickZ = ev.target.closest('.js-quick-zone');
    if (quickZ) {
      const z = VIETNAM_ZONES.find((x) => x.id === quickZ.dataset.zoneid);
      if (z) {
        document.getElementById('vn-zone-search').value = '';
        selectZone(z, { radiusKm: z.defaultRadiusKm, flyMap: true });
      }
      return;
    }

    const spotEvac = ev.target.closest('.js-spot-evacuate');
    if (spotEvac) {
      const lat = Number(spotEvac.dataset.lat);
      const lng = Number(spotEvac.dataset.lng);
      const sLat = Number(spotEvac.dataset.slat);
      const sLng = Number(spotEvac.dataset.slng);
      const sName = spotEvac.dataset.sname || 'Cơ sở hỗ trợ';
      const extra = document.getElementById('spot-dynamic-extra');
      if (extra) extra.innerHTML = `<div class="spot-profile-box">Đang tìm lộ trình ngắn nhất tới <strong>${esc(sName)}</strong>...</div>`;
      const route = (await fetchOsrm([[lat, lng], [sLat, sLng]], 'bike')) || {
        coordsLngLat: [[lng, lat], [sLng, sLat]],
        distanceKm: Math.round((haversineMeters(lat, lng, sLat, sLng) * 1.2) / 10) / 100,
        durationMin: Math.max(2, Math.round(haversineMeters(lat, lng, sLat, sLng) / 280))
      };
      if (nationalMap && mainRouteLayer) {
        mainRouteLayer.clearLayers();
        const latLngs = route.coordsLngLat.map(([ln, la]) => [la, ln]);
        const line = window.L.polyline(latLngs, { color: '#16A34A', weight: 5.5, opacity: 0.92 }).addTo(mainRouteLayer);
        nationalMap.fitBounds(line.getBounds(), { padding: [36, 36], maxZoom: 16 });
      }
      if (extra) {
        extra.innerHTML = `<div class="spot-profile-box"><strong>Tuyến tiếp cận ${esc(sName)}:</strong> Quãng đường <strong>${route.distanceKm} km</strong> (~${route.durationMin} phút di chuyển). Đã vẽ đường màu xanh lá trên bản đồ.</div>`;
      }
      return;
    }

    const spotProfile = ev.target.closest('.js-spot-profile');
    if (spotProfile) {
      const lat = Number(spotProfile.dataset.lat);
      const lng = Number(spotProfile.dataset.lng);
      const dLng = 1 / (111.32 * Math.max(0.35, Math.cos((lat * Math.PI) / 180))); // ±1 km = 2 km
      const samples = sampleElevationProfile(state.hydroSim.demGrid, lat, lng - dLng, lat, lng + dLng, 25);
      const validElevs = samples.map((s) => s.elevM).filter((v) => v !== null);
      const extra = document.getElementById('spot-dynamic-extra');
      if (nationalMap && mainRouteLayer) {
        mainRouteLayer.clearLayers();
        window.L.polyline(
          [
            [lat, lng - dLng],
            [lat, lng + dLng]
          ],
          { color: '#0284C7', weight: 3, dashArray: '5 4' }
        )
          .bindTooltip('Tuyến mặt cắt địa hình 2 km (Tây → Đông)')
          .addTo(mainRouteLayer);
      }
      if (extra && validElevs.length >= 5) {
        const minE = Math.min(...validElevs);
        const maxE = Math.max(...validElevs);
        const span = Math.max(1.2, maxE - minE);
        const stats = state.hydroSim.demGrid?.stats || { minM: minE, p65M: maxE };
        const relief = Math.max(1.5, stats.p65M - stats.minM);
        const waterM = stats.minM + relief * (0.26 + 0.68 * Math.min(1.25, state.hydroSim.rainMm / 140));
        const waterY = Math.max(8, Math.min(54, 54 - ((waterM - minE) / span) * 44));
        const pts = samples
          .map((s, idx) => {
            const val = s.elevM ?? minE;
            const x = 8 + (idx / (samples.length - 1)) * 244;
            const y = 54 - ((val - minE) / span) * 44;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        extra.innerHTML = `
          <div class="spot-profile-box">
            <strong>Mặt cắt Tây → Đông 2 km:</strong> Thấp nhất <strong>${minE.toFixed(1)} m</strong> · Cao nhất <strong>${maxE.toFixed(1)} m</strong>
            <svg viewBox="0 0 260 62" style="width:100%;height:58px;display:block;margin-top:4px;background:#fff;border-radius:4px;border:1px solid #E2E8F0;">
              <rect x="8" y="${waterY.toFixed(1)}" width="244" height="${Math.max(0, 56 - waterY).toFixed(1)}" fill="rgba(14,165,233,0.22)" />
              <line x1="8" y1="${waterY.toFixed(1)}" x2="252" y2="${waterY.toFixed(1)}" stroke="#0284C7" stroke-width="1.2" stroke-dasharray="3 2" />
              <polygon fill="rgba(15,118,110,0.16)" points="8,56 ${pts} 252,56" />
              <polyline fill="none" stroke="#0F766E" stroke-width="2" points="${pts}" />
              <circle cx="130" cy="${(54 - (((samples[12]?.elevM ?? minE) - minE) / span) * 44).toFixed(1)}" r="3" fill="#DC2626" />
            </svg>
          </div>`;
      }
      return;
    }

    const citeBtn = ev.target.closest('.js-copy-citation');
    if (citeBtn) {
      try {
        await navigator.clipboard.writeText(citeBtn.dataset.cite || '');
        showToast('Đã sao chép trích dẫn khoa học vào bộ nhớ tạm.');
      } catch {
        showToast(citeBtn.dataset.cite || '');
      }
      return;
    }

    const spotRezone = ev.target.closest('.js-spot-rezone');
    if (spotRezone) {
      const lat = Number(spotRezone.dataset.lat);
      const lng = Number(spotRezone.dataset.lng);
      const near = findNearestVietnamZone(lat, lng);
      selectZone(
        { id: `spot-${Date.now()}`, name: `Điểm tọa độ (${near?.province || 'Việt Nam'})`, province: near?.province || 'Việt Nam', lat, lng },
        { radiusKm: state.zone.radiusKm, flyMap: true }
      );
      return;
    }

    const spotReport = ev.target.closest('.js-spot-report');
    if (spotReport) {
      state.reportPin = { lat: Number(spotReport.dataset.lat), lng: Number(spotReport.dataset.lng) };
      const addr = spotReport.dataset.addr || '';
      const nameInp = document.getElementById('rep-location-name');
      if (addr && nameInp && !nameInp.value.trim()) {
        nameInp.value = addr;
      }
      document.getElementById('rep-location-status').textContent = `Đã gắn tọa độ từ bản đồ (${state.reportPin.lat.toFixed(4)}°N, ${state.reportPin.lng.toFixed(4)}°E${addr ? ` · ${addr}` : ''} · tự làm tròn ~20 m).`;
      switchPublicTab('report');
      return;
    }

    const pubJump = ev.target.closest('[data-pubtab-jump]');
    if (pubJump) {
      switchPublicTab(pubJump.dataset.pubtabJump);
      return;
    }

    const jumpRes = ev.target.closest('.js-jump-research-zone');
    if (jumpRes) {
      switchPillar('research');
      return;
    }

    const focusPt = ev.target.closest('.js-focus-map-pt');
    if (focusPt) {
      const pt = state.zonePoints.find((p) => p.id === focusPt.dataset.ptid);
      if (pt) {
        document.getElementById('map-split-layout').dataset.mobileMode = 'map';
        document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mapMode === 'map'));
        nationalMap?.setView([Number(pt.lat), Number(pt.lng)], 16);
        showSelectedPointCard(pt);
      }
      return;
    }

    const checkin = ev.target.closest('.js-live-checkin');
    if (checkin) {
      try {
        const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'live_checkin',
            pointId: checkin.dataset.ptid,
            pointName: checkin.dataset.ptname,
            status: checkin.dataset.status
          })
        });
        const d = await res.json();
        if (d?.ok) {
          if (d.livePulse) state.livePulse = d.livePulse;
          renderPublicOverview({ flyMap: false });
          showToast(`Đã cập nhật trạng thái trực tiếp cho ${checkin.dataset.ptname}.`);
        }
      } catch {
        showToast('Chưa gửi được cập nhật trực tiếp lúc này.');
      }
      return;
    }

    const reviewBtn = ev.target.closest('.js-review-decision');
    if (reviewBtn) {
      const res = await fetch('/api/research-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.reviewerToken}`
        },
        body: JSON.stringify({
          action: 'review_study',
          submissionId: reviewBtn.dataset.subid,
          decision: reviewBtn.dataset.decision,
          reviewNote: reviewBtn.dataset.decision === 'publish' ? 'Đạt chuẩn siêu dữ liệu & tọa độ — xuất bản lên Bản đồ chính.' : 'Vui lòng bổ sung chi tiết thực địa.'
        })
      });
      const d = await res.json();
      if (res.ok && d?.ok) {
        showToast(reviewBtn.dataset.decision === 'publish' ? 'Đã duyệt & xuất bản dữ liệu!' : 'Đã ghi nhận yêu cầu bổ sung.');
        loadReviewerQueue();
        if (state.pillar === 'research') renderResearchPillar();
      } else {
        showToast(d?.error || 'Không thể xử lý quyết định kiểm duyệt.');
      }
      return;
    }

    const openPubZone = ev.target.closest('.js-open-pub-zone');
    if (openPubZone) {
      const lat = Number(openPubZone.dataset.lat);
      const lng = Number(openPubZone.dataset.lng);
      const radiusKm = Number(openPubZone.dataset.radius || 5);
      const name = openPubZone.dataset.name || 'Khu vực bài viết';
      switchPillar('public');
      switchPublicTab('overview');
      selectZone({ id: `pub-zone-${Date.now()}`, name, province: name, lat, lng }, { radiusKm, flyMap: true });
      showToast(`Đang khoanh vùng ${radiusKm} km quanh ${name}.`);
      return;
    }

    const openAi = ev.target.closest('.js-open-assistant');
    if (openAi) {
      document.getElementById('assistant-dialog')?.showModal();
      document.getElementById('assistant-input')?.focus();
      return;
    }

    const aiSample = ev.target.closest('.js-ai-sample');
    if (aiSample) {
      document.getElementById('assistant-input').value = aiSample.dataset.q;
      askAssistant(aiSample.dataset.q);
      return;
    }

    const closeDlg = ev.target.closest('[data-close-dialog]');
    if (closeDlg) {
      document.getElementById(closeDlg.dataset.closeDialog)?.close();
    }
  });

  window.addEventListener('online', () => {
    state.isOffline = false;
    updateOfflineStrip();
    refreshActiveZoneData({ flyMap: false });
  });
  window.addEventListener('offline', () => {
    state.isOffline = true;
    updateOfflineStrip();
  });
}

function boot() {
  registerServiceWorker();
  applyLargeTextMode(Boolean(readJson(LARGE_TEXT_KEY, false)));
  populateProvinceSelects();
  bindEvents();
  selectZone(VIETNAM_ZONES[0], { radiusKm: 2, flyMap: true });
  loadPublicationsFeed();
}

boot();
