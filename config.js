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
   * 1. URL Web App Google Apps Script sau khi triển khai tệp `community-backend.gs`
   * Ví dụ: 'https://script.google.com/macros/s/AKfycb.../exec'
   * Để trống '' nếu đang chạy thử nghiệm cục bộ (dữ liệu lưu trên localStorage trình duyệt).
   */
  communityApiUrl: '',

  /**
   * 2. Các đường link Google Forms tạo tự động từ `google-forms-generator.gs`
   * Để trống '' nếu chưa tạo (Web sẽ giữ nút ở trạng thái gợi ý).
   */
  preTestFormUrl: '',
  drillQuizFormUrl: '',
  postTestFormUrl: '',

  /**
   * 3. Link rút gọn Bitly chính thức của nhóm để tạo mã QR nhất quán trên toàn Web & Cẩm nang PDF
   */
  bitlyMapUrl: 'https://bit.ly/bando-dongngac-humg',

  /**
   * 4. Cấu hình vùng khảo sát & ngưỡng tin cậy cộng đồng
   */
  defaultRadiusKm: 2.0,
  autoPromoteConfirmThreshold: 3, // >= 3 người dân độc lập xác nhận -> tự nâng Hạng C lên Hạng B
  duplicateMergeRadiusMeters: 50, // Tự động gộp báo cáo trùng loại trong bán kính 50 m
  enableRateLimitSeconds: 20 // Giới hạn tối thiểu 20 giây giữa 2 lần gửi báo cáo từ cùng thiết bị
};
