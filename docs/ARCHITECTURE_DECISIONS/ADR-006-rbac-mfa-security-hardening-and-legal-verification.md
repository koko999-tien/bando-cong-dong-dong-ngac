# ADR-006: Phân quyền RBAC 5 Vai trò, Vá lỗ hổng Tin cậy & Trung thực Pháp lý

- **Trạng thái:** Accepted (Lõi RBAC & bản vá khẩn triển khai ngay ở Milestone 1; IdP + MFA triển khai ở Milestone 2)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** Cybersecurity Engineer / CTO

## Bối cảnh
Kiểm toán mã nguồn phát hiện lỗ hổng nghiêm trọng `SEC-01` (`api/community.js:411`): bất kỳ người dùng ẩn danh nào gửi chuỗi `reporterRole` chứa `"nhóm khảo sát thực địa"` đều được tự động gán `confidenceTier: 'A'` và `status: 'approved'` mà không cần xác thực. Đồng thời hệ thống đang dùng 1 `ADMIN_PASSCODE` dùng chung không có RBAC/MFA/thu hồi phiên, fallback secret cứng `'humg-fallback-secret'`, thiếu rate-limit chống brute-force `admin_login`, thiếu `CSP`/`X-Frame-Options`/`Permissions-Policy`, và tuyên bố tuân thủ Luật BVDLCN 91/2025/QH15 khi chưa có hồ sơ DPIA.

## Quyết định
1. Triển khai ngay ma trận **RBAC 5 vai trò phân phạm vi vùng** (`citizen`, `field_verifier`, `researcher`, `ward_operator`, `super_admin`) tại `platform/security/rbac.js` và bộ kiểm định nhị phân/tốc độ tại `platform/security/validators.js`.
2. Vá ngay trên nhánh nâng cấp `api/community.js` (chỉ cho phép Hạng A khi có xác thực hợp lệ, bỏ fallback secret ở production, kiểm tra magic bytes ảnh JPEG, giới hạn tốc độ đăng nhập/gửi báo cáo), `server.mjs` (sửa ranh giới `path.sep`) và `vercel.json` (bổ sung headers bảo mật an toàn).
3. Chuyển sang IdP có MFA bắt buộc + cookie `HttpOnly` ở Milestone 2.
4. Ngừng tuyên bố "đã tuân thủ đầy đủ pháp lý" cho tới khi hoàn thiện DPIA, kênh liên hệ xóa dữ liệu chính thức và thẩm định pháp chế (Milestone 8).

## Hệ quả
- **Tích cực:** Đóng ngay các lỗ hổng leo thang tin cậy và brute-force trước khi mở rộng cộng đồng; tạo nền tảng bảo mật kiểm toán được cho cơ quan/nhà trường.
- **Đánh đổi:** Nhân sự khảo sát thực địa từ M2 trở đi sẽ cần đăng nhập tài khoản `field_verifier` thay vì chỉ chọn văn bản trong dropdown.
