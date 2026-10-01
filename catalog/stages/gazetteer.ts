export interface Place {
  name: string;
  admin1: string;
  country: string;
  lat: number;
  lon: number;
}

export interface Gazetteer {
  nearest(lat: number, lon: number, maxKm: number): { place: Place; km: number } | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Parse GeoNames dumps: cities1000.txt, admin1CodesASCII.txt, countryInfo.txt. */
export function parseGazetteer(citiesTsv: string, admin1Tsv: string, countryTsv: string): Gazetteer {
  const admin1 = new Map<string, string>();
  for (const line of admin1Tsv.split('\n')) {
    const f = line.split('\t');
    if (f.length >= 2) admin1.set(f[0], f[1]);
  }
  const countries = new Map<string, string>();
  for (const line of countryTsv.split('\n')) {
    if (line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length >= 5) countries.set(f[0], f[4]);
  }
  const places: Place[] = [];
  for (const line of citiesTsv.split('\n')) {
    const f = line.split('\t');
    if (f.length < 11) continue;
    places.push({
      name: f[2] || f[1],
      admin1: admin1.get(`${f[8]}.${f[10]}`) ?? '',
      country: countries.get(f[8]) ?? f[8],
      lat: Number(f[4]),
      lon: Number(f[5]),
    });
  }
  return {
    nearest(lat, lon, maxKm) {
      let best: Place | null = null;
      let bestKm = Infinity;
      for (const p of places) {
        if (Math.abs(p.lat - lat) > maxKm / 100) continue; // ~111 km per degree; cheap prefilter
        const km = haversineKm(lat, lon, p.lat, p.lon);
        if (km < bestKm) {
          bestKm = km;
          best = p;
        }
      }
      return best && bestKm <= maxKm ? { place: best, km: bestKm } : null;
    },
  };
}

export function formatPlace(p: Place): string {
  return [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : '', p.country].filter(Boolean).join(', ');
}

export async function loadGazetteer(dir: string): Promise<Gazetteer> {
  const [c, a, k] = await Promise.all([
    Deno.readTextFile(`${dir}/cities1000.txt`),
    Deno.readTextFile(`${dir}/admin1CodesASCII.txt`),
    Deno.readTextFile(`${dir}/countryInfo.txt`),
  ]);
  return parseGazetteer(c, a, k);
}
