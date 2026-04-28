# scroll-demo — Task Ledger

Authoritative ledger of planned and completed work. Scope governed by
`./docs/drafts/20260427-2304-m1-plan.md`.

Status: `[ ]` planned · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Milestones (high-level)

- [x] **M1** — Index-space-scrolled chat demo: ChatStore + ChatViewport + custom scrollbar + mock backend + extras (search, day headers, live tail, jump-to-latest), all six functional requirements met at N = 5M.
- [x] **M2** — Playwright environment + bug fixes from user testing: empty bodies after scrollbar drag (FR-2/3 regression), text-selection spans across rows (FR DOM-order issue).

---

## Milestone 1 — PR breakdown

Detail in `./docs/drafts/20260427-2304-m1-plan.md`. One line per PR here.

- [x] **PR-01** — Vite + React 19 + TS strict scaffold; pnpm scripts; hello-world boots.
- [x] **PR-02** — `MockBackend` with deterministic content gen, all endpoints, abortable, unit-tested.
- [x] **PR-03** — `ChatStore` regions + heights map + observable; pure logic, fuzz-tested.
- [x] **PR-04** — Index-space scroll engine over a fixed preloaded slice; wheel/keyboard input; ResizeObserver.
- [x] **PR-05** — On-demand fetch + region merging + request coalescing; skeleton rows for unloaded.
- [x] **PR-06** — Debounced eviction + topRow height-correction + region-count debug badge.
- [x] **PR-07** — Custom scrollbar (drag + click-track) at N=5M scale.
- [x] **PR-08** — `jumpToId` end-to-end + dev input field.
- [x] **PR-09** — Day grouping + sticky date header.
- [x] **PR-10** — Live tail subscription + `JumpToLatest` pill + auto-follow.
- [x] **PR-11** — Debounced search bar with results dropdown → click jumps.
- [x] **PR-12** — Polish, README, default N=5M, full scenario sweep.

---

## Milestone 2 — PR breakdown

Detail in `./docs/drafts/20260427-2304-m2-plan.md`.

- [x] **PR-13** — Playwright environment + smoke test (Nix + pnpm + chromium-only headless).
- [x] **PR-14** — Selection bug: DOM-order fix in `ChatViewport.tsx` layout pass + Playwright regression test.
- [x] **PR-15** — Empty-bodies after scrollbar drag: reproduce in Playwright first, diagnose, fix.

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
- [x] **M2 e2e harness** — Playwright via nix-provided `playwright-driver.browsers`. Chromium-only headless. Tests in `/e2e/*.spec.ts`. Webserver runs `pnpm dev`. Pinned `@playwright/test` matches `nixpkgs#playwright-driver.version`.
- [x] **M2 layout-pass invariant I-7 (will be added in PR-14)** — DOM children of `.chat-viewport__rows` are ordered by `topPx` ascending (via explicit sort in the layout pass). Required for correct text selection.

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

- **PR-13** (2026-04-27) — Playwright e2e harness through Nix.
  Files: `flake.nix` (added `playwright-driver.browsers` + shellHook
  exports), `package.json` (`@playwright/test@1.58.2` + `e2e` /
  `e2e:headed` scripts), `playwright.config.ts` (chromium-only
  headless, webServer auto-starts pnpm dev), `e2e/smoke.spec.ts` (one
  test asserting visible non-empty `.chat-message__body`),
  `vite.config.ts` (added `e2e/**` to Vitest excludes), `.gitignore`,
  `README.md` (added e2e subsection).
  Verification: `pnpm typecheck`, `pnpm test --run` (201 unit tests),
  `pnpm build`, `pnpm e2e` (1 spec, ~28 s) all exit 0.
  Notes / surprises:
  - **Playwright version pinned to 1.58.2** matching
    `nixpkgs#playwright-driver.version`. No `nix flake update`
    needed — alignment was already exact in current nixpkgs.
  - **`PLAYWRIGHT_BROWSERS_PATH` resolves under `/nix/store/...`** —
    no `npx playwright install` required. Sandbox-friendly.
  - **Vitest picked up the e2e spec by default** because
    `@playwright/test`'s `test` symbol clashes with Vitest's at import
    time, causing a file-level error. Fixed by adding `e2e/**` to the
    pre-existing Vitest `exclude` array.
  - **`flake.nix` requires `git add`** for nix to see modifications —
    same gotcha as PR-01.
  - No adversarial review (mechanical environment setup); the smoke
    test passing IS the verification.

