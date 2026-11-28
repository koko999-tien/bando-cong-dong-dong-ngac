/**
 * KHO DỮ LIỆU CHUẨN THỰC ĐỊA QUANH TRƯỜNG ĐH MỎ - ĐỊA CHẤT (HUMG)
 * Gồm: 3 Khu chính (Khu A, Khu A1, Khu B), tuyến đường an toàn/mát mẻ,
 * vùng ngập đa giác & các điểm ngập/nguy hiểm quanh trường, Bộ Quiz 15 câu,
 * và Dữ liệu mẫu ảo chuẩn giao diện Quản trị GEOENV RUN.
 */

export const CAMPUS_CENTER = {
  lat: 21.07255,
  lng: 105.7736,
  zoom: 16
};

export const CAMPUS_ZONES = [
  {
    id: 'A',
    code: 'Khu A',
    title: 'Khu A — Trụ sở Chính (18 Phố Viên)',
    shortDesc: 'Cốt nền cao ráo (~17 m), tập trung giảng đường chính, Thư viện và hành lang mái che liên thông.',
    lat: 21.07255,
    lng: 105.7736,
    elevationM: 17,
    riskLevel: 'an-toan',
    advice: 'Điểm xuất phát & tránh trú an toàn khi mưa lớn hoặc nắng gắt khung 11h00–14h30.'
  },
  {
    id: 'A1',
    code: 'Khu A1',
    title: 'Khu A1 — Cụm Giảng đường Cao tầng A1',
    shortDesc: 'Tập trung nhiều lớp học chuyển tiết, sảnh tầng 1 thoáng mát; chú ý đoạn yên ngựa trũng Lê Văn Hiến phía ngoài.',
    lat: 21.0738,
    lng: 105.7742,
    elevationM: 15,
    riskLevel: 'an-toan',
    advice: 'Trú tại sảnh tầng 1 khi mưa dông bất chợt; tránh đi qua khoảng sân bê tông mở lúc 12h–14h.'
  },
  {
    id: 'B',
    code: 'Khu B',
    title: 'Khu B — Cơ sở Thực hành (Đường Phạm Văn Nghị)',
    shortDesc: 'Nằm ở bờ Tây sông Nhuệ (cốt nền thấp 8–10 m). Tuyến nối sang Khu A qua cuối Phố Viên dễ ngập sâu khi mưa > 45 mm.',
    lat: 21.067813,
    lng: 105.757184,
    elevationM: 8.5,
    riskLevel: 'chu-y',
    advice: 'Khi mưa lớn, KHÔNG đi xe máy qua đoạn cuối Phố Viên có xoáy cống; giữ lộ trình vòng qua trục nền cao.'
  }
];

export const CAMPUS_ROUTES = {
  coolRoute: {
    name: 'Tuyến đi bộ mát nhất Khu A → A1 → Trục nội bộ',
    summary: 'Ưu tiên hành lang nối nhà, tán cây lớn và mái che để giảm nắng bức xạ trực tiếp khung 11h00–14h30.',
    distanceM: 460,
    walkMin: 6,
    shadePct: 85,
    coordinates: [
      [21.07255, 105.7736],
      [21.07285, 105.77385],
      [21.07335, 105.77405],
      [21.0738, 105.7742],
      [21.07395, 105.7747],
      [21.07365, 105.775]
    ]
  },
  safeAtoBRoute: {
    name: 'Tuyến tránh xoáy cống khi đi giữa Khu A ↔ Khu B',
    summary: 'Tránh đoạn cuối Phố Viên – bờ sông Nhuệ ngập sâu kèm xoáy cống; di chuyển qua trục Cầu Phố Viên nền ổn định hơn hoặc chờ nước rút.',
    distanceM: 2150,
    walkMin: 9,
    coordinates: [
      [21.07255, 105.7736],
      [21.0721, 105.7722],
      [21.07168, 105.77125],
      [21.0706, 105.7685],
      [21.0686, 105.7634],
      [21.067813, 105.757184]
    ]
  },
  medicalRoutes: {
    A: {
      fromLabel: 'Khu A (18 Phố Viên)',
      targetLabel: 'Trạm Y tế HUMG / BV Phương Đông',
      distanceM: 210,
      walkMin: 3,
      note: 'Đi theo hành lang nội bộ nền cao ~15–17 m, không đọng nước.',
      coordinates: [
        [21.07255, 105.7736],
        [21.07295, 105.7741],
        [21.07335, 105.77465],
        [21.07365, 105.775]
      ]
    },
    A1: {
      fromLabel: 'Khu A1 (Giảng đường cao tầng)',
      targetLabel: 'Trạm Y tế HUMG',
      distanceM: 145,
      walkMin: 2,
      note: 'Từ sảnh tầng 1 Khu A1 rẽ theo lối đi bộ có mái che sang Trạm Y tế.',
      coordinates: [
        [21.0738, 105.7742],
        [21.07372, 105.77465],
        [21.07365, 105.775]
      ]
    },
    B: {
      fromLabel: 'Khu B (Đường Phạm Văn Nghị)',
      targetLabel: 'BV Đa khoa Phương Đông & Trạm Y tế HUMG',
      distanceM: 1950,
      walkMin: 7,
      note: 'Khi trời mưa ngập, KHÔNG đi cắt qua ngõ cuối Phố Viên ngập sâu; đi theo trục Cầu Phố Viên để tới BV Phương Đông (310 m cách Khu A).',
      coordinates: [
        [21.067813, 105.757184],
        [21.0685, 105.7632],
        [21.07168, 105.77125],
        [21.0715, 105.7742],
        [21.069922, 105.774942]
      ]
    }
  }
};

