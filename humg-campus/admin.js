import { CAMPUS_POINTS, FLOOD_ZONES, MOCK_ADMIN_DATA } from './data/campus-data.js';

const AUTH_KEY = 'humg_campus_admin_authed';
const LOCK_KEY = 'humg_campus_public_locked';
const QUIZ_LOGS_KEY = 'humg_campus_quiz_logs';
const FEEDBACK_LOGS_KEY = 'humg_campus_feedback_logs';
const SIM_VISITS_KEY = 'humg_campus_sim_visits';

const state = {
  section: 'overview',
  confirmingLock: false,
  readMap: {},
  resolvedMap: {}
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAllQuizAttempts() {
  const local = JSON.parse(localStorage.getItem(QUIZ_LOGS_KEY) || '[]');
  return [...local, ...MOCK_ADMIN_DATA.quizStats.recentAttempts];
}

function getAllFeedbacks() {
  const local = JSON.parse(localStorage.getItem(FEEDBACK_LOGS_KEY) || '[]');
  return [...local, ...MOCK_ADMIN_DATA.feedbackItems].map((x) => ({
    ...x,
    isRead: Boolean(x.isRead || state.readMap[x.id])
  }));
}

function getAllComplaints() {
  return MOCK_ADMIN_DATA.incidentReports.map((c) => ({
    ...c,
    status: state.resolvedMap[c.id] ? 'resolved' : c.status
  }));
}

function switchSection(sec) {
  state.section = sec;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.section === sec));
  ['overview', 'points', 'feedback', 'quiz', 'complaints'].forEach((s) => {
    const el = document.getElementById(`sec-${s}`);
    if (el) el.hidden = s !== sec;
  });
  document.getElementById('admin-sidebar')?.classList.remove('is-open');
}

function renderDashboard() {
  const floodPtsCount = CAMPUS_POINTS.filter((p) => p.group === 'flood').length + FLOOD_ZONES.length;
  const quizLogs = JSON.parse(localStorage.getItem(QUIZ_LOGS_KEY) || '[]');
  const totalQuizAttempts = MOCK_ADMIN_DATA.quizStats.baseAttempts + quizLogs.length;

  let avgScore = MOCK_ADMIN_DATA.quizStats.baseAvgScore;
  if (quizLogs.length > 0) {
    const localSum = quizLogs.reduce((s, x) => s + Number(x.score || 0), 0);
    avgScore = Math.round(((MOCK_ADMIN_DATA.quizStats.baseAvgScore * MOCK_ADMIN_DATA.quizStats.baseAttempts + localSum) / totalQuizAttempts) * 10) / 10;
  }

  document.getElementById('kpi-total-pts').textContent = String(CAMPUS_POINTS.length);
  document.getElementById('kpi-zones').textContent = '3';
  document.getElementById('kpi-floods').textContent = String(floodPtsCount);
  document.getElementById('kpi-quiz-count').textContent = totalQuizAttempts.toLocaleString('vi-VN');
  document.getElementById('kpi-quiz-avg').textContent = `${avgScore}/15`;

  // Lượt truy cập ảo + tăng thêm theo phiên
  const simDelta = Number(localStorage.getItem(SIM_VISITS_KEY) || '0');
  document.getElementById('vis-total').textContent = (MOCK_ADMIN_DATA.visits.total + simDelta).toLocaleString('vi-VN');
  document.getElementById('vis-today').textContent = (MOCK_ADMIN_DATA.visits.today + simDelta).toLocaleString('vi-VN');
  document.getElementById('vis-unique').textContent = (MOCK_ADMIN_DATA.visits.unique + Math.floor(simDelta * 0.65)).toLocaleString('vi-VN');

  document.getElementById('vis-by-page').innerHTML = MOCK_ADMIN_DATA.visits.byPage
    .map(
      (p, idx) => `
      <div class="pb-row">
        <span>${esc(p.label)}</span>
        <strong>${(p.views + (idx === 0 ? simDelta : 0)).toLocaleString('vi-VN')}</strong>
      </div>`
    )
    .join('');

  const maxBar = Math.max(...MOCK_ADMIN_DATA.visits.last7Days.map((d) => d.visits + simDelta * 0.1));
  document.getElementById('vis-7day-chart').innerHTML = MOCK_ADMIN_DATA.visits.last7Days
    .map((d, idx) => {
      const val = d.visits + (idx === 6 ? simDelta : 0);
      const pct = Math.max(18, Math.round((val / maxBar) * 62));
      return `
        <div class="bar-col">
          <span class="bar-val">${val}</span>
          <div class="bar-fill" style="height:${pct}px"></div>
          <span class="bar-lbl">${esc(d.day)}</span>
        </div>`;
    })
    .join('');

  // Trạng thái khóa công khai
  const isLocked = localStorage.getItem(LOCK_KEY) === 'true';
  const badge = document.getElementById('public-lock-badge');
  const lockBtn = document.getElementById('btn-toggle-public-lock');
  badge.className = `status-pill ${isLocked ? 'is-locked' : 'is-open'}`;
  badge.textContent = isLocked ? 'Đang khóa' : 'Đang mở';
  lockBtn.textContent = state.confirmingLock
    ? 'Chắc chắn đổi?'
    : isLocked
      ? 'Mở lại khu vực công khai'
      : 'Khóa khu vực công khai';

  // Badges cho 4 thẻ tổng quan & sidebar
  const feedbacks = getAllFeedbacks();
  const unreadFb = feedbacks.filter((x) => !x.isRead).length;
  const complaints = getAllComplaints();
  const pendingComp = complaints.filter((x) => x.status !== 'resolved').length;

  document.getElementById('nav-badge-fb').textContent = String(unreadFb);
  document.getElementById('nav-badge-comp').textContent = String(pendingComp);
  document.getElementById('ov-pts-badge').textContent = `${CAMPUS_POINTS.length} điểm`;
  document.getElementById('ov-fb-badge').textContent = `${unreadFb} mới`;
  document.getElementById('ov-quiz-badge').textContent = `${totalQuizAttempts} lượt`;
  document.getElementById('ov-comp-badge').textContent = `${pendingComp} chờ xử lý`;

  renderPointsTable();
  renderFeedbackSection();
  renderQuizTable();
  renderComplaintsSection();
}

