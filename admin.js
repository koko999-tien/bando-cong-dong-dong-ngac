import { PROJECT_CONFIG } from './config.js';
import { HUMG_CENTER, SAMPLE_HUMG_POINTS, ALERT_BULLETINS } from './humg-data.js';
import {
  CATEGORY_LABELS,
  normalizePointRecord,
  analyzeSurveyPoints,
  findDuplicatePairs,
  auditPointsQuality,
  computePrePostEvaluation,
  exportToCSV,
  exportToGeoJSON,
  exportToKML
} from './gis-utils.js';
import { buildNotebookLmSourceMarkdown } from './knowledge-engine.js';

const STORAGE_KEY = 'humg_dongngac_community_gis_v7';
const API_URL_KEY = 'humg_dongngac_api_url_v3';
const BROADCAST_KEY = 'humg_dongngac_broadcast_v1';
const KPI_KEY = 'humg_dongngac_kpi_tracker_v1';
const AUDIT_LOG_KEY = 'humg_dongngac_admin_audit_v1';
const ADMIN_TOKEN_KEY = 'humg_dongngac_admin_bearer_v1';

const turf = window.turf;
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('humg_gis_sync') : null;

const DEFAULT_KPIS = [
  { id: 'pretest', label: '1. Phiếu khảo sát đầu vào (Pre-test 15 câu)', target: 50, current: 0, unit: 'phiếu', autoGps: false },
  { id: 'gps', label: '2. Điểm thực địa & xác thực có tọa độ GPS (≤2km)', target: 15, current: 32, unit: 'điểm', autoGps: true },
  { id: 'reach', label: '3. Lượt tiếp cận bài truyền thông (FB/Zalo/TikTok)', target: 300, current: 0, unit: 'lượt', autoGps: false },
  { id: 'engage', label: '4. Lượt tương tác (Like, Share, Bình luận, +1 Web)', target: 100, current: 0, unit: 'lượt', autoGps: false },
  { id: 'bitly', label: '5. Lượt mở Bản đồ số (Bitly Analytics)', target: 60, current: 0, unit: 'lượt', autoGps: false },
  { id: 'quiz', label: '6. Người hoàn thành Mini-Quiz diễn tập 5 câu', target: 30, current: 0, unit: 'người', autoGps: false },
  { id: 'post_acc', label: '7. Mức tăng trả lời đúng sơ cứu sốc nhiệt (Post vs Pre)', target: 30, current: 0, unit: '%', autoGps: false },
  { id: 'post_conf', label: '8. Mức tăng điểm tự tin trung bình (thang 5, ×10)', target: 10, current: 0, unit: '×0,1đ', autoGps: false }
];

let currentSource = 'local'; // 'local' | 'cloud'
let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
let rows = [];
let cloudAuditLog = [];
let cloudSurveyRecords = [];
let cloudKpiLive = null;
let selectedIds = new Set();
let editingExistingId = null;

const authGate = document.getElementById('admin-auth-gate');
const gateForm = document.getElementById('admin-gate-form');
const gatePassInput = document.getElementById('gate-pass-input');
const gateErrorMsg = document.getElementById('gate-error-msg');
const btnLogout = document.getElementById('btn-admin-logout');
const apiInput = document.getElementById('adm-api');
const passInput = document.getElementById('adm-pass');
const cloudStatus = document.getElementById('adm-cloud-status');

apiInput.value = localStorage.getItem(API_URL_KEY) || PROJECT_CONFIG.communityApiUrl || '/api/community';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('adm-toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 3400);
}

function getApiUrl() {
  return (apiInput.value || '').trim() || PROJECT_CONFIG.communityApiUrl || '/api/community';
}

async function cloudAdminPost(payload) {
  const res = await fetch(getApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (res.status === 401) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    adminToken = '';
    authGate.hidden = false;
  }
  return data;
}

function mergeBaselineAndCloud(data) {
  const counts = data.confirmCounts || {};
  const modMap = data.moderationMap || {};
  const byId = new Map();

  for (const basePt of SAMPLE_HUMG_POINTS) {
    const mod = modMap[basePt.id] || {};
    const merged = { ...structuredClone(basePt), ...mod };
    merged.confirmCount = Math.max(Number(merged.confirmCount) || 1, (basePt.confirmCount || 1) + (counts[basePt.id] || 0));
    byId.set(basePt.id, merged);
  }
  for (const rep of data.reports || []) {
    byId.set(rep.id, rep);
  }
  return [...byId.values()];
}

