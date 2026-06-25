# Phase 5 — Fanpage as Page (SPIKE — rủi ro cao)

## Context Links
- Phase 0-2 (write-service + doc-ids + post pattern) làm nền.
- `src/services/facebook/FacebookLoginHelper.ts:52` — email/pass login trả `access_token` (có thể liên quan page token, cần kiểm).
- KHÔNG có pattern `av=page_id` / page-actor nào trong code hiện tại.

## Overview
- Priority: P3. Risk: HIGH. Status: pending (SPIKE/đề xuất, KHÔNG cam kết code chắc).
- Mô tả: đăng bài + đọc/đáp inbox + comment DƯỚI DANH NGHĨA Page. Cần dựng cơ chế "đóng vai Page" từ đầu.

## Key Insights / Cảnh báo
- Đây là phase NGHIÊN CỨU KHẢ THI, không phải phase implement chắc chắn. Output chính = báo cáo spike + đề xuất go/no-go.
- "Đóng vai Page" trên web FB thường thay đổi actor: `av=<page_id>`, có thể cần page-scoped `fb_dtsg`/token riêng. CHƯA biết cơ chế chính xác trong app này → SPIKE.
- doc_id cho page-post / page-inbox khác personal, dễ vỡ hơn.
- Rủi ro KHÓA PAGE cao nếu thao tác bất thường (đăng/inbox tự động dày).

## Requirements (chỉ định nghĩa mục tiêu spike)
1. Xác định cách lấy danh sách Page mà account quản lý.
2. Xác định cơ chế page-actor: trường nào trong form (av/actor_id/page token) để FB hiểu hành động là của Page.
3. PoC: đăng 1 bài dưới danh nghĩa Page (nick + page test).
4. PoC: đọc 1 hội thoại inbox Page + gửi 1 reply.
5. Đánh giá độ ổn định doc_id + rủi ro khóa → khuyến nghị.

## Architecture (giả thuyết — cần xác minh)
```
listManagedPages(account) → [{pageId, name}]
   resolvePageActor(pageId) → { av=pageId, pageDtsg?/token? }   ← PHẦN CHƯA BIẾT
   pageCreatePost = sendMutation(docId.pagePost, variables, extraForm:{av:pageId,...})
   pageInboxList / pageReply = các mutation/query page-scoped (spike)
```

## Related Code Files (dự kiến, nếu go)
Create:
- `src/services/facebook/write/facebook-page-actor.ts` (resolve page-actor — lõi spike).
- `src/services/facebook/write/facebook-page-service.ts` (post/inbox/comment as page).
- UI quản lý Page (sau khi PoC ổn).

Modify:
- `facebook-write-doc-ids.ts` — nhóm `page*` doc_id.
- Có thể cần mở rộng `buildFormData` cho `av` tùy biến (hiện `av=FacebookID`).

## Implementation Steps (spike-first)
1. SPIKE-A: DevTools trên FB web — chuyển sang "đăng với tư cách Page", quan sát request đăng bài Page → ghi doc_id, friendlyName, các trường actor (av, actor_id), có page token không.
2. SPIKE-B: quan sát Page inbox (đọc + reply) → endpoint/doc_id.
3. SPIKE-C: kiểm `access_token` từ email/pass login có dùng được cho page API không.
4. Viết báo cáo spike (reports/) + khuyến nghị go/no-go + ước lượng rủi ro.
5. (Chỉ nếu go) PoC tối thiểu: 1 page-post bằng nick+page test.

## Todo
- [ ] SPIKE-A page post actor + doc_id
- [ ] SPIKE-B page inbox doc_id
- [ ] SPIKE-C access_token khả dụng?
- [ ] Báo cáo spike + go/no-go
- [ ] (nếu go) PoC page-post

## Success Criteria (của spike)
- Tài liệu rõ: doc_id + cơ chế page-actor + có/không page token.
- Kết luận go/no-go có cơ sở (kèm rủi ro khóa Page).
- (Nếu go) PoC đăng 1 bài Page thành công.

## Risk Assessment
| Risk | L | I | Mitigation |
|------|---|---|-----------|
| Cơ chế page-actor không tái lập được | High | High | Spike trước; chấp nhận no-go nếu không rõ |
| Khóa Page do tự động hóa | Med | High | Page test + thao tác thưa + duyệt tay tuyệt đối |
| doc_id page đổi liên tục | High | Med | Gom doc-ids; coi là tính năng beta |
| access_token không đủ quyền | Med | Med | Fallback cookie/fb_dtsg page-scoped (nếu tồn tại) |

## Security Considerations
- Tách biệt credential Page; không log token. Cảnh báo user rõ rủi ro trước khi bật.

## Next Steps
Chỉ bắt đầu sau khi P0-P2 chứng minh pipeline GHI ổn định. Kết quả spike quyết định có làm tiếp.
