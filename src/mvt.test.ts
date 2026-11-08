import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tilesAround } from './aed';
import { distanceM } from './geo';
import { decodePoints, lonLatToTile, tilePointToLonLat, zigzag } from './mvt';

// A real OpenAEDMap tile (z14/4824/6157, Midtown Manhattan), captured Nov 2026.
// Data © OpenStreetMap contributors, ODbL.
const MIDTOWN =
  'GqsBCg5kZWZpYnJpbGxhdG9ycxIREgYBAAIBAwIYASIFCZEUrk4SDxIEAAMDAhgBIgUJkxCQTxIPEgQABAMFGAEiBQmIP5ApGgdub2RlX2lkGgtwb2ludF9jb3VudBoXcG9pbnRfY291bnRfYWJicmV2aWF0ZWQaBmFjY2VzcyICKAIiAwoBMiICCgAiBijl7LmUKSIGKL2Uj+4yIgsKCWN1c3RvbWVycyiAIHgC';

const lon = fc.double({ min: -180, max: 179.999, noNaN: true });
const lat = fc.double({ min: -85, max: 85, noNaN: true });

describe('vector tiles', () => {
  it('decodes a real OpenAEDMap tile', () => {
    const bytes = Uint8Array.from(atob(MIDTOWN), (c) => c.charCodeAt(0));
    const points = decodePoints(bytes, 14, 4824, 6157);
    expect(points).toHaveLength(3);
    expect(points.every((p) => p.layer === 'defibrillators')).toBe(true);
    const library = points.find((p) => p.tags.node_id === 13652707901);
    expect(library?.tags.access).toBe('customers');
    // The OSM node is at 40.7532072, -73.9822533; tile precision is a few meters.
    expect(distanceM(library?.lat ?? 0, library?.lon ?? 0, 40.7532072, -73.9822533)).toBeLessThan(10);
    expect(points.some((p) => p.tags.point_count === 2)).toBe(true);
  });

  it('zigzag decodes small signed integers', () => {
    expect([0, 1, 2, 3, 4].map(zigzag)).toEqual([0, -1, 1, -2, 2]);
  });

  it('every point falls inside the tile lonLatToTile picks for it', () => {
    fc.assert(
      fc.property(lon, lat, fc.integer({ min: 0, max: 18 }), (lo, la, z) => {
        const { x, y } = lonLatToTile(lo, la, z);
        const nw = tilePointToLonLat(z, x, y, 4096, 0, 0);
        const se = tilePointToLonLat(z, x, y, 4096, 4096, 4096);
        expect(lo).toBeGreaterThanOrEqual(nw.lon - 1e-9);
        expect(lo).toBeLessThanOrEqual(se.lon + 1e-9);
        expect(la).toBeLessThanOrEqual(nw.lat + 1e-9);
        expect(la).toBeGreaterThanOrEqual(se.lat - 1e-9);
      }),
    );
  });

  it('tilesAround covers the whole search circle', () => {
    fc.assert(
      fc.property(
        lon,
        fc.double({ min: -70, max: 70, noNaN: true }),
        fc.integer({ min: 200, max: 2000 }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (lo, la, r, angle, frac) => {
          const tiles = new Set(tilesAround(la, lo, r, 16).map((t) => `${t.x}/${t.y}`));
          // A point inside the circle, offset by `frac * r` in direction `angle`.
          const d = frac * r * 0.999;
          const pLat = la + (d * Math.cos(angle)) / 111320;
          const pLon = lo + (d * Math.sin(angle)) / (111320 * Math.cos((la * Math.PI) / 180));
          if (pLon < -180 || pLon >= 180) return;
          const t = lonLatToTile(pLon, pLat, 16);
          expect(tiles.has(`${t.x}/${t.y}`)).toBe(true);
        },
      ),
    );
  });
});
