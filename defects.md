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
**Status:** under fix
**Severity:** minor
**Location:** `src/backend/Message.ts:22-24`
**Description:** `indexToId(100000000)` returns `"msg-100000000"` (9 digits) and `indexToId(-1)` returns `"msg-000000-1"`. Both round-trip via `idToIndex` throw `Malformed message id`. The encoder produces values its own decoder rejects — a contract asymmetry. While N=5,000,000 is well under 100M, no upstream guard prevents misuse, and negative inputs corrupt silently.
**Suggested fix:** Validate `Number.isInteger(index) && index >= 0 && index <= 99_999_999` in `indexToId`, throw `Error("indexToId: index out of range")` otherwise. Keep the 8-digit fixed-width contract (decoder unchanged).

### [PR-02-D02] Test gap: case-insensitive search not asserted to find the same hits regardless of query case
**Status:** under fix
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts:208-213`
**Description:** Existing test only checks the snippet contains "the" lowercase when query is "The". Doesn't verify `search("THE")` and `search("the")` return the same hit set. Regression where impl lowercased only body or only query would not be caught.
**Suggested fix:** Add a test comparing hit indices between `search("the")` and `search("THE")`; assert equal length and pointwise-equal `index` values.

### [PR-02-D03] Test gap: search scan-budget cap (50_000) is not actually verified
**Status:** under fix
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts` (no test exists)
**Description:** Implementation caps scan at `Math.min(totalCount, 50_000)`. No test exercises N > 50_000 to verify scan stops. Hit-budget cap is independently enforced; dropping `Math.min` would still pass current tests.
**Suggested fix:** Add `scanBudget` and `hitBudget` (or just `searchScanBudget`/`searchHitBudget`) to `MockBackendConfig` with current defaults. Test sets `searchScanBudget=10`, asserts that a token guaranteed to appear at index ≥ 10 is NOT in the hit list while ones at index < 10 are.

### [PR-02-D04] Test gap (or unreachable code): mid-loop abort branch in `search` has no test
**Status:** under fix
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts:365-375`
**Description:** Existing abort test fires `controller.abort()` synchronously, so the abort happens during the initial `await delay(...)` — never inside the per-row loop. If the implementation has a mid-loop `if (signal?.aborted) throw …` it is uncovered; if the loop is fully synchronous between awaits, the check is unreachable.
**Suggested fix:** First check the implementation. If the loop is synchronous (no awaits between iterations), REMOVE the dead mid-loop signal check (it can never fire — JS can't service the abort) and add a one-line code comment explaining why no in-loop check is needed. If the loop yields (via `await Promise.resolve()` every K rows, say), add a test that aborts during the scan and asserts `AbortError`. Pick whichever matches current behavior; do not add a yield purely to enable the test.

### [PR-02-D05] Test gap: non-zero latency determinism never asserted
**Status:** under fix
**Severity:** minor
**Location:** `src/backend/MockBackend.test.ts` (no test exists)
**Description:** Spec: "latency is deterministic across runs" via seeded latency RNG. All tests use min=max=0 (or 100=100), trivially deterministic. A regression replacing `latencyRng` with `Math.random` would not fail any current test.
**Suggested fix:** Add a test using fake timers and bounds (e.g. min=10, max=20). Two backends with same seed run identical call sequences; capture per-call delay durations (e.g. via `vi.advanceTimersByTime` increments needed); assert sequences equal. Alternatively expose a `peekNextLatencyMs()` test hook on the backend.

### [PR-02-D06] Test gap: emitted live-tail message body not asserted equal to `generateMessage(ctx, N)`
**Status:** under fix
**Severity:** nit
**Location:** `src/backend/MockBackend.test.ts:250-277`
**Description:** Test only compares `id`. Since `id` depends on index alone, two implementations that diverge on body/author/ts but agree on index would pass.
**Suggested fix:** Strengthen to `expect(range[0]).toEqual(emittedMessage)`.

### [PR-02-D07] Test gap: `idToIndex` strictness for trailing-junk inputs
**Status:** under fix
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

