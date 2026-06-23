# Chat Agent Debounce Aggregation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom các mảnh tin khách gửi ngắt quãng thành 1 lượt (debounce 6s) rồi AI mới trả lời, thay cho cơ chế drop-trong-8s hiện tại.

**Architecture:** Thêm class thuần `MessageAggregator` (debounce per-thread, không I/O → test bằng jest fake timers). Dispatcher đẩy tin đã-qua-cổng vào aggregator thay vì reply ngay; flush sau 6s im lặng → reply(combined). Hạ throttle 8s→2s.

**Tech Stack:** TypeScript, jest 29 + ts-jest (testEnvironment node), Electron main process.

## Global Constraints

- Debounce window: **6000ms** (hằng số module `DEBOUNCE_MS`, KHÔNG cấu hình per-agent lần này — YAGNI).
- `MIN_REPLY_DELAY_MS`: **2000** (phải nhỏ hơn debounce để không drop flush bình thường).
- Mảnh gom nối bằng `'\n'`, giữ thứ tự.
- Không phá vỡ các cổng hiện có: bỏ self, `stripSelfMentions`, bỏ rỗng, routing, auto-resume, pause, group-gate, echo (`aiSentKeys`), `processing` lock.
- Test pure chạy: `npx jest`. Typecheck (controller chạy): `npx tsc -p tsconfig.electron.json --noEmit`.
- File test đặt tại `src/__tests__/**/*.test.ts` (testMatch).

---

### Task 1: MessageAggregator (pure debounce class)

**Files:**
- Create: `src/services/chat-agent/message-aggregator.ts`
- Test: `src/__tests__/chat-agent-message-aggregator.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dùng global `setTimeout`/`clearTimeout`).
- Produces:
  - `export const DEBOUNCE_MS = 6000`
  - `export class MessageAggregator`
    - `constructor(windowMs?: number)` — default `DEBOUNCE_MS`
    - `enqueue(key: string, fragment: string, onFlush: (combined: string) => void): void`
    - `hasPending(key: string): boolean`
    - `clear(key?: string): void`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/chat-agent-message-aggregator.test.ts
/**
 * TDD — debounce gom tin khách gửi ngắt quãng. Mỗi thread 1 buffer + 1 timer.
 * Tin mới reset timer; im đủ window → flush các mảnh nối bằng '\n'. Pure, no I/O.
 */
import { MessageAggregator } from '../services/chat-agent/message-aggregator';

describe('MessageAggregator', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('single message flushes after window with same content', () => {
    const agg = new MessageAggregator(6000);
    const onFlush = jest.fn();
    agg.enqueue('t1', 'chào shop', onFlush);
    expect(onFlush).not.toHaveBeenCalled();
    jest.advanceTimersByTime(6000);
    expect(onFlush).toHaveBeenCalledWith('chào shop');
  });

  test('three fragments within window combine into one flush', () => {
    const agg = new MessageAggregator(6000);
    const onFlush = jest.fn();
    agg.enqueue('t1', 'chào shop', onFlush);
    jest.advanceTimersByTime(2000);
    agg.enqueue('t1', 'cho hỏi tí', onFlush);
    jest.advanceTimersByTime(2000);
    agg.enqueue('t1', 'giá thuê bao nhiêu', onFlush);
    jest.advanceTimersByTime(6000);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('chào shop\ncho hỏi tí\ngiá thuê bao nhiêu');
  });

  test('messages spaced beyond window flush separately', () => {
    const agg = new MessageAggregator(6000);
    const onFlush = jest.fn();
    agg.enqueue('t1', 'a', onFlush);
    jest.advanceTimersByTime(6000);
    agg.enqueue('t1', 'b', onFlush);
    jest.advanceTimersByTime(6000);
    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenNthCalledWith(1, 'a');
    expect(onFlush).toHaveBeenNthCalledWith(2, 'b');
  });

  test('each new message resets the timer', () => {
    const agg = new MessageAggregator(6000);
    const onFlush = jest.fn();
    agg.enqueue('t1', 'a', onFlush);
    jest.advanceTimersByTime(5000);
    agg.enqueue('t1', 'b', onFlush);
    jest.advanceTimersByTime(5000); // 10s total, but only 5s since 'b'
    expect(onFlush).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000); // now 6s since 'b'
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('a\nb');
  });

  test('keeps order, joins with newline', () => {
    const agg = new MessageAggregator(1000);
    const onFlush = jest.fn();
    ['1', '2', '3'].forEach(f => agg.enqueue('t', f, onFlush));
    jest.advanceTimersByTime(1000);
    expect(onFlush).toHaveBeenCalledWith('1\n2\n3');
  });

  test('independent buffers per thread', () => {
    const agg = new MessageAggregator(1000);
    const f1 = jest.fn();
    const f2 = jest.fn();
    agg.enqueue('a', 'xa', f1);
    agg.enqueue('b', 'xb', f2);
    jest.advanceTimersByTime(1000);
    expect(f1).toHaveBeenCalledWith('xa');
    expect(f2).toHaveBeenCalledWith('xb');
  });

  test('hasPending reflects buffer state', () => {
    const agg = new MessageAggregator(1000);
    expect(agg.hasPending('t')).toBe(false);
    agg.enqueue('t', 'x', jest.fn());
    expect(agg.hasPending('t')).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(agg.hasPending('t')).toBe(false);
  });

  test('buffer empty after flush — next message starts a new turn', () => {
    const agg = new MessageAggregator(1000);
    const onFlush = jest.fn();
    agg.enqueue('t', 'first', onFlush);
    jest.advanceTimersByTime(1000);
    agg.enqueue('t', 'second', onFlush);
    jest.advanceTimersByTime(1000);
    expect(onFlush).toHaveBeenNthCalledWith(1, 'first');
    expect(onFlush).toHaveBeenNthCalledWith(2, 'second');
  });

  test('clear(key) cancels timer without flushing', () => {
    const agg = new MessageAggregator(1000);
    const onFlush = jest.fn();
    agg.enqueue('t', 'x', onFlush);
    agg.clear('t');
    jest.advanceTimersByTime(5000);
    expect(onFlush).not.toHaveBeenCalled();
    expect(agg.hasPending('t')).toBe(false);
  });

  test('clear() cancels all timers', () => {
    const agg = new MessageAggregator(1000);
    const f = jest.fn();
    agg.enqueue('a', '1', f);
    agg.enqueue('b', '2', f);
    agg.clear();
    jest.advanceTimersByTime(5000);
    expect(f).not.toHaveBeenCalled();
  });

  test('whitespace-only combined does not flush', () => {
    const agg = new MessageAggregator(1000);
    const onFlush = jest.fn();
    agg.enqueue('t', '   ', onFlush);
    jest.advanceTimersByTime(1000);
    expect(onFlush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest chat-agent-message-aggregator -v`
