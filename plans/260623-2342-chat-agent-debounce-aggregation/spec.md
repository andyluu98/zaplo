# Spec — Chat Agent: gom tin (debounce) + ma trận test cơ chế chat

**Ngày:** 2026-06-23
**Branch:** claude/infallible-rhodes-5fc65a
**Trạng thái:** Approved (design + debounce 6000ms)

## Vấn đề

Dispatcher hiện xử lý từng tin độc lập. Chốt duy nhất là `MIN_REPLY_DELAY_MS = 8000`:
sau 1 lần AI trả lời, mọi tin tới trong 8s bị **drop, không trả lời** (không gom).

Khách hỏi ngắt quãng (gõ nhiều mảnh liên tiếp) → AI trả lời mảnh đầu, **bỏ qua các mảnh
sau**, câu quan trọng có thể không được trả lời tới khi khách gõ thêm tin sau 8s.
Nội dung không mất (vẫn trong history DB) nhưng AI không chủ động rep các mảnh bị drop.

Thêm: AI hay "đính chính tên" thay vì trả lời — đã fix bằng `stripSelfMentions` (commit 63a12cd),
nhưng chưa build vào app đang chạy.

## Mục tiêu

1. Thêm **debounce gom tin**: chờ khách im 6s, gom các mảnh thành 1 lượt, AI trả lời 1 lần.
2. Lập **ma trận test đầy đủ** cho cơ chế chat; tự động hóa phần test được, liệt kê phần
   phải test thủ công trong app.

## Thiết kế

### Đơn vị mới: `src/services/chat-agent/message-aggregator.ts`

Class thuần, KHÔNG phụ thuộc DB/Electron → test được bằng jest fake timers.

```
DEBOUNCE_MS = 6000  // cửa sổ im lặng trước khi flush

enqueue(key: string, fragment: string, onFlush: (combined: string) => void): void
  - push fragment vào buffer[key]
  - clear timer cũ, set timer mới = DEBOUNCE_MS
  - khi timer fire: combined = buffer[key].join('\n').trim();
                    xóa buffer[key] + timer[key];
                    nếu combined không rỗng → onFlush(combined)

hasPending(key: string): boolean   // buffer[key] đang có mảnh chờ?
clear(key?: string): void          // hủy timer + buffer (1 key, hoặc tất cả khi workspace switch)
```

Quy tắc:
- Tin mới trước khi hết giờ → reset đồng hồ (debounce thật, không phải throttle).
- Mỗi thread 1 buffer + 1 timer độc lập.
- Giữ thứ tự mảnh, nối bằng `\n`.
- Flush mà combined rỗng/whitespace → KHÔNG gọi onFlush.

### Dispatcher đổi luồng (`chat-agent-dispatcher.ts`)

`onMessage` giữ NGUYÊN các cổng (bỏ self, stripSelfMentions, bỏ rỗng, routing chọn agent,
auto-resume, pause-check, group-gate). Khác biệt:

- Mảnh ĐẦU của thread (`!aggregator.hasPending(key)`) trong GROUP phải qua group-gate
  (@mention/keyword) mới mở buffer.
- Mảnh tiếp theo khi `hasPending(key)` đã true → gom luôn dù không tag lại
  (người tag 1 lần rồi gõ tiếp chi tiết).
- Thay `await this.reply(...)` bằng `aggregator.enqueue(key, content, combined => this.reply(..., combined))`.
- `reply()` (flush callback): re-check pause (phòng human vừa giành thread) → nếu vẫn active → gửi.
- Throttle: hạ `MIN_REPLY_DELAY_MS` 8000 → 2000 (nhỏ hơn debounce → không drop flush bình
  thường), chỉ còn vai trò chốt chống loop. `aiSentKeys` (chống echo) + `processing` lock giữ nguyên.
- `rehook()`/workspace switch: gọi `aggregator.clear()` để hủy mọi timer treo.

### Phản hồi phân đoạn (đã có, giữ nguyên)

`sendResult` parse structured response → gửi từng segment (text/ảnh), cách nhau 600ms.
Test path này nằm trong checklist thủ công (cần api thật).

## Ma trận test

### Đã có (36 test pure): routing 12, decision 6, auto-resume 6, group-trigger 6, strip-mention 6.

### Thêm mới — aggregator (jest fake timers):
1. 1 tin → flush sau 6s đúng nội dung
2. 3 tin <6s → gom thành 1, flush 1 lần (case chính)
3. tin cách >6s → 2 flush riêng
4. tin mới reset đồng hồ (4 tin mỗi 5s → 1 flush sau cùng)
5. gom giữ thứ tự, nối `\n`
6. nhiều thread độc lập
7. `hasPending` đúng trước/sau flush
8. flush xong buffer rỗng → tin sau mở lượt mới
9. `clear(key)` / `clear()` hủy timer (không flush)
10. flush combined rỗng/whitespace → không gọi onFlush

### Checklist test thủ công trong app (dispatcher dính sqlite+electron):
- echo self → bỏ, không pause
- human gõ tay → auto-pause (nếu bật)
- echo-guard chặn tự-pause sau khi AI vừa rep
- processing lock chống rep đôi
- segment reply nhiều đoạn + ảnh, cách 600ms
- not-connected / no-assistant → skip
- append current message vào history khi DB chưa kịp lưu
- group: tag 1 lần rồi gõ tiếp → gom đúng; không tag → không rep
- DM: gõ ngắt quãng → gom đúng
- 2 tài khoản / 2 workspace → buffer không lẫn

## Phạm vi (YAGNI)
- KHÔNG làm: per-agent cấu hình debounce (để hằng số module trước), media upload nâng cao.
- Build + bump version sau khi review xong (gồm cả fix strip-mention 63a12cd + UX commit trước).

## Câu hỏi mở
- Không có. (Debounce 6000ms đã chốt.)
