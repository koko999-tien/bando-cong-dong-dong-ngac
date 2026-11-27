# TẦM NHÌN CHIẾN LƯỢC — OPEN RESILIENCE INTELLIGENCE PLATFORM

## 1. Sứ mệnh & Chuyển dịch định vị

Dự án khởi đầu là **Bản đồ An toàn Cộng đồng Mở Phường Đông Ngạc · Khu vực Trường ĐH Mỏ - Địa chất (HUMG)**. Giai đoạn hiện tại đã chứng minh tính khả thi tại thực địa (60 điểm rủi ro/an toàn có trích dẫn, 18 hành lang đường ngập, giao diện di động 0 chồng lấp, live check-in 6 giờ).

Để đi xa thành một nền tảng công nghệ có khả năng triển khai thực tế nhiều năm, phục vụ đồng thời **cư dân — sinh viên — nhà nghiên cứu — cơ quan điều hành — nhà quy hoạch**, dự án được nâng cấp thành:

> **OPEN RESILIENCE INTELLIGENCE PLATFORM**  
> *Nền tảng Trí tuệ Không gian Mở phục vụ An toàn Cộng đồng, Thích ứng Biến đổi Khí hậu, Giám sát Môi trường và Điều hành Ứng phó Khẩn cấp.*

### 5 Trụ cột giá trị cốt lõi
1. **Trung thực khoa học (Scientific & Epistemic Integrity):** Tách bạch tuyệt đối 6 lớp dữ liệu (`OBSERVED`, `MODELLED`, `SATELLITE`, `FORECAST`, `COMMUNITY`, `SIMULATED`); không bao giờ đánh đồng kịch bản mô phỏng với dự báo hay số liệu đo đạc hiện trường.
2. **Đa vùng theo cấu hình (Configuration-Driven Multi-Region):** Không viết cứng tọa độ, địa danh, hay lưới DEM của một phường duy nhất vào lõi xử lý; có thể nhân bản sang phường/quận/tỉnh mới bằng gói cấu hình vùng và bộ dữ liệu chuẩn hóa.
3. **Đa hiểm họa đô thị (Multi-Hazard Urban Intelligence):** Bao phủ đồng bộ 6 mô-đun khoa học: Ngập úng (Flood), Nhiệt đô thị (Heat), Chất lượng không khí (Air Quality), Thời tiết cực đoan (Extreme Weather), Môi trường sống (Environmental) và Trí tuệ rủi ro cộng đồng (Community Risk).
4. **Hai tầng trải nghiệm (Progressive Disclosure):** Đơn giản 1 chạm cho cư dân/người cao tuổi khi mưa bão — đồng thời cung cấp WebGIS chuyên sâu, xuất dữ liệu mở, phân tích đa tiêu chí (MCDA) và truy vấn không gian cho nhà nghiên cứu & cán bộ điều hành.
5. **Mở, An toàn và Độc lập nhà cung cấp (Open, Secure, Vendor-Agnostic):** Không khóa cứng vào một nhà cung cấp AI hay một nền tảng lưu trữ; bảo mật theo chiều sâu (RBAC, MFA, audit log, mã hóa, tách quyền) và kiểm soát chi phí minh bạch theo từng giai đoạn tăng trưởng.

---

## 2. Kiến trúc mở rộng không gian 4 cấp (Spatial Scaling Tiers)

