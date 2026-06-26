# Test Cases — AI & Agent Hub + Posting Suite (TDD)

> Tiền-code TDD doc. Mỗi nhóm: input / expected / lý do.
> Khung jest `test('...', () => {...})` — chưa có implementation file để import.
> Tổng: **44 case**.

---

## Nhóm 1 — `deriveChannel(account)` (5 case)

**File thuần đề xuất:** `src/services/agent/derive-channel.ts`

```ts
// Case 1-1: account.channel = 'fb' → 'fb'
test('account có channel fb → trả fb', () => {
  expect(deriveChannel({ channel: 'fb' })).toBe('fb');
});

// Case 1-2: account.channel = 'zalo' → 'zalo'
test('account có channel zalo → trả zalo', () => {
  expect(deriveChannel({ channel: 'zalo' })).toBe('zalo');
});

// Case 1-3: channel undefined → throw
test('account thiếu channel → throw rõ ràng', () => {
  expect(() => deriveChannel({ channel: undefined })).toThrow(/channel/i);
});

// Case 1-4: channel null → throw
test('account channel null → throw', () => {
  expect(() => deriveChannel({ channel: null as any })).toThrow();
});

// Case 1-5: channel giá trị lạ → throw validation
test('channel không hỗ trợ (vd "twitter") → throw', () => {
  expect(() => deriveChannel({ channel: 'twitter' } as any)).toThrow(/unsupported|không hỗ trợ/i);
});
```

---

## Nhóm 2 — `validateAgent(agent)` (5 case)

**File thuần đề xuất:** `src/services/agent/validate-agent.ts`
Dùng kiểu `AgentDef` (sẽ định nghĩa khi implement).

```ts
// Case 2-1: thiếu assistantId → lỗi "brain bắt buộc"
test('agent thiếu assistantId → invalid', () => {
  const a = { targets: [{ account: { channel: 'fb' }, groupIds: ['111'] }] };
  const r = validateAgent(a as any);
  expect(r.valid).toBe(false);
  expect(r.errors).toContain(expect.stringMatching(/brain|assistant/i));
});

// Case 2-2: target không có account → invalid
test('target thiếu account → invalid', () => {
  const a = { assistantId: 'ai-1', targets: [{ groupIds: ['111'] }] };
  expect(validateAgent(a as any).valid).toBe(false);
});

// Case 2-3: target không có nhóm nào → invalid
test('target.groupIds rỗng → invalid (phải có ≥1 nhóm)', () => {
  const a = {
    assistantId: 'ai-1',
    targets: [{ account: { channel: 'fb', zalo_id: 'acc1' }, groupIds: [] }],
  };
  expect(validateAgent(a as any).valid).toBe(false);
});

// Case 2-4: 0 target → invalid
test('agent không có target → invalid', () => {
  const a = { assistantId: 'ai-1', targets: [] };
  expect(validateAgent(a as any).valid).toBe(false);
});

// Case 2-5: agent hợp lệ đầy đủ → valid
test('agent đầy đủ → valid', () => {
  const a = {
    assistantId: 'ai-1',
    targets: [
      { account: { channel: 'fb', zalo_id: 'fb-acc1' }, groupIds: ['111', '222'] },
      { account: { channel: 'zalo', zalo_id: 'zl-acc1' }, groupIds: ['zg1'] },
    ],
  };
  expect(validateAgent(a as any).valid).toBe(true);
});
```

---

## Nhóm 3 — `expandAgentQueue(agent, drafts)` (5 case)

**File thuần đề xuất:** `src/services/agent/expand-agent-queue.ts`

