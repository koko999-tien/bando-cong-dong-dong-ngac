/**
 * CORS Bảo mật cho Web Quản trị & Kỹ thuật Độc lập (VN Resilience Ops Console)
 * Chỉ cấp phép tường minh các Origin được ủy quyền (không dùng '*' cho các request mang Bearer Token).
 */

const EXACT_ALLOWED_ORIGINS = new Set([
  'https://vn-resilience-ops.vercel.app',
  'https://bando-cong-dong-dong-ngac.vercel.app'
]);

const REGEX_ALLOWED_ORIGINS = [
  /^https:\/\/vn-resilience-ops-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/bando-cong-dong-dong-ngac-[a-z0-9-]+\.vercel\.app$/i,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i
];

export function isAllowedOpsOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  const clean = origin.trim().replace(/\/$/, '');
  if (EXACT_ALLOWED_ORIGINS.has(clean)) return true;
  if (process.env.OPS_CONSOLE_ORIGIN && clean === process.env.OPS_CONSOLE_ORIGIN.trim().replace(/\/$/, '')) {
    return true;
  }
  return REGEX_ALLOWED_ORIGINS.some((re) => re.test(clean));
}

export function buildCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '';
  if (!isAllowedOpsOrigin(origin)) {
    return { Vary: 'Origin' };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

export function handleCorsPreflight(request) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request)
  });
}

export function withCors(handler) {
  return async function corsWrappedHandler(request, ...rest) {
    if (request?.method === 'OPTIONS') {
      return handleCorsPreflight(request);
    }
    const response = await handler(request, ...rest);
    const corsHeaders = buildCorsHeaders(request);
    const mergedHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      mergedHeaders.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: mergedHeaders
    });
  };
}
