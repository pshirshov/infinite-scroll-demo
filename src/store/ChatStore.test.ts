import { describe, it, expect, vi } from "vitest";
import { ChatStore } from "./ChatStore";
import type { ChatStoreConfig } from "./ChatStore";
import type { Region } from "./regions";
import type { Message } from "../backend/Message";

function makeMsg(index: number): Message {
  return {
    id: `msg-${String(index).padStart(8, "0")}`,
    index,
    authorId: "u0",
    authorName: "User",
    ts: index * 1000,
    body: `body ${index}`,
    kind: "text",
  };
}

function makeRegion(start: number, end: number): Region {
  const messages: Message[] = [];
  for (let i = start; i < end; i++) messages.push(makeMsg(i));
  return { startIndex: start, endIndex: end, messages };
}

const DEFAULT_CONFIG: ChatStoreConfig = {
  totalCount: 1000,
  estimatedRowHeight: 60,
  keepRadius: 50,
};

// ---- Observable ----

describe("ChatStore observable", () => {
  it("subscribe returns an unsubscribe function", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const unsub = store.subscribe(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("listener is called on insertRegion", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.insertRegion(makeRegion(0, 10));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listener is called on setHeight", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setHeight(5, 80);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listener is called on setTopIndex", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setTopIndex(10, 5);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listener is called on setTotalCount", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setTotalCount(2000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listener is called on evict", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.evict({ protectTail: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribed listener is NOT called", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.insertRegion(makeRegion(0, 5));
    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple listeners: all notified; unsubscribe one, other still fires", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const l1 = vi.fn();
    const l2 = vi.fn();
    const unsub1 = store.subscribe(l1);
    store.subscribe(l2);

    store.setTotalCount(500);
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);

    unsub1();
    store.setTotalCount(600);
    expect(l1).toHaveBeenCalledTimes(1); // no new call
    expect(l2).toHaveBeenCalledTimes(2);
  });

  it("each mutator notifies listeners exactly once", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.insertRegion(makeRegion(0, 5));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---- Snapshot identity ----

describe("ChatStore snapshot identity", () => {
  it("two consecutive getSnapshot() calls without mutation return the same reference", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const s1 = store.getSnapshot();
    const s2 = store.getSnapshot();
    expect(s1).toBe(s2);
  });

  it("after a mutation, a new snapshot reference is returned", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const s1 = store.getSnapshot();
    store.insertRegion(makeRegion(0, 5));
    const s2 = store.getSnapshot();
    expect(s1).not.toBe(s2);
  });

  it("snapshot is stable again after the second call post-mutation", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 5));
    const s1 = store.getSnapshot();
    const s2 = store.getSnapshot();
    expect(s1).toBe(s2);
  });
});

// ---- Snapshot contents after insertRegion ----

describe("ChatStore snapshot regionCount / totalLoadedMessages", () => {
  it("starts at zero", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(0);
    expect(snap.totalLoadedMessages).toBe(0);
  });

  it("reflects inserted region", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 10));
    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(1);
    expect(snap.totalLoadedMessages).toBe(10);
  });

  it("reflects merged regions", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 10));
    store.insertRegion(makeRegion(10, 20));
    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(1); // adjacent → merged
    expect(snap.totalLoadedMessages).toBe(20);
  });

  it("reflects two disjoint regions", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 10));
    store.insertRegion(makeRegion(20, 30));
    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(2);
    expect(snap.totalLoadedMessages).toBe(20);
  });
});

// ---- setHeight idempotence ----

describe("ChatStore setHeight idempotence", () => {
  it("setting same height twice does NOT notify listener the second time", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.setHeight(5, 80);
    store.subscribe(listener);
    store.setHeight(5, 80); // same value
    expect(listener).not.toHaveBeenCalled();
  });

  it("setting different height notifies", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.setHeight(5, 80);
    store.subscribe(listener);
    store.setHeight(5, 100); // different
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---- getHeight ----

describe("ChatStore getHeight", () => {
  it("returns estimate when no measured height exists", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    expect(store.getHeight(5)).toBe(60); // estimatedRowHeight
  });

  it("returns measured height after setHeight", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.setHeight(5, 120);
    expect(store.getHeight(5)).toBe(120);
  });

  it("hasHeight returns false before measurement, true after", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    expect(store.hasHeight(5)).toBe(false);
    store.setHeight(5, 80);
    expect(store.hasHeight(5)).toBe(true);
  });
});

