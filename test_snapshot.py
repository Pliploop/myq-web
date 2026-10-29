import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("snapshot", Path(__file__).with_name("snapshot.py"))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)

class SnapshotTests(unittest.TestCase):
    def test_paths_can_contain_spaces(self):
        self.assertEqual(snapshot.log_paths("JobId=1 StdErr=/logs/job error.err StdOut=/logs/job output.out Power=x"),
                         {"StdErr":"/logs/job error.err","StdOut":"/logs/job output.out"})

    def test_tail_strips_ansi_progress_updates_and_bounds_reads(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"job.log"
            path.write_bytes(b"old data\n"*10000+b"\x1b[32mstep 9\x1b[0m\rstep 10\r\r\n")
            result=snapshot.log_tail(str(path),lines=2,byte_limit=100)
            self.assertEqual(result["text"],"step 9\nstep 10")
            self.assertNotIn("\x1b",result["text"])

    def test_fifo_does_not_block(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"fifo"
            os.mkfifo(path)
            self.assertEqual(snapshot.log_tail(str(path))["status"],"Not a regular log file")

    def test_empty_and_missing_logs_have_explicit_status(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"job.log"
            self.assertTrue(snapshot.log_tail(str(path))["status"].startswith("Unavailable"))
            path.touch()
            self.assertEqual(snapshot.log_tail(str(path))["status"],"Waiting for output")

    def test_collection_saves_stderr_and_recently_departed_jobs(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"job.err"
            path.write_text("training progress")
            def fake_command(args):
                if args[0]=="squeue":
                    return "123|gpu|train|RUNNING|1:00|2:00:00|1|node|10|8|32G|gres/gpu:1\n"
                return f"JobId=123 StdOut= StdErr={path} Power=x"
            previous={"jobs":[{"id":"100","name":"old","logs":{}}]}
            with patch.object(snapshot,"command",side_effect=fake_command):
                result=snapshot.collect("user",previous)
            self.assertEqual(result["jobs"][0]["logs"]["StdErr"]["text"],"training progress")
            self.assertEqual(result["jobs"][1]["state"],"LEFT_QUEUE")
            self.assertIn("final Slurm state",result["jobs"][1]["log_notice"])

    def test_failed_collection_does_not_replace_last_good_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"snapshot.json"
            old='{"user":"user","jobs":[]}\n'
            path.write_text(old)
            with patch("sys.argv",["snapshot.py","--output",str(path),"--user","user"]):
                with patch.object(snapshot,"collect",side_effect=subprocess.CalledProcessError(1,"squeue")):
                    with self.assertRaises(subprocess.CalledProcessError):
                        snapshot.main()
            self.assertEqual(path.read_text(),old)

if __name__=="__main__":
    unittest.main()
