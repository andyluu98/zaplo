---
phase: 4
title: "Send API + hành vi giống người + đọc ảnh (vision)"
status: done
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 4: Send API + hành vi giống người + đọc ảnh (vision)

> **Đã rework sau red-team 2026-08-24** (High H6, H7). Không viết lại quy tắc giống-người (đã có trong `buildSystemPrompt(forWorkflow=true)`); tái dùng contract structured JSON + `parseStructuredResponse`. `humanize-reply` rút gọn còn delay helper.
>
> **Nâng cấp 2026-08-24 — Vision:** thêm khả năng agent **đọc ảnh khách gửi** rồi trả lời, dùng model mới `deepseek-v4-flash-vision-exp` (DeepSeek ra mắt, OpenAI-compatible, nhận `image_url` part, URL ngoài ≤8192 ký tự / ≤32MiB). Đây là lúc kích hoạt Page: đăng ký `PageContextProvider` + `PageSendService` vào registry (dispatcher đã chạy từ Phase 3, `pick('page')` đang trả null). Không restart dispatcher, không đụng Zalo.

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
6b. **Công bố bot** (counsel kongming 2026-08-24): dòng disclosure đầu hội thoại, có cờ bật/tắt per-Page, **mặc định BẬT** ít nhất khi app còn dưới App Review. Human-mimicry (typing/delay) + zero disclosure là lý do dễ bị Meta reject nhất + rủi ro chính sách ở vùng có luật (Meta nêu California/Đức). Bản thân typing/delay không vi phạm.
7. Ghi tin đã gửi vào unified `messages` (`channel='page'`, `is_sent=1`, `sent_by='ai'`), lưu `message_id` Send API trả (cho phân biệt echo ở Phase 3 C6).
8. Lỗi Meta: 613 (rate-limit)→lùi cấp số nhân; 190 (token)→dừng Page, `token_status`; 10/200 (quyền)→dừng, báo.

**Vision — đọc ảnh khách gửi (nâng cấp 2026-08-24)**
9. Khi khách gửi ảnh, webhook (Phase 3) đã lưu `messages.attachments` = JSON `[{type:'image',url}]`. `PageContextProvider.getHistory` trích URL ảnh của **các lượt user** trong cửa sổ ngữ cảnh vào `ChannelHistoryMessage.images?: string[]` (chỉ kênh Page; Zalo giữ nguyên content string → không hồi quy).
10. `AIAssistantService.chatForWorkflow`/`callLLM` dựng **multimodal content** OpenAI-compat `[{type:'text'},{type:'image_url',image_url:{url}}]` **chỉ khi** model là vision (`isVisionModel(model)`), nhánh OpenAI-compat. Model không-vision + Zalo → content vẫn string (byte-identical).
11. URL ảnh Meta CDN (https, ký + hết hạn ngắn) truyền thẳng dạng **external URL** (không tải/không base64) — reply chạy realtime nên URL còn hạn. Trần số ảnh mỗi lượt (`VISION_MAX_IMAGES`, mặc định 6, ảnh mới nhất trước) để chặn payload phồng.
12. **Thinking TẮT cho model vision** — DeepSeek chưa xác nhận vision-exp hỗ trợ `thinking`; gate `supportsThinking(platform, model)` trả false cho model vision để không phá request thử nghiệm. `wantThinking` ở dispatcher vẫn `channel==='page'`; việc tắt do gate model quyết, dispatcher không cần biết.
13. Model vision thêm vào 3 dropdown UI + được `normalizeModelName` giữ nguyên (không remap — là model thật). `isVisionModel` nhận cả hậu tố `-vision`/`-vision-exp` cho model tương lai.

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
- `src/services/ai/vision-support.ts` — `isVisionModel`, `extractImageUrls`, `buildMultimodalContent`, `VISION_MAX_IMAGES`
- `src/__tests__/messaging-window.test.ts`, `typing-delay.test.ts`, `vision-support.test.ts`

**Modify**
- `src/services/chat-agent/chat-agent-dispatcher.ts` — `registerChannels()` đăng ký `'page'` (provider+sender); truyền `images` từ history sang `chatForWorkflow`
- `src/services/facebook-page/page-graph-client.ts` — `sendText`, `sendImage`, `sendSenderAction`
- `src/services/workflow/WorkflowEngineService.ts` — gọi `typing-delay` chung (khử trùng)
- `src/services/ai/AIAssistantService.ts` — `chatForWorkflow`/`chat`/`callLLM` nhận `images?` mỗi message → multimodal content cho model vision; thinking gate theo model
- `src/services/ai/thinking-support.ts` — `supportsThinking(platform, model?)` tắt cho vision
- `src/services/ai/normalize-model-name.ts` — (không remap vision; chỉ nếu cần alias)
- `src/models/ai.ts` — `ChatMessage.images?: string[]`
- `src/services/chat-agent/channel-event.ts` — `ChannelHistoryMessage.images?: string[]`
- `src/services/chat-agent/channel-context/page-context-provider.ts` — getHistory trích ảnh
- `src/services/database/DatabaseService.ts` — cột `fb_page.bot_disclosure` (ALTER idempotent) + đọc lượt AI đầu thread
- 3 dropdown UI model (`AIAssistantDetailPage.tsx`, `NodeConfigPanel.tsx`, `IntroductionSettings.tsx`) — thêm `deepseek-v4-flash-vision-exp`

