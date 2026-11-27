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
  ALERT_BULLETINS,
  DRILL_QUIZ_QUESTIONS
} from './humg-data.js';

import {
  searchKnowledgeNotebook,
  buildNotebookLmSourceMarkdown
} from './knowledge-engine.js';

const STORAGE_KEY = 'humg_dongngac_community_gis_v7';
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
 * Xóa toàn bộ siêu dữ liệu EXIF (tọa độ GPS gốc, tên máy, giờ chụp) bằng cách vẽ lại ảnh qua <canvas>
 * ngay trên thiết bị người dùng và nén xuống định dạng JPEG nhẹ (< 45 KB) trước khi đính kèm.
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

        // Giảm dần chất lượng nếu vượt quá ngưỡng 36KB để lưu gọn an toàn vào Google Sheets
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        while (dataUrl.length > 36000 && q > 0.35) {
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        const approxKb = Math.max(1, Math.round((dataUrl.length * 3) / 4 / 1024));
        resolve({ dataUrl, width, height, approxKb });
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

function createMarkerSvg(pt) {
  const cacheKey = `${pt.confidenceTier}|${pt.layerGroup}|${pt.category}|${pt.severity}`;
  const cached = ICON_SVG_CACHE.get(cacheKey);
  if (cached) return cached;

  let svg = '';
  if (pt.confidenceTier === 'C') {
    svg = `<svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="10" fill="#F59E0B" fill-opacity="0.88" stroke="#78350F" stroke-width="2.2" stroke-dasharray="3 2"/>
      <text x="14" y="18" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="700" font-family="sans-serif">?</text>
    </svg>`;
  } else if (pt.layerGroup === 'safe') {
    if (pt.category === 'medical') {
      svg = `<svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11" fill="#15803D" stroke="#FFFFFF" stroke-width="2.4"/>
        <path d="M14 8.5v11M8.5 14h11" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>
      </svg>`;
    } else {
      svg = `<svg width="25" height="25" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="4" y="4" width="20" height="20" rx="5" fill="#0F766E" stroke="#FFFFFF" stroke-width="2.4"/>
        <path d="M9 14.5l3.2 3.2L19 11" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
  } else if (pt.category === 'heat') {
    svg = `<svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
      <polygon points="14,2 26,14 14,26 2,14" fill="#C2410C" stroke="#FFFFFF" stroke-width="2.3" stroke-linejoin="round"/>
      <circle cx="14" cy="14" r="4" fill="#FEF08A"/>
    </svg>`;
  } else {
    const fill = pt.severity === 'severe' ? '#B91C1C' : '#C2410C';
    svg = `<svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
      <polygon points="14,3 25,23 3,23" fill="${fill}" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round"/>
      <line x1="14" y1="10" x2="14" y2="16" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="14" cy="19.5" r="1.3" fill="#FFFFFF"/>
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
    showRings: saved?.showRings !== undefined ? Boolean(saved.showRings) : true,
    showRiskLayer: true,
    showSafeLayer: true,
    showPendingLayer: true,
    activeScenario: 'normal',
    transectFirstPt: null,
    mode: 'pan',
    points: Array.isArray(saved?.points) && saved.points.length > 0 ? saved.points : structuredClone(SAMPLE_HUMG_POINTS),
    filters: { layer: 'all', scope: 'all', search: '' },
    analysis: null,
    apiUrl: storedApiUrl || PROJECT_CONFIG.communityApiUrl || '',
    pendingPhotoDataUrl: ''
  };

  function persistState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          center: state.center,
          radiusKm: state.radiusKm,
          showRings: state.showRings,
          points: state.points
        })
      );
      localStorage.setItem(VOTES_KEY, JSON.stringify(votedIds));
    } catch { /* ignore */ }
  }

  const baseLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)'
    }),
    carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
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
    zoom: 14,
    layers: [baseLayers.osm],
    zoomControl: true
  });

  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  const bufferLayerGroup = L.layerGroup().addTo(map);
  const ringsLayerGroup = L.layerGroup().addTo(map);
  const detourLayerGroup = L.layerGroup().addTo(map);
  const riskLayerGroup = L.layerGroup().addTo(map);
  const safeLayerGroup = L.layerGroup().addTo(map);
  const pendingLayerGroup = L.layerGroup().addTo(map);
  const nearestLinkGroup = L.layerGroup().addTo(map);
  const routeCorridorGroup = L.layerGroup().addTo(map);
  const transectLayerGroup = L.layerGroup().addTo(map);
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
    draggable: true,
    title: 'Tâm vùng khảo sát (Kéo thả để dời vùng khoanh)'
  }).addTo(map);

  const els = {
    modePanBtn: document.getElementById('mode-pan-btn'),
    modeMarkBtn: document.getElementById('mode-mark-btn'),
    modeNearestBtn: document.getElementById('mode-nearest-btn'),
    btnCenterMode: document.getElementById('btn-center-mode'),
    mobBtnReport: document.getElementById('mob-btn-report'),
    mobBtnNearest: document.getElementById('mob-btn-nearest'),
    mobBtnDrill: document.getElementById('mob-btn-drill'),
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
    toggleHeatmap: document.getElementById('toggle-heatmap'),
    scenarioSelect: document.getElementById('scenario-select'),
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

  // Xử lý chọn ảnh & xóa EXIF ngay trên trình duyệt
  els.ptPhoto.addEventListener('change', async () => {
    const file = els.ptPhoto.files?.[0];
    if (!file) return;
    try {
      const cleaned = await stripExifAndCompressImage(file);
      state.pendingPhotoDataUrl = cleaned.dataUrl;
      els.ptPhotoPreview.src = cleaned.dataUrl;
      els.ptPhotoMeta.textContent = `Đã xóa sạch EXIF/GPS & nén an toàn (${cleaned.width}×${cleaned.height}px · ~${cleaned.approxKb} KB)`;
      els.ptPhotoPreviewWrap.hidden = false;
    } catch (err) {
      state.pendingPhotoDataUrl = '';
      els.ptPhotoPreviewWrap.hidden = true;
      showToast(err.message);
    }
  });

  els.btnClearPhoto.addEventListener('click', () => {
    state.pendingPhotoDataUrl = '';
    els.ptPhoto.value = '';
    els.ptPhotoPreviewWrap.hidden = true;
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
      els.syncStatusMsg.textContent = 'Chế độ thử nghiệm cục bộ. Dán URL Apps Script (hoặc ghi vào config.js) để gom phiếu toàn phường Đông Ngạc.';
      return;
    }
    els.syncStatusMsg.textContent = 'Đang đồng bộ dữ liệu cộng đồng từ Google Sheets...';
    try {
      const res = await fetch(state.apiUrl);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Phản hồi API không hợp lệ');

      const counts = data.confirmCounts || {};
      for (const pt of state.points) {
        if (counts[pt.id]) {
          const baseCnt = SAMPLE_HUMG_POINTS.find((s) => s.id === pt.id)?.confirmCount || 1;
          pt.confirmCount = Math.max(Number(pt.confirmCount) || 1, baseCnt + counts[pt.id]);
        }
      }

      const existingIds = new Set(state.points.map((p) => p.id));
      for (const rep of data.reports || []) {
        if (!existingIds.has(rep.id)) {
          state.points.push(rep);
        }
      }

      recomputeAndRender(false);
      persistState();
      els.syncStatusMsg.textContent = `Đã đồng bộ thành công với Google Sheets lúc ${new Date().toLocaleTimeString('vi-VN')}.`;
    } catch (err) {
      els.syncStatusMsg.textContent = `Không kết nối được API (${err.message}). Dữ liệu vẫn lưu cục bộ an toàn.`;
    }
  }

  async function postToCloudApi(payload) {
    if (!state.apiUrl) return;
    try {
      await fetch(state.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch { /* fallback silently */ }
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

  function setMode(nextMode) {
    state.mode = nextMode;
    for (const [btn, m] of [
      [els.modePanBtn, 'pan'],
      [els.modeMarkBtn, 'mark'],
      [els.modeNearestBtn, 'nearest']
    ]) {
      const active = m === nextMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    els.mapContainer.classList.toggle('cursor-crosshair', nextMode !== 'pan');
    if (nextMode === 'mark') {
      els.modeBannerText.textContent = 'Chạm vào đúng đoạn ngõ / đường trên bản đồ để mở phiếu báo điểm';
      els.modeBanner.hidden = false;
    } else if (nextMode === 'nearest') {
      els.modeBannerText.textContent = 'Chạm vào vị trí bạn đang đứng để tìm Bệnh viện / Trạm Y tế / Điểm tránh trú gần nhất';
      els.modeBanner.hidden = false;
    } else if (nextMode === 'center') {
      els.modeBannerText.textContent = `Chạm lên bản đồ để dời tâm vùng khảo sát ${state.radiusKm} km`;
      els.modeBanner.hidden = false;
    } else if (nextMode === 'transect') {
      state.transectFirstPt = null;
      els.modeBannerText.textContent = 'Bước 1/2: Chạm chọn Điểm đầu A trên bản đồ để đo mặt cắt địa hình DEM';
      els.modeBanner.hidden = false;
    } else {
      els.modeBanner.hidden = true;
    }
  }

  els.modePanBtn.addEventListener('click', () => setMode('pan'));
  els.modeMarkBtn.addEventListener('click', () => setMode(state.mode === 'mark' ? 'pan' : 'mark'));
  els.modeNearestBtn.addEventListener('click', () => setMode(state.mode === 'nearest' ? 'pan' : 'nearest'));
  els.btnCenterMode.addEventListener('click', () => setMode(state.mode === 'center' ? 'pan' : 'center'));
  els.modeBannerCancel.addEventListener('click', () => setMode('pan'));

  // Mobile Bottom Bar triggers
  els.mobBtnReport.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMode('mark');
    showToast('Hãy chạm thẳng vào vị trí ngõ/đường trên bản đồ để đánh dấu.');
  });
  els.mobBtnNearest.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    els.btnQuickShelter.click();
  });
  els.mobBtnDrill.addEventListener('click', () => els.drillDialog.showModal());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.mode !== 'pan' && !document.querySelector('dialog[open]')) {
      setMode('pan');
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
    markerMap.get(found.point.id)?.openPopup();

    els.nearestText.innerHTML = `<strong>Điểm an toàn xác thực gần nhất:</strong> ${escapeHtml(found.point.name)}<br>Cách <strong class="mono-num">${found.distanceMeters} m</strong> (${escapeHtml(found.bearingLabel)}) · Đi bộ khoảng <strong>~${found.walkingMinutes} phút</strong>.`;
    els.nearestBar.hidden = false;
  }

  els.nearestClose.addEventListener('click', () => {
    els.nearestBar.hidden = true;
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

  let currentBaseKey = 'osm';
  els.basemapSelect.addEventListener('change', () => {
    const nextKey = els.basemapSelect.value;
    if (baseLayers[nextKey] && nextKey !== currentBaseKey) {
      map.removeLayer(baseLayers[currentBaseKey]);
      baseLayers[nextKey].addTo(map);
      currentBaseKey = nextKey;
    }
  });

  els.btnFitBuffer.addEventListener('click', () => {
    if (state.analysis?.bufferPolygon) {
      map.fitBounds(L.geoJSON(state.analysis.bufferPolygon).getBounds(), { padding: [26, 26] });
    }
  });

  let moveRaf = null;
  map.on('mousemove', (e) => {
    const { lat, lng } = e.latlng;
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = null;
      const utm = latLngToUTM(lat, lng, 48);
      const dist = Math.round(turf.distance([state.center.lng, state.center.lat], [lng, lat], { units: 'meters' }));
      els.cursorCoords.textContent = `WGS84: ${lat.toFixed(5)}, ${lng.toFixed(5)} · UTM 48N: ${utm.easting.toFixed(0)}m E, ${utm.northing.toFixed(0)}m N · Cách ĐH Mỏ: ${dist.toLocaleString('vi-VN')} m`;
    });
  });

  map.on('click', (e) => {
    if (state.mode === 'mark') {
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

  els.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = els.locationQuery.value.trim();
    if (!raw) return;
    els.searchResults.hidden = false;
    els.searchResults.innerHTML = `<li><button type="button" disabled>Đang tìm "${escapeHtml(raw)}"...</button></li>`;
    try {
      const q = raw.toLowerCase().includes('hà nội') ? raw : `${raw}, Đông Ngạc, Hà Nội`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`
      );
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) {
        els.searchResults.innerHTML = `<li><button type="button" disabled>Không tìm thấy địa danh phù hợp.</button></li>`;
        return;
      }
      els.searchResults.innerHTML = items
        .map((it, idx) => `<li><button type="button" data-idx="${idx}">${escapeHtml(it.display_name)}</button></li>`)
        .join('');
      els.searchResults.querySelectorAll('button[data-idx]').forEach((b) => {
        b.addEventListener('click', () => {
          const picked = items[Number(b.dataset.idx)];
          els.searchResults.hidden = true;
          map.flyTo([Number(picked.lat), Number(picked.lon)], 16);
        });
      });
    } catch {
      els.searchResults.innerHTML = `<li><button type="button" disabled>Không kết nối được máy chủ bản đồ.</button></li>`;
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

  els.toggleHeatmap.addEventListener('change', () => {
    if (els.toggleHeatmap.checked) {
      riskHeatmapLayer.addTo(map);
    } else {
      map.removeLayer(riskHeatmapLayer);
    }
  });

  els.filterLayer.addEventListener('change', () => {
    state.filters.layer = els.filterLayer.value;
    renderMarkersAndTable();
  });
  els.filterScope.addEventListener('change', () => {
    state.filters.scope = els.filterScope.value;
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
      style: { color: '#0F766E', weight: 2.5, opacity: 0.95, fillColor: '#0F766E', fillOpacity: 0.08 }
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

    renderMarkersAndTable();
    if (els.toggleHeatmap?.checked) riskHeatmapLayer.redraw();
    if (flyToBuffer) map.fitBounds(bufferGeoLayer.getBounds(), { padding: [26, 26] });
  }

  function getFilteredPoints() {
    if (!state.analysis) return [];
    return state.analysis.points
      .filter((p) => {
        if (p.status === 'hidden') return false;
        if (state.filters.layer === 'risk' && p.layerGroup !== 'risk') return false;
        if (state.filters.layer === 'safe' && p.layerGroup !== 'safe') return false;
        if (state.filters.layer === 'tierC' && p.confidenceTier !== 'C') return false;
        if (state.filters.scope === 'inside' && !p.insideBuffer) return false;
        if (state.filters.scope === 'outside' && p.insideBuffer) return false;
        if (state.filters.search) {
          const hay = `${p.name} ${p.sourceCitation || ''} ${p.notes || ''} ${CATEGORY_LABELS[p.category] || ''}`.toLowerCase();
          if (!hay.includes(state.filters.search)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.insideBuffer !== b.insideBuffer) return a.insideBuffer ? -1 : 1;
        return a.distanceMeters - b.distanceMeters;
      });
  }

  function renderMarkersAndTable() {
    riskLayerGroup.clearLayers();
    safeLayerGroup.clearLayers();
    pendingLayerGroup.clearLayers();
    markerMap.clear();

    const filtered = getFilteredPoints();
    els.shownCount.textContent = String(filtered.length);
    const scenEval = evaluateWeatherScenario(state.points, state.activeScenario);

    for (const pt of filtered) {
      const targetGroup =
        pt.confidenceTier === 'C'
          ? pendingLayerGroup
          : pt.layerGroup === 'safe'
            ? safeLayerGroup
            : riskLayerGroup;

      const isScenMatch = scenEval.highlightedIds.has(pt.id);
      const scenCls = scenEval.dimNonMatching
        ? isScenMatch
          ? 'scenario-active-marker'
          : 'scenario-dim-marker'
        : '';

      const marker = L.marker([pt.lat, pt.lng], {
        icon: L.divIcon({
          className: `flood-marker-wrap ${pt.insideBuffer ? 'inside-marker' : 'outside-marker'} ${scenCls}`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -12],
          html: createMarkerSvg(pt)
        }),
        title: `[Hạng ${pt.confidenceTier}] ${pt.name}`
      }).addTo(targetGroup);

      const hasVoted = Boolean(votedIds[pt.id]);
      const hazardHtml =
        pt.hazardFlags && pt.hazardFlags.length > 0
          ? `<p class="popup-meta" style="color:#B91C1C;font-weight:600;">Cảnh báo: ${pt.hazardFlags.map((f) => escapeHtml(HAZARD_FLAGS_META[f] || f)).join(' · ')}</p>`
          : '';
      const photoHtml =
        pt.photoDataUrl && pt.photoDataUrl.startsWith('data:image/')
          ? `<img class="popup-photo" src="${pt.photoDataUrl}" alt="Ảnh hiện trường (đã xóa EXIF)">`
          : '';

      const popupEl = document.createElement('div');
      popupEl.className = 'popup-card';
      popupEl.innerHTML = `
        <h3>${escapeHtml(pt.name)}</h3>
        <div>
          <span class="tier-tag tier-${escapeHtml(pt.confidenceTier)}">Hạng ${escapeHtml(pt.confidenceTier)}</span>
          <span class="sev-badge ${pt.confidenceTier === 'C' ? 'sev-pending' : pt.layerGroup === 'safe' ? 'sev-safe' : `sev-${pt.severity}`}">
            ${escapeHtml(CATEGORY_LABELS[pt.category] || pt.category)}
          </span>
        </div>
        ${photoHtml}
        ${pt.layerGroup === 'risk' ? `<p class="popup-meta"><strong>Mức ghi nhận:</strong> ${escapeHtml(pt.waterScaleLabel)}</p>` : ''}
        ${hazardHtml}
        <div class="popup-source-box">
          <strong>Nguồn:</strong> ${escapeHtml(pt.sourceCitation || pt.sourceType)}
          ${pt.observedDate ? `<br><strong>Mốc ghi nhận:</strong> ${escapeHtml(pt.observedDate)}` : ''}
          <br><strong>Cộng đồng xác nhận:</strong> <span class="mono-num">${pt.confirmCount}</span> lượt · Cách ĐH Mỏ <span class="mono-num">${pt.distanceMeters} m</span>
        </div>
        ${pt.notes ? `<p class="popup-meta">${escapeHtml(pt.notes)}</p>` : ''}
        <div class="popup-actions">
          <button type="button" class="btn btn-compact btn-upvote ${hasVoted ? 'is-voted' : ''} js-upvote-pt">
            ${hasVoted ? `Đã xác nhận (${pt.confirmCount})` : `+1 Tôi cũng gặp ở đây (${pt.confirmCount})`}
          </button>
          ${pt.layerGroup === 'risk' ? `<button type="button" class="btn btn-primary btn-compact js-find-shelter">Điểm an toàn gần đây</button>` : ''}
          <button type="button" class="btn btn-secondary btn-compact js-share-pt" title="Sao chép đường link dẫn thẳng tới điểm này">Chép link</button>
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
        showToast(`Đã sao chép link điểm [${pt.id}] để gửi qua Zalo / Facebook!`);
      });

      marker.bindPopup(popupEl, {
        autoPanPaddingTopLeft: [16, 56],
        autoPanPaddingBottomRight: [16, 48]
      });
      markerMap.set(pt.id, marker);
    }

    if (filtered.length === 0) {
      els.tbody.innerHTML = '';
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    els.tbody.innerHTML = filtered
      .map((pt) => {
        const hasVoted = Boolean(votedIds[pt.id]);
        const badgeClass = pt.confidenceTier === 'C' ? 'sev-pending' : pt.layerGroup === 'safe' ? 'sev-safe' : `sev-${pt.severity}`;
        return `<tr class="${pt.insideBuffer ? '' : 'is-outside'}">
          <th scope="row">
            <button type="button" class="pt-title-btn js-focus-pt" data-id="${escapeHtml(pt.id)}">${escapeHtml(pt.name)}</button>
            <span class="pt-meta-sub">${escapeHtml(pt.sourceCitation || pt.sourceType)}</span>
          </th>
          <td>
            <span class="tier-tag tier-${escapeHtml(pt.confidenceTier)}">${escapeHtml(pt.confidenceTier)}</span>
            <span class="sev-badge ${badgeClass}">${escapeHtml(CATEGORY_LABELS[pt.category] || pt.category)}</span>
          </td>
          <td class="mono-num"><strong>${pt.confirmCount}</strong> phiếu<span class="pt-meta-sub">${pt.distanceMeters} m</span></td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn btn-compact btn-upvote ${hasVoted ? 'is-voted' : ''} js-upvote-row" data-id="${escapeHtml(pt.id)}">
                ${hasVoted ? 'Đã +1' : '+1'}
              </button>
              <button type="button" class="btn btn-secondary btn-compact js-focus-pt" data-id="${escapeHtml(pt.id)}">Xem</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');
  }

  els.tbody.addEventListener('click', (e) => {
    const upBtn = e.target.closest('.js-upvote-row');
    if (upBtn) {
      handleResidentUpvote(upBtn.dataset.id);
      return;
    }
    const focusBtn = e.target.closest('.js-focus-pt');
    if (focusBtn) {
      const id = focusBtn.dataset.id;
      const pt = state.points.find((p) => p.id === id);
      if (pt) {
        map.flyTo([pt.lat, pt.lng], Math.max(map.getZoom(), 16), { duration: 0.45 });
        markerMap.get(id)?.openPopup();
      }
    }
  });

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

    await postToCloudApi({
      action: 'submit_report',
      reporterRole: role,
      layerGroup,
      category: cat,
      name: newRecord.name,
      lat: finalLat,
      lng: finalLng,
      waterScale: newRecord.waterScale,
      frequency: newRecord.frequency,
      hazardFlags: checkedHazards,
      photoDataUrl: newRecord.photoDataUrl,
      notes: newRecord.notes,
      roundPrivacy: round20m,
      consentAccepted: true
    });

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
    els.btnOpenRoute?.addEventListener('click', () => els.routeDialog.showModal());
    els.btnCloseRoute?.addEventListener('click', () => els.routeDialog.close());
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

  els.quizForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let correct = 0;
    DRILL_QUIZ_QUESTIONS.forEach((q, qIdx) => {
      const card = els.quizContainer.querySelector(`.quiz-card[data-qidx="${qIdx}"]`);
      const chosen = card.querySelector(`input[name="quiz_${q.id}"]:checked`);
      const chosenVal = chosen ? Number(chosen.value) : -1;
      if (chosenVal === q.correctIndex) correct++;
      card.querySelectorAll('.quiz-opt').forEach((lbl) => {
        lbl.classList.remove('is-correct', 'is-wrong');
        const oIdx = Number(lbl.dataset.oidx);
        if (oIdx === q.correctIndex) lbl.classList.add('is-correct');
        else if (oIdx === chosenVal) lbl.classList.add('is-wrong');
      });
      card.querySelector('.quiz-explain').hidden = false;
    });
    els.quizScoreBanner.hidden = false;
    els.quizScoreBanner.textContent = `Điểm của bạn: ${correct}/${DRILL_QUIZ_QUESTIONS.length} (${correct * 20}/100 điểm).`;
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

    if (rain >= 10 || dRain >= 40) {
      els.liveWeatherPill.className = 'live-pill live-pill-danger';
      els.liveWeatherPill.textContent = 'Cảnh báo Mưa lớn tại P. Đông Ngạc';
    } else if (app >= 38 || dMax >= 39) {
      els.liveWeatherPill.className = 'live-pill live-pill-warn';
      els.liveWeatherPill.textContent = 'Chú ý Bức xạ Nắng nóng';
    } else {
      els.liveWeatherPill.className = 'live-pill live-pill-ok';
      els.liveWeatherPill.textContent = 'Thời tiết 18 Phố Viên ổn định';
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

  // ================= TÍNH NĂNG MỚI 2: NOTEBOOK TRI THỨC THỰC CHỨNG & XUẤT GOOGLE NOTEBOOKLM =================
  els.nbEmergencyList.innerHTML = EMERGENCY_DIRECTORY.map(
    (d) => `<div class="nb-emerg-item">
      <strong>${escapeHtml(d.org)}</strong>
      <div class="nb-emerg-phone">${escapeHtml(d.phone)}</div>
      <div style="color:#475569;margin-top:2px;">${escapeHtml(d.address)}</div>
    </div>`
  ).join('');

  function renderNotebookSearch(queryStr = '') {
    const res = searchKnowledgeNotebook(queryStr, state.points);
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
      cardsHtml || ptsHtml
        ? cardsHtml + ptsHtml
        : `<div class="empty-state"><p class="empty-title">Không tìm thấy mục khớp từ khóa "${escapeHtml(queryStr)}"</p><p class="empty-desc">Thử từ khóa như: Phố Viên, Kênh 920 tỷ, Ecohome, xe buýt 09A, trọ mái tôn, Oresol, UBND phường.</p></div>`;
  }

  els.nbQueryInput.addEventListener(
    'input',
    debounce(() => renderNotebookSearch(els.nbQueryInput.value), 120)
  );
  els.btnNbClear.addEventListener('click', () => {
    els.nbQueryInput.value = '';
    renderNotebookSearch('');
  });
  els.nbChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      els.nbQueryInput.value = chip.dataset.q;
      renderNotebookSearch(chip.dataset.q);
    });
  });
  els.nbResultsContainer.addEventListener('click', (e) => {
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

  els.btnRunRoute.addEventListener('click', () => evaluateSelectedRoute(true));
  els.btnSwapRoute.addEventListener('click', () => {
    const tmp = els.routeOriginSelect.value;
    els.routeOriginSelect.value = els.routeDestSelect.value;
    els.routeDestSelect.value = tmp;
    evaluateSelectedRoute(true);
  });
  els.btnClearRouteMap.addEventListener('click', () => {
    routeCorridorGroup.clearLayers();
    showToast('Đã xóa vệt kiểm tra lộ trình trên bản đồ.');
  });
  els.btnViewRouteOnMap.addEventListener('click', async () => {
    await evaluateSelectedRoute(true);
    els.routeDialog.close();
    if (lastRouteBounds) map.fitBounds(lastRouteBounds, { padding: [70, 70], maxZoom: 16 });
  });

  // ================= TÍNH NĂNG MỚI 4: MÔ PHỎNG KỊCH BẢN MƯA LỚN / UHI =================
  els.scenarioSelect.innerHTML = Object.values(WEATHER_SCENARIOS)
    .map((sc) => `<option value="${escapeHtml(sc.key)}">${escapeHtml(sc.shortLabel)}</option>`)
    .join('');

  els.scenarioSelect.addEventListener('change', () => {
    state.activeScenario = els.scenarioSelect.value;
    const scMeta = WEATHER_SCENARIOS[state.activeScenario] || WEATHER_SCENARIOS.normal;
    const ev = evaluateWeatherScenario(state.points, state.activeScenario);
    if (state.activeScenario === 'normal') {
      els.scenarioSummaryNote.hidden = true;
    } else {
      els.scenarioSummaryNote.hidden = false;
      els.scenarioSummaryNote.innerHTML = `<strong>${escapeHtml(scMeta.headline)}</strong><br>${escapeHtml(scMeta.desc)}<br>Đang làm nổi bật: <strong class="mono-num">${ev.activeRiskCount}</strong> điểm rủi ro kích hoạt &amp; <strong class="mono-num">${ev.recommendedSafeCount}</strong> điểm hỗ trợ khuyến nghị.`;
    }
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
  recomputeAndRender(true);
  updateCenterElevation();
  syncFromCloudApi();

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
