/**
 * Minimal Mapbox Vector Tile reader for point features (protobuf, spec v2).
 * Only what the AED finder needs: layers, point geometry and feature tags.
 */

export type TagValue = string | number | boolean;

export interface PointFeature {
  layer: string;
  id?: number;
  lon: number;
  lat: number;
  tags: Record<string, TagValue>;
}

class Reader {
  pos = 0;
  readonly buf: Uint8Array;
  readonly end: number;

  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }

  varint(): number {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new RangeError('Truncated varint');
      const b = this.buf[this.pos++] as number;
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
    throw new RangeError('Varint too long');
  }

  /** Read a key; returns [fieldNumber, wireType]. */
  key(): [number, number] {
    const k = this.varint();
    return [Math.floor(k / 8), k % 8];
  }

  bytes(): Reader {
    const len = this.varint();
    const start = this.pos;
    this.pos += len;
    if (this.pos > this.end) throw new RangeError('Truncated field');
    return new Reader(this.buf, start, start + len);
  }

  string(): string {
    const r = this.bytes();
    return new TextDecoder().decode(this.buf.subarray(r.pos, r.end));
  }

  float(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  }

  double(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return v;
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new RangeError(`Unsupported wire type ${wire}`);
  }

  packed(): number[] {
    const r = this.bytes();
    const out: number[] = [];
    while (r.pos < r.end) out.push(r.varint());
    return out;
  }

  get done(): boolean {
    return this.pos >= this.end;
  }
}

export const zigzag = (n: number): number => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function readValue(r: Reader): TagValue | undefined {
  let value: TagValue | undefined;
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1 && wire === 2) value = r.string();
    else if (field === 2 && wire === 5) value = r.float();
    else if (field === 3 && wire === 1) value = r.double();
    else if ((field === 4 || field === 5) && wire === 0) value = r.varint();
    else if (field === 6 && wire === 0) value = zigzag(r.varint());
    else if (field === 7 && wire === 0) value = r.varint() !== 0;
    else r.skip(wire);
  }
  return value;
}

/** Tile pixel (0..extent) to longitude/latitude, Web Mercator. */
export function tilePointToLonLat(z: number, x: number, y: number, extent: number, px: number, py: number): { lon: number; lat: number } {
  const n = 2 ** z;
  const wx = (x + px / extent) / n;
  const wy = (y + py / extent) / n;
  return { lon: wx * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * wy))) * 180) / Math.PI };
}

export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Decode every point feature in a tile. Lines and polygons are ignored. */
export function decodePoints(data: Uint8Array, z: number, x: number, y: number): PointFeature[] {
  const out: PointFeature[] = [];
  const tile = new Reader(data);
  while (!tile.done) {
    const [field, wire] = tile.key();
    if (field !== 3 || wire !== 2) {
      tile.skip(wire);
      continue;
    }
    const layer = tile.bytes();
    let name = '';
    let extent = 4096;
    const keys: string[] = [];
    const values: (TagValue | undefined)[] = [];
    const features: Reader[] = [];
    while (!layer.done) {
      const [f, w] = layer.key();
      if (f === 1 && w === 2) name = layer.string();
      else if (f === 2 && w === 2) features.push(layer.bytes());
      else if (f === 3 && w === 2) keys.push(layer.string());
      else if (f === 4 && w === 2) values.push(readValue(layer.bytes()));
      else if (f === 5 && w === 0) extent = layer.varint();
      else layer.skip(w);
    }
    for (const fr of features) {
      let id: number | undefined;
      let type = 0;
      let tags: number[] = [];
      let geometry: number[] = [];
      while (!fr.done) {
        const [f, w] = fr.key();
        if (f === 1 && w === 0) id = fr.varint();
        else if (f === 2 && w === 2) tags = fr.packed();
        else if (f === 3 && w === 0) type = fr.varint();
        else if (f === 4 && w === 2) geometry = fr.packed();
        else fr.skip(w);
      }
      if (type !== 1) continue;
      const props: Record<string, TagValue> = {};
      for (let i = 0; i + 1 < tags.length; i += 2) {
        const k = keys[tags[i] as number];
        const v = values[tags[i + 1] as number];
        if (k !== undefined && v !== undefined) props[k] = v;
      }
      let cx = 0;
      let cy = 0;
      let i = 0;
      while (i < geometry.length) {
        const cmd = geometry[i++] as number;
        const op = cmd & 7;
        const count = cmd >> 3;
        if (op !== 1) break;
        for (let c = 0; c < count && i + 1 < geometry.length; c++) {
          cx += zigzag(geometry[i++] as number);
          cy += zigzag(geometry[i++] as number);
          out.push({ layer: name, id, tags: props, ...tilePointToLonLat(z, x, y, extent, cx, cy) });
        }
      }
    }
  }
  return out;
}
