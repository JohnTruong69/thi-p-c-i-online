# Thiệp Cưới Online

Hãy tạo dự án mới “Thiệp Cưới Online Việt” và THỰC HIỆN CHỈ PHASE 1 của gói App Core đính kèm. Đây là website responsive cho cô dâu/chú rể Việt Nam. Product Structure V3 và Product Experience V2 đã khóa; file markdown và 5 bảng ảnh đính kèm là nguồn bắt buộc. Bảng 11 màn + hai bảng R/C có tổng cộng 23 ảnh authority. Đọc kỹ trước khi code.

Mục tiêu Phase 1: dựng design system và shell thật đẹp, toàn bộ route/màn UI theo inventory; desktop sidebar trái, mobile bottom navigation 5 mục Tổng quan/Kế hoạch/Thiệp/Khách/Khác, guest invitation/RSVP shell riêng. Dùng Be Vietnam Pro + Spectral, nền #F7F3EC, mực #203A45, đồng #985748, sage #DDE9DF. Lấy A04 và A18 ở mẫu UI mới trên bảng. Các màn R01-R06 và C01-C06 thay thế các ảnh V3 mâu thuẫn. Giữ câu chữ tiếng Việt tự nhiên, không nêu thanh toán ở màn bắt đầu.

Bắt buộc có 7 module V1: hồ sơ/Event; Planner chi tiết miễn phí; khách + CSV miễn phí; một mẫu thiệp Đường Hẹn cố định; phiên bản link/chọn tối đa ba link chung/nhà trai/nhà gái; RSVP công khai theo Event; gói/checkout/quyền và tài khoản/cộng tác/dữ liệu. Không có kho/chọn mẫu, nhạc hoặc editor kiểu Canva. Free dùng Planner/CSV/preview; Wedding 149.000đ một lần, tối đa 3 link, 50 ảnh, 24 tháng từ paidAt; không gia hạn. Checkout UI độc lập, không có Public Sales Page. Paid không tự công bố; chỉ link bật và đủ Event được công bố. Thể hiện link chung thiếu giờ Tiệc tối, nhà gái sẵn sàng, nhà trai tắt trong ví dụ. Phản hồi link chung cần chủ đối chiếu.

Phase 1 là FRONTEND/CONTRACTS: tạo routes, components, responsive layouts, form và UI states minh họa với dữ liệu DEMO được đánh dấu rõ; typed interfaces cho Wedding/Event/Task/Budget/Guest/CsvBatch/Invitation/Link/RSVP/Order/Payment/Entitlement. Navigation và thao tác UI cơ bản phải đi đúng màn; nếu chưa có API thật, không được giả là đã lưu/thanh toán/công bố thật. Không tạo database, Auth thực, SePay/webhook, Entitlement thực, quyền server, Sales Page hay phase 2-4. Trang admin/auth utility dùng cùng pattern nhưng ghi demo. Không publish production.

Hãy hoàn thành code Phase 1, tự kiểm tra route và bố cục trên mobile 375px + desktop, nêu đường preview, file thay đổi, phần nào là demo và sai lệch còn lại so với ảnh. EXECUTE PHASE 1 ONLY. STOP sau báo cáo để chủ sản phẩm review.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f44490ac-990f-43d8-b8be-2729eae21c14).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
