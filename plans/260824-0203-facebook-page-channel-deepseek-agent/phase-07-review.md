---
phase: 7
title: "Review + kiểm thử tích hợp"
status: done
priority: P1
effort: "1d"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Review + kiểm thử tích hợp

> **Đã bổ sung sau red-team 2026-08-24**: các ca kiểm mới cho lỗ hổng đã tìm ra (webhook exposure, HMAC đa-byte, migration DB cũ, reasoning không rò, dedupe, thinking không phá JSON Zalo, workflow dead-model).

## Overview

Cổng chất lượng cuối: **không hồi quy** ở kênh sản xuất (Zalo, FB cá nhân) và **luồng đầu-cuối** Page. Nhiều ca dưới đây là hệ quả trực tiếp của red-team — không bỏ.

## Kịch bản đầu-cuối Page

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Khách nhắn tin đầu | Hiện UI ≤5s; agent trả lời ~10-20s có typing |
| 2 | Khách 3 tin rời trong 5s | **1** lượt trả lời |
| 3 | Hỏi thứ có trong knowledge | Trích đúng, không bịa |
| 4 | Hỏi thứ không có | Hỏi lại/bàn giao, không bịa |
| 5 | Xin gặp người thật | Agent dừng, vào hàng chờ |
| 6 | **Nhân viên trả lời tay** (Messenger/Business Suite) | Agent **auto-pause** thread (echo self-path — red-team C6) |
| 7 | Tin cuối khách quá 24h | **0** call API; thread đánh dấu |
| 8 | Tắt app, khách 2 tin, mở lại | Backfill persist đủ; **không** bắn 2 trả lời; chỉ tin mới nhất replay nếu ≤24h (red-team M4) |
| 9 | Gửi lại payload webhook 2 lần | 1 dòng DB, **1** emit, 1 trả lời (red-team M3) |
| 10 | Khách gửi **tiếng Việt + emoji dài** (vắt TCP chunk) | Verify HMAC **thành công**, không 403 (red-team H2) |
| 11 | Segment ảnh từ knowledge | Ảnh **đến** khách (red-team H7) |
| 12 | Trả lời có thinking | `ai_reasoning_log` lưu được; **0** ký tự reasoning vào tin khách |
| 13 | Token Page thu hồi giữa chừng | Page dừng gọn, UI báo kết nối lại |

## Kiểm không hồi quy (kênh sản xuất)

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| R1 | Auto-reply Zalo DM | Y như trước Phase 1 |
| R2 | Zalo nhóm, trigger @mention | Y như trước (mentions/msgId bảo toàn — red-team C3) |
| R3 | Debounce gộp tin Zalo | Y như trước |
| R4 | Bàn giao Người↔AI Zalo | Y như trước |
| R5 | FB cá nhân qua MQTT | Không bị lớp kênh ảnh hưởng |
| R6a | Trợ lý lưu `deepseek-chat` | Gọi được (map) |
| R6b | **Workflow AI node** lưu `deepseek-chat` | Gọi được (bản copy đã xoá — red-team M1) |
| R7 | Assistant thinking off + `chatForWorkflow` | JSON parse được, không truncate (red-team H5) |
| R8 | Chuyển workspace giữa hội thoại | Không rò state cũ (red-team M6) |
| R9 | Zalo dùng `typing-delay` chung | Pacing không đổi (red-team H6) |

## Rà bảo mật

- [ ] Cổng public **chỉ** lộ `/webhook/messenger`; `GET /api/sync/full`/`/api/auth/login` qua tunnel → không truy cập được (red-team C1)
- [ ] `grep -rn "access_token\|app_secret\|verify_token" src electron` — không giá trị thô vào `Logger`
- [ ] Token/secret trong DB mã hoá; VPS không mã hoá được → **từ chối lưu** (red-team H1)
- [ ] Webhook từ chối chữ ký sai + thiếu header (curl)
- [ ] `ai_reasoning_log` **không** trong `SYNCABLE_TABLES_GLOBAL` — reasoning khách không rời máy (red-team H4)
- [ ] App Secret không trong `dist-electron/`
- [ ] OAuth có `state` + exact redirect match (red-team M5)
- [ ] Nội dung tin khách không log mức info

## Implementation Steps

1. `npx jest`
2. `npx tsc --noEmit` + `npx tsc -p tsconfig.electron.json --noEmit`
3. 13 kịch bản đầu-cuối (Page thật)
4. 9+ ca không hồi quy
5. Checklist bảo mật
6. `/ak:code-review` toàn bộ thay đổi
7. Sửa phát hiện, chạy lại phần ảnh hưởng
8. Cập nhật `README.md` nếu tính năng người dùng thấy được đổi
9. Cập nhật `plans/260624-1920-facebook-write-features/plan.md`: P5 thay thế, P4 thu hẹp

## Success Criteria

- [ ] 13/13 đầu-cuối đạt
- [ ] 9/9 không hồi quy đạt
- [ ] Checklist bảo mật sạch
- [ ] `npx jest` xanh; cả 2 typecheck sạch
- [ ] `/ak:code-review` không còn mức chặn
- [ ] Plan cũ đã cập nhật

## Risk Assessment

| Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|
| Hồi quy lộ sau khi dùng thật một thời gian | Trung bình | **Cao** | Chạy song song Zalo+Page vài ngày trước khi coi là xong |
| Kiểm thử cần Page thật + app Meta cấu hình | **Cao** | Trung bình | Chuẩn bị Page test + app dev mode **từ Phase 2** |
| Chi phí DeepSeek khi kiểm | Trung bình | Thấp | `v4-flash` rẻ; theo dõi `ai_usage_logs` |