## Implementation Steps

1. `messaging-window.ts` + test (trong/biên/ngoài 24h, chưa có tin khách).
2. `typing-delay.ts` trích từ `WorkflowEngineService:944` + test trần; refactor caller cũ gọi vào.
3. `page-send-service.ts` hiện thực `ChannelSender.send({segments})`, cả text lẫn image.
4. `sender_action` + gửi ảnh vào graph client.
5. Chuỗi markSeen/typing/trễ/gửi từng segment.
6. Ánh xạ lỗi Meta → hành động.
7. Đăng ký registry; thử tay Page thật.

## Success Criteria

- [ ] **Khách gửi ảnh → agent trả lời đúng nội dung ảnh** (model vision được gọi với `image_url` part)
- [ ] Vision chỉ bật khi assistant dùng model vision; model khác + Zalo content vẫn string (không hồi quy)
- [ ] Model vision **không** nhận field `thinking`
- [ ] Kích hoạt Page: sau đăng ký, tin khách webhook → agent trả lời; Zalo vẫn chạy y nguyên
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

## Kết quả triển khai (2026-08-24)

**Trạng thái:** **Done**. Cook slice `Phase 4 + Vision`. Hai cổng bắt buộc đã qua.

### Đã tạo/sửa
- **Vision:** `ai/vision-support.ts` (`isVisionModel`, `extractImageUrls` chỉ nhận ảnh thật — chặn video/file, `buildMultimodalContent`, `VISION_MAX_IMAGES=6`). `AIAssistantService.callLLM` dựng content multimodal OpenAI-compat **chỉ** cho model vision, ngân sách ảnh **toàn request** (newest-first) + **retry bỏ ảnh 1 lần** khi URL Meta hết hạn (H2). `thinking-support` gate tắt thinking cho model vision. `ChatMessage.images?`/`ChannelHistoryMessage.images?`/`ChannelEvent.images?`. `page-context-provider.getHistory` trích ảnh lượt user. Dispatcher truyền ảnh + cho tin **chỉ-ảnh** (không caption) qua guard rỗng bằng cờ `force` của `MessageAggregator` (H1). 3 dropdown UI + model.
- **Send API:** `page-graph-client` (`sendText`/`sendImage`/`sendSenderAction`). `page-send-service.ts` (`ChannelSender`: mark_seen→typing→trễ→gửi từng segment text+ảnh; cổng 24h `messaging-window.ts`; công bố bot mặc định BẬT chỉ lần đầu/thread; ghi tin gửi kèm `message_id`; map lỗi Meta token→tắt Page / rate-limit→lùi 1 lần / permission→dừng). `typing-delay.ts` chung (Zalo giá trị y hệt, Page có nhiễu).
- **Kích hoạt Page:** dispatcher `registerChannels()` đăng ký provider+sender `'page'` — Zalo không đổi.
- **DB:** cột `fb_page.bot_disclosure` (ALTER idempotent) + `setFbPageDisclosure`/`hasPageAiReplied`/`recordPageSentMessage` (msg_type suy 'image'). Echo self-guard qua `appId` (M1). IPC/preload/renderer `setDisclosure`.
- **Test:** `vision-support`, `typing-delay`, `messaging-window` mới + case gate vision cho `thinking-support` + case `force` cho aggregator.

### Cổng kiểm chứng
- **Code review:** 8 ràng buộc cứng PASS (không hồi quy Zalo; vision chỉ bật cho model vision; không log secret; cổng 24h; công bố bot; echo dedupe; không vòng import; lọc URL không-ảnh). Đã vá H1 (tin chỉ-ảnh giờ trả lời được), H2 (cap ảnh toàn request + retry bỏ ảnh khi hết hạn), M1 (`appId` self-guard), M2 (msg_type ảnh), L1/L2. L3 (log key preview) pre-existing, ngoài slice.
- **Tester:** 33 suites / 277 tests pass (trước khi vá H1/H2); sau vá: cả 2 typecheck exit 0, toàn bộ suite chạm tới xanh.

### Lưu ý trước khi deploy
- **Backup DB trước lần boot đầu** sau bản này: ALTER thêm `fb_page.bot_disclosure` chạy khi khởi động (idempotent, guard cột, chỉ thêm cột mới).
- Model vision `deepseek-v4-flash-vision-exp` là **thử nghiệm** — thinking đã tắt; nếu DeepSeek xác nhận hỗ trợ thinking thì gỡ gate trong `thinking-support`.
- URL ảnh Meta CDN hết hạn → tự retry bỏ ảnh (khách vẫn nhận trả lời text). Nếu cần đọc ảnh cũ đáng tin, nâng cấp: tải & re-host ảnh (ngoài scope).
