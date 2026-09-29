import type { LandCover, Region } from './types';

/**
 * Where a point is, answered from two prebuilt grids instead of polygons. Both are
 * static assets made offline and loaded once per Worker isolate; a lookup is one
 * array read (land cover) or a short binary search in one row (state), so the whole
 * region loop stays far inside the 10ms free-tier budget with no geometry library.
 *
 *   frontend/public/boundaries/states.bin   pipeline/boundaries.mjs: state per 0.001 deg
 *                                           (Survey of India outline via DataMeet)
 *   frontend/public/landcover/india.bin     pipeline/landcover_india.py: other / cropland /
 *                                           forest per 0.005 deg (ESA WorldCover 2021)
 */

/** Which states make each zone (Joel, contract #37). 'india' is every state and UT. */
export const ZONE_STATES: Record<Exclude<Region, 'india'>, readonly string[]> = {
  north: ['Jammu & Kashmir', 'Ladakh', 'Himachal Pradesh', 'Punjab', 'Chandigarh', 'Haryana', 'Delhi', 'Uttarakhand', 'Uttar Pradesh'],
  west: ['Rajasthan', 'Gujarat', 'Maharashtra', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu', 'Madhya Pradesh'],
  east: [
    'Bihar', 'Jharkhand', 'West Bengal', 'Odisha', 'Chhattisgarh', 'Assam', 'Arunachal Pradesh', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Tripura', 'Sikkim', 'Andaman & Nicobar',
  ],
  south: ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Puducherry', 'Lakshadweep'],
};

/** Whether a state belongs to a region. Every state is in 'india'; `undefined` (abroad, sea) is in none. */
export function inRegion(region: Region, state: string | undefined): boolean {
  if (state === undefined) return false;
  return region === 'india' || ZONE_STATES[region].includes(state);
}

export interface Geo {
  /** State or UT name as DataMeet spells it, or undefined outside India. */
  stateAt(lon: number, lat: number): string | undefined;
  /** 'other' outside India and wherever WorldCover is neither cropland nor tree cover. */
  landCoverAt(lon: number, lat: number): LandCover;
}

/**
 * states.bin: "MST1", u32 version, f64 west, f64 north, f64 res, u32 cols, u32 rows,
 * u32 runs, u32 name bytes; names joined by '\n', padded to 4; u32 rowStart[rows + 1];
 * u16 runStart[runs]; u8 runValue[runs] (0 = outside, else 1 + index into names).
 */
export function decodeStateGrid(buffer: ArrayBuffer): Geo['stateAt'] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 48 || view.getUint32(0, true) !== 0x3154534d || view.getUint32(4, true) !== 1) {
    throw new Error('not a version-1 states.bin (regenerate: node pipeline/boundaries.mjs)');
  }
  const west = view.getFloat64(8, true);
  const north = view.getFloat64(16, true);
  const res = view.getFloat64(24, true);
  const cols = view.getUint32(32, true);
  const rows = view.getUint32(36, true);
  const runs = view.getUint32(40, true);
  const nameBytes = view.getUint32(44, true);
  const names = new TextDecoder().decode(new Uint8Array(buffer, 48, nameBytes)).split('\n');
  let at = 48 + nameBytes + ((4 - (nameBytes % 4)) % 4);
  const rowStart = new Uint32Array(buffer, at, rows + 1);
  at += rowStart.byteLength;
  const starts = new Uint16Array(buffer, at, runs);
  at += starts.byteLength;
  const values = new Uint8Array(buffer, at, runs);
  if (at + runs !== buffer.byteLength) throw new Error(`states.bin is ${buffer.byteLength} bytes, expected ${at + runs}`);

  return (lon, lat) => {
    const r = Math.floor((north - lat) / res);
    const c = Math.floor((lon - west) / res);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return undefined;
    // Last run starting at or before c.
    let lo = rowStart[r]!;
    let hi = rowStart[r + 1]! - 1;
    let value = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= c) {
        value = values[mid]!;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return value ? names[value - 1] : undefined;
  };
}

const LAND_COVER_CODES: readonly LandCover[] = ['other', 'cropland', 'forest', 'other'];

/**
 * india.bin: "MLC1", u32 version, f64 west, f64 north, f64 res, u32 cols, u32 rows,
 * then 2 bits per cell, row-major from the north-west, first cell in the low bits.
 */
export function decodeLandCoverGrid(buffer: ArrayBuffer): Geo['landCoverAt'] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 40 || view.getUint32(0, true) !== 0x31434c4d || view.getUint32(4, true) !== 1) {
    throw new Error('not a version-1 india.bin (regenerate: python pipeline/landcover_india.py)');
  }
  const west = view.getFloat64(8, true);
  const north = view.getFloat64(16, true);
  const res = view.getFloat64(24, true);
  const cols = view.getUint32(32, true);
  const rows = view.getUint32(36, true);
  const cells = new Uint8Array(buffer, 40);
  if (cells.length !== Math.ceil((cols * rows) / 4)) throw new Error(`india.bin holds ${cells.length} bytes of cells, expected ${Math.ceil((cols * rows) / 4)}`);

  return (lon, lat) => {
    const r = Math.floor((north - lat) / res);
    const c = Math.floor((lon - west) / res);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return 'other';
    const i = r * cols + c;
    return LAND_COVER_CODES[(cells[i >> 2]! >> ((i & 3) * 2)) & 3]!;
  };
}
