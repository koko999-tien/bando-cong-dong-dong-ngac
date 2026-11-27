# AUDIT TRẢI NGHIỆM NGƯỜI DÂN & PHƯƠNG ÁN THIẾT KẾ CITIZEN-FIRST UX

- **Nhánh phát triển cô lập:** `feat/citizen-first-experience` (nhánh `main` production giữ nguyên `db43653`)
- **Triết lý thiết kế:** *Công nghệ phức tạp ở phía sau. Trải nghiệm đơn giản ở phía trước.*
- **Mục tiêu 5 giây đầu:** Bất kỳ người dân, sinh viên, người thuê trọ, người lao động, người mới đến hay người lớn tuổi nào mở web bằng điện thoại mạng yếu đều hiểu ngay tình hình quanh mình và thực hiện tác vụ chính trong **1–2 chạm**, không cần đăng nhập và không phải học ký hiệu GIS.

---

## 1. Audit Trải nghiệm Hiện tại (`index.html` / `app.js` v20)

| # | Vấn đề UX phát hiện thực tế | Tác động tới người dân bình thường | Giải pháp thiết kế lại |
|---|---|---|---|
| 1 | **Mở trang là toàn màn hình bản đồ 60 ghim + mặc định bật kịch bản mô phỏng `Mưa to 70mm`** (`index.html:544`) | Người dân hiểu nhầm khu vực **đang ngập xanh lè** ngay cả khi trời nắng ráo; không có tóm tắt 5 giây trả lời 6 câu hỏi đời sống. | Đặt màn hình mặc định là **`Hôm nay` (Tình hình quanh tôi)** dạng thẻ rõ ràng, tắt mặc định mô phỏng mưa trên bản đồ và gắn nhãn rõ `Mô phỏng tham khảo`. |
| 2 | **Lọt thuật ngữ kỹ thuật & học thuật vào giao diện người dân** (`DEM (m)`, `Kinh độ/Vĩ độ` trong form báo cáo `index.html:707-721`; `ERA5`, `NotebookLM`, `Đề tài 08`, `Pre-test 15 câu` trong Menu & hộp thoại cảm ơn) | Gây ngại, khó hiểu với người lớn tuổi, lao động phổ thông và người không chuyên. | Áp dụng bảng **Từ điển Tiếng Việt đời thường** (0% thuật ngữ GIS trong Chế độ Người dân); ẩn hoàn toàn tọa độ thô/DEM khỏi form báo sự cố; tách sạch toàn bộ công cụ nghiên cứu sang **`chuyen-gia.html`**. |
| 3 | **Chấm điểm & xếp hạng nhà trọ A–D tổng hợp** (`computeAddressClimateScorecard`) | Dễ tạo cảm giác "chắc chắn an toàn hạng A" dù thiếu dữ liệu khảo sát trực tiếp căn nhà/con ngõ. | **Bỏ điểm số/hạng A–D tự tạo.** Hiển thị nguyên trạng **dữ liệu rủi ro hiện có gần đó** (kèm khoảng cách, nguồn, thời điểm) + **Checklist 12 mục thực tế** người thuê tự kiểm tra ngập, nóng, điện, môi trường. |
| 4 | **Bản đồ chiếm 100% không gian, thiếu chế độ Danh sách ưu tiên** | Điện thoại cấu hình thấp/mạng yếu tải tile chậm; người không quen xem bản đồ khó bấm đúng ghim nhỏ. | Cung cấp **Thẻ & Danh sách đọc ngay** tại trang `Hôm nay` và nút chuyển 1 chạm **`Danh sách | Bản đồ`** ngay tại tab `Bản đồ`. |
| 5 | **Thiếu cấu trúc Cảnh báo dễ hiểu 6 thành phần & phân biệt nguồn dữ liệu** | Người dùng khó phân biệt đâu là dữ liệu dự báo, đâu là mô hình không khí toàn cầu, đâu là phản ánh cư dân, đâu là cảnh báo xác minh. | Chuẩn hóa khung **Thông báo tình hình 6 ý**: Mức độ chú ý · Khu vực · Thời gian · Nguyên nhân · Việc nên làm · Nguồn dữ liệu (gắn huy hiệu tiếng Việt dễ hiểu). |
| 6 | **Thiếu chế độ Hỗ trợ Người lớn tuổi (`Cỡ chữ lớn`) và Hàng đợi gửi báo cáo Ngoại tuyến** | Người lớn tuổi khó đọc cỡ chữ 13–14px; mất sóng 4G lúc mưa bão không lưu được báo cáo. | Thêm nút **`A+ Chữ lớn`** ngay thanh đầu trang (phóng chữ 19–20px, nút cao ≥52px) + **Hàng đợi ngoại tuyến** lưu cục bộ và tự đồng bộ khi có sóng. |
| 7 | **Định tuyến chưa so sánh tường minh 2 phương án & thiếu cảnh báo giới hạn dữ liệu** | Người đi đường cần biết *tại sao* nên đi đường vòng và cần được nhắc rõ hệ thống không bảo đảm an toàn tuyệt đối khi thiếu kiểm chứng trực tiếp. | Thiết kế màn hình **`Tìm đường`** so sánh trực diện **Tuyến thông thường** vs **Tuyến ít rủi ro hơn**, giải thích lý do bằng tiếng Việt thường và ghi rõ giới hạn xác minh. |

