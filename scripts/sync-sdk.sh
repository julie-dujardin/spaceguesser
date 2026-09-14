#!/usr/bin/env sh
# Rebuild the spacemap SDK from a checkout and reinstall it here. The package
# is vendored rather than published, so the app builds offline.
#
# It is vendored unpacked: pnpm resolves a directory dependency by path, where
# a tarball's lockfile entry carries only a hash and sends a cold node_modules
# -- a fresh clone, or CI -- looking for the package in the registry.
set -eu

SDK_SRC=${SDK_SRC:-../space-map/.claude/worktrees/sdk-panorama-list/frontend}
HERE=$(CDPATH= cd "$(dirname "$0")/.." && pwd)

cd "$SDK_SRC"
CI=true pnpm run build:sdk:npm
cd dist/sdk-npm
rm -rf api-report-temp types

rm -rf "$HERE/vendor/spacemap"
mkdir -p "$HERE/vendor/spacemap"
cp -R . "$HERE/vendor/spacemap"

cd "$HERE"
pnpm install
