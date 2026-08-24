import { parseWebhookBody } from '../services/facebook-page/page-webhook-parse';

const PAGE = '100000000000001';
const PSID = '7000000000000009';

describe('parseWebhookBody', () => {
  it('parses an inbound customer text message', () => {
    const body = {
      object: 'page',
      entry: [{
        id: PAGE, time: 1,
        messaging: [{
          sender: { id: PSID }, recipient: { id: PAGE }, timestamp: 1710000000000,
          message: { mid: 'mid.1', text: 'Chào shop 🎉' },
        }],
      }],
    };
    const [ev] = parseWebhookBody(body);
    expect(ev.kind).toBe('message');
    expect(ev.pageId).toBe(PAGE);
    expect(ev.psid).toBe(PSID);
    expect(ev.senderId).toBe(PSID);
    expect(ev.mid).toBe('mid.1');
    expect(ev.text).toBe('Chào shop 🎉');
    expect(ev.ts).toBe(1710000000000);
  });

  it('parses an image attachment message', () => {
    const body = {
      object: 'page',
      entry: [{ id: PAGE, messaging: [{
        sender: { id: PSID }, recipient: { id: PAGE }, timestamp: 2,
        message: { mid: 'mid.2', attachments: [{ type: 'image', payload: { url: 'https://x/y.jpg' } }] },
      }] }],
    };
    const [ev] = parseWebhookBody(body);
    expect(ev.kind).toBe('message');
    expect(ev.attachments).toEqual([{ type: 'image', url: 'https://x/y.jpg' }]);
  });

  it('parses an echo (Page-sent) message with app_id and recipient PSID', () => {
    const body = {
      object: 'page',
      entry: [{ id: PAGE, messaging: [{
        sender: { id: PAGE }, recipient: { id: PSID }, timestamp: 3,
        message: { mid: 'mid.3', text: 'Xin chào!', is_echo: true, app_id: 555 },
      }] }],
    };
    const [ev] = parseWebhookBody(body);
    expect(ev.kind).toBe('echo');
    expect(ev.pageId).toBe(PAGE);
    expect(ev.psid).toBe(PSID);         // customer is the recipient for an echo
    expect(ev.senderId).toBe(PAGE);
    expect(ev.appId).toBe('555');
  });

  it('parses read and delivery receipts', () => {
    const body = {
      object: 'page',
      entry: [{ id: PAGE, messaging: [
        { sender: { id: PSID }, recipient: { id: PAGE }, timestamp: 4, read: { watermark: 4 } },
        { sender: { id: PSID }, recipient: { id: PAGE }, timestamp: 5, delivery: { watermark: 5 } },
      ] }],
    };
    const evs = parseWebhookBody(body);
    expect(evs.map(e => e.kind)).toEqual(['read', 'delivery']);
  });

  it('handles multiple entries and messaging events', () => {
    const body = {
      object: 'page',
      entry: [
        { id: PAGE, messaging: [{ sender: { id: PSID }, recipient: { id: PAGE }, timestamp: 6, message: { mid: 'a', text: '1' } }] },
        { id: PAGE, messaging: [{ sender: { id: PSID }, recipient: { id: PAGE }, timestamp: 7, message: { mid: 'b', text: '2' } }] },
      ],
    };
    expect(parseWebhookBody(body).map(e => e.mid)).toEqual(['a', 'b']);
  });

  it('never throws on malformed / empty bodies', () => {
    expect(parseWebhookBody(undefined)).toEqual([]);
    expect(parseWebhookBody({})).toEqual([]);
    expect(parseWebhookBody({ entry: 'nope' })).toEqual([]);
    expect(parseWebhookBody({ entry: [{ id: PAGE }] })).toEqual([]);
    expect(parseWebhookBody({ entry: [{ id: PAGE, messaging: [{}] }] })[0].kind).toBe('other');
  });
});
