import type { Gazetteer } from './gazetteer.ts';

/** A row of the capture registry (archive.sqlite), as the cataloguer sees it. */
export interface Capture {
  capture_id: string;
  captured_at: string;
  lat: number | null;
  lon: number | null;
  file: string; // absolute path to the raw clip
}

export interface StageContext {
  gazetteer: () => Promise<Gazetteer>;
}

export type FieldValue = string | number | null;

export interface Stage {
  name: string;
  /** Bump when the logic changes: every row is then pending again for this stage. */
  version: string;
  /** Catalog columns this stage may write. */
  columns: string[];
  /** Expected peak resident memory, for pre-flight. */
  peakMiB: number;
  /** Called once before the backlog (e.g. start a model server). Throwing skips the stage for the night. */
  setup?(): Promise<void>;
  /** Called once after the backlog, even on failure or window close. */
  teardown?(): Promise<void>;
  run(c: Capture, ctx: StageContext): Promise<Record<string, FieldValue>>;
}
