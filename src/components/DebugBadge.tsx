import React from "react";
import type { ChatStore } from "../store/ChatStore";
import { useChatStoreSnapshot } from "../store/useChatStore";
import "./DebugBadge.css";

export interface DebugBadgeProps {
  readonly store: ChatStore;
}

export function DebugBadge({ store }: DebugBadgeProps): React.JSX.Element {
  const snap = useChatStoreSnapshot(store);
  return (
    <div className="debug-badge">
      <div>regions: {snap.regionCount}</div>
      <div>loaded: {snap.totalLoadedMessages}</div>
      <div>inflight: {snap.inflightCount}</div>
      <div>top: {snap.topIndex}/{snap.totalCount}</div>
    </div>
  );
}
