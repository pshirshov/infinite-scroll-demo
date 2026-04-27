import { type Message, type SearchHit, indexToId, idToIndex } from "./Message.js";
import { generateMessage, type GenContext } from "./contentGen.js";
import { mulberry32 } from "./prng.js";

const DEFAULT_AVG_GAP_MS = 2 * 60 * 1000; // ~2 minutes
const DEFAULT_MIN_LATENCY_MS = 100;
const DEFAULT_MAX_LATENCY_MS = 300;
const DEFAULT_LIVE_TICK_MS = 5000;
const DEFAULT_SEARCH_HIT_BUDGET = 50;
const DEFAULT_SEARCH_SCAN_BUDGET = 50_000;
const SNIPPET_LENGTH = 80;
const CONTEXT_WINDOW = 50;

const DEFAULT_AUTHORS: readonly { id: string; name: string }[] = [
  { id: "u-01", name: "Alice" },
  { id: "u-02", name: "Bob" },
  { id: "u-03", name: "Carol" },
  { id: "u-04", name: "Dave" },
  { id: "u-05", name: "Eve" },
  { id: "u-06", name: "Frank" },
  { id: "u-07", name: "Grace" },
  { id: "u-08", name: "Heidi" },
];

export interface MockBackendConfig {
  readonly totalCount: number;
  readonly seed: number;
  readonly baseTs?: number;
  readonly avgGapMs?: number;
  readonly minLatencyMs?: number;
  readonly maxLatencyMs?: number;
  readonly liveTickMs?: number;
  readonly authors?: readonly { id: string; name: string }[];
  readonly searchScanBudget?: number;
  readonly searchHitBudget?: number;
}

export interface NewMessageEvent {
  readonly message: Message;
  readonly newTotalCount: number;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    }

    function cleanup(): void {
      signal?.removeEventListener("abort", onAbort);
    }

    signal?.addEventListener("abort", onAbort);
  });
}

