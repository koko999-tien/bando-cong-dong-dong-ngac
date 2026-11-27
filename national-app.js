/**
 * VN RESILIENCE ATLAS — NATIONAL 3-PILLAR GEOSPATIAL WORKBENCH CONTROLLER
 * - Phân hệ 1 (Công khai): Bản đồ khoanh vùng chống lag + Đa nền + Radar mưa + Hạ tầng OSM sống + Spot Inspector
 * - Phân hệ 2 (Nhà Nghiên cứu): Đăng ký / Đăng nhập, Khoanh vùng, GeoJSON, Mặt cắt địa hình, Hàng đợi kiểm định
 * - Phân hệ 3 (Bản tin & Công bố): Bản tin thiên tai & công trình khoa học liên kết 1 chạm tới Bản đồ chính
 */

import { PROJECT_CONFIG } from './config.js';
import { SAMPLE_HUMG_POINTS, FLOOD_STREET_CORRIDORS } from './humg-data.js';
import {
  VIETNAM_VERIFIED_HOTSPOTS,
  VIETNAM_VERIFIED_CORRIDORS,
  filterCorridorsInZone
} from './platform/data/vietnam-verified-hotspots.js';
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

const BASEMAP_PROVIDERS = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri World Imagery'
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap (CC-BY-SA)'
  }
};

const state = {
  pillar: 'public',
  pubTab: 'overview',
  zone: { ...VIETNAM_ZONES[0], radiusKm: VIETNAM_ZONES[0].defaultRadiusKm || 2 },
  // Chỉ chứa các đối tượng nằm TRONG vòng khoanh đang xem (chống lag toàn quốc!)
  zonePoints: [],
  osmPois: [],
  osmWaterways: [],
  zoneCorridors: [],
  publishedStudiesInZone: [],
  livePulse: { byPoint: {}, recentFeed: [] },
  broadcast: null,
  weather: null,
  hourlyForecast: null,
  zoneElevationM: null,
  aqi: null,
  lastUpdatedAt: null,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  mapFilter: 'all',
  localFilterText: '',
  mapMobileMode: 'map',
  basemap: 'osm',
  layers: {
    radar: false,
    corridors: true,
    waterways: true,
    osmPoi: true
  },
  travelMode: 'bike',
  reportPin: { lat: VIETNAM_ZONES[0].lat, lng: VIETNAM_ZONES[0].lng },
  reportPhotoDataUrl: '',
  // Phân hệ 2: Nhà Nghiên cứu & Kiểm duyệt
  researcherToken: sessionStorage.getItem(RESEARCHER_TOKEN_KEY) || '',
  researcherProfile: null,
  mySubmissions: [],
  draftStudyPoints: [],
  reviewerToken: sessionStorage.getItem(REVIEWER_TOKEN_KEY) || '',
  // Phân hệ 3: Bản tin & Công bố
  newsKind: 'all',
  newsRegion: 'all',
  publications: [],
  newsStats: { disasterNewsCount: 0, researchArticleCount: 0, verifiedResearchersCount: 0 }
};

let nationalMap = null;
let baseTileLayer = null;
let radarTileLayer = null;
let zoneCircleLayer = null;
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

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* =========================================================================
   1. ĐIỀU HƯỚNG 3 PHÂN HỆ & 4 CHẾ ĐỘ VÙNG
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
    setTimeout(() => nationalMap?.invalidateSize(), 60);
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

  // Khi người dân mở tab Lộ trình / Nơi ở / Báo sự cố trên mobile, tự chuyển sang chế độ hiển thị form
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
}

