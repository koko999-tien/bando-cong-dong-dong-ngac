/**
 * API CỔNG NGHIÊN CỨU CHUYÊN SÂU, KIỂM ĐỊNH ĐẨY LÊN BẢN ĐỒ CHÍNH & BẢN TIN THIÊN TAI TOÀN QUỐC
 * - Phần 1 (Công khai): zone_data (chỉ trả dữ liệu nằm trong vòng khoanh vùng chống lag)
 * - Phần 2 (Bắt buộc đăng ký & đăng nhập Nhà nghiên cứu): register_researcher, login_researcher, my_workspace, submit_study
 * - Kiểm duyệt (Quản trị / Hội đồng thẩm định): review_queue, review_study (duyệt -> tự động xuất bản lên Bản đồ chính & Phần 3)
 * - Phần 3 (Công khai): publications (Bản tin thiên tai & Bài nghiên cứu mở toàn Việt Nam)
 */

import crypto from 'node:crypto';
import { DATA_CLASSES } from '../platform/data/provenance-catalog.js';
import {
  isInsideVietnam,
  filterFeaturesInZone,
  findNearestVietnamZone
} from '../platform/regions/vietnam-directory.js';
import {
  cleanText,
  hasSpamContent,
  createBoundedRateLimiter
} from '../platform/security/validators.js';
import { withCors, handleCorsPreflight } from '../platform/security/cors.js';
import { checkDistributedRateLimit } from '../platform/security/edge-guard.js';
import {
  detectStorageBackend,
  hashPassword,
  verifyPassword,
  signResearcherToken,
  verifyResearcherToken,
  verifyAdminBearer,
  loadNationalCollections,
  saveResearchers,
  saveSubmissions,
  saveCustomPublications
} from '../platform/storage/national-store.js';

const authLimiter = createBoundedRateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000, maxEntries: 2000 });
const submitLimiter = createBoundedRateLimiter({ maxRequests: 8, windowMs: 15 * 60 * 1000, maxEntries: 2000 });

const VALID_MACRO_REGIONS = new Set(['bac', 'trung', 'tay-nguyen', 'nam', 'dbscl']);
const VALID_HAZARDS = new Set(['flood', 'landslide', 'heat', 'air_quality', 'salinity', 'storm', 'environment']);
const VALID_CATEGORIES = new Set(['flood', 'landslide', 'heat', 'traffic', 'air_quality', 'salinity', 'shelter', 'medical']);

const osmZoneMemoryCache = new Map();
const OSM_CACHE_TTL_MS = 30 * 60 * 1000;
const OSM_CACHE_MAX_ENTRIES = 150;