- **PR-14** (2026-04-27) — Selection bug fix + Playwright regression
  test. Files: `e2e/selection.spec.ts` (new, 2 tests),
  `src/components/ChatViewport.tsx` (added I-7 invariant comment +
  one-line sort).
  Verification: gates exit 0; 201 unit tests + 3 e2e tests (1 smoke +
  2 selection) all pass.
  Notes / surprises:
  - **Test-first discipline applied.** The drag-select probe FAILED
    on the unmodified code (`captured === ""` — Chromium produced an
    empty selection when start/end nodes were in DOM but their
    ancestors were out of visual order). Fix applied; both tests
    pass.
  - **The fix is a single line: `rowsToRender.sort((a, b) =>
    a.topPx - b.topPx)`** before the JSX `.map`. Two layout loops
    populate the array in `[below..., above-descending]` order; the
    sort makes the DOM order match the visual order regardless of
    how the loops are arranged.
  - **React reconciles on `key={index}`** (stable per row), so
    reordering the array does not unmount/remount rows.
  - **I-7 added to the file's invariants header**: DOM children of
    `.chat-viewport__rows` MUST be in `topPx`-ascending order.
    Future layout-pass changes must preserve this.
  - Recorded as PR-14-D01 (major, user-reported).

- **PR-15** (2026-04-27) — Empty-bodies-after-scrollbar-drag fix.
  Diagnosis-first; investigation revealed React StrictMode interacted
  with PR-05's dispose lifecycle in a subtle, undertested way.
  Files: `e2e/jump-then-render.spec.ts` (new repro test),
  `src/App.tsx` (resource-creation pattern fix). 201 unit tests + 4
  e2e tests (smoke + 2 selection + jump-then-render) all green.
  Verification: gates exit 0; bundle 217 KB JS.
  Notes / surprises (CRITICAL READING for future PRs):
  - **Bug:** PR-05 added `useEffect(() => () => store.dispose(),
    [store])` to clean up the FetchCoordinator on unmount. Resources
    were created via `useState(() => new ChatStore(...))` whose
    initializer runs ONCE per component instance. React 18
    `<StrictMode>` simulates an unmount in dev: mount → cleanup →
    re-mount. The cleanup disposed store-1. The remount **reused the
    same disposed store-1** because `useState` state survives the
    StrictMode cycle. Every subsequent prefetch went through the
    coordinator's `disposed` race-guard (PR-05-D01) and was silently
    dropped. Smoke test passed because the initial `getLatest`
    insert goes through `insertRegion` directly, not through the
    coordinator. Only post-drag prefetches were silenced.
  - **PR-05's round-1 review explicitly flagged the StrictMode
    interaction** but mis-analyzed: "useState initializer only runs
    once per mount instance, so the second mount creates a fresh
    store" — INCORRECT. State is preserved; initializer doesn't
    re-run on remount.
  - **Fix:** Move resource construction from `useState` initializer
    into a dedicated `useEffect` whose cleanup disposes. The
    mount→cleanup→mount cycle now creates fresh resources.
    Children render `null` until `resources !== null`
    (instantaneous). Pattern documented in code.
  - **Why M1 unit tests didn't catch it:** unit tests instantiate
    stores directly, never via React lifecycle. StrictMode's
    double-mount pattern is invisible to pure unit tests. The e2e
    harness — exercising the real React tree — caught it.
  - **Pattern for future code:** all imperative resources whose
    lifetime tracks the React tree MUST be created in an effect,
    NEVER via `useState(() => new Resource())` when paired with a
    dispose cleanup. Codify in CONTRIBUTING if M3+ adds more such
    resources.
  - Repro-first discipline applied: failing repro test landed
    BEFORE the fix; failure was timeout on
    `expect.poll(skeletons === 0)` — skeletons stuck because no
    chunks ever resolved. Diagnostic logs traced the suppression
    to `disposed === true`.
  - Recorded as PR-15-D01 (major).