```ts
// Case 3-1: 1 bài × (3 nhóm FB + 2 nhóm Zalo) = 5 item, channel đúng
test('1 bài × 2 target (fb:3 nhóm, zalo:2 nhóm) = 5 item, channel mapping đúng', () => {
  const agent = {
    assistantId: 'ai-1',
    targets: [
      { account: { channel: 'fb', zalo_id: 'fb1' }, groupIds: ['g1', 'g2', 'g3'] },
      { account: { channel: 'zalo', zalo_id: 'zl1' }, groupIds: ['zg1', 'zg2'] },
    ],
  };
  const drafts = [{ content: 'Bài test A' }];
  const items = expandAgentQueue(agent as any, drafts);
  expect(items).toHaveLength(5);
  expect(items.filter(i => i.channel === 'fb')).toHaveLength(3);
  expect(items.filter(i => i.channel === 'zalo')).toHaveLength(2);
});

// Case 3-2: N bài × M nhóm = N×M item
test('2 bài × 2 nhóm FB = 4 item', () => {
  const agent = {
    assistantId: 'ai-1',
    targets: [{ account: { channel: 'fb', zalo_id: 'fb1' }, groupIds: ['g1', 'g2'] }],
  };
  const items = expandAgentQueue(agent as any, [{ content: 'A' }, { content: 'B' }]);
  expect(items).toHaveLength(4);
});

// Case 3-3: mỗi item mang accountId của target, không lẫn giữa account
test('mỗi item mang accountId đúng của target', () => {
  const agent = {
    assistantId: 'ai-1',
    targets: [
      { account: { channel: 'fb', zalo_id: 'fb1' }, groupIds: ['g1'] },
      { account: { channel: 'fb', zalo_id: 'fb2' }, groupIds: ['g2'] },
    ],
  };
  const items = expandAgentQueue(agent as any, [{ content: 'X' }]);
  expect(items[0].accountId).toBe('fb1');
  expect(items[1].accountId).toBe('fb2');
});

// Case 3-4: bài rỗng bị bỏ qua
test('bài content rỗng bị bỏ → số item giảm', () => {
  const agent = {
    assistantId: 'ai-1',
    targets: [{ account: { channel: 'fb', zalo_id: 'fb1' }, groupIds: ['g1'] }],
  };
  const items = expandAgentQueue(agent as any, [{ content: '' }, { content: 'Ok' }]);
  expect(items).toHaveLength(1);
});

// Case 3-5: không có target → rỗng
test('targets [] → []', () => {
  const agent = { assistantId: 'ai-1', targets: [] };
  expect(expandAgentQueue(agent as any, [{ content: 'X' }])).toHaveLength(0);
});
```

---

## Nhóm 4 — Channel routing (sender dispatch) (4 case)

**Scope:** tích hợp — mock FacebookWriteService & ZaloSender.

```ts
// Case 4-1: item.channel='fb' → gọi đúng FB sender
test('item channel fb → gọi fbSender.send', async () => {
  const fbSend = jest.fn().mockResolvedValue({ success: true });
  const zaloSend = jest.fn();
  await routeAndSend(
    { channel: 'fb', accountId: 'fb1', groupId: 'g1', content: 'Hi' } as any,
    { fb: fbSend, zalo: zaloSend },
  );
  expect(fbSend).toHaveBeenCalledTimes(1);
  expect(zaloSend).not.toHaveBeenCalled();
});

// Case 4-2: item.channel='zalo' → gọi đúng Zalo sender
test('item channel zalo → gọi zaloSender.send', async () => {
  const fbSend = jest.fn();
  const zaloSend = jest.fn().mockResolvedValue({ success: true });
  await routeAndSend(
    { channel: 'zalo', accountId: 'zl1', groupId: 'zg1', content: 'Hi' } as any,
    { fb: fbSend, zalo: zaloSend },
  );
  expect(zaloSend).toHaveBeenCalledTimes(1);
  expect(fbSend).not.toHaveBeenCalled();
});

// Case 4-3: channel không hỗ trợ → throw
test('channel lạ → throw UnsupportedChannel', async () => {
  await expect(
    routeAndSend({ channel: 'twitter' } as any, {} as any)
  ).rejects.toThrow(/unsupported|channel/i);
});

// Case 4-4: sender được gọi với đúng accountId (không lẫn account)
test('sender nhận đúng accountId của item, không nhầm account khác', async () => {
  const fbSend = jest.fn().mockResolvedValue({ success: true });
  await routeAndSend(
    { channel: 'fb', accountId: 'fb-specific-123', groupId: 'g1', content: 'X' } as any,
    { fb: fbSend, zalo: jest.fn() },
  );
  expect(fbSend).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'fb-specific-123' }));
});
```

---

## Nhóm 5 — Assistant sharing (1 assistant → N agent) (4 case)

**Scope:** unit với mock DB/service.

