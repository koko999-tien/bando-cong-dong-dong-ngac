/**
 * AN TOÀN ĐÔNG NGẠC — CITIZEN-FIRST APPLICATION CONTROLLER
 * Trải nghiệm công cộng đơn giản ở phía trước · Công nghệ GIS/AI chuẩn mực ở phía sau.
 */

import { PROJECT_CONFIG } from './config.js';
import {
  SAMPLE_HUMG_POINTS,
  FLOOD_STREET_CORRIDORS,
  EMERGENCY_DIRECTORY,
  SAFE_DETOUR_ROUTES,
  HUMG_CENTER
} from './humg-data.js';
import {
  roundPrivacyCoord,
  analyzePolylineCorridor
} from './gis-utils.js';
import { synthesizeSituationalAnswer } from './knowledge-engine.js';
import {
  CITIZEN_LANDMARKS,
  RENTAL_INSPECTION_CHECKLIST,
  PLAIN_SOURCE_LABELS,
  haversineMeters,
  formatDistancePlain,
  describePointVerificationPlain,
  describeAqiPlain,
  buildCitizenStatusAdvisory,
  getNearbyCitizenHighlights,
  buildHonestRentalAreaSummary,
  buildHonestRouteComparison,
  createOfflineReportQueueItem
} from './citizen-logic.js';

const CACHE_KEY = 'humg_citizen_cache_v1';
const CHECKLIST_KEY = 'humg_citizen_rental_checklist_v1';
const OFFLINE_QUEUE_KEY = 'humg_citizen_offline_queue_v1';
const LARGE_TEXT_KEY = 'humg_citizen_large_text_v1';

const state = {
  activeView: 'today',
  area: { ...CITIZEN_LANDMARKS[0] },
  points: SAMPLE_HUMG_POINTS.map((p) => ({ ...p })),
  livePulse: { byPoint: {}, recentFeed: [] },
  broadcast: null,
  weather: null,
  aqi: null,
  lastUpdatedAt: null,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  mapFilter: 'all',
  mapSearch: '',
  mapMobileMode: 'map',
  showSimZones: false,
  travelMode: 'bike',
  rentalArea: { ...CITIZEN_LANDMARKS[2] }, // Ngõ 43 Cổ Nhuế mặc định minh họa thực tế
  reportPin: { lat: CITIZEN_LANDMARKS[0].lat, lng: CITIZEN_LANDMARKS[0].lng, source: 'mặc định quanh khu vực đang xem' },
  reportPhotoDataUrl: '',
  reportPhotoFlag: 'ok'
};

let mainMap = null;
let mainMarkersLayer = null;
let mainSimLayer = null;
let mainUserPin = null;

let routeMap = null;
let routeLinesLayer = null;

let reportMap = null;
let reportMarker = null;

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
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 3600);
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Bỏ qua nếu bộ nhớ cục bộ bị chặn ở chế độ ẩn danh
  }
}

