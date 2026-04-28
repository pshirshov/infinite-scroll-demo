import React, { useEffect, useState } from "react";
import { ChatStore } from "./store/ChatStore";
import { MockBackend } from "./backend/MockBackend";
import { ChatViewport } from "./components/ChatViewport";
import { DebugBadge } from "./components/DebugBadge";
import "./styles.css";

const N = 1_000_000;

export function App(): React.JSX.Element {
  const [backend] = useState(() => new MockBackend({ totalCount: N, seed: 42 }));
  const [store] = useState(() => new ChatStore({
    totalCount: N,
    estimatedRowHeight: 60,
    keepRadius: 500,
    backend,
    chunkSize: 100,
  }));

  useEffect(() => {
    let cancelled = false;
    backend.getLatest(200).then(({ messages, startIndex }) => {
      if (cancelled) return;
      store.insertRegion({ startIndex, endIndex: startIndex + messages.length, messages });
      store.setTopIndex(startIndex, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, store]);

  useEffect(() => () => store.dispose(), [store]);

  return (
    <div className="app">
      <h1 className="app__title">scroll-demo</h1>
      <ChatViewport store={store} />
      <DebugBadge store={store} />
    </div>
  );
}
