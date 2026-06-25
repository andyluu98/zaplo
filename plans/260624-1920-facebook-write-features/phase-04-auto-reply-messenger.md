# Phase 4 — Auto-reply Messenger cá nhân qua Chat Agent

## Context Links
- `src/services/facebook/FacebookSendService.ts` — gửi tin FB (đường reply).
- `src/services/facebook/FacebookMQTTListener.ts` — nhận tin FB realtime (nguồn trigger).
- `src/services/event/EventBroadcaster.ts:92` — `onBeforeSend(channel, cb)` (hiện dùng cho luồng Zalo `event:message`).
- ⚠️ Chat Agent module (dispatcher/resolver/decider) — context nói có (chạy Zalo), worktree KHÔNG có. XEM Q2.

## Overview
- Priority: P2. Risk: Med. Status: pending. Depends: P0.
- Mô tả: tin nhắn Messenger đến → đưa vào Chat Agent (bot trả lời thông minh, debounce/gộp tin) → reply qua FacebookSendService.

## Key Insights
- Nếu Chat Agent tồn tại: nó nghe `event:message` (data có `zaloId`) và reply qua đường Zalo. Để dùng cho FB cần TRỪU TƯỢNG HÓA KÊNH.
- Trade-off (yêu cầu phân tích):
  - **(A) Tái dùng `event:message` abstraction**: FB listener emit cùng event với `channel:'facebook'` + `accountId`. Dispatcher chọn sender theo channel. Ưu: 1 đường, dùng full debounce/gộp/decider. Nhược: phải sửa Chat Agent (giả định nó tồn tại) để hết hard-code Zalo (zaloId, sender). Rủi ro hồi quy luồng Zalo.
  - **(B) Path FB song song**: copy mỏng dispatcher cho FB, reply qua FacebookSendService. Ưu: không đụng luồng Zalo (an toàn). Nhược: lặp logic debounce/gộp (vi phạm DRY), 2 nơi bảo trì.
  - **Khuyến nghị**: (A) NẾU Chat Agent tồn tại và refactor channel-agnostic chi phí hợp lý. NẾU không tồn tại → xây Chat Agent channel-agnostic từ đầu (vẫn là A về thiết kế). Tránh (B) trừ khi gấp.
- Debounce/gộp tin: cần key theo `(channel, accountId, threadId)` thay vì chỉ zaloId.

## Requirements
Functional:
1. FB tin đến → chuẩn hóa thành event chung `{channel:'facebook', accountId, threadId, senderId, text, ts}`.
2. Chat Agent quyết định trả lời (decider) + gộp tin trong cửa sổ debounce.
3. Reply đi qua `FacebookSendService.sendTextMessage`.
4. Có công tắc bật/tắt auto-reply theo account/thread.
5. Không tự trả lời tin do chính mình gửi (chống vòng lặp — xem FacebookSendService `fromRelay`).

## Architecture
```
FacebookMQTTListener (tin đến)
   → normalize → emit('event:message', {channel:'facebook', accountId, threadId, ...})
        │
   ChatAgentDispatcher.onBeforeSend('event:message')
        → if channel disabled → skip
        → debounce/gộp theo (channel,accountId,threadId)
        → resolver(ngữ cảnh hội thoại) → decider(có trả lời?) → AIAssistantService.chat()
        → sender = pickSender(channel):
              'zalo'     → ZaloService
              'facebook' → FacebookSendService.sendTextMessage(accountId, threadId, reply)
```

## Related Code Files
Create (nếu Chat Agent CHƯA tồn tại):
- `src/services/chat-agent/chat-agent-dispatcher.ts`
- `src/services/chat-agent/chat-agent-resolver.ts`
- `src/services/chat-agent/chat-agent-decider.ts`
- `src/services/chat-agent/chat-agent-channel-sender.ts` (map channel→sender)

Modify:
- `src/services/facebook/FacebookMQTTListener.ts` — emit `event:message` chuẩn hóa khi có tin (kèm channel='facebook').
- (Nếu Chat Agent tồn tại) các file dispatcher/sender — bỏ hard-code Zalo, thêm channel param. [chờ Q2]
- UI cài đặt — bật/tắt auto-reply FB theo account/thread.

## Implementation Steps
1. Q2: xác nhận Chat Agent tồn tại? → refactor channel-agnostic / build mới.
2. Định nghĩa event chung + `pickSender(channel)`.
3. Sửa `FacebookMQTTListener` emit event chuẩn (chống tự-trả-lời: bỏ qua tin outgoing của mình).
4. Dispatcher: debounce key theo (channel,accountId,threadId); reply qua FacebookSendService.
5. UI toggle auto-reply FB.
6. Compile + test nick phụ: nhắn cho nick chính từ nick khác → bot tự trả lời qua FB.

## Todo
- [ ] Q2 xác nhận Chat Agent + chọn (A)/(B)
- [ ] event chung + pickSender(channel)
- [ ] MQTTListener emit event chuẩn + chống vòng lặp
- [ ] dispatcher channel-agnostic (debounce theo key mới)
- [ ] UI toggle auto-reply FB
- [ ] compile + test nick phụ

## Success Criteria
- Tin FB đến → bot trả lời đúng nội dung qua Messenger.
- Nhiều tin liên tiếp → gộp 1 lần trả lời (debounce hoạt động).
- Tin của chính mình KHÔNG kích hoạt trả lời.
- Luồng Zalo cũ KHÔNG hồi quy (nếu sửa dispatcher chung).

## Risk Assessment
| Risk | L | I | Mitigation |
|------|---|---|-----------|
| Chat Agent không tồn tại → build lớn | High | Med | Thiết kế channel-agnostic ngay; scope tối thiểu |
| Refactor làm hỏng auto-reply Zalo | Med | High | Giữ test Zalo; feature-flag FB; phương án (B) nếu rủi ro cao |
| Vòng lặp tự trả lời | Med | High | Lọc tin outgoing + cờ fromRelay sẵn có |
| Trả lời lụt (spam) | Med | Med | Debounce + giới hạn lượt/thread/giờ |

## Security Considerations
- Không trả lời tin chứa lệnh inject prompt nguy hiểm (decider lọc). Giới hạn độ dài context gửi AI.

## Next Steps
Độc lập với P1-P3. Có thể làm song song sau P0 nếu Q2 rõ.