function formatTimeHm(isoOrMs) {
  if (!isoOrMs) return 'Chưa có mốc giờ';
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return 'Vừa cập nhật';
  return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} hôm nay`;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* =========================================================================
   1. ĐIỀU HƯỚNG 5 CHỨC NĂNG & CHẾ ĐỘ CHỮ LỚN (NGƯỜI LỚN TUỔI)
   ========================================================================= */
function switchView(viewName, { scrollTop = true } = {}) {
  const valid = ['today', 'map', 'route', 'rental', 'report'];
  const next = valid.includes(viewName) ? viewName : 'today';
  state.activeView = next;

  for (const v of valid) {
    const panel = document.getElementById(`view-${v}`);
    if (panel) panel.hidden = v !== next;
  }

  document.querySelectorAll('[data-view]').forEach((btn) => {
    const active = btn.dataset.view === next;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  if (next === 'map') {
    ensureMainMap();
    renderMapAndList();
    setTimeout(() => mainMap?.invalidateSize(), 60);
  } else if (next === 'route') {
    setTimeout(() => routeMap?.invalidateSize(), 60);
  } else if (next === 'rental') {
    renderRentalView();
  }

  if (scrollTop) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function applyLargeTextMode(enabled) {
  document.documentElement.classList.toggle('is-large-text', Boolean(enabled));
  const btn = document.getElementById('btn-toggle-large-text');
  if (btn) btn.setAttribute('aria-pressed', String(Boolean(enabled)));
  writeJsonStorage(LARGE_TEXT_KEY, Boolean(enabled));
}

/* =========================================================================
   2. ĐỒNG BỘ DỮ LIỆU THỜI TIẾT, KHÔNG KHÍ, CỘNG ĐỒNG & CHẾ ĐỘ NGOẠI TUYẾN
   ========================================================================= */
function hydrateFromLocalCache() {
  const cached = readJsonStorage(CACHE_KEY, null);
  if (!cached) return;
  if (cached.weather) state.weather = cached.weather;
  if (cached.aqi) state.aqi = cached.aqi;
  if (cached.broadcast) state.broadcast = cached.broadcast;
  if (cached.livePulse) state.livePulse = cached.livePulse;
  if (Array.isArray(cached.communityReports) && cached.communityReports.length > 0) {
    mergeCloudPoints(cached.communityReports, cached.moderationMap || {}, cached.confirmCounts || {});
  }
  if (cached.savedAt) state.lastUpdatedAt = cached.savedAt;
}

function persistLocalCache(extra = {}) {
  const prev = readJsonStorage(CACHE_KEY, {});
  writeJsonStorage(CACHE_KEY, {
    ...prev,
    weather: state.weather,
    aqi: state.aqi,
    broadcast: state.broadcast,
    livePulse: state.livePulse,
    savedAt: state.lastUpdatedAt || new Date().toISOString(),
    ...extra
  });
}

function mergeCloudPoints(cloudReports = [], moderationMap = {}, confirmCounts = {}) {
  const byId = new Map();
  for (const base of SAMPLE_HUMG_POINTS) {
    const mod = moderationMap?.[base.id] || {};
    byId.set(base.id, {
      ...base,
      ...mod,
      confirmCount: Math.max(Number(base.confirmCount) || 1, 1 + (confirmCounts?.[base.id] || 0))
    });
  }
  for (const rep of cloudReports) {
    if (!rep || !rep.id || rep.status === 'hidden') continue;
    byId.set(rep.id, rep);
  }
  state.points = [...byId.values()].filter((p) => p.status !== 'hidden');
}

function updateOfflineStrip() {
  const strip = document.getElementById('offline-status-strip');
  const txt = document.getElementById('offline-status-text');
  const retryBtn = document.getElementById('btn-retry-offline-queue');
  if (!strip || !txt) return;

  const queue = readJsonStorage(OFFLINE_QUEUE_KEY, []);
  if (state.isOffline) {
    strip.hidden = false;
    txt.textContent =
      queue.length > 0
        ? `Đang mất mạng — vẫn xem được dữ liệu đã lưu. Có ${queue.length} báo cáo đang chờ tự gửi khi có sóng.`
        : `Đang mất mạng — bạn vẫn tra cứu được các điểm ngập đã lưu, nơi trú, danh sách nhà trọ và số gọi khẩn cấp.`;
    if (retryBtn) retryBtn.hidden = true;
  } else if (queue.length > 0) {
    strip.hidden = false;
    txt.textContent = `Đã có mạng trở lại — có ${queue.length} báo cáo bạn lưu lúc mất sóng đang chờ gửi.`;
    if (retryBtn) retryBtn.hidden = false;
  } else {
    strip.hidden = true;
  }
}

async function flushOfflineQueue() {
  const queue = readJsonStorage(OFFLINE_QUEUE_KEY, []);
  if (state.isOffline || queue.length === 0) return;

  const remaining = [];
  let sentCount = 0;
  for (const item of queue) {
    try {
      const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.queueId },
        body: JSON.stringify({ action: 'submit_report', ...item.payload })
      });
      if (res.ok) {
        sentCount++;
      } else {
        remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
      }
    } catch {
      remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
    }
  }
  writeJsonStorage(OFFLINE_QUEUE_KEY, remaining);
  updateOfflineStrip();
  if (sentCount > 0) {
    showToast(`Đã gửi thành công ${sentCount} báo cáo lưu tạm khi mất mạng.`);
    refreshAllLiveData();
  }
}

async function refreshAllLiveData() {
  state.isOffline = !navigator.onLine;
  updateOfflineStrip();
  if (state.isOffline) {
    renderTodayView();
    return;
  }

  const lat = state.area.lat;
  const lng = state.area.lng;

  const [weatherRes, aqiRes, commRes] = await Promise.allSettled([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,rain&daily=precipitation_sum,temperature_2m_max,uv_index_max&timezone=Asia%2FBangkok&forecast_days=2`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FBangkok`
    ).then((r) => (r.ok ? r.json() : null)),
    fetch(`${PROJECT_CONFIG.communityApiUrl || '/api/community'}?action=public_sync`).then((r) => (r.ok ? r.json() : null))
  ]);

  let updatedAny = false;
  if (weatherRes.status === 'fulfilled' && weatherRes.value?.current) {
    const c = weatherRes.value.current;
    const d = weatherRes.value.daily || {};
    state.weather = {
      temp: Number(c.temperature_2m),
      apparentTemp: Number(c.apparent_temperature),
      rainMm: Number(c.rain ?? c.precipitation ?? 0),
      dailyRainMm: Number(d.precipitation_sum?.[0] ?? 0),
      maxTempToday: Number(d.temperature_2m_max?.[0] ?? c.temperature_2m),
      uvMax: Number(d.uv_index_max?.[0] ?? 0)
    };
    updatedAny = true;
  }

  if (aqiRes.status === 'fulfilled' && aqiRes.value?.current) {
    const a = aqiRes.value.current;
    state.aqi = {
      usAqi: Number(a.us_aqi),
      pm25: Number(a.pm2_5),
      pm10: Number(a.pm10)
    };
    updatedAny = true;
  }

  let extraCache = {};
  if (commRes.status === 'fulfilled' && commRes.value?.ok) {
    const d = commRes.value;
    state.broadcast = d.broadcast || null;
    state.livePulse = d.livePulse || { byPoint: {}, recentFeed: [] };
    mergeCloudPoints(d.reports || [], d.moderationMap || {}, d.confirmCounts || {});
    extraCache = {
      communityReports: d.reports || [],
      moderationMap: d.moderationMap || {},
      confirmCounts: d.confirmCounts || {}
    };
    updatedAny = true;
  }

  if (updatedAny) {
    state.lastUpdatedAt = new Date().toISOString();
    persistLocalCache(extraCache);
  }

  renderTodayView();
  if (state.activeView === 'map') renderMapAndList();
  if (state.activeView === 'rental') renderRentalView();
}

/* =========================================================================
   3. RENDER CHỨC NĂNG 1: HÔM NAY (5 GIÂY HIỂU NGAY TÌNH HÌNH)
   ========================================================================= */
function renderTodayView() {
  const areaLabelEl = document.getElementById('current-area-label');
  if (areaLabelEl) areaLabelEl.textContent = state.area.shortName || state.area.name;

  const nearby = getNearbyCitizenHighlights(state.area.lat, state.area.lng, state.points, { radiusMeters: 1200 });
  const updatedStr = state.lastUpdatedAt ? formatTimeHm(state.lastUpdatedAt) : 'Dữ liệu sẵn có trên máy';

  const advisory = buildCitizenStatusAdvisory({
    areaName: state.area.name,
    weather: state.weather,
    aqi: state.aqi,
    livePulseFeed: state.livePulse?.recentFeed || [],
    broadcast: state.broadcast,
    nearbyFloodCount: nearby.nearbyRisks.filter((p) => p.category === 'flood').length,
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
  document.getElementById('advisory-cause').textContent = advisory.cause;
  document.getElementById('advisory-action').textContent = advisory.action;

  const srcBadge = document.getElementById('advisory-source-badge');
  const srcMeta = PLAIN_SOURCE_LABELS[advisory.sourceClass] || PLAIN_SOURCE_LABELS.FORECAST_DATA;
  srcBadge.className = `source-badge tone-${srcMeta.tone}`;
  srcBadge.textContent = srcMeta.short;
  document.getElementById('advisory-source-text').textContent = advisory.sourceType;
  document.getElementById('advisory-honesty-note').textContent = advisory.honestyNote;

  // 4 Thẻ Thời tiết, Mưa, Nắng nóng, Không khí & Phản ánh 6h
  document.getElementById('env-updated-label').textContent = `Cập nhật: ${updatedStr}`;
  if (state.weather) {
    const rainNow = state.weather.rainMm;
    const rainDay = state.weather.dailyRainMm;
    document.getElementById('env-rain-val').textContent =
      rainNow >= 0.5 ? `Đang mưa ~${rainNow.toFixed(1)} mm/giờ` : `Hiện không mưa`;
    document.getElementById('env-rain-desc').textContent =
      rainDay >= 40
        ? `Tổng mưa dự báo hôm nay khá cao (~${Math.round(rainDay)} mm) — cần đề phòng ngập các ngõ trũng.`
        : `Tổng mưa dự báo hôm nay khoảng ${Math.round(rainDay)} mm (mức nhẹ đến trung bình).`;

    const t = Math.round(state.weather.temp);
    const feel = Math.round(state.weather.apparentTemp);
    document.getElementById('env-heat-val').textContent = `${t}°C (cảm nhận ${feel}°C)`;
    document.getElementById('env-heat-desc').textContent =
      feel >= 38
        ? 'Trời rất oi nóng — hạn chế ở ngoài nắng từ 11h đến 15h, uống đủ nước.'
        : feel >= 33
          ? 'Trời hơi nóng vào buổi trưa — nên mang mũ, áo chống nắng khi di chuyển.'
          : 'Nhiệt độ ngoài trời tương đối dễ chịu.';
  } else {
    document.getElementById('env-rain-val').textContent = state.isOffline ? 'Chưa tải (đang ngoại tuyến)' : 'Đang tải...';
    document.getElementById('env-rain-desc').textContent = 'Khi có mạng trở lại, dự báo mưa theo giờ sẽ tự động hiển thị.';
    document.getElementById('env-heat-val').textContent = state.isOffline ? 'Chưa tải (đang ngoại tuyến)' : 'Đang tải...';
    document.getElementById('env-heat-desc').textContent = 'Bạn vẫn xem được các điểm nóng đã ghi nhận trên bản đồ.';
  }

  const aqiInfo = describeAqiPlain(state.aqi?.usAqi);
  document.getElementById('env-aqi-val').textContent = aqiInfo.headline;
  document.getElementById('env-aqi-desc').textContent = state.aqi
    ? `${aqiInfo.advice} (Ước tính vùng chung, không phải cảm biến tại từng ngõ).`
    : aqiInfo.advice;

  const feed = state.livePulse?.recentFeed || [];
  const floodingCount = feed.filter((x) => x.status === 'flooding').length;
  document.getElementById('env-pulse-val').textContent =
    floodingCount > 0 ? `${floodingCount} chỗ báo đang ngập` : `${feed.length} lượt cập nhật`;
  document.getElementById('env-pulse-desc').textContent =
    floodingCount > 0
      ? `Người dân vừa báo ngập tại: ${feed.filter((x) => x.status === 'flooding').slice(0, 2).map((x) => x.pointName).join(', ')}.`
      : feed.length > 0
        ? `Cập nhật gần nhất: ${feed[0].pointName} (${feed[0].status === 'receding' ? 'nước đang rút' : 'đã khô ráo'}).`
        : 'Chưa có người dân nào báo ngập trong 6 giờ qua. Bạn có thể bấm cập nhật ở các điểm bên dưới.';

  // Hộp Nơi trú có mái che & Y tế gần nhất
  const supportContainer = document.getElementById('nearest-support-cards');
  const supportItems = [];
  if (nearby.nearestMedical) supportItems.push({ roleLabel: 'Cơ sở y tế gần nhất', pt: nearby.nearestMedical });
  const altShelter = nearby.sheltersAndMedical.find((s) => s.id !== nearby.nearestMedical?.id);
  if (altShelter) supportItems.push({ roleLabel: 'Điểm có mái che / hỗ trợ gần nhất', pt: altShelter });

  supportContainer.innerHTML = supportItems
    .map(
      ({ roleLabel, pt }) => `
      <article class="place-card is-safe">
        <div class="place-card-top">
          <div>
            <span class="source-tag tone-verified">${esc(roleLabel)}</span>
            <h3 class="place-card-title" style="margin-top:6px;">${esc(pt.name)}</h3>
          </div>
          <span class="place-card-dist">${esc(formatDistancePlain(pt.distanceMeters))}</span>
        </div>
        <p class="place-card-desc">${esc((pt.notes || 'Địa điểm có mái che hoặc hỗ trợ sơ cứu gần khu vực bạn chọn.').slice(0, 150))}</p>
        <div class="place-card-actions">
          <button type="button" class="btn btn-sm btn-primary js-route-to-point" data-ptid="${esc(pt.id)}">Tìm đường tới đây</button>
          <button type="button" class="btn btn-sm btn-secondary js-view-on-map" data-ptid="${esc(pt.id)}">Xem trên bản đồ</button>
        </div>
      </article>`
    )
    .join('');

  // Top 4 điểm rủi ro gần khu vực đang chọn (đọc ngay dưới dạng thẻ dễ hiểu)
  const riskContainer = document.getElementById('nearby-risk-list');
  const topRisks = nearby.nearbyRisks.slice(0, 4);
  if (topRisks.length === 0) {
    riskContainer.innerHTML = `<div class="card-panel"><p class="muted-body">Chưa có điểm rủi ro nào được ghi nhận trong phạm vi 1,2 km quanh vị trí này. Bạn có thể mở Bản đồ để xem toàn khu vực hoặc bấm Báo sự cố nếu thấy điểm ngập mới.</p></div>`;
  } else {
    riskContainer.innerHTML = topRisks.map((pt) => renderPlaceCardHtml(pt, { showCheckin: true })).join('');
  }
}

function renderPlaceCardHtml(pt, { showCheckin = false } = {}) {
  const ver = describePointVerificationPlain(pt);
  const pulse = state.livePulse?.byPoint?.[pt.id];
  const cardType = pt.layerGroup === 'safe' ? 'is-safe' : pt.category === 'heat' ? 'is-heat' : 'is-risk';
  const catLabel =
    pt.layerGroup === 'safe'
      ? pt.category === 'medical'
        ? 'Cơ sở y tế'
        : 'Nơi trú có mái che'
      : pt.category === 'heat'
        ? 'Nắng gắt / thiếu bóng mát'
        : pt.category === 'traffic'
          ? 'Đường nguy hiểm'
          : 'Hay ngập khi mưa to';

  const pulseTag = pulse
    ? `<span class="source-tag ${pulse.status === 'flooding' ? 'tone-community' : 'tone-verified'}">Người dân báo: ${
        pulse.status === 'flooding' ? 'Đang ngập' : pulse.status === 'receding' ? 'Nước đang rút' : 'Đã khô ráo'
      }</span>`
    : '';

  const distText = Number.isFinite(pt.distanceMeters)
    ? formatDistancePlain(pt.distanceMeters)
    : formatDistancePlain(haversineMeters(state.area.lat, state.area.lng, Number(pt.lat), Number(pt.lng)));

  return `
    <article class="place-card ${cardType}">
      <div class="place-card-top">
        <h3 class="place-card-title">${esc(pt.name)}</h3>
        <span class="place-card-dist">${esc(distText)}</span>
      </div>
      <div class="place-card-meta">
        <span class="source-tag ${pt.layerGroup === 'safe' ? 'tone-verified' : 'tone-community'}">${esc(catLabel)}</span>
        <span class="source-tag tone-${ver.badgeTone}">${esc(ver.label)}</span>
        ${pulseTag}
      </div>
      <p class="place-card-desc">${esc((pt.notes || 'Đã được ghi nhận trên hệ thống bản đồ cộng đồng.').slice(0, 175))}</p>
      <div class="place-card-actions">
        <button type="button" class="btn btn-sm btn-secondary js-view-on-map" data-ptid="${esc(pt.id)}">Xem trên bản đồ</button>
        <button type="button" class="btn btn-sm btn-secondary js-route-to-point" data-ptid="${esc(pt.id)}">Tìm đường tới đây</button>
      </div>
      ${
        showCheckin && pt.layerGroup === 'risk'
          ? `<div class="checkin-bar">
               <span class="checkin-label">Bạn vừa đi qua đây? Cập nhật tình trạng lúc này:</span>
               <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="flooding">Đang ngập</button>
               <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="receding">Đang rút</button>
               <button type="button" class="checkin-btn js-live-checkin" data-ptid="${esc(pt.id)}" data-ptname="${esc(pt.name)}" data-status="clear">Khô ráo</button>
             </div>`
          : ''
      }
    </article>`;
}

async function handleLiveCheckin(pointId, pointName, status) {
  const statusVi = status === 'flooding' ? 'Đang ngập' : status === 'receding' ? 'Đang rút' : 'Khô ráo';
  if (state.isOffline) {
    showToast('Đang mất mạng — bạn cần có sóng để gửi cập nhật tình trạng tức thì.');
    return;
  }
  try {
    const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'live_checkin', pointId, pointName, status })
    });
    const data = await res.json();
    if (data?.ok) {
      if (data.livePulse) state.livePulse = data.livePulse;
      persistLocalCache();
      renderTodayView();
      if (state.activeView === 'map') renderMapAndList();
      showToast(`Đã cập nhật "${statusVi}" cho ${pointName}. Cảm ơn bạn đã chia sẻ!`);
    } else {
      showToast(data?.error || 'Chưa cập nhật được lúc này, bạn thử lại sau ít phút nhé.');
    }
  } catch {
    showToast('Kết nối mạng yếu, chưa gửi được cập nhật tình trạng.');
  }
}

/* =========================================================================
   4. CHỨC NĂNG 2: BẢN ĐỒ AN TOÀN (BẢN ĐỒ + DANH SÁCH SONG HÀNH)
   ========================================================================= */
function ensureMainMap() {
  if (mainMap || typeof window.L === 'undefined') return;
  mainMap = window.L.map('citizen-map', { zoomControl: true }).setView([state.area.lat, state.area.lng], 15);
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mainMap);
  mainSimLayer = window.L.layerGroup().addTo(mainMap);
  mainMarkersLayer = window.L.layerGroup().addTo(mainMap);
}

function getFilteredMapPoints() {
  const q = state.mapSearch.trim().toLowerCase();
  return state.points
    .map((p) => ({
      ...p,
      distanceMeters: haversineMeters(state.area.lat, state.area.lng, Number(p.lat), Number(p.lng))
    }))
    .filter((p) => {
      if (state.mapFilter === 'flood' && !(p.layerGroup === 'risk' && (p.category === 'flood' || p.category === 'traffic'))) return false;
      if (state.mapFilter === 'safe' && p.layerGroup !== 'safe') return false;
      if (state.mapFilter === 'heat' && p.category !== 'heat') return false;
      if (q) {
        const hay = `${p.name || ''} ${p.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function renderMapAndList() {
  const all = state.points;
  const countFlood = all.filter((p) => p.layerGroup === 'risk' && (p.category === 'flood' || p.category === 'traffic')).length;
  const countSafe = all.filter((p) => p.layerGroup === 'safe').length;
  const countHeat = all.filter((p) => p.category === 'heat').length;

  document.getElementById('mf-count-all').textContent = String(all.length);
  document.getElementById('mf-count-flood').textContent = String(countFlood);
  document.getElementById('mf-count-safe').textContent = String(countSafe);
  document.getElementById('mf-count-heat').textContent = String(countHeat);

  const filtered = getFilteredMapPoints();
  document.getElementById('map-list-count-title').textContent = `${filtered.length} địa điểm phù hợp`;

  const listEl = document.getElementById('map-places-list');
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="card-panel"><p class="muted-body">Không tìm thấy địa điểm khớp từ khóa "${esc(state.mapSearch)}". Hãy thử xóa từ khóa hoặc đổi bộ lọc.</p></div>`;
  } else {
    listEl.innerHTML = filtered.slice(0, 40).map((pt) => renderPlaceCardHtml(pt, { showCheckin: true })).join('');
  }

  if (!mainMap || !mainMarkersLayer) return;
  mainMarkersLayer.clearLayers();
  mainSimLayer.clearLayers();

  if (mainUserPin) mainUserPin.remove();
  mainUserPin = window.L.circleMarker([state.area.lat, state.area.lng], {
    radius: 8,
    color: '#0c665e',
    weight: 3,
    fillColor: '#ffffff',
    fillOpacity: 1
  })
    .bindTooltip(`Vị trí đang xem: ${state.area.shortName || state.area.name}`)
    .addTo(mainMap);

  if (state.showSimZones) {
    for (const fc of FLOOD_STREET_CORRIDORS) {
      if (!Array.isArray(fc.coords) || fc.coords.length < 2) continue;
      window.L.polyline(fc.coords, {
        color: '#6d28d9',
        weight: 6,
        opacity: 0.55,
        dashArray: '8 6'
      })
        .bindPopup(
          `<strong>${esc(fc.name)}</strong><br><span style="color:#5b21b6;font-weight:700;">Mô phỏng tham khảo (không phải ngập thực tế lúc này)</span><br>Lịch sử thường ghi nhận ngập khi mưa lớn.`
        )
        .addTo(mainSimLayer);
    }
  }

  for (const pt of filtered) {
    const color =
      pt.layerGroup === 'safe'
        ? '#146c43'
        : pt.category === 'heat' || pt.confidenceTier === 'C'
          ? '#d97706'
          : '#b42318';

    const marker = window.L.circleMarker([Number(pt.lat), Number(pt.lng)], {
      radius: 9,
      color: '#ffffff',
      weight: 2.5,
      fillColor: color,
      fillOpacity: 0.94
    });

    marker.on('click', () => showMapDetailCard(pt));
    marker.addTo(mainMarkersLayer);
  }
}

function showMapDetailCard(pt) {
  const box = document.getElementById('map-selected-card');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <strong>Chi tiết địa điểm đã chọn</strong>
      <button type="button" id="btn-close-map-detail" class="text-btn" style="padding:2px 6px;">Đóng</button>
    </div>
    ${renderPlaceCardHtml(pt, { showCheckin: true })}
  `;
  document.getElementById('btn-close-map-detail')?.addEventListener('click', () => {
    box.hidden = true;
  });
}

function jumpToPointOnMap(pointId) {
  const pt = state.points.find((p) => p.id === pointId);
  if (!pt) return;
  state.mapFilter = 'all';
  state.mapSearch = '';
  state.mapMobileMode = 'map';
  const layout = document.getElementById('map-split-layout');
  if (layout) layout.dataset.mobileMode = 'map';
  document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b.dataset.mapMode === 'map'));
  document.querySelectorAll('[data-map-filter]').forEach((b) => b.classList.toggle('is-active', b.dataset.mapFilter === 'all'));
  const searchInput = document.getElementById('map-search-input');
  if (searchInput) searchInput.value = '';

  switchView('map');
  setTimeout(() => {
    if (mainMap) {
      mainMap.setView([Number(pt.lat), Number(pt.lng)], 16);
    }
    showMapDetailCard(pt);
  }, 100);
}

