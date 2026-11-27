# Bản đồ Cộng đồng Mở “Thích ứng Nắng nóng & Ngập úng” — Khu vực ĐH Mỏ - Địa chất (Phường Đông Ngạc, Hà Nội)

Dự án WebGIS cộng đồng mở (Public Participatory GIS) trong bán kính **1 – 2 km quanh Trường Đại học Mỏ - Địa chất** (`21.072514°N, 105.773870°E`, phường Đông Ngạc mới, TP. Hà Nội). Được thiết kế cho học phần **Giáo dục & Truyền thông Môi trường (Đề tài 08)** và xây dựng kiến trúc để vận hành bền vững dài hạn với chi phí **0 VNĐ**.

## Cấu trúc Hệ sinh thái Web (7 Trang giao diện + Cấu hình & 2 Backend Apps Script)

| Tệp / Trang | Chức năng chính |
| :--- | :--- |
| `index.html` | **Bản đồ Cộng đồng Mở (Trang chủ):** 32 điểm nền xác thực (17 Rủi ro · 15 An toàn/Y tế/Hành chính), định tuyến đường bộ thực tế (OSRM) né vùng ngập, **đo lát cắt địa hình Copernicus DEM động**, mô phỏng kịch bản mưa (30mm · 70mm · >115mm) & UHI, thời tiết trực tiếp + dự báo 7 ngày, link sâu `?point=ID`, nhập giọng nói tiếng Việt, **Notebook Tri thức** & PWA offline. |
| `du-lieu-mo.html` | **Cổng Số liệu & Dữ liệu Mở:** 3 biểu đồ SVG (ERA5 2024–2026, lát cắt DEM `6–17 m`, lượng mưa & nắng theo tháng năm 2026 với đỉnh `624,8 mm` tháng 8/2026), tải CSV/GeoJSON/KML & Gói nguồn Google NotebookLM (`.md`). |
| `cam-nang-1-cham.html` | **Cẩm nang Ứng phó 1 Chạm:** Phiên bản web & in PDF 1 trang chuẩn khuyến cáo Bộ Y tế / KTTV kèm danh bạ cơ sở y tế xác thực OSM. |
| `infographics-va-ban-tin.html` | **Bộ 03 Infographic & 02 Bản tin Cảnh báo Mẫu (Vàng / Đỏ):** 100% số liệu thực tế, có bộ lọc, nút chép caption đăng Facebook/Zalo và in PDF từng trang. |
| `thuyet-trinh.html` | **Bộ 10 Slide Bảo vệ Đồ án Tương tác & Studio Quay Video 45 Giây:** Hỗ trợ phím mũi tên, toàn màn hình (`F`), lời dẫn phân vai TV1–TV2–TV3 và **Teleprompter bấm giờ 45.0 giây** tự sáng từng cảnh quay. |
| `phieu-thuc-dia.html` | **Phiếu Ghi Thực địa A4 Ngang:** Mẫu chuẩn in ra cho nhóm TV1 & TV3 đi thực địa chụp ảnh, ghi tọa độ và phỏng vấn ẩn danh cư dân. |
| `admin.html` + `admin.js` | **Trung tâm Quản trị & Điều hành 5 Phân hệ:** (1) Theo dõi 8 KPI & **Máy tính thống kê Pre-test vs Post-test tự sinh đoạn văn Chương 5**; (2) Kiểm duyệt hàng loạt, CRUD kèm **Mini-Map Leaflet kéo thả ghim trực quan** & Quét gộp trùng 50m; (3) Phát thanh cảnh báo thời gian thực & 4 QR UTM; (4) Data QA 100% & Nhật ký kiểm duyệt; (5) Đồng bộ Google Sheet, Sao lưu `.json` & Xuất gói Google NotebookLM. |
| `config.js` | **Tệp cấu hình duy nhất:** Điền URL Web App Apps Script, 3 link Google Forms và link rút gọn Bitly tại đây. |
| `community-backend.gs` | **Backend Google Apps Script + Google Sheets:** Lưu trữ toàn bộ lượt `+1`, báo điểm mới (tự gộp trong 50m) và API duyệt điểm cho `admin.html`. Không bị tạm dừng sau 7 ngày không hoạt động. |
| `google-forms-generator.gs` | **Script sinh tự động 3 Google Forms:** Tạo 1 lần đủ Form 1 (Pre-test 15 câu), Form 2 (Mini-Quiz 5 câu tự chấm điểm) và Form 3 (Post-test 6 câu). |

