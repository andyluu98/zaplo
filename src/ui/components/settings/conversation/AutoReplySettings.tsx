import React, { useState, useEffect, useCallback } from 'react';
import { AccountInfo } from '@/store/accountStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assistant {
  id: string;
  name: string;
  enabled: boolean;
  platform: string;
}

interface AccountRowState {
  enabled: boolean;
  assistantId: string;
  loading: boolean;
  error: string | null;
}

// ─── Helper: call electronAPI.ai ─────────────────────────────────────────────

const api = () => (window as any).electronAPI?.ai;

async function fetchStatus(zaloId: string): Promise<{ enabled: boolean; assistantId: string | null }> {
  const res = await api().getAutoReplyStatus(zaloId);
  return { enabled: !!res?.enabled, assistantId: res?.assistantId || null };
}

async function toggle(zaloId: string, enabled: boolean, assistantId: string | undefined): Promise<void> {
  const res = await api().toggleAutoReply(zaloId, enabled, assistantId);
  if (!res?.success) throw new Error(res?.error || 'Thao tác thất bại');
}

// ─── Sub-component: one row per account ──────────────────────────────────────

function AccountAutoReplyRow({
  account,
  assistants,
}: {
  account: AccountInfo;
  assistants: Assistant[];
}) {
  const [state, setState] = useState<AccountRowState>({
    enabled: false,
    assistantId: '',
    loading: true,
    error: null,
  });

  // Load status on mount
  useEffect(() => {
    let cancelled = false;
    fetchStatus(account.zalo_id)
      .then(({ enabled, assistantId }) => {
        if (cancelled) return;
        setState(s => ({ ...s, enabled, assistantId: assistantId || '', loading: false }));
      })
      .catch(err => {
        if (cancelled) return;
        setState(s => ({ ...s, loading: false, error: err.message }));
      });
    return () => { cancelled = true; };
  }, [account.zalo_id]);

  // Per-row mutation token: incremented at the start of every mutation.
  // The .finally callback checks the captured token against the latest value;
  // stale resolves (from a superseded request) are silently discarded.
  const mutationToken = React.useRef(0);

  const applyAndRefetch = useCallback(async (mutate: () => Promise<void>) => {
    const token = ++mutationToken.current;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      await mutate();
      if (token !== mutationToken.current) return; // superseded — discard
      const authoritative = await fetchStatus(account.zalo_id);
      if (token !== mutationToken.current) return;
      setState(s => ({ ...s, loading: false, enabled: authoritative.enabled, assistantId: authoritative.assistantId || '' }));
    } catch (err: any) {
      if (token !== mutationToken.current) return;
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [account.zalo_id]);

  const handleToggle = useCallback((newEnabled: boolean) => {
    // Require an assistant before enabling
    if (newEnabled && !state.assistantId) {
      setState(s => ({ ...s, error: 'Chọn trợ lý AI trước khi bật' }));
      return;
    }
    applyAndRefetch(() => toggle(account.zalo_id, newEnabled, newEnabled ? state.assistantId : undefined));
  }, [account.zalo_id, state.assistantId, applyAndRefetch]);

  const handleAssistantChange = useCallback((assistantId: string) => {
    // Update dropdown immediately for responsiveness, then sync if enabled
    setState(s => ({ ...s, assistantId, error: null }));
    if (state.enabled) {
      applyAndRefetch(() => toggle(account.zalo_id, true, assistantId));
    }
  }, [account.zalo_id, state.enabled, applyAndRefetch]);

  const enabledAssistants = assistants.filter(a => a.enabled);

  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-gray-800 last:border-0">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gray-700 overflow-hidden shrink-0">
        {account.avatar_url
          ? <img src={account.avatar_url} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-bold">
              {(account.full_name || account.display_name || '?')[0].toUpperCase()}
            </div>
        }
      </div>

      {/* Account name + phone */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate">
          {account.full_name || account.display_name || account.zalo_id}
        </p>
        {account.phone && (
          <p className="text-xs text-gray-500 truncate">{account.phone}</p>
        )}
      </div>

      {/* Assistant dropdown */}
      <select
        value={state.assistantId}
        onChange={e => handleAssistantChange(e.target.value)}
        disabled={state.loading}
        className="text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-md px-2 py-1.5 focus:border-blue-500 outline-none disabled:opacity-50 max-w-[160px]"
      >
        <option value="">-- Chọn trợ lý --</option>
        {enabledAssistants.map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {/* Toggle switch */}
      <button
        onClick={() => handleToggle(!state.enabled)}
        disabled={state.loading}
        aria-label={state.enabled ? 'Tắt AI tự trả lời' : 'Bật AI tự trả lời'}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
          state.enabled ? 'bg-blue-600' : 'bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            state.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>

      {/* Loading spinner */}
      {state.loading && (
        <svg className="animate-spin w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}

      {/* Inline error */}
      {state.error && !state.loading && (
        <span className="text-xs text-red-400 max-w-[120px] truncate" title={state.error}>
          {state.error}
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  accounts: AccountInfo[];
  filterAccounts: string[];
}

export default function AutoReplySettings({ accounts, filterAccounts }: Props) {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(true);

  // Load assistant list once on mount
  useEffect(() => {
    api().listAssistants()
      .then((res: any) => {
        setAssistants(res?.assistants || []);
      })
      .catch(() => setAssistants([]))
      .finally(() => setLoadingAssistants(false));
  }, []);

  const visibleAccounts = filterAccounts.length > 0
    ? accounts.filter(a => filterAccounts.includes(a.zalo_id))
    : accounts;

  // Only show Zalo accounts (not Facebook)
  const zaloAccounts = visibleAccounts.filter(a => !a.channel || a.channel === 'zalo');

  if (loadingAssistants) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        Đang tải trợ lý AI...
      </div>
    );
  }

  if (assistants.filter(a => a.enabled).length === 0) {
    return (
      <div className="text-center py-14">
        <p className="text-3xl mb-2">🤖</p>
        <p className="text-gray-400 text-sm font-medium">Chưa có trợ lý AI nào được bật</p>
        <p className="text-gray-600 text-xs mt-1">
          Vào Cài đặt → Trợ lý AI để tạo và kích hoạt trợ lý trước.
        </p>
      </div>
    );
  }

  if (zaloAccounts.length === 0) {
    return (
      <div className="text-center py-14">
        <p className="text-3xl mb-2">👤</p>
        <p className="text-gray-400 text-sm font-medium">Không có tài khoản Zalo nào</p>
        <p className="text-gray-600 text-xs mt-1">Thêm tài khoản Zalo để sử dụng tính năng này.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Info banner */}
      <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-blue-900/30 border border-blue-800/50 rounded-lg text-xs text-blue-300">
        Khi bật, bot sẽ tự động phản hồi mọi tin nhắn đến bằng trợ lý AI đã chọn.
        Chỉ áp dụng cho tin nhắn từ người khác (không tự trả lời chính mình).
      </div>

      {/* Account rows */}
      <div className="flex flex-col">
        {zaloAccounts.map(account => (
          <AccountAutoReplyRow
            key={account.zalo_id}
            account={account}
            assistants={assistants}
          />
        ))}
      </div>
    </div>
  );
}