async function loadCloudWorkspace(silentFail = false) {
  if (!adminToken) {
    if (!silentFail) authGate.hidden = false;
    return false;
  }
  try {
    const t0 = performance.now();
    const sep = getApiUrl().includes('?') ? '&' : '?';
    const res = await fetch(`${getApiUrl()}${sep}action=admin_full&surveys=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store'
    });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);

    if (!res.ok || !data?.ok || !data.isAdmin) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      adminToken = '';
      if (!silentFail) {
        gateErrorMsg.textContent = data?.error || 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
        gateErrorMsg.hidden = false;
        authGate.hidden = false;
      }
      return false;
    }

    currentSource = 'cloud';
    rows = mergeBaselineAndCloud(data);
    cloudAuditLog = Array.isArray(data.auditLog) ? data.auditLog : [];
    cloudSurveyRecords = Array.isArray(data.surveyRecords) ? data.surveyRecords : [];
    cloudKpiLive = data.kpiLive || null;

    if (data.broadcast) {
      if (data.broadcast.active && data.broadcast.message) {
        document.getElementById('bc-level').value = data.broadcast.level || 'yellow';
        document.getElementById('bc-message').value = data.broadcast.message;
      }
    }

    authGate.hidden = true;
    btnLogout.hidden = false;
    const pill = document.getElementById('adm-source-pill');
    pill.textContent = `Đã xác thực Cloud (${rows.length} điểm · ${ms}ms)`;
    pill.classList.add('is-cloud');
    cloudStatus.textContent = `Đồng bộ Cloud thành công (${rows.length} điểm, ${cloudSurveyRecords.length} phiếu khảo sát) trong ${ms} ms.`;

    syncCloudKpisIntoTracker();
    refreshAllViews();
    return true;
  } catch (err) {
    if (!silentFail) {
      cloudStatus.textContent = `Lỗi kết nối máy chủ Cloud: ${err.message}`;
    }
    return false;
  }
}

function syncCloudKpisIntoTracker() {
  if (!cloudKpiLive) return;
  const liveBar = document.getElementById('cloud-survey-live-bar');
  if (liveBar) {
    liveBar.hidden = false;
    liveBar.innerHTML = `<strong>Số liệu Khảo sát Trực tiếp trên Cloud:</strong> Pre-test: <strong class="mono">${cloudKpiLive.preCount}</strong> phiếu${cloudKpiLive.preCorrectPct !== null ? ` (${cloudKpiLive.preCorrectPct}% đúng sốc nhiệt · TB tự tin ${cloudKpiLive.preConfAvg}/5)` : ''} · Mini-Quiz Diễn tập: <strong class="mono">${cloudKpiLive.quizCount}</strong> lượt${cloudKpiLive.quizAvgScore !== null ? ` (TB ${cloudKpiLive.quizAvgScore}/100đ)` : ''} · Post-test: <strong class="mono">${cloudKpiLive.postCount}</strong> phiếu${cloudKpiLive.postCorrectPct !== null ? ` (${cloudKpiLive.postCorrectPct}% đúng · TB tự tin ${cloudKpiLive.postConfAvg}/5)` : ''}.`;
  }

  const kpis = loadSavedKpis();
  const kPre = kpis.find((k) => k.id === 'pretest');
  const kQuiz = kpis.find((k) => k.id === 'quiz');
  if (kPre && cloudKpiLive.preCount > kPre.current) kPre.current = cloudKpiLive.preCount;
  if (kQuiz && cloudKpiLive.quizCount > kQuiz.current) kQuiz.current = cloudKpiLive.quizCount;

  if (cloudKpiLive.preCount > 0) {
    document.getElementById('pp-n1').value = cloudKpiLive.preCount;
    if (cloudKpiLive.preCorrectPct !== null) document.getElementById('pp-c1').value = cloudKpiLive.preCorrectPct;
    if (cloudKpiLive.preConfAvg !== null) document.getElementById('pp-f1').value = cloudKpiLive.preConfAvg;
  }
  if (cloudKpiLive.postCount > 0) {
    document.getElementById('pp-n2').value = cloudKpiLive.postCount;
    if (cloudKpiLive.postCorrectPct !== null) document.getElementById('pp-c2').value = cloudKpiLive.postCorrectPct;
    if (cloudKpiLive.postConfAvg !== null) document.getElementById('pp-f2').value = cloudKpiLive.postConfAvg;
  }
  localStorage.setItem(KPI_KEY, JSON.stringify(kpis));
}

async function loginWithPasscode(passcode) {
  const res = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'admin_login', pass: passcode })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok || !data.token) {
    throw new Error(data?.error || 'Mật khẩu quản trị không chính xác.');
  }
  adminToken = data.token;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  await loadCloudWorkspace(false);
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = gatePassInput.value.trim();
  if (!pass) return;
  gateErrorMsg.hidden = true;
  const submitBtn = document.getElementById('btn-gate-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang xác thực chữ ký HMAC-SHA256...';
  try {
    await loginWithPasscode(pass);
    gatePassInput.value = '';
    showToast('Đã đăng nhập Quản trị viên Cloud thành công!');
  } catch (err) {
    gateErrorMsg.textContent = err.message;
    gateErrorMsg.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Đăng nhập Quản trị Cloud';
  }
});

document.getElementById('btn-gate-local-demo').addEventListener('click', () => {
  authGate.hidden = true;
  btnLogout.hidden = true;
  loadLocalRows();
  showToast('Đang mở ở Chế độ Thử nghiệm Cục bộ (không tác động dữ liệu Cloud chung).');
});

btnLogout.addEventListener('click', () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  adminToken = '';
  btnLogout.hidden = true;
  authGate.hidden = false;
  showToast('Đã đăng xuất phiên Quản trị viên.');
});

function appendAuditLog(action, detail) {
  try {
    const entry = {
      ts: new Date().toLocaleString('vi-VN'),
      mode: currentSource,
      action,
      detail
    };
    if (currentSource === 'cloud') {
      cloudAuditLog.unshift(entry);
    } else {
      const list = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
      list.unshift(entry);
      localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(list.slice(0, 120)));
    }
    renderAuditLog();
  } catch { /* ignore */ }
}

function notifyMapTabs() {
  syncChannel?.postMessage({ updatedAt: Date.now() });
}

function loadLocalRows() {
  currentSource = 'local';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    rows = Array.isArray(saved?.points) && saved.points.length > 0 ? saved.points : structuredClone(SAMPLE_HUMG_POINTS);
  } catch {
    rows = structuredClone(SAMPLE_HUMG_POINTS);
  }
  const pill = document.getElementById('adm-source-pill');
  pill.textContent = `Chế độ: Cục bộ (${rows.length} điểm)`;
  pill.classList.remove('is-cloud');
  refreshAllViews();
}

function saveLocalRows() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        center: saved.center || HUMG_CENTER,
        radiusKm: saved.radiusKm || 2.0,
        showRings: saved.showRings ?? true,
        points: rows
      })
    );
    notifyMapTabs();
  } catch { /* ignore */ }
}

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

// ================= CHUYỂN TAB =================
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.hidden = p.id !== `panel-${target}`;
    });
    if (target === 'system') renderPerfDiagnostics();
  });
});

// ================= TAB 1: OVERVIEW & KPI =================
function loadSavedKpis() {
  try {
    const saved = JSON.parse(localStorage.getItem(KPI_KEY) || 'null');
    if (Array.isArray(saved) && saved.length === DEFAULT_KPIS.length) return saved;
  } catch { /* ignore */ }
  return structuredClone(DEFAULT_KPIS);
}

function renderOverviewAndKpi() {
  const active = rows.filter((r) => r.status !== 'hidden');
  const hiddenCnt = rows.length - active.length;
  const analysis = analyzeSurveyPoints(turf, active, HUMG_CENTER.lat, HUMG_CENTER.lng, 2.0);
  const tierA = analysis.points.filter((p) => p.confidenceTier === 'A').length;
  const tierB = analysis.points.filter((p) => p.confidenceTier === 'B').length;
  const tierC = analysis.points.filter((p) => p.confidenceTier === 'C').length;

  document.getElementById('tab-count-all').textContent = rows.length;
  document.getElementById('ov-total-pts').textContent = analysis.stats.inside;
  document.getElementById('ov-split-layer').textContent = `Rủi ro: ${analysis.stats.riskInside} · An toàn: ${analysis.stats.safeInside}`;
  document.getElementById('ov-verified-ab').textContent = tierA + tierB;
  document.getElementById('ov-split-tier').textContent = `Hạng A: ${tierA} · Hạng B: ${tierB}`;
  document.getElementById('ov-pending-c').textContent = tierC;
  document.getElementById('ov-confirms').textContent = analysis.stats.totalConfirmations;
  document.getElementById('ov-hidden-count').textContent = `Đã ẩn spam/trùng: ${hiddenCnt}`;

  const kpis = loadSavedKpis();
  const gpsItem = kpis.find((k) => k.autoGps);
  if (gpsItem) gpsItem.current = analysis.stats.inside;

  document.getElementById('kpi-tracker-list').innerHTML = kpis
    .map((k) => {
      const pct = Math.min(100, Math.round((Number(k.current) / k.target) * 100));
      const done = Number(k.current) >= k.target;
      return `<div class="kpi-row">
        <div><strong>${esc(k.label)}</strong></div>
        <div>
          <input type="number" class="mono js-kpi-in" data-id="${esc(k.id)}" value="${Number(k.current)}" min="0" ${k.autoGps ? 'readonly style="background:#f1f5f9"' : ''}>
        </div>
        <div class="mono" style="color:#475569;">/ ${k.target} ${esc(k.unit)}</div>
        <div>
          <div class="prog-track"><div class="prog-fill ${done ? 'is-done' : ''}" style="width:${pct}%"></div></div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${done ? 'st-approved' : 'st-pending'}">${done ? 'ĐẠT' : `${pct}%`}</span>
        </div>
      </div>`;
    })
    .join('');

  const cats = ['flood', 'heat', 'traffic', 'medical', 'shelter'];
  const colors = { flood: '#b91c1c', heat: '#ea580c', traffic: '#b45309', medical: '#15803d', shelter: '#0f766e' };
  document.getElementById('category-breakdown-bars').innerHTML = cats
    .map((c) => {
      const cnt = analysis.points.filter((p) => p.category === c).length;
      const pct = active.length ? Math.round((cnt / active.length) * 100) : 0;
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:3px;">
          <strong>${esc(CATEGORY_LABELS[c] || c)}</strong>
          <span class="mono">${cnt} điểm (${pct}%)</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${colors[c]}"></div></div>
      </div>`;
    })
    .join('');
}

