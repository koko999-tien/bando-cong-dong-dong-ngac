/**
 * DANH MỤC ĐỊA LÝ TOÀN LÃNH THỔ VIỆT NAM SAU SÁP NHẬP (NGHỊ QUYẾT 202/2025/QH15)
 * - Phủ đủ 34 đơn vị hành chính cấp tỉnh hiện hành (6 TP trực thuộc TW + 28 Tỉnh, hiệu lực 01/07/2025).
 * - Giữ trọn vẹn ánh xạ 63 tỉnh/thành trước sáp nhập (`legacyHubs` & `LEGACY_63_TO_34_PROVINCES`)
 *   để người dân tra cứu địa danh cũ hay mới đều tự động định vị chính xác không lag.
 */

export const VIETNAM_BOUNDS = Object.freeze({
  minLat: 8.15,
  maxLat: 23.45,
  minLng: 102.1,
  maxLng: 117.5, // bao gồm vùng biển & quần đảo Hoàng Sa, Trường Sa
  defaultCenter: { lat: 16.0544, lng: 108.2022, zoom: 6 }
});

export const POST_MERGER_PROVINCE_COUNT = 34;
export const LEGACY_63_PROVINCE_COUNT = 63;

export const VIETNAM_MACRO_REGIONS = Object.freeze([
  { id: 'all', label: 'Toàn quốc' },
  { id: 'bac', label: 'Miền Bắc' },
  { id: 'trung', label: 'Miền Trung & Tây Nguyên' },
  { id: 'nam', label: 'Đông Nam Bộ & TP.HCM' },
  { id: 'dbscl', label: 'Đồng bằng sông Cửu Long' }
]);

/**
 * 34 tỉnh/thành phố trực thuộc Trung ương sau Nghị quyết 202/2025/QH15 + vùng baseline Đông Ngạc.
 */
