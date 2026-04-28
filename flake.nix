{
  description = "Endlessly scrollable chat window — Vite + React + TS demo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            typescript
            typescript-language-server
            playwright-driver.browsers
          ];

          shellHook = ''
            echo "scroll-demo dev shell"
            echo "node:  $(node --version)"
            echo "pnpm:  $(pnpm --version)"
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true
          '';
        };
      });
}
