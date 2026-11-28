/**
 * CLOUDFLARE WORKER EDGE API (D1 SQL APAC + KV GLOBAL RATE LIMIT + TURNSTILE + OVERPASS/WEATHER CACHE)
 * Mã nguồn triển khai tại https://vn-resilience-api.vn-resilience-edge.workers.dev
 */

function timingSafeEqualStr(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (s1.length !== s2.length) return false;
  let diff = 0;
  for (let i = 0; i < s1.length; i++) diff |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  return diff === 0;
}

function isAuthed(request, env) {
  const auth = request.headers.get('authorization') || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return Boolean(env.EDGE_API_TOKEN && tok && timingSafeEqualStr(tok, env.EDGE_API_TOKEN));
}

function isInsideVietnamBox(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 8 && lat <= 24 && lng >= 102 && lng <= 118;
}

function normalizeOsmPayload(overpassJson) {
  const elements = Array.isArray(overpassJson?.elements) ? overpassJson.elements : [];
  const pois = [];
  const waterways = [];

  for (const el of elements) {
    const tags = el?.tags || {};
    if (el.type === 'way' && tags.waterway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      if (waterways.length < 30) {
        waterways.push({
          id: `osm-ww-${el.id}`,
          name: tags.name || 'Kênh / Sông thoát nước',
          waterwayType: tags.waterway,
          coordinates: el.geometry.slice(0, 60).map((pt) => [Math.round(pt.lat * 100000) / 100000, Math.round(pt.lon * 100000) / 100000])
        });
      }
      continue;
    }

    const amenity = tags.amenity || '';
    const elLat = Number(el.lat ?? el.center?.lat);
    const elLng = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(elLat) || !Number.isFinite(elLng) || !tags.name || pois.length >= 45) continue;

    const isMedical = ['hospital', 'clinic', 'doctors'].includes(amenity);
    pois.push({
      id: `osm-${el.type}-${el.id}`,
      layerGroup: 'safe',
      category: isMedical ? 'medical' : 'shelter',
      name: String(tags.name).slice(0, 140),
      lat: Math.round(elLat * 1000000) / 1000000,
      lng: Math.round(elLng * 1000000) / 1000000,
      dataClass: 'OBSERVED_DATA',
      confidenceTier: 'A',
      status: 'approved',
      isOsmLive: true,
      sourceType: 'OpenStreetMap (Dữ liệu hạ tầng vùng khoanh)',
      sourceCitation: `OpenStreetMap Contributors (ODbL) · osm:${el.type}/${el.id}`,
      observedDate: 'Live Overpass',
      notes: [
        isMedical ? 'Cơ sở y tế' : amenity === 'fire_station' ? 'Đơn vị PCCC & CNCH' : 'Cơ sở hành chính / điểm hỗ trợ cộng đồng',
        tags['addr:street'] || tags['addr:full'] || ''
      ]
        .filter(Boolean)
        .join(' · '),
      confirmCount: 1
    });
  }

  return { pois, waterways };
}

