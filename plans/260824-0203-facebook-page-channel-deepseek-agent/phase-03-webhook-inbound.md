---
phase: 3
title: "Webhook nhận tin + backfill"
status: done
priority: P1
effort: "2-2.5d"
dependencies: [2]
---

# Phase 3: Webhook nhận tin + backfill

> **Đã rework sau red-team 2026-08-24** (Critical C1, C5, C6; High H2; Medium M3, M4). **Không** gắn webhook vào `HttpRelayService` (đó là control-plane boss↔employee, tunnel nó = phơi `/api/auth/login`, `/api/proxy/action`, `/api/sync/full` ra Internet). Dùng webhook server riêng bind localhost.

## Overview

Nhận tin khách gửi Page realtime qua Meta Webhook, lưu vào bảng unified, và bắn lên `event:channelMessage` cho Chat Agent. Kèm backfill kéo tin đã lỡ khi máy tắt.

**Quyết định host (red-team C1):** repo **đã có** webhook server đúng nghĩa — `IntegrationRegistry` (`src/services/integrations/IntegrationRegistry.ts:271,349`): `http.createServer` bind `127.0.0.1:9888`, route `/webhook/{id}`, tự né cổng khi EADDRINUSE. Mở rộng server này thêm route `/webhook/messenger` (hoặc dùng `/webhook/{pageId}`), rồi tunnel **chỉ** cổng 9888. **Tuyệt đối không** tunnel cổng relay 9900. `HttpRelayService` giữ nguyên, không đụng.

## Requirements

**Functional**
1. `GET /webhook/messenger` — trả `hub.challenge` khi `hub.verify_token` khớp `fb_app.verify_token_enc`. Chấp nhận query string (red-team H2: router `IntegrationRegistry` phải match theo pathname đã parse).
2. `POST /webhook/messenger` — verify `X-Hub-Signature-256` HMAC-SHA256 với App Secret của **app đúng** (resolve từ `entry[].id`→`fb_page`→`fb_app`, red-team S8) **trước khi** đọc/ghi. So sánh `crypto.timingSafeEqual`.
3. Đọc body **raw bytes**: `readRawBody` gom `Buffer[]`+`Buffer.concat`, HMAC trên buffer (red-team H2: `chunk.toString()` từng chunk làm hỏng ký tự đa-byte tiếng Việt/emoji). Cap 1MB → 413 trước khi drain hết.
4. Reject `entry[].id` không thuộc Page đang bật → 403, **không** ghi DB (chống rác + Page đã ngắt).
5. Phân tích `entry[].messaging[]`: `message` (tin khách), `message_echoes` (Page gửi), `read`, `delivery`.
6. Ghi vào bảng unified `messages` (`channel='page'`), chống trùng qua `runWithChanges()` trả `changes` (red-team M3: `run()` trả void, `runInsert` trên ignored insert vẫn cho rowid non-zero → không phân biệt được mới/cũ). **Insert trước mọi await**, profile fetch cập nhật sau.
7. Chuẩn hoá `ChannelEvent{channel:'page'}` rồi emit **`event:channelMessage`** (Phase 1) — **không** `event:message` (red-team C5).
8. `message_echoes` → lưu `messages` `direction`out/`sent_by` phù hợp + emit lên **path self riêng** để Chat Agent phát hiện nhân viên trả lời tay và auto-pause (red-team C6). Phân biệt echo-AI vs human qua `sent_by='ai'` + `message_id` Send API trả (Phase 4), **không** so text.
9. Lấy tên khách `GET /{PSID}?fields=name,profile_pic` cache vào `contacts`.
10. Backfill khi khởi động (red-team M4): `GET /{PAGE_ID}/conversations?platform=messenger&fields=messages` cho Page đang bật. Persist **không emit** (tránh trả lời hàng loạt tin cũ khi restart). Chỉ replay agent tin **mới nhất mỗi thread** nếu newer than last outbound & trong 24h. Cursor `fb_page.last_backfill_at`. Cap concurrency profile calls.
11. Webhook host mode (`fb_app.webhook_mode`): `external` (VPS, public_url do người dùng nhập, cloudflared named tunnel chạy **ngoài app** trỏ 9888) / `quick` (dev, `TunnelService` quick tunnel — **loại trừ lẫn nhau** với relay/integration tunnel vì `TunnelService` là singleton 1-tunnel, red-team A7).

**Non-functional**
- Chữ ký sai/thiếu → 403, **không** xử lý. Endpoint public.
- Trả **200 ngay**, xử lý bất đồng bộ (Meta timeout ~20s, chậm → gửi lại → trùng + có thể vô hiệu webhook).
- Không log nội dung tin khách mức info.

## Architecture

```
Meta ─POST /webhook/messenger─▶ IntegrationRegistry webhook server (127.0.0.1:9888, tunnel chỉ cổng này)
                                    │
                                    ├ readRawBody (Buffer.concat, cap 1MB)
                                    ├ resolve entry[].id → fb_page → fb_app.app_secret
                                    ├ verify X-Hub-Signature-256 (timingSafeEqual) — sai → 403
                                    ├ 200 OK NGAY
                                    └ async:
                                        message        → runWithChanges INSERT messages(channel='page') → changes===1 ? emit event:channelMessage : bỏ
                                        message_echoes → INSERT (sent_by) → emit lên self-path (pause detection)
                                        read/delivery  → cập nhật trạng thái
```

