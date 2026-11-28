/**
 * VN RESILIENCE OPS CONSOLE — ỨNG DỤNG WEB QUẢN TRỊ & KỸ THUẬT ĐỘC LẬP
 * Chạy trên tên miền riêng biệt (https://vn-resilience-ops.vercel.app)
 * Giao tiếp qua CORS bảo mật + chữ ký HMAC-SHA256 Bearer Token tới nền tảng chính.
 */

const DEFAULT_PROD_API = 'https://bando-cong-dong-dong-ngac.vercel.app';
const CF_WORKER_HEALTH = 'https://vn-resilience-api.vn-resilience-edge.workers.dev/health';
const STORAGE_API_BASE_KEY = 'vn_resilience_ops_api_base_v1';
const STORAGE_ADMIN_TOKEN_KEY = 'vn_resilience_ops_bearer_v1';

function resolveInitialApiBase() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('api');
  if (fromQuery) return fromQuery.trim().replace(/\/$/, '');
  const saved = localStorage.getItem(STORAGE_API_BASE_KEY);
  if (saved) return saved.trim().replace(/\/$/, '');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'http://localhost:4177';
  }
  return DEFAULT_PROD_API;
}

const state = {
  apiBase: resolveInitialApiBase(),
  adminToken: sessionStorage.getItem(STORAGE_ADMIN_TOKEN_KEY) || '',
  activeView: 'telemetry',
  reports: [],
  moderationMap: {},
  auditLog: [],
  studies: [],
  sosTickets: [],
  lastInspectedZone: null,
  batchCandidates: []
};

let cmdMap = null;
let cmdLayer = null;
let pickerMap = null;
let pickerMarker = null;

const KEY_HUBS = [
  { name: 'Đông Ngạc (Hà Nội)', lat: 21.072514, lng: 105.77387, rKm: 2 },
  { name: 'Trung tâm Hà Nội', lat: 21.0285, lng: 105.8542, rKm: 5 },
  { name: 'Sa Pa (Lào Cai)', lat: 22.3364, lng: 103.8438, rKm: 10 },
  { name: 'TP. Huế', lat: 16.4637, lng: 107.5909, rKm: 8 },
  { name: 'TP. Đà Nẵng', lat: 16.0544, lng: 108.2022, rKm: 8 },
  { name: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009, rKm: 10 },
  { name: 'TP. Cần Thơ', lat: 10.0452, lng: 105.7469, rKm: 8 }
];

function quickDistMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function isVietnamCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 8.15 && lat <= 23.45 && lng >= 102.1 && lng <= 109.55;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg) {
  const el = document.getElementById('ops-toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3600);
}

function buildUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${state.apiBase}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

async function apiFetch(pathOrUrl, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.adminToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${state.adminToken}`;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(buildUrl(pathOrUrl), { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function downloadBlob(content, fileName, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================= VIEW SWITCHING & AUTH UI ================= */
function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.ops-nav-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.ops-view').forEach((sec) => {
    sec.hidden = sec.id !== `view-${viewName}`;
  });
  if (viewName === 'telemetry') {
    setTimeout(() => cmdMap?.invalidateSize(), 80);
  } else if (viewName === 'moderation') {
    ensurePickerMap();
    setTimeout(() => pickerMap?.invalidateSize(), 80);
  }
}

function updateAuthUi(unlocked) {
  const badge = document.getElementById('ops-auth-badge');
  const loginBtn = document.getElementById('btn-ops-login');
  const passInp = document.getElementById('ops-pass-input');
  const logoutBtn = document.getElementById('btn-ops-logout');
  const msg = document.getElementById('ops-auth-msg');

  badge.textContent = unlocked ? 'Admin Đã Mở khóa (HMAC-SHA256)' : 'Chế độ Chẩn đoán (Chỉ đọc)';
  badge.classList.toggle('is-unlocked', unlocked);
  loginBtn.hidden = unlocked;
  passInp.hidden = unlocked;
  logoutBtn.hidden = !unlocked;
  msg.textContent = unlocked
    ? 'Phiên Bearer Token đang hoạt động. Mọi thao tác sẽ đồng bộ trực tiếp sang Web Chính.'
    : 'Web quản trị tách rời hoàn toàn khỏi trang người dân; mọi lệnh ghi đều ký Bearer Token.';

  ['lock-notice-mod', 'lock-notice-research', 'lock-notice-broadcast', 'lock-notice-sos'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = unlocked;
  });
}

/* ================= 1. LIVE INFRASTRUCTURE TELEMETRY & ZONE INSPECTOR ================= */
async function runClusterProbes() {
  const tbody = document.getElementById('telemetry-tbody');
  tbody.innerHTML = `<tr><td colspan="4">Đang đo độ trễ trực tiếp tới ${esc(state.apiBase)} ...</td></tr>`;

  const probes = [
    {
      name: 'Community Cloud API (/api/community)',
      run: async () => {
        const { res, data } = await apiFetch('/api/community?action=public_sync&lat=21.0725&lng=105.7739&radiusKm=2');
        if (data?.broadcast?.active) {
          document.getElementById('kpi-broadcast-state').textContent = `Cảnh báo ĐANG BẬT (${data.broadcast.level})`;
        } else {
          document.getElementById('kpi-broadcast-state').textContent = 'Cảnh báo khẩn: Đang tắt';
        }
        return {
          ok: res.ok && data?.ok,
          detail: `HTTP ${res.status} · ${(data?.reports || []).length} phản ánh công khai`,
          reportsCnt: (data?.reports || []).length
        };
      }
    },
    {
      name: 'Research & Publications Store (/api/research-portal)',
      run: async () => {
        const { res, data } = await apiFetch('/api/research-portal?action=publications');
        if (data?.storageBackend) {
          document.getElementById('kpi-storage-engine').textContent = data.storageBackend;
        }
        return {
          ok: res.ok && data?.ok,
          detail: `HTTP ${res.status} · Backend: ${data?.storageBackend || 'ok'} · ${(data?.items || []).length} ấn phẩm`,
          pubsCnt: (data?.items || []).length
        };
      }
    },
    {
      name: 'OSM / Photon Spatial Engine (zone_osm)',
      run: async () => {
        const { res, data } = await apiFetch('/api/research-portal?action=zone_osm&lat=16.0544&lng=108.2022&radiusKm=4');
        return {
          ok: res.ok && data?.ok,
          detail: `HTTP ${res.status} · Nguồn: ${data?.source || 'ok'} · ${(data?.pois || []).length} POI Đà Nẵng`
        };
      }
    },
    {
      name: 'Cloudflare Edge Worker (D1 + KV)',
      run: async () => {
        const r = await fetch(CF_WORKER_HEALTH);
        const j = await r.json().catch(() => ({}));
        return {
          ok: r.ok && (j?.ok || j?.status === 'ok'),
          detail: `HTTP ${r.status} · Engine: ${j?.engine || 'cloudflare-d1-kv-edge'} (${j?.region || 'edge'})`
        };
      }
    },
    {
      name: 'Open-Meteo Copernicus GLO-30 DEM API',
      run: async () => {
        const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=21.0725&longitude=105.7739');
        const j = await r.json();
        return {
          ok: r.ok,
          detail: `HTTP ${r.status} · Cao độ tham chiếu HUMG: ${j?.elevation?.[0] ?? '--'} m`
        };
      }
    },
    {
      name: 'Copernicus GloFAS River Discharge API',
      run: async () => {
        const r = await fetch('https://flood-api.open-meteo.com/v1/flood?latitude=16.4637&longitude=107.5909&daily=river_discharge&forecast_days=3');
        const j = await r.json();
        const q0 = j?.daily?.river_discharge?.[0];
        return {
          ok: r.ok && Number.isFinite(Number(q0)),
          detail: `HTTP ${r.status} · Lưu lượng Sông Hương: ${q0 ?? '--'} m³/s`
        };
      }
    },
    {
      name: 'GIS.vn / VN-2000 Cadastral & Population Proxy (/api/vn-gis)',
      run: async () => {
        const { res, data } = await apiFetch('/api/vn-gis?action=zone_intel&lat=21.072514&lng=105.77387&radiusKm=2');
        const post = data?.admin?.postMerger?.fullLabel || 'n/a';
        const pop = data?.populationZone?.population;
        return {
          ok: res.ok && data?.ok && Boolean(data?.admin || data?.vn2000Center),
          detail: `HTTP ${res.status} · ${post}${pop != null ? ` · Dân cư R=2km: ${Number(pop).toLocaleString('vi-VN')} người` : ''}`
        };
      }
    },
    {
      name: 'Zero-Trust SOS & Privacy Dispatch (/api/sos-dispatch)',
      run: async () => {
        const { res, data } = await apiFetch('/api/sos-dispatch?action=health');
        state.lastSosHealth = data || null;
        return {
          ok: res.ok && data?.ok,
          detail: `HTTP ${res.status} · MaxSlots=${data?.antiCongestionMaxSlots ?? 2} · Turnstile=${data?.turnstileEnabled ? 'ON' : 'OFF'} · RateLimit=${data?.rateLimitEngine || 'mem'}`
        };
      }
    },
    {
      name: 'National Grounded AI Copilot (/api/ai-copilot)',
      run: async () => {
        const { res, data } = await apiFetch('/api/ai-copilot');
        state.lastAiHealth = data || null;
        return {
          ok: res.ok && data?.ok,
          detail: `HTTP ${res.status} · Phủ ${data?.nationalCoverageProvinces || 34} tỉnh (sau NQ 202/2025) · ${data?.engine || 'ok'}`
        };
      }
    }
  ];

  let totalPubsAndReports = 0;
  const rows = await Promise.all(
    probes.map(async (p) => {
      const t0 = performance.now();
      try {
        const out = await p.run();
        totalPubsAndReports += (out.reportsCnt || 0) + (out.pubsCnt || 0);
        return { name: p.name, ok: out.ok, ms: Math.round(performance.now() - t0), detail: out.detail };
      } catch (err) {
        return { name: p.name, ok: false, ms: Math.round(performance.now() - t0), detail: err.message };
      }
    })
  );

  const okCount = rows.filter((x) => x.ok).length;
  const avgMs = Math.round(rows.reduce((s, x) => s + x.ms, 0) / Math.max(1, rows.length));
  document.getElementById('kpi-cluster-status').textContent = `${okCount}/${rows.length} ONLINE`;
  document.getElementById('kpi-avg-latency').textContent = `${avgMs} ms`;
  document.getElementById('kpi-ping-clock').textContent = `Đo lúc ${new Date().toLocaleTimeString('vi-VN')}`;
  document.getElementById('kpi-cloud-records').textContent = String(totalPubsAndReports);

  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td><strong>${esc(r.name)}</strong></td>
        <td><span class="badge ${r.ok ? 'badge-ok' : 'badge-err'}">${r.ok ? 'ONLINE' : 'OFFLINE'}</span></td>
        <td class="mono">${r.ms} ms</td>
        <td>${esc(r.detail)}</td>
      </tr>`
    )
    .join('');

  const auditBox = document.getElementById('ops-env-audit-grid');
  const auditSum = document.getElementById('env-audit-summary');
  if (auditBox) {
    const sh = state.lastSosHealth || {};
    const ah = state.lastAiHealth || {};
    const items = [
      { lbl: 'CSDL Chính (D1 / Supabase)', ok: sh.storageBackend && sh.storageBackend !== 'local_file_dev', val: sh.storageBackend || 'local' },
      { lbl: 'Bảng chuẩn hóa D1 SQL', ok: Boolean(sh.d1NormalizedTables), val: sh.d1NormalizedTables ? 'Sẵn sàng' : 'Chưa bật' },
      { lbl: 'Rate Limit Phân tán', ok: sh.rateLimitEngine && sh.rateLimitEngine !== 'local_memory', val: sh.rateLimitEngine || 'local_memory' },
      { lbl: 'Cloudflare Turnstile Chống Bot', ok: Boolean(sh.turnstileEnabled), val: sh.turnstileEnabled ? 'Đang bật (Production)' : 'Tạm tắt' },
      { lbl: 'Google Sign-In (GOOGLE_CLIENT_ID)', ok: Boolean(sh.googleClientIdConfigured), val: sh.googleClientIdConfigured ? 'Đã gắn Client ID' : 'Chưa gắn (Chờ OAuth Client ID)' },
      { lbl: 'Gemini Cloud Key (GEMINI_API_KEY)', ok: Boolean(ah.llmVaultConfigured), val: ah.llmVaultConfigured ? `Đã gắn (${ah.keySource || 'vault'})` : 'Chế độ Tổng hợp Cục bộ' },
      { lbl: 'Độ phủ Hành chính', ok: true, val: `${ah.nationalCoverageProvinces || 34} tỉnh/thành (NQ 202/2025)` }
    ];
    const readyCnt = items.filter((i) => i.ok).length;
    if (auditSum) {
      auditSum.className = `badge ${readyCnt >= 5 ? 'badge-ok' : 'badge-warn'}`;
      auditSum.textContent = `${readyCnt}/${items.length} hạng mục sẵn sàng`;
    }
    auditBox.innerHTML = items
      .map(
        (it) => `<div class="item-card" style="flex:1 1 210px;margin:0;padding:8px 10px;">
          <div style="font-size:0.72rem;color:#64748B;">${esc(it.lbl)}</div>
          <div style="margin-top:3px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <strong style="font-size:0.78rem;">${esc(it.val)}</strong>
            <span class="badge ${it.ok ? 'badge-ok' : 'badge-warn'}">${it.ok ? 'OK' : 'Cần cấu hình'}</span>
          </div>
        </div>`
      )
      .join('');
  }
}

