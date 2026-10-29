#!/usr/bin/env python3
"""Export one bounded Slurm snapshot; no daemon, server, or third-party packages."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))")
FIELDS = "id partition name state elapsed limit nodes reason priority cpus memory gres".split()

def command(args):
    return subprocess.check_output(args, text=True, timeout=20, stderr=subprocess.PIPE)

def log_paths(metadata):
    fields = re.split(r"(?:^| )([A-Za-z][A-Za-z0-9_]*)=", metadata)
    values = dict(zip(fields[1::2], fields[2::2]))
    return {key: values.get(key, "").rstrip() for key in ("StdOut", "StdErr")}

def log_tail(path, lines=80, byte_limit=32768):
    if not path or path in ("(null)", "/dev/null"):
        return {"path": "", "text": "", "status": "No log file configured"}
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            # Never block on a FIFO or device, or scan an entire training log.
            import stat
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                return {"path": path, "text": "", "status": "Not a regular log file"}
            size = stream.seek(0, 2)
            start = max(0, size - byte_limit)
            stream.seek(start)
            data = stream.read(byte_limit).decode("utf-8", errors="replace")
        clean = ANSI.sub("", data)
        clean = re.sub(r"[^\S\r\n\t]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", clean)
        rows = [line.expandtabs(4)[:500] for line in re.split(r"[\r\n]+", clean) if line.strip()]
        if start and len(rows) > 1:
            rows = rows[1:]
        return {"path": path, "text": "\n".join(rows[-lines:]), "status": "Output" if rows else "Waiting for output"}
    except OSError as exc:
        return {"path": path, "text": "", "status": f"Unavailable: {exc.strerror}"}

def collect(user, previous=None, max_log_jobs=6):
    output = command(["squeue", "--noheader", f"--user={user}",
                      "--format=%i|%P|%j|%T|%M|%l|%D|%R|%Q|%C|%m|%b"])
    jobs = []
    for row in output.splitlines():
        values = row.split("|")
        if len(values) != len(FIELDS):
            raise ValueError("Unexpected squeue row format")
        job = dict(zip(FIELDS, values))
        for key in ("nodes", "priority", "cpus"):
            job[key] = int(job[key] or 0)
        job["logs"] = {}
        jobs.append(job)
    jobs.sort(key=lambda j: (j["state"] not in ("RUNNING", "COMPLETING"), -j["priority"], j["id"]))
    now = datetime.now(timezone.utc).isoformat()
    by_id = {job["id"]: job for job in (previous or {}).get("jobs", [])}
    budget = max_log_jobs
    for job in jobs:
        if job["state"] not in ("RUNNING", "COMPLETING"):
            continue
        if budget <= 0:
            job["log_notice"] = "Log capture limit reached for this snapshot"
            continue
        budget -= 1
        try:
            paths = log_paths(command(["scontrol", "show", "job", "-o", job["id"]]))
            job["logs"] = {key: log_tail(path) for key, path in paths.items()}
        except (subprocess.SubprocessError, OSError):
            job["logs"] = by_id.get(job["id"], {}).get("logs", {})
            job["log_notice"] = "Could not refresh log paths"
    active = {j["id"] for j in jobs}
    recent = []
    for old in by_id.values():
        if old["id"] in active:
            continue
        departed = old.get("left_queue_at", now)
        if (datetime.fromisoformat(now) - datetime.fromisoformat(departed)).total_seconds() > 86400:
            continue
        old = dict(old, state="LEFT_QUEUE", left_queue_at=departed)
        old["log_notice"] = "No longer in queue; final Slurm state has not been queried"
        old["logs"] = {key: log_tail(value["path"]) for key, value in old.get("logs", {}).items()}
        recent.append(old)
    return {"schema_version": 1, "generated_at": now, "user": user, "jobs": jobs + recent[:20],
            "expected_interval_seconds": 300, "metrics": "Slurm allocations; measured utilization is not collected"}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--user", default=os.environ.get("USER"))
    args = parser.parse_args()
    if not args.user:
        parser.error("--user is required")
    previous = None
    if args.output.exists():
        previous = json.loads(args.output.read_text())
        if previous.get("user") != args.user:
            previous = None
    snapshot = collect(args.user, previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Only replace the last good snapshot after a successful collection.
    fd, temporary = tempfile.mkstemp(dir=args.output.parent, prefix=".snapshot-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(snapshot, stream, ensure_ascii=False)
            stream.write("\n")
        os.replace(temporary, args.output)
    finally:
        Path(temporary).unlink(missing_ok=True)
    print(f"Saved {len(snapshot['jobs'])} jobs to {args.output}")

if __name__ == "__main__":
    main()
