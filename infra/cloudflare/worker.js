/**
 * CLOUDFLARE WORKER EDGE API (D1 SQL APAC + KV 15-MIN WEATHER CACHE + 24H OVERPASS ZONE-OSM CACHE)
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
        { ok: true, engine: 'cloudflare-d1-kv-edge', collectionsStored: probe?.cnt ?? 0, region: 'apac', osmEnabled: true },
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
