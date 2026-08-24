/**
 * page-webhook-panel.tsx — webhook exposure status + config for the Facebook Page
 * channel (Phase 3 IPC: getWebhookInfo/setWebhookConfig/startQuickTunnel/stopQuickTunnel).
 *
 * Two modes (`fb_app.webhook_mode`):
 *  - 'local'  ("Cố định — dùng cho VPS"): deployer runs their own named tunnel
 *    (e.g. cloudflared) pointing at the local webhook port; they paste the stable
 *    public URL here once.
 *  - 'tunnel' ("Nhanh — chỉ để thử"): built-in TunnelService quick tunnel. URL
 *    changes every restart — shown as a persistent warning, matching the plan's
 *    red/green webhook status requirement.
 */

import React, { useCallback, useEffect, useState } from 'react';
import ipc from '@/lib/ipc';

interface FbApp {
  app_id: string;
  webhook_mode: string;
  webhook_port: number;
  public_url: string;
}

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function PageWebhookPanel() {
  const [apps, setApps] = useState<FbApp[]>([]);
  const [activeAppId, setActiveAppId] = useState('');
  const [info, setInfo] = useState<{ port?: number; path?: string; localUrl?: string; publicUrl?: string; fullUrl?: string; tunnelUrl?: string | null; tunnelActive?: boolean } | null>(null);
  const [publicUrlInput, setPublicUrlInput] = useState('');
  const [mode, setMode] = useState<'local' | 'tunnel'>('local');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadApps = useCallback(async () => {
    try {
      const res = await ipc.fbPage.listApps();
      if (res.success) setApps(res.apps || []);
    } catch { /* non-fatal — display stays empty */ }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  useEffect(() => {
    if (apps.length === 0) { setActiveAppId(''); return; }
    setActiveAppId(prev => (apps.some(a => a.app_id === prev) ? prev : apps[0].app_id));
  }, [apps]);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await ipc.fbPage.getWebhookInfo({ appId: activeAppId || undefined });
      if (res.success) {
        setInfo(res);
        const app = apps.find(a => a.app_id === activeAppId);
        setMode((app?.webhook_mode as 'local' | 'tunnel') || 'local');
        setPublicUrlInput(app?.public_url || '');
      } else {
        setError(res.error || 'Không lấy được thông tin webhook');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi lấy thông tin webhook');
    } finally {
      setLoading(false);
    }
  }, [activeAppId, apps]);

  useEffect(() => { if (activeAppId) loadInfo(); }, [activeAppId, loadInfo]);

  const handleSaveMode = async (nextMode: 'local' | 'tunnel') => {
    if (!activeAppId) return;
    setMode(nextMode);
    setSaving(true);
    setError('');
    try {
      const res = await ipc.fbPage.setWebhookConfig({ appId: activeAppId, webhookMode: nextMode });
      if (!res.success) setError(res.error || 'Lưu chế độ webhook thất bại');
      else await loadInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi lưu chế độ webhook');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePublicUrl = async () => {
    if (!activeAppId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await ipc.fbPage.setWebhookConfig({ appId: activeAppId, publicUrl: publicUrlInput.trim(), webhookMode: 'local' });
      if (res.success) { setNotice('Đã lưu URL webhook'); setMode('local'); await loadInfo(); }
      else setError(res.error || 'Lưu URL thất bại');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi lưu URL');
    } finally {
      setSaving(false);
    }
  };

  const handleStartQuickTunnel = async () => {
    if (!activeAppId) return;
    setTunnelBusy(true);
    setError('');
    try {
      const res = await ipc.fbPage.startQuickTunnel({ appId: activeAppId });
      if (res.success) { setMode('tunnel'); await loadInfo(); }
      else setError(res.error || 'Không mở được quick tunnel');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi mở quick tunnel');
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopQuickTunnel = async () => {
    setTunnelBusy(true);
    setError('');
    try {
      const res = await ipc.fbPage.stopQuickTunnel();
      if (!res.success) setError(res.error || 'Không tắt được quick tunnel');
      await loadInfo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi tắt quick tunnel');
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleBackfillNow = async () => {
    setBackfillBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await ipc.fbPage.backfillNow({});
      if (res.success) setNotice(`Đã đồng bộ lại lịch sử hội thoại${res.stored != null ? ` (${res.stored} tin)` : ''}`);
      else setError(res.error || 'Backfill thất bại');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi backfill');
    } finally {
      setBackfillBusy(false);
    }
  };

  const webhookHealthy = mode === 'local' ? !!info?.publicUrl : !!info?.tunnelActive;

  return (
    <section className="bg-gray-750 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Webhook nhận tin Messenger</h2>
          <p className="text-xs text-gray-500 mt-0.5">Cổng cục bộ {info?.port ?? '—'}{info?.path ?? ''} — chỉ cổng này được lộ ra Internet.</p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase flex-shrink-0 ${webhookHealthy ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {webhookHealthy ? '● Đang lộ' : '● Chưa lộ ra Internet'}
        </span>
      </div>

      {apps.length === 0 ? (
        <p className="text-xs text-gray-500">Chưa có app nào — đăng ký app ở phần "Kết nối Page" bên dưới trước.</p>
      ) : (
        <>
          {apps.length > 1 && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">App</label>
              <select
                className="input-field text-sm w-full"
                value={activeAppId}
                onChange={e => setActiveAppId(e.target.value)}
              >
                {apps.map(a => <option key={a.app_id} value={a.app_id}>{a.app_id}</option>)}
              </select>
            </div>
          )}

          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSaveMode('local')}
              disabled={saving || loading}
              className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${mode === 'local' ? 'border-blue-500 bg-blue-900/20 text-blue-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}
            >
              Cố định (VPS + tunnel riêng)
            </button>
            <button
              type="button"
              onClick={() => handleSaveMode('tunnel')}
              disabled={saving || loading}
              className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors ${mode === 'tunnel' ? 'border-amber-500 bg-amber-900/20 text-amber-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}
            >
              Nhanh (Quick Tunnel — chỉ để thử)
            </button>
          </div>

          {mode === 'local' ? (
            <div className="space-y-2">
              <label className="text-xs text-gray-400 mb-1 block">Public Webhook URL (cloudflared/tunnel riêng của bạn trỏ về cổng {info?.port ?? '9888'})</label>
              <div className="flex gap-2">
                <input
                  className="input-field text-sm flex-1"
                  placeholder="https://yourdomain.example.com"
                  value={publicUrlInput}
                  onChange={e => setPublicUrlInput(e.target.value)}
                  disabled={saving}
                />
                <button type="button" onClick={handleSavePublicUrl} disabled={saving || !publicUrlInput.trim()} className="btn-primary text-xs px-3 py-2 flex-shrink-0">
                  {saving ? <Spinner className="w-3.5 h-3.5" /> : 'Lưu'}
                </button>
              </div>
              {info?.fullUrl && (
                <p className="text-[11px] text-gray-500 font-mono truncate">Callback URL đăng ký trên Meta: {info.fullUrl}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2 text-xs text-amber-400">
                ⚠️ Quick tunnel đổi URL mỗi lần khởi động app — phải cập nhật lại Callback URL trên Meta mỗi lần. Chỉ dùng để thử nghiệm, không dùng lâu dài.
                Bật quick tunnel sẽ tắt tunnel khác (relay/tích hợp) đang chạy — chỉ 1 tunnel hoạt động cùng lúc.
              </div>
              <div className="flex items-center gap-2">
                {info?.tunnelActive ? (
                  <button type="button" onClick={handleStopQuickTunnel} disabled={tunnelBusy} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
                    {tunnelBusy && <Spinner className="w-3.5 h-3.5" />} Tắt quick tunnel
                  </button>
                ) : (
                  <button type="button" onClick={handleStartQuickTunnel} disabled={tunnelBusy} className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5">
                    {tunnelBusy && <Spinner className="w-3.5 h-3.5" />} Mở quick tunnel
                  </button>
                )}
                {info?.tunnelUrl && <span className="text-[11px] text-green-400 font-mono truncate">{info.tunnelUrl}</span>}
              </div>
              {info?.fullUrl && (
                <p className="text-[11px] text-gray-500 font-mono truncate">Callback URL hiện tại: {info.fullUrl}</p>
              )}
            </div>
          )}

          <div className="border-t border-gray-700 pt-3 flex items-center gap-2">
            <button type="button" onClick={handleBackfillNow} disabled={backfillBusy} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              {backfillBusy && <Spinner className="w-3.5 h-3.5" />} Đồng bộ lại lịch sử hội thoại
            </button>
            <span className="text-[11px] text-gray-500">Lấy tối đa ~20 tin gần nhất/hội thoại (giới hạn của Meta)</span>
          </div>
        </>
      )}

      {error && <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-400">⚠️ {error}</div>}
      {notice && !error && <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-3 py-2 text-xs text-green-400">✅ {notice}</div>}
    </section>
  );
}
