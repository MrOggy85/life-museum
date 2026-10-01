function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const DATA_ROOT = requireEnv('DATA_ROOT');

export const CLIENT_DIR = Deno.env.get('CLIENT_DIR') ??
  new URL('../client/dist', import.meta.url).pathname;

export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
