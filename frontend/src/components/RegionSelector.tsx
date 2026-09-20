import { REGIONS, type Region } from '@madhuca/logic';

export interface RegionSelectorProps {
  region: Region;
  onChange: (region: Region) => void;
}

/** Toggle between the four v1 regions. Changing region re-triggers the fetch cycle. */
export function RegionSelector({ region, onChange }: RegionSelectorProps) {
  // TODO: style as a mobile-friendly segmented control; label regions properly.
  void REGIONS;
  void region;
  void onChange;
  return <nav />;
}
