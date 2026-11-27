import crypto from 'node:crypto';
import { put, get, list, del } from '@vercel/blob';

const HUMG_LAT = 21.072514;
const HUMG_LNG = 105.77387;
const MAX_GEOFENCE_METERS = 6500;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function cleanText(val, maxLen = 500) {
  return String(val ?? '')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLen);
}

function hasSpamContent(str) {
  const lower = String(str ?? '').toLowerCase();
  return /(https?:\/\/|www\.|telegram\.me|t\.me\/|casino|bet88|vay tiền)/i.test(lower);
}

function getVoterFingerprint(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';
  const ua = (request.headers.get('user-agent') || '').slice(0, 120);
  return crypto.createHash('sha256').update(`${ip}|${ua}|humg-v1`).digest('hex').slice(0, 16);
}

function signAdminToken() {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSCODE || 'humg-fallback-secret';
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyAdminToken(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSCODE || 'humg-fallback-secret';
  const expectedSig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('hex');
  try {
    const a = Buffer.from(parts[2], 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function checkPasscodeConstantTime(inputPass) {
  const configured = process.env.ADMIN_PASSCODE;
  if (!configured || !inputPass) return false;
  const a = crypto.createHash('sha256').update(String(inputPass)).digest();
  const b = crypto.createHash('sha256').update(String(configured)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function readPrivateJson(pathname, fallbackVal = null) {
  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return fallbackVal;
    return await new Response(res.stream).json();
  } catch {
    return fallbackVal;
  }
}

async function writePrivateJson(pathname, dataObj) {
  await put(pathname, JSON.stringify(dataObj), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

async function listAllBlobsWithPrefix(prefix = '') {
  const all = [];
  let cursor;
  let guard = 0;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    all.push(...(page.blobs || []));
    cursor = page.hasMore ? page.cursor : undefined;
    guard++;
  } while (cursor && guard < 5);
  return all;
}

function parseSurveyStatsFromBlobs(blobs) {
  let preCount = 0;
  let preCorrect = 0;
  let preConfSum = 0;
  let postCount = 0;
  let postCorrect = 0;
  let postConfSum = 0;
  let quizCount = 0;
  let quizScoreSum = 0;

  for (const b of blobs) {
    const p = b.pathname;
    if (p.startsWith('surveys/pre/')) {
      preCount++;
      const mC = p.match(/--c([01])/);
      const mF = p.match(/--f([1-5])/);
      if (mC?.[1] === '1') preCorrect++;
      preConfSum += Number(mF?.[1] || 3);
    } else if (p.startsWith('surveys/post/')) {
      postCount++;
      const mC = p.match(/--c([01])/);
      const mF = p.match(/--f([1-5])/);
      if (mC?.[1] === '1') postCorrect++;
      postConfSum += Number(mF?.[1] || 4);
    } else if (p.startsWith('surveys/quiz/')) {
      quizCount++;
      const mS = p.match(/--s(\d+)/);
      quizScoreSum += Number(mS?.[1] || 0);
    }
  }

  return {
    preCount,
    preCorrectPct: preCount > 0 ? Math.round((preCorrect / preCount) * 1000) / 10 : null,
    preConfAvg: preCount > 0 ? Math.round((preConfSum / preCount) * 100) / 100 : null,
    postCount,
    postCorrectPct: postCount > 0 ? Math.round((postCorrect / postCount) * 1000) / 10 : null,
    postConfAvg: postCount > 0 ? Math.round((postConfSum / postCount) * 100) / 100 : null,
    quizCount,
    quizAvgScore: quizCount > 0 ? Math.round(quizScoreSum / quizCount) : null
  };
}

async function appendServerAudit(action, detail) {
  const cur = (await readPrivateJson('config/audit-log.json', [])) || [];
  cur.unshift({
    ts: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' }),
    mode: 'cloud',
    action,
    detail
  });
  await writePrivateJson('config/audit-log.json', cur.slice(0, 150));
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'public_sync';

    const allBlobs = await listAllBlobsWithPrefix('');
    const confirmCounts = {};
    const reportBlobs = [];
    const surveyBlobs = [];

    for (const b of allBlobs) {
      if (b.pathname.startsWith('votes/')) {
        // votes/<encodedPointId>/<voterHash>.json
        const segs = b.pathname.split('/');
        if (segs.length >= 3) {
          const pid = decodeURIComponent(segs[1]);
          confirmCounts[pid] = (confirmCounts[pid] || 0) + 1;
        }
      } else if (b.pathname.startsWith('reports/')) {
        reportBlobs.push(b);
      } else if (b.pathname.startsWith('surveys/')) {
        surveyBlobs.push(b);
      }
    }

    const [moderationMap, broadcast, reportsRaw] = await Promise.all([
      readPrivateJson('config/moderation.json', {}),
      readPrivateJson('config/broadcast.json', null),
      Promise.all(reportBlobs.map((rb) => readPrivateJson(rb.pathname, null)))
    ]);

    const kpiLive = parseSurveyStatsFromBlobs(surveyBlobs);
    const mergedReports = reportsRaw
      .filter(Boolean)
      .map((rep) => {
        const mod = moderationMap?.[rep.id] || {};
        const totalVotes = Math.max(Number(mod.confirmCount ?? rep.confirmCount) || 1, 1 + (confirmCounts[rep.id] || 0));
        const next = {
          ...rep,
          ...mod,
          confirmCount: totalVotes
        };
        if (next.confidenceTier === 'C' && totalVotes >= 3 && next.status !== 'hidden') {
          next.confidenceTier = 'B';
          next.status = 'approved';
        }
        return next;
      });

    if (action === 'admin_full') {
      if (!verifyAdminToken(request)) {
        return Response.json({ ok: false, error: 'Phiên đăng nhập Quản trị hết hạn hoặc chưa xác thực.' }, { status: 401 });
      }
      const includeSurveys = url.searchParams.get('surveys') === '1';
      let surveyRecords = undefined;
      if (includeSurveys) {
        const loaded = await Promise.all(
          surveyBlobs.map(async (sb) => {
            const item = await readPrivateJson(sb.pathname, null);
            return item ? { ...item, _path: sb.pathname } : null;
          })
        );
        surveyRecords = loaded.filter(Boolean);
      }
      const auditLog = await readPrivateJson('config/audit-log.json', []);
      return Response.json({
        ok: true,
        isAdmin: true,
        reports: mergedReports,
        moderationMap: moderationMap || {},
        confirmCounts,
        broadcast,
        kpiLive,
        auditLog,
        surveyRecords
      });
    }

    // Chế độ công khai cho cư dân
    const publicReports = mergedReports.filter((r) => r.status !== 'hidden');
    return Response.json(
      {
        ok: true,
        reports: publicReports,
        moderationMap: moderationMap || {},
        confirmCounts,
        broadcast,
        kpiLive
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  } catch (err) {
    console.error('[api/community GET error]', err);
    return Response.json({ ok: false, error: 'Lỗi đọc dữ liệu đám mây.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action || '';

    // 1. Đăng nhập Quản trị viên (Khóa bảo mật phía Server)
    if (action === 'admin_login') {
      if (!checkPasscodeConstantTime(body.pass)) {
        return Response.json({ ok: false, error: 'Mật khẩu quản trị không chính xác.' }, { status: 401 });
      }
      const token = signAdminToken();
      await appendServerAudit('Đăng nhập Quản trị', 'Xác thực thành công phiên quản trị viên');
      return Response.json({ ok: true, token, expiresInHours: 12 });
    }

    if (action === 'admin_verify') {
      return Response.json({ ok: verifyAdminToken(request) });
    }

    // 2. Người dân bấm "+1 Tôi cũng gặp ở đây" (chống trùng theo thiết bị)
    if (action === 'confirm_point') {
      const pointId = cleanText(body.pointId, 40);
      if (!pointId) return Response.json({ ok: false, error: 'Thiếu mã điểm.' }, { status: 400 });
      const fp = getVoterFingerprint(request);
      const votePath = `votes/${encodeURIComponent(pointId)}/${fp}.json`;
      await writePrivateJson(votePath, {
        pointId,
        reporterRole: cleanText(body.reporterRole || 'Cư dân xác nhận', 80),
        createdAt: new Date().toISOString()
      });
      return Response.json({ ok: true, pointId });
    }

    // 3. Người dân gửi điểm mới lên Bản đồ Cộng đồng
    if (action === 'submit_report') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const name = cleanText(body.name, 150);
      const notes = cleanText(body.notes, 600);

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || name.length < 3) {
        return Response.json({ ok: false, error: 'Tên vị trí hoặc tọa độ không hợp lệ.' }, { status: 400 });
      }
      const distM = haversineMeters(HUMG_LAT, HUMG_LNG, lat, lng);
      if (distM > MAX_GEOFENCE_METERS) {
        return Response.json(
          { ok: false, error: `Vị trí cách ĐH Mỏ ${(distM / 1000).toFixed(1)} km (ngoài phạm vi tiếp nhận khảo sát).` },
          { status: 400 }
        );
      }
      if (hasSpamContent(name) || hasSpamContent(notes)) {
        return Response.json({ ok: false, error: 'Nội dung chứa liên kết quảng cáo hoặc từ khóa bị chặn.' }, { status: 400 });
      }

      let safePhoto = '';
      if (typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image/jpeg;base64,')) {
        if (body.photoDataUrl.length <= 68000) safePhoto = body.photoDataUrl;
      }

      const id = cleanText(body.id, 32) || `CD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const cat = ['flood', 'heat', 'traffic', 'shelter', 'medical'].includes(body.category) ? body.category : 'flood';
      const layerGroup = ['shelter', 'medical'].includes(cat) ? 'safe' : 'risk';
      const photoFlag = cleanText(body.photoQualityFlag || 'ok', 40);
      const roleStr = cleanText(body.reporterRole || 'Cư dân đóng góp trên Web', 80);
      const isFieldTeam = roleStr.toLowerCase().includes('nhóm khảo sát thực địa');

      const record = {
        id,
        layerGroup,
        category: cat,
        name,
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000,
        elevationM: body.elevationM !== null && body.elevationM !== undefined && body.elevationM !== '' ? Number(body.elevationM) : null,
        waterScale: cleanText(body.waterScale || 'half_wheel', 30),
        frequency: cleanText(body.frequency || '', 120),
        hazardFlags: Array.isArray(body.hazardFlags) ? body.hazardFlags.map((h) => cleanText(h, 40)).slice(0, 6) : [],
        photoDataUrl: safePhoto,
        photoQualityFlag: photoFlag,
        confidenceTier: isFieldTeam && photoFlag !== 'suspect_spam' ? 'A' : 'C',
        confirmCount: 1,
        status: isFieldTeam && photoFlag !== 'suspect_spam' ? 'approved' : 'pending',
        sourceType: roleStr,
        sourceCitation: `${cleanText(body.reporterRole || 'Cư dân', 60)} báo trực tuyến (${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Bangkok' })})`,
        observedDate: new Date().toISOString().slice(0, 10),
        notes,
        createdAt: new Date().toISOString()
      };

      await writePrivateJson(`reports/${id}.json`, record);
      return Response.json({ ok: true, report: record });
    }

    // 4. Nộp phiếu Khảo sát Pre-test (15 câu) / Mini-Quiz (5 câu) / Post-test (6 câu) trực tiếp trên Web
    if (action === 'submit_survey') {
      const sType = ['pre', 'quiz', 'post'].includes(body.surveyType) ? body.surveyType : null;
      if (!sType) return Response.json({ ok: false, error: 'Loại khảo sát không hợp lệ.' }, { status: 400 });

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let suffix = '';
      if (sType === 'pre' || sType === 'post') {
        const isCorrect = body.heatFirstAidCorrect ? 1 : 0;
        const conf = Math.min(5, Math.max(1, Math.round(Number(body.confidenceScore) || 3)));
        suffix = `--c${isCorrect}--f${conf}`;
      } else {
        const score = Math.min(100, Math.max(0, Math.round(Number(body.quizScore) || 0)));
        suffix = `--s${score}`;
      }

      const payload = {
        id,
        surveyType: sType,
        submittedAt: new Date().toISOString(),
        heatFirstAidCorrect: Boolean(body.heatFirstAidCorrect),
        confidenceScore: body.confidenceScore ? Number(body.confidenceScore) : null,
        quizScore: body.quizScore !== undefined ? Number(body.quizScore) : null,
        answers: body.answers && typeof body.answers === 'object' ? body.answers : {}
      };

      await writePrivateJson(`surveys/${sType}/${id}${suffix}.json`, payload);
      return Response.json({ ok: true, id, surveyType: sType });
    }

    // ================= CÁC TÁC VỤ QUẢN TRỊ BẮT BUỘC XÁC THỰC BEARER TOKEN =================
    if (!verifyAdminToken(request)) {
      return Response.json({ ok: false, error: 'Từ chối truy cập: Yêu cầu đăng nhập quyền Quản trị viên.' }, { status: 401 });
    }

    if (action === 'admin_moderate') {
      const id = cleanText(body.id, 40);
      const status = ['approved', 'pending', 'hidden'].includes(body.status) ? body.status : 'approved';
      const confidenceTier = ['A', 'B', 'C'].includes(body.confidenceTier) ? body.confidenceTier : 'B';
      const modMap = (await readPrivateJson('config/moderation.json', {})) || {};
      modMap[id] = { ...(modMap[id] || {}), status, confidenceTier, updatedAt: new Date().toISOString() };
      await writePrivateJson('config/moderation.json', modMap);
      await appendServerAudit('Kiểm duyệt điểm', `${id} → ${status} (Hạng ${confidenceTier})`);
      return Response.json({ ok: true });
    }

    if (action === 'admin_upsert_point') {
      const pt = body.point || {};
      const id = cleanText(pt.id, 40);
      if (!id) return Response.json({ ok: false, error: 'Thiếu mã điểm.' }, { status: 400 });
      const isBaseline = /^(R|S)-\d+$/.test(id);
      if (isBaseline) {
        const modMap = (await readPrivateJson('config/moderation.json', {})) || {};
        modMap[id] = { ...pt, updatedAt: new Date().toISOString() };
        await writePrivateJson('config/moderation.json', modMap);
      } else {
        await writePrivateJson(`reports/${id}.json`, { ...pt, updatedAt: new Date().toISOString() });
      }
      await appendServerAudit('Cập nhật điểm', `Lưu thông tin điểm ${id} (${cleanText(pt.name, 80)})`);
      return Response.json({ ok: true });
    }

    if (action === 'admin_delete_point') {
      const id = cleanText(body.id, 40);
      await del(`reports/${id}.json`).catch(() => {});
      await appendServerAudit('Xóa điểm', `Đã xóa điểm báo cáo ${id}`);
      return Response.json({ ok: true });
    }

    if (action === 'admin_bulk_moderate') {
      const ids = Array.isArray(body.ids) ? body.ids.map((x) => cleanText(x, 40)).filter(Boolean) : [];
      const act = cleanText(body.act, 24);
      if (ids.length === 0) return Response.json({ ok: false, error: 'Chưa chọn điểm nào.' }, { status: 400 });

      const modMap = (await readPrivateJson('config/moderation.json', {})) || {};
      if (act === 'delete') {
        await Promise.all(
          ids.map(async (id) => {
            if (/^(R|S)-\d+$/.test(id)) {
              modMap[id] = { ...(modMap[id] || {}), status: 'hidden', updatedAt: new Date().toISOString() };
            } else {
              delete modMap[id];
              await del(`reports/${id}.json`).catch(() => {});
            }
          })
        );
      } else {
        const status = act === 'hide' ? 'hidden' : 'approved';
        const tier = act === 'approveA' ? 'A' : act === 'approveB' ? 'B' : undefined;
        for (const id of ids) {
          modMap[id] = {
            ...(modMap[id] || {}),
            status,
            ...(tier ? { confidenceTier: tier } : {}),
            updatedAt: new Date().toISOString()
          };
        }
      }
      await writePrivateJson('config/moderation.json', modMap);
      await appendServerAudit('Thao tác hàng loạt', `${act} trên ${ids.length} điểm (${ids.slice(0, 6).join(', ')})`);
      return Response.json({ ok: true, count: ids.length });
    }

    if (action === 'admin_merge_pair') {
      const keepId = cleanText(body.keepId, 40);
      const dropId = cleanText(body.dropId, 40);
      const mergedCount = Math.max(1, Number(body.mergedCount) || 2);
      const nextTier = ['A', 'B', 'C'].includes(body.nextTier) ? body.nextTier : 'B';
      const modMap = (await readPrivateJson('config/moderation.json', {})) || {};
      modMap[keepId] = {
        ...(modMap[keepId] || {}),
        confirmCount: mergedCount,
        confidenceTier: nextTier,
        status: 'approved',
        updatedAt: new Date().toISOString()
      };
      modMap[dropId] = {
        ...(modMap[dropId] || {}),
        status: 'hidden',
        updatedAt: new Date().toISOString()
      };
      await writePrivateJson('config/moderation.json', modMap);
      await appendServerAudit('Gộp điểm trùng 50m', `Gộp ${dropId} vào ${keepId} (tổng ${mergedCount} phiếu)`);
      return Response.json({ ok: true });
    }

    if (action === 'admin_broadcast') {
      if (!body.active) {
        await writePrivateJson('config/broadcast.json', { active: false, updatedAt: new Date().toISOString() });
        await appendServerAudit('Tắt cảnh báo', 'Đã gỡ thanh thông báo toàn hệ thống');
      } else {
        const bc = {
          active: true,
          level: ['yellow', 'red', 'info'].includes(body.level) ? body.level : 'yellow',
          message: cleanText(body.message, 320),
          updatedAt: new Date().toISOString()
        };
        await writePrivateJson('config/broadcast.json', bc);
        await appendServerAudit('Phát thanh cảnh báo', `[${bc.level.toUpperCase()}] ${bc.message}`);
      }
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: 'Hành động không được hỗ trợ.' }, { status: 400 });
  } catch (err) {
    console.error('[api/community POST error]', err);
    return Response.json({ ok: false, error: 'Lỗi xử lý máy chủ đám mây.' }, { status: 500 });
  }
}
