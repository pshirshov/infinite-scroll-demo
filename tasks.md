# scroll-demo — Task Ledger

Authoritative ledger of planned and completed work. Scope governed by
`./docs/drafts/20260427-2304-m1-plan.md`.

Status: `[ ]` planned · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Milestones (high-level)

- [~] **M1** — Index-space-scrolled chat demo: ChatStore + ChatViewport + custom scrollbar + mock backend + extras (search, day headers, live tail, jump-to-latest), all six functional requirements met at N ≥ 1M.

---

## Milestone 1 — PR breakdown

Detail in `./docs/drafts/20260427-2304-m1-plan.md`. One line per PR here.

- [x] **PR-01** — Vite + React 19 + TS strict scaffold; pnpm scripts; hello-world boots.
- [x] **PR-02** — `MockBackend` with deterministic content gen, all endpoints, abortable, unit-tested.
- [x] **PR-03** — `ChatStore` regions + heights map + observable; pure logic, fuzz-tested.
- [x] **PR-04** — Index-space scroll engine over a fixed preloaded slice; wheel/keyboard input; ResizeObserver.
- [ ] **PR-05** — On-demand fetch + region merging + request coalescing; skeleton rows for unloaded.
- [ ] **PR-06** — Debounced eviction + topRow height-correction + region-count debug badge.
- [ ] **PR-07** — Custom scrollbar (drag + click-track) at N=5M scale.
- [ ] **PR-08** — `jumpToId` end-to-end + dev input field.
- [ ] **PR-09** — Day grouping + sticky date header.
- [ ] **PR-10** — Live tail subscription + `JumpToLatest` pill + auto-follow.
- [ ] **PR-11** — Debounced search bar with results dropdown → click jumps.
- [ ] **PR-12** — Polish, README, default N=5M, full scenario sweep.

---

## Cross-cutting architectural notes (locked)

- [x] **Library versions** — React 19.x, TS 5.9.x strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 6.x, Vitest 2.x, jsdom 25.x, @testing-library/react 16.x. No UI framework. No virtualization library.
- [x] **State management** — plain `ChatStore` class with minimal `subscribe/getSnapshot` observable; React adapter via `useSyncExternalStore`. Justification: synchronous per-wheel-event mutations don't fit reducer flow.
- [x] **Testing** — Vitest in jsdom with a no-op ResizeObserver polyfill (`src/test/setup.ts`). Pure logic gets ≥90% branch coverage on `regions.ts` and `ChatStore`. Layout tests are manual.
- [x] **CSS** — plain CSS files per component, no modules, no CSS-in-JS. Class names prefixed by component (e.g. `.chat-viewport__row`).
- [x] **Scroll-settled detection** — 150 ms `setTimeout` after last input; on settle, run `ensureRange` + start eviction debouncer (750 ms further).
- [x] **Wheel hijack** — `addEventListener('wheel', h, { passive: false })` via `useEffect`; not JSX `onWheel` (which is passive in React 18+). `preventDefault` always.
- [x] **Eviction × in-flight fetches** — `AbortController` per fetch; aborted on eviction or large jump. Resolved fetches whose target was evicted are dropped silently at resolve time.
- [x] **Concurrency** — `ensureRange` chunks into ≤100-row windows, dedupes against `regions[]` and `inflight: Map<rangeKey, AbortController>`; same `rangeKey` (= `startIndex`) never fetched twice concurrently.
- [x] **Coordinate-system invariants (I-1..I-6)** — see plan doc §4. Reviewers must check these every PR. Most critical: I-2 (layout downward from `topIndex`), I-6 (thumb position depends only on `topIndex` and `N`).
- [x] **Determinism** — content + latency seeded; URL param `?seed=N` for reproducible bug reports.
- [x] **Day-header TZ** — browser local via `Intl.DateTimeFormat`. (Was Q-1 in plan.)
- [x] **Tail-anchor threshold** — last row's bottom within 64 px of viewport bottom counts as "anchored to tail". (Was Q-2 in plan.)
- [x] **Eviction on jumpToId** — debounced (same path as scroll-settled), not immediate. Recommended by planner; accepts brief retention of departure region in exchange for cheap back-jump. (Was Q-3 in plan.)
- [x] **No backwards compat** — internal-only code; refactor freely between PRs.

---

## Completed

