import { expect, test } from '@playwright/test';

const OWNER = process.env.E2E_OWNER ?? 'owner';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

test('employees: add with salary, mark attendance, give advance, change salary', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_PASSWORD to the owner password');
  const suffix = String(Date.now()).slice(-6);
  const name = `Tailor Test ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(OWNER);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Good (Morning|Afternoon|Evening)/ })).toBeVisible();

  // Add employee (two steps: details, then salary)
  await page.goto('/employees');
  await page.getByRole('button', { name: 'Add employee' }).first().click();
  await page.getByRole('button', { name: 'Next: Salary' }).click();
  await expect(page.getByText('Enter the employee name')).toBeVisible();
  await page.locator('#e-name').fill(name);
  await page.locator('#e-phone').fill(`0302${suffix}1`);
  await page.getByRole('button', { name: 'Next: Salary' }).click();
  await page.getByRole('radio', { name: /^Monthly salary/ }).click();
  await page.getByRole('button', { name: 'Add employee' }).last().click();
  await expect(page.getByText('Enter the monthly salary')).toBeVisible();
  await page.locator('#sal-m').fill('30000');
  await page.getByRole('button', { name: 'Add employee' }).last().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('Rs 30,000 / month').first()).toBeVisible();

  // Advance
  await page.getByRole('button', { name: 'Give advance' }).click();
  await page.locator('#ad-amount').fill('3000');
  await page.locator('#ad-inst').fill('1000');
  await page.getByRole('button', { name: 'Save advance' }).click();
  await expect(page.getByText('Advance of Rs 3,000 saved')).toBeVisible();
  await page.getByRole('tab', { name: 'Advances' }).click();
  await expect(page.getByRole('tabpanel').getByText('Rs 3,000').first()).toBeVisible();

  // Attendance for today
  await page.goto('/attendance');
  const group = page.getByRole('radiogroup', { name: `Attendance for ${name}` });
  await group.getByRole('radio', { name: /Present|^P$/ }).click();
  await page.getByRole('button', { name: 'Save attendance' }).click();
  await expect(page.getByText(/Attendance saved for/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: `Attendance for ${name}` }).getByRole('radio', { checked: true })).toBeVisible();

  // Pages load
  await page.goto('/production');
  await expect(page.getByRole('heading', { name: 'Production' })).toBeVisible();
  await page.goto('/payroll');
  await expect(page.getByRole('heading', { name: 'Payroll' })).toBeVisible();
});