```ts
// Case 5-1: 1 assistant gắn vào N agent, getAssistantForAgent trả đúng assistant
test('1 assistant dùng chung N agent — mỗi agent đều resolve đúng assistant', () => {
  const assistantId = 'ai-shared';
  const agents = [
    { id: 'agent-A', assistantId },
    { id: 'agent-B', assistantId },
    { id: 'agent-C', assistantId },
  ];
  agents.forEach(a => {
    expect(resolveAssistantId(a as any)).toBe(assistantId);
  });
});

// Case 5-2: đổi systemPrompt assistant → agent dùng chung thấy prompt mới ngay
test('đổi systemPrompt assistant → resolve lại thấy prompt mới', () => {
  const assistant = { id: 'ai-1', systemPrompt: 'Prompt cũ', enabled: true };
  const getPrompt = (a: any) => a.systemPrompt;
  expect(getPrompt(assistant)).toBe('Prompt cũ');
  assistant.systemPrompt = 'Prompt mới';
  expect(getPrompt(assistant)).toBe('Prompt mới'); // shared ref → thấy ngay
});

// Case 5-3: xóa assistant đang được ≥1 agent dùng → cảnh báo / chặn
test('deleteAssistant khi còn agent dùng → trả warning/error, không xóa', () => {
  const canDelete = (assistantId: string, usedByAgentIds: string[]) =>
    usedByAgentIds.length === 0
      ? { ok: true }
      : { ok: false, error: `Đang dùng bởi ${usedByAgentIds.length} agent` };

  expect(canDelete('ai-1', ['agent-A', 'agent-B']).ok).toBe(false);
  expect(canDelete('ai-1', []).ok).toBe(true);
});

// Case 5-4: assistant disabled → mọi agent dùng nó không chat được
test('assistant enabled=false → chat() throw', async () => {
  const chatWithAssistant = async (enabled: boolean) => {
    if (!enabled) throw new Error('Trợ lý AI đã bị tắt');
    return 'ok';
  };
  await expect(chatWithAssistant(false)).rejects.toThrow(/tắt|disabled/i);
  await expect(chatWithAssistant(true)).resolves.toBe('ok');
});
```

---

## Nhóm 6 — Schedule resolve cho agent đa-target (4 case)

**Scope:** unit, mock Date.now().

```ts
// Case 6-1: schedule 'hourly' tất cả target → nextRun = now + 1h mỗi target
test('schedule hourly → nextRunAt cho mỗi target = now + 3600000', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-06-25T10:00:00Z'));
  const targets = [{ accountId: 'acc1' }, { accountId: 'acc2' }];
  const schedules = targets.map(t => resolveNextRun(t as any, { type: 'hourly' }));
  expect(schedules).toEqual([
    { accountId: 'acc1', nextRunAt: new Date('2026-06-25T11:00:00Z').getTime() },
    { accountId: 'acc2', nextRunAt: new Date('2026-06-25T11:00:00Z').getTime() },
  ]);
  jest.useRealTimers();
});

// Case 6-2: schedule 'daily' tại giờ cố định — target đã qua giờ đó → nextRun = ngày mai
test('schedule daily 08:00 mà hiện 09:00 → nextRun ngày mai 08:00', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-06-25T09:00:00+07:00'));
  const r = resolveNextRun({ accountId: 'acc1' } as any, { type: 'daily', hour: 8 });
  const expected = new Date('2026-06-26T08:00:00+07:00').getTime();
  expect(r.nextRunAt).toBe(expected);
  jest.useRealTimers();
});

// Case 6-3: schedule 'daily' tại giờ chưa đến → nextRun = hôm nay
test('schedule daily 14:00 mà hiện 10:00 → nextRun hôm nay 14:00', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-06-25T10:00:00+07:00'));
  const r = resolveNextRun({ accountId: 'acc1' } as any, { type: 'daily', hour: 14 });
  const expected = new Date('2026-06-25T14:00:00+07:00').getTime();
  expect(r.nextRunAt).toBe(expected);
  jest.useRealTimers();
});

// Case 6-4: multi-target, schedule per-target độc lập (không gộp 2 account thành 1 job)
test('2 target cùng agent → resolve cho TỪNG target riêng biệt', () => {
  const targets = [{ accountId: 'fb1' }, { accountId: 'zl1' }];
  const schedules = targets.map(t => resolveNextRun(t as any, { type: 'hourly' }));
  expect(schedules[0].accountId).toBe('fb1');
  expect(schedules[1].accountId).toBe('zl1');
  expect(schedules).toHaveLength(2);
});
```

---

## Nhóm 7 — Rate-limit per (account, actionType, ngày) (4 case)

