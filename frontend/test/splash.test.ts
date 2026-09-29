import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FRONTEND = join(import.meta.dirname, '..');
const html = readFileSync(join(FRONTEND, 'index.html'), 'utf8');
const logo = readFileSync(join(FRONTEND, '..', 'assets', 'logo', 'madhuca-logo-transparent-for-light.svg'), 'utf8');

type Shape = { tag: string; attrs: Record<string, string> };

function shapes(svg: string): Shape[] {
  return [...svg.matchAll(/<(circle|rect|path)\b([^>]*?)\/>/g)].map((m) => ({
    tag: m[1]!,
    attrs: Object.fromEntries([...m[2]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!])),
  }));
}

test('the tab icon is the new logo mark, with an .ico fallback, and both files exist', () => {
  assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="any" \/>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
  const favicon = readFileSync(join(FRONTEND, 'public', 'favicon.svg'), 'utf8');
  const source = readFileSync(join(FRONTEND, '..', 'assets', 'logo', 'favicon.svg'), 'utf8');
  // Same marks as the new logo's favicon; the old flame-in-a-circle icon is gone.
  assert.deepEqual(shapes(favicon), shapes(source));
  assert.doesNotMatch(favicon, /<path/);
  assert.doesNotMatch(favicon, /<metadata/);
  assert.ok(existsSync(join(FRONTEND, 'public', 'favicon.ico')));
});

test('the loading screen draws every mark of the real logo, in its own colour, as an outline that fills', () => {
  const splash = html.match(/<div id="splash"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const drawn = shapes(splash);
  const source = shapes(logo);
  assert.equal(drawn.length, 28, '27 marks and the wordmark');
  assert.equal(drawn.length, source.length);
  drawn.forEach((s, i) => {
    const { class: cls, style, stroke, ...geometry } = s.attrs;
    assert.equal(cls, 's');
    assert.equal(style, `--i:${i}`, 'filled in document order');
    assert.equal(stroke, s.attrs.fill, 'outlined in its own colour');
    assert.deepEqual({ tag: s.tag, attrs: geometry }, source[i], 'same shape and colour as the logo');
  });
});

test('the fill animation respects reduced motion and the screen is announced as loading', () => {
  assert.match(html, /#splash \.s \{[^}]*fill-opacity: 0;[^}]*animation: splash-fill/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{\s*#splash \.s \{\s*animation: none;\s*fill-opacity: 1;/);
  assert.match(html, /<div id="splash" role="status" aria-label="Loading Madhuca">/);
  // It sits before #root so it paints before the app bundle has loaded.
  assert.ok(html.indexOf('id="splash"') < html.indexOf('id="root"'));
});
