import { expect, test } from '@playwright/test';

const OWNER = process.env.E2E_OWNER ?? 'owner';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

test('customer and measurement workflow', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_PASSWORD to the owner password');
  const suffix = String(Date.now()).slice(-7);
  const name = `E2E Customer ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(OWNER);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Create a customer
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Add customer' }).first().click();
  await page.getByLabel('Customer name').fill(name);
  await page.getByLabel('Mobile number').fill(`0300${suffix}`);
  await page.getByLabel('City').fill('Lahore');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Search finds it by mobile
  await page.goto('/customers');
  await page.getByLabel('Search customers').fill(`0300${suffix}`);
  await page.getByRole('cell', { name }).click();

  // Take first measurement
  await page.getByRole('tab', { name: /Measurements/ }).click();
  await page.getByRole('button', { name: 'Take measurement' }).click();
  await page.getByLabel('Garment').selectOption({ label: 'Shirt' });
  await page.getByLabel(/^Length/).fill('30');
  await page.getByLabel(/^Chest/).fill('40');
  await page.getByRole('button', { name: 'Save measurement' }).click();
  await expect(page.getByRole('dialog').getByText('Required').first()).toBeVisible(); // Shoulder, Sleeve, Collar are required
  await page.getByLabel(/^Shoulder/).fill('18');
  await page.getByLabel(/^Sleeve/).fill('24');
  await page.getByLabel(/^Collar/).fill('15.5');
  await page.getByRole('button', { name: 'Save measurement' }).click();
  await expect(page.getByText('Measurement saved as version 1')).toBeVisible();

  // New version, prefilled
  await page.getByRole('button', { name: 'New version' }).click();
  await expect(page.getByLabel(/^Length/)).toHaveValue('30');
  await page.getByLabel(/^Chest/).fill('41.5');
  await page.getByRole('button', { name: 'Save measurement' }).click();
  await expect(page.getByText('Measurement saved as version 2')).toBeVisible();

  // Compare
  await page.getByLabel('Select version 1 to compare').check();
  await page.getByLabel('Select version 2 to compare').check();
  await page.getByRole('button', { name: 'Compare selected' }).click();
  await expect(page.getByRole('dialog').getByText('+1.5 in')).toBeVisible();
  await page.keyboard.press('Escape');

  // Print sheet
  const [print] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Print' }).click()]);
  await expect(print.getByText('Measurement Sheet')).toBeVisible();
  await expect(print.getByRole('cell', { name: '41.5' })).toBeVisible();
});
