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
  SAFE_DETOUR_ROUTES,
  ROUTE_PRESETS
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
import {
  selectHighGroundWaypoints,
  evaluateRouteHydroTerrain,
  renderRouteHydroProfileSvg
} from './platform/gis/hydro-route.js';
import {
  lookupCentralMeridian,
  wgs84ToVn2000Local,
  computeVn2000MetricLength,
  computeVn2000MetricPolygonArea
} from './platform/gis/vn2000.js';
import {
  computeHydrodynamicInstability,
  evaluateUserDistressProbability
} from './platform/ai/distress-inference.js';
import { buildNationalGroundedBrief, sanitizeCitizenJargon } from './platform/ai/national-intelligence.js';
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
  CITIZEN_LANDMARKS,
  PLAIN_SOURCE_LABELS,
  haversineMeters,
  formatDistancePlain,
  describePointVerificationPlain,
  describeAqiPlain,
  buildCitizenStatusAdvisory,
  buildHonestRentalAreaSummary,
  buildHonestRouteComparison,
  createOfflineReportQueueItem,
  buildOfflineSosSmsPayload
} from './citizen-logic.js';

const CACHE_KEY = 'vn_resilience_cache_v2';
const CHECKLIST_KEY = 'vn_resilience_housing_checklist_v1';
const OFFLINE_QUEUE_KEY = 'vn_resilience_offline_queue_v1';
const LARGE_TEXT_KEY = 'vn_resilience_large_text_v1';
const MY_PLACES_KEY = 'vn_resilience_my_places_v1';
const RESEARCHER_TOKEN_KEY = 'vn_resilience_researcher_token_v1';
const REVIEWER_TOKEN_KEY = 'vn_resilience_reviewer_token_v1';
const CITIZEN_TOKEN_KEY = 'vn_resilience_citizen_token_v1';

const ALL_STATIC_POINTS = [...SAMPLE_HUMG_POINTS, ...VIETNAM_VERIFIED_HOTSPOTS];
const ALL_STATIC_CORRIDORS = [...FLOOD_STREET_CORRIDORS, ...VIETNAM_VERIFIED_CORRIDORS];
const ALL_STATIC_BASINS = [...LOW_DEM_BASINS, ...VIETNAM_VERIFIED_BASINS];

const BASEMAP_PROVIDERS = {
  osm: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    className: 'tiles-clean-atlas',
    attribution: 'Tiles &copy; Esri World Street Map'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labelUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    className: '',
    attribution: 'Tiles &copy; Esri World Imagery'
  },
  topo: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    className: '',
    attribution: 'Tiles &copy; Esri World Topo'
  },
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
    className: '',
    attribution: 'Tiles &copy; Esri Dark Gray Canvas'
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
    flowVectors: false,
    basins: false,
    corridors: false,
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
    rainMm: 0,
    opacity: 0.7,
    preset: 'live',
    flowAnimated: true,
    demGrid: null
  },
  travelMode: 'motorbike',
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
let satelliteLabelLayer = null;
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
let riverChartInstance = null;
let aiSparkChartInstance = null;

let routeMap = null;
let routeLinesLayer = null;
let reportMap = null;
let reportMarker = null;
let studyMap = null;
let studyDraftLayer = null;
let studyZoneCircle = null;
let sosLiveMap = null;
let sosLiveLayer = null;

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
  const valid = ['public', 'sos', 'research', 'news'];
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
  } else if (next === 'sos') {
    refreshSosAndAiPillar();
  } else if (next === 'research') {
    renderResearchPillar();
  } else if (next === 'news') {
    loadLiveBasinBulletins();
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
    if (layout) {
      layout.dataset.mobileMode = 'list';
      layout.dataset.sheet = 'full';
    }
    document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mapMode === 'list'));
  }

  if (next === 'overview') {
    setTimeout(() => nationalMap?.invalidateSize(), 60);
  } else if (next === 'housing') {
    renderHousingCheck();
  } else if (next === 'route') {
    setTimeout(() => routeMap?.invalidateSize(), 60);
  } else if (next === 'report') {
    ensureTurnstileMounted();
    const locInp = document.getElementById('rep-location-name');
    if (locInp && !locInp.value.trim()) {
      locInp.value = resolveAutoLocationLabel(state.reportPin.lat, state.reportPin.lng);
    }
  }
}

function resolveAutoLocationLabel(lat, lng) {
  const adminLabel = state.vnZoneIntel?.admin?.postMerger?.fullLabel || state.zone?.name || 'Khu vực Việt Nam';
  let best = null;
  for (const pt of state.zonePoints || []) {
    const d = haversineMeters(Number(lat), Number(lng), Number(pt.lat), Number(pt.lng));
    if (d <= 600 && (!best || d < best.d)) {
      best = { name: pt.name, d };
    }
  }
  if (best) {
    const shortName = String(best.name || '').split('(')[0].trim();
    return `Gần ${shortName} (~${Math.round(best.d)} m) · ${adminLabel}`;
  }
  return adminLabel;
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
    pill.textContent = `${state.zone.lat.toFixed(2)}°N, ${state.zone.lng.toFixed(2)}°E · ${state.zone.radiusKm}km`;
  }
  const elevPill = document.getElementById('env-elev-pill');
  if (elevPill) elevPill.textContent = 'Nền -- m';

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

function updateHydroSimModeBanner() {
  const banner = document.getElementById('map-sim-banner');
  const txt = document.getElementById('map-sim-banner-text');
  if (!banner || !txt) return;
  const preset = state.hydroSim.preset;
  const mm = Math.round(Number(state.hydroSim.rainMm) || 0);
  const isSimulated = preset !== 'live' && mm > 4;
  banner.hidden = !isSimulated;
  if (isSimulated) {
    txt.textContent = `Đang mô phỏng giả định: Mưa ${mm} mm (không phải ngập thực tế lúc này)`;
  }
}

function updateHydroSummaryBar() {
  updateHydroSimModeBanner();
  const el = document.getElementById('hydro-terrain-summary');
  if (!el) return;
  const g = state.hydroSim.demGrid;
  if (!g?.stats) {
    el.textContent = 'Chưa có lưới độ cao chi tiết vùng này — đang dùng mốc điểm thực tế';
    return;
  }
  const slopeHint = (g.stats.steepPct || 0) >= 6 ? ` · Sườn dốc ${g.stats.steepPct}%` : '';
  el.textContent = `Vùng trũng ~${g.stats.lowlandPct}%${slopeHint} · Độ cao ${g.stats.minM}–${g.stats.maxM} m (${g.rows}×${g.cols} điểm)`;
}

async function refreshActiveZoneData({ flyMap = true } = {}) {
  state.isOffline = !navigator.onLine;
  updateOfflineStrip();
  const searchHereBtn = document.getElementById('btn-search-this-area');
  if (searchHereBtn) searchHereBtn.hidden = true;

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
      updateHydroSimModeBanner();
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
      if (osmOk.source === 'osm_photon_live' && state.osmWaterways.length === 0) {
        osmStatusEl.textContent = `+${state.osmPois.length} y tế/trú (OSM · kênh rạch chi tiết tạm bận)`;
      } else if (state.osmPois.length + state.osmWaterways.length > 0) {
        osmStatusEl.textContent = `+${state.osmPois.length} y tế/trú · +${state.osmWaterways.length} kênh/sông OSM`;
      } else {
        osmStatusEl.textContent = 'Đã kiểm tra OSM vùng';
      }
    }
  } else if (osmStatusEl) {
    osmStatusEl.textContent = 'OSM tạm bận — hiển thị dữ liệu cộng đồng';
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
      const prob = probArr[idx] != null ? Math.round(probArr[idx]) : 0;
      return `<div class="hourly-bar-col" role="button" tabindex="0" data-hour-idx="${idx}" data-mm="${mm.toFixed(1)}" data-prob="${prob}" title="Chạm mô phỏng +${idx}h: ${mm.toFixed(1)} mm/h (${prob}%)"><div class="hourly-bar-fill ${cls}" style="height:${pct}%"></div></div>`;
    })
    .join('');
}

function exportActiveZoneDossier() {
  const z = state.zone;
  const stats = state.hydroSim.demGrid?.stats || {};
  const l0 = lookupCentralMeridian(z.province, z.lng);
  const vn2kCenter = wgs84ToVn2000Local(z.lat, z.lng, l0, 3);
  const postAdmin = state.vnZoneIntel?.admin?.postMerger?.fullLabel || z.name;
  const preAdmin = state.vnZoneIntel?.admin?.preMerger?.fullLabel || 'Đang cập nhật';
  const pop = state.vnZoneIntel?.populationZone?.population;
  const aqiInfo = describeAqiPlain(state.aqi?.usAqi);

  const brief = buildNationalGroundedBrief({
    question: 'Tổng hợp hồ sơ vùng khoanh',
    zone: z,
    weather: state.weather,
    hourlyForecast: state.hourlyForecast,
    riverDischarge: state.riverDischarge,
    aqi: state.aqi,
    demStats: stats,
    vnZoneIntel: state.vnZoneIntel,
    zonePoints: state.zonePoints,
    zoneCorridors: state.zoneCorridors
  });

  const risks = state.zonePoints.filter((p) => p.layerGroup === 'risk').slice(0, 25);
  const safes = state.zonePoints.filter((p) => p.layerGroup === 'safe').slice(0, 15);
  const safeId = String(z.id || 'zone').replace(/[^a-z0-9-_]/gi, '-');

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Hồ sơ Địa không gian & An toàn Thiên tai — ${esc(z.name)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #0F172A; margin: 28px auto; max-width: 860px; line-height: 1.5; }
  h1 { font-size: 1.45rem; margin: 0 0 6px; color: #0F766E; }
  .meta { font-size: 0.85rem; color: #475569; margin-bottom: 18px; border-bottom: 1px solid #CBD5E1; padding-bottom: 10px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
  .box { border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px; background: #F8FAFC; }
  .box strong { display: block; font-size: 0.78rem; color: #475569; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 0.82rem; }
  th, td { border: 1px solid #CBD5E1; padding: 6px 8px; text-align: left; }
  th { background: #F1F5F9; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>HỒ SƠ CHẨN ĐOÁN ĐỊA KHÔNG GIAN &amp; AN TOÀN THIÊN TAI</h1>
  <div class="meta">
    Vùng khoanh: <strong>${esc(z.name)} (R = ${z.radiusKm} km)</strong> · Xuất lúc: ${new Date().toLocaleString('vi-VN')} · Nền tảng VN Resilience Atlas
  </div>
  <div class="grid">
    <div class="box"><strong>Đơn vị Hành chính (Sau sáp nhập / Trước sáp nhập)</strong>${esc(postAdmin)}<br><small>Trước sáp nhập: ${esc(preAdmin)}</small></div>
    <div class="box"><strong>Quy mô Dân cư &amp; Tọa độ VN-2000 (L0=${l0}°)</strong>${pop != null ? `~${Number(pop).toLocaleString('vi-VN')} người trong vùng` : `Bán kính ${z.radiusKm} km`}<br><small>X=${vn2kCenter.x} m · Y=${vn2kCenter.y} m (${z.lat.toFixed(5)}°N, ${z.lng.toFixed(5)}°E)</small></div>
    <div class="box"><strong>Địa hình &amp; Khí tượng – Thủy văn</strong>Cao độ: ${stats.minM ?? '--'}–${stats.maxM ?? '--'} m (Trũng ${stats.lowlandPct ?? '--'}%, Dốc max ${stats.maxSlopeDeg ?? '--'}°)<br><small>Mưa ngày: ${state.weather ? `${Math.round(state.weather.dailyRainMm)} mm` : '--'} · Sông: ${state.riverDischarge ? `${state.riverDischarge.todayVal.toFixed(1)} m³/s (×${state.riverDischarge.ratioVsMean})` : '--'}</small></div>
    <div class="box"><strong>Không khí (QCVN 05:2023/BTNMT) &amp; Chỉ số D×V</strong>AQI ${Number.isFinite(state.aqi?.usAqi) ? Math.round(state.aqi.usAqi) : '--'} (${esc(aqiInfo.headline)})<br><small>Kịch bản mưa đang mô phỏng: ${state.hydroSim.rainMm} mm · D×V đáy vùng ~${brief.metrics.dvProduct} m²/s</small></div>
  </div>
  <h2>1. Tổng hợp Thực chứng Đa nguồn</h2>
  <ul>${brief.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <h2>2. Điểm Rủi ro Trọng điểm Nội vùng (${risks.length})</h2>
  <table><thead><tr><th>Mã</th><th>Địa điểm</th><th>Phân loại</th><th>Cách tâm</th><th>Ghi chú</th></tr></thead><tbody>
  ${risks.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${esc(formatDistancePlain(r.distanceMeters))}</td><td>${esc((r.notes || '').slice(0, 120))}</td></tr>`).join('')}
  </tbody></table>
  <h2>3. Cơ sở Y tế &amp; Điểm Tránh trú Gần nhất (${safes.length})</h2>
  <table><thead><tr><th>Mã</th><th>Cơ sở</th><th>Loại</th><th>Cách tâm</th></tr></thead><tbody>
  ${safes.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td>${esc(formatDistancePlain(s.distanceMeters))}</td></tr>`).join('')}
  </tbody></table>
  <p style="font-size:0.78rem;color:#475569;"><em>Miễn trừ khoa học: Hồ sơ tổng hợp từ dữ liệu mở đa nguồn và mô phỏng địa hình tham khảo, không thay thế bản tin dự báo/sơ tán chính thức của cơ quan KTTV &amp; PCTT. Tổng đài khẩn cấp quốc gia: 112 / 114 / 115.</em></p>
</body>
</html>`;

  downloadFile(html, `ho-so-vung-${safeId}.html`, 'text/html;charset=utf-8');
  showToast(`Đã xuất Hồ sơ Vùng Khoanh (${z.name}) chuẩn in A4!`);
}

const MY_PLACE_SLOTS = [
  { key: 'home', label: 'Nhà' },
  { key: 'work', label: 'Chỗ làm' },
  { key: 'school', label: 'Trường / Người thân' }
];

function buildShareableZoneUrl() {
  const lat = Number(state.zone?.lat || 21.072514).toFixed(5);
  const lng = Number(state.zone?.lng || 105.77387).toFixed(5);
  const r = Number(state.zone?.radiusKm || 2);
  const nm = encodeURIComponent(String(state.zone?.name || 'Khu vực Việt Nam').slice(0, 80));
  const origin = location.protocol.startsWith('http') ? location.origin : 'https://bando-antoan-vn.vercel.app';
  return `${origin}/?lat=${lat}&lng=${lng}&r=${r}&name=${nm}`;
}

function renderMySavedPlaces() {
  const mount = document.getElementById('my-places-slots');
  const homeRouteBtn = document.getElementById('btn-safe-route-home');
  if (!mount) return;
  const saved = readJson(MY_PLACES_KEY, { home: null, work: null, school: null });
  if (homeRouteBtn) homeRouteBtn.hidden = !saved?.home;

  const allRisk = [...ALL_STATIC_POINTS, ...(state.cloudReports || [])].filter((p) => p.layerGroup === 'risk');
  mount.innerHTML = MY_PLACE_SLOTS.map((slot) => {
    const item = saved?.[slot.key];
    if (!item || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) {
      return `<div class="my-place-chip">
        <button type="button" class="my-place-go js-pin-my-place" data-slot="${slot.key}" title="Ghim vị trí ${esc(slot.label)} tại tâm vùng đang xem">
          <strong>+ Ghim ${esc(slot.label)}</strong>
          <span>Lưu tại vùng này</span>
        </button>
      </div>`;
    }
    const nearRiskCnt = allRisk.filter((p) => haversineMeters(item.lat, item.lng, Number(p.lat), Number(p.lng)) <= 1500).length;
    return `<div class="my-place-chip is-saved">
      <button type="button" class="my-place-go js-go-my-place" data-slot="${slot.key}" title="Bay thẳng tới ${esc(item.name)}">
        <strong>${esc(slot.label)}: ${esc(item.name)}</strong>
        <span>${nearRiskCnt > 0 ? `${nearRiskCnt} điểm lưu ý (<1,5 km)` : 'Không có điểm ngập gần'}</span>
      </button>
      <button type="button" class="my-place-clear js-clear-my-place" data-slot="${slot.key}" aria-label="Xóa ghim ${esc(slot.label)}" title="Gỡ ghim">×</button>
    </div>`;
  }).join('');
}

async function exportZoneZaloPngCard() {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 620;
  const ctx = c.getContext('2d');
  if (!ctx) return;

  const riskCount = state.zonePoints.filter((p) => p.layerGroup === 'risk').length;
  const safeCount = state.zonePoints.filter((p) => p.layerGroup === 'safe').length;
  const adv = buildCitizenStatusAdvisory({
    areaName: `${state.zone.name} (R=${state.zone.radiusKm} km)`,
    weather: state.weather,
    aqi: state.aqi,
    nearbyFloodCount: riskCount,
    updatedAtLabel: state.lastUpdatedAt ? formatTimeHm(state.lastUpdatedAt) : 'Trực tiếp',
    isOffline: state.isOffline
  });
  const toneColor = adv.level === 'danger' ? '#DC2626' : adv.level === 'attention' ? '#D97706' : '#0D9488';

  ctx.fillStyle = '#0B1220';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = toneColor;
  ctx.fillRect(0, 0, 18, c.height);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 22px sans-serif';
  ctx.fillText('VN RESILIENCE ATLAS · BẢN TIN AN TOÀN KHU VỰC (34 TỈNH/THÀNH)', 56, 58);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 38px sans-serif';
  ctx.fillText(String(state.zone.name || 'Khu vực Việt Nam').slice(0, 42), 56, 114);

  const postLabel = state.vnZoneIntel?.admin?.postMerger?.fullLabel;
  if (postLabel) {
    ctx.fillStyle = '#5EEAD4';
    ctx.font = '600 22px sans-serif';
    ctx.fillText(`Địa giới hiện hành: ${postLabel}`.slice(0, 68), 56, 150);
  }

  ctx.fillStyle = toneColor;
  ctx.fillRect(56, 178, 340, 42);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 21px sans-serif';
  ctx.fillText(String(adv.levelLabel || 'Theo dõi').toUpperCase(), 74, 206);

  const boxes = [
    { lbl: 'MƯA HIỆN TẠI / 24H', val: `${state.weather?.rainMm ?? 0} / ${state.weather?.dailyRainMm ?? 0} mm` },
    { lbl: 'NHIỆT ĐỘ / CẢM NHẬN', val: `${state.weather?.temp ?? '--'}°C / ${state.weather?.apparentTemp ?? '--'}°C` },
    { lbl: 'CHẤT LƯỢNG KHÔNG KHÍ', val: `US AQI ${state.aqi?.usAqi ?? '--'}` },
    { lbl: 'TRONG VÒNG KHOANH', val: `${riskCount} rủi ro · ${safeCount} y tế/trú` }
  ];
  boxes.forEach((b, idx) => {
    const bx = 56 + idx * 246;
    ctx.fillStyle = '#132038';
    ctx.fillRect(bx, 248, 228, 108);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(bx, 248, 228, 108);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 15px sans-serif';
    ctx.fillText(b.lbl, bx + 16, 282);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 24px sans-serif';
    ctx.fillText(b.val, bx + 16, 326);
  });

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 23px sans-serif';
  ctx.fillText(String(adv.action || '').slice(0, 74), 56, 412);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 20px sans-serif';
  ctx.fillText(String(adv.cause || '').slice(0, 86), 56, 452);

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 508, c.width, 112);
  ctx.fillStyle = '#FDA4AF';
  ctx.font = '700 23px sans-serif';
  ctx.fillText('KHẨN CẤP QUỐC GIA:  112 (Cứu nạn)  ·  114 (PCCC)  ·  115 (Cấp cứu)', 56, 552);
  ctx.fillStyle = '#5EEAD4';
  ctx.font = '600 20px monospace';
  ctx.fillText(buildShareableZoneUrl().slice(0, 78), 56, 592);

  c.toBlob(async (blob) => {
    if (!blob) return;
    const fname = `CanhBao_${Date.now().toString(36)}.png`;
    const file = new File([blob], fname, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Cảnh báo an toàn: ${state.zone.name}`,
          text: `${adv.levelLabel}: ${adv.headline}. Mở bản đồ: ${buildShareableZoneUrl()}`,
          files: [file]
        });
        return;
      } catch {
        // fallback download below
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Đã tải ảnh thẻ cảnh báo — bạn gửi thẳng vào Zalo/Messenger được ngay!');
  }, 'image/png');
}

function renderPublicOverview({ flyMap = false } = {}) {
  renderMySavedPlaces();
  const chartsDisc = document.getElementById('telemetry-charts-disclosure');
  if (chartsDisc && !chartsDisc.dataset.userToggled) {
    const rainNow = Number(state.weather?.rainMm || 0);
    const rainDay = Number(state.weather?.dailyRainMm || 0);
    chartsDisc.open = rainNow > 0 || rainDay >= 15;
  }
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
  const sheetSummaryEl = document.getElementById('mobile-sheet-summary');
  if (sheetSummaryEl) {
    sheetSummaryEl.textContent = `${advisory.levelLabel} · ${state.zonePoints.length} điểm trong vùng`;
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
    elevPill.textContent = `Nền ~${state.zoneElevationM} m`;
  }

  const stampLabel = state.lastUpdatedAt ? formatTimeHm(state.lastUpdatedAt) : '';
  if (state.weather) {
    document.getElementById('env-rain-val').textContent =
      state.weather.rainMm >= 0.5 ? `${state.weather.rainMm.toFixed(1)} mm/h` : `0 mm/h`;
    document.getElementById('env-rain-desc').textContent = `Cả ngày ~${Math.round(state.weather.dailyRainMm)} mm · Gió ${Math.round(state.weather.windKmh || 0)} km/h${stampLabel ? ` · ${stampLabel}` : ''}`;
    document.getElementById('env-heat-val').textContent = `${Math.round(state.weather.temp)}°C`;
    document.getElementById('env-heat-desc').textContent = `Cảm nhận ${Math.round(state.weather.apparentTemp)}°C${state.weather.apparentTemp >= 38 ? ' · Nắng gắt' : ''} · Open-Meteo`;
  } else {
    document.getElementById('env-rain-val').textContent = '-- mm/h';
    document.getElementById('env-rain-desc').textContent = `Đang đồng bộ ${state.zone.province}...`;
    document.getElementById('env-heat-val').textContent = '--°C';
    document.getElementById('env-heat-desc').textContent = `Đang tải nhiệt độ...`;
  }

  const aqiInfo = describeAqiPlain(state.aqi?.usAqi);
  document.getElementById('env-aqi-val').textContent = Number.isFinite(state.aqi?.usAqi)
    ? `${Math.round(state.aqi.usAqi)}`
    : '--';
  document.getElementById('env-aqi-desc').textContent = Number.isFinite(state.aqi?.pm25)
    ? `${aqiInfo.headline} · Bụi PM2.5 ${Math.round(state.aqi.pm25)} · Mô hình CAMS`
    : aqiInfo.headline;

  document.getElementById('env-zone-points-val').textContent = `${state.zonePoints.length} điểm`;
  document.getElementById('env-zone-points-desc').textContent = `${riskCount} từng ngập khi mưa · ${safeCount} trú ẩn/y tế · ${state.zoneCorridors.length} tuyến`;

  const rainPct = state.weather ? Math.min(100, Math.max(6, Math.round((Number(state.weather.dailyRainMm || 0) / 120) * 100))) : 8;
  const heatPct = state.weather ? Math.min(100, Math.max(12, Math.round(((Number(state.weather.apparentTemp || 28) - 10) / 36) * 100))) : 40;
  const aqiPct = Number.isFinite(state.aqi?.usAqi) ? Math.min(100, Math.max(8, Math.round((state.aqi.usAqi / 220) * 100))) : 18;
  const ptsPct = Math.min(100, Math.max(10, Math.round((state.zonePoints.length / 70) * 100)));
  const setMeter = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
  };
  setMeter('meter-rain', rainPct);
  setMeter('meter-heat', heatPct);
  setMeter('meter-aqi', aqiPct);
  setMeter('meter-points', ptsPct);

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

  const sosLocText = document.getElementById('sos-auto-loc-text');
  const sosHintInp = document.getElementById('sos-area-hint');
  if (sosLocText && sosHintInp) {
    const c = appSafetyState.sosCoords || state.zone;
    const label = resolveAutoLocationLabel(c.lat, c.lng);
    sosLocText.textContent = label;
    sosHintInp.value = label;
  }
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

  if (typeof window !== 'undefined' && typeof window.Chart === 'function') {
    if (riverChartInstance) {
      riverChartInstance.destroy();
      riverChartInstance = null;
    }
    svgMount.innerHTML = `<canvas id="river-hydrograph-canvas" role="img" aria-label="Đồ thị lưu lượng sông 21 ngày"></canvas>`;
    const cvs = document.getElementById('river-hydrograph-canvas');
    if (cvs) {
      const ctx = cvs.getContext('2d');
      const labels = rd.vals.map((_, i) => {
        const d = i - rd.todayIdx;
        return d === 0 ? 'Hôm nay' : d > 0 ? `+${d}d` : `${d}d`;
      });
      const pastSeries = rd.vals.map((v, i) => (i <= rd.todayIdx ? v : null));
      const futSeries = rd.vals.map((v, i) => (i >= rd.todayIdx ? v : null));
      const meanSeries = (rd.means || []).length === rd.vals.length ? rd.means : [];
      const gradPast = ctx.createLinearGradient(0, 0, 0, 70);
      gradPast.addColorStop(0, 'rgba(15, 118, 110, 0.28)');
      gradPast.addColorStop(1, 'rgba(15, 118, 110, 0.01)');
      const gradFut = ctx.createLinearGradient(0, 0, 0, 70);
      gradFut.addColorStop(0, 'rgba(2, 132, 199, 0.22)');
      gradFut.addColorStop(1, 'rgba(2, 132, 199, 0.01)');

      riverChartInstance = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Quan trắc',
              data: pastSeries,
              borderColor: '#0F766E',
              backgroundColor: gradPast,
              borderWidth: 2,
              fill: true,
              tension: 0.32,
              pointRadius: rd.vals.map((_, i) => (i === rd.todayIdx ? 3.5 : 0)),
              pointBackgroundColor: '#E11D48',
              pointBorderColor: '#FFFFFF',
              pointBorderWidth: 1.5
            },
            {
              label: 'Dự báo 14d',
              data: futSeries,
              borderColor: '#0284C7',
              backgroundColor: gradFut,
              borderWidth: 1.8,
              borderDash: [4, 3],
              fill: true,
              tension: 0.32,
              pointRadius: 0
            },
            ...(meanSeries.length
              ? [
                  {
                    label: 'TB mùa',
                    data: meanSeries,
                    borderColor: '#94A3B8',
                    borderWidth: 1.1,
                    borderDash: [2, 3],
                    fill: false,
                    pointRadius: 0
                  }
                ]
              : [])
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(9, 15, 30, 0.92)',
              titleFont: { size: 10 },
              bodyFont: { size: 11 },
              padding: 6,
              callbacks: {
                label: (ctxItem) =>
                  ctxItem.parsed.y != null ? `${ctxItem.dataset.label}: ${Number(ctxItem.parsed.y).toFixed(1)} m³/s` : null
              }
            }
          },
          scales: {
            x: { display: false },
            y: {
              display: true,
              ticks: { maxTicksLimit: 3, font: { size: 9 }, color: '#64748B' },
              grid: { color: 'rgba(148, 163, 184, 0.16)', drawTicks: false },
              border: { display: false }
            }
          }
        }
      });
      return;
    }
  }

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
  nationalMap = window.L.map('national-map', { zoomControl: false, preferCanvas: true }).setView([state.zone.lat, state.zone.lng], 14);
  window.L.control.zoom({ position: 'bottomright' }).addTo(nationalMap);
  window.L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(nationalMap);

  const cfg = BASEMAP_PROVIDERS[state.basemap] || BASEMAP_PROVIDERS.osm;
  baseTileLayer = window.L.tileLayer(cfg.url, {
    subdomains: cfg.subdomains || 'abc',
    maxZoom: cfg.maxZoom,
    className: cfg.className || '',
    attribution: cfg.attribution
  }).addTo(nationalMap);
  if (cfg.labelUrl) {
    satelliteLabelLayer = window.L.tileLayer(cfg.labelUrl, {
      subdomains: cfg.subdomains || 'abcd',
      maxZoom: 20,
      pane: 'shadowPane'
    }).addTo(nationalMap);
  }

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
    animated: state.hydroSim.flowAnimated,
    simRainMm: state.hydroSim.rainMm,
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

  let lastZoomVal = null;
  nationalMap.on('zoomend', () => {
    const z = nationalMap.getZoom();
    if (z !== lastZoomVal) {
      lastZoomVal = z;
      renderZoneMapAndList({ flyMap: false });
    }
  });

  nationalMap.on('mousemove', (ev) => {
    const c = document.getElementById('map-cursor-coords');
    if (c) c.textContent = `${ev.latlng.lat.toFixed(4)}°N, ${ev.latlng.lng.toFixed(4)}°E · Bấm để tra cao độ & địa giới`;
  });

  nationalMap.on('moveend', () => {
    const btn = document.getElementById('btn-search-this-area');
    if (!btn || !nationalMap) return;
    const center = nationalMap.getCenter();
    const driftM = haversineMeters(center.lat, center.lng, Number(state.zone?.lat || 0), Number(state.zone?.lng || 0));
    btn.hidden = !(driftM > 700 && isInsideVietnam(center.lat, center.lng));
  });

  document.body.dataset.basemap = state.basemap;

  nationalMap.on('click', (ev) => {
    inspectClickedCoordinate(ev.latlng.lat, ev.latlng.lng);
  });
}

