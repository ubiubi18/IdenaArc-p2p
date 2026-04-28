import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SIDECAR = ROOT / "python" / "idena_arc" / "arc_sidecar.py"


def run_sidecar(payload):
    process = subprocess.run(
        [sys.executable, str(SIDECAR)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(process.stdout)


class IdenaArcSidecarTest(unittest.TestCase):
    def test_generation_is_deterministic_for_same_seed(self):
        first = run_sidecar({"command": "generate", "seed": "a" * 64})
        second = run_sidecar({"command": "generate", "seed": "a" * 64})

        self.assertEqual(first["initialStateHash"], second["initialStateHash"])
        self.assertEqual(first["initialState"], second["initialState"])

    def test_replay_is_deterministic_for_same_actions(self):
        game = run_sidecar({"command": "generate", "seed": "b" * 64})
        payload = {
            "command": "replay",
            "seed": "b" * 64,
            "initialState": game["initialState"],
            "actions": ["move_right", "move_down", "move_down"],
        }

        first = run_sidecar(payload)
        second = run_sidecar(payload)

        self.assertEqual(first["finalStateHash"], second["finalStateHash"])
        self.assertEqual(first["score"], second["score"])
        self.assertEqual(first["actions"], second["actions"])


if __name__ == "__main__":
    unittest.main()
