#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'usage: %s SOURCE.swift OUTPUT.png\n' "$0" >&2
  exit 2
fi

source_file="$1"
output_file="$2"

case "$source_file" in
  /*.swift) ;;
  *) printf 'error: source must be an absolute .swift path\n' >&2; exit 2 ;;
esac
case "$output_file" in
  /*.png) ;;
  *) printf 'error: output must be an absolute .png path\n' >&2; exit 2 ;;
esac

[ -f "$source_file" ] || { printf 'error: source not found: %s\n' "$source_file" >&2; exit 1; }
command -v swiftc >/dev/null 2>&1 || { printf 'error: swiftc is unavailable\n' >&2; exit 1; }

binary="${output_file%.png}.bin"
mkdir -p "$(dirname "$output_file")"
swiftc -parse-as-library "$source_file" -o "$binary"
VISUAL_OUTPUT="$output_file" "$binary"

[ -s "$output_file" ] || { printf 'error: renderer produced no image: %s\n' "$output_file" >&2; exit 1; }
printf '%s\n' "$output_file"
