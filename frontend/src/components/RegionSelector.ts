import React from 'react';
import { REGIONS, type Region } from '@madhuca/logic';

export interface RegionSelectorProps {
  region: Region;
  onChange: (region: Region) => void;
}

/** Human-readable region labels with localized script indicators for accessibility. */
export const REGION_LABELS: Record<Region, { name: string; native: string }> = {
  punjab: { name: 'Punjab', native: 'ਪੰਜਾਬ' },
  bihar: { name: 'Bihar', native: 'बिहार' },
  delhi: { name: 'Delhi', native: 'दिल्ली' },
  telangana: { name: 'Telangana', native: 'తెలంగాణ' },
};

/** Toggle between the four v1 regions. Changing region re-triggers the fetch cycle. */
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
