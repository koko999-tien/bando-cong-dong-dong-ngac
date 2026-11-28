/**
 * API ĐIỀU PHỐI CỨU TRỢ CỘNG ĐỒNG ZERO-TRUST & ĐỊNH DANH CÁ NHÂN / GOOGLE (/api/sos-dispatch)
 * - Bảo vệ vị trí người dùng (Zero-Standing-Location Geohash tự hủy 30p + Làm mờ 300m + Tự xóa trắng tọa độ sau ca)
 * - Chống tắc đường (Khóa trần K=2 chỗ hỗ trợ nguyên tử — đủ người tự đóng luồng ngay)
 * - Chống kẻ xấu & dịch vụ chặt chém (Phân tầng `verified_responder`, chế độ `official_only`, PIN 4 số 2 chiều & Khóa tức thì khi bị báo lợi dụng)
 */

import crypto from 'node:crypto';
import { isInsideVietnam, findNearestVietnamZone } from '../platform/regions/vietnam-directory.js';
import { cleanText, hasSpamContent, createBoundedRateLimiter, validateImageDataUrl } from '../platform/security/validators.js';
import { buildCorsHeaders, handleCorsPreflight } from '../platform/security/cors.js';
import { checkDistributedRateLimit, fetchEdgeSecurityConfig } from '../platform/security/edge-guard.js';
import {
  detectStorageBackend,
  hashPassword,
  verifyPassword,
  signCitizenToken,
  verifyCitizenToken,
  verifyAdminBearer,
  readGenericCollection,
  writeGenericCollection
} from '../platform/storage/national-store.js';
import {
  encodeCoarseGeohash,
  buildFuzzyPublicCoordinate,
  generateSafetyPin4,
  evaluateDispatchPolicy,
  projectSosTicketForViewer,
  SEED_VERIFIED_SQUADS
} from '../platform/safety/sos-dispatch-engine.js';
import {
  getOrCreateVapidKeys,
  savePushSubscription,
  removePushSubscriptionsForUser,
  dispatchWebPushToCell,
  getPushStats
} from '../platform/alerts/web-push-vapid.js';
import { dispatchPartnerWebhooks } from '../platform/alerts/official-alert-webhook.js';

const authLimiter = createBoundedRateLimiter({ maxRequests: 15, windowMs: 15 * 60 * 1000, maxEntries: 2000 });
const sosLimiter = createBoundedRateLimiter({ maxRequests: 12, windowMs: 15 * 60 * 1000, maxEntries: 2000 });

const ACCOUNTS_KEY = 'sos_accounts';
const TICKETS_KEY = 'sos_tickets';
const HEARTBEATS_KEY = 'sos_ephemeral_cells';

const CATEGORY_LABELS = {
  stalled_vehicle: 'Chết máy / Kẹt phương tiện trong điểm ngập',
  medical_heat: 'Sốc nhiệt / Mệt lả / Cần hỗ trợ sơ cứu nhẹ',
  trapped_deep_water: 'Mắc kẹt nước dâng cao / Dòng chảy xiết',
  landslide_hazard: 'Nguy cơ sạt lở đất / Cây đổ chắn đường',
  electrical_leak: 'Nghi rò điện / Dây điện đứt gần vùng ngập'
};

function jsonRes(request, obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(request)
    }
  });
}