export const VIETNAM_ZONES = Object.freeze([
  // Khu vực thực địa baseline chi tiết
  {
    id: 'vn-hn-dong-ngac',
    name: 'Phường Đông Ngạc – Bắc Từ Liêm, Hà Nội',
    province: 'Hà Nội',
    macroRegion: 'bac',
    lat: 21.072514,
    lng: 105.77387,
    defaultRadiusKm: 2,
    hasVerifiedBaseline: true,
    mergedFrom: ['Hà Nội (Giữ nguyên cấp tỉnh)'],
    legacyHubs: [],
    hazards: ['Ngập cục bộ đô thị', 'Nắng nóng']
  },

  // 6 THÀNH PHỐ TRỰC THUỘC TRUNG ƯƠNG
  {
    id: 'vn-hanoi',
    name: 'TP. Hà Nội',
    province: 'Hà Nội',
    macroRegion: 'bac',
    lat: 21.0285,
    lng: 105.8542,
    defaultRadiusKm: 10,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Ngập đô thị', 'Nắng nóng', 'Ô nhiễm bụi mịn']
  },
  {
    id: 'vn-hcm',
    name: 'TP. Hồ Chí Minh (hợp nhất TP.HCM · Bình Dương · BR-VT)',
    province: 'TP. Hồ Chí Minh',
    macroRegion: 'nam',
    lat: 10.7769,
    lng: 106.7009,
    defaultRadiusKm: 10,
    mergedFrom: ['TP. Hồ Chí Minh', 'Bình Dương', 'Bà Rịa - Vũng Tàu'],
    legacyHubs: [
      { name: 'Thủ Dầu Một (Bình Dương cũ)', lat: 10.9804, lng: 106.6519 },
      { name: 'Vũng Tàu (Bà Rịa – Vũng Tàu cũ)', lat: 10.346, lng: 107.0843 }
    ],
    hazards: ['Ngập triều cường & mưa lớn', 'Đảo nhiệt đô thị', 'Ngập KCN']
  },
  {
    id: 'vn-danang',
    name: 'TP. Đà Nẵng (hợp nhất Đà Nẵng · Quảng Nam)',
    province: 'Đà Nẵng',
    macroRegion: 'trung',
    lat: 16.0544,
    lng: 108.2022,
    defaultRadiusKm: 8,
    mergedFrom: ['Đà Nẵng', 'Quảng Nam'],
    legacyHubs: [
      { name: 'Hội An & Tam Kỳ (Quảng Nam cũ)', lat: 15.8801, lng: 108.338 }
    ],
    hazards: ['Bão & mưa cực đoan', 'Lũ sông Thu Bồn', 'Sạt lở miền núi']
  },
  {
    id: 'vn-haiphong',
    name: 'TP. Hải Phòng (hợp nhất Hải Phòng · Hải Dương)',
    province: 'Hải Phòng',
    macroRegion: 'bac',
    lat: 20.8449,
    lng: 106.6881,
    defaultRadiusKm: 10,
    mergedFrom: ['Hải Phòng', 'Hải Dương'],
    legacyHubs: [
      { name: 'TP. Hải Dương (Hải Dương cũ)', lat: 20.9373, lng: 106.3146 }
    ],
    hazards: ['Bão biển & nước dâng', 'Ngập đô thị']
  },
  {
    id: 'vn-cantho',
    name: 'TP. Cần Thơ (hợp nhất Cần Thơ · Sóc Trăng · Hậu Giang)',
    province: 'Cần Thơ',
    macroRegion: 'dbscl',
    lat: 10.0452,
    lng: 105.7469,
    defaultRadiusKm: 8,
    mergedFrom: ['Cần Thơ', 'Sóc Trăng', 'Hậu Giang'],
    legacyHubs: [
      { name: 'Vị Thanh (Hậu Giang cũ)', lat: 9.7845, lng: 105.4701 },
      { name: 'TP. Sóc Trăng (Sóc Trăng cũ)', lat: 9.6037, lng: 105.98 }
    ],
    hazards: ['Triều cường', 'Sạt lở bờ sông', 'Xâm nhập mặn']
  },
  {
    id: 'vn-hue',
    name: 'TP. Huế',
    province: 'Huế',
    macroRegion: 'trung',
    lat: 16.4637,
    lng: 107.5909,
    defaultRadiusKm: 8,
    mergedFrom: ['Thừa Thiên Huế'],
    legacyHubs: [],
    hazards: ['Mưa lũ lớn', 'Ngập sâu hạ du sông Hương']
  },

  // MIỀN BẮC (13 TỈNH)
  {
    id: 'vn-laocai',
    name: 'Tỉnh Lào Cai (hợp nhất Lào Cai · Yên Bái)',
    province: 'Lào Cai',
    macroRegion: 'bac',
    lat: 22.4856,
    lng: 103.9707,
    defaultRadiusKm: 12,
    mergedFrom: ['Lào Cai', 'Yên Bái'],
    legacyHubs: [
      { name: 'Yên Bái (TP. Yên Bái cũ)', lat: 21.7168, lng: 104.8986 },
      { name: 'Sa Pa (Lào Cai)', lat: 22.3364, lng: 103.8438 }
    ],
    hazards: ['Lũ quét', 'Sạt lở đất miền núi', 'Lũ sông Thao']
  },
  {
    id: 'vn-tuyenquang',
    name: 'Tỉnh Tuyên Quang (hợp nhất Tuyên Quang · Hà Giang)',
    province: 'Tuyên Quang',
    macroRegion: 'bac',
    lat: 21.8236,
    lng: 105.2142,
    defaultRadiusKm: 10,
    mergedFrom: ['Tuyên Quang', 'Hà Giang'],
    legacyHubs: [
      { name: 'Hà Giang (TP. Hà Giang cũ)', lat: 22.8233, lng: 104.9836 }
    ],
    hazards: ['Lũ sông Lô', 'Lũ quét vùng cao', 'Sạt lở đèo dốc']
  },
  {
    id: 'vn-caobang',
    name: 'Tỉnh Cao Bằng',
    province: 'Cao Bằng',
    macroRegion: 'bac',
    lat: 22.6657,
    lng: 106.2579,
    defaultRadiusKm: 12,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Sạt lở đất', 'Lũ ống']
  },
  {
    id: 'vn-thainguyen',
    name: 'Tỉnh Thái Nguyên (hợp nhất Thái Nguyên · Bắc Kạn)',
    province: 'Thái Nguyên',
    macroRegion: 'bac',
    lat: 21.5942,
    lng: 105.8482,
    defaultRadiusKm: 10,
    mergedFrom: ['Thái Nguyên', 'Bắc Kạn'],
    legacyHubs: [
      { name: 'Bắc Kạn (TP. Bắc Kạn cũ)', lat: 22.147, lng: 105.8348 }
    ],
    hazards: ['Lũ sông Cầu', 'Lũ quét miền núi', 'Ngập đô thị']
  },
  {
    id: 'vn-langson',
    name: 'Tỉnh Lạng Sơn',
    province: 'Lạng Sơn',
    macroRegion: 'bac',
    lat: 21.8537,
    lng: 106.7615,
    defaultRadiusKm: 10,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Lũ sông Kỳ Cùng', 'Sạt lở']
  },
  {
    id: 'vn-quangninh',
    name: 'Tỉnh Quảng Ninh (Hạ Long)',
    province: 'Quảng Ninh',
    macroRegion: 'bac',
    lat: 20.9599,
    lng: 107.0425,
    defaultRadiusKm: 10,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Bão lớn', 'Sạt lở bờ mỏ & đồi dốc', 'Ngập ven biển']
  },
  {
    id: 'vn-bacninh',
    name: 'Tỉnh Bắc Ninh (hợp nhất Bắc Ninh · Bắc Giang)',
    province: 'Bắc Ninh',
    macroRegion: 'bac',
    lat: 21.1861,
    lng: 106.0763,
    defaultRadiusKm: 10,
    mergedFrom: ['Bắc Ninh', 'Bắc Giang'],
    legacyHubs: [
      { name: 'TP. Bắc Giang (Bắc Giang cũ)', lat: 21.2731, lng: 106.1946 }
    ],
    hazards: ['Ngập KCN & đô thị', 'Lũ sông Thương/Cầu', 'Ô nhiễm bụi mịn']
  },
  {
    id: 'vn-phutho',
    name: 'Tỉnh Phú Thọ (hợp nhất Phú Thọ · Vĩnh Phúc · Hòa Bình)',
    province: 'Phú Thọ',
    macroRegion: 'bac',
    lat: 21.3227,
    lng: 105.402,
    defaultRadiusKm: 10,
    mergedFrom: ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình'],
    legacyHubs: [
      { name: 'Vĩnh Yên (Vĩnh Phúc cũ)', lat: 21.3089, lng: 105.6049 },
      { name: 'TP. Hòa Bình (Hòa Bình cũ)', lat: 20.8172, lng: 105.3376 }
    ],
    hazards: ['Lũ sông Hồng/Đà', 'Sạt lở & xả lũ hồ chứa', 'Ngập đô thị']
  },
  {
    id: 'vn-hungyen',
    name: 'Tỉnh Hưng Yên (hợp nhất Hưng Yên · Thái Bình)',
    province: 'Hưng Yên',
    macroRegion: 'bac',
    lat: 20.6464,
    lng: 106.0511,
    defaultRadiusKm: 10,
    mergedFrom: ['Hưng Yên', 'Thái Bình'],
    legacyHubs: [
      { name: 'TP. Thái Bình (Thái Bình cũ)', lat: 20.4463, lng: 106.3366 }
    ],
    hazards: ['Bão đổ bộ ven biển', 'Ngập úng cục bộ', 'Nắng nóng']
  },
  {
    id: 'vn-ninhbinh',
    name: 'Tỉnh Ninh Bình (hợp nhất Ninh Bình · Hà Nam · Nam Định)',
    province: 'Ninh Bình',
    macroRegion: 'bac',
    lat: 20.2506,
    lng: 105.9745,
    defaultRadiusKm: 10,
    mergedFrom: ['Ninh Bình', 'Hà Nam', 'Nam Định'],
    legacyHubs: [
      { name: 'Phủ Lý (Hà Nam cũ)', lat: 20.5411, lng: 105.9229 },
      { name: 'TP. Nam Định (Nam Định cũ)', lat: 20.4388, lng: 106.1621 }
    ],
    hazards: ['Lũ sông Đáy/Hoàng Long', 'Bão ven biển & đê biển', 'Ngập vùng trũng']
  },
  {
    id: 'vn-sonla',
    name: 'Tỉnh Sơn La',
    province: 'Sơn La',
    macroRegion: 'bac',
    lat: 21.3256,
    lng: 103.9188,
    defaultRadiusKm: 12,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Lũ quét', 'Sạt lở đất', 'Mưa đá']
  },
  {
    id: 'vn-dienbien',
    name: 'Tỉnh Điện Biên',
    province: 'Điện Biên',
    macroRegion: 'bac',
    lat: 21.386,
    lng: 103.023,
    defaultRadiusKm: 12,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Lũ quét', 'Sạt lở']
  },
  {
    id: 'vn-laichau',
    name: 'Tỉnh Lai Châu',
    province: 'Lai Châu',
    macroRegion: 'bac',
    lat: 22.3964,
    lng: 103.4582,
    defaultRadiusKm: 12,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Lũ quét', 'Sạt lở đất']
  },

  // MIỀN TRUNG & TÂY NGUYÊN (9 TỈNH)
  {
    id: 'vn-thanhhoa',
    name: 'Tỉnh Thanh Hóa',
    province: 'Thanh Hóa',
    macroRegion: 'trung',
    lat: 19.8067,
    lng: 105.7852,
    defaultRadiusKm: 10,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Bão', 'Lũ sông Mã', 'Nắng nóng gió Lào']
  },
  {
    id: 'vn-nghean',
    name: 'Tỉnh Nghệ An (TP. Vinh)',
    province: 'Nghệ An',
    macroRegion: 'trung',
    lat: 18.6796,
    lng: 105.6813,
    defaultRadiusKm: 10,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Nắng nóng cực đoan', 'Mưa ngập đô thị', 'Lũ quét miền Tây']
  },
  {
    id: 'vn-hatinh',
    name: 'Tỉnh Hà Tĩnh',
    province: 'Hà Tĩnh',
    macroRegion: 'trung',
    lat: 18.3428,
    lng: 105.9057,
    defaultRadiusKm: 10,
    mergedFrom: [],
    legacyHubs: [],
    hazards: ['Mưa lũ lớn', 'Bão mạnh', 'Nắng nóng']
  },
  {
    id: 'vn-quangtri',
    name: 'Tỉnh Quảng Trị (hợp nhất Quảng Trị · Quảng Bình)',
    province: 'Quảng Trị',
    macroRegion: 'trung',
    lat: 16.8163,
    lng: 107.1003,
    defaultRadiusKm: 10,
    mergedFrom: ['Quảng Trị', 'Quảng Bình'],
    legacyHubs: [
      { name: 'Đồng Hới (Quảng Bình cũ)', lat: 17.4689, lng: 106.6223 }
    ],
    hazards: ['Lũ lớn sông Kiến Giang/Gianh', 'Bão', 'Sạt lở miền núi']
  },
  {
    id: 'vn-quangngai',
    name: 'Tỉnh Quảng Ngãi (hợp nhất Quảng Ngãi · Kon Tum)',
    province: 'Quảng Ngãi',
    macroRegion: 'trung',
    lat: 15.1214,
    lng: 108.8044,
    defaultRadiusKm: 10,
    mergedFrom: ['Quảng Ngãi', 'Kon Tum'],
    legacyHubs: [
      { name: 'TP. Kon Tum (Kon Tum cũ)', lat: 14.3497, lng: 108.0005 }
    ],
    hazards: ['Bão', 'Lũ sông Trà Khúc', 'Sạt lở Tây Nguyên']
  },
  {
    id: 'vn-gialai',
    name: 'Tỉnh Gia Lai (hợp nhất Gia Lai · Bình Định)',
    province: 'Gia Lai',
    macroRegion: 'trung',
    lat: 13.9833,
    lng: 108.0,
    defaultRadiusKm: 10,
    mergedFrom: ['Gia Lai', 'Bình Định'],
    legacyHubs: [
      { name: 'Quy Nhơn (Bình Định cũ)', lat: 13.783, lng: 109.2197 }
    ],
    hazards: ['Bão & ngập hạ du sông Kôn', 'Hạn hán Tây Nguyên', 'Mưa dông lốc']
  },
  {
    id: 'vn-daklak',
    name: 'Tỉnh Đắk Lắk (hợp nhất Đắk Lắk · Phú Yên)',
    province: 'Đắk Lắk',
    macroRegion: 'trung',
    lat: 12.6667,
    lng: 108.05,
    defaultRadiusKm: 10,
    mergedFrom: ['Đắk Lắk', 'Phú Yên'],
    legacyHubs: [
      { name: 'Tuy Hòa (Phú Yên cũ)', lat: 13.0955, lng: 109.3209 }
    ],
    hazards: ['Lũ sông Ba', 'Bão ven biển', 'Hạn hán mùa khô']
  },
  {
    id: 'vn-khanhhoa',
    name: 'Tỉnh Khánh Hòa (hợp nhất Khánh Hòa · Ninh Thuận)',
    province: 'Khánh Hòa',
    macroRegion: 'trung',
    lat: 12.2388,
    lng: 109.1967,
    defaultRadiusKm: 8,
    mergedFrom: ['Khánh Hòa', 'Ninh Thuận'],
    legacyHubs: [
      { name: 'Phan Rang (Ninh Thuận cũ)', lat: 11.5643, lng: 108.9886 }
    ],
    hazards: ['Mưa lũ & sạt lở sườn núi', 'Bão', 'Hạn hán nắng nóng']
  },
  {
    id: 'vn-lamdong',
    name: 'Tỉnh Lâm Đồng (hợp nhất Lâm Đồng · Đắk Nông · Bình Thuận)',
    province: 'Lâm Đồng',
    macroRegion: 'trung',
    lat: 11.9404,
    lng: 108.4583,
    defaultRadiusKm: 10,
    mergedFrom: ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận'],
    legacyHubs: [
      { name: 'Gia Nghĩa (Đắk Nông cũ)', lat: 12.0033, lng: 107.6876 },
      { name: 'Phan Thiết (Bình Thuận cũ)', lat: 10.9289, lng: 108.1021 }
    ],
    hazards: ['Sạt lở taluy', 'Ngập cục bộ đô thị', 'Lũ cát ven biển']
  },

  // ĐÔNG NAM BỘ (2 TỈNH + TP.HCM)
  {
    id: 'vn-dongnai',
    name: 'Tỉnh Đồng Nai (hợp nhất Đồng Nai · Bình Phước)',
    province: 'Đồng Nai',
    macroRegion: 'nam',
    lat: 10.9574,
    lng: 106.8427,
    defaultRadiusKm: 10,
    mergedFrom: ['Đồng Nai', 'Bình Phước'],
    legacyHubs: [
      { name: 'Đồng Xoài (Bình Phước cũ)', lat: 11.535, lng: 106.8832 }
    ],
    hazards: ['Ngập đô thị Biên Hòa', 'Triều cường sông Đồng Nai', 'Dông lốc']
  },
  {
    id: 'vn-tayninh',
    name: 'Tỉnh Tây Ninh (hợp nhất Tây Ninh · Long An)',
    province: 'Tây Ninh',
    macroRegion: 'nam',
    lat: 11.31,
    lng: 106.0983,
    defaultRadiusKm: 10,
    mergedFrom: ['Tây Ninh', 'Long An'],
    legacyHubs: [
      { name: 'Tân An (Long An cũ)', lat: 10.5359, lng: 106.4137 }
    ],
    hazards: ['Nắng nóng gay gắt', 'Xâm nhập mặn', 'Ngập triều vùng hạ']
  },

  // ĐỒNG BẰNG SÔNG CỬU LONG (4 TỈNH + TP. CẦN THƠ)
  {
    id: 'vn-dongthap',
    name: 'Tỉnh Đồng Tháp (hợp nhất Đồng Tháp · Tiền Giang)',
    province: 'Đồng Tháp',
    macroRegion: 'dbscl',
    lat: 10.4592,
    lng: 105.6325,
    defaultRadiusKm: 10,
    mergedFrom: ['Đồng Tháp', 'Tiền Giang'],
    legacyHubs: [
      { name: 'Mỹ Tho (Tiền Giang cũ)', lat: 10.36, lng: 106.36 }
    ],
    hazards: ['Lũ đầu nguồn sông Tiền', 'Xâm nhập mặn', 'Sạt lở bờ sông']
  },
  {
    id: 'vn-vinhlong',
    name: 'Tỉnh Vĩnh Long (hợp nhất Vĩnh Long · Bến Tre · Trà Vinh)',
    province: 'Vĩnh Long',
    macroRegion: 'dbscl',
    lat: 10.2537,
    lng: 105.9722,
    defaultRadiusKm: 10,
    mergedFrom: ['Vĩnh Long', 'Bến Tre', 'Trà Vinh'],
    legacyHubs: [
      { name: 'TP. Bến Tre (Bến Tre cũ)', lat: 10.2433, lng: 106.3756 },
      { name: 'TP. Trà Vinh (Trà Vinh cũ)', lat: 9.9347, lng: 106.3453 }
    ],
    hazards: ['Triều cường', 'Hạn mặn', 'Sạt lở bờ sông']
  },
  {
    id: 'vn-camau',
    name: 'Tỉnh Cà Mau (hợp nhất Cà Mau · Bạc Liêu)',
    province: 'Cà Mau',
    macroRegion: 'dbscl',
    lat: 9.1768,
    lng: 105.1524,
    defaultRadiusKm: 12,
    mergedFrom: ['Cà Mau', 'Bạc Liêu'],
    legacyHubs: [
      { name: 'TP. Bạc Liêu (Bạc Liêu cũ)', lat: 9.2941, lng: 105.7278 }
    ],
    hazards: ['Sụt lún đất', 'Xói lở bờ biển', 'Hạn mặn & triều cường']
  },
  {
    id: 'vn-angiang',
    name: 'Tỉnh An Giang (hợp nhất An Giang · Kiên Giang)',
    province: 'An Giang',
    macroRegion: 'dbscl',
    lat: 10.3864,
    lng: 105.4352,
    defaultRadiusKm: 10,
    mergedFrom: ['An Giang', 'Kiên Giang'],
    legacyHubs: [
      { name: 'Rạch Giá & Phú Quốc (Kiên Giang cũ)', lat: 10.0125, lng: 105.0809 }
    ],
    hazards: ['Sạt lở bờ sông', 'Lũ sông Hậu', 'Ngập ven biển Tây']
  }
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

export const LEGACY_63_TO_34_PROVINCES = (() => {
  const map = {};
  for (const z of VIETNAM_ZONES) {
    if (z.id === 'vn-hn-dong-ngac') continue;
    map[z.province] = { postProvince: z.province, zoneId: z.id, lat: z.lat, lng: z.lng };
    for (const oldName of z.mergedFrom || []) {
      map[oldName] = { postProvince: z.province, zoneId: z.id, lat: z.lat, lng: z.lng };
    }
  }
  return Object.freeze(map);
})();

export function resolvePostMergerProvince(name = '') {
  const clean = stripVietnameseTones(name);
  if (!clean) return null;
  for (const [legacy, info] of Object.entries(LEGACY_63_TO_34_PROVINCES)) {
    if (stripVietnameseTones(legacy) === clean) {
      return { legacyName: legacy, province: info.postProvince, zoneId: info.zoneId, lat: info.lat, lng: info.lng };
    }
  }
  return null;
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
 * Tìm kiếm khu vực toàn quốc theo cả danh mục 34 tỉnh/thành sau sáp nhập lẫn 63 địa danh cũ.
 */
export function searchVietnamZones(query = '', macroRegion = 'all', limit = 15) {
  const q = stripVietnameseTones(query);
  const results = [];
  for (const z of VIETNAM_ZONES) {
    if (macroRegion && macroRegion !== 'all' && z.macroRegion !== macroRegion) continue;
    const hubsStr = (z.legacyHubs || []).map((h) => h.name).join(' ');
    const hay = stripVietnameseTones(`${z.name} ${z.province} ${(z.mergedFrom || []).join(' ')} ${hubsStr} ${(z.hazards || []).join(' ')}`);
    if (!q || hay.includes(q)) {
      results.push(z);
    }
    if (q) {
      for (const hub of z.legacyHubs || []) {
        if (stripVietnameseTones(hub.name).includes(q)) {
          results.push({
            ...z,
            id: `${z.id}-${stripVietnameseTones(hub.name).slice(0, 12).replace(/[^a-z0-9]/g, '')}`,
            name: `${hub.name} — Nay thuộc ${z.province} (Sau sáp nhập 2025)`,
            lat: hub.lat,
            lng: hub.lng
          });
        }
      }
    }
  }
  return results.slice(0, limit);
}

/**
 * LÕI CHỐNG LAG: Chỉ giữ lại các đối tượng nằm TRONG vòng khoanh vùng (lat, lng, radiusKm).
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
 * Xác định tỉnh/thành sau sáp nhập gần nhất với một tọa độ bất kỳ trên lãnh thổ Việt Nam.
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
    for (const hub of z.legacyHubs || []) {
      const dh = haversineMeters(lat, lng, hub.lat, hub.lng);
      if (dh < bestDist) {
        bestDist = dh;
        best = { ...z, distanceMeters: dh };
      }
    }
  }
  return best;
}
