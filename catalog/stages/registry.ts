import { audio } from './audio.ts';
import { colors } from './colors.ts';
import { motion } from './motion.ts';
import { place } from './place.ts';
import { probe } from './probe.ts';
import { timeOfDayStage } from './time_of_day.ts';
import type { Stage } from './mod.ts';

/** Tier 0 only. Model stages (whisper, VLM, embeddings, Jeff) are appended here, in batch order, as they land. */
export const STAGES: Stage[] = [probe, timeOfDayStage, place, colors, motion, audio];
