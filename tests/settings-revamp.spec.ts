import { test, expect, type Page } from '@playwright/test';

async function bootApp(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openSettings(page: Page) {
  await page.locator('.app-sidebar button[title="Settings"]').click();
  await expect(page.locator('.settings-shell')).toBeVisible();
}

test.describe('Settings screen revamp — shell parity, live SessionProvider sync & Cloud sync UX', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('renders SETTINGS eyebrow, dynamic h1, and frequency-ordered .plan-tab-strip tabs', async ({ page }) => {
    await openSettings(page);

    const eyebrow = page.locator('.settings-header .plan-header-eyebrow');
    await expect(eyebrow).toHaveText('SETTINGS');
    await expect(page.locator('.settings-header-title')).toHaveText('Session defaults');

    const tabs = page.locator('.settings-tabs .plan-tab');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText('Session defaults');
    await expect(tabs.nth(0)).toHaveClass(/active/);
    await expect(tabs.nth(1)).toHaveText('Cloud sync');

    // Offline default shows no nagging badge on Cloud sync tab
    await expect(tabs.nth(1).locator('.plan-tab-count')).toHaveCount(0);
    await expect(page.locator('.settings-strip-meta')).toContainText('Local-first');

    // Legacy wrappers are gone
    await expect(page.locator('.settings-page-container')).toHaveCount(0);
    await expect(page.locator('.settings-tab-button')).toHaveCount(0);

    // Switching to Cloud sync updates the dynamic h1
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    await expect(page.locator('.settings-header-title')).toHaveText('Cloud sync');
  });

  test('matches Focus shell padding across 1280x800, 1024x720, and 820x640', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1024, height: 720 },
      { width: 820, height: 640 },
    ]) {
      await page.setViewportSize(viewport);

      // Navigate to Focus -> Day plan via the app's canonical navigation event
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'day-plan' }));
      });
      await expect(page.locator('.focus-shell-inner')).toBeVisible();
      const focusMetrics = await page.locator('.focus-shell-inner').evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          paddingTop: s.paddingTop,
          paddingRight: s.paddingRight,
          paddingBottom: s.paddingBottom,
          paddingLeft: s.paddingLeft,
          rowGap: s.rowGap,
          left: Math.round(r.left),
          width: Math.round(r.width),
        };
      });

      // Navigate to Settings and verify identical shell inner geometry
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'settings' }));
      });
      await expect(page.locator('.settings-shell-inner')).toBeVisible();
      const settingsMetrics = await page.locator('.settings-shell-inner').evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          paddingTop: s.paddingTop,
          paddingRight: s.paddingRight,
          paddingBottom: s.paddingBottom,
          paddingLeft: s.paddingLeft,
          rowGap: s.rowGap,
          left: Math.round(r.left),
          width: Math.round(r.width),
        };
      });

      expect(settingsMetrics).toEqual(focusMetrics);
    }

    // At 820px (< 900px), the 2-column grid re-stacks to 1 column and hides the tab-strip meta
    await expect(page.locator('.settings-strip-meta')).toBeHidden();
    const colCount = await page.locator('.settings-grid-body').evaluate((el) => {
      return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
    });
    expect(colCount).toBe(1);
  });

  test('remembers active Settings tab within the session and honors navigateToSection("sync")', async ({ page }) => {
    await openSettings(page);
    await page.locator('.settings-tabs .plan-tab', { hasText: 'Cloud sync' }).click();
    await expect(page.locator('.settings-header-title')).toHaveText('Cloud sync');

    // Switch away to Focus -> Day plan, then come back to Settings
    await page.locator('button[title="Day plan"]').first().click();
    await expect(page.locator('.focus-shell')).toBeVisible();

    await openSettings(page);
    await expect(page.locator('.settings-header-title')).toHaveText('Cloud sync');

    // Programmatic deep-link back to session-defaults, then to sync
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'session-defaults' }));
    });
    await expect(page.locator('.settings-header-title')).toHaveText('Session defaults');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: 'sync' }));
    });
    await expect(page.locator('.settings-header-title')).toHaveText('Cloud sync');
  });

  test('Session defaults syncs live with SessionProvider, Daily rhythm math, and atomic Reset to defaults', async ({ page }) => {
    await openSettings(page);

    const resetBtn = page.locator('.settings-reset-btn');
    // Mock store seeds autoStartBreaks=false & autoStartFocus=false (differs from DEFAULT_SETTINGS),
    // so Reset starts enabled until restored to DEFAULT_SETTINGS.
    await expect(resetBtn).toBeEnabled();
    // Default 25m focus -> round(320 / 25) = 13 pomodoros/day, full set = 4*25 + 3*5 + 15 = 2h 10m
    await expect(page.locator('.settings-rhythm-number')).toHaveText('13');
    await expect(page.locator('.settings-rhythm-total')).toHaveText('2h 10m');

    // Change Pomodoro Duration to 40 via input -> Daily rhythm updates to 8 pomodoros/day & 3h 10m full set (4*40 + 3*5 + 15 = 190m)
    const focusInput = page.locator('.settings-stepper-input').first();
    await focusInput.fill('40');
    await expect(page.locator('.settings-rhythm-number')).toHaveText('8');
    await expect(page.locator('.settings-rhythm-total')).toHaveText('3h 10m');

    // Test + / - stepper buttons on Short Break (default 5 -> 6 -> 5)
    await page.getByRole('button', { name: 'Increase Short Break' }).click();
    await expect(page.locator('.settings-stepper-input').nth(1)).toHaveValue('6');
    await page.getByRole('button', { name: 'Decrease Short Break' }).click();
    await expect(page.locator('.settings-stepper-input').nth(1)).toHaveValue('5');

    // Toggle Auto-start breaks switch & select Rain ambient preset
    const autoBreaksSwitch = page.getByRole('switch', { name: 'Auto-start breaks' });
    await expect(autoBreaksSwitch).toHaveAttribute('aria-checked', 'false');
    await autoBreaksSwitch.click();
    await expect(autoBreaksSwitch).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radio', { name: 'Rain' }).click();
    await expect(page.getByRole('radio', { name: 'Rain' })).toHaveAttribute('aria-checked', 'true');

    // Navigate to Focus -> Session and verify the idle timer & ambient widget updated live!
    await page.locator('button[title="Session"]').first().click();
    await expect(page.locator('.timer-digits')).toHaveText('40:00');
    await expect(page.locator('.session-bottom-bar-audio')).toContainText('Rain');

    // Return to Settings -> Session defaults and Reset to defaults via ConfirmModal
    await openSettings(page);
    await resetBtn.click();
    const confirmModal = page.locator('.confirm-modal');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal).toContainText('Reset session defaults?');
    await confirmModal.getByRole('button', { name: 'Reset defaults' }).click();
    await expect(confirmModal).toHaveCount(0);

    await expect(focusInput).toHaveValue('25');
    await expect(autoBreaksSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'Auto-start focus' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.settings-rhythm-number')).toHaveText('13');
    // Now settings equal DEFAULT_SETTINGS, so Reset to defaults disables cleanly
    await expect(resetBtn).toBeDisabled();

    // Verify idle timer on Session tab also returned to 25:00
    await page.locator('button[title="Session"]').first().click();
    await expect(page.locator('.timer-digits')).toHaveText('25:00');
  });

  test('Cloud sync collapses setup guide, supports Step-1 Change key recovery, and keeps one primary CTA', async ({ page }) => {
    await openSettings(page);
    await page.locator('.settings-tabs .plan-tab', { hasText: 'Cloud sync' }).click();

    // Setup guide <details> is collapsed by default
    const disclosure = page.locator('details.settings-disclosure');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');
    await disclosure.locator('summary').click();
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(disclosure.locator('.settings-setup-steps li')).toHaveCount(5);

    // Step 1: only 1 solid .btn primary CTA on screen
    await expect(page.locator('.settings-shell .btn')).toHaveCount(1);
    await expect(page.locator('.settings-shell .btn')).toContainText('Get authorization link');

    // Empty key validation
    await page.locator('.settings-shell .btn').click();
    await expect(page.locator('.settings-error-banner')).toContainText('Dropbox App Key');

    // Enter mistyped key -> transitions to Step 2, locking input, but exposes "Change key"
    const appKeyInput = page.getByLabel('Dropbox App Key');
    await appKeyInput.fill('typo-app-key-123');
    await page.getByRole('button', { name: /Get authorization link/i }).click();

    await expect(appKeyInput).toBeDisabled();
    await expect(page.getByText('STEP 2 · AUTHORIZE & VERIFY')).toBeVisible();

    // Still strictly 1 solid .btn primary CTA ("Connect") — "Open authorization page" is ghost/outlined
    await expect(page.locator('.settings-shell .btn')).toHaveCount(1);
    await expect(page.locator('.settings-shell .btn')).toHaveText('Connect');

    // Click "Change key" -> unlocks Step 1 input and hides Step 2 cleanly
    await page.getByRole('button', { name: 'Change key' }).click();
    await expect(appKeyInput).toBeEnabled();
    await expect(appKeyInput).toHaveValue('typo-app-key-123');
    await expect(page.getByText('STEP 2 · AUTHORIZE & VERIFY')).toHaveCount(0);
    await expect(page.locator('.settings-shell .btn')).toContainText('Get authorization link');
  });

  test('Cloud sync connected state shows badges and gates Disconnect behind ConfirmModal', async ({ page }) => {
    // Wire an in-memory keychain backing for tauriCredentialStore in this browser test
    await page.evaluate(async () => {
      const { saveCredentials } = await import('/src/lib/credential-store.ts');
      const { tauriCredentialStore } = await import('/src/lib/tauri-credential-adapter.ts');
      const keychain = new Map<string, string>();
      tauriCredentialStore.secureGet = async (k: string) => keychain.get(k) ?? null;
      tauriCredentialStore.secureSet = async (k: string, v: string) => { keychain.set(k, v); };
      tauriCredentialStore.secureDelete = async (k: string) => { keychain.delete(k); };

      await saveCredentials(tauriCredentialStore, {
        dropbox_client_id: 'seeded-app-key',
        dropbox_refresh_token: 'seeded-refresh-token',
      });
      window.localStorage.setItem('last_sync_time', '18 Nov 2026, 15:00');
      window.dispatchEvent(new CustomEvent('myokr-sync-status-changed'));
    });

    await openSettings(page);
    // Sidebar dot and tab strip both reflect connected state
    await expect(page.locator('.sync-status-dot')).toHaveClass(/connected/);
    const syncTab = page.locator('.settings-tabs .plan-tab', { hasText: 'Cloud sync' });
    await expect(syncTab.locator('.settings-tab-connected')).toHaveText('connected');

    await syncTab.click();
    await expect(page.locator('.settings-connected-chip')).toContainText('Connected');
    await expect(page.locator('.settings-connected-title')).toHaveText('Dropbox connected');
    await expect(page.locator('.settings-connected-meta')).toContainText('18 Nov 2026, 15:00');

    // Strictly 1 solid .btn primary CTA ("Sync now")
    await expect(page.locator('.settings-shell .btn')).toHaveCount(1);
    await expect(page.locator('.settings-shell .btn')).toContainText('Sync now');

    // Clicking Disconnect opens ConfirmModal first — canceling preserves connection
    await page.getByRole('button', { name: 'Disconnect' }).click();
    const confirmModal = page.locator('.confirm-modal');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal).toContainText('Disconnect Dropbox?');
    await confirmModal.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmModal).toHaveCount(0);
    await expect(page.locator('.settings-connected-title')).toHaveText('Dropbox connected');

    // Confirming Disconnect clears credentials and returns to Step 1
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole('button', { name: 'Disconnect' }).click();
    await expect(confirmModal).toHaveCount(0);
    await expect(page.getByLabel('Dropbox App Key')).toBeVisible();
    await expect(syncTab.locator('.settings-tab-connected')).toHaveCount(0);
    await expect(page.locator('.sync-status-dot')).toHaveClass(/disconnected/);
  });
});
