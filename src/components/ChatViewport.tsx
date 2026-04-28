/**
 * ChatViewport — index-space scroll engine.
 *
 * Invariants (see plan §PR-04):
 * I-1: Layout flows DOWNWARD from topIndex. topRow's top is at viewport-y = -pixelOffset.
 *      Rows below stack using their measured (or estimated) heights.
 * I-2: Above-rows (overscan above topIndex) are derived BACKWARD from topIndex's top.
 *      Height changes in above-rows do NOT affect topRow's position — they are visually
 *      off-screen and only reflow among themselves.
 * I-3: When store.setHeight(index, h) is called, the store notifies listeners → re-render.
 *      topRow's top stays at -pixelOffset; visible content top edge is preserved.
 * I-4: applyScrollDelta is the ONLY mutation path for scroll state.
 *      Wheel, keyboard, and future scrollbar drag all funnel through it.
 * I-5: Boundary clamps: pixelOffset >= 0 at topIndex=0; cannot scroll past last row.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStore } from "../store/ChatStore";
import { useChatStoreSnapshot } from "../store/useChatStore";
import { applyScrollDelta, wheelDeltaToPixels } from "../store/scroll";
import { MessageRow } from "./MessageRow";
import { SkeletonRow } from "./SkeletonRow";
import "./ChatViewport.css";

export interface ChatViewportProps {
  readonly store: ChatStore;
}

const OVERSCAN_ABOVE = 5;
const OVERSCAN_BELOW = 5;

/** Line-height estimate used for keyboard/wheel LINE-mode scrolling. */
const KEYBOARD_SCROLL_PX = 60;
const WHEEL_LINE_PX = KEYBOARD_SCROLL_PX;
/** PageUp/Down overlap so user doesn't lose context. */
const PAGE_SCROLL_OVERLAP_PX = 40;

/** Extra rows beyond viewport edge to prefetch. */
const PREFETCH_OVERSCAN = 200;

/** Debounce delay before issuing ensureRange after scroll settles, ms. */
const SCROLL_SETTLED_DELAY_MS = 150;

/** Pixel threshold: if last row's bottom is within this many px of viewport bottom, we consider the tail anchored. */
const TAIL_ANCHOR_THRESHOLD_PX = 64;