async function inspectSelectedZone() {
  const val = document.getElementById('inspector-zone-select').value;
  const [latStr, lngStr, radStr, label] = val.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  const radiusKm = Number(radStr);
  const box = document.getElementById('inspector-summary-box');
  box.textContent = `Đang truy vấn vùng ${label} (${lat.toFixed(4)}, ${lng.toFixed(4)} · R=${radiusKm}km)...`;

  try {
    const [osmOut, studyOut, vnGisOut, demRes] = await Promise.all([
      apiFetch(`/api/research-portal?action=zone_osm&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`),
      apiFetch(`/api/research-portal?action=zone_data&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`),
      apiFetch(`/api/vn-gis?action=zone_intel&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`),
      fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat},${(lat + 0.015).toFixed(4)},${(lat - 0.015).toFixed(4)}&longitude=${lng},${(lng + 0.015).toFixed(4)},${(lng - 0.015).toFixed(4)}`).then((r) => r.json())
    ]);
    const pois = osmOut.data?.pois || [];
    const waterways = osmOut.data?.waterways || [];
    const studyPts = studyOut.data?.features || [];
    const vnAdmin = vnGisOut.data?.admin;
    const vnPop = vnGisOut.data?.populationZone;
    const vn2k = vnGisOut.data?.vn2000Center;
    const elevs = Array.isArray(demRes?.elevation) ? demRes.elevation.map(Number) : [];
    state.lastInspectedZone = { label, lat, lng, radiusKm, pois, waterways, studyPts };

    box.innerHTML = `
      <div><strong>Vùng kiểm tra:</strong> ${esc(label)} (R=${radiusKm} km)</div>
      ${vnAdmin?.postMerger ? `<div>• Địa giới mới (Sau sáp nhập): <strong>${esc(vnAdmin.postMerger.fullLabel)}</strong> (Mã xã ${esc(vnAdmin.postMerger.communeCode)})</div>` : ''}
      ${vnAdmin?.preMerger ? `<div>• Địa giới cũ (Trước sáp nhập): <strong>${esc(vnAdmin.preMerger.fullLabel)}</strong></div>` : ''}
      ${vnPop?.population != null ? `<div>• Dân cư trong R=${radiusKm}km (GIS.vn): <strong>${Number(vnPop.population).toLocaleString('vi-VN')} người</strong> (${vnPop.densityKm2} người/km²)</div>` : ''}
      ${vn2k ? `<div>• Tâm VN-2000 (L0=${vn2k.centralMeridian}°): <strong>X=${vn2k.x} · Y=${vn2k.y}</strong></div>` : ''}
      <div>• Hạ tầng Y tế / Tránh trú OSM: <strong>${pois.length}</strong> điểm · Sông/kênh: <strong>${waterways.length}</strong></div>
      <div>• Điểm Nghiên cứu Đã Duyệt nội vùng: <strong>${studyPts.length}</strong> điểm</div>
      <div>• Mẫu cao độ Copernicus GLO-30: <strong>${elevs.length ? `${Math.min(...elevs)}m – ${Math.max(...elevs)}m` : '--'}</strong></div>
    `;
    renderNationalCommandMap({ lat, lng, radiusKm, label, pois });
  } catch (err) {
    box.textContent = `Không thể quét vùng: ${err.message}`;
  }
}

function renderNationalCommandMap(focusZone = null) {
  if (typeof window.L === 'undefined') return;
  const mount = document.getElementById('ops-national-map');
  if (!mount) return;
  if (!cmdMap) {
    cmdMap = window.L.map('ops-national-map').setView([16.2, 106.4], 6);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(cmdMap);
    cmdLayer = window.L.layerGroup().addTo(cmdMap);
  }
  cmdLayer.clearLayers();

  for (const hub of KEY_HUBS) {
    window.L.circle([hub.lat, hub.lng], {
      radius: hub.rKm * 1000,
      color: '#0F766E',
      weight: 1.8,
      dashArray: '4 4',
      fillOpacity: 0.08
    })
      .bindTooltip(`Trạm vùng: ${hub.name} (R=${hub.rKm}km)`)
      .addTo(cmdLayer);
  }

  for (const rep of state.reports.filter((r) => r.status !== 'hidden')) {
    window.L.circleMarker([Number(rep.lat), Number(rep.lng)], {
      radius: 6,
      color: '#FFFFFF',
      weight: 2,
      fillColor: rep.layerGroup === 'safe' ? '#16A34A' : '#DC2626',
      fillOpacity: 0.95
    })
      .bindPopup(`<strong>[${esc(rep.id)}] ${esc(rep.name)}</strong><br>${esc(rep.province || 'Cloud')}`)
      .addTo(cmdLayer);
  }

  for (const t of (state.sosTickets || []).filter((x) => !x.shreddedLocation)) {
    const tLat = Number(t.exactLat ?? t.fuzzyLat);
    const tLng = Number(t.exactLng ?? t.fuzzyLng);
    if (!Number.isFinite(tLat) || !Number.isFinite(tLng)) continue;
    window.L.circle([tLat, tLng], {
      radius: t.privacyRadiusM || 300,
      color: '#F59E0B',
      weight: 1.5,
      dashArray: '4 4',
      fillOpacity: 0.1
    }).addTo(cmdLayer);
    window.L.circleMarker([tLat, tLng], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#BE123C',
      fillOpacity: 1
    })
      .bindPopup(`<strong>SOS [${esc(t.id)}]: ${esc(t.categoryLabel)}</strong><br>${esc(t.areaHint)} · ${t.slotsFilled}/${t.maxResponders} chỗ`)
      .addTo(cmdLayer);
  }

  if (focusZone) {
    const ring = window.L.circle([focusZone.lat, focusZone.lng], {
      radius: focusZone.radiusKm * 1000,
      color: '#0284C7',
      weight: 2.5,
      fillColor: '#0EA5E9',
      fillOpacity: 0.14
    }).addTo(cmdLayer);
    for (const p of (focusZone.pois || []).slice(0, 30)) {
      window.L.circleMarker([Number(p.lat), Number(p.lng)], {
        radius: 5,
        color: '#fff',
        weight: 1.5,
        fillColor: '#15803D',
        fillOpacity: 0.9
      })
        .bindTooltip(p.name)
        .addTo(cmdLayer);
    }
    cmdMap.fitBounds(ring.getBounds(), { padding: [24, 24], maxZoom: 13 });
  }
}

/* ================= 2. ADMIN WORKSPACE LOAD, MODERATION & MAP UPSERT ================= */
function ensurePickerMap() {
  if (typeof window.L === 'undefined' || pickerMap) return;
  pickerMap = window.L.map('ops-picker-map').setView([21.072514, 105.77387], 13);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(pickerMap);
  pickerMarker = window.L.marker([21.072514, 105.77387], { draggable: true }).addTo(pickerMap);

  const updateCoords = async (latlng) => {
    document.getElementById('up-lat').value = latlng.lat.toFixed(6);
    document.getElementById('up-lng').value = latlng.lng.toFixed(6);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latlng.lat.toFixed(5)}&longitude=${latlng.lng.toFixed(5)}`);
      const j = await r.json();
      if (Number.isFinite(j?.elevation?.[0])) {
        document.getElementById('up-dem').value = j.elevation[0];
      }
    } catch {
      // ignore
    }
  };

  pickerMap.on('click', (ev) => {
    pickerMarker.setLatLng(ev.latlng);
    updateCoords(ev.latlng);
  });
  pickerMarker.on('dragend', () => updateCoords(pickerMarker.getLatLng()));
}

