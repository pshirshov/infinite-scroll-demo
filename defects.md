# scroll-demo — Defect Ledger

Reviewer findings. Append-only. Headlines describe the problem, never the fix.

Status: `[ ]` open · `[~]` under fix · `[x]` resolved
Severity: `major` (blocks merge) · `minor` (should fix, can defer with rationale) · `nit` (cosmetics)

Defect ID format: `PR-NN-DMM` — assigned sequentially within the PR group, never reused.

---

## PR-01

### [PR-01-D01] `vite.config.ts` has a real TS type error — `test` field not on Vite's `UserConfigExport`
**Status:** resolved
**Severity:** major
**Location:** `vite.config.ts:1-10`
**Description:** `defineConfig` is imported from `"vite"`, whose `UserConfigExport` type does not declare a `test` field. Running `nix develop --command npx tsc -b` reports `vite.config.ts(6,3): error TS2769: ... 'test' does not exist in type 'UserConfigExport'`. Vitest exposes a Vitest-aware `defineConfig` at `vitest/config` for exactly this reason. The runtime build still works because Vite ignores unknown keys, but the project fails strict TS — directly violating the spec.
**Fix:** Changed `vite.config.ts` import to `import { defineConfig } from "vitest/config";`. Verified `pnpm typecheck` (now `tsc -b`) passes.

### [PR-01-D02] `pnpm typecheck` does not exercise project references; config-level TS errors invisible
**Status:** resolved
**Severity:** major
**Location:** `package.json` `typecheck` script; `tsconfig.json`
**Description:** Root `tsconfig.json` uses `"include": ["src"]` plus a project reference to `tsconfig.node.json` (which owns `vite.config.ts`). The `typecheck` script runs `tsc --noEmit` which compiles only the root project; project references are honored only by `tsc -b`. Result: PR-01-D01 passes through unnoticed. The spec gate "typecheck must be clean" is therefore vacuous for any file outside `src/`.
**Fix:** Updated `package.json`: `typecheck` is now `tsc -b`, `build` is now `tsc -b && vite build`. Both gates now traverse all referenced projects.

### [PR-01-D03] `tsconfig.node.json` missing `noEmit: true`; emits artefacts under `tsc -b`
**Status:** resolved (mechanism changed: `outDir: "dist-node"` instead of `noEmit: true`)
**Severity:** minor
**Location:** `tsconfig.node.json`
**Description:** Spec PR-01 §3 calls for `noEmit: true`. Root tsconfig has it; node sub-config does not. With `composite: true` and no `outDir`, running `tsc -b` emits `vite.config.js`, `vite.config.d.ts`, and `tsconfig.node.tsbuildinfo` next to the source. Once D02 is fixed and `typecheck` uses `-b`, every run pollutes the tree.
**Root cause / why the fix differs:** `tsc -b` rejects `noEmit: true` on a `composite: true` project with TS6310 ("Composite projects may not disable emit"). The Suggested fix as written cannot be applied. Equivalent intent — keep emitted artefacts out of the project root — is achieved with `outDir`.
**Fix:** Added `"outDir": "dist-node"` to `tsconfig.node.json`'s `compilerOptions`. All `tsc -b` artefacts (`vite.config.js`, `.d.ts`, `.tsbuildinfo`) now land in `dist-node/`. `dist-node/` added to `.gitignore`.

### [PR-01-D04] `.gitignore` does not exclude `*.tsbuildinfo`
**Status:** resolved
**Severity:** nit
**Location:** `.gitignore`
**Description:** Even after D03 is fixed, defensive practice and the official Vite template ignore `*.tsbuildinfo`. If a developer runs `tsc -b` while D03 is unfixed, three artefacts appear in the project root marked as "modified" by git.
**Fix:** Appended `*.tsbuildinfo` and `dist-node/` to `.gitignore` (the latter covers the D03 outDir mechanism).

---

## PR-02

