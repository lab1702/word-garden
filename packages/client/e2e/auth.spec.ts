import { test, expect } from '@playwright/test';

test('can register and login with password', async ({ page }) => {
  const username = `test_${Date.now()}`;
  await page.goto('/');
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button:has-text("Create Account")');
  await expect(page.locator(`text=${username}`)).toBeVisible();
});

test('shows error for short password', async ({ page }) => {
  await page.goto('/');
  await page.fill('[name="username"]', 'testuser');
  await page.fill('[name="password"]', 'short');
  await page.click('button:has-text("Create Account")');
  await expect(page.locator('text=Password must be between 8 and 72 characters')).toBeVisible();
});

test('can login after registering', async ({ page }) => {
  const username = `test_${Date.now()}`;
  // Register
  await page.goto('/');
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button:has-text("Create Account")');
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Logout
  await page.click('button:has-text("Sign Out")');
  await expect(page.locator('text=Word Garden')).toBeVisible();

  // Login
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button:has-text("Sign In")');
  await expect(page.locator(`text=${username}`)).toBeVisible();
});
