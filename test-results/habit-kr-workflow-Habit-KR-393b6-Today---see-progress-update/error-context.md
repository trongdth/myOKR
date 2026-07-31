# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: habit-kr-workflow.spec.ts >> Habit KR Linking & Progress Workflow >> completes full workflow: create habit -> link KR -> tick Today -> see progress update
- Location: tests/habit-kr-workflow.spec.ts:27:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.kr-row:has-text("E2E Ticking KR")').locator('.kr-progress-text')
Expected substring: "1 / 10 ticks"
Received string:    "0 / 10 ticks"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('.kr-row:has-text("E2E Ticking KR")').locator('.kr-progress-text')
    9 × locator resolved to <span class="kr-progress-text">0 / 10 ticks</span>
      - unexpected value "0 / 10 ticks"

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
          - button "July 2026" [ref=e81] [cursor=pointer]:
            - img [ref=e83]
            - generic [ref=e85]: July 2026
            - img [ref=e86]
        - generic [ref=e88]:
          - generic [ref=e89]: Overall
          - generic [ref=e91]: 0%
      - generic [ref=e92]:
        - generic [ref=e93] [cursor=pointer]:
          - img [ref=e95]
          - generic "Double-click to edit" [ref=e97]:
            - img [ref=e98]
            - text: Habit E2E Objective
          - generic [ref=e104]: 0%
          - button "Delete objective" [ref=e106]:
            - img [ref=e107]
        - generic [ref=e110]:
          - generic [ref=e112]:
            - img [ref=e114]
            - textbox "Set a reward for achieving this objective (e.g. Treat myself to dinner, buy a gadget)..." [ref=e118]
            - button "Save" [ref=e119] [cursor=pointer]
          - generic [ref=e121]:
            - generic [ref=e122]:
              - generic "Not Set — Click to change" [ref=e124] [cursor=pointer]
              - generic "Double-click to edit" [ref=e126]: E2E Ticking KR
              - 'generic "Mode: Habit Ticks — Click to change" [ref=e128] [cursor=pointer]':
                - img [ref=e129]
                - text: Habit Ticks
              - button "Delete key result" [ref=e132] [cursor=pointer]:
                - img [ref=e133]
            - generic [ref=e136]:
              - generic [ref=e137]: "Linked Habit:"
              - combobox [ref=e138]:
                - option "-- Select a habit --"
                - option "Forming E2E Habit" [selected]
                - option "+ Create new habit..."
            - generic [ref=e139]:
              - text: ⚠️ no tasks serving this KR
              - generic [ref=e141] [cursor=pointer]:
                - generic [ref=e142]: 0 / 10 ticks
                - generic [ref=e144]: 0.0%
          - generic [ref=e145]:
            - textbox "Add a key result..." [ref=e146]
            - combobox [ref=e147] [cursor=pointer]:
              - option "Manual" [selected]
              - option "Focus Hours"
              - option "Pomodoros"
              - option "Completed Tasks"
              - option "Habit Ticks"
            - button "+ Add KR" [ref=e148] [cursor=pointer]
      - generic [ref=e149]:
        - textbox "Add a new objective... (e.g. 'Ship myOKR v1.0')" [ref=e150]
        - button "+ Add Objective" [ref=e151] [cursor=pointer]
