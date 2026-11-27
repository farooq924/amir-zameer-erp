import { expect, test } from '@playwright/test';

const OWNER = process.env.E2E_OWNER ?? 'owner';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const SHOTS = process.env.E2E_SCREENSHOTS; // optional folder for screenshots

test('order workflow: book, status, payment, part delivery, receipt', async ({ page }) => {
  test.skip(!PASSWORD, 'Set E2E_PASSWORD to the owner password');
  const shot = async (name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
  const suffix = String(Date.now()).slice(-7);
  const name = `Order Test ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Username or email').fill(OWNER);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Good (Morning|Afternoon|Evening)/ })).toBeVisible();

  // Customer + shalwar kameez measurement
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Add customer' }).first().click();
  await page.getByLabel('Customer name').fill(name);
  await page.getByLabel('Mobile number').fill(`0301${suffix}`);
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('tab', { name: /Measurements/ }).click();
  await page.getByRole('button', { name: 'Take measurement' }).click();
  await page.getByLabel('Garment').selectOption({ label: 'Shalwar Kameez' });
  for (const [label, v] of [[/^Length/, '42'], [/^Shoulder/, '18'], [/^Chest/, '40'], [/^Sleeve Length/, '24'], [/^Shalwar Length/, '39']] as const) {
    await page.getByRole('dialog').getByLabel(label).first().fill(v);
  }
  await page.getByRole('button', { name: 'Save measurement' }).click();
  await expect(page.getByText('V1').first()).toBeVisible();

  // Book an order from the customer profile
  await page.getByRole('button', { name: 'New order' }).first().click();
  await expect(page.getByRole('heading', { name: 'New order' })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByText(name)).toBeVisible();
  await shot('desk-orders-02-new-info');
  await page.getByRole('tab', { name: 'Garments' }).click();
  await page.getByRole('combobox', { name: 'Garment', exact: true }).selectOption({ label: 'Shalwar Kameez' });
  await page.getByLabel('Stitching price (each)').fill('2500');
  await page.getByRole('button', { name: 'More' }).first().click(); // quantity 2
  await page.getByRole('button', { name: 'Add garment' }).click();
  await page.getByRole('combobox', { name: 'Garment', exact: true }).nth(1).selectOption({ label: 'Waistcoat' });
  await page.getByLabel('Stitching price (each)').nth(1).fill('3000');
  await shot('desk-orders-03-new-garments');
  await page.getByRole('tab', { name: 'Measurements' }).click();
  await expect(page.getByText(/No Waistcoat measurement yet/)).toBeVisible();
  await shot('desk-orders-04-new-measurements');
  await page.getByRole('tab', { name: 'Payment' }).click();
  await page.getByLabel('Advance received').fill('3000');
  await expect(page.getByText('Rs 8,000').first()).toBeVisible();
  await shot('desk-orders-05-new-payment');
  await page.getByRole('button', { name: 'Save Order' }).click();
  await expect(page.getByRole('heading', { name: 'Order Created' })).toBeVisible();
  await shot('desk-orders-06-created');
  await page.getByRole('button', { name: 'View Order' }).click();

  // Order details
  await expect(page.getByText('Production progress')).toBeVisible();
  await expect(page.getByText('Chest').first()).toBeVisible(); // measurement snapshot
  await shot('desk-orders-07-detail');
  await page.getByRole('button', { name: 'Update status' }).click();
  await page.getByRole('radio', { name: 'Cutting' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status updated')).toBeVisible();

  // Part delivery: 1 shalwar kameez
  await page.getByRole('button', { name: 'Deliver' }).click();
  await page.getByLabel(/Pieces of Shalwar Kameez/).selectOption('1');
  await page.getByLabel(/Pieces of Waistcoat/).selectOption('0');
  await page.getByLabel(/Collect payment now/).uncheck();
  await shot('desk-orders-08-deliver');
  await page.getByRole('button', { name: 'Save part delivery' }).click();
  await expect(page.getByText('Part delivered').first()).toBeVisible();

  // Payment
  await page.getByRole('button', { name: 'Payment' }).click();
  await page.getByLabel('Amount (Rs)').fill('2000');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Payment received')).toBeVisible();
  await page.getByRole('tab', { name: /Payments/ }).click();
  await expect(page.getByRole('cell', { name: 'Rs 2,000' })).toBeVisible();

  // Orders list finds it
  await page.goto('/orders');
  await page.getByLabel('Search orders').fill(`0301${suffix}`);
  await expect(page.getByRole('cell', { name })).toBeVisible();
  await shot('desk-orders-01-list');
});