function setBasemap(key) {
  if (!BASEMAP_PROVIDERS[key]) return;
  state.basemap = key;
  document.body.dataset.basemap = key;
  document.querySelectorAll('[data-basemap]').forEach((b) => {
    const active = b.dataset.basemap === key;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  if (!nationalMap) return;
  if (baseTileLayer) nationalMap.removeLayer(baseTileLayer);
  if (satelliteLabelLayer) {
    nationalMap.removeLayer(satelliteLabelLayer);
    satelliteLabelLayer = null;
  }
  const cfg = BASEMAP_PROVIDERS[key];
  baseTileLayer = window.L.tileLayer(cfg.url, {
    subdomains: cfg.subdomains || 'abc',
    maxZoom: cfg.maxZoom,
    className: cfg.className || '',
    attribution: cfg.attribution
  }).addTo(nationalMap);
  baseTileLayer.bringToBack();
  if (cfg.labelUrl) {
    satelliteLabelLayer = window.L.tileLayer(cfg.labelUrl, {
      subdomains: cfg.subdomains || 'abcd',
      maxZoom: 20,
      pane: 'shadowPane'
    }).addTo(nationalMap);
  }
  flowVectorsLayer?.redraw();
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
  if (playBtn) playBtn.textContent = 'Phát động';
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
    color: '#0F172A',
    weight: 1.5,
    opacity: 0.42,
    fillColor: '#0D9488',
    fillOpacity: 0.025
  }).addTo(zoneCircleLayer);

  // Vành đai cự ly 1/2 tinh gọn + Đa giác rốn trũng địa hình + Tuyến thoát hiểm nền cao
  if (state.layers.basins) {
    for (const frac of [0.5]) {
      const subKm = Math.round(state.zone.radiusKm * frac * 100) / 100;
      window.L.circle([state.zone.lat, state.zone.lng], {
        radius: subKm * 1000,
        color: '#64748B',
        weight: 0.9,
        opacity: 0.35,
        dashArray: '3 5',
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
        weight: 1.1,
        opacity: 0.55,
        dashArray: '3 4',
        fillColor: '#0EA5E9',
        fillOpacity: 0.09
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
    const isRainActive = Number(state.hydroSim.rainMm || 0) >= 20;
    for (const cor of state.zoneCorridors) {
      const latLngs = (cor.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (latLngs.length < 2) continue;
      window.L.polyline(latLngs, {
        color: cor.severity === 'severe' ? '#DC2626' : '#D97706',
        weight: isRainActive ? 4.2 : 2.6,
        opacity: isRainActive ? 0.84 : 0.56
      })
        .bindPopup(`<strong>${esc(cor.name)}</strong><br><small>Ngưỡng mưa tham chiếu ~${cor.rainThresholdMm} mm · ${esc(cor.source)}</small><br>${esc(cor.note)}`)
        .addTo(corridorsLayer);
    }
  }

  // Gom cụm thông minh theo ô lưới màn hình ở mức thu phóng rộng để tránh chồng lấn 60+ điểm
  const curZoom = nationalMap.getZoom() || 14;
  const isCompactMob = typeof window !== 'undefined' && window.innerWidth < 768;
  const clusterCellPx = curZoom >= 16 ? 0 : curZoom === 15 ? (isCompactMob ? 38 : 30) : curZoom === 14 ? (isCompactMob ? 54 : 42) : (isCompactMob ? 64 : 52);
  const liveByPt = state.livePulse?.byPoint || {};
  const enrichedPts = filtered.map((pt) => ({
    ...pt,
    isLiveFlooding: liveByPt[pt.id]?.status === 'flooding'
  }));

  if (clusterCellPx > 0 && enrichedPts.length > 10) {
    const buckets = new Map();
    for (const pt of enrichedPts) {
      const pxPt = nationalMap.latLngToContainerPoint([Number(pt.lat), Number(pt.lng)]);
      const gx = Math.floor(pxPt.x / clusterCellPx);
      const gy = Math.floor(pxPt.y / clusterCellPx);
      const key = `${gx}:${gy}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(pt);
    }

    for (const group of buckets.values()) {
      // Giữ các điểm đang báo ngập nóng <6h luôn hiển thị riêng, chỉ gom nhóm các điểm tĩnh chồng chéo
      const liveItems = group.filter((p) => p.isLiveFlooding);
      const staticItems = group.filter((p) => !p.isLiveFlooding);

      for (const lpt of liveItems) {
        const m = window.L.marker([Number(lpt.lat), Number(lpt.lng)], {
          icon: buildMapPictogramIcon(window.L, lpt, curZoom)
        })
          .bindTooltip(`<strong>${esc(lpt.name)}</strong><br><span class="mono-num">Đang báo ngập mới · ${esc(formatDistancePlain(lpt.distanceMeters))}</span>`, {
            direction: 'top',
            offset: [0, -8],
            className: 'vn-map-tooltip'
          })
          .on('click', (ev) => {
            window.L.DomEvent.stopPropagation(ev);
            showSelectedPointCard(lpt);
          });
        m._vnPt = lpt;
        m.addTo(zoneMarkersLayer);
      }

      if (staticItems.length === 1) {
        const pt = staticItems[0];
        const m = window.L.marker([Number(pt.lat), Number(pt.lng)], {
          icon: buildMapPictogramIcon(window.L, pt, curZoom)
        })
          .bindTooltip(`<strong>${esc(pt.name)}</strong><br><span class="mono-num">${esc(formatDistancePlain(pt.distanceMeters))}</span>`, {
            direction: 'top',
            offset: [0, -8],
            className: 'vn-map-tooltip'
          })
          .on('click', (ev) => {
            window.L.DomEvent.stopPropagation(ev);
            showSelectedPointCard(pt);
          });
        m._vnPt = pt;
        m.addTo(zoneMarkersLayer);
      } else if (staticItems.length > 1) {
        const cLat = staticItems.reduce((s, x) => s + Number(x.lat), 0) / staticItems.length;
        const cLng = staticItems.reduce((s, x) => s + Number(x.lng), 0) / staticItems.length;
        const safeCnt = staticItems.filter((x) => x.layerGroup === 'safe').length;
        const riskCnt = staticItems.length - safeCnt;
        const tone = safeCnt > riskCnt ? 'is-safe' : 'is-risk';
        const clusterIcon = window.L.divIcon({
          className: `vn-cluster-badge ${tone}`,
          html: `<span class="vn-cluster-pill mono-num" title="Chạm để phóng to xem ${staticItems.length} vị trí">${staticItems.length}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        window.L.marker([cLat, cLng], { icon: clusterIcon })
          .bindTooltip(
            `<strong>Cụm ${staticItems.length} vị trí</strong><br><small>${riskCnt > 0 ? `${riskCnt} điểm từng ngập khi mưa · ` : ''}${safeCnt > 0 ? `${safeCnt} nơi trú/y tế` : ''}</small><br><span style="color:#0F766E;">Chạm để phóng to tách điểm</span>`,
            { direction: 'top', offset: [0, -10], className: 'vn-map-tooltip' }
          )
          .on('click', (ev) => {
            window.L.DomEvent.stopPropagation(ev);
            nationalMap.setView([cLat, cLng], Math.min(17, curZoom + 2), { animate: true });
          })
          .addTo(zoneMarkersLayer);
      }
    }
  } else {
    for (const pt of enrichedPts) {
      const marker = window.L.marker([Number(pt.lat), Number(pt.lng)], {
        icon: buildMapPictogramIcon(window.L, pt, curZoom)
      })
        .bindTooltip(`<strong>${esc(pt.name)}</strong><br><span class="mono-num">${esc(formatDistancePlain(pt.distanceMeters))}</span>`, {
          direction: 'top',
          offset: [0, -8],
          className: 'vn-map-tooltip'
        })
        .on('click', (ev) => {
          window.L.DomEvent.stopPropagation(ev);
          showSelectedPointCard(pt);
        });
      marker._vnPt = pt;
      marker.addTo(zoneMarkersLayer);
    }
  }

  hydroSurfaceLayer?.redraw();
  flowVectorsLayer?.redraw();
  if (state.layers.heatmap) heatmapLayer?.redraw();

  if (flyMap && ring.getBounds().isValid()) {
    const layoutEl = document.getElementById('map-split-layout');
    const hasFloatingSheet = window.innerWidth >= 1024 && layoutEl && !layoutEl.classList.contains('is-dock-collapsed');
    nationalMap.fitBounds(
      ring.getBounds(),
      hasFloatingSheet
        ? { paddingTopLeft: [424, 68], paddingBottomRight: [48, 76], maxZoom: 15 }
        : { padding: [44, 44], maxZoom: 15 }
    );
  }
}

function renderPointCardHtml(pt, { expandedActions = false } = {}) {
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

  let iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M12 4v8"/></svg>`;
  if (pt.layerGroup === 'safe') {
    iconSvg =
      pt.category === 'medical'
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
  } else if (pt.category === 'landslide') {
    iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>`;
  } else if (pt.category === 'heat' || pt.category === 'air_quality') {
    iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/></svg>`;
  }

  const pulseTag = pulse
    ? `<span class="source-tag ${pulse.status === 'flooding' ? 'tone-community' : 'tone-verified'}">${
        pulse.status === 'flooding' ? 'Đang ngập' : pulse.status === 'receding' ? 'Đang rút' : 'Khô ráo'
      }</span>`
    : '';
  const researchTag = pt.submissionId ? `<span class="source-tag tone-verified">Nghiên cứu</span>` : '';
  const osmTag = pt.isOsmLive ? `<span class="source-tag tone-model">OSM thực tế</span>` : '';
  const statusPlain = pulse
    ? (pulse.status === 'flooding' ? 'Đang ngập' : pulse.status === 'receding' ? 'Đang rút' : 'Khô ráo')
    : pt.isOsmLive
      ? 'OSM thực tế'
      : ver.label;

  return `
    <article class="place-card ${cardType}">
      <div class="place-card-row">
        <span class="place-leading-badge ${cardType}" aria-hidden="true">${iconSvg}</span>
        <div class="place-card-main">
          <div class="place-card-top">
            <h3 class="place-card-title">${esc(pt.name)}</h3>
            <span class="place-card-dist">${esc(formatDistancePlain(pt.distanceMeters))}</span>
          </div>
          ${
            expandedActions
              ? `<div class="place-card-meta">
                   <span class="source-tag ${pt.layerGroup === 'safe' ? 'tone-verified' : 'tone-community'}">${esc(catNames[pt.category] || 'Điểm ghi nhận')}</span>
                   ${osmTag || `<span class="source-tag tone-${ver.badgeTone}">${esc(ver.label)}</span>`}
                   ${researchTag}
                   ${pulseTag}
                 </div>`
              : `<div class="place-card-meta-line${pulse?.status === 'flooding' ? ' is-live-alert' : ''}">${esc(catNames[pt.category] || 'Điểm ghi nhận')} · ${esc(statusPlain)}</div>`
          }
          <p class="place-card-desc">${esc((pt.notes || '').slice(0, 165))}</p>
          <div class="place-card-actions">
            <button type="button" class="checkin-btn is-locate js-focus-map-pt" data-lat="${pt.lat}" data-lng="${pt.lng}" data-ptid="${esc(pt.id)}">Định vị</button>
            ${
              pt.layerGroup === 'risk'
                ? expandedActions
                  ? `<button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="flooding">Đang ngập</button>
                     <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="receding">Đang rút</button>
                     <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="clear">Khô ráo</button>
                     <button type="button" class="checkin-btn js-confirm-national-pt" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}">+1 (${Number(pt.confirmCount) || 1})</button>`
                  : `<details class="inline-checkin-popover">
                       <summary class="checkin-btn">Cập nhật (${Number(pt.confirmCount) || 1}) ▾</summary>
                       <div class="inline-checkin-row">
                         <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="flooding">Đang ngập</button>
                         <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="receding">Đang rút</button>
                         <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="clear">Khô ráo</button>
                         <button type="button" class="checkin-btn js-confirm-national-pt" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}">+1 Xác nhận</button>
                       </div>
                     </details>`
                : ''
            }
          </div>
        </div>
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
    ${renderPointCardHtml(pt, { expandedActions: true })}
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
function normPlaceText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function geocodeVietnamPlace(text) {
  const q = String(text || '').trim();
  const coordMatch = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (isInsideVietnam(lat, lng)) {
      return { name: `Tọa độ (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
    }
  }

  const primaryRaw = q.split(/[,–\-]/)[0].trim();
  const normQ = normPlaceText(q);
  const normPrimary = normPlaceText(primaryRaw);

  // 1. Ưu tiên khớp đúng mốc đặc trưng / điểm cầu / tuyến phổ thông trước tránh bị tên tỉnh "Hà Nội" nuốt mất địa chỉ cụ thể
  const candidatePool = [
    ...(Array.isArray(CITIZEN_LANDMARKS) ? CITIZEN_LANDMARKS : []),
    ...(Array.isArray(ROUTE_PRESETS) ? ROUTE_PRESETS : []),
    ...(Array.isArray(state.zonePoints) ? state.zonePoints : []),
    ...ALL_STATIC_POINTS
  ];

  // Khớp trực tiếp cụm chính (vd: "nga tu cau noi" -> khớp "cau noi", "benh vien da khoa phuong dong" -> khớp "phuong dong")
  const primaryShort = normPrimary.replace(/^(nga tu|nga ba|phuong|quan|duong|pho|cong|khu vuc)\s+/i, '').trim();
  if (primaryShort.length >= 4 && primaryShort !== normPlaceText(state.zone.name)) {
    const localHit = candidatePool.find((p) => {
      const pn = normPlaceText(p.label || p.name || '');
      return pn && (pn === normPrimary || pn.includes(normPrimary) || (primaryShort.length >= 5 && pn.includes(primaryShort)));
    });
    if (localHit) {
      return { name: localHit.label || localHit.name || q, lat: Number(localHit.lat), lng: Number(localHit.lng) };
    }
  }

  // 2. Nếu query là đúng tên tâm vùng đang mở (hoặc chính xác tên một tỉnh/vùng mà không có tên đường đi kèm)
  const topZoneHit = searchVietnamZones(q, 'all', 1)[0];
  if (topZoneHit) {
    const zNorm = normPlaceText(topZoneHit.name);
    if (normQ === zNorm || (!q.includes(',') && normQ.length <= zNorm.length + 4 && zNorm.includes(normQ))) {
      return { name: topZoneHit.name, lat: topZoneHit.lat, lng: topZoneHit.lng };
    }
  }

  // 3. Định vị địa chỉ cụ thể toàn quốc bằng OpenStreetMap Nominatim
  if (!state.isOffline && normQ.length >= 3) {
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

  if (topZoneHit) return { name: topZoneHit.name, lat: topZoneHit.lat, lng: topZoneHit.lng };
  const anyLocalPt = candidatePool.find((p) => normPlaceText(p.label || p.name).includes(normQ));
  if (anyLocalPt) return { name: anyLocalPt.label || anyLocalPt.name, lat: Number(anyLocalPt.lat), lng: Number(anyLocalPt.lng) };

  return { name: state.zone.name, lat: state.zone.lat, lng: state.zone.lng, resolvedFallback: true };
}

async function fetchOsrmRoutes(waypoints, travelMode, includeAlternatives = false) {
  if (state.isOffline) return [];
  const profile = travelMode === 'foot' ? 'foot' : 'driving';
  const str = waypoints.map(([la, ln]) => `${ln},${la}`).join(';');
  try {
    const altParam = includeAlternatives ? '&alternatives=true' : '';
    const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${str}?overview=full&geometries=geojson${altParam}`);
    if (!res.ok) return [];
    const d = await res.json();
    return (d?.routes || [])
      .filter((r) => Array.isArray(r?.geometry?.coordinates) && r.geometry.coordinates.length >= 2)
      .map((r) => ({
        coordsLngLat: r.geometry.coordinates,
        distanceKm: Math.round((r.distance / 1000) * 100) / 100,
        durationMin: Math.max(2, Math.round((r.duration / 60) * (travelMode === 'foot' ? 1 : 1.15)))
      }));
  } catch {
    return [];
  }
}

async function fetchOsrm(waypoints, travelMode) {
  const routes = await fetchOsrmRoutes(waypoints, travelMode, false);
  return routes[0] || null;
}

async function runNationalRouteComparison(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-compare-routes');
  btn.disabled = true;
  btn.textContent = 'Đang giải tích thủy – địa hình...';
  try {
    const start = await geocodeVietnamPlace(document.getElementById('route-start-input')?.value);
    const end = await geocodeVietnamPlace(document.getElementById('route-end-input')?.value);

    if (haversineMeters(start.lat, start.lng, end.lat, end.lng) < 40) {
      document.getElementById('route-comparison-output').hidden = false;
      document.getElementById('route-reason-banner').innerHTML = `<strong>Chưa tách được 2 vị trí khác nhau (${esc(start.name)}):</strong><br>Vui lòng chọn điểm đi và điểm đến rõ hơn (ví dụ: thêm tên đường hoặc chọn trên bản đồ).`;
      document.getElementById('route-compare-cards').innerHTML = '';
      document.getElementById('route-honesty-banner').textContent = '';
      showToast('Điểm đi và điểm đến đang trùng tọa độ — vui lòng nhập địa chỉ cụ thể hơn.');
      return;
    }

    const riskPoints = state.zonePoints.filter((p) => p.layerGroup === 'risk');
    const liveFloodPointIds = new Set(
      Object.values(state.livePulse?.byPoint || {})
        .filter((x) => x && x.status === 'flooding' && x.pointId)
        .map((x) => x.pointId)
    );
    const highWaypoints = selectHighGroundWaypoints(
      start,
      end,
      state.hydroSim.demGrid,
      riskPoints,
      state.zoneCorridors,
      liveFloodPointIds
    );

    const [directList, ...viaLists] = await Promise.all([
      fetchOsrmRoutes([[start.lat, start.lng], [end.lat, end.lng]], state.travelMode, true),
      ...highWaypoints.map((wp) => fetchOsrmRoutes([[start.lat, start.lng], [wp.lat, wp.lng], [end.lat, end.lng]], state.travelMode, false))
    ]);

    const direct = directList[0] || {
      coordsLngLat: [[start.lng, start.lat], [end.lng, end.lat]],
      distanceKm: Math.round((haversineMeters(start.lat, start.lng, end.lat, end.lng) * 1.25) / 10) / 100,
      durationMin: Math.max(3, Math.round(haversineMeters(start.lat, start.lng, end.lat, end.lng) / 300)),
      isStraightLineFallback: true
    };

    const simRainMm = Math.max(Number(state.hydroSim.rainMm || 0), Number(state.weather?.dailyRainMm || 0));
    const dischargeRatio = Number(state.riverDischarge?.ratioVsMean || 1);

    const evalOpts = (coordsLngLat) =>
      evaluateRouteHydroTerrain({
        coordsLngLat,
        demGrid: state.hydroSim.demGrid,
        rainMm: simRainMm,
        dischargeRatio,
        riskPoints,
        corridors: state.zoneCorridors,
        travelMode: state.travelMode,
        liveFloodPointIds
      });

    const directHydro = evalOpts(direct.coordsLngLat);
    const pool = [...directList.slice(1), ...viaLists.flat()].filter(Boolean);
    const evaluatedPool = pool.map((geom) => ({ geom, hydro: evalOpts(geom.coordsLngLat) }));
    evaluatedPool.sort(
      (a, b) =>
        a.hydro.compositeScore - b.hydro.compositeScore ||
        a.hydro.nearRiskCount - b.hydro.nearRiskCount ||
        a.geom.distanceKm - b.geom.distanceKm
    );

    const bestAlt = evaluatedPool[0] || { geom: direct, hydro: directHydro };
    const cmp = buildHonestRouteComparison({
      originName: start.name,
      destName: end.name,
      travelMode: state.travelMode,
      directRoute: { distanceKm: direct.distanceKm, durationMin: direct.durationMin, risks: directHydro.nearRisks },
      detourRoute: { distanceKm: bestAlt.geom.distanceKm, durationMin: bestAlt.geom.durationMin, risks: bestAlt.hydro.nearRisks },
      liveFloodPointIds
    });

    const recommendAlt =
      cmp.recommendation === 'detour' ||
      bestAlt.hydro.compositeScore + 10 < directHydro.compositeScore ||
      bestAlt.hydro.maxDepthCm + 4 < directHydro.maxDepthCm;

    document.getElementById('route-comparison-output').hidden = false;
    const reasonExtra =
      recommendAlt && bestAlt.hydro.floodedLengthM < directHydro.floodedLengthM
        ? ` Giảm đoạn nghi đọng nước từ ~${directHydro.floodedLengthM} m xuống ~${bestAlt.hydro.floodedLengthM} m (điểm nền thấp nhất ${bestAlt.hydro.minElevM} m).`
        : '';
    const geocodeWarn =
      start.resolvedFallback || end.resolvedFallback
        ? ' Lưu ý: một đầu tuyến chưa tìm thấy chính xác trên OSM nên tạm quy về tâm vùng.'
        : '';
    const osrmFallbackWarn =
      direct.isStraightLineFallback
        ? ' (Máy chủ dẫn đường đường phố tạm gián đoạn — đang vẽ đoạn nối thẳng tham khảo).'
        : '';
    document.getElementById('route-reason-banner').innerHTML = `<strong>${esc(start.name)} → ${esc(end.name)}:</strong><br>${esc(cmp.reason + reasonExtra + geocodeWarn + osrmFallbackWarn)}`;

    const dRisk = cmp.directSummary.riskCount;
    const aRisk = cmp.detourSummary.riskCount;
    const passBadge = (h) => `<span class="route-passability-badge is-${esc(h.passability)}">${esc(h.passabilityLabel)}</span>`;
    const formatRouteStatsLine = (riskCnt, h, isFallback) =>
      `Đi gần <strong>${riskCnt} vị trí</strong> từng ngập · Độ sâu mô phỏng tối đa <strong>~${h.maxDepthCm} cm</strong> (lực nước ${h.maxDv} m²/s) · Đoạn trũng ~${h.floodedLengthM} m · Độ cao thấp nhất ${h.minElevM} m${isFallback ? ' · <em>Đường nối thẳng</em>' : ''}.`;

    document.getElementById('route-compare-cards').innerHTML = `
      <article class="route-option-card ${!recommendAlt ? 'is-recommended' : ''}">
        <span class="source-tag ${dRisk > 0 || directHydro.maxDepthCm >= 16 ? 'tone-community' : 'tone-verified'}">Tuyến ngắn nhất</span>
        <div class="route-metrics"><span>${cmp.directSummary.distanceKm} km</span><span>~${cmp.directSummary.durationMin} phút</span></div>
        ${passBadge(directHydro)}
        <p class="muted-body">
          ${formatRouteStatsLine(dRisk, directHydro, direct.isStraightLineFallback)}
        </p>
      </article>
      <article class="route-option-card ${recommendAlt ? 'is-recommended' : ''}">
        <span class="source-tag ${recommendAlt ? 'tone-verified' : 'tone-model'}">${recommendAlt ? 'Tuyến nền cao (Đề xuất)' : 'Tuyến vòng tham khảo'}</span>
        <div class="route-metrics"><span>${cmp.detourSummary.distanceKm} km</span><span>~${cmp.detourSummary.durationMin} phút</span></div>
        ${passBadge(bestAlt.hydro)}
        <p class="muted-body">
          ${formatRouteStatsLine(aRisk, bestAlt.hydro, bestAlt.geom.isStraightLineFallback)}
        </p>
      </article>
    `;
    document.getElementById('route-honesty-banner').textContent = cmp.cannotGuaranteeSafeNotice;

    const profMount = document.getElementById('route-hydro-profile-svg');
    if (profMount) {
      profMount.innerHTML = renderRouteHydroProfileSvg(directHydro, bestAlt.hydro);
    }

    if (typeof window.L !== 'undefined') {
      const directCoords = direct.coordsLngLat.map(([ln, la]) => [la, ln]);
      const altCoords = bestAlt.geom.coordsLngLat.map(([ln, la]) => [la, ln]);

      if (!routeMap) {
        routeMap = window.L.map('route-mini-map').setView([start.lat, start.lng], 13);
        window.L.tileLayer(BASEMAP_PROVIDERS.osm.url, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(routeMap);
        routeLinesLayer = window.L.layerGroup().addTo(routeMap);
      }
      routeLinesLayer.clearLayers();
      const l1 = window.L.polyline(directCoords, { color: dRisk > 0 || directHydro.maxDepthCm >= 16 ? '#DC2626' : '#64748B', weight: 4.5, dashArray: '7 5' }).addTo(routeLinesLayer);
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
  const rawLoc = (document.getElementById('rep-location-name')?.value || '').trim();
  const locName = rawLoc.length >= 3 ? rawLoc : resolveAutoLocationLabel(state.reportPin.lat, state.reportPin.lng);
  const consent = document.getElementById('rep-consent')?.checked;
  const category = document.querySelector('input[name="repCategory"]:checked')?.value || 'flood';
  const waterScale = document.getElementById('rep-water-scale')?.value || 'half_wheel';
  const repChips = [...document.querySelectorAll('.js-rep-chip.is-active')].map((b) => b.dataset.text).filter(Boolean);
  const rawNotes = (document.getElementById('rep-notes')?.value || '').trim();
  const notes = [...repChips, rawNotes].filter(Boolean).join(' · ');

  if (!consent) {
    fb.hidden = false;
    fb.className = 'form-feedback is-error';
    fb.textContent = 'Vui lòng giữ chọn ô xác nhận thông tin trung thực.';
    return;
  }

  let turnstileToken = '';
  if (typeof window.turnstile?.getResponse === 'function' && appSafetyState.repTurnstileWidgetId != null) {
    turnstileToken = window.turnstile.getResponse(appSafetyState.repTurnstileWidgetId) || '';
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
    reporterRole: 'Cư dân đóng góp',
    turnstileToken
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
      if (typeof window.turnstile?.reset === 'function' && appSafetyState.repTurnstileWidgetId != null) {
        window.turnstile.reset(appSafetyState.repTurnstileWidgetId);
      }
      return;
    }
    fb.hidden = false;
    fb.className = 'form-feedback is-ok';
    fb.textContent = 'Đã tiếp nhận phản ánh! Điểm mới hiển thị trong vùng khoanh với nhãn “Phản ánh cộng đồng (chờ kiểm chứng)”.';
    document.getElementById('national-report-form').reset();
    if (typeof window.turnstile?.reset === 'function' && appSafetyState.repTurnstileWidgetId != null) {
      window.turnstile.reset(appSafetyState.repTurnstileWidgetId);
    }
    document.querySelectorAll('.js-rep-chip.is-active').forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-pressed', 'false');
    });
    const locInp = document.getElementById('rep-location-name');
    if (locInp) locInp.value = resolveAutoLocationLabel(state.reportPin.lat, state.reportPin.lng);
    state.reportPhotoDataUrl = '';
    const vBox = document.getElementById('rep-ai-vision-box');
    if (vBox) vBox.hidden = true;
    const pSt = document.getElementById('rep-photo-status');
    if (pSt) pSt.hidden = true;
    refreshActiveZoneData({ flyMap: false });
  } catch {
    const queue = readJson(OFFLINE_QUEUE_KEY, []);
    queue.push(createOfflineReportQueueItem({ ...payload, queuedOffline: true, turnstileToken: '' }));
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
  const meta = getSelectedStudyProvinceMeta();
  const l0 = Number(document.getElementById('vn2k-l0')?.value) || lookupCentralMeridian(meta.province, meta.lng);
  const zw = Number(document.getElementById('vn2k-zone')?.value || 3);

  const shapeMetrics = state.draftStudyShapes.map((sh) => {
    if (sh.kind === 'polygon' && sh.coords.length >= 3) {
      const poly = computeVn2000MetricPolygonArea(sh.coords, l0, zw);
      return `Đa giác "${sh.name}": S = ${poly.areaHa} ha (${poly.areaM2.toLocaleString('vi-VN')} m², chu vi ${Math.round(poly.perimeterM)} m)`;
    }
    if (sh.coords.length >= 2) {
      const ln = computeVn2000MetricLength(sh.coords, l0, zw);
      return `Tuyến "${sh.name}": L = ${ln.lengthM.toLocaleString('vi-VN')} m (${ln.lengthKm} km)`;
    }
    return '';
  }).filter(Boolean);

  if (prev) {
    const shapeInfo = shapeMetrics.length > 0 ? ` · Đo phẳng VN-2000 (L0=${l0}°): ${shapeMetrics.join(' | ')}` : '';
    prev.textContent =
      state.draftStudyPoints.length > 0
        ? `Đã chuẩn bị ${state.draftStudyPoints.length} tọa độ${shapeInfo} sẵn sàng gửi kiểm định.`
        : 'Chưa có đối tượng nào được vẽ. Chọn Điểm / Tuyến / Vùng rồi chạm bản đồ hoặc nạp tệp GeoJSON.';
  }
  if (!studyMap || !studyDraftLayer) return;
  studyDraftLayer.clearLayers();
  studyZoneCircle = window.L.circle([meta.lat, meta.lng], {
    radius: meta.radiusKm * 1000,
    color: '#0F766E',
    weight: 2,
    dashArray: '6 5',
    fillOpacity: 0.05
  }).addTo(studyDraftLayer);

  for (const sh of state.draftStudyShapes) {
    if (sh.kind === 'polygon' && sh.coords.length >= 3) {
      const poly = computeVn2000MetricPolygonArea(sh.coords, l0, zw);
      window.L.polygon(sh.coords, { color: '#0284C7', weight: 2, fillColor: '#0EA5E9', fillOpacity: 0.2 })
        .bindTooltip(`${sh.name} · ${poly.areaHa} ha (${poly.areaM2.toLocaleString('vi-VN')} m²)`)
        .addTo(studyDraftLayer);
    } else if (sh.coords.length >= 2) {
      const ln = computeVn2000MetricLength(sh.coords, l0, zw);
      window.L.polyline(sh.coords, { color: '#DC2626', weight: 3.5 })
        .bindTooltip(`${sh.name} · ${ln.lengthM.toLocaleString('vi-VN')} m`)
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
  const l0 = Number(document.getElementById('vn2k-l0')?.value) || lookupCentralMeridian(meta.province, meta.lng);
  const zw = Number(document.getElementById('vn2k-zone')?.value || 3);
  const features = [
    ...state.draftStudyPoints.map((p) => ({
      type: 'Feature',
      properties: { name: p.name, category: p.category, province: meta.province, notes: p.notes },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
    })),
    ...state.draftStudyShapes
      .filter((s) => s.coords.length >= (s.kind === 'polygon' ? 3 : 2))
      .map((s) => {
        const metrics =
          s.kind === 'polygon'
            ? computeVn2000MetricPolygonArea(s.coords, l0, zw)
            : computeVn2000MetricLength(s.coords, l0, zw);
        return {
          type: 'Feature',
          properties: { name: s.name, category: s.category, province: meta.province, vn2000Metrics: metrics },
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
        };
      })
  ];
  downloadFile(
    JSON.stringify({ type: 'FeatureCollection', crs: 'EPSG:4326', vn2000CentralMeridian: l0, generatedAt: new Date().toISOString(), features }, null, 2),
    `vn-research-draft-${Date.now()}.geojson`,
    'application/geo+json;charset=utf-8'
  );
  showToast(`Đã tải xuống tệp .GeoJSON (${features.length} đối tượng kèm chỉ số VN-2000).`);
}

async function runVietnamElevationTransect() {
  const out = document.getElementById('vn-elevation-output');
  const meta = getSelectedStudyProvinceMeta();
  const drawnLine = [...state.draftStudyShapes].reverse().find((s) => s.kind === 'line' && s.coords.length >= 2);
  const steps = 24;
  const lats = [];
  const lngs = [];
  let transectTitle = `Lát cắt 4 km qua ${meta.province}`;

  if (drawnLine) {
    const first = drawnLine.coords[0];
    const last = drawnLine.coords[drawnLine.coords.length - 1];
    const l0 = Number(document.getElementById('vn2k-l0')?.value) || lookupCentralMeridian(meta.province, meta.lng);
    const lenObj = computeVn2000MetricLength(drawnLine.coords, l0, 3);
    transectTitle = `Mặt cắt theo tuyến vẽ (${lenObj.lengthM.toLocaleString('vi-VN')} m)`;
    for (let i = 0; i < steps; i++) {
      const f = i / (steps - 1);
      lats.push((first[0] + (last[0] - first[0]) * f).toFixed(5));
      lngs.push((first[1] + (last[1] - first[1]) * f).toFixed(5));
    }
  } else {
    for (let i = 0; i < steps; i++) {
      const frac = i / (steps - 1) - 0.5;
      lats.push((meta.lat + frac * 0.036).toFixed(5));
      lngs.push((meta.lng + frac * 0.036).toFixed(5));
    }
  }

  out.textContent = `Đang truy xuất ${steps} điểm cao độ Copernicus 30 m (${transectTitle})...`;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`);
    const data = await res.json();
    const elevs = Array.isArray(data?.elevation) ? data.elevation.map(Number) : [];
    if (elevs.length === 0) throw new Error('EMPTY');
    const minE = Math.min(...elevs);
    const maxE = Math.max(...elevs);
    const avgE = elevs.reduce((a, b) => a + b, 0) / elevs.length;
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
      <strong>${esc(transectTitle)}</strong>: Thấp nhất <strong class="mono-num">${minE.toFixed(1)} m</strong> · TB <strong class="mono-num">${avgE.toFixed(1)} m</strong> · Cao nhất <strong class="mono-num">${maxE.toFixed(1)} m</strong> (Chênh ${(maxE - minE).toFixed(1)} m).
      <svg viewBox="0 0 300 96" style="width:100%;max-height:118px;display:block;margin-top:8px;background:#FFFFFF;border-radius:6px;border:1px solid #CBD5E1;">
        <line x1="14" y1="22" x2="286" y2="22" stroke="#E2E8F0" stroke-dasharray="3 3" />
        <line x1="14" y1="52" x2="286" y2="52" stroke="#E2E8F0" stroke-dasharray="3 3" />
        <line x1="14" y1="84" x2="286" y2="84" stroke="#CBD5E1" />
        <polygon fill="rgba(15, 118, 110, 0.14)" points="${areaSvg}" />
        <polyline fill="none" stroke="#0F766E" stroke-width="2.2" points="${ptsSvg}" />
      </svg>
      <span class="field-hint">Nguồn: ESA Copernicus GLO-30 (${steps} điểm mẫu) — mô hình bề mặt tham chiếu.</span>
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

async function loadLiveBasinBulletins(forceRefresh = false) {
  const grid = document.getElementById('live-basin-cards-grid');
  const meta = document.getElementById('live-basin-sync-meta');
  if (!grid) return;
  try {
    const res = await fetch(`/api/alert-hub?action=live_bulletins${forceRefresh ? '&refresh=1' : ''}`);
    const data = await res.json();
    if (!res.ok || !data?.ok || !Array.isArray(data.basins)) throw new Error('FEED_ERR');
    if (meta) {
      const warnBasinCnt = Number(
        data.warningBasinsCount ?? data.basins.filter((b) => b.alertLevel === 'emergency' || b.alertLevel === 'warning').length
      );
      const watchBasinCnt = Number(
        data.watchBasinsCount ?? data.basins.filter((b) => b.alertLevel === 'watch').length
      );
      const gdacsCnt = Array.isArray(data.gdacsAlerts) ? data.gdacsAlerts.length : 0;
      const summaryParts = [];
      if (warnBasinCnt > 0) summaryParts.push(`${warnBasinCnt} lưu vực Cảnh báo`);
      if (watchBasinCnt > 0) summaryParts.push(`${watchBasinCnt} lưu vực Theo dõi`);
      if (gdacsCnt > 0) summaryParts.push(`${gdacsCnt} cảnh báo GDACS`);
      const summaryTxt = summaryParts.length > 0 ? summaryParts.join(' · ') : '7 lưu vực ổn định';
      meta.textContent = `Cập nhật lúc ${formatTimeHm(data.syncedAt)} · ${summaryTxt} · Nguồn Open-Meteo & Flood API`;
    }
    const basinCards = data.basins
      .map((b) => {
        const toneCls = b.alertLevel === 'emergency' ? 'tone-danger' : b.alertLevel === 'warning' || b.alertLevel === 'watch' ? 'tone-community' : 'tone-verified';
        const ratioNote = Number(b.dischargeRatio) >= 1.15 ? ` (×${b.dischargeRatio} TB tuần)` : '';
        const reasonLine = b.alertReason && b.alertLevel !== 'normal'
          ? `<div class="basin-reason-note">${esc(b.alertReason)}</div>`
          : '';
        return `<div class="basin-feed-item">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
              <strong style="font-size:0.84rem;">${esc(b.basinName)}</strong>
              <span class="source-tag ${toneCls}">${esc(b.alertLabel)}</span>
            </div>
            <div class="muted-meta" style="margin-bottom:6px;">${esc(b.province)} · Mưa 24h: <strong class="mono-num">${b.rain24hMm} mm</strong> · Gió giật: <strong class="mono-num">${b.windGustKmh} km/h</strong>${b.riverDischargeMs != null ? ` · Lưu lượng: <strong class="mono-num">${b.riverDischargeMs} m³/s</strong>${esc(ratioNote)}` : ' · Dữ liệu lưu lượng đang đồng bộ'}</div>
            ${reasonLine}
          </div>
          <button type="button" class="btn btn-sm btn-secondary js-open-pub-zone" data-lat="${b.lat}" data-lng="${b.lng}" data-radius="8" data-name="${esc(b.province)}">Xem trên Bản đồ</button>
        </div>`;
      })
      .join('');
    const gdacsCards = (data.gdacsAlerts || [])
      .map(
        (g) => `<div class="basin-feed-item is-gdacs">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;">
            <strong style="font-size:0.84rem;color:#9F1239;">GDACS: ${esc(g.eventType)}</strong>
            <span class="source-tag tone-danger">${esc(g.alertLevel)}</span>
          </div>
          <div class="muted-meta" style="margin-bottom:8px;">${esc(g.name)}</div>
          <button type="button" class="btn btn-sm btn-secondary js-open-pub-zone" data-lat="${g.lat}" data-lng="${g.lng}" data-radius="12" data-name="Cảnh báo GDACS">Mở vị trí</button>
        </div>`
      )
      .join('');
    grid.innerHTML = basinCards + gdacsCards;
  } catch {
    grid.innerHTML = `<p class="muted-body">Chưa đồng bộ được số liệu trực tuyến lúc này. Vui lòng thử bấm Làm mới lại sau.</p>`;
  }
}

document.getElementById('btn-refresh-basin-feed')?.addEventListener('click', () => loadLiveBasinBulletins(true));

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
  out.innerHTML = `<p class="muted-body">Đang tổng hợp dữ liệu đa nguồn vùng ${esc(state.zone.name)}...</p>`;

  const zoneContext = {
    zone: state.zone,
    weather: state.weather,
    hourlyForecast: state.hourlyForecast,
    riverDischarge: state.riverDischarge,
    aqi: state.aqi,
    demStats: state.hydroSim.demGrid?.stats || null,
    vnZoneIntel: state.vnZoneIntel,
    zonePoints: state.zonePoints.slice(0, 60).map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      layerGroup: p.layerGroup,
      category: p.category,
      distanceMeters: p.distanceMeters,
      elevationM: p.elevationM,
      notes: (p.notes || '').slice(0, 120)
    })),
    zoneCorridors: state.zoneCorridors.slice(0, 8)
  };

  const renderAssistantOutput = (answerText, metrics, refs, badgeLabel, badgeTone) => {
    const cleanText = sanitizeCitizenJargon(answerText).replace(/\bDEM\s*[\d–\-.,]+\s*m\b/gi, 'vùng trũng thấp');
    const metricsHtml = metrics
      ? `<div class="ai-metrics-strip">
           <div class="ai-metric-chip"><span>Đỉnh mưa 24h</span><strong>${metrics.rainPeak24hMm ?? 0} mm/h</strong></div>
           <div class="ai-metric-chip"><span>Lưu lượng sông</span><strong>${metrics.riverDischargeMs != null ? `${metrics.riverDischargeMs} m³/s` : '--'}</strong></div>
           <div class="ai-metric-chip"><span>Tích số D×V trũng</span><strong>${metrics.dvProduct ?? 0} m²/s</strong></div>
           <div class="ai-metric-chip"><span>Điểm trong vùng</span><strong>${metrics.riskCount ?? 0} rủi ro · ${metrics.safeCount ?? 0} y tế</strong></div>
         </div>`
      : '';
    const refsHtml =
      Array.isArray(refs) && refs.length
        ? `<div class="ai-ref-pills">
             ${refs
               .map(
                 (r) =>
                   `<button type="button" class="checkin-btn is-locate js-ai-jump-pt" data-lat="${r.lat}" data-lng="${r.lng}" data-ptid="${esc(r.id)}">${esc(r.name)} (${esc(formatDistancePlain(r.distanceMeters))})</button>`
               )
               .join('')}
           </div>`
        : '';
    out.innerHTML = `
      <span class="source-tag ${badgeTone}">${esc(badgeLabel)}</span>
      ${metricsHtml}
      <div class="assistant-answer-text">${esc(cleanText)}</div>
      ${refsHtml}
      <p class="honesty-note">Trợ lý chỉ diễn giải từ dữ liệu đa nguồn hiện có, không thay thế cảnh báo chính thức của cơ quan KTTV/PCTT.</p>
    `;
  };

  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const res = await fetch('/api/ai-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ask_copilot', question: q, zoneContext, liveWeather: state.weather, liveAqi: state.aqi })
    });
    const data = await res.json();
    if (res.ok && data?.ok && data.answer) {
      const badgeLbl = data.mode === 'cloud_llm' ? `AI Tổng hợp Đám mây (${data.modelUsed})` : `Tổng hợp Đa nguồn (${state.zone.province})`;
      renderAssistantOutput(data.answer, data.metrics, data.referencedPoints, badgeLbl, 'tone-verified');
      return;
    }
    throw new Error('FALLBACK');
  } catch {
    const brief = buildNationalGroundedBrief({ question: q, ...zoneContext });
    const legacyFallback = synthesizeSituationalAnswer(q, state.zonePoints, state.weather);
    const mergedText = brief?.answerText || [legacyFallback?.headline, ...(legacyFallback?.bullets || [])].filter(Boolean).join('\n');
    renderAssistantOutput(mergedText, brief?.metrics, brief?.referencedPoints, `Tổng hợp Cục bộ (${state.zone.province})`, 'tone-model');
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
  document.getElementById('btn-export-zone-dossier')?.addEventListener('click', exportActiveZoneDossier);
  document.getElementById('btn-share-zone-link')?.addEventListener('click', async () => {
    const url = buildShareableZoneUrl();
    try {
      if (navigator.share) {
        await navigator.share({ title: `VN Resilience: ${state.zone.name}`, url });
        return;
      }
      await navigator.clipboard?.writeText(url);
      showToast('Đã sao chép đường dẫn mở thẳng vùng đang khoanh!');
    } catch {
      showToast(url);
    }
  });
  document.getElementById('btn-share-zone-png')?.addEventListener('click', exportZoneZaloPngCard);

  document.getElementById('btn-safe-route-home')?.addEventListener('click', () => {
    const saved = readJson(MY_PLACES_KEY, { home: null, work: null, school: null });
    if (!saved?.home) {
      showToast('Hãy bấm "+ Ghim Nhà" ở vùng bạn sinh sống trước.');
      return;
    }
    switchPublicTab('route');
    document.getElementById('route-end-input').value = `${Number(saved.home.lat).toFixed(5)}, ${Number(saved.home.lng).toFixed(5)}`;
    const fallbackStart = `${Number(state.zone.lat).toFixed(5)}, ${Number(state.zone.lng).toFixed(5)}`;
    if (!('geolocation' in navigator)) {
      document.getElementById('route-start-input').value = fallbackStart;
      runNationalRouteComparison();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: ln } = pos.coords;
        document.getElementById('route-start-input').value = isInsideVietnam(la, ln) ? `${la.toFixed(5)}, ${ln.toFixed(5)}` : fallbackStart;
        runNationalRouteComparison();
      },
      () => {
        document.getElementById('route-start-input').value = fallbackStart;
        runNationalRouteComparison();
      },
      { timeout: 2500 }
    );
  });

  const hourlyBarsEl = document.getElementById('hourly-rain-bars');
  const activateHourlyScrub = (col) => {
    if (!col || col.dataset.mm == null) return;
    const mm = Number(col.dataset.mm);
    const idx = Number(col.dataset.hourIdx || 0);
    const prob = Number(col.dataset.prob || 0);
    document.querySelectorAll('#hourly-rain-bars .hourly-bar-col').forEach((el) => el.classList.toggle('is-selected-hour', el === col));
    const simMm = mm > 0 ? Math.min(200, Math.max(15, Math.round(mm * 4.2))) : 0;
    state.hydroSim.rainMm = simMm;
    state.hydroSim.preset = 'custom';
    document.querySelectorAll('[data-rain-preset]').forEach((b) => b.classList.remove('is-active'));
    const sl = document.getElementById('hydro-rain-slider');
    const lb = document.getElementById('hydro-rain-label');
    if (sl) sl.value = String(simMm);
    if (lb) lb.textContent = `${simMm} mm`;
    const hintEl = document.getElementById('hourly-scrub-hint');
    if (hintEl) {
      hintEl.textContent = `Đang mô phỏng mặt phủ theo mốc +${idx}h: mưa ${mm.toFixed(1)} mm/h (XS ${prob}% → quy đổi kịch bản ${simMm} mm).`;
    }
    updateHydroSimModeBanner();
    hydroSurfaceLayer?.redraw();
    flowVectorsLayer?.redraw();
  };
  hourlyBarsEl?.addEventListener('click', (ev) => {
    const col = ev.target.closest('.hourly-bar-col[data-mm]');
    if (col) activateHourlyScrub(col);
  });
  hourlyBarsEl?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      const col = ev.target.closest('.hourly-bar-col[data-mm]');
      if (col) {
        ev.preventDefault();
        activateHourlyScrub(col);
      }
    }
  });
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

  // Thu gọn / mở rộng ngăn dữ liệu bên trái (Chế độ Toàn màn hình Bản đồ)
  document.getElementById('btn-toggle-dock')?.addEventListener('click', () => {
    const layout = document.getElementById('map-split-layout');
    const btn = document.getElementById('btn-toggle-dock');
    const lbl = document.getElementById('dock-toggle-label');
    if (!layout) return;
    const collapsed = layout.classList.toggle('is-dock-collapsed');
    btn?.setAttribute('aria-expanded', String(!collapsed));
    if (lbl) lbl.textContent = collapsed ? 'Mở bảng dữ liệu' : 'Thu gọn';
    setTimeout(() => {
      nationalMap?.invalidateSize();
      hydroSurfaceLayer?.redraw();
      flowVectorsLayer?.redraw();
    }, 220);
  });

  // Trình đơn Lớp chuyên đề nổi (Popover)
  const updateActiveLayersBadge = () => {
    const badge = document.getElementById('active-layers-count');
    if (!badge) return;
    const keys = Object.keys(state.layers);
    const activeCnt = keys.filter((k) => state.layers[k]).length;
    badge.textContent = `${activeCnt}/${keys.length}`;
  };
  updateActiveLayersBadge();

  document.getElementById('btn-toggle-layers-menu')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const pop = document.getElementById('map-layers-popover');
    const btn = document.getElementById('btn-toggle-layers-menu');
    if (!pop) return;
    const nextOpen = pop.hidden;
    pop.hidden = !nextOpen;
    btn?.setAttribute('aria-expanded', String(nextOpen));
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
      updateActiveLayersBadge();

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
      // Tự động bật Hành lang rủi ro khi người dùng chủ động thử kịch bản mưa >= 40mm
      if (mm >= 40 && !state.layers.corridors) {
        state.layers.corridors = true;
        const cBtn = document.querySelector('[data-map-layer="corridors"]');
        if (cBtn) {
          cBtn.classList.add('is-active');
          cBtn.setAttribute('aria-pressed', 'true');
        }
        updateActiveLayersBadge();
        renderZoneMapAndList({ flyMap: false });
      }
      updateHydroSimModeBanner();
      hydroSurfaceLayer?.redraw();
      flowVectorsLayer?.redraw();
    });
  });
  document.getElementById('btn-reset-live-rain')?.addEventListener('click', () => {
    document.querySelector('[data-rain-preset="live"]')?.click();
  });
  document.getElementById('hydro-rain-slider')?.addEventListener('input', (ev) => {
    const mm = Number(ev.target.value);
    state.hydroSim.rainMm = mm;
    state.hydroSim.preset = 'custom';
    document.querySelectorAll('[data-rain-preset]').forEach((b) => b.classList.remove('is-active'));
    const lb = document.getElementById('hydro-rain-label');
    if (lb) lb.textContent = `${mm} mm`;
    updateHydroSimModeBanner();
    hydroSurfaceLayer?.redraw();
    flowVectorsLayer?.redraw();
  });
  document.getElementById('hydro-opacity-slider')?.addEventListener('input', (ev) => {
    const pct = Number(ev.target.value);
    state.hydroSim.opacity = pct / 100;
    const lb = document.getElementById('hydro-opacity-label');
    if (lb) lb.textContent = `${pct}%`;
    hydroSurfaceLayer?.redraw();
  });
  document.getElementById('btn-toggle-flow-anim')?.addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    state.hydroSim.flowAnimated = !state.hydroSim.flowAnimated;
    btn.classList.toggle('is-active', state.hydroSim.flowAnimated);
    btn.setAttribute('aria-pressed', String(state.hydroSim.flowAnimated));
    btn.textContent = state.hydroSim.flowAnimated ? 'Dòng chảy động' : 'Tĩnh hướng chảy';
    flowVectorsLayer?.setAnimated(state.hydroSim.flowAnimated);
  });

  document.getElementById('btn-toggle-hydro-drawer')?.addEventListener('click', (ev) => {
    const strip = document.getElementById('hydro-sim-strip');
    if (!strip) return;
    const compact = strip.classList.toggle('is-compact');
    ev.currentTarget.setAttribute('aria-expanded', String(!compact));
    ev.currentTarget.textContent = compact ? 'Mức ▴' : 'Thu ▾';
  });

  const chartsDisc = document.getElementById('telemetry-charts-disclosure');
  chartsDisc?.addEventListener('toggle', () => {
    chartsDisc.dataset.userToggled = '1';
    if (chartsDisc.open) {
      setTimeout(() => renderRiverDischargeChart(), 30);
    }
  });

  document.addEventListener('click', (ev) => {
    const clickedActionItem = ev.target.closest('.action-popover-menu button');
    if (clickedActionItem) {
      clickedActionItem.closest('.action-popover')?.removeAttribute('open');
    }
    document.querySelectorAll('details.action-popover[open], details.inline-checkin-popover[open]').forEach((el) => {
      if (!el.contains(ev.target)) el.removeAttribute('open');
    });
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
    document.getElementById('btn-radar-play').textContent = 'Tạm dừng';
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
      const layout = document.getElementById('map-split-layout');
      if (layout) {
        layout.dataset.mobileMode = state.mapMobileMode;
        layout.dataset.sheet = state.mapMobileMode === 'list' ? 'half' : 'peek';
      }
      document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      setTimeout(() => {
        nationalMap?.invalidateSize();
        hydroSurfaceLayer?.redraw();
      }, 240);
    });
  });

  // Bottom Sheet 3 trạng thái (peek / half / full) trên Mobile — kéo mượt GPU translate3d theo ngón tay
  const dockEl = document.getElementById('workbench-left-dock');
  let sheetDragSuppressClickUntil = 0;

  const setMobileSheetState = (nextSheet) => {
    const layout = document.getElementById('map-split-layout');
    if (!layout) return;
    const clamped = ['peek', 'half', 'full'].includes(nextSheet) ? nextSheet : 'peek';
    if (dockEl) {
      dockEl.classList.remove('is-dragging');
      dockEl.style.transform = '';
    }
    layout.dataset.sheet = clamped;
    const isList = clamped !== 'peek';
    state.mapMobileMode = isList ? 'list' : 'map';
    layout.dataset.mobileMode = state.mapMobileMode;
    document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mapMode === state.mapMobileMode));
    if (window.innerWidth >= 1024) {
      setTimeout(() => {
        nationalMap?.invalidateSize();
        hydroSurfaceLayer?.redraw();
      }, 240);
    }
  };

  document.getElementById('btn-cycle-mobile-sheet')?.addEventListener('click', () => {
    if (performance.now() < sheetDragSuppressClickUntil) return;
    const cur = document.getElementById('map-split-layout')?.dataset.sheet || 'peek';
    const next = cur === 'peek' ? 'half' : cur === 'half' ? 'full' : 'peek';
    setMobileSheetState(next);
  });

  if (dockEl) {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startOffset = 0;
    let dockHeight = 0;
    let maxOffset = 0;
    let lastOffset = 0;
    let lastDy = 0;
    let isDragging = false;
    let touchLockedOut = false;
    let dragRafId = 0;

    dockEl.addEventListener(
      'touchstart',
      (ev) => {
        if (window.innerWidth >= 1024 || ev.touches.length !== 1) return;
        const tgt = ev.target;
        if (tgt?.closest?.('input, select, textarea, #vn-zone-suggestions, .leaflet-container')) {
          touchLockedOut = true;
          return;
        }
        const t = ev.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startTime = performance.now();
        isDragging = false;
        touchLockedOut = false;
        lastDy = 0;
        dockHeight = dockEl.clientHeight || Math.max(320, window.innerHeight - 130);
        maxOffset = Math.max(0, dockHeight - 118);
        const cur = document.getElementById('map-split-layout')?.dataset.sheet || 'peek';
        startOffset = cur === 'full' ? 0 : cur === 'half' ? Math.round(dockHeight * 0.48) : maxOffset;
        lastOffset = startOffset;
      },
      { passive: true }
    );

    dockEl.addEventListener(
      'touchmove',
      (ev) => {
        if (touchLockedOut || window.innerWidth >= 1024 || ev.touches.length !== 1) return;
        const t = ev.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (!isDragging) {
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
            touchLockedOut = true;
            return;
          }
          if (Math.abs(dy) < 6) return;
          const activePaneScroll = ev.target?.closest?.('.dock-scroll');
          const cur = document.getElementById('map-split-layout')?.dataset.sheet || 'peek';
          if (activePaneScroll && cur !== 'peek') {
            const atTop = activePaneScroll.scrollTop <= 1;
            if (!atTop || dy < 0) {
              touchLockedOut = true;
              return;
            }
          }
          isDragging = true;
          dockEl.classList.add('is-dragging');
        }
        if (ev.cancelable) ev.preventDefault();
        lastDy = dy;
        lastOffset = Math.max(0, Math.min(maxOffset, startOffset + dy));
        if (!dragRafId) {
          dragRafId = requestAnimationFrame(() => {
            dragRafId = 0;
            dockEl.style.transform = `translate3d(0, ${Math.round(lastOffset)}px, 0)`;
          });
        }
      },
      { passive: false }
    );

    const finishSheetDrag = () => {
      if (dragRafId) {
        cancelAnimationFrame(dragRafId);
        dragRafId = 0;
      }
      if (!isDragging) return;
      isDragging = false;
      sheetDragSuppressClickUntil = performance.now() + 140;
      const dt = Math.max(16, performance.now() - startTime);
      const vy = lastDy / dt;
      const halfOffset = Math.round(dockHeight * 0.48);
      const cur = document.getElementById('map-split-layout')?.dataset.sheet || 'peek';
      let next = cur;
      if (vy < -0.42) {
        next = vy < -0.95 || lastOffset < halfOffset * 0.6 ? 'full' : cur === 'peek' ? 'half' : 'full';
      } else if (vy > 0.42) {
        next = vy > 0.95 || lastOffset > (halfOffset + maxOffset) * 0.55 ? 'peek' : cur === 'full' ? 'half' : 'peek';
      } else {
        const dFull = Math.abs(lastOffset);
        const dHalf = Math.abs(lastOffset - halfOffset);
        const dPeek = Math.abs(lastOffset - maxOffset);
        next = dFull <= dHalf && dFull <= dPeek ? 'full' : dHalf <= dPeek ? 'half' : 'peek';
      }
      setMobileSheetState(next);
    };

    dockEl.addEventListener('touchend', finishSheetDrag, { passive: true });
    dockEl.addEventListener('touchcancel', finishSheetDrag, { passive: true });
  }

  // Nút nổi "Tìm tại vùng bản đồ này" (kiểu Google Maps / Felt khi kéo bản đồ)
  document.getElementById('btn-search-this-area')?.addEventListener('click', () => {
    if (!nationalMap) return;
    const center = nationalMap.getCenter();
    if (!isInsideVietnam(center.lat, center.lng)) {
      showToast('Tâm bản đồ hiện nằm ngoài lãnh thổ Việt Nam.');
      return;
    }
    const near = findNearestVietnamZone(center.lat, center.lng);
    const radiusKm = Number(document.getElementById('vn-zone-radius')?.value || state.zone?.radiusKm || 2);
    selectZone(
      {
        id: 'pan-vn',
        name: near ? `Quanh ${near.name}` : 'Vùng bản đồ đang xem',
        province: near?.province || 'Việt Nam',
        macroRegion: near?.macroRegion || 'bac',
        lat: Number(center.lat.toFixed(5)),
        lng: Number(center.lng.toFixed(5)),
        hazards: near?.hazards || []
      },
      { radiusKm, flyMap: false }
    );
    showToast('Đã cập nhật dữ liệu tại vùng bản đồ đang xem.');
  });

  // Fallback đóng <dialog closedby="any"> khi bấm backdrop trên trình duyệt chưa hỗ trợ thuộc tính closedby
  if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
    document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isInside) dialog.close();
      });
    });
  }
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
    document.getElementById('route-start-input').value = `${Number(state.zone.lat).toFixed(5)}, ${Number(state.zone.lng).toFixed(5)}`;
  });
  document.getElementById('btn-route-use-gps')?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('Thiết bị không hỗ trợ định vị GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: ln } = pos.coords;
        if (!isInsideVietnam(la, ln)) {
          showToast('Tọa độ GPS nằm ngoài phạm vi Việt Nam.');
          return;
        }
        document.getElementById('route-start-input').value = `${la.toFixed(5)}, ${ln.toFixed(5)}`;
        showToast('Đã lấy vị trí GPS hiện tại làm điểm xuất phát.');
      },
      () => showToast('Không lấy được tín hiệu GPS — hãy dùng "Lấy tâm vùng" hoặc gõ tên đường.')
    );
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
    const lbl = resolveAutoLocationLabel(state.reportPin.lat, state.reportPin.lng);
    const inp = document.getElementById('rep-location-name');
    if (inp) inp.value = lbl;
    document.getElementById('rep-location-status').textContent = `Đã gắn vị trí tại ${lbl} (tự làm tròn ~20 m).`;
  });
  document.getElementById('btn-rep-use-gps')?.addEventListener('click', () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        state.reportPin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const lbl = resolveAutoLocationLabel(state.reportPin.lat, state.reportPin.lng);
        const inp = document.getElementById('rep-location-name');
        if (inp) inp.value = lbl;
        document.getElementById('rep-location-status').textContent = `Đã lấy GPS hiện tại · ${lbl} (tự làm tròn ~20 m).`;
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
          const lbl = resolveAutoLocationLabel(state.reportPin.lat, state.reportPin.lng);
          const inp = document.getElementById('rep-location-name');
          if (inp) inp.value = lbl;
          document.getElementById('rep-location-status').textContent = `Đã chọn điểm: ${lbl} (tự làm tròn ~20 m).`;
        });
      }
      setTimeout(() => reportMap.invalidateSize(), 60);
    }
  });
  document.querySelectorAll('.js-rep-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('is-active');
      btn.classList.toggle('is-active', next);
      btn.setAttribute('aria-pressed', String(next));
    });
  });
  document.getElementById('rep-photo')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    const st = document.getElementById('rep-photo-status');
    const vBox = document.getElementById('rep-ai-vision-box');
    if (!file) return;
    try {
      state.reportPhotoDataUrl = await stripExifClientSide(file);
      st.hidden = false;
      st.textContent = 'Đã xóa sạch EXIF/GPS ẩn và nén ảnh an toàn.';
      if (vBox && navigator.onLine) {
        vBox.hidden = false;
        vBox.className = 'ai-vision-preview';
        vBox.textContent = 'AI Vision đang đọc hiện trường ảnh...';
        try {
          const cat = document.querySelector('input[name="repCategory"]:checked')?.value || 'flood';
          const vr = await fetch('/api/ai-copilot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'inspect_photo', photoDataUrl: state.reportPhotoDataUrl, category: cat })
          });
          const vj = await vr.json();
          const vis = vj?.vision;
          if (vr.ok && vj?.ok && vis) {
            vBox.className = `ai-vision-preview ${vis.isValidScene ? '' : 'is-warning'}`.trim();
            vBox.innerHTML = `<strong>AI Vision (${esc(vj.modelUsed || 'Gemini')}):</strong> ${esc(vis.sceneSummary || 'Đã kiểm định ảnh.')}${
              vis.safetyNote ? `<br><span>${esc(vis.safetyNote)}</span>` : ''
            }`;
            const scaleEl = document.getElementById('rep-water-scale');
            if (scaleEl && vis.suggestedWaterScale && vis.suggestedWaterScale !== 'none') {
              scaleEl.value = vis.suggestedWaterScale;
            }
            if (vis.suggestedCategory) {
              const catRadio = document.querySelector(`input[name="repCategory"][value="${vis.suggestedCategory}"]`);
              if (catRadio) {
                catRadio.checked = true;
                document.querySelectorAll('.cat-tile').forEach((lbl) => lbl.classList.toggle('is-selected', lbl.contains(catRadio)));
              }
            }
            if (Array.isArray(vis.suggestedHazards) && vis.suggestedHazards.some((h) => h === 'open_drain_vortex' || h === 'uneven_pothole')) {
              const chip = document.querySelector('.js-rep-chip[data-text*="Mất nắp cống"]');
              if (chip && !chip.classList.contains('is-active')) {
                chip.classList.add('is-active');
                chip.setAttribute('aria-pressed', 'true');
              }
            }
          } else {
            vBox.hidden = true;
          }
        } catch {
          vBox.hidden = true;
        }
      }
    } catch (err) {
      st.hidden = false;
      st.textContent = err.message;
      if (vBox) vBox.hidden = true;
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
      const rawText = await file.text();
      let rawArr = [];
      if (/\.csv$/i.test(file.name) || (!rawText.trim().startsWith('{') && !rawText.trim().startsWith('['))) {
        const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
          const splitCsv = (line) =>
            line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
          const hdr = splitCsv(lines[0]).map((h) => h.toLowerCase());
          const col = (keys) => hdr.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
          const iN = col(['name', 'ten', 'title', 'dia diem']);
          const iLat = col(['lat', 'vi do', 'vido', 'y']);
          const iLng = col(['lng', 'lon', 'kinh do', 'kinhdo', 'x']);
          const iCat = col(['category', 'loai']);
          const iNote = col(['note', 'ghi chu']);
          for (const line of lines.slice(1, 201)) {
            const c = splitCsv(line);
            rawArr.push({
              name: c[iN >= 0 ? iN : 0],
              lat: Number(c[iLat >= 0 ? iLat : 1]),
              lng: Number(c[iLng >= 0 ? iLng : 2]),
              category: c[iCat] || 'flood',
              notes: c[iNote] || ''
            });
          }
        }
      } else {
        const parsed = JSON.parse(rawText);
        rawArr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.features) ? parsed.features : [];
      }
      let added = 0;
      let dupSkipped = 0;
      for (const f of rawArr.slice(0, 150)) {
        const lat = Number(f.lat ?? f.geometry?.coordinates?.[1]);
        const lng = Number(f.lng ?? f.geometry?.coordinates?.[0]);
        if (!isInsideVietnam(lat, lng)) continue;
        const dup =
          state.draftStudyPoints.some((p) => haversineMeters(lat, lng, Number(p.lat), Number(p.lng)) <= 50) ||
          state.zonePoints.some((p) => haversineMeters(lat, lng, Number(p.lat), Number(p.lng)) <= 50);
        if (dup) {
          dupSkipped++;
          continue;
        }
        state.draftStudyPoints.push({
          name: f.properties?.name || f.name || `Điểm khảo sát ${added + 1}`,
          lat,
          lng,
          category: f.properties?.category || f.category || 'flood',
          notes: f.properties?.notes || f.notes || ''
        });
        added++;
      }
      renderStudyDraftOverlay();
      showToast(`Đã nạp ${added} điểm mới hợp lệ${dupSkipped ? ` (bỏ qua ${dupSkipped} điểm trùng ≤ 50 m)` : ''}.`);
    } catch {
      showToast('Tệp không đúng định dạng GeoJSON hoặc CSV (name,lat,lng) hợp lệ.');
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
    if (!ev.target.closest('.hud-layers-dropdown')) {
      const pop = document.getElementById('map-layers-popover');
      const trig = document.getElementById('btn-toggle-layers-menu');
      if (pop && !pop.hidden) {
        pop.hidden = true;
        trig?.setAttribute('aria-expanded', 'false');
      }
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
      const osrmRoute = await fetchOsrm([[lat, lng], [sLat, sLng]], 'bike');
      const isFallback = !osrmRoute;
      const route = osrmRoute || {
        coordsLngLat: [[lng, lat], [sLng, sLat]],
        distanceKm: Math.round((haversineMeters(lat, lng, sLat, sLng) * 1.2) / 10) / 100,
        durationMin: Math.max(2, Math.round(haversineMeters(lat, lng, sLat, sLng) / 280))
      };
      if (nationalMap && mainRouteLayer) {
        mainRouteLayer.clearLayers();
        const latLngs = route.coordsLngLat.map(([ln, la]) => [la, ln]);
        const line = window.L.polyline(latLngs, { color: '#16A34A', weight: 5.5, dashArray: isFallback ? '6 5' : null, opacity: 0.92 }).addTo(mainRouteLayer);
        nationalMap.fitBounds(line.getBounds(), { padding: [36, 36], maxZoom: 16 });
      }
      if (extra) {
        extra.innerHTML = `<div class="spot-profile-box"><strong>Tuyến tiếp cận ${esc(sName)}:</strong> Quãng đường <strong>${route.distanceKm} km</strong> (~${route.durationMin} phút). ${isFallback ? '<em>Lưu ý: Máy chủ dẫn đường đang bận, tạm hiển thị hướng nối thẳng tham khảo.</em>' : 'Đã vẽ lộ trình màu xanh lá trên bản đồ.'}</div>`;
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

    const confirmBtn = ev.target.closest('.js-confirm-national-pt');
    if (confirmBtn) {
      try {
        const ptId = confirmBtn.dataset.ptid;
        const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'confirm_point',
            pointId: ptId,
            reporterRole: 'Người dân xác nhận trên bản đồ'
          })
        });
        const d = await res.json();
        if (res.ok && d?.ok) {
          const targetPt = state.zonePoints.find((p) => p.id === ptId);
          if (targetPt) targetPt.confirmCount = (Number(targetPt.confirmCount) || 1) + 1;
          renderPublicOverview({ flyMap: false });
          showToast(`Đã ghi nhận +1 xác nhận cho ${confirmBtn.dataset.ptname}.`);
        }
      } catch {
        showToast('Chưa gửi được lượt xác nhận +1 lúc này.');
      }
      return;
    }

    const pinSlotBtn = ev.target.closest('.js-pin-my-place');
    if (pinSlotBtn) {
      const slot = pinSlotBtn.dataset.slot;
      const saved = readJson(MY_PLACES_KEY, { home: null, work: null, school: null });
      saved[slot] = { name: state.zone.name, province: state.zone.province, lat: state.zone.lat, lng: state.zone.lng };
      writeJson(MY_PLACES_KEY, saved);
      renderMySavedPlaces();
      showToast(`Đã ghim "${state.zone.name}" riêng tư trên thiết bị của bạn.`);
      return;
    }
    const goSlotBtn = ev.target.closest('.js-go-my-place');
    if (goSlotBtn) {
      const saved = readJson(MY_PLACES_KEY, { home: null, work: null, school: null });
      const item = saved?.[goSlotBtn.dataset.slot];
      if (item) {
        selectZone({ id: `my-${goSlotBtn.dataset.slot}`, name: item.name, province: item.province || item.name, lat: item.lat, lng: item.lng }, { radiusKm: 2, flyMap: true });
      }
      return;
    }
    const clearSlotBtn = ev.target.closest('.js-clear-my-place');
    if (clearSlotBtn) {
      const saved = readJson(MY_PLACES_KEY, { home: null, work: null, school: null });
      saved[clearSlotBtn.dataset.slot] = null;
      writeJson(MY_PLACES_KEY, saved);
      renderMySavedPlaces();
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

    const aiJumpPt = ev.target.closest('.js-ai-jump-pt');
    if (aiJumpPt) {
      document.getElementById('assistant-dialog')?.close();
      switchPillar('public');
      switchPublicTab('overview');
      const pt = state.zonePoints.find((p) => p.id === aiJumpPt.dataset.ptid);
      const lat = Number(aiJumpPt.dataset.lat);
      const lng = Number(aiJumpPt.dataset.lng);
      if (nationalMap && Number.isFinite(lat) && Number.isFinite(lng)) {
        nationalMap.setView([lat, lng], 16);
      }
      if (pt) showSelectedPointCard(pt);
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

  bindSosAndAppEvents();
}

/* =========================================================================
   11. PHÂN HỆ APP: ĐĂNG NHẬP CÁ NHÂN / GOOGLE, SOS ZERO-TRUST & AI HỘ TỐNG THỰC CHỨNG
   ========================================================================= */
const appSafetyState = {
  citizenToken: localStorage.getItem(CITIZEN_TOKEN_KEY) || '',
  citizenProfile: null,
  myTickets: [],
  responderInbox: [],
  sosCoords: null,
  pendingAutoSubmitSos: false,
  deferredInstallPrompt: null,
  escortWatchId: null,
  lastSpeedKmh: 0,
  stationarySinceMs: null,
  kinematics: { prevSpeedKmh: null, currentSpeedKmh: null, stationarySeconds: 0 },
  telemetryHistory: []
};

function updateCitizenAuthUi() {
  const p = appSafetyState.citizenProfile;
  const topLbl = document.getElementById('topbar-account-label');
  const dot = document.getElementById('sos-auth-dot');
  const title = document.getElementById('sos-profile-title');
  const sub = document.getElementById('sos-profile-sub');
  const loginBtn = document.getElementById('btn-sos-open-login');
  const ekycBtn = document.getElementById('btn-open-volunteer-ekyc');
  const logoutBtn = document.getElementById('btn-sos-logout');
  const delBtn = document.getElementById('btn-sos-delete-account');

  if (p) {
    const tierNames = {
      citizen: 'Tài khoản Công dân',
      pending_responder: 'Công dân (Đang chờ duyệt Tình nguyện viên)',
      verified_responder: 'Tình nguyện viên Đã xác minh (0 đồng)',
      official_unit: 'Đội Xung kích Chính thức'
    };
    if (topLbl) topLbl.textContent = p.fullName.split(' ').slice(-2).join(' ');
    if (dot) dot.className = 'dot dot-green';
    if (title) title.textContent = `${p.fullName} · ${tierNames[p.trustTier] || p.trustTier}`;
    if (sub) sub.textContent = `${p.email} · Bảo vệ vị trí nền Geohash-6 đang bật (0 tọa độ lộ công khai).`;
    if (loginBtn) loginBtn.hidden = true;
    if (ekycBtn) ekycBtn.hidden = true;
    if (logoutBtn) logoutBtn.hidden = false;
    if (delBtn) delBtn.hidden = p.authProvider === 'official_registry';
  } else {
    if (topLbl) topLbl.textContent = 'Tài khoản';
    if (dot) dot.className = 'dot dot-amber';
    if (title) title.textContent = 'Chưa đăng nhập tài khoản cá nhân';
    if (sub) sub.textContent = 'Đăng nhập bằng tài khoản cá nhân hoặc Google để mở tính năng gửi SOS chống báo giả và nhận mã PIN bảo vệ 2 chiều.';
    if (loginBtn) loginBtn.hidden = false;
    if (ekycBtn) ekycBtn.hidden = true;
    if (logoutBtn) logoutBtn.hidden = true;
    if (delBtn) delBtn.hidden = true;
  }
}

async function syncCitizenSession() {
  if (!appSafetyState.citizenToken) {
    appSafetyState.citizenProfile = null;
    appSafetyState.myTickets = [];
    updateCitizenAuthUi();
    renderMySosTickets();
    renderResponderInbox();
    return;
  }
  try {
    const res = await fetch('/api/sos-dispatch?action=me', {
      headers: { Authorization: `Bearer ${appSafetyState.citizenToken}` }
    });
    const data = await res.json();
    if (res.ok && data?.ok) {
      appSafetyState.citizenProfile = data.profile;
      appSafetyState.myTickets = data.myTickets || [];
    } else {
      localStorage.removeItem(CITIZEN_TOKEN_KEY);
      appSafetyState.citizenToken = '';
      appSafetyState.citizenProfile = null;
      appSafetyState.myTickets = [];
    }
  } catch {
    // offline keep cached
  }
  updateCitizenAuthUi();
  renderMySosTickets();
  await loadResponderInboxIfVerified();
}

function playGentleSosAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.24);
    });
  } catch {
    // autoplay blocked before user gesture
  }
}

async function loadResponderInboxIfVerified() {
  const box = document.getElementById('responder-inbox-box');
  if (!box) return;
  const p = appSafetyState.citizenProfile;
  if (!p) {
    box.innerHTML = `<p class="muted-body">Đăng nhập tài khoản cá nhân để tự động nhận cảnh báo khi có người gặp nạn ở gần khu vực của bạn (làm mờ 300 m, khóa tối đa 2 người nhận).</p>`;
    return;
  }
  try {
    const { lat, lng } = appSafetyState.sosCoords || state.zone;
    const res = await fetch(`/api/sos-dispatch?action=responder_inbox&lat=${lat}&lng=${lng}`, {
      headers: { Authorization: `Bearer ${appSafetyState.citizenToken}` }
    });
    const data = await res.json();
    if (res.ok && data?.ok) {
      const nextTickets = data.tickets || [];
      const prevIds = new Set(appSafetyState.seenNearbyTicketIds || []);
      const freshOpen = nextTickets.filter((t) => !prevIds.has(t.id) && !(t.assignedSummary || []).some((r) => r.responderId === p.id));
      if (appSafetyState._inboxBooted && freshOpen.length > 0) {
        playGentleSosAlertChime();
        showToast(`Có yêu cầu hỗ trợ mới ở gần (${freshOpen[0].areaHint})!`);
      }
      appSafetyState._inboxBooted = true;
      appSafetyState.seenNearbyTicketIds = nextTickets.map((t) => t.id);
      appSafetyState.responderInbox = nextTickets;
      renderResponderInbox();
    } else {
      box.innerHTML = `<p class="muted-body">${esc(data?.error || 'Không tải được cảnh báo hỗ trợ gần đây.')}</p>`;
    }
  } catch {
    box.innerHTML = `<p class="muted-body">Đang ngoại tuyến.</p>`;
  }
}

function renderMySosTickets() {
  const box = document.getElementById('my-sos-tickets-box');
  if (!box) return;
  if (!appSafetyState.myTickets.length) {
    box.innerHTML = `<p class="muted-body">Bạn chưa có yêu cầu SOS nào đang mở.</p>`;
    return;
  }
  box.innerHTML = appSafetyState.myTickets
    .map((t) => {
      const active = !t.shreddedLocation;
      const respondersHtml = (t.assignedSummary || []).length
        ? t.assignedSummary
            .map(
              (r) => `
              <div class="field-status-note" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
                <span><strong>${esc(r.fullName)}</strong> (${esc(r.organization)}) · ${r.pinVerified ? 'Đã khớp PIN tại chỗ' : 'Đang di chuyển tới'}</span>
                ${
                  active
                    ? `<button type="button" class="checkin-btn js-report-sos-abuse" data-tid="${esc(t.id)}" data-rid="${esc(r.responderId)}">Báo lợi dụng / Đòi tiền</button>`
                    : ''
                }
              </div>`
            )
            .join('')
        : `<p class="field-hint">Đang phát tín hiệu tới Hệ thống Trung tâm &amp; mời đợt 1 trong ô lưới ${esc(t.coarseGeohash5)}...</p>`;

      return `
        <article class="place-card">
          <div class="place-card-top">
            <h3 class="place-card-title">${esc(t.categoryLabel)}</h3>
            <span class="source-tag ${active ? 'tone-community' : 'tone-verified'}">${
              t.status === 'locked_full'
                ? `Đã khóa đủ ${t.slotsFilled}/${t.maxResponders} chỗ (Chống tắc đường)`
                : t.shreddedLocation
                  ? 'Đã an toàn · Đã xóa trắng tọa độ'
                  : `${t.slotsFilled}/${t.maxResponders} người nhận`
            }</span>
          </div>
          <p class="place-card-desc">${esc(t.policyReason)}</p>
          ${
            active && t.safetyPin
              ? `<div style="margin:6px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                   <span class="pin-code-box">PIN: ${esc(t.safetyPin)}</span>
                   <span class="field-hint">Yêu cầu người tới hỗ trợ đọc đúng 4 số này trước khi tiếp nhận.</span>
                 </div>`
              : ''
          }
          ${respondersHtml}
          ${
            active
              ? `<div class="place-card-actions" style="margin-top:6px;">
                   <button type="button" class="btn btn-sm btn-primary js-resolve-sos" data-tid="${esc(t.id)}">Tôi đã an toàn (Xóa trắng tọa độ)</button>
                   <a href="tel:112" class="btn btn-sm btn-secondary">Gọi 112</a>
                 </div>`
              : ''
          }
        </article>`;
    })
    .join('');
}

function renderResponderInbox() {
  const box = document.getElementById('responder-inbox-box');
  if (!box) return;
  const p = appSafetyState.citizenProfile;
  if (!p) return;

  const list = appSafetyState.responderInbox || [];
  if (list.length === 0) {
    box.innerHTML = `<p class="muted-body">Hiện chưa có yêu cầu hỗ trợ nào gần bạn quanh khu vực này (chỉ hiện các ca ngập nông còn trống hạn ngạch).</p>`;
    return;
  }

  box.innerHTML = list
    .map((t) => {
      const mine = (t.assignedSummary || []).find((r) => r.responderId === p.id);
      return `
        <article class="place-card">
          <div class="place-card-top">
            <h3 class="place-card-title">${esc(t.categoryLabel)}</h3>
            <span class="place-card-dist">Còn ${t.slotsRemaining}/${t.maxResponders} chỗ</span>
          </div>
          <p class="place-card-desc">
            Khu vực ước lượng: <strong>${esc(t.areaHint)}</strong><br>
            ${
              t.locationUnlocked
                ? `<span style="color:var(--ok-ink);font-weight:600;">Đã mở khóa tọa độ phiên: ${t.exactLat.toFixed(5)}°N, ${t.exactLng.toFixed(5)}°E</span>`
                : `Vùng làm mờ bảo vệ quyền riêng tư (~${t.privacyRadiusM}m quanh ${t.fuzzyLat}°N, ${t.fuzzyLng}°E — chỉ mở tọa độ thật sau khi bấm nhận)`
            }
            ${t.note ? `<br>Ghi chú: ${esc(t.note)}` : ''}
          </p>
          <div class="place-card-actions" style="margin-top:6px;">
            ${
              !mine
                ? `<button type="button" class="btn btn-sm btn-primary js-claim-sos-slot" data-tid="${esc(t.id)}">Tôi ở gần — Tới giúp 0đ (Khóa 1/${t.maxResponders} chỗ)</button>`
                : !mine.pinVerified
                  ? `<input type="text" maxlength="4" class="text-input mono-num js-pin-input-${esc(t.id)}" style="width:94px;min-height:31px;padding:3px 8px;" placeholder="PIN 4 số">
                     <button type="button" class="btn btn-sm btn-primary js-verify-sos-pin" data-tid="${esc(t.id)}">Đối chiếu PIN</button>`
                  : `<span class="source-tag tone-verified">Đã xác thực PIN 2 chiều tại hiện trường</span>`
            }
          </div>
        </article>`;
    })
    .join('');
}

function runProactiveAiEvaluation(customOverride = null) {
  const coords = appSafetyState.sosCoords || state.zone;
  const demGrid = state.hydroSim.demGrid;
  const localElev = sampleAnyDemGrid(demGrid, coords.lat, coords.lng) ?? 11.5;
  const grad = computeTerrainGradient(demGrid, coords.lat, coords.lng);
  const stats = demGrid?.stats || { minM: 7, p50M: 13.5 };

  const nearFloodDist = state.zonePoints
    .filter((pt) => pt.layerGroup === 'risk' && pt.category === 'flood')
    .reduce((best, pt) => Math.min(best, haversineMeters(coords.lat, coords.lng, Number(pt.lat), Number(pt.lng))), 999);

  const rainHour = customOverride?.rainMmPerHour ?? (state.weather?.rainMm || 0);
  const rainDay = customOverride?.dailyRainMm ?? (state.weather?.dailyRainMm || 0);
  const elevUsed = customOverride?.elevM ?? localElev;

  const hydro = computeHydrodynamicInstability({
    elevM: elevUsed,
    medianElevM: stats.p50M ?? 13.5,
    minElevM: stats.minM ?? 7,
    slopeDeg: grad?.slopeDeg ?? 1.2,
    rainMmPerHour: rainHour,
    dailyRainMm: rainDay,
    nearFloodSpotMeters: customOverride?.nearFloodSpotMeters ?? nearFloodDist
  });

  const hasLiveGpsKinematics = Boolean(customOverride || appSafetyState.escortWatchId !== null) && Number.isFinite(appSafetyState.kinematics?.currentSpeedKmh);
  const rawKin = customOverride?.kinematics || appSafetyState.kinematics;
  const kin = hasLiveGpsKinematics
    ? rawKin
    : { prevSpeedKmh: 0, currentSpeedKmh: 0, stationarySeconds: 0 };
  const result = evaluateUserDistressProbability({
    hydro,
    slopeDeg: grad?.slopeDeg ?? 1.2,
    dailyRainMm: rainDay,
    apparentTempC: state.weather?.apparentTemp ?? 30,
    pm25: state.aqi?.pm25 ?? 24,
    kinematics: kin
  });

  const vEl = document.getElementById('ai-manning-v');
  const dEl = document.getElementById('ai-depth-est');
  const dvEl = document.getElementById('ai-dv-val');
  const stEl = document.getElementById('ai-stability-lbl');
  const kEl = document.getElementById('ai-kinematic-val');
  const dwEl = document.getElementById('ai-dwell-lbl');
  const prEl = document.getElementById('ai-distress-prob');
  const qcEl = document.getElementById('ai-qcvn-lbl');
  const hlEl = document.getElementById('ai-inference-headline');
  const dsEl = document.getElementById('ai-inference-desc');

  if (vEl) vEl.textContent = `${hydro.velocityMs.toFixed(2)} m/s`;
  if (dEl) dEl.textContent = `Độ sâu ước tính: ~${Math.round(hydro.depthM * 100)} cm`;
  if (dvEl) dvEl.textContent = `${hydro.dvProduct.toFixed(3)} m²/s`;
  if (stEl) {
    stEl.textContent =
      hydro.vehicleStability === 'critical_float_or_sweep'
        ? 'Nguy hiểm cuốn trôi (>0.35)'
        : hydro.vehicleStability === 'high_stall_risk'
          ? 'Dễ chết máy / trượt bánh'
          : 'Trong ngưỡng an toàn (<0.15)';
  }
  if (!hasLiveGpsKinematics) {
    if (kEl) kEl.textContent = 'Chưa bật GPS';
    if (dwEl) dwEl.textContent = 'Nhấn Bật GPS Hộ tống hoặc chạy thử kịch bản bên dưới';
    if (prEl) prEl.textContent = '--';
  } else {
    if (kEl) kEl.textContent = `${Number(kin.currentSpeedKmh).toFixed(0)} km/h`;
    if (dwEl) {
      dwEl.textContent =
        kin.stationarySeconds > 0
          ? `Đứng yên: ${Math.round(kin.stationarySeconds)} giây (trước đó ${Math.round(kin.prevSpeedKmh)} km/h)`
          : 'Di chuyển thông suốt';
    }
    if (prEl) prEl.textContent = `${result.probabilityPct}%`;
  }
  if (qcEl) {
    const ratioNum = Number(result.breakdown.qcvnAirRatio || 1);
    qcEl.textContent = result.breakdown.qcvnCompliant
      ? 'Không khí trong ngưỡng chuẩn QCVN'
      : `Không khí kém (bụi PM2.5 gấp ×${ratioNum} chuẩn)`;
  }
  if (hlEl) {
    hlEl.textContent = !hasLiveGpsKinematics
      ? 'Đang ở chế độ chờ — chưa theo dõi hành trình'
      : result.headline;
  }
  if (dsEl) {
    dsEl.textContent = !hasLiveGpsKinematics
      ? 'Chỉ số thời tiết và thủy lực bên trên lấy theo vị trí vùng đang xem. Khi bạn bật GPS Hộ tống, thiết bị mới bắt đầu đo tốc độ và phát hiện dừng kẹt cục bộ.'
      : result.explanation;
  }

  appSafetyState.telemetryHistory.push({
    probPct: result.probabilityPct,
    dvProduct: hydro.dvProduct,
    ts: Date.now()
  });
  if (appSafetyState.telemetryHistory.length > 18) {
    appSafetyState.telemetryHistory.shift();
  }
  renderAiEscortSparkline();

  if (result.triggerProactivePrompt) {
    const dlg = document.getElementById('proactive-safety-dialog');
    const reasonBox = document.getElementById('proactive-dlg-reason');
    if (reasonBox) {
      reasonBox.innerHTML = `<strong>${esc(result.headline)}</strong><br>${esc(result.explanation)}<br><span class="muted-meta">Cơ sở mô hình: Martínez-Gomariz et al. (2016) · Manning · Copernicus DEM 30m</span>`;
    }
    if (dlg && !dlg.open) dlg.showModal();
  }
}

function renderAiEscortSparkline() {
  const gaugeMount = document.getElementById('ai-risk-gauge-svg');
  const mount = document.getElementById('ai-escort-sparkline');
  const hist = appSafetyState.telemetryHistory;
  const padded = hist.length >= 2 ? hist : [{ probPct: hist[0]?.probPct ?? 8, dvProduct: 0 }, { probPct: hist[0]?.probPct ?? 8, dvProduct: 0 }];
  const lastPt = padded[padded.length - 1];
  const pct = Math.max(0, Math.min(100, Math.round(lastPt.probPct || 0)));
  const lineCol = pct >= 62 ? '#E11D48' : pct >= 35 ? '#D97706' : '#0F766E';

  if (gaugeMount) {
    const deg = -90 + (pct / 100) * 180;
    const statusTxt = pct >= 62 ? 'Nguy hiểm cao' : pct >= 35 ? 'Cần chú ý' : 'Ổn định';
    gaugeMount.innerHTML = `
      <svg viewBox="0 0 156 88" class="ai-gauge-svg" role="img" aria-label="Đồng hồ rủi ro AI ${pct}%">
        <path d="M 24 62 A 54 54 0 0 1 132 62" fill="none" stroke="#E2E8F0" stroke-width="9" stroke-linecap="round"/>
        <path d="M 24 62 A 54 54 0 0 1 54 14" fill="none" stroke="#0F766E" stroke-width="9" stroke-linecap="round"/>
        <path d="M 54 14 A 54 54 0 0 1 98 12" fill="none" stroke="#F59E0B" stroke-width="9"/>
        <path d="M 98 12 A 54 54 0 0 1 132 62" fill="none" stroke="#E11D48" stroke-width="9" stroke-linecap="round"/>
        <g style="transform: rotate(${deg}deg); transform-origin: 78px 62px; transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);">
          <polygon points="76,62 78,20 80,62" fill="#0B1324"/>
          <circle cx="78" cy="62" r="4.5" fill="${lineCol}" stroke="#FFFFFF" stroke-width="1.5"/>
        </g>
        <text x="78" y="50" text-anchor="middle" font-size="13" font-weight="800" fill="${lineCol}" class="mono-num">${pct}%</text>
        <text x="78" y="80" text-anchor="middle" font-size="10" font-weight="700" fill="${lineCol}">${statusTxt}</text>
      </svg>`;
  }

  if (!mount) return;
  if (typeof window !== 'undefined' && typeof window.Chart === 'function') {
    if (aiSparkChartInstance) {
      aiSparkChartInstance.destroy();
      aiSparkChartInstance = null;
    }
    mount.innerHTML = `<canvas id="ai-escort-canvas" role="img" aria-label="Biểu đồ động học xác suất rủi ro AI"></canvas>`;
    const cvs = document.getElementById('ai-escort-canvas');
    if (cvs) {
      const ctx = cvs.getContext('2d');
      const labels = padded.map((_, i) => `T-${padded.length - 1 - i}`);
      const grad = ctx.createLinearGradient(0, 0, 0, 68);
      grad.addColorStop(0, pct >= 62 ? 'rgba(225, 29, 72, 0.32)' : 'rgba(15, 118, 110, 0.25)');
      grad.addColorStop(1, 'rgba(15, 118, 110, 0.01)');
      aiSparkChartInstance = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Rủi ro AI (%)',
              data: padded.map((x) => x.probPct),
              borderColor: lineCol,
              backgroundColor: grad,
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: padded.map((_, i) => (i === padded.length - 1 ? 3.5 : 0)),
              pointBackgroundColor: lineCol
            },
            {
              label: 'Ngưỡng hỏi thăm (62%)',
              data: padded.map(() => 62),
              borderColor: 'rgba(225, 29, 72, 0.55)',
              borderWidth: 1.1,
              borderDash: [4, 3],
              fill: false,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              min: 0,
              max: 100,
              ticks: { stepSize: 50, font: { size: 9 }, color: '#64748B' },
              grid: { color: 'rgba(148, 163, 184, 0.16)', drawTicks: false },
              border: { display: false }
            }
          }
        }
      });
      return;
    }
  }

  const W = 320;
  const H = 56;
  const thresholdY = H - 8 - (62 / 100) * (H - 16);
  const pts = padded
    .map((item, idx) => {
      const x = 8 + (idx / Math.max(1, padded.length - 1)) * (W - 16);
      const y = H - 8 - (Math.min(100, Math.max(0, item.probPct)) / 100) * (H - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  mount.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Biểu đồ động học xác suất rủi ro AI">
      <line x1="8" y1="${thresholdY.toFixed(1)}" x2="${W - 8}" y2="${thresholdY.toFixed(1)}" stroke="#EF4444" stroke-width="1" stroke-dasharray="3 3" />
      <polygon fill="rgba(15, 118, 110, 0.1)" points="8,${H - 6} ${pts} ${W - 8},${H - 6}" />
      <polyline fill="none" stroke="${lineCol}" stroke-width="2.1" points="${pts}" />
      <text x="10" y="12" font-size="8.5" fill="#64748B">Ngưỡng hỏi thăm an toàn AI (62%)</text>
      <text x="${W - 10}" y="12" font-size="8.5" fill="${lineCol}" text-anchor="end">Hiện tại: ${lastPt.probPct}%</text>
    </svg>`;
}

function getCurrentOfflineSosSmsPayload() {
  const coords = appSafetyState.sosCoords || state.zone;
  const areaHint = (document.getElementById('sos-area-hint')?.value || '').trim() || resolveAutoLocationLabel(coords.lat, coords.lng);
  const activeTicket = appSafetyState.myTickets.find((t) => !t.shreddedLocation);
  return buildOfflineSosSmsPayload({
    category: document.getElementById('sos-category')?.value || 'stalled_vehicle',
    waterDepthM: Number(document.getElementById('sos-water-depth')?.value || 0.28),
    areaHint,
    lat: coords.lat,
    lng: coords.lng,
    safetyPin: activeTicket?.safetyPin || '',
    note: updateSosComposedPreview()
  });
}

function renderSosLiveMap() {
  if (typeof window.L === 'undefined') return;
  const mount = document.getElementById('sos-live-map');
  if (!mount || mount.offsetParent === null) return;
  const coords = appSafetyState.sosCoords || state.zone;
  const isTouchCompact = typeof window !== 'undefined' && window.innerWidth < 1024;

  if (!sosLiveMap) {
    sosLiveMap = window.L.map('sos-live-map', {
      zoomControl: false,
      preferCanvas: true,
      scrollWheelZoom: false,
      dragging: !isTouchCompact,
      touchZoom: !isTouchCompact,
      doubleClickZoom: !isTouchCompact
    }).setView([coords.lat, coords.lng], 15);
    window.L.tileLayer(BASEMAP_PROVIDERS.osm.url, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(sosLiveMap);
    sosLiveLayer = window.L.layerGroup().addTo(sosLiveMap);
  }
  sosLiveLayer.clearLayers();

  // Vòng tròn làm mờ quyền riêng tư 300 m (tooltip căn trên để không bị cắt lề trái)
  window.L.circle([coords.lat, coords.lng], {
    radius: 300,
    color: '#D97706',
    weight: 2,
    dashArray: '5 4',
    fillColor: '#F59E0B',
    fillOpacity: 0.14
  })
    .bindTooltip('Vùng ẩn danh 300 m', { direction: 'top', offset: [0, -8], className: 'vn-map-tooltip' })
    .addTo(sosLiveLayer);

  window.L.circleMarker([coords.lat, coords.lng], {
    radius: 7,
    color: '#FFFFFF',
    weight: 2.5,
    fillColor: '#E11D48',
    fillOpacity: 1
  })
    .bindTooltip('Vị trí cục bộ trên thiết bị của bạn')
    .addTo(sosLiveLayer);

  const safeNear = state.zonePoints
    .filter((p) => p.layerGroup === 'safe')
    .map((p) => ({ ...p, d: haversineMeters(coords.lat, coords.lng, Number(p.lat), Number(p.lng)) }))
    .sort((a, b) => a.d - b.d)[0];

  const capEl = document.getElementById('sos-map-caption');
  if (safeNear) {
    window.L.polyline(
      [
        [coords.lat, coords.lng],
        [Number(safeNear.lat), Number(safeNear.lng)]
      ],
      { color: '#16A34A', weight: 3.5, dashArray: '6 4' }
    ).addTo(sosLiveLayer);
    window.L.circleMarker([Number(safeNear.lat), Number(safeNear.lng)], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#16A34A',
      fillOpacity: 1
    })
      .bindTooltip(`${safeNear.name} (${formatDistancePlain(safeNear.d)})`)
      .addTo(sosLiveLayer);
    if (capEl) {
      capEl.textContent = `Vòng mờ 300 m đang bật. Nơi y tế / tránh trú gần nhất: ${safeNear.name} (${formatDistancePlain(safeNear.d)}).`;
    }
  } else if (capEl) {
    capEl.textContent = 'Vòng mờ 300 m đang bật bảo vệ riêng tư trước khi có Tình nguyện viên được cấp phép nhận ca.';
  }

  const smsLink = document.getElementById('btn-send-sos-sms-link');
  if (smsLink) {
    smsLink.href = getCurrentOfflineSosSmsPayload().smsHref;
  }

  setTimeout(() => {
    sosLiveMap?.invalidateSize();
    sosLiveMap?.setView([coords.lat, coords.lng], 15);
  }, 80);
}

async function refreshSosAndAiPillar() {
  const coords = appSafetyState.sosCoords || state.zone;
  const locLabel = resolveAutoLocationLabel(coords.lat, coords.lng);
  const locTextEl = document.getElementById('sos-auto-loc-text');
  const areaInp = document.getElementById('sos-area-hint');
  if (locTextEl) locTextEl.textContent = locLabel;
  if (areaInp) areaInp.value = locLabel;

  // Mặc định thông minh ban đêm (21h-06h): ưu tiên Đội chính thức nếu người dùng chưa tự chọn lại
  const hr = new Date().getHours();
  if ((hr >= 21 || hr < 6) && !appSafetyState._scopeTouched) {
    const scInp = document.getElementById('sos-dispatch-scope');
    if (scInp) scInp.value = 'official_only';
    document.querySelectorAll('.js-sos-scope').forEach((b) => {
      const act = b.dataset.val === 'official_only';
      b.classList.toggle('is-active', act);
      b.setAttribute('aria-pressed', String(act));
    });
  }

  runProactiveAiEvaluation();
  const sosDisc = document.getElementById('sos-privacy-map-disclosure');
  if (sosDisc && window.innerWidth >= 1024 && !sosDisc.dataset.userToggled) {
    sosDisc.open = true;
  }
  const sosOpt = document.querySelector('#pillar-sos .sos-optional-fields');
  if (sosOpt && window.innerWidth >= 1024 && !sosOpt.dataset.userToggled) {
    sosOpt.open = true;
  }
  renderSosLiveMap();
  try {
    const shRes = await fetch(`/api/sos-dispatch?action=zone_shield_summary&lat=${coords.lat}&lng=${coords.lng}`);
    const shJson = shRes.ok ? await shRes.json() : null;
    const cntEl = document.getElementById('sos-zone-squad-count');
    if (cntEl && shJson?.ok) cntEl.textContent = `${shJson.verifiedSquadsReadyCount}`;
  } catch {
    // ignore
  }
  await syncCitizenSession();
  renderSosLiveMap();
}

function updateSosComposedPreview() {
  const chips = [...document.querySelectorAll('.js-sos-chip.is-active')].map((b) => b.dataset.text).filter(Boolean);
  const manual = (document.getElementById('sos-note')?.value || '').trim();
  const prev = document.getElementById('sos-composed-preview');
  const combined = [...chips, manual].filter(Boolean).join(' · ');
  if (prev) {
    prev.textContent = combined
      ? `Tình trạng gửi đi: ${combined}`
      : 'Tình trạng gửi đi: Tự động theo thẻ tình huống bạn chạm (không bắt buộc chọn thêm).';
  }
  return combined;
}

async function submitSosNow() {
  const coords = appSafetyState.sosCoords || state.zone;
  const fb = document.getElementById('sos-form-feedback');
  const btn = document.getElementById('btn-submit-sos');
  const areaHint = (document.getElementById('sos-area-hint')?.value || '').trim() || resolveAutoLocationLabel(coords.lat, coords.lng);
  const composedNote = updateSosComposedPreview();
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appSafetyState.citizenToken}`
      },
      body: JSON.stringify({
        action: 'create_sos',
        lat: coords.lat,
        lng: coords.lng,
        category: document.getElementById('sos-category')?.value || 'stalled_vehicle',
        dispatchScope: document.getElementById('sos-dispatch-scope')?.value || 'verified_peers',
        waterDepthM: Number(document.getElementById('sos-water-depth')?.value || 0.28),
        areaHint,
        note: composedNote || 'Yêu cầu hỗ trợ khẩn cấp 1 chạm'
      })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      if (fb) {
        fb.hidden = false;
        fb.className = 'form-feedback is-error';
        fb.textContent = data?.error || 'Không gửi được tín hiệu SOS.';
      }
      return;
    }
    if (fb) {
      fb.hidden = false;
      fb.className = 'form-feedback is-ok';
      fb.textContent = `Đã phát tín hiệu ${data.ticket.id}! Mã PIN đối chiếu an toàn 2 chiều của bạn: ${data.ticket.safetyPin}.`;
    }
    showToast(`Đã gửi SOS (${data.ticket.id}) — PIN bảo vệ: ${data.ticket.safetyPin}`);
    await syncCitizenSession();
  } finally {
    if (btn) btn.disabled = false;
    appSafetyState.pendingAutoSubmitSos = false;
  }
}

function bindSosAndAppEvents() {
  // PWA Install Prompt chuẩn Mobile App
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    appSafetyState.deferredInstallPrompt = ev;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.hidden = false;
  });
  document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
    if (!appSafetyState.deferredInstallPrompt) return;
    appSafetyState.deferredInstallPrompt.prompt();
    await appSafetyState.deferredInstallPrompt.userChoice.catch(() => {});
    appSafetyState.deferredInstallPrompt = null;
    document.getElementById('btn-install-pwa').hidden = true;
  });

  // Hỗ trợ deep-link #sos từ PWA App Shortcut
  if (location.hash === '#sos') {
    setTimeout(() => switchPillar('sos'), 40);
  }

  const isProdPublicDomain =
    ['bando-antoan-vn.vercel.app', 'bando-cong-dong-dong-ngac.vercel.app'].includes(location.hostname) &&
    !new URLSearchParams(location.search).has('demo');
  if (isProdPublicDomain) {
    const sqBtn = document.getElementById('btn-sos-switch-squad');
    if (sqBtn) sqBtn.hidden = true;
  }

  const syncAuthModalProdMode = async () => {
    if (!isProdPublicDomain) return;
    if (typeof appSafetyState.googleClientIdConfigured !== 'boolean') {
      try {
        const h = await fetch('/api/sos-dispatch?action=health').then((r) => (r.ok ? r.json() : null));
        appSafetyState.googleClientIdConfigured = Boolean(h?.googleClientIdConfigured);
        appSafetyState.googleClientId = h?.googleClientId || '';
      } catch {
        appSafetyState.googleClientIdConfigured = false;
      }
    }
    const ggBox = document.getElementById('google-signin-box');
    const ggNote = document.getElementById('google-prod-oauth-note');
    const hasClientId = Boolean(appSafetyState.googleClientIdConfigured);
    if (ggBox) ggBox.hidden = !hasClientId;
    if (ggNote) ggNote.hidden = hasClientId;

    if (hasClientId) {
      const quickBtn = document.getElementById('btn-google-quick-auth');
      const customToggle = document.getElementById('btn-google-custom-toggle');
      const quickFields = document.getElementById('google-quick-fields');
      if (quickBtn) quickBtn.style.display = 'none';
      if (customToggle) customToggle.style.display = 'none';
      if (quickFields) quickFields.style.display = 'none';
    }
  };

  let regProofDataUrl = '';
  let modalEkycProofDataUrl = '';

  const openAuthModal = () => {
    if (appSafetyState.citizenProfile) {
      switchPillar('sos');
      return;
    }
    syncAuthModalProdMode();
    document.getElementById('citizen-auth-dialog')?.showModal();
    ensureGoogleGsiRendered();
  };
  document.getElementById('btn-open-account')?.addEventListener('click', openAuthModal);
  document.getElementById('btn-sos-open-login')?.addEventListener('click', () => {
    syncAuthModalProdMode();
    document.getElementById('citizen-auth-dialog')?.showModal();
    ensureGoogleGsiRendered();
  });

  // Chuyển nhanh chế độ SOS Khẩn vs AI Hộ tống & Quanh bạn trên điện thoại + lazy-mount bản đồ SOS
  const sosPanelEl = document.getElementById('pillar-sos');
  document.querySelectorAll('[data-sos-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.sosTab === 'escort' ? 'escort' : 'dispatch';
      if (sosPanelEl) sosPanelEl.dataset.sosTab = t;
      document.querySelectorAll('[data-sos-tab]').forEach((b) => {
        const act = b.dataset.sosTab === t;
        b.classList.toggle('is-active', act);
        b.setAttribute('aria-selected', String(act));
      });
    });
  });
  document.getElementById('sos-privacy-map-disclosure')?.addEventListener('toggle', (ev) => {
    ev.currentTarget.dataset.userToggled = '1';
    if (ev.currentTarget.open) renderSosLiveMap();
  });

  document.querySelectorAll('[data-czauth]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.czauth;
      document.querySelectorAll('[data-czauth]').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.getElementById('citizen-login-form').hidden = m !== 'login';
      document.getElementById('citizen-register-form').hidden = m !== 'register';
    });
  });

  const regVolCheck = document.getElementById('cz-reg-volunteer');
  const regEkycBox = document.getElementById('cz-reg-ekyc-fields');
  regVolCheck?.addEventListener('change', () => {
    if (regEkycBox) regEkycBox.hidden = !regVolCheck.checked;
  });

  document.getElementById('cz-reg-proof')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) {
      regProofDataUrl = '';
      return;
    }
    try {
      regProofDataUrl = await stripExifClientSide(file);
    } catch (err) {
      regProofDataUrl = '';
      showToast(err?.message || 'Không đọc được ảnh minh chứng.');
    }
  });

  document.getElementById('ekyc-proof')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) {
      modalEkycProofDataUrl = '';
      return;
    }
    try {
      modalEkycProofDataUrl = await stripExifClientSide(file);
    } catch (err) {
      modalEkycProofDataUrl = '';
      showToast(err?.message || 'Không đọc được ảnh minh chứng.');
    }
  });

  document.getElementById('btn-google-custom-toggle')?.addEventListener('click', () => {
    const box = document.getElementById('google-quick-fields');
    if (box) box.hidden = !box.hidden;
  });

  const executeQuickGoogleSignIn = async (customName, customEmail) => {
    let profile = readJson('vn_resilience_quick_gg_v1', null);
    if (!profile || !profile.email) {
      const tag = Math.floor(1000 + Math.random() * 9000);
      profile = { fullName: `Người dùng Di động ${tag}`, email: `sos.citizen.${tag}@gmail.com` };
      writeJson('vn_resilience_quick_gg_v1', profile);
    }
    const fullName = customName || profile.fullName;
    const email = customEmail || profile.email;
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'google_auth', quickGoogleProfile: { fullName, email } })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      showToast(data?.error || 'Không thể đăng nhập bằng Google.');
      return;
    }
    localStorage.setItem(CITIZEN_TOKEN_KEY, data.token);
    appSafetyState.citizenToken = data.token;
    document.getElementById('citizen-auth-dialog')?.close();
    await syncCitizenSession();
    showToast(`Xin chào ${data.profile.fullName}! Đã kích hoạt bảo vệ vị trí ẩn danh.`);
    if (appSafetyState.pendingAutoSubmitSos) {
      await submitSosNow();
    }
  };

  document.getElementById('btn-google-quick-auth')?.addEventListener('click', () => {
    executeQuickGoogleSignIn('', '');
  });

  document.getElementById('btn-google-quick-confirm')?.addEventListener('click', async () => {
    const fullName = document.getElementById('gg-quick-name')?.value.trim();
    const email = document.getElementById('gg-quick-email')?.value.trim();
    await executeQuickGoogleSignIn(fullName, email);
  });

  document.getElementById('citizen-login-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fb = document.getElementById('cz-auth-feedback');
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login_citizen',
        email: document.getElementById('cz-login-email')?.value,
        password: document.getElementById('cz-login-pass')?.value
      })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      fb.hidden = false;
      fb.className = 'form-feedback is-error';
      fb.textContent = data?.error || 'Đăng nhập thất bại.';
      return;
    }
    fb.hidden = true;
    localStorage.setItem(CITIZEN_TOKEN_KEY, data.token);
    appSafetyState.citizenToken = data.token;
    document.getElementById('citizen-auth-dialog')?.close();
    await syncCitizenSession();
    showToast(`Đã đăng nhập: ${data.profile.fullName}`);
    if (appSafetyState.pendingAutoSubmitSos) await submitSosNow();
  });

  document.getElementById('citizen-register-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const regFb = document.getElementById('cz-reg-feedback');
    const wantsVol = Boolean(document.getElementById('cz-reg-volunteer')?.checked);
    const phone = document.getElementById('cz-reg-phone')?.value.trim() || '';
    const idLast4 = document.getElementById('cz-reg-id4')?.value.trim() || '';
    const organization = document.getElementById('cz-reg-org')?.value.trim() || '';
    const pledgedZeroFee = Boolean(document.getElementById('cz-reg-pledge')?.checked);

    if (wantsVol && (phone.replace(/\D/g, '').length < 8 || idLast4.replace(/\D/g, '').length !== 4 || !pledgedZeroFee)) {
      if (regFb) {
        regFb.hidden = false;
        regFb.className = 'form-feedback is-error';
        regFb.textContent = 'Đăng ký Tình nguyện viên cần nhập đủ SĐT, 4 số cuối CCCD và tích cam kết 0 đồng.';
      }
      return;
    }
    if (regFb) regFb.hidden = true;

    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register_citizen',
        fullName: document.getElementById('cz-reg-name')?.value,
        email: document.getElementById('cz-reg-email')?.value,
        password: document.getElementById('cz-reg-pass')?.value,
        requestResponderVetting: wantsVol,
        phone,
        idLast4,
        organization,
        pledgedZeroFee,
        proofDataUrl: wantsVol ? regProofDataUrl : ''
      })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      if (regFb) {
        regFb.hidden = false;
        regFb.className = 'form-feedback is-error';
        regFb.textContent = data?.error || 'Không tạo được tài khoản.';
      }
      showToast(data?.error || 'Không tạo được tài khoản.');
      return;
    }
    regProofDataUrl = '';
    localStorage.setItem(CITIZEN_TOKEN_KEY, data.token);
    appSafetyState.citizenToken = data.token;
    document.getElementById('citizen-auth-dialog')?.close();
    await syncCitizenSession();
    showToast(
      wantsVol
        ? 'Đã tạo tài khoản và gửi hồ sơ eKYC Tình nguyện viên chờ thẩm định!'
        : 'Đã tạo tài khoản cá nhân và đăng nhập thành công!'
    );
    if (appSafetyState.pendingAutoSubmitSos) await submitSosNow();
  });

  document.getElementById('btn-open-volunteer-ekyc')?.addEventListener('click', () => {
    const orgInput = document.getElementById('ekyc-org');
    if (orgInput && appSafetyState.citizenProfile?.organization && !orgInput.value) {
      orgInput.value = appSafetyState.citizenProfile.organization;
    }
    const phoneInput = document.getElementById('ekyc-phone');
    if (phoneInput && appSafetyState.citizenProfile?.ekyc?.phone && !phoneInput.value) {
      phoneInput.value = appSafetyState.citizenProfile.ekyc.phone;
    }
    document.getElementById('volunteer-ekyc-dialog')?.showModal();
  });

  document.getElementById('volunteer-ekyc-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fb = document.getElementById('ekyc-feedback');
    if (!appSafetyState.citizenToken) return;
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appSafetyState.citizenToken}`
      },
      body: JSON.stringify({
        action: 'submit_volunteer_ekyc',
        phone: document.getElementById('ekyc-phone')?.value.trim(),
        idLast4: document.getElementById('ekyc-id4')?.value.trim(),
        organization: document.getElementById('ekyc-org')?.value.trim(),
        roleNote: document.getElementById('ekyc-note')?.value.trim(),
        pledgedZeroFee: Boolean(document.getElementById('ekyc-pledge')?.checked),
        proofDataUrl: modalEkycProofDataUrl
      })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      if (fb) {
        fb.hidden = false;
        fb.className = 'form-feedback is-error';
        fb.textContent = data?.error || 'Không gửi được hồ sơ eKYC.';
      }
      return;
    }
    if (fb) fb.hidden = true;
    modalEkycProofDataUrl = '';
    document.getElementById('volunteer-ekyc-dialog')?.close();
    await syncCitizenSession();
    showToast(data.message || 'Đã gửi hồ sơ Tình nguyện viên về Cổng Quản trị thẩm định.');
  });

  document.getElementById('btn-sos-switch-squad')?.addEventListener('click', async () => {
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'demo_squad_session', squadId: 'SQUAD-HN-DONGNGAC' })
    });
    const data = await res.json();
    if (res.ok && data?.ok) {
      localStorage.setItem(CITIZEN_TOKEN_KEY, data.token);
      appSafetyState.citizenToken = data.token;
      await syncCitizenSession();
      showToast('Đã chuyển sang phiên Đội Xung kích Đã xác minh — có thể kiểm thử Hộp thư nhận ca bên phải!');
    }
  });

  document.getElementById('btn-sos-logout')?.addEventListener('click', () => {
    localStorage.removeItem(CITIZEN_TOKEN_KEY);
    appSafetyState.citizenToken = '';
    appSafetyState.citizenProfile = null;
    appSafetyState.myTickets = [];
    updateCitizenAuthUi();
    renderMySosTickets();
    loadResponderInboxIfVerified();
    showToast('Đã đăng xuất tài khoản.');
  });

  document.getElementById('btn-sos-delete-account')?.addEventListener('click', async () => {
    if (!appSafetyState.citizenToken) return;
    const confirmed = window.confirm(
      'Xác nhận XÓA VĨNH VIỄN tài khoản và xóa trắng toàn bộ tọa độ / hồ sơ SOS theo Nghị định 13/2023/NĐ-CP? Thao tác không thể khôi phục.'
    );
    if (!confirmed) return;
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appSafetyState.citizenToken}`
      },
      body: JSON.stringify({ action: 'delete_my_account' })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      showToast(data?.error || 'Không thể xóa tài khoản.');
      return;
    }
    localStorage.removeItem(CITIZEN_TOKEN_KEY);
    appSafetyState.citizenToken = '';
    appSafetyState.citizenProfile = null;
    appSafetyState.myTickets = [];
    updateCitizenAuthUi();
    renderMySosTickets();
    loadResponderInboxIfVerified();
    showToast(data.message || 'Đã xóa vĩnh viễn tài khoản và xóa trắng dữ liệu cá nhân.');
  });

  // Chọn bằng 1 chạm: Tình huống SOS, Mực nước, Thẻ hoàn cảnh, Giọng nói & Phạm vi bảo vệ
  document.querySelectorAll('.js-sos-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      const inp = document.getElementById('sos-category');
      if (inp) inp.value = val;
      document.querySelectorAll('.js-sos-cat').forEach((b) => {
        const act = b === btn;
        b.classList.toggle('is-active', act);
        b.setAttribute('aria-pressed', String(act));
      });
      if (val === 'trapped_deep_water') {
        const dInp = document.getElementById('sos-water-depth');
        if (dInp) dInp.value = '0.55';
        document.querySelectorAll('.js-sos-depth').forEach((d) => {
          const act = d.dataset.val === '0.55';
          d.classList.toggle('is-active', act);
          d.setAttribute('aria-pressed', String(act));
        });
      }
    });
  });

  document.querySelectorAll('.js-sos-depth').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      const inp = document.getElementById('sos-water-depth');
      if (inp) inp.value = val;
      document.querySelectorAll('.js-sos-depth').forEach((b) => {
        const act = b === btn;
        b.classList.toggle('is-active', act);
        b.setAttribute('aria-pressed', String(act));
      });
    });
  });

  document.querySelectorAll('.js-sos-scope').forEach((btn) => {
    btn.addEventListener('click', () => {
      appSafetyState._scopeTouched = true;
      const val = btn.dataset.val;
      const inp = document.getElementById('sos-dispatch-scope');
      if (inp) inp.value = val;
      document.querySelectorAll('.js-sos-scope').forEach((b) => {
        const act = b === btn;
        b.classList.toggle('is-active', act);
        b.setAttribute('aria-pressed', String(act));
      });
    });
  });

  document.querySelectorAll('.js-sos-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = !btn.classList.contains('is-active');
      btn.classList.toggle('is-active', next);
      btn.setAttribute('aria-pressed', String(next));
      updateSosComposedPreview();
    });
  });
  document.getElementById('sos-note')?.addEventListener('input', updateSosComposedPreview);

  document.getElementById('btn-sos-voice')?.addEventListener('click', () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('Trình duyệt này chưa hỗ trợ nhận giọng nói — bạn chỉ cần chạm các thẻ tình trạng có sẵn.');
      return;
    }
    const micBtn = document.getElementById('btn-sos-voice');
    const lbl = document.getElementById('sos-voice-label');
    const rec = new SpeechRec();
    rec.lang = 'vi-VN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    micBtn?.classList.add('is-recording');
    if (lbl) lbl.textContent = 'Đang nghe...';
    rec.onresult = (ev) => {
      const txt = String(ev.results?.[0]?.[0]?.transcript || '').trim();
      const noteInp = document.getElementById('sos-note');
      if (txt && noteInp) {
        noteInp.value = [noteInp.value.trim(), txt].filter(Boolean).join('. ').slice(0, 220);
        updateSosComposedPreview();
        showToast(`Đã ghi âm thành chữ: "${txt}"`);
      }
    };
    rec.onerror = () => showToast('Chưa thu được giọng nói — bạn vẫn có thể chạm thẻ và bấm Phát tín hiệu ngay.');
    rec.onend = () => {
      micBtn?.classList.remove('is-recording');
      if (lbl) lbl.textContent = 'Nói giọng nói (Rảnh tay)';
    };
    try {
      rec.start();
    } catch {
      micBtn?.classList.remove('is-recording');
      if (lbl) lbl.textContent = 'Nói giọng nói (Rảnh tay)';
    }
  });

  document.getElementById('btn-sos-use-gps')?.addEventListener('click', () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        appSafetyState.sosCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const lbl = resolveAutoLocationLabel(pos.coords.latitude, pos.coords.longitude);
        const locTextEl = document.getElementById('sos-auto-loc-text');
        const areaInp = document.getElementById('sos-area-hint');
        if (locTextEl) locTextEl.textContent = lbl;
        if (areaInp) areaInp.value = lbl;
        showToast('Đã tự động định vị mốc đường phố gần nhất.');
      },
      () => showToast('Đang dùng vị trí tâm vùng khoanh hiện tại.')
    );
  });

  document.getElementById('sos-request-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!appSafetyState.citizenToken) {
      appSafetyState.pendingAutoSubmitSos = true;
      document.getElementById('citizen-auth-dialog')?.showModal();
      showToast('Chạm "Đăng nhập 1 chạm với Tài khoản Google" để phát tín hiệu SOS ngay!');
      return;
    }
    await submitSosNow();
  });

  document.getElementById('btn-refresh-sos-state')?.addEventListener('click', async () => {
    await syncCitizenSession();
    renderSosLiveMap();
  });

  document.getElementById('btn-copy-sos-sms')?.addEventListener('click', async () => {
    const pkt = getCurrentOfflineSosSmsPayload();
    const link = document.getElementById('btn-send-sos-sms-link');
    if (link) link.href = pkt.smsHref;
    try {
      await navigator.clipboard.writeText(pkt.smsText);
      showToast('Đã sao chép tin nhắn SOS khẩn kèm tọa độ & PIN!');
    } catch {
      showToast(pkt.smsText);
    }
  });

  document.getElementById('btn-responder-heartbeat')?.addEventListener('click', async () => {
    const coords = appSafetyState.sosCoords || state.zone;
    const res = await fetch('/api/sos-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appSafetyState.citizenToken}`
      },
      body: JSON.stringify({ action: 'responder_heartbeat', lat: coords.lat, lng: coords.lng })
    });
    const data = await res.json();
    if (res.ok && data?.ok) {
      appSafetyState.nearbyAlertEnabled = true;
      showToast(`Đã bật nhận cảnh báo quanh ô lưới ${data.coarseGeohash5} (tự tắt sau 30 phút, không lưu GPS chính xác).`);
      loadResponderInboxIfVerified();
    } else {
      showToast(data?.error || 'Vui lòng đăng nhập tài khoản để bật cảnh báo hỗ trợ quanh đây.');
    }
  });

  const urlBase64ToUint8Array = (base64String) => {
    const pad = '='.repeat((4 - (base64String.length % 4)) % 4);
    const b64 = (base64String + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
    return arr;
  };

  document.getElementById('btn-enable-web-push')?.addEventListener('click', async () => {
    const pushBtn = document.getElementById('btn-enable-web-push');
    const noteEl = document.getElementById('web-push-status-note');
    if (!appSafetyState.citizenToken) {
      document.getElementById('citizen-auth-dialog')?.showModal();
      showToast('Vui lòng đăng nhập tài khoản hoặc Google trước khi bật Chuông Đẩy Nền.');
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Trình duyệt hiện tại chưa hỗ trợ Web Push nền.');
      return;
    }
    if (!appSafetyState.vapidPublicKey) {
      try {
        const h = await fetch('/api/sos-dispatch?action=health').then((r) => (r.ok ? r.json() : null));
        appSafetyState.vapidPublicKey = h?.vapidPublicKey || '';
      } catch {
        // ignore
      }
    }
    if (!appSafetyState.vapidPublicKey) {
      showToast('Máy chủ chưa sẵn sàng khóa VAPID Push.');
      return;
    }
    try {
      if (pushBtn) pushBtn.disabled = true;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Bạn chưa cấp quyền Thông báo cho trình duyệt.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(appSafetyState.vapidPublicKey)
      });
      const coords = appSafetyState.sosCoords || state.zone;
      const res = await fetch('/api/sos-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appSafetyState.citizenToken}`
        },
        body: JSON.stringify({
          action: 'subscribe_push',
          lat: coords.lat,
          lng: coords.lng,
          subscription: sub.toJSON()
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Không đăng ký được Web Push.');
      if (pushBtn) pushBtn.textContent = 'Đã Bật Chuông Đẩy Nền (24h)';
      if (noteEl) noteEl.textContent = `Đã gắn chuông nền W3C VAPID quanh ô lưới ${data.coarseGeohash5} (tự xóa sau 24 giờ, không lưu tọa độ chính xác).`;
      showToast('Đã bật Chuông Đẩy Nền thành công!');
    } catch (err) {
      showToast(err?.message || 'Chưa kích hoạt được Chuông Đẩy Nền.');
    } finally {
      if (pushBtn) pushBtn.disabled = false;
    }
  });

  if (!window.__vnSosPollerSet) {
    window.__vnSosPollerSet = true;
    setInterval(() => {
      const sosSection = document.getElementById('pillar-sos');
      if (appSafetyState.citizenToken && ((sosSection && !sosSection.hidden) || appSafetyState.nearbyAlertEnabled)) {
        loadResponderInboxIfVerified();
      }
    }, 25000);
  }

  // Hiệu chuẩn AI thực địa ẩn danh (P4.2 — cải thiện ngưỡng kẹt thật vs dừng đèn đỏ)
  const CALIB_KEY = 'vn_ai_calib_stats_v1';
  const renderCalibCounter = () => {
    const el = document.getElementById('ai-calib-count');
    if (!el) return;
    const st = readJson(CALIB_KEY, { true_stall: 0, false_redlight: 0 });
    const tot = (st.true_stall || 0) + (st.false_redlight || 0);
    el.textContent = tot > 0 ? `Đã ghi nhận ${tot} phản hồi (${st.true_stall || 0} kẹt / ${st.false_redlight || 0} đèn đỏ)` : '';
  };
  renderCalibCounter();
  document.querySelectorAll('.js-ai-calib').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lbl = btn.dataset.label === 'true_stall' ? 'true_stall' : 'false_redlight';
      const st = readJson(CALIB_KEY, { true_stall: 0, false_redlight: 0 });
      st[lbl] = (st[lbl] || 0) + 1;
      writeJson(CALIB_KEY, st);
      renderCalibCounter();
      showToast(
        lbl === 'true_stall'
          ? 'Đã ghi nhận xác nhận kẹt/ngập cục bộ giúp AI tinh chỉnh độ nhạy.'
          : 'Đã ghi nhận tình huống dừng bình thường giúp AI giảm báo giả.'
      );
    });
  });

  // Bật/tắt theo dõi GPS Hộ tống cục bộ trên thiết bị
  document.getElementById('btn-toggle-ai-escort')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-toggle-ai-escort');
    if (appSafetyState.escortWatchId !== null) {
      navigator.geolocation?.clearWatch(appSafetyState.escortWatchId);
      appSafetyState.escortWatchId = null;
      appSafetyState.stationarySinceMs = null;
      appSafetyState.kinematics = { prevSpeedKmh: null, currentSpeedKmh: null, stationarySeconds: 0 };
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'Bật GPS Hộ tống';
      runProactiveAiEvaluation();
      showToast('Đã tắt theo dõi hộ tống GPS.');
      return;
    }
    if (!('geolocation' in navigator)) {
      showToast('Thiết bị không hỗ trợ cảm biến GPS.');
      return;
    }
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = 'Đang hộ tống GPS';
    appSafetyState.escortWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        appSafetyState.sosCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const vKmh = Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : 0;
        if (vKmh <= 2.0) {
          if (!appSafetyState.stationarySinceMs) appSafetyState.stationarySinceMs = Date.now();
        } else {
          appSafetyState.lastSpeedKmh = vKmh;
          appSafetyState.stationarySinceMs = null;
        }
        const dwellS = appSafetyState.stationarySinceMs ? (Date.now() - appSafetyState.stationarySinceMs) / 1000 : 0;
        appSafetyState.kinematics = {
          prevSpeedKmh: Math.max(12, appSafetyState.lastSpeedKmh),
          currentSpeedKmh: vKmh,
          stationarySeconds: dwellS
        };
        runProactiveAiEvaluation();
      },
      () => showToast('Chưa nhận được tín hiệu GPS liên tục — bạn có thể bấm 3 kịch bản kiểm chứng bên dưới.')
    );
  });

  // 3 kịch bản kiểm chứng mô hình AI Thủy động lực + Động học thực tế
  document.querySelectorAll('.js-sim-kinematic').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.sim;
      if (mode === 'normal_ride') {
        runProactiveAiEvaluation({
          elevM: 15,
          rainMmPerHour: 4,
          dailyRainMm: 12,
          nearFloodSpotMeters: 600,
          kinematics: { prevSpeedKmh: 24, currentSpeedKmh: 24, stationarySeconds: 0 }
        });
      } else if (mode === 'dry_redlight') {
        runProactiveAiEvaluation({
          elevM: 15,
          rainMmPerHour: 0,
          dailyRainMm: 0,
          nearFloodSpotMeters: 800,
          kinematics: { prevSpeedKmh: 28, currentSpeedKmh: 0, stationarySeconds: 95 }
        });
        showToast('Đường khô ráo: Dừng đèn đỏ 95 giây xác suất chỉ ~0% — Hệ thống KHÔNG báo động giả!');
      } else if (mode === 'flood_stall') {
        runProactiveAiEvaluation({
          elevM: 8.2,
          rainMmPerHour: 38,
          dailyRainMm: 85,
          nearFloodSpotMeters: 45,
          kinematics: { prevSpeedKmh: 22, currentSpeedKmh: 0, stationarySeconds: 125 }
        });
      }
    });
  });

  document.getElementById('btn-proactive-im-ok')?.addEventListener('click', () => {
    document.getElementById('proactive-safety-dialog')?.close();
    showToast('Đã ghi nhận bạn vẫn an toàn. Không có tín hiệu vị trí nào được gửi đi.');
  });
  document.getElementById('btn-proactive-need-sos')?.addEventListener('click', () => {
    document.getElementById('proactive-safety-dialog')?.close();
    switchPillar('sos');
    document.getElementById('sos-note')?.focus();
  });

  // Sự kiện ủy quyền cho các nút Nhận ca, Đối chiếu PIN, Báo lợi dụng & Xóa trắng tọa độ
  document.addEventListener('click', async (ev) => {
    const claimBtn = ev.target.closest('.js-claim-sos-slot');
    if (claimBtn) {
      const res = await fetch('/api/sos-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appSafetyState.citizenToken}`
        },
        body: JSON.stringify({
          action: 'claim_slot',
          ticketId: claimBtn.dataset.tid,
          pledgedFreeSupport: true
        })
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        showToast('Đã khóa 1 chỗ hỗ trợ (cam kết 0 đồng) và mở tọa độ tiếp cận!');
        await loadResponderInboxIfVerified();
      } else {
        showToast(data?.error || 'Không nhận được ca.');
      }
      return;
    }

    const pinBtn = ev.target.closest('.js-verify-sos-pin');
    if (pinBtn) {
      const tid = pinBtn.dataset.tid;
      const pinVal = document.querySelector(`.js-pin-input-${CSS.escape(tid)}`)?.value || '';
      const res = await fetch('/api/sos-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appSafetyState.citizenToken}`
        },
        body: JSON.stringify({ action: 'verify_pin', ticketId: tid, pin: pinVal })
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        showToast('Đã khớp Mã PIN 4 số 2 chiều tại hiện trường!');
        await loadResponderInboxIfVerified();
      } else {
        showToast(data?.error || 'Mã PIN không khớp.');
      }
      return;
    }

    const resolveBtn = ev.target.closest('.js-resolve-sos');
    if (resolveBtn) {
      const res = await fetch('/api/sos-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appSafetyState.citizenToken}`
        },
        body: JSON.stringify({ action: 'resolve_sos', ticketId: resolveBtn.dataset.tid })
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        showToast(data.message);
        await syncCitizenSession();
      }
      return;
    }

    const abuseBtn = ev.target.closest('.js-report-sos-abuse');
    if (abuseBtn) {
      const res = await fetch('/api/sos-dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appSafetyState.citizenToken}`
        },
        body: JSON.stringify({
          action: 'report_abuse',
          ticketId: abuseBtn.dataset.tid,
          responderId: abuseBtn.dataset.rid,
          reason: 'Người dùng báo cáo đòi tiền / hành vi đáng ngờ'
        })
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        showToast(data.message);
        await syncCitizenSession();
      }
    }
  });

  syncCitizenSession();
}

