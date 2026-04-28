import { describe, it, expect } from "vitest";
import { thumbDimensions, fracToIndex, clickToTargetIndex } from "./scrollbarMath";

describe("thumbDimensions", () => {
  it("clamps thumb height to minimum when N >> visibleRows", () => {
    const { thumbHeightPx } = thumbDimensions({
      totalCount: 1_000_000,
      visibleRowCount: 10,
      viewportHeightPx: 600,
      topIndex: 0,
    });
    expect(thumbHeightPx).toBe(24);
  });

  it("thumb height equals viewport when totalCount === visibleRowCount", () => {
    const { thumbHeightPx } = thumbDimensions({
      totalCount: 10,
      visibleRowCount: 10,
      viewportHeightPx: 600,
      topIndex: 0,
    });
    expect(thumbHeightPx).toBe(600);
  });

  it("thumbTopPx is 0 when topIndex is 0", () => {
    const { thumbTopPx } = thumbDimensions({
      totalCount: 1_000_000,
      visibleRowCount: 10,
      viewportHeightPx: 600,
      topIndex: 0,
    });
    expect(thumbTopPx).toBe(0);
  });

  it("thumbTopPx equals trackUsable when topIndex === totalCount - 1", () => {
    const totalCount = 1_000_000;
    const viewportHeightPx = 600;
    const visibleRowCount = 10;
    const minH = 24;
    const thumbHeightPx = Math.max(minH, (viewportHeightPx * visibleRowCount) / totalCount);
    const trackUsable = viewportHeightPx - thumbHeightPx;
    const { thumbTopPx } = thumbDimensions({
      totalCount,
      visibleRowCount,
      viewportHeightPx,
      topIndex: totalCount - 1,
    });
    expect(thumbTopPx).toBeCloseTo(trackUsable, 5);
  });

  it("thumbTopPx is in middle when topIndex is roughly half of totalCount", () => {
    const totalCount = 1000;
    const { thumbTopPx, thumbHeightPx } = thumbDimensions({
      totalCount,
      visibleRowCount: 10,
      viewportHeightPx: 600,
      topIndex: 500,
    });
    const trackUsable = 600 - thumbHeightPx;
    expect(thumbTopPx).toBeCloseTo(trackUsable * (500 / 999), 4);
  });

  it("respects custom minThumbHeightPx", () => {
    const { thumbHeightPx } = thumbDimensions({
      totalCount: 1_000_000,
      visibleRowCount: 10,
      viewportHeightPx: 600,
      topIndex: 0,
      minThumbHeightPx: 48,
    });
    expect(thumbHeightPx).toBe(48);
  });

  it("handles totalCount of 1 without divide-by-zero", () => {
    const { thumbTopPx, thumbHeightPx } = thumbDimensions({
      totalCount: 1,
      visibleRowCount: 1,
      viewportHeightPx: 600,
      topIndex: 0,
    });
    expect(thumbTopPx).toBe(0);
    expect(thumbHeightPx).toBe(600);
  });
});

describe("fracToIndex", () => {
  it("maps 0 to 0", () => {
    expect(fracToIndex(0, 100)).toBe(0);
  });

  it("maps 1 to totalCount - 1", () => {
    expect(fracToIndex(1, 100)).toBe(99);
  });

  it("maps 0.5 to approximately middle", () => {
    expect(fracToIndex(0.5, 101)).toBe(50);
  });

  it("handles totalCount of 1", () => {
    expect(fracToIndex(0, 1)).toBe(0);
    expect(fracToIndex(1, 1)).toBe(0);
  });
});

describe("clickToTargetIndex", () => {
  const base = {
    thumbTopPx: 100,
    thumbHeightPx: 50,
    topIndex: 500,
    totalCount: 1000,
    visibleRowCount: 10,
  };

  it("click above thumb pages up by visibleRowCount", () => {
    const result = clickToTargetIndex({ ...base, clickYPx: 50 });
    expect(result).toBe(490);
  });

  it("click below thumb pages down by visibleRowCount", () => {
    const result = clickToTargetIndex({ ...base, clickYPx: 200 });
    expect(result).toBe(510);
  });

  it("click on thumb returns null", () => {
    const result = clickToTargetIndex({ ...base, clickYPx: 125 });
    expect(result).toBeNull();
  });

  it("page up clamps to 0", () => {
    const result = clickToTargetIndex({ ...base, topIndex: 5, clickYPx: 50 });
    expect(result).toBe(0);
  });

  it("page down clamps to totalCount - 1", () => {
    const result = clickToTargetIndex({ ...base, topIndex: 995, clickYPx: 200 });
    expect(result).toBe(999);
  });
});
