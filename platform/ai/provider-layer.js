/**
 * OPEN RESILIENCE INTELLIGENCE PLATFORM — PROVIDER-AGNOSTIC AI LAYER & SCIENTIFIC GUARDRAILS
 * Không khóa cứng vào Google Gemini: hỗ trợ Gemini, OpenAI-compatible, Anthropic Claude,
 * Ollama (tự host 0 VNĐ) và Offline Grounded Fallback.
 */

import { DATA_CLASSES, DATA_CLASS_BADGES } from '../data/provenance-catalog.js';

export const PROVIDER_TYPES = Object.freeze({
  GEMINI: 'gemini',
  OPENAI_COMPATIBLE: 'openai_compatible',
  ANTHROPIC: 'anthropic',
  OLLAMA: 'ollama',
  OFFLINE_GROUNDED: 'offline_grounded'
});

const OFFICIAL_ALERT_CLAIM_PATTERNS = [
  /lệnh sơ tán chính thức/gi,
  /thông cáo khẩn chính thức của ubnd/gi,
  /cảnh báo thiên tai chính thức cấp quốc gia/gi,
  /yêu cầu cư dân sơ tán ngay lập tức theo lệnh/gi
];

/**
 * Rào chắn khoa học & an toàn bắt buộc cho mọi phản hồi AI:
 * 1. Tách rõ nguồn dữ liệu (dataClasses) và trích dẫn điểm xác thực (citedIds)
 * 2. Gắn ghi chú độ bất định bắt buộc đối với DEM GLO-30, ERA5/CAMS, Forecast, Community và Simulated
 * 3. Ngăn AI tự phát ngôn như cảnh báo chính thức của cơ quan nhà nước khi chưa có người duyệt
 */
export function applyScientificGuardrails(rawText, evidenceContext = {}) {
  const originalText = String(rawText ?? '').trim();
  const allowedIds = new Set(Array.isArray(evidenceContext.knownPointIds) ? evidenceContext.knownPointIds : []);
  const dataClasses = Array.isArray(evidenceContext.dataClasses)
    ? [...new Set(evidenceContext.dataClasses.filter((c) => DATA_CLASSES[c]))]
    : [];

  let sanitizedText = originalText;
  let blockedOfficialClaim = false;

  if (!evidenceContext.hasHumanOfficialApproval) {
    for (const pattern of OFFICIAL_ALERT_CLAIM_PATTERNS) {
      if (pattern.test(sanitizedText)) {
        blockedOfficialClaim = true;
        sanitizedText = sanitizedText.replace(
          pattern,
          '[NỘI DUNG ĐÃ CHẶN: AI không có thẩm quyền ban hành cảnh báo/lệnh sơ tán chính thức]'
        );
      }
    }
  }

  const matchedIds = [...new Set(sanitizedText.match(/\b(?:R-\d{2,4}|S-\d{2,4}|CD-[A-Z0-9]+|TD-\d{2,4})\b/g) || [])];
  const verifiedCitedIds = allowedIds.size > 0 ? matchedIds.filter((id) => allowedIds.has(id)) : matchedIds;
  const unverifiedCitedIds = allowedIds.size > 0 ? matchedIds.filter((id) => !allowedIds.has(id)) : [];

  const uncertaintyNotes = [];
  if (dataClasses.includes(DATA_CLASSES.SATELLITE_DATA)) {
    uncertaintyNotes.push(
      'Copernicus DEM GLO-30 là mô hình bề mặt vệ tinh (DSM ~30 m, có mái nhà/cây xanh), không thể tự nó xác định độ sâu ngập thực tế (cm) trong từng con ngõ.'
    );
  }
  if (dataClasses.includes(DATA_CLASSES.MODELLED_DATA)) {
    uncertaintyNotes.push(
      'ERA5 (~28 km) và CAMS AQI (~10–40 km) là dữ liệu mô hình hóa lưới thô, không thay thế trạm đo trực tiếp tại từng tuyến đường.'
    );
  }
  if (dataClasses.includes(DATA_CLASSES.SIMULATED_DATA)) {
    uncertaintyNotes.push(
      'Kết quả kịch bản mưa là dữ liệu mô phỏng tham khảo (SIMULATED_DATA), KHÔNG PHẢI dự báo ngập thực tế hay mô hình thủy lực 2D.'
    );
  }
  if (dataClasses.includes(DATA_CLASSES.FORECAST_DATA)) {
    uncertaintyNotes.push(
      'Dự báo thời tiết toàn cầu có độ bất định cục bộ; hãy đối chiếu thêm bản tin chính thức của Trung tâm Dự báo KTTV Quốc gia.'
    );
  }
  if (dataClasses.includes(DATA_CLASSES.COMMUNITY_REPORTS)) {
    uncertaintyNotes.push(
      'Phản ánh cộng đồng có mức tin cậy theo hạng C/B/A và cần được đối chiếu xác minh hiện trường.'
    );
  }

  return {
    answer: sanitizedText,
    factsCited: verifiedCitedIds,
    unverifiedCitedIds,
    dataClasses,
    dataClassLabels: dataClasses.map((c) => DATA_CLASS_BADGES[c]?.labelVi || c),
    uncertaintyNotes,
    blockedOfficialClaim,
    isOfficialAlert: Boolean(evidenceContext.hasHumanOfficialApproval)
  };
}

