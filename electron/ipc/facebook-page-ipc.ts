/**
 * facebook-page-ipc.ts — IPC surface for the Facebook Page channel (Graph API).
 *
 * Namespace `fbpage:` (kept distinct from the personal-FB `fb:` namespace).
 * SECURITY: never returns app secrets, verify tokens, or Page access tokens to
 * the renderer — only booleans/metadata. Encryption hard-fail surfaces as a
 * clear error the wizard shows (never silent plaintext).
 */

import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import DatabaseService from '../../src/services/database/DatabaseService';
import EventBroadcaster from '../../src/services/event/EventBroadcaster';
import Logger from '../../src/utils/Logger';
import { pageAuthService } from '../../src/services/facebook-page/page-auth-service';
import { EncryptionUnavailableError } from '../../src/services/secure/SecureSettingsService';
import { DEFAULT_REDIRECT_URI } from '../../src/services/facebook-page/page-types';
import { backfillPage, backfillAllPages } from '../../src/services/facebook-page/page-backfill-service';
import { IntegrationRegistry } from '../../src/services/integrations/IntegrationRegistry';
import TunnelService from '../../src/services/tunnel/TunnelService';
import type { FbApp, FbPage } from '../../src/models';

const WEBHOOK_PATH = '/webhook/messenger';

function fullWebhookUrl(publicUrl: string): string {
    if (!publicUrl) return '';
    return publicUrl.replace(/\/+$/, '') + WEBHOOK_PATH;
}

/** Strip secrets from an fb_app row before it reaches the renderer. */
function publicApp(a: FbApp) {
    return {
        app_id: a.app_id,
        config_id: a.config_id ?? '',
        access_level: a.access_level,
        webhook_mode: a.webhook_mode,
        webhook_port: a.webhook_port,
        public_url: a.public_url,
        hasSecret: !!a.app_secret_enc,
        hasVerifyToken: !!a.verify_token_enc,
    };
}

/** Strip the encrypted token from an fb_page row before it reaches the renderer. */
function publicPage(p: FbPage) {
    const { access_token_enc, ...rest } = p;
    return rest;
}

