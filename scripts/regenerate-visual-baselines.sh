#!/usr/bin/env bash
# Regenerate BOTH platform visual-regression baselines in one command so the
# darwin/linux pair never drifts apart. CI (ubuntu-22.04) reads the *-linux.png
# files; regenerating only the darwin ones locally is exactly how the
# task-detail baseline went stale in CI (commit ad2d903).
#
#   npm run snapshots:regen
#
# Linux rendering MUST come from a Linux environment — macOS renders fonts and
# pixels differently. This script renders linux baselines in a container built
# from the same ubuntu base + Playwright version as CI.
#
# If Docker is unavailable, fall back to the CI flow:
#   gh workflow run e2e.yml --ref <branch>
# then download the `visual-regression-linux-baselines` artifact and drop the
# *-linux.png files into tests/visual-regression.spec.ts-snapshots/.
set -euo pipefail

cd "$(dirname "$0")/.."

# --update-snapshots only rewrites baselines whose diff EXCEEDS the tests'
# maxDiffPixelRatio (0.05) — sub-tolerance drift silently survives a regen and
# accumulates (found the hard way in the P7 polish rounds). Deleting the PNGs
# first forces a true regenerate of every screen.
SNAP=tests/visual-regression.spec.ts-snapshots
rm -f "$SNAP"/*.png

echo "==> Regenerating darwin baselines (local)..."
npx playwright test visual-regression --update-snapshots

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  PLAYWRIGHT_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"
  echo "==> Regenerating linux baselines in playwright:v${PLAYWRIGHT_VERSION} container..."
  # The host node_modules carries darwin binaries (esbuild), so the container
  # installs its own in .docker-node_modules, mounted over /app/node_modules.
  # Host node_modules is left untouched; the scratch dir is gitignored.
  mkdir -p .docker-node_modules
  docker run --rm -v "$PWD":/app -v "$PWD/.docker-node_modules":/app/node_modules -w /app \
    "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy" \
    sh -c "npm ci --silent && npx playwright test visual-regression --update-snapshots"
  rm -rf .docker-node_modules
else
  echo "!! Docker unavailable — linux baselines NOT regenerated."
  echo "   Fallback: gh workflow run e2e.yml --ref \$(git branch --show-current)"
fi

echo "==> Parity check: every -darwin.png needs a -linux.png twin (and vice versa)..."
SNAP=tests/visual-regression.spec.ts-snapshots
missing=0
for f in "$SNAP"/*-darwin.png; do
  base="${f%-darwin.png}"
  [ -f "${base}-linux.png" ] || { echo "MISSING linux twin for ${f#*/}"; missing=1; }
done
for f in "$SNAP"/*-linux.png; do
  base="${f%-linux.png}"
  [ -f "${base}-darwin.png" ] || { echo "MISSING darwin twin for ${f#*/}"; missing=1; }
done
if [ "$missing" -eq 0 ]; then
  echo "OK: darwin/linux baselines in sync."
else
  echo "!! Twin(s) missing — regenerate, do not commit half a pair."
  exit 1
fi

echo "==> Done. Eyeball 'git diff --stat' and commit BOTH platform baselines together."
