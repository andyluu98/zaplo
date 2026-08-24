import React, { useCallback, useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { showConfirm } from '../common/ConfirmDialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FbApp {
  app_id: string;
  config_id: string;
  access_level: string;
  webhook_mode: string;
  webhook_port: number;
  public_url: string;
  hasSecret: boolean;
  hasVerifyToken: boolean;
}

interface FbManagedPage {
  page_id: string;
  name: string;
  category: string;
  picture_url: string;
  canMessage: boolean;
}

interface FbAccessInfo {
  level: string;
  grantedScopes: string[];
  missingScopes: string[];
}

interface FbConnectedPage {
  page_id: string;
  name: string;
  app_id: string;
  category: string;
  picture_url: string;
  enabled: number;
  token_status: string;
  last_customer_message_at: number;
  last_backfill_at: number;
  connected_at?: number;
  updated_at?: number;
}

const ACCESS_LEVELS: { value: 'dev' | 'standard' | 'advanced'; label: string }[] = [
  { value: 'dev', label: 'Dev' },
  { value: 'standard', label: 'Standard' },
  { value: 'advanced', label: 'Advanced' },
];

const ACCESS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  dev: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Dev' },
  standard: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Standard' },
  advanced: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Advanced' },
};

const EMPTY_FORM = {
  appId: '',
  appSecret: '',
  configId: '',
  publicUrl: '',
};