async function syncAdminData() {
  if (!state.adminToken) {
    updateAuthUi(false);
    return;
  }

  const [commRes, rqRes] = await Promise.all([
    apiFetch('/api/community?action=admin_full'),
    apiFetch('/api/research-portal?action=review_queue')
  ]);

  if (!commRes.res.ok || !commRes.data?.ok) {
    sessionStorage.removeItem(STORAGE_ADMIN_TOKEN_KEY);
    state.adminToken = '';
    updateAuthUi(false);
    toast('Phiên Quản trị đã hết hạn — vui lòng đăng nhập lại.');
    return;
  }

  updateAuthUi(true);
  state.reports = commRes.data.reports || [];
  state.moderationMap = commRes.data.moderationMap || {};
  state.auditLog = commRes.data.auditLog || [];
  syncSosAdminOverview();
  state.studies = rqRes.data?.submissions || [];

  if (commRes.data.broadcast?.active && commRes.data.broadcast.message) {
    document.getElementById('bc-level').value = commRes.data.broadcast.level || 'yellow';
    document.getElementById('bc-message').value = commRes.data.broadcast.message;
  }

  document.getElementById('nav-cnt-reports').textContent = String(state.reports.length);
  document.getElementById('nav-cnt-studies').textContent = String(
    state.studies.filter((s) => s.status === 'pending_review').length
  );

  renderModerationCards();
  renderDuplicateScanner();
  renderNationalCommandMap(state.lastInspectedZone);
  renderResearchQueue();
  renderAuditTable();
}

function renderDuplicateScanner() {
  const box = document.getElementById('dup-scan-box');
  const badge = document.getElementById('dup-badge');
  if (!box || !badge) return;
  const active = state.reports.filter((r) => r.status !== 'hidden');
  const pairs = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const d = quickDistMeters(Number(active[i].lat), Number(active[i].lng), Number(active[j].lat), Number(active[j].lng));
      if (d <= 50) {
        pairs.push({ a: active[i], b: active[j], d });
      }
    }
  }
  badge.textContent = `${pairs.length} cặp ≤50m`;
  badge.className = `badge mono ${pairs.length > 0 ? 'badge-warn' : 'badge-ok'}`;
  if (pairs.length === 0) {
    box.innerHTML = `<span style="color:var(--ok-ink);font-weight:600;">Không phát hiện điểm báo cáo trùng lặp nào trong bán kính 50 mét.</span>`;
    return;
  }
  box.innerHTML = pairs
    .slice(0, 8)
    .map(
      (p) => `
      <div class="item-card" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <span><strong>[${esc(p.a.id)}] ${esc(p.a.name)}</strong> sát <strong>[${esc(p.b.id)}] ${esc(p.b.name)}</strong> (${p.d} m)</span>
        <button type="button" class="btn btn-sm btn-danger js-mod-act" data-id="${esc(p.b.id)}" data-act="hide">Ẩn bản trùng ${esc(p.b.id)}</button>
      </div>`
    )
    .join('');
}