---

## Quy trình Triển khai Công khai Có HTTPS trong 5 Phút (0 VNĐ)

### Bước 1: Kích hoạt Cơ sở dữ liệu Google Sheet (`community-backend.gs`)
1. Truy cập https://script.google.com → **Dự án mới** → dán toàn bộ nội dung tệp `community-backend.gs`.
2. Chọn hàm `setupCommunityDatabase` → bấm **Chạy (Run)** → mở **Nhật ký thực thi** lấy **Spreadsheet ID** dán vào dòng `SPREADSHEET_ID`.
3. Đổi `ADMIN_PASSCODE` sang mật khẩu riêng của nhóm.
4. Bấm **Triển khai (Deploy) → Tùy chọn triển khai mới → Loại: Ứng dụng web**:
   - Thực thi dưới dạng: **Tôi (Me)**
   - Ai có quyền truy cập: **Bất kỳ ai (Anyone)**
5. Copy đường link `https://script.google.com/macros/s/.../exec` dán vào trường `communityApiUrl` trong tệp `config.js`.

### Bước 2: Đẩy lên GitHub & Triển khai Tự động lên Vercel (Khuyên dùng số 1 — Có HTTPS & CI/CD)
1. Tạo 1 repository mới (trống, không tích thêm README) trên GitHub, ví dụ: `bando-cong-dong-dong-ngac`.
2. Đẩy kho Git đã được khởi tạo sẵn trong thư mục này lên GitHub:
   ```bash
   git remote add origin https://github.com/koko999-tien/bando-cong-dong-dong-ngac.git
   git push -u origin main
   ```
3. Mở https://vercel.com/new → **Import Git Repository** → chọn repo `bando-cong-dong-dong-ngac` → bấm **Deploy** (tệp `vercel.json` và `.vercelignore` đã cấu hình sẵn chuẩn tĩnh + PWA, mất ~5 giây là có ngay link `https://...vercel.app`).
4. **Cập nhật tiếp cực nhàn:** Sau khi lên Vercel, bất cứ khi nào bạn sửa `config.js` (dán link Google Sheet/Form), thêm ảnh thực địa hoặc nâng cấp tính năng, chỉ cần `git add . && git commit -m "Cap nhat" && git push` — Vercel tự động cập nhật bản mới trong 10 giây mà **link chính & mã QR không bao giờ bị đổi**!

*(Dự phòng: Kho mã cũng đã có sẵn `.github/workflows/deploy-pages.yml` nếu muốn bật thêm GitHub Pages song song).*

### Bước 3: Rút gọn Link Bitly & Gắn Mã QR
- Rút gọn link Web HTTPS bằng https://bitly.com để thống kê lượt mở (KPI ≥ 60 lượt), cập nhật link Bitly vào `config.js` và xuất ảnh mã QR ngay trong nút **Sheet & QR**.

---

## Chạy thử nghiệm & Kiểm thử trên máy cục bộ
```bash
npm test    # Chạy bộ kiểm thử GIS, dữ liệu thực tế & xuất lại tệp trong exports/
npm start   # Mở máy chủ cục bộ tại http://localhost:4173
```

## Bản quyền & Quyền riêng tư
- Dữ liệu cộng đồng: **CC BY 4.0** · Dữ liệu nền hạ tầng: **© OpenStreetMap contributors (ODbL 1.0)** · Khí tượng: **ECMWF ERA5 (Open-Meteo)** · Cao độ: **Copernicus DEM GLO-30**.
- Tuân thủ nguyên tắc tối thiểu hóa dữ liệu cá nhân theo **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** (hiệu lực 01/01/2026).
