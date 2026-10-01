export type Mode = 'clip' | 'snap';

export type CaptureMetadata = {
  client_uuid: string;
  captured_at: string;
  timezone: string | null;
  mode: Mode;
  requested_seconds: number;
  lat?: number;
  lon?: number;
  accuracy_m?: number;
  device_model?: string;
  device_os?: string;
};

export const DURATIONS = [3, 5, 10] as const;
export const SNAP_SECONDS = 1;

export function nextDuration(current: number): number {
  const i = DURATIONS.indexOf(current as typeof DURATIONS[number]);
  return DURATIONS[(i + 1) % DURATIONS.length];
}

export function isoWithOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${
    p(date.getMinutes())
  }:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/** Coarse device info only: OS family+version and, where the UA exposes it, the model. */
export function coarseDevice(ua: string): { device_model?: string; device_os?: string } {
  const android = ua.match(/Android (\d+(?:\.\d+)?)(?:; ([^;)]+))?/);
  if (android) {
    const model = android[2]?.replace(/\s*Build\/.*$/, '').trim();
    return { device_os: `Android ${android[1]}`, ...(model && model !== 'K' ? { device_model: model } : {}) };
  }
  const ios = ua.match(/(iPhone|iPad).*? OS (\d+)[_.](\d+)/);
  if (ios) return { device_os: `iOS ${ios[2]}.${ios[3]}`, device_model: ios[1] };
  const linux = ua.includes('Linux')
    ? 'Linux'
    : ua.includes('Mac OS X')
    ? 'macOS'
    : ua.includes('Windows')
    ? 'Windows'
    : null;
  return linux ? { device_os: linux } : {};
}

export type Position = { lat: number; lon: number; accuracy: number };

export function buildMetadata(args: {
  uuid: string;
  now: Date;
  timezone: string | null;
  mode: Mode;
  requestedSeconds: number;
  position: Position | null;
  userAgent: string;
}): CaptureMetadata {
  return {
    client_uuid: args.uuid,
    captured_at: isoWithOffset(args.now),
    timezone: args.timezone,
    mode: args.mode,
    requested_seconds: args.requestedSeconds,
    ...(args.position ? { lat: args.position.lat, lon: args.position.lon, accuracy_m: args.position.accuracy } : {}),
    ...coarseDevice(args.userAgent),
  };
}
