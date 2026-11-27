# KIẾN TRÚC BẢO MẬT, QUẢN TRỊ RỦI RO & KIỂM CHỨNG PHÁP LÝ (SECURITY ARCHITECTURE)

## 1. Bức tranh rủi ro hiện tại (Kết quả Audit 27/11/2026)

| Mã rủi ro | Mức độ | Phát hiện thực tế trong mã nguồn | Vị trí mã nguồn | Trạng thái xử lý |
|---|---|---|---|---|
| `SEC-01` | **CRITICAL** | **Leo thang độ tin cậy không cần xác thực:** Bất kỳ ai gửi `POST /api/community` (`submit_report`) với chuỗi `reporterRole: "Nhóm khảo sát thực địa..."` đều được tự động gán `confidenceTier: 'A'` và `status: 'approved'` mà không cần đăng nhập hay token! | `api/community.js:411,426,428` | **Vá ngay** trên nhánh `feat/open-resilience-platform-v2` (chỉ cấp Tier A khi đã xác thực token/vai trò hợp lệ). |
| `SEC-02` | **CRITICAL** | **Thiếu RBAC, MFA & Thu hồi phiên:** Toàn hệ thống chỉ dùng 1 `ADMIN_PASSCODE` dùng chung, không phân biệt ai làm gì, không thu hồi được token khi lộ, không có MFA. | `api/community.js:74-108`, `admin.js:38` | Thiết kế lõi RBAC 5 vai trò ngay ở M1 (`platform/security/rbac.js`); triển khai IdP + MFA + HttpOnly Cookie ở M2. |
| `SEC-03` | **HIGH** | **Fallback secret cứng & dùng chung khóa mã hóa:** Chuỗi `'humg-fallback-secret'` làm khóa dự phòng cho cả ký token HMAC và dẫn xuất khóa AES-256-GCM giải mã Gemini API Key. | `api/community.js:75,91`, `api/ai-copilot.js:53,65` | Chặn fallback trong production trên nhánh mới; tách riêng `AUTH_SIGNING_SECRET` và `VAULT_ENCRYPTION_KEY` (hoặc dùng KMS/Env Secrets). |
| `SEC-04` | **HIGH** | **Thiếu Rate Limit chống Brute-Force & Spam API:** `admin_login`, `submit_report`, `submit_survey` không có giới hạn tốc độ phía server; `api/ai-copilot.js` dùng `Map` RAM (mất khi cold start, không chia sẻ giữa các serverless instance). | `api/community.js:306,381`, `api/ai-copilot.js:20` | Thêm bộ giới hạn trượt có trần bộ nhớ ở M1; chuyển sang **Upstash Redis Distributed Rate Limiting** ở M2. |
| `SEC-05` | **HIGH** | **Thiếu HTTP Security Headers quan trọng:** Production thiếu `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`. | `vercel.json` | Bổ sung `X-Frame-Options: DENY`, `Permissions-Policy`, `CSP-Report-Only` an toàn trên nhánh mới → chuyển sang enforce sau khi xác minh telemetry. |
| `SEC-06` | **MEDIUM** | **Kiểm định tệp tải lên & EXIF phía server chưa đầy đủ:** Chỉ kiểm tra tiền tố chuỗi `data:image/jpeg;base64,`, không kiểm tra magic bytes nhị phân (`FF D8 FF`), không xóa EXIF/re-encode phía server. | `api/community.js:402-404` | Bổ sung kiểm tra magic bytes nhị phân ở M1 (`platform/security/validators.js`); thêm re-encode ảnh (`sharp`) & Object Storage ở M2. |
| `SEC-07` | **MEDIUM** | **Lỗi ranh giới đường dẫn dev server (`server.mjs`):** `target.startsWith(__dirname)` thiếu dấu phân cách thư mục (`path.sep`). | `server.mjs:240` | **Vá ngay** trên nhánh `feat/open-resilience-platform-v2`. |
| `SEC-08` | **MEDIUM** | **Lưu Admin Bearer Token trong `sessionStorage`:** Nếu xảy ra XSS tại trang admin sẽ lộ token trực tiếp cho script. | `admin.js:38` | Chuyển sang cookie `HttpOnly; Secure; SameSite=Strict` kèm CSRF token ở M2. |

---

