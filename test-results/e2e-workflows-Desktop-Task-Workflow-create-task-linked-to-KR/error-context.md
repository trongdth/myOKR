# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-workflows.spec.ts >> Desktop: Task Workflow >> create task linked to KR
- Location: tests/e2e-workflows.spec.ts:103:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.task-kr-badge').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.task-kr-badge').first()

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
          - button "Tasks" [active] [ref=e42] [cursor=pointer]:
            - generic [ref=e43]: Tasks
          - button "Objectives" [ref=e44] [cursor=pointer]:
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
    - generic [ref=e73]:
      - generic [ref=e74]:
        - generic [ref=e75]:
          - heading "Tasks" [level=2] [ref=e76]
          - generic [ref=e77]: 7 open
          - generic [ref=e78]: May 2026
        - generic [ref=e79]:
          - generic [ref=e80]:
            - button "Board" [ref=e81] [cursor=pointer]:
              - img [ref=e82]
              - generic [ref=e87]: Board
            - button "List" [ref=e88] [cursor=pointer]:
              - img [ref=e89]
              - generic [ref=e90]: List
          - button "Search ⌘K" [ref=e91] [cursor=pointer]:
            - img [ref=e92]
            - generic [ref=e95]: Search
            - generic [ref=e96]: ⌘K
      - generic [ref=e97]:
        - generic [ref=e98]: SERVING
        - generic [ref=e99]:
          - generic [ref=e100]:
            - generic [ref=e101]: Complete 15 feature tickets
            - generic [ref=e102]: 2 tasks
          - generic [ref=e103]:
            - generic [ref=e104]: Achieve 90% test coverage
            - generic [ref=e105]: 1 tasks
          - generic [ref=e106]:
            - generic [ref=e107]: Complete 40 focus hours
            - generic [ref=e108]: 0 tasks
            - generic "No active tasks currently serving this Key Result" [ref=e109]:
              - img [ref=e110]
              - generic [ref=e112]: No tasks
          - generic [ref=e113]:
            - generic [ref=e114]: Finish 25 Pomodoro sessions
            - generic [ref=e115]: 0 tasks
            - generic "No active tasks currently serving this Key Result" [ref=e116]:
              - img [ref=e117]
              - generic [ref=e119]: No tasks
          - generic [ref=e120]:
            - generic [ref=e121]: Complete 10 learning sessions
            - generic [ref=e122]: 0 tasks
            - generic "No active tasks currently serving this Key Result" [ref=e123]:
              - img [ref=e124]
              - generic [ref=e126]: No tasks
          - generic [ref=e127]:
            - generic [ref=e128]: Write 4 blog posts
            - generic [ref=e129]: 0 tasks
            - generic "No active tasks currently serving this Key Result" [ref=e130]:
              - img [ref=e131]
              - generic [ref=e133]: No tasks
      - generic [ref=e134]:
        - textbox "What are you working on? Type task title..." [ref=e135]
        - combobox [ref=e136]:
          - option "Do" [selected]
          - option "Decide"
          - option "Delegate"
          - option "Delete"
        - combobox [ref=e137]:
          - option "Today" [selected]
          - option "This Week"
          - option "Backlog"
        - combobox [ref=e138]:
          - option "No Key Result" [selected]
          - option "Complete 15 feature tickets"
          - option "Achieve 90% test coverage"
          - option "Complete 40 focus hours"
          - option "Finish 25 Pomodoro sessions"
          - option "Complete 10 learning sessions"
          - option "Write 4 blog posts"
        - button "Add" [ref=e139] [cursor=pointer]:
          - img [ref=e140]
          - generic [ref=e141]: Add
      - generic [ref=e142]:
        - generic [ref=e143]:
          - generic [ref=e145]:
            - generic [ref=e147]: Today
            - generic [ref=e148]: "1"
          - generic [ref=e150] [cursor=pointer]:
            - generic [ref=e151]:
              - generic [ref=e152]: Do
              - button "Start focus session" [ref=e154]:
                - img [ref=e155]
            - heading "Test Task E2E" [level=4] [ref=e157]
            - generic [ref=e158]: 🎯 Complete 15 feature tickets
            - generic [ref=e159]:
              - generic [ref=e160]: 🍅 0/1
              - button "Move to bucket" [ref=e162]:
                - img [ref=e163]
        - generic [ref=e167]:
          - generic [ref=e169]: This week
          - generic [ref=e170]: "0"
        - generic [ref=e171]:
          - generic [ref=e173]:
            - generic [ref=e175]: Backlog
            - generic [ref=e176]: "6"
          - generic [ref=e177]:
            - generic [ref=e178] [cursor=pointer]:
              - generic [ref=e179]:
                - generic [ref=e180]: Do
                - button "Start focus session" [ref=e182]:
                  - img [ref=e183]
              - heading "Refactor auth module" [level=4] [ref=e185]
              - generic [ref=e186]: 🎯 Achieve 90% test coverage
              - generic [ref=e187]:
                - generic [ref=e188]: 🍅 4/6
                - button "Move to bucket" [ref=e190]:
                  - img [ref=e191]
            - generic [ref=e193] [cursor=pointer]:
              - generic [ref=e194]:
                - generic [ref=e195]: Do
                - button "Start focus session" [ref=e197]:
                  - img [ref=e198]
              - heading "Design new dashboard layout" [level=4] [ref=e200]
              - generic [ref=e201]: 🎯 Complete 15 feature tickets
              - generic [ref=e202]:
                - generic [ref=e203]: 🍅 3/5
                - button "Move to bucket" [ref=e205]:
                  - img [ref=e206]
            - generic [ref=e208] [cursor=pointer]:
              - generic [ref=e209]:
                - generic [ref=e210]: Decide
                - button "Start focus session" [ref=e212]:
                  - img [ref=e213]
              - heading "Write API documentation" [level=4] [ref=e215]
              - generic [ref=e216]:
                - generic [ref=e217]: 🍅 2/4
                - button "Move to bucket" [ref=e219]:
                  - img [ref=e220]
            - generic [ref=e222] [cursor=pointer]:
              - generic [ref=e223]:
                - generic [ref=e224]: Decide
                - button "Start focus session" [ref=e226]:
                  - img [ref=e227]
              - heading "Plan sprint retrospective" [level=4] [ref=e229]
              - generic [ref=e230]:
                - generic [ref=e231]: 🍅 0/2
                - button "Move to bucket" [ref=e233]:
                  - img [ref=e234]
            - generic [ref=e236] [cursor=pointer]:
              - generic [ref=e237]:
                - generic [ref=e238]: Delegate
                - button "Start focus session" [ref=e240]:
                  - img [ref=e241]
              - heading "Update README screenshots" [level=4] [ref=e243]
              - generic [ref=e244]:
                - generic [ref=e245]: 🍅 0/2
                - button "Move to bucket" [ref=e247]:
                  - img [ref=e248]
            - generic [ref=e250] [cursor=pointer]:
              - generic [ref=e251]:
                - generic [ref=e252]: Delete
                - button "Start focus session" [ref=e254]:
                  - img [ref=e255]
              - heading "Clean up unused dependencies" [level=4] [ref=e257]
              - generic [ref=e258]:
                - generic [ref=e259]: 🍅 0/1
                - button "Move to bucket" [ref=e261]:
                  - img [ref=e262]
