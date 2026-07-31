# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-workflows.spec.ts >> Desktop: OKR Workflow >> create KR for objective
- Location: tests/e2e-workflows.spec.ts:82:3

# Error details

```
Error: locator.fill: Error: strict mode violation: locator('input[placeholder*="Add a key result"]') resolved to 3 elements:
    1) <input value="" type="text" placeholder="Add a key result..."/> aka getByRole('textbox', { name: 'Add a key result...' }).first()
    2) <input value="" type="text" placeholder="Add a key result..."/> aka getByRole('textbox', { name: 'Add a key result...' }).nth(1)
    3) <input value="" type="text" placeholder="Add a key result..."/> aka getByRole('textbox', { name: 'Add a key result...' }).nth(2)

Call log:
  - waiting for locator('input[placeholder*="Add a key result"]')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - img [ref=e7]
      - generic [ref=e11]: myOKR
    - navigation [ref=e12]:
      - generic [ref=e13]:
        - button "Focus" [ref=e14] [cursor=pointer]:
          - img [ref=e16]
          - generic [ref=e19]: Focus
          - img [ref=e21]
        - generic [ref=e23]:
          - button "Day plan" [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: Day plan
          - button "Session" [ref=e26] [cursor=pointer]:
            - generic [ref=e27]: Session
          - button "Habits" [ref=e28] [cursor=pointer]:
            - generic [ref=e29]: Habits
      - generic [ref=e30]:
        - button "Plan" [ref=e31] [cursor=pointer]:
          - img [ref=e33]
          - generic [ref=e37]: Plan
          - img [ref=e39]
        - generic [ref=e41]:
          - button "Tasks" [ref=e42] [cursor=pointer]:
            - generic [ref=e43]: Tasks
          - button "Objectives" [active] [ref=e44] [cursor=pointer]:
            - generic [ref=e45]: Objectives
          - button "Done" [ref=e46] [cursor=pointer]:
            - generic [ref=e47]: Done
      - button "Progress" [ref=e49] [cursor=pointer]:
        - img [ref=e51]
        - generic [ref=e52]: Progress
        - img [ref=e54]
    - generic [ref=e56]:
      - button "Settings Not connected" [ref=e57] [cursor=pointer]:
        - img [ref=e59]
        - generic [ref=e62]: Settings
        - generic "Not connected" [ref=e63]
      - button "Help & tour" [ref=e64] [cursor=pointer]:
        - img [ref=e66]
        - generic [ref=e69]: Help & tour
      - generic [ref=e70]: v0.3.0
  - main [ref=e71]:
    - generic [ref=e72]:
      - generic [ref=e73]:
        - generic [ref=e74]:
          - heading "Objectives & Key Results" [level=2] [ref=e75]:
            - img [ref=e76]
            - text: Objectives & Key Results
          - button "May 2026" [ref=e81] [cursor=pointer]:
            - img [ref=e83]
            - generic [ref=e85]: May 2026
            - img [ref=e86]
        - generic [ref=e88]:
          - generic [ref=e89]: Overall
          - generic [ref=e92]: 38%
      - generic [ref=e93]:
        - generic [ref=e94] [cursor=pointer]:
          - img [ref=e96]
          - generic "Double-click to edit" [ref=e98]:
            - img [ref=e99]
            - text: Ship myOKR v2.0
          - generic [ref=e106]: 70%
          - button "Delete objective" [ref=e108]:
            - img [ref=e109]
        - generic [ref=e112]:
          - generic [ref=e114]:
            - img [ref=e116]
            - textbox "Set a reward for achieving this objective (e.g. Treat myself to dinner, buy a gadget)..." [ref=e120]
            - button "Save" [ref=e121] [cursor=pointer]
          - generic [ref=e122]:
            - generic [ref=e123]:
              - generic [ref=e124]:
                - generic "On Track — Click to change" [ref=e126] [cursor=pointer]
                - generic "Double-click to edit" [ref=e128]: Complete 15 feature tickets
                - 'generic "Mode: Manual — Click to change" [ref=e130] [cursor=pointer]':
                  - img [ref=e131]
                  - text: Manual
                - button "Delete key result" [ref=e134] [cursor=pointer]:
                  - img [ref=e135]
              - generic [ref=e138]:
                - generic [ref=e139]: 🔗 1 task linked
                - generic [ref=e141] [cursor=pointer]:
                  - generic [ref=e142]: 9 / 15 %
                  - generic [ref=e145]: 60.0%
            - generic [ref=e146]:
              - generic [ref=e147]:
                - generic "At Risk — Click to change" [ref=e149] [cursor=pointer]
                - generic "Double-click to edit" [ref=e151]: Achieve 90% test coverage
                - 'generic "Mode: Manual — Click to change" [ref=e153] [cursor=pointer]':
                  - img [ref=e154]
                  - text: Manual
                - button "Delete key result" [ref=e157] [cursor=pointer]:
                  - img [ref=e158]
              - generic [ref=e161]:
                - generic [ref=e162]: 🔗 1 task linked
                - generic [ref=e164] [cursor=pointer]:
                  - generic [ref=e165]: 72 / 90 %
                  - generic [ref=e168]: 80.0%
          - generic [ref=e169]:
            - textbox "Add a key result..." [ref=e170]
            - combobox [ref=e171] [cursor=pointer]:
              - option "Manual" [selected]
              - option "Focus Hours"
              - option "Pomodoros"
              - option "Completed Tasks"
              - option "Habit Ticks"
            - button "+ Add KR" [ref=e172] [cursor=pointer]
      - generic [ref=e173]:
        - generic [ref=e174] [cursor=pointer]:
          - img [ref=e176]
          - generic "Double-click to edit" [ref=e178]:
            - img [ref=e179]
            - text: Improve Productivity
          - generic [ref=e185]: 0%
          - button "Delete objective" [ref=e187]:
            - img [ref=e188]
        - generic [ref=e191]:
          - generic [ref=e193]:
            - img [ref=e195]
            - textbox "Set a reward for achieving this objective (e.g. Treat myself to dinner, buy a gadget)..." [ref=e199]
            - button "Save" [ref=e200] [cursor=pointer]
          - generic [ref=e201]:
            - generic [ref=e202]:
              - generic [ref=e203]:
                - generic "On Track — Click to change" [ref=e205] [cursor=pointer]
                - generic "Double-click to edit" [ref=e207]: Complete 40 focus hours
                - 'generic "Mode: Focus Hours — Click to change" [ref=e209] [cursor=pointer]':
                  - img [ref=e210]
                  - text: Focus Hours
                - button "Delete key result" [ref=e213] [cursor=pointer]:
                  - img [ref=e214]
              - generic [ref=e217]:
                - text: ⚠️ no tasks serving this KR
                - generic [ref=e219]:
                  - generic [ref=e220]: 0 / 40 hours
                  - generic [ref=e222]: 0.0%
            - generic [ref=e223]:
              - generic [ref=e224]:
                - generic "On Track — Click to change" [ref=e226] [cursor=pointer]
                - generic "Double-click to edit" [ref=e228]: Finish 25 Pomodoro sessions
                - 'generic "Mode: Pomodoros — Click to change" [ref=e230] [cursor=pointer]':
                  - img [ref=e231]
                  - text: Pomodoros
                - button "Delete key result" [ref=e234] [cursor=pointer]:
                  - img [ref=e235]
              - generic [ref=e238]:
                - text: ⚠️ no tasks serving this KR
                - generic [ref=e240] [cursor=pointer]:
                  - generic [ref=e241]: 0 / 25 pomodoros
                  - generic [ref=e243]: 0.0%
          - generic [ref=e244]:
            - textbox "Add a key result..." [ref=e245]
            - combobox [ref=e246] [cursor=pointer]:
              - option "Manual" [selected]
              - option "Focus Hours"
              - option "Pomodoros"
              - option "Completed Tasks"
              - option "Habit Ticks"
            - button "+ Add KR" [ref=e247] [cursor=pointer]
      - generic [ref=e248]:
        - generic [ref=e249] [cursor=pointer]:
          - img [ref=e251]
          - generic "Double-click to edit" [ref=e253]:
            - img [ref=e254]
            - text: Build Engineering Culture
          - generic [ref=e261]: 43%
          - button "Delete objective" [ref=e263]:
            - img [ref=e264]
        - generic [ref=e267]:
          - generic [ref=e269]:
            - img [ref=e271]
            - textbox "Set a reward for achieving this objective (e.g. Treat myself to dinner, buy a gadget)..." [ref=e275]
            - button "Save" [ref=e276] [cursor=pointer]
          - generic [ref=e277]:
            - generic [ref=e278]:
              - generic [ref=e279]:
                - generic "On Track — Click to change" [ref=e281] [cursor=pointer]
                - generic "Double-click to edit" [ref=e283]: Complete 10 learning sessions
                - 'generic "Mode: Manual — Click to change" [ref=e285] [cursor=pointer]':
                  - img [ref=e286]
                  - text: Manual
                - button "Delete key result" [ref=e289] [cursor=pointer]:
                  - img [ref=e290]
              - generic [ref=e293]:
                - text: ⚠️ no tasks serving this KR
                - generic [ref=e295] [cursor=pointer]:
                  - generic [ref=e296]: 6 / 10 %
                  - generic [ref=e299]: 60.0%
            - generic [ref=e300]:
              - generic [ref=e301]:
                - generic "Not Set — Click to change" [ref=e303] [cursor=pointer]
                - generic "Double-click to edit" [ref=e305]: Write 4 blog posts
                - 'generic "Mode: Manual — Click to change" [ref=e307] [cursor=pointer]':
                  - img [ref=e308]
                  - text: Manual
                - button "Delete key result" [ref=e311] [cursor=pointer]:
                  - img [ref=e312]
              - generic [ref=e315]:
                - text: ⚠️ no tasks serving this KR
                - generic [ref=e317] [cursor=pointer]:
                  - generic [ref=e318]: 1 / 4 %
                  - generic [ref=e321]: 25.0%
          - generic [ref=e322]:
            - textbox "Add a key result..." [ref=e323]
            - combobox [ref=e324] [cursor=pointer]:
              - option "Manual" [selected]
              - option "Focus Hours"
              - option "Pomodoros"
              - option "Completed Tasks"
              - option "Habit Ticks"
            - button "+ Add KR" [ref=e325] [cursor=pointer]
      - generic [ref=e326]:
        - textbox "Add a new objective... (e.g. 'Ship myOKR v1.0')" [ref=e327]
        - button "+ Add Objective" [ref=e328] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | const MOBILE_VIEWPORT = { width: 375, height: 667 };
  4   | 
  5   | // --- Helpers ---
  6   | 
  7   | async function waitForApp(page: Page) {
  8   |   await page.goto('/');
  9   |   await page.waitForLoadState('networkidle');
  10  |   await expect(page.locator('text=Loading...')).toHaveCount(0, { timeout: 10000 });
  11  | }
  12  | 
  13  | function resolveLabel(label: string): string {
  14  |   if (label === 'OKRs') return 'Objectives';
  15  |   if (label === 'Timer') return 'Session';
  16  |   if (label === 'Today') return 'Day plan';
  17  |   if (label === 'Review') return 'Weekly review';
  18  |   if (label === 'Cloud Sync') return 'Sync';
  19  |   return label;
  20  | }
  21  | 
  22  | async function navDesktop(page: Page, label: string) {
  23  |   const target = resolveLabel(label);
  24  |   const btn = page.locator(`button.sidebar-nav-item:has-text("${target}"), button[title="${target}"]`).first();
  25  |   if (!await btn.isVisible()) {
  26  |     if (['Tasks', 'Objectives', 'Done'].includes(target)) {
  27  |       await page.locator('button[title="Plan"]').first().click();
  28  |     } else if (['Analytics', 'Weekly review'].includes(target)) {
  29  |       await page.locator('button[title="Progress"]').first().click();
  30  |     } else if (['Day plan', 'Session', 'Habits'].includes(target)) {
  31  |       await page.locator('button[title="Focus"]').first().click();
  32  |     }
  33  |   }
  34  |   await btn.click();
  35  | }
  36  | 
  37  | async function navMobile(page: Page, label: string) {
  38  |   const target = resolveLabel(label);
  39  |   await page.locator('button[aria-label="Toggle navigation"]').click();
  40  |   await expect(page.locator('.sidebar-overlay')).toBeVisible();
  41  |   const itemBtn = page.locator(`button.sidebar-nav-item:has-text("${target}"), button[title="${target}"]`).first();
  42  |   if (!await itemBtn.isVisible()) {
  43  |     if (['Tasks', 'Objectives', 'Done'].includes(target)) {
  44  |       await page.locator('button[title="Plan"]').first().click();
  45  |     } else if (['Analytics', 'Weekly review'].includes(target)) {
  46  |       await page.locator('button[title="Progress"]').first().click();
  47  |     } else if (['Day plan', 'Session', 'Habits'].includes(target)) {
  48  |       await page.locator('button[title="Focus"]').first().click();
  49  |     }
  50  |   }
  51  |   await itemBtn.dispatchEvent('click');
  52  |   await expect(page.locator('.sidebar-overlay')).toHaveCount(0, { timeout: 5000 });
  53  | }
  54  | 
  55  | // ==========================================
  56  | // DESKTOP TESTS
  57  | // ==========================================
  58  | 
  59  | test.describe('Desktop: OKR Workflow', () => {
  60  |   test.beforeEach(async ({ page }) => {
  61  |     await waitForApp(page);
  62  |     await navDesktop(page, 'OKRs');
  63  |     await expect(page.locator('text=Objectives & Key Results')).toBeVisible();
  64  |   });
  65  | 
  66  |   test('Help & tour button in sidebar renders a question mark icon', async ({ page }) => {
  67  |     await waitForApp(page);
  68  |     const helpBtn = page.locator('button[title="Help & tour"]');
  69  |     await expect(helpBtn).toBeVisible();
  70  |     await expect(helpBtn.locator('.sidebar-nav-icon')).toBeVisible();
  71  |     await expect(helpBtn.locator('svg')).toBeVisible();
  72  |   });
  73  | 
  74  |   test('create objective', async ({ page }) => {
  75  |     const input = page.locator('input[placeholder*="Add a new objective"]');
  76  |     await input.fill('Test Objective E2E');
  77  |     await input.press('Enter');
  78  | 
  79  |     await expect(page.locator('text=Test Objective E2E')).toBeVisible();
  80  |   });
  81  | 
  82  |   test('create KR for objective', async ({ page }) => {
  83  |     // Objectives are expanded by default
  84  |     await expect(page.locator('.objective-card').first()).toBeVisible({ timeout: 10000 });
  85  |     await expect(page.locator('.objective-body').first()).toBeVisible();
  86  | 
  87  |     // Add KR
  88  |     const krInput = page.locator('input[placeholder*="Add a key result"]');
> 89  |     await krInput.fill('Test KR E2E');
      |                   ^ Error: locator.fill: Error: strict mode violation: locator('input[placeholder*="Add a key result"]') resolved to 3 elements:
  90  |     await krInput.press('Enter');
  91  | 
  92  |     await expect(page.locator('text=Test KR E2E')).toBeVisible();
  93  |   });
  94  | });
  95  | 
  96  | test.describe('Desktop: Task Workflow', () => {
  97  |   test.beforeEach(async ({ page }) => {
  98  |     await waitForApp(page);
  99  |     await navDesktop(page, 'Tasks');
  100 |     await expect(page.locator('.tasks-view-container')).toBeVisible();
  101 |   });
  102 | 
  103 |   test('create task linked to KR', async ({ page }) => {
  104 |     const input = page.locator('input[placeholder*="What are you working on?"]');
  105 |     await input.fill('Test Task E2E');
  106 | 
  107 |     // Wait for KR dropdown to populate (async keyResults load)
  108 |     const krSelect = page.locator('select.kr-select');
  109 |     await expect(krSelect).toBeVisible({ timeout: 10000 });
  110 |     await krSelect.selectOption({ index: 1 });
  111 | 
  112 |     await page.locator('button.quick-add-btn').click();
  113 |     await expect(page.locator('text=Test Task E2E')).toBeVisible();
  114 | 
  115 |     // Verify KR badge is shown on the task
  116 |     await expect(page.locator('.card-kr').first()).toBeVisible();
  117 | 
  118 |     // Navigate away and back to verify persistence (reload from store)
  119 |     await navDesktop(page, 'OKRs');
  120 |     await expect(page.locator('text=Objectives & Key Results')).toBeVisible();
  121 |     await navDesktop(page, 'Tasks');
  122 |     await expect(page.locator('text=Test Task E2E')).toBeVisible();
  123 |     await expect(page.locator('.task-kr-badge').first()).toBeVisible();
  124 |   });
  125 | });
  126 | 
  127 | test.describe('Desktop: Pomodoro Workflow', () => {
  128 |   test.beforeEach(async ({ page }) => {
  129 |     await waitForApp(page);
  130 |     await navDesktop(page, 'Timer');
  131 |   });
  132 | 
  133 |   test('adjust pomodoro config', async ({ page }) => {
  134 |     // Open settings
  135 |     await page.locator('.timer-controls button[title="Settings"]').click();
  136 |     await expect(page.locator('.settings-panel')).toBeVisible();
  137 | 
  138 |     // Change focus duration to 30 min
  139 |     const focusInput = page.locator('.settings-grid input[type="number"]').first();
  140 |     await focusInput.fill('30');
  141 | 
  142 |     // Timer should update to 30:00
  143 |     await expect(page.locator('.timer-digits')).toHaveText('30:00');
  144 |   });
  145 | 
  146 |   test('start and pause pomodoro', async ({ page }) => {
  147 |     // Verify initial state
  148 |     await expect(page.locator('.timer-digits')).toHaveText('25:00');
  149 | 
  150 |     // Start timer (no task selected — confirmation will appear, dismiss it)
  151 |     await page.locator('button:has-text("Start")').click();
  152 |     await expect(page.locator('.confirm-modal')).toBeVisible();
  153 |     await page.locator('.confirm-modal button:has-text("Start Anyway")').click();
  154 | 
  155 |     // Verify timer is counting down (digits change from 25:00)
  156 |     await expect(page.locator('.timer-digits')).not.toHaveText('25:00', { timeout: 3000 });
  157 | 
  158 |     // Pause timer
  159 |     await page.locator('button:has-text("Pause")').click();
  160 |     const pausedTime = await page.locator('.timer-digits').textContent();
  161 | 
  162 |     // Verify timer stays paused
  163 |     await page.waitForTimeout(1500);
  164 |     await expect(page.locator('.timer-digits')).toHaveText(pausedTime!);
  165 |   });
  166 | });
  167 | 
  168 | test.describe('Desktop: Review Workflow', () => {
  169 |   test.beforeEach(async ({ page }) => {
  170 |     await waitForApp(page);
  171 |     await navDesktop(page, 'Review');
  172 |     await expect(page.locator('.review-header-title')).toBeVisible();
  173 |   });
  174 | 
  175 |   test('complete review wizard', async ({ page }) => {
  176 |     // Select the first past week option that is not in progress
  177 |     const select = page.locator('#week-select');
  178 |     await select.evaluate((el: HTMLSelectElement) => {
  179 |       const today = new Date();
  180 |       const yyyy = today.getFullYear();
  181 |       const mm = String(today.getMonth() + 1).padStart(2, '0');
  182 |       const dd = String(today.getDate()).padStart(2, '0');
  183 |       const todayStr = `${yyyy}-${mm}-${dd}`;
  184 | 
  185 |       for (let i = 0; i < el.options.length; i++) {
  186 |         const option = el.options[i];
  187 |         const monday = option.value;
  188 |         const d = new Date(monday);
  189 |         d.setUTCDate(d.getUTCDate() + 6);
```