/* =========================================================================
   5. CHỨC NĂNG 3: TÌM ĐƯỜNG (SO SÁNH ĐƯỜNG THƯỜNG VS ÍT RỦI RO HƠN)
   ========================================================================= */
function populateRouteSelectors() {
  const startSel = document.getElementById('route-start-select');
  const endSel = document.getElementById('route-end-select');
  if (!startSel || !endSel) return;

  const safeOpts = state.points.filter((p) => p.layerGroup === 'safe').slice(0, 6);
  const options = [
    ...CITIZEN_LANDMARKS.map((lm) => ({ key: lm.id, label: lm.name, lat: lm.lat, lng: lm.lng })),
    ...safeOpts.map((s) => ({ key: s.id, label: `[Nơi trú/Y tế] ${s.name}`, lat: Number(s.lat), lng: Number(s.lng) }))
  ];

  const html = options
    .map((o) => `<option value="${esc(o.key)}" data-lat="${o.lat}" data-lng="${o.lng}">${esc(o.label)}</option>`)
    .join('');
  startSel.innerHTML = html;
  endSel.innerHTML = html;
  startSel.value = 'lm-humg';
  endSel.value = 'lm-cau-noi';
}

async function resolveRouteEndpoint(selectId, customInputId) {
  const customVal = (document.getElementById(customInputId)?.value || '').trim();
  if (customVal.length >= 2) {
    const q = customVal.toLowerCase();
    const localHit =
      CITIZEN_LANDMARKS.find((lm) => lm.name.toLowerCase().includes(q) || lm.shortName.toLowerCase().includes(q)) ||
      state.points.find((p) => (p.name || '').toLowerCase().includes(q));
    if (localHit) {
      return { name: localHit.name, lat: Number(localHit.lat), lng: Number(localHit.lng) };
    }
    if (!state.isOffline) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&viewbox=105.72,21.12,105.82,21.02&bounded=1&q=${encodeURIComponent(customVal + ' Hà Nội')}`
        );
        const arr = res.ok ? await res.json() : [];
        if (arr[0]) {
          return { name: customVal, lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
        }
      } catch {
        // rơi về lựa chọn dropdown bên dưới
      }
    }
  }

  const sel = document.getElementById(selectId);
  const opt = sel?.selectedOptions?.[0];
  return {
    name: opt?.textContent || 'ĐH Mỏ - Địa chất',
    lat: Number(opt?.dataset?.lat || HUMG_CENTER.lat),
    lng: Number(opt?.dataset?.lng || HUMG_CENTER.lng)
  };
}

async function fetchOsrmGeometry(waypoints, travelMode) {
  if (state.isOffline) return null;
  const profile = travelMode === 'foot' ? 'foot' : 'driving';
  const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson&steps=true`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.routes?.[0];
    if (!r?.geometry?.coordinates) return null;
    const speedFactor = travelMode === 'foot' ? 1 : 1.15;
    return {
      coordsLngLat: r.geometry.coordinates,
      distanceKm: Math.round((r.distance / 1000) * 100) / 100,
      durationMin: Math.max(2, Math.round((r.duration / 60) * speedFactor)),
      steps: (r.legs || []).flatMap((l) =>
        (l.steps || [])
          .filter((s) => s.name)
          .map((s) => `Đi theo ${s.name} (${Math.round(s.distance)} m)`)
      )
    };
  } catch {
    return null;
  }
}

