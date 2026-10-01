import { run } from './media.ts';
import type { Stage } from './mod.ts';

export const probe: Stage = {
  name: 'probe',
  version: '1',
  columns: ['duration_seconds', 'width', 'height', 'video_codec', 'audio_codec'],
  peakMiB: 50,
  async run(c) {
    const { stdout } = await run('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      c.file,
    ]);
    const j = JSON.parse(new TextDecoder().decode(stdout));
    const v = j.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    const a = j.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');
    if (!v) throw new Error('no video stream');
    return {
      duration_seconds: Number(j.format.duration),
      width: v.width,
      height: v.height,
      video_codec: v.codec_name,
      audio_codec: a?.codec_name ?? null,
    };
  },
};
