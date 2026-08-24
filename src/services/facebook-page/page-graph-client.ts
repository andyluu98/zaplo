/**
 * page-graph-client.ts — thin axios wrapper over the Facebook Graph API (v25.0)
 * for the PAGE channel. Isolated so the auth service and (Phase 3/4) webhook and
 * send services share ONE HTTP surface + ONE Meta-error translation.
 *
 * SECURITY: never logs tokens or the app secret. Errors are translated to a
 * MetaGraphError carrying only the Meta error code/subcode + a safe message.
 */

import axios, { AxiosInstance } from 'axios';
import Logger from '../../utils/Logger';
import type { ManagedPage } from '../../models';

export const GRAPH_VERSION = 'v25.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** A translated Graph API error. `kind` buckets the cases callers act on. */
export class MetaGraphError extends Error {
    constructor(
        public readonly kind: 'token' | 'rate_limit' | 'permission' | 'unknown',
        public readonly code: number,
        message: string,
        public readonly subcode?: number,
    ) {
        super(message);
        this.name = 'MetaGraphError';
    }
}

/** Map a raw Graph error payload → MetaGraphError (no secrets in the message). */
export function translateMetaError(err: any): MetaGraphError {
    const e = err?.response?.data?.error;
    if (e && typeof e.code === 'number') {
        const code = e.code as number;
        const subcode = e.error_subcode as number | undefined;
        // 190 = invalid/expired token; 102/463/467 = session/token problems
        if (code === 190 || code === 102 || code === 463 || code === 467) {
            return new MetaGraphError('token', code, 'Access token không hợp lệ hoặc đã hết hạn', subcode);
        }
        // 4/17/32/613 = rate / throttling limits
        if (code === 4 || code === 17 || code === 32 || code === 613) {
            return new MetaGraphError('rate_limit', code, 'Đã chạm giới hạn tần suất của Facebook, thử lại sau', subcode);
        }
        // 10 / 200-299 = permission / capability not granted
        if (code === 10 || (code >= 200 && code <= 299)) {
            return new MetaGraphError('permission', code, 'App thiếu quyền cần thiết (cần App Review / cấp quyền)', subcode);
        }
        return new MetaGraphError('unknown', code, e.message ? String(e.message) : 'Lỗi Graph API không xác định', subcode);
    }
    // Network / non-Graph error — surface a generic message, keep original for logs.
    const msg = err?.message ? String(err.message) : 'Lỗi mạng khi gọi Graph API';
    return new MetaGraphError('unknown', 0, msg);
}

export class PageGraphClient {
    private readonly http: AxiosInstance;

    constructor() {
        this.http = axios.create({ baseURL: GRAPH_BASE, timeout: 20000 });
    }

    /** Exchange an OAuth `code` for a short-lived user access token (main proc only). */
    async exchangeCodeForToken(p: { appId: string; appSecret: string; redirectUri: string; code: string }): Promise<string> {
        try {
            const res = await this.http.get('/oauth/access_token', {
                params: { client_id: p.appId, client_secret: p.appSecret, redirect_uri: p.redirectUri, code: p.code },
            });
            const token = res.data?.access_token;
            if (!token) throw new MetaGraphError('unknown', 0, 'Không nhận được access_token khi đổi code');
            return token;
        } catch (err: any) {
            const m = translateMetaError(err);
            Logger.error(`[PageGraphClient] exchangeCodeForToken failed: code=${m.code} ${m.kind}`);
            throw m;
        }
    }

    /** Upgrade a short-lived user token to a long-lived one. */
    async getLongLivedToken(p: { appId: string; appSecret: string; shortToken: string }): Promise<string> {
        try {
            const res = await this.http.get('/oauth/access_token', {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: p.appId,
                    client_secret: p.appSecret,
                    fb_exchange_token: p.shortToken,
                },
            });
            const token = res.data?.access_token;
            if (!token) throw new MetaGraphError('unknown', 0, 'Không nhận được long-lived token');
            return token;
        } catch (err: any) {
            const m = translateMetaError(err);
            Logger.error(`[PageGraphClient] getLongLivedToken failed: code=${m.code} ${m.kind}`);
            throw m;
        }
    }

    /** The Pages the user manages, each with its own Page access token. */
    async getManagedPages(userToken: string): Promise<ManagedPage[]> {
        try {
            const res = await this.http.get('/me/accounts', {
                params: { access_token: userToken, fields: 'id,name,category,access_token,tasks,picture{url}', limit: 100 },
            });
            const data: any[] = res.data?.data ?? [];
            return data.map((d) => ({
                id: String(d.id),
                name: String(d.name ?? ''),
                category: d.category ? String(d.category) : '',
                access_token: String(d.access_token ?? ''),
                picture_url: d.picture?.data?.url ? String(d.picture.data.url) : '',
                tasks: Array.isArray(d.tasks) ? d.tasks.map((t: any) => String(t)) : [],
            }));
        } catch (err: any) {
            const m = translateMetaError(err);
            Logger.error(`[PageGraphClient] getManagedPages failed: code=${m.code} ${m.kind}`);
            throw m;
        }
    }

    /** Granted permissions for the user token (used to detect access level). */
    async getGrantedPermissions(userToken: string): Promise<string[]> {
        try {
            const res = await this.http.get('/me/permissions', { params: { access_token: userToken } });
            const data: any[] = res.data?.data ?? [];
            return data.filter((d) => d.status === 'granted').map((d) => String(d.permission));
        } catch (err: any) {
            const m = translateMetaError(err);
            Logger.error(`[PageGraphClient] getGrantedPermissions failed: code=${m.code} ${m.kind}`);
            throw m;
        }
    }

    /** Verify a Page token is still usable; returns the page id/name it belongs to. */
    async verifyPageToken(pageToken: string): Promise<{ id: string; name: string }> {
        try {
            const res = await this.http.get('/me', { params: { access_token: pageToken, fields: 'id,name' } });
            return { id: String(res.data?.id ?? ''), name: String(res.data?.name ?? '') };
        } catch (err: any) {
            const m = translateMetaError(err);
            Logger.error(`[PageGraphClient] verifyPageToken failed: code=${m.code} ${m.kind}`);
            throw m;
        }
    }
}

/** Process-wide singleton — stateless, safe to share. */
export const pageGraphClient = new PageGraphClient();