document.getElementById('btn-save-kpi').addEventListener('click', () => {
  const kpis = loadSavedKpis();
  document.querySelectorAll('.js-kpi-in').forEach((inp) => {
    const item = kpis.find((k) => k.id === inp.dataset.id);
    if (item && !item.autoGps) item.current = Math.max(0, Number(inp.value) || 0);
  });
  localStorage.setItem(KPI_KEY, JSON.stringify(kpis));
  renderOverviewAndKpi();
  appendAuditLog('Cập nhật KPI', 'Đã lưu tiến độ 8 chỉ tiêu KPI chiến dịch');
  showToast('Đã lưu số liệu tiến độ 8 KPI!');
});

document.getElementById('btn-copy-kpi-md').addEventListener('click', async () => {
  const kpis = loadSavedKpis();
  const md = [
    '| Chỉ tiêu KPI Đề tài 08 | Mục tiêu | Thực đạt | Trạng thái |',
    '| :--- | :---: | :---: | :---: |',
    ...kpis.map((k) => `| ${k.label} | ≥ ${k.target} ${k.unit} | ${k.current} ${k.unit} | ${k.current >= k.target ? 'ĐẠT' : 'Đang triển khai'} |`)
  ].join('\n');
  await navigator.clipboard?.writeText(md);
  showToast('Đã sao chép bảng KPI Markdown để dán thẳng vào Chương 5 báo cáo!');
});

