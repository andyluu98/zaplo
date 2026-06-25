/**
 * facebook-write-service.ts
 * Service ký + gửi 1 GraphQL mutation GHI tới Facebook.
 *
 * Trừu tượng hóa từ FacebookCreateNotes.createNote: phần ký (buildFormData) giữ nguyên,
 * chỉ thay đổi friendlyName / docId / variables giữa các mutation.
 * KHÔNG chứa logic rate-limit/log — caller (IPC) lo phần đó.
 */

import axios from 'axios';
import { FBSessionData } from '../FacebookTypes';
import { buildFormData, parseFBResponse } from '../FacebookUtils';
import Logger from '../../../utils/Logger';
import type { WriteResult } from './facebook-write-types';

const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';

export interface SendMutationOpts {
  friendlyName: string;
  docId: string;
  /** Tham số GraphQL — sẽ JSON.stringify vào trường `variables`. */
  variables: Record<string, any>;
  /** Trường form bổ sung (vd dpr). */
  extraForm?: Record<string, string>;
  httpsAgent?: any;
}

/**
 * Gửi 1 mutation GHI. Trả {success,id?,error?}.
 * idPath: đường dẫn (mảng key) để rút id đối tượng tạo ra từ response — tùy mutation.
 */
export async function sendMutation(
  dataFB: FBSessionData,
  opts: SendMutationOpts,
  idPath?: string[],
): Promise<WriteResult> {
  if (!opts.docId) {
    return { success: false, error: `Thiếu doc_id cho mutation "${opts.friendlyName}" — chưa dò (xem facebook-write-doc-ids.ts).` };
  }

  const form = buildFormData(dataFB, { friendlyName: opts.friendlyName, docId: opts.docId });
  form['variables'] = JSON.stringify(opts.variables);
  // LSD bắt buộc cho /api/graphql/ — thiếu → FB trả error 1357054.
  if (dataFB.lsd) form['lsd'] = dataFB.lsd;
  form['__comet_req'] = '15';
  form['dpr'] = '1';
  if (opts.extraForm) Object.assign(form, opts.extraForm);

  try {
    const body = new URLSearchParams(form).toString();
    const response = await axios.post(GRAPHQL_URL, body, {
      headers: {
        'Host': 'www.facebook.com',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Origin': 'https://www.facebook.com',
        'Referer': 'https://www.facebook.com/',
        'Cookie': dataFB.cookieFacebook,
        // Headers BẮT BUỘC cho FB comet GraphQL GHI (thiếu → 1357054):
        'x-fb-friendly-name': opts.friendlyName,
        'x-fb-lsd': dataFB.lsd || '',
        'x-asbd-id': '359341',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
      },
      timeout: 30000,
      ...(opts.httpsAgent ? { httpsAgent: opts.httpsAgent } : {}),
    });

    // axios tự parse khi response là application/json; nếu là text có prefix for(;;); thì parse tay.
    const parsed = typeof response.data === 'string' ? parseFBResponse(response.data) : response.data;

    // FB trả lỗi nghiệp vụ trong body (HTTP vẫn 200): { errors: [...] } hoặc { error: ... }
    const fbErr = parsed?.errors?.[0]?.message || parsed?.error_description || parsed?.error;
    if (fbErr) {
      Logger.warn(`[facebook-write] ${opts.friendlyName} FB error: ${fbErr}`);
      return { success: false, error: String(fbErr), raw: parsed };
    }

    const id = idPath ? extractByPath(parsed, idPath) : undefined;
    return { success: true, id: id != null ? String(id) : undefined, raw: parsed };
  } catch (err: any) {
    Logger.error(`[facebook-write] ${opts.friendlyName} error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/** Rút giá trị lồng theo mảng key, an toàn null. */
function extractByPath(obj: any, path: string[]): any {
  return path.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
