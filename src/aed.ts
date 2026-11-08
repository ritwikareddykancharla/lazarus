import { bearingDeg, distanceM } from './geo';
import { decodePoints, lonLatToTile } from './mvt';

/** A defibrillator mapped in OpenStreetMap (tag emergency=defibrillator). */
export interface Aed {
  id: string;
  lat: number;
  lon: number;
  distance: number;
  bearing: number;
  name?: string;
  where?: string;
  access?: string;
  indoor?: boolean;
  hours?: string;
  operator?: string;
  /** Several AEDs merged into one map point (only from clustered tiles). */
  cluster?: number;
}

export interface AedResult {
  aeds: Aed[];
  source: 'OpenAEDMap' | 'Overpass';
}

// Public Overpass servers get overloaded; try each in turn after OpenAEDMap.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

interface RawElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const clean = (s: string | undefined, max = 120) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, max) || undefined : undefined);

export function parseAeds(elements: RawElement[], lat: number, lon: number): Aed[] {
  const out: Aed[] = [];
  for (const el of elements) {
    const alat = el.lat ?? el.center?.lat;
    const alon = el.lon ?? el.center?.lon;
    if (typeof alat !== 'number' || typeof alon !== 'number' || !Number.isFinite(alat) || !Number.isFinite(alon)) continue;
    const tags = el.tags ?? {};
    out.push({
      id: `${el.type}/${el.id}`,
      lat: alat,
      lon: alon,
      distance: distanceM(lat, lon, alat, alon),
      bearing: bearingDeg(lat, lon, alat, alon),
      name: clean(tags.name ?? tags.operator),
      where: clean(tags['defibrillator:location:en'] ?? tags['defibrillator:location'] ?? tags.description),
      access: clean(tags.access, 30),
      indoor: tags.indoor === 'yes' ? true : tags.indoor === 'no' ? false : undefined,
      hours: clean(tags.opening_hours, 60),
      operator: clean(tags.operator),
    });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

const OPENAEDMAP = 'https://openaedmap.org/api/v1';
const MAX_TILES = 36;
const DETAIL_COUNT = 12;

/** Every tile at zoom `z` that overlaps the circle's bounding box. */
export function tilesAround(lat: number, lon: number, radiusM: number, z: number): { x: number; y: number }[] {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const a = lonLatToTile(lon - dLon, lat + dLat, z);
  const b = lonLatToTile(lon + dLon, lat - dLat, z);
  const out: { x: number; y: number }[] = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ x, y });
  return out;
}

/**
 * OpenAEDMap serves the same OpenStreetMap AEDs as cached vector tiles, which
 * stay fast when the public Overpass servers are overloaded.
 */
async function fromOpenAedMap(lat: number, lon: number, radiusM: number): Promise<Aed[]> {
  let z = 16;
  let tiles = tilesAround(lat, lon, radiusM, z);
  if (tiles.length > MAX_TILES) {
    z = 15;
    tiles = tilesAround(lat, lon, radiusM, z);
  }
  const responses = await Promise.all(
    tiles.map(async ({ x, y }) => {
      const res = await fetchWithTimeout(`${OPENAEDMAP}/tile/${z}/${x}/${y}.mvt`, {}, 12000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return decodePoints(new Uint8Array(await res.arrayBuffer()), z, x, y);
    }),
  );
  const seen = new Set<string>();
  const aeds: Aed[] = [];
  for (const p of responses.flat()) {
    const distance = distanceM(lat, lon, p.lat, p.lon);
    if (distance > radiusM) continue;
    const nodeId = typeof p.tags.node_id === 'number' ? p.tags.node_id : undefined;
    const count = typeof p.tags.point_count === 'number' ? p.tags.point_count : undefined;
    const id = nodeId !== undefined ? `node/${nodeId}` : `cluster/${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    aeds.push({
      id,
      lat: p.lat,
      lon: p.lon,
      distance,
      bearing: bearingDeg(lat, lon, p.lat, p.lon),
      access: typeof p.tags.access === 'string' && p.tags.access ? p.tags.access : undefined,
      cluster: count && count > 1 ? count : undefined,
    });
  }
  aeds.sort((a, b) => a.distance - b.distance);

  // Fill in names and locations for the closest few.
  await Promise.all(
    aeds.slice(0, DETAIL_COUNT).map(async (aed) => {
      if (!aed.id.startsWith('node/')) return;
      try {
        const res = await fetchWithTimeout(`${OPENAEDMAP}/${aed.id}`, {}, 8000);
        if (!res.ok) return;
        const data = (await res.json()) as { elements?: RawElement[] };
        const detailed = parseAeds(data.elements ?? [], lat, lon)[0];
        if (detailed) Object.assign(aed, { ...detailed, id: aed.id });
      } catch {
        /* details are optional */
      }
    }),
  );
  return aeds;
}

async function fromOverpass(lat: number, lon: number, radiusM: number): Promise<Aed[]> {
  const query = `[out:json][timeout:20];nwr["emergency"="defibrillator"](around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)});out center 80;`;
  let lastError: unknown = null;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(url, { method: 'POST', body: new URLSearchParams({ data: query }) }, 15000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { elements?: RawElement[] };
      return parseAeds(data.elements ?? [], lat, lon);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('no response');
}

export async function findAeds(lat: number, lon: number, radiusM = 1500): Promise<AedResult> {
  try {
    return { aeds: await fromOpenAedMap(lat, lon, radiusM), source: 'OpenAEDMap' };
  } catch (first) {
    try {
      return { aeds: await fromOverpass(lat, lon, radiusM), source: 'Overpass' };
    } catch (second) {
      const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
      throw new Error(`The AED map servers did not answer (OpenAEDMap: ${why(first)}; Overpass: ${why(second)}).`);
    }
  }
}