- **PR-01** (2026-04-27) — Vite + React 19 + TS strict scaffold landed. Stack:
  React 19.2.5, React-DOM 19.2.5, TypeScript 6.0.3, Vite 8.0.10, Vitest 4.1.5,
  @vitejs/plugin-react 6.0.1, @testing-library/react 16.3.2, jsdom installed
  for vitest. App.tsx is a 9-line hello-world; main.tsx mounts in StrictMode.
  Vitest config inline in `vite.config.ts` with `passWithNoTests: true` and
  `environment: "jsdom"`. Verification: `pnpm install`, `pnpm typecheck`
  (= `tsc -b`), `pnpm build`, `pnpm test --run` all exit 0; dev server returns
  HTML with `#root`.
  Notes / surprises:
  - **`composite: true` forbids `noEmit: true`** (TS6310). The original
    PR-01 plan asked for `noEmit: true` on `tsconfig.node.json`; this is
    impossible. Mitigated by `outDir: "dist-node"` (gitignored). Recorded
    in `defects.md` PR-01-D03.
  - **`pnpm typecheck` MUST be `tsc -b`**, not `tsc --noEmit`. The latter
    silently skips referenced projects (e.g. `tsconfig.node.json`),
    masking config-level type errors. Recorded in PR-01-D02. **Future
    PRs adding new `tsconfig.*.json` projects must add them as references
    so `tsc -b` covers them.**
  - **Vitest config in `vite.config.ts` requires `defineConfig` from
    `vitest/config`** — Vite's own `defineConfig` rejects the `test`
    field at type level. Recorded in PR-01-D01.
  - Latest stable resolutions exceeded the planner's hints (TS 6.0.3 vs
    ^5.9, Vite 8.0.10 vs ^6, Vitest 4.1.5 vs 2.x). All confirmed
    non-prerelease versions; reviewer accepted.
  - `tsconfig.node.json` does not set `strict: true`. Reviewer
    explicitly classified as non-defect (10-line config file, trivial).
    If future PRs add code to that project, revisit.
  - Two rounds of adversarial review needed; round 1 found 4 chained
    defects (D01..D04), all fixed in one coordinated change; round 2
    GREEN with no regressions.

- **PR-02** (2026-04-27) — MockBackend, deterministic content generator,
  PRNG, and 41 unit tests. Files: `src/backend/{Message,prng,contentGen,
  MockBackend,MockBackend.test}.ts`, `src/test/setup.ts`. Backend exposes
  `getTotalCount`, `getRange(start,end,signal)` (half-open, clamps),
  `getById(id, signal)` (50 before/after), `getLatest(count, signal)`,
  `subscribeNew(handler) → unsubscribe`, `search(query, signal)`. All
  async methods abortable via `AbortSignal` → `DOMException("aborted",
  "AbortError")`. Latency RNG seeded for cross-run determinism;
  exposed via `peekNextLatencyMs()` `@internal` hook for tests.
  Verification: `pnpm typecheck`, `pnpm test --run` (41 passed),
  `pnpm build` — all exit 0.
  Notes / surprises:
  - **`pickNonEmpty<T>` helper** in `contentGen.ts` replaces `??` +
    `!` patterns. Constructor asserts `authors.length > 0`; tuple
    typing was considered but rejected for clarity. Recorded as
    PR-02-D08.
  - **`indexToId` validates `[0, 99_999_999]`** (PR-02-D01). Future
    risk: `subscribeNew` ticks every 5s; over ~15 years from N=5M
    the index could exceed the validated range and crash. Acceptable
    for demo; document if a longer-running mode is added later.
  - **`search` loop is synchronous** between iterations — abort is
    only honored at the entry `await delay(...)`. Recorded as
    PR-02-D04 (dead in-loop check removed). If a future PR adds
    yields, restore the in-loop check.
  - **`searchScanBudget` and `searchHitBudget`** are configurable
    (defaults 50_000 / 50). Tests set `searchScanBudget=10` to verify
    the cap.
  - **`peekNextLatencyMs()` consumes RNG state** (named "peek" for
    brevity but documented). Tests must not interleave with other
    backend calls when using it. Recorded in JSDoc.
  - Authored timestamps use ±50% jitter on `avgGapMs`; the worst-case
    delta is `0`, so timestamps are weakly monotonic (never inverted)
    by construction. Day-grouping in PR-09 can rely on this.
  - Two rounds of adversarial review: round 1 surfaced 8 defects
    (D01-D08, none major); round 2 GREEN with no regressions.

