# Lộ trình Nâng cấp Sâu Độ chi tiết Không gian Toàn quốc (Multi-Scale Resilience Architecture)

## 1. Chẩn đoán vấn đề "Sụt giảm độ chi tiết khi mở rộng quy mô" (Data Cliff)

Khi mở rộng hệ thống từ bán kính **2 km quanh ĐH Mỏ - Địa chất (Đông Ngạc, Hà Nội)** lên phạm vi **63 tỉnh/thành phố toàn quốc**, người dùng gặp hiện tượng **"vực thẳm dữ liệu" (Data Cliff)**:

1. **Tập dữ liệu gốc mang tính cục bộ:** 60 điểm khảo sát thực địa, 18 hành lang đường ngập và lưới cao độ chi tiết ban đầu chỉ tồn tại trong vòng tròn bán kính 2 km tại Đông Ngạc. Khi chuyển sang Đà Nẵng, Huế, TP.HCM, Cần Thơ hay Lào Cai, vòng khoanh hiển thị `0 điểm` trên một nền bản đồ đường phố trống.
2. **Thiếu lớp hạ tầng cứu hộ & thủy văn động:** Ở các địa phương ngoài Đông Ngạc, người dân cần biết **bệnh viện, trạm y tế, trạm cứu hỏa, trụ sở tránh trú và mạng lưới sông/kênh tiêu thoát** nằm gần vị trí đang xem — đây là thông tin hoàn toàn có thể khai thác hợp pháp, thời gian thực từ OpenStreetMap mà không tốn chi phí máy chủ lớn.
3. **Thiếu độ sâu diễn giải theo thời gian và điểm chạm:** Một màn hình cảnh báo chuyên nghiệp cần chuỗi dự báo mưa **24 giờ theo giờ**, nhiều lớp nền (**Phố · Vệ tinh · Địa hình**), lớp phủ **Radar mưa trực tiếp**, và công cụ **Tra cứu cao độ/rủi ro tại bất kỳ tọa độ chạm nào** — đồng thời giữ nguyên cơ chế **khoanh vùng (Zone-Scoped Filtering)** để không làm lag trình duyệt.

---

## 2. Kiến trúc 5 Tầng Không gian Đa Tỷ lệ (L0 → L4) Chống Lag Toàn quốc

Nguyên tắc cốt lõi: **Tải dữ liệu tỷ lệ thuận với mức thu phóng (Zoom) và Vòng khoanh đang kích hoạt**, tuyệt đối không đẩy hàng trăm nghìn đối tượng địa lý lên trình duyệt cùng lúc.

| Tầng | Phạm vi Zoom | Cơ chế Khoanh vùng & Nguồn dữ liệu | Trạng thái Triển khai |
| :--- | :--- | :--- | :--- |
| **L0 — Vĩ mô Toàn quốc & Lưu vực** | Zoom 5 – 9 | Danh mục 63 tỉnh/thành (`vietnam-directory.js`), lưới khí tượng/AQI Open-Meteo, ảnh **Radar Mưa RainViewer API** phủ toàn lãnh thổ. | **Đã vận hành (Live)** |
| **L1 — Vòng Khoanh Động (2–20 km)** | Zoom 11 – 15 | Động cơ **`/zone-osm`** trên Cloudflare Edge Worker + KV Cache (TTL 24h) & Overpass API: tự động nạp **bệnh viện, phòng khám, trạm cứu hỏa, trụ sở trú ẩn và sông/kênh thoát nước thực tế** gọn trong bán kính khoanh của bất kỳ xã/phường nào. | **Triển khai ngay (v3)** |
| **L2 — Điểm nóng & Hành lang Kiểm chứng** | Zoom 13 – 17 | Bảo toàn 60 điểm + 18 hành lang Đông Ngạc, đồng thời mở rộng kho **Điểm nóng & Hành lang Thiên tai Đa đô thị (`vietnam-verified-hotspots.js`)** cho Hà Nội, TP.HCM, Đà Nẵng, Huế, Hội An, Vinh, Hạ Long, Lào Cai/Sa Pa, Đà Lạt, Cần Thơ, Cà Mau, Nha Trang, Quy Nhơn, Hải Phòng. | **Triển khai ngay (v3)** |
| **L3 — Phân tích Vi mô Tọa độ Chạm** | Zoom 15 – 19 | **Spot Inspector**: chạm bất kỳ điểm nào trên lãnh thổ Việt Nam để truy xuất tức thì cao độ mặt đất vệ tinh Copernicus DEM GLO-30 (m), khoảng cách tới điểm rủi ro & cơ sở y tế gần nhất, vẽ mặt cắt địa hình 4 km và so sánh tuyến đường OSRM + Turf.js. | **Triển khai ngay (v3)** |
| **L4 — Hạ tầng Dữ liệu Mở Quốc gia** | Đa tỷ lệ | Vector Tiles chuẩn **PMTiles** lưu trên Cloudflare R2 (ranh giới 10.000+ xã/phường, thủy hệ quốc gia), viễn thám **Sentinel-1 SAR** phát hiện vùng ngập định kỳ, chỉ mục không gian **Supabase PostGIS `ST_DWithin`** và đồng bộ hồ sơ kiểm định từ mạng lưới Nhà nghiên cứu (Phần 2). | **Lộ trình 2026–2027** |

