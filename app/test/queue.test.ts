import { describe, expect, it, vi } from 'vitest';
import { createQueue } from '../src/queue';

describe('createQueue', () => {
  it('flushes when the batch is full', () => {
    const sent: number[][] = [];
    const queue = createQueue<number>({
      batchSize: 3,
      flushInterval: 10_000,
      schedule: () => 0 as unknown as ReturnType<typeof setTimeout>,
      cancel: () => {},
      send: (batch) => sent.push(batch),
    });
    queue.push(1);
    queue.push(2);
    expect(sent).toEqual([]);
    queue.push(3);
    expect(sent).toEqual([[1, 2, 3]]);
    expect(queue.size()).toBe(0);
  });

  it('flushes on the interval and on demand', () => {
    vi.useFakeTimers();
    const sent: string[][] = [];
    const queue = createQueue<string>({ batchSize: 10, flushInterval: 5_000, send: (batch) => sent.push(batch) });
    queue.push('a');
    vi.advanceTimersByTime(4_999);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([['a']]);
    queue.push('b');
    queue.flush();
    expect(sent).toEqual([['a'], ['b']]);
    queue.flush();
    expect(sent).toHaveLength(2);
    vi.useRealTimers();
  });

  it('puts the batch back when send throws and caps the buffer', () => {
    let fail = true;
    const queue = createQueue<number>({
      batchSize: 2,
      flushInterval: 0,
      maxBuffer: 3,
      schedule: (fn) => setTimeout(fn, 0),
      send: () => {
        if (fail) throw new Error('offline');
      },
    });
    queue.push(1);
    queue.push(2);
    expect(queue.size()).toBe(2);
    queue.push(3);
    queue.push(4);
    queue.push(5);
    expect(queue.size()).toBe(3);
    fail = false;
    queue.flush();
    expect(queue.size()).toBe(0);
  });

  it('destroy drops the timer and the buffer', () => {
    vi.useFakeTimers();
    const sent: number[][] = [];
    const queue = createQueue<number>({ batchSize: 10, flushInterval: 1_000, send: (batch) => sent.push(batch) });
    queue.push(1);
    queue.destroy();
    vi.advanceTimersByTime(5_000);
    expect(sent).toEqual([]);
    expect(queue.size()).toBe(0);
    vi.useRealTimers();
  });
});