---

## 2. Hệ thống Thiết kế Công cộng (Civic Utility Design System)

Thiết kế có chủ đích cho sản phẩm an toàn dân sinh ngoài trời (dễ đọc dưới trời nắng gắt lẫn ban đêm mưa bão, tránh hoàn toàn kiểu giao diện SaaS/AI tối màu rập khuôn):

- **Bảng màu ngữ nghĩa tương phản cao (WCAG AA/AAA, luôn đi kèm biểu tượng + chữ):**
  - Nền trang dịu mắt: `#F5F7F6` · Bề mặt thẻ: `#FFFFFF` · Viền mảnh rõ nét: `#D5DFDC`
  - Chữ chính: `#10201D` (tương phản > 14:1) · Chữ phụ: `#435652` (tương phản > 7:1)
  - Màu chủ đạo hành chính tin cậy: `#0D6B63` (Xanh ngọc trầm)
  - Mức bình thường / Nơi trú & Y tế: `#157347` trên `#EAF7F0`
  - Mức cần lưu ý / Phản ánh chờ kiểm chứng: `#924D00` trên `#FFF6E6`
  - Mức nguy cơ cao / Điểm ngập sâu: `#B42318` trên `#FEF1F0`
- **Kiểu chữ & Khả năng tiếp cận:**
  - `Be Vietnam Pro` (dấu tiếng Việt sắc nét, fallback tức thì sang system-ui khi mạng yếu).
  - Cỡ chữ mặc định `16px` (`line-height: 1.55`), chế độ **`Chữ lớn`** nâng lên `19px`, toàn bộ nút bấm tối thiểu `44×44 px` (`52px` ở chế độ chữ lớn).
- **Cấu trúc điều hướng 5 chức năng cốt lõi (1–2 thao tác):**
  ```text
  Mobile (360–768px):                         Desktop (>= 960px):
  +-----------------------------------+       +----------+-------------------------------+
  | An toàn Đông Ngạc  [Vị trí] [A+]  |       | Nav trái | Thanh Vị trí + Cỡ chữ lớn     |
  +-----------------------------------+       | 1.Hôm nay+-------------------------------+
  |                                   |       | 2.Bản đồ | Nội dung chính thoáng mắt     |
  |  Nội dung 5 chức năng dễ đọc      |       | 3.Đường  | (Bản đồ tách 2 cột Danh sách  |
  |  (Thẻ / Danh sách / Bản đồ)       |       | 4.Nhà trọ|  + Bản đồ; Hôm nay dạng lưới) |
  |                                   |       | 5.Báo tin|                               |
  +-----------------------------------+       | -------- |                               |
  | [Hôm nay][Bản đồ][Đường][Trọ][Báo]|       | Chuyên gia / Quản trị (tách riêng)     |
  +-----------------------------------+       +----------+-------------------------------+
  ```

---

## 3. Tách biệt Chế độ Người dân & Chế độ Chuyên gia / Quản trị

- **`index.html` (Mặc định cho Người dân):** 5 chức năng cốt lõi + Trợ lý giải thích tiếng Việt dễ hiểu + Chế độ chữ lớn + Ngoại tuyến. **Không hiển thị** DEM, ERA5, UTM48N, KML/GeoJSON export, NotebookLM, hay bảng khảo sát nghiên cứu.
- **`chuyen-gia.html` (Chế độ Nghiên cứu & Chuyên gia GIS):** Bảo toàn 100% giao diện WebGIS chuyên sâu hiện có (lát cắt địa hình DEM, bảng ERA5 2024–2026, 18 tuyến ngập, mô phỏng mưa, lọc hạng A/B/C, xuất KML/CSV/GeoJSON, UTM 48N, NotebookLM), kèm nút quay về Giao diện Người dân.
- **`admin.html` (Trung tâm Quản trị):** Tách riêng cho đội điều hành kiểm duyệt báo cáo và phát cảnh báo xác minh.

