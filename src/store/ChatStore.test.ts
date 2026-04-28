import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatStore } from "./ChatStore";
import type { ChatStoreConfig } from "./ChatStore";
import type { Region } from "./regions";
import type { Message } from "../backend/Message";
import type { MockBackend } from "../backend/MockBackend";

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

// ---- inflightCount in snapshot ----

describe("ChatStore snapshot inflightCount", () => {
  it("is 0 when no backend is configured", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    expect(store.getSnapshot().inflightCount).toBe(0);
  });
});

// ---- ensureRange + isLoadedOrInflight ----

function makeFakeBackend(
  getRange: (start: number, end: number, signal?: AbortSignal) => Promise<readonly Message[]>,
): MockBackend {
  return { getRange } as unknown as MockBackend;
}

type GetByIdResult = {
  readonly message: Message;
  readonly index: number;
  readonly before: readonly Message[];
  readonly after: readonly Message[];
};

function makeFakeBackendWithGetById(opts: {
  getRange?: (start: number, end: number, signal?: AbortSignal) => Promise<readonly Message[]>;
  getById: (id: string, signal?: AbortSignal) => Promise<GetByIdResult>;
}): MockBackend {
  const getRange =
    opts.getRange ??
    ((_start: number, _end: number): Promise<readonly Message[]> => Promise.resolve([]));
  return { getRange, getById: opts.getById } as unknown as MockBackend;
}

describe("ChatStore.ensureRange", () => {
  it("is a no-op when no backend is configured", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    // Should not throw
    store.ensureRange(0, 100);
    expect(store.getSnapshot().inflightCount).toBe(0);
  });

  it("triggers fetch → region is inserted after resolve", async () => {
    const backend = makeFakeBackend((start, end) => {
      const msgs: Message[] = [];
      for (let i = start; i < end; i++) msgs.push(makeMsg(i));
      return Promise.resolve(msgs);
    });

    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });
    store.ensureRange(0, 50);

    // In-flight before resolve
    expect(store.getSnapshot().inflightCount).toBe(1);

    // Let promise callbacks run (multiple rounds to flush promise chains)
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // After resolve, region should be loaded
    const snap = store.getSnapshot();
    expect(snap.regionCount).toBe(1);
    expect(snap.totalLoadedMessages).toBe(50);
    expect(snap.inflightCount).toBe(0);
  });

  it("clamps start/end to [0, totalCount)", () => {
    const getRange = vi.fn((start: number, end: number): Promise<readonly Message[]> => {
      const msgs: Message[] = [];
      for (let i = start; i < end; i++) msgs.push(makeMsg(i));
      return Promise.resolve(msgs);
    });
    const backend = makeFakeBackend(getRange);

    const store = new ChatStore({ ...DEFAULT_CONFIG, totalCount: 100, backend, chunkSize: 200 });
    store.ensureRange(-50, 150); // should clamp to [0, 100)

    expect(getRange).toHaveBeenCalledWith(0, 100, expect.anything());
  });
});

// ---- scheduleEvict ----

describe("ChatStore.scheduleEvict", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces: multiple rapid calls result in exactly one evict after 750 ms", () => {
    const store = new ChatStore({ ...DEFAULT_CONFIG, keepRadius: 50 });
    store.insertRegion(makeRegion(0, 10));
    store.insertRegion(makeRegion(900, 910));

    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();

    // Rapid-fire three times — only one evict should run
    store.scheduleEvict(false);
    store.scheduleEvict(false);
    store.scheduleEvict(false);

    vi.advanceTimersByTime(749);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    // evict fires once — regions changes from 2 to 1
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().regionCount).toBe(1);
  });

  it("each new call resets the 750 ms window", () => {
    const store = new ChatStore({ ...DEFAULT_CONFIG, keepRadius: 50 });
    store.insertRegion(makeRegion(0, 10));
    store.insertRegion(makeRegion(900, 910));

    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();

    store.scheduleEvict(false);
    vi.advanceTimersByTime(700);
    // Re-arm before it fires
    store.scheduleEvict(false);
    vi.advanceTimersByTime(749);
    // Should NOT have fired yet (re-armed at t=700, needs another 750 from there)
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("scheduleEvict after dispose is a no-op", () => {
    const store = new ChatStore({ ...DEFAULT_CONFIG, keepRadius: 50 });
    store.insertRegion(makeRegion(0, 10));
    store.insertRegion(makeRegion(900, 910));

    store.dispose();
    store.scheduleEvict(false);

    vi.advanceTimersByTime(1000);
    // No crash; regions unchanged (store is disposed, listeners cleared)
    // We can't check regionCount via subscription but evict would have mutated regions
    expect(store.getSnapshot().regionCount).toBe(2);
  });
});

