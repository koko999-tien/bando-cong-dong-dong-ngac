/**
 * HỆ QUY CHIẾU VÀ HỆ TỌA ĐỘ QUỐC GIA VN-2000 (THÔNG TƯ 973/2001/TT-TCĐC & QĐ 05/2007/QĐ-BTNMT)
 * - Bảng Kinh tuyến trục (L0) múi chiếu 3° đầy đủ 63 tỉnh/thành phố Việt Nam.
 * - Phép biến đổi 7 tham số Bursa-Wolf Helmert giữa Ellipsoid WGS-84 toàn cầu và VN-2000
 *   (dùng làm bộ tính toán tức thì 0 ms và dự phòng ngoại tuyến chính xác cao cho vn2000.vn/api).
 */

export const VN2000_PROVINCE_MERIDIANS = {
  'Lai Châu': 103.0,
  'Điện Biên': 103.0,
  'Sơn La': 104.0,
  'Lào Cai': 104.75,
  'Yên Bái': 104.75,
  'Hà Giang': 105.5,
  'Tuyên Quang': 106.0,
  'Cao Bằng': 105.75,
  'Bắc Kạn': 106.5,
  'Thái Nguyên': 106.5,
  'Lạng Sơn': 107.25,
  'Phú Thọ': 104.75,
  'Vĩnh Phúc': 105.0,
  'Bắc Giang': 107.0,
  'Bắc Ninh': 105.5,
  'Hà Nội': 105.0,
  'Quảng Ninh': 107.75,
  'Hải Dương': 105.5,
  'Hải Phòng': 105.75,
  'Hưng Yên': 105.5,
  'Thái Bình': 105.5,
  'Hà Nam': 105.0,
  'Nam Định': 105.5,
  'Ninh Bình': 105.0,
  'Hòa Bình': 106.0,
  'Thanh Hóa': 105.0,
  'Nghệ An': 104.75,
  'Hà Tĩnh': 105.5,
  'Quảng Bình': 106.0,
  'Quảng Trị': 106.25,
  'Thừa Thiên Huế': 107.0,
  'TP. Huế': 107.0,
  'Đà Nẵng': 107.75,
  'TP. Đà Nẵng': 107.75,
  'Quảng Nam': 107.75,
  'Quảng Ngãi': 108.0,
  'Bình Định': 108.25,
  'Phú Yên': 108.5,
  'Khánh Hòa': 108.25,
  'Ninh Thuận': 108.25,
  'Bình Thuận': 108.5,
  'Kon Tum': 107.5,
  'Gia Lai': 108.5,
  'Đắk Lắk': 108.5,
  'Đắk Nông': 108.5,
  'Lâm Đồng': 107.75,
  'Bình Phước': 106.25,
  'Tây Ninh': 105.5,
  'Bình Dương': 105.75,
  'Đồng Nai': 107.75,
  'Bà Rịa - Vũng Tàu': 107.75,
  'TP. Hồ Chí Minh': 105.75,
  'Long An': 105.75,
  'Tiền Giang': 105.75,
  'Bến Tre': 105.75,
  'Trà Vinh': 105.5,
  'Vĩnh Long': 105.5,
  'Đồng Tháp': 105.0,
  'An Giang': 104.75,
  'Kiên Giang': 104.5,
  'Cần Thơ': 105.0,
  'TP. Cần Thơ': 105.0,
  'Hậu Giang': 105.0,
  'Sóc Trăng': 105.5,
  'Bạc Liêu': 105.0,
  'Cà Mau': 104.5
};

export function lookupCentralMeridian(provinceName = '', fallbackLng = 105.0) {
  const clean = String(provinceName || '').trim();
  if (clean.length >= 2) {
    if (VN2000_PROVINCE_MERIDIANS[clean]) {
      return VN2000_PROVINCE_MERIDIANS[clean];
    }
    for (const [k, v] of Object.entries(VN2000_PROVINCE_MERIDIANS)) {
      if (clean.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(clean.toLowerCase())) {
        return v;
      }
    }
  }
  // Ước lượng kinh tuyến trục gần nhất theo vĩ/kinh độ nếu không truyền tên tỉnh
  if (fallbackLng >= 107.2) return 107.75;
  if (fallbackLng >= 106.1) return 107.0;
  if (fallbackLng >= 105.35) return 105.75;
  return 105.0;
}

// Hằng số Ellipsoid WGS84 & 7 tham số Bộ TN&MT (QĐ 05/2007/QĐ-BTNMT: VN2000 -> WGS84)
const A_WGS84 = 6378137.0;
const F_WGS84 = 1 / 298.257223563;
const E2 = 2 * F_WGS84 - F_WGS84 * F_WGS84;

// Tham số dịch chuyển từ VN-2000 sang WGS-84:
const DX = -191.90441429;
const DY = -39.30318279;
const DZ = -111.45032835;
const RX = (-0.00928836 / 3600) * (Math.PI / 180);
const RY = (0.01975479 / 3600) * (Math.PI / 180);
const RZ = (-0.00427372 / 3600) * (Math.PI / 180);
const DS = 0.252906278 * 1e-6;