function buildSnippet(body: string, query: string): string {
  const lower = body.toLowerCase();
  const matchIdx = lower.indexOf(query.toLowerCase());
  if (matchIdx === -1) return body.slice(0, SNIPPET_LENGTH);

  const half = Math.floor(SNIPPET_LENGTH / 2);
  let start = Math.max(0, matchIdx - half);
  let end = Math.min(body.length, start + SNIPPET_LENGTH);
  // Shift start left if we have room at the end
  if (end - start < SNIPPET_LENGTH) {
    start = Math.max(0, end - SNIPPET_LENGTH);
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return prefix + body.slice(start, end) + suffix;
}

export class MockBackend {
  private totalCount: number;
  private readonly config: Required<MockBackendConfig>;
  private readonly genCtx: GenContext;
  // Seeded latency RNG — deterministic across runs
  private readonly latencyRng: () => number;
  private readonly subscribers = new Set<(event: NewMessageEvent) => void>();
  private liveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MockBackendConfig) {
    const authors = config.authors ?? DEFAULT_AUTHORS;
    if (authors.length === 0) throw new Error("MockBackend: authors must be non-empty");
    const baseTs = config.baseTs ?? Date.now();
    this.config = {
      totalCount: config.totalCount,
      seed: config.seed,
      baseTs,
      avgGapMs: config.avgGapMs ?? DEFAULT_AVG_GAP_MS,
      minLatencyMs: config.minLatencyMs ?? DEFAULT_MIN_LATENCY_MS,
      maxLatencyMs: config.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS,
      liveTickMs: config.liveTickMs ?? DEFAULT_LIVE_TICK_MS,
      authors,
      searchScanBudget: config.searchScanBudget ?? DEFAULT_SEARCH_SCAN_BUDGET,
      searchHitBudget: config.searchHitBudget ?? DEFAULT_SEARCH_HIT_BUDGET,
    };
    this.totalCount = config.totalCount;
    this.latencyRng = mulberry32(config.seed);
    this.genCtx = {
      seed: this.config.seed,
      baseTs: this.config.baseTs,
      avgGapMs: this.config.avgGapMs,
      authors: this.config.authors,
      totalCount: this.totalCount,
    };
  }

  getTotalCount(): number {
    return this.totalCount;
  }

  private nextLatencyMs(): number {
    const { minLatencyMs, maxLatencyMs } = this.config;
    return minLatencyMs + this.latencyRng() * (maxLatencyMs - minLatencyMs);
  }

  /** @internal — test hook: consumes the next latency RNG value without performing a delay */
  peekNextLatencyMs(): number {
    return this.nextLatencyMs();
  }

  private generateAt(index: number): Message {
    // genCtx.totalCount is fixed at construction for timestamp stability;
    // synthesised live messages extend naturally beyond that.
    return generateMessage(this.genCtx, index);
  }

  async getRange(
    startIndex: number,
    endIndex: number,
    signal?: AbortSignal,
  ): Promise<readonly Message[]> {
    if (endIndex < startIndex) {
      throw new Error(
        `getRange: inverted range [${startIndex}, ${endIndex})`,
      );
    }
    await delay(this.nextLatencyMs(), signal);

    const lo = Math.max(0, startIndex);
    const hi = Math.min(this.totalCount, endIndex);
    const result: Message[] = [];
    for (let i = lo; i < hi; i++) {
      result.push(this.generateAt(i));
    }
    return result;
  }

  async getById(
    id: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly message: Message;
    readonly index: number;
    readonly before: readonly Message[];
    readonly after: readonly Message[];
  }> {
    const index = idToIndex(id);
    if (index < 0 || index >= this.totalCount) {
      throw new Error(
        `getById: index ${index} out of range [0, ${this.totalCount})`,
      );
    }

    await delay(this.nextLatencyMs(), signal);

    const message = this.generateAt(index);

    const beforeStart = Math.max(0, index - CONTEXT_WINDOW);
    const afterEnd = Math.min(this.totalCount, index + CONTEXT_WINDOW + 1);

    const before: Message[] = [];
    for (let i = beforeStart; i < index; i++) {
      before.push(this.generateAt(i));
    }

    const after: Message[] = [];
    for (let i = index + 1; i < afterEnd; i++) {
      after.push(this.generateAt(i));
    }

    return { message, index, before, after };
  }

  async getLatest(
    count: number,
    signal?: AbortSignal,
  ): Promise<{
    readonly messages: readonly Message[];
    readonly startIndex: number;
  }> {
    await delay(this.nextLatencyMs(), signal);

    const actualCount = Math.min(count, this.totalCount);
    const startIndex = this.totalCount - actualCount;
    const messages: Message[] = [];
    for (let i = startIndex; i < this.totalCount; i++) {
      messages.push(this.generateAt(i));
    }
    return { messages, startIndex };
  }

  subscribeNew(handler: (event: NewMessageEvent) => void): () => void {
    this.subscribers.add(handler);

    if (this.liveInterval === null) {
      this.liveInterval = setInterval(() => {
        const index = this.totalCount;
        this.totalCount += 1;
        const message = this.generateAt(index);
        const event: NewMessageEvent = {
          message,
          newTotalCount: this.totalCount,
        };
        this.subscribers.forEach((fn) => fn(event));
      }, this.config.liveTickMs);
    }

    return () => {
      this.subscribers.delete(handler);
      if (this.subscribers.size === 0 && this.liveInterval !== null) {
        clearInterval(this.liveInterval);
        this.liveInterval = null;
      }
    };
  }

  async search(
    query: string,
    signal?: AbortSignal,
  ): Promise<readonly SearchHit[]> {
    const trimmed = query.trim();
    if (trimmed === "") return [];

    await delay(this.nextLatencyMs(), signal);

    const hits: SearchHit[] = [];
    const scanLimit = Math.min(this.totalCount, this.config.searchScanBudget);

    // scan is synchronous; abort is honored only at the entry await
    for (let i = 0; i < scanLimit; i++) {
      const msg = this.generateAt(i);
      if (msg.body.toLowerCase().includes(trimmed.toLowerCase())) {
        hits.push({
          id: msg.id,
          index: i,
          snippet: buildSnippet(msg.body, trimmed),
        });
        if (hits.length >= this.config.searchHitBudget) break;
      }
    }

    return hits;
  }
}