function installMobileApiOriginBridge() {
  const origin = typeof window !== 'undefined' ? window.__VN_API_ORIGIN__ : '';
  if (!origin || window.__vnFetchPatched) return;
  window.__vnFetchPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return origFetch(`${origin}${input}`, init);
    }
    return origFetch(input, init);
  };
}

function loadExternalScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`SCRIPT_LOAD_FAILED:${id}`));
    document.head.appendChild(s);
  });
}

let _gsiInitialized = false;
let _turnstileMounted = false;

async function ensureTurnstileMounted() {
  if (_turnstileMounted || !appSafetyState.turnstileEnabled) return;
  const box = document.getElementById('rep-turnstile-box');
  if (!box || box.offsetParent === null) return;
  _turnstileMounted = true;
  await loadExternalScriptOnce('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', 'cf-turnstile-sdk').catch(() => {});
  if (window.turnstile?.render) {
    box.hidden = false;
    appSafetyState.repTurnstileWidgetId = window.turnstile.render(box, {
      sitekey: appSafetyState.turnstileSiteKey,
      theme: 'light',
      size: 'flexible'
    });
  }
}

async function ensureGoogleGsiRendered() {
  if (!appSafetyState.googleClientId) return;
  const gsiMount = document.getElementById('google-gsi-mount');
  if (!gsiMount || gsiMount.offsetParent === null) return;
  if (_gsiInitialized && gsiMount.childElementCount > 0) return;

  await loadExternalScriptOnce('https://accounts.google.com/gsi/client', 'google-gsi-sdk').catch(() => {});
  if (window.google?.accounts?.id) {
    if (!_gsiInitialized) {
      window.google.accounts.id.initialize({
        client_id: appSafetyState.googleClientId,
        callback: async (resp) => {
          if (!resp?.credential) return;
          const authRes = await fetch('/api/sos-dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'google_auth', idToken: resp.credential })
          });
          const data = await authRes.json();
          if (authRes.ok && data?.ok) {
            localStorage.setItem(CITIZEN_TOKEN_KEY, data.token);
            appSafetyState.citizenToken = data.token;
            document.getElementById('citizen-auth-dialog')?.close();
            await syncCitizenSession();
            showToast(`Đã đăng nhập Google: ${data.profile.fullName}`);
            if (appSafetyState.pendingAutoSubmitSos) {
              await submitSosNow();
            }
          }
        }
      });
      _gsiInitialized = true;
    }
    const gsiW = Math.min(300, Math.max(220, Math.round(gsiMount.clientWidth || 280)));
    gsiMount.innerHTML = '';
    window.google.accounts.id.renderButton(gsiMount, {
      theme: 'outline',
      size: 'large',
      width: gsiW,
      text: 'continue_with'
    });
  }
}

