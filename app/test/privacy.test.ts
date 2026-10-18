import { describe, expect, it } from 'vitest';
import { isOptedOut } from '../src/privacy';

describe('isOptedOut', () => {
  it('honors Do Not Track values of 1 and yes', () => {
    expect(isOptedOut({ doNotTrack: '1' })).toBe(true);
    expect(isOptedOut({ doNotTrack: 'yes' })).toBe(true);
    expect(isOptedOut({ windowDoNotTrack: '1' })).toBe(true);
  });

  it('ignores unset, zero, and unspecified signals', () => {
    expect(isOptedOut({})).toBe(false);
    expect(isOptedOut({ doNotTrack: '0' })).toBe(false);
    expect(isOptedOut({ doNotTrack: 'unspecified' })).toBe(false);
    expect(isOptedOut({ doNotTrack: null })).toBe(false);
  });

  it('honors Global Privacy Control', () => {
    expect(isOptedOut({ globalPrivacyControl: true })).toBe(true);
    expect(isOptedOut({ globalPrivacyControl: false })).toBe(false);
  });
});
