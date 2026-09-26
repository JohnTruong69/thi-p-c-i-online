# Phase 1: điều hướng theo tác vụ và lời gói Wedding

## Thay đổi
- Gom sidebar desktop thành Tổng quan và bốn nhóm tác vụ có nhãn cha vẫn bấm được: Kế hoạch, Thiệp, Khách, Khác.
- Hiển thị các trang con đúng nhóm, có icon, thụt cấp và trạng thái đang mở rõ; bỏ hoàn toàn bốn shortcut rời.
- Giữ nguyên năm tab mobile; bổ sung lối rõ từ các màn chính tới buổi lễ, ngân sách, công bố và phản hồi.
- Viết lại `/plans` ngắn, dễ quét: chuẩn bị miễn phí trước, giá 149.000 đ cho một đám cưới, trả một lần, 24 tháng từ xác minh, không gia hạn/tái thu; nêu rõ quyền công bố/QR, tối đa ba link, 50 ảnh và RSVP công khai.
- Rà `/checkout`, Tài khoản và toàn bộ nội dung để giá, thời hạn, trạng thái demo nhất quán; không dùng “trọn đời” hoặc “vĩnh viễn”.

## Kiểm tra
- Kiểm mọi liên kết và trạng thái active của sidebar desktop bằng bàn phím/click.
- Kiểm mobile 320/375/420 có đúng năm tab và tìm được các trang con.
- Chạy luồng xem trước → công bố thiệp → đơn minh họa ở mobile/desktop, kiểm không tràn.
- Chạy TypeScript và đọc kết quả build cuối; báo đúng HEAD cuối.

## Giới hạn
- Chỉ Phase 1 frontend demo; không đổi giá, công thức, chính sách, dữ liệu hay các luồng đã QA.
- Không thêm backend, Sales Page, mẫu thiệp, nhạc hoặc Phase 2.
