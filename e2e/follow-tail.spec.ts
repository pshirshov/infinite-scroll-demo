import { test, expect } from "@playwright/test";

test.describe("auto-stay-at-bottom (followTail)", () => {
  test("initial anchor leaves the LAST message visible at the bottom", async ({ page }) => {
    await page.goto("/");
    // Wait for the initial anchor to settle.
    await expect.poll(
      async () =>
        await page.locator(".chat-message__body:not(:empty)").count(),
      { timeout: 15_000 },
    ).toBeGreaterThanOrEqual(5);
    // After heights resolve and followTail re-snaps, the LAST data-index in
    // the rendered window must be exactly totalCount - 1 (the live tail).
    // Give a generous settle margin (heights resolve over ~hundreds of ms).
    await page.waitForTimeout(1500);

    const result = await page.evaluate(() => {
      // Read the highest data-index currently in the DOM.
      const indices = Array.from(
        document.querySelectorAll(".chat-message[data-index]"),
      ).map((el) => Number((el as HTMLElement).dataset["index"] ?? "-1"));
      const maxIdx = indices.length === 0 ? -1 : Math.max(...indices);
      // Also read totalCount from the DebugBadge text (format: "top: X/Y").
      const badge = document.querySelector(".debug-badge");
      let totalCount = -1;
      if (badge !== null) {
        const text = badge.textContent ?? "";
        const m = /\/\s*(\d+)/.exec(text);
        if (m !== null && m[1] !== undefined) totalCount = Number(m[1]);
      }
      // And read viewportHeight to compare with the last row's bottom.
      const lastRow = document.querySelector(`.chat-message[data-index="${maxIdx}"]`);
      const vp = document.querySelector(".chat-viewport");
      let lastBottomDelta = NaN;
      if (lastRow !== null && vp !== null) {
        const r = lastRow.getBoundingClientRect();
        const v = vp.getBoundingClientRect();
        lastBottomDelta = v.bottom - r.bottom;
      }
      return { maxIdx, totalCount, lastBottomDelta };
    });

    // The last DOM-rendered row should be totalCount - 1 (the live tail).
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.maxIdx).toBe(result.totalCount - 1);
    // And its bottom should be very close to the viewport bottom (within
    // an estimated row height; allowing for small rounding).
    expect(Math.abs(result.lastBottomDelta)).toBeLessThan(80);
  });

  test("scrolling up via PageUp clears followTail; the JumpToLatest pill becomes visible", async ({ page }) => {
    await page.goto("/");
    await expect.poll(
      async () =>
        await page.locator(".chat-message__body:not(:empty)").count(),
      { timeout: 15_000 },
    ).toBeGreaterThanOrEqual(5);

    // Pill is hidden when followTail is true.
    const pill = page.locator(".jump-to-latest");
    await expect(pill).not.toBeVisible();

    // PageUp scrolls away from tail, releasing followTail.
    await page.locator(".chat-viewport").focus();
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(300);

    // Pill should now appear.
    await expect(pill).toBeVisible();
  });
});
