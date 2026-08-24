/**
 * page-auth-service.ts — Facebook Page connect flow (MAIN PROCESS ONLY).
 *
 * Security (red-team M5):
 *  - random `state` per attempt, verified on return
 *  - isolated `session.fromPartition('fb-page-oauth')`, cleared after
 *  - only accepts the redirect when the URL's origin+path exactly prefix-match
 *    the registered `redirect_uri`
 *  - popups / external navigation denied
 *  - code→token exchange runs here; the app secret and page tokens never cross
 *    to the renderer. Managed-page tokens are held in memory only until the user
 *    picks a Page, then encrypted at rest (hard-fail if encryption unavailable).
 */

import { BrowserWindow, session } from 'electron';
import * as crypto from 'crypto';
import Logger from '../../utils/Logger';
import DatabaseService from '../database/DatabaseService';
import { encryptStrict, decryptSecret } from '../secure/SecureSettingsService';
import { pageGraphClient, MetaGraphError } from './page-graph-client';
import { PAGE_SCOPES } from './page-types';
import type {
    StartOAuthInput, StartOAuthResult, AccessLevelReport,
} from './page-types';
import type { FbApp, FbPage, ManagedPage, PageAccessLevel } from '../../models';

const OAUTH_PARTITION = 'fb-page-oauth';
const DIALOG_BASE = 'https://www.facebook.com/v25.0/dialog/oauth';
/** How long buffered Page tokens stay valid to pick from after OAuth (ms). */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** Pages fetched after a successful OAuth, held in memory until the user picks one. */
interface PendingConnect {
    appId: string;
    pages: ManagedPage[];
    access: AccessLevelReport;
    ts: number;
}

export class PageAuthService {
    private static _instance: PageAuthService | null = null;
    static getInstance(): PageAuthService {
        if (!this._instance) this._instance = new PageAuthService();
        return this._instance;
    }

    /** Page tokens never leave main proc — buffered here between list and connect. */
    private pending: PendingConnect | null = null;

    // ─── App credential storage (encrypted at rest, hard-fail) ────────────────

    /**
     * Save/replace an fb_app's credentials. Encrypts the app secret + verify token
     * with SecureSettingsService.encryptStrict — THROWS EncryptionUnavailableError
     * if the OS cannot encrypt (caller surfaces to UI; never stored plaintext).
     */
    saveApp(p: {
        appId: string; appSecret: string; verifyToken: string;
        configId?: string; publicUrl?: string; webhookPort?: number; webhookMode?: 'local' | 'tunnel';
    }): void {
        const existing = DatabaseService.getInstance().getFbApp(p.appId);
        const app: FbApp = {
            app_id: p.appId,
            app_secret_enc: p.appSecret ? encryptStrict(`fbapp:secret:${p.appId}`, p.appSecret) : (existing?.app_secret_enc ?? ''),
            verify_token_enc: p.verifyToken ? encryptStrict(`fbapp:verify:${p.appId}`, p.verifyToken) : (existing?.verify_token_enc ?? ''),
            config_id: p.configId ?? existing?.config_id ?? '',
            access_level: existing?.access_level ?? 'dev',
            webhook_mode: p.webhookMode ?? existing?.webhook_mode ?? 'local',
            webhook_port: p.webhookPort ?? existing?.webhook_port ?? 0,
            public_url: p.publicUrl ?? existing?.public_url ?? '',
        };
        DatabaseService.getInstance().upsertFbApp(app);
    }

    private getDecryptedAppSecret(appId: string): string | null {
        const app = DatabaseService.getInstance().getFbApp(appId);
        if (!app) return null;
        return decryptSecret(app.app_secret_enc);
    }

    // ─── OAuth dialog ─────────────────────────────────────────────────────────

