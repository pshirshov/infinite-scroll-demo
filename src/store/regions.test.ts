import { describe, it, expect } from "vitest";
import { mulberry32 } from "../backend/prng";
import {
  type Region,
  assertRegionInvariants,
  assertRegionListInvariants,
  insertRegion,
  findMessage,
  evictFarRegions,
  isLoaded,
  unloadedSubranges,
} from "./regions";
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
  for (let i = start; i < end; i++) {
    messages.push(makeMsg(i));
  }
  return { startIndex: start, endIndex: end, messages };
}

// A variant that returns messages with altered bodies (simulates newer content)
function makeRegionNewer(start: number, end: number): Region {
  const messages: Message[] = [];
  for (let i = start; i < end; i++) {
    messages.push({ ...makeMsg(i), body: `newer body ${i}` });
  }
  return { startIndex: start, endIndex: end, messages };
}

// ---- assertRegionInvariants ----

describe("assertRegionInvariants", () => {
  it("passes for a valid region", () => {
    expect(() => assertRegionInvariants(makeRegion(0, 3))).not.toThrow();
  });

  it("throws when startIndex < 0", () => {
    expect(() =>
      assertRegionInvariants({ startIndex: -1, endIndex: 1, messages: [makeMsg(-1)] }),
    ).toThrow();
  });

  it("throws when endIndex <= startIndex", () => {
    expect(() =>
      assertRegionInvariants({ startIndex: 5, endIndex: 5, messages: [] }),
    ).toThrow();
  });

  it("throws when messages.length !== endIndex - startIndex", () => {
    expect(() =>
      assertRegionInvariants({ startIndex: 0, endIndex: 3, messages: [makeMsg(0)] }),
    ).toThrow();
  });

  it("throws when messages[i].index !== startIndex + i", () => {
    const msgs = [makeMsg(0), makeMsg(2)]; // index 2 is wrong for slot 1
    expect(() =>
      assertRegionInvariants({ startIndex: 0, endIndex: 2, messages: msgs }),
    ).toThrow();
  });
});

// ---- assertRegionListInvariants ----

describe("assertRegionListInvariants", () => {
  it("passes for empty list", () => {
    expect(() => assertRegionListInvariants([])).not.toThrow();
  });

  it("passes for single region", () => {
    expect(() => assertRegionListInvariants([makeRegion(0, 5)])).not.toThrow();
  });

  it("passes for two non-adjacent, non-overlapping regions", () => {
    expect(() => assertRegionListInvariants([makeRegion(0, 5), makeRegion(7, 10)])).not.toThrow();
  });

  it("throws for unsorted list", () => {
    expect(() =>
      assertRegionListInvariants([makeRegion(5, 10), makeRegion(0, 3)]),
    ).toThrow();
  });

  it("throws for overlapping regions", () => {
    // Manually construct overlapping — can't use insertRegion since that merges them
    const r1: Region = { startIndex: 0, endIndex: 5, messages: [makeMsg(0), makeMsg(1), makeMsg(2), makeMsg(3), makeMsg(4)] };
    const r2: Region = { startIndex: 3, endIndex: 8, messages: [makeMsg(3), makeMsg(4), makeMsg(5), makeMsg(6), makeMsg(7)] };
    expect(() => assertRegionListInvariants([r1, r2])).toThrow();
  });

  it("throws for adjacent regions (missed merge)", () => {
    const r1 = makeRegion(0, 5);
    const r2 = makeRegion(5, 10);
    expect(() => assertRegionListInvariants([r1, r2])).toThrow();
  });
});

// ---- insertRegion ----