function geodeticToEcef(latRad, lonRad, h = 0) {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const N = A_WGS84 / Math.sqrt(1 - E2 * sinLat * sinLat);
  return {
    X: (N + h) * cosLat * Math.cos(lonRad),
    Y: (N + h) * cosLat * Math.sin(lonRad),
    Z: (N * (1 - E2) + h) * sinLat
  };
}

function ecefToGeodetic(X, Y, Z) {
  const lon = Math.atan2(Y, X);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - E2));
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat);
    const N = A_WGS84 / Math.sqrt(1 - E2 * sinLat * sinLat);
    lat = Math.atan2(Z + E2 * N * sinLat, p);
  }
  const sinLat = Math.sin(lat);
  const N = A_WGS84 / Math.sqrt(1 - E2 * sinLat * sinLat);
  const h = p / Math.cos(lat) - N;
  return { latRad: lat, lonRad: lon, h };
}

function meridionalArc(latRad) {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return (
    A_WGS84 *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latRad -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latRad) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latRad) -
      ((35 * e6) / 3072) * Math.sin(6 * latRad))
  );
}

/**
 * Chuyển đổi trực tiếp WGS84 (lat, lng) -> VN-2000 (X Bắc, Y Đông) theo chuẩn Bộ TN&MT
 */
export function wgs84ToVn2000Local(latDeg, lngDeg, centralMeridian = 105.0, zoneWidth = 3) {
  const latRad = (Number(latDeg) * Math.PI) / 180;
  const lonRad = (Number(lngDeg) * Math.PI) / 180;
  const wgs = geodeticToEcef(latRad, lonRad, 0);

  // Biến đổi ngược WGS84 -> VN2000 ECEF
  const s = 1 - DS;
  const dX = wgs.X - DX;
  const dY = wgs.Y - DY;
  const dZ = wgs.Z - DZ;
  const vnEcef = {
    X: s * (dX - RZ * dY + RY * dZ),
    Y: s * (RZ * dX + dY - RX * dZ),
    Z: s * (-RY * dX + RX * dY + dZ)
  };
  const vnGeo = ecefToGeodetic(vnEcef.X, vnEcef.Y, vnEcef.Z);

  const k0 = Number(zoneWidth) === 6 ? 0.9996 : 0.9999;
  const lon0 = (Number(centralMeridian) * Math.PI) / 180;
  const phi = vnGeo.latRad;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const ep2 = E2 / (1 - E2);
  const N = A_WGS84 / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = (vnGeo.lonRad - lon0) * cosPhi;
  const M = meridionalArc(phi);

  const xNorth =
    k0 *
    (M +
      N *
        tanPhi *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6)) / 720));

  const yEast =
    500000 +
    k0 *
      N *
      (A +
        ((1 - T + C) * Math.pow(A, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5)) / 120);

  return {
    x: Math.round(xNorth * 1000) / 1000,
    y: Math.round(yEast * 1000) / 1000,
    centralMeridian: Number(centralMeridian),
    zoneWidth: Number(zoneWidth) === 6 ? 6 : 3
  };
}

/**
 * Chuyển đổi trực tiếp VN-2000 (X Bắc, Y Đông) -> WGS84 (lat, lng)
 */
export function vn2000ToWgs84Local(xNorth, yEast, centralMeridian = 105.0, zoneWidth = 3) {
  const k0 = Number(zoneWidth) === 6 ? 0.9996 : 0.9999;
  const lon0 = (Number(centralMeridian) * Math.PI) / 180;
  const ep2 = E2 / (1 - E2);
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

  const M = Number(xNorth) / k0;
  const mu = M / (A_WGS84 * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * Math.pow(E2, 3)) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu);

  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const N1 = A_WGS84 / Math.sqrt(1 - E2 * sin1 * sin1);
  const R1 = (A_WGS84 * (1 - E2)) / Math.pow(1 - E2 * sin1 * sin1, 1.5);
  const T1 = tan1 * tan1;
  const C1 = ep2 * cos1 * cos1;
  const D = (Number(yEast) - 500000) / (N1 * k0);

  const vnLatRad =
    phi1 -
    ((N1 * tan1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720);

  const vnLonRad =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5)) / 120) /
      cos1;

  const vnEcef = geodeticToEcef(vnLatRad, vnLonRad, 0);
  const s = 1 + DS;
  const wgsEcef = {
    X: DX + s * (vnEcef.X + RZ * vnEcef.Y - RY * vnEcef.Z),
    Y: DY + s * (-RZ * vnEcef.X + vnEcef.Y + RX * vnEcef.Z),
    Z: DZ + s * (RY * vnEcef.X - RX * vnEcef.Y + vnEcef.Z)
  };
  const wgsGeo = ecefToGeodetic(wgsEcef.X, wgsEcef.Y, wgsEcef.Z);
  return {
    lat: Math.round(((wgsGeo.latRad * 180) / Math.PI) * 1e7) / 1e7,
    lng: Math.round(((wgsGeo.lonRad * 180) / Math.PI) * 1e7) / 1e7
  };
}
