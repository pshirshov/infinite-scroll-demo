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
          ];

          shellHook = ''
            echo "scroll-demo dev shell"
            echo "node:  $(node --version)"
            echo "pnpm:  $(pnpm --version)"
          '';
        };
      });
}