## Related Code Files

**Create**
- `src/services/facebook-page/page-webhook-handler.ts` — parse + route
- `src/services/facebook-page/page-webhook-verify.ts` — HMAC thuần, timingSafeEqual
- `src/services/facebook-page/page-inbound-store.ts` — ghi `messages`/`contacts` unified, dedupe `changes`
- `src/services/facebook-page/page-backfill-service.ts`
- `src/services/chat-agent/adapters/page-channel-adapter.ts` — dựng `ChannelEvent`
- `src/__tests__/page-webhook-verify.test.ts`, `page-webhook-parse.test.ts`

**Modify**
- `src/services/integrations/IntegrationRegistry.ts` — thêm route `/webhook/messenger` (raw body riêng, match pathname), expose public URL
- `src/services/database/DatabaseService.ts` — thêm `runWithChanges()` (red-team M3)
- `src/services/tunnel/TunnelService.ts` — nếu cần multi-tunnel keyed, hoặc chỉ ghi rõ loại trừ; expose URL cho UI
- `electron/ipc/facebook-page-ipc.ts` — webhook URL, mode, backfill tay
- `src/services/chat-agent/chat-agent-dispatcher.ts` — path `onSelfMessage` nhận echo Page (nếu chưa có từ Phase 1)

## Implementation Steps

1. `page-webhook-verify.ts` + test: chữ ký đúng/sai/thiếu header/body rỗng/**ký tự đa-byte vắt qua ranh chunk**.
2. Thêm `runWithChanges()` vào DatabaseService + test ignored-insert trả `changes===0`.
3. Route `/webhook/messenger` vào `IntegrationRegistry` (GET verify + POST), raw body Buffer, match pathname.
4. `resolve entry[].id`→app→secret; verify; 403 nếu Page lạ/tắt.
5. Parser `entry[].messaging[]` + test payload mẫu (text, ảnh, echo, read).
6. `page-inbound-store.ts` ghi unified `messages`, dedupe, insert-trước-await.
7. `page-channel-adapter`→emit `event:channelMessage`; echo→self-path.
8. `page-backfill-service.ts`: persist không emit, cursor, concurrency cap, replay chỉ tin mới nhất.
9. Vòng đời tunnel theo mode + expose URL (UI Phase 6).

## Success Criteria

- [ ] Meta verify webhook OK (challenge trả đúng, kể cả có query string)
- [ ] Chữ ký sai → 403, **0 dòng** vào DB
- [ ] Tin tiếng Việt + emoji dài (vắt nhiều TCP chunk) verify **thành công** (không 403 do decode hỏng)
- [ ] Tin thật vào Page → `messages` (`channel='page'`, `is_sent=0`) trong ≤5s → emit `event:channelMessage`
- [ ] Cổng public **chỉ** lộ `/webhook/messenger`: thử `GET /api/sync/full` qua tunnel → không tồn tại/từ chối
- [ ] Gửi lại cùng payload 2 lần → 1 dòng DB, **1 emit** (dedupe theo `changes===1`)
- [ ] `message_echoes` → lưu + kích hoạt auto-pause (nhân viên trả lời tay → agent dừng thread)
- [ ] Tắt app, nhắn 3 tin, mở lại → backfill persist đủ, **không** bắn 3 trả lời; chỉ tin mới nhất được replay (nếu trong 24h)
- [ ] Test verify + parser xanh

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Named tunnel VPS chết mà app không biết | Trung bình | Cao | UI hiện "lần nhận webhook gần nhất"; quá lâu → cảnh báo đỏ |
| Vòng lặp tự trả lời do xử nhầm `message_echoes` | Trung bình | **Cao** | Echo vào self-path (chỉ pause), không vào reply path; test riêng |
| `IntegrationRegistry` server chưa chạy trên VPS (chỉ khởi khi có integration) | Trung bình | Cao | Page service tự đảm bảo server chạy khi có Page bật; nếu không, dựng `http.Server` 1-route riêng cho webhook |
| Meta gửi lại vì chậm → trùng | Cao | Trung bình | 200 ngay; `runWithChanges` dedupe; insert trước await (M3) |
| Backfill storm khi restart nhiều thread | Trung bình | Trung bình | Persist không emit; replay chỉ tin mới nhất; concurrency cap |
| Mất tin ngoài 20 gần nhất/hội thoại | Trung bình | Trung bình | Giới hạn Meta; VPS 24/7 giảm hẳn; nói thật trong UI |

**Giả định có thể vỡ:** rằng mở rộng `IntegrationRegistry` server dễ hơn dựng server riêng.
**Dấu hiệu vỡ:** server đó gắn chặt với vòng đời integration record, khó thêm route độc lập.
**Phản ứng đã định:** dựng `http.Server` 1-route riêng cho `/webhook/messenger` trên cổng cố định trong `fb_app.webhook_port`, vẫn bind localhost + tunnel chỉ cổng đó. Ghi lý do vào file này.
