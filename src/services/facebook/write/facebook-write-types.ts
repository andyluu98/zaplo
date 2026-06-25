/**
 * facebook-write-types.ts
 * Kiểu dữ liệu dùng chung cho các tính năng GHI Facebook (comment, đăng bài, reply DM).
 * Tách riêng để các file write khác import mà không phụ thuộc lẫn nhau.
 */

/** Loại hành động ghi — dùng làm khóa rate-limit + log + doc-id. */
export type WriteActionType = 'comment' | 'post_personal' | 'post_group' | 'reply_dm';

/** Kết quả 1 lần gửi mutation ghi. */
export interface WriteResult {
  success: boolean;
  /** id đối tượng tạo ra (comment id / story id / message id) nếu có. */
  id?: string;
  error?: string;
  /** Raw JSON đã parse — chỉ dùng để debug, KHÔNG log ra ngoài. */
  raw?: any;
}

/** 1 item trong loạt cần duyệt-tay trước khi gửi. */
export interface WriteBatchItem {
  /** Loại hành động. */
  actionType: WriteActionType;
  /** Đối tượng đích: post_id (comment), '' hoặc group_id (đăng bài), thread_id (reply). */
  target: string;
  /** Nội dung text sẽ gửi. */
  content: string;
  /** Khóa chống trùng — mặc định = `${target}` nếu không truyền. */
  dedupeKey?: string;
  /** Nhãn hiển thị cho UI (tên nhóm/bài), optional. */
  label?: string;
}

/** Cấu hình giới hạn an toàn theo ngày cho 1 account. */
export interface RateLimitConfig {
  /** Số hành động tối đa mỗi ngày theo từng loại. */
  perDay: Record<WriteActionType, number>;
  /** Khoảng delay ngẫu nhiên (ms) giữa 2 lần gửi — [min, max]. */
  delayMs: [number, number];
}

/** Tiến độ gửi loạt — emit qua EventBroadcaster để UI cập nhật. */
export interface WriteBatchProgress {
  accountId: string;
  actionType: WriteActionType;
  total: number;
  done: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Lý do dừng sớm nếu có (vd vượt giới hạn ngày). */
  stoppedReason?: string;
}