- **PR-03** (2026-04-27) — `ChatStore` storage layer: pure region
  functions (`src/store/regions.ts`), observable class
  (`src/store/ChatStore.ts`), 79 new tests (total 120 across project).
  Half-open `[start, end)` regions; merge handles adjacency in both
  directions and three-region bridge merges; on overlap, incoming wins
  for shared indices. `evictFarRegions` predicate `endIndex > windowStart
  && startIndex <= windowEnd` (closed window, half-open region); tail
  protection optional. Heights map cleans evicted-and-out-of-band
  indices on `evict()`. Snapshot caching + invalidation enforce
  reference-stable `getSnapshot()` between mutations (required for
  `useSyncExternalStore`); confirmed by tests.
  Verification: `pnpm typecheck`, `pnpm test --run` (120 passed),
  `pnpm build` — all exit 0.
  Notes / surprises:
  - **No bounds check `incoming.endIndex <= totalCount`** in
    `ChatStore.insertRegion` (PR-03-D05). PR-05's fetch coordinator
    will own that validation at the integration boundary.
  - **`as Message[]` cast in `regions.ts:88`** (sparse-array
    initializer) is bounded by an immediate runtime check that throws
    on any unfilled slot. Not a defect; recorded as PR-03-D01 for
    transparency.
  - **`setHeight` is idempotent** when the new value equals the
    stored value (no listener notification). Necessary to prevent
    spurious re-renders during ResizeObserver storms; verified by test.
  - **Snapshot identity is `===`-stable** between mutations.
    Mutators invalidate via single `invalidateAndNotify()` helper —
    each mutator notifies exactly once.
  - One adversarial review: GREEN with 5 minor/informational notes;
    3 (D02-D04) closed via test additions in a 5-test follow-up;
    D01 + D05 closed as note-only.

- **PR-04** (2026-04-27) — Index-space scroll engine: the heart of the
  demo. `(topIndex, pixelOffset)` scroll state, layout flowing
  downward from topRow at viewport-y `-pixelOffset`, ResizeObserver
  per row, wheel + keyboard input. App.tsx fetches latest 200
  messages on boot and renders the viewport.
  Files: `src/store/scroll.ts` (pure `applyScrollDelta` +
  `wheelDeltaToPixels`), `src/store/scroll.test.ts` (13 tests),
  `src/store/useChatStore.ts` (useSyncExternalStore adapter),
  `src/components/{MessageRow,ChatViewport}.{tsx,css}`,
  `src/App.tsx`, `src/styles.css`. 133 tests total (+13).
  Verification: `pnpm typecheck`, `pnpm test --run`, `pnpm build`
  all exit 0. Bundle ~206 KB JS.
  Notes / surprises (CRITICAL READING for future PRs):
  - **`borderBoxSize?.[0]?.blockSize` is the right ResizeObserver
    height source.** `entry.contentRect.height` is content-box
    (excludes padding+border) regardless of `box-sizing`. Using
    `contentRect.height + 1` produced rows that visually overlapped
    by 12 px every render — exactly the user-visible flicker case
    the user explicitly forbade. Recorded as PR-04-D01 (the only
    `major` defect of the project so far). Future PRs adding new
    measured surfaces MUST use `borderBoxSize` (or `offsetHeight`).
  - **Layout flows DOWNWARD from topRow.** Above-rows are positioned
    backward from topRow's top; their height changes don't affect
    visible content. This is invariant I-2 and is what gives PR-04
    its anti-flicker guarantee.
  - **`pixelOffset` is measured from the TOP of `topIndex` row.**
    When topRow's height changes, the topRow's TOP doesn't move —
    visible content above and at topRow stays put; rows below
    reflow naturally. This is invariant I-3.
  - **`applyScrollDelta` is the SINGLE mutation path** for scroll
    state (I-4). All inputs (wheel, keyboard Arrow/Page/Home/End,
    initial-anchor effect) funnel through it. The custom scrollbar
    in PR-07 will follow the same pattern.
  - **Initial anchor at the live tail is a one-shot effect inside
    `ChatViewport`**, gated by `didInitialAnchor` and predicated on
    the tail region being loaded. App.tsx no longer sets topIndex
    directly. Recorded as PR-04-D02.
  - **Wheel listener is attached ONCE per mount** via
    `addEventListener('wheel', h, { passive: false })` with deps
    `[store, viewportHeight]`. Handler reads fresh state from
    `store.getSnapshot()`. Recorded as PR-04-D03.
  - **`onMeasured` is captured via a ref** in `MessageRow` to avoid
    stale-closure traps if the parent's callback identity ever
    changes. Recorded as PR-04-D06.
  - **`ChatStore.getSnapshot` preserves `regions` array reference**
    across pure `setHeight` updates — critical so React effects
    deduped on `regions` don't re-fire on measurement.
  - **D07 (mid-topRow `pixelOffset` adjustment)** deferred to
    PR-05+. Pure text rows don't reflow async; revisit if/when
    images or async content land.
  - **D08 / D09** are non-blocking nits deferred to PR-12 polish.
  - Two adversarial review rounds: round 1 surfaced 7 defects (D01
    major, D02 minor, D03/D04 minor/nit, D05/D06 nits, D07 deferred);
    round 2 GREEN with 2 new non-blocking nits (D08/D09 deferred).

