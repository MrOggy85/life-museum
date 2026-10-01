export type CaptureMetadata = {
  client_uuid: string;
  captured_at: string;
  timezone: string | null;
  mode: 'clip' | 'snap';
  requested_seconds: number;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  device_model: string | null;
  device_os: string | null;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const EXTENSIONS: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/3gpp': '3gp',
  'video/ogg': 'ogv',
};

export function extensionFor(mimeType: string): string | null {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return EXTENSIONS[base] ?? null;
}

function optionalString(obj: Record<string, unknown>, key: string, max: number): Result<string | null> {
  const v = obj[key];
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'string' || v.length > max) {
    return { ok: false, error: `${key} must be a string up to ${max} chars` };
  }
  return { ok: true, value: v.trim() || null };
}

function optionalNumber(obj: Record<string, unknown>, key: string, min: number, max: number): Result<number | null> {
  const v = obj[key];
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    return { ok: false, error: `${key} must be a number in [${min}, ${max}]` };
  }
  return { ok: true, value: v };
}

export function parseMetadata(raw: unknown): Result<CaptureMetadata> {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'metadata is not valid JSON' };
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { ok: false, error: 'metadata must be a JSON object' };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.client_uuid !== 'string' || !UUID.test(o.client_uuid)) {
    return { ok: false, error: 'client_uuid must be a UUID' };
  }
  if (typeof o.captured_at !== 'string' || !ISO.test(o.captured_at) || Number.isNaN(Date.parse(o.captured_at))) {
    return { ok: false, error: 'captured_at must be an ISO 8601 timestamp with offset' };
  }
  if (o.mode !== 'clip' && o.mode !== 'snap') {
    return { ok: false, error: 'mode must be clip or snap' };
  }
  if (
    !Number.isInteger(o.requested_seconds) || (o.requested_seconds as number) < 1 ||
    (o.requested_seconds as number) > 60
  ) {
    return { ok: false, error: 'requested_seconds must be an integer in [1, 60]' };
  }

  const timezone = optionalString(o, 'timezone', 64);
  const model = optionalString(o, 'device_model', 120);
  const os = optionalString(o, 'device_os', 120);
  const lat = optionalNumber(o, 'lat', -90, 90);
  const lon = optionalNumber(o, 'lon', -180, 180);
  const accuracy = optionalNumber(o, 'accuracy_m', 0, 1e7);
  for (const r of [timezone, model, os, lat, lon, accuracy]) {
    if (!r.ok) return r;
  }
  if ((lat as { value: unknown }).value === null !== ((lon as { value: unknown }).value === null)) {
    return { ok: false, error: 'lat and lon must be given together' };
  }

  return {
    ok: true,
    value: {
      client_uuid: o.client_uuid.toLowerCase(),
      captured_at: o.captured_at,
      timezone: (timezone as { value: string | null }).value,
      mode: o.mode,
      requested_seconds: o.requested_seconds as number,
      lat: (lat as { value: number | null }).value,
      lon: (lon as { value: number | null }).value,
      accuracy_m: (accuracy as { value: number | null }).value,
      device_model: (model as { value: string | null }).value,
      device_os: (os as { value: string | null }).value,
    },
  };
}
