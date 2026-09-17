# Bản vá bảo mật 2026-09-17

Đã sửa luồng nạp tiền, checkout, khuyến mãi, liên kết Google, phiên đăng nhập và HTML thông báo. Giữ nguyên tài khoản admin hệ thống được hardcode.

## Triển khai

1. Cài dependency bằng `npm ci` trong mỗi thư mục backend và frontend, rồi chạy `npm run build` ở từng thư mục. Commit cả hai lockfile cùng mã nguồn để giữ đúng phiên bản đã vá.
2. `npm start` only runs the reviewed additive security migration and push notification setup. It never runs automatic schema push. For direct `node dist/index.js` startup or development on an existing database, run `npm run db:migrate-security` first. Initialize a new empty database explicitly before starting the application.
3. Migration thêm `users.token_version` và bảng `payment_webhook_events`, không thay số dư hay đơn hàng. Lần đầu chạy sẽ vô hiệu hóa các link reset/xác minh email cũ có khả năng đã xuất hiện trong log. Người dùng cần yêu cầu link mới. Migration chạy lại không xóa các link mới.
4. JWT cũ của tài khoản trong database sẽ bị từ chối; người dùng đăng nhập lại. Logout, đổi/reset mật khẩu và admin đổi mật khẩu sẽ thu hồi các phiên của tài khoản đó.
5. Thay khóa webhook từng ngân hàng và khóa SePay chung nếu đã sử dụng. Đồng bộ khóa mới giữa cấu hình shop và SePay. Bản vá không tự đổi khóa trên hệ thống thanh toán bên ngoài. Không đưa giá trị khóa vào log hay commit.

## Hành vi thanh toán

- Webhook bắt buộc có `Authorization: Apikey ...`. Không cấu hình khóa sẽ trả 503, không cộng tiền.
- Chỉ nhận giao dịch `transferType: in`, số tiền nguyên dương, tài khoản nhận trùng tài khoản của yêu cầu nạp, đúng số tiền và yêu cầu còn pending trong 2 giờ. Giao dịch không khớp cần đối soát thủ công.
- Khóa được chọn theo ngân hàng của yêu cầu nạp, không theo trường `gateway` do request gửi lên. Cách này cũng tránh nhầm giữa tên ngân hàng trong shop và tên nhà cung cấp.
- ID sự kiện được lưu với ràng buộc duy nhất cùng transaction cập nhật số dư. Retry hợp lệ không cộng tiền thêm.
- Checkout gộp dòng sản phẩm trùng, kiểm tra giới hạn mua/ngày, tồn kho, thời hạn và lượt dùng khuyến mãi trong cùng transaction. Lỗi ghi sổ sẽ hoàn tác cả đơn, hàng và số dư.
- Việc gọi dịch vụ cấp key checkpass diễn ra sau khi transaction thanh toán hoàn tất. Nếu dịch vụ cấp key lỗi, đơn được giữ để xử lý giao key theo luồng pending hiện có.

Định dạng webhook và header được đối chiếu với [tài liệu SePay](https://docs.sepay.vn/tich-hop-webhooks.html).

## Kiểm thử

Chạy `npm test` trong backend: 19 kiểm thử hồi quy dùng HTTP local và SQLite tạm, có kiểm tra request đồng thời, hoàn tác khi ghi sổ lỗi, thu hồi JWT, liên kết Google và migration chạy lặp. Không dùng database thật hoặc gửi giao dịch thanh toán thật.

Chạy `npm audit` ở cả hai thư mục để kiểm tra lại dependency tại thời điểm triển khai. `esbuild` được override lên nhánh đã vá cho công cụ Drizzle; lệnh xuất schema và build đã được kiểm tra với override này. Nodemailer không còn được sử dụng nên đã được gỡ.

## Startup correction (2026-09-18)

Production startup no longer runs `drizzle-kit push --force`, including on startup errors. It only runs the additive security migration and push notification setup. Initialize a new empty database explicitly; do not run schema push against an existing production database. The added regression test starts the real server against a legacy SQLite database and checks that user IDs, password hashes, and balances survive.

Lost user rows require a Turso point-in-time recovery or verified backup; deploying this code alone cannot restore them.