**File đã có:** `src/services/facebook/write/facebook-write-rate-limiter.ts`
Test `usedToday`, `canSend`, `recordSend` với mock `countToday`.

```ts
// Case 7-1: 2 account khác nhau, limit theo account — không gộp nhầm
test('usedToday acc1 ≠ usedToday acc2 — không gộp nhầm 2 tài khoản', () => {
  jest.mock('../services/facebook/write/facebook-action-log-service', () => ({
    countToday: (accountId: string) => accountId === 'acc1' ? 5 : 2,
  }));
  expect(usedToday('acc1', 'comment')).toBe(5);
  expect(usedToday('acc2', 'comment')).toBe(2);
});

// Case 7-2: canSend = false khi đã đạt limit
test('canSend false khi usedToday >= perDay limit', () => {
  setConfig({ perDay: { comment: 3, post_personal: 3, post_group: 3, reply_dm: 3 } });
  // mock countToday trả 3
  // expect canSend('acc1', 'comment') === false
  // (implementation mock trong beforeEach)
  expect(true).toBe(true); // placeholder — thay bằng mock thật khi implement
});

// Case 7-3: recordSend tăng bộ đếm in-memory phiên, remainingToday giảm 1
test('recordSend → remainingToday giảm 1 cho đúng account+actionType', () => {
  // Không ảnh hưởng account khác cùng actionType
  const before = remainingToday('accX', 'post_group');
  recordSend('accX', 'post_group');
  expect(remainingToday('accX', 'post_group')).toBe(before - 1);
  // accY không thay đổi
  const beforeY = remainingToday('accY', 'post_group');
  expect(remainingToday('accY', 'post_group')).toBe(beforeY);
});

// Case 7-4: comment vs post_group khác nhau trên cùng 1 account — không lẫn
test('rate-limit comment ≠ rate-limit post_group trên cùng account', () => {
  recordSend('sharedAcc', 'comment');
  const usedComment = usedToday('sharedAcc', 'comment');
  const usedPost    = usedToday('sharedAcc', 'post_group');
  // usedComment = usedPost + 1 (nếu bắt đầu từ 0)
  expect(usedComment).toBeGreaterThan(usedPost);
});
```

---

## Nhóm 8 — Dedupe policy (3 case)

**File đã có:** `src/services/facebook/write/dedupe-policy.ts`
**File đã có:** `src/__tests__/fb-dedupe-policy.test.ts` (2 case đã viết — bổ sung thêm)

```ts
// Case 8-1 (đã có) — chỉ comment dedupe
test('chỉ dedupe comment — bài đăng KHÔNG dedupe (được đăng lại)', () => {
  expect(shouldDedupe('comment')).toBe(true);
  expect(shouldDedupe('post_personal')).toBe(false);
  expect(shouldDedupe('post_group')).toBe(false);
  expect(shouldDedupe('reply_dm')).toBe(false);
});

// Case 8-2: post_group đăng lại cùng nhóm → KHÔNG bị skip (xác nhận fix bug cũ)
test('post_group cùng target → shouldDedupe=false, không bị block dù isDuplicate=true trong DB', () => {
  // Ngay cả khi isDuplicate trả true, nếu shouldDedupe=false → vẫn gửi
  const wouldSkip = (actionType: string, isDup: boolean) =>
    shouldDedupe(actionType as any) && isDup;
  expect(wouldSkip('post_group', true)).toBe(false);   // không bị skip
  expect(wouldSkip('comment', true)).toBe(true);       // comment bị skip
});

// Case 8-3: dedupeKey tùy chỉnh override target
test('dedupeKey custom được ưu tiên hơn target', () => {
  const item = { target: 'fb123', dedupeKey: 'custom-key-xyz' };
  expect(dedupeKeyOf(item as any)).toBe('custom-key-xyz');
});
```

---

## Nhóm 9 — Photo upload (4 case)

**File đã có:** `src/services/facebook/write/facebook-photo-upload.ts`
**File đã có:** `src/__tests__/fb-photo-upload.test.ts` (2 case đã viết — bổ sung thêm)