// ---- evict ----

describe("ChatStore evict", () => {
  it("removes far regions and clears heights for evicted-and-out-of-band indices", () => {
    // keepRadius=50, topIndex=0; a region at [900,910) is far
    const store = new ChatStore({ ...DEFAULT_CONFIG, keepRadius: 50 });
    store.insertRegion(makeRegion(0, 10));    // near — kept
    store.insertRegion(makeRegion(900, 910)); // far — evicted

    // Set heights for both regions
    for (let i = 0; i < 10; i++) store.setHeight(i, 80);
    for (let i = 900; i < 910; i++) store.setHeight(i, 80);

    store.evict({ protectTail: false });

    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(1);
    expect(snap.totalLoadedMessages).toBe(10);

    // Heights for evicted indices (900-909) should be cleared (they're well outside band)
    for (let i = 900; i < 910; i++) {
      expect(store.hasHeight(i)).toBe(false);
    }
    // Heights for kept region should remain
    for (let i = 0; i < 10; i++) {
      expect(store.hasHeight(i)).toBe(true);
    }
  });

  it("keeps tail region when protectTail=true", () => {
    const store = new ChatStore({ ...DEFAULT_CONFIG, totalCount: 1000, keepRadius: 50 });
    store.insertRegion(makeRegion(0, 10));    // near
    store.insertRegion(makeRegion(990, 1000)); // tail region

    store.evict({ protectTail: true });

    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(2);
  });

  it("evicts tail region when protectTail=false", () => {
    const store = new ChatStore({ ...DEFAULT_CONFIG, totalCount: 1000, keepRadius: 50 });
    store.insertRegion(makeRegion(0, 10));    // near
    store.insertRegion(makeRegion(990, 1000)); // tail region

    store.evict({ protectTail: false });

    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(1);
  });

  it("clears heights for evicted indices — getHeightMapSizeForTest decreases to 0", () => {
    // keepRadius=100, topIndex=0; region at [10000, 10010) is far outside 2*keepRadius band
    const store = new ChatStore({ ...DEFAULT_CONFIG, keepRadius: 100 });
    store.insertRegion(makeRegion(10000, 10010));
    store.setHeight(10005, 80);
    store.setHeight(10000, 70);
    expect(store.getHeightMapSizeForTest()).toBe(2);

    store.evict({ protectTail: false });

    expect(store.getHeightMapSizeForTest()).toBe(0);
  });
});

// ---- setTopIndex / setTotalCount ----

describe("ChatStore setTopIndex and setTotalCount", () => {
  it("setTopIndex is reflected in snapshot", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.setTopIndex(42, 15);
    const snap = store.getSnapshot();
    expect(snap.topIndex).toBe(42);
    expect(snap.pixelOffset).toBe(15);
  });

  it("setTotalCount is reflected in snapshot", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.setTotalCount(5000);
    const snap = store.getSnapshot();
    expect(snap.totalCount).toBe(5000);
  });

  it("setTopIndex triggers notify", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setTopIndex(10, 0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setTotalCount triggers notify", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setTotalCount(2000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---- findMessage / isLoaded / unloadedSubranges delegation ----

describe("ChatStore delegation to regions", () => {
  it("findMessage returns message when loaded", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 10));
    const msg = store.findMessage(5);
    expect(msg).toBeDefined();
    expect(msg!.index).toBe(5);
  });

  it("findMessage returns undefined when not loaded", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    expect(store.findMessage(5)).toBeUndefined();
  });

  it("isLoaded returns correct values", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 10));
    expect(store.isLoaded(5)).toBe(true);
    expect(store.isLoaded(15)).toBe(false);
  });

  it("unloadedSubranges returns gap between loaded regions", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 5));
    store.insertRegion(makeRegion(10, 15));
    const gaps = store.unloadedSubranges(0, 15);
    expect(gaps).toEqual([{ start: 5, end: 10 }]);
  });
});
