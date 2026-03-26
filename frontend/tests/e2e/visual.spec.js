/**
 * Visual regression tests — screenshot comparison against committed baselines.
 *
 * HOW TO USE:
 *   First run (generate baselines):
 *     npm run test:visual:update
 *   Then commit the generated screenshots in tests/e2e/__screenshots__/
 *
 *   Subsequent runs (compare against baseline):
 *     npm run test:visual
 *
 * These are NOT run by default in CI to avoid flakiness from font/render
 * differences between environments. Run locally after UI changes and commit
 * updated baselines when the change is intentional.
 */
import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks.js';

// Disable all animations and transitions for stable screenshots
const NO_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

test.beforeEach(async ({ page }) => {
  await mockAllApis(page);
  await page.addStyleTag({ content: NO_MOTION_CSS });
});

test('visual: dashboard with 3 printer states', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Wait for all printer cards to render
  await page.locator('.printer-card').nth(2).waitFor();
  await expect(page).toHaveScreenshot('dashboard.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});

test('visual: settings page', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('settings.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.02,
  });
});

test('visual: files page (empty state)', async ({ page }) => {
  await page.goto('/files');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('files-empty.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});

test('visual: maintenance page (empty state)', async ({ page }) => {
  await page.goto('/maintenance');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('maintenance-empty.png', {
    fullPage: false,
    maxDiffPixelRatio: 0.02,
  });
});
