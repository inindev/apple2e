#!/bin/sh

PORT=8000

if command -v python3 &>/dev/null; then
    python3 -m http.server ${1:-$PORT}
else
    python -m SimpleHTTPServer ${1:-$PORT}
fi

