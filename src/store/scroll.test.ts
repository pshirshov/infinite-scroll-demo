import { describe, it, expect } from "vitest";
import { applyScrollDelta, wheelDeltaToPixels } from "./scroll";
import type { HeightProvider } from "./scroll";

// Heights: [50, 70, 30, 120]
function makeHeights(heights: readonly number[]): HeightProvider {
  return {
    getHeight: (i: number) => heights[i] ?? 60,
  };
}

const VIEWPORT_HEIGHT = 200;

describe("applyScrollDelta", () => {
  it("walks forward through varied heights", () => {
    // Use large totalCount so we never hit bottom snap.
    // heights[0]=50, heights[1]=70, rest=60 (estimated)
    // delta=100: offset=100; row0(50): consume → topIndex=1, offset=50; row1(70): 50 < 70 → stop
    // sum from index1 forward: 70+60*many >> 200, no snap
    const heights = makeHeights([50, 70, 60, 60, 60, 60, 60, 60, 60, 60]);
    const result = applyScrollDelta({ topIndex: 0, pixelOffset: 0 }, 100, 10, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(1);
    expect(result.pixelOffset).toBe(50);
  });

  it("walks forward across multiple rows, bottom-snaps if content < viewport", () => {
    // delta=130: raw walk → {2,10}; but sum from index2 = 30+120=150, minus 10 = 140 < 200 (viewport).
    // Bottom snap: fill from end: i=3:120; i=2:150; i=1:220>=200 → offset=20 → {1,20}
    const heights = makeHeights([50, 70, 30, 120]);
    const result = applyScrollDelta({ topIndex: 0, pixelOffset: 0 }, 130, 4, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(1);
    expect(result.pixelOffset).toBe(20);
  });

  it("walks backward through varied heights, bottom-snap applies", () => {
    // Start {2, 10}, delta=-50 → raw walk: offset=-40 → topIndex=1, offset=30
    // But sum from index1 = 70+30+120=220, minus 30 = 190 < 200 → bottom snap → {1,20}
    const heights = makeHeights([50, 70, 30, 120]);
    const result = applyScrollDelta({ topIndex: 2, pixelOffset: 10 }, -50, 4, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(1);
    expect(result.pixelOffset).toBe(20);
  });

  it("clamps at the top boundary", () => {
    const heights = makeHeights([50, 70, 30, 120]);
    const result = applyScrollDelta({ topIndex: 0, pixelOffset: 0 }, -100, 4, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(0);
    expect(result.pixelOffset).toBe(0);
  });

  it("clamps at the top boundary from mid-scroll", () => {
    const heights = makeHeights([50, 70, 30, 120]);
    // Start at {0, 10}, scroll up 50 → would go to -40, then walk back: topIndex stays 0, clamp offset to 0
    const result = applyScrollDelta({ topIndex: 0, pixelOffset: 10 }, -50, 4, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(0);
    expect(result.pixelOffset).toBe(0);
  });

  it("snaps to bottom when total content < viewport", () => {
    // heights: [50, 70, 30, 120], total=270, viewport=200
    // Scroll way past the end from start
    const heights = makeHeights([50, 70, 30, 120]);
    const result = applyScrollDelta({ topIndex: 0, pixelOffset: 0 }, 10000, 4, heights, VIEWPORT_HEIGHT);
    // Total = 270, viewport = 200: last row (index3, h=120) needs to sit at bottom.
    // Fill from back: i=3 fillHeight=120; i=2 fillHeight=150; i=1 fillHeight=220 >= 200
    // snap: i=1, offsetIntoRow = 220 - 200 = 20
    expect(result.topIndex).toBe(1);
    expect(result.pixelOffset).toBe(20);
  });

  it("handles totalCount=0 gracefully", () => {
    const heights = makeHeights([]);
    const state = { topIndex: 0, pixelOffset: 0 };
    const result = applyScrollDelta(state, 100, 0, heights, VIEWPORT_HEIGHT);
    expect(result).toEqual(state);
  });

  it("does not move past last row when at bottom boundary", () => {
    // heights: [50, 70, 30, 120], viewport=200
    // Snapped bottom is {1, 20}: sum from i=1 with offset=20: 70+30+120=220, 220-20=200 = viewportHeight exactly
    const heights = makeHeights([50, 70, 30, 120]);
    const result = applyScrollDelta({ topIndex: 1, pixelOffset: 20 }, 500, 4, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(1);
    expect(result.pixelOffset).toBe(20);
  });

  it("returns stable state when no content change at top", () => {
    const heights = makeHeights([50, 70, 30, 120]);
    const result = applyScrollDelta({ topIndex: 0, pixelOffset: 0 }, 0, 4, heights, VIEWPORT_HEIGHT);
    expect(result.topIndex).toBe(0);
    expect(result.pixelOffset).toBe(0);
  });
});

describe("wheelDeltaToPixels", () => {
  function makeWheelEvent(deltaY: number, deltaMode: number): WheelEvent {
    return new WheelEvent("wheel", { deltaY, deltaMode });
  }

  it("DOM_DELTA_PIXEL returns deltaY directly", () => {
    const e = makeWheelEvent(50, 0);
    expect(wheelDeltaToPixels(e, 60, 400)).toBe(50);
  });

  it("DOM_DELTA_LINE multiplies by estimatedRowHeight", () => {
    const e = makeWheelEvent(3, 1);
    expect(wheelDeltaToPixels(e, 60, 400)).toBe(180);
  });

  it("DOM_DELTA_PAGE multiplies by viewportHeight", () => {
    const e = makeWheelEvent(1, 2);
    expect(wheelDeltaToPixels(e, 60, 400)).toBe(400);
  });

  it("DOM_DELTA_PAGE with fractional deltaY", () => {
    const e = makeWheelEvent(-1, 2);
    expect(wheelDeltaToPixels(e, 60, 400)).toBe(-400);
  });
});
