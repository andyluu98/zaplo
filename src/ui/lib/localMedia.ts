/**
 * Convert absolute local file path → local-media:// URL
 * which is served by Electron's custom protocol handler (bypasses CSP/sandbox restriction on file://).
 *
 * Usage:
 *   <img src={toLocalMediaUrl(filePath)} />           // full resolution
 *   <img src={toLocalMediaUrl(filePath, 240)} />      // thumbnail at 240px wide (cached)
 *
 * When `width` is provided the protocol handler resizes + caches via nativeImage.
 * All existing callers (no width arg) are unchanged.
 */
export function toLocalMediaUrl(filePath: string, width?: number): string {
  if (!filePath) return '';
  // Already a proper URL → return as-is
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('local-media://')) {
    return filePath;
  }
  // Strip existing file:/// prefix if present
  const stripped = filePath.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
  // Normalize backslashes → forward slashes
  const normalized = stripped.replace(/\\/g, '/');
  // Ensure leading slash for absolute paths on Windows (D:/... → /D:/...)
  const withSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  const base = 'local-media://' + withSlash;
  return width != null && width > 0 ? `${base}?w=${width}` : base;
}

/**
 * Check if a path is a local file path (not a remote URL)
 */
export function isLocalPath(path: string): boolean {
  if (!path) return false;
  return !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:');
}