/* =========================================================================
   2. KHOANH VÙNG ĐỘNG TOÀN VIỆT NAM & LÀM GIÀU DỮ LIỆU VÙNG KHOANH
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

  // Hợp nhất hạ tầng y tế & cứu hộ OSM thực tế trong vòng khoanh (chống trùng lặp trong bán kính < 85 m)
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

async function refreshActiveZoneData({ flyMap = true } = {}) {
  state.isOffline = !navigator.onLine;
  updateOfflineStrip();

  const { lat, lng, radiusKm } = state.zone;

  // Bước 1: Lọc tức thì kho điểm kiểm chứng & hành lang trong vòng khoanh (0 ms, 0 lag!)
  const baselineInZone = filterFeaturesInZone(ALL_STATIC_POINTS, lat, lng, radiusKm, 200);
  state.zoneCorridors = filterCorridorsInZone(ALL_STATIC_CORRIDORS, lat, lng, radiusKm);
  state.zonePoints = baselineInZone;
  renderPublicOverview({ flyMap });

  if (state.isOffline) return;

  const osmStatusEl = document.getElementById('osm-enrich-status');
  if (osmStatusEl) osmStatusEl.textContent = 'Đang tải OSM...';

  // Bước 2: Gọi song song thời tiết 24h + AQI + cộng đồng + nghiên cứu xuất bản + hạ tầng OSM trong vùng
  const [weatherRes, aqiRes, commRes, researchRes, osmRes] = await Promise.allSettled([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,rain,wind_speed_10m&hourly=precipitation,precipitation_probability,temperature_2m&forecast_hours=24&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FBangkok&forecast_days=2`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FBangkok`
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
  }

  if (aqiRes.status === 'fulfilled' && aqiRes.value?.current) {
    const a = aqiRes.value.current;
    state.aqi = { usAqi: Number(a.us_aqi), pm25: Number(a.pm2_5), pm10: Number(a.pm10) };
  }

  const commOk = commRes.status === 'fulfilled' && commRes.value?.ok ? commRes.value : null;
  if (commOk) {
    state.broadcast = commOk.broadcast || null;
    state.livePulse = commOk.livePulse || { byPoint: {}, recentFeed: [] };
  }

  const researchOk = researchRes.status === 'fulfilled' && researchRes.value?.ok ? researchRes.value : null;
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
    broadcast: state.zone.id === 'vn-hn-dong-ngac' ? state.broadcast : null,
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

  renderHourlyRainChart();
  renderZoneMapAndList({ flyMap });
}

/* =========================================================================
   3. BẢN ĐỒ ĐA LỚP (PHỐ / VỆ TINH / ĐỊA HÌNH + RADAR + HÀNH LANG + SPOT INSPECTOR)
   ========================================================================= */
function ensureNationalMap() {
  if (nationalMap || typeof window.L === 'undefined') return;
  nationalMap = window.L.map('national-map', { zoomControl: true }).setView([state.zone.lat, state.zone.lng], 14);
  const cfg = BASEMAP_PROVIDERS[state.basemap] || BASEMAP_PROVIDERS.osm;
  baseTileLayer = window.L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, attribution: cfg.attribution }).addTo(nationalMap);

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
  baseTileLayer = window.L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, attribution: cfg.attribution }).addTo(nationalMap);
  baseTileLayer.bringToBack();
}

