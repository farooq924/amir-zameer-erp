import { expect, test } from '@playwright/test';

const OWNER = process.env.E2E_OWNER ?? 'owner';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

test('owner can log in, see dashboard and log out', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_PASSWORD to the owner password');
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username or email').fill(OWNER);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Good (Morning|Afternoon|Evening)/ })).toBeVisible();
  await expect(page.getByText('Total Sales').first()).toBeVisible();
  await page.goto('/audit-logs');
  await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('wrong password shows a generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill('owner');
  await page.getByLabel('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/Invalid username or password|locked/);
});