function buildFallbackStraightRoute(start, end, travelMode, via = null) {
  const pts = via ? [start, via, end] : [start, end];
  let distM = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    distM += haversineMeters(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
  }
  const roadM = Math.round(distM * 1.25);
  const speedMPerMin = travelMode === 'foot' ? 75 : 320;
  return {
    coordsLngLat: pts.map((p) => [p.lng, p.lat]),
    distanceKm: Math.round((roadM / 1000) * 100) / 100,
    durationMin: Math.max(2, Math.round(roadM / speedMPerMin)),
    steps: [`Đang ước tính ngoại tuyến theo hành lang từ ${start.name} tới ${end.name} (khoảng ${(roadM / 1000).toFixed(1)} km).`]
  };
}

async function runCitizenRouteComparison(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-compare-routes');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang so sánh tuyến đường...';
  }

  try {
    const start = await resolveRouteEndpoint('route-start-select', 'route-start-custom');
    const end = await resolveRouteEndpoint('route-end-select', 'route-end-custom');

    // Các trục vòng tránh vùng trũng (tính cả trục Đông Phạm Văn Đồng, trục Bắc Lê Văn Hiến & trục Tây Thăng Long/Tây Tựu)
    const highWaypoints = [
      { name: 'Trục Phạm Văn Đồng – Xuân Đỉnh', lat: 21.0698, lng: 105.7862 },
      { name: 'Trục Lê Văn Hiến – Đức Thắng', lat: 21.0769, lng: 105.7764 },
      { name: 'Trục Tây Thăng Long – Đống Ba', lat: 21.0672, lng: 105.7618 }
    ];
    const directGeom =
      (await fetchOsrmGeometry(
        [
          [start.lat, start.lng],
          [end.lat, end.lng]
        ],
        state.travelMode
      )) || buildFallbackStraightRoute(start, end, state.travelMode);

    const directEval = analyzePolylineCorridor(window.turf, directGeom.coordsLngLat, state.points, 125);

    let bestDetourGeom = null;
    let bestDetourEval = null;
    for (const wp of highWaypoints) {
      const candidate =
        (await fetchOsrmGeometry(
          [
            [start.lat, start.lng],
            [wp.lat, wp.lng],
            [end.lat, end.lng]
          ],
          state.travelMode
        )) || buildFallbackStraightRoute(start, end, state.travelMode, wp);
      const ev = analyzePolylineCorridor(window.turf, candidate.coordsLngLat, state.points, 125);
      if (
        !bestDetourEval ||
        ev.nearbyRisks.length < bestDetourEval.nearbyRisks.length ||
        (ev.nearbyRisks.length === bestDetourEval.nearbyRisks.length && candidate.distanceKm < bestDetourGeom.distanceKm)
      ) {
        bestDetourGeom = candidate;
        bestDetourEval = ev;
      }
    }

    const liveFloodIds = new Set(
      (state.livePulse?.recentFeed || []).filter((x) => x.status === 'flooding').map((x) => x.pointId)
    );

    const comparison = buildHonestRouteComparison({
      originName: start.name,
      destName: end.name,
      travelMode: state.travelMode,
      directRoute: {
        distanceKm: directGeom.distanceKm,
        durationMin: directGeom.durationMin,
        risks: directEval.nearbyRisks
      },
      detourRoute: bestDetourGeom
        ? {
            distanceKm: bestDetourGeom.distanceKm,
            durationMin: bestDetourGeom.durationMin,
            risks: bestDetourEval.nearbyRisks
          }
        : null,
      liveFloodPointIds: liveFloodIds
    });

    const out = document.getElementById('route-comparison-output');
    out.hidden = false;

    document.getElementById('route-reason-banner').innerHTML = `
      <strong>Gợi ý cho chặng ${esc(start.name)} → ${esc(end.name)}:</strong><br>
      ${esc(comparison.reason)}
    `;

    const recDetour = comparison.recommendation === 'detour';
    const dRisk = comparison.directSummary.riskCount;
    const aRisk = comparison.detourSummary.riskCount;
    const detourCompareDesc =
      aRisk === 0
        ? 'Tránh được toàn bộ các đoạn trũng đã ghi nhận ngập trên tuyến thẳng.'
        : aRisk < dRisk
          ? `Đi gần <strong>${aRisk} vị trí</strong> rủi ro (${esc(comparison.detourSummary.riskNames.join(', '))}) — ít hơn tuyến ngắn nhất (${dRisk} vị trí).`
          : aRisk === dRisk
            ? `Đi gần <strong>${aRisk} vị trí</strong> rủi ro (${esc(comparison.detourSummary.riskNames.join(', '))}) — tương đương tuyến thẳng; khi mưa lớn nên cân nhắc chờ nước rút.`
            : `Nhánh vòng dự phòng này vẫn đi qua <strong>${aRisk} vị trí</strong> từng ghi nhận ngập (${esc(comparison.detourSummary.riskNames.join(', '))}) — không giảm thêm điểm rủi ro so với tuyến thẳng.`;

    document.getElementById('route-compare-cards').innerHTML = `
      <article class="route-option-card ${!recDetour ? 'is-recommended' : ''}">
        <span class="source-tag ${dRisk > 0 ? 'tone-community' : 'tone-verified'}">Tuyến đường thông thường</span>
        <div class="route-metrics">
          <span>${comparison.directSummary.distanceKm} km</span>
          <span>~${comparison.directSummary.durationMin} phút (${comparison.modeLabel})</span>
        </div>
        <p class="muted-body">
          ${
            dRisk > 0
              ? `Đi gần <strong>${dRisk} vị trí</strong> từng ghi nhận ngập/rủi ro: ${esc(comparison.directSummary.riskNames.join(', '))}.`
              : 'Không đi sát điểm ngập đã ghi nhận nào trong hệ thống.'
          }
        </p>
      </article>

      <article class="route-option-card ${recDetour ? 'is-recommended' : ''}">
        <span class="source-tag ${aRisk < dRisk ? 'tone-verified' : 'tone-model'}">${aRisk < dRisk ? 'Tuyến ít rủi ro hơn (Đề xuất)' : 'Tuyến đi vòng tham khảo'}</span>
        <div class="route-metrics">
          <span>${comparison.detourSummary.distanceKm} km</span>
          <span>~${comparison.detourSummary.durationMin} phút (${comparison.modeLabel})</span>
        </div>
        <p class="muted-body">${detourCompareDesc}</p>
      </article>
    `;

    document.getElementById('route-honesty-banner').textContent = comparison.cannotGuaranteeSafeNotice;

    // Vẽ 2 tuyến lên bản đồ so sánh nhỏ (nền OpenStreetMap không cần API key)
    if (typeof window.L !== 'undefined') {
      if (!routeMap) {
        routeMap = window.L.map('route-mini-map').setView([start.lat, start.lng], 14);
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(routeMap);
        routeLinesLayer = window.L.layerGroup().addTo(routeMap);
      }
      routeLinesLayer.clearLayers();
      const directLatLngs = directGeom.coordsLngLat.map(([ln, la]) => [la, ln]);
      const detourLatLngs = bestDetourGeom.coordsLngLat.map(([ln, la]) => [la, ln]);

      const l1 = window.L.polyline(directLatLngs, {
        color: comparison.directSummary.riskCount > 0 ? '#b42318' : '#64748b',
        weight: 5,
        dashArray: '8 6'
      }).addTo(routeLinesLayer);
      const l2 = window.L.polyline(detourLatLngs, { color: '#146c43', weight: 6, opacity: 0.9 }).addTo(routeLinesLayer);
      window.L.circleMarker([start.lat, start.lng], { radius: 7, color: '#0c665e', fillColor: '#fff', fillOpacity: 1 }).addTo(routeLinesLayer);
      window.L.circleMarker([end.lat, end.lng], { radius: 7, color: '#b42318', fillColor: '#fff', fillOpacity: 1 }).addTo(routeLinesLayer);

      const bounds = window.L.featureGroup([l1, l2]).getBounds();
      setTimeout(() => {
        routeMap.invalidateSize();
        if (bounds.isValid()) routeMap.fitBounds(bounds, { padding: [24, 24] });
      }, 80);
    }

    const stepsToShow = recDetour ? bestDetourGeom.steps : directGeom.steps;
    const stepsCard = document.getElementById('route-steps-card');
    const stepsList = document.getElementById('route-steps-list');
    if (stepsToShow && stepsToShow.length > 0) {
      stepsCard.hidden = false;
      stepsList.innerHTML = stepsToShow.slice(0, 12).map((s) => `<li>${esc(s)}</li>`).join('');
    } else {
      stepsCard.hidden = true;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'So sánh tuyến đường';
    }
  }
}

