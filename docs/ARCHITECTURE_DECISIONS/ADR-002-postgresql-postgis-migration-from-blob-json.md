# ADR-002: Chuyển đổi lưu trữ lõi từ Vercel Private Blob JSON sang PostgreSQL 16 + PostGIS + pgvector

- **Trạng thái:** Proposed (Chờ Chủ dự án cấp tài khoản Supabase/Neon Free Tier ở Milestone 2)
- **Ngày:** 27/11/2026
- **Người ra quyết định:** Data Engineer / CTO

## Bối cảnh
Kiểm toán production ngày 27/11/2026 chỉ ra `GET /api/community` mất **`1.750 ms`** do quét `listAllBlobsWithPrefix('')` (tới 5.000 blobs) và đọc song song từng tệp JSON (`N+1`). Hơn nữa, thao tác ghi `config/live-pulse.json`, `config/moderation.json`, `config/audit-log.json` thực hiện đọc–sửa–ghi không có khóa nguyên tử (race condition mất dữ liệu khi nhiều người báo ngập đồng thời), không có chỉ mục không gian và không thể mở rộng lên Bắc Từ Liêm/Hà Nội.

## Các phương án đã cân nhắc
1. **Tiếp tục dùng Vercel Blob JSON:** Không đáp ứng được ACID, spatial query và hiệu năng ở quy mô >200 báo cáo.
2. **Firestore / MongoDB:** Hỗ trợ JSON tốt nhưng năng lực phân tích không gian GIS (Buffer mét, Intersection, ST_ClusterDBSCAN, chuyển hệ tọa độ PROJ, Raster) thua xa PostGIS.
3. **PostgreSQL 16 + PostGIS + pgvector (kèm Object Storage riêng cho ảnh/GeoTIFF):** Chuẩn vàng toàn cầu cho GIS, hỗ trợ đầy đủ ACID, chỉ mục `GIST`, phân vùng time-series và tìm kiếm vector RAG trong cùng một cơ sở dữ liệu.

## Quyết định
Chọn **Phương án 3: PostgreSQL 16 + PostGIS + pgvector**, kết hợp Upstash Redis cho cache/rate-limit và Cloudflare R2 (hoặc Supabase Storage) cho tệp nhị phân (ảnh đã xóa EXIF, GeoTIFF, PMTiles).

## Hệ quả & Kế hoạch chuyển đổi an toàn
- **Tích cực:** Giảm độ trễ truy vấn không gian xuống `< 180 ms`, loại bỏ hoàn toàn mất dữ liệu đồng thời, sẵn sàng cho 50.000+ đối tượng toàn Hà Nội và OGC API cho QGIS.
- **Đánh đổi:** Cần thiết lập tài khoản DB ngoài Vercel (có Free Tier `$0` để khởi đầu) và chạy script di chuyển dữ liệu có kiểm chứng checksum trước khi chuyển đổi production.
