#!/usr/bin/env bash
# Install a finite five-minute task on a stable Apocrita login node.
set -euo pipefail
umask 077
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
case "$(hostname -s)" in
  login-[0-9][0-9]) ;;
  *) printf 'Run this from an Apocrita login node, not %s.\n' "$(hostname -s)" >&2; exit 2 ;;
esac
mkdir -p "$script_dir/.local"
existing_file=$(mktemp "$script_dir/.local/crontab-before.XXXXXX")
error_file=$(mktemp "$script_dir/.local/crontab-error.XXXXXX")
trap 'rm -f "$error_file"' EXIT
if ! crontab -l >"$existing_file" 2>"$error_file"; then
  if ! grep -qi 'no crontab' "$error_file"; then
    cat "$error_file" >&2
    exit 1
  fi
fi
if [[ ${1:-} == --remove ]]; then
  sed '/# myq-snapshot-publisher$/d' "$existing_file" | crontab -
  printf 'Removed myq schedule. Previous crontab saved to %s\n' "$existing_file"
  exit 0
fi
checkout=$(realpath "${1:-$script_dir/../myq-data}")
timeout 180s /usr/bin/bash "$script_dir/publish_snapshot.sh" "$checkout"
{
  sed '/# myq-snapshot-publisher$/d' "$existing_file"
  printf '\n2-59/5 * * * * PATH=/opt/slurm/bin:/usr/bin:/bin /usr/bin/timeout 180s /usr/bin/bash "%s/publish_snapshot.sh" "%s" >> "%s/.local/publish.log" 2>&1 # myq-snapshot-publisher\n' "$script_dir" "$checkout" "$script_dir"
} | crontab -
printf 'Installed snapshots every five minutes on %s.\nPrevious crontab saved to %s\n' "$(hostname -s)" "$existing_file"
crontab -l | grep '# myq-snapshot-publisher$'
