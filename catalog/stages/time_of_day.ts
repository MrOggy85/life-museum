import { timeOfDay } from './solar.ts';
import type { Stage } from './mod.ts';

export const timeOfDayStage: Stage = {
  name: 'time_of_day',
  version: '1',
  columns: ['time_of_day'],
  peakMiB: 10,
  run(c) {
    if (c.lat === null || c.lon === null) return Promise.resolve({ time_of_day: null });
    return Promise.resolve({ time_of_day: timeOfDay(new Date(c.captured_at), c.lat, c.lon) });
  },
};
