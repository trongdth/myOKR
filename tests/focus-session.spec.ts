import { test, expect, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2026-05-24T12:00:00.000Z');

async function waitForApp(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function openSession(page: Page) {
  await page.locator('button[title="Session"]').first().click();
  await page.waitForTimeout(300);
}

// TaskList quick-add (mirrors session-widget.spec.ts).
async function addTask(page: Page, name: string) {
  await page.locator('input[placeholder*="What are you working on?"]').fill(name);
  await page.locator('button.add-task-btn').click();
  await expect(page.locator(`.task-item:has-text("${name}")`)).toBeVisible();
}

test.describe('Focus shell — Session tab (ticket 02)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await openSession(page);
  });

  test('timer renders inside the Focus shell with Session tab active', async ({ page }) => {
    await expect(page.locator('.focus-shell .timer-section')).toBeVisible();
    await expect(page.locator('.plan-tab-strip.focus-tabs .plan-tab.active')).toHaveText(/Session/);
  });

  test('live marker is absent while idle, appears when a session runs', async ({ page }) => {
    await expect(page.locator('.focus-tab-live')).toHaveCount(0);

    await addTask(page, 'Live Task');
    await page.locator('.task-item:has-text("Live Task")').click();
    await page.locator('.timer-section button:has-text("Start")').click();

    await expect(page.locator('.focus-tab-live')).toBeVisible();
    await expect(page.locator('.focus-tab-live')).toContainText('live');
  });

  test('Start focus from Day plan opens the Session tab in the Focus shell, task staged', async ({ page }) => {
    await page.locator('button:has-text("Day plan")').first().click();
    await page.waitForTimeout(300);
    await page.locator('.focus-card .btn:has-text("Start focus")').first().click();

    await expect(page.locator('.focus-shell .timer-section')).toBeVisible();
    await expect(page.locator('text=Working on:')).toBeVisible();
  });
});