export function ChatViewport({ store }: ChatViewportProps): React.JSX.Element {
  const snap = useChatStoreSnapshot(store);
  const { topIndex, pixelOffset, totalCount } = snap;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [didInitialAnchor, setDidInitialAnchor] = useState(false);
  const settledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-shot: once the viewport has a height and the tail region is loaded, snap to the live tail.
  useEffect(() => {
    if (didInitialAnchor) return;
    if (viewportHeight === 0) return;
    const hasTail = snap.regions.some((r) => r.endIndex === snap.totalCount);
    if (!hasTail) return;
    const next = applyScrollDelta(
      { topIndex: snap.totalCount - 1, pixelOffset: 0 },
      0,
      snap.totalCount,
      store,
      viewportHeight,
    );
    store.setTopIndex(next.topIndex, next.pixelOffset);
    setDidInitialAnchor(true);
    // Prefetch around the post-anchor position with correct topIndex.
    const start = next.topIndex - PREFETCH_OVERSCAN;
    const end = next.topIndex + Math.ceil(viewportHeight / snap.estimatedRowHeight) + PREFETCH_OVERSCAN;
    store.ensureRange(start, Math.min(end, snap.totalCount));
    store.abortFetchesOutside(start, Math.min(end, snap.totalCount));
    // Just anchored to tail — protect it from eviction.
    store.scheduleEvict(true);
  }, [didInitialAnchor, viewportHeight, snap.regions, snap.totalCount, snap.estimatedRowHeight, store]);

  // Track viewport height via ResizeObserver.
  useEffect(() => {
    const el = viewportRef.current;
    if (el === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Debounced prefetch: fires ensureRange for the visible+overscan window after scroll settles.
  // Reads fresh state at fire time so a scroll between schedule and fire uses the right window.
  const scheduleEnsureRange = useCallback(() => {
    if (settledTimerRef.current !== null) {
      clearTimeout(settledTimerRef.current);
    }
    settledTimerRef.current = setTimeout(() => {
      settledTimerRef.current = null;
      const current = store.getSnapshot();
      const visibleRowCount = Math.ceil(viewportHeight / current.estimatedRowHeight);
      const start = current.topIndex - PREFETCH_OVERSCAN;
      const end = current.topIndex + visibleRowCount + PREFETCH_OVERSCAN;
      const clampedEnd = Math.min(end, current.totalCount);
      store.ensureRange(start, clampedEnd);
      store.abortFetchesOutside(start, clampedEnd);

      // Tail-anchored: last row's estimated bottom within TAIL_ANCHOR_THRESHOLD_PX of viewport bottom.
      // (current.totalCount - 1 - current.topIndex) * estimatedRowHeight - pixelOffset ≈ distance from viewport-top to last row bottom
      const distanceToLastRowBottom =
        (current.totalCount - 1 - current.topIndex) * current.estimatedRowHeight - current.pixelOffset;
      const tailAnchored = distanceToLastRowBottom <= viewportHeight + TAIL_ANCHOR_THRESHOLD_PX;
      store.scheduleEvict(tailAnchored);
    }, SCROLL_SETTLED_DELAY_MS);
  }, [store, viewportHeight]);

  // Cleanup settled timer on unmount.
  useEffect(() => {
    return () => {
      if (settledTimerRef.current !== null) {
        clearTimeout(settledTimerRef.current);
      }
    };
  }, []);

  // Wheel handler — passive:false so we can prevent default native scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const dyPx = wheelDeltaToPixels(e, WHEEL_LINE_PX, viewportHeight);
      const current = store.getSnapshot();
      const next = applyScrollDelta(
        { topIndex: current.topIndex, pixelOffset: current.pixelOffset },
        dyPx,
        current.totalCount,
        store,
        viewportHeight,
      );
      if (next.topIndex !== current.topIndex || next.pixelOffset !== current.pixelOffset) {
        store.setTopIndex(next.topIndex, next.pixelOffset);
        scheduleEnsureRange();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store, viewportHeight, scheduleEnsureRange]);

  // Keyboard handler — only active when the viewport has focus.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      let dyPx: number | null = null;
      const current = store.getSnapshot();

      if (e.key === "ArrowDown") {
        e.preventDefault();
        dyPx = KEYBOARD_SCROLL_PX;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dyPx = -KEYBOARD_SCROLL_PX;
      } else if (e.key === "PageDown") {
        e.preventDefault();
        dyPx = viewportHeight - PAGE_SCROLL_OVERLAP_PX;
      } else if (e.key === "PageUp") {
        e.preventDefault();
        dyPx = -(viewportHeight - PAGE_SCROLL_OVERLAP_PX);
      } else if (e.key === "Home") {
        e.preventDefault();
        const next = applyScrollDelta(
          { topIndex: 0, pixelOffset: 0 },
          0,
          current.totalCount,
          store,
          viewportHeight,
        );
        store.setTopIndex(next.topIndex, next.pixelOffset);
        scheduleEnsureRange();
        return;
      } else if (e.key === "End") {
        e.preventDefault();
        // Set to last index at 0 offset; upper-bound clamp in applyScrollDelta will settle it.
        const next = applyScrollDelta(
          { topIndex: current.totalCount - 1, pixelOffset: 0 },
          0,
          current.totalCount,
          store,
          viewportHeight,
        );
        store.setTopIndex(next.topIndex, next.pixelOffset);
        scheduleEnsureRange();
        return;
      }

      if (dyPx !== null) {
        const next = applyScrollDelta(
          { topIndex: current.topIndex, pixelOffset: current.pixelOffset },
          dyPx,
          current.totalCount,
          store,
          viewportHeight,
        );
        if (next.topIndex !== current.topIndex || next.pixelOffset !== current.pixelOffset) {
          store.setTopIndex(next.topIndex, next.pixelOffset);
          scheduleEnsureRange();
        }
      }
    },
    [store, viewportHeight, scheduleEnsureRange],
  );

  // Stable callback for MessageRow's ResizeObserver.
  // I-3: We call store.setHeight here. Store notifies → re-render → new layout pass.
  //      topRow's top is pinned at -pixelOffset; only rows below it reflow.
  // I-2: For above-rows (overscan), height changes reflow those rows' own topPx values
  //      (derived backward from topIndex) but never touch topRow or below-rows.
  const onMeasured = useCallback(
    (index: number, height: number) => {
      store.setHeight(index, height);
    },
    [store],
  );

  // ---- Layout pass ----
  // Compute rows to render: overscanAbove rows above topIndex + visible rows + overscanBelow below.

  interface RowEntry {
    index: number;
    topPx: number;
  }

  const rowsToRender: RowEntry[] = [];

  // Rows BELOW topIndex (and topIndex itself) — walk forward.
  {
    let y = -pixelOffset;
    let i = topIndex;
    let belowOverscanCount = 0;
    while (i < totalCount) {
      const inViewport = y < viewportHeight;
      if (!inViewport) {
        belowOverscanCount++;
        if (belowOverscanCount > OVERSCAN_BELOW) break;
      }
      // Include the row regardless of loaded state — skeleton fills the gap.
      rowsToRender.push({ index: i, topPx: y });
      y += store.getHeight(i);
      i++;
    }
  }

  // Rows ABOVE topIndex — walk backward.
  // I-2: topPx for above-rows derived backward from topRow's top (= -pixelOffset).
  {
    let y = -pixelOffset;
    for (let count = 0; count < OVERSCAN_ABOVE && topIndex - count - 1 >= 0; count++) {
      const i = topIndex - count - 1;
      y -= store.getHeight(i);
      // Include regardless of loaded state.
      rowsToRender.push({ index: i, topPx: y });
    }
  }

  return (
    <div
      ref={viewportRef}
      className="chat-viewport"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="chat-viewport__rows">
        {rowsToRender.map(({ index, topPx }) => {
          const msg = store.findMessage(index);
          if (msg !== undefined) {
            return (
              <MessageRow
                key={index}
                message={msg}
                absoluteTopPx={topPx}
                onMeasured={onMeasured}
              />
            );
          }
          return (
            <SkeletonRow
              key={index}
              index={index}
              heightPx={store.getHeight(index)}
              absoluteTopPx={topPx}
            />
          );
        })}
      </div>
    </div>
  );
}