Expected: FAIL — "Cannot find module '../services/chat-agent/message-aggregator'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/chat-agent/message-aggregator.ts
/**
 * MessageAggregator — gom các mảnh tin theo từng thread (debounce).
 *
 * Khách hỏi ngắt quãng (gõ nhiều tin liên tiếp) → thay vì trả lời từng mảnh,
 * ta gom lại: mỗi thread giữ 1 buffer + 1 timer. Tin mới push vào buffer và
 * RESET timer về `windowMs`. Khi khách im đủ `windowMs`, flush: nối các mảnh
 * bằng '\n' rồi gọi `onFlush(combined)`. Thuần (no DB/Electron) → test bằng
 * jest fake timers.
 */
export const DEBOUNCE_MS = 6000;

type FlushFn = (combined: string) => void;

export class MessageAggregator {
  private buffers = new Map<string, string[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly windowMs: number;

  constructor(windowMs: number = DEBOUNCE_MS) {
    this.windowMs = windowMs;
  }

  /** Đang có mảnh chờ flush cho thread này? */
  hasPending(key: string): boolean {
    return (this.buffers.get(key)?.length ?? 0) > 0;
  }

  /** Đẩy 1 mảnh vào buffer của thread; reset đồng hồ debounce (latest onFlush thắng). */
  enqueue(key: string, fragment: string, onFlush: FlushFn): void {
    const buf = this.buffers.get(key) ?? [];
    buf.push(fragment);
    this.buffers.set(key, buf);

    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(key, setTimeout(() => this.flush(key, onFlush), this.windowMs));
  }

  /** Hủy timer + buffer cho 1 key, hoặc toàn bộ khi key bỏ trống (workspace switch). */
  clear(key?: string): void {
    if (key == null) {
      for (const t of this.timers.values()) clearTimeout(t);
      this.timers.clear();
      this.buffers.clear();
      return;
    }
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
    this.buffers.delete(key);
  }

  private flush(key: string, onFlush: FlushFn): void {
    const buf = this.buffers.get(key) ?? [];
    this.buffers.delete(key);
    this.timers.delete(key);
    const combined = buf.join('\n').trim();
    if (combined) onFlush(combined);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest chat-agent-message-aggregator -v`
Expected: PASS — 11/11.

- [ ] **Step 5: Commit**

```bash
git add src/services/chat-agent/message-aggregator.ts src/__tests__/chat-agent-message-aggregator.test.ts
git commit -m "feat(chat-agent): add MessageAggregator debounce buffer"
```

---

### Task 2: Wire aggregator into dispatcher + lower throttle

**Files:**
- Modify: `src/services/chat-agent/chat-agent-dispatcher.ts`

**Interfaces:**
- Consumes: `MessageAggregator`, `DEBOUNCE_MS` from Task 1.
- Produces: behavior change only (no new exports). Verified by typecheck + existing pure-test suite staying green (dispatcher itself isn't jest-testable — sqlite/electron bound; integration goes to the manual checklist).

- [ ] **Step 1: Import aggregator + add field**

Modify the import block — add after the decider import (line ~25):

```ts
import { MessageAggregator } from './message-aggregator';
```

Add field inside the class, next to the other private maps (after `private processing = new Set<string>();`, line ~48):

```ts
    /** Debounce buffer — gom tin khách gửi ngắt quãng thành 1 lượt trước khi trả lời. */
    private aggregator = new MessageAggregator();
```

- [ ] **Step 2: Lower the throttle constant**

Change line ~33:

```ts
/** Min delay between two AI replies on the SAME thread (anti-loop / anti-spam). */
const MIN_REPLY_DELAY_MS = 8_000;
```

to:

```ts
/** Min delay between two AI replies on the SAME thread (anti-loop floor; smaller than the
 *  debounce window so a normal debounced flush is never dropped). */
const MIN_REPLY_DELAY_MS = 2_000;
```

- [ ] **Step 3: Restructure the group-gate + reply tail in `onMessage`**

Replace this block (lines ~144-161):

```ts
        // In a GROUP, only engage when addressed (@mention or trigger keyword) — avoid
        // replying to every member message.
        if (isGroup) {
            const keywords = ((agent as any).trigger_keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean);
            // mention detection uses the original mentions array; keyword check uses cleaned text.
            if (!groupTriggerMatched(content, mentions, zaloId, keywords)) return;
        }

        if (decision.mode === 'suggest') {
            // UI surfaces the suggestion; we don't auto-send (drafting handled in a later phase).
            EventBroadcaster.emit('chatAgent:suggestion', {
                zaloId, threadId, agentId: agent.id, threadType: isGroup ? 1 : 0,
            });
            return;
        }

        // ── mode === 'reply' ──────────────────────────────────────────────
        await this.reply(zaloId, threadId, isGroup, agent, content);
```

with:

```ts
        const key = `${zaloId}|${threadId}`;

        // In a GROUP, only engage when addressed. The FIRST fragment of a turn must address
        // the bot (@mention or trigger keyword); once a turn is being buffered, subsequent
        // quick fragments join even without re-tagging (user tags once, then types details).
        if (isGroup && !this.aggregator.hasPending(key)) {
            const keywords = ((agent as any).trigger_keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean);
            // mention detection uses the original mentions array; keyword check uses cleaned text.
            if (!groupTriggerMatched(content, mentions, zaloId, keywords)) return;
        }

        if (decision.mode === 'suggest') {
            // UI surfaces the suggestion; we don't auto-send (drafting handled in a later phase).
            EventBroadcaster.emit('chatAgent:suggestion', {
                zaloId, threadId, agentId: agent.id, threadType: isGroup ? 1 : 0,
            });
            return;
        }

        // ── mode === 'reply' ──────────────────────────────────────────────
        // Gom tin ngắt quãng: chờ khách im DEBOUNCE_MS rồi trả lời 1 lần với toàn bộ mảnh.
        this.aggregator.enqueue(key, content, combined => {
            void this.reply(zaloId, threadId, isGroup, agent, combined).catch(err =>
                Logger.warn(`[ChatAgentDispatcher] reply error: ${err?.message || err}`),
            );
        });
```

- [ ] **Step 4: Re-check pause at flush time in `reply()`**

A human may grab the thread during the 6s debounce gap (auto-pause sets `paused=1`).
At the top of `reply()`'s `try` block, right after `const db = DatabaseService.getInstance();` (line ~250), add:

```ts
            // Re-check pause: a human may have taken over during the debounce window.
            if (db.getConversationAiState(zaloId, threadId)?.paused) {
                Logger.log(`[ChatAgentDispatcher] ${key} paused during debounce — skip reply`);
                return;
            }
```

(`key` is already defined at the top of `reply()` as `const key = \`${zaloId}|${threadId}\`;`.)

- [ ] **Step 5: Clear pending buffers on rehook + stop**

In `rehook()` (after `this.bind();`, line ~80) add:

```ts
        this.aggregator.clear();
```

In `stop()` (after the unsubscribe block, line ~86) add:

```ts
        this.aggregator.clear();
```

- [ ] **Step 6: Run the full pure-test suite (regression) + report**

Run: `npx jest`
Expected: PASS — all suites green (36 existing + 11 new = 47 tests).

Note for the implementer: do NOT run `tsc` — the controller typechecks centrally. Report the jest command + output.

- [ ] **Step 7: Commit**

```bash
git add src/services/chat-agent/chat-agent-dispatcher.ts
git commit -m "feat(chat-agent): debounce-aggregate fragmented messages before replying"
```

---

## Self-Review

- **Spec coverage:** aggregator (Task 1) ✓; dispatcher wiring + group first-fragment gate + pause re-check + throttle lower + clear-on-rehook (Task 2) ✓; manual checklist → `test-checklist.md` (controller writes, not a code task) ✓.
- **Placeholder scan:** none — all code shown in full.
- **Type consistency:** `MessageAggregator`/`enqueue`/`hasPending`/`clear`/`DEBOUNCE_MS` identical across Task 1 def and Task 2 use. `key` reused consistently.

## Unresolved questions
- None.
