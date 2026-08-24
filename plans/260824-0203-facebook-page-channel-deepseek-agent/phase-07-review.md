---
phase: 7
title: "Review + kiểm thử tích hợp"
status: pending
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
