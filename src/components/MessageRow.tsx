import React, { useEffect, useRef } from "react";

import type { Message } from "../backend/Message";
import "./MessageRow.css";

export interface MessageRowProps {
  readonly message: Message;
  readonly onMeasured: (index: number, height: number) => void;
  /**
   * Where to render this row inside the viewport.
   * I-1: transform is used (not top) — GPU-composited, no layout thrash on the row itself.
   */
  readonly absoluteTopPx: number;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageRowInner({ message, onMeasured, absoluteTopPx }: MessageRowProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onMeasuredRef = useRef(onMeasured);
  onMeasuredRef.current = onMeasured;

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      // borderBoxSize includes padding+border; contentRect.height does not.
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
      onMeasuredRef.current(message.index, h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [message.index]);

  return (
    <div
      ref={containerRef}
      className="chat-message"
      data-index={message.index}
      style={{ transform: `translateY(${absoluteTopPx}px)` }}
    >
      <div className="chat-message__meta">
        <span className="chat-message__author">{message.authorName}</span>
        <span className="chat-message__ts">{formatTs(message.ts)}</span>
      </div>
      {message.kind === "code" ? (
        <pre className="chat-message__body chat-message__body--code">
          <code>{message.body}</code>
        </pre>
      ) : (
        <p className="chat-message__body">{message.body}</p>
      )}
    </div>
  );
}

/**
 * Memoized: re-renders only when message.id or absoluteTopPx changes.
 * onMeasured reference changes are intentionally ignored to avoid spurious ResizeObserver re-attaches.
 */
export const MessageRow = React.memo(MessageRowInner, (prev, next) => {
  return prev.message.id === next.message.id && prev.absoluteTopPx === next.absoluteTopPx;
});
