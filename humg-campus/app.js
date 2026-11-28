import {
  CAMPUS_CENTER,
  CAMPUS_ZONES,
  CAMPUS_ROUTES,
  FLOOD_ZONES,
  CAMPUS_POINTS,
  QUIZ_15_QUESTIONS,
  MOCK_ADMIN_DATA
} from './data/campus-data.js';

const LOCK_KEY = 'humg_campus_public_locked';
const QUIZ_LOGS_KEY = 'humg_campus_quiz_logs';
const FEEDBACK_LOGS_KEY = 'humg_campus_feedback_logs';
const SIM_VISITS_KEY = 'humg_campus_sim_visits';

const state = {
  view: 'map',
  activeZone: 'A',
  activeOrigin: 'A',
  basemap: 'street',
  quizAnswers: {},
  quizSubmitted: false
};

let map = null;
let streetTile = null;
let satTile = null;
let topoTile = null;
let campusZoneLayer = null;
let floodPolyLayer = null;
let routeLayer = null;
let markerLayer = null;
let zonePolygons = {};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function trackVisitIncrement() {
  try {
    const cur = Number(localStorage.getItem(SIM_VISITS_KEY) || '0');
    localStorage.setItem(SIM_VISITS_KEY, String(cur + 1));
  } catch {
    // ignore storage limits
  }
}

function checkPublicLockState() {
  const locked = localStorage.getItem(LOCK_KEY) === 'true';
  document.getElementById('public-locked-screen').hidden = !locked;
  if (locked) {
    document.getElementById('view-map').hidden = true;
    document.getElementById('view-quiz').hidden = true;
    document.getElementById('view-guide').hidden = true;
  }
  return locked;
}

function switchView(nextView) {
  if (checkPublicLockState()) return;
  state.view = nextView;
  document.getElementById('view-map').hidden = nextView !== 'map';
  document.getElementById('view-quiz').hidden = nextView !== 'quiz';
  document.getElementById('view-guide').hidden = nextView !== 'guide';
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const act = b.dataset.view === nextView;
    b.classList.toggle('is-active', act);
    b.setAttribute('aria-selected', String(act));
  });
  if (nextView === 'map') {
    setTimeout(() => map?.invalidateSize(), 60);
  }
}

