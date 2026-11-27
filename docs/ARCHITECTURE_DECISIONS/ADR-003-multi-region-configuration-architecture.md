# ADR-003: Kiến trúc Đa khu vực 4 cấp điều khiển bằng Cấu hình (Configuration-Driven Multi-Region)

- **Trạng thái:** Accepted (Đã triển khai lõi ở Milestone 1: `platform/regions/region-registry.js`)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** GIS Scientist / Principal Architect

## Bối cảnh
Mã nguồn hiện tại gắn cứng tâm tọa độ `HUMG_CENTER`, phạm vi `MAX_GEOFENCE_METERS = 6500`, lưới `DEM_GRID_2KM` và danh bạ phường Đông Ngạc trực tiếp vào nhiều tệp (`api/community.js`, `api/ai-copilot.js`, `humg-data.js`, `app.js`). Điều này cản trở việc mở rộng sang Bắc Từ Liêm, Hà Nội và các địa phương khác.

## Quyết định
Thiết lập **Region Registry 4 cấp** (`platform/regions/region-registry.js`):
- **Cấp 1:** `vn-hn-dong-ngac-humg` (HUMG · Đông Ngạc · Cổ Nhuế · Đức Thắng)
- **Cấp 2:** `vn-hn-bac-tu-liem-uni` (Bắc Từ Liêm & cụm trường ĐH)
- **Cấp 3:** `vn-hn-city` (Toàn thành phố Hà Nội)
- **Cấp 4:** Hàm khởi tạo động `createRegionConfig(...)` cho phép bất kỳ địa phương nào khai báo ranh giới `bbox`, hệ tọa độ chiếu cục bộ (UTM/VN-2000), giới hạn geofence, nguồn dữ liệu và nhóm quản trị riêng mà không cần sửa logic lõi.

## Hệ quả
- **Tích cực:** Mọi API mới phân giải vùng từ `regionId` hoặc tọa độ (`resolveRegionForCoordinate`); hỗ trợ phân quyền RBAC theo từng vùng độc lập (`regionIds`).
- **Đánh đổi:** Cần di chuyển dần các hằng số hardcoded trong `app.js` và `api/*.js` sang đọc từ `RegionRegistry` theo từng milestone để không làm gián đoạn bản production hiện hành.
