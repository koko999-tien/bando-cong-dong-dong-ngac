# LỘ TRÌNH PHÁT TRIỂN ĐA GIAI ĐOẠN (MULTI-PHASE ROADMAP — MILESTONES 0–9)

Mỗi Milestone đều xác định rõ: **Mục tiêu · Phạm vi · Tệp/Thành phần liên quan · Tài nguyên/Dịch vụ · Phụ thuộc · Chi phí ước tính · Tiêu chí nghiệm thu · Kiểm thử bắt buộc · Rủi ro · Kế hoạch Rollback**. Nguyên tắc bất di bất dịch: mọi thay đổi phát triển trên nhánh riêng, xác minh đầy đủ trên Staging/Preview trước khi hợp nhất vào `main`.

---

## Tổng quan 10 Milestone

| Mốc | Tên Milestone | Trạng thái | Thời lượng dự kiến | Chi phí tăng thêm |
|---|---|---|---|---|
| **M0** | Kiểm toán toàn diện hệ thống & cô lập nhánh nâng cấp | **HOÀN THÀNH** (trên `feat/open-resilience-platform-v2`) | 1 ngày | `$0` |
| **M1** | Lõi kiến trúc nền tảng (Multi-Region, Provenance, AI Layer, RBAC, Alert Workflow, CI/CD, Vá lỗi bảo mật nghiêm trọng) | **ĐANG THỰC HIỆN** (an toàn, hoàn nguyên được) | 3–5 ngày | `$0` |
| **M2** | Chuyển đổi dữ liệu lõi sang PostgreSQL + PostGIS + Redis + Auth/MFA + Object Storage | Chờ phê duyệt cấp tài khoản Free Tier (P0) | 2–3 tuần | `$0 – $25/tháng` |
| **M3** | Mở rộng không gian Cấp 2 (Bắc Từ Liêm & Cụm 5 Trường ĐH) + Trạm AQI mặt đất OpenAQ + Observability | Sau M2 | 2–3 tuần | `$0 – $10/tháng` |
| **M4** | Nền tảng Dữ liệu Lớn & GIS Khoa học (GDAL/COG Worker, Sentinel-2 NDVI/NDWI, Landsat LST, Geospatial RAG `pgvector`) | Sau M2–M3 | 3–4 tuần | `$0 – $20/tháng` |
| **M5** | Chuyển đổi Frontend Modular TypeScript + MapLibre GL JS + Định tuyến né đa giác ngập + PWA Offline Queue | Sau M2–M4 | 3–4 tuần | `$0` |
| **M6** | Nâng cấp Trung tâm Điều hành Ứng phó Khẩn cấp (Operations Command Center) & Phân tích MCDA / Change Detection | Sau M4–M5 | 3 tuần | `$0 – $15/tháng` |
| **M7** | Mở rộng Cấp 3 — Toàn thành phố Hà Nội (Vector Tiles PMTiles/MVT, Load Test bão, OGC API cho QGIS) | Sau M5–M6 | 4 tuần | `$40 – $150/tháng` |
| **M8** | Kiểm định An toàn Thông tin, Pháp lý DPIA & Diễn tập Ứng phó Cộng đồng thực tế | Sau M6–M7 | 2–3 tuần | Tùy kiểm định độc lập |
| **M9** | Cấp 4 — Đóng gói Nền tảng Mở Đa Địa phương (Multi-Locality Installer, SDK, Tài liệu triển khai tỉnh/thành mới) | Sau M7–M8 | 3–4 tuần | `$0` (mã nguồn mở) |

---

## Chi tiết từng Milestone

### Milestone 0 — System Audit & Isolation (`HOÀN THÀNH`)
- **Mục tiêu:** Kiểm toán thực tế 13 khía cạnh mã nguồn, Git, API production, hiệu năng, bảo mật, dữ liệu và tách nhánh nâng cấp an toàn.
- **Phạm vi & Tệp:** Toàn bộ repo hiện có; tạo nhánh `feat/open-resilience-platform-v2`; xuất [SYSTEM_AUDIT_REPORT.md](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/docs/SYSTEM_AUDIT_REPORT.md) và 12 tài liệu kiến trúc + 7 ADR.
- **Tiêu chí nghiệm thu:** 100% tính năng được phân loại bằng chứng (`VERIFIED`/`PARTIAL`/`NOT IMPLEMENTED`/`BROKEN`/`UNVERIFIED`); nhánh `main` giữ nguyên commit `db43653`.
- **Rollback:** Không tác động production; có thể xóa nhánh nâng cấp bất kỳ lúc nào mà không ảnh hưởng hệ thống đang chạy.

