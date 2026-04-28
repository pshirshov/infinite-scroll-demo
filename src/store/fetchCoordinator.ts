import type { Message } from "../backend/Message";
import type { MockBackend } from "../backend/MockBackend";
import { unloadedSubranges } from "./regions";
import type { Region } from "./regions";

export interface FetchCoordinatorParams {
  readonly backend: MockBackend;
  /** Default chunk size when splitting a missing range. */
  readonly chunkSize?: number;
  /** Called when a chunk lands. The coordinator does NOT mutate any store directly. */
  readonly onChunk: (region: Region) => void;
  /** Called when a chunk's fetch rejects (non-abort errors only). */
  readonly onError?: (start: number, end: number, err: Error) => void;
}

export interface EnsureRangeRequest {
  readonly start: number;
  readonly end: number; // exclusive, half-open
  readonly currentRegions: readonly Region[];
}

interface InflightEntry {
  readonly controller: AbortController;
  readonly start: number;
  readonly end: number;
}

export class FetchCoordinator {
  private readonly backend: MockBackend;
  private readonly chunkSize: number;
  private readonly onChunk: (region: Region) => void;
  private readonly onError: ((start: number, end: number, err: Error) => void) | undefined;
  private readonly inflight: Map<string, InflightEntry> = new Map();
  private disposed: boolean = false;

  constructor(params: FetchCoordinatorParams) {
    const chunkSize = params.chunkSize ?? 100;
    if (chunkSize < 1) {
      throw new Error("FetchCoordinator: chunkSize must be >= 1");
    }
    this.backend = params.backend;
    this.chunkSize = chunkSize;
    this.onChunk = params.onChunk;
    this.onError = params.onError;
  }

  ensureRange(req: EnsureRangeRequest): void {
    const missing = unloadedSubranges(req.currentRegions, req.start, req.end);

    for (const gap of missing) {
      let chunkStart = gap.start;
      while (chunkStart < gap.end) {
        const chunkEnd = Math.min(chunkStart + this.chunkSize, gap.end);
        const key = `${chunkStart}-${chunkEnd}`;

        if (!this.inflight.has(key)) {
          const controller = new AbortController();
          const cs = chunkStart;
          const ce = chunkEnd;
          this.inflight.set(key, { controller, start: cs, end: ce });

          let fetchPromise: Promise<readonly Message[]>;
          try {
            fetchPromise = this.backend.getRange(cs, ce, controller.signal);
          } catch (e) {
            this.inflight.delete(key);
            throw e;
          }

          fetchPromise
            .then((messages: readonly Message[]) => {
              if (this.disposed || controller.signal.aborted) return;
              const region: Region = {
                startIndex: cs,
                endIndex: ce,
                messages: Array.from(messages),
              };
              this.onChunk(region);
            })
            .catch((err: unknown) => {
              if (this.disposed || (err instanceof Error && err.name === "AbortError")) return;
              const error = err instanceof Error ? err : new Error(String(err));
              this.onError?.(cs, ce, error);
            })
            .finally(() => {
              this.inflight.delete(key);
            });
        }

        chunkStart = chunkEnd;
      }
    }
  }

  /**
   * Abort all in-flight fetches whose chunk falls entirely outside [keepStart, keepEnd).
   * Chunks that overlap the keep range are retained.
   */
  abortOutside(keepStart: number, keepEnd: number): void {
    for (const [key, entry] of this.inflight) {
      if (entry.end <= keepStart || entry.start >= keepEnd) {
        entry.controller.abort();
        this.inflight.delete(key);
      }
    }
  }

  /** Returns structured info about all in-flight chunks. */
  inflightChunks(): readonly { start: number; end: number }[] {
    return Array.from(this.inflight.values()).map((e) => ({ start: e.start, end: e.end }));
  }

  inflightCount(): number {
    return this.inflight.size;
  }

  /** @internal */
  inflightKeysForTest(): readonly string[] {
    return Array.from(this.inflight.keys());
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.inflight.values()) {
      entry.controller.abort();
    }
    this.inflight.clear();
  }
}