**Giả định có thể vỡ:** có Page thật để kiểm.
**Dấu hiệu vỡ:** tới Phase 7 vẫn chưa kết nối được Page test nào.
**Phản ứng đã định:** dừng, tạo Page test, hoàn tất Phase 2 trước. Không đánh dấu hoàn thành dựa trên mô phỏng.

## Kết quả triển khai (2026-08-24)

**Trạng thái:** **Done** cho cổng tự động + rà tĩnh + code-review. **Kịch bản E2E live vẫn CHỜ kiểm thủ công** — không tự đánh dấu đạt (theo "Phản ứng đã định" ở trên).

### Cổng tự động (đã chạy)
- **`npx jest` (full, runInBand):** 33 suites / 246 tests, **0 fail**. Gồm mọi suite mới: vision-support, typing-delay, messaging-window, thinking-support, chat-agent-message-aggregator, page-schema-migration, page-webhook-parse/verify.
- **Typecheck:** `tsc --noEmit` (renderer) + `tsc -p tsconfig.electron.json --noEmit` — cả 2 exit 0.

### Rà bảo mật tĩnh (checklist §"Rà bảo mật")
- ✅ **C1** — webhook Messenger phục vụ bởi `IntegrationRegistry.startWebhookServer` (port 9888, bind 127.0.0.1), **tách** khỏi `HttpRelayService` (relay sync nhân viên `/api/sync/*`, `/api/auth/login`). `event:channelMessage` không nằm trong `RELAY_CHANNELS`; `TunnelService` là singleton một-tunnel → hai bề mặt public loại trừ nhau. Tunnel chỉ trỏ `getWebhookPort()`.
- ✅ **H2** — routing khớp trên `pathname` đã parse tách query; HMAC `X-Hub-Signature-256` tính trên **raw Buffer** trước mọi đọc/ghi; body UTF-8 (tiếng Việt + emoji) verify đúng, không re-encode.
- ✅ **H4** — `ai_reasoning_log` KHÔNG trong `SYNCABLE_TABLES_BY_ZALO`/`_GLOBAL`; `fb_app`/`fb_page` (token mã hoá) cũng không sync → reasoning + secret không rời máy.
- ✅ **H1** — `encryptStrict` ném `EncryptionUnavailableError`, không lưu plaintext khi máy không mã hoá được.
- ✅ Không giá trị thô `access_token`/`app_secret`/`verify_token`/token giải mã vào `Logger.*`; nội dung tin khách không log mức info.
- ✅ Gửi tay `fbpage:sendMessage/sendImage`: cổng 24h **per-PSID** (`getPageThreadLastInboundAt`), `sent_by='human'`, không trả `*_enc` cho renderer.
- ✅ Chữ ký sai/thiếu header → 403, không ghi DB (unit `page-webhook-verify`).

### Code-review tổng thể (branch `ab2b046..HEAD`, 5 commit, ~90 file)
- **Kết luận: không blocker.** Mọi ràng buộc cứng 1–4 PASS: không hồi quy Zalo/FB cá nhân ở mọi file dùng chung (dispatcher, aggregator, thinking/AIAssistantService, typing-delay↔WorkflowEngine, channelIpc, DatabaseService migration idempotent); tách webhook/relay; reasoning/token không sync; HMAC raw-body; gửi tay per-PSID; hợp đồng công khai giữ nguyên (param mới optional default `'zalo'`).
- **Đã sửa (non-blocking #1):** `MessageInput.tsx` — throw ở nhánh **video** (`:1373`) và **text** (`:1416`) trước đây áp cho mọi kênh non-zalo, khiến FB cá nhân lệch (hiện notification lỗi + bỏ `markReplied` khi `success:false`). Đã guard `ch === 'page' &&` cho cả hai, khớp nhánh ảnh (`:1332`) và ý định Phase 6 (FB byte-identical; abort-on-error chỉ áp Page). Không phải abort batch (mỗi item có try/catch riêng) — chỉ là UX per-item; tsc lại sạch sau sửa.
- **Ghi chú invariant (không sửa, low-impact):**
  - Echo dedupe dựa `message_id` (Send API) == `mid` (webhook echo) — đúng theo hành vi Messenger hiện tại; self-guard `appId === page.app_id` vẫn chặn nhầm human-handoff dù id lệch.
  - `storeInboundMessage` set `last_customer_message_at = ev.ts` vô điều kiện → backfill offline có thể lùi giá trị page-wide; **không** ảnh hưởng cổng gửi (dùng per-PSID MAX), chỉ ảnh hưởng typing/seen trong `resolve()`.

### CHỜ kiểm thủ công (cần Page thật + app Meta dev-mode)
- **13 kịch bản đầu-cuối Page** (bảng §"Kịch bản đầu-cuối Page") — chưa chạy: cần Page test kết nối + webhook live.
- **Phần runtime của 9 ca không hồi quy** (R1–R9): phần logic thuần đã phủ bởi unit test; phần chạy-thực (Zalo DM/nhóm live, FB MQTT, chuyển workspace) chờ chạy app thật.
- **curl webhook chữ ký sai/thiếu header**, **OAuth state + redirect match (M5)**, **App Secret không trong `dist-electron/`**: xác minh khi có môi trường build/deploy thật.
> Theo "Phản ứng đã định": KHÔNG đánh dấu các mục này đạt cho tới khi kiểm trên Page thật.

### Docs
- `README.md` + `README.en.md`: thêm mục kênh Facebook Page (Messenger + chatbot DeepSeek đọc ảnh, cửa sổ 24h, auto-pause khi người trả lời tay).
- `plans/260624-1920-facebook-write-features/plan.md`: ghi P4 blocker (lớp trừu tượng kênh) đã gỡ trên nhánh này.
