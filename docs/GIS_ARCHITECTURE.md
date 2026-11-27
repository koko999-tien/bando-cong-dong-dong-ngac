# KIẾN TRÚC NỀN TẢNG GIS CHUYÊN SÂU (GIS ARCHITECTURE)

## 1. Mục tiêu nâng cấp WebGIS

Chuyển đổi từ ứng dụng bản đồ điểm tĩnh (Leaflet + Turf.js chạy 100% trên trình duyệt cho 60 điểm) sang **Nền tảng WebGIS Nghiên cứu & Phân tích Không gian Đa quy mô**, vừa mượt trên điện thoại cấu hình thấp cho cư dân, vừa đủ năng lực xử lý hàng chục nghìn đối tượng vector và dữ liệu raster cho nghiên cứu chuyên nghiệp.

---

## 2. Đánh giá 20 năng lực GIS chuyên sâu & Lộ trình triển khai

| # | Năng lực GIS | Hiện trạng | Kiến trúc mục tiêu | Công cụ thực thi | Mốc triển khai |
|---|---|---|---|---|---|
| 1 | **Multi-layer GIS** | `PARTIAL` (lớp tĩnh JS) | Quản lý danh mục lớp theo `RegionConfig` + bật/tắt độc lập + thứ tự z-index + opacity + metadata 12 trường | MapLibre GL / Leaflet + PostGIS | M1–M3 |
| 2 | **Spatial Query** | `PARTIAL` (lọc JS 60 điểm) | Truy vấn không gian theo BBox, đa giác vẽ tay, hành chính, bán kính, thuộc tính & lớp dữ liệu | PostGIS (`ST_Intersects`, `ST_DWithin`, chỉ mục `GIST`) | M2 |
| 3 | **Spatial Intersection** | `PARTIAL` (route corridor) | Giao cắt tuyến đường/khu dân cư với vùng trũng, vùng ngập lịch sử, vùng thiếu bóng mát | PostGIS (`ST_Intersection`) + Turf.js client preview | M2–M4 |
| 4 | **Buffer Analysis** | `VERIFIED` (vòng tròn 2km, hành lang 125–165m) | Buffer đa bán kính (50m, 200m, 500m, 1–5km) theo điểm/tuyến với hệ tọa độ mét chuẩn (`EPSG:32648` / `geography`) | PostGIS `ST_Buffer(geog)` + Turf.js | M2 |
| 5 | **Heatmap** | `PARTIAL` (heat/cool canvas cơ bản) | Bản đồ mật độ điểm nóng ngập/nhiệt/phản ánh cộng đồng có trọng số theo thời gian & độ tin cậy | MapLibre WebGL `heatmap` layer / PostGIS density | M4–M5 |
| 6 | **Raster Processing** | `NOT IMPLEMENTED` (chỉ có lưới 25×25 JSON) | Xử lý GeoTIFF (DEM, Sentinel-2 NDVI/NDWI, Landsat LST) sang **COG (Cloud Optimized GeoTIFF)** + tile server | GDAL / Rasterio / TiTiler (Python Worker) | M4 |
| 7 | **Vector Processing** | `PARTIAL` (Turf.js cơ bản) | Chuẩn hóa hình học (`ST_MakeValid`), đơn giản hóa theo mức zoom (`ST_SimplifyPreserveTopology`), sinh **MVT/PMTiles** | PostGIS + Tippecanoe / Martin tile server | M4–M5 |
| 8 | **Terrain Analysis** | `PARTIAL` (chỉ lấy cao độ nội suy) | Tính độ dốc (Slope), hướng sườn (Aspect), chỉ số ẩm địa hình (TWI), nhận diện vùng trũng khép kín (Sinks) từ DEM/DTM | GDAL DEM + WhiteboxTools / QGIS Processing (Worker) | M4 |
| 9 | **Elevation Profile** | `VERIFIED` (mặt cắt DEM giữa 2 điểm) | Mặt cắt địa hình động dọc theo mọi tuyến đường vẽ tay hoặc tuyến điều hướng trên DEM độ phân giải cao nhất của vùng | PostGIS Raster / COG elevation sampler | M2–M4 |
| 10 | **Suitability Analysis** | `NOT IMPLEMENTED` | Tìm vị trí tối ưu đặt điểm trú ẩn/trạm bơm/không gian xanh tránh vùng trũng và gần khu dân cư đông | PostGIS + Python GeoPandas/Rasterio MCDA | M6 |
| 11 | **Spatial Clustering** | `PARTIAL` (quét trùng 50m) | Gom cụm không gian mật độ (`DBSCAN` / `HDBSCAN`) để phát hiện ổ ngập mới từ nhiều phản ánh rời rạc | PostGIS `ST_ClusterDBSCAN` + Supercluster trên client | M2–M4 |
| 12 | **Time-series Mapping** | `PARTIAL` (biểu đồ tháng 2026) | Thanh trượt thời gian (Time Slider) xem diễn biến mưa, ngập live, AQI, nắng nóng theo giờ/ngày/mùa/năm | PostGIS Time-series API + MapLibre animation | M5 |
| 13 | **Multi-Criteria Decision Analysis (MCDA)** | `PARTIAL` (Scorecard 3 trục A–D) | Khung trọng số minh bạch (AHP / Weighted Linear Combination) có tùy chỉnh trọng số & phân tích độ nhạy cho nghiên cứu | `platform/gis/mcda` + Python worker | M4–M6 |
| 14 | **Risk Mapping** | `PARTIAL` (chỉ số 0–100 cục bộ) | Bản đồ rủi ro đa hiểm họa chuẩn IPCC (`Hazard × Exposure × Vulnerability`), tách biệt rõ lớp dữ liệu đầu vào | PostGIS + MCDA Engine | M4–M6 |
| 15 | **Geospatial Statistics** | `PARTIAL` (đếm trong 2km) | Thống kê theo đơn vị hành chính (phường/tổ dân phố), tương quan không gian (Moran's I / Getis-Ord Gi* hotspot) | Python `PySAL` (`esda`) trong Analytical Worker | M6 |
| 16 | **Spatial Interpolation** | `PARTIAL` (song tuyến DEM) | Nội suy IDW / Kriging cho mật độ trạm mưa & trạm đo AQI mặt đất (ghi rõ sai số nội suy khi ít trạm) | Python `scipy` / `pykrige` (chỉ bật khi đủ mật độ trạm) | M6 |
| 17 | **Change Detection** | `NOT IMPLEMENTED` | Phát hiện biến động mảng xanh (NDVI), mặt nước (NDWI) và bê tông hóa (NDBI) theo năm từ Sentinel-2 | Google Earth Engine / Copernicus Data Space + GDAL | M6 |
| 18 | **Scenario Modelling** | `PARTIAL` (kịch bản mưa 30/70/115mm) | Tách rõ kịch bản trực quan nhạy cảm địa hình với mô phỏng thủy lực 1D/2D (tích hợp xuất/nhập kết quả SWMM / HEC-RAS từ nhóm nghiên cứu) | SWMM / HEC-RAS (external offline run) → nhập COG/GeoJSON vào nền tảng | M6–M7 |
| 19 | **Network Analysis** | `PARTIAL` (gọi OSRM demo server) | Phân tích khả năng tiếp cận (Isochrone 5/10/15 phút tới bệnh viện/nơi trú an toàn), độ đứt gãy mạng lưới đường khi các đoạn ngập bị khóa | Valhalla / OpenRouteService / Self-hosted OSRM | M5–M6 |
| 20 | **Risk-Aware Routing** | `PARTIAL` (né điểm ngập cục bộ qua OSRM) | Định tuyến đa tiêu chí né hành lang đang ngập (`avoid_polygons`), né nắng gắt khi đi bộ và ưu tiên điểm trú có mái che | OpenRouteService / Valhalla (`exclude_polygons`) + Cache Proxy | M5 |

---

## 3. Đánh giá chuyển đổi Thư viện Bản đồ: Leaflet vs MapLibre GL JS

| Tiêu chí | Leaflet `1.9.4` (Hiện tại) | MapLibre GL JS (Đề xuất cho M5) | Nhận định CTO |
|---|---|---|---|
| **Chi phí & Giấy phép** | Miễn phí (BSD-2-Clause) | Miễn phí (BSD-3-Clause), mã nguồn mở hoàn toàn | Cả hai đều 0 VNĐ, không khóa bản quyền như Mapbox GL v2+. |
| **Hiệu năng ở quy mô 60–500 điểm (Cấp 1)** | Rất nhẹ (~42 KB gzip), chạy mượt mọi máy cũ | Nặng hơn (~220 KB gzip), yêu cầu WebGL | Giai đoạn Cấp 1–2 đầu, Leaflet vẫn hoạt động tốt, không cần vội viết lại ngay. |
| **Hiệu năng ở quy mô 5.000–50.000 đối tượng (Cấp 3 — Hà Nội)** | Chậm rõ rệt khi vẽ nhiều polygon/polyline DOM/SVG | **Vượt trội nhờ WebGL + Vector Tiles (MVT / PMTiles)**, xoay/nghiêng 3D địa hình, heatmap mượt 60fps | **Bắt buộc chuyển sang MapLibre GL JS khi lên Cấp 3 (Hà Nội)** hoặc bật đa lớp raster/vector dày đặc. |
| **Chi phí chuyển đổi** | 0 giờ (đang chạy ổn định) | ~3–4 tuần kỹ thuật (viết lại layer/popup/interaction adapter + kiểm thử di động) | **Chiến lược tối ưu:** Đóng gói lớp trừu tượng `MapEngineAdapter` ở M1–M4; giữ Leaflet ổn định cho Cấp 1–2; chuyển sang MapLibre GL JS ở **Milestone 5** khi mở rộng toàn Hà Nội (xem [ADR-007](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/docs/ARCHITECTURE_DECISIONS/ADR-007-maplibre-gl-incremental-gis-evolution.md)). |

---

## 4. Hỗ trợ Định dạng Chuyên ngành & Khả năng Liên thông (Interoperability)

- **Xuất/Nhập trực tiếp trên Web:** `GeoJSON` (RFC 7946), `CSV` (kèm cột `lat,lng,crs,data_class,confidence_tier`), `KML` (Google Earth / Maps).
- **Hỗ trợ chuyên ngành GIS qua Backend Worker (`GDAL/OGR` — Milestone 4):** `GeoPackage (.gpkg)` (chuẩn mở OGC thay thế Shapefile cũ), `GeoTIFF / COG (.tif)`, `PMTiles`, `Shapefile (.zip)` (tương thích ngược cho cơ quan nhà nước/QGIS/ArcGIS).
- **Tích hợp trực tiếp QGIS:** Cung cấp endpoint **OGC API - Features** (read-only) và tệp dự án mẫu `.qgz` để sinh viên/giảng viên HUMG mở trực tiếp dữ liệu live của nền tảng trong QGIS mà không cần xuất tay.
- **Hệ tọa độ chuẩn hóa:** Lưu trữ lõi ở `EPSG:4326` (WGS84), tính toán khoảng cách/diện tích chính xác bằng `geography` hoặc chiếu động sang **UTM Zone 48N (`EPSG:32648`)**; hỗ trợ quy đổi **VN-2000** qua thư viện `PROJ` ở tầng Worker khi trao đổi dữ liệu với cơ quan tài nguyên môi trường địa phương.
