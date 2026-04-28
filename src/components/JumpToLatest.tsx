import React from "react";
import "./JumpToLatest.css";

export interface JumpToLatestProps {
  readonly unseenCount: number;
  readonly visible: boolean;
  readonly onClick: () => void;
}

export function JumpToLatest(props: JumpToLatestProps): React.JSX.Element | null {
  if (!props.visible) return null;
  const label = props.unseenCount > 0 ? `${props.unseenCount} new ↓` : "Jump to latest ↓";
  return (
    <button className="jump-to-latest" onClick={props.onClick}>
      {label}
    </button>
  );
}
