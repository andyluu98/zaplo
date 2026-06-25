---
title: "Facebook Write Features (đăng bài / comment / inbox)"
description: "Bổ sung khả năng GHI Facebook cho Zaplo: comment, đăng bài tường/nhóm, auto-reply Messenger, Fanpage-as-Page (spike)."
status: pending
priority: P2
effort: 6-9 ngày (Phase 0-4) + spike Phase 5
branch: claude/infallible-rhodes-5fc65a
tags: [facebook, write, graphql, posting, chat-agent, electron]
created: 2026-06-24
---

# Facebook Write Features — Overview

Mở rộng app từ "đọc + nhắn tin cá nhân" sang "GHI" (comment, đăng bài, auto-reply, Page).
Tận dụng tối đa cơ chế GraphQL mutation đã chạy thành công (`buildFormData` + `doc_id`),
upload ảnh đã có (`FacebookAttachment.ts`), và `AIAssistantService.chat()` để soạn nội dung.

## Nguyên tắc xuyên suốt
- An toàn nick: rate-limit + random delay + giới hạn/ngày + DUYỆT TAY trước khi gửi loạt. Khuyến nghị nick phụ.
- `doc_id` FB dễ vỡ → gom 1 chỗ: `src/services/facebook/write/facebook-write-doc-ids.ts`.
- Tái dùng: `buildFormData`, `FacebookAttachment`, `AIAssistantService`, scan `postId`, `FacebookSendService`.
- DB: cột/bảng mới cho DB CŨ PHẢI qua `migrate()` (try/catch ALTER), KHÔNG chỉ `createTables` → tránh bug index-trên-cột-chưa-tồn-tại.

## ⚠️ Phát hiện quan trọng (lệch với context đầu vào)
Context nói module "đăng bài nhóm agent-centric" (Zalo) và "Chat Agent" ĐÃ hoàn chỉnh.
Thực tế worktree này: KHÔNG có file `chat-agent/*`, `services/posting/*`, `models/automation.ts`.
Chỉ có 1 stub `src/ui/components/posting/stats-tab.tsx` (untracked) tham chiếu `ipc.posting` chưa wire.
→ Phase 3 (tích hợp vào module posting) và Phase 4 (tái dùng Chat Agent) PHẢI verify lại sự tồn tại
trước khi bắt đầu. Xem Unresolved Questions. Plan thiết kế để KHÔNG phụ thuộc cứng vào 2 module đó.

## Phases

| # | Phase | File | Priority | Risk | Status | Depends |
|---|-------|------|----------|------|--------|---------|
| 0 | Nền tảng GHI dùng chung | [phase-00](phase-00-write-foundation.md) | P1 | Low | ✅ done | — |
| 1 | Auto-comment bài đã scan | [phase-01](phase-01-auto-comment.md) | P1 | Med (doc_id) | pending | P0 |
| 2 | Đăng bài tường cá nhân | [phase-02](phase-02-personal-post.md) | P2 | Med (doc_id) | ✅ engine+UI | P0 |
| 3 | Đăng bài vào nhóm FB | [phase-03](phase-03-group-post.md) | P2 | Med | ✅ engine+UI | P0, P2 |
| 4 | Auto-reply Messenger via Chat Agent | [phase-04](phase-04-auto-reply-messenger.md) | P2 | Med | pending | P0 |
| 5 | Fanpage as Page (SPIKE) | [phase-05](phase-05-fanpage-as-page-spike.md) | P3 | HIGH | pending | P0-P2 |

## Dependency graph
```
P0 (foundation)
 ├─ P1 (comment)
 ├─ P2 (personal post) ─ P3 (group post)
 ├─ P4 (auto-reply)
 └─ P5 (page spike, sau khi P0-P2 chứng minh pattern GHI ổn)
```

## Test matrix (tổng)
- Unit: doc-ids constant, write-service ký form, rate-limiter, action-log dedupe, channel abstraction.
- Integration: gửi 1 comment/post thật bằng nick phụ → kiểm response parse + log DB.
- E2E (manual, nick phụ): duyệt-tay → gửi loạt nhỏ (2-3 item) → xác minh trên FB web + thống kê.

## Rollback (tổng)
Mỗi phase độc lập file + feature-flag UI (ẩn tab/nút) → revert = tắt flag + drop bảng mới (bảng mới không ảnh hưởng DB cũ).

## Unresolved Questions
Xem cuối file này + mục Risk trong từng phase.

### Q1 — doc_id / friendlyName ✅ ĐÃ GIẢI QUYẾT (2026-06-25)
User đã dò qua DevTools. Đã điền vào `facebook-write-doc-ids.ts`:
- comment: `useCometUFICreateCommentMutation` / doc_id `27110396558617941` (target = feedback_id base64).
- post tường + post nhóm: CHUNG `ComposerStoryCreateMutation` / doc_id `27638478529090712`
  (tường: audience.privacy; nhóm: audience.to_id = group_id + composed_text).
Variables thật đã dựng trong `facebook-write-variables.ts` (bỏ tracking/attribution analytics).

### ✅ VERIFY LIVE (2026-06-25) — đã gửi thật bằng nick 61591066661953
- **Đăng tường cá nhân: ✅ THÀNH CÔNG** (có story URL).
- **Đăng nhóm: ✅ THÀNH CÔNG** (có post URL trong nhóm).
- **Comment: ⏳ field_exception** — cơ chế đúng (cùng đường đã proven) nhưng feedback_id test cũ/không hợp lệ; verify khi ráp Scan (target thật).
- **PHÁT HIỆN THEN CHỐT:** /api/graphql/ GHI cần **HTTP headers** `x-fb-friendly-name`, `x-fb-lsd`, `x-asbd-id` + form field `lsd` (thiếu → FB error 1357054). Đã thêm vào `facebook-write-service.ts`; `lsd` parse trong `FacebookSession.initSession` + refresh trước mỗi batch trong IPC.
- createNote (endpoint cũ /webgraphql/mutation/) nay 500 — đã chết, không dùng nữa.

### Q2 — Module posting agent-centric & Chat Agent có thật không?
Không tìm thấy trong worktree (chỉ stub stats-tab). Cần xác nhận: (a) nhánh khác? (b) chưa merge?
(c) context nhầm? → Quyết định Phase 3/4 build mới hay tích hợp.

### Q3 — Page-actor (Phase 5)
Không có pattern `av=page_id` / page token nào trong code. Là SPIKE thuần, rủi ro khóa Page cao.

### Q4 — Giới hạn/ngày an toàn là bao nhiêu?
Cần user chốt ngưỡng (vd: ≤10 comment/ngày, ≤3 post/ngày cho nick phụ) — ảnh hưởng rate-limiter config.
