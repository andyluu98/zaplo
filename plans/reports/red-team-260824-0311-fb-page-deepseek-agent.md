# Red Team Review — Kênh Facebook Page + Agent DeepSeek

Ngày: 2026-08-24 · Plan: `plans/260824-0203-facebook-page-channel-deepseek-agent/`
4 reviewer đối kháng (Security, Failure Mode, Assumption, Scope) · tier Full · 39 finding thô → 19 cụm sau khử trùng · **19 accepted, 0 rejected**

Bằng chứng của các Critical đã được controller **tự verify lại tận mã nguồn** (không chỉ tin subagent): migration B3, relay routes, readBody, IntegrationRegistry 9888, safeStorage fallback, dispatcher early-returns, chat_agent keying — tất cả xác nhận đúng.

## Critical (6) — chặn triển khai

| # | Finding | Bằng chứng | Xử lý |
|---|---|---|---|
| C1 | Webhook trên `HttpRelayService` phơi control-plane boss↔employee ra Internet: `/api/auth/login` (no rate-limit, phân biệt user/pass sai → enum), `/api/proxy/action` (dispatch IPC tùy ý), `/api/sync/full` (dump DB), CORS `*` | `HttpRelayService.ts:424-483`, `EmployeeService.ts:264-297` | Dùng webhook server **đã có sẵn** `IntegrationRegistry` (`:271,349`, port 9888, bind `127.0.0.1`) hoặc `http.Server` 1-route riêng; tunnel chỉ trỏ port đó; không bao giờ tunnel relay port. Phase 7 check: port công khai chỉ lộ `/webhook/messenger` |
| C2 | Bảng `fb_page*` đi ngược migration B3 đã hoàn tất (gộp `fb_*`→`accounts`/`contacts`/`messages` + cột `channel`) | `DatabaseService.ts:1948-1979`, `:1733-1735` | Page threads/messages vào `contacts`/`messages` với `channel='page'`; chỉ `fb_page` (credentials/config) là bảng mới. Kéo theo: `getMessages(page_id,…)` và `ConversationList` tự chạy vì đã multi-channel |
| C3 | Phase 1 bóc tách nông — dispatcher còn 7 điểm khóa `zaloId` tầng DB/connection, Page event dead-end im lặng tại `:135` | `dispatcher.ts:134-135,138,228-232,289-293,318-321,386,471` | Phase 1 thêm `ChannelContextProvider` (agent-lookup, ai-state, history, friend, label, account-name) + send qua registry. Effort P1 ↑ 1-1.5d → 2.5-3d |
| C4 | Routing model mâu thuẫn: `fb_page.assistant_id` vs `chat_agent.owner_zalo_id` → resolver luôn `null` cho Page | `dispatcher.ts:134,206-208`, `DatabaseService.ts:973-1014` | Bỏ `fb_page.assistant_id`; thêm `channel`+`owner_id` vào `chat_agent`/`chat_agent_thread`/`conversation_ai_state`, migrate Zalo rows (channel='zalo'); Page agent = `chat_agent` row thật → pause/handoff/auto-resume chạy free |
| C5 | Page event lên `event:message` → workflow engine + relay + renderer đều nhận & giả định shape Zalo `{zaloId,message}` → hồi quy Zalo, gửi PSID qua Zalo API | `HttpRelayService.ts:178`, `WorkflowEngineService.ts:249,738`, `HttpClientService.ts:550` | Kênh riêng `event:channelMessage`; dispatcher subscribe cả hai; Zalo adapter bridge `event:message`→`event:channelMessage`. Không đưa payload page vào `RELAY_CHANNELS` |
| C6 | Human-handoff bất khả thi: Phase 3 chặn `message_echoes` không emit → mất tín hiệu nhân viên trả lời tay → không auto-pause; đè lên nhân viên trước mặt khách | `dispatcher.ts:120-123,424-464`, `DatabaseService.ts:1003-1012` | Echo vào path `onSelfMessage` riêng (chỉ phát hiện pause, không vào reply path); phân biệt echo-AI vs human qua `messages.sent_by='ai'` + `message_id` Send API trả về, không so text; thêm `channel` vào `conversation_ai_state` PK |