/* ================= BẢN ĐỒ QUANH TRƯỜNG MỎ (A, A1, B + VÙNG NGẬP) ================= */
function makePinIcon(cls, txt) {
  return window.L.divIcon({
    className: '',
    html: `<div class="custom-pin ${cls}">${esc(txt)}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function initCampusMap() {
  if (map || typeof window.L === 'undefined') return;
  map = window.L.map('campus-map').setView([CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], CAMPUS_CENTER.zoom);

  streetTile = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  satTile = window.L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: '&copy; Esri World Imagery' }
  );
  topoTile = window.L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: '&copy; Esri World Topo' }
  );

  campusZoneLayer = window.L.layerGroup().addTo(map);
  floodPolyLayer = window.L.layerGroup().addTo(map);
  routeLayer = window.L.layerGroup().addTo(map);
  markerLayer = window.L.layerGroup().addTo(map);

  renderMapLayers();
  selectZone('A', false);
  fitAllZones();
}

function fitAllZones() {
  if (!map) return;
  const allPts = CAMPUS_ZONES.flatMap((z) => z.polygon || [[z.lat, z.lng]]);
  map.fitBounds(window.L.latLngBounds(allPts), { padding: [36, 36] });
}

function setBasemap(mode) {
  state.basemap = mode;
  document.querySelectorAll('.bm-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.bm === mode));
  if (!map) return;
  [streetTile, satTile, topoTile].forEach((t) => {
    if (map.hasLayer(t)) map.removeLayer(t);
  });
  const chosen = mode === 'satellite' ? satTile : mode === 'topo' ? topoTile : streetTile;
  chosen.addTo(map);
}

function renderMapLayers() {
  if (!map) return;
  campusZoneLayer.clearLayers();
  floodPolyLayer.clearLayers();
  routeLayer.clearLayers();
  markerLayer.clearLayers();
  zonePolygons = {};

  const showZones = document.getElementById('layer-zones').checked;
  const showFlood = document.getElementById('layer-flood').checked;
  const showHeat = document.getElementById('layer-heat').checked;
  const showMed = document.getElementById('layer-med').checked;
  const showCoolRoute = document.getElementById('toggle-cool').checked;
  const showMedRoute = document.getElementById('toggle-med').checked;
  const showSafeAB = document.getElementById('toggle-safe-ab').checked;

  // Vẽ đa giác khoanh vùng chuẩn 3 khu Khu A, Khu A1, Khu B (đối chiếu OSM & Google Maps)
  if (showZones) {
    CAMPUS_ZONES.forEach((z) => {
      const isAct = state.activeZone === z.id;
      const poly = window.L.polygon(z.polygon, {
        color: z.color,
        weight: isAct ? 3.5 : 2.5,
        opacity: 0.95,
        fillColor: z.fillColor,
        fillOpacity: isAct ? 0.28 : 0.16
      });
      const tipText =
        z.id === 'A'
          ? 'Khu A · 18 Phố Viên'
          : z.id === 'A1'
            ? 'Khu A1 · KĐT Đại học'
            : 'Khu B · Phạm Văn Nghị';
      poly.bindTooltip(tipText, {
        permanent: true,
        direction: 'top',
        offset: [0, -4],
        className: `zone-label-tip zone-tip-${z.id.toLowerCase()}`
      });
      poly.bindPopup(
        `<strong>${esc(z.title)}</strong><br>` +
          `<small>${esc(z.address)} · Diện tích: <strong>${esc(z.areaLabel)}</strong> · Cốt nền: ~${z.elevationM} m</small><br>` +
          `<span>${esc(z.buildings)}</span><br>` +
          `<small style="color:#475569">Nguồn ranh giới: OSM (${esc(z.osmWayId)}) &amp; Google Maps</small><br>` +
          `<a href="${esc(z.googleMapsUrl)}" target="_blank" rel="noopener" class="popup-gmaps-link">Mở vị trí trên Google Maps ↗</a>`
      );
      poly.on('click', () => selectZone(z.id, false));
      poly.addTo(campusZoneLayer);
      zonePolygons[z.id] = poly;

      if (Array.isArray(z.subBuildings)) {
        z.subBuildings.forEach((sb) => {
          window.L.polygon(sb.polygon, {
            color: z.color,
            weight: 1.5,
            fillColor: z.fillColor,
            fillOpacity: 0.35
          })
            .bindPopup(`<strong>${esc(sb.name)}</strong><br><small>Thuộc ${esc(z.code)} — ĐH Mỏ - Địa chất</small>`)
            .addTo(campusZoneLayer);
        });
      }
    });
  }

  // Vẽ 3 vùng ngập đa giác cảnh báo quanh trường
  if (showFlood) {
    FLOOD_ZONES.forEach((fz) => {
      window.L.polygon(fz.polygon, {
        color: fz.severity === 'high' ? '#dc2626' : '#ea580c',
        weight: 2,
        dashArray: '6 4',
        fillColor: fz.severity === 'high' ? '#ef4444' : '#f97316',
        fillOpacity: 0.22
      })
        .bindPopup(
          `<strong>${esc(fz.name)}</strong><br><small>Ngưỡng mưa: ~${fz.rainThresholdMm} mm · Dự kiến ngập: ${esc(fz.depthRangeCm)}</small><br>${esc(fz.description)}`
        )
        .addTo(floodPolyLayer);
    });
  }

  // Tuyến đường đi mát nhất (xanh lá)
  if (showCoolRoute) {
    window.L.polyline(CAMPUS_ROUTES.coolRoute.coordinates, {
      color: '#16a34a',
      weight: 6,
      opacity: 0.9
    })
      .bindPopup(`<strong>${esc(CAMPUS_ROUTES.coolRoute.name)}</strong><br>${esc(CAMPUS_ROUTES.coolRoute.summary)}`)
      .addTo(routeLayer);
  }

  // Tuyến vòng Khu A <-> Khu B tránh xoáy cống
  if (showSafeAB) {
    window.L.polyline(CAMPUS_ROUTES.safeAtoBRoute.coordinates, {
      color: '#0f766e',
      weight: 4.5,
      dashArray: '8 6',
      opacity: 0.9
    })
      .bindPopup(`<strong>${esc(CAMPUS_ROUTES.safeAtoBRoute.name)}</strong><br>${esc(CAMPUS_ROUTES.safeAtoBRoute.summary)}`)
      .addTo(routeLayer);
  }

  // Tuyến nhanh nhất tới Trạm Y tế / BV Phương Đông
  if (showMedRoute) {
    const mr = CAMPUS_ROUTES.medicalRoutes[state.activeOrigin];
    window.L.polyline(mr.coordinates, {
      color: '#2563eb',
      weight: 5,
      dashArray: '10 6',
      opacity: 0.92
    })
      .bindPopup(`<strong>${esc(mr.fromLabel)} → ${esc(mr.targetLabel)}</strong><br>~${mr.distanceM} m · ~${mr.walkMin} phút<br>${esc(mr.note)}`)
      .addTo(routeLayer);
  }

  // Marker điểm
  const listItems = [];
  CAMPUS_POINTS.forEach((pt) => {
    if (pt.group === 'zone' && !showZones) return;
    if (pt.group === 'flood' && !showFlood) return;
    if (pt.group === 'heat' && !showHeat) return;
    if (pt.group === 'medical' && !showMed) return;

    const iconCls =
      pt.group === 'zone'
        ? pt.severity === 'warn'
          ? 'pin-zone-warn'
          : 'pin-zone'
        : pt.group === 'medical'
          ? 'pin-med'
          : pt.group === 'flood'
            ? 'pin-flood'
            : 'pin-heat';

    window.L.marker([pt.lat, pt.lng], { icon: makePinIcon(iconCls, pt.badge) })
      .bindPopup(
        `<strong>${esc(pt.title)}</strong><br><small>Cao độ mặt đất: ~${pt.elevationM} m</small><br>${esc(pt.desc)}<br><span style="color:#0f766e"><strong>Khuyến nghị:</strong> ${esc(pt.action)}</span>`
      )
      .addTo(markerLayer);

    listItems.push(pt);
  });

  const listEl = document.getElementById('points-list');
  if (listEl) {
    listEl.innerHTML = listItems
      .map(
        (pt) => `
        <button type="button" class="pt-item js-focus-pt" data-lat="${pt.lat}" data-lng="${pt.lng}" data-title="${esc(pt.title)}">
          <span class="pt-badge is-${esc(pt.group)}">${esc(pt.badge)}</span>
          <span class="pt-copy">
            <strong>${esc(pt.title)}</strong>
            <span>${esc(pt.desc.slice(0, 88))}...</span>
          </span>
        </button>`
      )
      .join('');
  }
}

function selectZone(zoneCode, fly = true) {
  const z = CAMPUS_ZONES.find((x) => x.id === zoneCode) || CAMPUS_ZONES[0];
  state.activeZone = z.id;
  document.querySelectorAll('.zone-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.zone === z.id));
  document.getElementById('active-zone-note').innerHTML =
    `<strong>${esc(z.address)}</strong> (${esc(z.areaLabel)}). ${esc(z.shortDesc)} ${esc(z.advice)} ` +
    `<a href="${esc(z.googleMapsUrl)}" target="_blank" rel="noopener" style="color:#1e5fc4;font-weight:700;">Google Maps ↗</a>`;

  selectMedicalOrigin(z.id, false);
  if (fly && map) {
    if (Array.isArray(z.polygon) && z.polygon.length >= 3) {
      map.fitBounds(window.L.latLngBounds(z.polygon), { padding: [55, 55], maxZoom: 17 });
    } else {
      map.flyTo([z.lat, z.lng], z.id === 'B' ? 16 : 17, { duration: 0.45 });
    }
  }
}

function selectMedicalOrigin(originCode, fit = true) {
  const mr = CAMPUS_ROUTES.medicalRoutes[originCode] || CAMPUS_ROUTES.medicalRoutes.A;
  state.activeOrigin = originCode;
  document.querySelectorAll('.origin-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.origin === originCode));
  document.getElementById('med-route-title').textContent = `${mr.fromLabel} → ${mr.targetLabel}`;
  document.getElementById('med-route-stat').textContent = `~${mr.distanceM} m · ~${mr.walkMin} phút`;
  document.getElementById('med-route-note').textContent = mr.note;
  renderMapLayers();
  if (fit && map && document.getElementById('toggle-med').checked) {
    map.fitBounds(window.L.latLngBounds(mr.coordinates), { padding: [45, 45] });
  }
}

function updateTimeContext(hourNum, isHeavyRainPreset = false) {
  const hr = Math.floor(hourNum);
  const min = hourNum % 1 === 0.5 ? '30' : '00';
  document.getElementById('time-display').textContent = `${String(hr).padStart(2, '0')}:${min}`;
  const badge = document.getElementById('live-context-badge');
  const advice = document.getElementById('time-advice');

  if (isHeavyRainPreset || (hourNum > 14.5 && hourNum <= 18.5)) {
    badge.className = 'badge badge-red';
    badge.textContent = isHeavyRainPreset ? 'Mưa lớn: Bật vùng ngập & Tránh xoáy cống' : 'Chiều chuyển tiết: Dễ mưa dông';
    advice.textContent =
      'Cảnh báo ngập cục bộ cuối Phố Viên & bờ Tây sông Nhuệ (Khu B). KHÔNG chạy xe máy qua đoạn xoáy cống; ưu tiên tuyến vòng an toàn.';
    document.getElementById('layer-flood').checked = true;
    document.getElementById('toggle-safe-ab').checked = true;
    document.getElementById('btn-mode-rain').classList.add('is-active');
    document.getElementById('btn-mode-heat').classList.remove('is-active');
  } else if (hourNum >= 11 && hourNum <= 14.5) {
    badge.className = 'badge badge-amber';
    badge.textContent = '11h00–14h30: Nắng gắt';
    advice.textContent =
      'Nắng bức xạ cao tại sân mở Khu A – A1 và trạm buýt Phố Viên. Ưu tiên đi theo Tuyến xanh lá (85% bóng mát) và uống đủ nước.';
    document.getElementById('btn-mode-heat').classList.add('is-active');
    document.getElementById('btn-mode-rain').classList.remove('is-active');
  } else {
    badge.className = 'badge badge-blue';
    badge.textContent = 'Thời tiết tương đối dịu';
    advice.textContent = 'Điều kiện di chuyển thuận lợi quanh Khu A, A1, B. Luôn lưu sẵn vị trí Trạm Y tế trường.';
    document.getElementById('btn-mode-heat').classList.remove('is-active');
    document.getElementById('btn-mode-rain').classList.remove('is-active');
  }
  renderMapLayers();
}

/* ================= BỘ QUIZ 15 CÂU TRẮC NGHIỆM ================= */
function renderQuiz15() {
  const listEl = document.getElementById('quiz-questions-list');
  const answeredCnt = Object.keys(state.quizAnswers).length;
  document.getElementById('quiz-progress-text').innerHTML = `Đã chọn: <strong>${answeredCnt} / ${QUIZ_15_QUESTIONS.length}</strong> câu`;
  document.getElementById('quiz-progress-fill').style.width = `${Math.round((answeredCnt / QUIZ_15_QUESTIONS.length) * 100)}%`;

  listEl.innerHTML = QUIZ_15_QUESTIONS.map((q, qIdx) => {
    const picked = state.quizAnswers[q.id];
    const cls = state.quizSubmitted ? (picked === q.correctIndex ? 'is-correct' : 'is-wrong') : '';
    return `
      <article class="quiz-card ${cls}">
        <span class="quiz-topic">Câu ${qIdx + 1}/15 · ${esc(q.topic)}</span>
        <p class="quiz-q">${esc(q.question)}</p>
        <div class="quiz-opts">
          ${q.options
            .map(
              (opt, idx) => `
              <label class="quiz-opt">
                <input type="radio" name="q_${q.id}" value="${idx}" ${picked === idx ? 'checked' : ''} ${state.quizSubmitted ? 'disabled' : ''}>
                <span>${esc(opt)}</span>
              </label>`
            )
            .join('')}
        </div>
        ${
          state.quizSubmitted
            ? `<div class="quiz-explain"><strong>Đáp án đúng:</strong> ${esc(q.options[q.correctIndex])}<br>${esc(q.explanation)}</div>`
            : ''
        }
      </article>`;
  }).join('');
}

function submitQuiz15() {
  const answered = Object.keys(state.quizAnswers).length;
  if (answered < QUIZ_15_QUESTIONS.length) {
    showToast(`Bạn mới chọn ${answered}/15 câu — hãy hoàn thành đủ 15 câu để chấm điểm!`);
    return;
  }
  state.quizSubmitted = true;
  let score = 0;
  QUIZ_15_QUESTIONS.forEach((q) => {
    if (state.quizAnswers[q.id] === q.correctIndex) score++;
  });

  const stuName = (document.getElementById('quiz-student-name').value || '').trim() || 'Sinh viên HUMG';
  const logs = JSON.parse(localStorage.getItem(QUIZ_LOGS_KEY) || '[]');
  logs.unshift({
    id: `QZ-${Date.now().toString().slice(-4)}`,
    name: stuName,
    className: 'HUMG',
    score,
    total: QUIZ_15_QUESTIONS.length,
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' · Hôm nay'
  });
  localStorage.setItem(QUIZ_LOGS_KEY, JSON.stringify(logs.slice(0, 40)));

  const tier =
    score >= 13
      ? 'Xuất sắc — Sẵn sàng làm Tình nguyện viên An toàn Mỏ!'
      : score >= 10
        ? 'Đạt yêu cầu — Nắm vững kiến thức ứng phó quanh trường'
        : 'Cần ôn thêm — Hãy xem lại giải thích các câu đỏ bên dưới';

  const resEl = document.getElementById('quiz-result-banner');
  resEl.hidden = false;
  resEl.innerHTML = `
    <h2 style="margin:0 0 6px;color:#1e5fc4;">Kết quả Bộ Quiz 15 câu: ${score} / 15 câu đúng (${Math.round((score / 15) * 100)}%)</h2>
    <p style="margin:0;font-size:0.86rem;"><strong>Xếp loại:</strong> ${esc(tier)} · Đã lưu kết quả của <strong>${esc(stuName)}</strong> vào Trang Quản trị.</p>
  `;
  renderQuiz15();
  resEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ================= TRẢI NGHIỆM & GÓP Ý CỘNG ĐỒNG ================= */
function renderCommunityFeedbacks() {
  const localLogs = JSON.parse(localStorage.getItem(FEEDBACK_LOGS_KEY) || '[]');
  const merged = [...localLogs, ...MOCK_ADMIN_DATA.feedbackItems];
  document.getElementById('exp-count').textContent = String(localLogs.length);
  document.getElementById('feedback-list').innerHTML = merged
    .map(
      (f) => `
      <div class="fb-card">
        <div class="fb-top"><span>${esc(f.name)}</span><span style="color:#64748b;font-weight:500;">${esc(f.time)}</span></div>
        <div class="fb-type">${esc(f.route)}</div>
        <div>${esc(f.note)}</div>
      </div>`
    )
    .join('');
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('btn-brand-home')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('map');
  });

  document.querySelectorAll('.mob-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mob;
      document.getElementById('split-layout').dataset.mob = m;
      document.querySelectorAll('.mob-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      if (m === 'map') setTimeout(() => map?.invalidateSize(), 60);
    });
  });

  document.querySelectorAll('.zone-btn').forEach((b) => b.addEventListener('click', () => selectZone(b.dataset.zone, true)));
  document.getElementById('btn-fit-all-zones')?.addEventListener('click', () => {
    document.getElementById('layer-zones').checked = true;
    renderMapLayers();
    fitAllZones();
  });
  document.querySelectorAll('.origin-btn').forEach((b) => b.addEventListener('click', () => selectMedicalOrigin(b.dataset.origin, true)));
  document.querySelectorAll('.bm-btn').forEach((b) => b.addEventListener('click', () => setBasemap(b.dataset.bm)));

  document.getElementById('time-slider')?.addEventListener('input', (ev) => updateTimeContext(Number(ev.target.value), false));
  document.getElementById('btn-mode-heat')?.addEventListener('click', () => {
    document.getElementById('time-slider').value = '12.5';
    updateTimeContext(12.5, false);
  });
  document.getElementById('btn-mode-rain')?.addEventListener('click', () => {
    document.getElementById('time-slider').value = '17';
    updateTimeContext(17, true);
    map?.fitBounds(
      window.L.latLngBounds([
        [21.0665, 105.7595],
        [21.0745, 105.7812]
      ]),
      { padding: [32, 32] }
    );
  });

  document.getElementById('btn-focus-cool')?.addEventListener('click', () => {
    document.getElementById('toggle-cool').checked = true;
    renderMapLayers();
    map?.fitBounds(window.L.latLngBounds(CAMPUS_ROUTES.coolRoute.coordinates), { padding: [50, 50] });
  });

  ['toggle-cool', 'toggle-med', 'toggle-safe-ab', 'layer-zones', 'layer-flood', 'layer-heat', 'layer-med'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', renderMapLayers);
  });

  document.getElementById('points-list')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.js-focus-pt');
    if (!btn || !map) return;
    document.getElementById('split-layout').dataset.mob = 'map';
    document.querySelectorAll('.mob-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.mob === 'map'));
    map.flyTo([Number(btn.dataset.lat), Number(btn.dataset.lng)], 17, { duration: 0.4 });
    showToast(`Đang xem: ${btn.dataset.title}`);
  });

  document.getElementById('quiz-questions-list')?.addEventListener('change', (ev) => {
    const inp = ev.target.closest('input[type="radio"]');
    if (!inp || state.quizSubmitted) return;
    const qId = Number(inp.name.replace('q_', ''));
    state.quizAnswers[qId] = Number(inp.value);
    const cnt = Object.keys(state.quizAnswers).length;
    document.getElementById('quiz-progress-text').innerHTML = `Đã chọn: <strong>${cnt} / ${QUIZ_15_QUESTIONS.length}</strong> câu`;
    document.getElementById('quiz-progress-fill').style.width = `${Math.round((cnt / QUIZ_15_QUESTIONS.length) * 100)}%`;
  });

  document.getElementById('btn-quiz-submit')?.addEventListener('click', submitQuiz15);
  document.getElementById('btn-quiz-submit-bottom')?.addEventListener('click', submitQuiz15);
  document.getElementById('btn-quiz-reset')?.addEventListener('click', () => {
    state.quizAnswers = {};
    state.quizSubmitted = false;
    document.getElementById('quiz-result-banner').hidden = true;
    renderQuiz15();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('feedback-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const note = document.getElementById('fb-note').value.trim();
    if (!note) return;
    const logs = JSON.parse(localStorage.getItem(FEEDBACK_LOGS_KEY) || '[]');
    logs.unshift({
      id: `FB-${Date.now().toString().slice(-4)}`,
      name: document.getElementById('fb-name').value.trim() || 'Sinh viên HUMG',
      route: document.getElementById('fb-type').value,
      note,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' · Hôm nay',
      isRead: false
    });
    localStorage.setItem(FEEDBACK_LOGS_KEY, JSON.stringify(logs));
    document.getElementById('fb-note').value = '';
    renderCommunityFeedbacks();
    showToast('Đã ghi nhận phản ánh / trải nghiệm và đồng bộ sang Trang Quản trị!');
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const localLogs = JSON.parse(localStorage.getItem(FEEDBACK_LOGS_KEY) || '[]');
    const all = [...localLogs, ...MOCK_ADMIN_DATA.feedbackItems];
    const rows = [['HoTen_Lop', 'ChuDe', 'NoiDung', 'ThoiGian'], ...all.map((x) => [x.name, x.route, x.note, x.time])];
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'humg-campus-feedback.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function boot() {
  trackVisitIncrement();
  if (checkPublicLockState()) return;
  bindEvents();
  initCampusMap();
  updateTimeContext(12.5, false);
  renderQuiz15();
  renderCommunityFeedbacks();
}

boot();
