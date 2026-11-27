/**
 * CLOUDFLARE WORKER EDGE API (D1 SQL APAC + KV 15-MIN WEATHER CACHE)
 * Mã nguồn đồng bộ bản đã triển khai tại https://vn-resilience-api.vn-resilience-edge.workers.dev
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/health') {
      const probe = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM platform_collections').first();
      return Response.json(
        { ok: true, engine: 'cloudflare-d1-kv-edge', collectionsStored: probe?.cnt ?? 0, region: 'apac' },
        { headers: cors }
      );
    }

    if (url.pathname === '/weather' && request.method === 'GET') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 8 || lat > 24 || lng < 102 || lng > 118) {
        return Response.json({ ok: false, error: 'Tọa độ phải nằm trong phạm vi Việt Nam.' }, { status: 400, headers: cors });
      }
      const cacheKey = `wx:${lat.toFixed(2)}:${lng.toFixed(2)}`;
      const cached = await env.CACHE.get(cacheKey, { type: 'json' });
      if (cached) {
        return Response.json({ ok: true, cache: 'HIT', ...cached }, { headers: cors });
      }
      const [wxRes, aqiRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,precipitation,rain&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FBangkok&forecast_days=2`
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
        researchers: map.researchers || [],
        submissions: map.submissions || [],
        publications: map.publications || []
      });
    }

    const putMatch = url.pathname.match(/^\/collections\/(researchers|submissions|publications)$/);
    if (putMatch && request.method === 'PUT') {
      if (!isAuthed(request, env)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      const key = putMatch[1];
      const body = await request.json();
      const payloadStr = JSON.stringify(Array.isArray(body?.payload) ? body.payload : []);
      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO platform_collections (collection_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(collection_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
      )
        .bind(key, payloadStr, nowIso)
        .run();
      return Response.json({ ok: true, key, updatedAt: nowIso });
    }

    return Response.json({ ok: false, error: 'Not Found' }, { status: 404, headers: cors });
  }
};
