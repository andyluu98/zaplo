/**
 * posting-image-generator.ts
 *
 * Calls OpenAI DALL-E 3 to generate an image from a text prompt.
 * Returns the temporary URL provided by OpenAI.
 * Does NOT save the image locally — caller owns the download step.
 */

import axios from 'axios';

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const TIMEOUT_MS = 90_000;

/**
 * Generate an image via OpenAI DALL-E 3.
 * @param prompt - User text prompt (truncated to 4000 chars per OpenAI limit).
 * @param apiKey - Decrypted OpenAI API key.
 * @returns Temporary image URL (expires after ~60 minutes).
 * @throws Error with Vietnamese-friendly message on known failure types.
 */
export async function generateImage(prompt: string, apiKey: string): Promise<string> {
  try {
    const res = await axios.post(
      OPENAI_IMAGE_URL,
      {
        model: 'dall-e-3',
        prompt: prompt.slice(0, 4000),
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'url',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: TIMEOUT_MS,
      },
    );

    const url: string | undefined = res.data?.data?.[0]?.url;
    if (!url) throw new Error('OpenAI trả về kết quả không hợp lệ (không có URL ảnh)');
    return url;
  } catch (err: any) {
    // Axios HTTP error
    if (err.response) {
      const status: number = err.response.status;
      const openaiMsg: string = err.response.data?.error?.message || '';

      if (status === 401) {
        throw new Error('OpenAI API key không hợp lệ');
      }
      if (status === 429) {
        throw new Error('OpenAI quá tải/đã hết hạn mức, thử lại sau');
      }
      if (status === 400) {
        // Content policy violation or bad request
        const detail = openaiMsg || 'Nội dung không được chấp nhận';
        throw new Error(`OpenAI từ chối nội dung: ${detail}`);
      }

      // Generic HTTP error — surface OpenAI message if available
      const fallback = openaiMsg || `HTTP ${status}`;
      throw new Error(`OpenAI lỗi: ${fallback}`);
    }

    // Network timeout / connection refused
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new Error('Hết thời gian chờ khi gọi OpenAI, thử lại sau');
    }

    // Re-throw known errors we already wrapped above
    throw err;
  }
}