async function toggleRadarOverlay(enable) {
  state.layers.radar = Boolean(enable);
  if (!nationalMap) return;
  if (!enable) {
    if (radarTileLayer) {
      nationalMap.removeLayer(radarTileLayer);
      radarTileLayer = null;
    }
    return;
  }
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = res.ok ? await res.json() : null;
    const frames = data?.radar?.past || [];
    const latest = frames[frames.length - 1];
    if (!latest?.path) {
      showToast('Hiện chưa có khung ảnh Radar RainViewer mới.');
      return;
    }
    if (radarTileLayer) nationalMap.removeLayer(radarTileLayer);
    radarTileLayer = window.L.tileLayer(`https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0.56,
      maxNativeZoom: 7,
      maxZoom: 18,
      attribution: 'Radar &copy; RainViewer'
    }).addTo(nationalMap);
    showToast('Đã bật lớp phủ Radar Mưa trực tiếp (RainViewer).');
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

  const renderCard = (elevLabel) => {
    const r0 = nearRisks[0];
    const s0 = nearSafe[0];
    box.innerHTML = `
      <div class="section-head-row" style="margin-bottom:6px;">
        <strong>Tra cứu Tọa độ Chạm</strong>
        <button type="button" id="btn-close-selected-pt" class="text-btn">Đóng</button>
      </div>
      <div class="place-card-meta" style="margin-bottom:6px;">
        <span class="mono-badge">${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E</span>
        <span class="mono-badge subtle">${esc(elevLabel)}</span>
      </div>
      <p class="place-card-desc">
        ${r0 ? `<strong>Điểm rủi ro gần nhất:</strong> ${esc(r0.name)} (${esc(formatDistancePlain(r0.d))})<br>` : 'Chưa ghi nhận điểm rủi ro nào gần tọa độ này trong vòng khoanh.<br>'}
        ${s0 ? `<strong>Cơ sở y tế / hỗ trợ gần nhất:</strong> ${esc(s0.name)} (${esc(formatDistancePlain(s0.d))})` : 'Chưa tìm thấy trạm y tế gần hơn trong bộ dữ liệu hiện tại.'}
      </p>
      <div class="place-card-actions" style="margin-top:6px;">
        <button type="button" class="btn btn-sm btn-primary js-spot-rezone" data-lat="${lat}" data-lng="${lng}">Khoanh vùng tại đây</button>
        <button type="button" class="btn btn-sm btn-secondary js-spot-report" data-lat="${lat}" data-lng="${lng}">Báo sự cố tại tọa độ này</button>
      </div>
    `;
    document.getElementById('btn-close-selected-pt')?.addEventListener('click', () => {
      box.hidden = true;
    });
  };

  renderCard('Đang đo cao độ vệ tinh...');
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`);
    const data = res.ok ? await res.json() : null;
    const elev = Number(data?.elevation?.[0]);
    if (Number.isFinite(elev)) {
      renderCard(`Cao độ mặt đất ~${elev.toFixed(1)} m`);
    } else {
      renderCard('Chưa rõ cao độ');
    }
  } catch {
    renderCard('Chưa rõ cao độ (offline)');
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
  zoneCircleLayer.clearLayers();
  waterwaysLayer.clearLayers();
  corridorsLayer.clearLayers();
  zoneMarkersLayer.clearLayers();

  const ring = window.L.circle([state.zone.lat, state.zone.lng], {
    radius: state.zone.radiusKm * 1000,
    color: '#0F766E',
    weight: 2.2,
    dashArray: '7 5',
    fillColor: '#0F766E',
    fillOpacity: 0.05
  }).addTo(zoneCircleLayer);

  window.L.circleMarker([state.zone.lat, state.zone.lng], {
    radius: 6,
    color: '#0F766E',
    weight: 2.5,
    fillColor: '#FFFFFF',
    fillOpacity: 1
  })
    .bindTooltip(`Tâm vùng: ${state.zone.name}`)
    .addTo(zoneCircleLayer);

  // Lớp thủy hệ (sông / kênh thoát nước OSM trong vùng khoanh)
  if (state.layers.waterways && state.osmWaterways.length > 0) {
    for (const ww of state.osmWaterways) {
      window.L.polyline(ww.coordinates, {
        color: '#0284C7',
        weight: 2.6,
        opacity: 0.72
      })
        .bindTooltip(`${ww.name} (${ww.waterwayType})`)
        .addTo(waterwaysLayer);
    }
  }

  // Lớp hành lang ngập / sạt lở kiểm chứng nằm trong vùng khoanh
  if (state.layers.corridors && state.zoneCorridors.length > 0) {
    for (const cor of state.zoneCorridors) {
      const latLngs = (cor.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (latLngs.length < 2) continue;
      window.L.polyline(latLngs, {
        color: cor.severity === 'severe' ? '#DC2626' : '#D97706',
        weight: 5,
        opacity: 0.8
      })
        .bindPopup(`<strong>${esc(cor.name)}</strong><br><small>Ngưỡng mưa tham chiếu ~${cor.rainThresholdMm} mm · ${esc(cor.source)}</small><br>${esc(cor.note)}`)
        .addTo(corridorsLayer);
    }
  }

  // Các điểm rủi ro & hạ tầng y tế/cứu hộ trong vùng khoanh
  for (const pt of filtered) {
    const color =
      pt.layerGroup === 'safe'
        ? '#16A34A'
        : pt.confidenceTier === 'C'
          ? '#D97706'
          : '#DC2626';

    window.L.circleMarker([Number(pt.lat), Number(pt.lng)], {
      radius: pt.isOsmLive ? 6.5 : 7.5,
      color: '#FFFFFF',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.94
    })
      .on('click', (ev) => {
        window.L.DomEvent.stopPropagation(ev);
        showSelectedPointCard(pt);
      })
      .addTo(zoneMarkersLayer);
  }

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

      // Đồng bộ vẽ tuyến lên bản đồ chính bên phải để quan sát rộng hơn trên desktop
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
   6. PHÂN HỆ 2: CỔNG NHÀ NGHIÊN CỨU (ĐĂNG KÝ / ĐĂNG NHẬP / ĐẨY DỮ LIỆU LÊN MAP)
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
      const idx = state.draftStudyPoints.length + 1;
      state.draftStudyPoints.push({
        name: `Điểm khảo sát ${idx} (${getSelectedStudyProvinceMeta().province})`,
        lat: Math.round(ev.latlng.lat * 1_000_000) / 1_000_000,
        lng: Math.round(ev.latlng.lng * 1_000_000) / 1_000_000,
        category: document.getElementById('sub-hazard')?.value || 'flood',
        notes: 'Điểm khảo sát do nhà nghiên cứu gắn trực tiếp trên bản đồ.'
      });
      renderStudyDraftOverlay();
    });
  }
  renderStudyDraftOverlay();
  setTimeout(() => studyMap.invalidateSize(), 80);
}

