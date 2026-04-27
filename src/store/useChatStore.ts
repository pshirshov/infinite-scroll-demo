import { useSyncExternalStore, useRef } from "react";
import type { ChatStore, ChatStoreSnapshot } from "./ChatStore";

/** Subscribe to the full snapshot. */
export function useChatStoreSnapshot(store: ChatStore): ChatStoreSnapshot {
  return useSyncExternalStore(
    store.subscribe.bind(store),
    store.getSnapshot.bind(store),
  );
}

/**
 * Subscribe to a derived value.
 * The selector MUST be stable (module-level const or useCallback).
 * Caches the last result by snapshot identity to avoid churn on unrelated store updates.
 */
export function useChatStoreSelector<T>(
  store: ChatStore,
  selector: (s: ChatStoreSnapshot) => T,
): T {
  // Cache keyed on snapshot reference: if snapshot didn't change, return prior result.
  const cacheRef = useRef<{ snapshot: ChatStoreSnapshot; value: T } | null>(null);

  return useSyncExternalStore(
    store.subscribe.bind(store),
    () => {
      const snapshot = store.getSnapshot();
      const cached = cacheRef.current;
      if (cached !== null && cached.snapshot === snapshot) {
        return cached.value;
      }
      const value = selector(snapshot);
      cacheRef.current = { snapshot, value };
      return value;
    },
  );
}
