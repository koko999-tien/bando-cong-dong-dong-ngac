# CHIẾN LƯỢC ĐẢM BẢO CHẤT LƯỢNG & KIỂM THỬ TOÀN DIỆN (QUALITY ASSURANCE)

## 1. Nguyên tắc QA không thỏa hiệp

> Không có thay đổi nào được phép hợp nhất vào `main` nếu chưa vượt qua cổng kiểm thử tự động (CI Gate). Mọi tuyên bố "đã sửa xong" hoặc "đạt hiệu năng" đều phải đi kèm bằng chứng chạy thực tế.

---

## 2. Ma trận 12 Lớp Kiểm thử Bắt buộc

| # | Lớp kiểm thử | Mục tiêu xác minh | Công cụ đề xuất | Cổng CI bắt buộc |
|---|---|---|---|---|
| 1 | **Kiểm thử chức năng (Functional & Unit)** | Các hàm nghiệp vụ lõi (Multi-Region, Provenance 12 trường, RBAC, Alert Workflow, Scorecard, AQI) | `node:test` / `assert` (`test-gis.mjs`, `tests/platform.test.mjs`) | Mọi PR & Push (Đã thiết lập ở M1) |
| 2 | **Kiểm thử tích hợp (Integration)** | Tương tác giữa API, PostgreSQL/PostGIS, Redis cache, Object Storage và AI Provider Router | `node:test` + Postgres/PostGIS service container trong GitHub Actions | Mọi PR từ M2 |
| 3 | **Kiểm thử hợp đồng API (API Contract)** | Status codes, JSON envelope chuẩn có `dataClasses`, phân trang BBox, idempotency, xử lý lỗi `400/401/403/429` | Supertest / Fetch harness + JSON Schema (`zod`) | Mọi PR từ M1–M2 |
| 4 | **Kiểm thử thuật toán GIS** | Độ chính xác chiếu tọa độ WGS84↔UTM48N, bán kính Haversine/Turf, gộp trùng 50m, hành lang né ngập, không định tuyến ra hồ ngoài trời khi mưa dông, kiểm toán 0 lỗi hình học | `test-gis.mjs` + PostGIS geometry tests (`ST_IsValid`) | Mọi PR (Đã chạy từ M1) |
| 5 | **Kiểm thử xác thực dữ liệu (Data Validation)** | 100% tập dữ liệu đủ 12 trường metadata, thuộc đúng 1 trong 6 lớp epistemic, không có trường bịa `depthCm`/`tempC`, kiểm tra magic bytes ảnh tải lên | `validateDatasetMetadata` + `validateImageUpload` trong CI | Mọi PR & Trước mọi lần nạp dữ liệu mới |
| 6 | **Kiểm thử bảo mật (Security & AuthZ)** | Chặn leo thang quyền `isFieldTeam`, chặn truy cập chéo vùng RBAC, kiểm tra rate-limit brute-force, chống XSS/HTML injection, chống path traversal, kiểm tra security headers (`CSP`, `XFO`, `HSTS`), quét lỗ hổng phụ thuộc (`npm audit`) | `tests/platform.test.mjs` + `npm audit` + OWASP ZAP baseline (M5+) | Mọi PR (Unit security từ M1; DAST hàng tuần từ M5) |
| 7 | **Kiểm thử hiệu năng (Performance)** | Thời gian tải trang đầu (LCP < 2.5s), TTFB API (`< 180 ms`), dung lượng bundle JS/CSS, độ mượt khung hình bản đồ | Lighthouse CI + API latency assertions | Theo dõi trên Vercel Preview từ M3 |
| 8 | **Kiểm thử chịu tải (Load & Concurrency)** | Giả lập lưu lượng bão lớn (1.000–5.000 người xem + 50 báo cáo ghi đồng thời/giây), kiểm tra không mất giao dịch ACID và kích hoạt cache/failover đúng | **k6** (script kiểm thử tải theo kịch bản mưa bão) | Trước khi phát hành M2, M5, M7 |
| 9 | **Kiểm thử ngoại tuyến (Offline & PWA)** | Mở app khi mất mạng hoàn toàn, hiển thị danh bạ khẩn cấp & bản đồ cache, lưu báo cáo vào IndexedDB queue và đồng bộ không trùng khi có mạng lại | Playwright (`context.setOffline(true)`) | Từ M5 trên mọi release |
| 10 | **Kiểm thử Di động & Đa trình duyệt (Mobile E2E)** | Kiểm tra `0px` chồng lấp HUD trên `390×844` (iPhone), `360×800` (Android phổ thông), `1280×620` và `1440×900` (Desktop); không lỗi console | Playwright E2E + kiểm tra DOM bounding box | Trước mọi thay đổi UI |
| 11 | **Kiểm thử Khả năng tiếp cận (Accessibility — WCAG 2.2 AA)** | Tương phản màu ≥ 4.5:1, điều hướng bàn phím đầy đủ, `aria-label`, vùng chạm ≥ `44×44 px`, kiểm tra người mù màu (không phụ thuộc màu duy nhất) | `@axe-core/playwright` + kiểm tra thủ công bàn phím | Từ M3 trên mọi PR chạm UI |
| 12 | **Kiểm thử Phục hồi Sự cố (Disaster Recovery & Failover)** | Diễn tập mất kết nối DB → tự hạ cấp sang Static Emergency Mode; diễn tập mất khóa AI chính → tự chuyển adapter dự phòng / Offline Grounded; diễn tập khôi phục backup PostgreSQL | Drill định kỳ hàng quý theo [OPERATIONS_RUNBOOK.md](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/docs/OPERATIONS_RUNBOOK.md) | Hàng quý + trước mùa mưa bão |

---

## 3. Quy trình CI/CD Cổng chặn (Automated Pipeline)

Đã thiết lập bước đầu tại [.github/workflows/ci.yml](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/.github/workflows/ci.yml):
1. **Stage 1 — Static & Integrity Checks (< 15s):** Kiểm tra cú pháp toàn bộ tệp `.js`/`.mjs` (`node --check`), kiểm tra cân bằng ngoặc `{}` của `styles.css` (ngăn tái diễn lỗi media query từng xảy ra trước `v20`), kiểm tra đối khớp ID DOM giữa `index.html` và `app.js`.
2. **Stage 2 — GIS & Platform Unit/Security Tests (< 30s):** Chạy `npm test` (`test-gis.mjs`) và `npm run test:platform` (`tests/platform.test.mjs`).
3. **Stage 3 — Dependency Security Check:** Chạy `npm audit --audit-level=high` (cảnh báo và chặn khi phát hiện lỗ hổng nghiêm trọng).
4. **Stage 4 — Preview Deployment & E2E (từ M2+):** Triển khai môi trường Vercel Preview cô lập cho từng Pull Request → chạy Playwright E2E (Desktop + Mobile) + AI Eval (khi chạm thư mục `ai/`) → yêu cầu review trước khi hợp nhất `main`.