export function registerFacebookPageIpc(): void {
    // ─── App credentials ─────────────────────────────────────────────────────
    ipcMain.handle('fbpage:saveApp', async (_e, params: {
        appId: string; appSecret: string; verifyToken: string;
        configId?: string; publicUrl?: string; webhookPort?: number; webhookMode?: 'local' | 'tunnel';
    }) => {
        try {
            if (!params?.appId) return { success: false, error: 'Thiếu App ID' };
            pageAuthService.saveApp(params);
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) {
            if (e instanceof EncryptionUnavailableError) {
                return { success: false, error: 'Máy này không mã hoá được (thiếu keychain/keyring). Từ chối lưu bí mật dưới dạng plaintext.' };
            }
            Logger.error(`[fbpage:saveApp] ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('fbpage:getApp', async (_e, { appId }: { appId: string }) => {
        try {
            const a = DatabaseService.getInstance().getFbApp(appId);
            return { success: true, app: a ? publicApp(a) : null };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:listApps', async () => {
        try { return { success: true, apps: DatabaseService.getInstance().listFbApps().map(publicApp) }; }
        catch (e: any) { return { success: false, error: e.message, apps: [] }; }
    });

    ipcMain.handle('fbpage:setAccessLevel', async (_e, { appId, level }: { appId: string; level: string }) => {
        try {
            DatabaseService.getInstance().setFbAppAccessLevel(appId, level);
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    /** Generate a random webhook verify token for the wizard to display + save. */
    ipcMain.handle('fbpage:generateVerifyToken', async () => {
        try { return { success: true, verifyToken: crypto.randomBytes(24).toString('hex') }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });

    /** The redirect URI the deployer must register (shown in the wizard). */
    ipcMain.handle('fbpage:getRedirectUri', async () => {
        return { success: true, redirectUri: DEFAULT_REDIRECT_URI };
    });

    // ─── OAuth + Pages ───────────────────────────────────────────────────────
    ipcMain.handle('fbpage:listManagedPages', async (_e, { appId, redirectUri, configId }: { appId: string; redirectUri?: string; configId?: string }) => {
        try {
            const res = await pageAuthService.listManagedPages({
                appId, redirectUri: redirectUri || DEFAULT_REDIRECT_URI, configId,
            });
            return { success: res.ok, ...res };
        } catch (e: any) {
            Logger.error(`[fbpage:listManagedPages] ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('fbpage:connectPage', async (_e, { pageId }: { pageId: string }) => {
        try {
            const res = pageAuthService.connectPage(pageId);
            if (res.ok) {
                DatabaseService.getInstance().save();
                EventBroadcaster.emit('fbpage:changed', { action: 'connect', pageId });
            }
            return { success: res.ok, ...res };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:disconnectPage', async (_e, { pageId }: { pageId: string }) => {
        try {
            const res = pageAuthService.disconnectPage(pageId);
            if (res.ok) {
                DatabaseService.getInstance().save();
                EventBroadcaster.emit('fbpage:changed', { action: 'disconnect', pageId });
            }
            return { success: res.ok, ...res };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:verifyToken', async (_e, { pageId }: { pageId: string }) => {
        try {
            const res = await pageAuthService.verifyToken(pageId);
            DatabaseService.getInstance().save();
            return { success: res.ok, ...res };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Connected Pages ─────────────────────────────────────────────────────
    ipcMain.handle('fbpage:listPages', async () => {
        try { return { success: true, pages: DatabaseService.getInstance().listFbPages().map(publicPage) }; }
        catch (e: any) { return { success: false, error: e.message, pages: [] }; }
    });

    ipcMain.handle('fbpage:setPageEnabled', async (_e, { pageId, enabled }: { pageId: string; enabled: boolean }) => {
        try {
            DatabaseService.getInstance().setFbPageEnabled(pageId, enabled ? 1 : 0);
            DatabaseService.getInstance().save();
            EventBroadcaster.emit('fbpage:changed', { action: 'toggle', pageId });
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    // ─── Webhook config + tunnel (Phase 3) ───────────────────────────────────
    ipcMain.handle('fbpage:getWebhookInfo', async (_e, { appId }: { appId?: string }) => {
        try {
            const port = IntegrationRegistry.getWebhookPort();
            const app = appId ? DatabaseService.getInstance().getFbApp(appId) : null;
            const publicUrl = app?.public_url || '';
            return {
                success: true,
                port,
                path: WEBHOOK_PATH,
                localUrl: `http://127.0.0.1:${port}${WEBHOOK_PATH}`,
                publicUrl,
                fullUrl: fullWebhookUrl(publicUrl),
                tunnelUrl: TunnelService.getUrl(),
                tunnelActive: TunnelService.isActive(),
            };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:setWebhookConfig', async (_e, { appId, publicUrl, webhookMode, webhookPort }: { appId: string; publicUrl?: string; webhookMode?: 'local' | 'tunnel'; webhookPort?: number }) => {
        try {
            if (!appId) return { success: false, error: 'Thiếu App ID' };
            // saveApp keeps existing secret/verify when passed empty strings.
            pageAuthService.saveApp({ appId, appSecret: '', verifyToken: '', publicUrl, webhookMode, webhookPort });
            DatabaseService.getInstance().save();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:backfillNow', async (_e, { pageId }: { pageId?: string }) => {
        try {
            if (pageId) { const stored = await backfillPage(pageId); return { success: true, stored }; }
            await backfillAllPages();
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:startQuickTunnel', async (_e, { appId }: { appId?: string }) => {
        try {
            // NOTE: TunnelService is a single-tunnel singleton — starting this stops
            // any active relay/integration tunnel (dev-only 'quick' mode).
            const port = IntegrationRegistry.getWebhookPort();
            const url = await TunnelService.start(port);
            if (appId && url) {
                pageAuthService.saveApp({ appId, appSecret: '', verifyToken: '', publicUrl: url, webhookMode: 'tunnel' });
                DatabaseService.getInstance().save();
            }
            return { success: true, url, fullUrl: fullWebhookUrl(url) };
        } catch (e: any) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('fbpage:stopQuickTunnel', async () => {
        try { await TunnelService.stop(); return { success: true }; }
        catch (e: any) { return { success: false, error: e.message }; }
    });
}
