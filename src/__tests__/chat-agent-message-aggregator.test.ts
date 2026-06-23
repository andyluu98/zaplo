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
