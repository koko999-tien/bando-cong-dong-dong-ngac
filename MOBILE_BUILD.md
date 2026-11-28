# Hướng dẫn Đóng gói Ứng dụng Di động Android & iOS (Capacitor) — VN Resilience Atlas

Mã nguồn đã cấu hình sẵn [capacitor.config.json](capacitor.config.json) và script đóng gói sạch [scripts/prepare-mobile.mjs](scripts/prepare-mobile.mjs).

## 1. Đóng gói bản tĩnh Web vào `dist-mobile/`
```powershell
npm run mobile:prepare
```

## 2. Khởi tạo vỏ Native Android / iOS (Chạy 1 lần trên máy có Android Studio / Xcode)
```bash
npm install @capacitor/core @capacitor/cli @capacitor/geolocation @capacitor/push-notifications @capacitor/motion
npx cap add android
# Trên macOS nếu build iOS:
npx cap add ios
```

## 3. Đồng bộ code & mở IDE build `.apk` / `.aab`
```bash
npm run mobile:prepare && npx cap sync
npx cap open android
```

## 4. Quyền bắt buộc cần khai báo khi phát hành Store
- **Android (`AndroidManifest.xml`):** `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.
- **iOS (`Info.plist`):** `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription` (cho nút nói SOS rảnh tay).
- **Data Safety / NĐ 13/2023:** Liên kết trang chính sách `https://bando-cong-dong-dong-ngac.vercel.app/phap-ly.html` và nút tự xóa tài khoản tích hợp sẵn trong app.
