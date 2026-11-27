/**
 * CITIZEN-FIRST LOGIC MODULE (PURE, TESTABLE, ZERO GIS JARGON)
 * Phục vụ giao diện người dân mặc định:
 * - Chuyển đổi dữ liệu khoa học sang thông điệp tiếng Việt đời thường, trung thực nguồn gốc
 * - Sinh khung cảnh báo 6 thành phần (Mức độ · Khu vực · Thời gian · Nguyên nhân · Việc nên làm · Nguồn)
 * - So sánh tuyến đường thông thường vs ít rủi ro hơn (không khẳng định an toàn tuyệt đối)
 * - Kiểm tra khu vực nhà trọ dựa trên dữ liệu hiện có + Checklist 12 mục (KHÔNG tự tạo điểm số A-D vô căn cứ)
 * - Quản lý hàng đợi gửi báo cáo ngoại tuyến an toàn (Offline Queue)
 */

export const PLAIN_SOURCE_LABELS = Object.freeze({
  OBSERVED_DATA: Object.freeze({
    short: 'Ghi nhận thực địa / Nguồn chính thống',
    tone: 'verified',
    note: 'Tổng hợp từ khảo sát thực địa, bản đồ hạ tầng hoặc báo chí có ngày ghi nhận.'
  }),
  FORECAST_DATA: Object.freeze({
    short: 'Dữ liệu dự báo thời tiết',
    tone: 'forecast',
    note: 'Dự báo tự động theo giờ, có thể sai lệch cục bộ khi mưa dông.'
  }),
  MODELLED_DATA: Object.freeze({
    short: 'Ước tính từ mô hình khu vực',
    tone: 'model',
    note: 'Ước tính cho vùng rộng, không thay thế trạm đo trực tiếp tại một ngõ cụ thể.'
  }),
  COMMUNITY_REPORTS: Object.freeze({
    short: 'Phản ánh từ người dân',
    tone: 'community',
    note: 'Do cư dân chia sẻ gần đây; hãy kiểm tra mức xác nhận và quan sát trực tiếp.'
  }),
  SIMULATED_DATA: Object.freeze({
    short: 'Kịch bản tham khảo (Mô phỏng)',
    tone: 'simulated',
    note: 'Chỉ dùng để hình dung vùng trũng thấp khi mưa lớn — KHÔNG phải tình trạng ngập thực tế lúc này.'
  })
});

export const CITIZEN_LANDMARKS = Object.freeze([
  { id: 'lm-humg', name: 'Cổng Trường ĐH Mỏ - Địa chất (18 Phố Viên)', shortName: 'Quanh ĐH Mỏ - Địa chất', lat: 21.072514, lng: 105.77387 },
  { id: 'lm-cuoi-pv', name: 'Cuối Phố Viên – Cổng Học viện Tài chính', shortName: 'Cuối Phố Viên / HV Tài chính', lat: 21.069413, lng: 105.772544 },
  { id: 'lm-ngo43-cn', name: 'Khu trọ Ngõ 43 Cổ Nhuế', shortName: 'Ngõ 43 Cổ Nhuế', lat: 21.0662, lng: 105.7768 },
  { id: 'lm-cau-noi', name: 'Ngã tư Cầu Noi – Đường Cổ Nhuế', shortName: 'Khu vực Cầu Noi', lat: 21.061634, lng: 105.772358 },
  { id: 'lm-duc-thang', name: 'Phường Đức Thắng – Đường Lê Văn Hiến', shortName: 'Đức Thắng / Lê Văn Hiến', lat: 21.0769, lng: 105.7764 },
  { id: 'lm-dong-ngac', name: 'Trung tâm Phường Đông Ngạc – Đường Đông Ngạc', shortName: 'Đông Ngạc / Kẻ Vẽ', lat: 21.0846, lng: 105.7765 },
  { id: 'lm-eco', name: 'Khu Ecohome – Tân Xuân – Chân cầu Thăng Long', shortName: 'Ecohome / Tân Xuân', lat: 21.0819, lng: 105.7834 },
  { id: 'lm-pvd', name: 'Trục Phạm Văn Đồng – Bến xe buýt', shortName: 'Đường Phạm Văn Đồng', lat: 21.0672, lng: 105.7848 }
]);

