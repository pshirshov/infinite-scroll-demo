import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockBackend } from "./MockBackend.js";
import { indexToId, idToIndex } from "./Message.js";

const BASE_CONFIG = {
  totalCount: 1000,
  seed: 42,
  baseTs: 1_700_000_000_000,
  avgGapMs: 120_000,
  minLatencyMs: 0,
  maxLatencyMs: 0,
};

describe("indexToId / idToIndex round-trip", () => {
  it("encodes zero-padded 8-digit IDs", () => {
    expect(indexToId(0)).toBe("msg-00000000");
    expect(indexToId(1234)).toBe("msg-00001234");
    expect(indexToId(99999999)).toBe("msg-99999999");
  });

  it("round-trips several indices", () => {
    for (const i of [0, 1, 42, 999, 12345678]) {
      expect(idToIndex(indexToId(i))).toBe(i);
    }
  });

  it("throws on missing prefix", () => {
    expect(() => idToIndex("00001234")).toThrow();
  });

  it("throws on wrong digit count", () => {
    expect(() => idToIndex("msg-123")).toThrow();
    expect(() => idToIndex("msg-000000001")).toThrow();
  });

  it("throws on non-numeric digits", () => {
    expect(() => idToIndex("msg-0000abcd")).toThrow();
  });

  // D07 — trailing junk must be rejected
  it("throws on trailing junk after digits", () => {
    expect(() => idToIndex("msg-00001234extra")).toThrow();
  });

  // D01 — indexToId validation
  it("accepts valid boundary indices", () => {
    expect(indexToId(0)).toBe("msg-00000000");
    expect(indexToId(99_999_999)).toBe("msg-99999999");
  });

  it("rejects out-of-range and non-integer inputs", () => {
    expect(() => indexToId(-1)).toThrow("indexToId: index out of range");
    expect(() => indexToId(100_000_000)).toThrow("indexToId: index out of range");
    expect(() => indexToId(1.5)).toThrow("indexToId: index out of range");
    expect(() => indexToId(NaN)).toThrow("indexToId: index out of range");
  });
});

describe("Determinism", () => {
  it("two backends with same (seed, baseTs) produce identical getRange output", async () => {
    const a = new MockBackend(BASE_CONFIG);
    const b = new MockBackend(BASE_CONFIG);
    const ra = await a.getRange(10, 20);
    const rb = await b.getRange(10, 20);
    expect(ra).toEqual(rb);
  });

  it("same index always produces same message", async () => {
    const backend = new MockBackend(BASE_CONFIG);
    const [first] = await backend.getRange(100, 101);
    const [second] = await backend.getRange(100, 101);
    expect(first).toEqual(second);
  });
});

describe("getRange clamping and invariants", () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend(BASE_CONFIG);
  });

  it("clamps negative start to 0", async () => {
    const msgs = await backend.getRange(-5, 10);
    expect(msgs.length).toBe(10);
    expect(msgs[0]!.index).toBe(0);
    expect(msgs[9]!.index).toBe(9);
  });

  it("clamps end beyond totalCount", async () => {
    const N = BASE_CONFIG.totalCount;
    const msgs = await backend.getRange(N - 2, N + 5);
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.index).toBe(N - 2);
    expect(msgs[1]!.index).toBe(N - 1);
  });

  it("throws on inverted range", async () => {
    await expect(backend.getRange(10, 5)).rejects.toThrow();
  });

  it("messages are in index order with correct indices", async () => {
    const start = 50;
    const end = 70;
    const msgs = await backend.getRange(start, end);
    expect(msgs.length).toBe(end - start);
    for (let i = 0; i < msgs.length; i++) {
      expect(msgs[i]!.index).toBe(start + i);
    }
  });

  it("IDs match indices", async () => {
    const msgs = await backend.getRange(0, 5);
    for (const msg of msgs) {
      expect(msg.id).toBe(indexToId(msg.index));
    }
  });
});

