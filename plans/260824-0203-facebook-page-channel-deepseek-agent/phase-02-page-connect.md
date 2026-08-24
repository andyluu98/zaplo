---
phase: 2
title: "Kết nối Page + lược đồ dữ liệu"
status: done
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Kết nối Page + lược đồ dữ liệu

> **Đã rework sau red-team 2026-08-24** (Critical C2, C4; High H1; Medium M5, và finding S8 per-app secret). Bỏ bộ bảng `fb_page*` song trùng; Page dùng bảng unified sẵn có. Bỏ `fb_page.assistant_id`.
>
> **Đã rework sau counsel kongming 2026-08-24 (chốt hướng "dễ triển khai").** Quyết định của user: **giữ app-per-deployer**, KHÔNG dùng "1 app chung của vendor" — webhook Messenger chỉ cho **1 callback URL/app** (không override per-Page như WhatsApp) ⇒ app chung bắt buộc vendor chạy backend relay + nhúng App Secret chung vào binary (trích xuất được) → trái ràng buộc local-first. Ma sát triển khai thật KHÔNG ở OAuth mà ở **Business Verification + App Review `pages_messaging`** mỗi deployer (dev mode chỉ chat được với tài khoản có vai trò trong app) — không mô hình nào bỏ được bước này trừ khi vendor thành Meta Tech Provider. Cách làm nhẹ: **(a) wizard cài đặt tiếng Việt**, **(b) hỗ trợ Facebook Login for Business `config_id`** (app business-type mới dùng FLB, `config_id` thay `scope` — thiếu thì dialog hỏng), **(c) UI access-level trung thực**, **(d) App Review kit dùng lại**. Bí mật qua `secureSetStrict` (hard-fail, đã thêm ở `SecureSettingsService`).

## Overview

Đăng nhập Facebook, chọn Page quản lý, lưu Page Access Token **mã hoá bắt buộc** vào SQLite. Điểm mấu chốt sau red-team: repo **đã hoàn tất** migration gộp `fb_*`→`accounts`/`contacts`/`messages` (cột `channel`), nên Page **không** tạo bảng dữ liệu riêng — chỉ tạo bảng cho phần Page thực sự mới (credentials/config). Agent gán qua `chat_agent` (thêm chiều `channel`), không qua cột riêng.

## Requirements

**Functional**
1. **Wizard cài đặt** (không phải form trần) dẫn deployer từng bước, tiếng Việt, có deep-link Meta dashboard: tạo app **business-type** → thêm *Facebook Login for Business* → tạo configuration với 5 quyền (biến thể User access token) → copy `config_id` → thêm sản phẩm *Messenger* → dán webhook URL + verify token. **Sinh + hiển thị webhook URL/verify token từ `fb_app` TRƯỚC OAuth** để deployer dán vào dashboard trong một lượt. UI nói rõ: dev mode chỉ Page mà tài khoản có vai trò trong app mới hiện/chat được.
2. OAuth trong `BrowserWindow` — **an toàn** (red-team M5): random `state` sinh mỗi lần + verify khi về; chỉ nhận `code` khi origin+path của URL redirect **khớp chính xác** `redirect_uri` đã đăng ký; `session.fromPartition('fb-page-oauth')` cô lập, clear sau; chặn `window.open`/điều hướng ngoài domain; trao đổi code→token chạy ở **main process** (secret không sang renderer). **Dialog rẽ nhánh:** nếu `fb_app.config_id` có → `dialog/oauth?config_id=...` (FLB, **không** kèm `scope` — trộn sẽ phá dialog); nếu không → classic `scope=pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,business_management` (app consumer-type cũ). App business-type mới **bắt buộc** đường FLB.
2b. **Phát hiện access-level sau OAuth**: gọi `GET /me/permissions`, đọc mức truy cập app; lưu `fb_app.access_level`; UI phơi 3 trạng thái `dev (chỉ tài khoản có vai trò)` / `live+standard` / `live+advanced (công khai)` — không để deployer tưởng đã production khi còn dev.
3. Đổi code → user token ngắn hạn → long-lived; `GET /me/accounts` lấy Page + Page Access Token.
4. Người dùng chọn Page; lưu.
5. Ngắt kết nối Page: xoá token + dữ liệu Page (`accounts`/`contacts`/`messages` với `channel='page'` của Page đó) + `chat_agent` rows của Page.
6. Kiểm token khi khởi động; hỏng → `token_status='expired'`, không sập app.

**Non-functional**
- Token/App Secret: **hard-fail nếu `safeStorage.isEncryptionAvailable()`=false** (red-team H1). Không lưu plaintext im lặng như `AIAssistantService.encryptApiKey` (`:20-26`). **Dùng `SecureSettingsService.secureSetStrict`** (đã thêm 2026-08-24, ném `EncryptionUnavailableError`) — KHÔNG dùng `secureSet` (nó fallback plaintext im lặng `:21-26,:30-34`, giữ nguyên cho caller Zalo). `secureGet` dùng lại như cũ. Startup log trạng thái mã hoá.
- Không log token/App Secret kể cả trong `Logger.error`.

