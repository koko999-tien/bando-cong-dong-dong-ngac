/**
 * DANH MỤC ĐỊA LÝ TOÀN LÃNH THỔ VIỆT NAM & CÔNG CỤ KHOANH VÙNG CHỐNG LAG
 * Phủ đủ 63 tỉnh/thành phố trực thuộc Trung ương + các tiểu vùng trọng điểm rủi ro khí hậu,
 * hỗ trợ tìm kiếm nhanh không dấu, xác thực tọa độ trong lãnh thổ Việt Nam và lọc chỉ hiển thị
 * dữ liệu nằm trong bán kính khoanh vùng đang chọn.
 */

export const VIETNAM_BOUNDS = Object.freeze({
  minLat: 8.15,
  maxLat: 23.45,
  minLng: 102.1,
  maxLng: 117.5, // bao gồm vùng biển & quần đảo Hoàng Sa, Trường Sa
  defaultCenter: { lat: 16.0544, lng: 108.2022, zoom: 6 }
});

export const VIETNAM_MACRO_REGIONS = Object.freeze([
  { id: 'all', label: 'Toàn quốc' },
  { id: 'bac', label: 'Miền Bắc' },
  { id: 'trung', label: 'Miền Trung' },
  { id: 'tay-nguyen', label: 'Tây Nguyên' },
  { id: 'nam', label: 'Đông Nam Bộ & TP.HCM' },
  { id: 'dbscl', label: 'Đồng bằng sông Cửu Long' }
]);

/**
 * Danh mục chuẩn 63 tỉnh/thành phố Việt Nam + khu vực thực địa chi tiết đã xác minh.
 * Tọa độ trung tâm hành chính theo EPSG:4326 (WGS84), kèm mã vùng miền và nhóm rủi ro đặc trưng.
 */
