# CHIẾN LƯỢC SẢN PHẨM & TRẢI NGHIỆM NGƯỜI DÙNG (PRODUCT STRATEGY)

## 1. Triết lý sản phẩm: Một nền tảng — Nhiều tầng sâu (Progressive Disclosure)

Rất nhiều hệ thống WebGIS thất bại vì rơi vào một trong hai thái cực:
1. **Quá phức tạp kiểu phần mềm GIS để bàn:** Nhồi hàng chục lớp layer, tham số kỹ thuật và biểu đồ khiến người dân bỏ đi trong 5 giây đầu khi đang cần tra đường về nhà lúc trời mưa.
2. **Quá sơ sài kiểu bản đồ ghim tĩnh:** Không đủ chiều sâu dữ liệu, không truy xuất được nguồn gốc, không làm được nghiên cứu hay điều hành ứng phó khẩn cấp.

**OPEN RESILIENCE INTELLIGENCE PLATFORM** giải quyết mâu thuẫn này bằng nguyên tắc **2 lớp chế độ nhất quán trên cùng một kho dữ liệu chuẩn hóa**:
- **Chế độ Mặc định — Cư dân (Citizen Mode):** Trả lời 4 câu hỏi sinh tồn trong ≤ 3 giây: *Chỗ tôi có ngập/nóng/ô nhiễm không? Đi đường nào an toàn? Trú ở đâu gần nhất? Cần gọi ai?*
- **Chế độ Chuyên sâu — Nghiên cứu & Điều hành (Research / Operations Mode):** Mở các công cụ phân tích không gian (lát cắt địa hình, buffer, giao cắt, MCDA, chuỗi thời gian, xuất GeoJSON/GeoPackage/CSV, AI phân tích đa nguồn và bảng điều hành cảnh báo có quy trình duyệt).

---

## 2. Phân tích 8 nhóm người dùng mục tiêu (User Personas)

| # | Nhóm người dùng | Bối cảnh sử dụng thực tế | Nhu cầu cốt lõi (Jobs-to-be-done) | Giao diện / Quyền phù hợp |
|---|---|---|---|---|
| 1 | **Người dân & Hộ gia đình** | Đang mưa lớn, nắng gắt hoặc chuẩn bị thuê/mua nhà trọ | Biết ngay ngõ trước nhà có ngập không, điểm trú/y tế gần nhất, thẻ điểm an toàn địa chỉ A–D, chia sẻ ảnh cảnh báo qua Zalo | Mobile-first Web/PWA, không cần đăng nhập, chế độ ngoại tuyến |
| 2 | **Sinh viên & Người thuê trọ** | Di chuyển hàng ngày tới giảng đường (HUMG, cụm ĐH Bắc Từ Liêm), tìm phòng trọ đầu năm học | Tra lộ trình đi bộ/xe máy né ngập, kiểm tra lịch sử ngập khu trọ, xem tình trạng ngập 6h gần nhất từ cộng đồng | Mobile PWA + Watchlist `Địa điểm của tôi` + Scorecard địa chỉ |
| 3 | **Người cao tuổi / Nhóm dễ tổn thương** | Khó đọc chữ nhỏ, ít thao tác công nghệ, nhạy cảm với sốc nhiệt & bụi mịn PM2.5 | Chữ lớn tương phản cao, cảnh báo đơn giản 1 màn hình, nút gọi khẩn cấp 1 chạm, hướng dẫn sơ cứu trực quan | Chế độ đơn giản + nút gọi 115/114/y tế phường + thẻ đọc to (TTS) |
| 4 | **Tình nguyện viên thực địa (`field_verifier`)** | Sinh viên khảo sát, đội xung kích phường đi ghi nhận hiện trường | Gửi báo cáo có GPS chính xác, chụp ảnh hiện trường (xóa EXIF tự động), xác minh lại báo cáo của cư dân khác trong khu vực | Tài khoản đăng nhập có xác thực vai trò `field_verifier`, hàng đợi offline sync |
| 5 | **Nhà nghiên cứu & Giảng viên GIS/Khí hậu (`researcher`)** | Phân tích tương quan mưa–địa hình–ngập, đánh giá đảo nhiệt, viết bài báo khoa học | Truy vấn không gian, xem đầy đủ 12 trường metadata, phân biệt nguồn dữ liệu, tải GeoJSON/CSV/GeoPackage kèm giấy phép và provenance | Chế độ Expert WebGIS + Data Catalog + Read-only Research API |
| 6 | **Cán bộ điều hành cấp phường/quận (`ward_operator`)** | Mưa bão đổ bộ, cần tổng hợp nhanh điểm ngập thực tế và phát cảnh báo chính xác | Theo dõi bản đồ điều hành thời gian thực, duyệt báo cáo trùng lặp, xác minh hiện trường, phê duyệt bản tin cảnh báo có dấu vết audit | Operations Command Center + MFA + Workflow duyệt cảnh báo |
| 7 | **Nhà quy hoạch & Quản lý đô thị** | Lập kế hoạch cải tạo thoát nước, trồng cây xanh, bố trí điểm tránh trú công cộng | Xem điểm nóng lặp lại nhiều năm, phân tích vùng thiếu tiếp cận điểm an toàn/bóng mát (suitability & accessibility), so sánh biến động theo thời gian | Spatial Analytics Dashboard + Time-series Change Detection |
| 8 | **Quản trị nền tảng (`super_admin`)** | Triển khai địa phương mới, giám sát SLA, xoay vòng khóa API, xử lý sự cố bảo mật | Quản lý RegionConfig đa vùng, phân quyền RBAC, giám sát quota AI/DB, kiểm tra audit log và chạy sao lưu/phục hồi | Admin Governance Console + MFA bắt buộc + Nhật ký bất biến |

