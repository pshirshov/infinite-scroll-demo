import type { Message } from "../backend/Message";

export interface Region {
  readonly startIndex: number;
  readonly endIndex: number; // exclusive — half-open [startIndex, endIndex)
  readonly messages: readonly Message[]; // length === endIndex - startIndex; messages[i].index === startIndex + i
}

export function assertRegionInvariants(r: Region): void {
  if (!(r.startIndex >= 0)) {
    throw new Error(`Region invariant: startIndex must be >= 0, got ${r.startIndex}`);
  }
  if (!(r.endIndex > r.startIndex)) {
    throw new Error(`Region invariant: endIndex (${r.endIndex}) must be > startIndex (${r.startIndex})`);
  }
  const expectedLen = r.endIndex - r.startIndex;
  if (r.messages.length !== expectedLen) {
    throw new Error(
      `Region invariant: messages.length (${r.messages.length}) !== endIndex - startIndex (${expectedLen})`,
    );
  }
  for (let i = 0; i < r.messages.length; i++) {
    const msg = r.messages[i];
    if (msg === undefined || msg.index !== r.startIndex + i) {
      throw new Error(
        `Region invariant: messages[${i}].index (${msg?.index}) !== startIndex + i (${r.startIndex + i})`,
      );
    }
  }
}

export function assertRegionListInvariants(regions: readonly Region[]): void {
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (r === undefined) throw new Error(`Region list invariant: region at ${i} is undefined`);
    assertRegionInvariants(r);
    if (i > 0) {
      const prev = regions[i - 1];
      if (prev === undefined) throw new Error(`Region list invariant: region at ${i - 1} is undefined`);
      if (prev.startIndex >= r.startIndex) {
        throw new Error(
          `Region list invariant: not sorted — regions[${i - 1}].startIndex (${prev.startIndex}) >= regions[${i}].startIndex (${r.startIndex})`,
        );
      }
      if (prev.endIndex > r.startIndex) {
        throw new Error(
          `Region list invariant: overlap — regions[${i - 1}].endIndex (${prev.endIndex}) > regions[${i}].startIndex (${r.startIndex})`,
        );
      }
      // Adjacent regions must be merged — no missed merges
      if (prev.endIndex === r.startIndex) {
        throw new Error(
          `Region list invariant: adjacent regions not merged — regions[${i - 1}].endIndex (${prev.endIndex}) === regions[${i}].startIndex (${r.startIndex})`,
        );
      }
    }
  }
}

export function insertRegion(regions: readonly Region[], incoming: Region): readonly Region[] {
  assertRegionInvariants(incoming);

  // Find all regions that overlap or are adjacent to incoming
  const mergeStart = incoming.startIndex;
  const mergeEnd = incoming.endIndex;

  const toMerge: Region[] = [];
  const untouched: Region[] = [];

  for (const r of regions) {
    // Overlapping or adjacent: r.startIndex <= mergeEnd && r.endIndex >= mergeStart
    if (r.endIndex >= mergeStart && r.startIndex <= mergeEnd) {
      toMerge.push(r);
    } else {
      untouched.push(r);
    }
  }

  // Build merged region spanning the union of all involved ranges
  let newStart = mergeStart;
  let newEnd = mergeEnd;
  for (const r of toMerge) {
    if (r.startIndex < newStart) newStart = r.startIndex;
    if (r.endIndex > newEnd) newEnd = r.endIndex;
  }

  // Build merged messages array: iterate index by index, incoming wins for shared indices
  const newMessages: Message[] = new Array(newEnd - newStart) as Message[];
  // Fill from existing regions first
  for (const r of toMerge) {
    for (let i = r.startIndex; i < r.endIndex; i++) {
      const msg = r.messages[i - r.startIndex];
      if (msg !== undefined) {
        newMessages[i - newStart] = msg;
      }
    }
  }
  // Incoming overwrites — incoming wins for shared indices
  for (let i = incoming.startIndex; i < incoming.endIndex; i++) {
    const msg = incoming.messages[i - incoming.startIndex];
    if (msg !== undefined) {
      newMessages[i - newStart] = msg;
    }
  }

  // Validate no holes
  for (let i = 0; i < newMessages.length; i++) {
    const msg = newMessages[i];
    if (msg === undefined) {
      throw new Error(`insertRegion: hole at absolute index ${newStart + i} after merge — caller bug`);
    }
    if (msg.index !== newStart + i) {
      throw new Error(
        `insertRegion: message at slot ${i} has index ${msg.index}, expected ${newStart + i}`,
      );
    }
  }

  const merged: Region = {
    startIndex: newStart,
    endIndex: newEnd,
    messages: newMessages,
  };

  // Insert merged region back into untouched list at the right position
  const result: Region[] = [];
  let inserted = false;
  for (const r of untouched) {
    if (!inserted && r.startIndex > merged.startIndex) {
      result.push(merged);
      inserted = true;
    }
    result.push(r);
  }
  if (!inserted) result.push(merged);

  return result;
}

export function findMessage(regions: readonly Region[], index: number): Message | undefined {
  for (const r of regions) {
    if (index >= r.startIndex && index < r.endIndex) {
      return r.messages[index - r.startIndex];
    }
  }
  return undefined;
}

export function evictFarRegions(
  regions: readonly Region[],
  params: {
    readonly centerIndex: number;
    readonly keepRadius: number;
    readonly tailIndex: number;
    readonly protectTail: boolean;
  },
): readonly Region[] {
  const { centerIndex, keepRadius, tailIndex, protectTail } = params;
  const windowStart = centerIndex - keepRadius;
  const windowEnd = centerIndex + keepRadius;

  return regions.filter((r) => {
    // Keep if region overlaps [centerIndex - keepRadius, centerIndex + keepRadius]
    const overlapsWindow = r.endIndex > windowStart && r.startIndex <= windowEnd;
    if (overlapsWindow) return true;

    // Tail protection: keep if region contains tailIndex and protectTail is true
    if (protectTail && tailIndex >= r.startIndex && tailIndex < r.endIndex) return true;

    return false;
  });
}

export function isLoaded(regions: readonly Region[], index: number): boolean {
  for (const r of regions) {
    if (index >= r.startIndex && index < r.endIndex) return true;
  }
  return false;
}

export function unloadedSubranges(
  regions: readonly Region[],
  start: number,
  end: number,
): readonly { start: number; end: number }[] {
  if (start >= end) return [];

  const result: { start: number; end: number }[] = [];
  let cursor = start;

  for (const r of regions) {
    // Only consider regions that intersect [start, end)
    if (r.endIndex <= start || r.startIndex >= end) continue;

    const rStart = Math.max(r.startIndex, start);
    const rEnd = Math.min(r.endIndex, end);

    if (cursor < rStart) {
      result.push({ start: cursor, end: rStart });
    }
    if (rEnd > cursor) {
      cursor = rEnd;
    }
  }

  if (cursor < end) {
    result.push({ start: cursor, end });
  }

  return result;
}
