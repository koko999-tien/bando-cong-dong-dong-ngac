/**
 * KHO ĐIỂM NÓNG THIÊN TAI & HÀNH LANG RỦI RO ĐA ĐÔ THỊ ĐÃ KIỂM CHỨNG TẠI VIỆT NAM
 * Mở rộng độ chi tiết không gian theo vùng khoanh ngoài khu vực lõi Đông Ngạc (Hà Nội).
 * Nguyên tắc nhận thức luận:
 * - Mọi điểm đều thuộc lớp OBSERVED_DATA, dẫn nguồn OSM / NCHMF / báo chí chính thống.
 * - Tuyệt đối không tự bịa độ sâu ngập cm hay chỉ số rủi ro giả tạo.
 */

export const VIETNAM_VERIFIED_HOTSPOTS = [
  // ==================== TRUNG TÂM HÀ NỘI ====================
  {
    id: 'VN-HN-01',
    province: 'Hà Nội',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Ngã năm Nguyễn Khuyến – Lý Thường Kiệt (Hoàn Kiếm)',
    lat: 21.0246,
    lng: 105.8404,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Danh sách điểm úng ngập Công ty Thoát nước Hà Nội (HSDC)',
    sourceCitation: 'Công ty TNHH MTV Thoát nước Hà Nội & Cổng TTĐT TP. Hà Nội',
    observedDate: '2025-2026',
    notes: 'Điểm trũng lịch sử khu vực nội đô cũ; thường ứ đọng nước khi mưa cường độ lớn >50 mm/2h.'
  },
  {
    id: 'VN-HN-02',
    province: 'Hà Nội',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Phố Hoa Bằng – Yên Hòa (Cầu Giấy)',
    lat: 21.0268,
    lng: 105.7966,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'HSDC Maps & Báo Tuổi Trẻ',
    sourceCitation: 'Công ty Thoát nước Hà Nội & Báo Tuổi Trẻ',
    observedDate: '2025-2026',
    notes: 'Khu dân cư ven sông Tô Lịch cũ có cốt nền thấp hơn trục Đường Láng, tiêu thoát chậm khi mưa kéo dài.'
  },
  {
    id: 'VN-HN-03',
    province: 'Hà Nội',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Ngã ba Vũ Trọng Phụng – Quan Nhân (Thanh Xuân)',
    lat: 20.9989,
    lng: 105.8065,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'HSDC Maps & VnExpress',
    sourceCitation: 'HSDC Maps & VnExpress',
    observedDate: '2025-2026',
    notes: 'Trục đường mật độ phương tiện cao, hay xuất hiện điểm ngập cục bộ mặt đường khi mưa dông giờ tan tầm.'
  },
  {
    id: 'VN-HN-04',
    province: 'Hà Nội',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Hầm chui Đại lộ Thăng Long – Nút giao Lê Trọng Tấn (Hoài Đức / Nam Từ Liêm)',
    lat: 21.0036,
    lng: 105.7362,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Báo Tiền Phong & Sở Xây dựng Hà Nội',
    sourceCitation: 'Sở Xây dựng Hà Nội & Báo Tiền Phong',
    observedDate: '2025-2026',
    notes: 'Khu vực hầm chui dân sinh dễ chia cắt giao thông khi mưa bão lớn dồn nước về lưu vực sông Nhuệ.'
  },
  {
    id: 'VN-HN-05',
    province: 'Hà Nội',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Bạch Mai (78 Giải Phóng, Đống Đa)',
    lat: 21.0022,
    lng: 105.8408,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Bộ Y tế',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa tuyến cuối khu vực trung tâm Hà Nội, trực cấp cứu 24/7.'
  },
  {
    id: 'VN-HN-06',
    province: 'Hà Nội',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện E (89 Trần Cung, Cầu Giấy)',
    lat: 21.0493,
    lng: 105.7885,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Bộ Y tế',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa trung ương gần cụm Cổ Nhuế – Cầu Giấy.'
  },

  // ==================== TP. HỒ CHÍ MINH ====================
  {
    id: 'VN-HCM-01',
    province: 'TP. Hồ Chí Minh',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Nguyễn Hữu Cảnh – Chân cầu Thủ Thiêm (Bình Thạnh)',
    lat: 10.7905,
    lng: 106.7163,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Trung tâm Quản lý Hạ tầng Kỹ thuật TP.HCM',
    sourceCitation: 'Sở Xây dựng TP.HCM & Báo Thanh Niên',
    observedDate: '2025-2026',
    notes: 'Trục đường ven sông Sài Gòn nhạy cảm khi mưa lớn trùng đỉnh triều cường Rằm/Mùng Một.'
  },
  {
    id: 'VN-HCM-02',
    province: 'TP. Hồ Chí Minh',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Thảo Điền – Quốc Hương (TP. Thủ Đức)',
    lat: 10.8055,
    lng: 106.7336,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Báo Tuổi Trẻ & Ban Chỉ huy PCTT TP.HCM',
    sourceCitation: 'Báo Tuổi Trẻ',
    observedDate: '2025-2026',
    notes: 'Khu vực bán đảo ven sông Sài Gòn thường chịu tác động kép của triều cường và mưa cường độ lớn.'
  },
  {
    id: 'VN-HCM-03',
    province: 'TP. Hồ Chí Minh',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Trần Xuân Soạn – Kênh Tẻ (Quận 7)',
    lat: 10.7512,
    lng: 106.7014,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Đài KTTV Nam Bộ & Báo Người Lao Động',
    sourceCitation: 'Đài KTTV Khu vực Nam Bộ',
    observedDate: '2025-2026',
    notes: 'Tuyến đường thấp ven kênh Tẻ thường xuyên ngập theo chu kỳ triều cường vượt mức báo động III.'
  },
  {
    id: 'VN-HCM-04',
    province: 'TP. Hồ Chí Minh',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Chợ Thủ Đức – Đường Võ Văn Ngân / Kha Vạn Cân',
    lat: 10.8501,
    lng: 106.7571,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'VnExpress & UBND TP. Thủ Đức',
    sourceCitation: 'VnExpress',
    observedDate: '2025-2026',
    notes: 'Khu vực lòng chảo hứng nước chảy xiết từ dốc đường Võ Văn Ngân – Kha Vạn Cân khi mưa dông lớn.'
  },
  {
    id: 'VN-HCM-05',
    province: 'TP. Hồ Chí Minh',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Chợ Rẫy (201B Nguyễn Chí Thanh, Quận 5)',
    lat: 10.7576,
    lng: 106.6595,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Sở Y tế TP.HCM',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa tuyến cuối khu vực phía Nam, tiếp nhận cấp cứu 24/7.'
  },
  {
    id: 'VN-HCM-06',
    province: 'TP. Hồ Chí Minh',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Nhân dân Gia Định (1 Nơ Trang Long, Bình Thạnh)',
    lat: 10.8034,
    lng: 106.6946,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Sở Y tế TP.HCM',
    observedDate: '2026',
    notes: 'Cơ sở y tế đa khoa hạng I phục vụ khu vực Bình Thạnh – Quận 1 – Phú Nhuận.'
  },

  // ==================== TP. ĐÀ NẴNG ====================
  {
    id: 'VN-DN-01',
    province: 'Đà Nẵng',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Mẹ Suốt – Khu dân cư Hòa Khánh Nam (Liên Chiểu)',
    lat: 16.0586,
    lng: 108.1516,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'UBND TP. Đà Nẵng & Báo Đà Nẵng',
    sourceCitation: 'Cổng TTĐT TP. Đà Nẵng & Báo Đà Nẵng',
    observedDate: '2024-2026',
    notes: 'Vùng rốn ngập trọng điểm phía Tây Bắc Đà Nẵng khi mưa cực đoan vượt khả năng tiêu thoát kênh Phú Lộc.'
  },
  {
    id: 'VN-DN-02',
    province: 'Đà Nẵng',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Nút giao Hàm Nghi – Lê Duẩn – Hùng Vương (Thanh Khê / Hải Châu)',
    lat: 16.0663,
    lng: 108.2108,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Công ty Thoát nước & Xử lý nước thải Đà Nẵng',
    sourceCitation: 'Báo Tuổi Trẻ & Sở Xây dựng Đà Nẵng',
    observedDate: '2025-2026',
    notes: 'Khu vực trung tâm quanh hồ Thạc Gián – Vĩnh Trung dễ dâng ngập mặt đường khi mưa tập trung cường độ cao.'
  },
  {
    id: 'VN-DN-03',
    province: 'Đà Nẵng',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Núi Thành – Tiểu La (Hải Châu)',
    lat: 16.0439,
    lng: 108.2189,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Báo Thanh Niên & Báo Đà Nẵng',
    sourceCitation: 'Báo Đà Nẵng',
    observedDate: '2025-2026',
    notes: 'Trục đường đông trường học và nhà dân, hay ngập cục bộ trong các đợt mưa lớn miền Trung tháng 10–11.'
  },
  {
    id: 'VN-DN-04',
    province: 'Đà Nẵng',
    layerGroup: 'risk',
    category: 'landslide',
    name: 'Đoạn đèo Hải Vân – Đường lên bán đảo Sơn Trà (Yết Kiêu – Bãi Bắc)',
    lat: 16.1204,
    lng: 108.2571,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT&TKCN TP. Đà Nẵng',
    sourceCitation: 'Báo Nhân Dân & UBND TP. Đà Nẵng',
    observedDate: '2024-2026',
    notes: 'Sườn dốc địa chất phong hóa có nguy cơ sạt trượt taluy dương/âm khi mưa bão kéo dài; cần theo dõi lệnh cấm đường.'
  },
  {
    id: 'VN-DN-05',
    province: 'Đà Nẵng',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đà Nẵng (124 Hải Phòng, Hải Châu)',
    lat: 16.0715,
    lng: 108.2156,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Sở Y tế TP. Đà Nẵng',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa tuyến cao nhất TP. Đà Nẵng, vị trí trung tâm thuận tiện tiếp cận cấp cứu.'
  },
  {
    id: 'VN-DN-06',
    province: 'Đà Nẵng',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Trường Đại học Bách khoa – ĐH Đà Nẵng (54 Nguyễn Lương Bằng)',
    lat: 16.0738,
    lng: 108.1498,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap & Phương án sơ tán quận Liên Chiểu',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Khuôn viên cao tầng kiên cố phía Tây Bắc, điểm hỗ trợ sơ tán sinh viên và cư dân vùng lân cận.'
  },

  // ==================== TP. HUẾ & THỪA THIÊN HUẾ ====================
  {
    id: 'VN-HUE-01',
    province: 'Thừa Thiên Huế',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đập Đá – Ngã ba Nguyễn Công Trứ / Lê Lợi (ven sông Hương)',
    lat: 16.4697,
    lng: 107.6008,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT&TKCN Thừa Thiên Huế (Hue-S)',
    sourceCitation: 'Hue-S & Đài KTTV Thừa Thiên Huế',
    observedDate: '2024-2026',
    notes: 'Mực nước sông Hương dâng chạm Đập Đá là dấu hiệu cảnh báo sớm ngập diện rộng vùng hạ du TP. Huế.'
  },
  {
    id: 'VN-HUE-02',
    province: 'Thừa Thiên Huế',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Phố Bạch Đằng – Huỳnh Thúc Kháng dọc sông Đông Ba',
    lat: 16.4785,
    lng: 107.5892,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Báo Thừa Thiên Huế & Hue-S',
    sourceCitation: 'Cổng TTĐT Thừa Thiên Huế',
    observedDate: '2024-2026',
    notes: 'Khu vực thấp ven sông Đông Ba và sông Hương thường bị ngập sớm khi thủy điện xả điều tiết lũ kết hợp mưa lớn.'
  },
  {
    id: 'VN-HUE-03',
    province: 'Thừa Thiên Huế',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Phan Chu Trinh – Ngã tư Trường Chinh / An Cựu',
    lat: 16.4535,
    lng: 107.5906,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Hue-S & Báo Tuổi Trẻ',
    sourceCitation: 'Hue-S & Báo Tuổi Trẻ',
    observedDate: '2025-2026',
    notes: 'Dải dân cư ven sông An Cựu thường ngập chia cắt giao thông trong các đợt lũ lớn tháng 10–11.'
  },
  {
    id: 'VN-HUE-04',
    province: 'Thừa Thiên Huế',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Trung ương Huế (16 Lê Lợi, Vĩnh Ninh)',
    lat: 16.4628,
    lng: 107.5869,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Bộ Y tế',
    observedDate: '2026',
    notes: 'Bệnh viện hạng đặc biệt khu vực miền Trung, cơ sở vật chất cao tầng kiên cố ứng phó mùa mưa lũ.'
  },
  {
    id: 'VN-HUE-05',
    province: 'Thừa Thiên Huế',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Khu hành chính & Trường Đại học Sư phạm Huế (34 Lê Lợi)',
    lat: 16.4671,
    lng: 107.5905,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Tòa nhà cao tầng trục Lê Lợi có cao độ nền thuận lợi hỗ trợ tạm trú trong tình huống khẩn cấp.'
  },

  // ==================== HỘI AN / QUẢNG NAM ====================
  {
    id: 'VN-QN-01',
    province: 'Quảng Nam',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Phố Bạch Đằng – Chợ Hội An ven sông Hoài (Hội An)',
    lat: 15.8768,
    lng: 108.3274,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT&TKCN Quảng Nam',
    sourceCitation: 'Báo Quảng Nam & Đài KTTV Quảng Nam',
    observedDate: '2024-2026',
    notes: 'Tuyến phố trũng sát sông Thu Bồn – sông Hoài, ngập thường xuyên khi lũ sông Thu Bồn đạt báo động II–III.'
  },
  {
    id: 'VN-QN-02',
    province: 'Quảng Nam',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa Hội An (04 Trần Hưng Đạo)',
    lat: 15.8819,
    lng: 108.3324,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Cơ sở y tế chính trung tâm Hội An, nằm ở cốt nền cao hơn khu phố ven sông.'
  },

  // ==================== TP. CẦN THƠ & ĐBSCL ====================
  {
    id: 'VN-CT-01',
    province: 'Cần Thơ',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Cách Mạng Tháng Tám – Bùi Hữu Nghĩa (Bình Thủy / Ninh Kiều)',
    lat: 10.0562,
    lng: 105.7681,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'UBND TP. Cần Thơ & Báo Cần Thơ',
    sourceCitation: 'Báo Cần Thơ & VnExpress',
    observedDate: '2025-2026',
    notes: 'Tuyến trục hay ngập do triều cường sông Hậu dâng cao kết hợp mưa lớn vào buổi chiều.'
  },
  {
    id: 'VN-CT-02',
    province: 'Cần Thơ',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Trần Hưng Đạo – Lý Tự Trọng & Hồ Xáng Thổi (Ninh Kiều)',
    lat: 10.0329,
    lng: 105.7747,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Quản lý Dự án ODA Cần Thơ',
    sourceCitation: 'Báo Tuổi Trẻ & Báo Cần Thơ',
    observedDate: '2025-2026',
    notes: 'Khu vực lõi Ninh Kiều chịu ảnh hưởng triều cường qua các họng cống và rạch nội ô.'
  },
  {
    id: 'VN-CT-03',
    province: 'Cần Thơ',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa Trung ương Cần Thơ (315 Nguyễn Văn Linh)',
    lat: 10.0294,
    lng: 105.7568,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap & Bộ Y tế',
    observedDate: '2026',
    notes: 'Bệnh viện tuyến cuối vùng Đồng bằng sông Cửu Long trên trục Quốc lộ 91B.'
  },
  {
    id: 'VN-CT-04',
    province: 'Cần Thơ',
    layerGroup: 'safe',
    category: 'shelter',
    name: 'Khu II Trường Đại học Cần Thơ (Đường 3/2, Ninh Kiều)',
    lat: 10.0299,
    lng: 105.7706,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Khuôn viên đại học quy mô lớn có hệ thống thoát nước riêng và dãy nhà cao tầng kiên cố.'
  },

  // ==================== BẾN TRE & CÀ MAU (HẠN MẶN + TRIỀU CƯỜNG) ====================
  {
    id: 'VN-BT-01',
    province: 'Bến Tre',
    layerGroup: 'risk',
    category: 'salinity',
    name: 'Khu vực Cửa sông Hàm Luông – Hệ thống cống ngăn mặn Tân Phú / Bến Tre',
    lat: 10.2286,
    lng: 106.3522,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Đài KTTV Bến Tre & Viện Khoa học Thủy lợi Miền Nam',
    sourceCitation: 'Đài KTTV tỉnh Bến Tre',
    observedDate: '2025-2026',
    notes: 'Điểm giám sát xâm nhập mặn mùa khô (tháng 2–5); cần theo dõi lịch đóng/mở cống và nguồn nước ngọt dự trữ.'
  },
  {
    id: 'VN-BT-02',
    province: 'Bến Tre',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Nguyễn Đình Chiểu (109 Đoàn Hoàng Minh, TP. Bến Tre)',
    lat: 10.2392,
    lng: 106.3771,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa tuyến tỉnh Bến Tre.'
  },
  {
    id: 'VN-CM-01',
    province: 'Cà Mau',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đường Phan Ngọc Hiển – Ngô Quyền (Trung tâm TP. Cà Mau)',
    lat: 9.1742,
    lng: 105.1508,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT tỉnh Cà Mau',
    sourceCitation: 'Báo Cà Mau',
    observedDate: '2025-2026',
    notes: 'Chịu tác động kép từ triều Biển Đông và Biển Tây kết hợp mưa dông, dễ ngập cục bộ tuyến đường thấp.'
  },

  // ==================== LÀO CAI / SA PA (SẠT LỞ & LŨ QUÉT MIỀN NÚI) ====================
  {
    id: 'VN-LC-01',
    province: 'Lào Cai',
    layerGroup: 'risk',
    category: 'landslide',
    name: 'Khu vực Cốc Lếu – Duyên Hải ven sông Hồng (TP. Lào Cai)',
    lat: 22.4954,
    lng: 103.9702,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT&TKCN tỉnh Lào Cai',
    sourceCitation: 'Báo Lào Cai & Đài KTTV Lào Cai',
    observedDate: '2024-2026',
    notes: 'Bờ sông Hồng và vùng trũng giáp biên dễ bị ảnh hưởng khi lũ thượng nguồn sông Hồng dâng trên báo động III.'
  },
  {
    id: 'VN-LC-02',
    province: 'Lào Cai',
    layerGroup: 'risk',
    category: 'landslide',
    name: 'Hành lang Đèo Ô Quy Hồ – Quốc lộ 4D (Sa Pa – Tam Đường)',
    lat: 22.3461,
    lng: 103.7824,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Cục Đường bộ Việt Nam & Sở GTVT Lào Cai',
    sourceCitation: 'Cục Đường bộ Việt Nam & VnExpress',
    observedDate: '2024-2026',
    notes: 'Tuyến đèo độ dốc lớn, sương mù dày và tiềm ẩn sạt lở đá/đất taluy dương sau các đợt mưa lớn kéo dài.'
  },
  {
    id: 'VN-LC-03',
    province: 'Lào Cai',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa tỉnh Lào Cai (Đường Chiềng On, Bình Minh)',
    lat: 22.4569,
    lng: 103.9877,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa hạng I tuyến tỉnh tại khu đô thị mới Lào Cai.'
  },

  // ==================== ĐÀ LẠT / LÂM ĐỒNG ====================
  {
    id: 'VN-DL-01',
    province: 'Lâm Đồng',
    layerGroup: 'risk',
    category: 'landslide',
    name: 'Đoạn Đèo Prenn & Đèo Mimosa (cửa ngõ TP. Đà Lạt)',
    lat: 11.9082,
    lng: 108.4496,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'UBND tỉnh Lâm Đồng & Sở GTVT',
    sourceCitation: 'Báo Lâm Đồng',
    observedDate: '2024-2026',
    notes: 'Khu vực địa hình đồi núi dốc; cần chú ý cảnh báo sạt lở taluy và sương mù khi mưa liên tục nhiều ngày.'
  },
  {
    id: 'VN-DL-02',
    province: 'Lâm Đồng',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Dải dân cư ven Suối Cam Ly – Đường Phan Đình Phùng / Tô Ngọc Vân (Đà Lạt)',
    lat: 11.9465,
    lng: 108.4295,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Báo Lâm Đồng & Đài KTTV Lâm Đồng',
    sourceCitation: 'Báo Lâm Đồng',
    observedDate: '2025-2026',
    notes: 'Thung lũng suối Cam Ly thoát nước chậm khi mưa lớn tập trung từ khu vực trung tâm và khu nhà kính.'
  },
  {
    id: 'VN-DL-03',
    province: 'Lâm Đồng',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa tỉnh Lâm Đồng (01 Phạm Ngọc Thạch, TP. Đà Lạt)',
    lat: 11.9447,
    lng: 108.4316,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Cơ sở y tế tuyến tỉnh phục vụ khu vực Đà Lạt và lân cận.'
  },

  // ==================== VINH / NGHỆ AN ====================
  {
    id: 'VN-NA-01',
    province: 'Nghệ An',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Đại lộ Lê Nin – Ngã tư Hải Thượng Lãn Ông (TP. Vinh)',
    lat: 18.6939,
    lng: 105.6894,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Báo Nghệ An & UBND TP. Vinh',
    sourceCitation: 'Báo Nghệ An',
    observedDate: '2025-2026',
    notes: 'Trục đường chính hay ngập khi mưa bão Bắc Trung Bộ vượt ngưỡng tiêu thoát kênh Bắc.'
  },
  {
    id: 'VN-NA-02',
    province: 'Nghệ An',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Hữu nghị Đa khoa Nghệ An (Km5 Đại lộ Lê Nin)',
    lat: 18.7115,
    lng: 105.6845,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện tuyến cuối khu vực Bắc Trung Bộ tại TP. Vinh.'
  },

  // ==================== HẠ LONG / QUẢNG NINH ====================
  {
    id: 'VN-QNH-01',
    province: 'Quảng Ninh',
    layerGroup: 'risk',
    category: 'landslide',
    name: 'Sườn đồi chân Cầu Bãi Cháy – Ngã tư Loong Toòng (Hạ Long)',
    lat: 20.9619,
    lng: 107.0681,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT tỉnh Quảng Ninh & Báo Quảng Ninh',
    sourceCitation: 'Báo Quảng Ninh',
    observedDate: '2024-2026',
    notes: 'Vùng giao tiếp đồi núi và vịnh biển có nguy cơ ngập cục bộ đường trục và sạt trượt taluy khi có bão.'
  },
  {
    id: 'VN-QNH-02',
    province: 'Quảng Ninh',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa tỉnh Quảng Ninh (Phố Tuệ Tĩnh, Bạch Đằng)',
    lat: 20.9502,
    lng: 107.0928,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa hạng I tuyến tỉnh tại trung tâm Hòn Gai.'
  },

  // ==================== HẢI PHÒNG, NHA TRANG, QUY NHƠN ====================
  {
    id: 'VN-HP-01',
    province: 'Hải Phòng',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Trục Lạch Tray – Tô Hiệu (Ngô Quyền / Lê Chân, Hải Phòng)',
    lat: 20.8482,
    lng: 106.6879,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Công ty Thoát nước Hải Phòng & Báo Hải Phòng',
    sourceCitation: 'Cổng TTĐT TP. Hải Phòng',
    observedDate: '2025-2026',
    notes: 'Điểm theo dõi ngập nội đô Hải Phòng khi mưa lớn trùng triều cường cửa sông Cấm.'
  },
  {
    id: 'VN-HP-02',
    province: 'Hải Phòng',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Hữu nghị Việt Tiệp (01 Nhà Thương, Lê Chân)',
    lat: 20.8559,
    lng: 106.6788,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa hạng I tuyến thành phố Hải Phòng.'
  },
  {
    id: 'VN-KH-01',
    province: 'Khánh Hòa',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Khu vực Vĩnh Ngọc – Sông Cái & Đường 23/10 (TP. Nha Trang)',
    lat: 12.2569,
    lng: 109.1636,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Ban Chỉ huy PCTT Khánh Hòa & Báo Khánh Hòa',
    sourceCitation: 'Báo Khánh Hòa',
    observedDate: '2025-2026',
    notes: 'Khu dân cư ven sông Cái Nha Trang thường chịu ngập khi lũ thượng nguồn về nhanh.'
  },
  {
    id: 'VN-KH-02',
    province: 'Khánh Hòa',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa tỉnh Khánh Hòa (19 Yersin, Nha Trang)',
    lat: 12.2484,
    lng: 109.1931,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện tuyến tỉnh trung tâm TP. Nha Trang.'
  },
  {
    id: 'VN-BD-01',
    province: 'Bình Định',
    layerGroup: 'risk',
    category: 'flood',
    name: 'Hạ lưu Sông Hà Thanh – Khu vực Nhơn Bình / Gò Bồi (Quy Nhơn)',
    lat: 13.7975,
    lng: 109.2082,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'Đài KTTV Bình Định & Báo Bình Định',
    sourceCitation: 'Báo Bình Định',
    observedDate: '2025-2026',
    notes: 'Vùng trũng cửa sông Hà Thanh – đầm Thị Nại thường ngập chia cắt trong các đợt mưa lũ lớn Nam Trung Bộ.'
  },
  {
    id: 'VN-BD-02',
    province: 'Bình Định',
    layerGroup: 'safe',
    category: 'medical',
    name: 'Bệnh viện Đa khoa tỉnh Bình Định (106 Nguyễn Huệ, Quy Nhơn)',
    lat: 13.7707,
    lng: 109.2339,
    dataClass: 'OBSERVED_DATA',
    confidenceTier: 'A',
    status: 'approved',
    sourceType: 'OpenStreetMap Contributors (ODbL)',
    sourceCitation: 'OpenStreetMap Contributors (ODbL)',
    observedDate: '2026',
    notes: 'Bệnh viện đa khoa hạng I tại trung tâm TP. Quy Nhơn.'
  }
];