document.getElementById('btn-export-surveys-csv')?.addEventListener('click', async () => {
  if (currentSource === 'cloud') {
    await loadCloudWorkspace(true);
  }
  if (!cloudSurveyRecords || cloudSurveyRecords.length === 0) {
    showToast('Hiện chưa có phiếu khảo sát nào trên Cloud (hãy thử gửi 1 phiếu tại khao-sat.html).');
    return;
  }
  const csvEsc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Mã phiếu', 'Loại phiếu (Pre/Quiz/Post)', 'Thời gian nộp (ISO)', 'Đúng sơ cứu sốc nhiệt (1/0)', 'Điểm tự tin (/5)', 'Điểm Mini-Quiz (/100)', 'Chi tiết câu trả lời (JSON)'];
  const lines = [
    header.map(csvEsc).join(','),
    ...cloudSurveyRecords.map((rec) =>
      [
        rec.id || '',
        rec.surveyType || '',
        rec.submittedAt || '',
        rec.surveyType === 'quiz' ? '' : rec.heatFirstAidCorrect ? 1 : 0,
        rec.confidenceScore ?? '',
        rec.quizScore ?? '',
        JSON.stringify(rec.answers || {})
      ]
        .map(csvEsc)
        .join(',')
    )
  ];
  downloadBlob('\uFEFF' + lines.join('\r\n'), `HUMG_DuLieu_KhaoSat_Pre_Quiz_Post_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  showToast(`Đã xuất ${cloudSurveyRecords.length} phiếu khảo sát ra tệp Excel CSV!`);
});

// ================= TAB 2: MODERATION, CRUD & DUPLICATE MERGER =================
function getFilteredModRows() {
  const q = document.getElementById('mod-search').value.trim().toLowerCase();
  const stFilter = document.getElementById('mod-status').value;
  const tierFilter = document.getElementById('mod-tier').value;
  const catFilter = document.getElementById('mod-cat').value;

  return rows.filter((r) => {
    const st = r.status || (r.confidenceTier === 'C' ? 'pending' : 'approved');
    if (stFilter !== 'all' && st !== stFilter) return false;
    if (tierFilter !== 'all' && (r.confidenceTier || 'C') !== tierFilter) return false;
    if (catFilter !== 'all' && r.category !== catFilter) return false;
    if (q) {
      const hay = `${r.id} ${r.name} ${r.sourceCitation || ''} ${r.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderDuplicateScanner() {
  const pairs = findDuplicatePairs(turf, rows, 50);
  const badge = document.getElementById('dup-count-badge');
  badge.textContent = `${pairs.length} cặp ≤50m`;
  badge.className = `badge mono ${pairs.length > 0 ? 'st-pending' : 'st-approved'}`;

  const box = document.getElementById('dup-pairs-list');
  if (pairs.length === 0) {
    box.innerHTML = '<div style="font-size:0.8rem;color:#15803d;font-weight:600;">Không có điểm trùng lặp nào trong bán kính 50 m.</div>';
    return;
  }
  box.innerHTML = pairs
    .map(
      (pr) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border:1px solid #fde68a;background:#fffbeb;border-radius:6px;margin-bottom:6px;font-size:0.8rem;flex-wrap:wrap;">
        <span><strong>[${esc(pr.primary.id)}] ${esc(pr.primary.name)}</strong> cách <strong>[${esc(pr.secondary.id)}] ${esc(pr.secondary.name)}</strong> chỉ <strong class="mono">${pr.distanceMeters} m</strong></span>
        <button type="button" class="btn btn-primary js-merge-pair" data-keep="${esc(pr.primary.id)}" data-drop="${esc(pr.secondary.id)}">Gộp phiếu vào ${esc(pr.primary.id)} &amp; Ẩn ${esc(pr.secondary.id)}</button>
      </div>`
    )
    .join('');
}

document.getElementById('dup-pairs-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-merge-pair');
  if (!btn) return;
  const keep = rows.find((r) => r.id === btn.dataset.keep);
  const drop = rows.find((r) => r.id === btn.dataset.drop);
  if (!keep || !drop) return;
  const mergedCount = (Number(keep.confirmCount) || 1) + (Number(drop.confirmCount) || 1);
  const nextTier = keep.confidenceTier === 'C' && mergedCount >= 3 ? 'B' : keep.confidenceTier || 'A';

  if (currentSource === 'cloud') {
    const data = await cloudAdminPost({
      action: 'admin_merge_pair',
      keepId: keep.id,
      dropId: drop.id,
      mergedCount,
      nextTier
    });
    if (!data?.ok) {
      showToast(`Lỗi Cloud: ${data?.error || 'Không gộp được'}`);
      return;
    }
  }

  keep.confirmCount = mergedCount;
  keep.confidenceTier = nextTier;
  drop.status = 'hidden';
  saveLocalRows();
  appendAuditLog('Gộp điểm trùng 50m', `Gộp ${drop.id} vào ${keep.id} (tổng ${keep.confirmCount} phiếu)`);
  refreshAllViews();
  showToast(`Đã gộp ${drop.id} vào ${keep.id}!`);
});

function renderModerationTable() {
  const shown = getFilteredModRows();
  const tbody = document.getElementById('adm-tbody');
  document.getElementById('mod-selected-count').textContent = selectedIds.size;

  if (shown.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:24px;">Không có điểm nào khớp bộ lọc hiện tại.</td></tr>';
    return;
  }

  tbody.innerHTML = shown
    .map((r) => {
      const st = r.status || (r.confidenceTier === 'C' ? 'pending' : 'approved');
      const stLabel = st === 'approved' ? 'Công khai' : st === 'hidden' ? 'Đã ẩn' : 'Chờ duyệt';
      const checked = selectedIds.has(r.id) ? 'checked' : '';
      const photoBadge =
        r.photoQualityFlag === 'suspect_spam'
          ? '<br><span class="badge st-hidden" style="margin-top:2px;">Ảnh nghi chụp màn hình</span>'
          : r.photoQualityFlag === 'verified_scene'
            ? '<br><span class="badge st-approved" style="margin-top:2px;">Ảnh hiện trường đạt</span>'
            : '';
      const imgHtml =
        r.photoDataUrl && r.photoDataUrl.startsWith('data:image/')
          ? `<img class="thumb" src="${r.photoDataUrl}" alt="Ảnh ${esc(r.id)}">${photoBadge}`
          : '<span style="color:#94a3b8;font-size:0.73rem;">—</span>';
      return `<tr>
        <td><input type="checkbox" class="js-row-chk" data-id="${esc(r.id)}" ${checked}></td>
        <td><strong class="mono">${esc(r.id)}</strong><br><span class="badge st-${esc(st)}">${stLabel}</span></td>
        <td>
          <strong>${esc(r.name)}</strong>
          <div style="color:#475569;font-size:0.74rem;">${esc(CATEGORY_LABELS[r.category] || r.category)} · ${esc(r.sourceCitation || r.sourceType || '')}</div>
        </td>
        <td class="mono" style="font-size:0.74rem;">${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}<br>DEM: ${r.elevationM ?? '—'} m</td>
        <td>${imgHtml}</td>
        <td class="mono">Hạng <strong>${esc(r.confidenceTier || 'C')}</strong><br>${Number(r.confirmCount) || 1} phiếu</td>
        <td>
          <div class="nav-row">
            <button type="button" class="btn btn-ok js-mod" data-id="${esc(r.id)}" data-st="approved" data-tier="A">Hạng A</button>
            <button type="button" class="btn btn-warn js-mod" data-id="${esc(r.id)}" data-st="approved" data-tier="B">Hạng B</button>
            <button type="button" class="btn js-edit" data-id="${esc(r.id)}">Sửa</button>
            <button type="button" class="btn btn-danger js-mod" data-id="${esc(r.id)}" data-st="hidden" data-tier="${esc(r.confidenceTier || 'C')}">Ẩn</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

['mod-search', 'mod-status', 'mod-tier', 'mod-cat'].forEach((id) => {
  document.getElementById(id).addEventListener('input', renderModerationTable);
  document.getElementById(id).addEventListener('change', renderModerationTable);
});

document.getElementById('mod-check-all').addEventListener('change', (e) => {
  const shown = getFilteredModRows();
  if (e.target.checked) shown.forEach((r) => selectedIds.add(r.id));
  else shown.forEach((r) => selectedIds.delete(r.id));
  renderModerationTable();
});

document.getElementById('adm-tbody').addEventListener('change', (e) => {
  if (!e.target.classList.contains('js-row-chk')) return;
  const id = e.target.dataset.id;
  if (e.target.checked) selectedIds.add(id);
  else selectedIds.delete(id);
  document.getElementById('mod-selected-count').textContent = selectedIds.size;
});

async function moderateSingle(id, nextStatus, nextTier) {
  const target = rows.find((r) => r.id === id);
  if (!target) return;

  if (currentSource === 'cloud') {
    const data = await cloudAdminPost({
      action: 'admin_moderate',
      id,
      status: nextStatus,
      confidenceTier: nextTier
    });
    if (!data?.ok) {
      showToast(`Lỗi Cloud: ${data?.error || 'Không xác định'}`);
      return;
    }
  }

  target.status = nextStatus;
  target.confidenceTier = nextTier;
  saveLocalRows();
  appendAuditLog('Kiểm duyệt điểm', `${id} → ${nextStatus} (Hạng ${nextTier})`);
  refreshAllViews();
  showToast(`Đã cập nhật ${id} → Hạng ${nextTier} (${nextStatus})`);
}

document.getElementById('adm-tbody').addEventListener('click', (e) => {
  const modBtn = e.target.closest('.js-mod');
  if (modBtn) {
    moderateSingle(modBtn.dataset.id, modBtn.dataset.st, modBtn.dataset.tier);
    return;
  }
  const editBtn = e.target.closest('.js-edit');
  if (editBtn) {
    openEditDialog(editBtn.dataset.id);
  }
});

document.querySelectorAll('.js-bulk-act').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (selectedIds.size === 0) {
      showToast('Vui lòng tích chọn ít nhất 1 điểm để thao tác hàng loạt.');
      return;
    }
    const act = btn.dataset.act;
    const ids = [...selectedIds];

    if (currentSource === 'cloud') {
      const data = await cloudAdminPost({ action: 'admin_bulk_moderate', ids, act });
      if (!data?.ok) {
        showToast(`Lỗi Cloud: ${data?.error || 'Không xử lý được'}`);
        return;
      }
    }

    if (act === 'delete') {
      rows = rows.filter((r) => !selectedIds.has(r.id));
      appendAuditLog('Xóa hàng loạt', `Đã xóa ${ids.length} điểm (${ids.join(', ')})`);
    } else {
      for (const r of rows) {
        if (!selectedIds.has(r.id)) continue;
        if (act === 'approveA') {
          r.status = 'approved';
          r.confidenceTier = 'A';
        } else if (act === 'approveB') {
          r.status = 'approved';
          r.confidenceTier = 'B';
        } else if (act === 'hide') {
          r.status = 'hidden';
        }
      }
      appendAuditLog('Duyệt hàng loạt', `Thao tác ${act} trên ${ids.length} điểm`);
    }
    selectedIds.clear();
    document.getElementById('mod-check-all').checked = false;
    saveLocalRows();
    refreshAllViews();
    showToast(`Đã xử lý hàng loạt ${ids.length} điểm.`);
  });
});

// ================= DIALOG THÊM / SỬA ĐIỂM KÈM MINI-MAP LEAFLET =================
const editDlg = document.getElementById('adm-edit-dialog');
let miniMap = null;
let miniMarker = null;

function ensureMiniMap(lat, lng) {
  const L = window.L;
  if (!L) return;
  if (!miniMap) {
    miniMap = L.map('adm-minimap', { center: [lat, lng], zoom: 16 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OSM'
    }).addTo(miniMap);
    miniMarker = L.marker([lat, lng], { draggable: true }).addTo(miniMap);
    const syncPin = (pos) => {
      document.getElementById('ed-lat').value = pos.lat.toFixed(6);
      document.getElementById('ed-lng').value = pos.lng.toFixed(6);
      document.getElementById('btn-fetch-ed-dem').click();
    };
    miniMarker.on('dragend', () => syncPin(miniMarker.getLatLng()));
    miniMap.on('click', (ev) => {
      miniMarker.setLatLng(ev.latlng);
      syncPin(ev.latlng);
    });
  } else {
    miniMap.setView([lat, lng], 16);
    miniMarker.setLatLng([lat, lng]);
  }
  setTimeout(() => miniMap.invalidateSize(), 80);
}

function openEditDialog(pointId = null) {
  editingExistingId = pointId;
  const pt = pointId ? rows.find((r) => r.id === pointId) : null;
  document.getElementById('adm-edit-title').textContent = pt
    ? `Chỉnh sửa Điểm [${pt.id}]`
    : 'Thêm Điểm Thực địa / Hạ tầng Mới lên Bản đồ';

  document.getElementById('ed-id').value = pt?.id || `TD-${String(rows.length + 1).padStart(2, '0')}`;
  document.getElementById('ed-id').readOnly = Boolean(pt);
  document.getElementById('ed-cat').value = pt?.category || 'flood';
  const st = pt?.status || (pt?.confidenceTier === 'C' ? 'pending' : 'approved');
  const tierKey = st === 'hidden' ? 'C|hidden' : `${pt?.confidenceTier || 'A'}|${st}`;
  document.getElementById('ed-tier').value = ['A|approved', 'B|approved', 'C|pending', 'C|hidden'].includes(tierKey)
    ? tierKey
    : 'A|approved';
  document.getElementById('ed-name').value = pt?.name || '';
  const latVal = Number(pt?.lat ?? 21.072514);
  const lngVal = Number(pt?.lng ?? 105.77387);
  document.getElementById('ed-lat').value = latVal;
  document.getElementById('ed-lng').value = lngVal;
  document.getElementById('ed-dem').value = pt?.elevationM ?? '';
  document.getElementById('ed-confirms').value = pt?.confirmCount ?? 1;
  document.getElementById('ed-scale').value = pt?.waterScale || 'none';
  document.getElementById('ed-date').value = pt?.observedDate || new Date().toISOString().slice(0, 10);
  document.getElementById('ed-cite').value = pt?.sourceCitation || '';
  document.getElementById('ed-notes').value = pt?.notes || '';

  editDlg.showModal();
  ensureMiniMap(latVal, lngVal);
}

document.getElementById('btn-add-point').addEventListener('click', () => openEditDialog(null));
document.getElementById('btn-close-edit').addEventListener('click', () => editDlg.close());
document.getElementById('btn-cancel-edit').addEventListener('click', () => editDlg.close());

document.getElementById('btn-fetch-ed-dem').addEventListener('click', async () => {
  const lat = Number(document.getElementById('ed-lat').value);
  const lng = Number(document.getElementById('ed-lng').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`);
    const data = await res.json();
    if (Number.isFinite(data?.elevation?.[0])) {
      document.getElementById('ed-dem').value = data.elevation[0];
      showToast(`Đã tra cao độ Copernicus DEM: ${data.elevation[0]} m`);
    }
  } catch {
    showToast('Không kết nối được API DEM.');
  }
});

document.getElementById('adm-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('ed-id').value.trim();
  const cat = document.getElementById('ed-cat').value;
  const [tier, status] = document.getElementById('ed-tier').value.split('|');
  const layerGroup = ['medical', 'shelter'].includes(cat) ? 'safe' : 'risk';
  const demVal = document.getElementById('ed-dem').value;

  const payload = normalizePointRecord({
    ...(editingExistingId ? rows.find((r) => r.id === editingExistingId) : {}),
    id,
    layerGroup,
    category: cat,
    confidenceTier: tier,
    status,
    name: document.getElementById('ed-name').value.trim(),
    lat: Number(document.getElementById('ed-lat').value),
    lng: Number(document.getElementById('ed-lng').value),
    elevationM: demVal !== '' ? Number(demVal) : null,
    confirmCount: Math.max(1, Number(document.getElementById('ed-confirms').value) || 1),
    waterScale: document.getElementById('ed-scale').value,
    observedDate: document.getElementById('ed-date').value.trim(),
    sourceCitation: document.getElementById('ed-cite').value.trim(),
    sourceType: 'Cập nhật từ Trung tâm Quản trị',
    notes: document.getElementById('ed-notes').value.trim()
  });

  if (currentSource === 'cloud') {
    const data = await cloudAdminPost({ action: 'admin_upsert_point', point: payload });
    if (!data?.ok) {
      showToast(`Lỗi lưu Cloud: ${data?.error || 'Không xác định'}`);
      return;
    }
  }

  if (editingExistingId) {
    const idx = rows.findIndex((r) => r.id === editingExistingId);
    if (idx >= 0) rows[idx] = payload;
    appendAuditLog('Chỉnh sửa điểm', `Cập nhật thông tin điểm ${id} (${payload.name})`);
  } else {
    rows.unshift(payload);
    appendAuditLog('Thêm điểm mới', `Tạo mới điểm ${id} (${payload.name})`);
  }

  saveLocalRows();
  editDlg.close();
  refreshAllViews();
  showToast(`Đã lưu điểm [${id}] lên bản đồ!`);
});

// ================= TAB 3: BROADCAST & UTM QR =================
const bcPreset = document.getElementById('bc-preset');
const bcLevel = document.getElementById('bc-level');
const bcMsg = document.getElementById('bc-message');

bcPreset.addEventListener('change', () => {
  const v = bcPreset.value;
  if (v === 'yellow') {
    bcLevel.value = 'yellow';
    bcMsg.value = ALERT_BULLETINS.yellow.headline + ' — Bấm "Diễn tập & Quiz" để xem hướng dẫn ứng phó!';
  } else if (v === 'red') {
    bcLevel.value = 'red';
    bcMsg.value = ALERT_BULLETINS.red.headline + ' — Tuyệt đối tránh xoáy cống cuối Phố Viên & thử Mini-Quiz 5 câu!';
  } else if (v === 'survey') {
    bcLevel.value = 'info';
    bcMsg.value =
      'Mời cư dân & sinh viên P. Đông Ngạc bấm "+1 Tôi cũng gặp ở đây" và làm Khảo sát Pre/Post ngay trên Web (chỉ mất 2 phút, hoàn toàn ẩn danh)!';
  } else {
    bcMsg.value = '';
  }
});

document.getElementById('btn-publish-bc').addEventListener('click', async () => {
  const message = bcMsg.value.trim();
  if (!message) {
    showToast('Vui lòng chọn mẫu hoặc nhập nội dung thông báo.');
    return;
  }
  if (currentSource === 'cloud') {
    const data = await cloudAdminPost({
      action: 'admin_broadcast',
      active: true,
      level: bcLevel.value,
      message
    });
    if (!data?.ok) {
      showToast(`Lỗi phát thanh Cloud: ${data?.error || 'Chưa đăng nhập'}`);
      return;
    }
  }
  localStorage.setItem(
    BROADCAST_KEY,
    JSON.stringify({ active: true, level: bcLevel.value, message, updatedAt: new Date().toISOString() })
  );
  notifyMapTabs();
  appendAuditLog('Phát thanh thông báo', `[${bcLevel.value.toUpperCase()}] ${message}`);
  showToast('Đã phát thanh thông báo trực tiếp lên Trang chủ Bản đồ toàn vùng!');
});

document.getElementById('btn-stop-bc').addEventListener('click', async () => {
  if (currentSource === 'cloud') {
    await cloudAdminPost({ action: 'admin_broadcast', active: false });
  }
  localStorage.removeItem(BROADCAST_KEY);
  bcPreset.value = 'off';
  bcMsg.value = '';
  notifyMapTabs();
  appendAuditLog('Tắt thông báo', 'Đã gỡ thanh thông báo trên Trang chủ');
  showToast('Đã tắt thanh thông báo trên Bản đồ.');
});

function renderUtmQrCards() {
  const rawBase = document.getElementById('utm-base-url').value.trim() || window.location.origin;
  const sep = rawBase.includes('?') ? '&' : '?';
  const channels = [
    { code: 'zalo_todanpho', title: '1. Nhóm Zalo Tổ dân phố', desc: 'Gửi cư dân Phố Viên – Đông Ngạc', path: '' },
    { code: 'fb_humg', title: '2. Facebook Sinh viên ĐH Mỏ', desc: 'Đăng fanpage / group CLB, lớp', path: '' },
    { code: 'khao_sat_pretest', title: '3. QR Phiếu Pre-test (15 câu)', desc: 'Dẫn thẳng vào khao-sat.html?tab=pre', path: '/khao-sat.html?tab=pre' },
    { code: 'khao_sat_posttest', title: '4. QR Phiếu Post-test (6 câu)', desc: 'Đo hiệu quả sau trải nghiệm bản đồ', path: '/khao-sat.html?tab=post' }
  ];

  const cleanOrigin = rawBase.replace(/\/+$/, '');
  document.getElementById('utm-qr-grid').innerHTML = channels
    .map((ch) => {
      const targetBase = ch.path ? `${cleanOrigin}${ch.path}` : rawBase;
      const joiner = targetBase.includes('?') ? '&' : sep;
      const fullUrl = `${targetBase}${joiner}utm_source=${ch.code}&utm_campaign=detai08_humg`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=6&data=${encodeURIComponent(fullUrl)}`;
      return `<div class="qr-card">
        <strong style="font-size:0.81rem;display:block;">${esc(ch.title)}</strong>
        <span style="font-size:0.72rem;color:#64748b;">${esc(ch.desc)}</span><br>
        <img src="${qrSrc}" alt="QR ${esc(ch.title)}"><br>
        <button type="button" class="btn js-copy-utm" data-url="${esc(fullUrl)}" style="width:100%;font-size:0.74rem;">Chép link kênh này</button>
      </div>`;
    })
    .join('');
}

document.getElementById('btn-build-utm').addEventListener('click', renderUtmQrCards);
document.getElementById('utm-qr-grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-copy-utm');
  if (!btn) return;
  await navigator.clipboard?.writeText(btn.dataset.url);
  showToast('Đã sao chép link đo lường UTM!');
});