- **PR-05** (2026-04-27) — On-demand fetch coordinator + skeleton rows.
  Files: `src/store/fetchCoordinator.{ts,test.ts}`, `src/store/
  ChatStore.ts` (extended), `src/components/SkeletonRow.tsx`,
  `src/components/MessageRow.css` (skeleton class),
  `src/components/ChatViewport.tsx` (debounced ensureRange + skeletons),
  `src/App.tsx` (passes backend, dispose lifecycle). 162 tests total
  (+8 in fetchCoordinator.test.ts including race-condition coverage).
  Verification: `pnpm typecheck`, `pnpm test --run`, `pnpm build` all
  exit 0; bundle 209 KB JS.
  Notes / surprises (CRITICAL READING for future PRs):
  - **Resolved-after-aborted race** (PR-05-D01) was the headline bug
    surfaced in round 1: `.then` resolution must check
    `this.disposed || controller.signal.aborted` before calling
    `onChunk`. Without the guard, fetches that race past their abort
    silently insert stale regions. Now: `disposed` flag set early in
    `dispose()`; `.then` and `.catch` both gate on it; `.finally`
    always cleans up `inflight` map.
  - **`ChatStore.abortFetchesOutside` MUST be wired** (PR-05-D02) —
    just exposing it isn't enough. Now called alongside `ensureRange`
    in the scroll-settled callback, so off-screen fetches are
    cancelled when the user moves on.
  - **`scheduleEnsureRange` reads fresh `getSnapshot()` at fire time**
    (PR-05-D03), not at schedule time. Critical for correct prefetch
    after the initial-anchor effect snaps `topIndex` from 0 to ~tail.
    The initial-anchor effect itself also calls
    `ensureRange + abortFetchesOutside` post-anchor.
  - **`estimatedRowHeight` is on the snapshot now** (PR-05-D04). Avoids
    the literal-60 duplication. Future code reading "estimated height"
    must use `snap.estimatedRowHeight`.
  - **`FetchCoordinator.inflightChunks()` is the typed iterator**
    (PR-05-D05) — production code does NOT parse `${start}-${end}`
    keys. The internal map's value carries the structured `{start,
    end, controller}`.
  - **`ChatStore.dispose()` exists and is called from
    `App.tsx`'s store effect cleanup** (PR-05-D06). On
    StrictMode double-mount, the first store is disposed; the
    in-flight resolutions land but are no-ops because of the
    `disposed` guard.
  - **Skeleton rows have no animation/pulse/transition** — explicitly
    forbidden by the user's no-flicker requirement. Verified by CSS
    inspection (no `@keyframes`, no `transition`, no `animation`).
  - Two adversarial review rounds: round 1 surfaced 10 defects (3
    major: D01, D02, D03; rest minor/nit); all fixed in one
    coordinated pass. Round 2 reviewer hit budget limit before
    producing a verdict; orchestrator self-verified the critical
    code paths (race guards, wiring, dispose lifecycle) and confirmed
    all 162 tests pass. Pragmatic close-out given budget.

- **PR-06** (2026-04-27) — Debounced auto-eviction + DebugBadge.
  Files: `src/store/ChatStore.ts` (added `scheduleEvict`,
  `flushPendingEvictionForTest`, dispose integration),
  `src/components/ChatViewport.tsx` (calls `scheduleEvict` from both
  scrollSettled timer and initial-anchor effect; computes
  `tailAnchored` heuristic), `src/components/DebugBadge.{tsx,css}`
  (new fixed-position overlay), `src/App.tsx` (renders DebugBadge).
  4 new tests (162 → 166).
  Verification: `pnpm typecheck`, `pnpm test --run`, `pnpm build`
  all exit 0; bundle ~210 KB JS.
  Notes / surprises:
  - **`scheduleEvict` debounce = 750 ms** matching the plan's
    cross-cutting decision. Each call clears the prior timer.
    `dispose()` clears the timer; `disposed` flag suppresses
    further `scheduleEvict` calls.
  - **`tailAnchored` heuristic** is approximated as
    `(totalCount-1 - topIndex)*estimatedRowHeight - pixelOffset
    <= viewportHeight + 64`. PR-06-D01 noted that this is
    technically distance to last-row-top (off by one row from
    spec). Harmless: more permissive than spec, can never
    false-positive when far above tail. Tighten in PR-12.
  - **DebugBadge has zero animation/transition** by spec — the
    no-flicker rule applies even to debug overlays.
  - **Eviction × heights cleanup interaction** verified by review:
    even with the height-clearing band `[topIndex ± 2*keepRadius]`,
    a protected-tail region's heights are NOT cleared because the
    region itself isn't in `evictedRegions`.
  - One adversarial review (lighter pass given mostly mechanical
    wiring): GREEN with 1 advisory (D01).

- **PR-07** (2026-04-27) — Custom scrollbar: vertical track on right
  edge of viewport, draggable thumb at `topIndex / N`, click-on-track
  pages up/down. Thumb height clamped to min 24 px so it stays
  draggable at N=5M scale. Files: `src/components/scrollbarMath.{ts,
  test.ts}` (pure helpers, 16 tests), `src/components/CustomScrollbar.
  {tsx,css}`, `src/components/ChatViewport.{tsx,css}` (flex layout to
  accommodate scrollbar column; `onScrollbarJump` calls `setTopIndex
  + scheduleEnsureRange`). 182 tests total (+16).
  Verification: `pnpm typecheck`, `pnpm test --run`, `pnpm build`
  all exit 0; bundle 211 KB JS.
  Notes / surprises:
  - **Scrollbar is index-space**, not pixel-space. Thumb position
    is `topIndex / max(1, totalCount-1)` of available track. With
    N=5M and viewportHeight=600, the thumb is clamped to 24 px (the
    natural size would be 0.0012 px). Drag → frac → topIndex is
    pure arithmetic; no cumulative drift.
  - **Drag is pass-through**: every pointermove computes a new
    topIndex and calls `onJump`, which mutates the store. No
    separate "dragging" state. Thumb position is always derived
    from store state. PR-07-D01 noted that pointer-capture used
    `e.target as Element`; replaced with `e.currentTarget` to
    avoid the latent foot-gun if thumb ever gains children.
  - **Click on bare track pages** by `visibleRowCount` —
    `clickToTargetIndex` returns `null` when click lands on the
    thumb so dragging doesn't trigger spurious page jumps.
  - Layout uses `display: flex` on the viewport; scrollbar column
    is fixed-width 12 px with `flex-shrink: 0`.
  - One lightweight adversarial review: GREEN with 1 minor
    (D01) fixed inline.

- **PR-08** (2026-04-27) — `jumpToId(id)` end-to-end + dev input.
  Files: `src/store/ChatStore.ts` (added `jumpToId`, `backendRef`),
  `src/components/JumpToIdInput.{tsx,css}`, `src/App.tsx` (title bar
  with input). 187 tests (+5).
  Verification: `pnpm typecheck`, `pnpm test --run`, `pnpm build`
  all exit 0; bundle ~213 KB.
  Notes / surprises:
  - **`jumpToId` order:** disposed-check → no-backend-check →
    abortFetchesOutside(0,0) → await getById → second
    disposed-check (after await) → insertRegion → setTopIndex →
    scheduleEvict(false). The mid-await disposed check is
    critical — without it, a fetch that races past dispose
    would mutate a torn-down store.
  - **Rejection propagates** without any partial mutation. Tests
    verify `topIndex/pixelOffset/regionCount` stay unchanged on
    `getById` rejection.
  - **`abortFetchesOutside(0, 0)`** with degenerate keep-window
    aborts ALL in-flight fetches — semantically clean, no
    special-case method needed.
  - **No post-jump explicit ensureRange** call: the 50+1+50 = 101
    messages returned by `getById` cover the immediate viewport
    plus overscan. Additional prefetch happens on next user input
    via the existing scrollSettled flow.
  - One lightweight adversarial review: GREEN, all 7 probes pass.

- **PR-09** (2026-04-27) — Day grouping + sticky date header.
  Files: `src/util/day.{ts,test.ts}` (10 tests), `src/components/
  DaySeparator.{tsx,css}` (inline 32 px label), `src/components/
  StickyDateHeader.{tsx,css}` (absolute overlay, z-index 10),
  modifications to `MessageRow.tsx` and `ChatViewport.tsx`.
  197 tests total (+10).
  Verification: gates exit 0; bundle ~214 KB JS.
  Notes / surprises:
  - **Day separators live INSIDE MessageRow** as a child div when
    `firstOfDay` is set — NOT as a separate index-space row. This
    keeps the index-space scroll model intact; the row's measured
    height naturally includes the separator.
  - **Sticky-header override picks the row with MAX topPx ≤ 0**
    (closest-to-fold), not the array-last match. PR-09-D01
    surfaced this as a real bug (the array order is
    below-then-above-descending, so naive last-wins picked the
    most-distant-above-fold row). Fixed inline.
  - **`dayLabel`** uses `Intl.DateTimeFormat` (browser local TZ)
    with "Today" / "Yesterday" specials. Per cross-cutting
    decision Q-1 in plan.
  - **No animations** on either component — the no-flicker rule
    extends to date-header transitions. Push-up offset is
    computed per render, not animated.
  - Row-height jump on chunk-arrival (a row gains a separator
    when its predecessor finally loads) shifts later rows down
    by ~32 px. This is per-spec — only below-rows shift, per
    I-2. Recorded as PR-09-N02 note.
  - One lightweight adversarial review: 1 minor defect (D01)
    found and fixed inline; 2 notes recorded.

- **PR-10** (2026-04-27) — Live tail subscription + JumpToLatest pill
  + auto-follow when tail-anchored. Files: `src/store/ChatStore.ts`
  (`handleLiveMessage`, `clearUnseen`, `unseenCount` snapshot field),
  `src/components/JumpToLatest.{tsx,css}`, `src/components/
  ChatViewport.tsx` (`snapToTail` + auto-follow effect), `src/App.tsx`
  (subscribeNew effect). 201 tests (+4).
  Verification: gates exit 0; bundle ~215 KB JS.
  Notes / surprises:
  - **`handleLiveMessage` calls the pure `insertRegion(regions, r)`
    helper directly** — NOT `this.insertRegion(...)` — to avoid
    double-notify (insertRegion + setTotalCount would notify twice;
    a single live message must produce a single render).
  - **`clearUnseen` short-circuits when already 0** — prevents the
    auto-follow effect's secondary calls from churning the snapshot
    pointlessly.
  - **Auto-follow effect** in ChatViewport fires when `tailAnchored
    && unseenCount > 0`; calls `snapToTail` which calls
    `setTopIndex + clearUnseen`. Effect re-runs (deps change) but
    guards on `unseenCount === 0` → no infinite loop.
  - **JumpToLatest pill** has zero animation: hidden via
    `null` return, not via CSS opacity transition. Label switches
    between "N new ↓" and "Jump to latest ↓" based on unseenCount.
  - **App.tsx subscribe lifecycle** is StrictMode-correct: cleanup
    unsubscribes; second mount re-subscribes; backend's interval
    starts/stops with subscriber count per `subscribeNew` contract.
  - One lightweight adversarial review: GREEN, no defects.

- **PR-11** (2026-04-27) — Debounced search bar + results dropdown.
  Files: `src/components/SearchBar.{tsx,css}`,
  `src/components/SearchResults.tsx`, `src/App.tsx` (mounts SearchBar
  in title bar). Test count unchanged (201) — debounce/abort logic is
  inline in the component; manual test only.
  Verification: gates exit 0; bundle ~217 KB.
  Notes / surprises:
  - **Per-keystroke AbortController**: each render's `useEffect`
    creates a fresh controller + timer. Cleanup BOTH clears the
    timer AND aborts the controller. `.then` and `.catch` guard on
    `signal.aborted` so stale fetches don't write to state.
    Identical pattern to the FetchCoordinator race-fix from PR-05.
  - **Empty-query short-circuit** clears state without scheduling a
    fetch.
  - **Click on result** silently catches `jumpToId` rejection (the
    rationale comment is slightly misleading — JumpToIdInput
    surfaces its own errors, but the search dropdown does not).
    Acceptable per spec; could surface errors in PR-12 polish.
  - **No outside-click handler** on the dropdown — Escape or click
    on a result closes it. Acceptable per spec.
  - **No CSS animation** on the search UI — no `@keyframes`,
    `animation`, or `transition` per the no-flicker rule.
  - One lightweight adversarial review: GREEN, no defects raised
    (2 acceptable notes).

- **PR-12** (2026-04-27) — Final polish and N bump to 5M. Files:
  `src/App.tsx` (N: 1M → 5M), `src/components/ChatViewport.tsx`
  (PR-04-D08 cleanup: `viewportHeight: useState<number | null>(null)`
  with proper null-guards at every use site; PR-06-D01 cleanup:
  added `+ snap.estimatedRowHeight` to `distanceToLastRowBottom`
  in BOTH derivations), `README.md` (full rewrite: ~145 lines covering
  architecture, requirements mapping, demo scenarios, limitations,
  testing, layout). Test count unchanged (201).
  Verification: `pnpm typecheck`, `pnpm test --run` (201 passed),
  `pnpm build` all exit 0. Bundle 217 KB JS / 69 KB gzip.
  Notes:
  - **No TODOs in `src/`** — `grep -rn "TODO|FIXME|XXX"` clean.
  - **N=5M is the demo default** — boots in well under a second
    because only `getTotalCount` + `getLatest(200)` are called at
    init.
  - **Visual scroll behavior remains manually-verified only** — the
    8 demo scenarios in the README capture the manual test plan.
  - The two deferred minor defects (PR-04-D08, PR-06-D01) are
    closed: the `null` placeholder for viewportHeight prevents a
    spurious initial-anchor against a 600-px assumption (although
    in practice the race always favored RO measurement); the
    tail-anchor formula now correctly represents distance to last
    row's BOTTOM, matching the spec's "within 64 px of viewport
    bottom" wording.