## High (7)

| # | Finding | Bằng chứng | Xử lý |
|---|---|---|---|
| H1 | safeStorage degrade thành plaintext khi `isEncryptionAvailable()`=false (VPS headless = thường xuyên), im lặng | `AIAssistantService.ts:20-26`, `SecureSettingsService.ts:21-25` | Với token/App Secret: hard-fail (từ chối lưu + lỗi UI chặn) khi không mã hoá được; startup assertion log trạng thái |
| H2 | `readBody` decode từng chunk (`chunk.toString()`) → HMAC fail ngẫu nhiên khi ký tự đa-byte (tiếng Việt/emoji) vắt qua ranh chunk; không cap size; router `===` gãy với query string | `HttpRelayService.ts:1442-1446,436-459` | `readRawBody` gom `Buffer[]`+`concat`; HMAC `timingSafeEqual` trên buffer; cap 1MB→413; route theo parsed pathname; GET verify chấp query string |
| H3 | Migration `CREATE TABLE IF NOT EXISTS` không thêm cột vào DB cũ (guard `if length===0`); `logUsage` INSERT throw `no such column` bị `catch{}` nuốt → tắt logging token cả Zalo | `DatabaseService.ts:2506-2508,1682-1686`, `AIAssistantService.ts:434-440` | `PRAGMA table_info`+`ALTER TABLE ADD COLUMN` (pattern `:1682/:1733`); test trên bản copy DB cũ; thay `catch{}` bằng `Logger.warn` |
| H4 | `reasoning_text` trên `ai_usage_logs` (bảng SYNC global) → replicate chain-of-thought khách + KB + giá nội bộ sang mọi máy employee; và không có khóa join tới message cho ReasoningPanel; sync gãy khi schema lệch | `DataSyncService.ts:49,527-568`, `ai_usage_logs` `DatabaseService.ts:2506-2522` | Lưu reasoning ở bảng **không sync** (hoặc loại khỏi `SYNCABLE_TABLES_GLOBAL`) + retention/purge; thêm `thread_id`/`msg_id` để join ReasoningPanel |
| H5 | thinking là flag per-assistant nhưng assistant shared với `chat`/`chatForWorkflow`/`getSuggestions`/`testConnection`; reasoning tokens ăn `max_tokens=1000` (test=50) → JSON truncate → `parseStructuredResponse` null → gửi raw string cho khách Zalo | `AIAssistantService.ts:306-333,450,574-578`, `DatabaseService.ts:1151`, `dispatcher.ts:379-389` | thinking là **param per-call** do Page reply path set, không phải row flag; loại `getSuggestions`/`testConnection`; nếu bật, tự nâng `max_tokens` |
| H6 | `humanize-reply`/`page-agent-prompt` trùng `buildSystemPrompt(forWorkflow=true)` (đã cấm markdown, tách câu) + phá contract JSON: `splitIntoMessages` chạy trên JSON string → khách nhận `[{"type":"text"...` | `AIAssistantService.ts:305-336`, `dispatcher.ts:342,378-414`, `aiUtils.ts:20`, `WorkflowEngineService.ts:944` | Tái dùng `buildSystemPrompt(forWorkflow=true)`+`parseStructuredResponse`; humanize chỉ thao tác trên segment đã-parse; bỏ `page-agent-prompt.ts` (tone per-Page vào assistant instruction); `humanize-reply` chỉ còn delay helper trích từ `WorkflowEngineService:944` |
| H7 | `ChannelSender` chỉ `sendText` → mất image segment (system prompt rule 3 emit ảnh khi KB có URL) | `dispatcher.ts:378-412`, `AIAssistantService.ts:311-313` | `ChannelSender.send(segments: AIStructuredSegment[])`; adapter test image round-trip mỗi kênh |

## Medium (6)

