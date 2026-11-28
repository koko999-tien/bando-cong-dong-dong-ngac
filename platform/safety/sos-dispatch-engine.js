/**
 * ZERO-TRUST SOS DISPATCH & PRIVACY-PRESERVING RESPONDER PROTOCOL
 * Giải quyết triệt để 3 bài toán an toàn thực tế khi triển khai ứng dụng cứu trợ cộng đồng:
 * 1. Chống lộ vị trí người tải App (Zero-Standing-Location):
 *    - Tuyệt đối không lưu tọa độ GPS chính xác của người dùng/tình nguyện viên ở chế độ chờ.
 *    - Chỉ lưu mã ô lưới thô Geohash bậc 5/6 (~1.2 km - 4.9 km) tự hết hạn sau 30 phút.
 *    - Trước khi bắt tay xác thực, người ứng cứu chỉ thấy tâm làm mờ ngẫu nhiên (~250 m),
 *      không lộ số nhà/ngõ riêng tư; tọa độ phiên tự xóa trắng (shred) ngay khi hoàn tất.
 * 2. Chống ùn tắc đám đông (Quota-Slot Escrow & Wave Dispatch):
 *    - Không phát loa đại trà. Giới hạn cứng K chỗ (mặc định K=2 người cho sự cố chết máy/hỗ trợ nhẹ).
 *    - Khóa nguyên tử (Atomic Slot Lock): đủ K người nhận là đóng luồng ngay, không kéo đám đông tới điểm ngập.
 *    - Chặn điều phối dân sự khi mức nguy hiểm vượt ngưỡng an toàn (ngập sâu >= 0.45 m, nước chảy xiết, sạt lở) ->
 *      chỉ chuyển thẳng Hệ thống Trung tâm & Lực lượng chuyên trách 112/114/115.
 * 3. Chống kẻ xấu lợi dụng & chặt chém (Verified Trust Tier + Bilateral 4-Digit PIN + Anti-Profiteering):
 *    - Tài khoản thường (`citizen`) chỉ được gửi SOS, KHÔNG nhận được yêu cầu cứu người lạ.
 *    - Chỉ `verified_responder` / `official_unit` đã định danh & duyệt qua Ops Console mới được nhận ca.
 *    - Có chế độ `official_only` (chỉ gửi Đội xung kích chính thức & Hệ thống — ẩn 100% với cá nhân) cho người đi đêm/một mình.
 *    - Mã đối chiếu an toàn 4 chữ số 2 chiều + Nút Báo cáo lợi dụng/chặt chém khóa tài khoản tức thì.
 */

import crypto from 'node:crypto';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Mã hóa tọa độ sang ô lưới Geohash thô (mặc định precision = 6 ~ 1.2 km x 0.6 km)
 * Dùng để ghép cặp vùng lân cận mà không cần lưu GPS chính xác của các máy đang mở App.
 */