---

## 4. Từ điển Chuyển ngữ Tự nhiên (Zero-Jargon Mapping)

| Thuật ngữ cũ (Ẩn khỏi Người dân) | Ngôn ngữ Người dân mới (Hiển thị mặc định) |
|---|---|
| `OBSERVED_DATA` / `Hạng A` | `Ghi nhận thực địa / Nguồn chính thống` |
| `COMMUNITY_REPORTS` / `Hạng B` | `Nhiều người dân cùng xác nhận` |
| `COMMUNITY_REPORTS` / `Hạng C` | `Người dân mới báo (chờ kiểm chứng)` |
| `FORECAST_DATA` | `Dữ liệu dự báo thời tiết` |
| `MODELLED_DATA` (CAMS / ERA5) | `Ước tính từ mô hình khu vực` |
| `SIMULATED_DATA` (DEM 30m) | `Kịch bản tham khảo (không phải ngập thực tế)` |
| `Điểm An toàn / Score A–D` | **Bỏ điểm tự tạo** → Hiển thị danh sách ghi nhận thực tế + Checklist tự kiểm tra |
| `Kinh độ / Vĩ độ / DEM (m)` | Ẩn hoàn toàn → Chỉ chọn tên đường/mốc, chấm bản đồ hoặc bấm `Vị trí hiện tại` |

---

## 5. Bộ 7 Kịch bản Kiểm thử Người dùng Thực (User Testing Protocol)

Mỗi kịch bản được kiểm thử trên cả thiết bị mô phỏng di động (`390×844` & `360×800`), máy tính (`1440×900`), chế độ chữ lớn và trạng thái mất mạng (`offline`):

1. **Người dân mới truy cập lần đầu:** Trong ≤ 5 giây trả lời được 6 câu hỏi (nguy cơ quanh tôi, thời tiết, điểm ngập gần nhất, đường đi, nơi trú, cách báo sự cố) với `0` thuật ngữ GIS khó hiểu.
2. **Sinh viên tìm phòng trọ:** Chuyển sang `Nhà trọ` (1 chạm) → chọn `Ngõ 43 Cổ Nhuế` (2 chạm) → xem ngay danh sách điểm ngập đã ghi nhận gần đó + bệnh viện gần nhất + tích checklist 12 mục mà không có điểm số bịa đặt.
3. **Người đi đường tránh ngập:** Chuyển sang `Tìm đường` (1 chạm) → chọn điểm đi/đến (`ĐH Mỏ → Cầu Noi`) → xem so sánh 2 tuyến (Thông thường vs Ít rủi ro hơn) + lý do đề xuất + lưu ý không khẳng định an toàn tuyệt đối.
4. **Người dân tìm nơi trú mưa gần nhất:** Từ màn hình đầu bấm `Tìm nơi trú & y tế` (1 chạm) → thấy ngay cơ sở y tế/điểm có mái che gần nhất (không bao giờ dẫn ra hồ ngoài trời!) kèm khoảng cách và nút chỉ đường/gọi hỗ trợ.
5. **Người lớn tuổi xem cảnh báo:** Bật `A+ Chữ lớn` (1 chạm) → đọc trọn khung Cảnh báo 6 ý với cỡ chữ ≥ 19px, tương phản cao, nút bấm lớn ≥ 50px, không tràn chữ hay đè thẻ.
6. **Người dùng mạng yếu / mất mạng (Offline):** Ngắt kết nối mạng → mở trang vẫn đọc được 60 điểm nền đã lưu, danh bạ khẩn cấp, checklist nhà trọ, trợ lý ngoại tuyến và gửi thử báo cáo được lưu vào hàng đợi ngoại tuyến an toàn.
7. **Người dân báo điểm ngập:** Chuyển sang `Báo sự cố` (1 chạm) → chọn loại sự cố, chọn/nhập vị trí (không phải gõ tọa độ), chọn mức ngập trực quan, tích đồng ý và gửi thành công với tọa độ tự làm tròn riêng tư ~20m và trạng thái `Phản ánh cộng đồng (chờ kiểm chứng)`.