describe("insertRegion", () => {
  it("inserts into empty list", () => {
    const result = insertRegion([], makeRegion(0, 5));
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(5);
    assertRegionListInvariants(result);
  });

  it("inserts non-overlapping, non-adjacent below existing → 2 regions, sorted", () => {
    const existing = [makeRegion(10, 20)];
    const result = insertRegion(existing, makeRegion(0, 5));
    expect(result).toHaveLength(2);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[1]!.startIndex).toBe(10);
    assertRegionListInvariants(result);
  });

  it("inserts non-overlapping, non-adjacent above existing → 2 regions, sorted", () => {
    const existing = [makeRegion(0, 5)];
    const result = insertRegion(existing, makeRegion(10, 20));
    expect(result).toHaveLength(2);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[1]!.startIndex).toBe(10);
    assertRegionListInvariants(result);
  });

  it("merges adjacent region below (incoming.endIndex === existing.startIndex)", () => {
    const existing = [makeRegion(5, 10)];
    const result = insertRegion(existing, makeRegion(0, 5));
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(10);
    assertRegionListInvariants(result);
  });

  it("merges adjacent region above (existing.endIndex === incoming.startIndex)", () => {
    const existing = [makeRegion(0, 5)];
    const result = insertRegion(existing, makeRegion(5, 10));
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(10);
    assertRegionListInvariants(result);
  });

  it("merges overlapping region — incoming wins for shared indices", () => {
    const existing = [makeRegion(0, 10)];
    const incomingNewer = makeRegionNewer(5, 15);
    const result = insertRegion(existing, incomingNewer);
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(15);
    // Index 5–14: incoming wins
    for (let i = 5; i < 15; i++) {
      expect(result[0]!.messages[i]!.body).toBe(`newer body ${i}`);
    }
    // Index 0–4: original preserved
    for (let i = 0; i < 5; i++) {
      expect(result[0]!.messages[i]!.body).toBe(`body ${i}`);
    }
    assertRegionListInvariants(result);
    expect(result[0]!.messages).toHaveLength(15);
  });

  it("bridges three regions into one", () => {
    const existing = [makeRegion(0, 5), makeRegion(10, 15), makeRegion(20, 25)];
    // incoming covers 4..21, touching/overlapping all three
    const result = insertRegion(existing, makeRegion(4, 21));
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(25);
    assertRegionListInvariants(result);
    expect(result[0]!.messages).toHaveLength(25);
  });

  it("incoming fully contained within existing — incoming wins for shared indices, length unchanged", () => {
    const existing = [makeRegion(0, 20)];
    const incomingNewer = makeRegionNewer(5, 10);
    const result = insertRegion(existing, incomingNewer);
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(20);
    for (let i = 5; i < 10; i++) {
      expect(result[0]!.messages[i]!.body).toBe(`newer body ${i}`);
    }
    assertRegionListInvariants(result);
  });
});

// ---- findMessage ----

describe("findMessage", () => {
  it("returns undefined for empty regions", () => {
    expect(findMessage([], 5)).toBeUndefined();
  });

  it("returns message when in a region", () => {
    const regions = [makeRegion(0, 10)];
    const msg = findMessage(regions, 5);
    expect(msg).toBeDefined();
    expect(msg!.index).toBe(5);
  });

  it("returns undefined when index is out of all regions", () => {
    const regions = [makeRegion(0, 5), makeRegion(10, 15)];
    expect(findMessage(regions, 7)).toBeUndefined();
  });

  it("returns correct message at exact startIndex and endIndex-1", () => {
    const regions = [makeRegion(5, 10)];
    expect(findMessage(regions, 5)!.index).toBe(5);
    expect(findMessage(regions, 9)!.index).toBe(9);
    expect(findMessage(regions, 10)).toBeUndefined();
  });
});

// ---- isLoaded ----

describe("isLoaded", () => {
  it("returns false for empty regions", () => {
    expect(isLoaded([], 5)).toBe(false);
  });

  it("returns true for index inside a region", () => {
    expect(isLoaded([makeRegion(0, 10)], 5)).toBe(true);
  });

  it("returns false for index outside all regions", () => {
    expect(isLoaded([makeRegion(0, 5), makeRegion(10, 15)], 7)).toBe(false);
  });
});

// ---- evictFarRegions ----

describe("evictFarRegions", () => {
  const baseParams = {
    centerIndex: 100,
    keepRadius: 50,
    tailIndex: 999,
    protectTail: false,
  };

  it("keeps region inside the keep window", () => {
    const regions = [makeRegion(80, 120)];
    const result = evictFarRegions(regions, baseParams);
    expect(result).toHaveLength(1);
  });

  it("evicts region entirely above the keep window (endIndex <= centerIndex - keepRadius)", () => {
    // window is [50, 150]. Region entirely above: endIndex <= 50
    const regions = [makeRegion(0, 49)]; // endIndex=49 < windowStart=50
    const result = evictFarRegions(regions, baseParams);
    expect(result).toHaveLength(0);
  });

  it("keeps region whose endIndex - 1 equals centerIndex - keepRadius (overlaps window)", () => {
    // window is [50, 150]. Region [40, 51) has endIndex=51 > windowStart=50 → overlaps
    const regions = [makeRegion(40, 51)];
    const result = evictFarRegions(regions, baseParams);
    expect(result).toHaveLength(1);
  });

  it("evicts region entirely below the keep window (startIndex > centerIndex + keepRadius)", () => {
    // window is [50, 150]. Region entirely below: startIndex > 150
    const regions = [makeRegion(151, 200)];
    const result = evictFarRegions(regions, baseParams);
    expect(result).toHaveLength(0);
  });

  it("keeps region whose startIndex equals centerIndex + keepRadius (on window edge)", () => {
    // window is [50, 150]. Region [150, 160) → startIndex=150 <= windowEnd=150 → overlaps
    const regions = [makeRegion(150, 160)];
    const result = evictFarRegions(regions, baseParams);
    expect(result).toHaveLength(1);
  });

  it("protects tail region even when far — protectTail=true", () => {
    // tailIndex=999, region [990, 1000) is far from center=100
    const regions = [makeRegion(990, 1000)];
    const result = evictFarRegions(regions, { ...baseParams, protectTail: true, tailIndex: 999 });
    expect(result).toHaveLength(1);
  });

  it("evicts tail region when protectTail=false", () => {
    const regions = [makeRegion(990, 1000)];
    const result = evictFarRegions(regions, { ...baseParams, protectTail: false, tailIndex: 999 });
    expect(result).toHaveLength(0);
  });

  it("evicts region when endIndex === windowStart (50 > 50 is false)", () => {
    // window is [50, 150]. Region [0, 50): endIndex=50, predicate 50 > 50 = false → evicted
    const regions = [makeRegion(0, 50)];
    const result = evictFarRegions(regions, { centerIndex: 100, keepRadius: 50, tailIndex: 999, protectTail: false });
    expect(result).toEqual([]);
  });

  it("keeps region when endIndex === windowStart + 1 (51 > 50 is true)", () => {
    // window is [50, 150]. Region [0, 51): endIndex=51, predicate 51 > 50 = true → kept
    const regions = [makeRegion(0, 51)];
    const result = evictFarRegions(regions, { centerIndex: 100, keepRadius: 50, tailIndex: 999, protectTail: false });
    expect(result).toHaveLength(1);
    expect(result[0]!.startIndex).toBe(0);
    expect(result[0]!.endIndex).toBe(51);
  });

  it("keeps near regions, evicts far, respects tail protection", () => {
    const regions = [
      makeRegion(0, 10),     // far above, no tail → evicted
      makeRegion(80, 120),   // overlaps window → kept
      makeRegion(990, 1000), // far below, contains tail → kept if protectTail
    ];
    const result = evictFarRegions(regions, { ...baseParams, protectTail: true, tailIndex: 999 });
    expect(result).toHaveLength(2);
    expect(result[0]!.startIndex).toBe(80);
    expect(result[1]!.startIndex).toBe(990);
  });
});

