# BÁO CÁO KIỂM TOÁN TOÀN DIỆN HỆ THỐNG (MILESTONE 0 — SYSTEM AUDIT REPORT)

- **Ngày kiểm toán:** 27/11/2026 (ICT)
- **Đối tượng:** Bản đồ An toàn Cộng đồng Mở Phường Đông Ngạc · Trường ĐH Mỏ - Địa chất (HUMG)
- **Kho mã nguồn:** `https://github.com/koko999-tien/bando-cong-dong-dong-ngac` (Nhánh production: `main`, commit `db43653`, 18 commits lịch sử)
- **Môi trường Production:** `https://bando-cong-dong-dong-ngac.vercel.app` (Vercel Serverless `sin1` + Vercel Private Blob `store_lJgu1rzmRDBs3jFK`)
- **Nhánh nâng cấp cô lập:** `feat/open-resilience-platform-v2` (tạo mới từ `db43653`, tuyệt đối không sửa trực tiếp `main`)
- **Nguyên tắc kiểm toán:** Không mặc định tài liệu mô tả là đúng; mọi đánh giá đều dựa trên đọc mã nguồn thực tế, kiểm tra Git, cấu hình hạ tầng và đo kiểm trực tiếp HTTP production.

---

## 1. BẢNG PHÂN LOẠI TRẠNG THÁI CHỨC NĂNG (13 HẠNG MỤC)

Quy ước phân loại:
- `VERIFIED`: Đã kiểm tra mã nguồn và/hoặc endpoint thực tế, hoạt động đúng như thiết kế.
- `PARTIAL`: Hoạt động một phần, còn giới hạn kiến trúc, thiếu kiểm soát hoặc không chịu được mở rộng.
- `NOT IMPLEMENTED`: Chưa triển khai trong mã nguồn/hạ tầng hiện tại.
- `BROKEN`: Đang lỗi logic, bảo mật hoặc lệch đồng bộ giữa môi trường dev/prod.
- `UNVERIFIED`: Tài liệu/UI có tuyên bố nhưng chưa có bằng chứng kiểm chứng pháp lý, vận hành hoặc đo đạc thực địa đủ tin cậy.

