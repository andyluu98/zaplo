/**
 * SecureSettingsService.ts
 * Wrapper quanh electron.safeStorage để mã hóa data nhạy cảm trong SQLite.
 * Data được mã hóa bởi OS (Windows Credential Manager / macOS Keychain).
 * Chỉ app này trên đúng máy này mới giải mã được.
 */
import { safeStorage } from 'electron';
import DatabaseService from '../database/DatabaseService';
import Logger from '../../utils/Logger';

const ENC_PREFIX = 'enc:';

/**
 * Lưu value được mã hóa bởi safeStorage vào SQLite settings.
 */
export function secureSet(key: string, value: string): void {
    if (!value && value !== '') {
        DatabaseService.getInstance().setSetting(key, '');
        return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: lưu plaintext với warning (hiếm gặp — OS không hỗ trợ keychain)
        Logger.warn(`[SecureSettings] safeStorage unavailable — storing "${key}" as plaintext`);
        DatabaseService.getInstance().setSetting(key, value);
        return;
    }
    try {
        const encrypted = safeStorage.encryptString(value).toString('base64');
        DatabaseService.getInstance().setSetting(key, `${ENC_PREFIX}${encrypted}`);
    } catch (err: any) {
        Logger.error(`[SecureSettings] Encrypt failed for "${key}": ${err.message}`);
        // Fallback to plaintext rather than losing data
        DatabaseService.getInstance().setSetting(key, value);
    }
}

/** Ném khi safeStorage không khả dụng — dùng để hard-fail thay vì lưu plaintext. */
export class EncryptionUnavailableError extends Error {
    constructor(key: string) {
        super(`[SecureSettings] Encryption unavailable — refusing to store "${key}" as plaintext`);
        this.name = 'EncryptionUnavailableError';
    }
}

/**
 * Mã hoá HARD-FAIL, TRẢ VỀ chuỗi ciphertext (`enc:...base64`) thay vì ghi vào
 * app_settings. Cho caller muốn lưu bí mật vào cột bảng của riêng nó
 * (vd `fb_page.access_token_enc`) mà vẫn dùng chung 1 cơ chế mã hoá + chính sách
 * hard-fail. `label` chỉ dùng cho thông báo lỗi (không phải khoá lưu). Ném
 * EncryptionUnavailableError nếu OS không mã hoá được — KHÔNG bao giờ trả plaintext.
 * Chuỗi rỗng → trả '' (không có gì để mã hoá).
 */
export function encryptStrict(label: string, value: string): string {
    if (value === '') return '';
    if (!safeStorage.isEncryptionAvailable()) {
        throw new EncryptionUnavailableError(label);
    }
    try {
        return `${ENC_PREFIX}${safeStorage.encryptString(value).toString('base64')}`;
    } catch (err: any) {
        // Không log value; chỉ label + lý do
        Logger.error(`[SecureSettings] Strict encrypt failed for "${label}": ${err.message}`);
        throw new EncryptionUnavailableError(label);
    }
}

/**
 * Giải mã ciphertext do encryptStrict/secureSetStrict tạo. Trả null nếu không
 * giải mã được (vd blob từ máy khác). Chuỗi rỗng/nullish → null. Blob không có
 * tiền tố enc: (không kỳ vọng ở đường FB) trả về nguyên trạng để khoan dung dữ
 * liệu cũ.
 */
export function decryptSecret(enc: string | null | undefined): string | null {
    if (!enc) return null;
    if (!enc.startsWith(ENC_PREFIX)) return enc;
    try {
        return safeStorage.decryptString(Buffer.from(enc.slice(ENC_PREFIX.length), 'base64'));
    } catch (err: any) {
        Logger.warn(`[SecureSettings] decryptSecret failed — may be from a different machine: ${err.message}`);
        return null;
    }
}

/**
 * Như secureSet nhưng HARD-FAIL: nếu OS không mã hoá được (ví dụ VPS headless
 * không keyring) thì ném EncryptionUnavailableError thay vì âm thầm lưu plaintext.
 * Dùng cho bí mật nhạy cảm bắt buộc mã hoá lưu vào app_settings.
 * Không đổi secureSet để không hồi quy caller Zalo hiện có.
 * Chuỗi rỗng vẫn lưu được (xoá giá trị) — không có gì để mã hoá.
 */
export function secureSetStrict(key: string, value: string): void {
    if (value === '') {
        DatabaseService.getInstance().setSetting(key, '');
        return;
    }
    DatabaseService.getInstance().setSetting(key, encryptStrict(key, value));
}

/**
 * Đọc và giải mã value từ SQLite settings.
 * Trả về null nếu không tồn tại hoặc không giải mã được.
 */
export function secureGet(key: string): string | null {
    const raw = DatabaseService.getInstance().getSetting(key);
    if (!raw) return null;

    if (raw.startsWith(ENC_PREFIX)) {
        try {
            const buf = Buffer.from(raw.slice(ENC_PREFIX.length), 'base64');
            return safeStorage.decryptString(buf);
        } catch (err: any) {
            Logger.warn(`[SecureSettings] Decrypt failed for "${key}" — may be from different machine: ${err.message}`);
            return null;
        }
    }

    // Plaintext cũ (chưa migrate) — trả về nguyên
    return raw;
}

/**
 * Xóa secure setting.
 */
export function secureDelete(key: string): void {
    DatabaseService.getInstance().setSetting(key, '');
}


