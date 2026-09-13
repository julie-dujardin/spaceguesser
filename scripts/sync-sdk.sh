#!/usr/bin/env sh
# Rebuild the spacemap SDK from a checkout and reinstall it here. The package
# is vendored as a tarball rather than published, so the app builds offline.
set -eu

SDK_SRC=${SDK_SRC:-../space-map/.claude/worktrees/sdk-panorama-list/frontend}
HERE=$(CDPATH= cd "$(dirname "$0")/.." && pwd)

cd "$SDK_SRC"
CI=true pnpm run build:sdk:npm
cd dist/sdk-npm
rm -rf api-report-temp types
npm pack --pack-destination "$HERE/vendor"

cd "$HERE"
# The tarball keeps its version, so its lockfile entry pins a hash that no
# longer matches. Resolving from scratch is cheaper than patching it.
rm -f pnpm-lock.yaml
pnpm install
