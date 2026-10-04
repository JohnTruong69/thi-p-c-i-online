- [x] Đọc gói xây, đặc tả trải nghiệm và 5 bảng ảnh authority.
- [x] Dựng hệ màu/chữ, shell desktop/mobile/khách và hợp đồng typed.
- [x] Tạo toàn bộ route Phase 1, trạng thái demo và liên kết thao tác.
- [x] Kiểm tra mobile 320/375/420px và desktop, ghi sai lệch còn lại.
- [x] QA Phase 1: sửa C04, chuỗi preview → gói → đơn → tình huống công bố, RSVP theo từng Event và chữ hoàn tiền.
- [x] Kiểm tra desktop/mobile, hai Event và ghi mã phiên bản cho chủ duyệt.
- [x] QA NEEDS_FIX 27/09: Ngân sách chi tiết, ngôn từ, nội dung thiệp, CSV, Event/RSVP, bộ lọc khách và dữ liệu xuyên trang trên 320/375/420/desktop.

- [x] QA cuối Phase 1: tiền phát sinh, Home, số khách, CSV, RSVP chọn từng buổi, Event phiên trong form; kiểm 320/375/420/desktop.
- [x] QA liên kết Event Phase 1: cảnh báo và xử lý tham chiếu khi bỏ buổi, mẫu việc hợp lệ, kiểm mobile/desktop.
- [x] Phase 1: giới hạn hai người quản lý, mời/rút quyền minh họa, ma trận quyền, dữ liệu demo và QA các cỡ màn.
- [x] Phase 1 ngân sách: chi tiết nhóm Khác, nhãn buổi dễ hiểu, phân cấp tổng hợp; kiểm form, số liệu và 320/375/420/desktop.
- [x] Phase 1 điều hướng và gói Wedding: nhóm sidebar theo tác vụ, copy /plans và checkout nhất quán; QA desktop/mobile.

- [x] QA copy cuối Phase 1: sửa ngôn từ /plans và /checkout; kiểm TypeScript, build, mobile/desktop.

## Phase 2 (đợt 1)
- [x] Logic thuần + test: CSV, 43 việc gợi ý, đối chiếu phản hồi, trạng thái đơn, độ sẵn sàng link.
- [x] CSV thật trong trình duyệt: chọn file/mẫu, ghép cột, xem 100 dòng, quyết định từng dòng, thêm + hoàn tác.
- [x] Thư viện 43 việc gợi ý (chỉ thêm khi chọn); đối chiếu phản hồi + cập nhật tay; trạng thái đơn minh họa.
- [x] Đổi ngày có xem tác động; sửa việc/khách; ảnh xem trước ≤50; 3 phiên bản link + kiểm tra sẵn sàng; xem lại trước công bố; so sánh thay đổi sau gửi; Admin demo; adapter + test.

- [x] Phase 2 QA blockers: CSV paging, safe undo, shared link selector, per-Event RSVP, photos in preview, readiness=address
- [x] Phase 2 planner: honest due/status and Home data, table-count outcome and guarded legacy task migration.
- [x] Phase 2 task follow-up: single due phrase, selectable table-count kind, 14-day upcoming filter, scoped legacy migration and QA.

## Phase 3 slice 1
- [x] Backend foundation: auth, schema/RLS, onboarding, real Events, couple invite
- [x] Fix broken SettingsScreen JSX; clean TeamPanel screen; tsgo/build/vitest; browser route check

## Phase 3 slice 2a
- [x] Persist Planner: tasks (template id, assignee, table count), budget (payer/Khác/paid/deposit/extra/schedule/cap), server money checks
- [x] Event date impact review (per-task consent) + transactional Event removal with links
- [x] Pure + DB tests; browser create/edit/reload 375px + desktop

## Phase 3 slice 2b
- [x] Guests/CSV/export persisted, Home guest summary real, DB + browser checks

## Phase 3 slice 3
- [x] Đường Hẹn invitation persisted: content, private photos ≤50, 3 links, readiness/orphans, revisions + diff, publish denied without entitlement, neutral public page; DB + browser checks
- [x] Real RSVP per Event (public gated submit/receipt, idempotent, edit rule, owner reconcile, audit, CSV undo keeps matched guests) + 10 MB photo limit + public meta cleanup
- [ ] Phase 3 remaining: account data export/delete, email delivery checks (confirm/reset/invite)

## Phase 3 family viewers
- [x] Up to 2 read-only family viewers: migration 0011 (grants, hashed invites, projection), team UI, /view routes, DB + browser QA
- [x] Phase 3: trial / read-only write gate staged OFF (migration 0012, service-role activation only, QA-verified)
- [ ] ~~Activate write gate for real weddings — blocked on verified checkout/payment continuation~~ → **hủy**: app chuyển sang miễn phí, không thu phí

## Pivot 2026-10: app miễn phí, kiếm tiền bằng affiliate
- [x] GĐ A — Xóa thiệp online + thu phí: 16 routes (invitation/i.$token/checkout/plans/publish/rsvp/admin), InvitationReal/RsvpReal, lib invitation*/rsvp*, AccessStateBanner → WriteButton thuần, contracts/viewers tinh gọn, migration 0013 (drop 9 bảng + bucket invitation-photos + functions/triggers; sửa undo_guest_batch, export_wedding_data, viewer modules bỏ 'rsvp'); đóng PR #6 (SePay checkout, không merge)
- [x] GĐ B — Nền tảng affiliate: migration 0014 (affiliate_vendors/products/clicks/admins, RPC track_affiliate_click/is_affiliate_admin/affiliate_click_stats, RLS; code unique xuyên 2 bảng), lib affiliate.ts, component AffiliateLink + AffiliateBadge (nhãn "Liên kết tiếp thị"), route /r/$code redirect có tracking, route /admin quản lý vendor/sản phẩm/thống kê click; sửa lỗi tsc còn sót từ GĐ A (import phase2d trong PhaseTwo.tsx, xóa Order demo khỏi phase2.ts); types.ts bổ sung thủ công (đồng bộ khi regen sau khi apply 0014)
- [x] GĐ C — Tích hợp Planner: "Mua ở đây" trong ngân sách, gợi ý vendor trong 43 việc mẫu, nhãn "Liên kết tiếp thị" (PR #9, 2026-10-04)
- [ ] GĐ D — Danh bạ nhà cung cấp, Trăng mật (Booking/Agoda/Mytour/ACCESSTRADE), Blog SEO (tùy chọn sau)
