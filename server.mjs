import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const LOCAL_DB_PATH = path.join(__dirname, '.local-data', 'cloud-sim.json');
const LOCAL_DEV_PASS = process.env.ADMIN_PASSCODE || 'local-dev-passcode';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.kml': 'application/vnd.google-earth.kml+xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function readSimDb() {
  try {
    return JSON.parse(await fs.readFile(LOCAL_DB_PATH, 'utf8'));
  } catch {
    return { reports: [], votes: {}, moderationMap: {}, broadcast: null, surveys: [], auditLog: [] };
  }
}

async function writeSimDb(db) {
  await fs.mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function computeSimKpi(surveys) {
  const pre = surveys.filter((s) => s.surveyType === 'pre');
  const post = surveys.filter((s) => s.surveyType === 'post');
  const quiz = surveys.filter((s) => s.surveyType === 'quiz');
  return {
    preCount: pre.length,
    preCorrectPct: pre.length ? Math.round((pre.filter((x) => x.heatFirstAidCorrect).length / pre.length) * 1000) / 10 : null,
    preConfAvg: pre.length ? Math.round((pre.reduce((a, b) => a + (Number(b.confidenceScore) || 3), 0) / pre.length) * 100) / 100 : null,
    postCount: post.length,
    postCorrectPct: post.length ? Math.round((post.filter((x) => x.heatFirstAidCorrect).length / post.length) * 1000) / 10 : null,
    postConfAvg: post.length ? Math.round((post.reduce((a, b) => a + (Number(b.confidenceScore) || 4), 0) / post.length) * 100) / 100 : null,
    quizCount: quiz.length,
    quizAvgScore: quiz.length ? Math.round(quiz.reduce((a, b) => a + (Number(b.quizScore) || 0), 0) / quiz.length) : null
  };
}

async function handleLocalApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const db = await readSimDb();
  const isAuthed = (req.headers.authorization || '') === 'Bearer local-dev-admin-token';

  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'public_sync';
    const kpiLive = computeSimKpi(db.surveys || []);
    const merged = (db.reports || []).map((r) => ({
      ...r,
      ...(db.moderationMap?.[r.id] || {}),
      confirmCount: Math.max(Number(r.confirmCount) || 1, 1 + (db.votes?.[r.id] || 0))
    }));
    if (action === 'admin_full') {
      if (!isAuthed) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Chưa đăng nhập Quản trị viên.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          isAdmin: true,
          reports: merged,
          moderationMap: db.moderationMap || {},
          confirmCounts: db.votes || {},
          broadcast: db.broadcast,
          kpiLive,
          auditLog: db.auditLog || [],
          surveyRecords: url.searchParams.get('surveys') === '1' ? db.surveys : undefined
        })
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        reports: merged.filter((r) => r.status !== 'hidden'),
        moderationMap: db.moderationMap || {},
        confirmCounts: db.votes || {},
        broadcast: db.broadcast,
        kpiLive
      })
    );
    return;
  }

  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  const body = JSON.parse(rawBody || '{}');
  const action = body.action || '';

  if (action === 'admin_login') {
    if (body.pass !== LOCAL_DEV_PASS) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Mật khẩu quản trị không chính xác.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, token: 'local-dev-admin-token', expiresInHours: 12 }));
    return;
  }

  if (action === 'admin_verify') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: isAuthed }));
    return;
  }

  if (action === 'confirm_point') {
    db.votes[body.pointId] = (db.votes[body.pointId] || 0) + 1;
    await writeSimDb(db);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (action === 'submit_report') {
    const id = body.id || `CD-${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const cat = body.category || 'flood';
    const rec = {
      id,
      layerGroup: ['shelter', 'medical'].includes(cat) ? 'safe' : 'risk',
      category: cat,
      name: body.name,
      lat: Number(body.lat),
      lng: Number(body.lng),
      elevationM: body.elevationM ?? null,
      waterScale: body.waterScale || 'half_wheel',
      frequency: body.frequency || '',
      hazardFlags: body.hazardFlags || [],
      photoDataUrl: body.photoDataUrl || '',
      photoQualityFlag: body.photoQualityFlag || 'ok',
      confidenceTier: 'C',
      confirmCount: 1,
      status: body.photoQualityFlag === 'suspect_spam' ? 'pending' : 'approved',
      sourceType: body.reporterRole || 'Cư dân đóng góp',
      sourceCitation: `${body.reporterRole || 'Cư dân'} báo trực tuyến (${new Date().toLocaleDateString('vi-VN')})`,
      observedDate: new Date().toISOString().slice(0, 10),
      notes: body.notes || ''
    };
    db.reports.push(rec);
    await writeSimDb(db);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, report: rec }));
    return;
  }

  if (action === 'submit_survey') {
    db.surveys.push({
      id: `${Date.now()}`,
      surveyType: body.surveyType,
      submittedAt: new Date().toISOString(),
      heatFirstAidCorrect: Boolean(body.heatFirstAidCorrect),
      confidenceScore: body.confidenceScore ? Number(body.confidenceScore) : null,
      quizScore: body.quizScore ?? null,
      answers: body.answers || {}
    });
    await writeSimDb(db);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!isAuthed) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Chưa xác thực quyền Quản trị.' }));
    return;
  }

  if (action === 'admin_moderate') {
    db.moderationMap[body.id] = { ...(db.moderationMap[body.id] || {}), status: body.status, confidenceTier: body.confidenceTier };
  } else if (action === 'admin_upsert_point') {
    const pt = body.point || {};
    if (/^(R|S)-\d+$/.test(pt.id)) {
      db.moderationMap[pt.id] = pt;
    } else {
      const idx = db.reports.findIndex((x) => x.id === pt.id);
      if (idx >= 0) db.reports[idx] = pt;
      else db.reports.unshift(pt);
    }
  } else if (action === 'admin_delete_point') {
    db.reports = db.reports.filter((x) => x.id !== body.id);
  } else if (action === 'admin_bulk_moderate') {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const act = body.act;
    if (act === 'delete') {
      for (const id of ids) {
        if (/^(R|S)-\d+$/.test(id)) db.moderationMap[id] = { ...(db.moderationMap[id] || {}), status: 'hidden' };
        else db.reports = db.reports.filter((x) => x.id !== id);
      }
    } else {
      const status = act === 'hide' ? 'hidden' : 'approved';
      const tier = act === 'approveA' ? 'A' : act === 'approveB' ? 'B' : undefined;
      for (const id of ids) {
        db.moderationMap[id] = { ...(db.moderationMap[id] || {}), status, ...(tier ? { confidenceTier: tier } : {}) };
      }
    }
  } else if (action === 'admin_merge_pair') {
    db.moderationMap[body.keepId] = {
      ...(db.moderationMap[body.keepId] || {}),
      confirmCount: body.mergedCount,
      confidenceTier: body.nextTier || 'B',
      status: 'approved'
    };
    db.moderationMap[body.dropId] = { ...(db.moderationMap[body.dropId] || {}), status: 'hidden' };
  } else if (action === 'admin_broadcast') {
    db.broadcast = body.active
      ? { active: true, level: body.level, message: body.message, updatedAt: new Date().toISOString() }
      : { active: false, updatedAt: new Date().toISOString() };
  }
  db.auditLog.unshift({ ts: new Date().toLocaleString('vi-VN'), mode: 'local-api', action, detail: body.id || body.message || '' });
  await writeSimDb(db);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true }));
}

function resolveSafePath(urlPath) {
  const cleanUrl = decodeURIComponent(urlPath.split('?')[0]);
  const rel = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
  const target = path.resolve(__dirname, rel);
  return target.startsWith(__dirname) ? target : null;
}

const server = http.createServer(async (req, res) => {
  try {
    if ((req.url || '').startsWith('/api/community')) {
      await handleLocalApi(req, res);
      return;
    }
    const filePath = resolveSafePath(req.url || '/');
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bản đồ Cộng đồng Mở ĐH Mỏ - Địa chất đang chạy tại http://localhost:${PORT}`);
});