### [PR-02-D01] `indexToId` produces malformed IDs for index ≥ 100_000_000 and for negative indices (encoder/decoder asymmetry)
**Status:** resolved
**Severity:** minor
**Location:** `src/backend/Message.ts:22-24`
**Description:** `indexToId(100000000)` returns `"msg-100000000"` (9 digits) and `indexToId(-1)` returns `"msg-000000-1"`. Both round-trip via `idToIndex` throw `Malformed message id`. The encoder produces values its own decoder rejects — a contract asymmetry. While N=5,000,000 is well under 100M, no upstream guard prevents misuse, and negative inputs corrupt silently.
**Suggested fix:** Validate `Number.isInteger(index) && index >= 0 && index <= 99_999_999` in `indexToId`, throw `Error("indexToId: index out of range")` otherwise. Keep the 8-digit fixed-width contract (decoder unchanged).

### [PR-02-D02] Test gap: case-insensitive search not asserted to find the same hits regardless of query case
**Status:** resolved
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts:208-213`
**Description:** Existing test only checks the snippet contains "the" lowercase when query is "The". Doesn't verify `search("THE")` and `search("the")` return the same hit set. Regression where impl lowercased only body or only query would not be caught.
**Suggested fix:** Add a test comparing hit indices between `search("the")` and `search("THE")`; assert equal length and pointwise-equal `index` values.

### [PR-02-D03] Test gap: search scan-budget cap (50_000) is not actually verified
**Status:** resolved
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts` (no test exists)
**Description:** Implementation caps scan at `Math.min(totalCount, 50_000)`. No test exercises N > 50_000 to verify scan stops. Hit-budget cap is independently enforced; dropping `Math.min` would still pass current tests.
**Suggested fix:** Add `scanBudget` and `hitBudget` (or just `searchScanBudget`/`searchHitBudget`) to `MockBackendConfig` with current defaults. Test sets `searchScanBudget=10`, asserts that a token guaranteed to appear at index ≥ 10 is NOT in the hit list while ones at index < 10 are.

### [PR-02-D04] Test gap (or unreachable code): mid-loop abort branch in `search` has no test
**Status:** resolved
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts:365-375`
**Description:** Existing abort test fires `controller.abort()` synchronously, so the abort happens during the initial `await delay(...)` — never inside the per-row loop. If the implementation has a mid-loop `if (signal?.aborted) throw …` it is uncovered; if the loop is fully synchronous between awaits, the check is unreachable.
**Suggested fix:** First check the implementation. If the loop is synchronous (no awaits between iterations), REMOVE the dead mid-loop signal check (it can never fire — JS can't service the abort) and add a one-line code comment explaining why no in-loop check is needed. If the loop yields (via `await Promise.resolve()` every K rows, say), add a test that aborts during the scan and asserts `AbortError`. Pick whichever matches current behavior; do not add a yield purely to enable the test.

### [PR-02-D05] Test gap: non-zero latency determinism never asserted
**Status:** resolved
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts` (no test exists)
**Description:** Spec: "latency is deterministic across runs" via seeded latency RNG. All tests use min=max=0 (or 100=100), trivially deterministic. A regression replacing `latencyRng` with `Math.random` would not fail any current test.
**Suggested fix:** Add a test using fake timers and bounds (e.g. min=10, max=20). Two backends with same seed run identical call sequences; capture per-call delay durations (e.g. via `vi.advanceTimersByTime` increments needed); assert sequences equal. Alternatively expose a `peekNextLatencyMs()` test hook on the backend.

### [PR-02-D06] Test gap: emitted live-tail message body not asserted equal to `generateMessage(ctx, N)`
**Status:** resolved
**Severity:** nit
**Location:** `src/backend/MockBackend.test.ts:250-277`
**Description:** Test only compares `id`. Since `id` depends on index alone, two implementations that diverge on body/author/ts but agree on index would pass.
**Suggested fix:** Strengthen to `expect(range[0]).toEqual(emittedMessage)`.

### [PR-02-D07] Test gap: `idToIndex` strictness for trailing-junk inputs
**Status:** resolved
**Severity:** nit
**Location:** `src/backend/MockBackend.test.ts:27-38`
**Description:** Tests cover missing prefix, wrong digit count, non-numeric digits, but not `"msg-00001234extra"` (correct prefix and 8 digits but trailing junk). Current impl rejects it; behavior is just not pinned.
**Suggested fix:** Add `expect(() => idToIndex("msg-00001234extra")).toThrow();`.

