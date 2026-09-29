import type { Classification, Hotspot, LandCover } from './types';

/**
 * States where autumn paddy-stubble burning is the known pattern: the old launch
 * regions (Punjab, Bihar, Delhi) plus Haryana and Uttar Pradesh, which the region
 * boxes never reached but which burn stubble on the same calendar.
 */
export const STUBBLE_BELT: readonly string[] = ['Punjab', 'Haryana', 'Delhi', 'Uttar Pradesh', 'Bihar'];

/**
 * Tag a hotspot as likely crop/stubble burning vs. likely wildfire.
 * In: one hotspot, the land cover at its point and the state it is in
 * (logic/src/geo.ts looks both up from prebuilt grids).
 * Out: a kind, the land cover it landed in, and a plain-language rationale.
 * Crop-burning fires are still shown — tagged differently, never dropped.
 * Owner: Jammy (delegation/jammy.md — classification module).
 */
export function classifyHotspot(hotspot: Hotspot, landCover: LandCover, state: string | undefined): Classification {
  // UTC month, 1-12. An unparseable timestamp is an unknown season — it must not
  // fall into stubble season and tilt an ambiguous fire toward crop-burning.
  const time = Date.parse(hotspot.acquiredAt);
  const month = Number.isNaN(time) ? null : new Date(time).getUTCMonth() + 1;
  const isAutumnStubbleSeason = month === 10 || month === 11;
  const isSpringHarvestSeason = month === 4 || month === 5;
  // Unknown FRP stays null rather than a guessed "moderate" value, for the same reason.
  const frp = Number.isFinite(hotspot.frp) ? hotspot.frp : null;

  if (landCover === 'forest') {
    return {
      kind: 'likely-wildfire',
      landCover,
      rationale: 'Thermal anomaly detected within designated forest land cover; characteristic of forest wildfire.',
    };
  }

  if (landCover === 'cropland') {
    if (frp !== null && frp > 150) {
      return {
        kind: 'likely-wildfire',
        landCover,
        rationale:
          'Thermal anomaly located in cropland, but exceptionally high radiative power (>150 MW) suggests an intense wildfire rather than crop-residue burning.',
      };
    }

    if (isAutumnStubbleSeason) {
      return {
        kind: 'likely-crop-burning',
        landCover,
        rationale:
          'Thermal anomaly detected in agricultural cropland during peak autumn paddy-stubble burning season.',
      };
    }

    if (isSpringHarvestSeason) {
      return {
        kind: 'likely-crop-burning',
        landCover,
        rationale:
          'Thermal anomaly detected in agricultural cropland during post-harvest wheat-stubble burning season.',
      };
    }

    return {
      kind: 'likely-crop-burning',
      landCover,
      rationale:
        'Thermal anomaly detected in agricultural cropland with moderate fire radiative power consistent with field residue burning.',
    };
  }

  // landCover === 'other' (grassland, shrubland, scrub, built-up, or unmapped edge).
  // CRITICAL RULE (AGENTS.md & MASTER.md §1): 'other' must NOT default to crop-burning.
  // Grassland and scrub fires (like the Telangana origin fire) land in 'other'.
  // Only classify as crop-burning if it matches a strong stubble-burning signature:
  // stubble-belt state (STUBBLE_BELT) during peak Oct-Nov stubble season with characteristic moderate FRP.
  const isStubbleRegion = state !== undefined && STUBBLE_BELT.includes(state);
  const hasCropBurningSignature =
    isStubbleRegion && isAutumnStubbleSeason && frp !== null && frp >= 5 && frp <= 60;

  if (hasCropBurningSignature) {
    return {
      kind: 'likely-crop-burning',
      landCover,
      rationale:
        'Thermal anomaly detected adjacent to agricultural land during peak stubble burning season with characteristic fire radiative power.',
    };
  }

  return {
    kind: 'likely-wildfire',
    landCover,
    rationale:
      'Detected in uncultivated terrain (scrubland/grassland/open ground); characteristic of brush or wildfire.',
  };
}