| # | Hạng mục kiểm toán | Phân loại | Bằng chứng thực tế đã kiểm tra | Ghi chú rủi ro / hành động |
|---|---|---|---|---|
| 1 | **GitHub Repo & Lịch sử Git** | `PARTIAL` | 1 nhánh duy nhất `main` (18 commits `eac79e9..db43653`), chưa có branch protection, chưa có PR workflow, còn tồn dư tệp cũ `community-backend.gs`, `google-forms-generator.gs`, và `README.md` lỗi thời (vẫn ghi "32 điểm" và hướng dẫn Google Sheets thay vì 60 điểm + Vercel Blob). | Chuyển sang nhánh `feat/open-resilience-platform-v2`, dọn tài liệu lệch, thiết lập GitHub CI & branch protection. |
| 2 | **Frontend WebGIS & HUD (`index.html`, `styles.css`, `app.js`)** | `VERIFIED` (UX) / `PARTIAL` (Kiến trúc) | Production `v20` (`db43653`): HUD CSS Grid 3 hàng không đè thẻ (0px overlap trên Desktop `1440×900` & Mobile `390×844`), 5 lớp bản đồ nền, thanh công cụ dưới hiển thị đủ. Tuy nhiên `app.js` là tệp nguyên khối `207 KB` (~4.660 dòng), không dùng TypeScript, không module hóa theo domain, trộn DOM template với logic GIS. | Bảo toàn UX gọn sạch; tách dần sang kiến trúc module TypeScript + thiết kế lớp cấu hình đa vùng. |
| 3 | **Backend Serverless API (`api/community.js`, `api/ai-copilot.js`)** | `PARTIAL` / `BROKEN` (Bảo mật & Dev Parity) | `GET /api/community` trả `200` nhưng trễ **`1.750 ms`** do quét `list({ prefix: '' })` tới 5.000 blobs + `Promise.all` đọc từng báo cáo (`N+1` reads). `POST submit_report` có lỗ hổng leo thang tin cậy (`isFieldTeam` tự nhận qua chuỗi `reporterRole` không xác thực → tự duyệt `confidenceTier: 'A'`). `server.mjs` thiếu `live_checkin` và có lỗi ranh giới đường dẫn `target.startsWith(__dirname)`. | Vá ngay trên nhánh nâng cấp; chuyển lưu trữ sang PostgreSQL + PostGIS ở Milestone 2. |
| 4 | **Dữ liệu GIS & Khoa học (`humg-data.js`, `dem-grid-2km.js`, `gis-utils.js`)** | `PARTIAL` | 60 điểm nền có `sourceCitation` & kiểm toán 0 lỗi bởi `test-gis.mjs`; 18 hành lang đường ngập OSM; lưới `25×25` (625 điểm) Copernicus DEM GLO-30. **Hạn chế lớn:** Gắn cứng tọa độ Đông Ngạc/HUMG; DEM GLO-30 là DSM 30m (dính mái nhà, sai số đứng ±2–4 m — **không thể tự xác định độ sâu ngập thực tế từng ngõ**); trộn hiển thị giữa dữ liệu mô phỏng và quan trắc nếu không có huy hiệu chuẩn hóa. | Tách registry đa vùng, bắt buộc gắn 6 lớp dữ liệu nhận thức luận (`OBSERVED` / `MODELLED` / `SATELLITE` / `FORECAST` / `COMMUNITY` / `SIMULATED`). |
| 5 | **Cơ sở dữ liệu & Cơ chế lưu trữ** | `PARTIAL` (Nút thắt nghiêm trọng) | Lưu toàn bộ dữ liệu động trong **Vercel Private Blob JSON** (`reports/*.json`, `votes/*`, `config/moderation.json`, `config/live-pulse.json`, `config/audit-log.json`). **Không có ACID**, không có khóa đồng thời (race condition mất dữ liệu khi nhiều người gửi lúc mưa bão), không có spatial index, không có backup tự động định kỳ. | Chuyển sang PostgreSQL 16 + PostGIS + TimescaleDB/partitioning + Object Storage riêng cho ảnh/raster. |
| 6 | **Dịch vụ bên ngoài (External APIs)** | `PARTIAL` | Đang gọi trực tiếp từ trình duyệt: Open-Meteo Forecast & Air Quality (CAMS), RainViewer Public Radar (free tier giới hạn zoom 7, 2h quá khứ), OSRM public demo server (`router.project-osrm.org` — **không có SLA production**, dễ bị rate-limit/timeout lúc cao điểm!), Nominatim OSM, Carto/Esri/OSM tiles. | Bổ sung Backend Cache Proxy + Redis + fallback provider (OpenRouteService / Valhalla / self-host OSRM) và ghi rõ giới hạn từng nguồn. |
| 7 | **Cấu hình Vercel & Triển khai (`vercel.json`, `.github/workflows`)** | `PARTIAL` | Vercel `sin1` hoạt động ổn (`GET /` 258 ms, HSTS + `X-Content-Type-Options: nosniff` + `Referrer-Policy`). **Thiếu** `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`. `.github/workflows/deploy-pages.yml` đẩy bản tĩnh sang GitHub Pages (không có `/api/*` serverless) và **không chạy test nào trước deploy**. | Thêm security headers an toàn vào `vercel.json`, tạo `.github/workflows/ci.yml` chạy kiểm thử bắt buộc trên mọi PR. |
| 8 | **PWA, Service Worker & Offline (`sw.js`, `manifest.webmanifest`)** | `PARTIAL` | `sw.js` (`v20`) pre-cache đầy đủ tài sản lõi, network-first cho cùng origin và bypass API động (`VERIFIED`). **Hạn chế:** `manifest.webmanifest` chỉ có `icon.svg` (thiếu PNG `192×192`, `512×512` bắt buộc cho iOS/Android install prompt); chưa có **IndexedDB offline queue** (background sync) cho báo cáo gửi khi mất sóng 4G; chưa cache map tiles cục bộ vùng nguy hiểm. | Bổ sung PNG icons, IndexedDB queue cho báo cáo ngoại tuyến và bộ tile vector nhẹ ngoại tuyến (PMTiles). |
| 9 | **Hệ thống AI & RAG (`api/ai-copilot.js`, `knowledge-engine.js`)** | `PARTIAL` | `GET /api/ai-copilot` trả `200` (`952 ms`, `aiReady: true`, `keySource: encrypted_blob_vault`, Google Gemini Interactions API v1). Có 3 tác vụ (ask_copilot, inspect_photo, admin_ai_brief). **Hạn chế:** Khóa cứng 1 nhà cung cấp (Gemini), nhồi toàn bộ 60 điểm + 18 hành lang vào prompt tĩnh (sẽ vỡ giới hạn token khi mở rộng Bắc Từ Liêm/Hà Nội), chưa có geospatial vector RAG (`pgvector` + PostGIS), chưa có tool calling, chưa tách rạch ròi Fact vs Inference/Uncertainty trong JSON schema, chưa có bộ đánh giá AI tự động (eval). | Xây dựng AI Provider Abstraction Layer đa model + PostGIS/pgvector RAG + Guardrail & Eval Suite. |
| 10 | **Bảo mật, Xác thực & Phân quyền (`api/community.js`, `admin.js`)** | `BROKEN` / `NOT IMPLEMENTED` | Phát hiện **7 lỗ hổng/thiếu sót nghiêm trọng**: (1) Lỗ hổng `isFieldTeam` tự phong Hạng A không cần xác thực (`api/community.js:411`); (2) 1 passcode dùng chung duy nhất, **không có RBAC**, không có tài khoản định danh, không có MFA, không thu hồi được token; (3) Chuỗi bí mật dự phòng `'humg-fallback-secret'` (`api/community.js:75`, `api/ai-copilot.js:53`); (4) Dùng chung khóa gốc cho ký token và mã hóa AES-256-GCM API key; (5) Không giới hạn tốc độ (rate-limit) cho `admin_login` (dễ brute-force), `submit_report`, `submit_survey`; (6) `rateWindowMap` trong bộ nhớ RAM bị reset mỗi cold start và không giới hạn kích thước bộ nhớ; (7) Chỉ kiểm tra tiền tố chuỗi ảnh base64, chưa kiểm tra magic bytes & xóa EXIF phía server; token lưu `sessionStorage`. | Vá khẩn các lỗ hổng logic trên nhánh nâng cấp; chuyển sang RBAC + IdP/MFA + HttpOnly Cookie + Upstash Redis rate limiting ở Milestone 2–3. |
| 11 | **Bộ kiểm thử tự động (`test-gis.mjs`)** | `PARTIAL` | `npm test` (`test-gis.mjs`) kiểm tra tốt thuật toán GIS, 60 điểm nền, Scorecard, AQI, xuất KML/CSV/GeoJSON. **Thiếu hoàn toàn:** API integration test, security/RBAC test, load/stress test, Playwright E2E trong CI, accessibility CI, offline test. | Xây dựng `tests/platform.test.mjs` + GitHub Actions CI ngay trên nhánh nâng cấp, mở rộng đủ 12 lớp QA theo `docs/QUALITY_ASSURANCE.md`. |
| 12 | **Hiệu năng thực tế Production** | `PARTIAL` | Đo trực tiếp 27/11/2026: `GET /` = `258 ms` (`65,6 KB`), `GET /api/ai-copilot` = `952 ms`, **`GET /api/community` = `1.750 ms`** (chậm rõ rệt dù gần như chưa có báo cáo cộng đồng). Bundle JS không minify/tree-shake (`app.js` 207 KB + `humg-data.js` 90 KB tải toàn bộ một lần). | Tối ưu API với PostgreSQL + Redis cache (`< 150 ms`), code splitting & vector tiles / viewport bbox loading. |
| 13 | **Tài liệu kỹ thuật, Nghiên cứu & Tuyên bố Pháp lý** | `PARTIAL` / `UNVERIFIED` | Có `docs/bao-cao-khung-7-chuong.md`, `docs/ho-so-bao-chi-ngap-2km-humg.md`, `docs/mo-ta-chi-tiet-du-an.txt`. **Tuyên bố pháp lý chưa kiểm chứng (`UNVERIFIED`):** UI/README khẳng định "Tuân thủ Luật BVDLCN 91/2025/QH15" — dù kỹ thuật đã làm tối thiểu hóa dữ liệu & xóa EXIF phía client, **chưa có** Hồ sơ Đánh giá tác động xử lý DLCN (DPIA), quy trình SLA xóa dữ liệu theo yêu cầu chủ thể dữ liệu, đầu mối DPO thực tế (tệp `config.js:10` vẫn là placeholder `"cập nhật email nhóm"`), và thẩm định pháp lý độc lập. | Ngừng tuyên bố tuân thủ pháp lý trọn vẹn; chuyển sang nêu rõ "áp dụng nguyên tắc kỹ thuật tối thiểu hóa dữ liệu" và lập checklist pháp lý/DPIA cần phê duyệt. |