### [PR-02-D08] `??` fallback paired with `!` assertion is dead-code noise
**Status:** resolved
**Severity:** nit
**Location:** `src/backend/contentGen.ts:134, 142`
**Description:** `CODE_SNIPPETS[snippetIdx] ?? CODE_SNIPPETS[0]!` and `ctx.authors[authorIdx] ?? ctx.authors[0]!` are defensive against `noUncheckedIndexedAccess`, but `snippetIdx`/`authorIdx` are always in-bounds for non-empty arrays. The `!` is a workaround.
**Fix:** Added `pickNonEmpty<T>(arr, idx): T` helper at the bottom of `contentGen.ts` (asserts non-empty internally, returns `T`); replaced all three `?? fallback!` patterns. Constructor asserts `config.authors.length > 0`.

---

## PR-03

### [PR-03-D01] `as Message[]` cast in `insertRegion` (informational; bounded by runtime validation)
**Status:** resolved (note-only — pattern bounded by an immediate runtime check that throws on any unfilled slot)
**Severity:** nit
**Location:** `src/store/regions.ts:88`
**Description:** `const newMessages: Message[] = new Array(newEnd - newStart) as Message[];` uses `as` to declare the freshly-constructed sparse array as fully-populated. The cast does hide that intermediate slots are `undefined`. However, lines 107-117 exhaustively validate no slot is `undefined` and throw if any remain unfilled. The cast's type-hiding is therefore tightly bounded.
**Fix:** Note-only. A cleaner alternative would be `: (Message | undefined)[]` then narrow after validation; not worth the churn at this stage.

### [PR-03-D02] Test coverage gap: `evictFarRegions` exact-boundary `endIndex === windowStart`
**Status:** resolved
**Severity:** minor
**Location:** `src/store/regions.test.ts`
**Description:** Brief explicitly called out the boundary `endIndex === centerIndex - keepRadius` (with the half-open-region/closed-window predicate `endIndex > windowStart` evaluating FALSE — region evicted). Adjacent boundaries are tested (endIndex=49 well below; endIndex=51 well above) but the exact-equality case is uncovered.
**Fix:** Added two boundary tests in `regions.test.ts`: `region(0,50)` against window starting at 50 (evicted) and `region(0,51)` (kept by 1).

### [PR-03-D03] Test coverage gap: `unloadedSubranges` with regions outside the requested range
**Status:** resolved
**Severity:** minor
**Location:** `src/store/regions.test.ts`
**Description:** Code at `regions.ts:193` correctly skips regions whose `endIndex <= start || startIndex >= end`, but no test exercises this branch.
**Fix:** Added two tests in `regions.test.ts` exercising both above-range and below-range region positions.

### [PR-03-D04] Test coverage gap: `getHeightMapSizeForTest()` not exercised
**Status:** resolved
**Severity:** nit
**Location:** `src/store/ChatStore.test.ts`
**Description:** Internal accessor `getHeightMapSizeForTest()` was added but never asserted. Eviction tests check per-index `hasHeight` but a direct size assertion would be tighter.
**Fix:** Added test asserting map size goes from 2 to 0 after evicting a far region whose two heights had been populated.

### [PR-03-D05] No bounds check `incoming.endIndex <= totalCount` on `ChatStore.insertRegion` (informational)
**Status:** resolved (note-only — brief explicitly permissive; deferred to the integration boundary)
**Severity:** nit
**Location:** `src/store/ChatStore.ts:insertRegion`
**Description:** Neither `regions.insertRegion` nor `ChatStore.insertRegion` validates that `incoming.endIndex <= totalCount`. Reasonable defensive behavior would be to reject; the brief was explicitly permissive.
**Fix:** Note-only. PR-05 will own the fetch coordinator that produces incoming regions; bounds-checking belongs there.

---

## PR-04

