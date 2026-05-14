import { test, expect, type Page } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

// --- Helpers ---

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
}

async function navDesktop(page: Page, label: string) {
  await page.locator(`button.sidebar-nav-item:has-text("${label}")`).first().click();
}

async function navMobile(page: Page, label: string) {
  await page.locator('button[aria-label="Toggle navigation"]').click();
  await expect(page.locator('.sidebar-overlay')).toBeVisible();
  await page.locator(`button.sidebar-nav-item:has-text("${label}")`).first().click();
  await expect(page.locator('.sidebar-overlay')).toHaveCount(0, { timeout: 5000 });
}

// ==========================================
// DESKTOP TESTS
// ==========================================

test.describe('Desktop: OKR Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await navDesktop(page, 'OKRs');
    await expect(page.locator('text=Objectives & Key Results')).toBeVisible();
  });

  test('create objective', async ({ page }) => {
    const input = page.locator('input[placeholder*="Add a new objective"]');
    await input.fill('Test Objective E2E');
    await input.press('Enter');

    await expect(page.locator('text=Test Objective E2E')).toBeVisible();
  });

  test('create KR for objective', async ({ page }) => {
    // Wait for objectives to render, then expand first one
    await expect(page.locator('.objective-card').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.objective-header').first().click();
    await expect(page.locator('.objective-body').first()).toBeVisible();

    // Add KR
    const krInput = page.locator('input[placeholder*="Add a key result"]');
    await krInput.fill('Test KR E2E');
    await krInput.press('Enter');

    await expect(page.locator('text=Test KR E2E')).toBeVisible();
  });
});

test.describe('Desktop: Task Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await navDesktop(page, 'Tasks');
    await expect(page.locator('.task-section')).toBeVisible();
  });

  test('create task linked to KR', async ({ page }) => {
    const input = page.locator('input[placeholder*="What are you working on?"]');
    await input.fill('Test Task E2E');

    // Wait for KR dropdown to populate (async keyResults load)
    const krSelect = page.locator('select.task-kr-select');
    await expect(krSelect).toBeVisible({ timeout: 10000 });
    await krSelect.selectOption({ index: 1 });

    await page.locator('button.add-task-btn').click();
    await expect(page.locator('text=Test Task E2E')).toBeVisible();

    // Verify KR badge is shown on the task
    await expect(page.locator('.task-kr-badge').first()).toBeVisible();
  });
});

test.describe('Desktop: Pomodoro Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('adjust pomodoro config', async ({ page }) => {
    // Open settings
    await page.locator('button[title="Settings"]').click();
    await expect(page.locator('.settings-panel')).toBeVisible();

    // Change focus duration to 30 min
    const focusInput = page.locator('.settings-grid input[type="number"]').first();
    await focusInput.fill('30');

    // Timer should update to 30:00
    await expect(page.locator('.timer-digits')).toHaveText('30:00');
  });

  test('start and pause pomodoro', async ({ page }) => {
    // Verify initial state
    await expect(page.locator('.timer-digits')).toHaveText('25:00');

    // Start timer (no task selected — confirmation will appear, dismiss it)
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Start Anyway")').click();

    // Verify timer is counting down (digits change from 25:00)
    await expect(page.locator('.timer-digits')).not.toHaveText('25:00', { timeout: 3000 });

    // Pause timer
    await page.locator('button:has-text("Pause")').click();
    const pausedTime = await page.locator('.timer-digits').textContent();

    // Verify timer stays paused
    await page.waitForTimeout(1500);
    await expect(page.locator('.timer-digits')).toHaveText(pausedTime!);
  });
});

test.describe('Desktop: Review Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
    await navDesktop(page, 'Review');
    await expect(page.locator('.review-header-title')).toBeVisible();
  });

  test('complete review wizard', async ({ page }) => {
    // Start review
    await page.locator('button:has-text("Start Weekly Review")').click();
    await expect(page.locator('text=Summary')).toBeVisible();

    // Summary step -> Next
    await page.locator('button.review-nav-btn.primary').click();

    // KR steps (6 KRs in seed data)
    for (let i = 0; i < 6; i++) {
      await page.locator('button:has-text("On Track")').first().click();
      await page.locator('button.review-nav-btn.primary').click();
    }

    // Reflection step
    await expect(page.locator('text=Overall Reflection')).toBeVisible();
    await page.locator('textarea.review-notes-textarea').fill('E2E test reflection');
    await page.locator('button:has-text("Complete Review")').click();

    // Verify completion
    await expect(page.locator('text=review is complete')).toBeVisible();
  });
});

// ==========================================
// MOBILE TESTS
// ==========================================

test.describe('Mobile: Core Workflows', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('navigate and create objective', async ({ page }) => {
    await navMobile(page, 'OKRs');
    await expect(page.locator('text=Objectives & Key Results')).toBeVisible();

    const input = page.locator('input[placeholder*="Add a new objective"]');
    await input.fill('Mobile Objective');
    await input.press('Enter');
    await expect(page.locator('text=Mobile Objective')).toBeVisible();
  });

  test('navigate and create task', async ({ page }) => {
    await navMobile(page, 'Tasks');
    await expect(page.locator('.task-section')).toBeVisible();

    const input = page.locator('input[placeholder*="What are you working on?"]');
    await input.fill('Mobile Task');
    await page.locator('button.add-task-btn').click();
    await expect(page.locator('text=Mobile Task')).toBeVisible();
  });

  test('start and pause pomodoro', async ({ page }) => {
    // Timer is the default view
    await expect(page.locator('.timer-digits')).toBeVisible();

    // Start (no task selected — confirmation will appear, dismiss it)
    await page.locator('button:has-text("Start")').click();
    await expect(page.locator('.confirm-modal')).toBeVisible();
    await page.locator('.confirm-modal button:has-text("Start Anyway")').click();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();

    // Pause
    await page.locator('button:has-text("Pause")').click();
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });

  test('complete review wizard', async ({ page }) => {
    await navMobile(page, 'Review');
    await expect(page.locator('.review-header-title')).toBeVisible();

    await page.locator('button:has-text("Start Weekly Review")').click();

    // Click through summary + 6 KR steps
    for (let i = 0; i < 7; i++) {
      await page.locator('button.review-nav-btn.primary').click();
    }

    // Reflection step
    await page.locator('textarea.review-notes-textarea').fill('Mobile E2E reflection');
    await page.locator('button:has-text("Complete Review")').click();

    await expect(page.locator('text=review is complete')).toBeVisible();
  });
});