/* =========================================================================
   6. CHỨC NĂNG 4: KIỂM TRA KHU VỰC NHÀ TRỌ (DỮ LIỆU THỰC + CHECKLIST 12 MỤC)
   ========================================================================= */
function renderRentalQuickChips() {
  const wrap = document.getElementById('rental-quick-chips');
  if (!wrap) return;
  wrap.innerHTML = CITIZEN_LANDMARKS.map(
    (lm) => `<button type="button" class="prompt-chip js-rental-landmark" data-lmid="${esc(lm.id)}">${esc(lm.shortName)}</button>`
  ).join('');
}

function renderRentalView() {
  const summary = buildHonestRentalAreaSummary(
    state.rentalArea.lat,
    state.rentalArea.lng,
    state.rentalArea.name,
    state.points
  );

  document.getElementById('rental-area-heading').textContent = `Dữ liệu hiện có quanh ${summary.areaLabel}`;
  document.getElementById('rental-observations-list').innerHTML = summary.observations
    .map((line) => `<li>${esc(line)}</li>`)
    .join('');

  const risksWrap = document.getElementById('rental-nearby-risks');
  const combined = [...summary.floodNearby.slice(0, 3), ...summary.heatNearby.slice(0, 2)];
  risksWrap.innerHTML =
    combined.length > 0
      ? combined.map((pt) => renderPlaceCardHtml(pt, { showCheckin: false })).join('')
      : '';

  document.getElementById('rental-epistemic-warning').textContent = summary.epistemicWarning;

  // Render Checklist 12 mục gom theo 4 nhóm
  const saved = readJsonStorage(CHECKLIST_KEY, { checked: {}, note: '' });
  const groups = new Map();
  for (const item of RENTAL_INSPECTION_CHECKLIST) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }

  const groupsEl = document.getElementById('rental-checklist-groups');
  groupsEl.innerHTML = [...groups.entries()]
    .map(
      ([groupName, items]) => `
      <div class="checklist-group-box">
        <strong class="checklist-group-title">${esc(groupName)}</strong>
        ${items
          .map((item) => {
            const isChecked = Boolean(saved.checked?.[item.id]);
            return `
              <label class="checklist-item ${isChecked ? 'is-checked' : ''}">
                <input type="checkbox" class="js-rental-chk" data-chkid="${esc(item.id)}" ${isChecked ? 'checked' : ''}>
                <div>
                  <strong>${esc(item.title)}</strong>
                  <span>${esc(item.detail)}</span>
                </div>
              </label>`;
          })
          .join('')}
      </div>`
    )
    .join('');

  const noteEl = document.getElementById('rental-personal-note');
  if (noteEl && noteEl.value !== (saved.note || '')) {
    noteEl.value = saved.note || '';
  }
  updateRentalChecklistProgress();
}

function updateRentalChecklistProgress() {
  const saved = readJsonStorage(CHECKLIST_KEY, { checked: {}, note: '' });
  const doneCount = RENTAL_INSPECTION_CHECKLIST.filter((i) => saved.checked?.[i.id]).length;
  const badge = document.getElementById('checklist-progress-badge');
  if (badge) badge.textContent = `Đã kiểm tra ${doneCount}/${RENTAL_INSPECTION_CHECKLIST.length} mục`;
}

function lookupRentalAreaFromInput() {
  const raw = (document.getElementById('rental-search-input')?.value || '').trim();
  if (!raw) return;
  const q = raw.toLowerCase();
  const lm = CITIZEN_LANDMARKS.find((x) => x.name.toLowerCase().includes(q) || x.shortName.toLowerCase().includes(q));
  if (lm) {
    state.rentalArea = { ...lm };
    renderRentalView();
    return;
  }
  const pt = state.points.find((p) => (p.name || '').toLowerCase().includes(q));
  if (pt) {
    state.rentalArea = { name: pt.name, shortName: pt.name, lat: Number(pt.lat), lng: Number(pt.lng) };
    renderRentalView();
    return;
  }
  showToast(`Chưa thấy mốc khớp "${raw}" trong bán kính Đông Ngạc — hãy chọn nhanh một khu vực bên dưới.`);
}

/* =========================================================================
   7. CHỨC NĂNG 5: BÁO CÁO CỘNG ĐỒNG NGẮN GỌN + XÓA EXIF + HÀNG ĐỢI OFFLINE
   ========================================================================= */
