#!/bin/bash
# Save the project's square icon to docs/icon.png from tools/icon.html.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --user-data-dir="$PROFILE" --window-size=1024,1024 --force-device-scale-factor=1 \
  --virtual-time-budget=6000 --screenshot="docs/icon.png" \
  "file://$PWD/tools/icon.html" 2>/dev/null
rm -rf "$PROFILE"
ls -la docs/icon.png