function renderPointsTable() {
  const q = (document.getElementById('pts-search')?.value || '').trim().toLowerCase();
  const grp = document.getElementById('pts-filter')?.value || 'all';
  const groupLabels = {
    zone: '3 Khu trường (A/A1/B)',
    flood: 'Điểm ngập / Nguy hiểm',
    heat: 'Nắng nóng',
    medical: 'Y tế / Nhà thuốc'
  };
  const filtered = CAMPUS_POINTS.filter((p) => {
    if (grp !== 'all' && p.group !== grp) return false;
    if (q && !`${p.id} ${p.title} ${p.desc}`.toLowerCase().includes(q)) return false;
    return true;
  });

  document.getElementById('admin-pts-tbody').innerHTML = filtered
    .map(
      (p) => `
      <tr>
        <td><strong>${esc(p.id)}</strong></td>
        <td><strong>${esc(p.title)}</strong></td>
        <td>${esc(groupLabels[p.group] || p.group)}</td>
        <td>~${p.elevationM} m</td>
        <td style="font-variant-numeric:tabular-nums;">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</td>
      </tr>`
    )
    .join('');
}

function renderFeedbackSection() {
  const list = getAllFeedbacks();
  document.getElementById('admin-feedback-list').innerHTML = list
    .map(
      (f) => `
      <div class="item-card">
        <div class="item-top">
          <strong>${esc(f.name)}</strong>
          <span class="badge-chip ${f.isRead ? 'badge-blue' : 'badge-amber'}">${f.isRead ? 'Đã xem' : 'Mới'}</span>
        </div>
        <div class="item-meta">${esc(f.route)} · ${esc(f.time)}</div>
        <p style="margin:0 0 10px;">${esc(f.note)}</p>
        ${!f.isRead ? `<button type="button" class="btn-outline-sm js-mark-read" data-id="${esc(f.id)}">Đánh dấu đã xem</button>` : ''}
      </div>`
    )
    .join('');
}

