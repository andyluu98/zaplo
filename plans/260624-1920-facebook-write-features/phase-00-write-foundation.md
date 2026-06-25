# Phase 0 — Nền tảng GHI dùng chung

## Context Links
- `src/services/facebook/FacebookUtils.ts:121` — `buildFormData` (đã gắn fb_dtsg/jazoest/__user/av/doc_id).
- `src/services/facebook/FacebookCreateNotes.ts` — mẫu mutation chạy thành công (reuse pattern).
- `src/services/facebook/FacebookScanService.ts:1018` — pattern rate-limit delay (300-800ms random).
- `src/services/facebook/FacebookAttachment.ts` — upload ảnh (multipart thủ công, đã fix lỗi 0KB).
- `src/services/database/DatabaseService.ts:1266` — `migrate()` (pattern try/catch ALTER).

## Overview
- Priority: P1 (chặn mọi phase sau).
- Status: pending.
- Mô tả: dựng 1 service ký+gửi mutation GHI, 1 nơi gom doc_id, 1 rate-limiter có giới hạn ngày, 1 bảng log hành động ghi + dedupe, 1 cơ chế duyệt-tay (preview→approve→send loạt).

## Key Insights
- KHÔNG cần access_token để ghi: `fb_dtsg` (có từ cả cookie lẫn email/pass login) là đủ. Đã chứng minh bởi createNote.
- `buildFormData` lo phần ký; phần thay đổi giữa các mutation chỉ là `friendlyName`, `docId`, `variables` → trừu tượng hóa được thành 1 hàm `sendMutation(dataFB, {friendlyName, docId, variables, extraForm?})`.
- Rate-limit hiện chỉ là delay/request. GHI cần thêm: giới hạn/ngày/loại + đếm theo account (an toàn nick).
- DB: bảng MỚI `fb_action_log` tạo trong `createTables` là OK; nhưng nếu sau này ALTER thêm cột → phải qua `migrate()`.

## Requirements
Functional:
1. `FacebookWriteService.sendMutation()` — gửi 1 GraphQL mutation, parse response, trả `{success, id?, error?, raw?}`.
2. `facebook-write-doc-ids.ts` — export object `FB_WRITE_DOC_IDS` (key = tên hành động, value = `{docId, friendlyName}`); ban đầu để TRỐNG/placeholder + comment hướng dẫn SPIKE.
3. `FacebookWriteRateLimiter` — `canSend(accountId, actionType)` + `record(accountId, actionType)`; đọc giới hạn từ config; random delay trước mỗi gửi.
4. Bảng `fb_action_log` + `FacebookActionLogService` — ghi mỗi hành động (accountId, actionType, target, status, error, dedupeKey, createdAt). Dedupe: bỏ qua nếu `(accountId, actionType, dedupeKey)` đã success.
5. Cơ chế duyệt-tay: kiểu dữ liệu `WriteBatchItem` + IPC `facebook:write:previewBatch` / `facebook:write:sendApproved` (gửi tuần tự, delay, dừng khi quá giới hạn ngày).

Non-functional: file <200 dòng/each; không block UI (gửi loạt async + progress event).

## Architecture
Data flow (gửi 1 hành động ghi):
```
UI (chọn target + nội dung)
  → IPC facebook:write:*  → FacebookWriteRateLimiter.canSend?  ──no──> trả lỗi "vượt giới hạn ngày"
                                         │yes
                                         ▼
                          random delay  →  FacebookWriteService.sendMutation(doc_id, variables)
                                         │   (buildFormData ký, axios POST, parseFBResponse)
                                         ▼
                          FacebookActionLogService.record(...)  →  rateLimiter.record(...)
                                         ▼
                          emit 'facebook:write:progress' → UI cập nhật
```
Module mới gom vào thư mục `src/services/facebook/write/`.

## Related Code Files
Create:
- `src/services/facebook/write/facebook-write-service.ts`
- `src/services/facebook/write/facebook-write-doc-ids.ts`
- `src/services/facebook/write/facebook-write-rate-limiter.ts`
- `src/services/facebook/write/facebook-action-log-service.ts`
- `src/services/facebook/write/facebook-write-types.ts`
- `electron/ipc/facebook-write-ipc.ts` (đăng ký các handler write)

Modify:
- `src/services/database/DatabaseService.ts` — thêm `CREATE TABLE fb_action_log` trong createTables (bảng MỚI, an toàn).
- file đăng ký IPC chính (vd `electron/main.ts` hoặc nơi require các *Ipc) — wire `facebook-write-ipc`.
- `src/preload.ts` (hoặc tương đương) — expose `window.facebookWrite` (verify tên file preload).

Delete: none.

## Implementation Steps
1. Tạo `facebook-write-types.ts`: `WriteResult`, `WriteActionType` (`'comment'|'post_personal'|'post_group'|'reply_dm'`), `WriteBatchItem`, `RateLimitConfig`.
2. Tạo `facebook-write-doc-ids.ts`: object rỗng + JSDoc cách dò doc_id qua DevTools. KHÔNG điền số giả.
3. Tạo `facebook-write-service.ts`: `sendMutation(dataFB, {friendlyName, docId, variables, extraForm?, httpsAgent?})` — copy khung từ `createNote`, dùng `buildFormData` + `parseFBResponse`.
4. Tạo `facebook-write-rate-limiter.ts`: in-memory counter theo `(accountId, actionType, yyyy-mm-dd)` + đọc giới hạn từ config (default an toàn, chờ Q4); `randomDelay()`.
5. DB: thêm `CREATE TABLE IF NOT EXISTS fb_action_log(...)` + index `(account_id, action_type, dedupe_key)`.
6. Tạo `facebook-action-log-service.ts`: `record()`, `isDuplicate()`, `statsByDay()`, `recent()`.
7. Tạo `facebook-write-ipc.ts`: handler `previewBatch` (validate, trả danh sách item + ước tính giới hạn), `sendApproved` (loop tuần tự: dedupe→canSend→delay→sendMutation→record→emit progress).
8. Wire IPC + preload. Compile (`npm run build` hoặc tsc) → 0 lỗi.

## Todo
- [x] write-types
- [x] write-doc-ids (placeholder + hướng dẫn)
- [x] write-service.sendMutation
- [x] rate-limiter + daily limit
- [x] fb_action_log table + service
- [x] write-ipc (previewBatch/sendApproved) + progress event
- [x] wire IPC + preload
- [x] compile pass (electron + renderer tsc, 0 lỗi)

## Success Criteria
- `sendMutation` gửi được createNote (test lại bằng doc_id đã biết của note) → chứng minh service đúng trước khi có doc_id mới.
- `fb_action_log` ghi đúng + dedupe chặn gửi trùng.
- rate-limiter chặn khi vượt giới hạn ngày (unit test giả lập).
- `sendApproved` gửi loạt tuần tự có delay, emit progress, dừng đúng khi đạt giới hạn.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| doc_id chưa có → chưa test mutation thật | High | Med | Test khung bằng note doc_id đã biết; doc_id thật = Q1 spike |
| Giới hạn ngày đặt sai → khóa nick | Med | High | Default thận trọng + duyệt tay bắt buộc + chờ Q4 |
| Bảng mới gây lỗi khởi tạo DB | Low | High | CREATE IF NOT EXISTS, không ALTER cột cũ |

## Security Considerations
- Không log `fb_dtsg`/cookie vào `fb_action_log`. Chỉ log id/target/status/error.
- Validate target id (numeric/regex) trước khi nhét vào variables.

## Next Steps
Mở khóa P1, P2, P4. P1 nên làm đầu tiên (rủi ro thấp nhất, reuse postId scan).
