#!/usr/bin/env bash
# Git hook kurulumu: tools/hooks/* → .git/hooks/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for h in pre-commit commit-msg; do
  cp "$ROOT/tools/hooks/$h" "$ROOT/.git/hooks/$h"
  chmod +x "$ROOT/.git/hooks/$h"
  echo "✓ $h kuruldu"
done
