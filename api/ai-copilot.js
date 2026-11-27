import crypto from 'node:crypto';
import { put, get, list } from '@vercel/blob';
import { GoogleGenAI } from '@google/genai';
import {
  HUMG_CENTER,
  ERA5_CLIMATE_FACTS,
  MONTHLY_2026_CLIMATE,
  EMERGENCY_DIRECTORY,
  SAMPLE_HUMG_POINTS
} from '../humg-data.js';
import { KNOWLEDGE_NOTEBOOK_CARDS } from '../knowledge-engine.js';
import { CATEGORY_LABELS } from '../gis-utils.js';

const AI_CONFIG_PATH = 'config/ai-provider.enc.json';
const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-4-argon'];
const DEEP_MODELS = ['gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'gemini-4-argon'];

// Chống lạm dụng tần suất gọi AI theo IP trên mỗi instance (tối đa 18 lượt / 60 giây / IP)
const rateWindowMap = new Map();
function checkRateLimit(request, maxPerMin = 18) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';
  const now = Date.now();
  const rec = rateWindowMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + 60000;
  }
  rec.count += 1;
  rateWindowMap.set(ip, rec);
  return rec.count <= maxPerMin;
}

function cleanText(val, maxLen = 600) {
  return String(val ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function verifyAdminToken(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSCODE || 'humg-fallback-secret';
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
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSCODE || 'humg-fallback-secret';
  return crypto.createHash('sha256').update(`ai-vault:${secret}`).digest();
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
    return { extraReports: [], broadcast: null };
  }
  try {
    const [reportPage, broadcast] = await Promise.all([
      list({ prefix: 'reports/', limit: 60 }),
      readPrivateJson('config/broadcast.json', null)
    ]);
    const loaded = await Promise.all(
      (reportPage.blobs || []).slice(0, 25).map((b) => readPrivateJson(b.pathname, null))
    );
    return {
      extraReports: loaded.filter((r) => r && r.status !== 'hidden'),
      broadcast
    };
  } catch {
    return { extraReports: [], broadcast: null };
  }
}

function buildGroundedContextString(extraReports = [], liveWeather = null, broadcast = null) {
  const ptsSummary = [...SAMPLE_HUMG_POINTS, ...extraReports]
    .filter((p) => p.status !== 'hidden')
    .map(
      (p) =>
        `[${p.id}] ${p.name} | Lớp: ${p.layerGroup === 'safe' ? 'AN TOÀN' : 'RỦI RO'} (${CATEGORY_LABELS[p.category] || p.category}, Hạng ${p.confidenceTier}) | DEM: ${p.elevationM ?? '?'}m | Nguồn: ${p.sourceCitation || p.sourceType} | Chi tiết: ${(p.notes || '').slice(0, 180)}`
    )
    .join('\n');

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

  return [
    `TÂM KHẢO SÁT: ${HUMG_CENTER.label} (${HUMG_CENTER.lat}°N, ${HUMG_CENTER.lng}°E, bán kính 2,0 km).`,
    liveStr,
    bcStr,
    '--- CHUỖI KHÍ TƯỢNG THỰC TẾ ECMWF ERA5 (2024–2026) ---',
    eraSummary,
    `Chi tiết 11 tháng 2026: ${month2026}`,
    '--- DANH BẠ KHẨN CẤP PHƯỜNG ĐÔNG NGẠC (MỚI SAU 01/07/2025) ---',
    emerg,
    '--- HỒ SƠ TRI THỨC CHUYÊN SÂU ---',
    kbDigest,
    '--- DANH SÁCH ĐẦY ĐỦ ĐIỂM BẢN ĐỒ (GHI RÕ MÃ [R-xx] / [S-xx] KHI TRÍCH DẪN) ---',
    ptsSummary
  ]
    .filter(Boolean)
    .join('\n');
}

export async function GET() {
  try {
    const resolved = await resolveGeminiApiKey();
    return Response.json(
      {
        ok: true,
        aiReady: Boolean(resolved.key),
        keySource: resolved.source,
        engine: 'Google Gemini Interactions API v1',
        models: FAST_MODELS
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err) {
    console.error('[api/ai-copilot GET error]', err);
    return Response.json({ ok: false, aiReady: false }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!checkRateLimit(request, 18)) {
      return Response.json(
        { ok: false, error: 'Bạn đang gửi yêu cầu AI quá nhanh. Vui lòng đợi vài giây rồi thử lại.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const action = body?.action || '';

    // 1. Quản trị viên lưu/cập nhật khóa Gemini mã hóa AES-256-GCM vào Private Blob
    if (action === 'admin_set_ai_key') {
      if (!verifyAdminToken(request)) {
        return Response.json({ ok: false, error: 'Yêu cầu đăng nhập quyền Quản trị viên.' }, { status: 401 });
      }
      const candidateKey = String(body.apiKey || '').trim();
      if (candidateKey.length < 15) {
        return Response.json({ ok: false, error: 'Khóa API không hợp lệ.' }, { status: 400 });
      }

      // Kiểm chứng khóa hoạt động thực tế trước khi lưu mã hóa
      const probe = await runGeminiInteractionWithFallback(candidateKey, {
        models: FAST_MODELS,
        systemInstruction: 'Trả lời ngắn gọn.',
        input: 'Trả lời đúng 1 từ: OK'
      });

      const encryptedPayload = encryptSecret(candidateKey);
      await writePrivateJson(AI_CONFIG_PATH, encryptedPayload);
      return Response.json({ ok: true, modelVerified: probe.modelUsed });
    }

    const { key: apiKey } = await resolveGeminiApiKey();
    if (!apiKey) {
      return Response.json(
        {
          ok: false,
          error: 'Chưa cấu hình khóa Gemini API trên máy chủ (vui lòng thiết lập trong Quản trị → Tab 5 hoặc biến môi trường GEMINI_API_KEY).'
        },
        { status: 503 }
      );
    }

    // 2. Trợ lý Hỏi-Đáp Thực chứng (Grounded RAG Copilot cho Cư dân, Sinh viên & Giảng viên)
    if (action === 'ask_copilot') {
      const question = cleanText(body.question, 500);
      if (question.length < 3) {
        return Response.json({ ok: false, error: 'Vui lòng nhập câu hỏi cụ thể hơn.' }, { status: 400 });
      }

      const { extraReports, broadcast } = await loadCloudCommunitySnapshot();
      const groundedContext = buildGroundedContextString(extraReports, body.liveWeather || null, broadcast);

      const sysPrompt = [
        'Bạn là Trợ lý AI Thực chứng của dự án "Bản đồ Cộng đồng Mở Thích ứng Nắng nóng & Ngập cục bộ khu vực Trường ĐH Mỏ - Địa chất (Phường Đông Ngạc, Hà Nội — Đề tài 08)".',
        'NGUYÊN TẮC KỶ LUẬT CHỐNG ẢO GIÁC (BẮT BUỘC 100%):',
        '1. CHỈ sử dụng dữ liệu thực tế trong HỒ SƠ DỮ LIỆU bên dưới (ECMWF ERA5 2024–2026, Copernicus DEM GLO-30, 32+ điểm OpenStreetMap/Báo chí, Bộ Y tế, EVNHANOI, HSDC). Tuyệt đối KHÔNG tự bịa số đo độ sâu cm, không bịa tên đường hoặc số điện thoại ngoài hồ sơ.',
        '2. Mỗi khi nhắc tới một địa điểm có trong bản đồ, BẮT BUỘC ghi kèm mã điểm trong ngoặc vuông (ví dụ: [R-01], [R-06], [S-01], [S-05], [S-09]) để giao diện tạo nút bấm bay thẳng tới vị trí đó trên bản đồ.',
        '3. Trả lời bằng tiếng Việt tự nhiên, súc tích, chia thành 3–5 gạch đầu dòng rõ ràng (Đánh giá rủi ro/địa hình -> Hành động an toàn cụ thể -> Điểm tránh trú/y tế & số khẩn cấp liên quan). Không viết lời chào rườm rà.'
      ].join('\n');

      const fullInput = `HỒ SƠ DỮ LIỆU THỰC CHỨNG ĐÔNG NGẠC - ĐH MỎ:\n${groundedContext}\n\nCÂU HỎI CỦA NGƯỜI DÙNG: "${question}"`;

      const { text, modelUsed } = await runGeminiInteractionWithFallback(apiKey, {
        models: FAST_MODELS,
        systemInstruction: sysPrompt,
        input: fullInput
      });

      const citedMatches = text.match(/\b(?:R-\d{2}|S-\d{2}|CD-[A-Z0-9]+|TD-\d{2})\b/g) || [];
      const citedPointIds = [...new Set(citedMatches)];

      return Response.json({
        ok: true,
        answer: text,
        modelUsed,
        citedPointIds
      });
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