export const VIETNAM_ZONES = Object.freeze([
  // Khu vực có bộ dữ liệu khảo sát chi tiết đã xác minh trên bản đồ chính
  { id: 'vn-hn-dong-ngac', name: 'Phường Đông Ngạc – Bắc Từ Liêm, Hà Nội', province: 'Hà Nội', macroRegion: 'bac', lat: 21.072514, lng: 105.77387, defaultRadiusKm: 2, hasVerifiedBaseline: true, hazards: ['Ngập cục bộ đô thị', 'Nắng nóng'] },

  // 63 Tỉnh / Thành phố trực thuộc Trung ương
  { id: 'vn-hanoi', name: 'TP. Hà Nội (Trung tâm)', province: 'Hà Nội', macroRegion: 'bac', lat: 21.0285, lng: 105.8542, defaultRadiusKm: 10, hazards: ['Ngập đô thị', 'Nắng nóng', 'Ô nhiễm bụi mịn'] },
  { id: 'vn-hcm', name: 'TP. Hồ Chí Minh', province: 'TP. Hồ Chí Minh', macroRegion: 'nam', lat: 10.7769, lng: 106.7009, defaultRadiusKm: 10, hazards: ['Ngập triều cường & mưa lớn', 'Đảo nhiệt đô thị'] },
  { id: 'vn-danang', name: 'TP. Đà Nẵng', province: 'Đà Nẵng', macroRegion: 'trung', lat: 16.0544, lng: 108.2022, defaultRadiusKm: 8, hazards: ['Bão & mưa cực đoan', 'Ngập ven biển', 'Sạt lở sườn dốc'] },
  { id: 'vn-haiphong', name: 'TP. Hải Phòng', province: 'Hải Phòng', macroRegion: 'bac', lat: 20.8449, lng: 106.6881, defaultRadiusKm: 10, hazards: ['Bão biển & nước dâng', 'Ngập đô thị'] },
  { id: 'vn-cantho', name: 'TP. Cần Thơ', province: 'Cần Thơ', macroRegion: 'dbscl', lat: 10.0452, lng: 105.7469, defaultRadiusKm: 8, hazards: ['Triều cường', 'Sạt lở bờ sông', 'Xâm nhập mặn'] },
  { id: 'vn-hue', name: 'TP. Huế (Thừa Thiên Huế)', province: 'Thừa Thiên Huế', macroRegion: 'trung', lat: 16.4637, lng: 107.5909, defaultRadiusKm: 8, hazards: ['Mưa lũ lớn', 'Ngập sâu hạ du sông Hương'] },

  // Miền Bắc (Đồng bằng sông Hồng, Đông Bắc, Tây Bắc)
  { id: 'vn-laocai', name: 'Lào Cai (TP. Lào Cai & Sa Pa)', province: 'Lào Cai', macroRegion: 'bac', lat: 22.4856, lng: 103.9707, defaultRadiusKm: 12, hazards: ['Lũ quét', 'Sạt lở đất miền núi', 'Rét đậm'] },
  { id: 'vn-yenbai', name: 'Yên Bái', province: 'Yên Bái', macroRegion: 'bac', lat: 21.7168, lng: 104.8986, defaultRadiusKm: 12, hazards: ['Lũ sông Thao', 'Sạt lở đất'] },
  { id: 'vn-hagiang', name: 'Hà Giang', province: 'Hà Giang', macroRegion: 'bac', lat: 22.8233, lng: 104.9836, defaultRadiusKm: 12, hazards: ['Lũ quét', 'Sạt lở đèo dốc'] },
  { id: 'vn-caobang', name: 'Cao Bằng', province: 'Cao Bằng', macroRegion: 'bac', lat: 22.6657, lng: 106.2579, defaultRadiusKm: 12, hazards: ['Sạt lở đất', 'Lũ ống'] },
  { id: 'vn-backan', name: 'Bắc Kạn', province: 'Bắc Kạn', macroRegion: 'bac', lat: 22.147, lng: 105.8348, defaultRadiusKm: 12, hazards: ['Lũ quét', 'Sạt lở đất'] },
  { id: 'vn-tuyenquang', name: 'Tuyên Quang', province: 'Tuyên Quang', macroRegion: 'bac', lat: 21.8236, lng: 105.2142, defaultRadiusKm: 10, hazards: ['Lũ sông Lô', 'Ngập hạ du'] },
  { id: 'vn-thainguyen', name: 'Thái Nguyên', province: 'Thái Nguyên', macroRegion: 'bac', lat: 21.5942, lng: 105.8482, defaultRadiusKm: 10, hazards: ['Lũ sông Cầu', 'Ngập đô thị'] },
  { id: 'vn-langson', name: 'Lạng Sơn', province: 'Lạng Sơn', macroRegion: 'bac', lat: 21.8537, lng: 106.7615, defaultRadiusKm: 10, hazards: ['Lũ sông Kỳ Cùng', 'Sạt lở'] },
  { id: 'vn-quangninh', name: 'Quảng Ninh (Hạ Long)', province: 'Quảng Ninh', macroRegion: 'bac', lat: 20.9599, lng: 107.0425, defaultRadiusKm: 10, hazards: ['Bão lớn', 'Sạt lở bờ mỏ & đồi dốc', 'Ngập ven biển'] },
  { id: 'vn-bacgiang', name: 'Bắc Giang', province: 'Bắc Giang', macroRegion: 'bac', lat: 21.2731, lng: 106.1946, defaultRadiusKm: 10, hazards: ['Lũ sông Thương/Lục Nam', 'Nắng nóng'] },
  { id: 'vn-phutho', name: 'Phú Thọ (Việt Trì)', province: 'Phú Thọ', macroRegion: 'bac', lat: 21.3227, lng: 105.402, defaultRadiusKm: 10, hazards: ['Lũ sông Hồng/Đà', 'Sạt lở bờ sông'] },
  { id: 'vn-vinhphuc', name: 'Vĩnh Phúc', province: 'Vĩnh Phúc', macroRegion: 'bac', lat: 21.3089, lng: 105.6049, defaultRadiusKm: 10, hazards: ['Ngập úng đô thị', 'Nắng nóng'] },
  { id: 'vn-bacninh', name: 'Bắc Ninh', province: 'Bắc Ninh', macroRegion: 'bac', lat: 21.1861, lng: 106.0763, defaultRadiusKm: 10, hazards: ['Ngập KCN & đô thị', 'Ô nhiễm không khí'] },
  { id: 'vn-haiduong', name: 'Hải Dương', province: 'Hải Dương', macroRegion: 'bac', lat: 20.9373, lng: 106.3146, defaultRadiusKm: 10, hazards: ['Mưa bão', 'Ngập úng'] },
  { id: 'vn-hungyen', name: 'Hưng Yên', province: 'Hưng Yên', macroRegion: 'bac', lat: 20.6464, lng: 106.0511, defaultRadiusKm: 10, hazards: ['Nắng nóng', 'Ngập cục bộ'] },
  { id: 'vn-thaibinh', name: 'Thái Bình', province: 'Thái Bình', macroRegion: 'bac', lat: 20.4463, lng: 106.3366, defaultRadiusKm: 10, hazards: ['Bão đổ bộ ven biển', 'Ngập úng nông nghiệp'] },
  { id: 'vn-hanam', name: 'Hà Nam', province: 'Hà Nam', macroRegion: 'bac', lat: 20.5411, lng: 105.9229, defaultRadiusKm: 10, hazards: ['Lũ sông Đáy', 'Ngập úng'] },
  { id: 'vn-namdinh', name: 'Nam Định', province: 'Nam Định', macroRegion: 'bac', lat: 20.4388, lng: 106.1621, defaultRadiusKm: 10, hazards: ['Bão ven biển', 'Xói lở đê biển'] },
  { id: 'vn-ninhbinh', name: 'Ninh Bình', province: 'Ninh Bình', macroRegion: 'bac', lat: 20.2506, lng: 105.9745, defaultRadiusKm: 10, hazards: ['Lũ sông Hoàng Long', 'Ngập vùng trũng'] },
  { id: 'vn-hoabinh', name: 'Hòa Bình', province: 'Hòa Bình', macroRegion: 'bac', lat: 20.8172, lng: 105.3376, defaultRadiusKm: 12, hazards: ['Sạt lở đất', 'Xả lũ hồ chứa'] },
  { id: 'vn-sonla', name: 'Sơn La', province: 'Sơn La', macroRegion: 'bac', lat: 21.3256, lng: 103.9188, defaultRadiusKm: 12, hazards: ['Lũ quét', 'Sạt lở đất', 'Mưa đá'] },
  { id: 'vn-dienbien', name: 'Điện Biên', province: 'Điện Biên', macroRegion: 'bac', lat: 21.386, lng: 103.023, defaultRadiusKm: 12, hazards: ['Lũ quét', 'Sạt lở'] },
  { id: 'vn-laichau', name: 'Lai Châu', province: 'Lai Châu', macroRegion: 'bac', lat: 22.3964, lng: 103.4582, defaultRadiusKm: 12, hazards: ['Lũ quét', 'Sạt lở đất'] },

  // Miền Trung (Bắc Trung Bộ & Duyên hải Nam Trung Bộ)
  { id: 'vn-thanhhoa', name: 'Thanh Hóa', province: 'Thanh Hóa', macroRegion: 'trung', lat: 19.8067, lng: 105.7852, defaultRadiusKm: 10, hazards: ['Bão', 'Lũ sông Mã', 'Nắng nóng gió Lào'] },
  { id: 'vn-nghean', name: 'Nghệ An (TP. Vinh)', province: 'Nghệ An', macroRegion: 'trung', lat: 18.6796, lng: 105.6813, defaultRadiusKm: 10, hazards: ['Nắng nóng cực đoan', 'Mưa ngập đô thị', 'Lũ quét miền Tây'] },
  { id: 'vn-hatinh', name: 'Hà Tĩnh', province: 'Hà Tĩnh', macroRegion: 'trung', lat: 18.3428, lng: 105.9057, defaultRadiusKm: 10, hazards: ['Mưa lũ lớn', 'Bão mạnh', 'Nắng nóng'] },
  { id: 'vn-quangbinh', name: 'Quảng Bình (Đồng Hới)', province: 'Quảng Bình', macroRegion: 'trung', lat: 17.4689, lng: 106.6223, defaultRadiusKm: 10, hazards: ['Lũ lớn sông Kiến Giang/Gianh', 'Bão'] },
  { id: 'vn-quangtri', name: 'Quảng Trị (Đông Hà)', province: 'Quảng Trị', macroRegion: 'trung', lat: 16.8163, lng: 107.1003, defaultRadiusKm: 10, hazards: ['Mưa lũ', 'Sạt lở miền núi', 'Nắng nóng'] },
  { id: 'vn-quangnam', name: 'Quảng Nam (Tam Kỳ & Hội An)', province: 'Quảng Nam', macroRegion: 'trung', lat: 15.8801, lng: 108.338, defaultRadiusKm: 10, hazards: ['Lũ sông Thu Bồn', 'Sạt lở bờ biển & miền núi'] },
  { id: 'vn-quangngai', name: 'Quảng Ngãi', province: 'Quảng Ngãi', macroRegion: 'trung', lat: 15.1214, lng: 108.8044, defaultRadiusKm: 10, hazards: ['Bão', 'Lũ sông Trà Khúc', 'Sạt lở'] },
  { id: 'vn-binhdinh', name: 'Bình Định (Quy Nhơn)', province: 'Bình Định', macroRegion: 'trung', lat: 13.783, lng: 109.2197, defaultRadiusKm: 10, hazards: ['Bão & mưa lũ', 'Ngập hạ du sông Kôn'] },
  { id: 'vn-phuyen', name: 'Phú Yên (Tuy Hòa)', province: 'Phú Yên', macroRegion: 'trung', lat: 13.0955, lng: 109.3209, defaultRadiusKm: 10, hazards: ['Lũ sông Ba', 'Bão'] },
  { id: 'vn-khanhhoa', name: 'Khánh Hòa (Nha Trang)', province: 'Khánh Hòa', macroRegion: 'trung', lat: 12.2388, lng: 109.1967, defaultRadiusKm: 8, hazards: ['Mưa lũ & sạt lở sườn núi', 'Bão'] },
  { id: 'vn-ninhthuan', name: 'Ninh Thuận (Phan Rang)', province: 'Ninh Thuận', macroRegion: 'trung', lat: 11.5643, lng: 108.9886, defaultRadiusKm: 10, hazards: ['Hạn hán', 'Nắng nóng gay gắt'] },
  { id: 'vn-binhthuan', name: 'Bình Thuận (Phan Thiết)', province: 'Bình Thuận', macroRegion: 'trung', lat: 10.9289, lng: 108.1021, defaultRadiusKm: 10, hazards: ['Lũ cát đỏ', 'Hạn hán', 'Sạt lở ven biển'] },

  // Tây Nguyên
  { id: 'vn-kontum', name: 'Kon Tum', province: 'Kon Tum', macroRegion: 'tay-nguyen', lat: 14.3497, lng: 108.0005, defaultRadiusKm: 12, hazards: ['Sạt lở đất', 'Động đất kích thích', 'Lũ quét'] },
  { id: 'vn-gialai', name: 'Gia Lai (Pleiku)', province: 'Gia Lai', macroRegion: 'tay-nguyen', lat: 13.9833, lng: 108.0, defaultRadiusKm: 12, hazards: ['Hạn hán mùa khô', 'Mưa dông lốc'] },
  { id: 'vn-daklak', name: 'Đắk Lắk (Buôn Ma Thuột)', province: 'Đắk Lắk', macroRegion: 'tay-nguyen', lat: 12.6667, lng: 108.05, defaultRadiusKm: 10, hazards: ['Hạn hán', 'Ngập cục bộ & lũ quét'] },
  { id: 'vn-daknong', name: 'Đắk Nông (Gia Nghĩa)', province: 'Đắk Nông', macroRegion: 'tay-nguyen', lat: 12.0033, lng: 107.6876, defaultRadiusKm: 12, hazards: ['Sạt lở đất sườn đồi', 'Mưa lớn'] },
  { id: 'vn-lamdong', name: 'Lâm Đồng (Đà Lạt & Bảo Lộc)', province: 'Lâm Đồng', macroRegion: 'tay-nguyen', lat: 11.9404, lng: 108.4583, defaultRadiusKm: 10, hazards: ['Sạt lở taluy', 'Ngập cục bộ đô thị'] },

  // Đông Nam Bộ
  { id: 'vn-binhphuoc', name: 'Bình Phước', province: 'Bình Phước', macroRegion: 'nam', lat: 11.535, lng: 106.8832, defaultRadiusKm: 12, hazards: ['Nắng nóng', 'Dông lốc'] },
  { id: 'vn-tayninh', name: 'Tây Ninh', province: 'Tây Ninh', macroRegion: 'nam', lat: 11.31, lng: 106.0983, defaultRadiusKm: 10, hazards: ['Nắng nóng gay gắt', 'Dông sét'] },
  { id: 'vn-binhduong', name: 'Bình Dương (Thủ Dầu Một)', province: 'Bình Dương', macroRegion: 'nam', lat: 10.9804, lng: 106.6519, defaultRadiusKm: 10, hazards: ['Ngập đô thị & KCN', 'Nắng nóng'] },
  { id: 'vn-dongnai', name: 'Đồng Nai (Biên Hòa)', province: 'Đồng Nai', macroRegion: 'nam', lat: 10.9574, lng: 106.8427, defaultRadiusKm: 10, hazards: ['Ngập đô thị', 'Triều cường sông Đồng Nai'] },
  { id: 'vn-baria-vungtau', name: 'Bà Rịa – Vũng Tàu', province: 'Bà Rịa – Vũng Tàu', macroRegion: 'nam', lat: 10.346, lng: 107.0843, defaultRadiusKm: 10, hazards: ['Triều cường ven biển', 'Gió mạnh ngoài khơi'] },

  // Đồng bằng sông Cửu Long
  { id: 'vn-longan', name: 'Long An (Tân An)', province: 'Long An', macroRegion: 'dbscl', lat: 10.5359, lng: 106.4137, defaultRadiusKm: 10, hazards: ['Xâm nhập mặn', 'Ngập triều'] },
  { id: 'vn-tiengiang', name: 'Tiền Giang (Mỹ Tho)', province: 'Tiền Giang', macroRegion: 'dbscl', lat: 10.36, lng: 106.36, defaultRadiusKm: 10, hazards: ['Xâm nhập mặn', 'Sạt lở bờ sông'] },
  { id: 'vn-bentre', name: 'Bến Tre', province: 'Bến Tre', macroRegion: 'dbscl', lat: 10.2433, lng: 106.3756, defaultRadiusKm: 10, hazards: ['Hạn mặn', 'Sạt lở bờ sông/biển'] },
  { id: 'vn-travinh', name: 'Trà Vinh', province: 'Trà Vinh', macroRegion: 'dbscl', lat: 9.9347, lng: 106.3453, defaultRadiusKm: 10, hazards: ['Xâm nhập mặn', 'Triều cường'] },
  { id: 'vn-vinhlong', name: 'Vĩnh Long', province: 'Vĩnh Long', macroRegion: 'dbscl', lat: 10.2537, lng: 105.9722, defaultRadiusKm: 10, hazards: ['Triều cường', 'Sạt lở bờ sông'] },
  { id: 'vn-dongthap', name: 'Đồng Tháp (Cao Lãnh)', province: 'Đồng Tháp', macroRegion: 'dbscl', lat: 10.4592, lng: 105.6325, defaultRadiusKm: 10, hazards: ['Lũ đầu nguồn sông Tiền', 'Sạt lở bờ sông'] },
  { id: 'vn-angiang', name: 'An Giang (Long Xuyên)', province: 'An Giang', macroRegion: 'dbscl', lat: 10.3864, lng: 105.4352, defaultRadiusKm: 10, hazards: ['Sạt lở bờ sông', 'Lũ sông Hậu'] },
  { id: 'vn-kiengiang', name: 'Kiên Giang (Rạch Giá & Phú Quốc)', province: 'Kiên Giang', macroRegion: 'dbscl', lat: 10.0125, lng: 105.0809, defaultRadiusKm: 12, hazards: ['Ngập ven biển', 'Dông lốc biển Tây'] },
  { id: 'vn-haugiang', name: 'Hậu Giang (Vị Thanh)', province: 'Hậu Giang', macroRegion: 'dbscl', lat: 9.7845, lng: 105.4701, defaultRadiusKm: 10, hazards: ['Triều cường', 'Xâm nhập mặn'] },
  { id: 'vn-soctrang', name: 'Sóc Trăng', province: 'Sóc Trăng', macroRegion: 'dbscl', lat: 9.6037, lng: 105.98, defaultRadiusKm: 10, hazards: ['Hạn mặn', 'Xói lở đê biển'] },
  { id: 'vn-baclieu', name: 'Bạc Liêu', province: 'Bạc Liêu', macroRegion: 'dbscl', lat: 9.2941, lng: 105.7278, defaultRadiusKm: 10, hazards: ['Triều cường', 'Sụt lún & xói lở'] },
  { id: 'vn-camau', name: 'Cà Mau', province: 'Cà Mau', macroRegion: 'dbscl', lat: 9.1768, lng: 105.1524, defaultRadiusKm: 12, hazards: ['Sụt lún đất', 'Xói lở bờ biển', 'Hạn mặn mùa khô'] }
]);

