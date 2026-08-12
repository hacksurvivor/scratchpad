#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
  printf 'usage: %s INPUT.html OUTPUT.png [WIDTH] [HEIGHT]\n' "$0" >&2
  exit 2
fi

input_file="$1"
output_file="$2"
width="${3:-1440}"
height="${4:-1000}"

case "$input_file" in
  /*.html) ;;
  *) printf 'error: input must be an absolute .html path\n' >&2; exit 2 ;;
esac
case "$output_file" in
  /*.png) ;;
  *) printf 'error: output must be an absolute .png path\n' >&2; exit 2 ;;
esac

[ -f "$input_file" ] || { printf 'error: input not found: %s\n' "$input_file" >&2; exit 1; }

chrome="${CHROME_BIN:-}"
for candidate in \
  "$chrome" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    chrome="$candidate"
    break
  fi
done

[ -x "$chrome" ] || { printf 'error: Chrome/Chromium not found; use the browser screenshot tool instead\n' >&2; exit 1; }
mkdir -p "$(dirname "$output_file")"
"$chrome" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --allow-file-access-from-files \
  --window-size="$width,$height" \
  --screenshot="$output_file" \
  "file://$input_file" >/dev/null 2>&1

[ -s "$output_file" ] || { printf 'error: renderer produced no image: %s\n' "$output_file" >&2; exit 1; }
printf '%s\n' "$output_file"
