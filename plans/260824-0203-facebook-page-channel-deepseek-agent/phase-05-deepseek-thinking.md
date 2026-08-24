---
phase: 5
title: "DeepSeek V4 thinking + vá model chết"
status: done
priority: P1
effort: "1-1.5d"
dependencies: []
---

# Phase 5: DeepSeek V4 thinking + vá model chết

> **Đã rework sau red-team 2026-08-24** (High H3, H4, H5; Medium M1). thinking là **param per-call** (không phải flag per-assistant — sẽ phá `chatForWorkflow`/`testConnection` Zalo). Migration bằng `ALTER TABLE`. reasoning **không sync** sang employee. Vá cả bản copy `normalizeModelName` thứ hai.

Độc lập Phase 1-4, làm song song được. Cùng dùng `AIAssistantService` nên cải thiện luôn agent Zalo.

## Vấn đề hiện tại (đã verify)

- `callLLM` (`AIAssistantService.ts:405-424`) gửi body **không** có tham số thinking; đọc phản hồi **vứt** `reasoning_content`.
- `normalizeModelName` tồn tại **hai bản**: `AIAssistantService.ts:84-95` và bản copy `WorkflowEngineService.ts:2585-2597`. Cả hai **không** map `deepseek-chat`/`deepseek-reasoner` (khai tử 24/07/2026) → trợ lý/workflow đang lưu 2 tên đó gọi lỗi.
- UI vẫn chào 2 model chết: `AIAssistantDetailPage.tsx:58-59`, `NodeConfigPanel.tsx:938,965`, `IntroductionSettings.tsx:1231`.

## Requirements

**Functional**
1. `callLLM` nhận **tham số per-call** `opts.thinking?: boolean` (red-team H5) — chỉ Page reply path bật; **không** thêm cột `thinking_enabled` vào `ai_assistants` (assistant shared với `chat`/`chatForWorkflow`/`getSuggestions`/`testConnection`; bật toàn cục sẽ để reasoning ăn `max_tokens=1000`/`50` → JSON truncate → hồi quy Zalo).
2. Chỉ gửi `"thinking":{"type":"enabled"}` khi `opts.thinking && platform==='deepseek'`. Khi bật, tự nâng `max_tokens` đủ cho reasoning + content.
3. Bắt `choices[0].message.reasoning_content`, trả song song `result`.
4. `getSuggestions`/`testConnection` **luôn** thinking off.
5. Chữ ký trả về thêm `reasoning: string` (rỗng khi off/không hỗ trợ) — trường mới, caller cũ không vỡ.
6. Lưu reasoning để xem lại **nhưng không rời máy**: bảng mới `ai_reasoning_log` (`id, thread_id, msg_id, account_id, channel, assistant_id, reasoning_text, created_at`) — **không** thêm vào `ai_usage_logs` (bảng đó nằm trong `SYNCABLE_TABLES_GLOBAL` → sẽ replicate chain-of-thought khách sang mọi máy employee, red-team H4). Bảng mới **không** vào sync list. Có `thread_id`/`msg_id` để ReasoningPanel (Phase 6) join được (red-team H4 phần b).
7. `normalizeModelName`: map `deepseek-chat`→`deepseek-v4-flash`, `deepseek-reasoner`→`deepseek-v4-flash`. **Extract một bản dùng chung**, `WorkflowEngineService` import (xoá bản copy — red-team M1).
8. Gỡ 2 model chết khỏi **mọi** UI: `AIAssistantDetailPage`, `NodeConfigPanel` (×2), `IntroductionSettings`.
9. Instruction viết-như-người cho agent Page: **không** file `page-agent-prompt.ts` riêng (red-team H6) — tone per-Page đặt trong trường instruction của assistant; đường Page dùng `chatForWorkflow` (đã ép không-markdown/tách-câu).

**Non-functional**
- Nền tảng khác không nhận `thinking`.
- `reasoning_text` cắt bớt (5000) trước lưu.

## Architecture

**API đã verify** ([DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode)) — HTTP thô, trường ở cấp cao nhất (không `extra_body`):

```json
{ "model":"deepseek-v4-flash", "messages":[...], "temperature":0.7, "max_tokens":4096, "thinking":{"type":"enabled"} }
```
Phản hồi: `choices[0].message.{ reasoning_content, content }`. Không tool call → lịch sử lượt sau **chỉ** `content` (bỏ `reasoning_content` được).