export const RENTAL_INSPECTION_CHECKLIST = Object.freeze([
  {
    id: 'flood_ask_neighbors',
    group: 'Ngập nước & Thoát nước',
    title: 'Hỏi hàng xóm hoặc quán nước đầu ngõ về trận mưa to gần nhất',
    detail: 'Hỏi rõ nước có dâng vào ngõ không, cao khoảng mắt cá chân hay ngập bánh xe, và rút sau bao lâu.'
  },
  {
    id: 'flood_wall_marks',
    group: 'Ngập nước & Thoát nước',
    title: 'Quan sát chân tường, bậc cửa và nhà để xe tầng 1',
    detail: 'Tìm vệt ngấn nước mờ, rêu ẩm, sơn bong tróc cách mặt nền 20–50 cm — dấu hiệu rõ nhất của nơi từng ngập.'
  },
  {
    id: 'flood_floor_height',
    group: 'Ngập nước & Thoát nước',
    title: 'Kiểm tra độ cao nền phòng trọ & lối ra đường lớn',
    detail: 'Ưu tiên nền nhà cao hơn mặt ngõ và có ít nhất 1 lối vòng cao ráo để dắt xe khi mưa lớn.'
  },
  {
    id: 'heat_orientation',
    group: 'Nắng nóng & Thông gió',
    title: 'Kiểm tra hướng nắng chiếu buổi chiều và mái nhà',
    detail: 'Phòng áp mái tôn hoặc tường hướng Tây thường rất nóng từ 13h đến tối muộn trong mùa hè Hà Nội.'
  },
  {
    id: 'heat_airflow',
    group: 'Nắng nóng & Thông gió',
    title: 'Kiểm tra cửa sổ thông gió tự nhiên & điều hòa',
    detail: 'Mở thử cửa sổ xem có thoáng gió không; kiểm tra cục nóng điều hòa không thổi hơi nóng ngược vào hành lang kín.'
  },
  {
    id: 'heat_elec_rate',
    group: 'Nắng nóng & Thông gió',
    title: 'Xác nhận rõ giá điện, giá nước mùa nắng cao điểm',
    detail: 'Hỏi cụ thể đơn giá kWh điện, nước sinh hoạt và công tơ riêng trước khi đặt cọc để tránh phát sinh lớn mùa hè.'
  },
  {
    id: 'elec_outlets',
    group: 'An toàn điện & PCCC',
    title: 'Ổ cắm điện, dây dẫn và cầu dao đặt cao, khô ráo',
    detail: 'Ổ điện và aptomat nên đặt cao cách sàn trên 1,2 m, có aptomat chống giật riêng cho từng phòng.'
  },
  {
    id: 'elec_escape',
    group: 'An toàn điện & PCCC',
    title: 'Kiểm tra lối thoát nạn và bình chữa cháy tại khu trọ',
    detail: 'Hành lang không bị xe máy chắn kín, cửa sổ/ban công có lối mở thoát hiểm và có bình chữa cháy còn hạn.'
  },
  {
    id: 'elec_ebike',
    group: 'An toàn điện & PCCC',
    title: 'Khu vực để xe và sạc xe điện có thông thoáng, khô ráo',
    detail: 'Tránh để ổ sạc xe điện sát nền ẩm thấp hoặc sát vật dễ cháy dưới gầm cầu thang.'
  },
  {
    id: 'env_drainage',
    group: 'Môi trường sống & Hỗ trợ',
    title: 'Quan sát cống rãnh, mùi nước thải và rác thải quanh ngõ',
    detail: 'Kiểm tra xem cống trước ngõ có hay ứ đọng, bốc mùi hoặc nhiều muỗi vào chiều tối không.'
  },
  {
    id: 'env_signal',
    group: 'Môi trường sống & Hỗ trợ',
    title: 'Thử sóng điện thoại và ánh sáng ban đêm trong ngõ',
    detail: 'Đảm bảo vẫn gọi được người thân/khẩn cấp trong phòng và ngõ có đèn đường khi đi học/làm về muộn.'
  },
  {
    id: 'env_medical',
    group: 'Môi trường sống & Hỗ trợ',
    title: 'Biết rõ đường tới bệnh viện, trạm y tế hoặc điểm trú gần nhất',
    detail: 'Lưu sẵn địa chỉ cơ sở y tế gần nhất (ví dụ BV Phương Đông hoặc Trạm Y tế phường) ngay trên điện thoại.'
  }
]);

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function formatDistancePlain(meters) {
  if (!Number.isFinite(meters)) return 'Chưa rõ khoảng cách';
  if (meters < 1000) return `Cách khoảng ${Math.round(meters / 10) * 10} m`;
  return `Cách khoảng ${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function describePointVerificationPlain(pt) {
  if (!pt) return { label: 'Chưa rõ nguồn', sourceClass: 'COMMUNITY_REPORTS', badgeTone: 'community' };
  const tier = pt.confidenceTier || 'C';
  if (tier === 'A') {
    return {
      label: 'Ghi nhận thực địa / Nguồn chính thống',
      sourceClass: 'OBSERVED_DATA',
      badgeTone: 'verified'
    };
  }
  if (tier === 'B') {
    const count = Number(pt.confirmCount) || 3;
    return {
      label: `${count} người dân cùng xác nhận`,
      sourceClass: 'COMMUNITY_REPORTS',
      badgeTone: 'community'
    };
  }
  return {
    label: 'Người dân mới báo (chờ kiểm chứng thêm)',
    sourceClass: 'COMMUNITY_REPORTS',
    badgeTone: 'pending'
  };
}

export function describeAqiPlain(usAqi) {
  const val = Number(usAqi);
  if (!Number.isFinite(val)) {
    return {
      level: 'unknown',
      headline: 'Đang cập nhật không khí',
      advice: 'Chưa nhận được số liệu chất lượng không khí lúc này.',
      tone: 'neutral'
    };
  }
  if (val <= 50) {
    return {
      level: 'good',
      headline: 'Không khí dễ chịu',
      advice: 'Phù hợp cho hoạt động ngoài trời và đi bộ.',
      tone: 'ok'
    };
  }
  if (val <= 100) {
    return {
      level: 'moderate',
      headline: 'Không khí ở mức trung bình',
      advice: 'Người bình thường sinh hoạt bình thường; người nhạy cảm nên hạn chế gắng sức ngoài đường lớn.',
      tone: 'ok'
    };
  }
  if (val <= 150) {
    return {
      level: 'sensitive',
      headline: 'Không khí kém với nhóm nhạy cảm',
      advice: 'Trẻ nhỏ, người lớn tuổi và người có bệnh hô hấp nên đeo khẩu trang lọc bụi mịn khi ra ngoài.',
      tone: 'warn'
    };
  }
  return {
    level: 'unhealthy',
    headline: 'Không khí ô nhiễm, nên hạn chế ra ngoài',
    advice: 'Nên đóng bớt cửa sổ giờ cao điểm, đeo khẩu trang chống bụi mịn và hạn chế tập thể dục ngoài trời.',
    tone: 'danger'
  };
}

/**
 * Biến các thông số khí tượng/cộng đồng thành 1 thông báo đời thường 6 thành phần rõ ràng.
 * Tuyệt đối không tạo cảnh báo giả và không bao giờ khẳng định "an toàn tuyệt đối".
 */
export function buildCitizenStatusAdvisory({
  areaName = 'Khu vực Đông Ngạc – ĐH Mỏ',
  weather = null,
  aqi = null,
  livePulseFeed = [],
  broadcast = null,
  nearbyFloodCount = 0,
  updatedAtLabel = 'Vừa cập nhật',
  isOffline = false
} = {}) {
  const activeFloodCheckins = (Array.isArray(livePulseFeed) ? livePulseFeed : []).filter(
    (item) => item && item.status === 'flooding'
  );

  // Ưu tiên 1: Thông báo điều hành đã xác minh đang phát
  if (broadcast && broadcast.active && broadcast.message) {
    const isRed = broadcast.level === 'red';
    return {
      level: isRed ? 'high' : 'attention',
      levelLabel: isRed ? 'Cần chú ý đặc biệt' : 'Cần lưu ý',
      headline: isRed ? 'Có thông báo ứng phó đang phát tại khu vực' : 'Có thông báo lưu ý cho khu vực',
      area: areaName,
      time: broadcast.updatedAt ? `Cập nhật ${new Date(broadcast.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : updatedAtLabel,
      cause: broadcast.message,
      action: isRed
        ? 'Hạn chế đi qua các đoạn đường trũng ngập, giữ liên lạc gia đình và tìm nơi trú cao ráo gần nhất khi cần.'
        : 'Theo dõi diễn biến thời tiết và kiểm tra lại lộ trình trước khi ra đường.',
      sourceType: 'Thông báo từ nhóm điều hành địa phương',
      sourceClass: 'OBSERVED_DATA',
      honestyNote: 'Nếu có tình huống khẩn cấp đe dọa tính mạng, hãy gọi ngay 114 hoặc 115 và làm theo hướng dẫn cơ quan chức năng.'
    };
  }

  const rainNow = Number(weather?.rainMm ?? 0);
  const dailyRain = Number(weather?.dailyRainMm ?? 0);
  const apparentTemp = Number(weather?.apparentTemp ?? weather?.temp ?? NaN);
  const usAqi = Number(aqi?.usAqi ?? NaN);

  // Ưu tiên 2: Đang có phản ánh cộng đồng trực tiếp về ngập (<6h) hoặc mưa rất lớn
  if (activeFloodCheckins.length > 0 || rainNow >= 10 || dailyRain >= 50) {
    const names = activeFloodCheckins.slice(0, 3).map((x) => x.pointName).join(', ');
    const causeParts = [];
    if (activeFloodCheckins.length > 0) {
      causeParts.push(`Có ${activeFloodCheckins.length} phản ánh từ người dân báo đang ngập gần đây (${names})`);
    }
    if (rainNow >= 10) {
      causeParts.push(`Dự báo lúc này đang có mưa vừa đến to (~${rainNow.toFixed(1)} mm/giờ)`);
    } else if (dailyRain >= 50) {
      causeParts.push(`Tổng lượng mưa dự báo hôm nay khá cao (~${Math.round(dailyRain)} mm)`);
    }
    return {
      level: activeFloodCheckins.length > 0 || dailyRain >= 70 ? 'high' : 'attention',
      levelLabel: activeFloodCheckins.length > 0 || dailyRain >= 70 ? 'Nguy cơ ngập cao' : 'Cần lưu ý mưa ngập',
      headline:
        activeFloodCheckins.length > 0
          ? 'Có phản ánh ngập gần đây — nên kiểm tra đường trước khi đi'
          : 'Dự báo mưa lớn hôm nay — đề phòng ngập cục bộ ở ngõ trũng',
      area: areaName,
      time: updatedAtLabel,
      cause: causeParts.join('. ') + '.',
      action:
        'Dùng mục "Tìm đường" để xem lối vòng tránh các đoạn hay ngập, tránh đi xe máy qua chỗ nước quá nửa bánh xe và tránh gần cột điện/miệng cống.',
      sourceType:
        activeFloodCheckins.length > 0
          ? 'Phản ánh từ người dân (6 giờ qua) kết hợp Dự báo thời tiết'
          : 'Dữ liệu dự báo thời tiết',
      sourceClass: activeFloodCheckins.length > 0 ? 'COMMUNITY_REPORTS' : 'FORECAST_DATA',
      honestyNote:
        'Dữ liệu dự báo và phản ánh cộng đồng có thể chưa phản ánh hết mọi con ngõ ngay lúc này — hãy luôn quan sát thực tế trước mặt.'
    };
  }

  // Ưu tiên 3: Nắng nóng gay gắt
  if (Number.isFinite(apparentTemp) && apparentTemp >= 38) {
    return {
      level: apparentTemp >= 41 ? 'high' : 'attention',
      levelLabel: apparentTemp >= 41 ? 'Nắng nóng gay gắt' : 'Trời nóng bức',
      headline: 'Nhiệt độ ngoài trời cao — đề phòng say nắng, mất nước',
      area: areaName,
      time: updatedAtLabel,
      cause: `Nhiệt độ cảm nhận ngoài trời ước khoảng ${Math.round(apparentTemp)}°C.`,
      action:
        'Hạn chế đứng lâu ngoài nắng khung 11h–15h, uống nước đều, đội mũ rộng vành và tìm điểm có mái che/bóng mát nếu thấy chóng mặt, mệt lả.',
      sourceType: 'Dữ liệu dự báo thời tiết',
      sourceClass: 'FORECAST_DATA',
      honestyNote: 'Nhiệt độ ngoài mặt đường nhựa ít cây xanh có thể nóng hơn mức dự báo chung.'
    };
  }

  // Ưu tiên 4: Không khí ô nhiễm rõ rệt
  if (Number.isFinite(usAqi) && usAqi > 150) {
    return {
      level: 'attention',
      levelLabel: 'Cần lưu ý không khí',
      headline: 'Chất lượng không khí kém — nên đeo khẩu trang khi ra ngoài',
      area: areaName,
      time: updatedAtLabel,
      cause: `Ước tính từ mô hình không khí khu vực ở mức kém (chỉ số khoảng ${Math.round(usAqi)}).`,
      action: 'Người lớn tuổi, trẻ nhỏ và người nhạy cảm nên đeo khẩu trang lọc bụi mịn và hạn chế vận động mạnh ngoài trời.',
      sourceType: 'Ước tính từ mô hình khu vực (không phải trạm đo tại chỗ)',
      sourceClass: 'MODELLED_DATA',
      honestyNote: 'Mức bụi mịn có thể cao hơn sát các tuyến đường đông xe cộ hoặc công trường.'
    };
  }

  // Trạng thái bình thường (TUYỆT ĐỐI không tuyên bố "an toàn tuyệt đối"!)
  return {
    level: 'normal',
    levelLabel: isOffline ? 'Đang xem dữ liệu đã lưu' : 'Chưa có cảnh báo bất thường',
    headline: isOffline
      ? 'Đang mất mạng — vẫn tra được điểm ngập lịch sử, nơi trú và số khẩn cấp'
      : 'Chưa ghi nhận mưa lớn hay báo ngập mới lúc này',
    area: areaName,
    time: updatedAtLabel,
    cause: isOffline
      ? 'Thiết bị hiện không có kết nối Internet nên không tải được thời tiết trực tiếp.'
      : `Trong phạm vi gần vị trí bạn chọn có ${nearbyFloodCount} điểm từng được ghi nhận hay ngập khi mưa lớn; hiện chưa có báo cáo ngập mới trong 6 giờ qua.`,
    action:
      'Bạn vẫn có thể tra trước đường tránh ngập, xem nơi trú gần nhà hoặc kiểm tra khu nhà trọ. Khi trời đổ mưa đột ngột, hãy cập nhật lại để xem phản ánh mới.',
    sourceType: isOffline ? 'Dữ liệu đã lưu sẵn trên máy' : 'Dữ liệu dự báo thời tiết & Phản ánh cộng đồng',
    sourceClass: isOffline ? 'OBSERVED_DATA' : 'FORECAST_DATA',
    honestyNote:
      'Không có cảnh báo hiện tại không đồng nghĩa khu vực an toàn tuyệt đối — tình trạng đường sá có thể thay đổi nhanh khi có mưa dông cục bộ hoặc sự cố bất ngờ.'
  };
}

