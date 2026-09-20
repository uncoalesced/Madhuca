import { useState } from 'react';
import type { Hotspot, Region } from '@madhuca/logic';
import { MapView } from './components/MapView';
import { RegionSelector } from './components/RegionSelector';
import { HotspotDetailPanel } from './components/HotspotDetailPanel';

export function App() {
  const [region, setRegion] = useState<Region>('punjab');
  const [selected, setSelected] = useState<Hotspot | null>(null);

  // TODO: on mount and on every region change, run the on-demand pipeline
  //       (fetchHotspots -> fetchWind -> computeDispersion -> classifyHotspot).
  //       First load has real latency — show an honest loading state, and treat
  //       "no fires detected" as a normal empty state, not an error.

  return (
    <>
      <RegionSelector region={region} onChange={setRegion} />
      <MapView region={region} hotspots={[]} onSelect={setSelected} />
      <HotspotDetailPanel hotspot={selected} onClose={() => setSelected(null)} />
      <footer>
        © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data
      </footer>
    </>
  );
}