---

## 3. Lộ trình Triển khai Theo Giai đoạn

### Giai đoạn 1 — Bàn Điều hành Chuyên nghiệp & Động cơ Chi tiết Vùng Khoanh (Phiên bản hiện tại)
- **Giao diện Tổ chức (Institutional Split GIS Workbench):** Trên màn hình máy tính, bản đồ đa lớp hiển thị ngay 100% ở khung nhìn đầu tiên bên cạnh bảng điều hành chỉ số, biểu đồ mưa 24 giờ và danh sách điểm trong vùng; loại bỏ hoàn toàn kiểu thẻ pastel và đánh số `1. / 2. / 3.` thiếu chuyên nghiệp.
- **Đa lớp Nền & Chuyên đề:** Chuyển đổi mượt mà giữa **Bản đồ Phố OSM**, **Ảnh Vệ tinh Esri World Imagery**, **Bản đồ Địa hình OpenTopoMap** cùng các lớp bật/tắt **Radar mưa**, **Hành lang ngập/sạt lở**, **Thủy hệ sông/kênh**, **Hạ tầng Y tế & Cứu hộ OSM**.
- **Kho Dữ liệu Kiểm chứng Đa đô thị + KV Overpass Edge:** Khi khoanh bất kỳ đô thị lớn hay thị trấn nào trên cả nước, bản đồ đều có điểm mốc y tế/cứu hộ, mạng lưới sông/kênh và hành lang/điểm nóng thực địa có trích nguồn minh bạch (`OBSERVED_DATA`).

### Giai đoạn 2 — Vector Tiles Không máy chủ (PMTiles) & Không gian PostGIS Đầy đủ (Quý tiếp theo)
1. **Biên dịch ranh giới hành chính cấp Xã/Phường toàn Việt Nam sang `.pmtiles`** bằng Tippecanoe và lưu trên **Cloudflare R2** (phục vụ truy vấn theo HTTP Range-Request chỉ tốn vài chục KB mỗi lần pan/zoom).
2. **Kích hoạt chỉ mục GIST trên PostgreSQL + PostGIS (`db/supabase-vietnam-platform.sql`)**: truy vấn `ST_DWithin(geom::geography, ST_MakePoint(lng, lat)::geography, radius_m)` cho hàng trăm nghìn điểm dữ liệu nghiên cứu, tuyến đê kè và đa giác ngập lịch sử với độ trễ `< 25 ms`.
3. **Chuẩn hóa Nhập liệu Khoa học (Phần 2):** Cho phép Nhà nghiên cứu tải lên `LineString` (hành lang sạt lở/ngập đường) và `Polygon` (vùng trũng ngập) kèm siêu dữ liệu ISO 19115 / phân loại nhận thức luận bắt buộc (`OBSERVED_DATA`, `SATELLITE_DATA`, `MODELLED_DATA`, `SIMULATED_DATA`).

### Giai đoạn 3 — Viễn thám SAR Ngập lụt & Kết nối Trạm Đo Thực thời (6–18 tháng)
1. **Pipeline ảnh Radar xuyên mây Sentinel-1 SAR:** Tự động trích xuất mặt nạ nước dâng bất thường theo lưu vực sông (Sông Hồng, Hương, Thu Bồn, Vũ Gia, Mê Kông) trong mùa mưa bão, gắn nhãn rõ `SATELLITE_DATA` và ngưỡng sai số đô thị.
2. **Liên thông trạm đo mưa tự động & cảnh báo KTTV chính thống:** Tích hợp nguồn đo mưa công khai (Vrain / NCHMF RSS/API hợp tác) với dữ liệu kiểm chứng cộng đồng (`≥ 3` xác nhận độc lập) nhằm thu hẹp độ trễ từ lúc mưa lớn đến khi cảnh báo người dân xuống dưới **5 phút**.
3. **Chuẩn OpenAPI & Tải Dữ liệu Nghiên cứu Mở:** Xuất GeoJSON/CSV theo từng vùng khoanh có chữ ký nguồn gốc, giấy phép mở (`ODbL` / `CC-BY 4.0`) phục vụ trường đại học, viện nghiên cứu và cơ quan phòng chống thiên tai địa phương.
