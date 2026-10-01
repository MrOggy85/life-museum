import { run } from './media.ts';
import type { Stage } from './mod.ts';

// Provisional thresholds on mean volume (dBFS): calibrate against real clips.
export function audioState(meanDb: number): 'silent' | 'quiet' | 'moderate' | 'loud' {
  return meanDb < -50 ? 'silent' : meanDb < -35 ? 'quiet' : meanDb < -22 ? 'moderate' : 'loud';
}

export function parseVolumedetect(stderr: string): { mean: number; max: number } | null {
  const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const max = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  return mean && max ? { mean: Number(mean[1]), max: Number(max[1]) } : null;
}

export const audio: Stage = {
  name: 'audio',
  version: '1',
  columns: ['audio_mean_db', 'audio_peak_db', 'audio_state'],
  peakMiB: 60,
  async run(c) {
    const { stderr } = await run('ffmpeg', [
      '-hide_banner',
      '-threads',
      '1',
      '-i',
      c.file,
      '-vn',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]);
    const v = parseVolumedetect(stderr);
    if (!v) return { audio_mean_db: null, audio_peak_db: null, audio_state: 'none' };
    return { audio_mean_db: v.mean, audio_peak_db: v.max, audio_state: audioState(v.mean) };
  },
};