export const FLOOD_ZONES = [
  {
    id: 'FZ-PHOVIEN-NHUE',
    name: 'Vùng ngập sâu Cuối Phố Viên – Ngõ 199/235 – Bờ Sông Nhuệ',
    severity: 'high',
    rainThresholdMm: 40,
    depthRangeCm: '30 – 65 cm',
    description: 'Cốt nền tụt xuống 8,7–12 m sát cửa xả sông Nhuệ, có xoáy cống mạnh và nhiều ổ gà ngập nước.',
    polygon: [
      [21.0718, 105.7709],
      [21.0715, 105.7731],
      [21.0674, 105.7735],
      [21.0666, 105.7714],
      [21.0694, 105.7706]
    ]
  },
  {
    id: 'FZ-CONHUE-521',
    name: 'Vùng trũng Xóm trọ Ngõ 521–523 Cổ Nhuế',
    severity: 'moderate',
    rainThresholdMm: 45,
    depthRangeCm: '20 – 40 cm',
    description: 'Mật độ nhà trọ sinh viên cao ở chân dốc phía Đông Nam gò Phố Viên; nước dồn nhanh từ trục chính.',
    polygon: [
      [21.0706, 105.7759],
      [21.0704, 105.7783],
      [21.0677, 105.7782],
      [21.0679, 105.7758]
    ]
  },
  {
    id: 'FZ-KHUB-NHUE',
    name: 'Vùng trũng Nền thấp Khu B – Đường Phạm Văn Nghị (8 m)',
    severity: 'moderate',
    rainThresholdMm: 45,
    depthRangeCm: '15 – 35 cm',
    description: 'Dải địa hình thấp bờ Tây sông Nhuệ quanh Khu B HUMG & lối nối ra Học viện Cảnh sát.',
    polygon: [
      [21.0691, 105.7562],
      [21.0692, 105.7604],
      [21.0666, 105.7603],
      [21.0665, 105.7561]
    ]
  }
];

