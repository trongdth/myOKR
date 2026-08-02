import { test, expect } from '@playwright/test';

// Guard for the font-token refactor: the app defines exactly two font families
// (Inter + JetBrains Mono — see docs/design-system.md), exposed as --font-sans
// and --font-mono. Hardcoded family stacks must not return; everything routes
// through these tokens. Expected family names come from the design system (the
// source of truth), not from the code under test.
test.describe('Font tokens', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('--font-sans and --font-mono resolve to Inter / JetBrains Mono', async ({ page }) => {
    const { sansDef, monoDef, sansResolved, monoResolved, bodyFamily } = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const sansDef = root.getPropertyValue('--font-sans');
      const monoDef = root.getPropertyValue('--font-mono');

      const a = document.createElement('div');
      a.style.fontFamily = 'var(--font-sans)';
      document.body.appendChild(a);
      const b = document.createElement('div');
      b.style.fontFamily = 'var(--font-mono)';
      document.body.appendChild(b);
      const sansResolved = getComputedStyle(a).fontFamily;
      const monoResolved = getComputedStyle(b).fontFamily;
      a.remove();
      b.remove();

      return {
        sansDef,
        monoDef,
        sansResolved,
        monoResolved,
        bodyFamily: getComputedStyle(document.body).fontFamily,
      };
    });

    // The tokens name the intended families.
    expect(sansDef).toContain('Inter');
    expect(monoDef).toContain('JetBrains Mono');
    // They resolve through var() to those same families.
    expect(sansResolved).toContain('Inter');
    expect(monoResolved).toContain('JetBrains Mono');
    // The body inherits the sans token.
    expect(bodyFamily).toContain('Inter');
  });
});
