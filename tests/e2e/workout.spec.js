import { test, expect } from '@playwright/test';

// Full workout flow: complete a heavy-a session and verify session details.
// On a fresh IndexedDB, getNextDay() returns 'heavy-a' so the app boots there.

// renderDay() replaces the entire page container's innerHTML on each step,
// which detaches DOM nodes and breaks Playwright's actionability checks.
// Strategy: fire clicks via page.evaluate() (no stability checks), then
// waitForFunction to confirm the re-render has settled.
const tap = (page, sel) => page.evaluate(
  s => document.querySelector(s)?.click(), s => s,
  sel
);

test('complete a workout and verify session details', async ({ page }) => {
  await page.goto('/');

  // The boot sequence (initDB → renderAllDays → navigateToNextDay) is async.
  // Wait until the active page has a Next/Finish button before interacting.
  await page.waitForFunction(
    () => !!document.querySelector('.page.active .btn-save')
  );

  // ── Skip warmup ─────────────────────────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.page.active .btn-save')?.click());
  // Wait for initWidgets to run (pills appear after renderDay + initWidgets)
  await page.waitForFunction(
    () => !!document.querySelector('.page.active .set-pill')
  );

  // ── Step through all exercises ───────────────────────────────────────────────
  // Tap the first pill (stages a set with real weight) then advance.
  // Loop exits when the done screen appears.
  for (let i = 0; i < 20; i++) {
    const done = await page.evaluate(
      () => !!document.querySelector('.page.active .day-done')
    );
    if (done) break;

    // Tap first pill to log one set (reps → non-null, weight already set)
    await page.evaluate(() => document.querySelector('.page.active .set-pill')?.click());
    // Advance (saveAndAdvance stages the set, then renderDay runs)
    await page.evaluate(() => document.querySelector('.page.active .btn-save')?.click());

    // Wait for pills (next exercise ready) or done screen
    await page.waitForFunction(
      () => !!document.querySelector('.page.active .day-done, .page.active .set-pill')
    );
  }

  // ── Done screen ──────────────────────────────────────────────────────────────
  const active = page.locator('.page.active');
  await expect(active.locator('.done-big')).toBeVisible();
  await expect(active.locator('.done-volume')).toContainText('lbs lifted');
  await expect(active.locator('.done-animal')).toBeVisible();
  await expect(active.locator('.done-animal strong')).not.toBeEmpty();

  // ── Open session detail ──────────────────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.details-btn-done')?.click());
  const sheet = page.locator('.detail-sheet');
  await expect(sheet).toBeVisible();

  // Volume section — today's total and animal comparison
  await expect(sheet.locator('.detail-vol-today')).toContainText('lbs');
  await expect(sheet.locator('.detail-vol-animal')).toBeVisible();

  // At least one exercise block rendered with set rows
  await expect(sheet.locator('.detail-ex-name').first()).toBeVisible();
  await expect(sheet.locator('.detail-set-row').first()).toBeVisible();

  // Set row columns
  const firstRow = sheet.locator('.detail-set-row').first();
  await expect(firstRow.locator('.detail-set-num')).toContainText('Set');
  await expect(firstRow.locator('.detail-set-wt')).toContainText('lbs');
  await expect(firstRow.locator('.detail-set-reps')).toContainText('reps');

  // ── Close the sheet ──────────────────────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.detail-close-btn')?.click());
  await expect(sheet).not.toBeVisible();
});
