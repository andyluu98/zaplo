/**
 * facebook-write-doc-ids.ts
 * NƠI GOM TẬP TRUNG doc_id + friendlyName cho mọi GraphQL mutation GHI.
 *
 * ⚠️ doc_id của Facebook ĐỔI LIÊN TỤC. Khi mutation hỏng → cập nhật DUY NHẤT file này.
 *
 * ─── CÁCH DÒ doc_id (SPIKE — bắt buộc làm trước khi P1/P2/P3 gửi thật) ───────────
 * 1. Mở facebook.com trên Chrome (đăng nhập sẵn) → F12 → tab Network.
 * 2. Lọc ô filter: gõ `api/graphql` (hoặc `graphql`).
 * 3. Thực hiện hành động thật (vd: viết 1 comment vào 1 bài).
 * 4. Click request `graphql` vừa xuất hiện → tab Payload (Form Data).
 * 5. Copy 2 trường: `fb_api_req_friendly_name` → friendlyName, `doc_id` → docId.
 * 6. Xem `variables` (JSON) để biết cấu trúc tham số → dùng ở phase tương ứng.
 * 7. Điền vào object bên dưới (thay null). KHÔNG ĐOÁN SỐ.
 *
 * Tham chiếu mutation đã chạy thật trong app: CometCreateNoteMutation
 * (xem src/services/facebook/FacebookCreateNotes.ts) — dùng để test khung service.
 */

import type { WriteActionType } from './facebook-write-types';

export interface DocIdEntry {
  /** Giá trị `fb_api_req_friendly_name` quan sát từ DevTools. */
  friendlyName: string;
  /** Giá trị `doc_id` quan sát từ DevTools. null = CHƯA DÒ → chặn gửi. */
  docId: string | null;
}

/**
 * Bảng doc_id theo loại hành động. null nghĩa là CHƯA có → service từ chối gửi
 * với lỗi rõ ràng thay vì gửi request hỏng.
 */
export const FB_WRITE_DOC_IDS: Record<WriteActionType, DocIdEntry> = {
  // P1 — viết comment vào bài (feedback_id base64 + text). Dò 2026-06-25.
  comment:       { friendlyName: 'useCometUFICreateCommentMutation', docId: '27110396558617941' },
  // P2 — đăng bài lên tường cá nhân. Dò 2026-06-25 (chung doc_id với post_group).
  post_personal: { friendlyName: 'ComposerStoryCreateMutation',   docId: '27638478529090712' },
  // P3 — đăng bài vào nhóm (target = group_id → audience.to_id). Chung doc_id với post_personal.
  post_group:    { friendlyName: 'ComposerStoryCreateMutation',   docId: '27638478529090712' },
  // P4 — reply DM dùng đường gửi tin nhắn hiện có (FacebookSendService), KHÔNG cần doc_id ở đây
  reply_dm:      { friendlyName: '',                              docId: null },
};

/** doc_id của Note — ĐÃ BIẾT, dùng để smoke-test khung sendMutation. */
export const KNOWN_NOTE_DOC_ID = '7370547589079803';
export const KNOWN_NOTE_FRIENDLY_NAME = 'CometCreateNoteMutation';

/** true nếu loại hành động đã có doc_id để gửi thật. */
export function hasDocId(actionType: WriteActionType): boolean {
  return !!FB_WRITE_DOC_IDS[actionType]?.docId;
}
