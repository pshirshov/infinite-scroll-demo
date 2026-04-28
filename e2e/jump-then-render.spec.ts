import { test, expect } from "@playwright/test";

test("after dragging scrollbar from bottom to middle, visible messages have non-empty bodies", async ({ page }) => {
  await page.goto("/");

  // Wait for initial live-tail anchor: ≥ 5 visible messages with non-empty bodies.
  await expect
    .poll(async () => await page.locator(".chat-message__body:not(:empty)").count(), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(5);

  const thumb = page.locator(".custom-scrollbar__thumb");
  await expect(thumb).toBeVisible();
  const thumbBox = await thumb.boundingBox();
  if (thumbBox === null) throw new Error("thumb has no bounding box");

  const track = page.locator(".custom-scrollbar");
  const trackBox = await track.boundingBox();
  if (trackBox === null) throw new Error("track has no bounding box");

  // Drag thumb to ~50% of the track.
  const startX = thumbBox.x + thumbBox.width / 2;
  const startY = thumbBox.y + thumbBox.height / 2;
  const targetY = trackBox.y + trackBox.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Multi-step drag — closer to a real user motion than one big jump.
  await page.mouse.move(startX, targetY, { steps: 20 });
  await page.mouse.up();

  // Wait for skeleton rows to disappear (data fetched + rendered).
  await expect
    .poll(async () => await page.locator(".chat-skeleton").count(), {
      timeout: 10_000,
    })
    .toBe(0);

  const visibleBodies = page.locator(".chat-message__body");
  const count = await visibleBodies.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const text = (await visibleBodies.nth(i).textContent()) ?? "";
    expect(text.trim().length, `message body ${i} should be non-empty`).toBeGreaterThan(0);
  }
});