export const CAMPUS_POINTS = [
  // 3 KHU CHÍNH (KHU A, A1, B)
  {
    id: 'Z-A',
    group: 'zone',
    badge: 'A',
    zoneCode: 'A',
    title: 'Khu A — ĐH Mỏ - Địa chất (18 Phố Viên)',
    lat: 21.07255,
    lng: 105.7736,
    elevationM: 17,
    severity: 'safe',
    desc: 'Gò nền cao ráo (~17 m), hành lang râm mát, Thư viện và khu giảng đường trung tâm không ngập.',
    action: 'Dùng làm điểm tập kết an toàn khi trời nắng gắt hoặc mưa ngập vùng trũng xung quanh.'
  },
  {
    id: 'Z-A1',
    group: 'zone',
    badge: 'A1',
    zoneCode: 'A1',
    title: 'Khu A1 — Giảng đường Cao tầng A1',
    lat: 21.0738,
    lng: 105.7742,
    elevationM: 15,
    severity: 'safe',
    desc: 'Khu nhà giảng đường cao tầng đông sinh viên chuyển tiết; sảnh tầng 1 có mái che thoáng gió.',
    action: 'Trú mưa dông ngay tại sảnh tầng 1; chọn tuyến xanh lá để tránh sân bê tông nắng gắt.'
  },
  {
    id: 'Z-B',
    group: 'zone',
    badge: 'B',
    zoneCode: 'B',
    title: 'Khu B — Cơ sở Thực hành Phạm Văn Nghị',
    lat: 21.067813,
    lng: 105.757184,
    elevationM: 8.5,
    severity: 'warn',
    desc: 'Nằm ở bờ Tây sông Nhuệ nền thấp 8–10 m; cần lưu ý ngập đoạn Phố Viên – sông Nhuệ khi di chuyển giữa Khu A và Khu B.',
    action: 'Theo dõi mực nước trước giờ về; tránh tuyệt đối lối cuối Phố Viên ngập xoáy cống.'
  },

  // Y TẾ & CỨU HỘ QUANH MỎ
  {
    id: 'MED-01',
    group: 'medical',
    badge: '+',
    title: 'Trạm Y tế Trường ĐH Mỏ - Địa chất',
    lat: 21.07365,
    lng: 105.775,
    elevationM: 15,
    severity: 'safe',
    desc: 'Điểm sơ cứu say nắng, choáng váng, hạ nhiệt và hỗ trợ y tế ban đầu ngay trong khuôn viên trường.',
    action: 'Đưa người mệt lả/say nắng tới đây theo tuyến xanh dương đứt nét từ Khu A, A1 hoặc B.'
  },
  {
    id: 'MED-02',
    group: 'medical',
    badge: '+',
    title: 'Bệnh viện Đa khoa Phương Đông (Số 9 Phố Viên)',
    lat: 21.069922,
    lng: 105.774942,
    elevationM: 11,
    severity: 'safe',
    desc: 'Bệnh viện đa khoa trực cấp cứu 24/7 cách cổng 18 Phố Viên ~310 m.',
    action: 'Gọi 115 hoặc đưa ca sốc nhiệt nặng / chấn thương do ngã xe tới Khoa Cấp cứu.'
  },
  {
    id: 'MED-03',
    group: 'medical',
    badge: 'Rx',
    title: 'Cụm Nhà thuốc Phố Viên – Ngõ 32 Phố Viên',
    lat: 21.072734,
    lng: 105.772904,
    elevationM: 15,
    severity: 'safe',
    desc: 'Cung cấp nhanh gói điện giải Oresol, gạc hạ sốt ngay sát cổng trường (~110 m).',
    action: 'Mua ngay nước điện giải khi có dấu hiệu khô miệng, vã mồ hôi hoặc choáng nắng nhẹ.'
  },

  // ĐIỂM NGẬP & NGUY HIỂM QUANH TRƯỜNG MỎ
  {
    id: 'D-01',
    group: 'flood',
    badge: '!',
    title: 'Cuối Phố Viên — Điểm ngập sâu & Xoáy cống (Nguy hiểm cao)',
    lat: 21.069413,
    lng: 105.772544,
    elevationM: 10.5,
    severity: 'high',
    desc: 'Mặt đường gồ ghề nhiều ổ gà; khi mưa lớn > 40 mm nước dồn ra miệng cống sông Nhuệ tạo dòng xoáy rất nguy hiểm cho người đi xe máy từ Khu A sang Khu B.',
    action: 'TUYỆT ĐỐI không cố chạy xe qua khi ngập ngập quá mắt cá chân hoặc nước chảy xiết.'
  },
  {
    id: 'D-02',
    group: 'flood',
    badge: '!',
    title: 'Ngõ 199 – 235 Phố Viên (Dãy trọ thấp sát Sông Nhuệ)',
    lat: 21.06809,
    lng: 105.77261,
    elevationM: 8.7,
    severity: 'high',
    desc: 'Cốt nền tụt xuống ~8,7 m (thấp hơn cổng trường hơn 8 m), nước mưa dễ tràn thẳng vào phòng trọ tầng 1.',
    action: 'Ngắt cầu dao ổ cắm thấp sớm, kê cao đồ điện tử và di dời sang khu nền cao khi mưa lớn kéo dài.'
  },
  {
    id: 'D-03',
    group: 'flood',
    badge: '!',
    title: 'Cầu Phố Viên — Bờ Sông Nhuệ',
    lat: 21.07168,
    lng: 105.771249,
    elevationM: 11.5,
    severity: 'moderate',
    desc: 'Nằm sát mép sông Nhuệ, khi mực nước sông lên cao làm dềnh nước mặt cầu và hai đầu dốc.',
    action: 'Giảm tốc độ, giữ khoảng cách an toàn với xe lớn tránh sóng nước đánh ngã xe.'
  },
  {
    id: 'D-04',
    group: 'flood',
    badge: '!',
    title: 'Đoạn yên ngựa trũng Đường Lê Văn Hiến – Ngã ba Đức Thắng',
    lat: 21.074215,
    lng: 105.775455,
    elevationM: 11,
    severity: 'moderate',
    desc: 'Điểm trũng kẹp giữa hai gò cao Khu A (17 m) và CS2 HV Cảnh sát (17 m), nước mưa từ hai sườn đổ về rất nhanh.',
    action: 'Đi chậm sát giữa phần đường cao hơn; chú ý ổ gà ngập nước giờ tan học.'
  },
  {
    id: 'D-05',
    group: 'flood',
    badge: '!',
    title: 'Ngõ 521 – 523 Cổ Nhuế (Xóm trọ sát Khu A)',
    lat: 21.068619,
    lng: 105.776973,
    elevationM: 11.5,
    severity: 'moderate',
    desc: 'Cụm ngõ hẹp đông sinh viên HUMG thuê trọ, dễ đọng nước 20–40 cm khi mưa rào lớn vượt tải cống Cổ Nhuế.',
    action: 'Kiểm tra rò điện trước khi lội nước; tránh đi xe tay ga vào đoạn ngõ ngập quá nửa bánh.'
  },
  {
    id: 'D-06',
    group: 'flood',
    badge: '!',
    title: 'Khu vực Cầu Noi – Cổ Nhuế (Nút thắt ven Sông Nhuệ)',
    lat: 21.061634,
    lng: 105.772358,
    elevationM: 10.5,
    severity: 'high',
    desc: 'Điểm đen ngập sâu và ùn tắc giao thông kéo dài khi mưa bão diện rộng.',
    action: 'Tìm đường vòng qua trục Cổ Nhuế cao hoặc nán lại trường chờ nước rút.'
  },
  {
    id: 'D-07',
    group: 'flood',
    badge: '!',
    title: 'Điểm trũng đọng nước & trơn trượt nội khu A1 – trục giữa',
    lat: 21.07395,
    lng: 105.7751,
    elevationM: 12.5,
    severity: 'moderate',
    desc: 'Mặt sân gạch trơn khi mưa rào bất chợt, dễ trượt ngã khi chạy vội tới Trạm Y tế.',
    action: 'Bước chậm, bám theo hành lang có mái che thay vì chạy băng qua mặt sân ướt.'
  },
  {
    id: 'D-08',
    group: 'flood',
    badge: '!',
    title: 'Phố Văn Hội – Cụm trọ Đức Thắng (Cốt nền thấp 12 m)',
    lat: 21.07858,
    lng: 105.774559,
    elevationM: 12,
    severity: 'moderate',
    desc: 'Tập trung nhiều dãy trọ sinh viên; nước mưa dâng từ rãnh cống khi mưa > 45 mm.',
    action: 'Chuẩn bị đèn pin sạc, ngắt thiết bị điện đặt sát sàn nhà trọ.'
  },

  // ĐIỂM NẮNG NÓNG BỨC XẠ CAO
  {
    id: 'H-01',
    group: 'heat',
    badge: '☀',
    title: 'Khoảng sân mở hấp nhiệt Khu A – A1 (11h00–14h30)',
    lat: 21.07315,
    lng: 105.77415,
    elevationM: 16,
    severity: 'moderate',
    desc: 'Bề mặt bê tông rộng, ít tán cây che liên tục; nhiệt cảm nhận giữa trưa tăng thêm 3–5°C.',
    action: 'Ưu tiên đi theo Tuyến đường đi mát nhất (xanh lá) dọc hành lang nhà.'
  },
  {
    id: 'H-02',
    group: 'heat',
    badge: '☀',
    title: 'Điểm dừng xe buýt Phố Viên (Tuyến 09A, 28, 31)',
    lat: 21.071475,
    lng: 105.774225,
    elevationM: 13,
    severity: 'moderate',
    desc: 'Trạm trung chuyển đông sinh viên chờ xe giờ cao điểm nắng trưa (~121 m từ cổng trường).',
    action: 'Đội mũ rộng vành, mang theo nước mát/Oresol và đứng chờ dưới bóng râm tới sát giờ xe đến.'
  },
  {
    id: 'H-03',
    group: 'heat',
    badge: '☀',
    title: 'Điểm dừng xe buýt 138 Phạm Văn Đồng (Đường rộng không cây)',
    lat: 21.074511,
    lng: 105.785454,
    elevationM: 12,
    severity: 'high',
    desc: 'Mặt đường nhựa nhiều làn phơi nắng gắt, bức xạ phản xạ lớn khung 11h00–15h30.',
    action: 'Hạn chế đứng chờ lâu ngoài nắng gắt; nghỉ trong điểm có mái che nếu thấy hoa mắt chóng mặt.'
  }
];