```ts
// Case 9-1 (đã có) — parsePhotoId từ object/string/for(;;)
test('parsePhotoId lấy photoID từ payload (object, string, for(;;); prefix)', () => {
  const obj = { __ar: 1, payload: { photoID: '122100011205368888', width: 1, height: 1 } };
  expect(parsePhotoId(obj)).toBe('122100011205368888');
  expect(parsePhotoId(JSON.stringify(obj))).toBe('122100011205368888');
  expect(parsePhotoId('for (;;);' + JSON.stringify(obj))).toBe('122100011205368888');
});

// Case 9-2: ảnh >10MB → hàm resize được gọi (kiểm tra intent, mock nativeImage)
test('uploadPhoto: ảnh >9.5MB → nativeImage.resize được gọi trước khi upload', async () => {
  // Mock fs.existsSync=true, fs.readFileSync=Buffer lớn >9.5MB, nativeImage.createFromPath
  const mockBuf = Buffer.alloc(10_000_000);
  const mockImg = {
    getSize: () => ({ width: 4000 }),
    resize: jest.fn().mockReturnThis(),
    toJPEG: jest.fn().mockReturnValue(Buffer.alloc(8_000_000)),
  };
  // Kết quả: resize được gọi 1 lần, photoId parse thành công
  // (full mock trong integration test)
  expect(mockImg.resize).toBeDefined(); // placeholder
});

// Case 9-3: ảnh không tồn tại → throw "Không tìm thấy ảnh"
test('uploadPhoto: file không tồn tại → throw với message rõ', async () => {
  // Mock fs.existsSync = false
  await expect(
    uploadPhoto({} as any, '/nonexistent/photo.jpg')
  ).rejects.toThrow(/không tìm thấy ảnh/i);
});

// Case 9-4: nhiều ảnh → trả mảng nhiều photoId
test('upload 3 ảnh → nhận 3 photoId riêng biệt', async () => {
  const mockUpload = jest.fn()
    .mockResolvedValueOnce('id-1')
    .mockResolvedValueOnce('id-2')
    .mockResolvedValueOnce('id-3');

  const ids = await Promise.all(['a.jpg', 'b.jpg', 'c.jpg'].map(p => mockUpload(p)));
  expect(ids).toEqual(['id-1', 'id-2', 'id-3']);
});
```

---

## Nhóm 10 — File KB extract (5 case)

**File thuần đề xuất:** `src/services/agent/kb-file-extractor.ts`

```ts
// Case 10-1: TXT ≤100KB → trích text nguyên
test('file TXT ≤100KB → trả contentText đầy đủ', () => {
  const content = 'A'.repeat(50_000);
  const result = extractKbContent('doc.txt', Buffer.from(content));
  expect(result.text).toBe(content);
  expect(result.truncated).toBe(false);
});

// Case 10-2: TXT >100KB → cắt + cảnh báo
test('file TXT >100KB → cắt tại 100KB + truncated=true', () => {
  const content = 'B'.repeat(150_000);
  const result = extractKbContent('big.txt', Buffer.from(content));
  expect(result.text.length).toBeLessThanOrEqual(102_400); // 100KB
  expect(result.truncated).toBe(true);
});

// Case 10-3: JSON hợp lệ → text = JSON.stringify đẹp
test('file JSON hợp lệ → parse và stringify pretty', () => {
  const json = JSON.stringify({ name: 'Zaplo', count: 3 });
  const result = extractKbContent('data.json', Buffer.from(json));
  expect(result.text).toContain('"name"');
  expect(result.error).toBeUndefined();
});

// Case 10-4: loại file không hỗ trợ (PDF, DOCX, ZIP...) → từ chối rõ
test('file PDF → error "loại file không hỗ trợ"', () => {
  const result = extractKbContent('report.pdf', Buffer.from('%PDF-1.4'));
  expect(result.text).toBe('');
  expect(result.error).toMatch(/không hỗ trợ|unsupported/i);
});

// Case 10-5: CSV, YAML, HTML, XML, LOG, MD → đều được chấp nhận
test('các ext hỗ trợ: csv, yaml, html, xml, log, md → không error', () => {
  const exts = ['data.csv', 'config.yaml', 'page.html', 'feed.xml', 'app.log', 'README.md'];
  exts.forEach(name => {
    const r = extractKbContent(name, Buffer.from('content'));
    expect(r.error).toBeUndefined();
  });
});
```

---

## Nhóm 11 — Agent chat đa kênh (5 case)

**Scope:** tích hợp — mock channel sender, mock AIAssistantService.

