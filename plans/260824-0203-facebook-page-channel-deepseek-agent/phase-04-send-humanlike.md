---
phase: 4
title: "Send API + hành vi giống người"
status: pending
priority: P1
effort: "1.5d"
dependencies: [2]
---

# Phase 4: Send API + hành vi giống người

> **Đã rework sau red-team 2026-08-24** (High H6, H7). Không viết lại quy tắc giống-người (đã có trong `buildSystemPrompt(forWorkflow=true)`); tái dùng contract structured JSON + `parseStructuredResponse`. `humanize-reply` rút gọn còn delay helper.

## Overview

Gửi trả lời lên Messenger qua Send API với hành vi đọc như người thật. Điểm sửa sau red-team: đường Zalo **đã** sinh trả lời dưới dạng **mảng segment JSON** (`[{type:'text'},{type:'image'}]`) và tự tách tin/paced-send. Page **tái dùng** đúng đường đó, không tự viết bộ tách/strip thứ hai (sẽ phá JSON → khách nhận raw `[{"type":"text"...`).

## Requirements

**Functional**
1. `PageSendService` hiện thực `ChannelSender.send({segments})` của Phase 1 — nhận **segment đã-parse**, gửi từng segment (text + **image**, giữ ảnh — red-team H7).
2. Gửi text: `POST /v25.0/{PAGE_ID}/messages` `{recipient:{id:PSID}, messaging_type:'RESPONSE', message:{text}}`. Gửi ảnh: attachment payload.
3. `sender_action`: `mark_seen` khi nhận, `typing_on` khi "gõ", `typing_off` trước gửi.
4. Trễ theo độ dài — **tái dùng** helper trích từ `WorkflowEngineService.ts:944` (`min(max(len*30,800),3000)`) thành một hàm dùng chung, thay vì viết `typingDelayMs` mới (red-team H6). Nhiễu ngẫu nhiên, có trần <20s (Meta tự tắt typing sau ~20s).
5. Tách nhiều tin: **dùng lại** cơ chế multi-segment sẵn có (dispatcher tách theo segment JSON, paced 600ms `:388`). Không thêm `splitIntoMessages` chạy trên chuỗi.
6. Cổng 24h: đọc `fb_page.last_customer_message_at`, quá 24h → **không gọi API**, đánh dấu thread cần người.
7. Ghi tin đã gửi vào unified `messages` (`channel='page'`, `is_sent=1`, `sent_by='ai'`), lưu `message_id` Send API trả (cho phân biệt echo ở Phase 3 C6).
8. Lỗi Meta: 613 (rate-limit)→lùi cấp số nhân; 190 (token)→dừng Page, `token_status`; 10/200 (quyền)→dừng, báo.

**Non-functional**
- Segment do model sinh qua `chatForWorkflow` đã **không** markdown/bullet (system prompt `AIAssistantService.ts:306-329` đã ép). Page path **không** cần strip lại.
- Trần trễ mỗi tin + cả lượt.

## Architecture

Đường trả lời Page tái dùng tối đa đường Zalo:

```
ChannelEvent(page) → dispatcher → provider.getHistory → AIAssistantService.chatForWorkflow (JSON array)
   → parseStructuredResponse → segments[]           ← ĐÃ có, dùng chung (aiUtils.ts:20)
   → ChannelSenderRegistry.pick('page') = PageSendService.send({segments})
        markSeen → for each segment: typing_on → chờ typingDelay(seg) → typing_off → gửi (text|image)
```

**Chỉ viết mới phần Messenger-đặc-thù:**
- `page-send-service.ts` (`ChannelSender.send`, `sender_action`, ánh xạ lỗi Meta)
- `messaging-window.ts` — `canSendNow(lastCustomerMessageAt, now)` thuần
- `typing-delay.ts` — helper trích chung từ `WorkflowEngineService:944` (dùng bởi cả Zalo lẫn Page)

Tag `HUMAN_AGENT` (7 ngày) **không dùng cho agent tự động** — chính sách Meta dành cho người thật. Ngoài 24h → chuyển hàng chờ người, không nới bằng tag. 3 tag `CONFIRMED_EVENT_UPDATE`/`ACCOUNT_UPDATE`/`POST_PURCHASE_UPDATE` chết 27/04/2026 — không dùng.

## Related Code Files

**Create**
- `src/services/facebook-page/page-send-service.ts`
- `src/services/facebook-page/messaging-window.ts`
- `src/services/facebook-page/typing-delay.ts` (dùng chung; refactor `WorkflowEngineService:944` gọi vào đây)
- `src/__tests__/messaging-window.test.ts`, `typing-delay.test.ts`

**Modify**
- `src/services/chat-agent/channel-sender-registry.ts` — đăng ký `'page'`
- `src/services/facebook-page/page-graph-client.ts` — `sender_action`, gửi ảnh
- `src/services/workflow/WorkflowEngineService.ts` — gọi `typing-delay` chung (khử trùng)

## Implementation Steps

1. `messaging-window.ts` + test (trong/biên/ngoài 24h, chưa có tin khách).
2. `typing-delay.ts` trích từ `WorkflowEngineService:944` + test trần; refactor caller cũ gọi vào.
3. `page-send-service.ts` hiện thực `ChannelSender.send({segments})`, cả text lẫn image.
4. `sender_action` + gửi ảnh vào graph client.
5. Chuỗi markSeen/typing/trễ/gửi từng segment.
6. Ánh xạ lỗi Meta → hành động.
7. Đăng ký registry; thử tay Page thật.

## Success Criteria

- [ ] Gửi text lên Messenger đúng danh nghĩa Page
- [ ] Segment ảnh (KB có URL) **đến được** khách, không bị drop/paste raw (red-team H7)
- [ ] Khách thấy "đang gõ" trước tin
- [ ] Trả lời nhiều ý → nhiều tin, không cắt giữa câu, không `**`/`- `/`#`
- [ ] **Không** tin nào chứa JSON thô `[{"type"` (red-team H6)
- [ ] Ngoài 24h → **0** lệnh gọi API, thread vào hàng chờ người
- [ ] Token hỏng → Page dừng gọn
- [ ] Tin gửi có trong `messages` (`channel='page'`, `sent_by='ai'`, có `message_id`)
- [ ] Test `messaging-window` + `typing-delay` xanh; Zalo vẫn dùng `typing-delay` chung không hồi quy

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Trễ mô phỏng làm khách chờ lâu | Trung bình | Trung bình | Trần cứng mỗi tin + cả lượt; cấu hình được |
| Meta coi tự động là spam | Thấp-TB | **Cao** | Chỉ trả lời trong 24h; không nhắn chủ động; giới hạn tần suất/thread |
| Rate limit nhiều thread cùng lúc | Trung bình | Trung bình | Hàng đợi gửi giới hạn đồng thời; lùi khi 613 |
| Refactor `typing-delay` chung làm lệch pacing Zalo | Thấp | Trung bình | Giữ đúng công thức `:944`; test Zalo |

**Giả định có thể vỡ:** rằng segment image của structured output map thẳng sang attachment Messenger.
**Dấu hiệu vỡ:** URL ảnh là local/data-URI không gửi được qua Send API (chỉ nhận URL công khai hoặc upload attachment).
**Phản ứng đã định:** upload ảnh qua attachment upload API lấy `attachment_id` rồi gửi; nếu ảnh local, bỏ qua segment ảnh + log. Ghi vào file này.