---

## 2. ĐO KIỂM HIỆU NĂNG & BẢO MẬT TRỰC TIẾP TRÊN PRODUCTION (27/11/2026)

| Endpoint | HTTP | Latency thực tế | Kích thước | Nhận xét kỹ thuật |
|---|---:|---:|---:|---|
| `GET https://bando-cong-dong-dong-ngac.vercel.app/` | 200 | `258 ms` | `65.591 B` | Tốt ở biên CDN; thiếu `CSP`, `X-Frame-Options`, `Permissions-Policy`. |
| `GET .../api/community` | 200 | **`1.750 ms`** | `650 B` | **Điểm nghẽn:** Quét danh sách Blob toàn store + đọc nhiều tệp JSON nối tiếp; khi có 200+ báo cáo sẽ vượt ngưỡng 5–10 giây hoặc timeout. |
| `GET .../api/ai-copilot` | 200 | `952 ms` | `189 B` | Chấp nhận được cho cold-start, nhưng cần cache cấu hình để giảm xuống `< 120 ms`. |

**HTTP Security Headers đo thực tế trên `GET /`:**
- `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload` (`VERIFIED`)
- `X-Content-Type-Options`: `nosniff` (`VERIFIED`)
- `Referrer-Policy`: `strict-origin-when-cross-origin` (`VERIFIED`)
- `Content-Security-Policy`: **`NULL` (MISSING)**
- `X-Frame-Options`: **`NULL` (MISSING)**
- `Permissions-Policy`: **`NULL` (MISSING)**