export const QUIZ_15_QUESTIONS = [
  {
    id: 1,
    topic: 'Khu A – A1 – B',
    question: 'Trong 3 khu giảng đường quanh Trường ĐH Mỏ - Địa chất, khu nào có cốt nền địa hình thấp nhất (8–10 m) nằm ở bờ Tây sông Nhuệ?',
    options: ['Khu A (18 Phố Viên)', 'Khu A1 (Giảng đường cao tầng)', 'Khu B (Đường Phạm Văn Nghị)', 'Cả 3 khu ngang bằng nhau'],
    correctIndex: 2,
    explanation: 'Khu B trên đường Phạm Văn Nghị nằm ở bờ Tây sông Nhuệ có cốt nền thấp hơn (~8–10 m), trong khi gò Khu A cao khoảng 17 m.'
  },
  {
    id: 2,
    topic: 'Ngập & Xoáy cống',
    question: 'Khi mưa lớn (> 40–50 mm) xảy ra vào giờ chuyển tiết từ Khu A sang Khu B, đoạn đường nào cảnh báo nguy hiểm cao vì có xoáy cống mạnh và ổ gà?',
    options: ['Hành lang nối Thư viện Khu A', 'Cuối Phố Viên (đoạn dốc xuống sát sông Nhuệ)', 'Sảnh tầng 1 Khu A1', 'Cổng Nhà thuốc Ngõ 32 Phố Viên'],
    correctIndex: 1,
    explanation: 'Cuối Phố Viên bị tụt cao độ từ 12 m xuống dưới 9 m sát cửa xả sông Nhuệ, dễ tạo dòng chảy xiết và xoáy hút vào miệng cống.'
  },
  {
    id: 3,
    topic: 'Nắng nóng & Sốc nhiệt',
    question: 'Khung giờ nào được cảnh báo nắng nóng bức xạ gay gắt nhất tại các khoảng sân bê tông mở giữa Khu A và Khu A1?',
    options: ['06h30 – 08h30', '09h00 – 10h30', '11h00 – 14h30', '18h00 – 20h00'],
    correctIndex: 2,
    explanation: 'Từ 11h00 – 14h30 bức xạ mặt trời kết hợp phản xạ sân bê tông làm nhiệt độ cảm nhận ngoài trời tăng mạnh.'
  },
  {
    id: 4,
    topic: 'Nắng nóng & Sốc nhiệt',
    question: 'Khi thấy một sinh viên đi bộ ngoài nắng giữa trưa có dấu hiệu choáng váng, da nóng đỏ, buồn nôn, bước sơ cứu ban đầu ĐÚNG nhất là gì?',
    options: [
      'Đưa ngay vào phòng điều hòa 16°C và dội nước đá lạnh',
      'Đưa vào chỗ râm mát, nới lỏng quần áo, chườm khăn mát vào cổ – nách – bẹn và cho uống từng ngụm nước mát/Oresol nếu còn tỉnh',
      'Xoa dầu gió thật nóng rồi cho chạy bộ nhẹ',
      'Cho uống ngay 2 viên thuốc hạ sốt Paracetamol'
    ],
    correctIndex: 1,
    explanation: 'Theo khuyến cáo Bộ Y tế, phải hạ nhiệt từ từ ở vùng mạch máu lớn (cổ, nách, bẹn) tại nơi thoáng mát; không sốc nhiệt lạnh đột ngột hoặc lạm dụng Paracetamol.'
  },
  {
    id: 5,
    topic: 'Y tế quanh trường',
    question: 'Bệnh viện đa khoa trực cấp cứu 24/7 gần cổng Khu A (18 Phố Viên) nhất, cách khoảng 310 m là cơ sở nào?',
    options: ['Bệnh viện Bạch Mai', 'Bệnh viện Đa khoa Phương Đông (Số 9 Phố Viên)', 'Bệnh viện Hữu nghị Việt Đức', 'Bệnh viện K Tân Triều'],
    correctIndex: 1,
    explanation: 'Bệnh viện Đa khoa Phương Đông nằm ngay tại số 9 Phố Viên, cách cổng Khu A ~310 m và cuối Phố Viên ~255 m.'
  },
  {
    id: 6,
    topic: 'Di chuyển an toàn',
    question: 'Khi đi xe tay ga gặp đoạn đường ngập sâu quá nửa bánh xe ở ngõ 521 Cổ Nhuế hoặc Cầu Noi, hành động an toàn nhất là gì?',
    options: [
      'Giữ đều ga phóng nhanh vượt qua để khỏi trễ học',
      'Bám sát ngay sau xe buýt hoặc xe tải lớn',
      'Dừng lại tại khu vực nền cao ráo, tắt máy dắt qua hoặc đi vòng đường khác',
      'Chân chống nghiêng rồi cố đề nổ nhiều lần trong nước'
    ],
    correctIndex: 2,
    explanation: 'Nước quá nửa bánh xe sẽ tràn ống xả và bầu lọc gió làm thủy kích, đồng thời dòng chảy D×V cao dễ cuốn trượt bánh xe máy.'
  },
  {
    id: 7,
    topic: 'An toàn điện mùa ngập',
    question: 'Nếu phòng trọ tầng 1 ở ngõ 199–235 Phố Viên hoặc Văn Hội có dấu hiệu nước mưa bắt đầu tràn qua bậc cửa, bạn cần làm gì NGAY lập tức?',
    options: [
      'Cắm sẵn thêm quạt điện sát sàn cho mau khô',
      'Ngắt cầu dao / aptomat tổng, rút phích cắm thiết bị dưới thấp và giữ chân tay khô ráo',
      'Đứng trần chân dưới nước kéo dây nối dài lên giường',
      'Chờ nước ngập tới đầu gối mới tắt điện'
    ],
    correctIndex: 1,
    explanation: 'Ngắt aptomat trước khi nước chạm tới ổ cắm thấp là nguyên tắc sống còn tránh điện giật trong phòng trọ.'
  },
  {
    id: 8,
    topic: 'Khu A – A1 – B',
    question: 'Điểm dừng xe buýt ngay gần cổng ĐH Mỏ - Địa chất (cách 18 Phố Viên ~121 m) phục vụ các tuyến buýt nào?',
    options: ['Tuyến 09A, 28 và 31', 'Chỉ tuyến 01', 'Tuyến BRT 01', 'Tuyến 86 sân bay'],
    correctIndex: 0,
    explanation: 'Trạm xe buýt cổng Phố Viên – BV Phương Đông phục vụ sinh viên đi các tuyến 09A, 28 và 31.'
  },
  {
    id: 9,
    topic: 'Phòng chống thiên tai',
    question: 'Khi đang di chuyển giữa Khu A và Khu A1 bất ngờ gặp mưa dông kèm sấm sét và gió giật mạnh, bạn KHÔNG nên trú ở đâu?',
    options: [
      'Sảnh tầng 1 giảng đường Khu A1',
      'Hành lang bê tông có mái che của Khu A',
      'Đứng sát dưới gốc cây lớn đơn lẻ hoặc cạnh cột đèn kim loại ngoài sân',
      'Thư viện trường Khu A'
    ],
    correctIndex: 2,
    explanation: 'Đứng dưới tán cây đơn lẻ hoặc gần trụ kim loại tăng mạnh nguy cơ bị sét đánh hoặc cành cây gãy đổ.'
  },
  {
    id: 10,
    topic: 'Khu A – A1 – B',
    question: 'Trên trục đường Lê Văn Hiến ngay cạnh trường, vì sao đoạn gần ngã ba Đức Thắng lại thường bị ngập nhanh sau mưa rào?',
    options: [
      'Vì nằm trên đỉnh dốc cao nhất',
      'Vì đây là đoạn yên ngựa trũng (11 m) kẹp giữa gò Khu A (17 m) và CS2 HV Cảnh sát (17 m)',
      'Vì có hồ bơi tràn nước',
      'Vì đường lát gỗ thấm nước'
    ],
    correctIndex: 1,
    explanation: 'Địa hình võng giữa hai gò cao khiến nước mưa mặt đường từ hai phía dồn nhanh về điểm trũng yên ngựa.'
  },
  {
    id: 11,
    topic: 'Cẩm nang Bù nước',
    question: 'Cụm Nhà thuốc Ngõ 32 Phố Viên (~110 m từ cổng Khu A) giúp sinh viên bổ sung vật tư nào nhanh nhất khi có dấu hiệu say nắng nhẹ?',
    options: ['Nước tăng lực có gas đặc', 'Gói điện giải Oresol (pha đúng tỷ lệ) & gạc mát', 'Cà phê đen đặc', 'Thuốc giảm đau liều cao'],
    correctIndex: 1,
    explanation: 'Oresol pha đúng hướng dẫn trên bao bì giúp bù nước và điện giải an toàn khi mất mồ hôi do nắng nóng.'
  },
  {
    id: 12,
    topic: 'Tổng đài Khẩn cấp',
    question: 'Khi phát hiện người gặp nạn do nước cuốn, mắc kẹt vùng ngập sâu hoặc tai nạn cần cứu nạn khẩn cấp toàn quốc, gọi số nào miễn phí 24/7?',
    options: ['112 (Tìm kiếm cứu nạn) / 114 (Cứu hộ)', '1800 0000', '1080', '116'],
    correctIndex: 0,
    explanation: 'Số 112 là Tổng đài Tìm kiếm Cứu nạn & Thiên tai quốc gia, cùng với 114 (Cứu hộ CNCH) và 115 (Cấp cứu y tế).'
  },
  {
    id: 13,
    topic: 'Sự cố Điện lưới',
    question: 'Khi thấy cột điện bị nghiêng, dây điện đứt sà xuống vũng nước ngập quanh đường Cổ Nhuế – Phố Viên, khoảng cách tối thiểu cần giữ xa là bao nhiêu và gọi tổng đài nào?',
    options: [
      'Cách ít nhất 10 m, cảnh báo người khác và gọi 1900 1288 (EVNHANOI)',
      'Lấy cây gậy gỗ ẩm tự gạt dây điện ra',
      'Đi sát cách 1 m rồi bước nhảy qua',
      'Đổ thêm nước cho trôi dây điện'
    ],
    correctIndex: 0,
    explanation: 'Vùng rò điện trong nước rất nguy hiểm; phải giữ khoảng cách tối thiểu 10 m và gọi ngay 1900 1288 (hoặc 112/114).'
  },
  {
    id: 14,
    topic: 'Nhận diện bản đồ',
    question: 'Trên Bản đồ An toàn HUMG, đường nét liền màu XANH LÁ nối Khu A và Khu A1 biểu thị điều gì?',
    options: [
      'Đường cấm xe buýt',
      'Tuyến đường đi bộ mát nhất ưu tiên bóng cây & mái che khung 11h00–14h30',
      'Tuyến đường có dòng nước chảy xiết',
      'Đường ranh giới hành chính tỉnh'
    ],
    correctIndex: 1,
    explanation: 'Tuyến màu xanh lá là lộ trình gợi ý giảm nắng bức xạ nhờ hành lang nối nhà và hàng cây xanh nội khu.'
  },
  {
    id: 15,
    topic: 'Khảo sát nhà trọ',
    question: 'Trước khi thuê phòng trọ gần Trường ĐH Mỏ - Địa chất, dấu hiệu thực địa nào cho thấy xóm trọ dễ ngập lụt và nóng bức?',
    options: [
      'Có vệt ngấn bùn ẩm chân tường, nền thấp hơn mặt ngõ và lợp mái tôn không trần cách nhiệt',
      'Phòng có cửa sổ 2 hướng thoáng gió và lát gạch sáng màu',
      'Nhà nằm trên dải gò cao sát mặt đường Phố Viên',
      'Có đồng hồ điện lắp ở cao độ 1,8 m sát trần'
    ],
    correctIndex: 0,
    explanation: 'Vệt ngấn nước ở chân tường/cửa sắt và nền thấp hơn mặt ngõ là minh chứng lịch sử ngập thực tế của dãy trọ.'
  }
];

