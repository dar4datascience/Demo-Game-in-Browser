#!/usr/bin/env bash
# Stitches the per-shot CDMX clips into one vertical mp4 at 1080x1920 / 24 fps.
# Run `scripts/record-cdmx.mjs` first (it writes docs/raw/cdmx/shot-XX.webm).
#   bash scripts/make-cdmx-video.sh
set -euo pipefail

FFMPEG="${FFMPEG:-ffmpeg}"
FFPROBE="${FFPROBE:-ffprobe}"

RAW="docs/raw/cdmx"
OUT="docs/cdmx-night.mp4"
mkdir -p docs

shots=($(ls "$RAW"/shot-*.webm | sort))
if [ "${#shots[@]}" -eq 0 ]; then
  echo "no clips in $RAW — run scripts/record-cdmx.mjs first" >&2
  exit 1
fi

list="$RAW/list.txt"
: >"$list"
for s in "${shots[@]}"; do
  name=$(basename "$s" .webm)
  # Scale to 1080x1920 with nearest-neighbour so the low-res look survives, then pad to 24 fps.
  "$FFMPEG" -v error -y -i "$s" -vf "scale=1080:1920:flags=neighbor,fps=24,format=yuv420p" \
    -an -c:v libx264 -crf 26 -preset medium -movflags +faststart "/tmp/$name.mp4"
  echo "file '/tmp/$name.mp4'" >>"$list"
done

"$FFMPEG" -v error -y -f concat -safe 0 -i "$list" -c copy "$RAW/joined.mp4"

# Mux the offline-rendered lofi bed (record-cdmx-audio.mjs) if it exists.
if [ -f "docs/raw/cdmx-audio.wav" ]; then
  "$FFMPEG" -v error -y -i "$RAW/joined.mp4" -i "docs/raw/cdmx-audio.wav" \
    -c:v copy -c:a aac -b:a 192k -af "volume=2.5" -shortest "$OUT"
else
  cp "$RAW/joined.mp4" "$OUT"
fi
rm -f /tmp/shot-*.mp4 "$RAW/joined.mp4"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
"$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$OUT"
