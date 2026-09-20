import type { Classification, Hotspot, Plume } from '@madhuca/logic';
import { TtsButton } from './TtsButton';

export interface HotspotDetailPanelProps {
  hotspot: Hotspot | null;
  classification?: Classification;
  plume?: Plume;
  onClose: () => void;
}

/** Detail for one tapped hotspot. Has to read clearly to a non-specialist. */
export function HotspotDetailPanel({ hotspot, classification, plume, onClose }: HotspotDetailPanelProps) {
  // TODO: show classification, approximate FRP, rough distance/direction to the
  //       nearest town, and one plain-language "what this means for you" line —
  //       that same line is what gets passed to <TtsButton text=... />.
  void hotspot;
  void classification;
  void plume;
  void onClose;
  void TtsButton;
  return <aside />;
}