// ================= TAB 4: DATA QA & AUDIT LOG =================
function renderDataQa() {
  const res = auditPointsQuality(turf, rows, HUMG_CENTER.lat, HUMG_CENTER.lng, 2.0);
  const banner = document.getElementById('qa-summary-banner');
  const list = document.getElementById('qa-issues-list');

  if (res.issueCount === 0) {
    banner.innerHTML = `<div style="padding:10px 12px;border-radius:8px;background:#dcfce7;border:1px solid #86efac;color:#14532d;font-weight:700;font-size:0.82rem;">
      ĐẠT CHUẨN 100%: Toàn bộ ${res.checkedCount}/${res.checkedCount} điểm hoạt động đều nằm trọn trong bán kính ≤2,0 km, có trích dẫn nguồn, cao độ DEM GLO-30 và không chứa số đo tự chế!
    </div>`;
    list.innerHTML = '';
  } else {
    banner.innerHTML = `<div style="padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-weight:700;font-size:0.82rem;">
      Đã kiểm tra ${res.checkedCount} điểm: ${res.cleanCount} điểm đạt chuẩn hoàn toàn · ${res.issueCount} điểm cần bổ sung thêm thông tin thực địa/DEM.
    </div>`;
    list.innerHTML = res.issues
      .map(
        (it) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:0.79rem;">
          <div><strong>[${esc(it.id)}] ${esc(it.name)}</strong> (Hạng ${esc(it.confidenceTier)})<br><span style="color:#b91c1c;">${it.problems.map(esc).join(' · ')}</span></div>
          <button type="button" class="btn js-qa-fix" data-id="${esc(it.id)}">Bổ sung ngay</button>
        </div>`
      )
      .join('');
  }
}

document.getElementById('btn-rerun-qa').addEventListener('click', () => {
  renderDataQa();
  showToast('Đã quét kiểm toán chất lượng GIS.');
});

document.getElementById('qa-issues-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.js-qa-fix');
  if (btn) openEditDialog(btn.dataset.id);
});

function renderAuditLog() {
  const box = document.getElementById('audit-log-box');
  let list = [];
  if (currentSource === 'cloud' && cloudAuditLog.length > 0) {
    list = cloudAuditLog;
  } else {
    try {
      list = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
    } catch { /* ignore */ }
  }
  if (list.length === 0) {
    box.innerHTML = '<div style="color:#64748b;text-align:center;padding:18px;">Chưa có thao tác quản trị nào được ghi nhận.</div>';
    return;
  }
  box.innerHTML = list
    .map(
      (item) => `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;">
        <span class="mono" style="color:#64748b;font-size:0.72rem;">${esc(item.ts)} [${esc(item.mode)}]</span>
        <strong style="margin-left:6px;color:#0f766e;">${esc(item.action)}:</strong>
        <span>${esc(item.detail)}</span>
      </div>`
    )
    .join('');
}

document.getElementById('btn-clear-log').addEventListener('click', () => {
  localStorage.removeItem(AUDIT_LOG_KEY);
  renderAuditLog();
  showToast('Đã làm sạch nhật ký cục bộ.');
});

// ================= TAB 5: CLOUD, BACKUP, NOTEBOOKLM & PERF =================
document.getElementById('btn-load-cloud').addEventListener('click', async () => {
  const api = getApiUrl();
  const pass = passInput.value.trim();
  localStorage.setItem(API_URL_KEY, api);

  if (pass) {
    cloudStatus.textContent = 'Đang xác thực mật khẩu với máy chủ Cloud...';
    try {
      await loginWithPasscode(pass);
      passInput.value = '';
      showToast('Đã đăng nhập & đồng bộ Cloud!');
    } catch (err) {
      cloudStatus.textContent = `Từ chối xác thực: ${err.message}`;
    }
    return;
  }

  if (adminToken) {
    await loadCloudWorkspace(false);
  } else {
    authGate.hidden = false;
  }
});

document.getElementById('btn-ping-api').addEventListener('click', async () => {
  cloudStatus.textContent = 'Đang đo độ trễ phản hồi API Đám mây...';
  try {
    const t0 = performance.now();
    const res = await fetch(getApiUrl(), { cache: 'no-store' });
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    if (!data?.ok) throw new Error(data?.error || 'Lỗi phản hồi');
    cloudStatus.textContent = `Máy chủ Cloud hoạt động ổn định — Độ trễ: ${ms} ms.`;
  } catch (err) {
    cloudStatus.textContent = `API không phản hồi: ${err.message}`;
  }
});

document.getElementById('btn-load-local').addEventListener('click', () => {
  loadLocalRows();
  cloudStatus.textContent = 'Đã chuyển về quản trị cơ sở dữ liệu cục bộ trên trình duyệt.';
});

document.getElementById('btn-sys-notebooklm').addEventListener('click', () => {
  const active = rows.filter((r) => r.status !== 'hidden');
  const analysis = analyzeSurveyPoints(turf, active, HUMG_CENTER.lat, HUMG_CENTER.lng, 2.0);
  const md = buildNotebookLmSourceMarkdown(active, analysis.stats);
  downloadBlob(md, 'HUMG_DongNgac_NotebookLM_SourcePack.md', 'text/markdown;charset=utf-8');
  appendAuditLog('Xuất gói NotebookLM', `Kết xuất ${active.length} điểm ra tệp Markdown cho Google NotebookLM`);
  showToast('Đã tải xuống gói nguồn chuẩn cho Google NotebookLM!');
});

document.getElementById('btn-backup-json').addEventListener('click', () => {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    project: 'HUMG_DongNgac_Community_WebGIS',
    points: rows,
    kpis: loadSavedKpis(),
    kpiLive: cloudKpiLive,
    surveyCount: cloudSurveyRecords.length,
    broadcast: JSON.parse(localStorage.getItem(BROADCAST_KEY) || 'null'),
    auditLog: currentSource === 'cloud' ? cloudAuditLog : JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]')
  };
  downloadBlob(JSON.stringify(snapshot, null, 2), `HUMG_Backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json;charset=utf-8');
  appendAuditLog('Sao lưu hệ thống', `Xuất bản sao lưu JSON (${rows.length} điểm)`);
  showToast('Đã tải tệp sao lưu toàn bộ hệ thống (.JSON)!');
});

document.getElementById('input-restore-json').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.points)) throw new Error('Tệp JSON không hợp lệ');
    rows = parsed.points;
    if (Array.isArray(parsed.kpis)) localStorage.setItem(KPI_KEY, JSON.stringify(parsed.kpis));
    if (parsed.broadcast) localStorage.setItem(BROADCAST_KEY, JSON.stringify(parsed.broadcast));
    saveLocalRows();
    appendAuditLog('Khôi phục sao lưu', `Khôi phục ${rows.length} điểm từ tệp ${file.name}`);
    refreshAllViews();
    showToast(`Đã khôi phục thành công ${rows.length} điểm!`);
  } catch (err) {
    showToast(`Lỗi khôi phục: ${err.message}`);
  }
});