---

## 3. PHÂN TÍCH TỔNG HỢP: ĐIỂM MẠNH, ĐIỂM YẾU & HÀNH ĐỘNG

### 3.1 Thành phần tốt cần BẢO TOÀN
1. **Triết lý Citizen-First & Zero-Overlap HUD (`v20`):** Bố cục 3-Row CSS Grid gọn, tương thích tốt màn hình 390px và desktop; trải nghiệm chạm-để-kiểm-tra và thẻ đánh giá nhà trọ A–D giải quyết đúng nỗi đau thực tế của sinh viên và người thuê trọ.
2. **Kỷ luật dữ liệu nền có trích dẫn nguồn:** 60 điểm nền Đông Ngạc–HUMG và 18 tuyến ngõ ngập đều gắn nguồn OSM/báo chí/ngày quan trắc và không tự bịa số đo `depthCm`/`tempC`.
3. **Tính năng giá trị cao cho cộng đồng:** Live 6h check-in (mô hình PetaBencana), Zalo PNG poster xuất trực tiếp trên canvas, danh bạ khẩn cấp địa phương (đã cập nhật sau 01/07/2025), kiểm thử hồi quy `test-gis.mjs`.
4. **Cơ chế tối thiểu hóa dữ liệu cá nhân:** Không bắt đăng nhập khi xem bản đồ, tự động làm tròn tọa độ bảo vệ quyền riêng tư và nén/xóa EXIF phía trình duyệt.

### 3.2 Thành phần cần NÂNG CẤP SÂU
1. **Tầng lưu trữ:** Từ Vercel Private Blob JSON → **PostgreSQL 16 + PostGIS** (giao dịch ACID, spatial index GIST, time-series partitioning) + Object Storage cho ảnh/GeoTIFF.
2. **Tầng xác thực & phân quyền:** Từ 1 mật khẩu tĩnh → **RBAC 5 vai trò + MFA + tài khoản định danh + phiên HttpOnly + nhật ký không thể sửa (append-only audit)**.
3. **Tầng kiến trúc vùng:** Từ hardcode Đông Ngạc (`HUMG_CENTER`, `DEM_GRID_2KM`, `MAX_GEOFENCE_METERS = 6500`) → **Multi-Region Registry 4 cấp** nạp cấu hình động theo vùng hành chính.
4. **Tầng GIS:** Bổ sung phân tích đa lớp chuyên sâu (buffer, intersection, spatial clustering, elevation profile, MCDA, change detection, vector tiles / MapLibre GL JS theo lộ trình chuyển đổi từng bước).
5. **Tầng AI:** Từ prompt-stuffing khóa cứng Gemini → **Provider-Agnostic AI Layer + PostGIS/pgvector RAG + Tool Calling + Guardrails + AI Eval**.

### 3.3 Thành phần LỖI THỜI / CHỈ MANG TÍNH TRÌNH DIỄN / CẦN LOẠI BỎ HOẶC ĐÁNH DẤU LẠI
1. **`community-backend.gs` và `google-forms-generator.gs`:** Mã nguồn Apps Script thế hệ cũ không còn dùng trong production Vercel → chuyển vào `legacy/` hoặc ngừng bảo trì kèm chú thích rõ.
2. **`deploy-pages.yml`:** Triển khai lên GitHub Pages không chạy được `/api/*` → thay bằng quy trình CI kiểm thử bắt buộc và Preview Deployment trên Vercel.
3. **Mô phỏng ngập tĩnh trên lưới DEM `25×25`:** Có giá trị trực quan hóa địa hình tương đối và truyền thông rủi ro, **nhưng phải gắn nhãn bắt buộc `SIMULATED DATA (Mô phỏng tham khảo từ DSM 30m)`**, tuyệt đối không để người dùng hiểu nhầm là bản đồ độ sâu ngập thủy lực 2D thực tế từng ngõ.
4. **Tuyên bố "Tuân thủ hoàn toàn Luật 91/2025/QH15":** Chưa được kiểm định pháp lý/DPIA → phải điều chỉnh thành cam kết kỹ thuật minh bạch và bổ sung quy trình DPIA trước khi mở rộng quy mô thành phố.