function renderStudyDraftOverlay() {
  const prev = document.getElementById('sub-points-preview');
  if (prev) {
    prev.textContent =
      state.draftStudyPoints.length > 0
        ? `Đã chuẩn bị ${state.draftStudyPoints.length} điểm dữ liệu sẵn sàng gửi kiểm định (VD: ${state.draftStudyPoints[0].name}).`
        : 'Chưa có điểm nào được gắn. Chạm bản đồ hoặc nạp tệp GeoJSON.';
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

  for (const pt of state.draftStudyPoints) {
    window.L.circleMarker([pt.lat, pt.lng], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#0F766E',
      fillOpacity: 0.95
    })
      .bindTooltip(pt.name)
      .addTo(studyDraftLayer);
  }
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

async function loadReviewerQueue() {
  const queueBox = document.getElementById('reviewer-queue-list');
  if (!state.reviewerToken || !queueBox) return;
  const res = await fetch('/api/research-portal?action=review_queue', {
    headers: { Authorization: `Bearer ${state.reviewerToken}` }
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    sessionStorage.removeItem(REVIEWER_TOKEN_KEY);
    state.reviewerToken = '';
    queueBox.hidden = true;
    showToast(data?.error || 'Phiên kiểm duyệt đã hết hạn.');
    return;
  }
  document.getElementById('reviewer-auth-row').hidden = true;
  queueBox.hidden = false;
  const list = data.submissions || [];
  if (list.length === 0) {
    queueBox.innerHTML = `<p class="muted-body">Hiện chưa có hồ sơ nghiên cứu nào trong hàng đợi.</p>`;
    return;
  }
  queueBox.innerHTML = list
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
    }
  } catch {
    // giữ danh sách đã tải
  }

  document.getElementById('stat-news-count').textContent = String(state.newsStats.disasterNewsCount || 0);
  document.getElementById('stat-research-count').textContent = String(state.newsStats.researchArticleCount || 0);
  document.getElementById('stat-researcher-count').textContent = String(state.newsStats.verifiedResearchersCount || 0);

  if (state.publications.length === 0) {
    listEl.innerHTML = `<div class="card-panel"><p class="muted-body">Chưa có bài viết nào thuộc vùng/danh mục này.</p></div>`;
    return;
  }

  listEl.innerHTML = state.publications
    .map((item) => {
      const isResearch = item.kind === 'research_article';
      const cardCls = isResearch
        ? 'is-research'
        : item.severity === 'high'
          ? 'is-news-high'
          : 'is-news-attention';
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
   9. GẮN SỰ KIỆN & KHỞI CHẠY
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

  // Bộ chuyển nền bản đồ & bật tắt lớp chuyên đề
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
      if (state.mapMobileMode === 'map') setTimeout(() => nationalMap?.invalidateSize(), 60);
    });
  });
  document.getElementById('zone-local-filter')?.addEventListener('input', (ev) => {
    state.localFilterText = ev.target.value;
    renderZoneMapAndList({ flyMap: false });
  });

  // Lộ trình
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

  // Kiểm tra nơi ở
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

  // Báo sự cố
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

  // Phân hệ 2: Nhà Nghiên cứu & Kiểm duyệt
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
    studyMap?.setView([meta.lat, meta.lng], 12);
    renderStudyDraftOverlay();
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
  document.getElementById('btn-clear-study-pts')?.addEventListener('click', () => {
    state.draftStudyPoints = [];
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

  document.getElementById('btn-toggle-reviewer-box')?.addEventListener('click', () => {
    const panel = document.getElementById('reviewer-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden && state.reviewerToken) loadReviewerQueue();
  });
  document.getElementById('btn-close-reviewer-panel')?.addEventListener('click', () => {
    document.getElementById('reviewer-panel').hidden = true;
  });
  document.getElementById('btn-reviewer-login')?.addEventListener('click', async () => {
    const pass = document.getElementById('reviewer-pass-input')?.value || '';
    const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_login', pass })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      showToast(data?.error || 'Mã xác thực kiểm duyệt không đúng.');
      return;
    }
    state.reviewerToken = data.token;
    sessionStorage.setItem(REVIEWER_TOKEN_KEY, data.token);
    loadReviewerQueue();
  });

  // Phân hệ 3: Lọc bản tin & bài nghiên cứu
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

  // Đóng gợi ý khi click ra ngoài
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
      document.getElementById('rep-location-status').textContent = `Đã gắn tọa độ từ bản đồ (${state.reportPin.lat.toFixed(4)}°N, ${state.reportPin.lng.toFixed(4)}°E · tự làm tròn ~20 m).`;
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
        renderResearchPillar();
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
