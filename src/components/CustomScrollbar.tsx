import React, { useRef, useCallback } from "react";
import { thumbDimensions, clickToTargetIndex } from "./scrollbarMath";
import "./CustomScrollbar.css";

export interface CustomScrollbarProps {
  /** 0 ≤ topIndex < totalCount */
  readonly topIndex: number;
  readonly totalCount: number;
  /** Approximate visible row count, used to size the thumb. */
  readonly visibleRowCount: number;
  /** Viewport height in px (height of the scrollbar track). */
  readonly viewportHeightPx: number;
  /** Called when the user requests a jump to a target index. */
  readonly onJump: (targetIndex: number) => void;
}

export function CustomScrollbar(props: CustomScrollbarProps): React.JSX.Element {
  const { topIndex, totalCount, visibleRowCount, viewportHeightPx, onJump } = props;

  const { thumbTopPx, thumbHeightPx } = thumbDimensions({
    totalCount,
    visibleRowCount,
    viewportHeightPx,
    topIndex,
  });

  const trackUsable = viewportHeightPx - thumbHeightPx;

  // Drag state stored in a ref to avoid re-render churn during pointer moves.
  const dragRef = useRef<{ startY: number; startThumbTopPx: number } | null>(null);

  const onThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Stop propagation so the track's onPointerDown doesn't also fire a page jump.
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startThumbTopPx: thumbTopPx };
    },
    [thumbTopPx],
  );

  const onThumbPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current === null) return;
      const dy = e.clientY - dragRef.current.startY;
      const newThumbTopPx = Math.max(0, Math.min(dragRef.current.startThumbTopPx + dy, trackUsable));
      // Guard against zero-length track (e.g. totalCount === 0 or all rows visible).
      const newFrac = trackUsable > 0 ? newThumbTopPx / trackUsable : 0;
      const newTopIndex = Math.round(newFrac * Math.max(0, totalCount - 1));
      onJump(newTopIndex);
    },
    [trackUsable, totalCount, onJump],
  );

  const onThumbPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  const trackRef = useRef<HTMLDivElement | null>(null);

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (trackRef.current === null) return;
      const clickY = e.clientY - trackRef.current.getBoundingClientRect().top;
      const target = clickToTargetIndex({
        clickYPx: clickY,
        thumbTopPx,
        thumbHeightPx,
        topIndex,
        totalCount,
        visibleRowCount,
      });
      if (target !== null) {
        onJump(target);
      }
    },
    [thumbTopPx, thumbHeightPx, topIndex, totalCount, visibleRowCount, onJump],
  );

  return (
    <div
      ref={trackRef}
      className="custom-scrollbar"
      style={{ height: viewportHeightPx }}
      onPointerDown={onTrackPointerDown}
    >
      <div
        className="custom-scrollbar__thumb"
        style={{ top: thumbTopPx, height: thumbHeightPx }}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={onThumbPointerUp}
      />
    </div>
  );
}
