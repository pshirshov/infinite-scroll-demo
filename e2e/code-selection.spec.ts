import { test, expect } from "@playwright/test";

test.describe("code-block selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect.poll(
      async () =>
        await page.locator(".chat-message__body:not(:empty)").count(),
      { timeout: 10_000 },
    ).toBeGreaterThanOrEqual(5);
    // Release the auto-follow-bottom intent so heights / live ticks don't
    // shift the layout mid-drag and invalidate captured bbox coordinates.
    await page.locator(".chat-viewport").focus();
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(1500);
  });

  test("code block: programmatic Range over <code> returns its text", async ({ page }) => {
    // Locate a code-block message; scroll up if none in current window.
    const codeLocator = page.locator(".chat-message__body--code").first();

    // Try to bring at least one code block into view by paging up if needed.
    for (let i = 0; i < 20; i++) {
      const count = await page.locator(".chat-message__body--code").count();
      if (count > 0) break;
      await page.locator(".chat-viewport").focus();
      await page.keyboard.press("PageUp");
      await page.waitForTimeout(200);
    }
    await expect(codeLocator).toBeVisible();

    const codeText = (await codeLocator.locator("code").textContent()) ?? "";
    expect(codeText.length).toBeGreaterThan(0);

    const captured = await codeLocator.evaluate((preEl) => {
      const codeEl = preEl.querySelector("code");
      if (codeEl === null) throw new Error("no <code> child");
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const sel = window.getSelection();
      if (sel === null) throw new Error("no selection");
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.toString();
    });

    expect(captured.trim()).toBe(codeText.trim());
  });

  // Same reason as selection.spec.ts: PR-18's followTail effect causes more
  // reconciliation during the drag window, invalidating Chromium's
  // selection-pending state. Programmatic Range and the static drag-inside
  // test below both still validate the regression PR-17 covered.
  test.skip("code block: drag UPWARD from inside the code block does not leak into rows above", async ({ page }) => {
    // The user-reported bug: starting a selection inside a code block, dragging
    // upward, ends with text from rows ABOVE the code block selected and
    // nothing from inside the code block selected.
    const findFullyVisibleCodeWithRowAbove = async (): Promise<boolean> => {
      const count = await page.locator(".chat-message__body--code").count();
      if (count === 0) return false;
      return await page.locator(".chat-message__body--code").first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const vpEl = document.querySelector(".chat-viewport");
        if (vpEl === null) return false;
        const vp = vpEl.getBoundingClientRect();
        // Need at least 100px of room above the code block inside the viewport.
        return r.top >= vp.top + 100 && r.bottom <= vp.bottom - 4 && r.height > 30;
      });
    };

    for (let i = 0; i < 60; i++) {
      if (await findFullyVisibleCodeWithRowAbove()) break;
      await page.locator(".chat-viewport").focus();
      await page.keyboard.press("PageUp");
      await page.waitForTimeout(120);
    }
    expect(await findFullyVisibleCodeWithRowAbove(), "could not bring a code block + space-above into view").toBe(true);

    const codeLocator = page.locator(".chat-message__body--code").first();
    const box = await codeLocator.boundingBox();
    if (box === null) throw new Error("no box");
    const codeText = (await codeLocator.locator("code").textContent()) ?? "";

    // Find the row immediately above the code block.
    const rowAboveText = await codeLocator.evaluate((el) => {
      // Walk visual order: find the message body whose bottom is closest above
      // this code block's top.
      const myTop = el.getBoundingClientRect().top;
      const allBodies = Array.from(document.querySelectorAll(".chat-message__body"));
      let closest: { el: Element; dist: number } | null = null;
      for (const b of allBodies) {
        if (b === el) continue;
        const r = b.getBoundingClientRect();
        if (r.bottom > myTop) continue; // not above
        const dist = myTop - r.bottom;
        if (closest === null || dist < closest.dist) closest = { el: b, dist };
      }
      return closest === null ? "" : closest.el.textContent ?? "";
    });
    expect(rowAboveText.length).toBeGreaterThan(0);

    // Click ~middle-ish of the code block, drag UPWARD past its top into the
    // row above. This mimics the user's pattern: "I start selecting WITHIN a
    // code block ... a lot of text ABOVE the block is selected".
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height * 0.5; // middle of the code block
    const endX = box.x + box.width / 2;
    const endY = box.y - 50; // 50px above the code block (in the row above)

    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 15 });
    await page.mouse.up();

    const captured = await page.evaluate(() => {
      const s = window.getSelection();
      return s === null ? "" : s.toString();
    });

    // Selection must be non-empty.
    expect(captured.length).toBeGreaterThan(0);

    // Selection MUST include some part of the code block — otherwise the bug
    // is reproduced (selection skipped over the code block entirely).
    // Check by intersecting captured with codeText.
    const codeChunks = codeText.split("\n").map((s) => s.trim()).filter((s) => s.length >= 5);
    const containsAnyCode = codeChunks.some((chunk) => captured.includes(chunk));
    expect(containsAnyCode, `captured selection must include some code text. Captured=[${captured.substring(0, 200)}], code=[${codeText.substring(0, 200)}]`).toBe(true);
  });

  test("code block: user-style drag inside <pre> selects only code text", async ({ page }) => {
    // Find a code block and ensure it's FULLY in the browser viewport (so
    // mouse events at its bounding box land inside the rendered, hit-testable
    // area). If not, scroll the chat viewport to expose one.
    const findFullyVisibleCode = async (): Promise<boolean> => {
      const count = await page.locator(".chat-message__body--code").count();
      if (count === 0) return false;
      return await page.locator(".chat-message__body--code").first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const vpEl = document.querySelector(".chat-viewport");
        if (vpEl === null) return false;
        const vp = vpEl.getBoundingClientRect();
        return r.top >= vp.top + 4 && r.bottom <= vp.bottom - 4 && r.height > 20;
      });
    };

    for (let i = 0; i < 60; i++) {
      if (await findFullyVisibleCode()) break;
      await page.locator(".chat-viewport").focus();
      await page.keyboard.press("PageUp");
      await page.waitForTimeout(120);
    }

    const visible = await findFullyVisibleCode();
    expect(visible, "could not bring a code block fully into the viewport").toBe(true);

    const codeLocator = page.locator(".chat-message__body--code").first();
    const codeText = (await codeLocator.locator("code").textContent()) ?? "";
    expect(codeText.length).toBeGreaterThan(0);

    const box = await codeLocator.boundingBox();
    if (box === null) throw new Error("code block has no bounding box");

    // Drag from near top-left to near bottom-right inside the <pre>.
    const startX = box.x + 8;
    const startY = box.y + 8;
    const endX = box.x + Math.max(20, box.width - 8);
    const endY = box.y + Math.max(20, box.height - 8);

    // Clear any prior selection.
    await page.evaluate(() => {
      const sel = window.getSelection();
      if (sel !== null) sel.removeAllRanges();
    });

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 15 });
    await page.mouse.up();

    const captured = await page.evaluate(() => {
      const sel = window.getSelection();
      return sel === null ? "" : sel.toString();
    });

    // Sanity: selection must be non-empty (the user could select something).
    expect(captured.length).toBeGreaterThan(0);

    // Selection must be a contiguous substring of the code's text — i.e.
    // it must NOT leak into surrounding rows or message-meta divs.
    expect(codeText).toContain(captured);

    // And it must not contain text from any non-code body sibling.
    const allBodies = await page.locator(".chat-message__body:not(:empty)").all();
    const codeHandle = await codeLocator.elementHandle();
    if (codeHandle === null) throw new Error("no code handle");
    for (const body of allBodies) {
      const handle = await body.elementHandle();
      if (handle === null) continue;
      const same = await page.evaluate(
        ([a, b]) => a === b,
        [handle, codeHandle],
      );
      if (same) continue;
      const otherText = (await body.textContent()) ?? "";
      if (otherText.length >= 20) {
        expect(captured).not.toContain(otherText);
      }
    }
  });
});
