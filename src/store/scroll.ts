export interface ScrollState {
  readonly topIndex: number;
  readonly pixelOffset: number;
}

export interface HeightProvider {
  /** Returns height of row `index`. Must be defined for all `index` in [0, totalCount). */
  readonly getHeight: (index: number) => number;
}

/**
 * Apply a pixel delta to the scroll state, walking topIndex/pixelOffset and clamping at boundaries.
 *
 * I-1: Layout flows DOWNWARD from topIndex. topRow's top is at viewport-y = -pixelOffset.
 * I-4: This is the ONLY place scroll state mutates; all input sources funnel here.
 * I-5: Lower bound: topIndex=0, pixelOffset clamped to >= 0.
 *       Upper bound: when total remaining height < viewportHeight, snap so content fills from bottom.
 */
export function applyScrollDelta(
  state: ScrollState,
  deltaPx: number,
  totalCount: number,
  heights: HeightProvider,
  viewportHeight: number,
): ScrollState {
  if (totalCount === 0) return state;

  let topIndex = state.topIndex;
  let pixelOffset = state.pixelOffset + deltaPx;

  // Walk forward: consume full rows from the top
  while (topIndex < totalCount - 1 && pixelOffset >= heights.getHeight(topIndex)) {
    pixelOffset -= heights.getHeight(topIndex);
    topIndex++;
  }

  // Walk backward: un-consume rows going above topIndex
  while (topIndex > 0 && pixelOffset < 0) {
    topIndex--;
    pixelOffset += heights.getHeight(topIndex);
  }

  // Lower-bound clamp: cannot scroll above the very first row
  if (topIndex === 0 && pixelOffset < 0) {
    pixelOffset = 0;
  }

  // Upper-bound clamp: if the content from topIndex to the end (minus the already-scrolled
  // pixelOffset) is shorter than the viewport, snap upward so the last row sits at the bottom.
  // "visible content" = sum(h[topIndex..end]) - pixelOffset
  let contentBelowTop = -pixelOffset;
  for (let i = topIndex; i < totalCount; i++) {
    contentBelowTop += heights.getHeight(i);
    if (contentBelowTop >= viewportHeight) {
      // Enough content to fill the viewport — no snap needed.
      return { topIndex, pixelOffset };
    }
  }

  // Total visible content < viewportHeight: snap upward so last row is at bottom.
  // Walk backward from totalCount - 1, accumulating heights until we have >= viewportHeight.
  let fillHeight = 0;
  for (let i = totalCount - 1; i >= 0; i--) {
    fillHeight += heights.getHeight(i);
    if (fillHeight >= viewportHeight) {
      const offsetIntoRow = fillHeight - viewportHeight;
      return { topIndex: i, pixelOffset: offsetIntoRow };
    }
  }
  // All content fits in viewport — show from the top with no offset.
  return { topIndex: 0, pixelOffset: 0 };
}

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/**
 * Convert a WheelEvent to a pixel delta. Pure (reads e.deltaY, e.deltaMode).
 */
export function wheelDeltaToPixels(
  e: WheelEvent,
  estimatedRowHeight: number,
  viewportHeight: number,
): number {
  if (e.deltaMode === DOM_DELTA_LINE) {
    return e.deltaY * estimatedRowHeight;
  }
  if (e.deltaMode === DOM_DELTA_PAGE) {
    return e.deltaY * viewportHeight;
  }
  // DOM_DELTA_PIXEL (0) or unknown
  return e.deltaY;
}
