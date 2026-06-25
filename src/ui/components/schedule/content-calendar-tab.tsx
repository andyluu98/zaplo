// Tab "Lịch nội dung" — hiển thị lịch tháng với các item đã lên lịch đăng bài.
// Click ô ngày → xem chi tiết item của ngày đó bên dưới.
// Tích hợp modal RaiLichModal để lên lịch hàng loạt.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import RaiLichModal from './rai-lich-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleItem {
  id: string;
  post_id: string;
  channel: string;
  account_id: string;
  group_id: string;
  scheduled_at: number; // epoch ms
  status: 'scheduled' | 'done' | 'error';
  error?: string;
  title?: string;
  content?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Trả về "YYYY-MM-DD" từ epoch ms theo giờ local */
function epochToDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Trả về "HH:mm" từ epoch ms theo giờ local */
function epochToTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Tên tháng/năm hiển thị */
function monthLabel(year: number, month: number): string {
  return `Tháng ${month + 1}/${year}`;
}

/** Số ngày của tháng */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Thứ đầu tuần của ngày 1 (0=CN, 1=T2, ...) */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const DOW_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-amber-400',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  done: 'text-green-500 border-green-500/30 bg-green-500/10',
  error: 'text-red-400 border-red-400/30 bg-red-400/10',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Chờ đăng',
  done: 'Đã đăng',
  error: 'Lỗi',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContentCalendarTab() {
  const showNotification = useAppStore((s) => s.showNotification);

  // Tháng hiện tại
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // Dữ liệu lịch
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Ngày đang chọn để xem chi tiết
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Modal rải bài
  const [showRaiModal, setShowRaiModal] = useState(false);

  // ─── Load dữ liệu ──────────────────────────────────────────────────────────

  const loadRange = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const from = new Date(y, m, 1).getTime();
      const to = new Date(y, m + 1, 1).getTime();
      const res = await ipc.schedule.range({ from, to });
      if (res?.success) {
        setItems(res.items ?? []);
      } else {
        showNotification(res?.error ?? 'Không tải được lịch', 'error');
      }
    } catch (err: unknown) {
      showNotification(String((err as Error)?.message ?? 'Lỗi tải lịch'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadRange(year, month);
  }, [year, month, loadRange]);

  // ─── Đổi tháng ─────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelectedDate(null);
  }

  // ─── Group items theo ngày ──────────────────────────────────────────────────

  const itemsByDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const item of items) {
      const key = epochToDateKey(item.scheduled_at);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  // ─── Xóa item ──────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      const res = await ipc.schedule.delete({ id });
      if (res?.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        showNotification('Đã xóa', 'success');
      } else {
        showNotification(res?.error ?? 'Xóa thất bại', 'error');
      }
    } catch (err: unknown) {
      showNotification(String((err as Error)?.message ?? 'Lỗi'), 'error');
    }
  }

  // ─── Chạy tới hạn ngay ─────────────────────────────────────────────────────

  async function handleRunDueNow() {
    try {
      const res = await ipc.schedule.runDueNow();
      if (res?.success) {
        showNotification(`Đã đăng ${res.done ?? 0}, lỗi ${res.failed ?? 0}`, 'success');
        loadRange(year, month);
      } else {
        showNotification('Chạy thất bại', 'error');
      }
    } catch (err: unknown) {
      showNotification(String((err as Error)?.message ?? 'Lỗi'), 'error');
    }
  }

  // ─── Grid lịch ─────────────────────────────────────────────────────────────

  const totalDays = daysInMonth(year, month);
  const startOffset = firstWeekday(year, month); // CN=0
  // Tổng ô = offset + số ngày, làm tròn lên bội số 7
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

  const todayKey = epochToDateKey(Date.now());

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : [];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 flex-wrap">
        {/* Điều hướng tháng */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="text-gray-400 hover:text-white w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
            aria-label="Tháng trước"
          >
            ‹
          </button>
          <span className="text-sm font-medium min-w-[110px] text-center">
            {monthLabel(year, month)}
          </span>
          <button
            onClick={nextMonth}
            className="text-gray-400 hover:text-white w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
            aria-label="Tháng sau"
          >
            ›
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setShowRaiModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <span>📅</span> Rải bài vào lịch
        </button>
        <button
          onClick={handleRunDueNow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 text-white transition-colors"
        >
          <span>▶</span> Chạy tới hạn ngay
        </button>
      </div>

      {/* ── Lịch ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {loading && (
          <div className="text-center text-gray-400 py-8 text-sm">Đang tải lịch...</div>
        )}

        {!loading && (
          <>
            {/* Tiêu đề các cột ngày */}
            <div className="grid grid-cols-7 mb-1">
              {DOW_LABELS.map((d) => (
                <div key={d} className="text-center text-xs text-gray-500 py-1 font-medium">
                  {d}
                </div>
              ))}
            </div>

            {/* Các ô ngày */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: totalCells }).map((_, idx) => {
                const dayNum = idx - startOffset + 1;
                const isCurrentMonth = dayNum >= 1 && dayNum <= totalDays;
                if (!isCurrentMonth) {
                  return <div key={idx} className="h-16 rounded-lg" />;
                }

                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayItems = itemsByDate[dateKey] ?? [];
                const isToday = dateKey === todayKey;
                const isSelected = selectedDate === dateKey;

                // Hiển thị tối đa 3 chấm trạng thái khác nhau
                const dotsToShow = dayItems.slice(0, 3);

                return (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                    className={[
                      'h-16 rounded-lg p-1.5 flex flex-col items-start text-left transition-colors border',
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500'
                        : 'bg-gray-800/60 border-gray-700 hover:bg-gray-700/60',
                      isToday && !isSelected ? 'border-blue-400/60' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'text-xs font-semibold leading-none',
                        isToday ? 'text-blue-400' : 'text-gray-300',
                      ].join(' ')}
                    >
                      {dayNum}
                    </span>

                    {dayItems.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {dotsToShow.map((item) => (
                          <span
                            key={item.id}
                            className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[item.status] ?? 'bg-gray-500'}`}
                          />
                        ))}
                      </div>
                    )}

                    {dayItems.length > 0 && (
                      <span className="text-[10px] text-gray-400 mt-auto">
                        {dayItems.length} bài
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Chi tiết ngày được chọn ── */}
            {selectedDate && (
              <div className="mt-4 bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-200">
                    {selectedDate} — {selectedItems.length} mục
                  </span>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="text-gray-500 hover:text-gray-300 text-lg leading-none"
                    aria-label="Đóng"
                  >
                    ×
                  </button>
                </div>

                {selectedItems.length === 0 ? (
                  <p className="text-gray-500 text-sm px-4 py-4">Không có lịch đăng trong ngày này.</p>
                ) : (
                  <ul className="divide-y divide-gray-700/60">
                    {selectedItems
                      .slice()
                      .sort((a, b) => a.scheduled_at - b.scheduled_at)
                      .map((item) => (
                        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                          {/* Giờ */}
                          <span className="text-xs text-gray-400 w-11 shrink-0 pt-0.5">
                            {epochToTime(item.scheduled_at)}
                          </span>

                          {/* Thông tin bài */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200 truncate">
                              {item.title || item.content?.slice(0, 80) || `Bài #${item.post_id}`}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.channel?.toUpperCase()} / {item.account_id} → {item.group_id}
                            </p>
                            {item.error && (
                              <p className="text-xs text-red-400 mt-0.5 truncate">{item.error}</p>
                            )}
                          </div>

                          {/* Badge trạng thái */}
                          <span
                            className={[
                              'text-xs px-2 py-0.5 rounded border shrink-0',
                              STATUS_BADGE[item.status] ?? 'text-gray-400 border-gray-600',
                            ].join(' ')}
                          >
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>

                          {/* Xóa */}
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-gray-600 hover:text-red-400 transition-colors shrink-0 text-sm"
                            aria-label="Xóa"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal rải bài ── */}
      {showRaiModal && (
        <RaiLichModal
          onClose={() => setShowRaiModal(false)}
          onSuccess={() => loadRange(year, month)}
        />
      )}
    </div>
  );
}
