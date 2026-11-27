/**
 * OPEN RESILIENCE INTELLIGENCE PLATFORM — SECURITY VALIDATORS & BOUNDED RATE LIMITER
 * Vá SEC-04 (rate limit có trần bộ nhớ), SEC-06 (kiểm tra magic bytes nhị phân ảnh), SEC-07 (path traversal).
 */

import path from 'node:path';

export function cleanText(val, maxLen = 500) {
  return String(val ?? '')
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLen);
}

export function hasSpamContent(str) {
  const lower = String(str ?? '').toLowerCase();
  return /(https?:\/\/|www\.|telegram\.me|t\.me\/|casino|bet88|vay tiền|tín dụng đen)/i.test(lower);
}

const IMAGE_SIGNATURES = Object.freeze({
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  'image/webp': (buf) =>
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
});

/**
 * Xác thực chuỗi Data URL ảnh bằng kiểm tra chữ ký nhị phân (magic bytes), không chỉ tin tiền tố MIME.
 */
export function validateImageDataUrl(
  dataUrl,
  { maxDataUrlLength = 68000, allowedMimes = ['image/jpeg'] } = {}
) {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    return { valid: false, reason: 'Thiếu dữ liệu ảnh.' };
  }
  if (dataUrl.length > maxDataUrlLength) {
    return { valid: false, reason: `Ảnh vượt quá giới hạn dung lượng (${maxDataUrlLength} ký tự base64).` };
  }
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return { valid: false, reason: 'Định dạng Data URL ảnh không hợp lệ.' };
  }
  const [, mimeType, base64Body] = match;
  if (!allowedMimes.includes(mimeType)) {
    return { valid: false, reason: `Định dạng ${mimeType} không được phép (chỉ chấp nhận: ${allowedMimes.join(', ')}).` };
  }
  try {
    // Chỉ cần giải mã đầu tệp để kiểm tra magic bytes nhanh & an toàn
    const headBase64 = base64Body.slice(0, 32);
    const buf = Buffer.from(headBase64, 'base64');
    const checker = IMAGE_SIGNATURES[mimeType];
    if (!checker || !checker(buf)) {
      return { valid: false, reason: `Chữ ký nhị phân (magic bytes) không khớp với định dạng ${mimeType}.` };
    }
    return { valid: true, mimeType, approxBytes: Math.floor((base64Body.length * 3) / 4) };
  } catch {
    return { valid: false, reason: 'Không thể giải mã nội dung base64 của ảnh.' };
  }
}

/**
 * Kiểm tra đường dẫn tệp tĩnh nằm chặt trong thư mục gốc (vá lỗi ranh giới prefix thiếu path.sep — SEC-07).
 */
export function isSafeSubpath(baseDir, candidatePath) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedCandidate = path.resolve(candidatePath);
  if (normalizedCandidate === normalizedBase) return true;
  const prefix = normalizedBase.endsWith(path.sep) ? normalizedBase : `${normalizedBase}${path.sep}`;
  return normalizedCandidate.startsWith(prefix);
}

/**
 * Bộ giới hạn tốc độ cửa sổ trượt có trần kích thước bộ nhớ (tránh rò rỉ RAM trên warm instance).
 * Thiết kế interface tương thích để thay thế bằng Upstash Redis ở Milestone 2.
 */
export function createBoundedRateLimiter({
  maxRequests = 15,
  windowMs = 60_000,
  maxEntries = 2000
} = {}) {
  const buckets = new Map();

  function evictExpired(now) {
    if (buckets.size < maxEntries) return;
    for (const [k, rec] of buckets.entries()) {
      if (now > rec.resetAt) buckets.delete(k);
    }
    while (buckets.size >= maxEntries) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }

  return {
    check(key, now = Date.now()) {
      const bucketKey = String(key || 'anon').slice(0, 128);
      evictExpired(now);
      const current = buckets.get(bucketKey);
      if (!current || now > current.resetAt) {
        const next = { count: 1, resetAt: now + windowMs };
        buckets.set(bucketKey, next);
        return { allowed: true, remaining: Math.max(0, maxRequests - 1), resetAt: next.resetAt };
      }
      current.count += 1;
      const allowed = current.count <= maxRequests;
      return {
        allowed,
        remaining: Math.max(0, maxRequests - current.count),
        resetAt: current.resetAt
      };
    },
    size() {
      return buckets.size;
    },
    reset() {
      buckets.clear();
    }
  };
}
