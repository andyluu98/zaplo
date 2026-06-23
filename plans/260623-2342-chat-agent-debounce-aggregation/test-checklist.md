# Checklist test thủ công — cơ chế Chat Agent (trong app sau khi build)

Phần này KHÔNG tự động test được vì dispatcher dính better-sqlite3 + Electron main process.
Test trong app thật (Zaplo) sau khi build. Tick từng case.

## A. Gom tin ngắt quãng (debounce 6s) — TÍNH NĂNG MỚI
- [ ] DM: gõ 3 tin liên tiếp (mỗi tin cách <6s): "chào shop" / "cho hỏi tí" / "giá thuê bao nhiêu"
      → AI trả lời **1 lần**, nội dung bám cả 3 mảnh (đặc biệt phải trả lời câu giá).
- [ ] DM: gõ 1 tin, chờ >6s → AI trả lời. Gõ tin nữa, chờ >6s → AI trả lời lần 2 (2 lượt riêng).
- [ ] DM: gõ tin mỗi 5s liên tục (4 tin) → AI chỉ trả lời 1 lần sau khi ngừng gõ 6s (reset đồng hồ).
- [ ] Group: tag "@agent" 1 lần rồi gõ tiếp 2 mảnh KHÔNG tag → gom cả 3, trả lời 1 lần.
- [ ] Group: gõ tin KHÔNG tag và KHÔNG có keyword → AI im (không mở buffer).

## B. Đính chính tên (strip self-mention) — đã fix commit 63a12cd
- [ ] Group: "@Esta Leasing chào bạn" → AI chào + trả lời, KHÔNG còn "mình là LMak không phải Esta Leasing".
- [ ] Tag người khác (không phải bot) → mention người đó giữ nguyên trong ngữ cảnh.

## C. Handoff người ↔ AI
- [ ] Khách nhắn → AI trả lời (🟢). Mình (chủ shop) gõ tay 1 câu → thread tự **pause** (🟡), AI ngừng.
- [ ] Đang pause vì human, chờ hết `autoresume_minutes` không ai nhắn → AI tự nhận lại (🟢).
- [ ] Tắt agent thủ công (⚪) → AI không trả lời gì.
- [ ] Bấm "giao lại cho agent" → AI hoạt động lại.
- [ ] Human gõ tay TRONG vòng 6s debounce (trước khi AI kịp flush) → AI **không** gửi (re-check pause).

## D. Chống lặp / echo / spam
- [ ] AI trả lời xong, tin self echo về → KHÔNG tự pause, KHÔNG trả lời lại.
- [ ] 2 tin khách tới gần như đồng thời → không bị trả lời đôi (processing lock).
- [ ] Trả lời nhiều đoạn (structured) → các đoạn gửi lần lượt, cách ~600ms; ảnh (nếu có) gửi đúng.

## E. Routing nhiều agent
- [ ] Thread được pin agent X → luôn agent X trả lời (ưu tiên cao nhất).
- [ ] Thread có label gắn agent Y → agent Y (khi không pin).
- [ ] Group có agent gán riêng → đúng agent đó.
- [ ] Thread không khớp gì → agent default trả lời (đúng scope DM/group, stranger-only nếu bật).

## F. Biên / kết nối
- [ ] Gửi sticker / ảnh không caption → AI bỏ qua (content rỗng).
- [ ] Tài khoản chưa kết nối → không lỗi, không trả lời.
- [ ] Agent chưa gán trợ lý (assistant) → bỏ qua, log cảnh báo.
- [ ] 2 tài khoản / chuyển workspace → buffer không lẫn; sau khi chuyển workspace AI vẫn trả lời (rehook + aggregator.clear).

## Ghi chú
- Debounce hiện cố định 6000ms (`DEBOUNCE_MS` trong `message-aggregator.ts`).
- Throttle chống loop hạ còn 2000ms (`MIN_REPLY_DELAY_MS` trong dispatcher).
