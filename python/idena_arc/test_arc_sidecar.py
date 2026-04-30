import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SIDECAR = ROOT / "python" / "idena_arc" / "arc_sidecar.py"
SIDECAR_SPEC = importlib.util.spec_from_file_location("idena_arc_sidecar", SIDECAR)
arc_sidecar = importlib.util.module_from_spec(SIDECAR_SPEC)
assert SIDECAR_SPEC.loader is not None
SIDECAR_SPEC.loader.exec_module(arc_sidecar)


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
        self.assertEqual(first["renderHints"]["renderer"], "idena-arc-grid-v0")
        self.assertIn("move_right", [item["name"] for item in first["actionSpace"]])
        self.assertIn("ACTION4", [item["arcAction"] for item in first["actionSpace"]])

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
        self.assertEqual(first["timeline"], second["timeline"])
        self.assertEqual(first["timeline"][0]["phase"], "initial")
        self.assertEqual(first["timeline"][1]["actionInput"]["data"]["action"], "move_right")
        self.assertEqual(first["timeline"][1]["actionInput"]["data"]["arc_action"], "ACTION4")
        self.assertEqual(first["renderHints"]["board"]["type"], "square-grid")

    def test_arc_agi_env_downloads_when_offline_cache_misses(self):
        fake_env = object()
        calls = []

        class FakeOperationMode:
            OFFLINE = object()
            NORMAL = object()

        class FakeArcade:
            def __init__(self, **kwargs):
                self.operation_mode = kwargs["operation_mode"]
                calls.append(kwargs)

            def make(self, game_id, **_kwargs):
                self.game_id = game_id
                if self.operation_mode is FakeOperationMode.OFFLINE:
                    return None
                return fake_env

        originals = (
            arc_sidecar.ARC_AGI_AVAILABLE,
            arc_sidecar.Arcade,
            arc_sidecar.OperationMode,
        )
        old_env_dir = os.environ.get("IDENA_ARC_AGI_ENVIRONMENTS_DIR")
        old_recordings_dir = os.environ.get("IDENA_ARC_AGI_RECORDINGS_DIR")

        with tempfile.TemporaryDirectory() as temp_dir:
            os.environ["IDENA_ARC_AGI_ENVIRONMENTS_DIR"] = str(Path(temp_dir) / "envs")
            os.environ["IDENA_ARC_AGI_RECORDINGS_DIR"] = str(
                Path(temp_dir) / "recordings"
            )
            try:
                arc_sidecar.ARC_AGI_AVAILABLE = True
                arc_sidecar.Arcade = FakeArcade
                arc_sidecar.OperationMode = FakeOperationMode

                env = arc_sidecar.make_arc_agi_env("LS20!", "seed", {})
            finally:
                (
                    arc_sidecar.ARC_AGI_AVAILABLE,
                    arc_sidecar.Arcade,
                    arc_sidecar.OperationMode,
                ) = originals
                if old_env_dir is None:
                    os.environ.pop("IDENA_ARC_AGI_ENVIRONMENTS_DIR", None)
                else:
                    os.environ["IDENA_ARC_AGI_ENVIRONMENTS_DIR"] = old_env_dir
                if old_recordings_dir is None:
                    os.environ.pop("IDENA_ARC_AGI_RECORDINGS_DIR", None)
                else:
                    os.environ["IDENA_ARC_AGI_RECORDINGS_DIR"] = old_recordings_dir

        self.assertIs(env, fake_env)
        self.assertEqual([call["operation_mode"] for call in calls], [
            FakeOperationMode.OFFLINE,
            FakeOperationMode.NORMAL,
        ])
        self.assertTrue(calls[1]["environments_dir"].endswith("envs"))
        self.assertTrue(calls[1]["recordings_dir"].endswith("recordings"))

    def test_arc_agi_cache_command_uses_public_game_list(self):
        calls = []

        class FakeOperationMode:
            OFFLINE = object()
            NORMAL = object()

        class FakeEnvironmentInfo:
            def __init__(self, game_id):
                self.game_id = game_id
                self.title = f"Game {game_id}"

        class FakeEnv:
            def __init__(self, game_id):
                self.environment_info = FakeEnvironmentInfo(game_id)

        class FakeArcade:
            def __init__(self, **_kwargs):
                pass

            def get_environments(self):
                return [
                    FakeEnvironmentInfo("ls20-9607627b"),
                    FakeEnvironmentInfo("vc33-5430563c"),
                ]

            def make(self, game_id, **_kwargs):
                calls.append(game_id)
                return FakeEnv(game_id)

        originals = (
            arc_sidecar.ARC_AGI_AVAILABLE,
            arc_sidecar.Arcade,
            arc_sidecar.OperationMode,
        )
        try:
            arc_sidecar.ARC_AGI_AVAILABLE = True
            arc_sidecar.Arcade = FakeArcade
            arc_sidecar.OperationMode = FakeOperationMode

            result = arc_sidecar.cache_arc_agi_games({"cacheAllPublic": True})
        finally:
            (
                arc_sidecar.ARC_AGI_AVAILABLE,
                arc_sidecar.Arcade,
                arc_sidecar.OperationMode,
            ) = originals

        self.assertEqual(calls, ["ls20-9607627b", "vc33-5430563c"])
        self.assertTrue(result["ok"])
        self.assertEqual(result["cache"]["requested"], 2)
        self.assertEqual(len(result["cache"]["cached"]), 2)

    def test_arc_agi_game_catalog_includes_baseline_budgets(self):
        class FakeOperationMode:
            NORMAL = object()

        class FakeEnvironmentInfo:
            def __init__(self):
                self.game_id = "ls20-9607627b"
                self.title = "LS20"
                self.tags = ["keyboard"]
                self.baseline_actions = [22, 123]
                self.class_name = None
                self.date_downloaded = None
                self.local_dir = "/tmp/ls20"

        class FakeArcade:
            def __init__(self, **_kwargs):
                pass

            def get_environments(self):
                return [FakeEnvironmentInfo()]

        originals = (
            arc_sidecar.ARC_AGI_AVAILABLE,
            arc_sidecar.Arcade,
            arc_sidecar.OperationMode,
        )
        try:
            arc_sidecar.ARC_AGI_AVAILABLE = True
            arc_sidecar.Arcade = FakeArcade
            arc_sidecar.OperationMode = FakeOperationMode

            result = arc_sidecar.list_arc_agi_games({})
        finally:
            (
                arc_sidecar.ARC_AGI_AVAILABLE,
                arc_sidecar.Arcade,
                arc_sidecar.OperationMode,
            ) = originals

        self.assertTrue(result["ok"])
        self.assertEqual(result["gameCount"], 1)
        self.assertEqual(result["games"][0]["baseGameId"], "ls20")
        self.assertEqual(result["games"][0]["baselineActions"], [22, 123])
        self.assertEqual(result["games"][0]["budgets"]["budget5xTotal"], 725)

    def test_arc_agi_observation_preserves_official_trace_fields(self):
        class State:
            name = "NOT_FINISHED"

        class Action:
            name = "ACTION4"
            value = 4

        class Observation:
            def __init__(self, guid="guid-1", levels_completed=2):
                self.frame = [[[1, 2], [3, 4]]]
                self.state = State()
                self.action_input = {"id": "ACTION4", "data": {"game_id": "ls20"}}
                self.game_id = "ls20-9607627b"
                self.guid = guid
                self.full_reset = False
                self.levels_completed = levels_completed
                self.win_levels = 7
                self.available_actions = [Action()]

        state = arc_sidecar.observation_to_arc_state(
            Observation(),
            env=object(),
            game_id="ls20",
            turn=3,
        )

        self.assertEqual(state["guid"], "ls20-9607627b:3")
        self.assertEqual(state["rawObservation"]["guid"], "ls20-9607627b:3")
        self.assertEqual(state["levelsCompleted"], 2)
        self.assertEqual(state["winLevels"], 7)
        self.assertEqual(state["availableActions"], ["ACTION4"])
        self.assertEqual(state["availableActionIds"], [4])
        self.assertEqual(state["actionInput"]["data"]["game_id"], "ls20")

        same_state_different_observation_guid = arc_sidecar.observation_to_arc_state(
            Observation(guid="guid-2"),
            env=object(),
            game_id="ls20",
            turn=3,
        )
        self.assertEqual(
            arc_sidecar.hash_state(state),
            arc_sidecar.hash_state(same_state_different_observation_guid),
        )

        completed_state = arc_sidecar.observation_to_arc_state(
            Observation(levels_completed=7),
            env=object(),
            game_id="ls20",
            turn=8,
        )
        self.assertTrue(completed_state["completed"])

    def test_arc_agi_replay_stops_when_environment_auto_resets_after_action(self):
        calls = {"steps": []}

        class FakeOperationMode:
            OFFLINE = "offline"
            NORMAL = "normal"

        class FakeAction:
            def __init__(self, name, value):
                self.name = name
                self.value = value

        class FakeGameAction:
            ACTION1 = FakeAction("ACTION1", 1)
            ACTION2 = FakeAction("ACTION2", 2)

        class FakeState:
            name = "NOT_FINISHED"

        class FakeObservation:
            def __init__(self, step=0, full_reset=False):
                self.frame = [[[step, 0], [0, step]]]
                self.state = FakeState()
                self.action_input = {
                    "id": "RESET" if full_reset else f"ACTION{step or 1}",
                    "data": {"game_id": "ls20"},
                }
                self.guid = f"guid-{step}"
                self.full_reset = full_reset
                self.levels_completed = 0
                self.win_levels = 7
                self.available_actions = [FakeAction("ACTION1", 1), FakeAction("ACTION2", 2)]

        class FakeEnv:
            def reset(self):
                return FakeObservation(0, full_reset=True)

            def step(self, action, data=None):
                calls["steps"].append(action.name)
                return FakeObservation(len(calls["steps"]), full_reset=True)

        class FakeArcade:
            def __init__(self, **kwargs):
                self.operation_mode = kwargs["operation_mode"]

            def make(self, game_id, **kwargs):
                return FakeEnv()

        originals = (
            arc_sidecar.ARC_AGI_AVAILABLE,
            arc_sidecar.Arcade,
            arc_sidecar.OperationMode,
            arc_sidecar.GameAction,
        )
        try:
            arc_sidecar.ARC_AGI_AVAILABLE = True
            arc_sidecar.Arcade = FakeArcade
            arc_sidecar.OperationMode = FakeOperationMode
            arc_sidecar.GameAction = FakeGameAction

            result = arc_sidecar.replay_arc_agi(
                "seed",
                [{"action": "ACTION1"}, {"action": "ACTION2"}],
                None,
                {"gameId": "ls20"},
            )
        finally:
            (
                arc_sidecar.ARC_AGI_AVAILABLE,
                arc_sidecar.Arcade,
                arc_sidecar.OperationMode,
                arc_sidecar.GameAction,
            ) = originals

        self.assertEqual(calls["steps"], ["ACTION1"])
        self.assertFalse(result["completed"])
        self.assertTrue(result["finalState"]["failed"])
        self.assertTrue(result["finalState"]["gameOver"])
        self.assertEqual(result["finalState"]["state"], "FAILED_AUTO_RESET")
        self.assertEqual(
            result["finalState"]["failureReason"],
            "arc_agi_environment_reset_after_action",
        )
        self.assertEqual(len(result["actions"]), 1)
        self.assertTrue(result["timeline"][1]["fullReset"])

    def test_arc_agi_scorecard_submission_uses_competition_mode(self):
        calls = {"open": [], "make": [], "steps": [], "close": []}

        class FakeOperationMode:
            ONLINE = "online"
            COMPETITION = "competition"

        class FakeAction:
            def __init__(self, name, value):
                self.name = name
                self.value = value

        class FakeGameAction:
            ACTION1 = FakeAction("ACTION1", 1)
            ACTION6 = FakeAction("ACTION6", 6)

        class FakeState:
            name = "NOT_FINISHED"

        class FakeObservation:
            def __init__(self, step=0):
                self.frame = [[[step, 0], [0, step]]]
                self.state = FakeState()
                self.action_input = {
                    "id": "ACTION1" if step else "RESET",
                    "data": {"game_id": "ls20-9607627b"},
                }
                self.guid = "guid-1"
                self.full_reset = step == 0
                self.levels_completed = step
                self.win_levels = 7
                self.available_actions = [FakeAction("ACTION1", 1), FakeAction("ACTION6", 6)]

        class FakeEnv:
            def __init__(self):
                self.observation_space = FakeObservation(0)

            def step(self, action, data=None, reasoning=None):
                calls["steps"].append((action.name, data, reasoning))
                return FakeObservation(len(calls["steps"]))

        class FakeArcade:
            def __init__(self, **kwargs):
                self.operation_mode = kwargs["operation_mode"]
                calls["init"] = kwargs

            def open_scorecard(self, **kwargs):
                calls["open"].append(kwargs)
                return "card-1"

            def make(self, game_id, **kwargs):
                calls["make"].append((game_id, kwargs))
                return FakeEnv()

            def close_scorecard(self, scorecard_id):
                calls["close"].append(scorecard_id)
                return {"card_id": scorecard_id, "score": 12}

        originals = (
            arc_sidecar.ARC_AGI_AVAILABLE,
            arc_sidecar.Arcade,
            arc_sidecar.OperationMode,
            arc_sidecar.GameAction,
        )
        try:
            arc_sidecar.ARC_AGI_AVAILABLE = True
            arc_sidecar.Arcade = FakeArcade
            arc_sidecar.OperationMode = FakeOperationMode
            arc_sidecar.GameAction = FakeGameAction

            result = arc_sidecar.submit_arc_agi_scorecard(
                "seed",
                [{"action": "ACTION1"}, {"action": "ACTION6", "x": 4, "y": 5}],
                None,
                {
                    "gameId": "ls20",
                    "scorecardMode": "competition",
                    "arcApiKey": "secret",
                },
            )
        finally:
            (
                arc_sidecar.ARC_AGI_AVAILABLE,
                arc_sidecar.Arcade,
                arc_sidecar.OperationMode,
                arc_sidecar.GameAction,
            ) = originals

        self.assertEqual(calls["init"]["operation_mode"], FakeOperationMode.COMPETITION)
        self.assertEqual(calls["make"][0][0], "ls20")
        self.assertEqual(calls["make"][0][1]["scorecard_id"], "card-1")
        self.assertEqual(calls["steps"][0][0], "ACTION1")
        self.assertEqual(calls["steps"][1][0], "ACTION6")
        self.assertEqual(calls["steps"][1][1], {"x": 4, "y": 5})
        self.assertEqual(calls["close"], ["card-1"])
        self.assertEqual(result["scorecardId"], "card-1")
        self.assertEqual(result["mode"], "competition")
        self.assertIn("/scorecards/card-1", result["scorecardUrl"])
        self.assertEqual(result["timeline"][1]["levelsCompleted"], 1)
        self.assertEqual(result["timeline"][1]["availableActionIds"], [1, 6])


if __name__ == "__main__":
    unittest.main()