document.getElementById('btn-reset-baseline').addEventListener('click', () => {
  rows = structuredClone(SAMPLE_HUMG_POINTS);
  saveLocalRows();
  appendAuditLog('Khôi phục mặc định', `Đặt lại ${SAMPLE_HUMG_POINTS.length} điểm gốc xác thực`);
  refreshAllViews();
  showToast(`Đã khôi phục ${SAMPLE_HUMG_POINTS.length} điểm gốc xác thực!`);
});

const getExportAnalysis = () =>
  analyzeSurveyPoints(
    turf,
    rows.filter((r) => r.status !== 'hidden'),
    HUMG_CENTER.lat,
    HUMG_CENTER.lng,
    2.0
  );

document.getElementById('btn-adm-csv').addEventListener('click', () =>
  downloadBlob(exportToCSV(getExportAnalysis(), { ...HUMG_CENTER, radiusKm: 2.0 }, false), 'HUMG_Admin_Export_2km.csv', 'text/csv;charset=utf-8')
);
document.getElementById('btn-adm-geojson').addEventListener('click', () =>
  downloadBlob(JSON.stringify(exportToGeoJSON(getExportAnalysis(), { ...HUMG_CENTER, radiusKm: 2.0 }, false), null, 2), 'HUMG_Admin_Export_2km.geojson', 'application/geo+json;charset=utf-8')
);
document.getElementById('btn-adm-kml').addEventListener('click', () =>
  downloadBlob(exportToKML(getExportAnalysis(), { ...HUMG_CENTER, radiusKm: 2.0 }, false), 'HUMG_Admin_Export_2km.kml', 'application/vnd.google-earth.kml+xml;charset=utf-8')
);