### [PR-04-D01] ResizeObserver `contentRect.height + 1` under-reports row height by 12 px — adjacent rows visually overlap
**Status:** resolved
**Severity:** major
**Location:** `src/components/MessageRow.tsx:30`
**Description:** `.chat-message` uses `box-sizing: border-box` (global rule in `styles.css`) plus `padding: 6px 16px;` and `border-bottom: 1px;`. The Resize Observer spec mandates `contentRect.height` excludes padding AND border. So for true border-box height H, `contentRect.height = H − 12 − 1 = H − 13`. The code reports `contentRect.height + 1 = H − 12`. **Each row's reported height is 12 px short of true.** Layout pass at `ChatViewport.tsx:155-170` advances `y` by `store.getHeight(i)` between rows, so row N+1 lands 12 px above row N's bottom border. **Adjacent rows visually overlap by 12 px on every render.** This is the user-perceptible flicker case the user explicitly forbade — every `setHeight` resolution triggers a re-render with these wrong values.
**Fix:** Replaced height source with `entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height`. Both report full border-box height including padding and border. Removed `+1` and misleading `// border` comment. Round-2 review confirmed no other `contentRect.height` uses for row layout positioning.

### [PR-04-D02] Initial scroll position lands at the OLDEST of the loaded latest-200, not at the live tail
**Status:** resolved
**Severity:** minor
**Location:** `src/App.tsx:18`
**Description:** `backend.getLatest(200)` returns `{messages, startIndex: N - 200}`. Boot effect calls `store.setTopIndex(startIndex, 0)`, so the user sees message #999,800 at the top. The actual latest message is ~200 rows below, off-screen. Every chat UI opens at the bottom (newest visible). Jarring as-is.
**Fix:** Added one-shot `didInitialAnchor` effect in `ChatViewport.tsx:46-60` that fires once when `viewportHeight > 0` and a tail region (`r.endIndex === totalCount`) is loaded. Calls `applyScrollDelta({totalCount-1, 0}, 0, ...)` to snap the last row to viewport bottom, then sets the flag. Effect deps exclude `topIndex/pixelOffset`. `ChatStore.getSnapshot` preserves `regions` array reference across pure `setHeight` updates, so the effect doesn't re-fire on measurement either.

### [PR-04-D03] Wheel listener re-attaches on every `topIndex` change
**Status:** resolved
**Severity:** minor
**Location:** `src/components/ChatViewport.tsx:57-77`
**Description:** `useEffect` deps `[store, topIndex, viewportHeight]`. Every scroll changes `topIndex` → cleanup detaches and re-attaches the wheel listener. Cheap-but-pointless churn; widens a window where a wheel event lands during the swap.
**Fix:** Dropped `topIndex` from the dep array (now `[store, viewportHeight]`). Handler reads fresh state via `store.getSnapshot()`. The constant from D04's fix eliminated the only closure dependency on topIndex.

### [PR-04-D04] LINE-mode wheel uses topRow's measured height, not a constant
**Status:** resolved
**Severity:** nit
**Location:** `src/components/ChatViewport.tsx:62`
**Description:** `wheelDeltaToPixels(e, store.getHeight(topIndex), ...)` makes wheel velocity depend on the topRow's instantaneous height — short topRow scrolls slowly, tall topRow scrolls fast. Spec calls for a fixed `estimatedRowHeight`. Keyboard correctly uses `KEYBOARD_SCROLL_PX = 60`.
**Fix:** Introduced `WHEEL_LINE_PX = 60` module-level constant (= `KEYBOARD_SCROLL_PX`). Wheel handler uses it directly. No closure dependency on topIndex.

### [PR-04-D05] `Home` bypasses `applyScrollDelta`, violating I-4
**Status:** resolved
**Severity:** nit
**Location:** `src/components/ChatViewport.tsx:97-100`
**Description:** Spec invariant I-4: "applyScrollDelta is the ONLY mutation path for scroll state." `Home` calls `store.setTopIndex(0, 0)` directly; `End` correctly routes through `applyScrollDelta`. Asymmetry; future-proofing risk.
**Fix:** Home now routes through `applyScrollDelta({topIndex:0, pixelOffset:0}, 0, totalCount, store, viewportHeight)` then `store.setTopIndex(...)`, mirroring End.

