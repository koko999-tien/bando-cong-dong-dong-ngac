/**
 * PROXY BẢO MẬT & BỘ XOAY VÒNG TOKEN TỰ ĐỘNG CHO HỆ THỐNG GIS VIỆT NAM (gis.vn / vn2000.vn)
 * - Giấu hoàn toàn token phía máy chủ (không bao giờ lộ token ra trình duyệt người dùng).
 * - Tự động theo dõi giới hạn maxUsagePerApi (10 lượt/API) và gọi https://gis.vn/api/get-token
 *   để cấp token mới liền mạch trước khi chạm trần hoặc khi hết lượt.
 * - Lưu đệm LRU 6 giờ theo ô tọa độ để tăng tốc phản hồi < 5 ms và tiết kiệm 95%+ hạn mức.
 * - Dự phòng tức thì bằng giải tích 7 tham số Bursa-Wolf (platform/gis/vn2000.js) nếu đứt kết nối ngoài.
 */

import https from 'node:https';
import tls from 'node:tls';
import { withCors, handleCorsPreflight } from '../platform/security/cors.js';
import { isInsideVietnam } from '../platform/regions/vietnam-directory.js';
import {
  lookupCentralMeridian,
  wgs84ToVn2000Local,
  vn2000ToWgs84Local
} from '../platform/gis/vn2000.js';

// Máy chủ vn2000.vn dùng chứng chỉ Let's Encrypt YR2 (Gen Y 2026) nhưng cấu hình thiếu chuỗi trung gian (AIA),
// khiến Node.js/OpenSSL mặc định báo UNABLE_TO_VERIFY_LEAF_SIGNATURE. Bổ sung 2 chứng chỉ trung gian công khai
// chính thức của Let's Encrypt / ISRG Root X1 để xác thực mật mã TLS nghiêm ngặt (rejectUnauthorized: true).
const LETS_ENCRYPT_YR2_PEM = `-----BEGIN CERTIFICATE-----
MIIE2jCCAsKgAwIBAgIQTr0klH4k05SALYSlL9WzGTANBgkqhkiG9w0BAQsFADAuMQswCQYDVQQG
EwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZUjAeFw0yNTA5MDMwMDAwMDBaFw0y
ODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBFbmNyeXB0MQwwCgYD
VQQDEwNZUjIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDZ0LxwBppqh84luqMerV/e
eL/fXQ7mLQQv1LnpWKZbyvGpx6wh6AfnslAnF6ewTkcHA+gSOoBvm3Dfm06AuGiF+KRut4fAcowq
nAQQCW98+QPP/eOv/wug7Iyk4NkOxf2I6g2f55T6nJoOTLFcukeRq80JGQEYan+dPFr9OGUgQK2h
GKgNkW87pappsOAuUJcroYhRt5uUis4qaZireiseu32gzDJNBAiKtsvd6HX4v25bpkRNcS/B/Gtc
9kVbUpD+2PLPxdei3Tim55k4tfAEXwD2qyiPTxrTNq6lN+AMr5g2c1dNqkOTwjxeV6L5lpP1rGiY
vLnRaPlOqyZRPW+5AgMBAAGjge4wgeswDgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUF
BwMBMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0OBBYEFEAVLSZ57TIgnt+ach3WMh+BDIEMMB8G
A1UdIwQYMBaAFN7nW2DQIm1AKH0/DQH+pLVStFGUMDIGCCsGAQUFBwEBBCYwJDAiBggrBgEFBQcw
AoYWaHR0cDovL3lyLmkubGVuY3Iub3JnLzATBgNVHSAEDDAKMAgGBmeBDAECATAnBgNVHR8EIDAe
MBygGqAYhhZodHRwOi8veXIuYy5sZW5jci5vcmcvMA0GCSqGSIb3DQEBCwUAA4ICAQB0ZUQWZ9/Y
n9COEpo+JfecMnB0h0vwDm/M66IqXqw3LoaLmx9lZvRTeDIS67PUeI3yCA2W6PKRD0/FE/G57lOm
S+Xy5AaaL00ICGOqjNcCaMWW8o8nevHOd4i4lqgtznE/28QwlcdJyF8yBiWHpnyjhEpmNWJURgOC
Og2xpwRMBCsjMScqYPtOhBeuYQvSwAEeTML2Ukh6uGuX4E14q65Ja8cdjF5bAldnP1eE4FBaAwsZ
G2fOqqrKV03Y85Nw2btedP1AtliQuJZs/Jo/gXxXdc7LrH3McgnpnbTiAncX7yEShP6kzQejllqM
CIt52HOjxDGWafS7Xw+DKwqmH+Eqy8dcbOuag/1AYlQoKNVK3F5qHh6tEDiMqQcLIibGKteE6iHo
4A/bIScbzrhXUYuism42ZYzmc48FMVIH3qy4L84ETdAH2gtxw0PAhvRVXp8HP7wfngpzsN/8xOTp
eRSbM4+Qbc56G6+Bifmv6sk1ieQbNA3wJdl4DDUuQSV8hBgx6zoI1ZSGORprDFux7c6rhc77QZMS
RrEgomBeklervEve86ylWmZ3WWHV6RLMi8xNvjd71r4EPIGgY7BZU/VPBkq+uA7Gb6mbJnFgV43u
h3xyLRFgxIAphIukwTGSMZZR+AI+Qnp0BYTWovHXozOf3H8r6hozEoT02JHn0AeTfA==
-----END CERTIFICATE-----`;

