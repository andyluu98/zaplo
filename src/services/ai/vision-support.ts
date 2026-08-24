/**
 * vision-support.ts
 *
 * Helpers for DeepSeek's image-understanding model `deepseek-v4-flash-vision-exp`
 * (announced 2026-08). Kept separate from AIAssistantService so the model gating
 * and multimodal-content shaping are unit-testable without Electron / network.
 *
 * The vision model is OpenAI-compatible: a user turn carrying images is sent as an
 * ARRAY content — `[{type:'text',text}, {type:'image_url',image_url:{url}}, ...]`
 * — instead of a plain string. External https URLs (≤8192 chars, ≤32 MiB) are
 * accepted directly, so a Meta CDN attachment URL is passed through as-is (no
 * download, no base64). Ref: https://api-docs.deepseek.com/guides/vision
 *
 * Only the vision model gets array content; every other model (and Zalo) keeps the
 * plain-string path byte-identical, so nothing else is affected.
 */

/** One part of an OpenAI-compatible multimodal message content array. */
export type MultimodalPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * Cap on images fed to the model per call. Vision tokens are costly and a thread
 * can accumulate many photos; keep only the most recent N (newest-first) so the
 * payload stays bounded. Chosen small — a customer asks about the last image or two.
 */
export const VISION_MAX_IMAGES = 6;

/**
 * True when `model` is an image-understanding model. Matches the current DeepSeek
 * vision id plus any future `-vision` / `-vision-exp` suffix so a new vision model
 * activates the multimodal path without another code change.
 */
export function isVisionModel(model: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return m === 'deepseek-v4-flash-vision-exp' || m.includes('-vision');
}

/**
 * Pull image URLs out of a stored `messages.attachments` JSON blob
 * (`[{type,url}, ...]`). Returns only http(s) URLs (what the Send/Vision APIs
 * accept); malformed JSON or non-image/local entries yield nothing.
 */
export function extractImageUrls(attachmentsJson: string | null | undefined): string[] {
  if (!attachmentsJson) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(attachmentsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const urls: string[] = [];
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    const type = String((a as any).type || '').toLowerCase();
    const url = (a as any).url;
    if (typeof url !== 'string') continue;
    if (!/^https?:\/\//i.test(url)) continue; // only remotely-fetchable URLs
    if (url.length > 8192) continue;           // DeepSeek external-URL limit
    // Only actual images: Meta tags photos as type 'image'; also accept a URL whose
    // path is an image file. A video/audio/file URL must NOT reach the vision model.
    const isImage = type === 'image' || type === 'photo';
    const looksLikeImage = /\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|#|$)/i.test(url);
    if (!isImage && !looksLikeImage) continue;
    urls.push(url);
  }
  return urls;
}

/**
 * Build the OpenAI-compatible multimodal content array for one user turn.
 * `images` is deduped and capped at {@link VISION_MAX_IMAGES}. Always includes the
 * text part first (empty string allowed — the images carry the question).
 */
export function buildMultimodalContent(text: string, images: string[]): MultimodalPart[] {
  const parts: MultimodalPart[] = [{ type: 'text', text: text || '' }];
  const seen = new Set<string>();
  for (const url of images) {
    if (seen.has(url)) continue;
    seen.add(url);
    parts.push({ type: 'image_url', image_url: { url } });
    if (seen.size >= VISION_MAX_IMAGES) break;
  }
  return parts;
}
