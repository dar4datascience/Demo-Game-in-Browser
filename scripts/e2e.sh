#!/usr/bin/env bash
# Browser end-to-end playthroughs: starts a throwaway Vite server, then plays every story in the
# Chromium bundled with the mcp/playwright Docker image (WebGL via SwiftShader). Slow (~3 fps), so
# run it before releases or after rendering changes; `npm test` covers logic on every change.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${E2E_PORT:-5199}"
URL="http://localhost:${PORT}"
IMAGE="${E2E_IMAGE:-mcp/playwright}"
mkdir -p scripts/shots

npx vite --port "$PORT" --strictPort >/tmp/e2e-vite.log 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf "$URL" >/dev/null && break; sleep 0.2; done

run() {
  echo "── $1"
  docker run --rm --network host -v "$PWD/scripts:/out" -e GAME_URL="$URL" "${@:2}" --entrypoint node "$IMAGE" "/out/$1"
}

run playthrough.mjs
run playthrough-ceda.mjs -e CHAR=diablero
run playthrough-ceda.mjs -e CHAR=seller -e ENDING=caught
run playthrough-ceda.mjs -e CHAR=consumer
echo "All browser playthroughs passed. Screenshots: scripts/shots/"
