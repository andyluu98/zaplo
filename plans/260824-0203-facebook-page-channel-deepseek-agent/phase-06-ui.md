---
phase: 6
title: "UI quản lý Page + hội thoại"
status: pending
priority: P2
effort: "1.5-2d"
dependencies: [3, 4]
---

# Phase 6: UI quản lý Page + hội thoại

> **Đã rework sau red-team 2026-08-24** (Medium M2). UI chat branch trên `channelConfig.Channel` (`'zalo'|'facebook'`) — phải thêm `'page'` vào **đó** và vào `channelIpc`, không chỉ `agent-types`. Vì Page dùng bảng unified (Phase 2), `ConversationList` không cần loader thứ ba.

## Overview

Giao diện kết nối Page, xem hội thoại Messenger, gán agent. Chèn vào UI chat sẵn có — Page là nguồn thứ ba đổ vào cùng `ConversationList`/`ChatWindow`. Vì dữ liệu Page nằm ở `contacts`/`messages` (`channel='page'`), phần lớn danh sách/lịch sử tự chạy; việc thật là khai báo năng lực kênh và nhánh gửi.

## Requirements

**Functional**
1. Màn hình quản lý Page: kết nối, danh sách, trạng thái token, bật/tắt, ngắt.
2. Panel webhook theo `webhook_mode`: `external` — ô nhập public URL + "lần nhận webhook gần nhất"; `quick` — URL + chép + cảnh báo đổi URL mỗi lần khởi động.
3. Hội thoại Page trong `ConversationList` cùng Zalo/FB cá nhân, huy hiệu nguồn.
4. `ChatWindow` gửi/nhận tin Page — qua nhánh `'page'` trong `channelIpc` (red-team M2: hiện `channelIpc.sendMessage` chỉ có nhánh facebook/zalo, `'page'` sẽ rơi vào `else` Zalo và gọi `ipc.zalo.sendMessage` với PSID).
5. Gán agent cho Page — tái dùng bộ chọn trợ lý ở Hub, ghi `chat_agent` row `channel='page'` (Phase 2), **không** cột riêng.
6. `ChannelConfig.page`: capability đúng — typing indicator có; sticker/poll/group/unsend/alias **không**.
7. Chỉ báo cửa sổ 24h trên `ChatHeader`.
8. Hàng chờ "cần người trả lời" (ngoài 24h / agent bàn giao).
9. Xem `reasoning_text` của một câu trả lời — `ReasoningPanel` mở từ bong bóng AI, join `ai_reasoning_log` theo `msg_id`/`thread_id` (Phase 5). **Không** hiện lẫn vào bong bóng.

**Non-functional**
- Bám Tailwind/tối màu hiện có, không mang hệ thiết kế mới.
- reasoning sau thao tác mở rõ ràng.

## Architecture

| Nơi | Việc |
|---|---|
| `src/configs/channelConfig.ts:6,82` | `Channel` += `'page'`; `CHANNEL_CONFIG.page` capability entry (**red-team M2 — file này là cái chat UI thật branch, 37 file import**) |
| `src/ui/lib/channelIpc.ts:22-51` | Thêm nhánh `'page'` cho mọi hàm (sendMessage → `ipc.facebookPage.*`) |
| `src/ui/hooks/useChannelCapability.ts:24` | `getCapability('page')` trả entry mới, không rơi fallback `'zalo'` |
| `src/ui/store/appStore.ts:3` | `AppView` += `'facebookPage'` |
| `src/ui/store/chatStore.ts` / `accountStore.ts` | `channelFilter`/`getAccountsByChannel` nhận `'page'` |
| `Sidebar.tsx` | Mục điều hướng (2 chỗ đăng ký icon — kiểm cả hai) |
| `ConversationList.tsx` | Đọc `contacts channel='page'` (unified — không loader mới), huy hiệu |
| `ChatHeader.tsx` | Đồng hồ 24h + bộ chọn agent |
| `MessageBubbles.tsx` | Nút mở `ReasoningPanel` cho tin AI |