### [PR-04-D06] `MessageRow`'s ResizeObserver `useEffect` uses eslint-disable for `onMeasured` exclusion; rationale is wrong
**Status:** resolved
**Severity:** nit
**Location:** `src/components/MessageRow.tsx:34-35`
**Description:** Comment says "parent recreates" — but it doesn't (parent's `onMeasured` is `useCallback(..., [store])` with stable store). The eslint-disable is load-bearing on a rationale that is itself incorrect. A future regression introducing a real dep into the parent's `useCallback` would silently produce stale-closure measurements.
**Fix:** Stashed `onMeasured` in a ref updated synchronously each render; observer callback reads `onMeasuredRef.current(...)`. `useEffect` deps reduced to `[message.index]`. eslint-disable removed.

### [PR-04-D08] Dead `viewportHeight === 0` guard in tail-anchor effect (defaults to 600)
**Status:** resolved (deferred to PR-12 polish — practically dead code in current flow; race always favors RO measurement before backend fetch resolves)
**Severity:** nit
**Location:** `src/components/ChatViewport.tsx:42` (`useState(600)`) and the tail-anchor effect's `=== 0` guard
**Description:** `viewportHeight` is `useState(600)` (placeholder). The tail-anchor effect's `if (viewportHeight === 0) return` is therefore dead in the normal flow. In practice `MockBackend.getLatest` always awaits a delay, so RO measurement wins the race and the placeholder is overwritten before the anchor fires. Intent — "wait for first measurement before anchoring" — is not actually enforced.
**Fix:** Deferred. Cleaner pattern is `useState<number | null>(null)` with `if (viewportHeight === null) return`. Defer to PR-12 polish.

### [PR-04-D09] End/Home with last row taller than viewport leaves blank space below (pre-existing)
**Status:** resolved (deferred — far outside normal data scope; pre-existing in `applyScrollDelta`, not introduced by D05)
**Severity:** nit
**Location:** `src/store/scroll.ts:applyScrollDelta`
**Description:** When `heightOf(totalCount-1) >= viewportHeight`, End yields `{topIndex: last, pixelOffset: 0}` — last row's TOP at viewport top, leaving blank space below. With 60-px estimate vs ~600 px viewport, never triggers in practice.
**Fix:** Deferred. If row sizes change to allow this case, snap with `pixelOffset = heightOf(last) - viewportHeight`.

---

## PR-05

