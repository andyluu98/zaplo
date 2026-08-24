---
title: "Kênh Facebook Page + Agent DeepSeek tự trả lời Messenger"
description: "Thêm kênh Facebook Page (Graph API chính thức) vào Zaplo: kết nối Page, đồng bộ hội thoại Messenger, và Agent DeepSeek V4 thinking tự trả lời khách giống người."
status: pending
priority: P1
effort: "5-8d"
tags: [facebook, page, messenger, deepseek, chat-agent, graph-api]
created: 2026-08-24
blocks: [260624-1920-facebook-write-features]
---

# Kênh Facebook Page + Agent DeepSeek tự trả lời Messenger

**Nhánh:** main · **Brainstorm:** [`plans/reports/brainstorm-260824-0135-fb-page-deepseek-agent.md`](../reports/brainstorm-260824-0135-fb-page-deepseek-agent.md)

## Overview

Zaplo hiện quản lý Facebook ở mức **tài khoản cá nhân** (cookie + MQTT + E2EE Go bridge). Plan này thêm một kênh thứ ba — **Facebook Page** qua Graph API chính thức — và nối nó vào bộ Chat Agent sẵn có để DeepSeek tự trả lời khách inbox Page.

Ba trong bốn thành phần đã có sẵn trong repo và được **tái dùng, không viết lại**: `AIAssistantService` (DeepSeek + instruction + knowledge), `chat-agent-resolver`/`decider` (định tuyến agent), `MessageAggregator` (gộp tin debounce). Việc mới thực sự chỉ gồm: trừu tượng hoá kênh cho dispatcher, lớp Graph API cho Page, và thinking mode cho DeepSeek V4.

## Quyết định đã chốt (từ brainstorm)

| # | Quyết định | Chọn | Ghi chú |
|---|---|---|---|
| 1 | Kết nối Page | **Graph API chính thức** | Không dùng session cá nhân đóng vai Page (hướng cũ ở `260624-1920/phase-05` — nay bỏ) |
| 1b | Mô hình FB app | **App-per-deployer + wizard** (KHÔNG app chung của vendor) | Counsel kongming 2026-08-24: webhook Messenger chỉ 1 callback URL/app → app chung bắt buộc backend relay + secret nhúng binary, trái local-first. Nhẹ hoá bằng wizard + FLB `config_id` + UI access-level + App Review kit. Ma sát thật = Business Verification + App Review mỗi deployer, không mô hình nào bỏ được trừ khi thành Meta Tech Provider |
| 2 | Knowledge | **Giữ dump toàn văn** | Tái dùng `buildSystemPrompt()` nguyên trạng, không RAG ở vòng này |
| 3 | Thinking | **1 lượt, thinking bật per-call** | `deepseek-v4-flash` + `thinking:{type:'enabled'}` truyền **theo từng lời gọi** (chỉ Page path), không phải flag toàn assistant; `reasoning_content` lưu `ai_reasoning_log`, không gửi khách |
| 4 | Model cũ hỏng | **Vá trong plan này** | `deepseek-chat`/`deepseek-reasoner` khai tử 24/07/2026; vá cả 2 bản `normalizeModelName` |
| 5 | Lưu trữ Page | **Bảng unified sẵn có** (`accounts`/`contacts`/`messages` + `channel='page'`) | Red-team C2: repo đã migrate `fb_*`→unified; bảng riêng đi ngược kiến trúc |
| 6 | Host webhook | **Server riêng bind localhost** (IntegrationRegistry 9888) | Red-team C1: `HttpRelayService` là control-plane boss↔employee, tunnel nó = phơi API ra Internet |
| 7 | Gán agent Page | **`chat_agent` + cột `channel`** | Red-team C4: bỏ `fb_page.assistant_id`; dùng `chat_agent` để pause/handoff chạy free |

