# Phase 2 — Đăng bài tường cá nhân

## Context Links
- `src/services/facebook/FacebookAttachment.ts` — upload ảnh (multipart thủ công, trả attachment id).
- `src/services/ai/AIAssistantService.ts:528` — soạn nội dung bài.
- Phase 0 write-service / doc-ids / rate-limiter / action-log.

## Overview
- Priority: P2. Risk: Med (doc_id story-create + ghép ảnh). Status: pending. Depends: P0.
- Mô tả: soạn bài (text + ảnh) → đăng ngay hoặc hẹn giờ → log.

## Key Insights
- Upload ảnh ĐÃ có (`FacebookAttachment.ts`) nhưng đang dùng cho Messenger (endpoint mercury upload). Đăng bài tường có thể cần endpoint upload ảnh KHÁC (composer photo upload) → cần verify trong spike, KHÔNG giả định dùng lại y nguyên.
- story-create variables thường gồm: message text, audience/privacy, attachments (photo ids). Cấu trúc chính xác = SPIKE.
- "Hẹn giờ" KHÔNG nên gọi FB schedule API (phức tạp, dễ vỡ) — KISS: hẹn giờ phía app (lưu DB + scheduler nội bộ gọi đăng-ngay khi tới giờ). YAGNI: chỉ làm nếu user cần.

## Requirements
Functional:
1. Soạn bài: text (tay/AI) + 0..n ảnh.
2. Chọn quyền riêng tư (public/friends) nếu spike xác định được field.
3. Đăng ngay → sendMutation(story-create).
4. (Tùy chọn) Hẹn giờ: lưu `fb_scheduled_post` + scheduler nội bộ.
5. Log action (type='post_personal', dedupeKey=hash(text+time)).

Non-functional: ảnh upload tuần tự, báo tiến độ; giới hạn post/ngày rất thấp.

## Architecture
```
UI compose (text + images[])
  → upload ảnh (FacebookAttachment hoặc composer-upload mới) → [photoId...]
  → buildStoryVariables(text, photoIds, privacy)
  → sendMutation(friendlyName:'StoryCreateMutation'?, docId:FB_WRITE_DOC_IDS.postPersonal, variables)
  → record + emit

Hẹn giờ:
  UI → lưu fb_scheduled_post(status='pending', runAt)
  internal scheduler (setInterval/cron nhẹ) → tới giờ → chạy nhánh "đăng ngay" → cập nhật status
```

## Related Code Files
Create:
- `src/services/facebook/write/facebook-post-service.ts` (build story variables + upload ảnh + send).
- `src/services/facebook/write/facebook-post-scheduler.ts` (nếu làm hẹn giờ; nội bộ, KISS).
- `src/ui/components/facebook/post/personal-post-composer.tsx`.

Modify:
- `electron/ipc/facebook-write-ipc.ts` — `post:personal`, `post:uploadImage`, `post:schedule`.
- `facebook-write-doc-ids.ts` — điền `postPersonal`.
- DB: bảng MỚI `fb_scheduled_post` (chỉ khi làm hẹn giờ).

## Implementation Steps
1. SPIKE: doc_id story-create cá nhân + cấu trúc variables + endpoint upload ảnh composer.
2. `facebook-post-service.ts`: `uploadImages()` (reuse/đặt mới) → `createPersonalPost(text, photoIds, privacy)`.
3. IPC post:personal + post:uploadImage.
4. UI composer: text + AI + image picker + preview + "Đăng ngay".
5. (Tùy chọn) scheduler: bảng `fb_scheduled_post` (qua createTables) + service quét.
6. Compile + test nick phụ: đăng 1 bài text, 1 bài có ảnh.

## Todo
- [ ] SPIKE doc_id story-create + upload-ảnh-composer
- [ ] post-service (upload + createPersonalPost)
- [ ] IPC post:personal / uploadImage
- [ ] UI composer (text + AI + ảnh)
- [ ] (tùy chọn) scheduler hẹn giờ
- [ ] compile + test nick phụ

## Success Criteria
- Đăng bài text thành công, thấy trên tường.
- Đăng bài kèm ≥1 ảnh thành công.
- (Nếu làm) hẹn giờ: bài tự đăng đúng giờ, status cập nhật.

## Risk Assessment
| Risk | L | I | Mitigation |
|------|---|---|-----------|
| Upload ảnh composer khác mercury endpoint | High | Med | Spike xác định endpoint; fallback đăng text-only trước |
| doc_id story-create sai | High | High | Spike + doc-ids tập trung |
| Đăng nhiều bài → flag | Med | High | Giới hạn ngày thấp + duyệt tay |

## Security Considerations
- Validate đường dẫn ảnh local (chống path traversal). Giới hạn kích thước/định dạng ảnh.

## Next Steps
Mở khóa P3 (group post tái dùng buildStoryVariables, đổi target).