**Migration (red-team H3):** `ai_reasoning_log` tạo mới bằng `CREATE TABLE IF NOT EXISTS` (bảng mới, an toàn). Không sửa cột `ai_usage_logs`. Thay `catch{}` quanh `logUsage` (`AIAssistantService.ts:434-440`) bằng `Logger.warn`.

## Related Code Files

**Create**
- `src/services/ai/thinking-support.ts` — nền tảng hỗ trợ? dựng tham số, bóc `reasoning_content`
- `src/services/ai/normalize-model-name.ts` — bản dùng chung (extract)
- `src/__tests__/thinking-support.test.ts`

**Modify**
- `src/services/ai/AIAssistantService.ts` — `callLLM(opts.thinking)`, parse reasoning, chữ ký trả về, import `normalize-model-name`, `catch{}`→warn
- `src/services/workflow/WorkflowEngineService.ts` — import `normalize-model-name`, **xoá** bản copy `:2585-2597`
- `src/services/database/DatabaseService.ts` — `ai_reasoning_log` (mới), **không** vào `SYNCABLE_TABLES_GLOBAL`
- `src/services/employee/DataSyncService.ts` — xác nhận `ai_reasoning_log` **không** trong sync list
- `src/models/ai.ts` — `AIReasoningLog` type
- `src/services/chat-agent/chat-agent-dispatcher.ts` — Page reply path truyền `thinking:true` + ghi `ai_reasoning_log` với thread/msg id
- UI: `AIAssistantDetailPage.tsx`, `NodeConfigPanel.tsx`, `IntroductionSettings.tsx` — gỡ model chết

## Implementation Steps

1. **Backup DB**.
2. `thinking-support.ts` + test (deepseek hỗ trợ; khác không; bóc reasoning; thiếu→rỗng).
3. Sửa `callLLM`: `opts.thinking`, chèn `thinking` chỉ khi hỗ trợ+bật, nâng `max_tokens`, bóc `reasoning_content`.
4. Extract `normalize-model-name.ts`, cả 2 service import, xoá copy.
5. `ai_reasoning_log` (mới) + xác nhận ngoài sync list.
6. Page reply path truyền `thinking:true`, ghi reasoning kèm thread/msg id; `catch{}`→warn.
7. Gỡ model chết khỏi 3 UI.
8. Verify bằng call thật DeepSeek: `reasoning` khác rỗng và khác `result`.

## Success Criteria

- [ ] Call thật thinking on → `reasoning` khác rỗng, khác `result`
- [ ] Thinking off → body **không** có `thinking`; OpenAI/Gemini/Claude không lẫn `thinking`
- [ ] `chatForWorkflow`/`getSuggestions`/`testConnection` **luôn** off → JSON Zalo không truncate (red-team H5)
- [ ] Trợ lý lưu `deepseek-chat` gọi được (map); **workflow node** lưu `deepseek-chat` cũng gọi được (bản copy đã xoá — red-team M1)
- [ ] `grep -rn "deepseek-chat\b\|deepseek-reasoner" src electron` = 0 ngoài bảng alias
- [ ] `ai_reasoning_log` có dữ liệu, join được thread/msg; **không** trong `SYNCABLE_TABLES_GLOBAL` (`grep` xác nhận)
- [ ] reasoning không bao giờ vào tin gửi khách (test Phase 7)
- [ ] `logUsage` lỗi schema → `Logger.warn`, không nuốt (red-team H3)
- [ ] Test `thinking-support` xanh

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Vị trí tham số `thinking` sai (SDK `extra_body` vs HTTP thô) | Trung bình | Cao | Verify bằng call thật bước 8 trước khi nối agent |
| Thinking đội token/chậm | Cao | Trung bình | Chỉ bật cho Page; theo dõi `ai_usage_logs`; tắt cho câu chào đơn giản nếu cần |
| Refactor `normalizeModelName`/`callLLM` hồi quy Zalo | Thấp-TB | **Cao** | Thinking off mặc định cho Zalo; test Zalo sau sửa |
| reasoning vẫn lọt sang employee qua đường khác | Thấp | Cao | Test `DataSyncService` không thấy `ai_reasoning_log`; grep sync list |

**Giả định có thể vỡ:** `deepseek-v4-flash` thinking đủ tốt, khỏi cần `v4-pro`.
**Dấu hiệu vỡ:** sai dữ kiện có sẵn trong knowledge.
**Phản ứng đã định:** cho chọn `deepseek-v4-pro` ở cấp assistant (chỉ đổi `model`); không đổi kiến trúc.
