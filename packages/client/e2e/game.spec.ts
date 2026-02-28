import { test, expect } from '@playwright/test';

test('can create a game with invite code', async ({ page }) => {
  const username = `test_${Date.now()}`;

  // Register
  await page.goto('/');
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', 'testpassword123');
  await page.click('button:has-text("Create Account")');
  await expect(page.locator(`text=${username}`)).toBeVisible();

  // Create game
  await page.click('button:has-text("Create Game")');
  await expect(page.locator('strong:has-text("GARDEN-")')).toBeVisible();
});

test('two players can join a game via invite code', async ({ browser }) => {
  const ts = Date.now();
  const player1 = `p1_${ts}`;
  const player2 = `p2_${ts}`;

  // Player 1 registers and creates game
  const page1 = await browser.newPage();
  await page1.goto('/');
  await page1.fill('[name="username"]', player1);
  await page1.fill('[name="password"]', 'testpassword123');
  await page1.click('button:has-text("Create Account")');
  await expect(page1.locator(`text=${player1}`)).toBeVisible();

  await page1.click('button:has-text("Create Game")');
  const inviteElement = page1.locator('strong:has-text("GARDEN-")');
  await expect(inviteElement).toBeVisible();

  // Extract invite code
  const inviteCode = await inviteElement.textContent();
  expect(inviteCode).toBeTruthy();

  // Player 2 registers and joins
  const page2 = await browser.newPage();
  await page2.goto('/');
  await page2.fill('[name="username"]', player2);
  await page2.fill('[name="password"]', 'testpassword123');
  await page2.click('button:has-text("Create Account")');
  await expect(page2.locator(`text=${player2}`)).toBeVisible();

  await page2.fill('[placeholder="Enter invite code"]', inviteCode!);
  await page2.click('button:has-text("Join")');

  // Player 2 should see the game board
  await expect(page2.locator(`text=${player1}`)).toBeVisible({ timeout: 5000 });

  await page1.close();
  await page2.close();
});
