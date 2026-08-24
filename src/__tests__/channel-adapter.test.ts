import { zaloPayloadToChannelEvent } from '../services/chat-agent/adapters/zalo-channel-adapter';

// The adapter must faithfully translate the legacy zca-js event:message payload
// into a channel-neutral ChannelEvent, preserving the exact fields the dispatcher
// relies on (mentions, msgId, group flag, content-object title/href, isSelf).

describe('zaloPayloadToChannelEvent', () => {
  it('maps a DM text message', () => {
    const evt = zaloPayloadToChannelEvent({
      zaloId: 'acc1',
      message: { threadId: 't1', type: 0, isSelf: false, data: { uidFrom: 'u9', msgId: 'm1', ts: 1000, content: 'chào shop' } },
    });
    expect(evt).toMatchObject({
      channel: 'zalo', accountId: 'acc1', threadId: 't1', threadType: 'user',
      senderId: 'u9', msgId: 'm1', ts: 1000, text: 'chào shop', isSelf: false,
    });
  });

  it('maps a group message and its mentions (pos/len preserved)', () => {
    const evt = zaloPayloadToChannelEvent({
      zaloId: 'acc1',
      message: {
        threadId: 'g1', type: 1, isSelf: false,
        data: { uidFrom: 'u2', msgId: 'm2', content: '@Bot cho hỏi giá', mentions: [{ uid: 'acc1', pos: 0, len: 4 }] },
      },
    });
    expect(evt?.threadType).toBe('group');
    expect(evt?.mentions).toEqual([{ uid: 'acc1', pos: 0, len: 4 }]);
  });

  it('extracts title/href from a rich content object (chat.recommended)', () => {
    const evt = zaloPayloadToChannelEvent({
      zaloId: 'acc1',
      message: { threadId: 't2', type: 0, data: { uidFrom: 'u3', msgId: 'm3', msgType: 'chat.recommended', content: { title: 'Sản phẩm A', href: 'https://x' } } },
    });
    expect(evt?.text).toBe('Sản phẩm A');
  });

  it('reads content.msg for the standard rich text shape', () => {
    const evt = zaloPayloadToChannelEvent({
      zaloId: 'acc1',
      message: { threadId: 't3', type: 0, data: { uidFrom: 'u4', msgId: 'm4', content: { msg: 'nội dung' } } },
    });
    expect(evt?.text).toBe('nội dung');
  });

  it('flags a self message', () => {
    const evt = zaloPayloadToChannelEvent({
      zaloId: 'acc1',
      message: { threadId: 't4', type: 0, isSelf: true, data: { uidFrom: 'acc1', msgId: 'm5', content: 'bên em trả lời' } },
    });
    expect(evt?.isSelf).toBe(true);
  });

  it('returns null when account or thread is missing', () => {
    expect(zaloPayloadToChannelEvent({ message: { threadId: 't1' } })).toBeNull();
    expect(zaloPayloadToChannelEvent({ zaloId: 'acc1', message: {} })).toBeNull();
    expect(zaloPayloadToChannelEvent(null)).toBeNull();
  });
});