**Chốt literal (red-team M2):** kênh này là `'page'` xuyên suốt `channelConfig`, `contacts.channel`, `accounts.channel`, `chat_agent.channel`, `ChannelEvent.channel`. `agent-types.Channel` giữ `'fb'|'zalo'` (posting subsystem, không liên quan). Reconcile `'fb'` vs `'facebook'` sẵn có: không đổi, chỉ thêm `'page'`.

## Related Code Files

**Create**
- `src/ui/components/facebook-page/facebook-page-view.tsx`, `page-connect-panel.tsx`, `page-list.tsx`, `page-webhook-panel.tsx`, `page-agent-assign.tsx`
- `src/ui/components/chat/ReasoningPanel.tsx`

**Modify**
- `src/configs/channelConfig.ts` (**mới so với plan cũ**), `src/ui/lib/channelIpc.ts` (**mới**), `src/ui/hooks/useChannelCapability.ts` (**mới**)
- `src/ui/store/appStore.ts`, `chatStore.ts`, `accountStore.ts`
- `src/ui/components/layout/Sidebar.tsx`, `chat/ConversationList.tsx`, `chat/ChatHeader.tsx`, `chat/MessageBubbles.tsx`
- `src/App.tsx`

## Implementation Steps

1. `channelConfig.page` + `channelIpc` nhánh `'page'` + `useChannelCapability` **trước** (nền của mọi thứ khác).
2. `AppView` + sidebar + view rỗng, xác nhận điều hướng.
3. `page-connect-panel` + `page-list` nối IPC Phase 2.
4. `page-webhook-panel` theo mode.
5. `ConversationList` nạp thread Page (unified) + huy hiệu.
6. `ChatWindow`/`MessageBubbles` cho tin Page.
7. Đồng hồ 24h; `page-agent-assign` tái dùng bộ chọn.
8. `ReasoningPanel` join `ai_reasoning_log`.
9. Hàng chờ cần-người.

## Success Criteria

- [ ] Kết nối Page trọn vẹn bằng UI
- [ ] `channelIpc.sendMessage('page', …)` gọi `ipc.facebookPage`, **không** rơi vào Zalo (red-team M2)
- [ ] `getCapability('page')` trả capability Page, ChatWindow **không** hiện sticker/poll/group cho thread Page
- [ ] Hội thoại Page chung danh sách, phân biệt nguồn
- [ ] Gửi tay từ `ChatWindow` tới khách Page thành công
- [ ] Đồng hồ 24h đúng
- [ ] Mở `ReasoningPanel` đúng reasoning của tin đó (join msg_id)
- [ ] reasoning **không** trong bong bóng
- [ ] `npx tsc --noEmit` sạch; Zalo/FB cá nhân trong `ConversationList` không hồi quy

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Thêm `'page'` vào `channelConfig` (37 file import) sót chỗ dùng | Trung bình | Trung bình | tsc bắt hết chỗ thiếu case; đi từ `channelConfig`+`channelIpc` trước |
| Sửa component chat chung hỏng Zalo/FB cá nhân | Trung bình | **Cao** | Chỉ mở rộng theo nhánh nguồn; thử tay cả 3 kênh trước khi đóng phase |
| Người dùng bỏ qua cảnh báo webhook URL | Trung bình | Trung bình | Trạng thái webhook xanh/đỏ + lần nhận gần nhất |

**Giả định có thể vỡ:** rằng Page hiện trong `ConversationList` không cần loader riêng vì đã ở `contacts`.
**Dấu hiệu vỡ:** `ConversationList` nạp qua IPC Zalo-specific (`ipc.zalo.getConversations`) không đọc `contacts` đa kênh.
**Phản ứng đã định:** thêm IPC `facebookPage.getConversations` đọc `contacts channel='page'` + merge ở store; vẫn một màn hình chat. Ghi vào file này.
