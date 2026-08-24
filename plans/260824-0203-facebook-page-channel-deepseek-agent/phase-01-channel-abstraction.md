---
phase: 1
title: "Trừu tượng hoá kênh cho Chat Agent"
status: done
priority: P1
effort: "2.5-3d"
dependencies: []
---

# Phase 1: Trừu tượng hoá kênh cho Chat Agent

> **Đã rework sau red-team 2026-08-24** (Critical C3, C5, M2, M6). Phạm vi mở rộng: coupling Zalo nằm ở **tầng DB/connection**, không phải ở kiểu `zca-js`. Effort tăng từ 1-1.5d → 2.5-3d.

## Overview

`ChatAgentDispatcher` hiện khoá cứng Zalo ở **bảy** điểm, không phải một. Ngoài payload `{zaloId, message}` của `zca-js`, nó còn: nạp agent rules theo `owner_zalo_id`, đọc `conversation_ai_state` theo `zaloId`, lấy nhãn/bạn bè/tên tài khoản theo `zaloId`, đọc lịch sử từ bảng `messages` theo `zaloId`, kiểm tra `ConnectionManager.getConnection(zaloId)` rồi gọi thẳng `api.sendMessage`. Phase này bóc **toàn bộ** các điểm đó sau một lớp `ChannelContextProvider`, để cùng bộ máy phục vụ `zalo`/`page`, **không đổi hành vi Zalo**.

## Requirements

**Functional**
1. `ChannelEvent` chuẩn hoá — giữ đủ trường mà dispatcher Zalo cần: `{ channel, accountId, threadId, threadType, senderId, senderName, text, mentions?, msgId?, ts, isSelf }`. `mentions` và `msgId` **bắt buộc có** vì dispatcher dùng cho `groupTriggerMatched`/`stripSelfMentions` (`:127,168`) và `tagSentByAi` (`:433,471`).
2. `ChannelContextProvider` — cổng trừu tượng cho mọi truy cập phụ thuộc tài khoản: `getAgentRules`, `getAiState`/`setAiState`, `getHistory`, `getLabelThreads`, `isFriend`, `getAccountName`. Mỗi kênh một implementation.
3. `ChannelSenderRegistry` map `channel → ChannelSender`; dispatcher gửi qua registry, **không** gọi `api.sendMessage` trực tiếp.
4. `ChannelSender.send(segments)` nhận **mảng segment đã-parse** (text/image), khớp thứ dispatcher hiện sinh ra ở `sendResult` (`:378-412`) — không phải chỉ `sendText` (giữ được ảnh, red-team H7).
5. Kênh sự kiện riêng `event:channelMessage` — dispatcher subscribe kênh này; Zalo adapter bridge `event:message` (payload cũ) → `event:channelMessage`. Page (Phase 3) emit thẳng `event:channelMessage`. **Không** đưa payload đa-kênh vào `event:message` (nằm trong `RELAY_CHANNELS` + kích hoạt workflow engine → red-team C5).
6. Khoá của **mọi** map trạng thái trong dispatcher (`aggregator`, `replyQueue`, `lastReplyAt`, `processing`, `aiSentKeys`) đổi sang tiền tố `channel:accountId:…`; `rehook()` clear **đồng bộ tất cả** (red-team M6).

**Non-functional**
- Không hồi quy auto-reply Zalo — ràng buộc cứng, Zalo đang chạy sản xuất.
- `ChannelContextProvider`, adapter, registry, khoá map: logic thuần, test không cần Electron.
- **Không** mở rộng `agent-types.Channel` và **không** nới `deriveChannel` (red-team M2): union kênh của chat pipeline là type **mới cục bộ** trong `channel-event.ts`. `agent-types.Channel`/`deriveChannel` thuộc subsystem posting khác, giữ nguyên throw.

## Architecture