async function renderPerfDiagnostics() {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    bytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
  }
  const kb = (bytes / 1024).toFixed(1);
  let swStatus = 'Chưa đăng ký';
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    swStatus = reg?.active ? 'Đang hoạt động (Sẵn sàng Offline · Không cache /api/)' : 'Chưa kích hoạt trên phiên này';
  }
  const navEntry = performance.getEntriesByType('navigation')[0];
  const loadMs = navEntry ? Math.round(navEntry.domContentLoadedEventEnd) : 0;

  document.getElementById('perf-diag-box').innerHTML = [
    `• Chế độ dữ liệu hiện hành: ${currentSource === 'cloud' ? 'Cloud Vercel Blob (Singapore sin1)' : 'Cục bộ LocalStorage'}`,
    `• Dung lượng LocalStorage đang dùng: ${kb} KB / ~5.120 KB`,
    `• Trạng thái PWA Service Worker: ${swStatus}`,
    `• Thời gian khởi tạo DOM Quản trị: ${loadMs} ms`
  ].join('<br>');
}

document.getElementById('btn-clear-sw-cache').addEventListener('click', async () => {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  showToast('Đã làm mới toàn bộ Cache PWA!');
  renderPerfDiagnostics();
});

function refreshAllViews() {
  renderOverviewAndKpi();
  renderPrePostCalculator(false);
  renderDuplicateScanner();
  renderModerationTable();
  renderDataQa();
  renderAuditLog();
}