| Cấp độ | Mã vùng chuẩn | Phạm vi địa lý | Quy mô dữ liệu mục tiêu | Đơn vị quản trị |
|---|---|---|---|---|
| **Cấp 1 (Seed Living Lab)** | `vn-hn-dong-ngac-humg` | Cụm ĐH Mỏ - Địa chất · P. Đông Ngạc · Cổ Nhuế · Đức Thắng (~2–3,5 km) | 60–300 điểm thực địa, 18–50 hành lang đường, lưới DEM chi tiết | Nhóm nghiên cứu HUMG + Tổ dân phố / Ban chỉ huy PCTT phường |
| **Cấp 2 (District Cluster)** | `vn-hn-bac-tu-liem-uni` | Toàn bộ khu vực Bắc Từ Liêm & cụm các trường Đại học (HUMG, Học viện Tài chính, ĐH Tài nguyên & Môi trường, ĐH Công nghiệp, ĐH Y tế Công cộng) | 500–2.500 điểm, mạng lưới thoát nước & đường bộ toàn quận, trạm mưa/AQI tham chiếu | Liên trường Đại học + Trung tâm điều hành cấp quận/phường |
| **Cấp 3 (Metropolitan)** | `vn-hn-city` | Toàn thành phố Hà Nội (30 quận/huyện/thị xã lịch sử & các đơn vị hành chính phường/xã mới sau sắp xếp 2025) | 5.000–50.000 đối tượng không gian, vector tiles MVT/PMTiles, chuỗi thời gian nhiều năm | Viện nghiên cứu, cơ quan quản lý đô thị, mạng lưới cộng đồng toàn thành phố |
| **Cấp 4 (Multi-Locality Template)** | `custom-<country>-<slug>` | Bất kỳ tỉnh/thành phố hoặc đô thị ven biển/đồng bằng nào (Đà Nẵng, TP.HCM, Cần Thơ, Huế...) | Cấu hình động qua `RegionConfig` (ranh giới GeoJSON, CRS/UTM zone, nguồn khí tượng, danh bạ khẩn cấp, nhóm quản trị riêng) | Đối tác địa phương tự vận hành theo mô hình multi-tenant cô lập vùng |

Mỗi vùng triển khai đều sở hữu 10 khối dữ liệu chuẩn hóa độc lập:
1. Ranh giới hành chính (`admin_boundaries`)
2. Dữ liệu địa hình (`dem_sources` — ghi rõ DSM hay DTM, độ phân giải, sai số đứng)
3. Dữ liệu hạ tầng (`infrastructure`: trường học, bệnh viện, trạm bơm, cống thoát, trạm điện, nhà chờ buýt)
4. Dữ liệu khí tượng (`meteorology`: trạm đo nếu có, reanalysis ERA5, forecast Open-Meteo)
5. Dữ liệu môi trường (`environment`: không gian xanh, mặt nước, bề mặt không thấm, AQI)
6. Điểm & hành lang rủi ro (`hazard_features`)
7. Điểm an toàn & trú ẩn (`safe_assets` phân biệt có mái che / y tế / ngoài trời)
8. Dữ liệu phản ánh cộng đồng (`community_reports` & `live_checkins`)
9. Chuỗi thống kê theo thời gian (`time_series_metrics`)
10. Chính sách quản trị & danh bạ khẩn cấp riêng (`governance_policy`, `emergency_directory`)

---

## 3. Khung 6 Mô-đun Khoa học (Đánh giá khả thi trước khi triển khai)

Không triển khai hình thức: mọi mô-đun đều phải công khai nguồn dữ liệu, độ phân giải, tần suất cập nhật và giới hạn khoa học.