/**
 * Tìm danh sách điểm gần một vị trí người dân chọn (tách rõ điểm rủi ro và điểm trú có mái che/y tế).
 */
export function getNearbyCitizenHighlights(lat, lng, allPoints = [], { radiusMeters = 1000 } = {}) {
  const valid = (Array.isArray(allPoints) ? allPoints : []).filter(
    (p) => p && p.status !== 'hidden' && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
  );

  const enriched = valid.map((p) => ({
    ...p,
    distanceMeters: haversineMeters(lat, lng, Number(p.lat), Number(p.lng)),
    verification: describePointVerificationPlain(p)
  }));

  const nearbyRisks = enriched
    .filter((p) => p.layerGroup === 'risk' && p.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Nơi trú & hỗ trợ: ưu tiên cơ sở y tế và điểm có mái che, KHÔNG ưu tiên hồ/công viên ngoài trời khi tránh mưa
  const sheltersAndMedical = enriched
    .filter((p) => p.layerGroup === 'safe' && !p.outdoorOnly)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearestMedical = sheltersAndMedical.find((p) => p.category === 'medical') || null;
  const nearestShelter = sheltersAndMedical[0] || null;

  return {
    nearbyRisks,
    sheltersAndMedical,
    nearestMedical,
    nearestShelter
  };
}

/**
 * Kiểm tra khu vực nhà trọ TRUNG THỰC: chỉ trình bày dữ liệu hiện có + khoảng cách thực tế,
 * TUYỆT ĐỐI KHÔNG tự sinh điểm số an toàn hay hạng A/B/C/D thiếu cơ sở.
 */
export function buildHonestRentalAreaSummary(lat, lng, areaLabel, allPoints = []) {
  const nearby500 = getNearbyCitizenHighlights(lat, lng, allPoints, { radiusMeters: 550 });
  const floodNearby = nearby500.nearbyRisks.filter((p) => p.category === 'flood' || p.category === 'traffic');
  const heatNearby = nearby500.nearbyRisks.filter((p) => p.category === 'heat');

  const observations = [];
  if (floodNearby.length > 0) {
    observations.push(
      `Trong khoảng 550 m quanh đây có ${floodNearby.length} vị trí từng được ghi nhận hay ngập hoặc khó đi khi mưa to (gần nhất là ${floodNearby[0].name}, ${formatDistancePlain(floodNearby[0].distanceMeters).toLowerCase()}).`
    );
  } else {
    observations.push(
      'Hệ thống hiện chưa ghi nhận điểm ngập nào trong bán kính 550 m quanh vị trí này. Điều này KHÔNG bảo đảm chắc chắn ngõ không ngập — bạn cần hỏi trực tiếp người sống quanh đó.'
    );
  }

  if (heatNearby.length > 0) {
    observations.push(
      `Gần đây có ${heatNearby.length} khu vực được ghi nhận ít bóng mát / nắng gắt buổi trưa (${heatNearby[0].name}).`
    );
  }

  if (nearby500.nearestMedical) {
    observations.push(
      `Cơ sở y tế gần nhất trong dữ liệu: ${nearby500.nearestMedical.name} (${formatDistancePlain(nearby500.nearestMedical.distanceMeters).toLowerCase()}).`
    );
  }
  if (nearby500.nearestShelter && nearby500.nearestShelter.id !== nearby500.nearestMedical?.id) {
    observations.push(
      `Điểm có mái che/hỗ trợ gần nhất: ${nearby500.nearestShelter.name} (${formatDistancePlain(nearby500.nearestShelter.distanceMeters).toLowerCase()}).`
    );
  }

  return {
    areaLabel: areaLabel || 'Vị trí bạn đang xem',
    lat,
    lng,
    floodNearby: floodNearby.slice(0, 6),
    heatNearby: heatNearby.slice(0, 4),
    nearestMedical: nearby500.nearestMedical,
    nearestShelter: nearby500.nearestShelter,
    observations,
    hasScoreOrGrade: false,
    epistemicWarning:
      'Hệ thống KHÔNG chấm điểm hay xếp hạng an toàn cho từng phòng trọ vì chưa khảo sát trực tiếp bên trong từng ngôi nhà. Hãy dùng danh sách 12 mục bên dưới khi đi xem phòng thực tế.'
  };
}

/**
 * So sánh 2 tuyến đường (Thông thường vs Ít rủi ro hơn) bằng tiếng Việt dễ hiểu,
 * nêu rõ lý do đề xuất và tuyệt đối không khẳng định "an toàn tuyệt đối".
 */
export function buildHonestRouteComparison({
  originName,
  destName,
  travelMode = 'bike',
  directRoute = null,
  detourRoute = null,
  liveFloodPointIds = new Set()
}) {
  const modeLabel = travelMode === 'foot' ? 'đi bộ' : 'đi xe máy';
  const directRisks = directRoute?.risks || [];
  const detourRisks = detourRoute?.risks || [];

  const directHasLive = directRisks.some((r) => liveFloodPointIds.has(r.id));
  const detourHasLive = detourRisks.some((r) => liveFloodPointIds.has(r.id));

  let recommendation = 'direct';
  let reason = '';

  if (detourRoute && (directRisks.length > detourRisks.length || (directHasLive && !detourHasLive))) {
    recommendation = 'detour';
    const avoidedNames = directRisks
      .filter((r) => !detourRisks.some((d) => d.id === r.id))
      .slice(0, 3)
      .map((r) => r.name);
    const extraMin = Math.max(0, Math.round((detourRoute.durationMin || 0) - (directRoute?.durationMin || 0)));
    reason =
      avoidedNames.length > 0
        ? `Nên cân nhắc tuyến ít rủi ro hơn vì tránh đi sát ${avoidedNames.join(', ')} (các đoạn từng ghi nhận hay ngập${directHasLive ? ' và đang có người dân báo ngập gần đây' : ''})${extraMin > 0 ? `, chỉ đi thêm khoảng ${extraMin} phút ${modeLabel}` : ''}.`
        : `Tuyến đề xuất đi qua ít vị trí từng ghi nhận ngập hơn tuyến ngắn nhất (${detourRisks.length} so với ${directRisks.length} vị trí).`;
  } else if (directRisks.length === 0) {
    recommendation = 'direct';
    reason =
      'Tuyến đường thông thường hiện không đi sát điểm ngập nào đã được ghi nhận trong hệ thống. Tuy nhiên vẫn cần quan sát mặt đường thực tế nếu đang có mưa lớn.';
  } else {
    recommendation = 'direct_caution';
    const names = directRisks.slice(0, 3).map((r) => r.name).join(', ');
    reason = `Cả tuyến chính và nhánh lân cận đều đi gần khu vực có nguy cơ ngập đã ghi nhận (${names}). Nếu trời đang mưa to, nên tạm chờ nước rút hoặc cân nhắc đổi giờ di chuyển.`;
  }

  return {
    originName,
    destName,
    modeLabel,
    recommendation,
    reason,
    directSummary: directRoute
      ? {
          distanceKm: directRoute.distanceKm,
          durationMin: directRoute.durationMin,
          riskCount: directRisks.length,
          liveFloodHit: directHasLive,
          riskNames: directRisks.slice(0, 4).map((r) => r.name)
        }
      : null,
    detourSummary: detourRoute
      ? {
          distanceKm: detourRoute.distanceKm,
          durationMin: detourRoute.durationMin,
          riskCount: detourRisks.length,
          liveFloodHit: detourHasLive,
          riskNames: detourRisks.slice(0, 4).map((r) => r.name)
        }
      : null,
    cannotGuaranteeSafeNotice:
      'Lưu ý quan trọng: Hệ thống KHÔNG khẳng định tuyến đường an toàn tuyệt đối do tình trạng ngập, cây đổ hoặc tắc đường có thể phát sinh bất ngờ ngoài dữ liệu đã ghi nhận. Không đi vào đoạn nước chảy xiết hoặc ngập sâu quá nửa bánh xe.'
  };
}

/**
 * Tạo đối tượng hàng đợi báo cáo ngoại tuyến có Idempotency-Key chống gửi trùng.
 */
export function createOfflineReportQueueItem(reportPayload, nowMs = Date.now()) {
  return {
    queueId: `OFF-${nowMs.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    queuedAt: new Date(nowMs).toISOString(),
    payload: { ...reportPayload },
    attempts: 0
  };
}
