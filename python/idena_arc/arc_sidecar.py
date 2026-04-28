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
import sys
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


def observation_to_arc_state(obs: Any, env: Any, game_id: str, turn: int) -> Dict[str, Any]:
    raw = serializable(obs)
    frame = normalize_frame_grid(getattr(obs, "frame", None) if obs is not None else None)
    state_name = serializable(getattr(obs, "state", None) if obs is not None else None)
    available_actions = [
        serializable(getattr(action, "name", action))
        for action in (getattr(env, "action_space", []) or [])
    ]

    return {
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "gameId": game_id,
        "turn": turn,
        "frame": frame,
        "gridSize": len(frame) if frame else 0,
        "state": state_name,
        "rawObservation": raw,
        "availableActions": available_actions,
        "completed": str(state_name).upper().endswith("WIN"),
        "gameOver": str(state_name).upper().endswith("GAME_OVER"),
    }


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


def make_arc_agi_env(game_id: str, seed: str) -> Any:
    if not ARC_AGI_AVAILABLE or Arcade is None or OperationMode is None:
        raise RuntimeError(
            "ARC-AGI Toolkit is not installed. Install Python 3.12 and `arc-agi` "
            "to run public ARC-AGI games locally."
        )

    arc = Arcade(operation_mode=OperationMode.OFFLINE)
    env = arc.make(game_id, seed=seed_to_int(seed), render_mode=None)
    if env is None:
        raise RuntimeError(f"ARC-AGI game is not available locally: {game_id}")
    return env


def generate_arc_agi(seed: str, generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    generator = generator or {}
    game_id = str(generator.get("gameId") or "ls20").strip() or "ls20"
    env = make_arc_agi_env(game_id, seed)
    obs = env.reset() if hasattr(env, "reset") else getattr(env, "observation_space", None)
    state = observation_to_arc_state(obs, env, game_id, 0)

    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": "arc-agi-public-game-v0",
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "arcAgiAvailable": ARC_AGI_AVAILABLE,
        "generator": generator,
        "seed": seed,
        "title": f"ARC-AGI public game {game_id}",
        "level": 0,
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
    game_id = str(generator.get("gameId") or (initial_state or {}).get("gameId") or "ls20")
    env = make_arc_agi_env(game_id, seed)
    obs = env.reset() if hasattr(env, "reset") else getattr(env, "observation_space", None)
    state = observation_to_arc_state(obs, env, game_id, 0)
    replayed_actions: List[Dict[str, Any]] = []
    timeline: List[Dict[str, Any]] = [
        {
            "phase": "initial",
            "step": 0,
            "t_ms": 0,
            "actionInput": None,
            "state": json.loads(canonical_json(state)),
            "stateHash": hash_state(state),
            "score": 0,
            "fullReset": True,
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
        observation_hash = hash_state(state)
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
                "actionInput": {
                    "id": len(replayed_actions) - 1,
                    "data": {
                        "action": str(getattr(action, "name", item["action"])),
                        "arc_action": str(getattr(action, "name", item["action"])),
                        "t_ms": item["t_ms"],
                        **({"data": action_data} if action_data else {}),
                    },
                },
                "state": json.loads(canonical_json(state)),
                "stateHash": observation_hash,
                "score": len(replayed_actions) if state.get("completed") else 0,
                "fullReset": False,
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
        "generator": generator,
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
