import React from "react";
import { dayLabel } from "../util/day";
import "./StickyDateHeader.css";

export interface StickyDateHeaderProps {
  /** The dayKey to display, or null if no message is currently visible. */
  readonly dayKey: string | null;
  /** Push-up offset in px. Positive value moves the header up. Default 0. */
  readonly pushUpPx: number;
}

export function StickyDateHeader({ dayKey, pushUpPx }: StickyDateHeaderProps): React.JSX.Element | null {
  if (dayKey === null) return null;
  return (
    <div
      className="sticky-date-header"
      style={{ transform: `translateY(${-pushUpPx}px)` }}
    >
      {dayLabel(dayKey)}
    </div>
  );
}
