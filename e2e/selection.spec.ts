import { test, expect } from "@playwright/test";

test.describe("text selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the live-tail anchor to land and ≥ 5 messages with non-empty bodies.
    await expect.poll(
      async () =>
        await page.locator(".chat-message__body:not(:empty)").count(),
      { timeout: 10_000 },
    ).toBeGreaterThanOrEqual(5);
  });

  test("programmatic Range over one message returns only that message's body", async ({ page }) => {
    // Pick a message in the middle of the visible window so it has neighbours
    // both above and below.
    const allBodies = await page.locator(".chat-message__body:not(:empty)").all();
    const targetIdx = Math.floor(allBodies.length / 2);
    const target = allBodies[targetIdx];

    const expectedText = (await target.textContent()) ?? "";
    expect(expectedText.length).toBeGreaterThan(0);

    const captured = await target.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      if (sel === null) throw new Error("no selection");
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.toString();
    });

    expect(captured.trim()).toBe(expectedText.trim());
  });

  test("user-style drag-select within one row does not leak into other rows", async ({ page }) => {
    const allBodies = await page.locator(".chat-message__body:not(:empty)").all();
    const targetIdx = Math.floor(allBodies.length / 2);
    const target = allBodies[targetIdx];
    const expectedText = (await target.textContent()) ?? "";
    expect(expectedText.length).toBeGreaterThan(0);

    // Drag from near the start to near the end of the row's body, staying
    // strictly inside the row's bounding box.
    const box = await target.boundingBox();
    if (box === null) throw new Error("target has no bounding box");
    const startX = box.x + 5;
    const endX = box.x + Math.max(10, box.width - 5);
    const y = box.y + box.height / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 10 });
    await page.mouse.up();

    const captured = await page.evaluate(() => {
      const sel = window.getSelection();
      return sel === null ? "" : sel.toString();
    });

    // The captured text must be a contiguous substring of the target's body.
    // It must NOT contain content from any other visible message.
    expect(captured.length).toBeGreaterThan(0);
    expect(expectedText).toContain(captured);

    // Also verify it doesn't contain any other body's text (catches the bug).
    const otherBodies = await Promise.all(
      allBodies
        .filter((_, i) => i !== targetIdx)
        .map(async (b) => (await b.textContent()) ?? ""),
    );
    for (const otherText of otherBodies) {
      // Only flag if otherText is substantial enough to be meaningful (avoid
      // tiny false positives like single-word matches).
      if (otherText.length >= 20) {
        expect(captured).not.toContain(otherText);
      }
    }
  });
});
