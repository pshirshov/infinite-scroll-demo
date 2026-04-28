# scroll-demo

A high-performance, index-space infinite-scroll chat demo built with React 19, TypeScript (strict), and Vite — no virtualisation library, no external state manager. It renders 5 000 000 synthetic messages with smooth scrolling, a custom scrollbar, live-tail auto-follow, day grouping, jump-to-id, and full-text search, all in a single browser tab with no backend server.

## Quick start

```
nix develop --command pnpm dev
```

Open `http://localhost:5173`. The demo boots in under a second and anchors to the live tail automatically.

## Architecture overview

**Index-space scroll engine** (`src/store/scroll.ts`, `src/components/ChatViewport.tsx`). Scroll state is a `(topIndex, pixelOffset)` pair — not a pixel offset from the document top. `topIndex` is the first fully-rendered row; `pixelOffset` is how many pixels of that row have scrolled off the top. All inputs (wheel, keyboard, scrollbar drag) funnel through a single pure function `applyScrollDelta`, which walks the row-heights map and clamps at both boundaries. Layout flows downward from `topIndex`, so height changes in rows above the fold never affect visible content.

**Region storage** (`src/store/regions.ts`, `src/store/ChatStore.ts`). Messages are stored in sorted, non-overlapping half-open `[start, end)` regions. Incoming regions are merged on insert (including three-region bridge merges); on overlap, incoming wins. The observable `ChatStore` wraps the pure region helpers and notifies React via `useSyncExternalStore`. Snapshot reference stability is enforced — pure `setHeight` calls don't invalidate the `regions` reference, so scroll effects don't re-fire on measurement.

**Fetch coordinator** (`src/store/fetchCoordinator.ts`). On scroll-settle (150 ms debounce), the viewport computes a `[topIndex ± 200]` prefetch window and calls `ChatStore.ensureRange`. The coordinator chunks the unloaded sub-ranges into ≤ 100-row requests, deduplicates against in-flight keys, and issues `MockBackend.getRange` with per-chunk `AbortController`s. Resolved fetches whose chunk was aborted are silently dropped; the `disposed` flag prevents mutations after unmount.

**Eviction** (`src/store/ChatStore.ts:scheduleEvict`). A 750 ms debounce after scroll-settle evicts all regions outside a `[topIndex ± keepRadius]` window, plus optionally protects the tail region when live-anchored. Heights for evicted, out-of-band indices are cleared. This keeps heap usage bounded even at N = 5 M.

**Custom scrollbar** (`src/components/CustomScrollbar.tsx`, `src/components/scrollbarMath.ts`). The thumb is positioned at `topIndex / (N-1)` of the track — pure index-space arithmetic, no accumulated pixel drift. At N = 5 M the natural thumb height is sub-pixel; it is clamped to 24 px. Drag updates the store on every `pointermove`; there is no separate dragging state.

**Mock backend** (`src/backend/MockBackend.ts`). All content and latency is deterministically seeded. Exposes `getRange`, `getById`, `getLatest`, `search`, and `subscribeNew` (live tail, 5 s interval). All async methods accept an `AbortSignal`. URL param `?seed=N` reproduces any session exactly.

## Functional requirements covered

- **FR-1 Render N = 5 M messages without pagination** — index-space engine + region storage; only the visible window is in DOM.
- **FR-2 Smooth scroll (wheel, keyboard, scrollbar)** — `applyScrollDelta` processes every wheel event synchronously; no `requestAnimationFrame` queue.
- **FR-3 On-demand fetch with skeleton placeholders** — `FetchCoordinator.ensureRange` + `SkeletonRow` for unloaded indices.
- **FR-4 Memory-bounded eviction** — `scheduleEvict` with configurable `keepRadius`.
- **FR-5 Live tail + auto-follow** — `subscribeNew` → `handleLiveMessage` → `tailAnchored` heuristic → `snapToTail`; `JumpToLatest` pill when not anchored.
- **FR-6 Jump-to-id** — `ChatStore.jumpToId` calls `getById`, inserts the 101-message window, sets `topIndex`.
- **Day grouping + sticky date header** — `DaySeparator` inside `MessageRow`; `StickyDateHeader` overlays with push-up animation.
- **Full-text search** — `SearchBar` with 300 ms debounce, per-keystroke abort, results dropdown → `jumpToId`.

## Demo scenarios to try

1. **Scroll down to live tail** — open the page; it anchors automatically to the newest message. Scroll down further; the `JumpToLatest` pill appears when live messages arrive.
2. **Scroll up** — use the mouse wheel, arrow keys, or Page Up/Down. The custom scrollbar thumb tracks `topIndex` in real time.
3. **Jump to earliest messages** — press `Home`, or drag the scrollbar thumb to the very top. Observe skeleton rows while the region loads.
4. **Scrollbar drag at N = 5 M** — drag the thumb from top to bottom; the jump covers all 5 M rows. The thumb stays 24 px tall.
5. **Eviction observable via DebugBadge** — scroll far from the tail, wait ~1 s; the region count shown in the DebugBadge (bottom-right) drops as far regions are evicted.
6. **Search** — type a word in the search bar; after 300 ms a dropdown of matching messages appears. Click a result to jump to it.
7. **Live tail auto-follow** — stay anchored at the tail; new messages appear automatically every 5 s without any user action.
8. **Day boundaries** — scroll through the message history; a sticky date header appears at the top and a separator row marks each calendar day boundary.

## Known limitations

- TypeScript-strict gates only verified; visual scroll behaviour (jank, overscan transitions) is not covered by automated tests.
- Mid-`topRow` `pixelOffset` is not adjusted when `topRow`'s measured height changes after a content reflow (PR-04-D07 deferred; irrelevant for pure-text rows).
- `search` result dropdown swallows `jumpToId` errors silently; the `JumpToIdInput` widget surfaces its own errors but the search path does not.
- No outside-click handler on the search dropdown; close with Escape or by clicking a result.
- `subscribeNew` ticks unconditionally every 5 s; over many hours the live index could approach the `indexToId` 8-digit ceiling (capped at 99 999 999), which is ~94 M rows past N = 5 M — safe for demo use.

## Testing

```
nix develop --command pnpm test --run
```

201 unit tests across 7 test files (MockBackend, regions, ChatStore, scroll, scrollbarMath, day utils, fetchCoordinator). All gates:

```
nix develop --command pnpm typecheck    # tsc -b, strict
nix develop --command pnpm test --run   # 201 tests
nix develop --command pnpm build        # ~217 KB JS gzipped 69 KB
```

CI is not configured; run locally before each merge.

### End-to-end tests

```
nix develop --command pnpm e2e
```

Headless Chromium only. Browsers come from the Nix dev shell — no
`npx playwright install` required. Headed mode for local debugging:
`pnpm e2e:headed`.

## Project layout

```
src/
  backend/       MockBackend, PRNG, content generator, Message type
  store/         ChatStore, regions, scroll engine, fetch coordinator
  components/    ChatViewport, MessageRow, SkeletonRow, CustomScrollbar,
                 SearchBar, JumpToIdInput, JumpToLatest, DebugBadge,
                 StickyDateHeader, DaySeparator
  util/          day.ts (day-key helpers)
  test/          Vitest setup (ResizeObserver polyfill)
  styles.css     Global reset and typography
  App.tsx        Root: mounts store, backend, live subscription
  main.tsx       React 19 StrictMode entry point
```

## License

None. This is a demo project.
