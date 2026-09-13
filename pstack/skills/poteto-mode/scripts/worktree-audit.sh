#!/usr/bin/env bash
# Read-only macOS/Linux audit. Deletion remains a separate operator-owned step.
set -eu
scripts_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$scripts_dir/../../../../pi/lib/worktree-cleanup.mjs" "$@"
