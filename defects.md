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