## Architecture

**Dữ liệu Page vào bảng unified sẵn có** (red-team C2 — khớp cách FB cá nhân đã migrate ở `DatabaseService.ts:1948-1979`):

| Bảng sẵn có | Dùng cho Page thế nào |
|---|---|
| `accounts` | 1 row/Page: `zalo_id`=page_id, `channel='page'`, `full_name`=tên Page, `cookies`='' (Page không dùng cookie) |
| `contacts` | 1 row/khách: `owner_zalo_id`=page_id, `contact_id`=PSID, `channel='page'`, `contact_type='user'` |
| `messages` | `owner_zalo_id`=page_id, `thread_id`=PSID, `channel='page'`, `msg_id`=mid (UNIQUE `(msg_id,owner_zalo_id)` sẵn có → chống trùng), `is_sent`, `sent_by` |

→ `ConversationList`, `getMessages`, search, CRM, xoá-theo-account tự phục vụ Page vì đã multi-channel. Không cần loader thứ ba (giải luôn rủi ro Phase 6).

**Bảng/cột mới — tối thiểu:**

| Bảng | Cột | Ghi chú |
|---|---|---|
| `fb_page` (mới) | `page_id` PK, `name`, `access_token_enc`, `app_id`, `category`, `picture_url`, `enabled`, `token_status`, `last_customer_message_at`, `last_backfill_at`, `connected_at`, `updated_at` | Credentials + trạng thái. **Không** có `assistant_id`. `last_customer_message_at` cho cổng 24h (Phase 4), `last_backfill_at` cho cursor (Phase 3) |
| `fb_app` (mới) | `app_id` PK, `app_secret_enc`, `verify_token_enc`, `config_id` (nullable — FLB), `access_level` (`dev`/`standard`/`advanced`), `webhook_mode`, `webhook_port`, `public_url` | **Per-app** (red-team S8): mỗi app một secret; webhook resolve secret theo app của Page từ `entry[].id`. Tránh 1 secret global gãy khi có 2 app. `config_id` cho FLB (app business-type mới); `access_level` cho UI trung thực. **Vẫn cần `app_secret_enc`** dù có PKCE: HMAC verify webhook (Phase 3) + `fb_exchange_token` long-lived đều cần secret → không bỏ được, nên **không** dùng PKCE ở đây (không lợi gì khi deployer tự sở hữu secret) |
| `chat_agent` (sửa) | + `channel TEXT DEFAULT 'zalo'`, đổi ngữ nghĩa `owner_zalo_id`→owner id chung | Page agent = row với `channel='page'`, `owner_zalo_id`=page_id (red-team C4). `listEnabledChatAgents` lọc thêm `channel` |
| `chat_agent_thread` (sửa) | + `channel TEXT DEFAULT 'zalo'` | |
| `conversation_ai_state` (sửa) | thêm `channel` vào PK: `(channel, owner_zalo_id, thread_id)` | Cho pause/handoff Page (red-team C6) |

**Service mới**
```
PageAuthService: startOAuth (state+partition, dialog rẽ config_id vs scope) · exchangeCode (main proc) · toLongLived (fb_exchange_token) · detectAccessLevel (/me/permissions) · listManagedPages · connectPage · disconnectPage · verifyToken
page-graph-client: axios base https://graph.facebook.com/v25.0, dịch lỗi Meta (190 token, 613 rate-limit, 10/200 quyền)
```

**Deliverable ngoài-code (vendor):** App Review kit dùng lại cho mọi deployer — kịch bản screencast, use-case text ("tự động hoá CSKH trên Page của chính mình, user khởi tạo, cửa 24h"), hướng dẫn test user + Business Verification. Deployer nộp review gần như giống nhau (mô hình self-hosted như Chatwoot). App Review cần **webhook sống/reachable lúc review** (reviewer gửi tin test) → tunnel/VPS phải up trước khi nộp.

## Related Code Files

**Create**
- `src/services/facebook-page/page-auth-service.ts`
- `src/services/facebook-page/page-graph-client.ts`
- `src/services/facebook-page/page-types.ts`
- `electron/ipc/facebook-page-ipc.ts`
- `src/__tests__/page-graph-client.test.ts`