// ---- unloadedSubranges ----

describe("unloadedSubranges", () => {
  it("returns the full range when no regions", () => {
    const result = unloadedSubranges([], 0, 10);
    expect(result).toEqual([{ start: 0, end: 10 }]);
  });

  it("returns empty when one region covers the whole range", () => {
    const result = unloadedSubranges([makeRegion(0, 10)], 0, 10);
    expect(result).toEqual([]);
  });

  it("returns two subranges when region covers the middle", () => {
    // [0, 10) with region [3, 7) → gaps: [0,3) and [7,10)
    const result = unloadedSubranges([makeRegion(3, 7)], 0, 10);
    expect(result).toEqual([
      { start: 0, end: 3 },
      { start: 7, end: 10 },
    ]);
  });

  it("returns one subrange gap between two regions", () => {
    const result = unloadedSubranges([makeRegion(0, 3), makeRegion(7, 10)], 0, 10);
    expect(result).toEqual([{ start: 3, end: 7 }]);
  });

  it("handles query range start inside a region", () => {
    // Region [0,10); query [5,15) → loaded part is [5,10), gap is [10,15)
    const result = unloadedSubranges([makeRegion(0, 10)], 5, 15);
    expect(result).toEqual([{ start: 10, end: 15 }]);
  });

  it("handles query range end inside a region", () => {
    // Region [5, 20); query [0, 10) → gap [0,5) only
    const result = unloadedSubranges([makeRegion(5, 20)], 0, 10);
    expect(result).toEqual([{ start: 0, end: 5 }]);
  });

  it("returns empty for empty range", () => {
    const result = unloadedSubranges([], 5, 5);
    expect(result).toEqual([]);
  });

  it("returns full range when region is entirely above the requested range", () => {
    // region [20, 30) is above range [0, 10) → full gap
    const result = unloadedSubranges([makeRegion(20, 30)], 0, 10);
    expect(result).toEqual([{ start: 0, end: 10 }]);
  });

  it("returns full range when region is entirely below the requested range", () => {
    // region [20, 30) is below range [50, 60) → full gap
    const result = unloadedSubranges([makeRegion(20, 30)], 50, 60);
    expect(result).toEqual([{ start: 50, end: 60 }]);
  });
});

// ---- Fuzz test ----

describe("insertRegion fuzz", () => {
  it("maintains region list invariants across 100 random insert sequences", () => {
    const rng = mulberry32(0xdeadbeef);

    for (let trial = 0; trial < 100; trial++) {
      let regions: readonly Region[] = [];
      const allIndices = new Set<number>();

      // Insert 5–15 random regions per trial
      const insertCount = 5 + Math.floor(rng() * 10);
      for (let k = 0; k < insertCount; k++) {
        const start = Math.floor(rng() * 200);
        const len = 1 + Math.floor(rng() * 30);
        const end = start + len;
        for (let i = start; i < end; i++) allIndices.add(i);
        regions = insertRegion(regions, makeRegion(start, end));
        assertRegionListInvariants(regions);
      }

      // Total messages across all regions must equal size of union of all inserted indices
      let totalMessages = 0;
      for (const r of regions) {
        totalMessages += r.endIndex - r.startIndex;
      }
      expect(totalMessages).toBe(allIndices.size);
    }
  });
});
