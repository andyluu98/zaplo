# Plan — Chat Agent (trả lời khách tự động theo agent) + Hub Quản lý Agent

**Ngày:** 2026-06-23 · **Nhánh:** feat/automation · **Trạng thái:** ĐANG TRIỂN KHAI (TDD)
**Prototype duyệt:** `plans/260622-1119-posting-agent-management/visuals/agent-hub-prototype.html`

## Mục tiêu
Đưa mô hình Agent sang phần trả lời chat: mỗi **chat agent** = 1 trợ lý AI + phụ trách nhiều nhóm/hội thoại, tự trả lời khách, có chuyển giao Người↔AI. Gom quản lý vào 1 **Hub** (icon riêng) gồm Agent đăng bài + Agent chat.

## Nguyên tắc TÁI DÙNG (không làm lại)
- `AIAssistantService.chatForWorkflow()` — build prompt + **KB** + đa nền tảng + structured text/ảnh. KB + ngữ cảnh (30 tin) + model + prompt **nằm trong Trợ lý**; chat agent chỉ trỏ `assistant_id`.
- WorkflowEngine — route theo nhóm/keyword, debounce, gửi Zalo. KHÔNG viết dispatcher mới.
- `getMessages(thread, N)` — ngữ cảnh + nhật ký. `ConversationList`/`ChatHeader` — chèn badge/toggle.

## Data model (mới — tối thiểu)
| Bảng | Cột |
|---|---|
| `chat_agent` | id, owner_zalo_id, name, **assistant_id**, enabled, reply_mode(auto/suggest), is_default, default_scope_dm, default_scope_group, default_stranger_only, autopause_on_human, autoresume_minutes(0=off), allow_manual_toggle, created/updated |
| `chat_agent_thread` | chat_agent_id, owner_zalo_id, thread_id, thread_type |
| `chat_agent_label` | chat_agent_id, label_id |
| `conversation_ai_state` | owner_zalo_id, thread_id, paused(0/1), paused_reason, paused_at, pinned_agent_id |
| `messages` (sửa) | + **sent_by** ('ai'|'human'|NULL) — phân biệt AI tự gửi vs người gõ tay |

KHÔNG thêm field KB/ngữ cảnh (kế thừa từ assistant).

## Định tuyến (resolveChatAgent — ƯU TIÊN, gặp đầu dừng)
1. 🔖 Ghim (`conversation_ai_state.pinned_agent_id`) → 2. 🏷️ Nhãn → 3. 👥 Nhóm/thread → 4. ⭐ Mặc định (scope dm/group, strangerOnly). Disabled bỏ qua mọi tầng. → đúng 1 agent.

## Handoff
- AI tự gửi → ghi `sent_by='ai'`. Người gõ tay (tin self không phải AI) → set `conversation_ai_state.paused=1` (auto-pause nếu agent bật).
- "Giao lại cho Agent" → paused=0, nạp `getMessages` ngữ cảnh + KB tiếp tục. Toggle AI thủ công per-hội-thoại. Auto-resume sau N phút (tùy chọn).

## Phases
| # | Phase | Verify | Trạng thái |
|---|---|---|---|
| P0 | Dọn deplao→zaplo (github refs) + OG preview | grep sạch | 🔄 subagent chạy |
| P1 | DB: 4 bảng + cột sent_by + CRUD + migration auto-reply cũ→default chat agent | jest round-trip + migrate idempotent | ⏳ |
| P2 | **routing resolver** (pure) | **jest 12/12 ✓** | ✅ DONE |
| P3 | Dispatcher: hook event:message → resolve → reply (nạp chatHistory) + auto-pause listener + pause-check | test resolve+pause | ⏳ |
| P4 | IPC `chat-agent:*` (list/get/save/enable/delete/route/pin/setAiState) + preload + ipc.ts | typecheck | ⏳ |
| P5 | UI: Hub (view agentHub, icon) + ChatAgentsTab + editor (assistant inline) + Bảng định tuyến + ChatHeader picker/toggle + ConversationList badge | chạy app | ⏳ |
| R | code-review + DB integrity check | reviewer pass | ⏳ |

## File tái dùng (file:line tham chiếu trong reports recon)
- `src/services/ai/AIAssistantService.ts` chatForWorkflow/getFiles · `WorkflowEngineService.ts` trigger.message/zalo.sendMessage · `DatabaseService.getMessages` · `appStore` aiSuggestDisabled* (KHÔNG tái dùng cho gán agent — chỉ là opt-out suggestion) · `group-posting-page.tsx`/`agents-tab.tsx`/`agent-editor-modal.tsx` clone · `Sidebar.tsx` (icon 2 chỗ) + `appStore AppView` + `App.tsx`.

## Câu hỏi mở
- "Khách lạ" = `is_friend=0` lúc nhận, hay tin đầu tiên của thread? (resolver hỗ trợ cờ strangerOnly; mặc định is_friend=0).
- Auto-update/deplaoapp.com + data markers (_deplaoWorkflow…) giữ hay đổi — chờ user quyết (P0 subagent flag).
