/**
 * derive-channel.ts
 * Suy ra kênh (fb|zalo) TỪ tài khoản. channel của agent-target = channel của account.
 */
import type { Channel } from './agent-types';

export function deriveChannel(account: { channel?: string }): Channel {
  const c = account?.channel;
  if (c === 'fb' || c === 'zalo') return c;
  throw new Error(`Tài khoản không có kênh hợp lệ (fb|zalo): ${JSON.stringify(c)}`);
}
