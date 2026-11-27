/**
 * CẤU HÌNH TRUNG TÂM DỰ ÁN BẢN ĐỒ CỘNG ĐỒNG MỞ PHƯỜNG ĐÔNG NGẠC — ĐH MỎ - ĐỊA CHẤT (ĐỀ TÀI 08)
 * Nhóm chỉ cần điền 1 lần các đường link Google Apps Script / Google Forms / Bitly vào tệp này trước khi đẩy lên GitHub Pages hoặc Cloudflare Pages.
 */

export const PROJECT_CONFIG = {
  projectName: 'Bản đồ Cộng đồng Mở — Khu vực ĐH Mỏ - Địa chất (P. Đông Ngạc)',
  shortName: 'Bản đồ Đông Ngạc',
  organization: 'Nhóm sinh viên Đề tài 08 · Trường Đại học Mỏ - Địa chất (HUMG)',
  contactNote: 'Liên hệ chỉnh sửa hoặc yêu cầu xóa dữ liệu: gửi email/Zalo tới nhóm phụ trách Đề tài 08 (cập nhật email nhóm tại config.js).',

  /**
   * 1. Endpoint API đám mây mặc định (Vercel Serverless Function + Private Blob Storage tại Singapore)
   * Tự động đồng bộ thời gian thực mọi lượt bấm +1, điểm mới, cảnh báo và khảo sát của cư dân toàn vùng!
   */
  communityApiUrl: '/api/community',

  /**
   * 2. Các biểu mẫu Khảo sát tích hợp trực tiếp ngay trên Web (không bắt người dân chuyển sang tab ngoài)
   */
  preTestFormUrl: './khao-sat.html?tab=pre',
  drillQuizFormUrl: './index.html?drill=1',
  postTestFormUrl: './khao-sat.html?tab=post',

  /**
   * 3. Link công khai chính thức (Vercel HTTPS hoặc link rút gọn Bitly sau khi nhóm tạo trên bitly.com)
   */
  bitlyMapUrl: 'https://bando-cong-dong-dong-ngac.vercel.app',

  /**
   * 4. Cấu hình vùng khảo sát & ngưỡng tin cậy cộng đồng
   */
  defaultRadiusKm: 2.0,
  autoPromoteConfirmThreshold: 3, // >= 3 người dân độc lập xác nhận -> tự nâng Hạng C lên Hạng B
  duplicateMergeRadiusMeters: 50, // Tự động gộp báo cáo trùng loại trong bán kính 50 m
  enableRateLimitSeconds: 20 // Giới hạn tối thiểu 20 giây giữa 2 lần gửi báo cáo từ cùng thiết bị
};
