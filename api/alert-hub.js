/**
 * OFFICIAL ALERT & PARTNER WEBHOOK HUB API (/api/alert-hub)
 * - GET ?action=health: Trạng thái giám sát 7 lưu vực + Web Push VAPID + số lượng Webhook
 * - GET ?action=live_bulletins: Đồng bộ khí tượng - thủy văn 7 lưu vực quốc gia & GDACS (cache KV 15p)
 * - GET ?action=admin_webhooks: Danh sách Webhook đã che token nhạy cảm (Bearer Admin)
 * - POST (Bearer Admin): admin_add_webhook, admin_delete_webhook, admin_test_webhook
 */

import { buildCorsHeaders, handleCorsPreflight } from '../platform/security/cors.js';
import { verifyAdminBearer } from '../platform/storage/national-store.js';
import { checkDistributedRateLimit } from '../platform/security/edge-guard.js';
import { createBoundedRateLimiter } from '../platform/security/validators.js';
import { getOrCreateVapidKeys, getPushStats } from '../platform/alerts/web-push-vapid.js';
import {
  NATIONAL_BASIN_STATIONS,
  syncOfficialHydroMetFeed,
  listPartnerWebhooks,
  addPartnerWebhook,
  deletePartnerWebhook,
  dispatchPartnerWebhooks
} from '../platform/alerts/official-alert-webhook.js';

const hubRateLimiter = createBoundedRateLimiter({ maxRequests: 30, windowMs: 60_000, maxEntries: 1500 });

function jsonRes(request, data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...buildCorsHeaders(request)
    }
  });
}

export async function OPTIONS(request) {
  return handleCorsPreflight(request);
}

export async function GET(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'live_bulletins';

  if (action === 'health') {
    const [vapid, pushStats, webhooks] = await Promise.all([
      getOrCreateVapidKeys().catch(() => ({ publicKey: '' })),
      getPushStats().catch(() => ({ activeCount: 0, uniqueCells: 0 })),
      listPartnerWebhooks().catch(() => [])
    ]);
    return jsonRes(request, {
      ok: true,
      service: 'vn-official-alert-webhook-hub',
      basinsMonitored: NATIONAL_BASIN_STATIONS.length,
      provincesCovered: 34,
      webhooksConfiguredCount: webhooks.length,
      pushSubscribersCount: pushStats.activeCount,
      pushUniqueCells: pushStats.uniqueCells,
      vapidReady: Boolean(vapid?.publicKey)
    });
  }

  if (action === 'admin_webhooks') {
    if (!verifyAdminBearer(request)) {
      return jsonRes(request, { ok: false, error: 'Yêu cầu quyền Quản trị viên.' }, 401);
    }
    const [webhooks, pushStats] = await Promise.all([listPartnerWebhooks(), getPushStats()]);
    return jsonRes(request, {
      ok: true,
      webhooks,
      pushStats
    });
  }

  if (action === 'live_bulletins') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    const rl = await checkDistributedRateLimit({
      key: `alert-hub:${ip}`,
      maxRequests: 30,
      windowMs: 60_000,
      fallbackLimiter: hubRateLimiter
    });
    if (!rl.allowed) {
      return jsonRes(request, { ok: false, error: 'Tần suất làm mới quá nhanh.' }, 429);
    }
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const feed = await syncOfficialHydroMetFeed({ forceRefresh });
    return jsonRes(request, feed);
  }

  return jsonRes(request, { ok: false, error: 'Action GET không hợp lệ.' }, 400);
}

export async function POST(request) {
  if (!verifyAdminBearer(request)) {
    return jsonRes(request, { ok: false, error: 'Yêu cầu đăng nhập quyền Quản trị viên.' }, 401);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonRes(request, { ok: false, error: 'Dữ liệu JSON không hợp lệ.' }, 400);
  }

  const action = String(body.action || '');

  if (action === 'admin_add_webhook') {
    try {
      const created = await addPartnerWebhook({
        name: body.name,
        url: body.url,
        provinceFilter: body.provinceFilter || 'ALL',
        secret: body.secret || ''
      });
      return jsonRes(request, { ok: true, webhook: created });
    } catch (err) {
      return jsonRes(request, { ok: false, error: err?.message || 'Không thêm được Webhook.' }, 400);
    }
  }

  if (action === 'admin_delete_webhook') {
    const removed = await deletePartnerWebhook(body.id);
    if (!removed) {
      return jsonRes(request, { ok: false, error: 'Không tìm thấy Webhook cần xóa.' }, 404);
    }
    return jsonRes(request, { ok: true, id: body.id });
  }

  if (action === 'admin_test_webhook') {
    const out = await dispatchPartnerWebhooks(
      {
        event: 'admin_test_ping',
        severity: 'watch',
        province: 'Toàn quốc',
        areaHint: 'Kênh kiểm thử trực ban điều hành',
        categoryLabel: 'Diễn tập kết nối Webhook',
        waterDepthM: 0,
        message: 'Gói tin diễn tập kết nối hệ thống cảnh báo VN Resilience Atlas hoạt động bình thường.'
      },
      { onlyWebhookId: String(body.id || '') }
    );
    return jsonRes(request, { ok: out.delivered > 0, ...out });
  }

  return jsonRes(request, { ok: false, error: 'Action POST không hợp lệ.' }, 400);
}