```

# Test source

```ts
  6   |     if (['Tasks', 'Objectives', 'Done'].includes(title)) {
  7   |       await page.locator('button[title="Plan"]').first().click();
  8   |     } else if (['Analytics', 'Weekly review'].includes(title)) {
  9   |       await page.locator('button[title="Progress"]').first().click();
  10  |     } else if (['Day plan', 'Session', 'Habits'].includes(title)) {
  11  |       await page.locator('button[title="Focus"]').first().click();
  12  |     }
  13  |   }
  14  |   await btn.click();
  15  | }
  16  | 
  17  | test.describe('Habit KR Linking & Progress Workflow', () => {
  18  |   test.beforeEach(async ({ page }) => {
  19  |     // Set localStorage to bypass walkthrough and open directly
  20  |     await page.addInitScript(() => {
  21  |       window.localStorage.setItem('myokr_walkthrough_state', '"seen"');
  22  |     });
  23  |     await page.goto('/');
  24  |     await page.waitForLoadState('networkidle');
  25  |   });
  26  | 
  27  |   test('completes full workflow: create habit -> link KR -> tick Today -> see progress update', async ({ page }) => {
  28  |     // Seed July 2026 cycle (current month of test) to ensure ticks align with active cycle month
  29  |     await page.evaluate(async () => {
  30  |       const updateDoc = (window as any).__updateAutomergeDoc;
  31  |       if (!updateDoc) throw new Error('Automerge test hooks not exposed');
  32  |       await updateDoc('Seed July 2026 cycle', (d: any) => {
  33  |         const julyCycle = {
  34  |           id: 'cycle-july-2026',
  35  |           name: 'July 2026',
  36  |           month: 6, // 0-indexed July
  37  |           year: 2026,
  38  |           isActive: true,
  39  |           createdAt: new Date().toISOString()
  40  |         };
  41  |         if (d.cycles) {
  42  |           d.cycles.forEach((c: any) => c.isActive = false);
  43  |           d.cycles.push(julyCycle);
  44  |         } else {
  45  |           d.cycles = [julyCycle];
  46  |         }
  47  |       });
  48  |       window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  49  |     });
  50  | 
  51  |     // 1. Go to Habits tab and create a habit
  52  |     await navTo(page, 'Habits');
  53  |     await expect(page.locator('.habits-title')).toHaveText('Habits');
  54  | 
  55  |     const habitInput = page.locator('.add-habit-input');
  56  |     await habitInput.fill('Forming E2E Habit');
  57  |     await page.locator('button:has-text("Add Habit")').click();
  58  |     await expect(page.locator('.habit-name')).toHaveText('Forming E2E Habit');
  59  | 
  60  |     // 2. Go to OKRs tab and create objective + KR
  61  |     await navTo(page, 'Objectives');
  62  |     await expect(page.locator('.okr-header-title')).toBeVisible();
  63  | 
  64  |     const objInput = page.locator('.okr-add-objective >> input');
  65  |     await objInput.fill('Habit E2E Objective');
  66  |     await page.locator('button:has-text("+ Add Objective")').click();
  67  | 
  68  |     // Find the objective card (expanded by default)
  69  |     const objHeader = page.locator('.objective-header:has-text("Habit E2E Objective")');
  70  |     await expect(objHeader).toBeVisible();
  71  | 
  72  |     // Create a Habit KR
  73  |     const krInput = page.locator('.kr-add-row >> input');
  74  |     await krInput.fill('E2E Ticking KR');
  75  |     const krModeSelect = page.locator('.kr-mode-select');
  76  |     await krModeSelect.selectOption({ label: 'Habit Ticks' });
  77  |     await page.locator('button:has-text("+ Add KR")').click();
  78  | 
  79  |     // Select the linked habit in the newly created KR
  80  |     const linkSelect = page.locator('.kr-habit-link-row >> select');
  81  |     await expect(linkSelect).toBeVisible();
  82  |     await linkSelect.selectOption({ label: 'Forming E2E Habit' });
  83  | 
  84  |     // 3. Go to Today tab, check off the habit today
  85  |     await navTo(page, 'Day plan');
  86  |     await expect(page.locator('h1:has-text("Today\'s Focus")')).toBeVisible();
  87  | 
  88  |     // Toggle today's habit tick
  89  |     const todayHabitBtn = page.locator('button:has-text("Forming E2E Habit")');
  90  |     await expect(todayHabitBtn).toBeVisible();
  91  |     await todayHabitBtn.click();
  92  |     
  93  |     // Check it displays ticked (contains visual indicator)
  94  |     await expect(todayHabitBtn.locator('.lucide-check')).toBeVisible();
  95  | 
  96  |     // 4. Go back to OKRs and check progress
  97  |     await navTo(page, 'Objectives');
  98  |     
  99  |     const objHeader2 = page.locator('.objective-header:has-text("Habit E2E Objective")');
  100 |     await expect(objHeader2).toBeVisible();
  101 | 
  102 |     const krRow = page.locator('.kr-row:has-text("E2E Ticking KR")');
  103 |     await expect(krRow).toBeVisible();
  104 |     
  105 |     // Progress should be 1/10 (10%) since target defaults to 10 for habits
> 106 |     await expect(krRow.locator('.kr-progress-text')).toContainText('1 / 10 ticks');
      |                                                      ^ Error: expect(locator).toContainText(expected) failed
  107 |     await expect(krRow.locator('.kr-progress-percent')).toContainText('10.0%');
  108 | 
  109 |     // 5. Clean up habit (which also tests KR unlink fallback to manual mode)
  110 |     await navTo(page, 'Habits');
  111 |     await page.locator('.habit-delete-btn').click();
  112 |     
  113 |     // Expect ConfirmModal warning about linked KR
  114 |     await expect(page.locator('.prioritize-title')).toContainText('Delete Linked Habit?');
  115 |     await page.locator('.prioritize-actions >> button:has-text("Confirm")').click();
  116 |     await expect(page.locator('.habit-name')).toHaveCount(0);
  117 | 
  118 |     // Verify KR fell back to manual completion mode with preserved progress value
  119 |     await navTo(page, 'Objectives');
  120 | 
  121 |     const objHeader3 = page.locator('.objective-header:has-text("Habit E2E Objective")');
  122 |     await expect(objHeader3).toBeVisible();
  123 |     await objHeader3.click();
  124 | 
  125 |     const krRowAfter = page.locator('.kr-row:has-text("E2E Ticking KR")');
  126 |     await expect(krRowAfter).toBeVisible();
  127 |     await expect(krRowAfter.locator('.kr-mode-badge-label')).toContainText('Manual');
  128 |     await expect(krRowAfter.locator('.kr-progress-text')).toContainText('1 / 10 %'); // Unit reverted to % for manual
  129 |   });
  130 | 
  131 |   test('navigates to Habits tab when selecting Create New Habit in KR dropdown', async ({ page }) => {
  132 |     // Seed active cycle
  133 |     await page.evaluate(async () => {
  134 |       const updateDoc = (window as any).__updateAutomergeDoc;
  135 |       if (!updateDoc) throw new Error('Automerge test hooks not exposed');
  136 |       await updateDoc('Seed July 2026 cycle', (d: any) => {
  137 |         const julyCycle = {
  138 |           id: 'cycle-july-2026',
  139 |           name: 'July 2026',
  140 |           month: 6, // 0-indexed July
  141 |           year: 2026,
  142 |           isActive: true,
  143 |           createdAt: new Date().toISOString()
  144 |         };
  145 |         if (d.cycles) {
  146 |           d.cycles.forEach((c: any) => c.isActive = false);
  147 |           d.cycles.push(julyCycle);
  148 |         } else {
  149 |           d.cycles = [julyCycle];
  150 |         }
  151 |       });
  152 |       window.dispatchEvent(new CustomEvent('myokr-data-synced'));
  153 |     });
  154 | 
  155 |     // Go to OKRs tab and create objective + KR
  156 |     await navTo(page, 'Objectives');
  157 |     await expect(page.locator('.okr-header-title')).toBeVisible();
  158 | 
  159 |     const objInput = page.locator('.okr-add-objective >> input');
  160 |     await objInput.fill('Habit Link Navigation Objective');
  161 |     await page.locator('button:has-text("+ Add Objective")').click();
  162 | 
  163 |     const objHeader = page.locator('.objective-header:has-text("Habit Link Navigation Objective")');
  164 |     await expect(objHeader).toBeVisible();
  165 | 
  166 |     // Create a Habit KR
  167 |     const krInput = page.locator('.kr-add-row >> input');
  168 |     await krInput.fill('Navigation KR');
  169 |     const krModeSelect = page.locator('.kr-mode-select');
  170 |     await krModeSelect.selectOption({ label: 'Habit Ticks' });
  171 |     await page.locator('button:has-text("+ Add KR")').click();
  172 | 
  173 |     // Select the "+ Create new habit..." option in the newly created KR
  174 |     const linkSelect = page.locator('.kr-habit-link-row >> select');
  175 |     await expect(linkSelect).toBeVisible();
  176 |     await linkSelect.selectOption('__new__');
  177 | 
  178 |     // Verify it redirects to Habits tab and shows title
  179 |     await expect(page.locator('.habits-title')).toBeVisible();
  180 |     await expect(page.locator('.habits-title')).toHaveText('Habits');
  181 |   });
  182 | });
  183 | 
```