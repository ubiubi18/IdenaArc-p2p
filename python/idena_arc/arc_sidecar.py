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
    import arcengine  # type: ignore  # noqa: F401

    ARCENGINE_AVAILABLE = True
except Exception:  # pragma: no cover - the fallback is the tested MVP path.
    ARCENGINE_AVAILABLE = False


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
            result.append({"t_ms": max(0, t_ms), "action": action_name[:80]})
    return result


def replay(seed: str, actions: Any, initial_state: Dict[str, Any] | None = None) -> Dict[str, Any]:
    state = initial_state or build_initial_state(seed)
    replayed_actions: List[Dict[str, Any]] = []

    for item in normalize_actions(actions):
        state = apply_action(state, item["action"])
        replayed_actions.append(
            {
                **item,
                "observation_hash": hash_state(state),
            }
        )
        if state.get("completed"):
            break

    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": state.get("engine"),
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "actions": replayed_actions,
        "finalState": state,
        "finalStateHash": hash_state(state),
        "score": score_state(state, len(replayed_actions)),
        "completed": bool(state.get("completed")),
    }


def generate(seed: str, generator: Dict[str, Any] | None = None) -> Dict[str, Any]:
    state = build_initial_state(seed)
    return {
        "protocol": "idena-arc-sidecar-v0",
        "engine": state["engine"],
        "arcengineAvailable": ARCENGINE_AVAILABLE,
        "generator": generator or {},
        "seed": seed,
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