function initReportFormHelpers() {
  const lmSel = document.getElementById('rep-landmark-select');
  if (lmSel) {
    lmSel.innerHTML =
      '<option value="">Hoặc chọn gần mốc quen thuộc...</option>' +
      CITIZEN_LANDMARKS.map(
        (lm) => `<option value="${esc(lm.id)}" data-lat="${lm.lat}" data-lng="${lm.lng}">${esc(lm.name)}</option>`
      ).join('');
  }
}

async function stripExifClientSide(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp không phải ảnh hợp lệ.'));
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

function toggleReportPickMap() {
  const wrap = document.getElementById('rep-mini-map-wrap');
  if (!wrap) return;
  wrap.hidden = !wrap.hidden;
  if (!wrap.hidden && typeof window.L !== 'undefined') {
    if (!reportMap) {
      reportMap = window.L.map('report-pick-map').setView([state.reportPin.lat, state.reportPin.lng], 15);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(reportMap);
      reportMarker = window.L.circleMarker([state.reportPin.lat, state.reportPin.lng], {
        radius: 9,
        color: '#b42318',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1
      }).addTo(reportMap);
      reportMap.on('click', (ev) => {
        state.reportPin = { lat: ev.latlng.lat, lng: ev.latlng.lng, source: 'vị trí bạn vừa chấm trên bản đồ' };
        reportMarker.setLatLng(ev.latlng);
        document.getElementById('rep-location-status').textContent =
          'Đã chọn điểm trên bản đồ (hệ thống tự làm tròn khoảng 20 m để bảo vệ nhà riêng).';
      });
    }
    setTimeout(() => reportMap.invalidateSize(), 60);
  }
}

async function handleCitizenReportSubmit(e) {
  e.preventDefault();
  const feedback = document.getElementById('rep-form-feedback');
  const locName = (document.getElementById('rep-location-name')?.value || '').trim();
  const consent = document.getElementById('rep-consent')?.checked;
  const category = document.querySelector('input[name="repCategory"]:checked')?.value || 'flood';
  const waterScale = category === 'flood' ? document.getElementById('rep-water-scale')?.value || 'half_wheel' : 'none';
  const notes = (document.getElementById('rep-notes')?.value || '').trim();

  if (locName.length < 3) {
    feedback.hidden = false;
    feedback.className = 'form-feedback is-error';
    feedback.textContent = 'Vui lòng nhập tên đường, ngõ hoặc mốc dễ nhận biết (ít nhất 3 ký tự).';
    document.getElementById('rep-location-name')?.focus();
    return;
  }
  if (!consent) {
    feedback.hidden = false;
    feedback.className = 'form-feedback is-error';
    feedback.textContent = 'Vui lòng tích ô xác nhận đồng ý chia sẻ ẩn danh trước khi gửi.';
    document.getElementById('rep-consent')?.focus();
    return;
  }

  const safeLat = roundPrivacyCoord(state.reportPin.lat, true);
  const safeLng = roundPrivacyCoord(state.reportPin.lng, true);

  const payload = {
    name: locName,
    category,
    lat: safeLat,
    lng: safeLng,
    waterScale,
    notes,
    photoDataUrl: state.reportPhotoDataUrl || '',
    photoQualityFlag: state.reportPhotoFlag || 'ok',
    reporterRole: 'Cư dân chia sẻ trên Web'
  };

  const submitBtn = document.getElementById('btn-submit-citizen-report');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang gửi báo cáo...';

  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const res = await fetch(PROJECT_CONFIG.communityApiUrl || '/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit_report', ...payload })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      feedback.hidden = false;
      feedback.className = 'form-feedback is-error';
      feedback.textContent = data?.error || 'Không gửi được báo cáo. Vui lòng kiểm tra vị trí thuộc khu vực Đông Ngạc.';
      return;
    }

    if (data.report) {
      state.points.unshift(data.report);
      persistLocalCache();
    }
    feedback.hidden = false;
    feedback.className = 'form-feedback is-ok';
    feedback.textContent =
      'Đã tiếp nhận báo cáo của bạn! Điểm này sẽ hiển thị với nhãn “Phản ánh từ người dân (chờ kiểm chứng thêm)” và không lưu thông tin cá nhân của bạn.';
    document.getElementById('citizen-report-form').reset();
    state.reportPhotoDataUrl = '';
    document.getElementById('rep-photo-status').hidden = true;
    renderTodayView();
    showToast('Cảm ơn bạn đã báo sự cố giúp cộng đồng!');
  } catch {
    // Lưu hàng đợi ngoại tuyến an toàn khi mất sóng 4G
    const queue = readJsonStorage(OFFLINE_QUEUE_KEY, []);
    queue.push(createOfflineReportQueueItem(payload));
    writeJsonStorage(OFFLINE_QUEUE_KEY, queue);
    updateOfflineStrip();
    feedback.hidden = false;
    feedback.className = 'form-feedback is-ok';
    feedback.textContent =
      'Đang mất mạng — báo cáo của bạn đã được lưu tạm an toàn trên máy và sẽ tự gửi ngay khi có kết nối Internet.';
    document.getElementById('citizen-report-form').reset();
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Gửi báo cáo cho cộng đồng';
  }
}

/* =========================================================================
   8. TRỢ LÝ GIẢI THÍCH BẰNG TIẾNG VIỆT (ONLINE AI + OFFLINE GROUNDED)
   ========================================================================= */
async function askCitizenAssistant(questionText) {
  const q = String(questionText || '').trim();
  const outBox = document.getElementById('assistant-answer-box');
  if (!outBox || q.length < 3) return;

  outBox.hidden = false;
  outBox.innerHTML = `<p class="muted-body">Đang tra cứu dữ liệu hiện có và chuẩn bị câu trả lời dễ hiểu...</p>`;

  const updatedStr = state.lastUpdatedAt ? formatTimeHm(state.lastUpdatedAt) : 'Dữ liệu lưu sẵn trên máy';

  // Luôn sẵn sàng trả lời từ kho dữ liệu thật ngay cả khi mất mạng hoặc API AI bận
  try {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const res = await fetch('/api/ai-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ask_copilot',
        question: q,
        liveWeather: state.weather,
        liveAqi: state.aqi
      })
    });
    const data = await res.json();
    if (res.ok && data?.ok && data.answer) {
      const citedBtns = (data.citedPointIds || [])
        .map((id) => {
          const pt = state.points.find((p) => p.id === id);
          return pt
            ? `<button type="button" class="prompt-chip js-view-on-map" data-ptid="${esc(pt.id)}">Xem ${esc(pt.name)}</button>`
            : '';
        })
        .filter(Boolean)
        .join('');

      outBox.innerHTML = `
        <div class="place-card-meta">
          <span class="source-tag tone-verified">Giải thích từ dữ liệu hiện có</span>
          <span class="muted-meta">Dữ liệu cập nhật: ${esc(updatedStr)}</span>
        </div>
        <div class="assistant-answer-text">${esc(data.answer)}</div>
        ${citedBtns ? `<div class="prompt-chips-wrap">${citedBtns}</div>` : ''}
        <p class="honesty-note">
          Lưu ý: Trợ lý chỉ tổng hợp dữ liệu đã ghi nhận và dự báo hiện có — không thay thế cảnh báo chính thức và không thể quan sát trực tiếp mặt đường lúc này.
        </p>
      `;
      return;
    }
    throw new Error('FALLBACK_LOCAL');
  } catch {
    const localAns = synthesizeSituationalAnswer(q, state.points, state.weather);
    const cleanCitizenText = (txt) =>
      String(txt || '')
        .replace(/Bấm nút\s*[“"]Phân tích\s*&\s*Vẽ lộ trình OSRM[”"]\s*bên dưới/gi, 'Mở mục “Tìm đường” để so sánh tuyến ít rủi ro hơn')
        .replace(/\bOSRM\b/g, 'tìm đường')
        .replace(/\bCopernicus DEM(?: GLO-30)?\b/gi, 'địa hình khu vực')
        .replace(/\bDEM\s*[\d–\-.,]+\s*m\b/gi, 'vùng trũng thấp')
        .replace(/\bDEM\b/g, 'địa hình')
        .replace(/\bECMWF ERA5\b/gi, 'lịch sử thời tiết khu vực')
        .replace(/\bERA5\b/gi, 'lịch sử thời tiết')
        .replace(/\bDSM\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    const lines = [
      localAns?.headline ? `• ${cleanCitizenText(localAns.headline)}` : '',
      ...(Array.isArray(localAns?.bullets) ? localAns.bullets.map((b) => `• ${cleanCitizenText(b)}`) : []),
      localAns?.recommendedSafePt
        ? `• Điểm trú / y tế gần liên quan: ${localAns.recommendedSafePt.name} (cách khoảng ${Math.round(localAns.recommendedSafePt.distanceMeters)} m).`
        : ''
    ].filter(Boolean);

    outBox.innerHTML = `
      <div class="place-card-meta">
        <span class="source-tag tone-model">Trả lời từ dữ liệu đã lưu sẵn trên máy</span>
        <span class="muted-meta">Dữ liệu cập nhật: ${esc(updatedStr)}</span>
      </div>
      <div class="assistant-answer-text">${esc(lines.join('\n') || 'Hiện chưa tìm thấy dữ liệu khớp trực tiếp câu hỏi này. Bạn hãy mở mục Bản đồ hoặc Tìm đường để xem chi tiết từng đoạn đường.')}</div>
      <p class="honesty-note">
        Lưu ý: Đây là giải thích tự động từ dữ liệu điểm ngập &amp; nơi trú đã lưu sẵn, không thay thế cảnh báo chính thức của cơ quan chức năng.
      </p>
    `;
  }
}