### Milestone 1 — Foundational Core, Security Hardening & CI (`ĐANG TRIỂN KHAI TRÊN NHÁNH MỚI`)
- **Mục tiêu:** Dựng toàn bộ khung lõi không khóa nhà cung cấp, vá ngay lỗ hổng nghiêm trọng (`SEC-01`, `SEC-03`, `SEC-05`, `SEC-06`, `SEC-07`), thêm CI tự động và bộ kiểm thử nền tảng.
- **Tệp mới / chỉnh sửa:** `platform/regions/region-registry.js`, `platform/data/provenance-catalog.js`, `platform/ai/provider-layer.js`, `platform/security/rbac.js`, `platform/security/validators.js`, `platform/operations/alert-workflow.js`, `api/community.js`, `server.mjs`, `vercel.json`, `.github/workflows/ci.yml`, `tests/platform.test.mjs`, `package.json`.
- **Phụ thuộc & Chi phí:** Không cần dịch vụ mới, **chi phí `$0`**.
- **Tiêu chí nghiệm thu:** `npm test` (60 điểm nền) + `npm run test:platform` (toàn bộ test bảo mật, multi-region, provenance, AI guardrails, workflow) + kiểm tra cú pháp & CSS đạt 100% PASS; không phá vỡ bất kỳ giao diện/API cũ nào.
- **Rủi ro & Rollback:** Rủi ro thấp vì chạy hoàn toàn trên nhánh mới `feat/open-resilience-platform-v2`; rollback bằng `git revert` hoặc không merge PR.

### Milestone 2 — PostgreSQL/PostGIS, Upstash Redis, RBAC Auth + MFA & Object Storage
- **Mục tiêu:** Loại bỏ hoàn toàn nút thắt Vercel Blob JSON (`1.750 ms`, mất ACID), chuyển sang lưu trữ không gian chuẩn PostGIS + xác thực định danh có MFA + lưu ảnh đã xóa EXIF trên Object Storage.
- **Thành phần mới:** `db/migrations/001_init_postgis.sql`, `db/seed-dong-ngac.mjs`, `platform/db/repository.js`, `platform/auth/session-provider.js`, `platform/storage/media-pipeline.js` (`sharp` re-encode xóa EXIF phía server), migration script chuyển dữ liệu từ Vercel Blob sang PostgreSQL có đối chiếu checksum.
- **Tài nguyên cần Chủ dự án cấp (P0):** Supabase/Neon PostgreSQL + PostGIS, Upstash Redis, Supabase Auth/Clerk, Cloudflare R2 (Free tier `$0`).
- **Tiêu chí nghiệm thu:** `GET /api/v2/features?bbox=...` đạt `< 180 ms` (giảm ~10× so với `1.750 ms`); 0 mất dữ liệu khi stress-test 50 ghi đồng thời; đăng nhập quản trị bắt buộc MFA + HttpOnly cookie; ảnh upload bị xóa 100% metadata EXIF ở phía server.
- **Kiểm thử:** Integration test DB, concurrency lock test, auth/RBAC penetration test, data migration checksum verification.
- **Rủi ro & Rollback:** Duy trì chạy song song chế độ đọc-ghi an toàn (dual-read verification trên Staging) trước khi chuyển production; giữ nguyên snapshot Vercel Blob làm bản dự phòng rollback tức thời.

### Milestone 3 — Mở rộng Cấp 2 (Bắc Từ Liêm & Cụm 5 Trường Đại học) + OpenAQ + Observability
- **Mục tiêu:** Đưa vùng `vn-hn-bac-tu-liem-uni` vào hoạt động thực tế; bổ sung trạm quan trắc không khí mặt đất (`OBSERVED_DATA` từ OpenAQ) song song CAMS (`MODELLED_DATA`); bật Sentry (đã lọc PII) và Uptime monitoring.
- **Tệp & Thành phần:** Bộ dữ liệu ranh giới phường/trường ĐH Bắc Từ Liêm, worker đồng bộ Open-Meteo + OpenAQ có cache Redis, bộ chuyển vùng (`Region Switcher`) trên UI, cấu hình Sentry scrubbing.
- **Tiêu chí nghiệm thu:** Người dùng chuyển mượt giữa Cấp 1 (HUMG 2km) và Cấp 2 (Bắc Từ Liêm) mà không phải tải lại toàn bộ dữ liệu ngoài khung nhìn; phân biệt rõ nguồn `OBSERVED` vs `MODELLED` trên bảng AQI.
- **Rollback:** Tắt feature flag `ENABLE_TIER2_REGIONS` để quay ngay về mặc định Cấp 1.

### Milestone 4 — Scientific GIS & Geospatial RAG Platform
- **Mục tiêu:** Triển khai Background Worker (`Python + GDAL + Rasterio`) xử lý dữ liệu vệ tinh Sentinel-2 (NDVI/NDWI/NDBI), Landsat LST (Heat Intelligence), DEM Slope/TWI; nâng cấp AI sang **PostGIS + `pgvector` Geospatial RAG + Tool Calling** và bộ **AI Eval ≥ 50 ca kiểm thử**.
- **Tài nguyên:** Copernicus Data Space / GEE (tài khoản nghiên cứu miễn phí), container worker (GitHub Actions scheduled batch hoặc VPS/Railway).
- **Tiêu chí nghiệm thu:** Xuất được `GeoPackage (.gpkg)` và COG raster; AI đạt `≥ 95%` độ chính xác trích dẫn và `100%` không bịa số liệu/cảnh báo chính thức trên Golden Eval Set; phân tách rõ `SIMULATED_DATA` vs `OBSERVED_DATA`.
- **Rollback:** Tự động hạ cấp về AI Adapter dự phòng / dữ liệu nền PostGIS nếu worker batch lỗi.

