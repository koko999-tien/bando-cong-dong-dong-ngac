/**
 * NATIONAL MULTI-SOURCE GEOSPATIAL INTELLIGENCE SYNTHESIZER
 * Tổng hợp định lượng đa nguồn cho 34 tỉnh/thành sau sáp nhập NQ 202/2025 (hỗ trợ cả 63 địa bàn cũ):
 * - Địa giới hành chính trước/sau sáp nhập & quy mô dân cư vòng khoanh (vn2000.vn / gis.vn)
 * - Phân bố cao độ & độ dốc địa hình vùng (min/p50/max, % vùng trũng thấp, độ dốc lớn nhất)
 * - Diễn biến mưa 24h & Lưu lượng dòng chảy sông 21 ngày (Copernicus GloFAS)
 * - Thủy động lực phương tiện Manning & tiêu chuẩn D×V (Martínez-Gomariz et al., 2016)
 * - Chất lượng không khí theo QCVN 05:2023/BTNMT (ngưỡng PM2.5 24h = 50 µg/m³)
 * - Xuất danh sách điểm bản đồ gần nhất (`referencedPoints`) để tạo nút bay tới vị trí 1 chạm.
 */

import { computeHydrodynamicInstability } from './distress-inference.js';
import { haversineMeters, formatDistancePlain } from '../../citizen-logic.js';