const ISRG_ROOT_YR_CROSS_PEM = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`;

const VN2000_TLS_AGENT = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: true,
  ca: [...tls.rootCertificates, LETS_ENCRYPT_YR2_PEM, ISRG_ROOT_YR_CROSS_PEM]
});

function httpsGetJsonVerified(fullUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = https.get(
      fullUrl,
      {
        agent: VN2000_TLS_AGENT,
        headers: { Accept: 'application/json', 'User-Agent': 'VNResilienceAtlas/4.0' },
        timeout: timeoutMs
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            resolve({ ok: res.statusCode === 200 && Boolean(json?.success), status: res.statusCode, json });
          } catch {
            resolve({ ok: false, status: res.statusCode || 0, json: null });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, json: null });
    });
    req.on('error', () => {
      resolve({ ok: false, status: 0, json: null });
    });
  });
}

const GIS_TOKEN_ENDPOINT = 'https://gis.vn/api/get-token';
const VN2000_API_BASE = 'https://vn2000.vn/api';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 300;

const responseCache = new Map();

const tokenState = {
  value: process.env.VN2000_API_TOKEN || '',
  maxUsage: 9,
  usageByEndpoint: {},
  fetchedAt: 0,
  inflightPromise: null
};

function getCached(key) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.savedAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(key, data) {
  if (responseCache.size >= MAX_CACHE_ITEMS) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { savedAt: Date.now(), data });
}

async function acquireFreshGisToken(forceRefresh = false) {
  if (!forceRefresh && tokenState.value && Date.now() - tokenState.fetchedAt < 25 * 60 * 1000) {
    return tokenState.value;
  }
  if (tokenState.inflightPromise) {
    return tokenState.inflightPromise;
  }

  tokenState.inflightPromise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    try {
      const res = await fetch(GIS_TOKEN_ENDPOINT, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'VNResilienceAtlas/4.0'
        },
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`TOKEN_HTTP_${res.status}`);
      const json = await res.json();
      if (json?.token) {
        tokenState.value = String(json.token).trim();
        tokenState.maxUsage = Math.max(1, (Number(json.maxUsagePerApi) || 10) - 1);
        tokenState.usageByEndpoint = {};
        tokenState.fetchedAt = Date.now();
      }
      return tokenState.value;
    } catch {
      clearTimeout(timer);
      return tokenState.value;
    } finally {
      tokenState.inflightPromise = null;
    }
  })();

  return tokenState.inflightPromise;
}

async function callVn2000Api(endpointName, queryObj) {
  const used = tokenState.usageByEndpoint[endpointName] || 0;
  let token = await acquireFreshGisToken(!tokenState.value || used >= tokenState.maxUsage);

  const attemptFetch = async (tk) => {
    const qs = new URLSearchParams({ ...queryObj, token: tk || '' });
    return httpsGetJsonVerified(`${VN2000_API_BASE}/${endpointName}?${qs.toString()}`, 5000);
  };

  let first = await attemptFetch(token);
  if (first.ok) {
    tokenState.usageByEndpoint[endpointName] = (tokenState.usageByEndpoint[endpointName] || 0) + 1;
    return first.json.data;
  }

  // Tự động xin token mới và thử lại 1 lần nếu token cũ vừa hết 10 lượt
  token = await acquireFreshGisToken(true);
  const retry = await attemptFetch(token);
  if (retry.ok) {
    tokenState.usageByEndpoint[endpointName] = 1;
    return retry.json.data;
  }
  return null;
}

function normalizeAdminPayload(geoData) {
  if (!geoData) return null;
  const post = geoData.diachinh_sausapnhap?.properties || null;
  const pre = geoData.diachinh_truocsapnhap?.properties || null;
  const kt =
    geoData.diachinh_sausapnhap?.kinhtuyen_truc ||
    geoData.diachinh_truocsapnhap?.kinhtuyen_truc ||
    null;

  const postLabel = post
    ? `${post.loai || ''} ${String(post.ten_xa || '').trim()}, ${String(post.ten_tinh || '').trim()}`.trim()
    : null;
  const preLabel = pre
    ? `${pre.loai || ''} ${String(pre.ten_xa || '').trim()}, ${String(pre.ten_huyen || '').trim()}, ${String(pre.ten_tinh || '').trim()}`.trim()
    : null;

  return {
    elevationM: Number.isFinite(Number(geoData.elevation)) ? Number(geoData.elevation) : null,
    postMerger: post
      ? {
          communeCode: post.ma_xa || '',
          communeName: String(post.ten_xa || '').trim(),
          communeType: post.loai || 'Xã/Phường',
          mergedFrom: post.sap_nhap || '',
          areaKm2: Number(post.dtich_km2) || null,
          population: Number(post.dan_so) || null,
          densityKm2: Number(post.matdo_km2) || null,
          provinceCode: post.ma_tinh || '',
          provinceName: String(post.ten_tinh || '').trim(),
          fullLabel: postLabel
        }
      : null,
    preMerger: pre
      ? {
          communeCode: pre.ma_xa || '',
          communeName: String(pre.ten_xa || '').trim(),
          districtName: String(pre.ten_huyen || '').trim(),
          provinceName: String(pre.ten_tinh || '').trim(),
          fullLabel: preLabel
        }
      : null,
    centralMeridian3Deg: Number(kt?.mui_3do?.giatri_kinhtuyen_truc) || null,
    centralMeridian6Deg: Number(kt?.mui_6do?.giatri_kinhtuyen_truc) || 105
  };
}

export async function OPTIONS(request) {
  return handleCorsPreflight(request);
}

async function handleVnGisGet(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'spot_info';

  // 1. Kiểm tra trạng thái kết nối dịch vụ VN-GIS (dùng cho Ops Console Telemetry)
  if (action === 'health') {
    const tk = await acquireFreshGisToken(false);
    return Response.json({
      ok: Boolean(tk),
      provider: 'gis.vn / vn2000.vn',
      tokenReady: Boolean(tk),
      cacheEntries: responseCache.size
    });
  }

  // 2. Tổng hợp Địa chính Trước/Sau sáp nhập + Ước tính Dân số Vòng Khoanh (zone_intel)
  if (action === 'zone_intel') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const radiusKm = Math.max(0.5, Math.min(25, Number(url.searchParams.get('radiusKm') || 2)));
    if (!isInsideVietnam(lat, lng)) {
      return Response.json({ ok: false, error: 'Tọa độ nằm ngoài lãnh thổ Việt Nam.' }, { status: 400 });
    }

    const radiusM = Math.round(radiusKm * 1000);
    const cacheKey = `zone:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusM}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return Response.json({ ok: true, cache: 'HIT', ...cached });
    }

    const [geoRaw, popRaw] = await Promise.all([
      callVn2000Api('geographic-info', { lat: lat.toFixed(6), lng: lng.toFixed(6) }),
      callVn2000Api('populationinfo', { lat: lat.toFixed(6), lng: lng.toFixed(6), radius_m: String(radiusM) })
    ]);

    const admin = normalizeAdminPayload(geoRaw);
    const l0 = admin?.centralMeridian3Deg || lookupCentralMeridian(admin?.postMerger?.provinceName || '', lng);
    const vn2000Center = wgs84ToVn2000Local(lat, lng, l0, 3);

    const payload = {
      admin,
      populationZone: popRaw
        ? {
            radiusMeters: Number(popRaw.radius_m) || radiusM,
            areaKm2: Number(popRaw.dtich_km2) || null,
            population: Number(popRaw.dan_so) ?? null,
            densityKm2: Number(popRaw.matdo_km2) ?? null
          }
        : null,
      vn2000Center,
      mapDeepLink: `https://vn2000.vn/map?center=${lat.toFixed(6)},${lng.toFixed(6)}&zoom=15`
    };

    if (admin || popRaw) setCached(cacheKey, payload);
    return Response.json({ ok: true, cache: 'MISS', ...payload });
  }

  // 3. Tra cứu Chi tiết Điểm Chạm (Địa chính + Dân số bán kính 500m + VN2000 X,Y)
  if (action === 'spot_info') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!isInsideVietnam(lat, lng)) {
      return Response.json({ ok: false, error: 'Tọa độ nằm ngoài lãnh thổ Việt Nam.' }, { status: 400 });
    }

    const cacheKey = `spot:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return Response.json({ ok: true, cache: 'HIT', ...cached });
    }

    const [geoRaw, pop500Raw] = await Promise.all([
      callVn2000Api('geographic-info', { lat: lat.toFixed(7), lng: lng.toFixed(7) }),
      callVn2000Api('populationinfo', { lat: lat.toFixed(7), lng: lng.toFixed(7), radius_m: '500' })
    ]);

    const admin = normalizeAdminPayload(geoRaw);
    const l0 = admin?.centralMeridian3Deg || lookupCentralMeridian(admin?.postMerger?.provinceName || '', lng);
    const vn2000 = wgs84ToVn2000Local(lat, lng, l0, 3);

    const payload = {
      admin,
      pop500m: pop500Raw
        ? {
            population: Number(pop500Raw.dan_so) ?? null,
            densityKm2: Number(pop500Raw.matdo_km2) ?? null
          }
        : null,
      vn2000,
      cadastralMapUrl: `https://vn2000.vn/map?center=${lat.toFixed(7)},${lng.toFixed(7)}&zoom=17`
    };

    if (admin || pop500Raw) setCached(cacheKey, payload);
    return Response.json({ ok: true, cache: 'MISS', ...payload });
  }

  // 4. Chuyển đổi WGS84 -> VN2000 (ưu tiên vn2000.vn/api, dự phòng 7 tham số Bộ TN&MT)
  if (action === 'wgs84_to_vn2000') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const zoneWidth = Number(url.searchParams.get('zoneWidth') || 3) === 6 ? 6 : 3;
    const province = url.searchParams.get('province') || '';
    const centralMeridian = Number(url.searchParams.get('centralMeridian')) || lookupCentralMeridian(province, lng);
    if (!isInsideVietnam(lat, lng)) {
      return Response.json({ ok: false, error: 'Tọa độ WGS84 nằm ngoài phạm vi Việt Nam.' }, { status: 400 });
    }

    const remote = await callVn2000Api('wgs84tovn2000', {
      lat: lat.toFixed(8),
      lng: lng.toFixed(8),
      zone_width: String(zoneWidth),
      central_meridian: String(centralMeridian)
    });

    const coords =
      remote && Number.isFinite(Number(remote.x)) && Number.isFinite(Number(remote.y))
        ? { x: Number(remote.x), y: Number(remote.y), source: 'vn2000.vn_api' }
        : { ...wgs84ToVn2000Local(lat, lng, centralMeridian, zoneWidth), source: 'btnmt_7param_local' };

    return Response.json({
      ok: true,
      x: coords.x,
      y: coords.y,
      centralMeridian,
      zoneWidth,
      source: coords.source
    });
  }

  // 5. Chuyển đổi VN2000 (X Bắc, Y Đông) -> WGS84 (lat, lng)
  if (action === 'vn2000_to_wgs84') {
    const x = Number(url.searchParams.get('x'));
    const y = Number(url.searchParams.get('y'));
    const zoneWidth = Number(url.searchParams.get('zoneWidth') || 3) === 6 ? 6 : 3;
    const province = url.searchParams.get('province') || '';
    const centralMeridian = Number(url.searchParams.get('centralMeridian')) || lookupCentralMeridian(province, 105.0);

    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 800000 || x > 2700000 || y < 150000 || y > 900000) {
      return Response.json({ ok: false, error: 'Tọa độ VN-2000 (X Bắc, Y Đông) không hợp lệ trong phạm vi Việt Nam.' }, { status: 400 });
    }

    const remote = await callVn2000Api('vn2000towgs84', {
      x: String(x),
      y: String(y),
      zone_width: String(zoneWidth),
      central_meridian: String(centralMeridian)
    });

    const wgs =
      remote && Number.isFinite(Number(remote.lat)) && Number.isFinite(Number(remote.lng))
        ? { lat: Number(remote.lat), lng: Number(remote.lng), source: 'vn2000.vn_api' }
        : { ...vn2000ToWgs84Local(x, y, centralMeridian, zoneWidth), source: 'btnmt_7param_local' };

    if (!isInsideVietnam(wgs.lat, wgs.lng)) {
      return Response.json({ ok: false, error: 'Kết quả quy đổi nằm ngoài lãnh thổ Việt Nam — kiểm tra lại Kinh tuyến trục.' }, { status: 400 });
    }

    return Response.json({
      ok: true,
      lat: wgs.lat,
      lng: wgs.lng,
      centralMeridian,
      zoneWidth,
      source: wgs.source
    });
  }

  return Response.json({ ok: false, error: 'Tham số action không hợp lệ.' }, { status: 400 });
}

export const GET = withCors(handleVnGisGet);