describe("getById", () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend(BASE_CONFIG);
  });

  it("resolves message at expected index", async () => {
    const result = await backend.getById("msg-00000123");
    expect(result.message.index).toBe(123);
    expect(result.index).toBe(123);
  });

  it("before contains up to 50 messages before target in order", async () => {
    const result = await backend.getById("msg-00000123");
    expect(result.before.length).toBe(50);
    const first = result.before[0]!;
    const last = result.before[result.before.length - 1]!;
    expect(first.index).toBe(73);
    expect(last.index).toBe(122);
    for (let i = 0; i < result.before.length - 1; i++) {
      expect(result.before[i]!.index).toBeLessThan(result.before[i + 1]!.index);
    }
  });

  it("after contains up to 50 messages after target in order", async () => {
    const result = await backend.getById("msg-00000123");
    expect(result.after.length).toBe(50);
    expect(result.after[0]!.index).toBe(124);
    expect(result.after[49]!.index).toBe(173);
  });

  it("fewer before messages near the start", async () => {
    const result = await backend.getById("msg-00000005");
    expect(result.before.length).toBe(5);
    expect(result.before[0]!.index).toBe(0);
    expect(result.before[4]!.index).toBe(4);
  });

  it("fewer after messages near the end", async () => {
    const N = BASE_CONFIG.totalCount;
    const result = await backend.getById(indexToId(N - 2));
    expect(result.after.length).toBe(1);
    expect(result.after[0]!.index).toBe(N - 1);
  });

  it("throws for out-of-range index", async () => {
    await expect(
      backend.getById(indexToId(BASE_CONFIG.totalCount)),
    ).rejects.toThrow();
  });

  it("throws for malformed id", async () => {
    await expect(backend.getById("bad-id")).rejects.toThrow();
  });
});

describe("getLatest", () => {
  it("returns last count messages with correct startIndex", async () => {
    const N = 1000;
    const backend = new MockBackend({ ...BASE_CONFIG, totalCount: N });
    const result = await backend.getLatest(10);
    expect(result.messages.length).toBe(10);
    expect(result.startIndex).toBe(990);
    expect(result.messages[0]!.index).toBe(990);
    expect(result.messages[9]!.index).toBe(999);
  });

  it("returns all messages when count >= totalCount", async () => {
    const N = 5;
    const backend = new MockBackend({ ...BASE_CONFIG, totalCount: N });
    const result = await backend.getLatest(100);
    expect(result.messages.length).toBe(N);
    expect(result.startIndex).toBe(0);
  });
});

describe("search", () => {
  let backend: MockBackend;

  beforeEach(() => {
    backend = new MockBackend(BASE_CONFIG);
  });

  it("empty query returns empty array without scanning", async () => {
    const result = await backend.search("   ");
    expect(result).toEqual([]);
  });

  it("finds known token 'the' in generated content", async () => {
    const result = await backend.search("the");
    expect(result.length).toBeGreaterThan(0);
  });

  it("hits are in increasing index order", async () => {
    const result = await backend.search("the");
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.index).toBeLessThan(result[i + 1]!.index);
    }
  });

  it("respects hit budget (max 50 hits)", async () => {
    const result = await backend.search("the");
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("snippet contains the matched token (case-insensitive)", async () => {
    const result = await backend.search("The");
    for (const hit of result) {
      expect(hit.snippet.toLowerCase()).toContain("the");
    }
  });

  it("returns empty for a query that matches nothing", async () => {
    // Use a string unlikely to appear in any generated word
    const result = await backend.search("xyzzyquux");
    expect(result).toEqual([]);
  });

  // D02 — case-insensitivity: lower and upper queries must return same hits
  it("search is case-insensitive: 'the' and 'THE' return identical hits", async () => {
    const smallBackend = new MockBackend({ ...BASE_CONFIG, totalCount: 500 });
    const hits1 = await smallBackend.search("the");
    const hits2 = await smallBackend.search("THE");
    expect(hits1.length).toBe(hits2.length);
    for (let i = 0; i < hits1.length; i++) {
      expect(hits1[i]!.index).toBe(hits2[i]!.index);
    }
  });

  // D03 — searchScanBudget cap: restricted backend only sees indices < budget
  it("searchScanBudget limits the indices scanned", async () => {
    const restrictedBackend = new MockBackend({
      ...BASE_CONFIG,
      totalCount: 100,
      searchScanBudget: 10,
    });
    const unrestrictedBackend = new MockBackend({
      ...BASE_CONFIG,
      totalCount: 100,
    });

    const restrictedHits = await restrictedBackend.search("the");
    const unrestrictedHits = await unrestrictedBackend.search("the");

    // All restricted hits must be at index < 10
    for (const hit of restrictedHits) {
      expect(hit.index).toBeLessThan(10);
    }

    // The unrestricted backend finds hits at index >= 10, proving the budget constrained
    const hitsAtOrBeyond10 = unrestrictedHits.filter((h) => h.index >= 10);
    expect(hitsAtOrBeyond10.length).toBeGreaterThan(0);
  });
});

