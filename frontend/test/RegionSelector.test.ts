import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegionSelector, REGION_LABELS } from '../src/components/RegionSelector.ts';
import { REGIONS, type Region } from '@madhuca/logic';

test('RegionSelector renders all 5 regions with English and native names', () => {
  const html = renderToStaticMarkup(
    React.createElement(RegionSelector, { region: 'north', onChange: () => {} })
  );

  for (const region of REGIONS) {
    const label = REGION_LABELS[region];
    assert.ok(html.includes(label.name), `Expected HTML to include "${label.name}"`);
    assert.ok(html.includes(label.native), `Expected HTML to include native script "${label.native}"`);
  }
});

test('RegionSelector marks the selected region as active with aria-selected="true"', () => {
  const selectedRegion: Region = 'india';
  const html = renderToStaticMarkup(
    React.createElement(RegionSelector, { region: selectedRegion, onChange: () => {} })
  );

  assert.ok(
    html.includes('aria-selected="true"'),
    'Expected active region to have aria-selected="true"'
  );
  assert.ok(
    html.includes('region-tab-active'),
    'Expected active region button to have region-tab-active class'
  );
});

test('RegionSelector renders proper ARIA role structure for navigation', () => {
  const html = renderToStaticMarkup(
    React.createElement(RegionSelector, { region: 'east', onChange: () => {} })
  );

  assert.ok(html.includes('role="tablist"'), 'Expected tablist container role');
  assert.ok(html.includes('role="tab"'), 'Expected tab item roles');
  assert.ok(html.includes('aria-label="Region Selector"'), 'Expected accessible nav aria-label');
});