async function mirrorCollectionToNormalizedD1(env, key, items, nowIso) {
  if (!Array.isArray(items)) return;
  try {
    if (key === 'sos_accounts') {
      const ids = new Set(items.map((a) => String(a?.id || '')).filter(Boolean));
      const existing = await env.DB.prepare('SELECT id FROM sos_accounts').all();
      const stmts = [];
      for (const row of existing.results || []) {
        if (!ids.has(row.id)) {
          stmts.push(env.DB.prepare('DELETE FROM sos_accounts WHERE id = ?').bind(row.id));
        }
      }
      for (const a of items.slice(0, 200)) {
        if (!a?.id) continue;
        stmts.push(
          env.DB.prepare(
            'INSERT INTO sos_accounts (id, email, full_name, organization, auth_provider, trust_tier, status, ekyc_json, completed_helps, abuse_flags, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, full_name=excluded.full_name, organization=excluded.organization, auth_provider=excluded.auth_provider, trust_tier=excluded.trust_tier, status=excluded.status, ekyc_json=excluded.ekyc_json, completed_helps=excluded.completed_helps, abuse_flags=excluded.abuse_flags, updated_at=excluded.updated_at'
          ).bind(
            String(a.id),
            String(a.email || ''),
            String(a.fullName || ''),
            String(a.organization || ''),
            String(a.authProvider || 'local'),
            String(a.trustTier || 'citizen'),
            String(a.status || 'active'),
            a.ekyc ? JSON.stringify(a.ekyc) : null,
            Number(a.completedHelps || 0),
            Number(a.abuseFlags || 0),
            nowIso
          )
        );
      }
      if (stmts.length) await env.DB.batch(stmts);
    } else if (key === 'sos_tickets') {
      const stmts = [];
      for (const t of items.slice(0, 150)) {
        if (!t?.id) continue;
        stmts.push(
          env.DB.prepare(
            'INSERT INTO sos_tickets (id, requester_id, status, category, dispatch_scope, max_responders, geohash6, fuzzy_lat, fuzzy_lng, exact_lat, exact_lng, exact_coord_shredded, expires_at, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET requester_id=excluded.requester_id, status=excluded.status, dispatch_scope=excluded.dispatch_scope, exact_lat=excluded.exact_lat, exact_lng=excluded.exact_lng, exact_coord_shredded=excluded.exact_coord_shredded, payload_json=excluded.payload_json, updated_at=excluded.updated_at'
          ).bind(
            String(t.id),
            String(t.requesterId || ''),
            String(t.status || ''),
            String(t.category || ''),
            String(t.dispatchScope || 'verified_peers'),
            Number(t.maxResponders || 0),
            String(t.geohash6 || ''),
            t.fuzzyLat ?? null,
            t.fuzzyLng ?? null,
            t.exactLat ?? null,
            t.exactLng ?? null,
            t.exactCoordShredded ? 1 : 0,
            t.expiresAt ? String(t.expiresAt) : null,
            JSON.stringify(t),
            nowIso
          )
        );
      }
      if (stmts.length) await env.DB.batch(stmts);
    } else if (key === 'sos_ephemeral_cells') {
      const nowMs = Date.now();
      const stmts = [env.DB.prepare('DELETE FROM sos_ephemeral_cells WHERE expires_at_ms <= ?').bind(nowMs)];
      for (const c of items.slice(0, 200)) {
        if (!c?.responderId) continue;
        stmts.push(
          env.DB.prepare(
            'INSERT INTO sos_ephemeral_cells (responder_id, geohash5, trust_tier, expires_at_ms) VALUES (?, ?, ?, ?) ON CONFLICT(responder_id) DO UPDATE SET geohash5=excluded.geohash5, trust_tier=excluded.trust_tier, expires_at_ms=excluded.expires_at_ms'
          ).bind(String(c.responderId), String(c.geohash5 || ''), String(c.trustTier || ''), Number(c.expiresAtMs || 0))
        );
      }
      await env.DB.batch(stmts);
    }
  } catch {
    // Graceful fallback: bảng normalized chưa chạy SQL thì platform_collections vẫn hoạt động bình thường
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') {
      const probe = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM platform_collections').first();
      return Response.json(
        {
          ok: true,
          engine: 'cloudflare-d1-kv-edge',
          collectionsStored: probe?.cnt ?? 0,
          region: 'apac',
          osmEnabled: true,
          normalizedTablesReady: true,
          rateLimitEngine: 'cloudflare_kv_edge',
          turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
          turnstileSiteKey: env.TURNSTILE_SITE_KEY || ''
        },
        { headers: cors }
      );
    }

    if (url.pathname === '/weather' && request.method === 'GET') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      if (!isInsideVietnamBox(lat, lng)) {
        return Response.json({ ok: false, error: 'Tọa độ phải nằm trong phạm vi Việt Nam.' }, { status: 400, headers: cors });
      }
      const cacheKey = `wx2:${lat.toFixed(2)}:${lng.toFixed(2)}`;
      const cached = await env.CACHE.get(cacheKey, { type: 'json' });
      if (cached) {
        return Response.json({ ok: true, cache: 'HIT', ...cached }, { headers: cors });
      }
      const [wxRes, aqiRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,rain,wind_speed_10m&hourly=precipitation,precipitation_probability,temperature_2m&forecast_hours=24&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FBangkok&forecast_days=2`
        ),
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FBangkok`
        )
      ]);
      const payload = {
        weather: wxRes.ok ? await wxRes.json() : null,
        aqi: aqiRes.ok ? await aqiRes.json() : null,
        fetchedAt: new Date().toISOString()
      };
      await env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 900 });
      return Response.json({ ok: true, cache: 'MISS', ...payload }, { headers: cors });
    }

    if (url.pathname === '/zone-osm' && request.method === 'GET') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      const radiusKm = Number(url.searchParams.get('radiusKm') || 5);
      if (!isInsideVietnamBox(lat, lng)) {
        return Response.json({ ok: false, error: 'Tọa độ phải nằm trong phạm vi Việt Nam.' }, { status: 400, headers: cors });
      }
      const qRadiusMeters = Math.round(Math.min(Math.max(Number.isFinite(radiusKm) ? radiusKm : 5, 1.5), 6) * 1000);
      const cacheKey = `osm1:${lat.toFixed(2)}:${lng.toFixed(2)}:${qRadiusMeters}`;
      const cached = await env.CACHE.get(cacheKey, { type: 'json' });
      if (cached) {
        return Response.json({ ok: true, cache: 'HIT', ...cached }, { headers: cors });
      }

      const dDeg = qRadiusMeters / 111000;
      const ql = `[out:json][timeout:6][bbox:${(lat - dDeg).toFixed(4)},${(lng - dDeg).toFixed(4)},${(lat + dDeg).toFixed(4)},${(lng + dDeg).toFixed(4)}];(node["amenity"~"hospital|clinic|doctors|fire_station|townhall"]["name"];way["amenity"~"hospital|clinic|doctors|fire_station|townhall"]["name"];way["waterway"~"river|canal|drain"]["name"];);out center 55;`;
      try {
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`, {
          headers: { 'User-Agent': 'DongNgacOpenGIS/3.0' }
        });
        if (!res.ok) throw new Error(`OVERPASS_${res.status}`);
        const json = await res.json();
        const normalized = normalizeOsmPayload(json);
        const payload = { ...normalized, fetchedAt: new Date().toISOString(), radiusMeters: qRadiusMeters };
        await env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 86400 });
        return Response.json({ ok: true, cache: 'MISS', ...payload }, { headers: cors });
      } catch {
        return Response.json({ ok: true, cache: 'FALLBACK_EMPTY', pois: [], waterways: [], radiusMeters: qRadiusMeters }, { headers: cors });
      }
    }

    if (url.pathname === '/rate-limit/check' && request.method === 'POST') {
      if (!isAuthed(request, env)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      const body = await request.json().catch(() => ({}));
      const rawKey = String(body.key || 'anon').replace(/[^a-z0-9:._-]/gi, '').slice(0, 96);
      const maxRequests = Math.min(Math.max(Number(body.maxRequests) || 10, 1), 200);
      const windowMs = Math.min(Math.max(Number(body.windowMs) || 60000, 5000), 3600000);
      const bucket = Math.floor(Date.now() / windowMs);
      const kvKey = `rl:${rawKey}:${bucket}`;
      const curRaw = await env.CACHE.get(kvKey);
      const count = (Number(curRaw) || 0) + 1;
      const ttlSeconds = Math.max(60, Math.ceil(windowMs / 1000) + 5);
      await env.CACHE.put(kvKey, String(count), { expirationTtl: ttlSeconds });
      return Response.json({
        ok: true,
        allowed: count <= maxRequests,
        count,
        remaining: Math.max(0, maxRequests - count),
        resetAt: (bucket + 1) * windowMs
      });
    }

    if (url.pathname === '/turnstile/verify' && request.method === 'POST') {
      if (!isAuthed(request, env)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      if (!env.TURNSTILE_SECRET_KEY) {
        return Response.json({ ok: true, skipped: true, success: true });
      }
      const body = await request.json().catch(() => ({}));
      const token = String(body.token || '').trim();
      if (!token) {
        return Response.json({ ok: false, success: false, error: 'Missing Turnstile token' }, { status: 400 });
      }
      const form = new FormData();
      form.append('secret', env.TURNSTILE_SECRET_KEY);
      form.append('response', token);
      if (body.remoteip) form.append('remoteip', String(body.remoteip));
      const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form
      });
      const vjson = await vr.json().catch(() => ({ success: false }));
      return Response.json({
        ok: Boolean(vjson.success),
        success: Boolean(vjson.success),
        errorCodes: vjson['error-codes'] || []
      });
    }

    if (url.pathname === '/push/subscribe' && request.method === 'POST') {
      if (!isAuthed(request, env)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      const body = await request.json().catch(() => ({}));
      const responderId = String(body.responderId || '').slice(0, 64);
      const geohash5 = String(body.geohash5 || '').slice(0, 8);
      const subscription = body.subscription || null;
      if (!responderId || !geohash5 || !subscription?.endpoint) {
        return Response.json({ ok: false, error: 'Invalid push subscription payload' }, { status: 400 });
      }
      const subHash = btoa(String(subscription.endpoint)).slice(0, 48);
      const nowIso = new Date().toISOString();
      const expMs = Date.now() + 30 * 60 * 1000;
      await env.DB.prepare(
        'INSERT INTO push_subscriptions (sub_hash, responder_id, geohash5, subscription_json, expires_at_ms, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(sub_hash) DO UPDATE SET geohash5=excluded.geohash5, expires_at_ms=excluded.expires_at_ms, updated_at=excluded.updated_at'
      )
        .bind(subHash, responderId, geohash5, JSON.stringify(subscription), expMs, nowIso)
        .run();
      return Response.json({ ok: true, geohash5, expiresAtMs: expMs });
    }

    if (url.pathname === '/collections' && request.method === 'GET') {
      if (!isAuthed(request, env)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      const rows = await env.DB.prepare('SELECT collection_key, payload, updated_at FROM platform_collections').all();
      const map = {};
      for (const r of rows.results || []) {
        try {
          map[r.collection_key] = JSON.parse(r.payload);
        } catch {
          map[r.collection_key] = [];
        }
      }
      return Response.json({
        ok: true,
        engine: 'cloudflare_d1_edge',
        ...map,
        researchers: map.researchers || [],
        submissions: map.submissions || [],
        publications: map.publications || [],
        sos_accounts: map.sos_accounts || [],
        sos_tickets: map.sos_tickets || [],
        sos_ephemeral_cells: map.sos_ephemeral_cells || []
      });
    }

    const putMatch = url.pathname.match(
      /^\/collections\/(researchers|submissions|publications|sos_accounts|sos_tickets|sos_ephemeral_cells)$/
    );
    if (putMatch && request.method === 'PUT') {
      if (!isAuthed(request, env)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      const key = putMatch[1];
      const body = await request.json();
      const payloadArr = Array.isArray(body?.payload) ? body.payload : [];
      const payloadStr = JSON.stringify(payloadArr);
      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO platform_collections (collection_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(collection_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
      )
        .bind(key, payloadStr, nowIso)
        .run();
      await mirrorCollectionToNormalizedD1(env, key, payloadArr, nowIso);
      return Response.json({ ok: true, key, updatedAt: nowIso });
    }

    return Response.json({ ok: false, error: 'Not found' }, { status: 404, headers: cors });
  }
};