/**
 * Tạo adapter dự phòng ngoại tuyến (xác định, 0 VNĐ, luôn sẵn sàng khi mọi API AI gặp sự cố).
 */
export function createOfflineGroundedAdapter(synthesizerFn) {
  return {
    id: PROVIDER_TYPES.OFFLINE_GROUNDED,
    name: 'Offline Grounded Knowledge Engine',
    isConfigured: () => typeof synthesizerFn === 'function',
    async complete(request) {
      const out = await synthesizerFn(request);
      return {
        text: typeof out === 'string' ? out : String(out?.text || ''),
        modelUsed: 'deterministic-grounded-v1'
      };
    }
  };
}

/**
 * Bộ định tuyến AI đa nhà cung cấp có chuỗi failover và kiểm soát guardrail thống nhất.
 */
export class AiProviderRouter {
  constructor(adapters = []) {
    this.adapters = Array.isArray(adapters) ? [...adapters] : [];
  }

  registerAdapter(adapter) {
    if (!adapter || !adapter.id || typeof adapter.complete !== 'function') {
      throw new Error('AI adapter phải có id và phương thức async complete(request).');
    }
    this.adapters.push(adapter);
    return this;
  }

  listConfiguredProviders() {
    return this.adapters
      .filter((a) => (typeof a.isConfigured === 'function' ? a.isConfigured() : true))
      .map((a) => ({ id: a.id, name: a.name || a.id }));
  }

  async generate(request, evidenceContext = {}) {
    const preferredOrder = request?.preferredProvider
      ? [
          ...this.adapters.filter((a) => a.id === request.preferredProvider),
          ...this.adapters.filter((a) => a.id !== request.preferredProvider)
        ]
      : this.adapters;

    const fallbackTrail = [];
    const startedAt = Date.now();

    for (const adapter of preferredOrder) {
      if (typeof adapter.isConfigured === 'function' && !adapter.isConfigured()) {
        fallbackTrail.push({ provider: adapter.id, status: 'skipped_unconfigured' });
        continue;
      }
      try {
        const res = await adapter.complete(request);
        const text = String(res?.text || '').trim();
        if (!text) {
          fallbackTrail.push({ provider: adapter.id, status: 'empty_response' });
          continue;
        }
        const guarded = applyScientificGuardrails(text, evidenceContext);
        return {
          ok: true,
          providerUsed: adapter.id,
          modelUsed: res.modelUsed || adapter.id,
          latencyMs: Date.now() - startedAt,
          fallbackTrail,
          ...guarded
        };
      } catch (err) {
        fallbackTrail.push({
          provider: adapter.id,
          status: 'error',
          reason: String(err?.message || 'Unknown provider error').slice(0, 140)
        });
      }
    }

    return {
      ok: false,
      error: 'Tất cả nhà cung cấp AI (kể cả dự phòng) đều không phản hồi.',
      latencyMs: Date.now() - startedAt,
      fallbackTrail
    };
  }
}