**Modify**
- `src/services/database/DatabaseService.ts` — 2 bảng mới (`fb_page`; `fb_app` gồm `config_id`, `access_level`); `ALTER TABLE` thêm `channel` cho `chat_agent`/`chat_agent_thread`; rebuild `conversation_ai_state` PK; **migrate rows Zalo hiện có** set `channel='zalo'`. Dùng pattern `PRAGMA table_info`+`ALTER` (`:1682/:1733`), **không** `CREATE TABLE IF NOT EXISTS` (red-team H3)
- `src/services/secure/SecureSettingsService.ts` — ✅ **đã thêm `secureSetStrict` + `EncryptionUnavailableError`** (2026-08-24); đường Page gọi biến thể strict này
- `src/services/chat-agent/channel-context/page-context-provider.ts` — điền `getAgentRules`/`getAiState`/`getHistory` cho Page
- `electron/main.ts` — `registerFacebookPageIpc()`
- `electron/preload.ts` — nhánh `facebookPage`

## Implementation Steps

1. **Backup DB** trước mọi đổi schema. Ghi đường dẫn backup.
2. `ALTER` thêm `channel` cho `chat_agent`/`chat_agent_thread`; migrate rows cũ `channel='zalo'`. Rebuild `conversation_ai_state` với PK gồm `channel` (tạo bảng mới, copy, swap — idempotent, backup trước).
3. Tạo `fb_page`, `fb_app` (gồm `config_id`, `access_level`).
4. `page-graph-client.ts` + test lỗi Meta (190→`token_status='expired'`).
5. `page-auth-service.ts` OAuth an toàn (state, partition, exact redirect match, main-proc exchange); dialog rẽ `config_id` (FLB) vs `scope` (classic); `detectAccessLevel` qua `/me/permissions`.
6. Token/secret qua `SecureSettingsService.secureSetStrict`; **hard-fail** (bắt `EncryptionUnavailableError`) → báo lỗi UI, không lưu plaintext.
7. Wizard cài đặt (sinh + hiển thị webhook URL/verify token trước OAuth; deep-link; trạng thái access-level).
8. Điền `page-context-provider` (agent rules theo `channel='page'`, history từ `messages channel='page'`).
9. IPC + preload.
10. (Ngoài code) soạn App Review kit dùng lại.

## Success Criteria

- [ ] Kết nối ≥1 Page thật, hiện tên+ảnh; tạo đúng 1 `accounts` row `channel='page'`
- [ ] Không có `SELECT ... FROM fb_page_message` nào — dữ liệu Page nằm ở `messages` (`grep -rn "fb_page_message\|fb_page_thread" src` = 0)
- [ ] Token trong `fb_page.access_token_enc` mã hoá qua `secureSetStrict`; **VPS headless không mã hoá được → ném `EncryptionUnavailableError` → báo lỗi UI**, không lưu plaintext (caller Zalo dùng `secureSet` cũ không đổi)
- [ ] App business-type có `config_id` → dialog dùng `config_id` (không `scope`); app cũ không `config_id` → dialog `scope=` chạy như trước
- [ ] Sau OAuth hiện đúng `access_level` (dev/standard/advanced); dev mode không bị hiểu nhầm là production
- [ ] `grep -ri "access_token\|app_secret" src/services/facebook-page` không đưa giá trị vào `Logger`
- [ ] OAuth: thiếu/không khớp `state` → từ chối; window dùng partition riêng
- [ ] Rows Zalo cũ đều có `channel='zalo'`; agent Zalo chạy như cũ
- [ ] Migration chạy 2 lần liên tiếp không lỗi (test trên bản copy DB **cũ có sẵn dữ liệu**, không phải DB trống — red-team H3)

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Rebuild PK `conversation_ai_state` làm mất/hỏng state pause Zalo | Trung bình | **Cao** | Backup; tạo-copy-swap trong 1 transaction; test round-trip pause Zalo sau migrate |
| `safeStorage` không khả dụng trên VPS → không lưu được token | **Cao** | Trung bình | Hard-fail có chủ đích + hướng dẫn (chạy có session keyring, hoặc chấp nhận nhập lại token mỗi phiên). Không im lặng plaintext |
| App Meta thiếu quyền → `/me/accounts` rỗng | **Cao** | Cao | Kiểm scope được cấp ngay sau OAuth, báo quyền thiếu |
| 2 app khác nhau, secret global gãy HMAC | Trung bình | Cao | `fb_app` per-app; webhook resolve theo `entry[].id`→Page→app (Phase 3) |

**Giả định có thể vỡ:** rằng nhét Page vào `accounts` (vốn cho tài khoản nhắn tin) không phá code Zalo/FB cá nhân đọc `accounts`.
**Dấu hiệu vỡ:** code lọc `accounts` giả định có `cookies`/`imei` hợp lệ.
**Phản ứng đã định:** đặt cờ phân biệt qua `channel='page'` ở mọi truy vấn account; nếu vẫn vỡ, tách `fb_page` hoàn toàn khỏi `accounts` và cho `page-context-provider` đọc `fb_page` trực tiếp (nhưng vẫn lưu message ở unified `messages`). Ghi lý do vào file này.