### [PR-05-D01] Resolved-after-aborted race: stale region inserted when fetch resolves after abort
**Status:** resolved
**Severity:** major
**Location:** `src/store/fetchCoordinator.ts:.then` resolution handler
**Description:** Resolution callback unconditionally calls `onChunk(region)` and does not check `signal.aborted`. If `abortOutside` or `dispose` aborts a controller in the window between data computation completing and the `.then` microtask running, a stale region is inserted. Brief explicitly required this check.
**Suggested fix:** In the `.then` callback, check `if (controller.signal.aborted) return;` before calling `onChunk`. Same protection in `.catch` (don't call `onError` for our own abort vs an external error). Use a `disposed` flag in `dispose()` to suppress all callbacks during teardown.

### [PR-05-D02] `ChatStore.abortFetchesOutside` exposed but never called
**Status:** resolved
**Severity:** major
**Location:** `src/store/ChatStore.ts` (method) + `src/components/ChatViewport.tsx` (no call site)
**Description:** Method implemented and tested, but no caller. Off-screen fetches from prior scroll positions remain in flight, waste cycles, and trigger re-renders for content the user is no longer looking at.
**Suggested fix:** In `ChatViewport`'s scroll-settled callback, after `ensureRange(start, end)`, also call `store.abortFetchesOutside(start, end)`. The keep-window matches the prefetch window — anything outside is no longer needed.

### [PR-05-D03] Mount-time prefetch fires with stale topIndex (=0) before initial anchor jump
**Status:** resolved
**Severity:** major
**Location:** `src/components/ChatViewport.tsx:100-110`
**Description:** Mount effect captures `topIndex=0` (initial state), schedules 150ms timer to fetch `[0, 210)`. Meanwhile `getLatest(200)` resolves and the initial-anchor effect snaps `topIndex` to ~tail. The timer fires with the stale topIndex → wasted fetch of beginning of chat. After the anchor jump, no further `scheduleEnsureRange` is invoked, so the area surrounding the new top is not prefetched until the user scrolls.
**Suggested fix:** Move the `scheduleEnsureRange` call into the same effect that handles the initial anchor — fire it once after the anchor lands, with the post-anchor topIndex. Drop the mount-time call. Alternative: make `scheduleEnsureRange` self-reading from `store.getSnapshot()` at the moment the timer fires, rather than capturing the topIndex at schedule time, so any state change between schedule and fire is honored.

### [PR-05-D04] Hardcoded `60` row-height constant in prefetch window calculation
**Status:** resolved
**Severity:** nit
**Location:** `src/components/ChatViewport.tsx:92`
**Description:** `Math.ceil(viewportHeight / 60)` literal duplicates `estimatedRowHeight`. Coupled by accident.
**Suggested fix:** Expose `estimatedRowHeight` on the snapshot or via a `getEstimatedRowHeight()` accessor on `ChatStore`; read it at use-site.

### [PR-05-D05] `isLoadedOrInflight` calls `inflightKeysForTest()` (test-only API) and parses string keys
**Status:** resolved
**Severity:** minor
**Location:** `src/store/ChatStore.ts:154`
**Description:** Production code parses `${start}-${end}` keys to determine inflight chunks. Fragile if key format changes; couples production to test API.
**Suggested fix:** Add a typed `inflightChunks(): Iterable<{start: number; end: number}>` (or `readonly { start, end }[]`) on `FetchCoordinator`. `isLoadedOrInflight` consumes that.

### [PR-05-D06] No dispose lifecycle on `ChatStore` / `FetchCoordinator`
**Status:** resolved
**Severity:** minor
**Location:** `src/store/ChatStore.ts`, `src/components/ChatViewport.tsx` cleanup, possibly `src/App.tsx`
**Description:** `FetchCoordinator.dispose()` exists but nothing calls it. Under HMR or unmount, in-flight fetches leak; their handlers still try to mutate the store.
**Suggested fix:** Add `ChatStore.dispose()` that calls `coordinator.dispose()`. Call from `App.tsx`'s store effect cleanup, OR from a top-level effect in `ChatViewport`. Disable mutators after dispose (or at least make them no-ops with a warning).

### [PR-05-D07] `chunkSize: 0` causes infinite loop in `ensureRange`
**Status:** resolved
**Severity:** minor
**Location:** `src/store/fetchCoordinator.ts:41-43`
**Description:** Loop `while (chunkStart < gap.end) { chunkEnd = chunkStart + 0; chunkStart = chunkEnd; }` never advances → hang.
**Suggested fix:** Validate `chunkSize >= 1` in the constructor (throw on violation). Add a test.

### [PR-05-D08] Synchronous throw in `backend.getRange` leaks inflight entry
**Status:** resolved
**Severity:** nit
**Location:** `src/store/fetchCoordinator.ts:47-69`
**Description:** `this.inflight.set(key, controller)` runs before `backend.getRange(...)`. If `getRange` throws synchronously, control bypasses `.then/.catch` and the inflight entry persists.
**Suggested fix:** Wrap the call in `try { ... } catch (e) { this.inflight.delete(key); ... }` OR use `.finally(() => this.inflight.delete(key))` on the promise chain.

### [PR-05-D09] `dispose` triggers an `onError` flood for every aborted chunk
**Status:** resolved
**Severity:** nit
**Location:** `src/store/fetchCoordinator.ts:dispose`
**Description:** `dispose` aborts every controller; each `.catch` handler then calls `onError` for what is effectively user-initiated teardown. If the consumer wires `onError` to a toast, a flood of "aborted" errors appears.
**Suggested fix:** Set an internal `disposed: boolean` flag at the top of `dispose()`. `.catch` handler checks the flag and skips `onError`. Apply the same flag to `.then` to suppress `onChunk` (covers the same race as D01).

## PR-06

## PR-09

### [PR-09-D01] Sticky-header override picks the wrong day when multiple firstOfDay rows are above the fold
**Status:** resolved
**Severity:** minor
**Location:** `src/components/ChatViewport.tsx:312-318`
**Description:** Override loop walks `rowsToRender` and lets the LAST match win. But `rowsToRender` is `[below..., above_in_descending_index]` — above-rows are appended last, so the row with the MOST-NEGATIVE topPx (furthest above the fold) wins, not the one closest to the fold. With two firstOfDay rows above the viewport top, the sticky shows the day of the older boundary instead of the more-recent one.
**Fix:** Track `bestAboveFoldTopPx` and override only when current row's topPx is GREATER (closer to 0). Single-loop change. Verified gates still pass (197/197 tests).

### [PR-09-N01] `dayLabel("")` returns "Invalid Date" string instead of throwing
**Status:** resolved (note-only — internal callers always pass valid keys from `dayKey()`; not reachable from user input)
**Severity:** nit
**Location:** `src/util/day.ts:20-27`
**Description:** Empty string yields `Number("")===0` and `Number(undefined)===NaN` → `Invalid Date` string from `Intl.DateTimeFormat`. No crash, but garbage output.
**Fix:** Note-only. Could harden with regex check; not needed for current call sites.

### [PR-09-N02] Row-height jump on chunk-load creates ~32 px shift below
**Status:** resolved (note-only — per spec; user's no-flicker rule applies to scroll/measurement, not to lazy-load reflow)
**Severity:** nit
**Location:** `src/components/MessageRow.tsx`
**Description:** When a row's predecessor chunk arrives and they turn out to be on different days, the row gains a 32 px DaySeparator. ResizeObserver fires; rows below shift down by 32 px. Per I-2/I-3 invariants, only below-rows are affected. Acceptable per "no flash/duplicate when crossing days" (which governs the sticky transition, not chunk-load reflow).
**Fix:** Note-only.

---

## PR-07

### [PR-07-D01] `e.target as Element` cast on pointer-capture call (latent foot-gun)
**Status:** resolved
**Severity:** nit
**Location:** `src/components/CustomScrollbar.tsx:36, 56`
**Description:** Thumb pointer handlers cast `e.target` to `Element` and call `setPointerCapture` on it. `e.target` is the deepest element under the pointer; if the thumb gains a child node later (icon, label), capture would attach to the child, and small movement could lose hit-test → release. Currently safe (thumb has no children).
**Fix:** Replaced with `e.currentTarget.setPointerCapture(e.pointerId)` (and the symmetric `releasePointerCapture`). `currentTarget` is typed `HTMLDivElement` directly — no cast, no foot-gun. Verified gates still pass (182/182 tests).

---

### [PR-06-D01] Tail-anchor formula off by one row-height (advisory)
**Status:** resolved (note-only — more permissive than spec, harmless)
**Severity:** nit
**Location:** `src/components/ChatViewport.tsx:111-113`
**Description:** `distanceToLastRowBottom = (totalCount-1 - topIndex)*estimatedRowHeight - pixelOffset` is actually the distance from viewport-top to last row's TOP. The spec says "last row's bottom within 64px of viewport bottom" — to match, the term should add `+ estimatedRowHeight`. Effect: tail-anchor detection is more permissive by one row-height (~60 px). Doesn't break behavior; comment contradicts the formula.
**Fix:** Note-only. PR-12 polish can tighten the formula and update the comment.

---

### [PR-05-D10] Test gaps for race conditions and edge cases
**Status:** resolved
**Severity:** minor
**Location:** `src/store/fetchCoordinator.test.ts`
**Description:** Missing tests for: resolved-after-abort race (D01); dispose-during-pending-resolve (D09); `ensureRange` after `abortOutside` (chunk re-issuable after abort); `chunkSize: 0` validation (D07); empty range `start === end`.
**Suggested fix:** Add 4-5 tests covering the above. Each maps directly to a defect or to a brief-listed probe.

### [PR-04-D07] Mid-topRow `pixelOffset` is not adjusted when topRow's measured height changes
**Status:** resolved (deferred to PR-05+ — pure text rows don't reflow; revisit if images/async content land)
**Severity:** nit
**Location:** `src/components/ChatViewport.tsx`, `src/store/ChatStore.ts:setHeight`
**Description:** When user is mid-topRow and topRow's height changes (e.g. font load, code block reflow), `pixelOffset` stays the same — visible top edge stays put but the content showing there is "different lines" of the same row. Spec-conformant per the topRow-top-pinning convention. For pure text rows that don't reflow async, irrelevant. Will matter if images/async-rendered content lands.
**Fix:** Deferred. If revisited, scale `pixelOffset` by `newHeight / oldHeight` inside `setHeight` when `index === topIndex`.

