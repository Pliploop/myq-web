#!/usr/bin/env bash
# Run once from an approved scheduler; argument is a private data-repo checkout.
set -euo pipefail
export PATH="/opt/slurm/bin:/usr/bin:/bin:$PATH"
checkout=$(realpath "${1:?Usage: publish_snapshot.sh /path/to/private-data-checkout}")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
test -d "$checkout/.git" || { echo "Expected a dedicated Git checkout" >&2; exit 2; }
# Stop overlapping invocations; only this file is committed.
exec 9>"$checkout/.git/myq-snapshot.lock"
flock -n 9 || exit 0
python3 "$script_dir/snapshot.py" --output "$checkout/snapshot.json"
git -C "$checkout" add -- snapshot.json
git -C "$checkout" diff --cached --quiet -- snapshot.json && exit 0
git -C "$checkout" commit --only -m "Update myq snapshot" -- snapshot.json
GIT_TERMINAL_PROMPT=0 git -C "$checkout" push origin HEAD