export function sanitizeCitizenJargon(text) {
  return String(text || '')
    .replace(/Bấm nút\s*[“"]Phân tích\s*&\s*Vẽ lộ trình OSRM[”"]\s*bên dưới/gi, 'Mở mục “Lộ trình” để đối chiếu tuyến đường')
    .replace(/\bCopernicus DEM(?: GLO-30)?\b/gi, 'địa hình mặt đất khu vực')
    .replace(/\bDEM\s*[\d–\-.,]+\s*m\b/gi, 'vùng trũng thấp')
    .replace(/\bDEM\b/gi, 'cao độ mặt đất')
    .replace(/\bOSRM\b/gi, 'bản đồ lộ trình')
    .replace(/\bECMWF ERA5\b/gi, 'lịch sử thời tiết khu vực')
    .replace(/\bERA5\b/gi, 'lịch sử thời tiết')
    .replace(/\bDSM\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function detectQuestionIntent(qLower) {
  if (/điện|chập|rò|ổ cắm|cầu dao|sét/.test(qLower)) return 'electric';
  if (/đường|đi qua|lộ trình|xe máy|ô tô|tuyến|chết máy/.test(qLower)) return 'route';
  if (/y tế|bệnh viện|trú|sơ cứu|thuốc|cứu hộ|ngập sâu/.test(qLower)) return 'medical';
  if (/sạt lở|taluy|núi|đá lở|độ dốc|lũ quét/.test(qLower)) return 'landslide';
  if (/nắng|nhiệt|bụi|không khí|aqi|pm2\.5|ô nhiễm/.test(qLower)) return 'air_heat';
  return 'overview';
}

export function buildNationalGroundedBrief({
  question = '',
  zone = {},
  weather = null,
  hourlyForecast = null,
  riverDischarge = null,
  aqi = null,
  demStats = null,
  vnZoneIntel = null,
  zonePoints = [],
  zoneCorridors = []
} = {}) {
  const zName = String(zone?.name || 'Khu vực đang khoanh');
  const zProv = String(zone?.province || 'Việt Nam');
  const zLat = Number(zone?.lat) || 21.072514;
  const zLng = Number(zone?.lng) || 105.77387;
  const radiusKm = Number(zone?.radiusKm) || 2;
  const intent = detectQuestionIntent(String(question || '').toLowerCase());

  const precip24 = Array.isArray(hourlyForecast?.precipitation)
    ? hourlyForecast.precipitation.slice(0, 24).map((x) => Math.max(0, Number(x) || 0))
    : [];
  const hourlyPeakMm = precip24.length ? Math.max(...precip24) : Number(weather?.rainMm || 0);
  const dailyRain = Number(weather?.dailyRainMm || 0);
  const curRain = Number(weather?.rainMm || 0);
  const tempC = Number(weather?.temp);
  const apparentC = Number(weather?.apparentTemp);
  const pm25 = Number(aqi?.pm25);
  const usAqi = Number(aqi?.usAqi);
  const qcvnRatio = Number.isFinite(pm25) ? Math.round((pm25 / 50) * 100) / 100 : null;

  const minElev = Number.isFinite(Number(demStats?.minM)) ? Number(demStats.minM) : null;
  const p50Elev = Number.isFinite(Number(demStats?.p50M)) ? Number(demStats.p50M) : 12;
  const maxElev = Number.isFinite(Number(demStats?.maxM)) ? Number(demStats.maxM) : null;
  const maxSlopeDeg = Number.isFinite(Number(demStats?.maxSlopeDeg)) ? Number(demStats.maxSlopeDeg) : 1.5;

  const ranked = (Array.isArray(zonePoints) ? zonePoints : [])
    .map((p) => ({
      ...p,
      distM: Number.isFinite(Number(p.distanceMeters))
        ? Number(p.distanceMeters)
        : haversineMeters(zLat, zLng, Number(p.lat), Number(p.lng))
    }))
    .sort((a, b) => a.distM - b.distM);

  const riskPts = ranked.filter((p) => p.layerGroup === 'risk');
  const safePts = ranked.filter((p) => p.layerGroup === 'safe');
  const topRisks = riskPts.slice(0, 2);
  const topSafes = safePts.slice(0, 2);

  const hydroLow = computeHydrodynamicInstability({
    elevM: minElev !== null ? minElev : p50Elev - 3,
    medianElevM: p50Elev,
    minElevM: minElev !== null ? minElev : p50Elev - 5,
    slopeDeg: Math.min(8, maxSlopeDeg),
    rainMmPerHour: Math.max(curRain, hourlyPeakMm),
    dailyRainMm: Math.max(dailyRain, hourlyPeakMm * 2.5),
    nearFloodSpotMeters: riskPts[0]?.distM ?? 400
  });

  const postAdmin = vnZoneIntel?.admin?.postMerger?.fullLabel;
  const preAdmin = vnZoneIntel?.admin?.preMerger?.fullLabel;
  const popEst = vnZoneIntel?.populationZone?.population;

  const bullets = [];

  // 1. Khối thông tin địa bàn, hành chính & địa hình
  const adminBit = postAdmin
    ? `Đơn vị hành chính hiện hành: ${postAdmin}${preAdmin ? ` (trước sáp nhập: ${preAdmin})` : ''}`
    : `${zName} (${zProv})`;
  const popBit = popEst != null ? `, ước tính ~${Number(popEst).toLocaleString('vi-VN')} cư dân trong vòng khoanh ${radiusKm} km` : '';
  const elevBit =
    minElev !== null && maxElev !== null
      ? `; cao độ mặt đất dao động ${minElev.toFixed(1)}–${maxElev.toFixed(1)} m (${demStats?.lowlandPct ?? '--'}% vùng trũng thấp, dốc tối đa ${maxSlopeDeg.toFixed(1)}°)`
      : '';
  bullets.push(`Bối cảnh vùng: ${adminBit}${popBit}${elevBit}.`);

  // 2. Khối diễn biến mưa – sông – AQI hiện tại
  const weatherParts = [];
  if (Number.isFinite(tempC)) {
    weatherParts.push(`nhiệt độ ${Math.round(tempC)}°C (cảm nhận ${Math.round(apparentC || tempC)}°C)`);
  }
  weatherParts.push(`mưa hiện tại ${curRain.toFixed(1)} mm/h, tổng ngày ~${Math.round(dailyRain)} mm (đỉnh 24h tới ~${hourlyPeakMm.toFixed(1)} mm/h)`);
  if (riverDischarge?.todayVal != null) {
    weatherParts.push(
      `lưu lượng lưu vực sông ~${Number(riverDischarge.todayVal).toFixed(1)} m³/s (gấp ×${Number(riverDischarge.ratioVsMean || 1).toFixed(2)} trung bình mùa)`
    );
  }
  if (Number.isFinite(usAqi)) {
    const qcvnStatus =
      qcvnRatio !== null
        ? qcvnRatio > 1
          ? `PM2.5 ~${pm25.toFixed(1)} µg/m³ — vượt chuẩn QCVN 05:2023/BTNMT ×${qcvnRatio}`
          : `PM2.5 ~${pm25.toFixed(1)} µg/m³ — đạt chuẩn QCVN 05:2023/BTNMT`
        : '';
    weatherParts.push(`không khí US AQI ${Math.round(usAqi)}${qcvnStatus ? ` (${qcvnStatus})` : ''}`);
  }
  bullets.push(`Quan trắc & Dự báo lúc này: ${weatherParts.join('; ')}.`);

  // 3. Khối trả lời chuyên sâu theo đúng câu hỏi người dùng
  if (intent === 'electric') {
    bullets.push(
      'An toàn điện khẩn cấp khi nước dâng: Ngắt ngay cầu dao / aptomat tổng (nhất là tầng trệt và phòng có ổ cắm thấp < 0.8 m). Tuyệt đối không cầm tay ướt chạm vào tủ điện, trụ đèn kim loại hoặc dây cáp sà thấp; giữ khoảng cách tối thiểu 10 m và gọi ngay 1900 1288 / 1900 6769 (Điện lực) hoặc 112.'
    );
  } else if (intent === 'landslide') {
    bullets.push(
      maxSlopeDeg >= 12
        ? `Cảnh báo sườn dốc vùng ${zName}: Địa hình có sườn dốc tới ${maxSlopeDeg.toFixed(1)}°. Khi mưa tích lũy vượt 50–80 mm/ngày, cần chủ động rời xa chân taluy, vết nứt mái dốc hoặc khe suối hẹp nghi lũ quét.`
        : `Độ dốc chung tại ${zName} tối đa ${maxSlopeDeg.toFixed(1)}° (tương đối bằng phẳng), tuy nhiên vẫn cần cảnh giác sạt bờ sông/kênh rạch hoặc công trình đào sâu khi triều rút nhanh.`
    );
  } else if (intent === 'air_heat') {
    bullets.push(
      Number.isFinite(apparentC) && apparentC >= 37
        ? `Căng thẳng nhiệt đang ở mức cao (~${Math.round(apparentC)}°C): Hạn chế làm việc/chờ xe ngoài trời khung 11h–15h, bổ sung nước điện giải và di chuyển tới cơ sở có mái che.`
        : `Điều kiện nhiệt–không khí cần lưu ý: ${Number.isFinite(pm25) && pm25 > 50 ? 'Đeo khẩu trang lọc bụi mịn PM2.5 khi ra đường.' : 'Không khí và nhiệt độ ở ngưỡng sinh hoạt bình thường.'}`
    );
  } else {
    const dvComment =
      hydroLow.depthM >= 0.24 || hydroLow.dvProduct >= 0.15
        ? `Tại điểm trũng thấp nhất vùng, mô hình dòng chảy tràn ước tính độ sâu ~${Math.round(hydroLow.depthM * 100)} cm, vận tốc tràn ~${hydroLow.velocityMs.toFixed(2)} m/s (tích số nguy cơ mất bám D×V = ${hydroLow.dvProduct.toFixed(3)} m²/s — vượt ngưỡng dễ chết máy xe tay ga). Hãy chuyển sang mục "Lộ trình" để tìm tuyến nền cao.`
        : `Dòng chảy tràn ước tính tại vùng trũng thấp khoảng ~${Math.round(hydroLow.depthM * 100)} cm (D×V = ${hydroLow.dvProduct.toFixed(3)} m²/s). Vẫn cần tránh các tuyến rốn ngập khi mưa dồn ≥ 40 mm hoặc triều cường.`;
    bullets.push(`Đánh giá di chuyển & an toàn phương tiện: ${dvComment}`);
  }

  // 4. Điểm rủi ro & Điểm trú / Y tế gần nhất trong đúng vùng đang khoanh
  const corrTxt = zoneCorridors.length
    ? ` Các tuyến rủi ro trọng điểm gần đây: ${zoneCorridors.slice(0, 2).map((c) => c.name).join(', ')}.`
    : '';
  const riskLine = topRisks.length
    ? `Điểm cảnh báo gần tâm vùng: ${topRisks.map((r) => `[${r.id}] ${r.name} (${formatDistancePlain(r.distM)})`).join('; ')}.${corrTxt}`
    : `Hiện ghi nhận ${riskPts.length} điểm cảnh báo nội vùng.${corrTxt}`;
  const safeLine = topSafes.length
    ? `Y tế & điểm tránh trú gần nhất: ${topSafes.map((s) => `[${s.id}] ${s.name} (${formatDistancePlain(s.distM)})`).join('; ')}. Tổng đài cứu hộ 24/7: 112 / 115.`
    : `Tổng đài cứu hộ khẩn cấp quốc gia 24/7: 112 (Tìm kiếm cứu nạn), 115 (Cấp cứu y tế), 114 (PCCC/Cứu hộ).`;
  bullets.push(riskLine);
  bullets.push(safeLine);

  const referencedPoints = [...topRisks, ...topSafes].map((p) => ({
    id: p.id,
    name: p.name,
    lat: Number(p.lat),
    lng: Number(p.lng),
    layerGroup: p.layerGroup,
    distanceMeters: Math.round(p.distM)
  }));

  const cleanedBullets = bullets.map((b) => sanitizeCitizenJargon(b));
  const headline = sanitizeCitizenJargon(`Tổng hợp đa nguồn tại ${zName} (R = ${radiusKm} km)`);

  return {
    headline,
    intent,
    bullets: cleanedBullets,
    answerText: cleanedBullets.map((b) => `• ${b}`).join('\n'),
    referencedPoints,
    metrics: {
      rainPeak24hMm: Math.round(hourlyPeakMm * 10) / 10,
      riverDischargeMs: riverDischarge?.todayVal != null ? Math.round(Number(riverDischarge.todayVal) * 10) / 10 : null,
      riverRatio: riverDischarge?.ratioVsMean != null ? Math.round(Number(riverDischarge.ratioVsMean) * 100) / 100 : null,
      dvProduct: hydroLow.dvProduct,
      estimatedLowlandDepthCm: Math.round(hydroLow.depthM * 100),
      qcvnAirCompliant: Number.isFinite(pm25) ? pm25 <= 50 : null,
      riskCount: riskPts.length,
      safeCount: safePts.length
    }
  };
}
