/**
 * page-types.ts — transient types for the Page connect flow (not DB rows).
 * DB row shapes live in `src/models/facebook-page.ts`.
 */

import type { PageAccessLevel, ManagedPage } from '../../models';

/**
 * Default OAuth redirect target. FB renders this page on success; we intercept
 * the navigation (with the `?code=`) before it loads, so it never needs a server.
 * The deployer must register this exact URI as a Valid OAuth Redirect URI, OR
 * override it with their own registered URI in the wizard.
 */
export const DEFAULT_REDIRECT_URI = 'https://www.facebook.com/connect/login_success.html';

/** The 5 permissions the Page auto-reply needs. */
export const PAGE_SCOPES = [
    'pages_show_list',
    'pages_messaging',
    'pages_manage_metadata',
    'pages_read_engagement',
    'business_management',
] as const;

/** Input to begin the OAuth dialog. `configId` chooses FLB over classic scope. */
export interface StartOAuthInput {
    appId: string;
    /** Facebook Login for Business config id. When set, `scope` is NOT sent. */
    configId?: string;
    /** Must exactly match a Valid OAuth Redirect URI registered on the app. */
    redirectUri: string;
}

/** Result of the interactive OAuth dialog. */
export type StartOAuthResult =
    | { ok: true; code: string }
    | { ok: false; error: string; cancelled?: boolean };

/** Outcome of listing/connecting Pages. */
export interface ConnectPageResult {
    ok: boolean;
    page?: { page_id: string; name: string; picture_url: string; category: string };
    error?: string;
}

/** Best-effort access-level detection from granted permissions. */
export interface AccessLevelReport {
    level: PageAccessLevel;
    grantedScopes: string[];
    missingScopes: string[];
}

export type { ManagedPage };