function renderModerationCards() {
  const box = document.getElementById('mod-cards-box');
  const q = (document.getElementById('mod-filter-q')?.value || '').trim().toLowerCase();
  const stFilter = document.getElementById('mod-filter-status')?.value || 'all';

  const list = state.reports.filter((r) => {
    const st = r.status || (r.confidenceTier === 'C' ? 'pending' : 'approved');
    if (stFilter !== 'all' && st !== stFilter) return false;
    if (q) {
      const hay = `${r.id || ''} ${r.name || ''} ${r.province || ''} ${r.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (list.length === 0) {
    box.innerHTML = `<p style="color:var(--ink-muted);font-size:0.84rem;">Chưa có báo cáo cộng đồng hoặc điểm điều hành mới khớp bộ lọc. Bạn có thể ghim điểm mới bằng bản đồ bên phải.</p>`;
    return;
  }

  box.innerHTML = list
    .map((pt) => {
      const st = pt.status || 'approved';
      const badgeCls = st === 'hidden' ? 'badge-err' : pt.confidenceTier === 'C' ? 'badge-warn' : 'badge-ok';
      return `
        <div class="item-card">
          <div class="item-card-top">
            <h4><span class="mono">[${esc(pt.id)}]</span> ${esc(pt.name)}</h4>
            <span class="badge ${badgeCls}">${st === 'hidden' ? 'Đã ẩn' : `Hạng ${esc(pt.confidenceTier || 'A')} · ${esc(st)}`}</span>
          </div>
          <div class="mono" style="font-size:0.75rem;color:var(--ink-muted);margin-bottom:6px;">
            ${esc(pt.province || 'Việt Nam')} · ${Number(pt.lat).toFixed(5)}, ${Number(pt.lng).toFixed(5)} · ${esc(pt.category)}
          </div>
          ${pt.notes ? `<p style="margin:0 0 8px;font-size:0.8rem;">${esc(pt.notes)}</p>` : ''}
          <div class="btn-row">
            <button type="button" class="btn btn-sm js-mod-act" data-id="${esc(pt.id)}" data-act="approveA">Duyệt Hạng A</button>
            <button type="button" class="btn btn-sm js-mod-act" data-id="${esc(pt.id)}" data-act="approveB">Duyệt Hạng B</button>
            <button type="button" class="btn btn-sm js-mod-act" data-id="${esc(pt.id)}" data-act="hide">Ẩn</button>
            <button type="button" class="btn btn-sm btn-danger js-mod-act" data-id="${esc(pt.id)}" data-act="delete">Xóa</button>
          </div>
        </div>`;
    })
    .join('');
}

function renderResearchQueue() {
  const box = document.getElementById('research-queue-box');
  if (!state.adminToken) {
    box.innerHTML = `<p style="color:var(--ink-muted);">Đăng nhập quyền Quản trị để tải hàng đợi thẩm định.</p>`;
    return;
  }
  if (state.studies.length === 0) {
    box.innerHTML = `<p style="color:var(--ink-muted);">Hiện chưa có hồ sơ nghiên cứu nào trong hàng đợi.</p>`;
    return;
  }

  box.innerHTML = state.studies
    .map((s) => {
      const badgeCls = s.status === 'published' ? 'badge-ok' : s.status === 'rejected' ? 'badge-err' : 'badge-warn';
      return `
        <div class="item-card">
          <div class="item-card-top">
            <h4>${esc(s.title)}</h4>
            <span class="badge ${badgeCls}">${esc(s.status)}</span>
          </div>
          <div style="font-size:0.78rem;color:var(--ink-muted);margin-bottom:6px;">
            <strong>${esc(s.authorName)}</strong> (${esc(s.organization)}) · ${esc(s.province)} · ${s.featureCount} điểm · ${esc(s.dataClass)}
          </div>
          <p style="margin:0 0 6px;font-size:0.81rem;">${esc(s.summary)}</p>
          <div style="font-size:0.75rem;color:var(--ink-muted);margin-bottom:8px;">Giới hạn khoa học: ${esc(s.limitations)}</div>
          ${
            s.status === 'pending_review'
              ? `<div class="btn-row">
                   <button type="button" class="btn btn-sm btn-primary js-study-review" data-id="${esc(s.id)}" data-decision="publish">Duyệt &amp; Đẩy lên Web Chính</button>
                   <button type="button" class="btn btn-sm btn-danger js-study-review" data-id="${esc(s.id)}" data-decision="reject">Từ chối / Yêu cầu bổ sung</button>
                 </div>`
              : ''
          }
        </div>`;
    })
    .join('');
}

function renderAuditTable() {
  const tbody = document.getElementById('audit-tbody');
  if (!state.adminToken) {
    tbody.innerHTML = `<tr><td colspan="4">Mở khóa quyền Quản trị để đọc Nhật ký kiểm toán trên máy chủ.</td></tr>`;
    return;
  }
  if (state.auditLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Chưa có bản ghi kiểm toán nào.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.auditLog
    .slice(0, 40)
    .map(
      (a) => `
      <tr>
        <td class="mono">${esc(a.ts || '')}</td>
        <td><span class="badge badge-info">${esc(a.mode || 'cloud')}</span></td>
        <td><strong>${esc(a.action || '')}</strong></td>
        <td>${esc(a.detail || '')}</td>
      </tr>`
    )
    .join('');
}

/* ================= EVENT BINDINGS ================= */
function bindEvents() {
  const apiInput = document.getElementById('ops-api-base');
  apiInput.value = state.apiBase;
  document.getElementById('link-open-public-web').href = state.apiBase;

  document.getElementById('btn-ops-apply-target').addEventListener('click', () => {
    const val = apiInput.value.trim().replace(/\/$/, '');
    if (!val) return;
    state.apiBase = val;
    localStorage.setItem(STORAGE_API_BASE_KEY, val);
    document.getElementById('link-open-public-web').href = val;
    toast(`Đã chuyển máy chủ đích sang ${val}`);
    runClusterProbes();
    if (state.adminToken) syncAdminData();
  });

  document.querySelectorAll('.ops-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('ops-auth-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pass = document.getElementById('ops-pass-input').value.trim();
    if (!pass) return;
    const { res, data } = await apiFetch('/api/community', {
      method: 'POST',
      body: JSON.stringify({ action: 'admin_login', pass })
    });
    if (!res.ok || !data?.ok || !data.token) {
      toast(data?.error || 'Mã ADMIN_PASSCODE không chính xác.');
      return;
    }
    state.adminToken = data.token;
    sessionStorage.setItem(STORAGE_ADMIN_TOKEN_KEY, data.token);
    document.getElementById('ops-pass-input').value = '';
    toast('Đã xác thực quyền Quản trị Đám mây thành công!');
    await syncAdminData();
  });

  document.getElementById('btn-ops-logout').addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_ADMIN_TOKEN_KEY);
    state.adminToken = '';
    updateAuthUi(false);
    renderResearchQueue();
    renderAuditTable();
    toast('Đã khóa phiên Quản trị.');
  });

  document.getElementById('btn-probe-all').addEventListener('click', runClusterProbes);
  document.getElementById('btn-inspect-zone').addEventListener('click', inspectSelectedZone);
  document.getElementById('btn-export-ops-snapshot')?.addEventListener('click', async () => {
    const [pubRes, commRes] = await Promise.all([
      apiFetch('/api/research-portal?action=publications'),
      apiFetch('/api/community?action=public_sync&lat=21.0725&lng=105.7739&radiusKm=20')
    ]);
    const snapshot = {
      exportedAt: new Date().toISOString(),
      apiBase: state.apiBase,
      adminAuthenticated: Boolean(state.adminToken),
      communityReports: state.adminToken ? state.reports : commRes.data?.reports || [],
      publications: pubRes.data?.items || [],
      researchReviewQueue: state.adminToken ? state.studies : undefined,
      sosTickets: state.adminToken ? state.sosTickets : undefined,
      auditLog: state.adminToken ? state.auditLog : undefined
    };
    downloadBlob(
      JSON.stringify(snapshot, null, 2),
      `vn-resilience-ops-snapshot-${Date.now()}.json`,
      'application/json;charset=utf-8'
    );
    toast('Đã xuất bản sao lưu hệ thống (.JSON)!');
  });

  document.getElementById('btn-export-zone-geojson').addEventListener('click', () => {
    if (!state.lastInspectedZone) {
      toast('Hãy bấm "Quét Vùng" trước khi xuất dữ liệu.');
      return;
    }
    const z = state.lastInspectedZone;
    const features = [...z.pois, ...z.studyPts].map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, category: p.category, sourceCitation: p.sourceCitation || '' },
      geometry: { type: 'Point', coordinates: [Number(p.lng), Number(p.lat)] }
    }));
    downloadBlob(
      JSON.stringify({ type: 'FeatureCollection', zone: z.label, features }, null, 2),
      `vn-ops-zone-${Date.now()}.geojson`,
      'application/geo+json;charset=utf-8'
    );
  });

  document.getElementById('btn-export-zone-csv').addEventListener('click', () => {
    if (!state.lastInspectedZone) {
      toast('Hãy bấm "Quét Vùng" trước khi xuất dữ liệu.');
      return;
    }
    const z = state.lastInspectedZone;
    const all = [...z.pois, ...z.studyPts];
    const lines = [
      'id,name,category,lat,lng,sourceCitation',
      ...all.map((p) =>
        [p.id, p.name, p.category, p.lat, p.lng, p.sourceCitation || '']
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
    ];
    downloadBlob('\uFEFF' + lines.join('\n'), `vn-ops-zone-${Date.now()}.csv`, 'text/csv;charset=utf-8');
  });

  document.getElementById('mod-filter-q').addEventListener('input', renderModerationCards);
  document.getElementById('mod-filter-status').addEventListener('change', renderModerationCards);
  document.getElementById('btn-reload-mod').addEventListener('click', syncAdminData);
  document.getElementById('btn-reload-studies').addEventListener('click', syncAdminData);
  document.getElementById('btn-reload-audit').addEventListener('click', syncAdminData);

  document.getElementById('ops-batch-geojson')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    const st = document.getElementById('batch-geojson-status');
    const pushBtn = document.getElementById('btn-push-batch-geojson');
    if (!file) return;
    try {
      const rawText = await file.text();
      let arr = [];
      if (/\.csv$/i.test(file.name) || (!rawText.trim().startsWith('{') && !rawText.trim().startsWith('['))) {
        const rows = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (rows.length >= 2) {
          const splitCsv = (line) =>
            line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
          const hdr = splitCsv(rows[0]).map((h) => h.toLowerCase());
          const colIdx = (keys) => hdr.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
          const iName = colIdx(['name', 'ten', 'title', 'dia diem']);
          const iLat = colIdx(['lat', 'vi do', 'vido', 'y']);
          const iLng = colIdx(['lng', 'lon', 'kinh do', 'kinhdo', 'x']);
          const iCat = colIdx(['category', 'loai', 'phan loai']);
          const iProv = colIdx(['province', 'tinh', 'thanh pho']);
          const iNote = colIdx(['note', 'ghi chu', 'mo ta']);
          for (const line of rows.slice(1, 201)) {
            const cols = splitCsv(line);
            arr.push({
              name: cols[iName >= 0 ? iName : 0],
              lat: Number(cols[iLat >= 0 ? iLat : 1]),
              lng: Number(cols[iLng >= 0 ? iLng : 2]),
              category: cols[iCat] || 'flood',
              province: cols[iProv] || 'Việt Nam',
              notes: cols[iNote] || ''
            });
          }
        }
      } else {
        const parsed = JSON.parse(rawText);
        arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.features) ? parsed.features : [];
      }

      const valid = [];
      let rejected = 0;
      let dupSkipped = 0;
      const existingPts = [...(state.reports || []), ...(state.studyPts || [])];

      for (const f of arr.slice(0, 150)) {
        const lat = Number(f.lat ?? f.geometry?.coordinates?.[1]);
        const lng = Number(f.lng ?? f.geometry?.coordinates?.[0]);
        if (!isVietnamCoord(lat, lng)) {
          rejected++;
          continue;
        }
        const isDup =
          existingPts.some((ex) => quickDistMeters(lat, lng, Number(ex.lat), Number(ex.lng)) <= 50) ||
          valid.some((v) => quickDistMeters(lat, lng, v.lat, v.lng) <= 50);
        if (isDup) {
          dupSkipped++;
          continue;
        }
        const props = f.properties || f;
        const cat = String(props.category || 'flood');
        valid.push({
          id: `IMP-${Date.now().toString(36).toUpperCase()}-${valid.length + 1}`,
          name: String(props.name || props.title || `Điểm nhập lô ${valid.length + 1}`).slice(0, 140),
          province: String(props.province || 'Việt Nam').slice(0, 80),
          category: cat,
          layerGroup: ['medical', 'shelter'].includes(cat) ? 'safe' : 'risk',
          lat: Math.round(lat * 1_000_000) / 1_000_000,
          lng: Math.round(lng * 1_000_000) / 1_000_000,
          confidenceTier: 'A',
          dataClass: 'OBSERVED_DATA',
          status: 'approved',
          confirmCount: 3,
          sourceType: 'Nạp lô GeoJSON / CSV từ Ops Console',
          sourceCitation: String(props.sourceCitation || 'Ops Batch Import').slice(0, 140),
          notes: String(props.notes || '').slice(0, 300)
        });
      }
      state.batchCandidates = valid;
      pushBtn.disabled = valid.length === 0;
      st.textContent = `Đã lọc thông minh: ${valid.length} điểm mới hợp lệ · loại ${rejected} điểm ngoài VN · gộp bỏ ${dupSkipped} điểm trùng ≤ 50 m.`;
    } catch {
      state.batchCandidates = [];
      pushBtn.disabled = true;
      st.textContent = 'Lỗi: Tệp không đúng định dạng GeoJSON hoặc CSV (name,lat,lng) hợp lệ.';
    }
  });

  document.getElementById('btn-push-batch-geojson')?.addEventListener('click', async () => {
    if (!state.adminToken) {
      toast('Mở khóa ADMIN_PASSCODE trước khi đẩy lô GeoJSON lên Cloud.');
      return;
    }
    if (state.batchCandidates.length === 0) return;
    const pushBtn = document.getElementById('btn-push-batch-geojson');
    pushBtn.disabled = true;
    let okCnt = 0;
    for (const point of state.batchCandidates) {
      const { res, data } = await apiFetch('/api/community', {
        method: 'POST',
        body: JSON.stringify({ action: 'admin_upsert_point', point })
      });
      if (res.ok && data?.ok) okCnt++;
    }
    toast(`Đã đẩy thành công ${okCnt}/${state.batchCandidates.length} điểm GeoJSON lên Bản đồ Chính!`);
    state.batchCandidates = [];
    document.getElementById('batch-geojson-status').textContent = `Hoàn tất đồng bộ ${okCnt} điểm mới lên Cloud.`;
    await syncAdminData();
  });

  document.getElementById('btn-ops-convert-vn2k')?.addEventListener('click', async () => {
    const x = Number(document.getElementById('ops-vn2k-x')?.value);
    const y = Number(document.getElementById('ops-vn2k-y')?.value);
    const l0 = Number(document.getElementById('ops-vn2k-l0')?.value || 105);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      toast('Vui lòng nhập đầy đủ tọa độ X Bắc (m) và Y Đông (m) hệ VN-2000.');
      return;
    }
    const { res, data } = await apiFetch(`/api/vn-gis?action=vn2000_to_wgs84&x=${x}&y=${y}&centralMeridian=${l0}&zoneWidth=3`);
    if (!res.ok || !data?.ok) {
      toast(data?.error || 'Không thể quy đổi tọa độ VN-2000.');
      return;
    }
    document.getElementById('up-lat').value = data.lat.toFixed(6);
    document.getElementById('up-lng').value = data.lng.toFixed(6);
    ensurePickerMap();
    pickerMap?.setView([data.lat, data.lng], 16);
    pickerMarker?.setLatLng([data.lat, data.lng]);
    toast(`Đã quy đổi VN-2000 → WGS84 (${data.lat.toFixed(5)}°N, ${data.lng.toFixed(5)}°E · nguồn: ${data.source})`);
  });

  document.getElementById('ops-upsert-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!state.adminToken) {
      toast('Vui lòng mở khóa ADMIN_PASSCODE trước khi ghi điểm lên Cloud.');
      return;
    }
    const cat = document.getElementById('up-cat').value;
    const demRaw = document.getElementById('up-dem').value;
    const point = {
      id: `OPS-${Date.now().toString(36).toUpperCase()}`,
      name: document.getElementById('up-name').value.trim(),
      province: document.getElementById('up-province').value.trim(),
      category: cat,
      layerGroup: ['medical', 'shelter'].includes(cat) ? 'safe' : 'risk',
      lat: Number(document.getElementById('up-lat').value),
      lng: Number(document.getElementById('up-lng').value),
      elevationM: demRaw !== '' ? Number(demRaw) : null,
      confidenceTier: 'A',
      dataClass: 'OBSERVED_DATA',
      status: 'approved',
      confirmCount: 3,
      sourceType: 'Trung tâm Điều hành VN Resilience Ops',
      sourceCitation: document.getElementById('up-cite').value.trim(),
      observedDate: new Date().toISOString().slice(0, 10),
      notes: document.getElementById('up-notes').value.trim()
    };
    const { res, data } = await apiFetch('/api/community', {
      method: 'POST',
      body: JSON.stringify({ action: 'admin_upsert_point', point })
    });
    if (res.ok && data?.ok) {
      toast(`Đã đẩy điểm [${point.name}] trực tiếp lên Bản đồ Chính!`);
      document.getElementById('up-name').value = '';
      document.getElementById('up-notes').value = '';
      await syncAdminData();
    } else {
      toast(data?.error || 'Không thể lưu điểm lên Cloud.');
    }
  });

  document.getElementById('ops-news-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!state.adminToken) {
      toast('Vui lòng mở khóa ADMIN_PASSCODE trước khi xuất bản bản tin.');
      return;
    }
    const payload = {
      action: 'publish_disaster_news',
      title: document.getElementById('nw-title').value.trim(),
      province: document.getElementById('nw-province').value.trim(),
      macroRegion: document.getElementById('nw-region').value,
      hazardType: document.getElementById('nw-hazard').value,
      severity: document.getElementById('nw-severity').value,
      focusLat: Number(document.getElementById('nw-lat').value),
      focusLng: Number(document.getElementById('nw-lng').value),
      focusRadiusKm: 8,
      sourceLabel: document.getElementById('nw-source').value.trim(),
      summary: document.getElementById('nw-summary').value.trim(),
      body: document.getElementById('nw-body').value.trim()
    };
    const { res, data } = await apiFetch('/api/research-portal', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.ok && data?.ok) {
      toast('Đã xuất bản Bản tin Thiên tai lên Phân hệ 3 của Web Chính!');
      document.getElementById('ops-news-form').reset();
      runClusterProbes();
    } else {
      toast(data?.error || 'Không thể đăng bản tin.');
    }
  });

  document.getElementById('bc-preset').addEventListener('change', (ev) => {
    if (!ev.target.value) return;
    const [lvl, msg] = ev.target.value.split('|');
    document.getElementById('bc-level').value = lvl;
    document.getElementById('bc-message').value = msg;
  });

  const sendBroadcast = async (active) => {
    if (!state.adminToken) {
      toast('Vui lòng mở khóa ADMIN_PASSCODE trước.');
      return;
    }
    const level = document.getElementById('bc-level').value;
    const message = document.getElementById('bc-message').value.trim();
    if (active && message.length < 5) {
      toast('Vui lòng nhập nội dung cảnh báo tối thiểu 5 ký tự.');
      return;
    }
    const { res, data } = await apiFetch('/api/community', {
      method: 'POST',
      body: JSON.stringify({ action: 'admin_broadcast', active, level, message })
    });
    if (res.ok && data?.ok) {
      toast(active ? 'Đã phát Băng rôn Cảnh báo lên Web Chính!' : 'Đã gỡ Băng rôn Cảnh báo trên Web Chính.');
      runClusterProbes();
      syncAdminData();
    } else {
      toast(data?.error || 'Lỗi cập nhật cảnh báo.');
    }
  };
  document.getElementById('btn-bc-publish').addEventListener('click', () => sendBroadcast(true));
  document.getElementById('btn-bc-clear').addEventListener('click', () => sendBroadcast(false));

  document.getElementById('sb-preset').addEventListener('change', (ev) => {
    const [method, path] = ev.target.value.split('|');
    document.getElementById('sb-method').value = method;
    document.getElementById('sb-path').value = path;
    document.getElementById('sb-body-wrap').hidden = method !== 'POST';
  });
  document.getElementById('sb-method').addEventListener('change', (ev) => {
    document.getElementById('sb-body-wrap').hidden = ev.target.value !== 'POST';
  });

  document.getElementById('btn-sb-send').addEventListener('click', async () => {
    const method = document.getElementById('sb-method').value;
    const path = document.getElementById('sb-path').value.trim();
    const out = document.getElementById('sb-output');
    out.textContent = `// Đang gọi ${method} ${buildUrl(path)} ...`;
    const t0 = performance.now();
    try {
      const opts = { method };
      if (method === 'POST') {
        opts.body = document.getElementById('sb-body').value;
      }
      const { res, data } = await apiFetch(path, opts);
      const ms = Math.round(performance.now() - t0);
      out.textContent = `// HTTP ${res.status} · ${ms} ms\n` + JSON.stringify(data, null, 2);
    } catch (err) {
      out.textContent = `// ERROR: ${err.message}`;
    }
  });

  document.addEventListener('click', async (ev) => {
    const modBtn = ev.target.closest('.js-mod-act');
    if (modBtn) {
      if (!state.adminToken) {
        toast('Mở khóa quyền Quản trị trước khi duyệt điểm.');
        return;
      }
      const { res, data } = await apiFetch('/api/community', {
        method: 'POST',
        body: JSON.stringify({
          action: 'admin_bulk_moderate',
          ids: [modBtn.dataset.id],
          act: modBtn.dataset.act
        })
      });
      if (res.ok && data?.ok) {
        toast(`Đã cập nhật trạng thái cho ${modBtn.dataset.id}.`);
        syncAdminData();
      } else {
        toast(data?.error || 'Không cập nhật được trạng thái.');
      }
      return;
    }

    const revBtn = ev.target.closest('.js-study-review');
    if (revBtn) {
      if (!state.adminToken) return;
      const { res, data } = await apiFetch('/api/research-portal', {
        method: 'POST',
        body: JSON.stringify({
          action: 'review_study',
          submissionId: revBtn.dataset.id,
          decision: revBtn.dataset.decision,
          reviewNote:
            revBtn.dataset.decision === 'publish'
              ? 'Đã thẩm định qua VN Resilience Ops Console — xuất bản lên Bản đồ chính.'
              : 'Đề nghị bổ sung thêm minh chứng tọa độ thực địa.'
        })
      });
      if (res.ok && data?.ok) {
        toast(revBtn.dataset.decision === 'publish' ? 'Đã duyệt & đẩy nghiên cứu lên Web Chính!' : 'Đã từ chối hồ sơ.');
        syncAdminData();
      } else {
        toast(data?.error || 'Lỗi thẩm định hồ sơ.');
      }
      return;
    }

    const vetBtn = ev.target.closest('.js-vet-sos-acc');
    if (vetBtn) {
      if (!state.adminToken) return;
      const { res, data } = await apiFetch('/api/sos-dispatch', {
        method: 'POST',
        body: JSON.stringify({
          action: 'admin_vet_account',
          accountId: vetBtn.dataset.id,
          trustTier: vetBtn.dataset.tier,
          status: vetBtn.dataset.status || 'active'
        })
      });
      if (res.ok && data?.ok) {
        toast(`Đã cập nhật quyền ${vetBtn.dataset.tier} cho tài khoản ${vetBtn.dataset.id}.`);
        syncSosAdminOverview();
      } else {
        toast(data?.error || 'Không thể cập nhật quyền tài khoản.');
      }
    }
  });

  document.getElementById('btn-reload-sos-ops')?.addEventListener('click', syncSosAdminOverview);
}

async function syncSosAdminOverview() {
  if (!state.adminToken) return;
  const { res, data } = await apiFetch('/api/sos-dispatch?action=admin_overview');
  if (!res.ok || !data?.ok) return;

  const activeSos = (data.tickets || []).filter((t) => !String(t.status).includes('shredded'));
  state.sosTickets = data.tickets || [];
  const navCnt = document.getElementById('nav-cnt-sos');
  if (navCnt) navCnt.textContent = String(activeSos.length);
  renderNationalCommandMap(state.lastInspectedZone);

  const tBox = document.getElementById('ops-sos-tickets-list');
  if (tBox) {
    tBox.innerHTML =
      (data.tickets || []).length === 0
        ? `<p style="font-size:0.82rem;color:#64748B;">Hiện chưa có yêu cầu SOS nào phát sinh.</p>`
        : data.tickets
            .map(
              (t) => `
              <div class="item-card">
                <div class="item-card-top">
                  <h4>${esc(t.categoryLabel)} (${esc(t.id)})</h4>
                  <span class="badge ${t.shreddedLocation ? 'badge-ok' : 'badge-warn'}">${esc(t.status)} · ${t.slotsFilled}/${t.maxResponders} chỗ</span>
                </div>
                <p style="margin:3px 0;font-size:0.78rem;color:#334155;">
                  Người gửi: <strong>${esc(t.requesterName || '--')}</strong> · Vùng: ${esc(t.areaHint)} · PIN: <code class="mono">${esc(t.safetyPin || '****')}</code>
                </p>
                <p style="margin:2px 0;font-size:0.75rem;color:#64748B;">
                  ${t.shreddedLocation ? 'Đã xóa trắng tọa độ chính xác sau khi đóng ca (Auto-Shred).' : `Tọa độ điều hành: ${t.exactLat}, ${t.exactLng}`}
                </p>
                ${
                  (t.abuseReports || []).length
                    ? `<p style="margin:4px 0 0;font-size:0.76rem;color:#BE123C;font-weight:700;">CẢNH BÁO VI PHẠM: ${esc(t.abuseReports.map((a) => `${a.responderId}: ${a.reason}`).join(' | '))}</p>`
                    : ''
                }
              </div>`
            )
            .join('');
  }

  const aBox = document.getElementById('ops-sos-accounts-list');
  if (aBox) {
    const sortedAccounts = [...(data.accounts || [])].sort((x, y) => {
      const rank = (t) => (t === 'pending_responder' ? 0 : t === 'citizen' ? 1 : t === 'verified_responder' ? 2 : 3);
      return rank(x.trustTier) - rank(y.trustTier);
    });
    aBox.innerHTML = sortedAccounts
      .map((a) => {
        const ek = a.ekyc || null;
        const ekHtml = ek
          ? `<div style="margin:6px 0;padding:8px 10px;border-radius:8px;background:#F8FAFC;border:1px solid #E2E8F0;font-size:0.75rem;color:#334155;">
              <div><strong>Hồ sơ eKYC Tình nguyện viên:</strong> SĐT <code class="mono">${esc(ek.phone || '--')}</code> · CCCD cuối: <code class="mono">${esc(ek.idLast4 || '----')}</code> · Cam kết 0đ: ${ek.pledgedZeroFee ? 'Đã ký' : 'Chưa rõ'}</div>
              ${ek.roleNote ? `<div style="margin-top:3px;color:#475569;">Kỹ năng/Phạm vi: ${esc(ek.roleNote)}</div>` : ''}
              ${ek.proofDataUrl ? `<img src="${esc(ek.proofDataUrl)}" alt="Minh chứng eKYC" style="max-height:84px;max-width:100%;border-radius:6px;margin-top:6px;border:1px solid #CBD5E1;display:block;">` : ''}
            </div>`
          : '';
        return `
        <div class="item-card">
          <div class="item-card-top">
            <h4>${esc(a.fullName)} <small class="mono">(${esc(a.id)})</small></h4>
            <span class="badge ${a.status === 'suspended' ? 'badge-err' : a.trustTier === 'pending_responder' ? 'badge-warn' : a.trustTier === 'citizen' ? 'badge-info' : 'badge-ok'}">${esc(a.trustTier)} · ${esc(a.status)}</span>
          </div>
          <p style="margin:2px 0 6px;font-size:0.76rem;color:#475569;">${esc(a.email)} · ${esc(a.organization || a.authProvider)} · Vi phạm: ${a.abuseFlags || 0}</p>
          ${ekHtml}
          <div class="btn-row">
            <button type="button" class="btn btn-sm btn-primary js-vet-sos-acc" data-id="${esc(a.id)}" data-tier="verified_responder" data-status="active">Cấp chuẩn Tình nguyện viên</button>
            <button type="button" class="btn btn-sm js-vet-sos-acc" data-id="${esc(a.id)}" data-tier="official_unit" data-status="active">Cấp chuẩn Đội chính thức</button>
            <button type="button" class="btn btn-sm btn-danger js-vet-sos-acc" data-id="${esc(a.id)}" data-tier="revoked" data-status="suspended">Khóa vĩnh viễn</button>
          </div>
        </div>`;
      })
      .join('');
  }
}

function boot() {
  bindEvents();
  runClusterProbes();
  inspectSelectedZone();
  if (state.adminToken) syncAdminData();
  else updateAuthUi(false);
}

boot();