export function encodeCoarseGeohash(lat, lng, precision = 6) {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = '';
  let isEven = true;
  let bit = 0;
  let ch = 0;

  const cleanLat = Math.max(-89.9999, Math.min(89.9999, Number(lat) || 0));
  const cleanLng = Math.max(-179.9999, Math.min(179.9999, Number(lng) || 0));

  while (hash.length < precision) {
    if (isEven) {
      const mid = (minLng + maxLng) / 2;
      if (cleanLng >= mid) {
        ch |= 1 << (4 - bit);
        minLng = mid;
      } else {
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (cleanLat >= mid) {
        ch |= 1 << (4 - bit);
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/**
 * Tạo tọa độ làm mờ ổn định theo mã phiên (~220m - 320m cách vị trí thật)
 * để kẻ xấu không thể suy ngược vị trí chính xác khi chưa được phân công hợp lệ.
 */
export function buildFuzzyPublicCoordinate(lat, lng, seedId) {
  const digest = crypto.createHash('sha256').update(String(seedId || 'sos')).digest();
  const angleRad = ((digest[0] * 256 + digest[1]) / 65535) * Math.PI * 2;
  const offsetMeters = 220 + (digest[2] / 255) * 95; // 220m..315m
  const dLat = (offsetMeters * Math.cos(angleRad)) / 111320;
  const cosLat = Math.max(0.35, Math.cos((Number(lat) * Math.PI) / 180));
  const dLng = (offsetMeters * Math.sin(angleRad)) / (111320 * cosLat);
  return {
    fuzzyLat: Math.round((Number(lat) + dLat) * 10000) / 10000,
    fuzzyLng: Math.round((Number(lng) + dLng) * 10000) / 10000,
    privacyRadiusM: 300
  };
}

export function generateSafetyPin4() {
  return String(crypto.randomInt(1000, 9999));
}

/**
 * Phân loại hạn ngạch điều phối & ngưỡng an toàn cứu hộ theo tình huống thực tế
 */
export function evaluateDispatchPolicy({ category = 'stalled_vehicle', waterDepthM = 0.2, dispatchScope = 'verified_peers' }) {
  const depth = Math.max(0, Number(waterDepthM) || 0);
  const lifeThreatCategories = new Set(['trapped_deep_water', 'landslide_hazard', 'electrical_leak']);

  // Nếu nguy hiểm tính mạng hoặc nước sâu >= 0.45m: CẤM gọi người dân tự phát lao vào vùng nguy hiểm!
  if (lifeThreatCategories.has(category) || depth >= 0.45) {
    return {
      effectiveScope: 'official_only',
      maxResponders: 0,
      waveSize: 0,
      escalate112: true,
      policyReason:
        'Mức nguy hiểm vượt ngưỡng cứu hộ dân sự an toàn (ngập sâu/dòng xiết/sạt lở/rò điện). Hệ thống khóa luồng cá nhân tự phát để tránh thương vong dây chuyền và chuyển thẳng Trung tâm Điều hành & lực lượng chuyên trách (112/114/115).'
    };
  }

  if (dispatchScope === 'official_only') {
    return {
      effectiveScope: 'official_only',
      maxResponders: 1,
      waveSize: 2,
      escalate112: false,
      policyReason:
        'Chế độ Bảo vệ Cá nhân tối đa: Yêu cầu chỉ gửi tới Hệ thống Trung tâm và Đội xung kích chính thức đã định danh, ẩn hoàn toàn với tài khoản cá nhân quanh khu vực.'
    };
  }

  // Hỗ trợ đẩy/kéo xe chết máy, chỉ đường thoát ngập nhẹ, hỗ trợ y tế nhẹ: Giới hạn cứng K = 2 chỗ chống ùn tắc!
  const maxSlots = category === 'medical_heat' ? 2 : 2;
  return {
    effectiveScope: 'verified_peers',
    maxResponders: maxSlots,
    waveSize: maxSlots + 2, // Chỉ mời tối đa 4 tình nguyện viên đã xác minh gần nhất ở đợt 1
    escalate112: false,
    policyReason: `Điều phối chống tắc đường: Chỉ mở tối đa ${maxSlots} vị trí hỗ trợ từ Tình nguyện viên đã xác minh danh tính & cam kết 0 đồng; tự động khóa luồng ngay khi đủ người nhận.`
  };
}

/**
 * Lọc thông tin yêu cầu SOS theo vai trò người xem (Zero-Trust Data Minimization)
 */
export function projectSosTicketForViewer(ticket, viewer = null, isAdmin = false) {
  const assignedList = Array.isArray(ticket.assignedResponders) ? ticket.assignedResponders : [];
  const isOwner = Boolean(viewer && viewer.id === ticket.requesterId);
  const isAssignedResponder = Boolean(viewer && assignedList.some((r) => r.responderId === viewer.id));
  const isResolvedOrCancelled = ticket.status === 'resolved_shredded' || ticket.status === 'cancelled_shredded';

  const base = {
    id: ticket.id,
    status: ticket.status,
    category: ticket.category,
    categoryLabel: ticket.categoryLabel,
    dispatchScope: ticket.dispatchScope,
    maxResponders: ticket.maxResponders,
    slotsFilled: assignedList.length,
    slotsRemaining: Math.max(0, ticket.maxResponders - assignedList.length),
    escalate112: Boolean(ticket.escalate112),
    policyReason: ticket.policyReason,
    coarseGeohash5: String(ticket.geohash6 || '').slice(0, 5),
    areaHint: ticket.areaHint,
    fuzzyLat: ticket.fuzzyLat,
    fuzzyLng: ticket.fuzzyLng,
    privacyRadiusM: ticket.privacyRadiusM || 300,
    note: ticket.note,
    nonProfiteeringRequired: true,
    createdAt: ticket.createdAt,
    expiresAt: ticket.expiresAt,
    shreddedLocation: Boolean(ticket.exactCoordShredded || isResolvedOrCancelled),
    assignedSummary: assignedList.map((r) => ({
      responderId: r.responderId,
      fullName: r.fullName,
      organization: r.organization,
      trustTier: r.trustTier,
      pledgedFreeSupport: Boolean(r.pledgedFreeSupport),
      pinVerified: Boolean(r.pinVerified),
      claimedAt: r.claimedAt
    }))
  };

  // Người gửi (nạn nhân) hoặc Admin thấy mã PIN đối chiếu 4 số
  if (isOwner || isAdmin) {
    base.requesterName = ticket.requesterName;
    base.safetyPin = ticket.safetyPin;
    base.abuseReports = ticket.abuseReports || [];
  }

  // Tọa độ chính xác CHỈ hiển thị khi ca còn hiệu lực VÀ người xem là chủ yêu cầu, Admin, hoặc người hỗ trợ ĐÃ KHÓA SLOT HỢP LỆ
  if (!isResolvedOrCancelled && !ticket.exactCoordShredded && (isOwner || isAdmin || isAssignedResponder)) {
    base.exactLat = ticket.exactLat;
    base.exactLng = ticket.exactLng;
    base.locationUnlocked = true;
  } else {
    base.locationUnlocked = false;
  }

  return base;
}

export const SEED_VERIFIED_SQUADS = Object.freeze([
  {
    id: 'SQUAD-HN-DONGNGAC',
    email: 'xungkich.dongngac@vn-resilience.gov.vn',
    fullName: 'Đội Xung kích PCTT & Tình nguyện ĐH Mỏ - Địa chất',
    organization: 'Phường Đông Ngạc · Bắc Từ Liêm, Hà Nội',
    authProvider: 'official_registry',
    trustTier: 'official_unit',
    completedHelps: 42,
    abuseFlags: 0,
    geohash5: 'w7er8',
    status: 'active'
  },
  {
    id: 'SQUAD-HUE-HUONG',
    email: 'cuutro.songhuong@vn-resilience.gov.vn',
    fullName: 'Đội Hỗ trợ Giao thông Mưa lũ Sông Hương',
    organization: 'TP. Huế · Thừa Thiên Huế',
    authProvider: 'official_registry',
    trustTier: 'official_unit',
    completedHelps: 31,
    abuseFlags: 0,
    geohash5: 'w6g6x',
    status: 'active'
  },
  {
    id: 'SQUAD-DN-HAICHAU',
    email: 'sos.danang@vn-resilience.gov.vn',
    fullName: 'CLB Sửa xe & Cứu hộ 0 đồng Đà Nẵng',
    organization: 'Hải Châu · TP. Đà Nẵng',
    authProvider: 'official_registry',
    trustTier: 'verified_responder',
    completedHelps: 58,
    abuseFlags: 0,
    geohash5: 'w6ugb',
    status: 'active'
  },
  {
    id: 'SQUAD-HCM-SAIGON',
    email: 'hiepsi.trieucuong@vn-resilience.gov.vn',
    fullName: 'Đội Hỗ trợ Sự cố Ngập triều TP.HCM (0 đồng)',
    organization: 'Bình Thạnh / Quận 1 · TP. Hồ Chí Minh',
    authProvider: 'official_registry',
    trustTier: 'verified_responder',
    completedHelps: 64,
    abuseFlags: 0,
    geohash5: 'w3gvk',
    status: 'active'
  }
]);
