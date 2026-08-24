import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * Ticket 06 — .scratch/custom-select/issues/06-retire-old-dropdown-layer.md
 * The custom-select migration's contract guard: no native <select> may re-enter
 * the desktop app. Source-level scan (not runtime) so unrendered code paths are
 * covered too. Every dropdown is an instance of the shared Select
 * (docs/design-system.md "Menu component").
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return /\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : [];
  });
}

test('no native <select> exists anywhere in desktop src/', () => {
  const offenders = tsxFiles('src')
    .map((f) => ({ f, content: readFileSync(f, 'utf8') }))
    .filter(({ content }) => /<select[\s>/]/.test(content))
    .map(({ f, content }) => {
      const line = content.split('\n').findIndex(l => /<select[\s>/]/.test(l)) + 1;
      return `${f}:${line}`;
    });
  expect(offenders, `native <select> found — use the shared Select component instead:\n${offenders.join('\n')}`).toEqual([]);
});
