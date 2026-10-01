import { audio } from './audio.ts';
import { colors } from './colors.ts';
import { motion } from './motion.ts';
import { place } from './place.ts';
import { probe } from './probe.ts';
import { timeOfDayStage } from './time_of_day.ts';
import { productionVlm } from './vlm.ts';
import type { Stage } from './mod.ts';

/** Tier 0 first, then model stages (VLM now; whisper, embeddings, Jeff later) in batch order. */
export function buildStages(dataRoot: string): Stage[] {
  return [probe, timeOfDayStage, place, colors, motion, audio, productionVlm(dataRoot)];
}