Quyết định #3-4 chốt lại **sau khi** xác minh tài liệu DeepSeek (2 model gốc "2 lượt reasoner→chat" đã bị gỡ; V4 trả `reasoning_content` song song `content` trong 1 lượt). Quyết định #5-7 chốt **sau red-team 2026-08-24** (báo cáo: `plans/reports/red-team-260824-0311-fb-page-deepseek-agent.md`) — đều là sửa cách-thực-hiện, không đảo hướng đã chốt với người dùng.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chat Agent chạy được trên nhiều kênh, không hard-code Zalo | P1 |
| 2 | Kết nối và quản lý nhiều Facebook Page, lưu token an toàn | P1 |
| 3 | Nhận tin Messenger của Page realtime qua webhook, có backfill khi app offline | P1 |
| 4 | Gửi trả lời qua Send API với hành vi giống người (typing, trễ, tách tin) | P1 |
| 5 | Agent tự thinking bằng DeepSeek V4, thinking ẩn nhưng lưu log debug | P1 |
| 6 | UI quản lý Page + hội thoại Page + gán agent | P2 |

## Phases

| # | Phase | Status | Priority | Effort | Depends |
|---|-------|--------|----------|--------|---------|
| 1 | [Trừu tượng hoá kênh cho Chat Agent](./phase-01-channel-abstraction.md) | ✅ Done | P1 | 2.5-3d | — |
| 2 | [Kết nối Page + lược đồ dữ liệu](./phase-02-page-connect.md) | ✅ Done | P1 | 2d | 1 |
| 3 | [Webhook nhận tin + backfill](./phase-03-webhook-inbound.md) | ✅ Done | P1 | 2-2.5d | 2 |
| 4 | [Send API + hành vi giống người + đọc ảnh (vision)](./phase-04-send-humanlike.md) | ✅ Done | P1 | 2d | 2 |
| 5 | [DeepSeek V4 thinking + vá model chết](./phase-05-deepseek-thinking.md) | ✅ Done | P1 | 1-1.5d | — |
| 6 | [UI quản lý Page + hội thoại](./phase-06-ui.md) | Pending | P2 | 1.5-2d | 3,4 |
| 7 | [Review + kiểm thử tích hợp](./phase-07-review.md) | Pending | P1 | 1d | 1-6 |

Phase 5 độc lập với 1-4, có thể làm song song. Tổng ~11-14d (effort Phase 1-3 tăng sau red-team).

## Architecture

> Sơ đồ đã cập nhật sau red-team 2026-08-24: webhook **không** đặt trên `HttpRelayService` (control-plane boss↔employee); Page dùng bảng unified + `chat_agent`; kênh sự kiện riêng `event:channelMessage`.

```
┌─ Meta ────────────┐   ┌─ Zaplo (Electron main) ─────────────────────────────────┐
│ Webhook messages  │   │ IntegrationRegistry webhook server (127.0.0.1:9888)      │
│ (cloudflared,     │──▶│   ├ GET  hub.challenge (verify token per-app)           │
│  chỉ tunnel 9888) │   │   └ POST X-Hub-Signature-256 (raw Buffer, timingSafeEqual│
└───────────────────┘   │        secret resolve theo entry[].id → fb_page → fb_app)│
                        │        ↓ 200 ngay · runWithChanges INSERT messages       │
                        │          (channel='page') · dedupe changes===1           │
                        │        ↓ EventBroadcaster.emit('event:channelMessage')    │
                        │          (echo → self-path: auto-pause khi NV trả tay)    │
                        │  ChatAgentDispatcher (qua ChannelContextProvider)         │
                        │   ├ MessageAggregator  key=channel:accountId:threadId     │
                        │   ├ provider.getAgentRules/getAiState/getHistory (page)   │
                        │   ├ resolveChatAgent → decideChatReply (chat_agent+channel)│
                        │   ├ chatForWorkflow(thinking per-call) → reasoning⇒ai_reasoning_log (KHÔNG sync)
                        │   │                                    → parseStructuredResponse → segments
                        │   └ ChannelSenderRegistry.pick(channel)                   │
                        │          ├ 'zalo' → ZaloSender                            │
                        │          └ 'page' → PageSendService.send(segments) ───────┼─▶ Graph API
                        └───────────────────────────────────────────────────────────┘  /v25.0/{PAGE_ID}/messages
   HttpRelayService (relay 9900) — GIỮ NGUYÊN, KHÔNG tunnel, KHÔNG gắn webhook
```

