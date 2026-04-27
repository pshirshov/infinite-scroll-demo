import type { Message } from "../backend/Message";
import {
  type Region,
  insertRegion,
  evictFarRegions,
  findMessage,
  isLoaded,
  unloadedSubranges,
} from "./regions";

export interface ChatStoreSnapshot {
  readonly regions: readonly Region[];
  readonly totalCount: number;
  readonly topIndex: number;
  readonly pixelOffset: number;
  readonly regionCount: number;
  readonly totalLoadedMessages: number;
}

export interface ChatStoreConfig {
  readonly totalCount: number;
  readonly estimatedRowHeight: number;
  readonly keepRadius: number;
}

export class ChatStore {
  private regions: readonly Region[] = [];
  private readonly heights: Map<number, number> = new Map();
  private totalCount: number;
  private topIndex: number = 0;
  private pixelOffset: number = 0;
  private readonly estimatedRowHeight: number;
  private readonly keepRadius: number;
  private readonly listeners: Set<() => void> = new Set();
  private cachedSnapshot: ChatStoreSnapshot | null = null;

  constructor(config: ChatStoreConfig) {
    this.totalCount = config.totalCount;
    this.estimatedRowHeight = config.estimatedRowHeight;
    this.keepRadius = config.keepRadius;
  }

  // --- Observable ---

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ChatStoreSnapshot {
    if (this.cachedSnapshot === null) {
      let totalLoadedMessages = 0;
      for (const r of this.regions) {
        totalLoadedMessages += r.endIndex - r.startIndex;
      }
      this.cachedSnapshot = {
        regions: this.regions,
        totalCount: this.totalCount,
        topIndex: this.topIndex,
        pixelOffset: this.pixelOffset,
        regionCount: this.regions.length,
        totalLoadedMessages,
      };
    }
    return this.cachedSnapshot;
  }

  // --- Regions ---

  insertRegion(region: Region): void {
    this.regions = insertRegion(this.regions, region);
    this.invalidateAndNotify();
  }

  evict(params: { readonly protectTail: boolean }): void {
    const tailIndex = this.totalCount - 1;
    const prevRegions = this.regions;
    this.regions = evictFarRegions(this.regions, {
      centerIndex: this.topIndex,
      keepRadius: this.keepRadius,
      tailIndex,
      protectTail: params.protectTail,
    });

    // Find which regions were removed and clear their heights if also outside the overscan band
    const evictedRegions = prevRegions.filter((r) => !this.regions.includes(r));
    if (evictedRegions.length > 0) {
      const bandStart = this.topIndex - 2 * this.keepRadius;
      const bandEnd = this.topIndex + 2 * this.keepRadius;
      for (const r of evictedRegions) {
        for (let i = r.startIndex; i < r.endIndex; i++) {
          if (i < bandStart || i > bandEnd) {
            this.heights.delete(i);
          }
        }
      }
    }

    this.invalidateAndNotify();
  }

  findMessage(index: number): Message | undefined {
    return findMessage(this.regions, index);
  }

  isLoaded(index: number): boolean {
    return isLoaded(this.regions, index);
  }

  unloadedSubranges(start: number, end: number): readonly { start: number; end: number }[] {
    return unloadedSubranges(this.regions, start, end);
  }

  // --- Heights ---

  setHeight(index: number, height: number): void {
    const prev = this.heights.get(index);
    if (prev !== undefined && prev === height) {
      // Exact same value — no change, no notification
      return;
    }
    this.heights.set(index, height);
    this.invalidateAndNotify();
  }

  getHeight(index: number): number {
    return this.heights.get(index) ?? this.estimatedRowHeight;
  }

  hasHeight(index: number): boolean {
    return this.heights.has(index);
  }

  // --- Scroll state ---

  setTopIndex(topIndex: number, pixelOffset: number): void {
    this.topIndex = topIndex;
    this.pixelOffset = pixelOffset;
    this.invalidateAndNotify();
  }

  // --- Total count ---

  setTotalCount(n: number): void {
    this.totalCount = n;
    this.invalidateAndNotify();
  }

  // --- Internal ---

  private invalidateAndNotify(): void {
    this.cachedSnapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }

  // --- Test/debug ---

  /** @internal */
  getRegionsForTest(): readonly Region[] {
    return this.regions;
  }

  /** @internal */
  getHeightMapSizeForTest(): number {
    return this.heights.size;
  }
}
