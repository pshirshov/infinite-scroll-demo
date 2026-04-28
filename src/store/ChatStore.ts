import type { Message } from "../backend/Message";
import type { MockBackend, NewMessageEvent } from "../backend/MockBackend";
import {
  type Region,
  insertRegion,
  evictFarRegions,
  findMessage,
  isLoaded,
  unloadedSubranges,
} from "./regions";
import { FetchCoordinator } from "./fetchCoordinator";

export interface ChatStoreSnapshot {
  readonly regions: readonly Region[];
  readonly totalCount: number;
  readonly topIndex: number;
  readonly pixelOffset: number;
  readonly regionCount: number;
  readonly totalLoadedMessages: number;
  readonly inflightCount: number;
  readonly estimatedRowHeight: number;
  readonly unseenCount: number;
}

export interface ChatStoreConfig {
  readonly totalCount: number;
  readonly estimatedRowHeight: number;
  readonly keepRadius: number;
  readonly backend?: MockBackend;
  readonly chunkSize?: number;
  readonly prefetchOverscan?: number;
}

const EVICT_DEBOUNCE_MS = 750;

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
  private readonly coordinator: FetchCoordinator | null;
  private readonly backendRef: MockBackend | undefined;
  private evictTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed: boolean = false;
  private unseenCount: number = 0;

  constructor(config: ChatStoreConfig) {
    this.totalCount = config.totalCount;
    this.estimatedRowHeight = config.estimatedRowHeight;
    this.keepRadius = config.keepRadius;
    this.backendRef = config.backend;

    if (config.backend !== undefined) {
      this.coordinator = new FetchCoordinator({
        backend: config.backend,
        ...(config.chunkSize !== undefined ? { chunkSize: config.chunkSize } : {}),
        onChunk: (region) => this.insertRegion(region),
      });
    } else {
      this.coordinator = null;
    }
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
        inflightCount: this.coordinator?.inflightCount() ?? 0,
        estimatedRowHeight: this.estimatedRowHeight,
        unseenCount: this.unseenCount,
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

  /** Trigger fetches for any unloaded sub-ranges within [start, end). Idempotent. No-op when no backend is configured. */
  ensureRange(start: number, end: number): void {
    if (this.coordinator === null) return;
    const clamped = {
      start: Math.max(0, start),
      end: Math.min(this.totalCount, end),
    };
    if (clamped.start >= clamped.end) return;
    this.coordinator.ensureRange({ start: clamped.start, end: clamped.end, currentRegions: this.regions });
  }

  /** Abort fetches whose chunks fall entirely outside [keepStart, keepEnd). */
  abortFetchesOutside(keepStart: number, keepEnd: number): void {
    this.coordinator?.abortOutside(keepStart, keepEnd);
  }

  /** Returns true if the index is loaded OR has an in-flight fetch covering it. */
  isLoadedOrInflight(index: number): boolean {
    if (isLoaded(this.regions, index)) return true;
    if (this.coordinator === null) return false;
    return this.coordinator.inflightChunks().some((c) => c.start <= index && index < c.end);
  }

  /**
   * Debounced eviction. After EVICT_DEBOUNCE_MS without another call,
   * runs `this.evict({ protectTail })`. Subsequent calls cancel and
   * re-arm the timer. Idempotent on tear-down.
   */
  scheduleEvict(protectTail: boolean): void {
    if (this.disposed) return;
    if (this.evictTimer !== null) clearTimeout(this.evictTimer);
    this.evictTimer = setTimeout(() => {
      this.evictTimer = null;
      this.evict({ protectTail });
    }, EVICT_DEBOUNCE_MS);
  }

  /** @internal For tests: forces the pending eviction to run immediately. */
  flushPendingEvictionForTest(): void {
    if (this.evictTimer !== null) {
      clearTimeout(this.evictTimer);
      this.evictTimer = null;
      this.evict({ protectTail: false });
    }
  }

  /**
   * Handle a live message arriving from the backend. Inserts into the tail region
   * (insertRegion merges adjacently), increments totalCount, and increments unseenCount.
   * The viewport's tail-follow effect calls clearUnseen + snap when tailAnchored.
   */
  handleLiveMessage(event: NewMessageEvent): void {
    if (this.disposed) return;
    const { message, newTotalCount } = event;
    const region: Region = {
      startIndex: message.index,
      endIndex: message.index + 1,
      messages: [message],
    };
    // insertRegion and setTotalCount each call invalidateAndNotify; increment unseenCount
    // directly so it is included in the next snapshot produced by the final notification.
    this.unseenCount += 1;
    this.regions = insertRegion(this.regions, region);
    if (newTotalCount > this.totalCount) {
      this.totalCount = newTotalCount;
    }
    this.invalidateAndNotify();
  }

  /** Reset unseen counter — called by the tail-follow effect and JumpToLatest pill. */
  clearUnseen(): void {
    if (this.unseenCount === 0) return;
    this.unseenCount = 0;
    this.invalidateAndNotify();
  }

  dispose(): void {
    this.disposed = true;
    if (this.evictTimer !== null) {
      clearTimeout(this.evictTimer);
      this.evictTimer = null;
    }
    this.coordinator?.dispose();
    this.listeners.clear();
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

  async jumpToId(id: string): Promise<void> {
    if (this.disposed) return;
    if (this.backendRef === undefined) throw new Error("ChatStore.jumpToId: no backend configured");

    // Abort all in-flight fetches — we're jumping far away from the current position.
    this.abortFetchesOutside(0, 0);

    const result = await this.backendRef.getById(id);
    if (this.disposed) return;

    const startIndex = result.index - result.before.length;
    const endIndex = result.index + 1 + result.after.length;
    const messages: Message[] = [...result.before, result.message, ...result.after];
    this.insertRegion({ startIndex, endIndex, messages });
    this.setTopIndex(result.index, 0);
    this.scheduleEvict(false);
  }
}
