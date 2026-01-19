#!/bin/sh

PORT="${1:-8000}"
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
python3 -m http.server "$PORT" --directory "$SCRIPT_DIR" --bind 0.0.0.0
