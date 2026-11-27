# ADR-001: Chọn kiến trúc Modular Monolith kết hợp Background Workers thay vì Microservices

- **Trạng thái:** Accepted (Được phê duyệt cho giai đoạn M1–M7)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** Principal Software Architect / CTO

## Bối cảnh
Dự án đang chuyển đổi từ ứng dụng WebGIS tĩnh kèm 2 Serverless API (`api/community.js`, `api/ai-copilot.js`) sang nền tảng đa vùng, đa hiểm họa **OPEN RESILIENCE INTELLIGENCE PLATFORM** phục vụ cộng đồng, nghiên cứu và điều hành ứng phó thiên tai. Cần quyết định mô hình kiến trúc backend dài hạn.

## Các phương án đã cân nhắc
1. **Giữ nguyên cấu trúc file phẳng hiện tại:** Không khả thi vì `app.js` (207 KB) và `api/community.js` đã trộn lẫn nhiều miền nghiệp vụ, khó test và không mở rộng đa vùng được.
2. **Microservices ngay từ đầu (6–8 dịch vụ tách biệt):** Tốn chi phí hạ tầng lớn, phức tạp trong điều phối giao dịch, độ trễ mạng nội bộ cao, đòi hỏi đội ngũ DevOps toàn thời gian không phù hợp nguồn lực giai đoạn đầu.
3. **Modular Monolith + API-First + Background Workers tách biệt cho tác vụ nặng:** Tổ chức mã nguồn theo biên giới domain nghiêm ngặt (`regions`, `data`, `gis`, `ai`, `security`, `operations`) trong 1 codebase chuẩn hóa, dùng chung 1 cụm PostgreSQL/PostGIS; tách riêng Python/Node Worker cho xử lý raster GDAL, vệ tinh Sentinel và đồng bộ theo lịch.

## Quyết định
Chọn **Phương án 3: Modular Monolith + Background Workers**.

## Hệ quả & Đánh đổi
- **Tích cực:** Chi phí vận hành tối thiểu (`$0–$50/tháng` ở giai đoạn Pilot), triển khai nhanh, đảm bảo giao dịch ACID đơn giản, dễ kiểm thử tích hợp end-to-end.
- **Đánh đổi:** Phải duy trì kỷ luật biên giới mô-đun nghiêm ngặt (không import chéo nội bộ giữa các domain) để có thể tách riêng một mô-đun thành dịch vụ độc lập khi lưu lượng thực sự đòi hỏi ở quy mô quốc gia.