### Milestone 5 — Modular TypeScript Frontend, MapLibre GL JS, Risk-Aware Routing & Offline Queue
- **Mục tiêu:** Tách nhỏ tệp nguyên khối `app.js` (`207 KB`) sang TypeScript modules có bundler (Vite), chuyển lớp bản đồ qua `MapEngineAdapter` → **MapLibre GL JS**, tích hợp OpenRouteService/Valhalla hỗ trợ `avoid_polygons` né hành lang đang ngập, hoàn thiện PWA PNG icons (`192×192`, `512×512`) và **IndexedDB Offline Submission Queue**.
- **Tiêu chí nghiệm thu:** Bundle JS khởi tạo giảm ≥ 45%; đạt `0px` HUD overlap trên `390×844` & `1440×900` qua Playwright CI; định tuyến né đa giác ngập hoạt động thực tế; báo cáo gửi lúc tắt mạng tự đồng bộ sạch (có `Idempotency-Key`) khi có mạng trở lại.
- **Rollback:** Giữ tùy chọn `?engine=leaflet` fallback trong 1 chu kỳ phát hành.

### Milestone 6 — Operations Command Center & Research MCDA Suite
- **Mục tiêu:** Xây dựng giao diện Trung tâm Điều hành cho `ward_operator` theo đúng vòng đời cảnh báo 8 bước (`DATA_DETECTED → AFTER_ACTION_REPORT`), phân biệt rõ cảnh báo tự động / cộng đồng / xác minh chính thức, kết nối phân phối đa kênh (Zalo Card / Telegram / Email) và công cụ phân tích MCDA + Change Detection cho nhà nghiên cứu.
- **Tiêu chí nghiệm thu:** Không thể phát cảnh báo `official_verified` nếu thiếu bước xác minh + phê duyệt người thật; mỗi sự cố đều sinh được báo cáo hậu kiểm (`After-Action Report`) đầy đủ dữ liệu thời gian thực và audit trail.
- **Rollback:** Tắt webhook phân phối ngoài (chỉ giữ banner nội bộ web) bằng kill-switch cấu hình tức thời.

### Milestone 7 — Mở rộng Cấp 3: Toàn Thành phố Hà Nội & Chịu tải Bão
- **Mục tiêu:** Chuyển sang Vector Tiles (`PMTiles` / `MVT`), cung cấp OGC API - Features cho QGIS, chạy Load Test giả lập 5.000 người dùng đồng thời trong bão lớn (k6), tối ưu chi phí truy vấn & cache CDN.
- **Tiêu chí nghiệm thu:** P95 API `< 150 ms` dưới tải giả lập bão; bản đồ Hà Nội render mượt ≥ 50fps trên điện thoại tầm trung; mở trực tiếp được dữ liệu nền trên QGIS qua OGC API.
- **Rollback:** Chế độ **Emergency Static Failover** tự động phục vụ bản đồ tĩnh + danh bạ khẩn cấp từ CDN khi DB quá tải vượt ngưỡng.

### Milestone 8 — Security Audit, Legal/DPIA Verification & Community Field Drill
- **Mục tiêu:** Kiểm định bảo mật độc lập (OWASP Top 10 / ASVS L2), hoàn thiện hồ sơ DPIA theo Luật BVDLCN 91/2025/QH15 & NĐ 13/2023/NĐ-CP với ý kiến pháp chế, tổ chức diễn tập thực địa với sinh viên/cư dân (đo Pre/Post-test có ý nghĩa thống kê).
- **Tiêu chí nghiệm thu:** 0 lỗ hổng Critical/High tồn đọng; hồ sơ DPIA và quy trình xóa dữ liệu được phê duyệt bằng văn bản trước khi gỡ nhãn thí điểm.
- **Rollback:** Giữ nguyên phạm vi thí điểm học thuật nếu hồ sơ pháp lý chưa hoàn tất.

### Milestone 9 — Cấp 4: Đóng gói Nền tảng Mở Đa Địa phương (Open Resilience Platform Kit)
- **Mục tiêu:** Đóng gói bộ công cụ khởi tạo địa phương mới (`CLI / Region Onboarding Wizard`), tài liệu hướng dẫn triển khai cho tỉnh/thành phố khác, mẫu dữ liệu chuẩn và mô hình quản trị cộng đồng mã nguồn mở.
- **Tiêu chí nghiệm thu:** Một đội ngũ kỹ thuật khác có thể dựng bản sao hoạt động cho một quận/tỉnh mới trong `< 1 ngày` chỉ bằng việc cấu hình `RegionConfig` + nạp dữ liệu chuẩn mà không sửa mã lõi.
- **Rollback:** Đóng phiên bản ngữ nghĩa (Semantic Versioning `v2.0.0`) theo tag Git bất biến.