function normalizeOverpassElements(overpassJson) {
  const elements = Array.isArray(overpassJson?.elements) ? overpassJson.elements : [];
  const pois = [];
  const waterways = [];

  for (const el of elements) {
    const tags = el?.tags || {};
    if (el.type === 'way' && tags.waterway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      if (waterways.length < 30) {
        waterways.push({
          id: `osm-ww-${el.id}`,
          name: cleanText(tags.name || 'Kênh / Sông thoát nước', 120),
          waterwayType: cleanText(tags.waterway, 30),
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
      name: cleanText(tags.name, 140),
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
        cleanText(tags['addr:street'] || tags['addr:full'] || '', 90)
      ]
        .filter(Boolean)
        .join(' · '),
      confirmCount: 1
    });
  }

  return { pois, waterways };
}

function quickHaversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function fetchPhotonZoneFallback(lat, lng, qRadiusMeters) {
  const queries = [
    { q: 'benh vien', fallbackCat: 'medical', note: 'Cơ sở y tế (OSM)' },
    { q: 'tram y te', fallbackCat: 'medical', note: 'Trạm y tế địa phương (OSM)' },
    { q: 'ubnd', fallbackCat: 'shelter', note: 'Trụ sở hành chính / điểm hỗ trợ (OSM)' }
  ];
  const seenIds = new Set();
  const pois = [];
  const results = await Promise.allSettled(
    queries.map((item) => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 4000);
      return fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(item.q)}&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&limit=12`,
        { headers: { 'User-Agent': 'DongNgacOpenGIS/3.0' }, signal: c.signal }
      )
        .then((r) => (r.ok ? r.json() : null))
        .finally(() => clearTimeout(t));
    })
  );

  for (let qi = 0; qi < results.length; qi++) {
    const r = results[qi];
    if (r.status !== 'fulfilled' || !Array.isArray(r.value?.features)) continue;
    const cfg = queries[qi];
    for (const f of r.value.features) {
      const props = f?.properties || {};
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || !props.name) continue;
      if (props.osm_value === 'bus_stop' || props.osm_key === 'highway') continue;
      const pLng = Number(coords[0]);
      const pLat = Number(coords[1]);
      if (!isInsideVietnam(pLat, pLng)) continue;
      const d = quickHaversineMeters(lat, lng, pLat, pLng);
      if (d > qRadiusMeters + 350) continue;
      const id = `osm-ph-${props.osm_type || 'N'}-${props.osm_id || `${pLat.toFixed(4)}-${pLng.toFixed(4)}`}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const val = String(props.osm_value || '').toLowerCase();
      const isMedical = ['hospital', 'clinic', 'doctors', 'pharmacy'].includes(val) || cfg.fallbackCat === 'medical';
      pois.push({
        id,
        layerGroup: 'safe',
        category: isMedical ? 'medical' : 'shelter',
        name: cleanText(props.name, 140),
        lat: Math.round(pLat * 1000000) / 1000000,
        lng: Math.round(pLng * 1000000) / 1000000,
        dataClass: 'OBSERVED_DATA',
        confidenceTier: 'A',
        status: 'approved',
        isOsmLive: true,
        sourceType: 'OpenStreetMap / Photon (Dữ liệu hạ tầng vùng khoanh)',
        sourceCitation: `OpenStreetMap Contributors (ODbL) · osm:${props.osm_id || 'photon'}`,
        observedDate: 'Live OSM',
        notes: [cfg.note, cleanText(props.street || props.district || '', 80)].filter(Boolean).join(' · '),
        confirmCount: 1
      });
    }
  }
  return pois.slice(0, 35);
}