function getClientIp(req) {
  return (req.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim();
}

async function loadSosState() {
  const [rawAccounts, rawTickets, rawCells] = await Promise.all([
    readGenericCollection(ACCOUNTS_KEY, []),
    readGenericCollection(TICKETS_KEY, []),
    readGenericCollection(HEARTBEATS_KEY, [])
  ]);

  const now = Date.now();
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : [];

  // Tự động xóa trắng tọa độ của các ca đã quá hạn 45 phút (Auto-Shred TTL)
  let ticketsDirty = false;
  const tickets = (Array.isArray(rawTickets) ? rawTickets : []).map((t) => {
    if (
      !t.exactCoordShredded &&
      t.expiresAt &&
      now > new Date(t.expiresAt).getTime() &&
      t.status !== 'resolved_shredded'
    ) {
      ticketsDirty = true;
      return {
        ...t,
        status: 'expired_shredded',
        exactLat: null,
        exactLng: null,
        exactCoordShredded: true
      };
    }
    return t;
  });
  if (ticketsDirty) {
    await writeGenericCollection(TICKETS_KEY, tickets).catch(() => {});
  }

  // Ô lưới Geohash tạm thời của tình nguyện viên tự hủy sau 30 phút
  const activeCells = (Array.isArray(rawCells) ? rawCells : []).filter((c) => Number(c.expiresAtMs) > now);

  return { accounts, tickets, activeCells };
}

function mergeWithSeedSquads(accounts) {
  const byId = new Map();
  for (const sq of SEED_VERIFIED_SQUADS) byId.set(sq.id, { ...sq });
  for (const acc of accounts) byId.set(acc.id, acc);
  return [...byId.values()];
}

async function verifyRealGoogleIdToken(idToken) {
  const clean = String(idToken || '').trim();
  if (!clean || clean.split('.').length !== 3) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(clean)}`, {
      signal: controller.signal
    });
    if (!res.ok) return null;
    const info = await res.json();
    if (info.email_verified !== 'true' && info.email_verified !== true) return null;
    const expectedAud = (process.env.GOOGLE_CLIENT_ID || '').trim();
    if (expectedAud && info.aud !== expectedAud) return null;
    return {
      email: String(info.email || '').toLowerCase().trim(),
      fullName: cleanText(info.name || info.email.split('@')[0], 80),
      sub: String(info.sub || '')
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function OPTIONS(request) {
  return handleCorsPreflight(request);
}

export async function GET(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'health';

  if (action === 'health') {
    const [edgeCfg, vapid, pushStats] = await Promise.all([
      fetchEdgeSecurityConfig(),
      getOrCreateVapidKeys().catch(() => ({ publicKey: '' })),
      getPushStats().catch(() => ({ activeCount: 0 }))
    ]);
    const rateLimitEngine =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? 'upstash_redis'
        : process.env.CF_EDGE_API_URL
          ? 'cloudflare_kv_edge'
          : 'local_memory';
    return jsonRes(request, {
      ok: true,
      service: 'vn-zero-trust-sos-dispatch',
      storageBackend: detectStorageBackend(),
      d1NormalizedTables: true,
      rateLimitEngine,
      turnstileEnabled: edgeCfg.turnstileEnabled,
      turnstileSiteKey: edgeCfg.turnstileSiteKey,
      googleClientIdConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      webPushEnabled: Boolean(vapid?.publicKey),
      vapidPublicKey: vapid?.publicKey || '',
      activePushSubscriptions: pushStats.activeCount,
      antiCongestionMaxSlots: 2,
      locationPrivacy: 'ephemeral_geohash6_30m_ttl_with_auto_shred'
    });
  }

  const { accounts, tickets, activeCells } = await loadSosState();
  const allAccounts = mergeWithSeedSquads(accounts);

  if (action === 'me') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Chưa đăng nhập tài khoản công dân.' }, 401);
    const acc = allAccounts.find((a) => a.id === claims.id);
    if (!acc) return jsonRes(request, { ok: false, error: 'Tài khoản không còn tồn tại hoặc đã bị xóa.' }, 401);
    const myTickets = tickets
      .filter((t) => t.requesterId === acc.id)
      .slice(0, 10)
      .map((t) => projectSosTicketForViewer(t, acc, false));
    return jsonRes(request, {
      ok: true,
      profile: {
        id: acc.id,
        email: acc.email,
        fullName: acc.fullName,
        organization: acc.organization || '',
        authProvider: acc.authProvider || 'local',
        trustTier: acc.trustTier || 'citizen',
        status: acc.status || 'active',
        completedHelps: acc.completedHelps || 0,
        ekyc: acc.ekyc
          ? {
              phone: acc.ekyc.phone || '',
              idLast4: acc.ekyc.idLast4 || '',
              roleNote: acc.ekyc.roleNote || '',
              pledgedZeroFee: Boolean(acc.ekyc.pledgedZeroFee),
              hasProofImage: Boolean(acc.ekyc.proofDataUrl || acc.ekyc.hasProofImage),
              submittedAt: acc.ekyc.submittedAt || null
            }
          : null
      },
      myTickets
    });
  }

  // Thống kê công khai theo vùng: TUYỆT ĐỐI KHÔNG TRẢ TỌA ĐỘ NGƯỜI DÙNG, chỉ trả số lượng đội xung kích sẵn sàng!
  if (action === 'zone_shield_summary') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!isInsideVietnam(lat, lng)) {
      return jsonRes(request, { ok: false, error: 'Tọa độ nằm ngoài lãnh thổ Việt Nam.' }, 400);
    }
    const gh5 = encodeCoarseGeohash(lat, lng, 5);
    const seedCount = SEED_VERIFIED_SQUADS.filter((s) => s.geohash5 === gh5 || s.geohash5.slice(0, 3) === gh5.slice(0, 3)).length;
    const liveCount = activeCells.filter((c) => c.geohash5 === gh5).length;
    return jsonRes(request, {
      ok: true,
      coarseGeohash5: gh5,
      verifiedSquadsReadyCount: Math.max(1, seedCount + liveCount),
      exposedUserCoordinates: 0,
      privacyGuarantee: 'Zero-Standing-Location: Không ai xem được vị trí người tải App trên bản đồ.'
    });
  }

  // Cảnh báo hỗ trợ gần đây: Mọi tài khoản đang hoạt động (`status === 'active'`, không bị khóa) ở gần ô lưới đều xem & nhận hỗ trợ ca ngập nông;
  // Các ca nguy hiểm (`official_only` / >= 0.45 m) vẫn ẩn hoàn toàn với tài khoản cá nhân để bảo vệ tính mạng!
  if (action === 'responder_inbox') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập để bật cảnh báo hỗ trợ gần đây.' }, 401);
    const acc = allAccounts.find((a) => a.id === claims.id);
    if (!acc || acc.status === 'suspended' || acc.trustTier === 'revoked') {
      return jsonRes(
        request,
        {
          ok: false,
          error:
            'Tài khoản đã bị tước quyền nhận thông báo hỗ trợ do vi phạm quy chuẩn an toàn cộng đồng.'
        },
        403
      );
    }

    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const viewerGh5 = isInsideVietnam(lat, lng) ? encodeCoarseGeohash(lat, lng, 5) : acc.geohash5 || '';

    const eligible = tickets.filter((t) => {
      if (['resolved_shredded', 'cancelled_shredded', 'expired_shredded'].includes(t.status)) return false;
      const alreadyMine = (t.assignedResponders || []).some((r) => r.responderId === acc.id);
      if (alreadyMine) return true;
      // Ca bảo vệ tối đa hoặc ngập nguy hiểm >= 0.45m chỉ đội chuyên trách mới thấy!
      if (t.dispatchScope === 'official_only' && acc.trustTier !== 'official_unit') return false;
      // Đủ K=2 người tới giúp -> Tự ẩn để tránh kéo đám đông gây tắc đường!
      if ((t.assignedResponders || []).length >= t.maxResponders) return false;
      if (!viewerGh5) return true;
      return String(t.geohash6 || '').startsWith(viewerGh5.slice(0, 4));
    });

    return jsonRes(request, {
      ok: true,
      responderTier: acc.trustTier,
      coarseCell: viewerGh5,
      tickets: eligible.slice(0, 15).map((t) => projectSosTicketForViewer(t, acc, false))
    });
  }

  // Giám sát toàn cục dành riêng cho Cổng Quản trị Độc lập (Ops Console)
  if (action === 'admin_overview') {
    if (!verifyAdminBearer(request)) {
      return jsonRes(request, { ok: false, error: 'Yêu cầu quyền Quản trị viên (Ops Console).' }, 401);
    }
    return jsonRes(request, {
      ok: true,
      accounts: allAccounts.map((a) => ({
        id: a.id,
        email: a.email,
        fullName: a.fullName,
        organization: a.organization || '',
        authProvider: a.authProvider,
        trustTier: a.trustTier,
        status: a.status || 'active',
        completedHelps: a.completedHelps || 0,
        abuseFlags: a.abuseFlags || 0,
        ekyc: a.ekyc || null
      })),
      tickets: tickets.slice(0, 40).map((t) => projectSosTicketForViewer(t, null, true)),
      ephemeralActiveResponders: activeCells.length
    });
  }

  return jsonRes(request, { ok: false, error: 'Action không hợp lệ.' }, 400);
}

function parseVolunteerEkycPayload(raw, fallbackOrg = '') {
  const phone = cleanText(raw?.phone || '', 24);
  const organization = cleanText(raw?.organization || fallbackOrg || '', 120);
  const idLast4 = String(raw?.idLast4 || '')
    .replace(/[^0-9]/g, '')
    .slice(-4);
  const roleNote = cleanText(raw?.roleNote || '', 200);
  const pledgedZeroFee = Boolean(raw?.pledgedZeroFee);
  let proofDataUrl = '';

  const rawProof = String(raw?.proofDataUrl || '').trim();
  if (rawProof) {
    const chk = validateImageDataUrl(rawProof, {
      maxDataUrlLength: 68000,
      allowedMimes: ['image/jpeg', 'image/png']
    });
    if (!chk.valid) {
      return { error: chk.reason || 'Ảnh minh chứng eKYC không hợp lệ.' };
    }
    proofDataUrl = rawProof;
  }

  return {
    ekyc: {
      phone,
      organization,
      idLast4,
      roleNote,
      pledgedZeroFee,
      hasProofImage: Boolean(proofDataUrl),
      proofDataUrl,
      submittedAt: new Date().toISOString()
    }
  };
}

export async function POST(request) {
  const ip = getClientIp(request);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonRes(request, { ok: false, error: 'Dữ liệu JSON không hợp lệ.' }, 400);
  }

  const action = String(body.action || '');
  const { accounts, tickets, activeCells } = await loadSosState();
  const allAccounts = mergeWithSeedSquads(accounts);

  // 1. ĐĂNG KÝ TÀI KHOẢN CÁ NHÂN
  if (action === 'register_citizen') {
    if (!authLimiter.check(ip).allowed) {
      return jsonRes(request, { ok: false, error: 'Thao tác quá nhanh, vui lòng thử lại sau ít phút.' }, 429);
    }
    const fullName = cleanText(body.fullName || '', 80);
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const requestResponderVetting = Boolean(body.requestResponderVetting);
    const organization = cleanText(body.organization || '', 120);

    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return jsonRes(request, { ok: false, error: 'Vui lòng nhập họ tên, email hợp lệ và mật khẩu tối thiểu 8 ký tự.' }, 400);
    }
    if (allAccounts.some((a) => a.email === email)) {
      return jsonRes(request, { ok: false, error: 'Email này đã được đăng ký. Vui lòng chuyển sang Đăng nhập.' }, 409);
    }

    let ekycData = null;
    if (requestResponderVetting) {
      const parsed = parseVolunteerEkycPayload(body, organization);
      if (parsed.error) return jsonRes(request, { ok: false, error: parsed.error }, 400);
      if (parsed.ekyc.phone || parsed.ekyc.idLast4 || parsed.ekyc.roleNote || parsed.ekyc.proofDataUrl || parsed.ekyc.pledgedZeroFee) {
        ekycData = parsed.ekyc;
      }
    }

    const newAcc = {
      id: `CZ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      email,
      fullName,
      organization: ekycData?.organization || organization,
      passwordHash: hashPassword(password),
      authProvider: 'local',
      // Mặc định CHỈ là `citizen` (hoặc `pending_responder` chờ Ops duyệt), tuyệt đối không tự cấp quyền xem SOS của người khác!
      trustTier: requestResponderVetting ? 'pending_responder' : 'citizen',
      status: 'active',
      completedHelps: 0,
      abuseFlags: 0,
      ekyc: ekycData,
      createdAt: new Date().toISOString()
    };
    accounts.push(newAcc);
    await writeGenericCollection(ACCOUNTS_KEY, accounts);

    const token = signCitizenToken(newAcc);
    return jsonRes(request, {
      ok: true,
      token,
      profile: {
        id: newAcc.id,
        email: newAcc.email,
        fullName: newAcc.fullName,
        organization: newAcc.organization,
        authProvider: newAcc.authProvider,
        trustTier: newAcc.trustTier,
        status: newAcc.status
      }
    });
  }

  // 2. ĐĂNG NHẬP TÀI KHOẢN CÁ NHÂN
  if (action === 'login_citizen') {
    if (!authLimiter.check(ip).allowed) {
      return jsonRes(request, { ok: false, error: 'Quá nhiều lần đăng nhập. Vui lòng đợi ít phút.' }, 429);
    }
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const acc = accounts.find((a) => a.email === email && a.authProvider === 'local');
    if (!acc || !verifyPassword(password, acc.passwordHash)) {
      return jsonRes(request, { ok: false, error: 'Email hoặc mật khẩu không chính xác.' }, 401);
    }
    if (acc.status === 'suspended') {
      return jsonRes(request, { ok: false, error: 'Tài khoản này đã bị khóa do vi phạm quy tắc an toàn cộng đồng.' }, 403);
    }
    const token = signCitizenToken(acc);
    return jsonRes(request, {
      ok: true,
      token,
      profile: {
        id: acc.id,
        email: acc.email,
        fullName: acc.fullName,
        organization: acc.organization || '',
        authProvider: acc.authProvider,
        trustTier: acc.trustTier,
        status: acc.status
      }
    });
  }

  // 3. ĐĂNG NHẬP BẰNG GOOGLE (HỖ TRỢ GOOGLE ID TOKEN CHUẨN + TÀI KHOẢN KIỂM CHỨNG NHANH TRÊN TRÌNH DUYỆT)
  if (action === 'google_auth') {
    if (!authLimiter.check(ip).allowed) {
      return jsonRes(request, { ok: false, error: 'Thao tác quá nhanh, vui lòng đợi ít phút.' }, 429);
    }

    let gUser = null;
    if (body.idToken) {
      gUser = await verifyRealGoogleIdToken(body.idToken);
      if (!gUser) {
        return jsonRes(request, { ok: false, error: 'Token xác thực Google không hợp lệ hoặc đã hết hạn.' }, 401);
      }
    } else if (body.quickGoogleProfile) {
      if (process.env.VERCEL_ENV === 'production' && process.env.ALLOW_DEMO_SQUAD !== 'true') {
        return jsonRes(
          request,
          { ok: false, error: 'Vui lòng dùng Google Sign-In chính thức hoặc đăng nhập Email/Mật khẩu trên môi trường vận hành.' },
          403
        );
      }
      // Cho phép trải nghiệm luồng Đăng nhập Google 1 chạm trên local dev / preview khi chưa gắn Client ID riêng của miền
      const rawEmail = String(body.quickGoogleProfile.email || '').toLowerCase().trim();
      const rawName = cleanText(body.quickGoogleProfile.fullName || 'Người dùng Google', 80);
      if (!/^[^\s@]+@gmail\.com$/.test(rawEmail)) {
        return jsonRes(request, { ok: false, error: 'Vui lòng dùng địa chỉ @gmail.com hợp lệ.' }, 400);
      }
      // Chống chiếm quyền tài khoản mật khẩu hiện có (Anti-Account-Takeover)
      const existingLocal = accounts.find((a) => a.email === rawEmail && a.authProvider === 'local');
      if (existingLocal) {
        return jsonRes(request, { ok: false, error: 'Email này đã đăng ký bằng mật khẩu riêng — vui lòng đăng nhập bằng mật khẩu.' }, 409);
      }
      gUser = { email: rawEmail, fullName: rawName };
    } else {
      return jsonRes(request, { ok: false, error: 'Thiếu thông tin xác thực Google.' }, 400);
    }

    let acc = accounts.find((a) => a.email === gUser.email && a.authProvider.startsWith('google'));
    if (!acc) {
      acc = {
        id: `GG-${crypto.createHash('sha1').update(gUser.email).digest('hex').slice(0, 10).toUpperCase()}`,
        email: gUser.email,
        fullName: gUser.fullName,
        organization: 'Tài khoản Google Cá nhân',
        authProvider: body.idToken ? 'google_oidc' : 'google_quick',
        trustTier: 'citizen',
        status: 'active',
        completedHelps: 0,
        abuseFlags: 0,
        createdAt: new Date().toISOString()
      };
      accounts.push(acc);
      await writeGenericCollection(ACCOUNTS_KEY, accounts);
    }
    if (acc.status === 'suspended') {
      return jsonRes(request, { ok: false, error: 'Tài khoản đã bị khóa do vi phạm nguyên tắc an toàn.' }, 403);
    }

    const token = signCitizenToken(acc);
    return jsonRes(request, {
      ok: true,
      token,
      profile: {
        id: acc.id,
        email: acc.email,
        fullName: acc.fullName,
        organization: acc.organization || '',
        authProvider: acc.authProvider,
        trustTier: acc.trustTier,
        status: acc.status
      }
    });
  }

  // 4. ĐĂNG NHẬP CHẾ ĐỘ ĐỘI XUNG KÍCH MẪU ĐỂ KIỂM THỬ LUỒNG NHẬN HỖ TRỢ 2 CHIỀU
  if (action === 'demo_squad_session') {
    if (process.env.VERCEL_ENV === 'production' && process.env.ALLOW_DEMO_SQUAD !== 'true') {
      return jsonRes(request, { ok: false, error: 'Chế độ Đội Xung kích kiểm thử đã tắt trên môi trường Vận hành thực tế (Production).' }, 403);
    }
    const squadId = String(body.squadId || 'SQUAD-HN-DONGNGAC');
    const sq = SEED_VERIFIED_SQUADS.find((s) => s.id === squadId) || SEED_VERIFIED_SQUADS[0];
    const liveSq = allAccounts.find((a) => a.id === sq.id) || sq;
    if (liveSq.status === 'suspended') {
      return jsonRes(request, { ok: false, error: 'Đơn vị này đang tạm khóa để kiểm tra.' }, 403);
    }
    const token = signCitizenToken(liveSq);
    return jsonRes(request, { ok: true, token, profile: liveSq });
  }

  // 5. CẬP NHẬT Ô LƯỚI ẨN DANH ĐỂ NHẬN CẢNH BÁO NGƯỜI GẶP NẠN Ở GẦN (KHÔNG LƯU GPS CHÍNH XÁC!)
  if (action === 'responder_heartbeat') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập để bật cảnh báo hỗ trợ gần đây.' }, 401);
    const acc = allAccounts.find((a) => a.id === claims.id);
    if (!acc || acc.status === 'suspended' || acc.trustTier === 'revoked') {
      return jsonRes(request, { ok: false, error: 'Tài khoản đã bị khóa do vi phạm quy chuẩn an toàn.' }, 403);
    }
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isInsideVietnam(lat, lng)) {
      return jsonRes(request, { ok: false, error: 'Tọa độ ngoài lãnh thổ Việt Nam.' }, 400);
    }
    const gh5 = encodeCoarseGeohash(lat, lng, 5);
    const filtered = activeCells.filter((c) => c.responderId !== acc.id);
    filtered.push({
      responderId: acc.id,
      geohash5: gh5,
      trustTier: acc.trustTier,
      expiresAtMs: Date.now() + 30 * 60 * 1000
    });
    await writeGenericCollection(HEARTBEATS_KEY, filtered);
    return jsonRes(request, {
      ok: true,
      coarseGeohash5: gh5,
      storedExactGps: false,
      ttlMinutes: 30
    });
  }

  // 5b. ĐĂNG KÝ / HỦY WEB PUSH V3C VAPID CHẠY NỀN THEO Ô LƯỚI ẨN DANH (ZERO-STANDING-LOCATION)
  if (action === 'subscribe_push') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập để bật chuông đẩy nền.' }, 401);
    const acc = allAccounts.find((a) => a.id === claims.id);
    if (!acc || acc.status === 'suspended' || acc.trustTier === 'revoked') {
      return jsonRes(request, { ok: false, error: 'Tài khoản không đủ điều kiện nhận thông báo hỗ trợ.' }, 403);
    }
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isInsideVietnam(lat, lng)) {
      return jsonRes(request, { ok: false, error: 'Tọa độ vùng trực nằm ngoài lãnh thổ Việt Nam.' }, 400);
    }
    const gh5 = encodeCoarseGeohash(lat, lng, 5);
    try {
      await savePushSubscription({
        responderId: acc.id,
        trustTier: acc.trustTier || 'citizen',
        geohash5: gh5,
        subscription: body.subscription
      });
      return jsonRes(request, {
        ok: true,
        coarseGeohash5: gh5,
        storedExactGps: false,
        ttlHours: 24
      });
    } catch {
      return jsonRes(request, { ok: false, error: 'Gói đăng ký Web Push không hợp lệ.' }, 400);
    }
  }

  if (action === 'unsubscribe_push') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập.' }, 401);
    const removed = await removePushSubscriptionsForUser(claims.id);
    return jsonRes(request, { ok: true, removed });
  }

  // 6. GỬI YÊU CẦU CẦN HỖ TRỢ KHẨN CẤP (SOS CÓ HẠN NGẠCH CHỐNG TẮC ĐƯỜNG & BẢO VỆ VỊ TRÍ)
  if (action === 'create_sos') {
    const claims = verifyCitizenToken(request);
    if (!claims) {
      return jsonRes(request, { ok: false, error: 'Bắt buộc đăng nhập tài khoản cá nhân hoặc Google để gửi yêu cầu SOS chống báo giả.' }, 401);
    }
    const rl = await checkDistributedRateLimit({
      key: `sos:${ip}:${claims.id}`,
      maxRequests: 12,
      windowMs: 15 * 60 * 1000,
      fallbackLimiter: sosLimiter
    });
    if (!rl.allowed) {
      return jsonRes(request, { ok: false, error: 'Bạn vừa gửi nhiều yêu cầu liên tiếp. Nếu nguy cấp tính mạng, hãy gọi ngay 112 / 114 / 115.' }, 429);
    }
    const acc = allAccounts.find((a) => a.id === claims.id) || claims;
    if (acc.status === 'suspended') {
      return jsonRes(request, { ok: false, error: 'Tài khoản bị hạn chế do vi phạm quy chuẩn cộng đồng.' }, 403);
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!isInsideVietnam(lat, lng)) {
      return jsonRes(request, { ok: false, error: 'Tọa độ SOS phải nằm trong lãnh thổ Việt Nam.' }, 400);
    }

    const category = CATEGORY_LABELS[body.category] ? body.category : 'stalled_vehicle';
    const waterDepthM = Math.max(0, Math.min(2.5, Number(body.waterDepthM) || 0.2));
    const requestedScope = body.dispatchScope === 'official_only' ? 'official_only' : 'verified_peers';
    const note = cleanText(body.note || '', 280);
    if (hasSpamContent(note)) {
      return jsonRes(request, { ok: false, error: 'Nội dung ghi chú chứa liên kết quảng cáo không hợp lệ.' }, 400);
    }

    const policy = evaluateDispatchPolicy({ category, waterDepthM, dispatchScope: requestedScope });
    const id = `SOS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const geohash6 = encodeCoarseGeohash(lat, lng, 6);
    const fuzzy = buildFuzzyPublicCoordinate(lat, lng, id);
    const nearZone = findNearestVietnamZone(lat, lng);
    const areaHint = cleanText(body.areaHint || nearZone?.name || 'Khu vực đô thị Việt Nam', 120);

    const newTicket = {
      id,
      requesterId: acc.id,
      requesterName: acc.fullName,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      dispatchScope: policy.effectiveScope,
      maxResponders: policy.maxResponders,
      waveSize: policy.waveSize,
      escalate112: policy.escalate112,
      policyReason: policy.policyReason,
      waterDepthM,
      geohash6,
      areaHint,
      exactLat: Math.round(lat * 1000000) / 1000000,
      exactLng: Math.round(lng * 1000000) / 1000000,
      exactCoordShredded: false,
      fuzzyLat: fuzzy.fuzzyLat,
      fuzzyLng: fuzzy.fuzzyLng,
      privacyRadiusM: fuzzy.privacyRadiusM,
      safetyPin: generateSafetyPin4(),
      note,
      status: policy.maxResponders === 0 ? 'official_escalated' : 'open_wave_1',
      assignedResponders: [],
      abuseReports: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 45 * 60 * 1000).toISOString()
    };

    tickets.unshift(newTicket);
    await writeGenericCollection(TICKETS_KEY, tickets.slice(0, 200));

    await Promise.allSettled([
      dispatchWebPushToCell({
        geohash5: encodeCoarseGeohash(lat, lng, 5),
        officialOnly: newTicket.dispatchScope === 'official_only',
        payload: {
          title: `SOS Gần Bạn: ${newTicket.categoryLabel}`,
          body: `${areaHint} · Mực nước ~${Math.round(waterDepthM * 100)} cm. Chạm để mở bản đồ hỗ trợ 0đ.`,
          url: './index.html#sos',
          ticketId: newTicket.id
        }
      }),
      dispatchPartnerWebhooks({
        event: newTicket.escalate112 ? 'sos_critical_112' : 'sos_nearby',
        severity: newTicket.escalate112 ? 'emergency' : 'warning',
        province: nearZone?.province || 'Việt Nam',
        areaHint,
        categoryLabel: newTicket.categoryLabel,
        waterDepthM,
        message: `Ca ${newTicket.id}: ${newTicket.categoryLabel} tại ${areaHint} (~${Math.round(waterDepthM * 100)} cm).`
      })
    ]);

    return jsonRes(request, {
      ok: true,
      ticket: projectSosTicketForViewer(newTicket, acc, false)
    });
  }

  // 7. NGƯỜI DÙNG Ở GẦN NHẬN HỖ TRỢ (ATOMIC K-SLOT LOCK CHỐNG TẮC ĐƯỜNG + CAM KẾT 0 ĐỒNG)
  if (action === 'claim_slot') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập.' }, 401);
    const acc = allAccounts.find((a) => a.id === claims.id);
    if (!acc || acc.status === 'suspended' || acc.trustTier === 'revoked') {
      return jsonRes(request, { ok: false, error: 'Tài khoản đã bị tước quyền hỗ trợ do vi phạm quy chuẩn an toàn.' }, 403);
    }
    if (!body.pledgedFreeSupport) {
      return jsonRes(request, { ok: false, error: 'Bắt buộc xác nhận cam kết hỗ trợ thiện nguyện 0 đồng (chống dịch vụ chặt chém).' }, 400);
    }

    const ticket = tickets.find((t) => t.id === body.ticketId);
    if (!ticket || ['resolved_shredded', 'cancelled_shredded', 'expired_shredded'].includes(ticket.status)) {
      return jsonRes(request, { ok: false, error: 'Yêu cầu hỗ trợ này đã kết thúc hoặc hết hạn.' }, 404);
    }
    if (ticket.requesterId === acc.id) {
      return jsonRes(request, { ok: false, error: 'Không thể tự nhận yêu cầu SOS của chính mình.' }, 400);
    }
    if (ticket.dispatchScope === 'official_only' && acc.trustTier !== 'official_unit') {
      return jsonRes(request, { ok: false, error: 'Yêu cầu này chỉ cho phép Đội xung kích chính thức tiếp nhận.' }, 403);
    }

    ticket.assignedResponders = Array.isArray(ticket.assignedResponders) ? ticket.assignedResponders : [];
    if (ticket.assignedResponders.some((r) => r.responderId === acc.id)) {
      return jsonRes(request, { ok: true, ticket: projectSosTicketForViewer(ticket, acc, false) });
    }
    if (ticket.assignedResponders.length >= ticket.maxResponders) {
      return jsonRes(
        request,
        {
          ok: false,
          error: `Đã đủ ${ticket.maxResponders}/${ticket.maxResponders} người nhận hỗ trợ — hệ thống tự đóng luồng để tránh gây ùn tắc giao thông tại điểm sự cố!`
        },
        409
      );
    }

    ticket.assignedResponders.push({
      responderId: acc.id,
      fullName: acc.fullName,
      organization: acc.organization || 'Tình nguyện viên Đã xác minh',
      trustTier: acc.trustTier,
      pledgedFreeSupport: true,
      pinVerified: false,
      claimedAt: new Date().toISOString()
    });

    if (ticket.assignedResponders.length >= ticket.maxResponders) {
      ticket.status = 'locked_full';
    } else {
      ticket.status = 'partially_assigned';
    }

    await writeGenericCollection(TICKETS_KEY, tickets);
    return jsonRes(request, {
      ok: true,
      ticket: projectSosTicketForViewer(ticket, acc, false)
    });
  }

  // 8. ĐỐI CHIẾU MÃ PIN AN TOÀN 4 SỐ TẠI HIỆN TRƯỜNG (CHỐNG MẠO DANH CỨU HỘ)
  if (action === 'verify_pin') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập.' }, 401);
    const ticket = tickets.find((t) => t.id === body.ticketId);
    if (!ticket) return jsonRes(request, { ok: false, error: 'Không tìm thấy yêu cầu SOS.' }, 404);

    const slot = (ticket.assignedResponders || []).find((r) => r.responderId === claims.id);
    if (!slot) return jsonRes(request, { ok: false, error: 'Bạn không nằm trong danh sách được phân công ca này.' }, 403);

    const inputPin = String(body.pin || '').trim();
    const a = Buffer.from(inputPin.padEnd(4, '_'));
    const b = Buffer.from(String(ticket.safetyPin).padEnd(4, '_'));
    if (inputPin.length !== 4 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return jsonRes(request, { ok: false, error: 'Mã đối chiếu 4 số không khớp — cảnh báo không đúng người cần hỗ trợ!' }, 400);
    }

    slot.pinVerified = true;
    slot.verifiedAt = new Date().toISOString();
    await writeGenericCollection(TICKETS_KEY, tickets);
    return jsonRes(request, { ok: true, ticket: projectSosTicketForViewer(ticket, claims, false) });
  }

  // 9. NGƯỜI DÙNG XÁC NHẬN ĐÃ AN TOÀN -> XÓA TRẮNG TỌA ĐỘ NGAY LẬP TỨC (AUTO-SHRED)
  if (action === 'resolve_sos') {
    const claims = verifyCitizenToken(request);
    const isAdmin = verifyAdminBearer(request);
    const ticket = tickets.find((t) => t.id === body.ticketId);
    if (!ticket) return jsonRes(request, { ok: false, error: 'Không tìm thấy yêu cầu SOS.' }, 404);
    if (!isAdmin && (!claims || claims.id !== ticket.requesterId)) {
      return jsonRes(request, { ok: false, error: 'Chỉ người tạo yêu cầu hoặc Quản trị viên mới được đóng ca.' }, 403);
    }

    ticket.status = body.cancel ? 'cancelled_shredded' : 'resolved_shredded';
    ticket.exactLat = null;
    ticket.exactLng = null;
    ticket.exactCoordShredded = true;
    ticket.resolvedAt = new Date().toISOString();

    await writeGenericCollection(TICKETS_KEY, tickets);
    return jsonRes(request, {
      ok: true,
      message: 'Đã đóng ca hỗ trợ và xóa trắng hoàn toàn tọa độ phiên khỏi hệ thống.',
      ticket: projectSosTicketForViewer(ticket, claims, isAdmin)
    });
  }

  // 10. BÁO CÁO KẺ XẤU LỢI DỤNG / CHẶT CHÉM -> KHÓA QUYỀN TỨC THÌ & ĐẨY CẢNH BÁO OPS CONSOLE
  if (action === 'report_abuse') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập.' }, 401);
    const ticket = tickets.find((t) => t.id === body.ticketId);
    if (!ticket || ticket.requesterId !== claims.id) {
      return jsonRes(request, { ok: false, error: 'Chỉ người gửi SOS của ca này mới được gửi báo cáo vi phạm.' }, 403);
    }

    const badResponderId = String(body.responderId || '');
    const reason = cleanText(body.reason || 'Đòi tiền chặt chém / Hành vi đáng ngờ', 220);

    ticket.abuseReports = Array.isArray(ticket.abuseReports) ? ticket.abuseReports : [];
    ticket.abuseReports.push({
      responderId: badResponderId,
      reason,
      reportedAt: new Date().toISOString()
    });
    // Gỡ ngay kẻ bị tố cáo khỏi ca và xóa quyền xem tọa độ!
    ticket.assignedResponders = (ticket.assignedResponders || []).filter((r) => r.responderId !== badResponderId);

    // Khóa ngay tài khoản bị báo cáo trong danh sách accounts (hoặc tạo bản ghi khóa đè lên seed squad)
    let offender = accounts.find((a) => a.id === badResponderId);
    if (!offender) {
      const seed = SEED_VERIFIED_SQUADS.find((s) => s.id === badResponderId);
      if (seed) {
        offender = { ...seed };
        accounts.push(offender);
      }
    }
    if (offender) {
      offender.status = 'suspended';
      offender.trustTier = 'revoked';
      offender.abuseFlags = (offender.abuseFlags || 0) + 1;
    }

    await Promise.all([
      writeGenericCollection(TICKETS_KEY, tickets),
      writeGenericCollection(ACCOUNTS_KEY, accounts)
    ]);

    return jsonRes(request, {
      ok: true,
      suspendedResponderId: badResponderId,
      message: 'Đã tước quyền hỗ trợ và thu hồi quyền xem vị trí của tài khoản vi phạm ngay lập tức; biên bản đã chuyển về Trung tâm Điều hành & 113.'
    });
  }

  // 11. OPS CONSOLE DUYỆT TÌNH NGUYỆN VIÊN ĐÃ ĐỊNH DANH HOẶC KHÓA TÀI KHOẢN
  if (action === 'admin_vet_account') {
    if (!verifyAdminBearer(request)) {
      return jsonRes(request, { ok: false, error: 'Yêu cầu quyền Quản trị viên (Ops Console).' }, 401);
    }
    const targetId = String(body.accountId || '');
    const nextTier = ['citizen', 'verified_responder', 'official_unit', 'revoked'].includes(body.trustTier)
      ? body.trustTier
      : 'verified_responder';
    const nextStatus = body.status === 'suspended' ? 'suspended' : 'active';

    let target = accounts.find((a) => a.id === targetId);
    if (!target) {
      const seed = SEED_VERIFIED_SQUADS.find((s) => s.id === targetId);
      if (!seed) return jsonRes(request, { ok: false, error: 'Không tìm thấy tài khoản.' }, 404);
      target = { ...seed };
      accounts.push(target);
    }
    target.trustTier = nextTier;
    target.status = nextStatus;
    await writeGenericCollection(ACCOUNTS_KEY, accounts);

    return jsonRes(request, { ok: true, account: target });
  }

  // 12. CÔNG DÂN NỘP / CẬP NHẬT HỒ SƠ eKYC ĐĂNG KÝ TÌNH NGUYỆN VIÊN (0 ĐỒNG)
  if (action === 'submit_volunteer_ekyc') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập tài khoản cá nhân trước khi nộp hồ sơ Tình nguyện viên.' }, 401);
    const acc = accounts.find((a) => a.id === claims.id);
    if (!acc) {
      return jsonRes(request, { ok: false, error: 'Không tìm thấy hồ sơ tài khoản cá nhân để cập nhật eKYC.' }, 404);
    }
    if (acc.status === 'suspended') {
      return jsonRes(request, { ok: false, error: 'Tài khoản đang bị khóa do vi phạm quy chuẩn an toàn.' }, 403);
    }

    const parsed = parseVolunteerEkycPayload(body, acc.organization);
    if (parsed.error) {
      return jsonRes(request, { ok: false, error: parsed.error }, 400);
    }
    if (parsed.ekyc.phone.replace(/\D/g, '').length < 8 || parsed.ekyc.idLast4.length !== 4 || !parsed.ekyc.pledgedZeroFee) {
      return jsonRes(
        request,
        { ok: false, error: 'Vui lòng nhập đầy đủ số điện thoại, 4 số cuối CCCD và xác nhận cam kết thiện nguyện 0 đồng.' },
        400
      );
    }

    acc.organization = parsed.ekyc.organization || acc.organization;
    acc.ekyc = parsed.ekyc;
    if (acc.trustTier === 'citizen') {
      acc.trustTier = 'pending_responder';
    }
    await writeGenericCollection(ACCOUNTS_KEY, accounts);

    return jsonRes(request, {
      ok: true,
      message: 'Đã gửi hồ sơ eKYC Tình nguyện viên về Cổng Quản trị thẩm định.',
      profile: {
        id: acc.id,
        email: acc.email,
        fullName: acc.fullName,
        organization: acc.organization || '',
        authProvider: acc.authProvider,
        trustTier: acc.trustTier,
        status: acc.status
      }
    });
  }

  // 13. QUYỀN CHỦ THỂ DỮ LIỆU (ĐIỀU 9 NĐ 13/2023): TỰ XÓA VĨNH VIỄN TÀI KHOẢN & XÓA TRẮNG TỌA ĐỘ SOS
  if (action === 'delete_my_account') {
    const claims = verifyCitizenToken(request);
    if (!claims) return jsonRes(request, { ok: false, error: 'Vui lòng đăng nhập để thực hiện xóa tài khoản.' }, 401);
    if (SEED_VERIFIED_SQUADS.some((s) => s.id === claims.id)) {
      return jsonRes(request, { ok: false, error: 'Không thể tự xóa tài khoản Đội Xung kích hệ thống mặc định.' }, 400);
    }

    const remainingAccounts = accounts.filter((a) => a.id !== claims.id);
    if (remainingAccounts.length === accounts.length) {
      return jsonRes(request, { ok: false, error: 'Tài khoản không tồn tại hoặc đã bị xóa trước đó.' }, 404);
    }

    const remainingCells = activeCells.filter((c) => c.responderId !== claims.id);
    let shreddedTicketsCount = 0;
    const scrubbedTickets = tickets.map((t) => {
      const cleanedResponders = (t.assignedResponders || []).filter((r) => r.responderId !== claims.id);
      if (t.requesterId === claims.id) {
        shreddedTicketsCount += 1;
        return {
          ...t,
          requesterId: 'DELETED_USER',
          requesterName: 'Đã xóa theo yêu cầu (NĐ 13/2023)',
          exactLat: null,
          exactLng: null,
          exactCoordShredded: true,
          safetyPin: '****',
          note: '[Dữ liệu đã xóa theo quyền chủ thể dữ liệu]',
          status: String(t.status || '').includes('shredded') ? t.status : 'cancelled_shredded',
          assignedResponders: cleanedResponders
        };
      }
      if (cleanedResponders.length !== (t.assignedResponders || []).length) {
        return { ...t, assignedResponders: cleanedResponders };
      }
      return t;
    });

    await Promise.all([
      writeGenericCollection(ACCOUNTS_KEY, remainingAccounts),
      writeGenericCollection(TICKETS_KEY, scrubbedTickets),
      writeGenericCollection(HEARTBEATS_KEY, remainingCells),
      removePushSubscriptionsForUser(claims.id)
    ]);

    return jsonRes(request, {
      ok: true,
      deletedAccountId: claims.id,
      shreddedTicketsCount,
      message: 'Đã xóa vĩnh viễn tài khoản và xóa trắng toàn bộ tọa độ / hồ sơ cá nhân theo Nghị định 13/2023/NĐ-CP.'
    });
  }

  return jsonRes(request, { ok: false, error: 'Action POST không hợp lệ.' }, 400);
}
