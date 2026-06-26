// Modal xóa lịch hàng loạt theo khoảng ngày.
// Gọi ipc.schedule.deleteRange rồi callback onSuccess với số dòng đã xóa.

import React, { useState } from 'react';
import ipc from '@/lib/ipc';

interface Props {
  /** Năm/tháng hiện tại (để tính giá trị default của date input) */
  year: number;
  month: number; // 0-indexed
  onClose: () => void;
  onSuccess: (deleted: number) => void;
}

/** "YYYY-MM-DD" từ year/month/day */
function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Epoch ms của 00:00:00 local của ngày YYYY-MM-DD */
function dateToEpochStart(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Epoch ms của 23:59:59 local của ngày YYYY-MM-DD */
function dateToEpochEnd(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Số ngày cuối tháng */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export default function BulkDeleteModal({ year, month, onClose, onSuccess }: Props) {
  const defaultFrom = toDateStr(year, month, 1);
  const defaultTo = toDateStr(year, month, lastDayOfMonth(year, month));

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [onlyPending, setOnlyPending] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleDelete() {
    setErrorMsg(null);

    if (!fromDate || !toDate) {
      setErrorMsg('Vui lòng chọn cả hai ngày.');
      return;
    }
    if (fromDate > toDate) {
      setErrorMsg('"Từ ngày" không được sau "Đến ngày".');
      return;
    }

    const confirmed = window.confirm('Xóa các bài trong khoảng đã chọn?');
    if (!confirmed) return;

    setLoading(true);
    try {
      const from = dateToEpochStart(fromDate);
      const to = dateToEpochEnd(toDate);
      const res = await (ipc.schedule as any).deleteRange({ from, to, onlyPending });
      if (res?.success) {
        onSuccess(res.count ?? 0);
      } else {
        setErrorMsg(res?.error ?? 'Xóa thất bại.');
      }
    } catch (err: unknown) {
      setErrorMsg(String((err as Error)?.message ?? 'Lỗi không xác định.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Overlay */
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Panel */}
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-80 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white">Xóa lịch hàng loạt</h3>

        {/* Từ ngày */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Từ ngày</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Đến ngày */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Đến ngày</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
            className="mt-0.5 accent-blue-500"
          />
          <span className="text-xs text-gray-300">
            Chỉ xóa bài <span className="text-amber-400 font-medium">CHỜ ĐĂNG</span> (giữ bài đã đăng)
          </span>
        </label>

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-400">{errorMsg}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
          >
            {loading ? 'Đang xóa...' : 'Xóa'}
          </button>
        </div>
      </div>
    </div>
  );
}
