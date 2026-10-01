import { formatPlace } from './gazetteer.ts';
import type { Stage } from './mod.ts';

const MAX_KM = 30;

export const place: Stage = {
  name: 'place',
  version: 'geonames-cities1000-1',
  columns: ['place_name'],
  peakMiB: 400,
  async run(c, ctx) {
    if (c.lat === null || c.lon === null) return { place_name: null };
    const hit = (await ctx.gazetteer()).nearest(c.lat, c.lon, MAX_KM);
    return { place_name: hit ? formatPlace(hit.place) : null };
  },
};
