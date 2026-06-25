# Phase 1 — Auto-comment vào bài đã scan

## Context Links
- `src/services/facebook/FacebookScanTypes.ts:73,97` — kết quả scan có field `postId`.
- `src/services/facebook/FacebookScanTabService.ts` — tab scan lưu items (JSON) → nguồn post_id.
- `src/services/ai/AIAssistantService.ts:528` — `chat()` soạn nội dung comment.
- Phase 0 services (write-service, rate-limiter, action-log, doc-ids).

## Overview
- Priority: P1. Risk: Med (phụ thuộc doc_id CommentCreate). Status: pending. Depends: P0.
- Mô tả: từ tab scan đã có post_id → soạn comment (tay hoặc AI) → preview → duyệt → gửi loạt nhỏ → log + thống kê.

## Key Insights
- KHÔNG cần crawl lại bài: post_id đã nằm trong dữ liệu scan → chỉ đọc lại từ `FacebookScanTabService`.
- Comment là hành động rủi ro thấp nhất (không tạo nội dung tường lớn, dễ xóa) → làm đầu để validate toàn pipeline GHI.
- AI soạn comment: gọi `AIAssistantService.chat()` với prompt = nội dung bài + tone mong muốn. Cho phép sửa tay trước khi duyệt.

## Requirements
Functional:
1. Lấy danh sách post_id từ 1 scan tab (chọn tab → list bài).
2. Soạn comment: nhập tay HOẶC nút "AI gợi ý" (gọi chat()).
3. Preview batch: bảng (post_id | comment | trạng thái dedupe | còn trong giới hạn ngày?).
4. Duyệt → gửi tuần tự qua `FacebookWriteService.sendMutation(CommentCreate)`.
5. Log vào `fb_action_log` (actionType='comment', target=post_id, dedupeKey=post_id).
6. Thống kê: số comment hôm nay/loại, link xem lại.

Non-functional: dừng ngay khi 1 lỗi auth (fb_dtsg hết hạn) để tránh spam fail.

## Architecture
```
ScanTab items ──pick──> [post_id...]
        │
   (AI chat() | tay) ──> comment text per post
        │
   previewBatch ──> WriteBatchItem[]  (UI hiển thị, user tick chọn)
        │ approve
   sendApproved (P0) loop:
        dedupe(post_id)? → canSend('comment')? → delay
            → sendMutation(friendlyName:'CommentCreateMutation'?, docId:FB_WRITE_DOC_IDS.comment,
                           variables:{ input:{ message:{text}, feedback_id: base64(post_id?), actor_id } })
            → record + progress
```
⚠️ Cấu trúc `variables` của CommentCreate và việc post_id có cần encode base64 `feedback:<id>` là phần SPIKE (Q1).

## Related Code Files
Create:
- `src/services/facebook/write/facebook-comment-service.ts` (build variables comment, gọi write-service).
- `src/ui/components/facebook/comment/comment-batch-page.tsx` (chọn tab→bài→soạn→preview→duyệt).
- `src/ui/components/facebook/comment/comment-preview-table.tsx` (<200 dòng).

Modify:
- `electron/ipc/facebook-write-ipc.ts` — thêm handler `comment:fromScanTab`, `comment:aiSuggest`.
- `src/services/facebook/write/facebook-write-doc-ids.ts` — điền `comment` sau spike.
- nơi đăng ký route/tab UI Facebook — thêm entry "Auto-comment".

## Implementation Steps
1. SPIKE doc_id: dò `CommentCreate` (DevTools khi comment thật) → điền doc-ids. (CHẶN bước 2+.)
2. `facebook-comment-service.ts`: `buildCommentVariables(postId, text, actorId)` + `commentOnPost()`.
3. IPC `comment:aiSuggest`: nhận bài → `AIAssistantService.chat()` → trả text.
4. IPC `comment:fromScanTab`: đọc tab → trả `[{postId, snippet}]`.
5. UI page: chọn tab → list bài → soạn/AI → preview-table → "Duyệt & gửi" → progress.
6. Wire dedupe (post_id) + giới hạn ngày qua P0.
7. Compile + test nick phụ: gửi 2 comment thật → kiểm trên FB + log.

## Todo
- [ ] SPIKE doc_id CommentCreate → điền doc-ids
- [ ] comment-service (build variables + send)
- [ ] IPC aiSuggest + fromScanTab
- [ ] UI batch page + preview table
- [ ] dedupe + daily limit wired
- [ ] compile + test 2 comment nick phụ

## Success Criteria
- Gửi 2-3 comment thật thành công, hiển thị đúng trên FB web.
- Gửi lại cùng post_id bị dedupe chặn.
- Vượt giới hạn ngày → dừng + báo rõ.
- AI gợi ý ra comment hợp ngữ cảnh bài.

## Risk Assessment
| Risk | L | I | Mitigation |
|------|---|---|-----------|
| doc_id/variables CommentCreate sai | High | High | Spike trước; test nick phụ; doc-ids gom 1 chỗ dễ sửa |
| Comment hàng loạt → flag spam | Med | High | Giới hạn ngày thấp + delay lớn + duyệt tay |
| post_id format khác (cần base64 feedback id) | Med | Med | Xác minh trong spike, thử cả raw lẫn encoded |

## Security Considerations
- Sanitize text comment (loại ký tự điều khiển). Không gửi text rỗng.
- Không comment lên post_id ngoài danh sách scan (chống lạm dụng).

## Next Steps
Validate xong pipeline GHI → tự tin sang P2 (post). Báo cáo doc_id thật vào reports.