```
event:message (Zalo payload cũ) ──zalo-adapter──┐
Page webhook (Phase 3) ─────────────────────────┼──▶ event:channelMessage ──▶ ChatAgentDispatcher
                                                 │                                    │
                                            (ChannelEvent)                            ▼
                                                              ChannelContextProvider.for(channel)
                                                                ├ zalo → đọc chat_agent/messages/… theo owner_zalo_id + ConnectionManager
                                                                └ page → đọc chat_agent(channel='page')/messages(channel='page') + token check
                                                                                      │
                                                                          ChannelSenderRegistry.pick(channel)
                                                                            ├ zalo → ZaloSender (api.sendMessage)
                                                                            └ page → PageSendService (Phase 4)
```

**Bảy điểm coupling phải đi qua provider** (từ `chat-agent-dispatcher.ts`):

| Dòng | Hiện tại (Zalo cứng) | Sau |
|---|---|---|
| :134,206 | `loadAgentRules(zaloId)` → `listEnabledChatAgents(zaloId)` | `provider.getAgentRules(channel, accountId)` |
| :138,299 | `getConversationAiState(zaloId, …)` | `provider.getAiState(channel, accountId, threadId)` |
| :228 | `getLocalLabelThreads(zaloId)` | `provider.getLabelThreads(...)` (Page: rỗng) |
| :231 | `checkIsFriend(zaloId, …)` | `provider.isFriend(...)` (Page: luôn false) |
| :318 | `getAccountName(zaloId)` | `provider.getAccountName(...)` |
| :321 | `getMessages(zaloId, threadId, n)` | `provider.getHistory(...)` — Page đọc `messages` với `channel='page'` (Phase 2 lưu Page vào unified messages → cùng hàm chạy) |
| :289,386 | `ConnectionManager.getConnection` + `api.sendMessage` | Zalo provider check conn; gửi qua `ChannelSenderRegistry` |

Interface:

```ts
export type ChatChannel = 'zalo' | 'page';   // type mới, cục bộ — KHÔNG phải agent-types.Channel

export interface ChannelSender {
  send(p: { accountId: string; threadId: string; threadType: 'user'|'group'; segments: AIStructuredSegment[] }): Promise<{ ok: boolean; messageIds?: string[] }>;
  setTyping?(p: { accountId: string; threadId: string; on: boolean }): Promise<void>;
  markSeen?(p: { accountId: string; threadId: string }): Promise<void>;
}

export interface ChannelContextProvider {
  getAgentRules(accountId: string): ChatAgentRule[];
  getAiState(accountId: string, threadId: string): PauseState | null;
  setAiState(accountId: string, threadId: string, s: Partial<PauseState>): void;
  getHistory(accountId: string, threadId: string, n: number): ChatMessage[];
  getLabelThreads(accountId: string): string[];
  isFriend(accountId: string, threadId: string): boolean;
  getAccountName(accountId: string): string;
}
```

`AIStructuredSegment` tái dùng từ đường hiện có (`parseStructuredResponse` ở `aiUtils.ts`) — không định nghĩa lại.

## Related Code Files

**Create**
- `src/services/chat-agent/channel-event.ts` — `ChatChannel`, `ChannelEvent`, `ChannelSender`, `ChannelContextProvider`
- `src/services/chat-agent/channel-sender-registry.ts`
- `src/services/chat-agent/channel-context/zalo-context-provider.ts`
- `src/services/chat-agent/channel-context/page-context-provider.ts` (khung, điền ở Phase 2/3)
- `src/services/chat-agent/adapters/zalo-channel-adapter.ts` — bridge `event:message`→`ChannelEvent`
- `src/services/chat-agent/senders/zalo-sender.ts` — bọc `api.sendMessage` hiện tại
- `src/__tests__/channel-adapter.test.ts`, `src/__tests__/channel-context-provider.test.ts`