function renderQuizTable() {
  const attempts = getAllQuizAttempts();
  document.getElementById('admin-quiz-tbody').innerHTML = attempts
    .map(
      (a) => `
      <tr>
        <td><strong>${esc(a.id)}</strong></td>
        <td>${esc(a.name)}</td>
        <td>${esc(a.className)}</td>
        <td><strong class="${a.score >= 12 ? 'text-emerald' : 'text-amber'}">${a.score} / ${a.total}</strong></td>
        <td>${esc(a.time)}</td>
      </tr>`
    )
    .join('');
}

function renderComplaintsSection() {
  const list = getAllComplaints();
  document.getElementById('admin-complaints-list').innerHTML = list
    .map(
      (c) => `
      <div class="item-card">
        <div class="item-top">
          <strong>[${esc(c.id)}] ${esc(c.title)}</strong>
          <span class="badge-chip ${c.status === 'resolved' ? 'badge-blue' : 'badge-red'}">${c.status === 'resolved' ? 'Đã xử lý / Gắn biển' : 'Chờ kiểm tra'}</span>
        </div>
        <div class="item-meta">Khu vực: ${esc(c.zone)} · Người gửi: ${esc(c.reporter)} · ${esc(c.time)}</div>
        ${c.status !== 'resolved' ? `<button type="button" class="btn-outline-sm js-resolve-comp" data-id="${esc(c.id)}">Đánh dấu đã kiểm tra thực địa</button>` : ''}
      </div>`
    )
    .join('');
}

function setAuthState(authed) {
  document.getElementById('admin-login-screen').hidden = authed;
  document.getElementById('admin-shell').hidden = !authed;
  if (authed) renderDashboard();
}

function bindEvents() {
  document.getElementById('admin-login-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    if (email !== 'thuxinhgai@humg.edu.vn' || pass !== 'anhthu123') {
      errEl.hidden = false;
      errEl.textContent = 'Email hoặc mật khẩu không chính xác.';
      return;
    }
    errEl.hidden = true;
    sessionStorage.setItem(AUTH_KEY, '1');
    setAuthState(true);
  });

  document.getElementById('btn-admin-logout')?.addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_KEY);
    setAuthState(false);
  });

  document.getElementById('btn-mob-menu')?.addEventListener('click', () => {
    document.getElementById('admin-sidebar')?.classList.toggle('is-open');
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  document.querySelectorAll('.js-go-sec').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.target));
  });

  document.getElementById('btn-toggle-public-lock')?.addEventListener('click', () => {
    if (!state.confirmingLock) {
      state.confirmingLock = true;
      renderDashboard();
      return;
    }
    state.confirmingLock = false;
    const nextLocked = localStorage.getItem(LOCK_KEY) !== 'true';
    localStorage.setItem(LOCK_KEY, nextLocked ? 'true' : 'false');
    document.getElementById('public-lock-msg').textContent = nextLocked
      ? 'Đã khóa khu vực công khai: người dùng vào trang bản đồ sẽ thấy thông báo bảo trì.'
      : 'Đã mở lại khu vực công khai: mọi người truy cập Bản đồ Khu A, A1, B bình thường.';
    renderDashboard();
  });

  document.getElementById('pts-search')?.addEventListener('input', renderPointsTable);
  document.getElementById('pts-filter')?.addEventListener('change', renderPointsTable);

  document.getElementById('btn-export-quiz-csv')?.addEventListener('click', () => {
    const all = getAllQuizAttempts();
    const rows = [['MaLuot', 'HoTen', 'Lop', 'Diem', 'ThoiGian'], ...all.map((a) => [a.id, a.name, a.className, `${a.score}/${a.total}`, a.time])];
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'humg-quiz-15-cau-ket-qua.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.addEventListener('click', (ev) => {
    const readBtn = ev.target.closest('.js-mark-read');
    if (readBtn) {
      state.readMap[readBtn.dataset.id] = true;
      renderDashboard();
      return;
    }
    const compBtn = ev.target.closest('.js-resolve-comp');
    if (compBtn) {
      state.resolvedMap[compBtn.dataset.id] = true;
      renderDashboard();
    }
  });
}

bindEvents();
setAuthState(sessionStorage.getItem(AUTH_KEY) === '1');
