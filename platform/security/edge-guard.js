/**
 * EDGE GUARD — DISTRIBUTED RATE LIMITING & CLOUDFLARE TURNSTILE ANTI-BOT VERIFICATION
 * Ưu tiên lần lượt:
 *   1. Rate Limit: Upstash Redis REST -> Cloudflare Worker KV Edge (/rate-limit/check) -> RAM Bounded Limiter
 *   2. Turnstile: TURNSTILE_SECRET_KEY trực tiếp -> Cloudflare Worker Edge (/turnstile/verify) -> Skip an toàn ở local test
 */

let cachedEdgeConfig = { fetchedAt: 0, turnstileEnabled: false, turnstileSiteKey: '' };

function getCfEdgeConfig() {
  const url = String(process.env.CF_EDGE_API_URL || '').replace(/\/+$/, '');
  const token = String(process.env.CF_EDGE_AUTH_TOKEN || '').trim();
  return { url, token };
}

/**
 * Lấy cấu hình bảo mật công khai (Site Key Turnstile) từ Cloudflare Edge Worker (cache 2 phút).
 */
export async function fetchEdgeSecurityConfig() {
  const now = Date.now();
  if (now - cachedEdgeConfig.fetchedAt < 120_000 && cachedEdgeConfig.fetchedAt > 0) {
    return cachedEdgeConfig;
  }
  const directSiteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
  if (directSiteKey && process.env.TURNSTILE_SECRET_KEY) {
    cachedEdgeConfig = { fetchedAt: now, turnstileEnabled: true, turnstileSiteKey: directSiteKey };
    return cachedEdgeConfig;
  }
  const { url } = getCfEdgeConfig();
  if (!url) {
    return { fetchedAt: now, turnstileEnabled: false, turnstileSiteKey: '' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1800);
  try {
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    if (res.ok) {
      const j = await res.json();
      cachedEdgeConfig = {
        fetchedAt: now,
        turnstileEnabled: Boolean(j?.turnstileEnabled && j?.turnstileSiteKey),
        turnstileSiteKey: String(j?.turnstileSiteKey || '')
      };
      return cachedEdgeConfig;
    }
  } catch {
    // fallback graceful
  } finally {
    clearTimeout(timer);
  }
  return cachedEdgeConfig;
}

/**
 * Kiểm tra giới hạn tần suất phân tán toàn cục (Upstash Redis -> Cloudflare KV Edge -> RAM fallback).
 */
export async function checkDistributedRateLimit({ key, maxRequests = 10, windowMs = 60_000, fallbackLimiter }) {
  const upUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const upToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

  if (upUrl && upToken) {
    const bucket = Math.floor(Date.now() / windowMs);
    const redisKey = `vnr:rl:${key}:${bucket}`;
    const ttlSec = Math.max(60, Math.ceil(windowMs / 1000) + 5);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1600);
    try {
      const res = await fetch(`${upUrl}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${upToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, ttlSec, 'NX']
        ]),
        signal: ctrl.signal
      });
      if (res.ok) {
        const arr = await res.json();
        const count = Number(arr?.[0]?.result || 1);
        return {
          allowed: count <= maxRequests,
          remaining: Math.max(0, maxRequests - count),
          backend: 'upstash_redis'
        };
      }
    } catch {
      // fallback below
    } finally {
      clearTimeout(timer);
    }
  }

  const { url, token } = getCfEdgeConfig();
  if (url && token) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1600);
    try {
      const res = await fetch(`${url}/rate-limit/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, maxRequests, windowMs }),
        signal: ctrl.signal
      });
      if (res.ok) {
        const j = await res.json();
        if (typeof j?.allowed === 'boolean') {
          return { allowed: j.allowed, remaining: j.remaining ?? 0, backend: 'cloudflare_kv_edge' };
        }
      }
    } catch {
      // fallback below
    } finally {
      clearTimeout(timer);
    }
  }

  if (fallbackLimiter && typeof fallbackLimiter.check === 'function') {
    return { ...fallbackLimiter.check(key), backend: 'local_memory' };
  }
  return { allowed: true, remaining: maxRequests, backend: 'noop' };
}

/**
 * Xác thực Cloudflare Turnstile token qua Worker Secret hoặc Direct Env Secret.
 */
export async function verifyTurnstileChallenge({ token = '', remoteIp = '', requireInProd = true } = {}) {
  const cleanTok = String(token || '').trim();
  const isProd = process.env.VERCEL_ENV === 'production';
  const directSecret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();

  if (directSecret) {
    if (!cleanTok) {
      if (!isProd && !requireInProd) return { verified: true, skipped: true };
      return { verified: false, reason: 'Thiếu mã xác minh chống bot Cloudflare Turnstile.' };
    }
    const form = new FormData();
    form.append('secret', directSecret);
    form.append('response', cleanTok);
    if (remoteIp) form.append('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({ success: false }));
    return data.success
      ? { verified: true }
      : { verified: false, reason: 'Xác minh chống bot không hợp lệ hoặc đã hết hạn.' };
  }

  const cfg = await fetchEdgeSecurityConfig();
  if (!cfg.turnstileEnabled) {
    return { verified: true, skipped: true };
  }

  const { url, token: edgeTok } = getCfEdgeConfig();
  if (!cleanTok) {
    if (!isProd || !requireInProd) {
      return { verified: true, skipped: true };
    }
    return { verified: false, reason: 'Vui lòng hoàn thành xác minh bảo mật trước khi gửi.' };
  }
  if (!url || !edgeTok) {
    return { verified: true, skipped: true };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${url}/turnstile/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${edgeTok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cleanTok, remoteip: remoteIp }),
      signal: ctrl.signal
    });
    const j = await res.json().catch(() => ({ success: false }));
    return j?.success
      ? { verified: true }
      : { verified: false, reason: 'Xác minh chống bot không hợp lệ hoặc đã hết hạn.' };
  } catch {
    return { verified: !isProd, reason: 'Không kết nối được dịch vụ xác minh Turnstile.' };
  } finally {
    clearTimeout(timer);
  }
}
