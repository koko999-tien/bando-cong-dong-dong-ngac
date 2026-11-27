# ADR-007: Lộ trình tiến hóa WebGIS từ Leaflet sang MapLibre GL JS theo từng giai đoạn

- **Trạng thái:** Accepted (Áp dụng cho lộ trình M1–M5)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** GIS Scientist / Frontend Architect

## Bối cảnh
Leaflet `1.9.4` đang vận hành nhẹ, ổn định cho 60 điểm và 18 tuyến đường của Cấp 1 (Đông Ngạc – HUMG). Tuy nhiên khi mở rộng lên Cấp 3 (toàn TP. Hà Nội với 5.000–50.000 đối tượng vector, nhiều lớp raster vệ tinh, heatmap động và vector tiles PMTiles/MVT), cơ chế render DOM/SVG của Leaflet sẽ gặp nút thắt khung hình trên điện thoại.

## Các phương án đã cân nhắc
1. **Giữ mãi Leaflet:** Tốt cho giai đoạn nhỏ nhưng sẽ giật lag ở quy mô thành phố và thiếu hỗ trợ Vector Tiles / WebGL heatmap mượt.
2. **Đập bỏ viết lại ngay sang MapLibre GL JS trong Milestone 1:** Rủi ro cao làm chậm tiến độ khắc phục bảo mật & DB (những nút thắt thực sự cấp bách hơn hiện nay là Vercel Blob `1.750 ms` và RBAC/PostGIS).
3. **Chuyển đổi theo giai đoạn (Incremental Evolution):** Giữ Leaflet ổn định suốt M1–M4 (Cấp 1–2), chuẩn bị dữ liệu PostGIS & Vector Tiles ở M2–M4, sau đó chuyển sang **MapLibre GL JS (BSD-3-Clause, 0 VNĐ)** cùng quá trình modular hóa TypeScript ở Milestone 5.

## Quyết định
Chọn **Phương án 3: Tiến hóa từng bước sang MapLibre GL JS ở Milestone 5**, ưu tiên dồn nguồn lực ngay bây giờ cho tầng Dữ liệu (PostGIS), Bảo mật (RBAC/MFA) và Đa vùng.

## Hệ quả
- **Tích cực:** Không gây gián đoạn sản phẩm đang chạy; chi phí chuyển đổi được kiểm soát; tới lúc chuyển sang MapLibre thì hạ tầng Vector Tiles (PMTiles/MVT) từ PostGIS đã sẵn sàng phát huy tối đa sức mạnh WebGL.
- **Đánh đổi:** Duy trì lớp tương thích giao diện dữ liệu GeoJSON chung trong giai đoạn chuyển tiếp.
