/**
 * facebook-page.ts — data models for the Facebook PAGE channel (Graph API v25).
 *
 * These describe the two NEW credential/config tables (`fb_app`, `fb_page`).
 * Conversation data (accounts/contacts/messages) is NOT modelled here — a Page
 * reuses the unified tables with `channel='page'`.
 *
 * Secrets (`*_enc` fields) hold ciphertext produced by
 * SecureSettingsService.encryptStrict — never plaintext. Callers decrypt on read.
 */

/** Standard-messaging health of a stored Page Access Token. */
export type PageTokenStatus = 'active' | 'expired' | 'revoked';

/**
 * App access level as reported by Meta. `dev` = only app-role users can message
 * the Page; `standard` = live but limited; `advanced` = App-Review-approved,
 * general public can message. Drives the honest UI state (red-team / kongming).
 */
export type PageAccessLevel = 'dev' | 'standard' | 'advanced';

/** How the inbound webhook is hosted (filled in Phase 3). */
export type PageWebhookMode = 'local' | 'tunnel';

/** One Facebook app the deployer registered (per-app secret — red-team S8). */
export interface FbApp {
    app_id: string;
    /** Ciphertext of the App Secret (enc:...). */
    app_secret_enc: string;
    /** Ciphertext of the webhook verify token (enc:...). */
    verify_token_enc: string;
    /** Facebook Login for Business configuration id; '' for classic-scope apps. */
    config_id?: string;
    access_level: PageAccessLevel;
    webhook_mode: PageWebhookMode;
    webhook_port: number;
    public_url: string;
    created_at?: number;
    updated_at?: number;
}

/** A connected Facebook Page. */
export interface FbPage {
    page_id: string;
    name: string;
    /** Ciphertext of the Page Access Token (enc:...). */
    access_token_enc: string;
    /** Which fb_app this Page authenticated through. */
    app_id: string;
    category: string;
    picture_url: string;
    enabled: number;                       // 1 | 0
    token_status: PageTokenStatus;
    last_customer_message_at: number;      // ms epoch — drives the 24h window (Phase 4)
    last_backfill_at: number;              // ms epoch — backfill cursor (Phase 3)
    connected_at?: number;
    updated_at?: number;
}

/** A Page returned by GET /me/accounts during the connect flow (pre-save). */
export interface ManagedPage {
    id: string;
    name: string;
    category?: string;
    /** Short-lived Page token from /me/accounts; encrypted before persisting. */
    access_token: string;
    picture_url?: string;
    /** Permission tasks the user holds on the Page (e.g. MESSAGING, MANAGE). */
    tasks?: string[];
}
