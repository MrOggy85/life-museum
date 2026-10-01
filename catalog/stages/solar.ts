const rad = Math.PI / 180;
const norm = (x: number, m: number) => ((x % m) + m) % m;

/** Solar elevation (degrees) and hour angle (degrees, negative before solar noon). NOAA-style low-precision algorithm. */
export function solarPosition(at: Date, lat: number, lon: number): { elevation: number; hourAngle: number } {
  const n = at.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = norm(280.46 + 0.9856474 * n, 360);
  const g = norm(357.528 + 0.9856003 * n, 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const gmst = norm(18.697374558 + 24.06570982441908 * n, 24);
  let hourAngle = norm(gmst * 15 + lon - ra, 360);
  if (hourAngle > 180) hourAngle -= 360;
  const sinEl = Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(hourAngle * rad);
  return { elevation: Math.asin(sinEl) / rad, hourAngle };
}

export type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(at: Date, lat: number, lon: number): TimeOfDay {
  const { elevation, hourAngle } = solarPosition(at, lat, lon);
  if (elevation < -6) return 'night';
  if (elevation < 6) return hourAngle < 0 ? 'dawn' : 'evening';
  const hoursFromNoon = hourAngle / 15;
  if (hoursFromNoon < -2) return 'morning';
  if (hoursFromNoon <= 2) return 'midday';
  return 'afternoon';
}