---

## 3. Quy chuẩn thiết kế giao diện & khả năng tiếp cận (UI/UX Standards)

1. **Zero-Overlap HUD Discipline:** Không bao giờ để thẻ nổi đè nhau hoặc che mất thanh công cụ trên màn hình `390×844` (mobile) và `1280×620` / `1440×900` (desktop). Áp dụng CSS Grid HUD chuẩn và kiểm tra tự động trong Playwright CI.
2. **Minh bạch nguồn dữ liệu trên từng thẻ hiển thị:** Mọi số liệu, lớp bản đồ và câu trả lời AI đều gắn huy hiệu trực quan cho 6 lớp dữ liệu:
   - `QUAN TRẮC (OBSERVED)` · `MÔ HÌNH (MODELLED)` · `VỆ TINH (SATELLITE)` · `DỰ BÁO (FORECAST)` · `CỘNG ĐỒNG (COMMUNITY)` · `MÔ PHỎNG (SIMULATED)`.
3. **Accessibility (WCAG 2.2 AA):**
   - Tỷ lệ tương phản màu văn bản ≥ 4.5:1 (UI lớn ≥ 3:1).
   - Không chỉ dùng màu đỏ/xanh để phân biệt rủi ro (kết hợp biểu tượng hình học + nhãn chữ rõ ràng cho người mù màu).
   - Hỗ trợ điều hướng bàn phím (`Tab`, `Escape` đóng hộp thoại/gợi ý), kích thước vùng chạm tối thiểu `44×44 px` trên di động.
4. **Hiệu năng trên mạng 3G/4G yếu mùa mưa bão:**
   - Khung bản đồ và dữ liệu khẩn cấp tải < 2 giây, hỗ trợ offline hoàn chỉnh cho danh bạ khẩn cấp, cẩm nang sơ cứu và cache bản đồ vùng đã xem.

---

## 4. Chiến lược tiếp nhận & phát triển bền vững (Adoption Strategy)

1. **Vòng lặp dữ liệu cộng đồng lành mạnh (Community Trust Loop):** Báo cáo cư dân mới luôn bắt đầu ở `COMMUNITY REPORTS` (Hạng C) → tự động gợi ý xác minh chéo (≥ 3 xác nhận độc lập nâng Hạng B) → tình nguyện viên/cán bộ xác minh hiện trường nâng Hạng A. Người dân thấy đóng góp của mình giúp hàng xóm ngay lập tức (Live 6h pulse) nhưng hệ thống không bao giờ bị tin giả đánh sập độ tin cậy.
2. **Định hướng học thuật gắn thực tiễn:** Duy trì cổng Dữ liệu Mở (CC BY 4.0 cho dữ liệu cộng đồng đã ẩn danh) và định dạng chuẩn để sinh viên, giảng viên HUMG và các trường lân cận sử dụng làm thực hành môn GIS, Khí tượng Thủy văn, Quản lý Đô thị và Truyền thông Môi trường.
3. **Nhân bản không tốn chi phí viết lại code:** Khi mở rộng sang quận/tỉnh khác, đối tác chỉ cần khai báo `RegionConfig` + nạp tệp ranh giới/dữ liệu nền qua Data Pipeline chuẩn hóa.
