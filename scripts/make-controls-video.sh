#!/usr/bin/env bash
# Trims the two raw recordings, concatenates them and writes docs/diablero-controls.mp4 + .gif.
# Run scripts/record-controls.mjs first (in the Playwright image), then this on the host (needs ffmpeg).
set -euo pipefail
cd "$(dirname "$0")/.."

T=docs/raw/times.json
trim() {
  node --input-type=module -e "
    import fs from 'node:fs';
    const t = JSON.parse(fs.readFileSync('$T', 'utf8'));
    console.log(Math.max(0, t.$1 / 1000 - 0.2).toFixed(2));
  "
}

CT=$(trim controls.menuMs)
FT=$(trim flow.flowStartMs)

ffmpeg -y -loglevel error -ss "$CT" -i docs/raw/controls.webm \
  -vf "fps=30,scale=1024:640:flags=neighbor" -c:v libx264 -preset medium -crf 28 \
  -pix_fmt yuv420p -movflags +faststart docs/raw/controls.mp4

ffmpeg -y -loglevel error -ss "$FT" -i docs/raw/flow.webm \
  -vf "fps=30,scale=1024:640:flags=neighbor" -c:v libx264 -preset medium -crf 28 \
  -pix_fmt yuv420p -movflags +faststart docs/raw/flow.mp4

printf "file 'controls.mp4'\nfile 'flow.mp4'\n" > docs/raw/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i docs/raw/list.txt -c copy docs/diablero-controls.mp4

ffmpeg -y -loglevel error -i docs/diablero-controls.mp4 \
  -vf "fps=9,scale=480:-1:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=80[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  docs/diablero-controls.gif

ls -lh docs/diablero-controls.mp4 docs/diablero-controls.gif
