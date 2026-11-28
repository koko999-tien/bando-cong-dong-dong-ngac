import crypto from 'node:crypto';
import { put, get, list } from '@vercel/blob';
import { GoogleGenAI } from '@google/genai';
import {
  HUMG_CENTER,
  ERA5_CLIMATE_FACTS,
  MONTHLY_2026_CLIMATE,
  EMERGENCY_DIRECTORY,
  FLOOD_STREET_CORRIDORS,
  SAMPLE_HUMG_POINTS
} from '../humg-data.js';
import { KNOWLEDGE_NOTEBOOK_CARDS } from '../knowledge-engine.js';
import { CATEGORY_LABELS } from '../gis-utils.js';
import { DATA_CLASSES } from '../platform/data/provenance-catalog.js';
import { applyScientificGuardrails } from '../platform/ai/provider-layer.js';
import { createBoundedRateLimiter } from '../platform/security/validators.js';
import { buildCorsHeaders } from '../platform/security/cors.js';
import { buildNationalGroundedBrief, sanitizeCitizenJargon } from '../platform/ai/national-intelligence.js';

const AI_CONFIG_PATH = 'config/ai-provider.enc.json';
const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-4-argon'];
const DEEP_MODELS = ['gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'gemini-4-argon'];

// Chống lạm dụng tần suất gọi AI theo IP có trần bộ nhớ (Milestone 2 chuyển sang Upstash Redis)
const aiRateLimiter = createBoundedRateLimiter({ maxRequests: 18, windowMs: 60_000, maxEntries: 2000 });
function checkRateLimit(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';
  return aiRateLimiter.check(`ai:${ip}`).allowed;
}

function cleanText(val, maxLen = 600) {
  return String(val ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function getAuthSigningSecret() {
  const configured = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSCODE;
  if (configured && configured.trim().length >= 8) return configured.trim();
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProd) {
    throw new Error('SECURITY_MISCONFIGURED: Thiếu ADMIN_TOKEN_SECRET hoặc ADMIN_PASSCODE trong production.');
  }
  return 'local-dev-only-ephemeral-secret';
}

function verifyAdminToken(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  let secret;
  try {
    secret = getAuthSigningSecret();
  } catch {
    return false;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('hex');
  try {
    const a = Buffer.from(parts[2], 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function deriveVaultKey() {
  // Ưu tiên VAULT_ENCRYPTION_KEY tách biệt với khóa ký token (SEC-03)
  const dedicated = process.env.VAULT_ENCRYPTION_KEY?.trim();
  const baseSecret = dedicated && dedicated.length >= 16 ? dedicated : getAuthSigningSecret();
  return crypto.createHash('sha256').update(`ai-vault:${baseSecret}`).digest();
}

function encryptSecret(plainText) {
  const key = deriveVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: enc.toString('hex'),
    updatedAt: new Date().toISOString()
  };
}

function decryptSecret(payload) {
  if (!payload?.iv || !payload?.tag || !payload?.data) return '';
  try {
    const key = deriveVaultKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(payload.data, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

async function readPrivateJson(pathname, fallbackVal = null) {
  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return fallbackVal;
    return await new Response(res.stream).json();
  } catch {
    return fallbackVal;
  }
}

async function writePrivateJson(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

async function resolveGeminiApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10) {
    return { key: process.env.GEMINI_API_KEY.trim(), source: 'env' };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { key: '', source: 'none' };
  }
  const encObj = await readPrivateJson(AI_CONFIG_PATH, null);
  const decrypted = decryptSecret(encObj);
  return { key: decrypted, source: decrypted ? 'encrypted_blob_vault' : 'none' };
}

async function runGeminiInteractionWithFallback(apiKey, { models = FAST_MODELS, systemInstruction, input }) {
  const client = new GoogleGenAI({ apiKey });
  let lastErr = null;
  for (const model of models) {
    try {
      const interaction = await client.interactions.create({
        model,
        store: false,
        system_instruction: systemInstruction,
        input
      });
      const text = (interaction.output_text || '').trim();
      if (text) return { text, modelUsed: model };
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      // Nếu lỗi xác thực key thì dừng ngay, nếu 503/429 quá tải tạm thời thì tự chuyển model dự phòng
      if (msg.includes('API_KEY_INVALID') || msg.includes('401') || msg.includes('PERMISSION_DENIED')) {
        break;
      }
    }
  }
  throw lastErr || new Error('Không nhận được phản hồi từ mô hình Gemini.');
}

async function loadCloudCommunitySnapshot() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { extraReports: [], broadcast: null, livePulse: [] };
  }
  try {
    const [reportPage, broadcast, livePulseRaw] = await Promise.all([
      list({ prefix: 'reports/', limit: 60 }),
      readPrivateJson('config/broadcast.json', null),
      readPrivateJson('config/live-pulse.json', [])
    ]);
    const loaded = await Promise.all(
      (reportPage.blobs || []).slice(0, 25).map((b) => readPrivateJson(b.pathname, null))
    );
    const now = Date.now();
    const livePulse = (Array.isArray(livePulseRaw) ? livePulseRaw : [])
      .filter((x) => x && x.pointId && now - Number(x.tsMs || 0) <= 6 * 60 * 60 * 1000)
      .slice(0, 10);
    return {
      extraReports: loaded.filter((r) => r && r.status !== 'hidden'),
      broadcast,
      livePulse
    };
  } catch {
    return { extraReports: [], broadcast: null, livePulse: [] };
  }
}

function buildGroundedContextString(extraReports = [], liveWeather = null, broadcast = null, spotContext = null, liveAqi = null, livePulse = []) {
  const ptsSummary = [...SAMPLE_HUMG_POINTS, ...extraReports]
    .filter((p) => p.status !== 'hidden')
    .map(
      (p) =>
        `[${p.id}] ${p.name} | Lớp: ${p.layerGroup === 'safe' ? 'AN TOÀN' : 'RỦI RO'} (${CATEGORY_LABELS[p.category] || p.category}, Hạng ${p.confidenceTier}) | DEM: ${p.elevationM ?? '?'}m | Nguồn: ${p.sourceCitation || p.sourceType} | Chi tiết: ${(p.notes || '').slice(0, 180)}`
    )
    .join('\n');

  const corridorSummary = FLOOD_STREET_CORRIDORS.map(
    (fc) => `(${fc.id}) ${fc.name} — ngập khi mưa ≥${fc.rainThresholdMm}mm | Nguồn: ${fc.source}`
  ).join('\n');

  const eraSummary = ERA5_CLIMATE_FACTS.years
    .map(
      (y) =>
        `Năm ${y.year}: ${y.hotDays35} ngày ≥35°C, ${y.apparentHot40} ngày cảm nhận ≥40°C (đỉnh ${y.maxTempC}°C / ${y.maxApparentC}°C), ${y.rainDays50mm} ngày mưa ≥50mm — ${y.notableEvents}`
    )
    .join('\n');

  const month2026 = MONTHLY_2026_CLIMATE.map(
    (m) => `${m.month}: mưa ${m.rainMm}mm, Tmax ${m.maxTempC}°C, ${m.daysApparent40} ngày ≥40°C`
  ).join(' | ');

  const emerg = EMERGENCY_DIRECTORY.map((e) => `${e.org}: ${e.phone} (${e.address})`).join('\n');
  const kbDigest = KNOWLEDGE_NOTEBOOK_CARDS.map((k) => `(${k.id}) ${k.title}: ${k.summary}`).join('\n');

  const liveStr =
    liveWeather && Number.isFinite(Number(liveWeather.temp))
      ? `THỜI TIẾT TRỰC TIẾP TẠI 18 PHỐ VIÊN LÚC NÀY: ${liveWeather.temp}°C (cảm nhận ${liveWeather.apparentTemp}°C), mưa hiện tại ${liveWeather.rainMm} mm, tổng mưa dự báo hôm nay ${liveWeather.dailyRainMm} mm, UV tối đa ${liveWeather.uvMax}.`
      : 'THỜI TIẾT TRỰC TIẾP: Chưa truyền từ client.';

  const bcStr =
    broadcast?.active && broadcast?.message
      ? `BẢN TIN ĐIỀU HÀNH ĐANG PHÁT TRÊN WEB (${broadcast.level}): ${broadcast.message}`
      : '';

  const spotStr =
    spotContext && typeof spotContext === 'object'
      ? `VỊ TRÍ NGƯỜI DÙNG ĐANG CHẤM CHẨN ĐOÁN TRỰC TIẾP TRÊN BẢN ĐỒ: ${cleanText(spotContext.label || 'Điểm chọn', 140)} (${Number(spotContext.lat || 0).toFixed(5)}°N, ${Number(spotContext.lng || 0).toFixed(5)}°E), cao độ vệ tinh Copernicus DEM: ${spotContext.dem ?? '?'}m DSM, chỉ số nhạy cảm ngập thủy văn: ${spotContext.score ?? '?'}/100 (${cleanText(spotContext.levelLabel || '', 80)}), nơi trú an toàn gần nhất: ${cleanText(spotContext.nearestSafeName || '', 120)} (${spotContext.nearestSafeDistM ?? '?'}m).`
      : '';

  const aqiStr =
    liveAqi && Number.isFinite(Number(liveAqi.usAqi))
      ? `CHẤT LƯỢNG KHÔNG KHÍ TRỰC TIẾP (OPEN-METEO CAMS TẠI ĐH MỎ): US AQI = ${liveAqi.usAqi}, bụi mịn PM2.5 = ${liveAqi.pm25 ?? '?'} µg/m³, PM10 = ${liveAqi.pm10 ?? '?'} µg/m³.`
      : '';

  const pulseStr =
    Array.isArray(livePulse) && livePulse.length > 0
      ? `CẬP NHẬT HIỆN TRƯỜNG NGAY LÚC NÀY TỪ CỘNG ĐỒNG (<6 GIỜ): ${livePulse
          .map((p) => `[${p.pointId}] ${p.pointName}: ${p.status === 'flooding' ? 'ĐANG NGẬP' : p.status === 'receding' ? 'ĐANG RÚT' : 'ĐÃ KHÔ RÁO'}`)
          .join(' | ')}`
      : '';

  return [
    `TÂM KHẢO SÁT: ${HUMG_CENTER.label} (${HUMG_CENTER.lat}°N, ${HUMG_CENTER.lng}°E, bán kính 2,0 km; 78,5% diện tích 2km có cao độ Copernicus DEM GLO-30 ≤ 12,0 m DSM, riêng Khu A ĐH Mỏ nằm trên gò cao ~17 m DSM).`,
    liveStr,
    aqiStr,
    pulseStr,
    bcStr,
    spotStr,
    '--- CHUỖI KHÍ TƯỢNG THỰC TẾ ECMWF ERA5 (2024–2026) ---',
    eraSummary,
    `Chi tiết 11 tháng 2026: ${month2026}`,
    '--- DANH BẠ KHẨN CẤP PHƯỜNG ĐÔNG NGẠC (MỚI SAU 01/07/2025) ---',
    emerg,
    '--- HỒ SƠ TRI THỨC CHUYÊN SÂU ---',
    kbDigest,
    '--- 18 TUYẾN ĐƯỜNG & NGÕ XÓM TRỌ NGẬP XÁC THỰC (OPENSTREETMAP) ---',
    corridorSummary,
    '--- DANH SÁCH ĐẦY ĐỦ 60+ ĐIỂM BẢN ĐỒ (GHI RÕ MÃ [R-xx] / [S-xx] KHI TRÍCH DẪN) ---',
    ptsSummary
  ]
    .filter(Boolean)
    .join('\n');
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request)
  });
}

export async function GET(request) {
  const cors = buildCorsHeaders(request);
  try {
    const resolved = await resolveGeminiApiKey();
    return Response.json(
      {
        ok: true,
        aiReady: true,
        deterministicEngineReady: true,
        llmVaultConfigured: Boolean(resolved.key),
        nationalCoverageProvinces: 63,
        keySource: resolved.source,
        engine: resolved.key ? 'Google Gemini Interactions API v1 + Grounded 63-Province Synthesizer' : 'VN Resilience Multi-Source Deterministic Engine (63 Provinces)',
        models: resolved.key ? FAST_MODELS : ['multi-source-deterministic-v2']
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0', ...cors } }
    );
  } catch (err) {
    console.error('[api/ai-copilot GET error]', err);
    return Response.json({ ok: false, aiReady: false }, { status: 500, headers: cors });
  }
}

export async function POST(request) {
  const cors = buildCorsHeaders(request);
  try {
    if (!checkRateLimit(request, 18)) {
      return Response.json(
        { ok: false, error: 'Bạn đang gửi yêu cầu AI quá nhanh. Vui lòng đợi vài giây rồi thử lại.' },
        { status: 429, headers: cors }
      );
    }

    const body = await request.json();
    const action = body?.action || '';

    // 1. Quản trị viên lưu/cập nhật khóa Gemini mã hóa AES-256-GCM vào Private Blob
    if (action === 'admin_set_ai_key') {
      if (!verifyAdminToken(request)) {
        return Response.json({ ok: false, error: 'Yêu cầu đăng nhập quyền Quản trị viên.' }, { status: 401, headers: cors });
      }
      const candidateKey = String(body.apiKey || '').trim();
      if (candidateKey.length < 15) {
        return Response.json({ ok: false, error: 'Khóa API không hợp lệ.' }, { status: 400, headers: cors });
      }

      // Kiểm chứng khóa hoạt động thực tế trước khi lưu mã hóa
      const probe = await runGeminiInteractionWithFallback(candidateKey, {
        models: FAST_MODELS,
        systemInstruction: 'Trả lời ngắn gọn.',
        input: 'Trả lời đúng 1 từ: OK'
      });

      const encryptedPayload = encryptSecret(candidateKey);
      await writePrivateJson(AI_CONFIG_PATH, encryptedPayload);
      return Response.json({ ok: true, modelVerified: probe.modelUsed }, { headers: cors });
    }

    const { key: apiKey } = await resolveGeminiApiKey();

    // 2. Trợ lý Hỏi-Đáp Thực chứng Đa nguồn Toàn quốc (63 Tỉnh/Thành)
    if (action === 'ask_copilot') {
      const question = cleanText(body.question, 500);
      if (question.length < 3) {
        return Response.json({ ok: false, error: 'Vui lòng nhập câu hỏi cụ thể hơn.' }, { status: 400, headers: cors });
      }

      const zCtx = body.zoneContext && typeof body.zoneContext === 'object' ? body.zoneContext : {};
      const brief = buildNationalGroundedBrief({
        question,
        zone: zCtx.zone || { name: 'Phường Đông Ngạc, Hà Nội', province: 'Hà Nội', lat: HUMG_CENTER.lat, lng: HUMG_CENTER.lng, radiusKm: 2 },
        weather: zCtx.weather || body.liveWeather || null,
        hourlyForecast: zCtx.hourlyForecast || null,
        riverDischarge: zCtx.riverDischarge || null,
        aqi: zCtx.aqi || body.liveAqi || null,
        demStats: zCtx.demStats || null,
        vnZoneIntel: zCtx.vnZoneIntel || null,
        zonePoints: Array.isArray(zCtx.zonePoints) ? zCtx.zonePoints : SAMPLE_HUMG_POINTS,
        zoneCorridors: Array.isArray(zCtx.zoneCorridors) ? zCtx.zoneCorridors : []
      });

      const activeZoneName = cleanText(zCtx.zone?.name || 'Việt Nam', 120);
      const isCoreDongNgac = !zCtx.zone?.province || /Đông Ngạc|Hà Nội/i.test(activeZoneName);

      if (apiKey) {
        try {
          const { extraReports, broadcast, livePulse } = await loadCloudCommunitySnapshot();
          const dongNgacAppendix = isCoreDongNgac
            ? `\n--- DỮ LIỆU THAM CHIẾU HÀ NỘI/ĐÔNG NGẠC ---\n${buildGroundedContextString(extraReports, zCtx.weather || body.liveWeather || null, broadcast, body.spotContext || null, zCtx.aqi || body.liveAqi || null, livePulse)}`
            : '';

          const sysPrompt = [
            `Bạn là Trợ lý Địa không gian Thực chứng của nền tảng VN Resilience Atlas đang phân tích khu vực: "${activeZoneName}".`,
            'NGUYÊN TẮC KỶ LUẬT CHỐNG ẢO GIÁC (BẮT BUỘC 100%):',
            '1. CHỈ sử dụng số liệu thực tế được cung cấp trong HỒ SƠ TỔNG HỢP VÙNG bên dưới. Tuyệt đối KHÔNG tự bịa số đo ngoài dữ liệu, KHÔNG nhầm dữ liệu Hà Nội vào tỉnh/thành khác.',
            '2. Khi nhắc tới địa điểm có trong vùng, ghi kèm mã điểm trong ngoặc vuông (ví dụ: [R-01], [S-05], [OSM-...]) để người dùng bấm bay tới vị trí đó.',
            '3. Trả lời bằng tiếng Việt tự nhiên, súc tích, tránh thuật ngữ viết tắt khó hiểu cho người dân, chia 3–5 gạch đầu dòng rõ ràng.'
          ].join('\n');

          const fullInput = `HỒ SƠ TỔNG HỢP VÙNG (${activeZoneName}):\n${brief.answerText}${dongNgacAppendix}\n\nCÂU HỎI CỦA NGƯỜI DÙNG: "${question}"`;
          const { text, modelUsed } = await runGeminiInteractionWithFallback(apiKey, {
            models: FAST_MODELS,
            systemInstruction: sysPrompt,
            input: fullInput
          });

          const knownPointIds = [
            ...SAMPLE_HUMG_POINTS,
            ...extraReports,
            ...(Array.isArray(zCtx.zonePoints) ? zCtx.zonePoints : [])
          ].map((p) => p.id);
          const activeDataClasses = [
            DATA_CLASSES.OBSERVED_DATA,
            DATA_CLASSES.SATELLITE_DATA,
            DATA_CLASSES.MODELLED_DATA,
            DATA_CLASSES.FORECAST_DATA
          ];
          const guarded = applyScientificGuardrails(text, {
            knownPointIds,
            dataClasses: activeDataClasses,
            hasHumanOfficialApproval: false
          });

          return Response.json(
            {
              ok: true,
              mode: 'cloud_llm',
              answer: sanitizeCitizenJargon(guarded.answer),
              modelUsed,
              referencedPoints: brief.referencedPoints,
              metrics: brief.metrics,
              citedPointIds: guarded.factsCited,
              unverifiedCitedIds: guarded.unverifiedCitedIds,
              dataClasses: guarded.dataClasses,
              uncertaintyNotes: guarded.uncertaintyNotes,
              blockedOfficialClaim: guarded.blockedOfficialClaim
            },
            { headers: cors }
          );
        } catch (llmErr) {
          console.warn('[api/ai-copilot LLM fallback to deterministic]', llmErr?.message);
        }
      }

      // Chế độ Tổng hợp Thực chứng Đa nguồn tức thì (0 ms, luôn sẵn sàng kể cả khi chưa gắn khóa LLM đám mây)
      return Response.json(
        {
          ok: true,
          mode: 'grounded_synthesis',
          modelUsed: 'multi-source-deterministic-v2',
          answer: brief.answerText,
          headline: brief.headline,
          referencedPoints: brief.referencedPoints,
          metrics: brief.metrics
        },
        { headers: cors }
      );
    }

    if (!apiKey) {
      return Response.json(
        {
          ok: false,
          error: 'Chưa cấu hình khóa Gemini API trên máy chủ cho tác vụ phân tích ảnh/tổng hợp học thuật.'
        },
        { status: 503, headers: cors }
      );
    }

    // 3. Kiểm định Ảnh Hiện trường Đa phương thức (Gemini Multimodal Vision)
    if (action === 'inspect_photo') {
      const dataUrl = String(body.photoDataUrl || '');
      const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m || dataUrl.length > 90000) {
        return Response.json({ ok: false, error: 'Định dạng ảnh hoặc dung lượng không hợp lệ để kiểm định AI.' }, { status: 400 });
      }
      const mimeType = m[1];
      const base64Data = m[2];
      const catHint = cleanText(body.category || 'flood', 30);

      const visionSys = [
        'Bạn là Chuyên gia Kiểm định Ảnh Hiện trường Đô thị cho Bản đồ Cộng đồng Phường Đông Ngạc (Hà Nội).',
        'Nhiệm vụ: Quan sát bức ảnh người dân tải lên và trả về ĐÚNG 1 ĐỐI TƯỢNG JSON THUẦN TÚY (không bọc markdown ```json) theo cấu trúc:',
        '{"isValidScene": true/false, "sceneSummary": "mô tả ngắn gọn 1 câu tiếng Việt những gì thấy thực tế trong ảnh", "suggestedCategory": "flood|heat|traffic|shelter|medical", "suggestedWaterScale": "none|surface|ankle|half_wheel|knee_stall|enter_house", "suggestedHazards": ["open_drain_vortex","uneven_pothole","elec_leak_risk","lack_shade_heat"], "safetyNote": "1 lời khuyên ngắn hoặc lý do nếu ảnh không hợp lệ"}',
        'QUY TẮC CHỐNG ẢO GIÁC:',
        '- Nếu ảnh là ảnh chụp màn hình chat/Zalo/web, meme, ảnh trắng/đen tối mù, selfie trong phòng kín không liên quan đến đường sá/ngập/nắng/điểm trú -> đặt "isValidScene": false.',
        '- Tuyệt đối KHÔNG tự bịa con số cm cụ thể trong sceneSummary nếu không có thước đo trong ảnh; chỉ mô tả dấu hiệu trực quan (ví dụ: mặt đường đọng nước ngập gần nửa bánh xe máy, đoạn đường nhựa trống thiếu bóng cây, nhà chờ xe buýt có mái che...).'
      ].join('\n');

      const { text, modelUsed } = await runGeminiInteractionWithFallback(apiKey, {
        models: FAST_MODELS,
        systemInstruction: visionSys,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text: `Người gửi đang chọn danh mục "${catHint}". Hãy kiểm định ảnh này và xuất JSON thuần.`
              },
              {
                type: 'image',
                data: base64Data,
                mime_type: mimeType
              }
            ]
          }
        ]
      });

      let parsed = null;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        parsed = null;
      }

      if (!parsed || typeof parsed !== 'object') {
        return Response.json({
          ok: true,
          modelUsed,
          vision: {
            isValidScene: true,
            sceneSummary: text.slice(0, 180),
            suggestedCategory: catHint,
            suggestedWaterScale: 'half_wheel',
            suggestedHazards: [],
            safetyNote: ''
          }
        });
      }

      return Response.json({
        ok: true,
        modelUsed,
        vision: {
          isValidScene: Boolean(parsed.isValidScene),
          sceneSummary: cleanText(parsed.sceneSummary || '', 240),
          suggestedCategory: ['flood', 'heat', 'traffic', 'shelter', 'medical'].includes(parsed.suggestedCategory)
            ? parsed.suggestedCategory
            : catHint,
          suggestedWaterScale: ['none', 'surface', 'ankle', 'half_wheel', 'knee_stall', 'enter_house'].includes(
            parsed.suggestedWaterScale
          )
            ? parsed.suggestedWaterScale
            : 'none',
          suggestedHazards: Array.isArray(parsed.suggestedHazards)
            ? parsed.suggestedHazards.filter((h) =>
                ['open_drain_vortex', 'uneven_pothole', 'elec_leak_risk', 'lack_shade_heat'].includes(h)
              )
            : [],
          safetyNote: cleanText(parsed.safetyNote || '', 200)
        }
      });
    }

    // 4. Trợ lý AI Quản trị viên: Phân tích Học thuật Chương 5 & Soạn Bản tin Cảnh báo
    if (action === 'admin_ai_brief') {
      if (!verifyAdminToken(request)) {
        return Response.json({ ok: false, error: 'Yêu cầu đăng nhập quyền Quản trị viên.' }, { status: 401 });
      }
      const mode = body.mode === 'alert_draft' ? 'alert_draft' : 'chapter5_report';
      const statsSummary = cleanText(JSON.stringify(body.statsPayload || {}), 2500);

      const sysPrompt =
        mode === 'alert_draft'
          ? 'Bạn là Điều phối viên Truyền thông Phòng chống Thiên tai Đề tài 08 (ĐH Mỏ - Địa chất). Dựa trên số liệu thực tế được truyền vào, hãy soạn 1 thông điệp cảnh báo ngắn gọn (dưới 240 ký tự, súc tích, hành động rõ ràng, có nhãn [CẢNH BÁO CỘNG ĐỒNG ĐÔNG NGẠC] hoặc [DIỄN TẬP SỐ]) để phát lên đầu trang Bản đồ và nhóm Zalo Tổ dân phố. Không tự chế số liệu.'
          : 'Bạn là Giảng viên / Nghiên cứu viên GIS & Biến đổi Khí hậu hỗ trợ nhóm sinh viên Đề tài 08 (ĐH Mỏ - Địa chất). Dựa chặt vào số liệu thực tế Pre-test, Post-test, Mini-Quiz và dữ liệu điểm cộng đồng truyền vào, hãy viết 1 đoạn phân tích học thuật (khoảng 160–220 từ, văn phong báo cáo khoa học Chương 5) đánh giá định lượng hiệu quả chiến dịch, sự dịch chuyển nhận thức sơ cứu sốc nhiệt, mức tăng điểm tự tin và ý nghĩa của mô hình WebGIS Cộng đồng Mở kết hợp dữ liệu ERA5/DEM. Chỉ dùng đúng con số được cung cấp.';

      const { text, modelUsed } = await runGeminiInteractionWithFallback(apiKey, {
        models: mode === 'chapter5_report' ? DEEP_MODELS : FAST_MODELS,
        systemInstruction: sysPrompt,
        input: `Dữ liệu thực tế hiện tại của hệ thống: ${statsSummary}`
      });

      return Response.json({ ok: true, text, modelUsed });
    }

    return Response.json({ ok: false, error: 'Hành động AI không hợp lệ.' }, { status: 400 });
  } catch (err) {
    console.error('[api/ai-copilot POST error]', err);
    return Response.json({ ok: false, error: 'Tạm thời chưa xử lý được yêu cầu AI. Vui lòng thử lại sau giây lát.' }, { status: 500 });
  }
}
