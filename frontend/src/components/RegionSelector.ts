import React from 'react';
import { REGIONS, type Region } from '@madhuca/logic';

export interface RegionSelectorProps {
  region: Region;
  onChange: (region: Region) => void;
}

/** Human-readable region labels with localized script indicators for accessibility. */
export const REGION_LABELS: Record<Region, { name: string; native: string }> = {
  north: { name: 'North India', native: 'उत्तर भारत' },
  south: { name: 'South India', native: 'దక్షిణ భారతం' },
  west: { name: 'West India', native: 'पश्चिम भारत' },
  east: { name: 'East India', native: 'पूर्व भारत' },
  india: { name: 'All India', native: 'संपूर्ण भारत' },
};

/** Toggle between the five regions, All India last. Changing region re-triggers the fetch cycle. */
export function RegionSelector({ region, onChange }: RegionSelectorProps) {
  const tabs = REGIONS.map((r) => {
    const isSelected = r === region;
    const { name, native } = REGION_LABELS[r];

    return React.createElement(
      'button',
      {
        key: r,
        type: 'button',
        role: 'tab',
        'aria-selected': isSelected,
        'aria-controls': `panel-${r}`,
        className: `region-tab ${isSelected ? 'region-tab-active' : ''}`,
        onClick: () => onChange(r),
      },
      React.createElement('span', { className: 'region-tab-name' }, name),
      React.createElement('span', { className: 'region-tab-native' }, native)
    );
  });

  return React.createElement(
    'nav',
    {
      className: 'region-selector',
      'aria-label': 'Region Selector',
    },
    React.createElement(
      'div',
      {
        className: 'region-segmented-control',
        role: 'tablist',
        'aria-label': 'Select monitoring region',
      },
      ...tabs
    )
  );
}
