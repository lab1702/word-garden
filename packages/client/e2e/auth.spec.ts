import { test, expect } from '@playwright/test';

test('can register with password', async ({ page }) => {
  const username = `test_${Date.now()}`;
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Cleanup: delete test account
  await page.click('button:has-text("Delete Account")');
});

test('shows error for short password', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'short');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
});

test('can login after registering', async ({ page }) => {
  const username = `test_${Date.now()}`;
  // Register
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create Account' }).click();
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Logout
  await page.click('button:has-text("Sign Out")');
  await expect(page.locator('text=Word Garden')).toBeVisible();

  // Login (Sign In is the default tab)
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Cleanup: delete test account
  await page.click('button:has-text("Delete Account")');
});
