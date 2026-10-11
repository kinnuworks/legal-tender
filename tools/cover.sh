#!/bin/bash
# Take the project's cover picture from the running local preview.
# Start the preview first:  .venv/bin/python dev/serve.py
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --user-data-dir="$PROFILE" --window-size="${2:-1280,800}" \
  --virtual-time-budget=14000 --screenshot="docs/${1:-cover}.png" \
  "http://127.0.0.1:${PORT:-8791}/?shot=1" 2>/dev/null
rm -rf "$PROFILE"
ls -la "docs/${1:-cover}.png"