/* =========================================================================
   9. HỘP THOẠI VỊ TRÍ (XIN GPS ĐÚNG THỜI ĐIỂM) & DANH BẠ KHẨN CẤP
   ========================================================================= */
function renderLocationAndEmergencyLists() {
  const lmWrap = document.getElementById('landmark-picker-list');
  if (lmWrap) {
    lmWrap.innerHTML = CITIZEN_LANDMARKS.map(
      (lm) => `
      <button type="button" class="landmark-option ${lm.id === state.area.id ? 'is-active' : ''}" data-pick-area="${esc(lm.id)}">
        <strong>${esc(lm.shortName)}</strong>
        <span>${esc(lm.name)}</span>
      </button>`
    ).join('');
  }

  const emergencyCards = EMERGENCY_DIRECTORY.slice(0, 4)
    .map(
      (e) => `
      <a class="emerg-call-btn" href="tel:${esc(e.phone.replace(/\s+/g, ''))}">
        <strong>${esc(e.phone)}</strong>
        <span>${esc(e.org)}</span>
      </a>`
    )
    .join('');

  const todayEmerg = document.getElementById('today-emergency-grid');
  if (todayEmerg) todayEmerg.innerHTML = emergencyCards;

  const dialogEmerg = document.getElementById('emergency-dialog-list');
  if (dialogEmerg) {
    dialogEmerg.innerHTML = EMERGENCY_DIRECTORY.map(
      (e) => `
      <a class="emerg-call-btn" href="tel:${esc(e.phone.replace(/\s+/g, ''))}">
        <strong>${esc(e.phone)} — ${esc(e.org)}</strong>
        <span>${esc(e.address || '')}</span>
      </a>`
    ).join('');
  }
}

function requestUserGps(onSuccess, onStatusText) {
  if (!('geolocation' in navigator)) {
    onStatusText?.('Thiết bị này không hỗ trợ định vị GPS. Bạn hãy chọn một địa điểm quen thuộc trong danh sách.');
    return;
  }
  onStatusText?.('Đang lấy vị trí hiện tại của bạn...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onSuccess(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      onStatusText?.('Chưa lấy được GPS (có thể bạn chưa cấp quyền). Bạn vẫn dùng đầy đủ mọi tính năng bằng cách chọn địa điểm thủ công.');
    },
    { enableHighAccuracy: false, timeout: 7000, maximumAge: 60000 }
  );
}

/* =========================================================================
   10. GẮN SỰ KIỆN & KHỞI CHẠY
   ========================================================================= */
