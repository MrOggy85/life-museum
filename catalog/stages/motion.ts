import { rawFrames } from './media.ts';
import type { Stage } from './mod.ts';

/** Mean absolute difference between consecutive grayscale frames, 0..1. Whole-frame: includes camera shake. */
export function motionScore(frames: Uint8Array[]): number | null {
  if (frames.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < frames.length; i++) {
    let d = 0;
    for (let p = 0; p < frames[i].length; p++) d += Math.abs(frames[i][p] - frames[i - 1][p]);
    sum += d / frames[i].length / 255;
  }
  return sum / (frames.length - 1);
}

// Provisional thresholds: calibrate against real clips before curators rely on motion_state.
export function motionState(score: number): 'still' | 'slight' | 'high' {
  return score < 0.01 ? 'still' : score < 0.05 ? 'slight' : 'high';
}

export const motion: Stage = {
  name: 'motion',
  version: '1',
  columns: ['motion_score', 'motion_state'],
  peakMiB: 80,
  async run(c) {
    const score = motionScore(await rawFrames(c.file, 4, 64, 36, 'gray'));
    if (score === null) return { motion_score: null, motion_state: null };
    return { motion_score: Math.round(score * 10000) / 10000, motion_state: motionState(score) };
  },
};
