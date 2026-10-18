export type PrivacySignals = {
  doNotTrack?: string | null;
  windowDoNotTrack?: string | null;
  globalPrivacyControl?: boolean;
};

/** True when the visitor asked not to be tracked via DNT or GPC. */
export function isOptedOut(signals: PrivacySignals): boolean {
  const dnt = String(signals.doNotTrack ?? signals.windowDoNotTrack ?? '').toLowerCase();
  if (dnt === '1' || dnt === 'yes') return true;
  return signals.globalPrivacyControl === true;
}

type NavSignals = Navigator & {
  msDoNotTrack?: string;
  globalPrivacyControl?: boolean;
};

export function readPrivacySignals(win: Window = window): PrivacySignals {
  const nav = win.navigator as NavSignals;
  const host = win as Window & { doNotTrack?: string };
  return {
    doNotTrack: nav.doNotTrack ?? nav.msDoNotTrack ?? null,
    windowDoNotTrack: host.doNotTrack ?? null,
    globalPrivacyControl: nav.globalPrivacyControl,
  };
}