function bindAllEvents() {
  // Chuyển 5 tab chính
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Các nút nhảy nhanh từ trang Hôm nay
  document.addEventListener('click', (ev) => {
    const jumpView = ev.target.closest('[data-jump-view]');
    if (jumpView) {
      switchView(jumpView.dataset.jumpView);
      return;
    }

    const jumpMapFilter = ev.target.closest('[data-jump-map-filter]');
    if (jumpMapFilter) {
      state.mapFilter = jumpMapFilter.dataset.jumpMapFilter;
      document.querySelectorAll('[data-map-filter]').forEach((b) =>
        b.classList.toggle('is-active', b.dataset.mapFilter === state.mapFilter)
      );
      switchView('map');
      return;
    }

    const viewOnMap = ev.target.closest('.js-view-on-map');
    if (viewOnMap) {
      document.getElementById('assistant-dialog')?.close();
      jumpToPointOnMap(viewOnMap.dataset.ptid);
      return;
    }

    const routeToPt = ev.target.closest('.js-route-to-point');
    if (routeToPt) {
      const pt = state.points.find((p) => p.id === routeToPt.dataset.ptid);
      if (pt) {
        const endInput = document.getElementById('route-end-custom');
        if (endInput) endInput.value = pt.name;
        switchView('route');
        runCitizenRouteComparison();
      }
      return;
    }

    const checkinBtn = ev.target.closest('.js-live-checkin');
    if (checkinBtn) {
      handleLiveCheckin(checkinBtn.dataset.ptid, checkinBtn.dataset.ptname, checkinBtn.dataset.status);
      return;
    }

    const openAi = ev.target.closest('.js-open-assistant');
    if (openAi) {
      document.getElementById('citizen-more-menu')?.removeAttribute('open');
      document.getElementById('assistant-dialog')?.showModal();
      document.getElementById('assistant-input')?.focus();
      return;
    }

    const presetQ = ev.target.closest('.js-ask-preset, .js-ai-dialog-sample');
    if (presetQ) {
      const dlg = document.getElementById('assistant-dialog');
      if (dlg && !dlg.open) dlg.showModal();
      const inp = document.getElementById('assistant-input');
      if (inp) inp.value = presetQ.dataset.q;
      askCitizenAssistant(presetQ.dataset.q);
      return;
    }

    const closeDlg = ev.target.closest('[data-close-dialog]');
    if (closeDlg) {
      document.getElementById(closeDlg.dataset.closeDialog)?.close();
      return;
    }

    const pickArea = ev.target.closest('[data-pick-area]');
    if (pickArea) {
      const lm = CITIZEN_LANDMARKS.find((x) => x.id === pickArea.dataset.pickArea);
      if (lm) {
        state.area = { ...lm };
        state.reportPin = { lat: lm.lat, lng: lm.lng, source: lm.shortName };
        document.getElementById('location-dialog')?.close();
        renderLocationAndEmergencyLists();
        renderTodayView();
        refreshAllLiveData();
        showToast(`Đang xem tình hình quanh ${lm.shortName}.`);
      }
      return;
    }

    const rentalLm = ev.target.closest('.js-rental-landmark');
    if (rentalLm) {
      const lm = CITIZEN_LANDMARKS.find((x) => x.id === rentalLm.dataset.lmid);
      if (lm) {
        state.rentalArea = { ...lm };
        const inp = document.getElementById('rental-search-input');
        if (inp) inp.value = lm.shortName;
        renderRentalView();
      }
      return;
    }
  });

  // Nút Cỡ chữ lớn (Người lớn tuổi)
  document.getElementById('btn-toggle-large-text')?.addEventListener('click', () => {
    const next = !document.documentElement.classList.contains('is-large-text');
    applyLargeTextMode(next);
    showToast(next ? 'Đã bật Chế độ Chữ lớn dễ đọc.' : 'Đã về cỡ chữ tiêu chuẩn.');
  });

  // Mở chọn vị trí & danh bạ khẩn cấp
  document.getElementById('btn-open-location-picker')?.addEventListener('click', () => {
    document.getElementById('location-dialog')?.showModal();
  });
  document.getElementById('btn-menu-emergency')?.addEventListener('click', () => {
    document.getElementById('citizen-more-menu')?.removeAttribute('open');
    document.getElementById('emergency-dialog')?.showModal();
  });
  document.getElementById('btn-find-shelter-now')?.addEventListener('click', () => {
    const box = document.getElementById('nearest-support-box');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Đã hiển thị cơ sở y tế và nơi trú có mái che gần vị trí bạn đang xem.');
  });
  document.getElementById('btn-refresh-today')?.addEventListener('click', () => {
    refreshAllLiveData();
    showToast('Đang cập nhật dữ liệu mới nhất...');
  });
  document.getElementById('btn-retry-offline-queue')?.addEventListener('click', flushOfflineQueue);

  // GPS trong hộp thoại Vị trí (chỉ xin khi người dùng tự bấm)
  document.getElementById('btn-dialog-use-gps')?.addEventListener('click', () => {
    const fb = document.getElementById('loc-gps-feedback');
    requestUserGps(
      (lat, lng) => {
        state.area = { id: 'gps-now', name: 'Vị trí GPS hiện tại của bạn', shortName: 'Vị trí hiện tại của bạn', lat, lng };
        state.reportPin = { lat, lng, source: 'vị trí GPS hiện tại' };
        document.getElementById('location-dialog')?.close();
        renderTodayView();
        refreshAllLiveData();
        showToast('Đã cập nhật theo vị trí hiện tại của bạn.');
      },
      (msg) => {
        if (fb) {
          fb.hidden = false;
          fb.textContent = msg;
        }
      }
    );
  });

  // Điều khiển Bản đồ an toàn
  document.getElementById('map-search-input')?.addEventListener('input', (ev) => {
    state.mapSearch = ev.target.value;
    renderMapAndList();
  });
  document.querySelectorAll('[data-map-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mapFilter = btn.dataset.mapFilter;
      document.querySelectorAll('[data-map-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderMapAndList();
    });
  });
  document.querySelectorAll('[data-map-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mapMobileMode = btn.dataset.mapMode;
      const layout = document.getElementById('map-split-layout');
      if (layout) layout.dataset.mobileMode = state.mapMobileMode;
      document.querySelectorAll('[data-map-mode]').forEach((b) => b.classList.toggle('is-active', b === btn));
      if (state.mapMobileMode === 'map') setTimeout(() => mainMap?.invalidateSize(), 60);
    });
  });
  document.getElementById('chk-show-sim-zones')?.addEventListener('change', (ev) => {
    state.showSimZones = ev.target.checked;
    renderMapAndList();
  });
  document.getElementById('btn-map-gps')?.addEventListener('click', () => {
    requestUserGps(
      (lat, lng) => {
        state.area = { id: 'gps-now', name: 'Vị trí hiện tại của bạn', shortName: 'Vị trí hiện tại', lat, lng };
        renderTodayView();
        renderMapAndList();
        mainMap?.setView([lat, lng], 16);
        showToast('Đã đưa bản đồ về vị trí hiện tại của bạn.');
      },
      (msg) => showToast(msg)
    );
  });

  // Điều khiển Tìm đường
  document.querySelectorAll('[data-travel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.travelMode = btn.dataset.travel;
      document.querySelectorAll('[data-travel]').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
  document.getElementById('btn-route-swap')?.addEventListener('click', () => {
    const s = document.getElementById('route-start-select');
    const e = document.getElementById('route-end-select');
    const sc = document.getElementById('route-start-custom');
    const ec = document.getElementById('route-end-custom');
    [s.value, e.value] = [e.value, s.value];
    [sc.value, ec.value] = [ec.value, sc.value];
  });
  document.getElementById('btn-route-use-gps')?.addEventListener('click', () => {
    requestUserGps(
      (lat, lng) => {
        const s = document.getElementById('route-start-select');
        let gpsOpt = s.querySelector('option[value="gps-start"]');
        if (!gpsOpt) {
          gpsOpt = document.createElement('option');
          gpsOpt.value = 'gps-start';
          s.prepend(gpsOpt);
        }
        gpsOpt.textContent = 'Vị trí GPS hiện tại của tôi';
        gpsOpt.dataset.lat = String(lat);
        gpsOpt.dataset.lng = String(lng);
        s.value = 'gps-start';
        document.getElementById('route-start-custom').value = '';
        showToast('Đã chọn vị trí hiện tại làm điểm xuất phát.');
      },
      (msg) => showToast(msg)
    );
  });
  document.getElementById('citizen-route-form')?.addEventListener('submit', runCitizenRouteComparison);

  // Điều khiển Kiểm tra nhà trọ & Checklist
  document.getElementById('btn-rental-check')?.addEventListener('click', lookupRentalAreaFromInput);
  document.getElementById('rental-search-input')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      lookupRentalAreaFromInput();
    }
  });
  document.getElementById('rental-checklist-groups')?.addEventListener('change', (ev) => {
    const chk = ev.target.closest('.js-rental-chk');
    if (!chk) return;
    const saved = readJsonStorage(CHECKLIST_KEY, { checked: {}, note: '' });
    saved.checked[chk.dataset.chkid] = chk.checked;
    writeJsonStorage(CHECKLIST_KEY, saved);
    chk.closest('.checklist-item')?.classList.toggle('is-checked', chk.checked);
    updateRentalChecklistProgress();
  });
  document.getElementById('rental-personal-note')?.addEventListener('input', (ev) => {
    const saved = readJsonStorage(CHECKLIST_KEY, { checked: {}, note: '' });
    saved.note = ev.target.value;
    writeJsonStorage(CHECKLIST_KEY, saved);
  });
  document.getElementById('btn-reset-checklist')?.addEventListener('click', () => {
    writeJsonStorage(CHECKLIST_KEY, { checked: {}, note: '' });
    renderRentalView();
    showToast('Đã đặt lại danh sách tự kiểm tra.');
  });
  document.getElementById('btn-copy-rental-summary')?.addEventListener('click', async () => {
    const saved = readJsonStorage(CHECKLIST_KEY, { checked: {}, note: '' });
    const done = RENTAL_INSPECTION_CHECKLIST.filter((i) => saved.checked?.[i.id]).length;
    const summary = buildHonestRentalAreaSummary(state.rentalArea.lat, state.rentalArea.lng, state.rentalArea.name, state.points);
    const text = [
      `Kiểm tra khu trọ: ${summary.areaLabel}`,
      ...summary.observations.map((o) => `- ${o}`),
      `Đã tự kiểm tra thực tế: ${done}/${RENTAL_INSPECTION_CHECKLIST.length} mục.`,
      saved.note ? `Ghi chú riêng: ${saved.note}` : ''
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã sao chép bản tóm tắt — bạn có thể dán gửi Zalo cho gia đình/bạn bè.');
    } catch {
      showToast('Trình duyệt không hỗ trợ sao chép tự động; bạn có thể chụp màn hình để lưu lại.');
    }
  });

  // Điều khiển Báo sự cố
  document.querySelectorAll('input[name="repCategory"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.cat-tile').forEach((t) => t.classList.remove('is-selected'));
      radio.closest('.cat-tile')?.classList.add('is-selected');
      const waterGroup = document.getElementById('rep-water-group');
      if (waterGroup) waterGroup.hidden = radio.value !== 'flood';
    });
  });
  document.getElementById('rep-landmark-select')?.addEventListener('change', (ev) => {
    const opt = ev.target.selectedOptions?.[0];
    if (opt?.dataset?.lat) {
      state.reportPin = { lat: Number(opt.dataset.lat), lng: Number(opt.dataset.lng), source: opt.textContent };
      document.getElementById('rep-location-status').textContent = `Đã gắn vị trí gần ${opt.textContent} (tự làm tròn ~20 m).`;
    }
  });
  document.getElementById('btn-rep-use-gps')?.addEventListener('click', () => {
    const st = document.getElementById('rep-location-status');
    requestUserGps(
      (lat, lng) => {
        state.reportPin = { lat, lng, source: 'GPS hiện tại' };
        st.textContent = 'Đã lấy vị trí GPS hiện tại (hệ thống sẽ tự làm tròn ~20 m để bảo vệ nhà riêng).';
      },
      (msg) => {
        st.textContent = msg;
      }
    );
  });
  document.getElementById('btn-rep-pick-map')?.addEventListener('click', toggleReportPickMap);
  document.getElementById('rep-photo')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    const st = document.getElementById('rep-photo-status');
    if (!file) {
      state.reportPhotoDataUrl = '';
      if (st) st.hidden = true;
      return;
    }
    try {
      const cleaned = await stripExifClientSide(file);
      state.reportPhotoDataUrl = cleaned;
      if (st) {
        st.hidden = false;
        st.textContent = 'Ảnh hợp lệ — đã tự động xóa sạch dữ liệu EXIF/GPS ẩn và nén nhẹ cho mạng yếu.';
      }
    } catch (err) {
      state.reportPhotoDataUrl = '';
      if (st) {
        st.hidden = false;
        st.textContent = err.message || 'Không xử lý được ảnh này.';
      }
    }
  });
  document.getElementById('citizen-report-form')?.addEventListener('submit', handleCitizenReportSubmit);

  // Trợ lý hỏi đáp
  document.getElementById('assistant-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    askCitizenAssistant(document.getElementById('assistant-input')?.value || '');
  });

  // Lắng nghe trạng thái mạng
  window.addEventListener('online', () => {
    state.isOffline = false;
    updateOfflineStrip();
    flushOfflineQueue();
    refreshAllLiveData();
  });
  window.addEventListener('offline', () => {
    state.isOffline = true;
    updateOfflineStrip();
    renderTodayView();
  });
}

function boot() {
  registerServiceWorker();
  applyLargeTextMode(Boolean(readJsonStorage(LARGE_TEXT_KEY, false)));
  hydrateFromLocalCache();
  renderLocationAndEmergencyLists();
  populateRouteSelectors();
  renderRentalQuickChips();
  initReportFormHelpers();
  bindAllEvents();
  updateOfflineStrip();
  renderTodayView();
  refreshAllLiveData();
}

boot();