| # | Finding | Bằng chứng | Xử lý |
|---|---|---|---|
| M1 | Dead-model patch sót bản copy thứ 2 `normalizeModelName` ở WorkflowEngine + `IntroductionSettings` vẫn quảng cáo `deepseek-chat`; grep criterion hẹp | `WorkflowEngineService.ts:2585-2597`, `IntroductionSettings.tsx:1231` | Extract shared `normalizeModelName`; thêm 2 file vào modify; grep `deepseek-chat\b\|deepseek-reasoner` trên `src electron`; R6 test cả workflow node |
| M2 | Sai `Channel` union: chat UI branch trên `channelConfig.ts` (`'zalo'\|'facebook'`), plan chỉ sửa `agent-types`; `channelIpc` không nhánh `'page'`; nới `deriveChannel` throw rò 'page' vào posting subsystem | `channelConfig.ts:6`, `channelIpc.ts:22-51`, `agent-types.ts:7`, `derive-channel.ts:7-11`, `validate-agent.ts:14` | Union mới cục bộ trong `channel-event.ts`; **giữ** `agent-types.Channel` + `deriveChannel` throw nguyên (bỏ Phase 1 req #6 cũ); Phase 6 thêm `channelConfig.page` + `channelIpc` nhánh `'page'`; chốt literal `'page'` end-to-end |
| M3 | mid dedupe hỏng: `run()` trả void, `runInsert` `lastInsertRowid` trên ignored insert vẫn non-zero → emit trùng; TOCTOU với profile fetch await | `DatabaseService.ts:316-329`, `dispatcher.ts:254-260` | `runWithChanges()` trả `changes`; insert **trước** mọi await (profile update sau); emit chỉ khi `changes===1` |
| M4 | Backfill chưa quyết emit hay không; no cursor → re-walk mỗi lần; N+1 profile calls; storm LLM khi restart | `EventBroadcaster.ts:232-241`, `dispatcher.ts:181-183,259` | Backfill persist **không emit**; chỉ replay tin mới nhất mỗi thread nếu newer than last outbound & trong 24h; `last_backfill_at` cursor; global concurrency cap agent turns |
| M5 | OAuth thiếu `state`/redirect validation/session isolation (no precedent trong repo) | `main.ts:474-487` | Random `state` verify; exact `redirect_uri` origin+path; `session.fromPartition('fb-page-oauth')` clear sau; block `window.open`/off-domain; code→token ở main process |
| M6 | Dispatcher singleton maps mis-keyed: `aiSentKeys` key `threadId\|text` không có channel/account prefix; `rehook()` clear aggregator+queue nhưng không clear `aiSentKeys`/`lastReplyAt`/`processing` → rò state cross-workspace | `dispatcher.ts:86-92,255,272,286,482-485` | Prefix mọi map bằng `channel:accountId`; `rehook()` clear đồng bộ tất cả |

## Không-finding (đã kiểm, loại)

- `page-graph-client` **không** trùng `HttpClientService` (transport employee-relay); không có Graph v25 client sẵn — bảng mới hợp lệ.
- `TunnelService` là singleton global 1 tunnel, 2 owner sẵn (relay + integration) — `quick` mode làm owner thứ 3 evict 2 cái kia (Finding A7). **Accepted như H-phụ của C1**: chọn webhook server riêng thì `quick` mode chỉ dùng cho dev, và phải ghi rõ loại trừ lẫn nhau. `extraResources` claim trong plan **sai** — cloudflared ở `files`/`asarUnpack`, tải lần đầu; đã sửa plan.

## Unresolved → đã chốt trong rewrite

1. Ownership Page agent → `chat_agent` (thêm channel+owner_id), bỏ `fb_page.assistant_id`.
2. Backfill replay → không emit, chỉ tin mới nhất mỗi thread.
3. Page reply path → `chatForWorkflow` (JSON contract) + `parseStructuredResponse`, không prompt riêng.
4. Webhook host → server riêng (IntegrationRegistry 9888 hoặc http.Server 1-route), không phải relay port.
