import { describe, expect, it } from 'vitest';
import { createId, loadIdentity, safeStore, STORAGE_KEYS } from '../src/storage';

describe('createId', () => {
  it('returns distinct uuid v4 strings', () => {
    const first = createId();
    const second = createId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});

describe('safeStore', () => {
  it('keeps values in memory when web storage throws', () => {
    const broken: Storage = {
      get length() {
        return 0;
      },
      clear: () => {
        throw new Error('nope');
      },
      getItem: () => {
        throw new Error('nope');
      },
      key: () => {
        throw new Error('nope');
      },
      removeItem: () => {
        throw new Error('nope');
      },
      setItem: () => {
        throw new Error('nope');
      },
    };
    const store = safeStore(broken);
    store.set('a', '1');
    expect(store.get('a')).toBe('1');
    store.remove('a');
    expect(store.get('a')).toBeNull();
  });

  it('reads and writes a real storage area', () => {
    localStorage.clear();
    const store = safeStore(localStorage);
    store.set('a', '1');
    expect(localStorage.getItem('a')).toBe('1');
    expect(store.get('a')).toBe('1');
  });
});

describe('loadIdentity', () => {
  it('reuses the visitor and rotates the session after the timeout', () => {
    const local = safeStore(null);
    const session = safeStore(null);
    const first = loadIdentity(local, session, 1_000, 10_000);
    const again = loadIdentity(local, session, 1_000, 10_500);
    expect(again.visitorId).toBe(first.visitorId);
    expect(again.sessionId).toBe(first.sessionId);
    expect(again.rotated).toBe(false);

    session.set(STORAGE_KEYS.utm, '{"source":"news"}');
    const rotated = loadIdentity(local, session, 1_000, 12_000);
    expect(rotated.visitorId).toBe(first.visitorId);
    expect(rotated.sessionId).not.toBe(first.sessionId);
    expect(rotated.rotated).toBe(true);
    expect(session.get(STORAGE_KEYS.utm)).toBeNull();
  });

  it('replaces a corrupt session payload', () => {
    const local = safeStore(null);
    const session = safeStore(null);
    session.set(STORAGE_KEYS.session, '{');
    const identity = loadIdentity(local, session, 1_000, 5_000);
    expect(identity.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.rotated).toBe(true);
  });
});
