import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchCoordinator } from "./fetchCoordinator";
import type { FetchCoordinatorParams } from "./fetchCoordinator";
import type { Region } from "./regions";
import type { Message } from "../backend/Message";

// ---- helpers ----

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

type GetRangeFn = (start: number, end: number, signal?: AbortSignal) => Promise<readonly Message[]>;

/** Minimal backend double: resolves each chunk immediately with generated messages. */
function makeFakeBackend(getRange: GetRangeFn = defaultGetRange) {
  return { getRange } as unknown as import("../backend/MockBackend").MockBackend;
}

function defaultGetRange(start: number, end: number): Promise<readonly Message[]> {
  const msgs: Message[] = [];
  for (let i = start; i < end; i++) msgs.push(makeMsg(i));
  return Promise.resolve(msgs);
}

/** Deferred: caller controls when the promise resolves/rejects. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flush all pending microtasks. */
async function flushMicrotasks(): Promise<void> {
  // Multiple rounds to drain chains of .then/.catch
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

// ---- tests ----

describe("FetchCoordinator.ensureRange — basic chunking", () => {
  it("issues 3 fetches for [0, 250) with chunkSize=100 when no regions exist", () => {
    const onChunk = vi.fn();
    const getRange = vi.fn(defaultGetRange);
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(getRange),
      chunkSize: 100,
      onChunk,
    });

    fc.ensureRange({ start: 0, end: 250, currentRegions: [] });

    const keys = fc.inflightKeysForTest();
    expect(keys).toHaveLength(3);
    expect(keys).toContain("0-100");
    expect(keys).toContain("100-200");
    expect(keys).toContain("200-250");
    expect(fc.inflightCount()).toBe(3);

    fc.dispose();
  });

  it("issues a single fetch when range fits in one chunk", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 0, end: 50, currentRegions: [] });
    expect(fc.inflightCount()).toBe(1);
    expect(fc.inflightKeysForTest()).toContain("0-50");
    fc.dispose();
  });

  it("issues no fetches when range is already loaded", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({
      start: 0,
      end: 100,
      currentRegions: [makeRegion(0, 100)],
    });
    expect(fc.inflightCount()).toBe(0);
    fc.dispose();
  });
});

describe("FetchCoordinator.ensureRange — coalescing", () => {
  it("does not duplicate fetches when called twice with same range before resolve", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 0, end: 200, currentRegions: [] });
    // Second call with identical range — no new fetches
    fc.ensureRange({ start: 0, end: 200, currentRegions: [] });

    // Still only [0-100) and [100-200) — no duplicates
    expect(fc.inflightCount()).toBe(2);
    expect(fc.inflightKeysForTest()).toEqual(expect.arrayContaining(["0-100", "100-200"]));
    fc.dispose();
  });

  it("only issues fetches for missing chunks on second call with extended range", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    expect(fc.inflightCount()).toBe(1);

    // Extend to [0, 200): [0,100) already in-flight, [100,200) is new
    fc.ensureRange({ start: 0, end: 200, currentRegions: [] });
    expect(fc.inflightCount()).toBe(2);
    expect(fc.inflightKeysForTest()).toContain("100-200");
    fc.dispose();
  });
});

describe("FetchCoordinator.ensureRange — skips already-loaded subranges", () => {
  it("skips loaded middle, fetches both ends", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    // Region [50, 150) is loaded; request [0, 260) → gaps: [0,50) and [150,260)
    // Gap [0,50): one chunk "0-50"
    // Gap [150,260): size=110 → two chunks "150-250" and "250-260"
    fc.ensureRange({
      start: 0,
      end: 260,
      currentRegions: [makeRegion(50, 150)],
    });

    const keys = fc.inflightKeysForTest();
    expect(keys).toContain("0-50");
    expect(keys).toContain("150-250");
    expect(keys).toContain("250-260");
    expect(keys).not.toContain("50-100");
    expect(keys).not.toContain("100-150");
    fc.dispose();
  });
});

