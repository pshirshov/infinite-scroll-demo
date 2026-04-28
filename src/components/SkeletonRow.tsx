import React from "react";
import "./MessageRow.css";

export interface SkeletonRowProps {
  readonly index: number;
  readonly heightPx: number;
  readonly absoluteTopPx: number;
}

export function SkeletonRow({ index, heightPx, absoluteTopPx }: SkeletonRowProps): React.JSX.Element {
  return (
    <div
      className="chat-skeleton"
      data-index={index}
      style={{
        transform: `translateY(${absoluteTopPx}px)`,
        height: `${heightPx}px`,
      }}
    />
  );
}