## 2. Mô hình phân quyền RBAC 5 vai trò có phạm vi vùng (Region-Scoped RBAC)

Được cài đặt sẵn dưới dạng chính sách chuẩn tại [rbac.js](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/platform/security/rbac.js):

| Vai trò (`role`) | Phạm vi mặc định | Quyền đọc | Quyền ghi / Tác vụ | Yêu cầu xác thực |
|---|---|---|---|---|
| `citizen` (ẩn danh / công khai) | Mọi vùng công khai | Bản đồ công khai, thời tiết, AQI, cảnh báo đã duyệt, dữ liệu mở | Gửi báo cáo Hạng C (`pending`), bấm `+1`, live check-in 6h, hỏi AI trong hạn mức | Không bắt buộc đăng nhập (giới hạn tốc độ theo IP/fingerprint + Turnstile khi bất thường) |
| `field_verifier` | Các `regionIds` được gán | Dữ liệu vùng được giao + hàng đợi báo cáo cần kiểm chứng hiện trường | Gửi báo cáo thực địa có gắn chứng từ ảnh/GPS, đề xuất xác minh hiện trường (Hạng B/A theo ngưỡng kiểm định chéo) | Tài khoản định danh (Email/OAuth2), khuyên bật MFA |
| `researcher` | Các vùng nghiên cứu được phép | Toàn bộ Data Catalog, lịch sử chuỗi thời gian ẩn danh, xuất GeoJSON/GeoPackage/CSV, chạy truy vấn GIS & AI chuyên sâu | Không sửa dữ liệu vận hành hay phát cảnh báo công khai | Tài khoản định danh + API Key có hạn mức riêng |
| `ward_operator` | 1 hoặc vài phường/quận cụ thể (`regionIds`) | Toàn bộ hàng đợi báo cáo, audit log vùng phụ trách, KPI, radar điều hành | Kiểm duyệt điểm, gộp trùng 50m, xác minh hiện trường, **phê duyệt & phát bản tin cảnh báo chính thức** trong vùng phụ trách | Tài khoản định danh + **MFA bắt buộc (TOTP/Passkey)** + phiên `HttpOnly` ngắn hạn |
| `super_admin` | Toàn hệ thống (`*`) | Toàn bộ hệ thống, nhật ký kiểm toán bất biến, trạng thái hạ tầng | Cấu hình vùng mới (`RegionConfig`), cấp/thu hồi vai trò RBAC, xoay vòng khóa, quản lý nhà cung cấp AI, cấu hình bảo mật | Tài khoản định danh + **MFA bắt buộc** + nguyên tắc tối thiểu đặc quyền |

---

## 3. Phòng vệ theo chiều sâu (Defense-in-Depth Controls)

### 3.1 Xác thực, Phiên & Quản lý bí mật
- Loại bỏ hoàn toàn mật khẩu dùng chung khi chuyển sang Milestone 2 (đề xuất **Supabase Auth** hoặc **Clerk** có hỗ trợ TOTP MFA và RBAC claims).
- Phiên quản trị dùng cookie `HttpOnly; Secure; SameSite=Strict`, thời hạn tối đa 8 giờ, có danh sách thu hồi (revocation) trong Redis khi đăng xuất hoặc đổi quyền.
- Tách khóa bí mật theo mục đích (`AUTH_SIGNING_SECRET`, `AI_PROVIDER_API_KEY`, `DATABASE_URL`, `REDIS_TOKEN`); áp dụng quy trình xoay vòng khóa mỗi 90 ngày (xem [OPERATIONS_RUNBOOK.md](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/docs/OPERATIONS_RUNBOOK.md)).
- Không bao giờ ghi log khóa API, Authorization header, mật khẩu hoặc tọa độ nhà riêng chính xác của cư dân.

### 3.2 Bảo vệ API, Upload & Chống lạm dụng
- **Validation nghiêm ngặt ở biên API:** Mọi payload đều đi qua lớp kiểm định kiểu, độ dài, ranh giới tọa độ theo `RegionConfig`, lọc spam/XSS và giới hạn kích thước body (`<= 256 KB` cho JSON).
- **Xử lý ảnh tải lên an toàn:**
  1. Kiểm tra chữ ký nhị phân (magic bytes): JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`52 49 46 46 ... 57 45 42 50`).
  2. Giới hạn dung lượng & độ phân giải; xóa sạch EXIF/XMP/IPTC ở cả trình duyệt lẫn server (re-encode bằng `sharp` ở Milestone 2) trước khi lưu lên Object Storage cô lập (không thực thi script).