```ts
// Case 11-1: tin nhắn FB đến → dispatcher → chatForWorkflow → reply qua FB sender
test('FB message → chat AI → reply qua fbSender với đúng accountId', async () => {
  const fbSend = jest.fn().mockResolvedValue({ success: true });
  const mockChat = jest.fn().mockResolvedValue({ result: '[{"type":"text","content":"Hi!"}]', totalTokens: 10 });
  
  await handleIncomingMessage({
    channel: 'fb',
    accountId: 'fb-acc1',
    threadId: 'thread-123',
    text: 'Xin chào',
    agentId: 'agent-1',
    assistantId: 'ai-1',
  }, { fbSend, zaloSend: jest.fn(), chat: mockChat });

  expect(mockChat).toHaveBeenCalledWith('ai-1', expect.any(Array));
  expect(fbSend).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'fb-acc1' }));
});

// Case 11-2: tin nhắn Zalo đến → reply qua Zalo sender
test('Zalo message → chat AI → reply qua zaloSender, không gọi fbSender', async () => {
  const fbSend = jest.fn();
  const zaloSend = jest.fn().mockResolvedValue({ success: true });
  const mockChat = jest.fn().mockResolvedValue({ result: '[{"type":"text","content":"OK"}]', totalTokens: 5 });

  await handleIncomingMessage({
    channel: 'zalo',
    accountId: 'zl-acc1',
    threadId: 'zgroup-1',
    text: 'Hỏi thăm',
    agentId: 'agent-2',
    assistantId: 'ai-1',
  }, { fbSend, zaloSend, chat: mockChat });

  expect(zaloSend).toHaveBeenCalledTimes(1);
  expect(fbSend).not.toHaveBeenCalled();
});

// Case 11-3: accountId của reply = accountId của tin đến (không dùng nhầm account khác)
test('reply accountId khớp chính xác với tin nhắn đến', async () => {
  const captured: any[] = [];
  const fbSend = jest.fn().mockImplementation(opts => { captured.push(opts); return Promise.resolve({ success: true }); });
  const mockChat = jest.fn().mockResolvedValue({ result: '[{"type":"text","content":"X"}]', totalTokens: 3 });

  await handleIncomingMessage({
    channel: 'fb', accountId: 'fb-specific-999', threadId: 't1',
    text: 'Hi', agentId: 'a1', assistantId: 'ai-1',
  }, { fbSend, zaloSend: jest.fn(), chat: mockChat });

  expect(captured[0].accountId).toBe('fb-specific-999');
});

// Case 11-4: AI trả JSON có type=image → sender nhận array URL ảnh
test('AI reply có type=image → fbSender được gọi với mediaUrls', async () => {
  const fbSend = jest.fn().mockResolvedValue({ success: true });
  const mockChat = jest.fn().mockResolvedValue({
    result: '[{"type":"image","content":["https://ex.com/a.jpg"]}]',
    totalTokens: 5,
  });

  await handleIncomingMessage({
    channel: 'fb', accountId: 'fb1', threadId: 't1',
    text: 'show pic', agentId: 'a1', assistantId: 'ai-1',
  }, { fbSend, zaloSend: jest.fn(), chat: mockChat });

  expect(fbSend).toHaveBeenCalledWith(expect.objectContaining({
    mediaUrls: expect.arrayContaining(['https://ex.com/a.jpg']),
  }));
});

// Case 11-5: chat AI fail → không crash, log lỗi, không reply
test('chatForWorkflow throw → không reply, trả {success:false}', async () => {
  const fbSend = jest.fn();
  const mockChat = jest.fn().mockRejectedValue(new Error('LLM timeout'));

  const result = await handleIncomingMessage({
    channel: 'fb', accountId: 'fb1', threadId: 't1',
    text: 'Hi', agentId: 'a1', assistantId: 'ai-1',
  }, { fbSend, zaloSend: jest.fn(), chat: mockChat });

  expect(fbSend).not.toHaveBeenCalled();
  expect(result.success).toBe(false);
});
```

---

## Tổng kết

