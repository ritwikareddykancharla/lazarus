const EARTH_M = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from point 1 to point 2, degrees clockwise from north, in [0, 360). */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export function compass(deg: number): (typeof POINTS)[number] {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] as (typeof POINTS)[number];
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
