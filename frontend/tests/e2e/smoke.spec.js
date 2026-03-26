/**
 * Smoke tests — verify each page loads without crashing and shows key UI.
 * Safe to run in CI: no screenshots, no real backend required.
 */
import { test, expect } from '@playwright/test';
import { mockAllApis, MOCK_PRINTERS } from './helpers/api-mocks.js';

test.beforeEach(async ({ page }) => {
  await mockAllApis(page);
});

// Helper: cards scoped to the dashboard grid only (excludes sidebar)
const grid = (page) => page.locator('.printer-grid');

// ── Dashboard ──────────────────────────────────────────────────────────────

test('dashboard: renders all printer cards', async ({ page }) => {
  await page.goto('/');
  await expect(grid(page).locator('.printer-card')).toHaveCount(MOCK_PRINTERS.length);
});

test('dashboard: shows correct printer names', async ({ page }) => {
  await page.goto('/');
  for (const p of MOCK_PRINTERS) {
    await expect(grid(page).locator('.printer-name', { hasText: p.name })).toBeVisible();
  }
});

test('dashboard: idle printer shows Idle badge', async ({ page }) => {
  await page.goto('/');
  // Printer 1 (Ender 3 Pro) is standby → "Idle"
  const card = grid(page).locator('.printer-card', { hasText: 'Ender 3 Pro' });
  await expect(card.locator('.status-badge')).toHaveText('Idle');
});

test('dashboard: printing printer shows Printing badge and progress', async ({ page }) => {
  await page.goto('/');
  // Printer 2 (X1 Carbon) is printing
  const card = grid(page).locator('.printer-card', { hasText: 'X1 Carbon' });
  await expect(card.locator('.status-badge')).toHaveText('Printing');
  await expect(card).toContainText('benchy.gcode');
});

test('dashboard: offline printer shows Offline badge', async ({ page }) => {
  await page.goto('/');
  // Printer 3 (Artillery SW) is offline
  const card = grid(page).locator('.printer-card', { hasText: 'Artillery SW' });
  await expect(card.locator('.status-badge')).toHaveText('Offline');
});

test('dashboard: printing card shows Pause and Cancel buttons', async ({ page }) => {
  await page.goto('/');
  const card = grid(page).locator('.printer-card', { hasText: 'X1 Carbon' });
  await expect(card.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

// ── Files ──────────────────────────────────────────────────────────────────

test('files page: loads without error', async ({ page }) => {
  await page.goto('/files');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toContainText('Uncaught');
  await expect(page.locator('body')).not.toContainText('Cannot read');
});

// ── Spoolman ───────────────────────────────────────────────────────────────

test('spoolman page: loads without error', async ({ page }) => {
  await page.goto('/spoolman');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toContainText('Uncaught');
});

// ── Maintenance ────────────────────────────────────────────────────────────

test('maintenance page: loads without error', async ({ page }) => {
  await page.goto('/maintenance');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toContainText('Uncaught');
});

// ── Settings ───────────────────────────────────────────────────────────────

test('settings page: loads and shows main sections', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/printers/i).first()).toBeVisible();
  await expect(page.getByText(/backup/i).first()).toBeVisible();
});

// ── Navigation ─────────────────────────────────────────────────────────────

test('navbar links navigate to correct pages', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /files/i }).first().click();
  await expect(page).toHaveURL(/\/files/);
});
