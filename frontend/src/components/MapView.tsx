import type { Hotspot, Plume, Region } from '@madhuca/logic';

export interface MapViewProps {
  region: Region;
  hotspots: Hotspot[];
  /** Plume per hotspot id, once Jammy's dispersion module is wired in. */
  plumes?: Record<string, Plume>;
  onSelect: (hotspot: Hotspot) => void;
}

/** MapLibre GL map with a marker per hotspot for the selected region. */
export function MapView({ region, hotspots, plumes, onSelect }: MapViewProps) {
  // TODO: init a maplibre-gl Map in a ref'd div, fit bounds to `region`.
  // TODO: render one marker per hotspot; color by classification once Jammy's
  //       classification module lands — single marker style until then.
  // TODO: draw each plume as a cone overlay from bearingDeg/distanceKm/spreadDeg.
  void region;
  void hotspots;
  void plumes;
  void onSelect;
  return <div />;
}