export const MOCK_ADMIN_DATA = {
  visits: {
    total: 3842,
    today: 247,
    unique: 1619,
    byPage: [
      { path: '/', label: 'Bản đồ Khu A – A1 – B quanh Mỏ', views: 1845 },
      { path: '/quiz-15', label: 'Bộ Quiz 15 câu An toàn HUMG', views: 964 },
      { path: '/tuyen-duong-mat', label: 'Tuyến đi mát 11h00–14h30', views: 492 },
      { path: '/tram-y-te', label: 'Tuyến nhanh tới Trạm Y tế / BV Phương Đông', views: 348 },
      { path: '/so-cuu-trai-nghiem', label: 'Sơ cứu & Ghi nhận trải nghiệm', views: 193 }
    ],
    last7Days: [
      { day: 'T2', visits: 390 },
      { day: 'T3', visits: 445 },
      { day: 'T4', visits: 520 },
      { day: 'T5', visits: 485 },
      { day: 'T6', visits: 615 },
      { day: 'T7', visits: 678 },
      { day: 'CN', visits: 709 }
    ]
  },
  quizStats: {
    baseAttempts: 486,
    baseAvgScore: 12.6,
    recentAttempts: [
      { id: 'QZ-912', name: 'Nguyễn Minh Quân', className: 'MT68', score: 15, total: 15, time: '14:12 · Hôm nay' },
      { id: 'QZ-911', name: 'Trần Thu Hà', className: 'ĐC67B', score: 13, total: 15, time: '13:48 · Hôm nay' },
      { id: 'QZ-910', name: 'Lê Hoàng Long', className: 'CNTT68', score: 14, total: 15, time: '11:30 · Hôm nay' },
      { id: 'QZ-909', name: 'Phạm Bảo Ngọc', className: 'KT68', score: 12, total: 15, time: '10:05 · Hôm nay' },
      { id: 'QZ-908', name: 'Vũ Đức Mạnh', className: 'DK67', score: 14, total: 15, time: '20:41 · Hôm qua' },
      { id: 'QZ-907', name: 'Đặng Thảo Vy', className: 'MT69', score: 11, total: 15, time: '17:19 · Hôm qua' }
    ]
  },
  feedbackItems: [
    {
      id: 'FB-204',
      name: 'Nguyễn Hải Nam (MT68)',
      route: 'Tuyến đi mát nhất (A → A1)',
      note: 'Đi theo hành lang mái che qua Thư viện mát hơn hẳn khoảng sân giữa lúc 12h15.',
      time: '12:25 · Hôm nay',
      isRead: false
    },
    {
      id: 'FB-203',
      name: 'Hoàng Lan Anh (KTX Khu A)',
      route: 'Đường từ Khu B tới Trạm Y tế',
      note: 'Hôm mưa to đoạn cuối Phố Viên dềnh nước ngang ống bô, may nhìn cảnh báo nên vòng đường trên kịp.',
      time: '09:40 · Hôm nay',
      isRead: false
    },
    {
      id: 'FB-202',
      name: 'Phạm Tuấn Kiệt (CNTT67)',
      route: 'Tuyến từ Khu A1 → Trạm Y tế',
      note: 'Sảnh tầng 1 A1 dễ đi bộ sang Trạm Y tế trong chưa tới 3 phút.',
      time: '16:10 · Hôm qua',
      isRead: true
    },
    {
      id: 'FB-201',
      name: 'Lê Phương Thảo (ĐC68)',
      route: 'Bộ Quiz 15 câu',
      note: 'Câu hỏi về ngắt cầu dao phòng trọ và Oresol rất thực tế cho tân sinh viên.',
      time: '14:05 · Hôm qua',
      isRead: true
    }
  ],
  incidentReports: [
    {
      id: 'BC-108',
      zone: 'Cuối Phố Viên',
      title: 'Miệng cống đối diện ngõ 215 Phố Viên bị rác che khuất khi mưa lớn',
      reporter: 'Sinh viên K68 (ẩn danh)',
      status: 'pending',
      time: '11:50 · Hôm nay'
    },
    {
      id: 'BC-107',
      zone: 'Khu B – Phạm Văn Nghị',
      title: 'Đọng nước 25 cm đoạn trước cổng thực hành Khu B sau cơn dông chiều',
      reporter: 'Nhóm khảo sát thực địa',
      status: 'pending',
      time: '17:45 · Hôm qua'
    },
    {
      id: 'BC-106',
      zone: 'Ngõ 521 Cổ Nhuế',
      title: 'Hố ga hở góc rẽ vào ngách xóm trọ, đã đặt cọc cảnh báo tạm',
      reporter: 'Cư dân Đông Ngạc',
      status: 'resolved',
      time: '08:30 · Hôm qua'
    }
  ]
};
