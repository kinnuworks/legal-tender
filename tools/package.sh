#!/bin/bash
# Build dist/<project>.zip for upload to Qollab and check Qollab's limits:
# at most 100 files, each under 2 MB, README under 65,000 characters.
#
#   bash tools/package.sh                  # legal-tender
#   bash tools/package.sh is-it-quantum
set -euo pipefail
cd "$(dirname "$0")/.."
project="${1:-legal-tender}"

mkdir -p dist && rm -f "dist/$project.zip"
find "$project" -name "__pycache__" -type d -prune -exec rm -rf {} +
find "$project" -name ".DS_Store" -delete

files=$(find "$project" -type f | wc -l | tr -d ' ')
big=$(find "$project" -type f -size +2000k | wc -l | tr -d ' ')
readme=$(wc -m < "$project/README.md" | tr -d ' ')
[ "$files" -le 100 ] || { echo "Too many files: $files"; exit 1; }
[ "$big" -eq 0 ] || { echo "A file is over 2 MB"; exit 1; }
[ "$readme" -le 65000 ] || { echo "README is $readme characters"; exit 1; }
for f in index.html main.js main.css requirements.txt LICENSE README.md; do
  [ -f "$project/$f" ] || { echo "Missing $f"; exit 1; }
done
if grep -q "ADD YOUR\|ADD ONE ROW" "$project/README.md"; then
  echo "Note: $project/README.md still has placeholders to fill in."
fi

(cd "$project" && zip -qr "../dist/$project.zip" . -x "*.pyc")
echo "dist/$project.zip: $files files, README $readme characters."
