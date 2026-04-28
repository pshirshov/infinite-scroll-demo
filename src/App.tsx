import React, { useEffect, useState } from "react";
import { ChatStore } from "./store/ChatStore";
import { MockBackend } from "./backend/MockBackend";
import { ChatViewport } from "./components/ChatViewport";
import { DebugBadge } from "./components/DebugBadge";
import { JumpToIdInput } from "./components/JumpToIdInput";
import { SearchBar } from "./components/SearchBar";
import "./styles.css";

const N = 5_000_000;

interface Resources {
  readonly backend: MockBackend;
  readonly store: ChatStore;
}

// Construct backend+store INSIDE an effect (not via useState initializer) so
// that creation and disposal are paired symmetrically with the effect's
// lifecycle. React 18's <StrictMode> intentionally simulates an unmount in dev,
// running every effect's cleanup once before re-mounting; if the resource is
// created via `useState(() => new Resource())` and disposed in a cleanup, the
// remounted component reuses the SAME (now-disposed) resource — quietly
// breaking any subsequent fetches via the disposed coordinator.
function createResources(): Resources {
  const backend = new MockBackend({ totalCount: N, seed: 42 });
  const store = new ChatStore({
    totalCount: N,
    estimatedRowHeight: 60,
    keepRadius: 500,
    backend,
    chunkSize: 100,
  });
  return { backend, store };
}

export function App(): React.JSX.Element | null {
  const [resources, setResources] = useState<Resources | null>(null);

  useEffect(() => {
    const r = createResources();
    setResources(r);
    return () => r.store.dispose();
  }, []);

  useEffect(() => {
    if (resources === null) return;
    const { backend, store } = resources;
    let cancelled = false;
    backend.getLatest(200).then(({ messages, startIndex }) => {
      if (cancelled) return;
      store.insertRegion({ startIndex, endIndex: startIndex + messages.length, messages });
      store.setTopIndex(startIndex, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [resources]);

  useEffect(() => {
    if (resources === null) return;
    const { backend, store } = resources;
    const unsub = backend.subscribeNew((event) => {
      store.handleLiveMessage(event);
    });
    return unsub;
  }, [resources]);

  if (resources === null) return null;
  const { backend, store } = resources;

  return (
    <div className="app">
      <div className="app__title-bar">
        <h1 className="app__title">scroll-demo</h1>
        <SearchBar backend={backend} store={store} />
        <JumpToIdInput store={store} />
      </div>
      <ChatViewport store={store} />
      <DebugBadge store={store} />
    </div>
  );
}