describe("subscribeNew", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits new message event after one tick", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      liveTickMs: 1000,
    });
    const N = backend.getTotalCount();
    const events: Array<{ newTotalCount: number; message: { index: number } }> = [];

    const unsub = backend.subscribeNew((e) => events.push(e));

    await vi.advanceTimersByTimeAsync(1000);

    expect(events.length).toBe(1);
    expect(events[0]!.newTotalCount).toBe(N + 1);
    expect(events[0]!.message.index).toBe(N);

    unsub();
  });

  it("subsequent getRange returns the emitted message", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      liveTickMs: 1000,
    });
    const N = backend.getTotalCount();

    let emittedMessage: { index: number; id: string } | undefined;
    const unsub = backend.subscribeNew((e) => {
      emittedMessage = e.message;
    });

    await vi.advanceTimersByTimeAsync(1000);
    unsub();

    expect(emittedMessage).toBeDefined();
    expect(emittedMessage!.index).toBe(N);

    // Now N has been incremented; getRange should include the new message.
    // Advance timers to let the zero-ms delay() settle (fake timers intercept setTimeout).
    const rangePromise = backend.getRange(N, N + 1);
    await vi.runAllTimersAsync();
    const range = await rangePromise;
    expect(range.length).toBe(1);
    expect(range[0]!.index).toBe(N);
    // The emitted message and the re-fetched one are deterministically the same
    expect(range[0]!.id).toBe(emittedMessage!.id);
    // D06 — assert full structural equality, not just id
    expect(range[0]!).toEqual(emittedMessage!);
  });

  it("unsubscribe stops emissions", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      liveTickMs: 1000,
    });
    const events: unknown[] = [];
    const unsub = backend.subscribeNew((e) => events.push(e));

    await vi.advanceTimersByTimeAsync(1000);
    expect(events.length).toBe(1);

    unsub();

    await vi.advanceTimersByTimeAsync(3000);
    expect(events.length).toBe(1); // no more events
  });

  it("multiple subscribers receive the same event", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      liveTickMs: 1000,
    });
    const received1: unknown[] = [];
    const received2: unknown[] = [];

    const unsub1 = backend.subscribeNew((e) => received1.push(e));
    const unsub2 = backend.subscribeNew((e) => received2.push(e));

    await vi.advanceTimersByTimeAsync(1000);

    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);
    expect(received1[0]).toEqual(received2[0]);

    unsub1();
    unsub2();
  });

  it("interval re-starts when a new subscriber joins after all unsubscribed", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      liveTickMs: 1000,
    });
    const events1: unknown[] = [];
    const unsub1 = backend.subscribeNew((e) => events1.push(e));
    await vi.advanceTimersByTimeAsync(1000);
    unsub1();
    expect(events1.length).toBe(1);

    const events2: unknown[] = [];
    const unsub2 = backend.subscribeNew((e) => events2.push(e));
    await vi.advanceTimersByTimeAsync(1000);
    expect(events2.length).toBe(1);
    unsub2();
  });
});

describe("Latency determinism", () => {
  // D05 — two backends with same config and seed produce the same latency sequence
  it("same seed produces identical latency sequence via peekNextLatencyMs", () => {
    const latencyConfig = {
      ...BASE_CONFIG,
      minLatencyMs: 10,
      maxLatencyMs: 20,
    };
    const a = new MockBackend(latencyConfig);
    const b = new MockBackend(latencyConfig);

    const seqA = Array.from({ length: 10 }, () => a.peekNextLatencyMs());
    const seqB = Array.from({ length: 10 }, () => b.peekNextLatencyMs());

    expect(seqA).toEqual(seqB);
    // Also verify values are within range
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe("Abort signal", () => {
  it("getRange rejects with AbortError when signal fires", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      minLatencyMs: 100,
      maxLatencyMs: 100,
    });
    const controller = new AbortController();

    const promise = backend.getRange(0, 10, controller.signal);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("getRange rejects immediately if signal is already aborted", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      minLatencyMs: 100,
      maxLatencyMs: 100,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      backend.getRange(0, 10, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("search rejects with AbortError when signal fires", async () => {
    const backend = new MockBackend({
      ...BASE_CONFIG,
      minLatencyMs: 100,
      maxLatencyMs: 100,
    });
    const controller = new AbortController();
    const promise = backend.search("the", controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
