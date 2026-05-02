# ARC-AGI-3 Agents Compatibility Note

This note records what IdenaArc should take from ARC Prize's
`ARC-AGI-3-Agents` repository.

## Decision

Treat `ARC-AGI-3-Agents` as an interoperability and benchmark-harness
reference, not as the agent architecture for IdenaArc.

IdenaArc should be able to export and import replay artifacts that are easy to
inspect with ARC-style agent tooling. It should not copy game-specific LLM
prompts or public-fixture strategies into live hidden-rule sessions.

## Source Context

- ARC Prize agent harness:
  <https://github.com/arcprize/ARC-AGI-3-Agents>
- ARC-AGI-3 documentation:
  <https://three.arcprize.org/docs>
- ARC-AGI toolkit:
  <https://github.com/arcprize/ARC-AGI>

The harness defines a simple loop:

1. collect the latest `FrameData`
2. call an agent's `choose_action(frames, latest_frame)`
3. submit exactly one `GameAction`
4. append the returned frame
5. stop on win or max-action budget
6. write `.recording.jsonl` events for replay and analysis

The recent public contract details matter:

- `FrameData.score` was renamed to `levels_completed`
- `win_score` was renamed to `win_levels`
- `available_actions` was added to `FrameData`
- `ACTION7` is part of the public action surface
- recordings use `data.action_input` as the replay action source
- scorecards/tags are used to group multi-game runs

## What IdenaArc Should Include

IdenaArc should preserve these fields in every ARC-style trace bundle:

- `recording.format: arc-style-jsonl-v0`
- per-entry `data.game_id`
- per-entry `data.frame`
- per-entry `data.state`
- per-entry `data.levels_completed`
- per-entry `data.win_levels`
- per-entry `data.available_actions`
- per-entry `data.action_input.id`
- per-entry `data.action_input.data.game_id`
- per-entry `data.action_input.data.arc_action`
- per-entry `data.action_input.reasoning`, when available
- a standalone `{game_id}.{participant}.{max_actions}.{guid}.recording.jsonl`
- a standalone `{game_id}.{participant}.{max_actions}.{guid}.agent.log.txt`

For playback compatibility, `action_input.id` should be the canonical ARC
action id:

| Action | Id |
| --- | --- |
| `RESET` | `0` |
| `ACTION1` | `1` |
| `ACTION2` | `2` |
| `ACTION3` | `3` |
| `ACTION4` | `4` |
| `ACTION5` | `5` |
| `ACTION6` | `6` |
| `ACTION7` | `7` |

Do not use a turn index as the replay action id. A turn index may make local
logs readable, but it breaks the expected ARC playback contract where the id is
converted back into a `GameAction`.

## What IdenaArc Should Not Import

Do not treat the provided template agents as policy sources for live IdenaArc
sessions:

- Random, LLM, LangGraph, multimodal, and smolagents templates are useful
  baselines.
- Game-specific prompts and hardcoded rules are public-fixture shortcuts.
- Observability providers such as AgentOps are optional developer tooling, not a
  protocol dependency.
- Scorecards are evaluation reports, not the source of truth for IdenaArc's
  replay verification.

## Design Implications

IdenaArc should keep its own hidden-seed and P2P protocol while matching the
public ARC harness at artifact boundaries:

- export ARC-compatible recording JSONL
- keep `ACTION1` through `ACTION7` and `RESET` canonical
- preserve available-action lists for each frame
- store reasoning separately from raw replay state when possible
- keep max-action budgets explicit in filenames and result payloads
- support local playback/import tests against stored recordings
- tag evaluation runs by source: `human`, `local-ai`, `adapter-eval`,
  `playback`, or `public-fixture`

This makes IdenaArc results inspectable by ARC-style tools without weakening the
anti-shortcut design.

## Anti-Shortcut Boundary

ARC-compatible exports are post-session artifacts. They must remain private
until the play window and submission cutoff close. Public recordings are useful
for audits, annotation, and adapter backtesting, but they are not allowed inputs
to another participant's live session.

For adapter reports, separate:

- public-fixture performance
- hidden-seed performance
- held-out-generator performance
- playback/replay success
- action-efficiency gain
- trace-memorization risk

Only hidden-seed or held-out-generator gains should influence broader P2P
adapter distribution.

## Implementation Checklist

- Keep `main/idena-arc/manager.js` recording exports aligned with
  `levels_completed`, `win_levels`, `available_actions`, and canonical action
  ids.
- Keep `python/idena_arc/arc_sidecar.py` emitting `availableActionIds`,
  `levelsCompleted`, `winLevels`, and `actionInput.reasoning` when present.
- Add compatibility tests whenever the ARC public harness changes its recording
  or `FrameData` shape.
- Use the public harness as a regression suite for fixture runs, not as the
  design center for decentralized hidden-rule gameplay.
