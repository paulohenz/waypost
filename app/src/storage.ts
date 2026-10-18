const VISITOR_KEY = 'waypost_vid';
const SESSION_KEY = 'waypost_sid';
const UTM_KEY = 'waypost_utm';

export const STORAGE_KEYS = {
  visitor: VISITOR_KEY,
  session: SESSION_KEY,
  utm: UTM_KEY,
} as const;

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Use Web Storage when it works, and an in-memory map when it does not. */
export function safeStore(storage: Storage | null | undefined): KeyValueStore {
  const memory = new Map<string, string>();
  let usable = false;
  if (storage) {
    try {
      const probe = '__waypost_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      usable = true;
    } catch {
      usable = false;
    }
  }

  return {
    get(key) {
      if (usable && storage) {
        try {
          return storage.getItem(key);
        } catch {
          return memory.get(key) ?? null;
        }
      }
      return memory.get(key) ?? null;
    },
    set(key, value) {
      memory.set(key, value);
      if (!usable || !storage) return;
      try {
        storage.setItem(key, value);
      } catch {
        /* private mode and quota errors stay on the memory copy */
      }
    },
    remove(key) {
      memory.delete(key);
      if (!usable || !storage) return;
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** UUID v4 from `crypto.randomUUID`, with a CSPRNG fallback. */
export function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type Identity = {
  visitorId: string;
  sessionId: string;
  /** True when the inactivity window elapsed and a new session was minted. */
  rotated: boolean;
};

/**
 * Visitor id is durable in localStorage. Session id is per tab and rotates
 * after `timeoutMs` without an event. A rotation drops stored UTM attribution.
 */
export function loadIdentity(
  local: KeyValueStore,
  session: KeyValueStore,
  timeoutMs: number,
  now: number,
): Identity {
  let visitorId = local.get(VISITOR_KEY);
  if (!visitorId) {
    visitorId = createId();
    local.set(VISITOR_KEY, visitorId);
  }

  const raw = session.get(SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id?: unknown; ts?: unknown };
      if (
        typeof parsed.id === 'string' &&
        parsed.id.length > 0 &&
        typeof parsed.ts === 'number' &&
        now - parsed.ts < timeoutMs &&
        now >= parsed.ts
      ) {
        session.set(SESSION_KEY, JSON.stringify({ id: parsed.id, ts: now }));
        return { visitorId, sessionId: parsed.id, rotated: false };
      }
    } catch {
      /* replace a corrupt session payload */
    }
  }

  const sessionId = createId();
  session.set(SESSION_KEY, JSON.stringify({ id: sessionId, ts: now }));
  session.remove(UTM_KEY);
  return { visitorId, sessionId, rotated: true };
}