// ---- I-3 regression: snapshot identity stable across no-op setHeight ----

describe("ChatStore I-3 regression: setHeight no-op preserves snapshot identity", () => {
  it("snapshot reference is unchanged when setHeight is called with the same value twice", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.setHeight(5, 80);
    const s1 = store.getSnapshot();
    // Second call with identical value — must be a no-op
    store.setHeight(5, 80);
    const s2 = store.getSnapshot();
    expect(s1).toBe(s2);
  });
});

describe("ChatStore.isLoadedOrInflight", () => {
  it("returns false when nothing is loaded and no fetch is in-flight", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    expect(store.isLoadedOrInflight(5)).toBe(false);
  });

  it("returns true for loaded index", () => {
    const store = new ChatStore(DEFAULT_CONFIG);
    store.insertRegion(makeRegion(0, 10));
    expect(store.isLoadedOrInflight(5)).toBe(true);
  });

  it("returns true for index covered by an in-flight fetch, before resolve", () => {
    const backend = makeFakeBackend(() => new Promise(() => {})); // never resolves
    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });

    store.ensureRange(0, 50);

    // Not loaded yet, but in-flight
    expect(store.isLoaded(25)).toBe(false);
    expect(store.isLoadedOrInflight(25)).toBe(true);
  });

  it("returns true for index after fetch resolves", async () => {
    const backend = makeFakeBackend((start, end) => {
      const msgs: Message[] = [];
      for (let i = start; i < end; i++) msgs.push(makeMsg(i));
      return Promise.resolve(msgs);
    });
    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });

    store.ensureRange(0, 50);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(store.isLoadedOrInflight(25)).toBe(true);
  });
});

// ---- jumpToId ----

describe("ChatStore.jumpToId", () => {
  it("inserts region and sets topIndex on valid id", async () => {
    const targetIndex = 500;
    const before = Array.from({ length: 3 }, (_, i) => makeMsg(targetIndex - 3 + i));
    const after = Array.from({ length: 3 }, (_, i) => makeMsg(targetIndex + 1 + i));
    const message = makeMsg(targetIndex);

    const backend = makeFakeBackendWithGetById({
      getById: (_id) =>
        Promise.resolve({ message, index: targetIndex, before, after }),
    });
    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });

    await store.jumpToId("msg-00000500");

    const snap = store.getSnapshot();
    expect(snap.topIndex).toBe(targetIndex);
    expect(snap.pixelOffset).toBe(0);
    // region spans [targetIndex-3, targetIndex+4)
    expect(snap.totalLoadedMessages).toBe(7);
    expect(snap.regionCount).toBe(1);
  });

  it("propagates rejection when backend rejects; store state unchanged", async () => {
    const backend = makeFakeBackendWithGetById({
      getById: (_id) => Promise.reject(new Error("not found")),
    });
    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });
    store.setTopIndex(10, 5);

    await expect(store.jumpToId("msg-00000999")).rejects.toThrow("not found");

    const snap = store.getSnapshot();
    // topIndex/pixelOffset unchanged
    expect(snap.topIndex).toBe(10);
    expect(snap.pixelOffset).toBe(5);
    expect(snap.regionCount).toBe(0);
  });

  it("throws when no backend is configured", async () => {
    const store = new ChatStore(DEFAULT_CONFIG); // no backend
    await expect(store.jumpToId("msg-00000001")).rejects.toThrow("no backend configured");
  });

  it("is a no-op after dispose (resolves without throw)", async () => {
    const backend = makeFakeBackendWithGetById({
      getById: (_id) => Promise.resolve({ message: makeMsg(0), index: 0, before: [], after: [] }),
    });
    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });
    store.dispose();
    // Should resolve, not throw
    await expect(store.jumpToId("msg-00000001")).resolves.toBeUndefined();
  });

  it("aborts in-flight getRange fetches before issuing getById", async () => {
    let rangeAborted = false;
    // getRange never resolves so we can confirm abort
    const getRange = (_start: number, _end: number, signal?: AbortSignal): Promise<readonly Message[]> =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          rangeAborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      });

    const backend = makeFakeBackendWithGetById({
      getRange,
      getById: (_id) =>
        Promise.resolve({ message: makeMsg(100), index: 100, before: [], after: [] }),
    });
    const store = new ChatStore({ ...DEFAULT_CONFIG, backend, chunkSize: 100 });

    // Start a range fetch that will be in-flight
    store.ensureRange(0, 50);
    expect(store.getSnapshot().inflightCount).toBe(1);

    // jumpToId should abort the range fetch then resolve
    await store.jumpToId("msg-00000100");

    expect(rangeAborted).toBe(true);
  });
});