## Ràng buộc ngoài (đã xác minh từ tài liệu, 08/2026)

| Ràng buộc | Giá trị | Nguồn |
|---|---|---|
| Graph API hiện hành | v25.0 | [Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api/) |
| Endpoint gửi | `POST /{PAGE_ID}/messages` | như trên |
| Quyền cần | `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list` (+ phụ thuộc `business_management`) | [Permissions](https://developers.facebook.com/docs/permissions/) |
| Cửa sổ nhắn tin chuẩn | 24 giờ kể từ tin cuối của khách | [Send messages](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages) |
| Tag HUMAN_AGENT | mở rộng 7 ngày, dành cho người thật trả lời | như trên |
| Tag đã khai tử 27/04/2026 | `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` → lỗi 100 | như trên |
| Backfill | `GET /{PAGE_ID}/conversations?platform=messenger&fields=messages` — **chỉ lấy được chi tiết 20 tin gần nhất mỗi hội thoại** | [Conversations API](https://developers.facebook.com/docs/messenger-platform/conversations/) |
| DeepSeek model hiện hành | `deepseek-v4-flash`, `deepseek-v4-pro` — `deepseek-chat`/`deepseek-reasoner` khai tử 24/07/2026 | [Changelog](https://api-docs.deepseek.com/updates/) |
| Bật thinking | body `"thinking": {"type": "enabled"}`; trả về `choices[0].message.reasoning_content` | [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) |
| Model vision (đọc ảnh) | `deepseek-v4-flash-vision-exp` — OpenAI-compat, content array `[{type:'text'},{type:'image_url',image_url:{url}}]`; URL ngoài ≤8192 ký tự / ≤32MiB, hoặc base64 `data:`; thinking **chưa xác nhận** → tắt | [Vision](https://api-docs.deepseek.com/guides/vision) |

## Success Criteria

- [ ] Luồng auto-reply Zalo chạy y như cũ sau refactor (không hồi quy)
- [ ] Kết nối được ≥1 Page, token lưu mã hoá, không lộ trong log
- [ ] Khách inbox Page → tin hiện trong UI ≤5s
- [ ] Agent trả lời đúng instruction, trích đúng dữ liệu trong knowledge của Page đó
- [ ] Tin gửi thật lên Messenger, hiện đúng danh nghĩa Page
- [ ] `reasoning_content` lưu ở `ai_reasoning_log` (không sync sang employee), xem được, không bao giờ lọt vào tin gửi khách
- [ ] Ngoài cửa sổ 24h agent tự dừng, không gọi API để nhận lỗi
- [ ] Token dùng ghi vào `ai_usage_logs`
- [ ] Tắt agent → thread về chế độ trả lời tay; nhân viên trả lời tay → agent auto-pause
- [ ] App khởi động lại sau khi tắt → backfill persist (không bắn trả lời hàng loạt), chỉ replay tin mới nhất mỗi thread (trong giới hạn 20 tin/hội thoại của Meta)
- [ ] Cổng public chỉ lộ `/webhook/messenger`; control-plane relay không ra Internet
- [ ] Token/App Secret mã hoá bắt buộc; VPS không mã hoá được thì từ chối lưu, không plaintext

## Non-goals

- RAG / vector store / chunking knowledge
- Comment-to-inbox, quảng cáo, catalog sản phẩm
- Instagram Direct (dùng chung hạ tầng nhưng không nằm trong scope)
- Thay đổi kiến trúc Zalo hoặc luồng Facebook cá nhân
- Hoàn thiện `260624-1920/phase-04` (auto-reply Messenger **cá nhân**) — plan này chỉ dọn đường bằng lớp trừu tượng kênh

## Quan hệ với plan cũ

`plans/260624-1920-facebook-write-features/`:
- **P4 (auto-reply Messenger cá nhân)** — chưa làm. Phase 1 của plan này giao chính lớp trừu tượng kênh mà P4 cần. Sau khi plan này xong, P4 rút lại còn việc đăng ký `FacebookSendService` vào sender registry.
- **P5 (fanpage-as-page spike)** — **thay thế, no-go.** Đó là hướng đóng vai Page qua session cá nhân; brainstorm đã loại vì vi phạm ToS và làm rủi ro lây sang kênh cá nhân đang chạy.

## Open questions — ĐÃ CHỐT 2026-08-24

1. **App Meta: dev mode trước, App Review đang xin.** Vòng này chạy với Page mà tài khoản có vai trò trong app (admin/developer/tester). Khi App Review được duyệt thì cùng app đó mở rộng cho Page ngoài — không đổi kiến trúc, chỉ đổi trạng thái app phía Meta.
2. **App Secret: người vận hành tự nhập App ID + App Secret trong UI**, lưu mã hoá **bắt buộc** (`SecureSettingsService`, hard-fail nếu không mã hoá được — red-team H1) vào `fb_app` (per-app, không phải 1 secret global — red-team S8). Không nhúng secret vào bản build.
3. **Triển khai: app chạy trên VPS + Cloudflare named tunnel → webhook URL ổn định.** Phase 3 hỗ trợ hai chế độ expose:
   - **`external` (chính, cho VPS):** cloudflared named tunnel chạy như service ngoài app, trỏ về cổng **webhook server riêng (IntegrationRegistry 9888, bind localhost)** — **không** phải cổng `HttpRelayService` (red-team C1). Người dùng nhập public URL một lần vào `fb_app`.
   - **`quick` (fallback, dev):** `TunnelService` quick tunnel. **Loại trừ lẫn nhau** với relay/integration tunnel (`TunnelService` là singleton 1-tunnel — red-team A7). URL đổi mỗi khởi động, UI cảnh báo.

Không còn câu hỏi chặn nào.

## Red Team Review

### Session — 2026-08-24
4 reviewer (Security, Failure Mode, Assumption, Scope) · tier Full · **39 finding → 19 cụm · 19 accepted, 0 rejected**. Bằng chứng các Critical đã controller **tự verify tận mã nguồn**. Chi tiết + `file:line`: [`plans/reports/red-team-260824-0311-fb-page-deepseek-agent.md`](../reports/red-team-260824-0311-fb-page-deepseek-agent.md).

**Severity:** 6 Critical, 7 High, 6 Medium.

| # | Finding | Sev | Áp vào |
|---|---|---|---|
| C1 | Webhook trên `HttpRelayService` phơi control-plane boss↔employee ra Internet | Critical | Phase 3 (server riêng 9888) |
| C2 | Bảng `fb_page*` đi ngược migration unified B3 | Critical | Phase 2 (unified tables) |
| C3 | Phase 1 bóc tách nông — 7 điểm khoá `zaloId`, Page dead-end | Critical | Phase 1 (ChannelContextProvider) |
| C4 | Routing mâu thuẫn `fb_page.assistant_id` vs `chat_agent` | Critical | Phase 2 (chat_agent+channel) |
| C5 | Page event lên `event:message` fan-out workflow/relay/renderer | Critical | Phase 1/3 (`event:channelMessage`) |
| C6 | Human-handoff bất khả thi dưới echo-no-emit | Critical | Phase 3 (echo self-path) |
| H1 | safeStorage degrade plaintext trên VPS | High | Phase 2 (hard-fail) |
| H2 | `readBody` per-chunk → HMAC fail đa-byte; no cap | High | Phase 3 (raw Buffer, timingSafeEqual) |
| H3 | Migration `CREATE IF NOT EXISTS` không thêm cột DB cũ; `catch{}` nuốt lỗi | High | Phase 2/5 (ALTER + warn) |
| H4 | `reasoning_text` sync sang employee lộ CoT khách; không key join | High | Phase 5 (`ai_reasoning_log` no-sync) |
| H5 | thinking flag per-assistant phá `chatForWorkflow`/JSON Zalo | High | Phase 5 (per-call) |
| H6 | `humanize`/`page-agent-prompt` trùng + phá contract JSON | High | Phase 4/5 (tái dùng parseStructuredResponse) |
| H7 | `ChannelSender` chỉ text → mất image segment | High | Phase 1/4 (`send(segments)`) |
| M1 | Dead-model sót bản copy WorkflowEngine + IntroductionSettings | Medium | Phase 5 (extract shared) |
| M2 | Sai `Channel` union — chat UI dùng `channelConfig` | Medium | Phase 1/6 |
| M3 | mid dedupe hỏng (`run()` void, ignored rowid non-zero) | Medium | Phase 3 (`runWithChanges`) |
| M4 | Backfill chưa quyết emit; no cursor; storm | Medium | Phase 3 (no-emit + cursor + cap) |
| M5 | OAuth thiếu state/redirect/session isolation | Medium | Phase 2 |
| M6 | Dispatcher maps mis-keyed; rehook rò state | Medium | Phase 1 |

**Đính chính factual từ red-team:** claim "cloudflared trong `build.extraResources`" ở bản plan cũ **sai** — cloudflared nằm ở `files`/`asarUnpack` và **tải lần đầu chạy**; `extraResources` chỉ chứa `src/bridge-e2ee/build/`. Ảnh hưởng: VPS bị chặn egress tới host release cloudflared sẽ không tự tải được binary — cần cài cloudflared sẵn trên VPS (hợp với chế độ `external` dùng named tunnel ngoài app).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…07 (7 phase)
- Decision deltas: 8 (unified tables, chat_agent+channel, event:channelMessage, webhook server riêng, safeStorage hard-fail, thinking per-call, ai_reasoning_log no-sync, ChannelContextProvider)
- Reconciled stale references: `fb_page_message`/`fb_page_thread`/`fb_page_config`→unified+`fb_app`; `HttpRelayService` webhook→IntegrationRegistry 9888; `event:message`→`event:channelMessage`; `fb_page.assistant_id`→`chat_agent.channel`; `thinking_enabled` cột→per-call param; `reasoning_text` on `ai_usage_logs`→`ai_reasoning_log`
- Unresolved contradictions: **0**

## Kết quả triển khai — Phase 1 + 5 (2026-08-24)

**Trạng thái:** cả hai phase **Done**. Cook slice `Phase 1 + 5`, hai cổng bắt buộc đã qua.

### Đã tạo/sửa
- **Phase 5 (mới):** `src/services/ai/normalize-model-name.ts` (gộp 2 bản drift + map model khai tử), `src/services/ai/thinking-support.ts` (`supportsThinking`/`thinkingRequestBody`/`extractReasoning`/`thinkingMaxTokens`). Test: `normalize-model-name.test.ts`, `thinking-support.test.ts`.
- **Phase 5 (sửa):** `AIAssistantService.ts` (`callLLM`/`chat`/`chatForWorkflow` nhận `opts.thinking`, trả thêm `reasoning`; `logReasoning`/`getReasoning`), `WorkflowEngineService.ts` (dùng shared `normalizeModelName`), `DatabaseService.ts` (bảng `ai_reasoning_log`, **không** vào `SYNCABLE_TABLES`), `models/ai.ts` (`AIReasoningLog`), 3 UI dropdown (bỏ `deepseek-chat`/`deepseek-reasoner`).
- **Phase 1 (mới):** `chat-agent/channel-event.ts` (contracts `ChatChannel`/`ChannelEvent`/`ChannelContextProvider`/`ChannelSender` — `send(segments)` giữ ảnh, H7), `channel-sender-registry.ts`, `channel-context/zalo-context-provider.ts`, `senders/zalo-sender.ts`, `adapters/zalo-channel-adapter.ts` (cầu `event:message`→`event:channelMessage` qua `fireHooksOnly`). Test: `channel-adapter`, `channel-context-provider`, `agent-multichannel`.
- **Phase 1 (viết lại):** `chat-agent-dispatcher.ts` — channel-agnostic hoàn toàn; `reply()` bật thinking **chỉ khi `channel==='page'`** (Zalo body byte-identical, H5) và ghi `reasoning`→`ai_reasoning_log` mức thread.

### Cổng kiểm chứng
- **Code review:** 4 ràng buộc cứng PASS (không hồi quy Zalo — path Zalo chạy qua WorkflowEngineService, dispatcher còn dormant; thinking per-call/Page-only; CoT không lọt segment/không sync; model chết chỉ còn trong alias map). 1 Medium đã vá: `getReasoning` fallback latest-by-thread khi `msgId` rỗng.
- **Tester:** 26 suites / 220 tests pass, 0 fail; `tsc` cả 2 config exit 0. Báo cáo: `plans/reports/tester-260824-0854-regression-report.md`.

### Lưu ý trước khi deploy
- **Backup DB trước lần khởi động đầu tiên** sau bản này: `DatabaseService` tự chạy migration tạo `ai_reasoning_log` khi app boot (bảng mới, guard `sqlite_master`, không ALTER bảng cũ — rủi ro thấp nhưng vẫn backup theo ràng buộc cứng).
- Dispatcher **chưa được gọi `start()`** ở main process (đúng thiết kế — Phase 2/3 mới boot-wire khi có Page path + PageSender). Zalo auto-reply hiện vẫn 100% qua WorkflowEngineService.
- `logUsage` ghi tên model thô (chưa normalize) — cosmetic, pre-existing, không sửa trong slice này.

## Kết quả triển khai — Phase 2 (2026-08-24)

**Trạng thái:** **Done**. Cook slice `Phase 2` (hướng app-per-deployer + wizard + FLB, chốt sau counsel kongming). Hai cổng bắt buộc đã qua.

### Đã tạo/sửa
- **Schema (`DatabaseService.ts`):** thêm `channel` cho `chat_agent`/`chat_agent_thread` (ALTER guard idempotent); rebuild PK `conversation_ai_state` → `(channel, owner_zalo_id, thread_id)` (create-copy-swap **trong transaction**, backfill `zalo`); bảng mới `fb_app` (gồm `config_id`, `access_level`) + `fb_page`; CRUD + `deleteFbPage` (chỉ xoá `channel='page'`) + `upsertPageAccount`. Widen `listEnabledChatAgents`/`getConversationAiState`/`setConversationAiState` với `channel='zalo'` mặc định (Zalo không đổi); `saveChatAgent` lưu `channel`.
- **Secrets (`SecureSettingsService.ts`):** `encryptStrict`/`decryptSecret` (ciphertext lưu thẳng cột `*_enc`) + `secureSetStrict` + `EncryptionUnavailableError` — hard-fail, không plaintext im lặng. `secureSet` cũ giữ nguyên cho Zalo.
- **Service mới (`src/services/facebook-page/`):** `page-graph-client.ts` (Graph v25.0 + dịch lỗi Meta 190/613/10 — 8 test), `page-auth-service.ts` (OAuth: partition cô lập, state ngẫu nhiên, khớp **origin+path chính xác**, đổi code→token ở main-proc, rẽ FLB `config_id` vs classic scope, `detectAccessLevel`, buffer token trong RAM có TTL, connect atomic), `page-types.ts`. `chat-agent/channel-context/page-context-provider.ts`.
- **Model:** `models/facebook-page.ts` (`FbApp`/`FbPage`/`ManagedPage`/…), `models/index.ts`, `models/automation.ts` (`ChatAgent.channel?`).
- **IPC/preload/renderer:** `electron/ipc/facebook-page-ipc.ts` (namespace `fbpage:`, **tước `*_enc` trước khi trả renderer**), `main.ts` (register), `preload.ts` (`fbPage`), `ui/lib/ipc.ts` (types).
- **UI:** `ui/components/integration/FacebookPageWizard.tsx` (wizard 3 bước: đăng ký app → đăng nhập & chọn Page → quản lý Page đã kết nối; banner access-level trung thực; hộp copy redirect-URI/verify-token/webhook) + tab mới trong `IntegrationPage.tsx`.
- **Vá M1 (side-effect từ slice này):** `loginIpc.ts` + `main.ts` — vòng reconnect Zalo lọc `channel!=='zalo'` (bỏ qua row Page/FB, tránh `connectUser` ném vì `cookies=''`; đồng thời vá luôn bug cũ với row `channel='facebook'`).
- **Test:** `page-graph-client.test.ts` (8), `page-schema-migration.test.ts` (4 — chứng minh rebuild PK idempotent + không mất state pause Zalo + page/zalo cùng thread_id không đụng nhau).

### Cổng kiểm chứng
- **Code review:** 3 ràng buộc cứng **PASS** (không hồi quy Zalo; không plaintext secret — mã hoá hard-fail + IPC tước `*_enc` + không log; migration idempotent + atomic). Không Critical/blocking. Đã vá M1 (reconnect lọc kênh), M2 (`connectPage` atomic), L1 (khớp origin+path chính xác), L3 (TTL buffer thật), L4 (guard `channel` khi upsert account). Chấp nhận có ghi chú: M3 (test mirror SQL — cần electron mock chưa có), L2 (message lỗi Meta "unknown" tới renderer — không phải secret). Báo cáo: `plans/reports/code-review-260824-1023-fb-page-phase2.md`.
- **Tester:** 28 suites / 212 tests pass, 0 fail; `tsc` cả 2 config exit 0. Báo cáo: `plans/reports/tester-260824-1025-fb-page-phase2-report.md`.

### Lưu ý trước khi deploy
- **Backup DB trước lần boot đầu** sau bản này: migration rebuild PK `conversation_ai_state` + thêm cột `channel` chạy khi app khởi động (atomic + idempotent, đã test trên DB có dữ liệu, nhưng vẫn backup theo ràng buộc cứng).
- **App Review là ma sát thật:** mỗi deployer cần Business Verification + App Review `pages_messaging` để bot trả lời khách công khai; dev mode chỉ chat được với tài khoản có vai trò trong app. Wizard/FLB/kit chỉ làm nhẹ, không bỏ được bước này.
- **Phép thử rẻ đáng làm trước khi hoàn thiện UX copy:** app live + standard access, nhắn Page từ tài khoản không-vai-trò — nếu webhook nổ thì deployer bỏ được App Review cho Page của chính mình.
- **Page provider chưa boot-wire vào dispatcher** (đúng thiết kế — Phase 3 webhook cấp event + Phase 4 PageSender mới kích hoạt). Kết nối Page ở Phase 2 lưu dữ liệu + credential, chưa tự trả lời.
- `access_level='advanced'` không suy ra được từ client → deployer tự đặt sau khi App Review duyệt (nút trong wizard → `setAccessLevel`).

## Kết quả triển khai — Phase 3 (2026-08-24)

**Trạng thái:** **Done**. Cook slice `Phase 3` (webhook nhận tin + backfill). Hai cổng bắt buộc đã qua.

### Đã tạo/sửa
- **Webhook host:** mở rộng server sẵn có `IntegrationRegistry` (127.0.0.1:9888) thêm route `/webhook/messenger` — **GET** verify (`hub.challenge` khi verify_token khớp app đang bật, so sánh constant-time, chấp query string) + **POST** đọc **raw Buffer** (cap 1MB → 413 + `req.destroy`), verify `X-Hub-Signature-256` HMAC-SHA256 trên buffer thô, `timingSafeEqual`. Nhánh integration/payment cũ (casso/sepay) giữ **byte-identical**. Không đụng `HttpRelayService` (9900).
- **Service mới (`src/services/facebook-page/`):** `page-webhook-verify.ts` (HMAC raw + timingSafeEqual), `page-webhook-parse.ts` (parser **thuần**, không electron → test được), `page-webhook-handler.ts` (resolve `entry[].id`→`fb_page`→`fb_app`→secret; verify **trước** mọi ghi; 403 nếu Page lạ/tắt hoặc chữ ký sai — **0 dòng DB**; **200 ngay** rồi xử lý async qua `setImmediate`; **guard per-entry** kiểm Page bật cho từng entry — req #4), `page-inbound-store.ts` (ghi unified `messages`/`contacts` `channel='page'`, dedupe qua `runWithChanges` + `INSERT OR IGNORE`), `page-backfill-service.ts` (persist **không emit**).
- **Adapter:** `chat-agent/adapters/page-channel-adapter.ts` — dựng `ChannelEvent{channel:'page'}` emit `event:channelMessage` qua `fireHooksOnly` (KHÔNG `event:message`, ngoài `RELAY_CHANNELS`). Dispatcher **đang chạy** ở production nhưng an toàn no-reply vì **chưa đăng ký provider `'page'`** (`pick('page')→undefined→return`) — Phase 4 mới đăng ký để bật trả lời.
- **Echo → auto-pause:** `storeEcho` phân biệt AI-echo (mid đã có row `sent_by='ai'` từ Phase 4 → `INSERT OR IGNORE` changes=0 → bỏ qua) vs người thật (mid mới → pause thread nếu agent Page có `autopause_on_human`). Phase 3 chưa gửi AI nên mọi echo = người → pause.
- **DB:** `runWithChanges(sql,params): number` (trả `.changes` — phân biệt row mới vs trùng, red-team M3).
- **Graph client:** thêm `getRecentConversations` cho backfill.
- **IPC/preload/types:** `getWebhookInfo`/`setWebhookConfig`/`backfillNow`/`startQuickTunnel`/`stopQuickTunnel` (`TunnelService` singleton — quick mode loại trừ tunnel khác). `main.ts` chạy `backfillAllPages` lúc khởi động (deferred, không block).
- **Test:** `page-webhook-verify.test.ts` (7 — gồm ca UTF-8 đa-byte vắt qua ranh chunk verify **thành công**, path naive per-chunk **fail**), `page-webhook-parse.test.ts` (6).

### Cổng kiểm chứng
- **Code review:** 4 ràng buộc cứng **CLEAN** (không bypass chữ ký; không ghi trước verify; không double-fire Zalo — Page emit `event:channelMessage`, ngoài `RELAY_CHANNELS`, provider `'page'` chưa đăng ký; backfill không replay lúc restart). Đã vá: M1 (sửa comment adapter cho đúng — dispatcher **có** chạy, an toàn nhờ provider chưa đăng ký), M2 (guard per-entry kiểm Page bật — req #4), L1 (`req.destroy` khi quá 1MB), L3 (backfill guard recency preview). L2/L4 chấp nhận có ghi chú.
- **Tester:** 31 suites / 266 tests pass, 0 fail; `tsc` cả 2 config exit 0. Re-run 4 page suite sau vá đều xanh. Báo cáo: `plans/reports/tester-260824-1045-fb-page-phase3-report.md`.

### Lưu ý trước khi deploy
- **Endpoint public:** deployer phải tunnel **chỉ** cổng 9888 (VPS: cloudflared named tunnel ngoài app trỏ 9888; dev: `startQuickTunnel`). **Không** tunnel 9900 (relay). Success-criteria: `GET /api/sync/full` qua tunnel phải không tồn tại.
- **Dispatcher đã chạy production** (`main.ts:934`) và xử lý Zalo qua chat_agent — Page **chưa** trả lời vì provider `'page'` chưa đăng ký. Phase 4 đăng ký `PageContextProvider` + `PageSender` để bật (không cần start lại dispatcher, không đụng Zalo).
- Replay tin mới nhất khi backfill (nếu trong 24h) **hoãn sang Phase 4** (cần Send path). Phase 3 chỉ persist lịch sử.
- `getRecentConversations` giới hạn ~20 tin gần nhất/hội thoại (giới hạn Meta) — VPS 24/7 giảm hẳn mất tin.