- **Rate Limiting & Bot Protection:**
  - Phân tầng giới hạn: `admin_login` (≤ 5 lần / 15 phút / IP + khóa tạm), `submit_report` (≤ 3 lần / 10 phút / IP), `live_checkin` (≤ 1 lần / 3 phút / điểm / thiết bị), `ask_copilot` (≤ 12 lần / phút / IP).
  - Bổ sung Cloudflare Turnstile (miễn phí, không gây phiền kiểu CAPTCHA khó) cho form gửi báo cáo khi lưu lượng tăng bất thường.

### 3.3 Nhật ký Kiểm toán & Khả năng phục hồi
- Mọi thao tác quản trị (đăng nhập thất bại/thành công, đổi quyền, duyệt/ẩn điểm, phát/gỡ cảnh báo, xuất dữ liệu nội bộ) đều ghi vào bảng `audit_logs` chỉ cho phép `INSERT` (`append-only`).
- Sao lưu cơ sở dữ liệu tự động hàng ngày + Point-in-Time Recovery (PITR) + diễn tập khôi phục định kỳ hàng quý (RPO ≤ 24h ở Pilot, ≤ 15 phút ở quy mô Thành phố; RTO ≤ 2 giờ).

---

## 4. Đánh giá trung thực về Quyền riêng tư & Pháp lý Việt Nam (KHÔNG tuyên bố tuân thủ khi chưa kiểm chứng)

> [!WARNING]
> **Nguyên tắc trung thực pháp lý:** Trong kiểm toán hiện trạng, một số tài liệu/UI cũ ghi *"Tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15"*. Ở góc độ kỹ thuật và pháp chế nghiêm túc, trạng thái hiện tại là **`PARTIAL / UNVERIFIED`** — **CHƯA ĐỦ cơ sở pháp lý để tuyên bố tuân thủ hoàn toàn**.

| Yêu cầu theo Luật BVDLCN 91/2025/QH15 & NĐ 13/2023/NĐ-CP | Trạng thái kỹ thuật hiện tại | Khoảng trống cần hoàn thiện trước khi triển khai rộng |
|---|---|---|
| Tối thiểu hóa dữ liệu (không thu thập SĐT/CCCD/Email bắt buộc từ cư dân xem bản đồ) | `VERIFIED` | Tiếp tục duy trì tuyệt đối nguyên tắc không thu thập PII nhạy cảm ở luồng công khai. |
| Ẩn danh hóa / Làm tròn tọa độ & xóa EXIF ảnh | `PARTIAL` (mới chạy phía client; fingerprint hash IP+UA chưa xoay muối định kỳ) | Bổ sung xóa EXIF phía server (M2) và xoay `salt` hàng ngày cho fingerprint để không truy ngược được người dùng. |
| Thông báo mục đích xử lý & đồng ý rõ ràng (Consent) | `PARTIAL` | Bổ sung hộp xác nhận đồng ý có phiên bản lưu dấu vết trước khi gửi báo cáo/khảo sát. |
| Đầu mối liên hệ & quy trình xóa/chỉnh sửa dữ liệu trong thời hạn luật định | `NOT IMPLEMENTED` (`config.js:10` vẫn là dòng placeholder!) | Chủ dự án cần cung cấp email/kênh tiếp nhận chính thức và quy trình SLA xử lý yêu cầu xóa dữ liệu. |
| Hồ sơ đánh giá tác động xử lý DLCN (DPIA) & thẩm định pháp chế | `NOT IMPLEMENTED` (`UNVERIFIED`) | Cần lập hồ sơ DPIA chính thức và tham vấn bộ phận pháp chế trường/địa phương trước khi mở rộng quy mô quận/thành phố hoặc lưu tài khoản định danh người dân. |
| Phân biệt cảnh báo cộng đồng với cảnh báo thiên tai chính thức theo Luật Phòng, chống thiên tai | `PARTIAL` | Bắt buộc hiển thị rõ nguồn: `Cảnh báo cộng đồng / Tham khảo nghiên cứu` vs `Cảnh báo xác minh chính thức từ cơ quan có thẩm quyền`. |
