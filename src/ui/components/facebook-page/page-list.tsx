/**
 * page-list.tsx — connected-Page management list for the "Facebook Page" nav screen.
 *
 * Shows every connected Page with token status, enable/disable, the auto-reply
 * disclosure toggle (setDisclosure — missing from FacebookPageWizard's step 3),
 * and disconnect. Reuses `ipc.fbPage.*` (Phase 2) exactly like the wizard.
 */

import React, { useCallback, useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { showConfirm } from '../common/ConfirmDialog';

interface FbConnectedPage {
  page_id: string;
  name: string;
  app_id: string;
  category: string;
  picture_url: string;
  enabled: number;
  token_status: string;
  bot_disclosure?: number;
  last_customer_message_at: number;
  last_backfill_at: number;
  connected_at?: number;
  updated_at?: number;
}

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Toggle({ value, onChange, disabled, title }: { value: boolean; onChange: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      title={title || (value ? 'Đang bật — nhấn để tắt' : 'Đang tắt — nhấn để bật')}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${value ? 'bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

export default function PageList() {
  const [pages, setPages] = useState<FbConnectedPage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [disclosureTogglingId, setDisclosureTogglingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await ipc.fbPage.listPages();
      if (res.success) setPages(res.pages || []);
      else setError(res.error || 'Không tải được danh sách Page');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi tải danh sách Page');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleEnabled = async (page: FbConnectedPage) => {
    setTogglingId(page.page_id);
    setError('');
    try {
      const res = await ipc.fbPage.setPageEnabled({ pageId: page.page_id, enabled: !page.enabled });
      if (res.success) await load();
      else setError(res.error || 'Cập nhật trạng thái Page thất bại');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi cập nhật Page');
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleDisclosure = async (page: FbConnectedPage) => {
    const on = (page.bot_disclosure ?? 1) === 0; // default ON when unset
    setDisclosureTogglingId(page.page_id);
    setError('');
    try {
      const res = await ipc.fbPage.setDisclosure({ pageId: page.page_id, on });
      if (res.success) await load();
      else setError(res.error || 'Cập nhật disclosure thất bại');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi cập nhật disclosure');
    } finally {
      setDisclosureTogglingId(null);
    }
  };

  const handleVerifyToken = async (pageId: string) => {
    setVerifyingId(pageId);
    try {
      const res = await ipc.fbPage.verifyToken({ pageId });
      setVerifyResults(r => ({ ...r, [pageId]: res.success && res.status ? res.status : 'error' }));
      if (!res.success) setError(res.error || 'Kiểm tra token thất bại');
    } catch (e) {
      setVerifyResults(r => ({ ...r, [pageId]: 'error' }));
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi kiểm tra token');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDisconnect = async (page: FbConnectedPage) => {
    const confirmed = await showConfirm({
      title: `Ngắt kết nối "${page.name}"?`,
      message: 'Toàn bộ hội thoại của Page này trên Zaplo sẽ bị xóa cùng lúc. Hành động này không thể hoàn tác.',
      confirmText: 'Ngắt kết nối',
      variant: 'danger',
    });
    if (!confirmed) return;
    setError('');
    try {
      const res = await ipc.fbPage.disconnectPage({ pageId: page.page_id });
      if (res.success) await load();
      else setError(res.error || 'Ngắt kết nối thất bại');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi ngắt kết nối');
    }
  };

  const fmtTime = (ts: number) => (ts ? new Date(ts).toLocaleString('vi-VN') : 'Chưa có');

  return (
    <section className="bg-gray-750 border border-gray-700 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Page đã kết nối</h2>
        <p className="text-xs text-gray-500 mt-0.5">Bật/tắt agent, cảnh báo tự động và ngắt kết nối cho từng Page.</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">⚠️ {error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-500"><Spinner /></div>
      ) : pages.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-3xl mb-2">📘</div>
          <p className="text-sm text-gray-400">Chưa có Page nào được kết nối</p>
          <p className="text-xs mt-1">Kết nối Page ở phần "Kết nối Page" bên dưới, hoặc trong Tích hợp → Facebook Page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map(page => {
            const status = verifyResults[page.page_id] || page.token_status;
            const statusOk = status === 'active';
            const disclosureOn = (page.bot_disclosure ?? 1) !== 0;
            return (
              <div key={page.page_id} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-3">
                  <img
                    src={page.picture_url || ''}
                    alt=""
                    className="w-9 h-9 rounded-full bg-gray-700 flex-shrink-0 object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = ''; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white truncate">{page.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0 ${statusOk ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                        {status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {page.category} · Khách nhắn gần nhất: {fmtTime(page.last_customer_message_at)}
                    </p>
                  </div>
                  <Toggle
                    value={!!page.enabled}
                    disabled={togglingId === page.page_id}
                    title={page.enabled ? 'Đang bật — Page nhận tin & agent trả lời' : 'Đang tắt — Page không nhận tin'}
                    onChange={() => handleToggleEnabled(page)}
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyToken(page.page_id)}
                    disabled={verifyingId === page.page_id}
                    className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center gap-1"
                  >
                    {verifyingId === page.page_id && <Spinner className="w-3 h-3" />}
                    Kiểm tra token
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(page)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                    title="Ngắt kết nối"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>

                {/* Bot disclosure — first-reply-of-thread opt-out (missing from the wizard's list) */}
                <div className="flex items-center gap-2 pl-12 pt-1 border-t border-gray-700/60">
                  <Toggle
                    value={disclosureOn}
                    disabled={disclosureTogglingId === page.page_id}
                    title={disclosureOn ? 'Đang chèn dòng "trợ lý tự động" ở tin đầu tiên mỗi hội thoại' : 'Đã tắt dòng cảnh báo trợ lý tự động'}
                    onChange={() => handleToggleDisclosure(page)}
                  />
                  <span className="text-[11px] text-gray-400">Chèn thông báo "trợ lý tự động" ở tin đầu mỗi hội thoại</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
