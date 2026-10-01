import { run } from './media.ts';
import type { Stage } from './mod.ts';
import {
  cleanDescription,
  cleanOcr,
  DESCRIBE_PROMPT,
  interpretiveWords,
  OCR_PROMPT,
  STRICT_SUFFIX,
} from './vlm_text.ts';

export const VLM_IMAGE_DIGEST = 'sha256:f9115c95639e60abc09d4ea83b26fd4d56c66aa1174594393335a514da00c283';
const CONTAINER = 'museum-vlm';
const PEAK_MIB = 4096;

export interface VlmConfig {
  baseUrl: string;
  /** Resolves the keyframe as a 512 px JPEG. */
  keyframe: (file: string) => Promise<Uint8Array>;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  model?: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

async function chat(cfg: VlmConfig, jpeg: Uint8Array, prompt: string, maxTokens: number): Promise<string> {
  let bin = '';
  for (let i = 0; i < jpeg.length; i += 0x8000) bin += String.fromCharCode(...jpeg.subarray(i, i + 0x8000));
  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: cfg.model ?? 'vlm',
      temperature: 0,
      repeat_penalty: 1.1,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${btoa(bin)}` } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`vlm server ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as ChatResponse;
  return body.choices?.[0]?.message?.content ?? '';
}

export function makeVlmStage(cfg: VlmConfig): Stage {
  return {
    name: 'vlm',
    version: '1',
    columns: ['scene_description', 'ocr_text', 'vlm_note'],
    peakMiB: PEAK_MIB,
    setup: cfg.start,
    teardown: cfg.stop,
    async run(c) {
      const jpeg = await cfg.keyframe(c.file);
      let desc = cleanDescription(await chat(cfg, jpeg, DESCRIBE_PROMPT, 80));
      let hits = interpretiveWords(desc);
      if (hits.length) {
        desc = cleanDescription(await chat(cfg, jpeg, DESCRIBE_PROMPT + STRICT_SUFFIX, 80));
        hits = interpretiveWords(desc);
      }
      const ocr = cleanOcr(await chat(cfg, jpeg, OCR_PROMPT, 200));
      if (hits.length || !desc) {
        return {
          scene_description: null,
          ocr_text: ocr,
          vlm_note: hits.length
            ? `description withheld: interpretive wording (${[...new Set(hits)].join(', ')})`
            : 'description empty',
        };
      }
      return { scene_description: desc, ocr_text: ocr, vlm_note: null };
    },
  };
}

// ---- production wiring: llama.cpp server in a pinned container ----

async function docker(args: string[], timeoutMs = 120_000): Promise<string> {
  const out = await new Deno.Command('docker', {
    args: ['-c', 'default', ...args],
    stdout: 'piped',
    stderr: 'piped',
    signal: AbortSignal.timeout(timeoutMs),
  }).output();
  if (!out.success) throw new Error(`docker ${args[0]} failed: ${new TextDecoder().decode(out.stderr).slice(-300)}`);
  return new TextDecoder().decode(out.stdout);
}

export async function keyframeJpeg(file: string): Promise<Uint8Array> {
  const args = (ss: string[]) => [
    '-v',
    'error',
    '-threads',
    '1',
    ...ss,
    '-i',
    file,
    '-an',
    '-frames:v',
    '1',
    '-vf',
    "scale='if(gt(iw,ih),512,-2)':'if(gt(iw,ih),-2,512)'",
    '-f',
    'mjpeg',
    '-',
  ];
  let { stdout } = await run('ffmpeg', args(['-ss', '1']));
  if (!stdout.length) ({ stdout } = await run('ffmpeg', args([]))); // clip shorter than the seek
  if (!stdout.length) throw new Error('no keyframe decoded');
  return stdout;
}

async function waitForLoad(maxLoad: number, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (true) {
    const load1 = Number((await Deno.readTextFile('/proc/loadavg')).split(' ')[0]);
    if (load1 <= maxLoad) return;
    if (Date.now() >= deadline) throw new Error(`load ${load1} stayed above ${maxLoad}`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

export function productionVlm(dataRoot: string): Stage {
  const port = Number(Deno.env.get('VLM_PORT') ?? '18110');
  const modelDir = Deno.env.get('VLM_MODEL_DIR') ?? `${dataRoot}/models/qwen3-vl-2b-instruct-q4_k_m`;
  const modelFile = Deno.env.get('VLM_MODEL_FILE') ?? 'Qwen3VL-2B-Instruct-Q4_K_M.gguf';
  const mmprojFile = Deno.env.get('VLM_MMPROJ_FILE') ?? 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf';
  const baseUrl = `http://127.0.0.1:${port}`;
  return makeVlmStage({
    baseUrl,
    keyframe: keyframeJpeg,
    async start() {
      await waitForLoad(2.5, 10 * 60_000);
      await docker(['rm', '-f', CONTAINER]).catch(() => {});
      await docker([
        'run',
        '-d',
        '--name',
        CONTAINER,
        '--cpus=3',
        '--cpu-shares',
        '128',
        '--memory',
        '4g',
        '--memory-swap',
        '4g',
        '--user',
        '1000:1000',
        '-e',
        'OMP_NUM_THREADS=3',
        '-v',
        `${modelDir}:/models:ro`,
        '-p',
        `127.0.0.1:${port}:8080`,
        `ghcr.io/ggml-org/llama.cpp@${VLM_IMAGE_DIGEST}`,
        '-m',
        `/models/${modelFile}`,
        '--mmproj',
        `/models/${mmprojFile}`,
        '--host',
        '0.0.0.0',
        '--port',
        '8080',
        '-t',
        '3',
        '-np',
        '1',
        '-c',
        '4096',
        '--image-max-tokens',
        '512',
      ]);
      const until = Date.now() + 180_000;
      while (Date.now() < until) {
        try {
          const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
          await r.body?.cancel();
          if (r.ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('vlm server did not become healthy in 180 s');
    },
    async stop() {
      await docker(['rm', '-f', CONTAINER]);
    },
  });
}
