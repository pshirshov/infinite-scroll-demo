import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    passWithNoTests: true,
    // direnv mirrors flake inputs into .direnv/, including a snapshot of this
    // repo whose paths point into the nix store; vitest's default glob would
    // pick those up as duplicate test files that no longer exist on disk.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.direnv/**", "**/dist-node/**"],
  },
});
