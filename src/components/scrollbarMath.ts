const DEFAULT_MIN_THUMB_HEIGHT_PX = 24;

export interface ThumbDimensionsParams {
  readonly totalCount: number;
  readonly visibleRowCount: number;
  readonly viewportHeightPx: number;
  readonly topIndex: number;
  readonly minThumbHeightPx?: number;
}

export interface ThumbDimensions {
  readonly thumbTopPx: number;
  readonly thumbHeightPx: number;
}

export function thumbDimensions(params: ThumbDimensionsParams): ThumbDimensions {
  const minH = params.minThumbHeightPx ?? DEFAULT_MIN_THUMB_HEIGHT_PX;
  const thumbHeightPx = Math.max(
    minH,
    (params.viewportHeightPx * params.visibleRowCount) / Math.max(1, params.totalCount),
  );
  const trackUsable = params.viewportHeightPx - thumbHeightPx;
  const frac = params.topIndex / Math.max(1, params.totalCount - 1);
  const thumbTopPx = frac * Math.max(0, trackUsable);
  return { thumbTopPx, thumbHeightPx };
}

/** Map a track fraction [0, 1] to a row index [0, totalCount-1]. */
export function fracToIndex(frac: number, totalCount: number): number {
  return Math.round(frac * Math.max(0, totalCount - 1));
}

export interface ClickToTargetParams {
  readonly clickYPx: number;
  readonly thumbTopPx: number;
  readonly thumbHeightPx: number;
  readonly topIndex: number;
  readonly totalCount: number;
  readonly visibleRowCount: number;
}

/**
 * Given a click on the track (not on the thumb), compute the new target index.
 * Click above thumb → page up; click below thumb → page down.
 * Returns null if the click is on the thumb itself.
 */
export function clickToTargetIndex(params: ClickToTargetParams): number | null {
  const { clickYPx, thumbTopPx, thumbHeightPx, topIndex, totalCount, visibleRowCount } = params;
  if (clickYPx < thumbTopPx) {
    return Math.max(0, topIndex - visibleRowCount);
  }
  if (clickYPx > thumbTopPx + thumbHeightPx) {
    return Math.min(totalCount - 1, topIndex + visibleRowCount);
  }
  // Click landed on the thumb — no page jump.
  return null;
}
