# ADR-004: Phân tách Nhận thức luận 6 Lớp Dữ liệu & Chuẩn 12 Trường Siêu dữ liệu

- **Trạng thái:** Accepted (Đã triển khai lõi ở Milestone 1: `platform/data/provenance-catalog.js`)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** Climate Risk Researcher / GIS Scientist

## Bối cảnh
Một nền tảng vừa hiển thị phản ánh cộng đồng, vừa dùng mô hình tái phân tích ERA5 (~28 km), vừa dùng mô hình chất lượng không khí CAMS (~10–40 km), vừa vẽ kịch bản mưa trên Copernicus DEM GLO-30 (30m DSM) có nguy cơ rất cao gây hiểu lầm khoa học nếu trộn lẫn các nguồn này trên cùng giao diện. Đặc biệt, tuyệt đối không được để người dùng hay nhà quản lý hiểu nhầm rằng DEM GLO-30 tự nó đo được độ sâu ngập cm trong từng con ngõ, hoặc kịch bản mô phỏng là dự báo chính thức.

## Quyết định
1. Cố định 6 lớp nhận thức luận không thể trộn lẫn: `OBSERVED_DATA`, `MODELLED_DATA`, `SATELLITE_DATA`, `FORECAST_DATA`, `COMMUNITY_REPORTS`, `SIMULATED_DATA`.
2. Bắt buộc mọi tập dữ liệu đăng ký trong hệ thống phải vượt qua bộ kiểm định `validateDatasetMetadata` đủ 12 trường siêu dữ liệu (kể cả `knownLimitations` không được để trống) trong CI.
3. Mọi câu trả lời API, thẻ bản đồ và phản hồi AI phải đi kèm nhãn lớp dữ liệu tương ứng.

## Hệ quả
- **Tích cực:** Bảo vệ tuyệt đối uy tín nghiên cứu khoa học, giúp nhà nghiên cứu thẩm định và tái lập kết quả, đồng thời giảm thiểu rủi ro pháp lý khi truyền thông thiên tai.
- **Đánh đổi:** Tăng nhẹ công sức khai báo siêu dữ liệu mỗi khi thêm nguồn dữ liệu mới (nhưng được tự động kiểm tra ngay trong CI).