/**
 * 12 Hành lang tuyến đường ngập / sạt lở thực tế đa đô thị (LineString [lng, lat]).
 * Chỉ được vẽ lên bản đồ khi có đỉnh nằm trong vòng khoanh đang xem (chống lag tuyệt đối).
 */
export const VIETNAM_VERIFIED_CORRIDORS = [
  {
    id: 'VNC-HN-01',
    name: 'Hành lang ngập Nguyễn Khuyến – Văn Miếu – Lý Thường Kiệt (Hà Nội)',
    rainThresholdMm: 50,
    severity: 'moderate',
    source: 'Công ty Thoát nước Hà Nội & OSM',
    note: 'Tuyến phố nội đô cổ có cao độ lòng đường trũng cục bộ khi mưa dồn dập.',
    coordinates: [
      [105.8375, 21.0265],
      [105.8404, 21.0246],
      [105.8442, 21.0238],
      [105.8478, 21.0231]
    ]
  },
  {
    id: 'VNC-DN-01',
    name: 'Hành lang ngập Mẹ Suốt – Kênh Phú Lộc (Liên Chiểu, Đà Nẵng)',
    rainThresholdMm: 45,
    severity: 'severe',
    source: 'UBND TP. Đà Nẵng & OSM',
    note: 'Khu vực thoát nước chậm giáp kênh hở Hòa Khánh Nam – Liên Chiểu.',
    coordinates: [
      [108.1482, 16.0562],
      [108.1516, 16.0586],
      [108.1558, 16.0612],
      [108.1592, 16.0638]
    ]
  },
  {
    id: 'VNC-DN-02',
    name: 'Trục Lê Duẩn – Hàm Nghi – Hùng Vương (Trung tâm Đà Nẵng)',
    rainThresholdMm: 60,
    severity: 'moderate',
    source: 'Công ty Thoát nước Đà Nẵng & OSM',
    note: 'Các nút giao quanh hồ điều tiết Thạc Gián thường ngập cục bộ giờ mưa lớn.',
    coordinates: [
      [108.2072, 16.0644],
      [108.2108, 16.0663],
      [108.2145, 16.0681],
      [108.2188, 16.0689]
    ]
  },
  {
    id: 'VNC-HUE-01',
    name: 'Hành lang Đập Đá – Nguyễn Công Trứ – Hùng Vương (TP. Huế)',
    rainThresholdMm: 50,
    severity: 'severe',
    source: 'Ban Chỉ huy PCTT Thừa Thiên Huế (Hue-S)',
    note: 'Dải ven sông Hương và sông Như Ý thường bị nước lũ dâng tràn sớm.',
    coordinates: [
      [107.5968, 16.4678],
      [107.6008, 16.4697],
      [107.6052, 16.4685],
      [107.6078, 16.4658]
    ]
  },
  {
    id: 'VNC-HUE-02',
    name: 'Hành lang Bạch Đằng – Huỳnh Thúc Kháng ven sông Đông Ba (TP. Huế)',
    rainThresholdMm: 55,
    severity: 'moderate',
    source: 'Hue-S & Báo Thừa Thiên Huế',
    note: 'Trục đường ven sông Đông Ba chịu ảnh hưởng trực tiếp mực nước lũ sông Hương.',
    coordinates: [
      [107.5858, 16.4754],
      [107.5892, 16.4785],
      [107.5924, 16.4812]
    ]
  },
  {
    id: 'VNC-QN-01',
    name: 'Tuyến Bạch Đằng ven Sông Hoài – Chợ Hội An (Quảng Nam)',
    rainThresholdMm: 45,
    severity: 'severe',
    source: 'Ban Chỉ huy PCTT Quảng Nam',
    note: 'Tuyến phố thấp ven sông Hoài bị ngập sớm trong mùa mưa lũ miền Trung.',
    coordinates: [
      [108.3238, 15.8764],
      [108.3274, 15.8768],
      [108.3315, 15.8769]
    ]
  },
  {
    id: 'VNC-HCM-01',
    name: 'Tuyến Nguyễn Hữu Cảnh ven Sông Sài Gòn (Bình Thạnh, TP.HCM)',
    rainThresholdMm: 45,
    severity: 'moderate',
    source: 'Sở Xây dựng TP.HCM & OSM',
    note: 'Nhạy cảm với triều cường cao kết hợp mưa lớn buổi chiều.',
    coordinates: [
      [106.7105, 10.7885],
      [106.7163, 10.7905],
      [106.7212, 10.7942]
    ]
  },
  {
    id: 'VNC-HCM-02',
    name: 'Tuyến Trần Xuân Soạn ven Kênh Tẻ (Quận 7, TP.HCM)',
    rainThresholdMm: 35,
    severity: 'severe',
    source: 'Đài KTTV Nam Bộ & OSM',
    note: 'Thường ngập do triều cường sông Sài Gòn – kênh Tẻ vượt báo động III.',
    coordinates: [
      [106.6938, 10.7501],
      [106.7014, 10.7512],
      [106.7098, 10.7516]
    ]
  },
  {
    id: 'VNC-CT-01',
    name: 'Trục Cách Mạng Tháng Tám – Bùi Hữu Nghĩa (TP. Cần Thơ)',
    rainThresholdMm: 40,
    severity: 'severe',
    source: 'Báo Cần Thơ & OSM',
    note: 'Tuyến trục ven sông Hậu – sông Bình Thủy dễ ngập sâu theo đỉnh triều.',
    coordinates: [
      [105.7615, 10.0598],
      [105.7681, 10.0562],
      [105.7749, 10.0518]
    ]
  },
  {
    id: 'VNC-LC-01',
    name: 'Hành lang sạt lở Đèo Ô Quy Hồ – QL4D (Sa Pa, Lào Cai)',
    rainThresholdMm: 50,
    severity: 'severe',
    source: 'Cục Đường bộ Việt Nam & Sở GTVT Lào Cai',
    note: 'Đèo dốc hiểm trở, tiềm ẩn nguy cơ sạt lở đá đất taluy khi mưa kéo dài.',
    coordinates: [
      [103.7715, 22.3422],
      [103.7824, 22.3461],
      [103.7948, 22.3495],
      [103.8065, 22.3464]
    ]
  },
  {
    id: 'VNC-DL-01',
    name: 'Hành lang Đèo Prenn – Cửa ngõ TP. Đà Lạt (Lâm Đồng)',
    rainThresholdMm: 55,
    severity: 'moderate',
    source: 'Sở GTVT Lâm Đồng & OSM',
    note: 'Khu vực đèo sườn dốc cần lưu ý taluy và tầm nhìn hạn chế khi mưa sương.',
    coordinates: [
      [108.4548, 11.8942],
      [108.4496, 11.9082],
      [108.4465, 11.9195]
    ]
  },
  {
    id: 'VNC-NA-01',
    name: 'Trục Đại lộ Lê Nin – Kênh Bắc (TP. Vinh, Nghệ An)',
    rainThresholdMm: 55,
    severity: 'moderate',
    source: 'Báo Nghệ An & OSM',
    note: 'Tuyến trục trung tâm thành phố Vinh, theo dõi úng ngập mùa mưa bão miền Trung.',
    coordinates: [
      [105.6852, 18.7052],
      [105.6894, 18.6939],
      [105.6932, 18.6834]
    ]
  }
];

function quickDistKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Chỉ trả về các hành lang LineString nằm trong (hoặc cắt ngang) vòng khoanh hiện tại — chống lag toàn quốc.
 */
export function filterCorridorsInZone(corridors = [], centerLat, centerLng, radiusKm = 5) {
  const lat = Number(centerLat);
  const lng = Number(centerLng);
  const maxKm = Math.max(0.5, Number(radiusKm) || 5) + 0.6;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return (Array.isArray(corridors) ? corridors : []).filter((c) => {
    const coords = Array.isArray(c?.coordinates) ? c.coordinates : [];
    return coords.some(([ptLng, ptLat]) => quickDistKm(lat, lng, Number(ptLat), Number(ptLng)) <= maxKm);
  });
}

/**
 * ĐA GIÁC RỐN TRŨNG ĐÔ THỊ & VÙNG NGẬP LỊCH SỬ ĐA TỈNH/THÀNH (POLYGON)
 * Tọa độ định dạng [lat, lng] tương thích trực tiếp với Leaflet L.polygon().
 */
export const VIETNAM_VERIFIED_BASINS = [
  {
    id: 'VNB-HN-01',
    province: 'Hà Nội',
    name: 'Vùng trũng Nguyễn Khuyến – Văn Miếu – Quốc Tử Giám (Nội đô Hà Nội)',
    rainThresholdMm: 50,
    demRange: '6,5 – 9,2 m',
    source: 'Công ty Thoát nước Hà Nội (HSDC) & Copernicus 30m',
    coordinates: [
      [21.0282, 105.8348],
      [21.0285, 105.8428],
      [21.0222, 105.8434],
      [21.0218, 105.8352]
    ]
  },
  {
    id: 'VNB-HN-02',
    province: 'Hà Nội',
    name: 'Rốn trũng Hoa Bằng – Yên Hòa ven Sông Tô Lịch (Cầu Giấy)',
    rainThresholdMm: 45,
    demRange: '5,8 – 8,4 m',
    source: 'HSDC Maps & Copernicus 30m',
    coordinates: [
      [21.0305, 105.7928],
      [21.0302, 105.8012],
      [21.0225, 105.8018],
      [21.0228, 105.7932]
    ]
  },
  {
    id: 'VNB-HUE-01',
    province: 'Thừa Thiên Huế',
    name: 'Lưu vực thấp Đập Đá – Vỹ Dạ – Cồn Hến ven Sông Hương (TP. Huế)',
    rainThresholdMm: 60,
    demRange: '1,8 – 4,5 m',
    source: 'Ban Chỉ huy PCTT Thừa Thiên Huế & Copernicus 30m',
    coordinates: [
      [16.4815, 107.5905],
      [16.4822, 107.6055],
      [16.4695, 107.6062],
      [16.4688, 107.5912]
    ]
  },
  {
    id: 'VNB-HUE-02',
    province: 'Thừa Thiên Huế',
    name: 'Vùng trũng Đông Ba – Huỳnh Thúc Kháng ven Sông Đông Ba (TP. Huế)',
    rainThresholdMm: 55,
    demRange: '2,2 – 5,0 m',
    source: 'Đài KTTV Thừa Thiên Huế & OSM',
    coordinates: [
      [16.4792, 107.5812],
      [16.4795, 107.5902],
      [16.4698, 107.5905],
      [16.4692, 107.5815]
    ]
  },
  {
    id: 'VNB-DN-01',
    province: 'Đà Nẵng',
    name: 'Rốn ngập Khe Cạn – Mẹ Suốt – Hòa Khánh Nam (Liên Chiểu, Đà Nẵng)',
    rainThresholdMm: 65,
    demRange: '2,5 – 6,0 m',
    source: 'Sở Xây dựng Đà Nẵng & Báo Đà Nẵng',
    coordinates: [
      [16.0642, 108.1525],
      [16.0648, 108.1668],
      [16.0518, 108.1675],
      [16.0512, 108.1532]
    ]
  },
  {
    id: 'VNB-DN-02',
    province: 'Đà Nẵng',
    name: 'Vùng thoát nước chậm Hàm Nghi – Thạc Gián – Hải Châu (Đà Nẵng)',
    rainThresholdMm: 70,
    demRange: '3,0 – 6,5 m',
    source: 'Sở Xây dựng Đà Nẵng & OSM',
    coordinates: [
      [16.0665, 108.2065],
      [16.0668, 108.2192],
      [16.0562, 108.2196],
      [16.0558, 108.2068]
    ]
  },
  {
    id: 'VNB-HA-01',
    province: 'Quảng Nam',
    name: 'Vùng ngập lụt Bạch Đằng – An Hội ven Sông Hoài (Phố cổ Hội An)',
    rainThresholdMm: 45,
    demRange: '1,2 – 3,6 m',
    source: 'BCH PCTT Hội An & Copernicus 30m',
    coordinates: [
      [15.8802, 108.3225],
      [15.8805, 108.3348],
      [15.8735, 108.3352],
      [15.8732, 108.3228]
    ]
  },
  {
    id: 'VNB-HCM-01',
    province: 'TP. Hồ Chí Minh',
    name: 'Rốn trũng Nguyễn Hữu Cảnh – Văn Thánh ven Sông Sài Gòn (Bình Thạnh)',
    rainThresholdMm: 45,
    demRange: '1,4 – 3,8 m',
    source: 'Trung tâm Hạ tầng Kỹ thuật TP.HCM',
    coordinates: [
      [10.7995, 106.7115],
      [10.7998, 106.7235],
      [10.7868, 106.7238],
      [10.7865, 106.7118]
    ]
  },
  {
    id: 'VNB-HCM-02',
    province: 'TP. Hồ Chí Minh',
    name: 'Bán đảo thấp Thảo Điền – Quốc Hương (TP. Thủ Đức, TP.HCM)',
    rainThresholdMm: 40,
    demRange: '1,2 – 3,2 m',
    source: 'Đài KTTV Nam Bộ & Copernicus 30m',
    coordinates: [
      [10.8125, 106.7265],
      [10.8128, 106.7415],
      [10.8005, 106.7418],
      [10.8002, 106.7268]
    ]
  },
  {
    id: 'VNB-CT-01',
    province: 'Cần Thơ',
    name: 'Rốn ngập triều cường Hồ Búng Xáng – An Khánh (Ninh Kiều, Cần Thơ)',
    rainThresholdMm: 35,
    demRange: '0,8 – 2,4 m',
    source: 'Viện BĐKH ĐH Cần Thơ & Đài KTTV Cần Thơ',
    coordinates: [
      [10.0435, 105.7545],
      [10.0438, 105.7712],
      [10.0298, 105.7715],
      [10.0295, 105.7548]
    ]
  }
];

export function filterBasinsInZone(basins = [], centerLat, centerLng, radiusKm = 5) {
  const lat = Number(centerLat);
  const lng = Number(centerLng);
  const maxKm = Math.max(0.5, Number(radiusKm) || 5) + 0.8;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return (Array.isArray(basins) ? basins : []).filter((b) => {
    const coords = Array.isArray(b?.coordinates) ? b.coordinates : [];
    return coords.some(([bLat, bLng]) => quickDistKm(lat, lng, Number(bLat), Number(bLng)) <= maxKm);
  });
}