| Mô-đun | Câu hỏi khoa học & thực tiễn | Nguồn dữ liệu khả thi hiện tại (Chi phí 0 / Thấp) | Nguồn nâng cao (Giai đoạn mở rộng) | Giới hạn phải công khai |
|---|---|---|---|---|
| **A. Flood Intelligence** | Khu vực/tuyến đường nào nhạy cảm ngập theo địa hình & lịch sử mưa? Tuyến nào đang ngập lúc này? | Copernicus DEM GLO-30 (30m DSM), OSM road/waterways, báo chí & thực địa xác thực, Open-Meteo mưa giờ, RainViewer radar, cộng đồng live 6h | LiDAR DTM ≤1m, dữ liệu trạm đo mưa tự động (VRAIN/KTTV), Sentinel-1 SAR phân tích vệt nước, mô hình thủy lực 1D/2D (SWMM/HEC-RAS) | DEM 30m DSM chỉ phản ánh tương quan địa hình vĩ mô, không thể tự suy ra độ sâu ngập cm trong ngõ hẹp; cần dữ liệu cống và đo đạc hiện trường. |
| **B. Heat Intelligence** | Đợt nắng nóng cực đoan xảy ra khi nào? Khu vực nào thiếu bóng mát và điểm làm mát gần nhất ở đâu? | Open-Meteo nhiệt độ không khí, nhiệt độ cảm nhận (Heat Index), UV; ERA5 lịch sử 2024–2026; OSM công viên/mặt nước/mái che | Landsat 8/9 & Sentinel-3 LST (nhiệt độ bề mặt đất 30m–1km), NDVI từ Sentinel-2 (10m), cảm biến WBGT hiện trường | Nhiệt độ không khí mô hình ~10–28 km khác với nhiệt độ bức xạ bề mặt nhựa đường (LST) và khác vi khí hậu dưới tán cây. |
| **C. Air Quality Intelligence** | Chỉ số PM2.5, PM10, AQI hiện tại và xu hướng theo giờ/mùa ra sao? | Open-Meteo CAMS Global (~10–40 km, miễn phí, cập nhật hàng giờ) | OpenAQ API (trạm quan trắc mặt đất chính thức & cộng đồng), Sentinel-5P TROPOMI (NO₂, SO₂, CO), mạng cảm biến chuẩn hiệu chỉnh | CAMS là dữ liệu mô hình hóa toàn cầu (`MODELLED`), độ phân giải thô; không đại diện riêng cho một nút giao thông cụ thể nếu thiếu trạm mặt đất (`OBSERVED`). |
| **D. Extreme Weather Intelligence** | Sắp có mưa dông, gió giật, mưa lớn kéo dài hay nắng nóng cực đoan trong 1–72 giờ tới không? | Open-Meteo Forecast (WMO weather codes, precipitation, gusts, CAPE), RainViewer radar (2h quá khứ) | Nguồn cảnh báo chính thức KTTV Quốc gia (NCHMF / CAP RSS nếu được cấp quyền), ảnh mây vệ tinh Himawari-9 | Dữ liệu forecast toàn cầu có sai số định vị đối lưu cục bộ (mưa rào dông hẹp); cảnh báo chính thức bắt buộc dẫn nguồn cơ quan chức năng. |
| **E. Environmental Intelligence** | Tỷ lệ không gian xanh, mặt nước, mức bê tông hóa và hạ tầng dễ tổn thương biến động thế nào theo năm? | OSM landuse/natural/waterways, thống kê hạ tầng nhạy cảm (trường học, ký túc xá, bệnh viện, trạm biến áp) | Sentinel-2 NDVI/NDWI/NDBI (10m, miễn phí qua Copernicus Data Space / GEE), bản đồ sử dụng đất địa phương | OSM có độ phủ không đồng đều giữa nội thành và ngoại thành; cần kiểm chứng chéo với ảnh vệ tinh Sentinel-2. |
| **F. Community Risk Intelligence** | Người dân đang gặp sự cố gì ở đâu, độ tin cậy bao nhiêu, xu hướng theo sự kiện ra sao? | Form báo cáo GPS + ảnh, live check-in 6h, bình chọn `+1` độc lập, quy trình kiểm duyệt hạng A/B/C | Xác minh ảnh AI + đối chiếu vị trí/thời tiết thực tế + mạng lưới tình nguyện viên xác minh hiện trường (`field_verifier`) | Phản ánh cộng đồng có độ lệch không gian (tập trung nơi đông sinh viên/cư dân dùng mạng); phải gắn rõ nhãn `COMMUNITY REPORTS` và mức tin cậy. |

---

## 4. Thước đo thành công dài hạn (3 năm)

- **Năm 1 (Nền tảng vững & Cấp 1–2):** 100% kiến trúc đa vùng + PostgreSQL/PostGIS + RBAC/MFA + AI Provider Layer + CI/CD; vận hành ổn định cụm Bắc Từ Liêm & 5 trường Đại học; đạt bộ dữ liệu thực địa chuẩn hóa phục vụ công bố khoa học & báo cáo đề tài.
- **Năm 2 (Mở rộng Hà Nội & Nghiên cứu chuyên sâu):** Phủ dữ liệu toàn TP. Hà Nội với Vector Tiles, tích hợp Sentinel-2/OpenAQ, API mở cho nhóm nghiên cứu và kết nối thử nghiệm với ít nhất 2–3 đơn vị quản lý cấp phường/trường học.
- **Năm 3 (Nền tảng mở tái sử dụng quốc gia):** Tối thiểu 3 địa phương ngoài Hà Nội tự triển khai bản sao độc lập từ bộ cấu hình chuẩn (`RegionConfig`) với chi phí hạ tầng bền vững và cộng đồng đóng góp mã nguồn mở.
