import React from "react";
import { dayLabel } from "../util/day";
import "./DaySeparator.css";

export interface DaySeparatorProps {
  readonly dayKey: string;
}

export function DaySeparator({ dayKey }: DaySeparatorProps): React.JSX.Element {
  return (
    <div className="day-separator">
      <span className="day-separator__label">{dayLabel(dayKey)}</span>
    </div>
  );
}
