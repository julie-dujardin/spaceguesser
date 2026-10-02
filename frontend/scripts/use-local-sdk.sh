#!/bin/sh
# Play against an SDK that is not published yet:
#   frontend/scripts/use-local-sdk.sh <space-map checkout>
# Copies the package `pnpm build:sdk:npm` built there over the installed one.
# `pnpm install` puts the published one back.
set -e
src="${1:?path to a space-map checkout}/frontend/dist/sdk-npm"
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/node_modules/spacemap"
[ -f "$src/index.js" ] || { echo "no built package at $src: run pnpm build:sdk:npm there" >&2; exit 1; }
# The installed one is a link into pnpm's store, which a copy must not write through.
rm -rf "$dest"
mkdir -p "$dest"
cp -r "$src"/. "$dest"/
# Vite keeps its own prebuilt copy of every dependency.
rm -rf "$here/node_modules/.vite"
echo "spacemap is now the build at $src"