async function fetchZoneOsmLive(lat, lng, radiusKm) {
  const qRadiusMeters = Math.round(Math.min(Math.max(Number(radiusKm) || 5, 1.5), 8) * 1000);
  const cacheKey = `${lat.toFixed(2)}:${lng.toFixed(2)}:${qRadiusMeters}`;
  const cached = osmZoneMemoryCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < OSM_CACHE_TTL_MS) {
    return { ...cached.data, cache: 'MEM_HIT' };
  }

  const edgeBase = String(process.env.CF_EDGE_API_URL || '').replace(/\/$/, '');
  if (edgeBase) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `${edgeBase}/zone-osm?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radiusKm=${(qRadiusMeters / 1000).toFixed(1)}`,
        { signal: controller.signal }
      );
      clearTimeout(t);
      if (res.ok) {
        const edgeData = await res.json();
        if (edgeData?.ok && ((edgeData.pois?.length || 0) > 0 || (edgeData.waterways?.length || 0) > 0)) {
          const out = {
            pois: Array.isArray(edgeData.pois) ? edgeData.pois : [],
            waterways: Array.isArray(edgeData.waterways) ? edgeData.waterways : [],
            radiusMeters: qRadiusMeters,
            source: 'cloudflare_edge_kv'
          };
          if (osmZoneMemoryCache.size >= OSM_CACHE_MAX_ENTRIES) {
            const firstKey = osmZoneMemoryCache.keys().next().value;
            if (firstKey) osmZoneMemoryCache.delete(firstKey);
          }
          osmZoneMemoryCache.set(cacheKey, { savedAt: Date.now(), data: out });
          return { ...out, cache: edgeData.cache || 'EDGE' };
        }
      }
    } catch {
      // Fall through
    }
  }

  const dDeg = qRadiusMeters / 111000;
  const s = (lat - dDeg).toFixed(4);
  const w = (lng - dDeg).toFixed(4);
  const n = (lat + dDeg).toFixed(4);
  const e = (lng + dDeg).toFixed(4);
  const ql = `[out:json][timeout:5][bbox:${s},${w},${n},${e}];(node["amenity"~"hospital|clinic|doctors|fire_station|townhall"]["name"];way["amenity"~"hospital|clinic|doctors|fire_station|townhall"]["name"];way["waterway"~"river|canal|drain"]["name"];);out center 55;`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4200);
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(ql)}`, {
      headers: { 'User-Agent': 'DongNgacOpenGIS/3.0' },
      signal: controller.signal
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`OVERPASS_${res.status}`);
    const normalized = normalizeOverpassElements(await res.json());
    if (normalized.pois.length === 0 && normalized.waterways.length === 0) throw new Error('OVERPASS_EMPTY');
    const out = { ...normalized, radiusMeters: qRadiusMeters, source: 'overpass_direct' };
    if (osmZoneMemoryCache.size >= OSM_CACHE_MAX_ENTRIES) {
      const firstKey = osmZoneMemoryCache.keys().next().value;
      if (firstKey) osmZoneMemoryCache.delete(firstKey);
    }
    osmZoneMemoryCache.set(cacheKey, { savedAt: Date.now(), data: out });
    return { ...out, cache: 'MISS' };
  } catch {
    const photonPois = await fetchPhotonZoneFallback(lat, lng, qRadiusMeters);
    const out = { pois: photonPois, waterways: [], radiusMeters: qRadiusMeters, source: photonPois.length ? 'osm_photon_live' : 'fallback_empty' };
    if (photonPois.length > 0) {
      if (osmZoneMemoryCache.size >= OSM_CACHE_MAX_ENTRIES) {
        const firstKey = osmZoneMemoryCache.keys().next().value;
        if (firstKey) osmZoneMemoryCache.delete(firstKey);
      }
      osmZoneMemoryCache.set(cacheKey, { savedAt: Date.now(), data: out });
    }
    return out;
  }
}

function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon'
  );
}

function sanitizeFeatureList(rawFeatures, submissionMeta) {
  if (!Array.isArray(rawFeatures)) return [];
  const cleaned = [];
  for (let i = 0; i < Math.min(rawFeatures.length, 200); i++) {
    const item = rawFeatures[i];
    if (!item || typeof item !== 'object') continue;
    const lat = Number(item.lat ?? item.geometry?.coordinates?.[1]);
    const lng = Number(item.lng ?? item.geometry?.coordinates?.[0]);
    if (!isInsideVietnam(lat, lng)) continue;

    const props = item.properties || item;
    const name = cleanText(props.name || props.title || `Điểm khảo sát ${i + 1}`, 150);
    if (name.length < 2) continue;

    const rawCat = String(props.category || submissionMeta.hazardType || 'flood').toLowerCase();
    const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'flood';
    const layerGroup = ['shelter', 'medical'].includes(category) ? 'safe' : 'risk';

    cleaned.push({
      id: `${submissionMeta.id}-P${String(i + 1).padStart(2, '0')}`,
      submissionId: submissionMeta.id,
      province: submissionMeta.province,
      layerGroup,
      category,
      name,
      lat: Math.round(lat * 1_000_000) / 1_000_000,
      lng: Math.round(lng * 1_000_000) / 1_000_000,
      dataClass: submissionMeta.dataClass,
      confidenceTier: submissionMeta.dataClass === DATA_CLASSES.OBSERVED_DATA ? 'A' : 'B',
      status: 'approved',
      sourceType: `Nghiên cứu: ${submissionMeta.authorName} (${submissionMeta.organization})`,
      sourceCitation: `${submissionMeta.title} — ${submissionMeta.authorName}, ${submissionMeta.organization}`,
      observedDate: submissionMeta.observedDate,
      notes: cleanText(props.notes || props.description || submissionMeta.summary, 420),
      confirmCount: 1
    });
  }
  return cleaned;
}

export async function OPTIONS(request) {
  return handleCorsPreflight(request);
}

async function handleResearchGet(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'publications';

    // 0. Làm giàu hạ tầng cứu hộ, y tế & thủy hệ OSM theo đúng vòng khoanh (chống lag toàn quốc)
    if (action === 'zone_osm') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      const radiusKm = Number(url.searchParams.get('radiusKm') || 5);
      if (!isInsideVietnam(lat, lng)) {
        return Response.json({ ok: false, error: 'Tọa độ khoanh vùng phải nằm trong lãnh thổ Việt Nam.' }, { status: 400 });
      }
      const result = await fetchZoneOsmLive(lat, lng, radiusKm);
      return Response.json(
        {
          ok: true,
          zone: { lat, lng, radiusKm },
          ...result
        },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
      );
    }

    const { backend, researchers, submissions, publications } = await loadNationalCollections();

    // 1. Lấy dữ liệu nghiên cứu ĐÃ XUẤT BẢN nằm TRONG vùng đang khoanh (Chống lag toàn quốc!)
    if (action === 'zone_data') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      const radiusKm = Math.max(0.5, Math.min(50, Number(url.searchParams.get('radiusKm') || 5)));
      if (!isInsideVietnam(lat, lng)) {
        return Response.json({ ok: false, error: 'Tọa độ khoanh vùng phải nằm trong lãnh thổ Việt Nam.' }, { status: 400 });
      }

      const publishedSubs = submissions.filter((s) => s.status === 'published');
      const allPublishedFeatures = publishedSubs.flatMap((s) => (Array.isArray(s.features) ? s.features : []));
      const featuresInZone = filterFeaturesInZone(allPublishedFeatures, lat, lng, radiusKm, 250);
      const matchingZones = publishedSubs
        .filter((s) => {
          const hitFeature = featuresInZone.some((f) => f.submissionId === s.id);
          if (hitFeature) return true;
          const zHits = filterFeaturesInZone([{ lat: s.centerLat, lng: s.centerLng, id: s.id }], lat, lng, radiusKm + Number(s.radiusKm || 5), 1);
          return zHits.length > 0;
        })
        .map(({ features, ...meta }) => ({ ...meta, featureCount: Array.isArray(features) ? features.length : 0 }));

      return Response.json(
        {
          ok: true,
          storageBackend: backend,
          zone: { lat, lng, radiusKm },
          features: featuresInZone,
          publishedStudiesInZone: matchingZones,
          totalPublishedStudiesNationwide: publishedSubs.length
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // 2. Lấy Bản tin thiên tai & Bài nghiên cứu Mở (Phần 3)
    if (action === 'publications') {
      const kind = url.searchParams.get('kind') || 'all';
      const region = url.searchParams.get('region') || 'all';
      const hazard = url.searchParams.get('hazard') || 'all';
      const items = publications
        .filter((p) => p && p.status === 'published')
        .filter((p) => (kind === 'all' ? true : p.kind === kind))
        .filter((p) => (region === 'all' ? true : p.macroRegion === region))
        .filter((p) => (hazard === 'all' ? true : p.hazardType === hazard))
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());

      return Response.json(
        {
          ok: true,
          storageBackend: backend,
          items,
          stats: {
            total: items.length,
            disasterNewsCount: publications.filter((p) => p.status === 'published' && p.kind === 'disaster_news').length,
            researchArticleCount: publications.filter((p) => p.status === 'published' && p.kind === 'research_article').length,
            verifiedResearchersCount: researchers.length
          }
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // 3. Không gian làm việc riêng của Nhà Nghiên cứu đã đăng nhập (Phần 2)
    if (action === 'my_workspace') {
      const user = verifyResearcherToken(request);
      if (!user) {
        return Response.json({ ok: false, error: 'Vui lòng đăng nhập tài khoản Nhà nghiên cứu.' }, { status: 401 });
      }
      const profile = researchers.find((r) => r.id === user.id);
      if (!profile) {
        return Response.json({ ok: false, error: 'Không tìm thấy hồ sơ Nhà nghiên cứu.' }, { status: 401 });
      }
      const mySubmissions = submissions
        .filter((s) => s.researcherId === user.id)
        .map(({ features, ...meta }) => ({ ...meta, featureCount: Array.isArray(features) ? features.length : 0 }))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return Response.json({
        ok: true,
        storageBackend: backend,
        profile: {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          organization: profile.organization,
          specialty: profile.specialty,
          focusProvince: profile.focusProvince,
          bio: profile.bio,
          role: profile.role,
          createdAt: profile.createdAt
        },
        submissions: mySubmissions
      });
    }

    // 4. Hàng đợi kiểm định nghiên cứu (Chỉ Quản trị viên / Hội đồng thẩm định)
    if (action === 'review_queue') {
      if (!verifyAdminBearer(request)) {
        return Response.json({ ok: false, error: 'Yêu cầu xác thực quyền Hội đồng kiểm duyệt / Quản trị viên.' }, { status: 401 });
      }
      const list = submissions
        .map(({ features, ...meta }) => ({
          ...meta,
          featureCount: Array.isArray(features) ? features.length : 0,
          sampleFeatures: (Array.isArray(features) ? features : []).slice(0, 5)
        }))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return Response.json({
        ok: true,
        storageBackend: backend,
        submissions: list,
        researchersCount: researchers.length
      });
    }

    return Response.json({ ok: false, error: 'Hành động truy vấn không được hỗ trợ.' }, { status: 400 });
  } catch (err) {
    console.error('[api/research-portal GET error]', err);
    return Response.json({ ok: false, error: 'Lỗi máy chủ khi tải dữ liệu nghiên cứu.' }, { status: 500 });
  }
}

export const GET = withCors(handleResearchGet);

async function handleResearchPost(request) {
  try {
    const body = await request.json();
    const action = String(body?.action || '');
    const ip = getClientIp(request);

    // 1. Đăng ký tài khoản Nhà Nghiên cứu (Phần 2)
    if (action === 'register_researcher') {
      const regRl = await checkDistributedRateLimit({
        key: `rreg:${ip}`,
        maxRequests: 10,
        windowMs: 15 * 60 * 1000,
        fallbackLimiter: authLimiter
      });
      if (!regRl.allowed) {
        return Response.json({ ok: false, error: 'Bạn thao tác đăng ký quá nhanh. Vui lòng đợi ít phút.' }, { status: 429 });
      }
      const email = cleanText(body.email, 120).toLowerCase();
      const password = String(body.password || '');
      const fullName = cleanText(body.fullName, 100);
      const organization = cleanText(body.organization, 140);
      const specialty = cleanText(body.specialty, 100);
      const focusProvince = cleanText(body.focusProvince, 80);
      const bio = cleanText(body.bio || '', 400);

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json({ ok: false, error: 'Địa chỉ email không hợp lệ.' }, { status: 400 });
      }
      if (password.length < 8) {
        return Response.json({ ok: false, error: 'Mật khẩu phải có tối thiểu 8 ký tự.' }, { status: 400 });
      }
      if (fullName.length < 3 || organization.length < 3 || specialty.length < 2) {
        return Response.json({ ok: false, error: 'Vui lòng điền đầy đủ Họ tên, Đơn vị công tác và Chuyên ngành.' }, { status: 400 });
      }
      if (hasSpamContent(fullName) || hasSpamContent(organization) || hasSpamContent(bio)) {
        return Response.json({ ok: false, error: 'Hồ sơ chứa liên kết hoặc từ khóa không hợp lệ.' }, { status: 400 });
      }

      const { researchers } = await loadNationalCollections();
      if (researchers.some((r) => r.email === email)) {
        return Response.json({ ok: false, error: 'Email này đã đăng ký tài khoản Nhà nghiên cứu. Hãy chuyển sang mục Đăng nhập.' }, { status: 409 });
      }

      const newResearcher = {
        id: `RS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        email,
        passwordHash: hashPassword(password),
        fullName,
        organization,
        specialty,
        focusProvince: focusProvince || 'Toàn quốc',
        bio,
        role: 'researcher',
        createdAt: new Date().toISOString()
      };
      await saveResearchers([newResearcher, ...researchers]);

      const token = signResearcherToken(newResearcher);
      return Response.json({
        ok: true,
        token,
        profile: {
          id: newResearcher.id,
          email: newResearcher.email,
          fullName: newResearcher.fullName,
          organization: newResearcher.organization,
          specialty: newResearcher.specialty,
          focusProvince: newResearcher.focusProvince,
          role: newResearcher.role
        }
      });
    }

    // 2. Đăng nhập Nhà Nghiên cứu (Phần 2)
    if (action === 'login_researcher') {
      const loginRl = await checkDistributedRateLimit({
        key: `rlogin:${ip}`,
        maxRequests: 10,
        windowMs: 15 * 60 * 1000,
        fallbackLimiter: authLimiter
      });
      if (!loginRl.allowed) {
        return Response.json({ ok: false, error: 'Thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút.' }, { status: 429 });
      }
      const email = cleanText(body.email, 120).toLowerCase();
      const password = String(body.password || '');
      const { researchers } = await loadNationalCollections();
      const found = researchers.find((r) => r.email === email);
      if (!found || !verifyPassword(password, found.passwordHash)) {
        return Response.json({ ok: false, error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
      }
      const token = signResearcherToken(found);
      return Response.json({
        ok: true,
        token,
        profile: {
          id: found.id,
          email: found.email,
          fullName: found.fullName,
          organization: found.organization,
          specialty: found.specialty,
          focusProvince: found.focusProvince,
          role: found.role
        }
      });
    }

    // 3. Nhà nghiên cứu gửi Hồ sơ Nghiên cứu & Lớp Dữ liệu vào hàng đợi kiểm định (BẮT BUỘC ĐĂNG NHẬP)
    if (action === 'submit_study') {
      const user = verifyResearcherToken(request);
      if (!user) {
        return Response.json({ ok: false, error: 'Bạn phải đăng nhập tài khoản Nhà nghiên cứu để gửi dữ liệu & bài nghiên cứu.' }, { status: 401 });
      }
      const subRl = await checkDistributedRateLimit({
        key: `rsub:${user.id}`,
        maxRequests: 8,
        windowMs: 15 * 60 * 1000,
        fallbackLimiter: submitLimiter
      });
      if (!subRl.allowed) {
        return Response.json({ ok: false, error: 'Bạn gửi quá nhiều hồ sơ trong thời gian ngắn. Vui lòng đợi ít phút.' }, { status: 429 });
      }

      const title = cleanText(body.title, 180);
      const summary = cleanText(body.summary, 600);
      const articleBody = cleanText(body.articleBody || body.methodology || summary, 4000);
      const methodology = cleanText(body.methodology, 1000);
      const limitations = cleanText(body.limitations, 800);
      const centerLat = Number(body.centerLat);
      const centerLng = Number(body.centerLng);
      const radiusKm = Math.max(0.5, Math.min(50, Number(body.radiusKm || 5)));
      const hazardType = VALID_HAZARDS.has(body.hazardType) ? body.hazardType : 'flood';
      const dataClass = DATA_CLASSES[body.dataClass] ? body.dataClass : DATA_CLASSES.OBSERVED_DATA;

      if (title.length < 8 || summary.length < 20 || limitations.length < 10) {
        return Response.json(
          { ok: false, error: 'Vui lòng nhập đầy đủ Tiêu đề (≥8 ký tự), Tóm tắt (≥20 ký tự) và Hạn chế khoa học đã biết (≥10 ký tự).' },
          { status: 400 }
        );
      }
      if (!isInsideVietnam(centerLat, centerLng)) {
        return Response.json({ ok: false, error: 'Tâm khu vực nghiên cứu phải nằm trong lãnh thổ Việt Nam.' }, { status: 400 });
      }
      if (hasSpamContent(title) || hasSpamContent(summary) || hasSpamContent(articleBody)) {
        return Response.json({ ok: false, error: 'Nội dung chứa liên kết quảng cáo hoặc từ khóa không hợp lệ.' }, { status: 400 });
      }

      const nearestZone = findNearestVietnamZone(centerLat, centerLng);
      const province = cleanText(body.province || nearestZone?.province || 'Việt Nam', 80);
      const macroRegion = VALID_MACRO_REGIONS.has(body.macroRegion)
        ? body.macroRegion
        : nearestZone?.macroRegion || 'bac';

      const id = `SUB-${Date.now().toString(36).toUpperCase()}`;
      const observedDate = cleanText(body.observedDate || new Date().toISOString().slice(0, 10), 20);
      const submissionMeta = {
        id,
        province,
        hazardType,
        dataClass,
        title,
        summary,
        authorName: user.fullName || user.email,
        organization: user.organization || 'Nhà nghiên cứu độc lập',
        observedDate
      };

      const cleanedFeatures = sanitizeFeatureList(body.features, submissionMeta);
      if (cleanedFeatures.length === 0) {
        return Response.json(
          { ok: false, error: 'Cần đính kèm tối thiểu 1 điểm dữ liệu tọa độ hợp lệ trong lãnh thổ Việt Nam (nhập trực tiếp hoặc nạp GeoJSON/CSV).' },
          { status: 400 }
        );
      }

      const { submissions } = await loadNationalCollections();
      const record = {
        id,
        researcherId: user.id,
        authorName: submissionMeta.authorName,
        organization: submissionMeta.organization,
        title,
        province,
        macroRegion,
        hazardType,
        dataClass,
        centerLat: Math.round(centerLat * 1_000_000) / 1_000_000,
        centerLng: Math.round(centerLng * 1_000_000) / 1_000_000,
        radiusKm,
        summary,
        articleBody,
        methodology: methodology || 'Khảo sát hiện trường và phân tích không gian GIS.',
        limitations,
        license: cleanText(body.license || 'CC BY 4.0', 60),
        observedDate,
        features: cleanedFeatures,
        featureCount: cleanedFeatures.length,
        status: 'pending_review',
        reviewNote: '',
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        createdAt: new Date().toISOString()
      };

      await saveSubmissions([record, ...submissions]);
      return Response.json({
        ok: true,
        submission: { ...record, features: undefined },
        message: 'Hồ sơ nghiên cứu đã gửi vào hàng đợi kiểm định. Sau khi được kiểm tra & duyệt, lớp dữ liệu sẽ tự động hiển thị lên Bản đồ chính và bài nghiên cứu sẽ đăng lên mục Bản tin & Nghiên cứu.'
      });
    }

    // 4. Hội đồng Kiểm duyệt / Quản trị viên duyệt đẩy dữ liệu lên Bản đồ chính & Phần 3
    if (action === 'review_study') {
      if (!verifyAdminBearer(request)) {
        return Response.json({ ok: false, error: 'Chỉ Hội đồng kiểm định / Quản trị viên đã xác thực mới được duyệt xuất bản lên Bản đồ chính.' }, { status: 401 });
      }
      const submissionId = cleanText(body.submissionId, 48);
      const decision = body.decision === 'publish' ? 'publish' : body.decision === 'reject' ? 'reject' : null;
      const reviewNote = cleanText(body.reviewNote || '', 400);
      if (!submissionId || !decision) {
        return Response.json({ ok: false, error: 'Thiếu mã hồ sơ hoặc quyết định kiểm duyệt (publish/reject).' }, { status: 400 });
      }

      const { submissions, publications } = await loadNationalCollections();
      const idx = submissions.findIndex((s) => s.id === submissionId);
      if (idx < 0) {
        return Response.json({ ok: false, error: `Không tìm thấy hồ sơ ${submissionId}.` }, { status: 404 });
      }

      const nowIso = new Date().toISOString();
      const target = {
        ...submissions[idx],
        status: decision === 'publish' ? 'published' : 'rejected',
        reviewNote,
        reviewedBy: 'Hội đồng Kiểm định Dữ liệu',
        reviewedAt: nowIso,
        publishedAt: decision === 'publish' ? nowIso : null
      };
      submissions[idx] = target;
      await saveSubmissions(submissions);

      // Khi duyệt publish -> tự động xuất bản bài nghiên cứu lên Phần 3 (kèm nút mở đúng khu vực trên Bản đồ chính!)
      let publishedArticle = null;
      if (decision === 'publish') {
        publishedArticle = {
          id: `PUB-${target.id}`,
          kind: 'research_article',
          submissionId: target.id,
          title: target.title,
          summary: target.summary,
          body: `${target.articleBody}\n\nPhương pháp: ${target.methodology}\n\nGiới hạn khoa học đã biết: ${target.limitations}`,
          authorName: target.authorName,
          organization: target.organization,
          province: target.province,
          macroRegion: target.macroRegion,
          hazardType: target.hazardType,
          severity: 'attention',
          sourceLabel: `Nghiên cứu đã kiểm định (${target.license})`,
          dataClass: target.dataClass,
          focusLat: target.centerLat,
          focusLng: target.centerLng,
          focusRadiusKm: target.radiusKm,
          featureCount: target.featureCount,
          status: 'published',
          publishedAt: nowIso
        };
        const filteredPubs = publications.filter((p) => p.id !== publishedArticle.id);
        await saveCustomPublications([publishedArticle, ...filteredPubs]);
      }

      return Response.json({
        ok: true,
        status: target.status,
        submissionId: target.id,
        publishedArticle
      });
    }

    // 5. Quản trị viên đăng Bản tin Thiên tai & Môi trường mới lên Phần 3
    if (action === 'publish_disaster_news') {
      if (!verifyAdminBearer(request)) {
        return Response.json({ ok: false, error: 'Yêu cầu quyền Quản trị viên để đăng bản tin thiên tai.' }, { status: 401 });
      }
      const title = cleanText(body.title, 180);
      const summary = cleanText(body.summary, 400);
      const articleBody = cleanText(body.body || summary, 3000);
      const sourceLabel = cleanText(body.sourceLabel || 'Nguồn cơ quan KTTV / PCTT', 120);
      const focusLat = Number(body.focusLat);
      const focusLng = Number(body.focusLng);
      const focusRadiusKm = Math.max(1, Math.min(50, Number(body.focusRadiusKm || 8)));
      if (title.length < 8 || !isInsideVietnam(focusLat, focusLng)) {
        return Response.json({ ok: false, error: 'Tiêu đề hoặc tọa độ khu vực bản tin không hợp lệ.' }, { status: 400 });
      }

      const nearest = findNearestVietnamZone(focusLat, focusLng);
      const newsItem = {
        id: `NEWS-${Date.now().toString(36).toUpperCase()}`,
        kind: 'disaster_news',
        submissionId: null,
        title,
        summary,
        body: articleBody,
        authorName: cleanText(body.authorName || 'Ban Biên tập Thiên tai', 100),
        organization: cleanText(body.organization || sourceLabel, 140),
        province: cleanText(body.province || nearest?.province || 'Việt Nam', 80),
        macroRegion: VALID_MACRO_REGIONS.has(body.macroRegion) ? body.macroRegion : nearest?.macroRegion || 'bac',
        hazardType: VALID_HAZARDS.has(body.hazardType) ? body.hazardType : 'storm',
        severity: ['info', 'attention', 'high'].includes(body.severity) ? body.severity : 'attention',
        sourceLabel,
        dataClass: DATA_CLASSES[body.dataClass] ? body.dataClass : DATA_CLASSES.FORECAST_DATA,
        focusLat,
        focusLng,
        focusRadiusKm,
        featureCount: 0,
        status: 'published',
        publishedAt: new Date().toISOString()
      };

      const { publications } = await loadNationalCollections();
      await saveCustomPublications([newsItem, ...publications]);
      return Response.json({ ok: true, item: newsItem });
    }

    return Response.json({ ok: false, error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (err) {
    console.error('[api/research-portal POST error]', err);
    return Response.json({ ok: false, error: 'Lỗi xử lý máy chủ cổng nghiên cứu.' }, { status: 500 });
  }
}

export const POST = withCors(handleResearchPost);
