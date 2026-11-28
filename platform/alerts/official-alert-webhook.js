/**
 * ĐỒNG BỘ NGUỒN CHÍNH THỐNG ĐA LƯU VỰC (OPEN-METEO · COPERNICUS GLOFAS · GDACS)
 * & WEBHOOK ĐỐI TÁC KÝ SỐ HMAC-SHA256 CHỐNG SSRF (P5.2)
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put, get } from '@vercel/blob';
import { readEdgeAiCache, writeEdgeAiCache } from '../security/edge-guard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_WEBHOOKS_FILE = path.resolve(__dirname, '..', '..', '.local-data', 'partner-webhooks.json');
const WEBHOOKS_BLOB_PATH = 'config/partner-webhooks.enc.json';

export const NATIONAL_BASIN_STATIONS = Object.freeze([
  { id: 'song-hong', basinName: 'Lưu vực Sông Hồng', province: 'TP. Hà Nội', lat: 21.0285, lng: 105.8542, macroRegion: 'bac' },
  { id: 'lao-cai-thao', basinName: 'Thượng nguồn Sông Thao (Miền núi Bắc Bộ)', province: 'Lào Cai', lat: 22.4856, lng: 103.9707, macroRegion: 'bac' },
  { id: 'song-huong', basinName: 'Lưu vực Sông Hương', province: 'TP. Huế', lat: 16.4637, lng: 107.5909, macroRegion: 'trung' },
  { id: 'song-han', basinName: 'Lưu vực Sông Hàn – Vu Gia', province: 'TP. Đà Nẵng', lat: 16.0544, lng: 108.2022, macroRegion: 'trung' },
  { id: 'tay-nguyen-ba', basinName: 'Lưu vực Sông Ba (Tây Nguyên)', province: 'Gia Lai', lat: 13.9833, lng: 108.0, macroRegion: 'tay-nguyen' },
  { id: 'sai-gon-dong-nai', basinName: 'Hạ lưu Sông Sài Gòn – Đồng Nai', province: 'TP. Hồ Chí Minh', lat: 10.7769, lng: 106.7009, macroRegion: 'nam' },
  { id: 'cuu-long-hau', basinName: 'Châu thổ Cửu Long (Sông Hậu)', province: 'TP. Cần Thơ', lat: 10.0452, lng: 105.7469, macroRegion: 'dbscl' }
]);

const SEVERITY_LABELS = Object.freeze({
  emergency: 'Khẩn cấp (Cấp Đỏ)',
  warning: 'Cảnh báo (Cấp Cam)',
  watch: 'Theo dõi (Cấp Vàng)',
  normal: 'Bình thường'
});

export function classifyBasinAlert({ rainNowMm = 0, rain24hMm = 0, windGustKmh = 0, dischargeRatio = 1 }) {
  const rn = Number(rainNowMm) || 0;
  const r24 = Number(rain24hMm) || 0;
  const wg = Number(windGustKmh) || 0;
  const dr = Number(dischargeRatio) || 1;

  if (r24 >= 100 || rn >= 30 || dr >= 2.2 || wg >= 88) {
    return { level: 'emergency', label: SEVERITY_LABELS.emergency };
  }
  if (r24 >= 50 || rn >= 15 || dr >= 1.5 || wg >= 62) {
    return { level: 'warning', label: SEVERITY_LABELS.warning };
  }
  if (r24 >= 20 || rn >= 5 || dr >= 1.2) {
    return { level: 'watch', label: SEVERITY_LABELS.watch };
  }
  return { level: 'normal', label: SEVERITY_LABELS.normal };
}

function isPrivateOrBlockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase().trim();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) {
    return true;
  }
  if (h.includes(':') || h.startsWith('[')) return true; // Chặn IPv6 literal

  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function validateSafeWebhookUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return { valid: false, reason: 'URL Webhook không đúng định dạng.' };
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Webhook bắt buộc dùng giao thức HTTPS bảo mật.' };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Không cho phép chèn user:pass trực tiếp vào URL Webhook.' };
  }
  if (isPrivateOrBlockedHostname(parsed.hostname)) {
    return { valid: false, reason: 'Từ chối URL nội bộ/loopback (bảo vệ chống SSRF).' };
  }
  return { valid: true, normalizedUrl: parsed.toString(), hostname: parsed.hostname };
}

function maskWebhookUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'api.telegram.org') {
      u.pathname = u.pathname.replace(/\/bot[^/]+/i, '/bot***REDACTED***');
      return u.toString();
    }
    if (u.hostname.includes('discord.com') || u.hostname.includes('hooks.slack.com')) {
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs.length >= 2) {
        return `${u.origin}/${segs.slice(0, 2).join('/')}/***REDACTED***`;
      }
    }
    return `${u.origin}${u.pathname}`;
  } catch {
    return '***REDACTED***';
  }
}

function deriveWebhookEncKey() {
  const base =
    process.env.VAULT_ENCRYPTION_KEY?.trim() ||
    process.env.ADMIN_TOKEN_SECRET?.trim() ||
    process.env.ADMIN_PASSCODE?.trim() ||
    'local-dev-webhook-key';
  return crypto.createHash('sha256').update(`webhook-vault:${base}`).digest();
}

function encryptWebhookPayload(data) {
  const key = deriveWebhookEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: enc.toString('hex'),
    updatedAt: new Date().toISOString()
  };
}

function decryptWebhookPayload(encObj, fallbackVal = []) {
  if (!encObj?.iv || !encObj?.tag || !encObj?.data) return fallbackVal;
  try {
    const key = deriveWebhookEncKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encObj.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encObj.tag, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encObj.data, 'hex')), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch {
    return fallbackVal;
  }
}

let webhookWriteChain = Promise.resolve();

async function readRawWebhooks() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const res = await get(WEBHOOKS_BLOB_PATH, { access: 'private', useCache: false });
      if (res && res.statusCode === 200 && res.stream) {
        const enc = await new Response(res.stream).json();
        return Array.isArray(decryptWebhookPayload(enc, [])) ? decryptWebhookPayload(enc, []) : [];
      }
    } catch {
      return [];
    }
    return [];
  }
  try {
    const enc = JSON.parse(await fs.readFile(LOCAL_WEBHOOKS_FILE, 'utf8'));
    return Array.isArray(enc) ? enc : decryptWebhookPayload(enc, []);
  } catch {
    return [];
  }
}

async function writeRawWebhooks(list) {
  const safeList = (Array.isArray(list) ? list : []).slice(0, 40);
  const enc = encryptWebhookPayload(safeList);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(WEBHOOKS_BLOB_PATH, JSON.stringify(enc), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return;
  }
  const next = webhookWriteChain.then(async () => {
    await fs.mkdir(path.dirname(LOCAL_WEBHOOKS_FILE), { recursive: true });
    await fs.writeFile(LOCAL_WEBHOOKS_FILE, JSON.stringify(enc, null, 2), 'utf8');
  });
  webhookWriteChain = next.catch(() => {});
  await next;
}

export async function listPartnerWebhooks() {
  const list = await readRawWebhooks();
  return list.map((w) => ({
    id: w.id,
    name: w.name,
    channelType: w.channelType,
    maskedUrl: maskWebhookUrl(w.url),
    provinceFilter: w.provinceFilter || 'ALL',
    hasSecret: Boolean(w.secret),
    createdAt: w.createdAt,
    lastStatus: w.lastStatus || null
  }));
}

function detectChannelType(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === 'api.telegram.org') return 'telegram';
    if (u.hostname.includes('discord.com') || u.hostname.includes('hooks.slack.com')) return 'chat_webhook';
  } catch {
    // ignore
  }
  return 'json_hmac';
}

export async function addPartnerWebhook({ name, url, provinceFilter = 'ALL', secret = '' }) {
  const chk = validateSafeWebhookUrl(url);
  if (!chk.valid) {
    throw new Error(chk.reason);
  }
  const cleanName = String(name || 'Kênh Cảnh báo Địa phương').replace(/[<>]/g, '').trim().slice(0, 80);
  if (cleanName.length < 2) {
    throw new Error('Tên kênh Webhook quá ngắn.');
  }
  const list = await readRawWebhooks();
  const entry = {
    id: `WH-${Date.now().toString(36).toUpperCase()}`,
    name: cleanName,
    url: chk.normalizedUrl,
    channelType: detectChannelType(chk.normalizedUrl),
    provinceFilter: String(provinceFilter || 'ALL').trim().slice(0, 60),
    secret: String(secret || '').trim().slice(0, 128),
    createdAt: new Date().toISOString(),
    lastStatus: null
  };
  list.unshift(entry);
  await writeRawWebhooks(list);
  return {
    id: entry.id,
    name: entry.name,
    channelType: entry.channelType,
    maskedUrl: maskWebhookUrl(entry.url),
    provinceFilter: entry.provinceFilter,
    hasSecret: Boolean(entry.secret),
    createdAt: entry.createdAt
  };
}

export async function deletePartnerWebhook(id) {
  const list = await readRawWebhooks();
  const next = list.filter((w) => w.id !== String(id || ''));
  if (next.length === list.length) return false;
  await writeRawWebhooks(next);
  return true;
}

async function sendSingleWebhook(wh, eventPayload) {
  const chk = validateSafeWebhookUrl(wh.url);
  if (!chk.valid) {
    return { id: wh.id, ok: false, status: 0, error: chk.reason };
  }

  const safeBodyObj = {
    platform: 'VN Resilience Atlas',
    event: String(eventPayload.event || 'alert'),
    severity: String(eventPayload.severity || 'warning'),
    province: String(eventPayload.province || 'Việt Nam'),
    areaHint: String(eventPayload.areaHint || 'Khu vực cảnh báo'),
    categoryLabel: String(eventPayload.categoryLabel || ''),
    waterDepthM: eventPayload.waterDepthM ?? null,
    message: String(eventPayload.message || '').slice(0, 400),
    mapUrl: 'https://bando-antoan-vn.vercel.app',
    sentAt: new Date().toISOString()
  };

  let targetUrl = chk.normalizedUrl;
  let postBody = JSON.stringify(safeBodyObj);
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };

  const textMsg = `[VN Resilience Atlas · ${safeBodyObj.severity.toUpperCase()}] (${safeBodyObj.province}) ${safeBodyObj.message} — Khu vực: ${safeBodyObj.areaHint} · Bản đồ: ${safeBodyObj.mapUrl}`;

  if (wh.channelType === 'telegram') {
    const u = new URL(chk.normalizedUrl);
    const chatId = u.searchParams.get('chat_id') || '';
    u.searchParams.delete('chat_id');
    targetUrl = u.toString();
    postBody = JSON.stringify({ chat_id: chatId || undefined, text: textMsg });
  } else if (wh.channelType === 'chat_webhook') {
    postBody = JSON.stringify({ content: textMsg, text: textMsg });
  } else {
    const sigKey = wh.secret || 'vn-resilience-public-hmac';
    const sigHex = crypto.createHmac('sha256', sigKey).update(postBody).digest('hex');
    headers['X-VN-Resilience-Signature'] = `sha256=${sigHex}`;
    headers['X-VN-Resilience-Event'] = safeBodyObj.event;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: postBody,
      redirect: 'error',
      signal: ctrl.signal
    });
    return { id: wh.id, ok: res.ok, status: res.status };
  } catch (err) {
    return { id: wh.id, ok: false, status: 0, error: String(err?.message || 'FETCH_ERROR') };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchPartnerWebhooks(eventPayload, { onlyWebhookId = '' } = {}) {
  const list = await readRawWebhooks();
  const prov = String(eventPayload?.province || '').toLowerCase();
  const targets = list.filter((w) => {
    if (onlyWebhookId) return w.id === onlyWebhookId;
    if (!w.provinceFilter || w.provinceFilter === 'ALL') return true;
    return prov.includes(w.provinceFilter.toLowerCase());
  });

  if (targets.length === 0) return { attempted: 0, delivered: 0, results: [] };

  const results = await Promise.all(targets.map((w) => sendSingleWebhook(w, eventPayload)));
  const delivered = results.filter((r) => r.ok).length;
  return { attempted: targets.length, delivered, results };
}

async function fetchWithTimeout(url, timeoutMs = 2800) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncOfficialHydroMetFeed({ forceRefresh = false } = {}) {
  const cacheKey = 'official-hydromet-v1';
  if (!forceRefresh) {
    const hit = await readEdgeAiCache(cacheKey);
    if (hit?.basins && Array.isArray(hit.basins)) {
      return { ...hit, cache: 'EDGE_KV_HIT' };
    }
  }

  const lats = NATIONAL_BASIN_STATIONS.map((s) => s.lat).join(',');
  const lngs = NATIONAL_BASIN_STATIONS.map((s) => s.lng).join(',');

  const [wxData, floodData, gdacsData] = await Promise.all([
    fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=precipitation,rain,wind_gusts_10m,temperature_2m&daily=precipitation_sum&timezone=Asia%2FBangkok&forecast_days=2`,
      2800
    ),
    fetchWithTimeout(
      `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lngs}&daily=river_discharge,river_discharge_mean&forecast_days=3`,
      2800
    ),
    fetchWithTimeout('https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP', 2800)
  ]);

  const wxArr = Array.isArray(wxData) ? wxData : wxData ? [wxData] : [];
  const flArr = Array.isArray(floodData) ? floodData : floodData ? [floodData] : [];

  const basins = NATIONAL_BASIN_STATIONS.map((st, idx) => {
    const wx = wxArr[idx] || {};
    const fl = flArr[idx] || {};
    const rainNowMm = Math.round((Number(wx.current?.rain ?? wx.current?.precipitation) || 0) * 10) / 10;
    const rain24hMm = Math.round((Number(wx.daily?.precipitation_sum?.[0]) || 0) * 10) / 10;
    const windGustKmh = Math.round(Number(wx.current?.wind_gusts_10m) || 0);
    const tempC = wx.current?.temperature_2m != null ? Math.round(Number(wx.current.temperature_2m) * 10) / 10 : null;

    const riverDischargeMs =
      fl.daily?.river_discharge?.[0] != null ? Math.round(Number(fl.daily.river_discharge[0]) * 10) / 10 : null;
    const riverMeanMs =
      fl.daily?.river_discharge_mean?.[0] != null && Number(fl.daily.river_discharge_mean[0]) > 0
        ? Number(fl.daily.river_discharge_mean[0])
        : null;
    const rawDischargeRatio =
      riverDischargeMs != null && riverMeanMs != null ? Math.round((riverDischargeMs / riverMeanMs) * 100) / 100 : 1;
    // Tránh nhiễu pixel GloFAS trên kênh nhỏ (< 5 m³/s) khi trời tạnh không mưa
    const dischargeRatio =
      riverDischargeMs != null && riverDischargeMs < 5 && (riverMeanMs == null || riverMeanMs < 5) && rain24hMm < 10 && rainNowMm < 2
        ? 1
        : rawDischargeRatio;

    const alert = classifyBasinAlert({ rainNowMm, rain24hMm, windGustKmh, dischargeRatio });
    const reasonParts = [];
    if (rain24hMm >= 50) reasonParts.push(`Mưa 24h đạt ${rain24hMm} mm`);
    else if (rain24hMm >= 20) reasonParts.push(`Mưa 24h ${rain24hMm} mm`);
    if (rainNowMm >= 5) reasonParts.push(`Đang mưa ${rainNowMm} mm/h`);
    if (windGustKmh >= 62) reasonParts.push(`Gió giật ${windGustKmh} km/h`);
    if (dischargeRatio >= 1.2) reasonParts.push(`Lưu lượng gấp ${dischargeRatio}× TB 7 ngày`);

    return {
      ...st,
      rainNowMm,
      rain24hMm,
      windGustKmh,
      tempC,
      riverDischargeMs,
      dischargeRatio,
      alertLevel: alert.level,
      alertLabel: alert.label,
      alertReason: reasonParts.join(' · ') || 'Thời tiết và lưu lượng sông trong ngưỡng ổn định'
    };
  });

  const features = Array.isArray(gdacsData?.features) ? gdacsData.features : [];
  const gdacsAlerts = features
    .filter((f) => {
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return false;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 25 && lng >= 100 && lng <= 120;
    })
    .slice(0, 6)
    .map((f) => ({
      id: String(f?.properties?.eventid || f?.id || 'GDACS'),
      eventType: String(f?.properties?.eventtype || 'ALERT'),
      alertLevel: String(f?.properties?.alertlevel || 'Orange'),
      name: String(f?.properties?.name || f?.properties?.htmldescription || 'Cảnh báo thiên tai khu vực Biển Đông'),
      lat: Number(f.geometry.coordinates[1]),
      lng: Number(f.geometry.coordinates[0]),
      fromDate: f?.properties?.fromdate || null
    }));

  const warningBasinsCount = basins.filter((b) => b.alertLevel === 'emergency' || b.alertLevel === 'warning').length;
  const watchBasinsCount = basins.filter((b) => b.alertLevel === 'watch').length;
  const activeWarningsCount = warningBasinsCount + gdacsAlerts.length;

  const payload = {
    ok: true,
    syncedAt: new Date().toISOString(),
    sourceSummary: ['Open-Meteo Weather', 'Copernicus GloFAS Flood', 'GDACS UN/EC'],
    basins,
    gdacsAlerts,
    warningBasinsCount,
    watchBasinsCount,
    activeWarningsCount,
    cache: 'MISS'
  };

  await writeEdgeAiCache(cacheKey, payload, 900);
  return payload;
}
