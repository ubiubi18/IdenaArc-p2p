#!/usr/bin/env python3
"""Deterministic IdenaArc generator/replay sidecar.

The MVP keeps the interface ARCEngine-shaped while remaining runnable without
the optional Python 3.12 `arcengine` package. If ARCEngine is installed, later
generator modules can be dispatched from this boundary without changing the
Electron IPC contract.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:  # pragma: no cover - optional until the concrete ARCEngine module lands.
    import arcengine  # type: ignore
    from arcengine import GameAction  # type: ignore

    ARCENGINE_AVAILABLE = True
except Exception:  # pragma: no cover - the fallback is the tested MVP path.
    arcengine = None  # type: ignore
    GameAction = None  # type: ignore
    ARCENGINE_AVAILABLE = False

try:  # pragma: no cover - optional ARC-AGI Toolkit integration boundary.
    import arc_agi  # type: ignore
    from arc_agi import Arcade, OperationMode  # type: ignore

    ARC_AGI_AVAILABLE = True
except Exception:  # pragma: no cover - the local deterministic fallback is used.
    arc_agi = None  # type: ignore
    Arcade = None  # type: ignore
    OperationMode = None  # type: ignore
    ARC_AGI_AVAILABLE = False


def configure_arc_toolkit_logging() -> None:
    """Keep stdout parseable by sending ARC toolkit logs away from stdout."""

    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(logging.WARNING)
    handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

    for logger_name in ("arc_agi", "arc_agi.scorecard", "arcengine"):
        logger = logging.getLogger(logger_name)
        logger.handlers = []
        logger.addHandler(handler)
        logger.setLevel(logging.WARNING)
        logger.propagate = False


configure_arc_toolkit_logging()


GRID_SIZE = 5
ACTION_DELTAS = {
    "move_up": (0, -1),
    "up": (0, -1),
    "move_down": (0, 1),
    "down": (0, 1),
    "move_left": (-1, 0),
    "left": (-1, 0),
    "move_right": (1, 0),
    "right": (1, 0),
}
ARC_ACTION_ALIASES = {
    "reset": "RESET",
    "move_up": "ACTION1",
    "up": "ACTION1",
    "move_down": "ACTION2",
    "down": "ACTION2",
    "move_left": "ACTION3",
    "left": "ACTION3",
    "move_right": "ACTION4",
    "right": "ACTION4",
    "interact": "ACTION5",
    "select": "ACTION5",
    "click": "ACTION6",
    "undo": "ACTION7",
}
SENSITIVE_GENERATOR_KEYS = {
    "arcApiKey",
    "arc_api_key",
    "apiKey",
    "api_key",
}
ACTION_SPACE = [
    {
        "name": "move_up",
        "arcAction": "ACTION1",
        "label": "Move up",
        "keys": ["ArrowUp", "W"],
        "dx": 0,
        "dy": -1,
    },
    {
        "name": "move_right",
        "arcAction": "ACTION4",
        "label": "Move right",
        "keys": ["ArrowRight", "D"],
        "dx": 1,
        "dy": 0,
    },
    {
        "name": "move_down",
        "arcAction": "ACTION2",
        "label": "Move down",
        "keys": ["ArrowDown", "S"],
        "dx": 0,
        "dy": 1,
    },
    {
        "name": "move_left",
        "arcAction": "ACTION3",
        "label": "Move left",
        "keys": ["ArrowLeft", "A"],
        "dx": -1,
        "dy": 0,
    },
]
CELL_TYPES = {
    "empty": {
        "label": "Open cell",
        "color": "#f8fafc",
        "borderColor": "#d6dbe3",
    },
    "player": {
        "label": "Player",
        "color": "#578fff",
        "borderColor": "#447ceb",
    },
    "goal": {
        "label": "Goal",
        "color": "#27d980",
        "borderColor": "#14a864",
    },
    "obstacle": {
        "label": "Blocked cell",
        "color": "#53565c",
        "borderColor": "#16161d",
    },
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def public_generator(generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    generator = generator or {}
    return {
        str(key): value
        for key, value in generator.items()
        if str(key) not in SENSITIVE_GENERATOR_KEYS
    }


def sha256_hex(value: Any) -> str:
    if isinstance(value, bytes):
        data = value
    else:
        data = str(value).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def hash_state(state: Dict[str, Any]) -> str:
    return f"sha256:{sha256_hex(canonical_json(state))}"


def seed_bytes(seed: str) -> bytes:
    seed_text = str(seed or "").strip()
    if len(seed_text) == 64:
        try:
            return bytes.fromhex(seed_text)
        except ValueError:
            pass
    return hashlib.sha256(seed_text.encode("utf-8")).digest()


def coordinate(raw: int) -> int:
    return raw % GRID_SIZE


def build_initial_state(seed: str) -> Dict[str, Any]:
    digest = seed_bytes(seed)
    goal = {
        "x": coordinate(digest[0]),
        "y": coordinate(digest[1]),
    }
    obstacle = {
        "x": coordinate(digest[2]),
        "y": coordinate(digest[3]),
    }

    if obstacle == {"x": 0, "y": 0} or obstacle == goal:
        obstacle = {"x": (goal["x"] + 2) % GRID_SIZE, "y": (goal["y"] + 1) % GRID_SIZE}

    return {
        "engine": "arcengine-compatible-local-grid-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "gridSize": GRID_SIZE,
        "player": {"x": 0, "y": 0},
        "goal": goal,
        "obstacles": [obstacle],
        "turn": 0,
        "completed": False,
    }


def build_render_hints(state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "renderer": "idena-arc-grid-v0",
        "board": {
            "type": "square-grid",
            "width": int(state.get("gridSize") or GRID_SIZE),
            "height": int(state.get("gridSize") or GRID_SIZE),
            "origin": "top-left",
        },
        "input": {
            "modes": ["keyboard", "direction-buttons", "adjacent-cell-click"],
            "keyboard": {
                "ArrowUp": "move_up",
                "w": "move_up",
                "ArrowRight": "move_right",
                "d": "move_right",
                "ArrowDown": "move_down",
                "s": "move_down",
                "ArrowLeft": "move_left",
                "a": "move_left",
            },
        },
        "cellTypes": CELL_TYPES,
        "actionSpace": ACTION_SPACE,
        "objective": {
            "type": "reach-goal",
            "visible": True,
            "summary": "Reach the target cell while avoiding blocked cells.",
        },
    }


def clamp(value: int) -> int:
    return max(0, min(GRID_SIZE - 1, value))


def distance(left: Dict[str, int], right: Dict[str, int]) -> int:
    return abs(left["x"] - right["x"]) + abs(left["y"] - right["y"])


def apply_action(state: Dict[str, Any], action_name: str) -> Dict[str, Any]:
    next_state = json.loads(canonical_json(state))
    normalized_action = str(action_name or "").strip().lower()
    dx, dy = ACTION_DELTAS.get(normalized_action, (0, 0))
    current = next_state["player"]
    candidate = {
        "x": clamp(int(current["x"]) + dx),
        "y": clamp(int(current["y"]) + dy),
    }

    if candidate not in next_state.get("obstacles", []):
        next_state["player"] = candidate

    next_state["turn"] = int(next_state.get("turn") or 0) + 1
    next_state["completed"] = next_state["player"] == next_state["goal"]
    return next_state


def score_state(state: Dict[str, Any], action_count: int) -> int:
    max_distance = (GRID_SIZE - 1) * 2
    remaining = distance(state["player"], state["goal"])
    progress = max_distance - remaining
    completion_bonus = 700 if state.get("completed") else 0
    efficiency = max(0, 200 - action_count * 8)
    return max(0, completion_bonus + progress * 25 + efficiency)


def normalize_actions(actions: Any) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for index, item in enumerate(actions if isinstance(actions, list) else []):
        if isinstance(item, str):
            action_name = item
            t_ms = index * 1000
        elif isinstance(item, dict):
            action_name = str(item.get("action") or item.get("type") or "")
            t_ms = int(item.get("t_ms") or item.get("tMs") or index * 1000)
        else:
            continue
        action_name = action_name.strip()
        if action_name:
            normalized = {"t_ms": max(0, t_ms), "action": action_name[:80]}
            if isinstance(item, dict) and "x" in item and "y" in item:
                normalized["x"] = max(0, min(63, int(item.get("x") or 0)))
                normalized["y"] = max(0, min(63, int(item.get("y") or 0)))
            result.append(normalized)
    return result


def arc_action_name(action_name: str) -> str | None:
    normalized = str(action_name or "").strip().upper()
    if normalized in {
        "RESET",
        "ACTION1",
        "ACTION2",
        "ACTION3",
        "ACTION4",
        "ACTION5",
        "ACTION6",
        "ACTION7",
    }:
        return normalized
    return ARC_ACTION_ALIASES.get(str(action_name or "").strip().lower())


def arc_agi_logger() -> logging.Logger:
    logger = logging.getLogger("idena_arc.arc_agi")
    logger.propagate = False
    logger.setLevel(logging.WARNING)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setLevel(logging.WARNING)
        handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
        logger.addHandler(handler)

    return logger


def normalize_arc_agi_game_id(value: Any, fallback: str = "") -> str:
    cleaned = "".join(
        char
        for char in str(value or "").strip().lower()
        if char.isalnum() or char == "-"
    )
    return cleaned or fallback


def base_arc_agi_game_id(value: Any) -> str:
    return normalize_arc_agi_game_id(value).split("-", 1)[0]


def normalize_baseline_actions(value: Any) -> List[int]:
    if not isinstance(value, list):
        return []

    result: List[int] = []
    for item in value:
        try:
            parsed = int(item)
        except Exception:
            continue
        if parsed > 0:
            result.append(parsed)
    return result


def baseline_budget_summary(baseline_actions: List[int]) -> Dict[str, Any]:
    def multiplier_budget(multiplier: int) -> List[int]:
        return [int(action_count * multiplier) for action_count in baseline_actions]

    two_x = multiplier_budget(2)
    five_x = multiplier_budget(5)

    return {
        "numberOfLevels": len(baseline_actions),
        "baselineTotalActions": sum(baseline_actions),
        "defaultMultiplier": 5,
        "budget2x": two_x,
        "budget2xTotal": sum(two_x),
        "budget5x": five_x,
        "budget5xTotal": sum(five_x),
    }


def environment_info_to_game(env_info: Any) -> Dict[str, Any]:
    info = serializable(env_info)
    if not isinstance(info, dict):
        info = {}

    game_id = normalize_arc_agi_game_id(info.get("game_id") or info.get("gameId"))
    baseline_actions = normalize_baseline_actions(info.get("baseline_actions"))

    return {
        "gameId": game_id,
        "baseGameId": base_arc_agi_game_id(game_id),
        "title": str(info.get("title") or base_arc_agi_game_id(game_id).upper()),
        "tags": info.get("tags") if isinstance(info.get("tags"), list) else [],
        "privateTags": info.get("private_tags")
        if isinstance(info.get("private_tags"), list)
        else [],
        "levelTags": info.get("level_tags")
        if isinstance(info.get("level_tags"), list)
        else [],
        "baselineActions": baseline_actions,
        "className": info.get("class_name") or info.get("className"),
        "dateDownloaded": info.get("date_downloaded") or info.get("dateDownloaded"),
        "local": bool(info.get("local_dir") or info.get("localDir")),
        "budgets": baseline_budget_summary(baseline_actions),
    }


def arc_agi_paths(generator: Dict[str, Any] | None = None) -> Dict[str, str]:
    generator = generator or {}
    environments_dir = (
        str(generator.get("environmentsDir") or "").strip()
        or os.environ.get("IDENA_ARC_AGI_ENVIRONMENTS_DIR", "").strip()
        or os.environ.get("ENVIRONMENTS_DIR", "").strip()
        or "environment_files"
    )
    recordings_dir = (
        str(generator.get("recordingsDir") or "").strip()
        or os.environ.get("IDENA_ARC_AGI_RECORDINGS_DIR", "").strip()
        or os.environ.get("RECORDINGS_DIR", "").strip()
        or "recordings"
    )

    return {
        "environmentsDir": environments_dir,
        "recordingsDir": recordings_dir,
    }


def make_arcade(operation_mode: Any, generator: Dict[str, Any] | None = None) -> Any:
    if Arcade is None:
        raise RuntimeError("ARC-AGI Toolkit is not installed")

    generator = generator or {}
    paths = arc_agi_paths(generator)
    Path(paths["environmentsDir"]).mkdir(parents=True, exist_ok=True)
    Path(paths["recordingsDir"]).mkdir(parents=True, exist_ok=True)

    kwargs: Dict[str, Any] = {
        "operation_mode": operation_mode,
        "environments_dir": paths["environmentsDir"],
        "recordings_dir": paths["recordingsDir"],
        "logger": arc_agi_logger(),
    }
    arc_api_key = str(generator.get("arcApiKey") or os.environ.get("ARC_API_KEY") or "")
    arc_base_url = str(
        generator.get("arcBaseUrl") or os.environ.get("ARC_BASE_URL") or ""
    ).strip()

    if arc_api_key:
        kwargs["arc_api_key"] = arc_api_key
    if arc_base_url:
        kwargs["arc_base_url"] = arc_base_url

    return Arcade(**kwargs)


def list_arc_agi_games(generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    generator = generator or {}
    if not ARC_AGI_AVAILABLE or Arcade is None or OperationMode is None:
        raise RuntimeError(
            "ARC-AGI Toolkit is not installed. Install Python 3.12 and `arc-agi` "
            "before listing public ARC-AGI games."
        )

    arc = make_arcade(OperationMode.NORMAL, generator)
    games = [
        environment_info_to_game(env_info)
        for env_info in arc.get_environments()
        if normalize_arc_agi_game_id(getattr(env_info, "game_id", ""))
    ]
    games = sorted(
        games,
        key=lambda item: (
            str(item.get("baseGameId") or ""),
            str(item.get("gameId") or ""),
        ),
    )

    return {
        "ok": True,
        "protocol": "idena-arc-sidecar-v0",
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "games": games,
        "gameCount": len(games),
        "paths": arc_agi_paths(generator),
    }


def serializable(value: Any, depth: int = 0) -> Any:
    if depth > 6:
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, dict):
        return {str(key): serializable(entry, depth + 1) for key, entry in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [serializable(entry, depth + 1) for entry in value]
    if hasattr(value, "tolist"):
        try:
            return serializable(value.tolist(), depth + 1)
        except Exception:
            pass
    if hasattr(value, "name"):
        return str(value.name)
    if hasattr(value, "model_dump"):
        try:
            return serializable(value.model_dump(), depth + 1)
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        try:
            return serializable(
                {
                    key: entry
                    for key, entry in vars(value).items()
                    if not str(key).startswith("_")
                },
                depth + 1,
            )
        except Exception:
            pass
    return str(value)


def arc_action_to_name(value: Any) -> str:
    if GameAction is not None:
        try:
            if isinstance(value, int):
                return str(GameAction.from_id(value).name)
        except Exception:
            pass

    if hasattr(value, "name"):
        return str(value.name)

    normalized = str(value or "").strip()
    if normalized.isdigit() and GameAction is not None:
        try:
            return str(GameAction.from_id(int(normalized)).name)
        except Exception:
            pass

    if "." in normalized:
        normalized = normalized.rsplit(".", 1)[-1]

    return normalized.upper() if normalized else ""


def normalize_frame_grid(frame: Any) -> List[List[int]]:
    frame_data = serializable(frame)

    if (
        isinstance(frame_data, list)
        and frame_data
        and isinstance(frame_data[0], list)
        and frame_data[0]
        and isinstance(frame_data[0][0], list)
    ):
        frame_data = frame_data[-1]

    if not isinstance(frame_data, list):
        return []

    rows: List[List[int]] = []
    for row in frame_data[:64]:
        if not isinstance(row, list):
            continue
        rows.append([int(cell) if isinstance(cell, (int, float)) else 0 for cell in row[:64]])
    return rows


def stable_arc_guid(raw: Any, game_id: str, turn: int) -> str:
    raw_game_id = ""
    if isinstance(raw, dict):
        raw_game_id = str(raw.get("game_id") or raw.get("gameId") or "").strip()
    return f"{raw_game_id or game_id}:{int(turn)}"


def raw_observation_for_recording(raw: Any, stable_guid: str) -> Any:
    if isinstance(raw, dict):
        normalized = dict(raw)
        if "guid" in normalized:
            normalized["guid"] = stable_guid
        return normalized
    return raw


def arc_game_id_from_initial_state(initial_state: Dict[str, Any] | None) -> str:
    if not isinstance(initial_state, dict):
        return ""
    raw = initial_state.get("rawObservation")
    if isinstance(raw, dict):
        raw_game_id = str(raw.get("game_id") or raw.get("gameId") or "").strip()
        if raw_game_id:
            return raw_game_id
    return str(initial_state.get("gameId") or "").strip()


def observation_to_arc_state(obs: Any, env: Any, game_id: str, turn: int) -> Dict[str, Any]:
    raw = serializable(obs)
    frame = normalize_frame_grid(getattr(obs, "frame", None) if obs is not None else None)
    state_name = serializable(getattr(obs, "state", None) if obs is not None else None)
    action_input = serializable(getattr(obs, "action_input", None) if obs is not None else None)
    guid = stable_arc_guid(raw, game_id, turn)
    raw_observation = raw_observation_for_recording(raw, guid)
    full_reset = bool(getattr(obs, "full_reset", False) if obs is not None else False)
    levels_completed = int(getattr(obs, "levels_completed", 0) or 0) if obs is not None else 0
    win_levels = int(getattr(obs, "win_levels", 0) or 0) if obs is not None else 0
    raw_available_actions = (
        getattr(obs, "available_actions", None) if obs is not None else None
    )
    if not raw_available_actions:
        raw_available_actions = getattr(env, "action_space", []) or []
    available_action_ids: List[int] = []
    for action in raw_available_actions:
        if hasattr(action, "value"):
            try:
                available_action_ids.append(int(action.value))
            except Exception:
                pass
        else:
            try:
                available_action_ids.append(int(action))
            except Exception:
                pass
    available_actions = [
        action_name
        for action_name in (arc_action_to_name(action) for action in raw_available_actions)
        if action_name
    ]

    state_text = str(state_name).upper()
    completed = state_text.endswith("WIN") or (
        win_levels > 0 and levels_completed >= win_levels
    )
    game_over = state_text.endswith("GAME_OVER")

    return {
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "gameId": game_id,
        "turn": turn,
        "frame": frame,
        "gridSize": len(frame) if frame else 0,
        "state": state_name,
        "guid": guid,
        "fullReset": full_reset,
        "levelsCompleted": levels_completed,
        "winLevels": win_levels,
        "actionInput": action_input if isinstance(action_input, dict) else None,
        "rawObservation": raw_observation,
        "availableActions": available_actions,
        "availableActionIds": available_action_ids,
        "completed": completed,
        "gameOver": game_over,
    }


def mark_auto_reset_failure(
    state: Dict[str, Any], action_name: str, turn: int
) -> Dict[str, Any]:
    if (
        int(turn or 0) > 0
        and str(action_name or "").strip().upper() != "RESET"
        and bool(state.get("fullReset"))
        and not bool(state.get("completed"))
    ):
        state = dict(state)
        state["observedState"] = state.get("state")
        state["state"] = "FAILED_AUTO_RESET"
        state["failed"] = True
        state["gameOver"] = True
        state["failureReason"] = "arc_agi_environment_reset_after_action"
    return state


def build_arc_agi_render_hints(state: Dict[str, Any]) -> Dict[str, Any]:
    width = max((len(row) for row in state.get("frame", []) or []), default=0)
    height = len(state.get("frame", []) or [])
    return {
        "renderer": "arc-agi-frame-v0",
        "board": {
            "type": "color-grid",
            "width": width,
            "height": height,
            "origin": "top-left",
        },
        "input": {
            "modes": ["keyboard", "action-buttons", "coordinate-click"],
            "keyboard": {
                "ArrowUp": "ACTION1",
                "w": "ACTION1",
                "ArrowDown": "ACTION2",
                "s": "ACTION2",
                "ArrowLeft": "ACTION3",
                "a": "ACTION3",
                "ArrowRight": "ACTION4",
                "d": "ACTION4",
                " ": "ACTION5",
                "f": "ACTION5",
            },
        },
        "objective": {
            "type": "hidden-rule-discovery",
            "visible": False,
            "summary": "Infer the hidden rules from interaction feedback.",
        },
    }


def seed_to_int(seed: str) -> int:
    return int(sha256_hex(seed)[:8], 16)


def arc_agi_action_from_name(action_name: str) -> Any:
    if GameAction is None:
        raise RuntimeError("arcengine GameAction is not available")

    normalized = str(action_name or "").strip()
    arc_name = ARC_ACTION_ALIASES.get(normalized.lower(), normalized.upper())
    if not hasattr(GameAction, arc_name):
        raise ValueError(f"Unsupported ARC-AGI action: {action_name}")
    return getattr(GameAction, arc_name)


def make_arc_agi_env(
    game_id: str, seed: str, generator: Dict[str, Any] | None = None
) -> Any:
    if not ARC_AGI_AVAILABLE or Arcade is None or OperationMode is None:
        raise RuntimeError(
            "ARC-AGI Toolkit is not installed. Install Python 3.12 and `arc-agi` "
            "to run public ARC-AGI games locally."
        )

    normalized_game_id = normalize_arc_agi_game_id(game_id, "ls20")
    env = None
    offline_error = None

    try:
        offline_arc = make_arcade(OperationMode.OFFLINE, generator)
        env = offline_arc.make(normalized_game_id, seed=seed_to_int(seed), render_mode=None)
    except Exception as exc:
        offline_error = exc

    if env is None:
        try:
            normal_arc = make_arcade(OperationMode.NORMAL, generator)
            env = normal_arc.make(
                normalized_game_id,
                seed=seed_to_int(seed),
                render_mode=None,
            )
        except Exception as exc:
            details = f"; offline cache error: {offline_error}" if offline_error else ""
            raise RuntimeError(
                f"Unable to download or start ARC-AGI game {normalized_game_id}: {exc}{details}"
            ) from exc

    if env is None:
        raise RuntimeError(
            f"ARC-AGI game is not available locally or from the ARC API: {normalized_game_id}"
        )
    return env


def generate_arc_agi(seed: str, generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    generator = generator or {}
    game_id = normalize_arc_agi_game_id(generator.get("gameId"), "ls20")
    env = make_arc_agi_env(game_id, seed, generator)
    obs = env.reset() if hasattr(env, "reset") else getattr(env, "observation_space", None)
    state = observation_to_arc_state(obs, env, game_id, 0)
    env_info = environment_info_to_game(getattr(env, "info", None) or getattr(env, "environment_info", None))

    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "generator": public_generator(generator),
        "seed": seed,
        "title": env_info.get("title") or f"ARC-AGI public game {game_id}",
        "level": 0,
        "gameInfo": env_info,
        "actionSpace": [
            {
                "name": str(action),
                "arcAction": str(action),
                "label": str(action),
            }
            for action in state.get("availableActions", [])
        ],
        "renderHints": build_arc_agi_render_hints(state),
        "initialState": state,
        "initialStateHash": hash_state(state),
        "goalStateHash": hash_state({"gameId": game_id, "seed": seed, "hiddenGoal": True}),
    }


def replay(seed: str, actions: Any, initial_state: Dict[str, Any] | None = None) -> Dict[str, Any]:
    state = initial_state or build_initial_state(seed)
    replayed_actions: List[Dict[str, Any]] = []
    timeline: List[Dict[str, Any]] = [
        {
            "phase": "initial",
            "step": 0,
            "t_ms": 0,
            "actionInput": None,
            "state": json.loads(canonical_json(state)),
            "stateHash": hash_state(state),
            "score": score_state(state, 0),
            "fullReset": True,
        }
    ]

    for item in normalize_actions(actions):
        state = apply_action(state, item["action"])
        observation_hash = hash_state(state)
        replayed_actions.append(
            {
                **item,
                "observation_hash": observation_hash,
            }
        )
        timeline.append(
            {
                "phase": "action",
                "step": len(replayed_actions),
                "t_ms": item["t_ms"],
                "actionInput": {
                    "id": len(replayed_actions) - 1,
                    "data": {
                        "action": item["action"],
                        "arc_action": arc_action_name(item["action"]),
                        "t_ms": item["t_ms"],
                    },
                },
                "state": json.loads(canonical_json(state)),
                "stateHash": observation_hash,
                "score": score_state(state, len(replayed_actions)),
                "fullReset": False,
            }
        )
        if state.get("completed"):
            break

    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": state.get("engine"),
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "renderHints": build_render_hints(state),
        "actionSpace": ACTION_SPACE,
        "actions": replayed_actions,
        "timeline": timeline,
        "finalState": state,
        "finalStateHash": hash_state(state),
        "score": score_state(state, len(replayed_actions)),
        "completed": bool(state.get("completed")),
    }


def replay_arc_agi(
    seed: str,
    actions: Any,
    initial_state: Dict[str, Any] | None = None,
    generator: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    generator = generator or {}
    game_id = normalize_arc_agi_game_id(
        arc_game_id_from_initial_state(initial_state) or generator.get("gameId"),
        "ls20",
    )
    env = make_arc_agi_env(game_id, seed, generator)
    obs = env.reset() if hasattr(env, "reset") else getattr(env, "observation_space", None)
    state = observation_to_arc_state(obs, env, game_id, 0)
    initial_action_input = state.get("actionInput") or None
    replayed_actions: List[Dict[str, Any]] = []
    timeline: List[Dict[str, Any]] = [
        {
            "phase": "initial",
            "step": 0,
            "t_ms": 0,
            "actionInput": initial_action_input,
            "state": json.loads(canonical_json(state)),
            "stateHash": hash_state(state),
            "score": 0,
            "guid": state.get("guid"),
            "fullReset": bool(state.get("fullReset", True)),
            "availableActions": state.get("availableActions", []),
            "availableActionIds": state.get("availableActionIds", []),
            "levelsCompleted": state.get("levelsCompleted", 0),
            "winLevels": state.get("winLevels", 0),
        }
    ]

    for item in normalize_actions(actions):
        if state.get("completed") or state.get("gameOver"):
            break
        action = arc_agi_action_from_name(item["action"])
        action_data = None
        if str(getattr(action, "name", action)) == "ACTION6":
            action_data = {
                "x": int(item.get("x") or item.get("col") or 0),
                "y": int(item.get("y") or item.get("row") or 0),
            }
        obs = env.step(action, data=action_data)
        state = observation_to_arc_state(obs, env, game_id, len(replayed_actions) + 1)
        state = mark_auto_reset_failure(
            state,
            str(getattr(action, "name", item["action"])),
            len(replayed_actions) + 1,
        )
        observation_hash = hash_state(state)
        observed_action_input = state.get("actionInput") or {}
        if not isinstance(observed_action_input, dict):
            observed_action_input = {}
        action_input = {
            **observed_action_input,
            "id": observed_action_input.get("id", len(replayed_actions)),
            "data": {
                "action": str(getattr(action, "name", item["action"])),
                "arc_action": str(getattr(action, "name", item["action"])),
                "t_ms": item["t_ms"],
                **(
                    observed_action_input.get("data", {})
                    if isinstance(observed_action_input.get("data"), dict)
                    else {}
                ),
                **(action_data if action_data else {}),
            },
        }
        replayed_actions.append(
            {
                **item,
                "action": str(getattr(action, "name", item["action"])),
                "observation_hash": observation_hash,
            }
        )
        timeline.append(
            {
                "phase": "action",
                "step": len(replayed_actions),
                "t_ms": item["t_ms"],
                "actionInput": action_input,
                "state": json.loads(canonical_json(state)),
                "stateHash": observation_hash,
                "score": len(replayed_actions) if state.get("completed") else 0,
                "guid": state.get("guid"),
                "fullReset": bool(state.get("fullReset", False)),
                "availableActions": state.get("availableActions", []),
                "availableActionIds": state.get("availableActionIds", []),
                "levelsCompleted": state.get("levelsCompleted", 0),
                "winLevels": state.get("winLevels", 0),
            }
        )

    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "renderHints": build_arc_agi_render_hints(state),
        "actionSpace": [
            {
                "name": str(action),
                "arcAction": str(action),
                "label": str(action),
            }
            for action in state.get("availableActions", [])
        ],
        "actions": replayed_actions,
        "timeline": timeline,
        "finalState": state,
        "finalStateHash": hash_state(state),
        "score": 1000 if state.get("completed") else 0,
        "completed": bool(state.get("completed")),
    }


def resolve_arc_agi_online_mode(value: Any) -> Any:
    if OperationMode is None:
        raise RuntimeError("ARC-AGI Toolkit is not installed")

    normalized = str(value or "").strip().lower()
    if normalized == "competition" and hasattr(OperationMode, "COMPETITION"):
        return OperationMode.COMPETITION
    return OperationMode.ONLINE


def normalize_tags(value: Any) -> List[str]:
    if isinstance(value, str):
        items = value.replace(",", "\n").splitlines()
    elif isinstance(value, list):
        items = value
    else:
        items = []

    result = []
    for item in items:
        text = str(item or "").strip()
        if text:
            result.append(text[:80])
    return result[:12]


def scorecard_id_from_scorecard(scorecard: Any, fallback: str) -> str:
    data = serializable(scorecard)
    if isinstance(data, dict):
        return str(
            data.get("card_id") or data.get("cardId") or data.get("id") or fallback
        )
    return fallback


def submit_arc_agi_scorecard(
    seed: str,
    actions: Any,
    initial_state: Dict[str, Any] | None = None,
    generator: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    generator = generator or {}
    if not ARC_AGI_AVAILABLE or Arcade is None or OperationMode is None:
        raise RuntimeError(
            "ARC-AGI Toolkit is not installed. Install Python 3.12 and `arc-agi` "
            "before submitting official ARC scorecards."
        )

    game_id = normalize_arc_agi_game_id(
        arc_game_id_from_initial_state(initial_state) or generator.get("gameId"),
        "ls20",
    )
    scorecard_mode = str(
        generator.get("scorecardMode")
        or generator.get("operationMode")
        or "competition"
    ).strip().lower()
    operation_mode = resolve_arc_agi_online_mode(scorecard_mode)
    arc = make_arcade(operation_mode, generator)
    tags = normalize_tags(generator.get("scorecardTags") or ["idena-arc"])
    source_url = str(generator.get("sourceUrl") or "").strip() or None
    opaque = (
        generator.get("opaque") if isinstance(generator.get("opaque"), dict) else None
    )
    scorecard_id = arc.open_scorecard(
        source_url=source_url,
        tags=tags,
        opaque={
            "source": "idena-arc",
            "game_id": game_id,
            "mode": scorecard_mode,
            **(opaque or {}),
        },
    )
    state: Dict[str, Any] = {}
    timeline: List[Dict[str, Any]] = []
    replayed_actions: List[Dict[str, Any]] = []

    try:
        env = arc.make(
            game_id,
            seed=seed_to_int(seed),
            scorecard_id=scorecard_id,
            save_recording=bool(generator.get("saveRecording", True)),
            include_frame_data=bool(generator.get("includeFrameData", True)),
            render_mode=None,
        )

        if env is None:
            raise RuntimeError(f"ARC-AGI game is not available online: {game_id}")

        obs = getattr(env, "observation_space", None)
        state = observation_to_arc_state(obs, env, game_id, 0)
        timeline.append(
            {
                "phase": "initial",
                "step": 0,
                "t_ms": 0,
                "actionInput": state.get("actionInput"),
                "state": json.loads(canonical_json(state)),
                "stateHash": hash_state(state),
                "score": 0,
                "guid": state.get("guid"),
                "fullReset": bool(state.get("fullReset", True)),
                "availableActions": state.get("availableActions", []),
                "availableActionIds": state.get("availableActionIds", []),
                "levelsCompleted": state.get("levelsCompleted", 0),
                "winLevels": state.get("winLevels", 0),
            }
        )

        for item in normalize_actions(actions):
            if state.get("completed") or state.get("gameOver"):
                break

            action = arc_agi_action_from_name(item["action"])
            action_name = str(getattr(action, "name", item["action"]))
            action_data = None
            if action_name == "ACTION6":
                action_data = {
                    "x": int(item.get("x") or item.get("col") or 0),
                    "y": int(item.get("y") or item.get("row") or 0),
                }

            reasoning = {
                "source": "idena-arc-official-scorecard-v0",
                "t_ms": item["t_ms"],
                "action": action_name,
            }
            obs = env.step(action, data=action_data, reasoning=reasoning)
            state = observation_to_arc_state(
                obs, env, game_id, len(replayed_actions) + 1
            )
            state = mark_auto_reset_failure(
                state,
                action_name,
                len(replayed_actions) + 1,
            )
            observation_hash = hash_state(state)
            observed_action_input = state.get("actionInput") or {}
            if not isinstance(observed_action_input, dict):
                observed_action_input = {}
            action_input = {
                **observed_action_input,
                "id": observed_action_input.get("id", len(replayed_actions)),
                "data": {
                    "action": action_name,
                    "arc_action": action_name,
                    "t_ms": item["t_ms"],
                    **(
                        observed_action_input.get("data", {})
                        if isinstance(observed_action_input.get("data"), dict)
                        else {}
                    ),
                    **(action_data if action_data else {}),
                },
                "reasoning": observed_action_input.get("reasoning") or reasoning,
            }

            replayed_actions.append(
                {
                    **item,
                    "action": action_name,
                    "observation_hash": observation_hash,
                }
            )
            timeline.append(
                {
                    "phase": "action",
                    "step": len(replayed_actions),
                    "t_ms": item["t_ms"],
                    "actionInput": action_input,
                    "state": json.loads(canonical_json(state)),
                    "stateHash": observation_hash,
                    "score": state.get("levelsCompleted", 0),
                    "guid": state.get("guid"),
                    "fullReset": bool(state.get("fullReset", False)),
                    "availableActions": state.get("availableActions", []),
                    "availableActionIds": state.get("availableActionIds", []),
                    "levelsCompleted": state.get("levelsCompleted", 0),
                    "winLevels": state.get("winLevels", 0),
                }
            )
    finally:
        scorecard = arc.close_scorecard(scorecard_id)

    scorecard_data = serializable(scorecard)
    final_scorecard_id = scorecard_id_from_scorecard(scorecard, scorecard_id)
    base_url = str(
        generator.get("arcBaseUrl")
        or os.environ.get("ARC_BASE_URL")
        or "https://three.arcprize.org"
    ).rstrip("/")

    return {
        "ok": True,
        "protocol": "idena-arc-official-scorecard-v0",
        "engine": "arc-agi-public-game-v0",
        "mode": scorecard_mode if scorecard_mode == "competition" else "online",
        "gameId": game_id,
        "scorecardId": final_scorecard_id,
        "scorecardUrl": f"{base_url}/scorecards/{final_scorecard_id}",
        "actions": replayed_actions,
        "timeline": timeline,
        "finalState": state,
        "finalStateHash": hash_state(state),
        "completed": bool(state.get("completed")),
        "scorecard": scorecard_data,
    }


def cache_arc_agi_games(generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    generator = generator or {}
    if not ARC_AGI_AVAILABLE or Arcade is None or OperationMode is None:
        raise RuntimeError(
            "ARC-AGI Toolkit is not installed. Install Python 3.12 and `arc-agi` "
            "before caching public ARC-AGI games."
        )

    requested = generator.get("gameIds") or generator.get("game_ids") or []
    if isinstance(requested, str):
        requested = requested.replace(",", "\n").splitlines()
    if not isinstance(requested, list):
        requested = []

    arc = make_arcade(OperationMode.NORMAL, generator)
    game_ids = [
        normalize_arc_agi_game_id(game_id)
        for game_id in requested
        if normalize_arc_agi_game_id(game_id)
    ]

    if not game_ids and generator.get("cacheAllPublic", True):
        game_ids = [
            normalize_arc_agi_game_id(getattr(env, "game_id", ""))
            for env in arc.get_environments()
            if normalize_arc_agi_game_id(getattr(env, "game_id", ""))
        ]

    if not game_ids:
        game_ids = [normalize_arc_agi_game_id(generator.get("gameId"), "ls20")]

    seen = set()
    unique_game_ids = []
    for game_id in game_ids:
        if game_id not in seen:
            seen.add(game_id)
            unique_game_ids.append(game_id)

    max_games = int(generator.get("maxGames") or 0)
    if max_games > 0:
        unique_game_ids = unique_game_ids[:max_games]

    cached = []
    failed = []
    for game_id in unique_game_ids:
        try:
            env = arc.make(
                game_id,
                seed=0,
                render_mode=None,
                include_frame_data=False,
            )
            if env is None:
                raise RuntimeError("arc-agi returned no environment")

            env_info = environment_info_to_game(
                getattr(env, "info", None) or getattr(env, "environment_info", None)
            )
            cached.append(
                {
                    "gameId": game_id,
                    "environment": env_info,
                }
            )
        except Exception as exc:
            failed.append({"gameId": game_id, "error": str(exc)})

    return {
        "ok": bool(cached) and not failed,
        "protocol": "idena-arc-sidecar-v0",
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "cache": {
            **arc_agi_paths(generator),
            "requested": len(unique_game_ids),
            "cached": cached,
            "failed": failed,
        },
    }


def generate(seed: str, generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    generator = generator or {}
    if generator.get("kind") == "arc-agi-public-game-v0":
        return generate_arc_agi(seed, generator)

    state = build_initial_state(seed)
    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": state["engine"],
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "generator": public_generator(generator),
        "seed": seed,
        "title": "IdenaArc Local Grid",
        "level": 0,
        "actionSpace": ACTION_SPACE,
        "renderHints": build_render_hints(state),
        "initialState": state,
        "initialStateHash": hash_state(state),
        "goalStateHash": hash_state({"goal": state["goal"], "gridSize": GRID_SIZE}),
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        command = str(payload.get("command") or "generate")
        seed = str(payload.get("seed") or "")

        if command == "generate":
            result = generate(seed, payload.get("generator") or {})
        elif command == "listArcAgiGames":
            result = list_arc_agi_games(payload.get("generator") or {})
        elif command == "cacheArcAgiGames":
            result = cache_arc_agi_games(payload.get("generator") or {})
        elif command == "submitArcAgiScorecard":
            result = submit_arc_agi_scorecard(
                seed,
                payload.get("actions") or [],
                payload.get("initialState"),
                payload.get("generator") or {},
            )
        elif command == "replay":
            generator = payload.get("generator") or {}
            if generator.get("kind") == "arc-agi-public-game-v0":
                result = replay_arc_agi(
                    seed,
                    payload.get("actions") or [],
                    payload.get("initialState"),
                    generator,
                )
            else:
                result = replay(seed, payload.get("actions") or [], payload.get("initialState"))
        else:
            raise ValueError(f"Unsupported command: {command}")

        sys.stdout.write(canonical_json(result))
        sys.stdout.write("\n")
        return 0
    except Exception as exc:  # pragma: no cover - exercised by process tests.
        sys.stderr.write(f"{type(exc).__name__}: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