async function initSecuritySdks() {
  if (!location.protocol.startsWith('http')) return;
  try {
    const res = await fetch('/api/sos-dispatch?action=health');
    if (!res.ok) return;
    const h = await res.json();
    appSafetyState.googleClientIdConfigured = Boolean(h?.googleClientIdConfigured);
    appSafetyState.googleClientId = h?.googleClientId || '';
    appSafetyState.vapidPublicKey = h?.vapidPublicKey || '';
    appSafetyState.turnstileSiteKey = h?.turnstileSiteKey || '';
    appSafetyState.turnstileEnabled = Boolean(h?.turnstileEnabled && h?.turnstileSiteKey);

    if (appSafetyState.googleClientId) {
      const quickBtn = document.getElementById('btn-google-quick-auth');
      const customToggle = document.getElementById('btn-google-custom-toggle');
      const quickFields = document.getElementById('google-quick-fields');
      if (quickBtn) quickBtn.style.display = 'none';
      if (customToggle) customToggle.style.display = 'none';
      if (quickFields) quickFields.style.display = 'none';
    }
  } catch {
    // non-fatal offline / local
  }
}

function boot() {
  installMobileApiOriginBridge();
  registerServiceWorker();
  applyLargeTextMode(Boolean(readJson(LARGE_TEXT_KEY, false)));
  populateProvinceSelects();
  bindEvents();

  const urlParams = new URLSearchParams(location.search);
  const qLat = Number(urlParams.get('lat'));
  const qLng = Number(urlParams.get('lng'));
  const qRad = Math.min(25, Math.max(1, Number(urlParams.get('r')) || 2));
  const qName = urlParams.get('name');
  if (urlParams.has('lat') && urlParams.has('lng') && isInsideVietnam(qLat, qLng)) {
    const near = findNearestVietnamZone(qLat, qLng);
    selectZone(
      {
        id: 'deeplink-vn',
        name: qName || near?.name || 'Khu vực được chia sẻ',
        province: near?.province || 'Việt Nam',
        macroRegion: near?.macroRegion || 'bac',
        lat: qLat,
        lng: qLng
      },
      { radiusKm: qRad, flyMap: true }
    );
  } else {
    selectZone(VIETNAM_ZONES[0], { radiusKm: 2, flyMap: true });
  }

  loadPublicationsFeed();
  initSecuritySdks();
}

boot();