    /** Open the Facebook OAuth dialog and resolve with the returned `code`. */
    startOAuth(input: StartOAuthInput): Promise<StartOAuthResult> {
        const state = crypto.randomBytes(16).toString('hex');
        const params = new URLSearchParams({
            client_id: input.appId,
            redirect_uri: input.redirectUri,
            state,
            response_type: 'code',
        });
        // FLB uses config_id (NOT scope); classic apps use scope. Never both.
        if (input.configId) params.set('config_id', input.configId);
        else params.set('scope', PAGE_SCOPES.join(','));
        const authUrl = `${DIALOG_BASE}?${params.toString()}`;

        const ses = session.fromPartition(OAUTH_PARTITION);

        return new Promise<StartOAuthResult>((resolve) => {
            let settled = false;
            const win = new BrowserWindow({
                width: 600, height: 800, title: 'Kết nối Facebook Page',
                autoHideMenuBar: true,
                webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false },
            });

            const finish = (r: StartOAuthResult) => {
                if (settled) return;
                settled = true;
                try { if (!win.isDestroyed()) win.destroy(); } catch { /* noop */ }
                ses.clearStorageData().catch(() => { /* best-effort */ });
                resolve(r);
            };

            // Parse the registered redirect once for exact origin+path comparison.
            let expected: URL | null = null;
            try { expected = new URL(input.redirectUri); } catch { expected = null; }

            const handleUrl = (url: string, e?: Electron.Event): void => {
                let u: URL;
                try { u = new URL(url); } catch { return; }
                // Exact match on origin + pathname (query carries code/state). A mere
                // prefix would let e.g. .../login_success.html.evil.com slip through.
                if (!expected || u.origin !== expected.origin || u.pathname !== expected.pathname) return;
                if (e) e.preventDefault();
                try {
                    const err = u.searchParams.get('error');
                    if (err) { finish({ ok: false, error: u.searchParams.get('error_description') || err }); return; }
                    if (u.searchParams.get('state') !== state) {
                        finish({ ok: false, error: 'State không khớp — nghi ngờ CSRF, đã huỷ' });
                        return;
                    }
                    const code = u.searchParams.get('code');
                    if (!code) { finish({ ok: false, error: 'Không nhận được authorization code' }); return; }
                    finish({ ok: true, code });
                } catch (ex: any) {
                    finish({ ok: false, error: ex?.message || 'Redirect URL không hợp lệ' });
                }
            };

            win.webContents.on('will-redirect', (e, url) => handleUrl(url, e));
            win.webContents.on('will-navigate', (e, url) => handleUrl(url, e));
            win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
            win.on('closed', () => finish({ ok: false, error: 'Đã đóng cửa sổ đăng nhập', cancelled: true }));

            win.loadURL(authUrl).catch((e: any) => finish({ ok: false, error: e?.message || 'Không mở được trang đăng nhập' }));
        });
    }

    // ─── Connect flow ─────────────────────────────────────────────────────────

    /**
     * Full connect step: OAuth → short user token → long-lived user token →
     * managed Pages (with long-lived Page tokens) → access-level detection.
     * Returns ONLY non-secret Page metadata; page tokens stay in `this.pending`.
     */
    async listManagedPages(p: { appId: string; redirectUri: string; configId?: string }): Promise<{
        ok: boolean;
        pages?: Array<{ page_id: string; name: string; category: string; picture_url: string; canMessage: boolean }>;
        access?: AccessLevelReport;
        error?: string;
    }> {
        const appSecret = this.getDecryptedAppSecret(p.appId);
        if (!appSecret) return { ok: false, error: 'Chưa lưu App Secret hoặc không giải mã được (máy khác?)' };

        const oauth = await this.startOAuth({ appId: p.appId, redirectUri: p.redirectUri, configId: p.configId });
        if (!oauth.ok) return { ok: false, error: 'error' in oauth ? oauth.error : 'OAuth thất bại' };

        try {
            const shortToken = await pageGraphClient.exchangeCodeForToken({
                appId: p.appId, appSecret, redirectUri: p.redirectUri, code: oauth.code,
            });
            const longToken = await pageGraphClient.getLongLivedToken({ appId: p.appId, appSecret, shortToken });
            const [pages, granted] = await Promise.all([
                pageGraphClient.getManagedPages(longToken),
                pageGraphClient.getGrantedPermissions(longToken).catch(() => [] as string[]),
            ]);
            const access = this.detectAccessLevel(granted);
            this.pending = { appId: p.appId, pages, access, ts: Date.now() };

            if (pages.length === 0) {
                return {
                    ok: true, pages: [], access,
                    error: 'Không tìm thấy Page nào. Ở chế độ dev, chỉ Page mà tài khoản có vai trò trong app mới hiện.',
                };
            }
            return {
                ok: true, access,
                pages: pages.map((pg) => ({
                    page_id: pg.id, name: pg.name, category: pg.category ?? '', picture_url: pg.picture_url ?? '',
                    canMessage: (pg.tasks ?? []).includes('MESSAGING') || (pg.tasks ?? []).includes('MANAGE'),
                })),
            };
        } catch (err: any) {
            const msg = err instanceof MetaGraphError ? err.message : (err?.message || 'Lỗi khi lấy danh sách Page');
            Logger.error(`[PageAuthService] listManagedPages failed: ${msg}`);
            return { ok: false, error: msg };
        }
    }

    /** Persist a chosen Page (encrypt its token, write fb_page + unified account). */
    connectPage(pageId: string): { ok: boolean; page?: { page_id: string; name: string; picture_url: string; category: string }; error?: string } {
        if (!this.pending) return { ok: false, error: 'Phiên kết nối đã hết hạn, vui lòng đăng nhập lại' };
        if (Date.now() - this.pending.ts > PENDING_TTL_MS) {
            this.pending = null;
            return { ok: false, error: 'Phiên kết nối đã hết hạn, vui lòng đăng nhập lại' };
        }
        const mp = this.pending.pages.find((p) => p.id === pageId);
        if (!mp) return { ok: false, error: 'Page không nằm trong phiên kết nối hiện tại' };
        if (!mp.access_token) return { ok: false, error: 'Page không có access token (thiếu quyền messaging?)' };

        try {
            const enc = encryptStrict(`fbpage:token:${pageId}`, mp.access_token);
            const now = Date.now();
            const row: FbPage = {
                page_id: pageId,
                name: mp.name,
                access_token_enc: enc,
                app_id: this.pending.appId,
                category: mp.category ?? '',
                picture_url: mp.picture_url ?? '',
                enabled: 1,
                token_status: 'active',
                last_customer_message_at: 0,
                last_backfill_at: 0,
                connected_at: now,
            };
            const db = DatabaseService.getInstance();
            const appId = this.pending.appId;
            const level = this.pending.access.level;
            // Atomic: never leave an fb_page credential row without its accounts row.
            db.transaction(() => {
                db.upsertFbPage(row);
                db.upsertPageAccount(pageId, mp.name, mp.picture_url ?? '');
                db.setFbAppAccessLevel(appId, level);
            });
            // Drop the pending token buffer once persisted.
            this.pending = null;
            return { ok: true, page: { page_id: pageId, name: mp.name, picture_url: mp.picture_url ?? '', category: mp.category ?? '' } };
        } catch (err: any) {
            const msg = err?.message || 'Không lưu được Page';
            Logger.error(`[PageAuthService] connectPage failed: ${msg}`);
            return { ok: false, error: msg };
        }
    }

    /** Remove a Page and all of its channel='page' data (delegates to DB). */
    disconnectPage(pageId: string): { ok: boolean; error?: string } {
        try { DatabaseService.getInstance().deleteFbPage(pageId); return { ok: true }; }
        catch (err: any) { return { ok: false, error: err?.message || 'Không ngắt kết nối được' }; }
    }

    /** Re-check a stored Page token; update token_status. Returns the live status. */
    async verifyToken(pageId: string): Promise<{ ok: boolean; status: string; error?: string }> {
        const page = DatabaseService.getInstance().getFbPage(pageId);
        if (!page) return { ok: false, status: 'revoked', error: 'Page không tồn tại' };
        const token = decryptSecret(page.access_token_enc);
        if (!token) {
            DatabaseService.getInstance().setFbPageTokenStatus(pageId, 'revoked');
            return { ok: false, status: 'revoked', error: 'Không giải mã được token (máy khác?)' };
        }
        try {
            await pageGraphClient.verifyPageToken(token);
            DatabaseService.getInstance().setFbPageTokenStatus(pageId, 'active');
            return { ok: true, status: 'active' };
        } catch (err: any) {
            const status = err instanceof MetaGraphError && err.kind === 'token' ? 'expired' : 'active';
            if (status === 'expired') DatabaseService.getInstance().setFbPageTokenStatus(pageId, 'expired');
            return { ok: false, status, error: err?.message || 'Kiểm tra token thất bại' };
        }
    }

    /**
     * Best-effort access level from granted permissions. The client CANNOT read
     * App Review status, so 'advanced' is never inferred here — the deployer sets
     * it after review (setFbAppAccessLevel). Missing required scopes ⇒ 'dev'.
     */
    detectAccessLevel(grantedScopes: string[]): AccessLevelReport {
        const missing = PAGE_SCOPES.filter((s) => !grantedScopes.includes(s));
        const level: PageAccessLevel = missing.length === 0 ? 'standard' : 'dev';
        return { level, grantedScopes, missingScopes: missing };
    }
}

export const pageAuthService = PageAuthService.getInstance();
