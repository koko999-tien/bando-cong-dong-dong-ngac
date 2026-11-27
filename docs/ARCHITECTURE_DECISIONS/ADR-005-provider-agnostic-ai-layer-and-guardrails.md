# ADR-005: Tầng Trừu tượng AI Đa Nhà Cung Cấp (Provider-Agnostic) & Rào chắn Khoa học

- **Trạng thái:** Accepted (Đã triển khai lõi ở Milestone 1: `platform/ai/provider-layer.js`)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** AI Engineer / Principal Architect

## Bối cảnh
`api/ai-copilot.js` hiện khóa cứng vào SDK `@google/genai` (Google Gemini Interactions API v1) và nhồi toàn bộ danh sách điểm vào chuỗi prompt. Rủi ro lớn nhất khi vận hành thực tế là: (1) phụ thuộc một hãng AI duy nhất về giá/hạn mức/sự cố; (2) không đáp ứng nhu cầu chạy mô hình nội bộ (on-premise) của trường học hoặc cơ quan quản lý; (3) nguy cơ AI ảo giác số đo độ sâu ngập hoặc phát ngôn như lệnh cảnh báo chính thức.

## Quyết định
1. Tách mọi gọi LLM qua `AiProviderRouter` (`platform/ai/provider-layer.js`) hỗ trợ chuẩn hóa 5 adapter: `gemini`, `openai-compatible`, `anthropic`, `ollama` (tự host 0 VNĐ) và `offline-grounded` (dự phòng xác định 100% sẵn sàng khi mất mạng/API).
2. Mọi đầu ra đều qua bộ lọc `applyScientificGuardrails`: bắt buộc gắn lớp dữ liệu nguồn, tách sự thật khỏi suy luận, thêm ghi chú bất định cho DEM/mô hình/dự báo và chặn ngôn ngữ tự phát cảnh báo chính thức chưa qua phê duyệt người thật.
3. Ở Milestone 4, thay thế prompt-stuffing bằng Geospatial Tool Calling trên PostGIS + `pgvector`.

## Hệ quả
- **Tích cực:** Độc lập hoàn toàn với nhà cung cấp AI, chống sập dịch vụ trong bão lớn nhờ chuỗi failover xuống `offline-grounded`, kiểm soát được chất lượng khoa học bằng kiểm thử tự động.
- **Đánh đổi:** Cần duy trì hợp đồng đầu vào/đầu ra chung cho các adapter và cập nhật bộ Golden Eval Set khi thêm mô hình mới.