export function stripVietnameseTones(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function isInsideVietnam(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= VIETNAM_BOUNDS.minLat &&
    lat <= VIETNAM_BOUNDS.maxLat &&
    lng >= VIETNAM_BOUNDS.minLng &&
    lng <= VIETNAM_BOUNDS.maxLng
  );
}

/**
 * Tìm kiếm khu vực toàn quốc (hỗ trợ không dấu, tỉnh/thành, vùng miền).
 */
export function searchVietnamZones(query = '', macroRegion = 'all', limit = 15) {
  const q = stripVietnameseTones(query);
  return VIETNAM_ZONES.filter((z) => {
    if (macroRegion && macroRegion !== 'all' && z.macroRegion !== macroRegion) return false;
    if (!q) return true;
    const hay = stripVietnameseTones(`${z.name} ${z.province} ${(z.hazards || []).join(' ')}`);
    return hay.includes(q);
  }).slice(0, limit);
}

/**
 * LÕI CHỐNG LAG: Chỉ giữ lại các đối tượng nằm TRONG vòng khoanh vùng (lat, lng, radiusKm).
 * Không bao giờ đổ toàn bộ bản đồ cả nước ra DOM cùng lúc.
 */
export function filterFeaturesInZone(features = [], centerLat, centerLng, radiusKm = 5, maxItems = 250) {
  const maxMeters = Math.max(200, Math.min(100_000, Number(radiusKm || 5) * 1000));
  const inside = [];
  for (const f of features) {
    if (!f || f.status === 'hidden') continue;
    const lat = Number(f.lat);
    const lng = Number(f.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMeters(centerLat, centerLng, lat, lng);
    if (d <= maxMeters) {
      inside.push({ ...f, distanceMeters: d });
    }
  }
  inside.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return inside.slice(0, maxItems);
}

/**
 * Xác định khu vực hành chính gần nhất với một tọa độ bất kỳ trên lãnh thổ Việt Nam.
 */
export function findNearestVietnamZone(lat, lng) {
  if (!isInsideVietnam(lat, lng)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const z of VIETNAM_ZONES) {
    const d = haversineMeters(lat, lng, z.lat, z.lng);
    if (d < bestDist) {
      bestDist = d;
      best = { ...z, distanceMeters: d };
    }
  }
  return best;
}