```

# Test source

```ts
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
  89  |     await krInput.fill('Test KR E2E');
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
> 123 |     await expect(page.locator('.task-kr-badge').first()).toBeVisible();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
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
  190 |         const sundayStr = d.toISOString().slice(0, 10);
  191 |         if (sundayStr <= todayStr) {
  192 |           el.selectedIndex = i;
  193 |           el.dispatchEvent(new Event('change'));
  194 |           break;
  195 |         }
  196 |       }
  197 |     });
  198 | 
  199 |     // Start review
  200 |     await page.locator('button:has-text("Start Weekly Review")').click();
  201 |     await expect(page.locator('text=Summary')).toBeVisible();
  202 | 
  203 |     // Summary step -> Next
  204 |     await page.locator('button.review-nav-btn.primary').click();
  205 | 
  206 |     // KR steps (6 KRs in seed data)
  207 |     for (let i = 0; i < 6; i++) {
  208 |       await page.locator('button:has-text("On Track")').first().click();
  209 |       await page.locator('button.review-nav-btn.primary').click();
  210 |     }
  211 | 
  212 |     // Reflection step
  213 |     await expect(page.locator('text=Overall Reflection')).toBeVisible();
  214 |     await page.locator('textarea.review-notes-textarea').fill('E2E test reflection');
  215 |     await page.locator('button:has-text("Complete Review")').click();
  216 | 
  217 |     // Verify completion
  218 |     await expect(page.locator('text=review is complete')).toBeVisible();
  219 |   });
  220 | });
  221 | 
  222 | // ==========================================
  223 | // MOBILE TESTS
```