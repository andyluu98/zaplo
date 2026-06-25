# Phase 3 — Đăng bài vào nhóm FB

## Context Links
- Phase 2 `facebook-post-service.ts` (buildStoryVariables — reuse, đổi target = groupId).
- `src/services/facebook/FacebookScanService.ts` — pattern lấy danh sách (group members) → tham khảo lấy danh sách NHÓM của user.
- ⚠️ Module posting agent-centric (Zalo) — context nói có, worktree KHÔNG có (chỉ stub `stats-tab.tsx`). XEM Q2.

## Overview
- Priority: P2. Risk: Med. Status: pending. Depends: P0, P2.
- Mô tả: đăng bài vào nhóm FB (target=groupId). Lý tưởng: tích hợp vào module đăng-nhóm agent-centric hiện có. Thực tế: phải xác minh module đó tồn tại trước.

## Key Insights
- Khác P2 chủ yếu ở `variables.target` (group id) + có thể audience cố định = group. doc_id có thể TRÙNG story-create cá nhân hoặc KHÁC → spike xác nhận.
- Cần danh sách nhóm FB user đang ở → 1 query GraphQL READ (giống scan) hoặc parse trang Groups. Là sub-spike nhỏ.
- TÍCH HỢP vs BUILD MỚI: nếu module posting agent-centric thật sự tồn tại (nhánh khác) → thêm FB như 1 channel bên cạnh Zalo (dùng chung Agent/Lịch/Chủ đề/Thống kê). Nếu KHÔNG → Phase 3 chỉ làm UI đăng-nhóm FB độc lập tối giản (KISS), KHÔNG tự dựng cả framework agent-centric (YAGNI).

## Requirements
Functional:
1. Lấy danh sách nhóm FB của account.
2. Chọn 1..n nhóm + soạn bài (text + ảnh, reuse P2).
3. Preview batch (mỗi nhóm 1 item) → duyệt → gửi tuần tự (delay giữa nhóm).
4. Log (type='post_group', target=groupId, dedupeKey=hash(groupId+text)).

Quyết định kiến trúc (sau Q2):
- Nếu posting module tồn tại: thêm `channel:'facebook'` vào agent/schedule; reuse sender abstraction.
- Nếu không: UI riêng `group-post-page.tsx`, không phụ thuộc.

## Architecture
```
listFacebookGroups(account) → [{groupId, name}]
   user chọn nhóm + bài (reuse compose P2)
   previewBatch (1 item/nhóm) → duyệt
   sendApproved loop: canSend('post_group') → delay
       → createGroupPost = sendMutation(docId.postGroup, variables{..., target:groupId})
       → record + progress
```

## Related Code Files
Create:
- `src/services/facebook/write/facebook-group-list-service.ts` (lấy danh sách nhóm — sub-spike doc_id read).
- `src/ui/components/facebook/post/group-post-page.tsx` (nếu build độc lập).

Modify:
- `facebook-post-service.ts` — thêm `createGroupPost(groupId, text, photoIds)`.
- `facebook-write-doc-ids.ts` — `postGroup` + `listGroups`.
- (Nếu tích hợp) các file module posting agent-centric — thêm FB channel. [chờ Q2]
- `electron/ipc/facebook-write-ipc.ts` — `post:group`, `groups:list`.

## Implementation Steps
1. Q2: xác nhận module posting agent-centric tồn tại? → chọn nhánh tích hợp / độc lập.
2. SPIKE: doc_id list-groups (read) + doc_id story-create-group (write) + variables target.
3. `facebook-group-list-service.ts` (read groups).
4. `facebook-post-service.createGroupPost()`.
5. IPC groups:list + post:group.
6. UI: chọn nhóm + reuse composer + preview-batch + duyệt.
7. Compile + test nick phụ: đăng 1 bài vào 1 nhóm test do mình tạo.

## Todo
- [ ] Q2 quyết định tích hợp/độc lập
- [ ] SPIKE doc_id list-groups + story-create-group
- [ ] group-list-service
- [ ] post-service.createGroupPost
- [ ] IPC groups:list / post:group
- [ ] UI group-post (hoặc thêm FB channel vào posting module)
- [ ] compile + test 1 nhóm test

## Success Criteria
- Liệt kê đúng nhóm của account.
- Đăng 1 bài vào nhóm test thành công, thấy trên nhóm.
- Gửi nhiều nhóm có delay; vượt giới hạn ngày → dừng.

## Risk Assessment
| Risk | L | I | Mitigation |
|------|---|---|-----------|
| Module posting không tồn tại → scope phình | High | Med | Mặc định BUILD ĐỘC LẬP tối giản; chỉ tích hợp nếu xác nhận có |
| doc_id group khác cá nhân | Med | High | Spike riêng cho group |
| Nhóm chặn link/duyệt bài | Med | Low | Báo trạng thái "chờ duyệt" từ response |

## Security Considerations
- Chỉ đăng vào nhóm trong danh sách trả về (account là thành viên). Validate groupId numeric.

## Next Steps
Hoàn tất bộ "đăng bài". Còn lại P4 (reply DM) độc lập + P5 spike.