**Modify**
- `src/services/chat-agent/chat-agent-dispatcher.ts` — 7 điểm coupling + subscribe `event:channelMessage` + khoá map + `rehook` clear đồng bộ
- `src/services/database/DatabaseService.ts` — `listEnabledChatAgents`/`getConversationAiState`/`getLocalLabelThreads`/`checkIsFriend` nhận thêm `channel` (mặc định `'zalo'` để Zalo không đổi); phần schema `channel`+`owner_id` cho `chat_agent`/`conversation_ai_state` làm ở Phase 2
- `src/services/event/EventBroadcaster.ts` — nếu cần helper emit `event:channelMessage` không đi qua `RELAY_CHANNELS`

**Không đụng**
- `chat-agent-resolver.ts`, `chat-agent-decider.ts`, `message-aggregator.ts` — API đã thuần channel-agnostic. Giữ nguyên.
- `agent-types.ts`, `derive-channel.ts` — thuộc subsystem posting. Giữ nguyên.

## Implementation Steps

1. Viết `channel-event.ts`.
2. Viết `zalo-context-provider.ts` bọc đúng 6 lời gọi DB Zalo hiện tại + `zalo-sender.ts` bọc `api.sendMessage` (gồm cả nhánh image `:395-410`).
3. Viết `zalo-channel-adapter.ts` bridge `event:message`→`ChannelEvent`, bảo toàn `mentions`/`msgId`/content-object `{title,href}`. Test từng ca (DM, nhóm, mention, content object, self).
4. Viết `channel-sender-registry.ts` + đăng ký `zalo`.
5. Sửa dispatcher: thay 7 điểm coupling bằng provider+registry; subscribe `event:channelMessage`; đổi khoá map; sửa `rehook`.
6. Nới chữ ký hàm DB liên quan để nhận `channel` (default `'zalo'`).
7. Test provider Zalo + jest toàn bộ; chạy app gửi tin Zalo DM/nhóm/mention xác nhận không hồi quy.

## Success Criteria

- [ ] `npx jest` xanh, có test adapter + context-provider
- [ ] `npx tsc -p tsconfig.electron.json --noEmit` sạch
- [ ] Dispatcher **không còn** identifier `zaloId` và **không** gọi trực tiếp `DatabaseService` keyed theo tài khoản (đều qua provider) — thay tiêu chí "grep zca-js == 0" cũ (red-team C3: tiêu chí cũ đo sai tầng)
- [ ] Dispatcher **không** gọi `ConnectionManager`/`api.sendMessage` trực tiếp — đều qua registry
- [ ] Thử tay: Zalo DM, Zalo nhóm có trigger từ khoá (@mention), debounce gộp 3 tin → 1 lượt — tất cả y như trước refactor
- [ ] Không payload đa-kênh nào chạm `event:message`/`RELAY_CHANNELS`
- [ ] Chuyển workspace (`rehook`) không rò state hội thoại cũ

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Refactor 7 điểm làm hỏng auto-reply Zalo sản xuất | Trung bình | **Cao** | Provider Zalo bọc **đúng** lời gọi cũ (không đổi logic); test provider trước; thử tay bắt buộc trước Phase 2 |
| Sót một điểm coupling → Page dead-end âm thầm như bản plan cũ | Trung bình | **Cao** | Bảng 7 điểm ở trên là checklist; grep `zaloId` trong dispatcher sau refactor phải = 0 |
| Đổi khoá map làm lệch echo-suppression/debounce Zalo | Trung bình | Cao | Prefix thêm `channel:` giữ nguyên phần `accountId:threadId` cũ cho Zalo; test debounce + echo Zalo |

**Giả định có thể vỡ:** rằng lưu Page vào unified `messages` (Phase 2) làm `getHistory` Page chạy không cần code riêng.
**Dấu hiệu vỡ:** `getMessages` lọc cứng theo hình dạng Zalo (thread_type số, prefix id).
**Phản ứng đã định:** thêm nhánh `getHistory` trong `page-context-provider` đọc `messages WHERE channel='page'`; ghi lý do vào file này.
