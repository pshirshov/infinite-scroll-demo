import { test, expect } from "@playwright/test";

test("page boots and renders at least one real message", async ({ page }) => {
  await page.goto("/");
  // The live tail anchors after MockBackend's getLatest(200) resolves
  // (~100-300ms). Wait for at least one real message body to appear.
  const firstBody = page.locator(".chat-message__body").first();
  await expect(firstBody).toBeVisible({ timeout: 10_000 });
  await expect(firstBody).not.toBeEmpty();
});
