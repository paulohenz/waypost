import { describe, expect, it } from 'vitest';
import { sanitizeProps } from '../src/props';

describe('sanitizeProps', () => {
  it('keeps primitives and drops everything else', () => {
    const props = sanitizeProps({
      plan: 'campo',
      seats: 3,
      trial: false,
      note: null,
      skip: undefined,
      nested: { a: 1 },
      list: [1],
      nan: Number.NaN,
      inf: Number.POSITIVE_INFINITY,
    });
    expect(props).toEqual({ plan: 'campo', seats: 3, trial: false, note: null });
  });

  it('rejects non-objects', () => {
    expect(sanitizeProps(null)).toBeUndefined();
    expect(sanitizeProps(['a'])).toBeUndefined();
    expect(sanitizeProps('plan')).toBeUndefined();
  });

  it('clips keys and strings, skips prototype keys, and stops at 25', () => {
    const input: Record<string, string> = {};
    input['constructor'] = 'y';
    input['prototype'] = 'z';
    for (let i = 0; i < 30; i += 1) input[`k${i}`] = 'v'.repeat(250);
    const props = sanitizeProps(input)!;
    expect(Object.keys(props)).toHaveLength(25);
    expect(Object.values(props)[0]).toHaveLength(200);
    expect(Object.keys(props)).not.toContain('constructor');
    expect(Object.keys(props)).not.toContain('prototype');
  });
});
