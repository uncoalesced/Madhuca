import type { Classification, Hotspot, LandCoverMask } from './types';

/**
 * Tag a hotspot as likely crop/stubble burning vs. likely wildfire.
 * In: one hotspot + the precomputed land-cover mask for its region.
 * Out: a kind, the land cover it landed in, and a plain-language rationale.
 * Crop-burning fires are still shown — tagged differently, never dropped.
 * Owner: Jammy (delegation/jammy.md — classification module).
 */
export function classifyHotspot(hotspot: Hotspot, landCoverMask: LandCoverMask): Classification {
  // TODO: point-in-polygon the hotspot against the mask, then combine land cover
  //       with FRP magnitude and month (India's stubble season ≈ Oct–Nov).
  void hotspot;
  void landCoverMask;
  throw new Error('not implemented');
}