// ================= MÁY TÍNH PRE-TEST VS POST-TEST =================
let lastPrePostParagraph = '';
function renderPrePostCalculator(syncToKpi = false) {
  const stats = computePrePostEvaluation({
    nPre: document.getElementById('pp-n1')?.value,
    nPost: document.getElementById('pp-n2')?.value,
    preCorrectPct: document.getElementById('pp-c1')?.value,
    postCorrectPct: document.getElementById('pp-c2')?.value,
    preConfAvg: document.getElementById('pp-f1')?.value,
    postConfAvg: document.getElementById('pp-f2')?.value
  });
  lastPrePostParagraph = stats.reportParagraph;

  const w1 = Math.round(stats.preCorrectPct * 2.1);
  const w2 = Math.round(stats.postCorrectPct * 2.1);
  document.getElementById('pp-chart-box').innerHTML = `
    <svg viewBox="0 0 470 86" style="width:100%;height:auto;display:block;">
      <text x="0" y="18" font-size="11" fill="#475569">Pre-test (${stats.nPre} phiếu)</text>
      <rect x="115" y="6" width="${w1}" height="16" rx="4" fill="#94a3b8"/>
      <text x="${122 + w1}" y="18" font-size="11" font-weight="700" font-family="JetBrains Mono">${stats.preCorrectPct}% · ${stats.preConfAvg}/5</text>
      <text x="0" y="48" font-size="11" fill="#0f172a" font-weight="700">Post-test (${stats.nPost} phiếu)</text>
      <rect x="115" y="36" width="${w2}" height="16" rx="4" fill="#0f766e"/>
      <text x="${122 + w2}" y="48" font-size="11" font-weight="700" fill="#0f766e" font-family="JetBrains Mono">${stats.postCorrectPct}% · ${stats.postConfAvg}/5</text>
      <text x="0" y="76" font-size="10.5" font-weight="700" fill="${stats.passKnowledge && stats.passConfidence ? '#15803d' : '#b45309'}">
        Mức tăng: Kiến thức +${stats.deltaCorrectPts}% (${stats.passKnowledge ? 'ĐẠT ≥30%' : 'Chưa đạt'}) · Tự tin +${stats.deltaConfPts}đ (${stats.passConfidence ? 'ĐẠT ≥+1.0' : 'Chưa đạt'})
      </text>
    </svg>`;
  document.getElementById('pp-paragraph-box').textContent = stats.reportParagraph;

  if (syncToKpi) {
    const kpis = loadSavedKpis();
    const k1 = kpis.find((k) => k.id === 'pretest');
    const k7 = kpis.find((k) => k.id === 'post_acc');
    const k8 = kpis.find((k) => k.id === 'post_conf');
    if (k1) k1.current = stats.nPre;
    if (k7) k7.current = Math.max(0, Math.round(stats.deltaCorrectPts));
    if (k8) k8.current = Math.max(0, Math.round(stats.deltaConfPts * 10));
    localStorage.setItem(KPI_KEY, JSON.stringify(kpis));
    renderOverviewAndKpi();
    showToast('Đã đồng bộ kết quả Pre/Post vào Bảng 8 KPI!');
  }
}

document.getElementById('btn-calc-prepost')?.addEventListener('click', () => renderPrePostCalculator(true));
document.getElementById('btn-copy-prepost-text')?.addEventListener('click', async () => {
  await navigator.clipboard?.writeText(lastPrePostParagraph);
  showToast('Đã sao chép đoạn phân tích Chương 5 vào bộ nhớ tạm!');
});

renderUtmQrCards();
loadLocalRows();
if (adminToken) {
  loadCloudWorkspace(false);
} else {
  authGate.hidden = false;
}