// ─── Small shared UI helpers ───────────────────────────────────────────────────

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CopyRow({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
        <p className={`text-xs font-mono truncate ${value ? 'text-green-400' : 'text-gray-600'}`}>
          {value || placeholder || '—'}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!value}
        title="Copy"
        className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 flex items-center justify-center transition-colors"
      >
        {copied ? (
          <span className="text-green-400 text-xs">✓</span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      title={value ? 'Đang bật — nhấn để tắt' : 'Đang tắt — nhấn để bật'}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${value ? 'bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function FacebookPageWizard() {
  // Global / cross-step state
  const [redirectUri, setRedirectUri] = useState('');
  const [apps, setApps] = useState<FbApp[]>([]);
  const [pages, setPages] = useState<FbConnectedPage[]>([]);
  const [activeAppId, setActiveAppId] = useState('');

  // Bước 1 — form
  const [form, setForm] = useState(EMPTY_FORM);
  const [verifyToken, setVerifyToken] = useState('');
  const [generatingToken, setGeneratingToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Bước 2 — login & pick page
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [managedPages, setManagedPages] = useState<FbManagedPage[]>([]);
  const [accessInfo, setAccessInfo] = useState<FbAccessInfo | null>(null);
  const [loginError, setLoginError] = useState('');
  const [connectingPageId, setConnectingPageId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState('');

  // Bước 3 — connected pages
  const [pagesError, setPagesError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, string>>({});
  const [levelSavingAppId, setLevelSavingAppId] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    try {
      const res = await ipc.fbPage.listApps();
      if (res.success) setApps(res.apps || []);
    } catch {
      // Non-fatal: leave existing list; individual actions surface their own errors.
    }
  }, []);

  const loadPages = useCallback(async () => {
    try {
      const res = await ipc.fbPage.listPages();
      if (res.success) {
        setPages(res.pages || []);
      } else {
        setPagesError(res.error || 'Không tải được danh sách Page');
      }
    } catch (e) {
      setPagesError(e instanceof Error ? e.message : 'Lỗi không xác định khi tải danh sách Page');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await ipc.fbPage.getRedirectUri();
        if (res.success) setRedirectUri(res.redirectUri || '');
      } catch {
        // Redirect URI is display-only; surfaced blank if it fails.
      }
    })();
    loadApps();
    loadPages();
  }, [loadApps, loadPages]);

  // Prefill Bước 1 form from the first saved app (once) so re-visiting the wizard shows existing config.
  useEffect(() => {
    if (apps.length > 0 && !form.appId) {
      const a = apps[0];
      setForm(f => ({ ...f, appId: a.app_id, configId: a.config_id || '', publicUrl: a.public_url || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);

  // Keep activeAppId valid as apps list changes; default to the first saved app.
  useEffect(() => {
    if (apps.length === 0) {
      setActiveAppId('');
      return;
    }
    setActiveAppId(prev => (apps.some(a => a.app_id === prev) ? prev : apps[0].app_id));
  }, [apps]);

  const currentSavedApp = apps.find(a => a.app_id === form.appId.trim());

  const setField = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    setSaveError('');
    try {
      const res = await ipc.fbPage.generateVerifyToken();
      if (res.success && res.verifyToken) {
        setVerifyToken(res.verifyToken);
      } else {
        setSaveError(res.error || 'Tạo verify token thất bại');
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi không xác định khi tạo verify token');
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleSaveApp = async () => {
    const appId = form.appId.trim();
    const appSecret = form.appSecret.trim();
    setSaveError('');
    setSaveSuccess('');
    if (!appId || !appSecret) {
      setSaveError('Nhập App ID và App Secret');
      return;
    }
    if (!verifyToken) {
      setSaveError('Tạo verify token trước khi lưu');
      return;
    }
    setSaving(true);
    try {
      const res = await ipc.fbPage.saveApp({
        appId,
        appSecret,
        verifyToken,
        configId: form.configId.trim() || undefined,
        publicUrl: form.publicUrl.trim() || undefined,
      });
      if (!res.success) {
        setSaveError(res.error || 'Lưu app thất bại');
        return;
      }
      setSaveSuccess('Đã lưu app thành công');
      const info = await ipc.fbPage.getApp({ appId });
      if (info.success && info.app) {
        const saved = info.app;
        setApps(prev => (prev.some(a => a.app_id === saved.app_id)
          ? prev.map(a => (a.app_id === saved.app_id ? saved : a))
          : [...prev, saved]));
      }
      setActiveAppId(appId);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi không xác định khi lưu app');
    } finally {
      setSaving(false);
    }
  };

  const handleLogin = async () => {
    if (!activeAppId) {
      setLoginError('Chưa có app nào được lưu — hoàn tất Bước 1 trước');
      return;
    }
    setLoadingLogin(true);
    setLoginError('');
    setConnectError('');
    setManagedPages([]);
    setAccessInfo(null);
    try {
      const app = apps.find(a => a.app_id === activeAppId);
      const res = await ipc.fbPage.listManagedPages({
        appId: activeAppId,
        redirectUri: redirectUri || undefined,
        configId: app?.config_id || undefined,
      });
      if (res.success) {
        const list = res.pages || [];
        setManagedPages(list);
        setAccessInfo(res.access || null);
        if (list.length === 0 && res.error) setLoginError(res.error);
      } else {
        setLoginError(res.error || 'Đăng nhập Facebook thất bại');
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Lỗi không xác định khi đăng nhập Facebook');
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleConnectPage = async (pageId: string) => {
    setConnectingPageId(pageId);
    setConnectError('');
    try {
      const res = await ipc.fbPage.connectPage({ pageId });
      if (res.success) {
        await loadPages();
      } else {
        setConnectError(res.error || 'Kết nối Page thất bại');
      }
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Lỗi không xác định khi kết nối Page');
    } finally {
      setConnectingPageId(null);
    }
  };

  const handleToggleEnabled = async (page: FbConnectedPage) => {
    setTogglingId(page.page_id);
    setPagesError('');
    try {
      const res = await ipc.fbPage.setPageEnabled({ pageId: page.page_id, enabled: !page.enabled });
      if (res.success) {
        await loadPages();
      } else {
        setPagesError(res.error || 'Cập nhật trạng thái Page thất bại');
      }
    } catch (e) {
      setPagesError(e instanceof Error ? e.message : 'Lỗi không xác định khi cập nhật Page');
    } finally {
      setTogglingId(null);
    }
  };

  const handleVerifyToken = async (pageId: string) => {
    setVerifyingId(pageId);
    try {
      const res = await ipc.fbPage.verifyToken({ pageId });
      if (res.success && res.status) {
        setVerifyResults(r => ({ ...r, [pageId]: res.status! }));
      } else {
        setVerifyResults(r => ({ ...r, [pageId]: 'error' }));
        setPagesError(res.error || 'Kiểm tra token thất bại');
      }
    } catch (e) {
      setVerifyResults(r => ({ ...r, [pageId]: 'error' }));
      setPagesError(e instanceof Error ? e.message : 'Lỗi không xác định khi kiểm tra token');
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
    setPagesError('');
    try {
      const res = await ipc.fbPage.disconnectPage({ pageId: page.page_id });
      if (res.success) {
        await loadPages();
      } else {
        setPagesError(res.error || 'Ngắt kết nối thất bại');
      }
    } catch (e) {
      setPagesError(e instanceof Error ? e.message : 'Lỗi không xác định khi ngắt kết nối');
    }
  };

  const handleSetAccessLevel = async (appId: string, level: 'dev' | 'standard' | 'advanced') => {
    setLevelSavingAppId(appId);
    try {
      const res = await ipc.fbPage.setAccessLevel({ appId, level });
      if (res.success) {
        setApps(prev => prev.map(a => (a.app_id === appId ? { ...a, access_level: level } : a)));
      }
    } catch {
      // Silently ignored: apps list keeps its previous access_level; no destructive effect.
    } finally {
      setLevelSavingAppId(null);
    }
  };

  const connectedPageIds = new Set(pages.map(p => p.page_id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-base font-semibold text-white flex items-center gap-2">📘 Kết nối Facebook Page</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Kết nối Fanpage Facebook để nhắn tin và đồng bộ hội thoại Messenger ngay trong Zaplo.
          </p>
        </div>

        {/* ── Bước 1 — Đăng ký app ────────────────────────────────────────── */}
        <section className="bg-gray-750 border border-gray-700 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Bước 1 — Đăng ký app Facebook</h2>
            <p className="text-xs text-gray-500 mt-0.5">Tạo Facebook App tại developers.facebook.com rồi nhập thông tin bên dưới.</p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">App ID</label>
              <input
                className="input-field text-sm w-full"
                placeholder="Facebook App ID"
                value={form.appId}
                onChange={e => setField('appId', e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">App Secret</label>
              <input
                className="input-field text-sm w-full"
                placeholder={currentSavedApp?.hasSecret ? '•••••••• (đã lưu — nhập lại để đổi)' : 'Facebook App Secret'}
                type="password"
                value={form.appSecret}
                onChange={e => setField('appSecret', e.target.value)}
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Config ID <span className="text-gray-600">(Facebook Login for Business — tuỳ chọn)</span>
            </label>
            <input
              className="input-field text-sm w-full"
              placeholder="config_id (bỏ trống nếu app dùng scope thường)"
              value={form.configId}
              onChange={e => setField('configId', e.target.value)}
              disabled={saving}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              App business-type mới bắt buộc dùng config_id; app cũ để trống dùng scope.
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Public Webhook URL <span className="text-gray-600">(tuỳ chọn)</span></label>
            <input
              className="input-field text-sm w-full"
              placeholder="https://yourdomain.example.com"
              value={form.publicUrl}
              onChange={e => setField('publicUrl', e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Verify token */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateToken}
              disabled={generatingToken || saving}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              {generatingToken && <Spinner className="w-3 h-3" />}
              🔑 Tạo verify token
            </button>
            {verifyToken && <span className="text-[11px] text-green-400 font-mono truncate">{verifyToken}</span>}
          </div>

          {/* Copyable box for Facebook Developer dashboard */}
          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-3 space-y-2">
            <p className="text-[11px] text-gray-400 font-medium">📋 Dán các giá trị này vào Facebook Developer dashboard</p>
            <CopyRow label="Redirect URI (OAuth Valid Redirect URI)" value={redirectUri} />
            <CopyRow label="Verify Token (Webhook Verify Token)" value={verifyToken} placeholder="Bấm 'Tạo verify token' ở trên" />
            <CopyRow label="Webhook Callback URL" value={form.publicUrl.trim()} placeholder="Nhập Public Webhook URL ở trên để hiển thị" />
          </div>

          {saveError && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">
              ⚠️ {saveError}
            </div>
          )}
          {saveSuccess && !saveError && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-3 py-2 text-xs text-green-400">
              ✅ {saveSuccess}
              {currentSavedApp && (
                <span className="ml-2 text-gray-400">
                  · {currentSavedApp.hasSecret ? 'đã lưu App Secret' : 'chưa có App Secret'} · access level:{' '}
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${(ACCESS_BADGE[currentSavedApp.access_level] || ACCESS_BADGE.dev).bg} ${(ACCESS_BADGE[currentSavedApp.access_level] || ACCESS_BADGE.dev).text}`}>
                    {ACCESS_BADGE[currentSavedApp.access_level]?.label || currentSavedApp.access_level}
                  </span>
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveApp}
            disabled={saving || !form.appId.trim() || !form.appSecret.trim() || !verifyToken}
            className="btn-primary text-sm py-2 px-4"
          >
            {saving ? (<span className="flex items-center gap-1.5"><Spinner /> Đang lưu...</span>) : 'Lưu app'}
          </button>
        </section>

        {/* ── Bước 2 — Đăng nhập & chọn Page ──────────────────────────────── */}
        <section className="bg-gray-750 border border-gray-700 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Bước 2 — Đăng nhập &amp; chọn Page</h2>
            <p className="text-xs text-gray-500 mt-0.5">Đăng nhập bằng tài khoản Facebook quản trị Page rồi chọn Page cần kết nối.</p>
          </div>

          {apps.length > 1 && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">App dùng để đăng nhập</label>
              <select
                className="input-field text-sm w-full"
                value={activeAppId}
                onChange={e => setActiveAppId(e.target.value)}
              >
                {apps.map(a => <option key={a.app_id} value={a.app_id}>{a.app_id}</option>)}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loadingLogin || !activeAppId}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
          >
            {loadingLogin && <Spinner />}
            {loadingLogin ? 'Đang chờ đăng nhập Facebook...' : '🔐 Đăng nhập Facebook & chọn Page'}
          </button>

          {!activeAppId && (
            <p className="text-xs text-gray-500">Lưu app ở Bước 1 trước khi đăng nhập.</p>
          )}

          {loginError && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">
              ⚠️ {loginError}
            </div>
          )}
          {connectError && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">
              ⚠️ {connectError}
            </div>
          )}

          {accessInfo && (
            <div className={`rounded-lg px-3 py-2 text-xs ${accessInfo.level === 'dev' ? 'bg-amber-900/20 border border-amber-700/40 text-amber-400' : 'bg-green-900/20 border border-green-700/40 text-green-400'}`}>
              {accessInfo.level === 'dev'
                ? '⚠️ Chế độ dev — chỉ tài khoản có vai trò trong app nhắn được; cần App Review để công khai'
                : `✅ Ứng dụng đang ở chế độ ${accessInfo.level} — Page có thể nhắn tin theo phạm vi được cấp`}
              {accessInfo.missingScopes.length > 0 && (
                <div className="mt-1.5 text-yellow-400">
                  ⚠️ Thiếu quyền: {accessInfo.missingScopes.join(', ')}
                </div>
              )}
            </div>
          )}

          {managedPages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {managedPages.map(p => {
                const alreadyConnected = connectedPageIds.has(p.page_id);
                return (
                  <div key={p.page_id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
                    <img
                      src={p.picture_url || ''}
                      alt=""
                      className="w-10 h-10 rounded-full bg-gray-700 flex-shrink-0 object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = ''; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white truncate">{p.name}</span>
                        {p.canMessage && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 font-bold flex-shrink-0">MESSAGING</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{p.category}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConnectPage(p.page_id)}
                      disabled={connectingPageId === p.page_id || alreadyConnected}
                      className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-1.5"
                    >
                      {connectingPageId === p.page_id ? <Spinner className="w-3 h-3" /> : null}
                      {alreadyConnected ? 'Đã kết nối' : 'Kết nối'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Bước 3 — Page đã kết nối ─────────────────────────────────────── */}
        <section className="bg-gray-750 border border-gray-700 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Bước 3 — Page đã kết nối</h2>
            <p className="text-xs text-gray-500 mt-0.5">Quản lý các Page đã kết nối, bật/tắt, kiểm tra token.</p>
          </div>

          {pagesError && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">
              ⚠️ {pagesError}
            </div>
          )}

          {pages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-3xl mb-2">📘</div>
              <p className="text-sm text-gray-400">Chưa có Page nào được kết nối</p>
              <p className="text-xs mt-1">Hoàn tất Bước 1 và Bước 2 ở trên để kết nối Page đầu tiên</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pages.map(page => {
                const status = verifyResults[page.page_id] || page.token_status;
                const statusOk = status === 'active';
                return (
                  <div key={page.page_id} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 flex items-center gap-3">
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
                      <p className="text-xs text-gray-500 truncate">{page.category} · App: {page.app_id}</p>
                    </div>

                    <Toggle
                      value={!!page.enabled}
                      disabled={togglingId === page.page_id}
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
                );
              })}
            </div>
          )}

          {apps.length > 0 && (
            <div className="border-t border-gray-700 pt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-400">Access level thủ công (sau khi App Review duyệt, đặt thành advanced)</p>
              {apps.map(a => (
                <div key={a.app_id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono truncate flex-1 min-w-0">{a.app_id}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    {ACCESS_LEVELS.map(lvl => (
                      <button
                        key={lvl.value}
                        type="button"
                        onClick={() => handleSetAccessLevel(a.app_id, lvl.value)}
                        disabled={levelSavingAppId === a.app_id}
                        className={`text-[11px] px-2 py-1 rounded-md border transition-all ${
                          a.access_level === lvl.value
                            ? `${(ACCESS_BADGE[lvl.value] || ACCESS_BADGE.dev).bg} ${(ACCESS_BADGE[lvl.value] || ACCESS_BADGE.dev).text} border-current`
                            : 'border-gray-600 text-gray-400 hover:border-gray-400'
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