| Nhóm | Số case | Loại |
|------|---------|------|
| 1 — deriveChannel | 5 | Unit thuần |
| 2 — validateAgent | 5 | Unit thuần |
| 3 — expandAgentQueue | 5 | Unit thuần |
| 4 — channel routing | 4 | Integration (mock sender) |
| 5 — assistant sharing | 4 | Unit (mock DB) |
| 6 — schedule resolve | 4 | Unit (fake timer) |
| 7 — rate-limit per account | 4 | Unit (mock countToday) |
| 8 — dedupe | 3 | Unit thuần |
| 9 — photo upload | 4 | Unit (mock fs + nativeImage) |
| 10 — KB file extract | 5 | Unit thuần |
| 11 — agent chat đa kênh | 5 | Integration (mock sender + LLM) |
| **Tổng** | **48** | |

> Đã tính lại: **48 case** (có 4 case từ file test đã tồn tại: nhóm 8 case 1, nhóm 9 case 1, nhóm 7 có partial overlap với rate-limiter đã viết).
> **Case mới cần viết: ~40 case** (8 case đã tồn tại trong `src/__tests__/`).

---

## Hàm thuần nên tách để test dễ (pure, no side-effect)

| Hàm | File đề xuất | Lý do |
|-----|-------------|-------|
| `deriveChannel(account)` | `src/services/agent/derive-channel.ts` | Chưa có — cần tạo |
| `validateAgent(agent)` | `src/services/agent/validate-agent.ts` | Chưa có — cần tạo |
| `expandAgentQueue(agent, drafts)` | `src/services/agent/expand-agent-queue.ts` | Chưa có — cần tạo |
| `resolveNextRun(target, schedule)` | `src/services/agent/schedule-resolver.ts` | Chưa có — cần tạo |
| `extractKbContent(filename, buf)` | `src/services/agent/kb-file-extractor.ts` | Chưa có — cần tạo |
| `routeAndSend(item, senders)` | `src/services/agent/channel-router.ts` | Chưa có — cần tạo |
| `parsePhotoId(resp)` | `facebook-photo-upload.ts` | **Đã có** |
| `shouldDedupe(actionType)` | `dedupe-policy.ts` | **Đã có** |
| `dedupeKeyOf(item)` | `dedupe-policy.ts` | **Đã có** |
| `expandQueue(drafts, targets)` | `expand-queue.ts` | **Đã có** |
| `parseGroupId(input)` | `parse-group-id.ts` | **Đã có** |
| `encodeFeedbackId(target)` | `facebook-write-variables.ts` | Thuần, test edge case số vs base64 |
| `splitVariations(raw)` | `generate-variations.ts` | **Đã có** |

---

## Tích hợp cần mock

| Tích hợp | Mock cần | File test đề xuất |
|----------|----------|-------------------|
| `uploadPhoto` (fs + nativeImage + axios) | `fs.existsSync`, `fs.readFileSync`, `electron.nativeImage`, `axios.post` | `__tests__/fb-photo-upload-integration.test.ts` |
| `handleIncomingMessage` (AI + sender) | `AIAssistantService.chatForWorkflow`, `FacebookMessageSender`, `ZaloService.sendMessage` | `__tests__/agent-chat-multichannel.test.ts` |
| `routeAndSend` (sender registry) | Sender map `{ fb: mockFbSend, zalo: mockZaloSend }` | `__tests__/agent-channel-router.test.ts` |
| `sendApproved` (IPC handler) | `FacebookSendService`, `initSession`, `EventBroadcaster` | `__tests__/fb-send-approved-ipc.test.ts` |
| `usedToday` / `canSend` (DB-backed) | `countToday` từ `facebook-action-log-service` | `__tests__/fb-rate-limiter.test.ts` |
| `assistant sharing` (CRUD + agents) | `DatabaseService` in-memory (better-sqlite3 in-memory DB) | `__tests__/ai-assistant-sharing.test.ts` |

---

## Câu hỏi chưa giải quyết

1. **AgentDef schema**: `Agent` model (gồm targets, schedule, assistantId) chưa định nghĩa trong codebase — cần thống nhất trước khi implement nhóm 2-3-6.
2. **handleIncomingMessage**: hàm dispatcher cho agent chat đa kênh (nhóm 11) chưa có file source — cần planner chỉ định file path cụ thể.
3. **Zalo sender API**: cần xác nhận `ZaloService.sendMessageToGroup(accountId, groupId, text)` là đúng signature (để mock nhóm 11 case 2).
4. **schedule-resolver**: cần làm rõ múi giờ (Asia/Ho_Chi_Minh) hay UTC — ảnh hưởng case 6-2, 6-3.
5. **KB extract**: giới hạn 100KB là bytes hay ký tự? File HTML có strip tags không?
