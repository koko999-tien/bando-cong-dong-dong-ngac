# DANH MỤC DỮ LIỆU KHOA HỌC & SIÊU DỮ LIỆU 12 TRƯỜNG (DATA CATALOG)

Tài liệu này lập danh mục đầy đủ mọi tập dữ liệu đang sử dụng (hiện trạng Cấp 1) và dự kiến tích hợp (Cấp 2–4), đáp ứng đúng chuẩn **12 trường siêu dữ liệu bắt buộc** và **6 lớp dữ liệu nhận thức luận** đã định nghĩa tại [DATA_ARCHITECTURE.md](file:///C:/Users/TIEN%20PC/.gemini/antigravity/scratch/hanoi-flood-gis/docs/DATA_ARCHITECTURE.md).

---

## 1. Bảng tổng hợp các tập dữ liệu hiện có & dự kiến

| ID | Tên tập dữ liệu | Lớp dữ liệu bắt buộc | Độ phân giải | Tần suất cập nhật | Trạng thái |
|---|---|---|---|---|---|
| `ds-humg-baseline-60` | 60 điểm rủi ro & an toàn nền HUMG – Đông Ngạc | `OBSERVED_DATA` | Điểm GPS (±5–15 m) | Theo đợt thực địa | Đang vận hành (`VERIFIED`) |
| `ds-humg-corridors-18` | 18 hành lang đường & ngõ ngập xác thực OSM | `OBSERVED_DATA` | Đường tuyến OSM (m) | Theo sự kiện/quý | Đang vận hành (`VERIFIED`) |
| `ds-copernicus-dem-glo30` | Mô hình bề mặt số vệ tinh Copernicus DEM GLO-30 | `SATELLITE_DATA` | ~30 m (1 arcsec); lưới hiện tại 25×25 (~160 m bước lưới) | Tĩnh (phiên bản ESA) | Đang vận hành (`PARTIAL` — đang trích lưới thô 25×25) |
| `ds-era5-2024-2026` | Chuỗi tái phân tích khí hậu ECMWF ERA5 (2024–2026) | `MODELLED_DATA` | ~0,25° (~28 km) | Hàng tháng/năm | Đang vận hành (`VERIFIED`) |
| `ds-openmeteo-forecast` | Dự báo thời tiết giờ & 7 ngày Open-Meteo | `FORECAST_DATA` | ~1–11 km (ICON/GFS/IFS blend) | 15–60 phút | Đang vận hành (`VERIFIED`) |
| `ds-openmeteo-cams-aqi` | Chất lượng không khí Open-Meteo CAMS (PM2.5, PM10, AQI, UV) | `MODELLED_DATA` | ~10–40 km (CAMS Global) | Hàng giờ | Đang vận hành (`VERIFIED`) |
| `ds-rainviewer-radar` | Ảnh radar mây mưa toàn cầu RainViewer | `SATELLITE_DATA` | Ô ảnh radar (giới hạn zoom ≤ 7 bản miễn phí) | 10 phút (2h quá khứ) | Đang vận hành (`PARTIAL` — giới hạn free tier) |
| `ds-community-reports-live` | Báo cáo cư dân, `+1` xác nhận & Live Check-in 6h | `COMMUNITY_REPORTS` | Điểm GPS (làm tròn riêng tư ~11–20 m) | Thời gian thực (6h TTL cho live) | Đang vận hành (`PARTIAL` — cần chuyển PostGIS) |
| `ds-flood-scenario-sim` | Mô phỏng kịch bản nhạy cảm ngập (mưa 30 / 70 / >115 mm) | `SIMULATED_DATA` | Lưới suy diễn từ DEM 30m + 18 hành lang | Theo thao tác người dùng | Đang vận hành (`PARTIAL` — bắt buộc tách nhãn mô phỏng) |
| `ds-openaq-ground` | Trạm quan trắc không khí mặt đất OpenAQ | `OBSERVED_DATA` | Theo vị trí trạm cố định | 15–60 phút | Kế hoạch Milestone 3 |
| `ds-sentinel2-ndvi-ndwi` | Chỉ số cây xanh (NDVI), mặt nước (NDWI), đô thị hóa (NDBI) Sentinel-2 | `SATELLITE_DATA` | 10 m | 5 ngày (lọc mây) | Kế hoạch Milestone 4 |
| `ds-landsat-lst` | Nhiệt độ bề mặt đất (LST) Landsat 8/9 & Sentinel-3 | `SATELLITE_DATA` | 30 m (resampled) / 100 m nhiệt | 8–16 ngày | Kế hoạch Milestone 4 |

---

## 2. Hồ sơ chi tiết 12 trường siêu dữ liệu & Đánh giá khoa học

### 2.1 `ds-copernicus-dem-glo30` — Copernicus DEM GLO-30 (`SATELLITE_DATA`)
1. **Tên:** ESA Copernicus DEM GLO-30 (trích xuất vùng ĐH Mỏ - Địa chất 2 km)
2. **Nguồn:** European Space Agency (ESA) / Airbus, truy xuất qua Open-Meteo Elevation API
3. **Giấy phép:** Copernicus DEM Open License (miễn phí, cho phép sử dụng thương mại và nghiên cứu có trích dẫn)
4. **Thời điểm thu thập gốc:** Dữ liệu radar TanDEM-X (2011–2015), phát hành bản hiệu chỉnh GLO-30
5. **Thời điểm cập nhật hệ thống:** 27/11/2026 (`dem-grid-2km.js`)
6. **Hệ tọa độ:** `EPSG:4326` (ngang WGS84), độ cao EGM2008
7. **Độ phân giải không gian:** Gốc ~30 m (1 arcsecond); tệp hiện tại `dem-grid-2km.js` lấy mẫu lại thành lưới `25×25` (bước lưới ~160 m × 170 m trên vùng `21.054–21.091°N, 105.754–105.794°E`)
8. **Phạm vi không gian:** Vùng vuông 4 × 4 km bao phủ bán kính 2 km quanh HUMG
9. **Độ phân giải thời gian:** Tĩnh (không cập nhật theo ngày)
10. **Phương pháp xử lý:** Lấy mẫu lưới 625 điểm qua API + nội suy song tuyến tính (`sampleDemBilinear`)
11. **Mức độ tin cậy:** `medium` cho địa hình tương đối vĩ mô; **`low` cho vi địa hình ngõ hẹp**
12. **Những hạn chế đã biết (CỰC KỲ QUAN TRỌNG):**
    - Đây là **DSM (Digital Surface Model)** chứ không phải **DTM (Digital Terrain Model)** — bị ảnh hưởng bởi chiều cao mái nhà cao tầng, tán cây và công trình mới tại đô thị dày đặc như Đông Ngạc, Cổ Nhuế.
    - Sai số độ cao đứng tuyệt đối ~±2–4 m tại khu dân cư đông đúc; bước lấy mẫu lưới 25×25 (~160 m) làm mất chi tiết hố ga, gờ đường và dốc ngõ.
    - **Kết luận khoa học bắt buộc:** Copernicus DEM GLO-30 **KHÔNG THỂ tự nó xác định độ sâu ngập thực tế ở từng con ngõ** và không thay thế dữ liệu hệ thống cống thoát nước hay mô hình thủy lực 1D/2D. Nó chỉ được dùng để nhận diện xu thế địa hình tương đối kết hợp lịch sử ngập và thực địa.

### 2.2 `ds-era5-2024-2026` — ECMWF ERA5 Climate Archive (`MODELLED_DATA`)
1. **Tên:** Chuỗi tái phân tích khí hậu ECMWF ERA5 khu vực Đông Ngạc (2024–2026)
2. **Nguồn:** Copernicus Climate Change Service (C3S) / ECMWF ERA5 qua Open-Meteo Archive API
3. **Giấy phép:** Copernicus License (CC BY 4.0 / C3S Terms)
4. **Thời điểm thu thập gốc:** 01/01/2024 – 20/11/2026
5. **Thời điểm cập nhật hệ thống:** 26/11/2026 (`humg-data.js`)
6. **Hệ tọa độ:** `EPSG:4326` (tâm điểm lưới truy xuất `21.0725°N, 105.7739°E`)
7. **Độ phân giải không gian:** ~0,25° × 0,25° (~28 km × 28 km)
8. **Phạm vi không gian:** Toàn khu vực Tây Bắc nội đô Hà Nội (đại diện nền khí hậu vĩ mô vùng)
9. **Độ phân giải thời gian:** Tổng hợp ngày → tháng → năm từ chuỗi giờ ERA5
10. **Phương pháp xử lý:** Trích xuất thống kê ngày ≥35°C, cảm nhận ≥40°C, ngày mưa ≥50 mm và tổng lượng mưa tháng
11. **Mức độ tin cậy:** `high` cho xu thế khí hậu vùng; `medium` cho đỉnh mưa cực đoan cục bộ
12. **Những hạn chế đã biết:**
    - Lưới ~28 km làm **trơn hóa (smooth out)** các trận mưa giông đối lưu hẹp (có thể chênh đáng kể với trạm đo mưa đặt trực tiếp tại phường Đông Ngạc, ví dụ bão số 4 tháng 8/2026 trạm cục bộ có thể khác giá trị trung bình ô lưới).
    - Không phản ánh hiệu ứng vi khí hậu trong từng hẻm bê tông hay dưới tán cây công viên.

### 2.3 `ds-openmeteo-cams-aqi` — Open-Meteo CAMS Air Quality (`MODELLED_DATA`)
1. **Tên:** Dữ liệu Chất lượng Không khí Toàn cầu CAMS (PM2.5, PM10, US AQI, UV)
2. **Nguồn:** ECMWF Copernicus Atmosphere Monitoring Service (CAMS) qua Open-Meteo Air Quality API
3. **Giấy phép:** CC BY 4.0 / Copernicus Open Access
4. **Thời điểm thu thập:** Liên tục theo giờ
5. **Thời điểm cập nhật:** Thời gian thực (gọi trực tiếp từ client; Milestone 2 chuyển qua Backend Redis Cache 15 phút)
6. **Hệ tọa độ:** `EPSG:4326`
7. **Độ phân giải không gian:** ~0,1°–0,4° (~10–40 km, toàn cầu)
8. **Phạm vi không gian:** Toàn cầu (hỗ trợ sẵn mọi vùng Cấp 1–4)
9. **Độ phân giải thời gian:** Theo giờ (hourly) + dự báo 4–5 ngày
10. **Phương pháp xử lý:** Truy xuất trực tiếp giá trị tại tâm vùng / điểm chọn và phân loại ngưỡng US EPA AQI (`classifyUsAqi`)
11. **Mức độ tin cậy:** `medium` cho xu thế ô nhiễm nền đô thị; `low` cho ô nhiễm cục bộ sát công trường/nút giao thông
12. **Những hạn chế đã biết:** Là dữ liệu **mô hình hóa (`MODELLED_DATA`)**, không phải trạm cảm biến đo tại chỗ; dễ đánh giá thấp các đỉnh bụi mịn PM2.5 cực đoan mùa nghịch nhiệt ở Hà Nội nếu chưa đối chiếu với trạm mặt đất OpenAQ/EPA (`OBSERVED_DATA`).

### 2.4 `ds-openmeteo-forecast` — Open-Meteo Weather Forecast (`FORECAST_DATA`)
1. **Tên:** Dự báo thời tiết đa mô hình Open-Meteo (mưa, nhiệt độ, nhiệt độ cảm nhận, UV, gió)
2. **Nguồn:** Open-Meteo Forecast API (tổng hợp NOAA GFS, DWD ICON, ECMWF IFS)
3. **Giấy phép:** CC BY 4.0 (phi thương mại trên bản miễn phí; cần gói thương mại nếu khai thác thương mại/lưu lượng lớn)
4. **Thời điểm thu thập:** Theo các chu kỳ chạy mô hình khí tượng (00Z/06Z/12Z/18Z)
5. **Thời điểm cập nhật:** Liên tục (cache khuyến nghị 10–15 phút tại backend)
6. **Hệ tọa độ:** `EPSG:4326`
7. **Độ phân giải không gian:** ~1–11 km tùy mô hình thành phần
8. **Phạm vi không gian:** Toàn cầu (sẵn sàng cho Cấp 1–4)
9. **Độ phân giải thời gian:** Theo giờ (24h–168h) và theo ngày (7 ngày)
10. **Phương pháp xử lý:** Chuẩn hóa JSON theo múi giờ `Asia/Bangkok`
11. **Mức độ tin cậy:** `medium`–`high` cho 24–48 giờ; giảm dần sau 72 giờ
12. **Những hạn chế đã biết:** Lượng mưa đối lưu nhiệt đới ở Hà Nội có tính bất định cao về vị trí và thời điểm; **không thay thế bản tin cảnh báo thiên tai chính thức của Trung tâm Dự báo KTTV Quốc gia (NCHMF)**.

### 2.5 `ds-humg-baseline-60` & `ds-humg-corridors-18` (`OBSERVED_DATA`)
1. **Tên:** Bộ điểm rủi ro/an toàn nền (60 điểm) & 18 hành lang đường ngập khu vực HUMG – Đông Ngạc
2. **Nguồn:** Tổng hợp có trích dẫn từ OpenStreetMap (`osm:way/*`, `osm:node/*`), báo chí chính thống có ngày đăng (VnExpress, Tuổi Trẻ, Lao Động, Kinh tế & Đô thị, HSDC) và khảo sát thực địa Đề tài 08 HUMG
3. **Giấy phép:** Dữ liệu hạ tầng OSM theo `ODbL 1.0`; dữ liệu tổng hợp & khảo sát cộng đồng theo `CC BY 4.0`
4. **Thời điểm thu thập:** 2024–2026
5. **Thời điểm cập nhật:** 27/11/2026 (`humg-data.js`)
6. **Hệ tọa độ:** `EPSG:4326` (hỗ trợ quy đổi `EPSG:32648` UTM 48N)
7. **Độ phân giải không gian:** Điểm GPS ±5–15 m; tuyến polyline theo tim đường OSM
8. **Phạm vi không gian:** Bán kính 2,0 km quanh HUMG (`21.072514°N, 105.773870°E`)
9. **Độ phân giải thời gian:** Theo sự kiện ngập và đợt khảo sát thực địa
10. **Phương pháp xử lý:** Chuẩn hóa schema, loại bỏ hoàn toàn các trường tự bịa (`depthCm`, `tempC`), kiểm toán chất lượng tự động (`auditPointsQuality` — 0 lỗi)
11. **Mức độ tin cậy:** `high` (Hạng A & B)
12. **Những hạn chế đã biết:** Mới phủ bán kính 2 km quanh HUMG; chưa bao phủ toàn Bắc Từ Liêm/Hà Nội; một số điểm dựa trên báo chí lịch sử cần được đội thực địa tái kiểm tra sau các dự án nâng cốt đường hoặc cải tạo kênh thoát nước (ví dụ dự án kênh tiêu Thụy Phương / Phố Viên).

### 2.6 `ds-community-reports-live` (`COMMUNITY_REPORTS`) & `ds-flood-scenario-sim` (`SIMULATED_DATA`)
- **`COMMUNITY_REPORTS`:** Nguồn từ cư dân gửi qua Web/PWA (`submit_report`, `live_checkin`, `confirm_point`). Giới hạn rõ: có thể bị nhiễu, lệch mật độ theo khu vực đông người dùng mạng, chưa thay thế xác minh kỹ thuật cho đến khi được `field_verifier` hoặc `ward_operator` thẩm định Hạng A.
- **`SIMULATED_DATA`:** Lớp kịch bản mưa 30 / 70 / >115 mm dùng để diễn tập truyền thông và ước lượng mức độ nhạy cảm tương đối. Giới hạn rõ: **KHÔNG PHẢI dự báo ngập thực tế và KHÔNG phải kết quả mô phỏng thủy lực 2D SWMM/HEC-RAS**.