describe("FetchCoordinator.onChunk fires per resolved chunk", () => {
  it("onChunk is called with correct region when a chunk resolves", async () => {
    const onChunk = vi.fn<(region: Region) => void>();
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk,
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });

    // Allow microtasks / promise callbacks to flush
    await flushMicrotasks();

    expect(onChunk).toHaveBeenCalledTimes(1);
    const region = onChunk.mock.calls[0]![0] as Region;
    expect(region.startIndex).toBe(0);
    expect(region.endIndex).toBe(100);
    expect(region.messages).toHaveLength(100);
  });

  it("onChunk is called once per chunk when multiple chunks resolve", async () => {
    const onChunk = vi.fn<(region: Region) => void>();
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk,
    });

    fc.ensureRange({ start: 0, end: 250, currentRegions: [] });
    await flushMicrotasks();

    expect(onChunk).toHaveBeenCalledTimes(3);
  });

  it("inflightCount drops to 0 after all chunks resolve", async () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 0, end: 200, currentRegions: [] });
    expect(fc.inflightCount()).toBe(2);

    await flushMicrotasks();

    expect(fc.inflightCount()).toBe(0);
  });
});

describe("FetchCoordinator.abortOutside", () => {
  it("keeps chunks overlapping the keep range, aborts chunks fully outside", () => {
    const deferreds = new Map<string, Deferred<readonly Message[]>>();

    const getRange: GetRangeFn = (start, end) => {
      const key = `${start}-${end}`;
      const d = deferred<readonly Message[]>();
      deferreds.set(key, d);
      return d.promise;
    };

    const fc = new FetchCoordinator({
      backend: makeFakeBackend(getRange),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    // Issue fetches for [0,100), [100,200), [500,600)
    fc.ensureRange({ start: 0, end: 200, currentRegions: [] });
    fc.ensureRange({ start: 500, end: 600, currentRegions: [] });
    expect(fc.inflightCount()).toBe(3);

    // Keep [0, 200) — only [500,600) should be aborted
    fc.abortOutside(0, 200);

    expect(fc.inflightCount()).toBe(2);
    expect(fc.inflightKeysForTest()).toContain("0-100");
    expect(fc.inflightKeysForTest()).toContain("100-200");
    expect(fc.inflightKeysForTest()).not.toContain("500-600");

    fc.dispose();
  });

  it("aborts chunk whose signal is passed to the backend", async () => {
    let capturedSignal: AbortSignal | undefined;

    const getRange: GetRangeFn = (_start, _end, signal) => {
      capturedSignal = signal;
      // Never resolves on its own — only via signal
      return new Promise<readonly Message[]>(() => {});
    };

    const fc = new FetchCoordinator({
      backend: makeFakeBackend(getRange),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 500, end: 600, currentRegions: [] });
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    fc.abortOutside(0, 100); // [500,600) is outside [0,100)
    expect(capturedSignal!.aborted).toBe(true);

    fc.dispose();
  });
});

describe("FetchCoordinator inflightCount on reject / abort", () => {
  it("inflightCount drops when a fetch rejects with AbortError", async () => {
    const getRange: GetRangeFn = () =>
      Promise.reject(new DOMException("aborted", "AbortError"));

    const fc = new FetchCoordinator({
      backend: makeFakeBackend(getRange),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    expect(fc.inflightCount()).toBe(1);

    await flushMicrotasks();

    expect(fc.inflightCount()).toBe(0);
  });

  it("onError is called with the error when a fetch rejects", async () => {
    const err = new Error("network failure");
    const getRange: GetRangeFn = () => Promise.reject(err);
    const onError = vi.fn();

    const fc = new FetchCoordinator({
      backend: makeFakeBackend(getRange),
      chunkSize: 100,
      onChunk: vi.fn(),
      onError,
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(0, 100, err);
  });
});

describe("FetchCoordinator.dispose", () => {
  it("clears all in-flight fetches on dispose", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(() => new Promise(() => {})),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 0, end: 300, currentRegions: [] });
    expect(fc.inflightCount()).toBe(3);

    fc.dispose();
    expect(fc.inflightCount()).toBe(0);
  });
});

describe("FetchCoordinator — D01: resolved-after-aborted race", () => {
  it("does not call onChunk when promise resolves after abort", async () => {
    const d = deferred<readonly Message[]>();
    const onChunk = vi.fn();
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(() => d.promise),
      chunkSize: 100,
      onChunk,
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    // Abort the in-flight chunk via abortOutside
    fc.abortOutside(500, 600);
    // Now resolve the promise — onChunk must NOT fire
    d.resolve([makeMsg(0)]);

    await flushMicrotasks();

    expect(onChunk).not.toHaveBeenCalled();
  });
});

describe("FetchCoordinator — D09: dispose-during-pending-resolve", () => {
  it("does not call onChunk or onError when dispose() is called before promise settles", async () => {
    const d = deferred<readonly Message[]>();
    const onChunk = vi.fn();
    const onError = vi.fn();
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(() => d.promise),
      chunkSize: 100,
      onChunk,
      onError,
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    fc.dispose();
    // Resolve after dispose — neither callback should fire
    d.resolve([makeMsg(0)]);

    await flushMicrotasks();

    expect(onChunk).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not call onError when dispose() is called before promise rejects", async () => {
    const d = deferred<readonly Message[]>();
    const onError = vi.fn();
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(() => d.promise),
      chunkSize: 100,
      onChunk: vi.fn(),
      onError,
    });

    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    fc.dispose();
    d.reject(new Error("network failure"));

    await flushMicrotasks();

    expect(onError).not.toHaveBeenCalled();
  });
});

describe("FetchCoordinator — D07: chunkSize validation", () => {
  it("throws when chunkSize is 0", () => {
    expect(() =>
      new FetchCoordinator({ backend: makeFakeBackend(), chunkSize: 0, onChunk: vi.fn() })
    ).toThrow("FetchCoordinator: chunkSize must be >= 1");
  });

  it("throws when chunkSize is negative", () => {
    expect(() =>
      new FetchCoordinator({ backend: makeFakeBackend(), chunkSize: -5, onChunk: vi.fn() })
    ).toThrow("FetchCoordinator: chunkSize must be >= 1");
  });
});

describe("FetchCoordinator — empty range no-op", () => {
  it("issues no fetches when start === end", () => {
    const fc = new FetchCoordinator({
      backend: makeFakeBackend(),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    fc.ensureRange({ start: 50, end: 50, currentRegions: [] });
    expect(fc.inflightCount()).toBe(0);
    fc.dispose();
  });
});

describe("FetchCoordinator — re-issue after abort", () => {
  it("re-issues a fetch after the previous one was aborted via abortOutside", async () => {
    const calls: Array<{ start: number; end: number }> = [];
    const deferreds: Deferred<readonly Message[]>[] = [];

    const getRange: GetRangeFn = (start, end) => {
      calls.push({ start, end });
      const d = deferred<readonly Message[]>();
      deferreds.push(d);
      return d.promise;
    };

    const fc = new FetchCoordinator({
      backend: makeFakeBackend(getRange),
      chunkSize: 100,
      onChunk: vi.fn(),
    });

    // First issue
    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    expect(fc.inflightCount()).toBe(1);

    // Abort it (chunk [0,100) is outside [500,600))
    fc.abortOutside(500, 600);
    expect(fc.inflightCount()).toBe(0);

    // Allow the aborted promise to settle so inflight is fully cleaned up
    await flushMicrotasks();

    // Re-issue — must start a new fetch
    fc.ensureRange({ start: 0, end: 100, currentRegions: [] });
    expect(fc.inflightCount()).toBe(1);
    expect(fc.inflightKeysForTest()).toContain("0-100");

    fc.dispose();
  });
});
