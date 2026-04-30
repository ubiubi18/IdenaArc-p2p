# ARC Public Game Action Base Layer

This note records the current action surface exposed by the public ARC-AGI
games used in IdenaArc. It is intended for internal design work around local
AI self-annotation, human teacher review, and future decentralized gameplay
salt.

The important finding is that the public game action enum is small and stable:
`RESET`, `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5`, `ACTION6`, and
`ACTION7`. The hidden game logic lives behind those channels. A local AI must
therefore annotate observed behavior from before/after state changes instead of
assuming that an action label fully describes the rule.

## Runtime Sources Checked

- IdenaArc sidecar action aliases: `python/idena_arc/arc_sidecar.py`
- IdenaArc renderer controls and button descriptions:
  `renderer/pages/idena-arc.js`
- Installed ARC runtime enum:
  `arcengine/enums.py`
- Installed public game files under:
  `~/Library/Application Support/IdenaArc/idena-arc/arc-agi-runtime/environment_files`
- Runtime generation probe for the 25 configured public games.

## Public Game Action Map

`RESET` exists at the engine level for all games, but it is not a normal
attempt action. It should be stored as an explicit reset event, not as failure.

| Game | Available attempt actions | Input family |
| --- | --- | --- |
| `ls20` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4` | keyboard |
| `ft09` | `ACTION6` | click |
| `vc33` | `ACTION6` | click |
| `ar25` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5`, `ACTION6`, `ACTION7` | keyboard, click, undo |
| `bp35` | `ACTION3`, `ACTION4`, `ACTION6`, `ACTION7` | horizontal keyboard, click, undo |
| `cd82` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5`, `ACTION6` | keyboard, click |
| `cn04` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5`, `ACTION6` | keyboard, click |
| `dc22` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION6` | keyboard, click |
| `g50t` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5` | keyboard |
| `ka59` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION6` | keyboard, click |
| `lf52` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION6`, `ACTION7` | keyboard, click, undo |
| `lp85` | `ACTION6` | click |
| `m0r0` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5`, `ACTION6` | keyboard, click |
| `r11l` | `ACTION6` | click |
| `re86` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5` | keyboard |
| `s5i5` | `ACTION6` | click |
| `sb26` | `ACTION5`, `ACTION6`, `ACTION7` | primary action, click, undo |
| `sc25` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION6` | keyboard, click |
| `sk48` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION6`, `ACTION7` | keyboard, click, undo |
| `sp80` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5`, `ACTION6` | keyboard, click |
| `su15` | `ACTION6`, `ACTION7` | click, undo |
| `tn36` | `ACTION6` | click |
| `tr87` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4` | keyboard |
| `tu93` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4` | keyboard |
| `wa30` | `ACTION1`, `ACTION2`, `ACTION3`, `ACTION4`, `ACTION5` | keyboard |

## Canonical Action Annotations

| Action | Human controls | Base-layer meaning | Annotation requirement |
| --- | --- | --- | --- |
| `ACTION1` | `W`, `ArrowUp` | Simple action, usually up-like movement. | Record actual frame delta. Do not assume movement happened or that up is always spatial. |
| `ACTION2` | `S`, `ArrowDown` | Simple action, usually down-like movement. | Record actual frame delta, blocked/no-op status, and any rule side effect. |
| `ACTION3` | `A`, `ArrowLeft` | Simple action, usually left-like movement. | Record actual frame delta and whether horizontal movement, selection, or mode change happened. |
| `ACTION4` | `D`, `ArrowRight` | Simple action, usually right-like movement. | Record actual frame delta and whether it advanced a path, object, timer, or mode. |
| `ACTION5` | `Space`, `F`, `Enter` | Primary simple action. Often interact, select, rotate, activate, confirm, or test. | Record target object, visible effect, hidden-rule hypothesis, and whether the action changes available options. |
| `ACTION6` | Mouse/touch cell coordinates | Complex coordinate action with `{x,y}`. | Record clicked cell, clicked object/color, coordinate transform, result frame delta, and no-op/failure signal. |
| `ACTION7` | `Ctrl+Z`, `Cmd+Z`, sometimes `Z` | Simple undo/correction channel. | Record whether it reverted state, changed hidden counters, or merely hid a bad exploration step. |
| `RESET` | `R`, explicit UI reset | Start-over command. | Store separately from attempt failure. Never mix it into training as a normal solving action. |

## Behavior Fields To Store Per Action

Every human or local AI step should be annotated with:

- `action`: canonical action name.
- `keys`: human-facing controls, if relevant.
- `coordinate`: `{x,y}` for `ACTION6`; omitted otherwise.
- `beforeStateHash` and `afterStateHash`.
- `availableActionsBefore` and `availableActionsAfter`.
- `changedCellsSummary`: count and rough regions/colors changed.
- `actorDelta`: inferred player/object movement, if detectable.
- `targetObject`: clicked or interacted object/color/region, if detectable.
- `progressSignal`: `none`, `local_progress`, `level_completed`, `game_completed`.
- `failureSignal`: `none`, `game_over`, `auto_reset`, `budget_exhausted`, `invalid_action`.
- `noOp`: true when state hash and visible frame do not change.
- `hypothesisBefore`: what the player or AI expected.
- `observationAfter`: what actually happened.
- `confidence`: low/medium/high, based on evidence.
- `saltInsertionCandidate`: whether this action exposed a place where a
  deterministic hidden salt could change behavior without breaking replay.

## Local AI Prompt For Action Annotation

Use this prompt when the local learner observes one ARC action at a time. The
prompt is designed for strict JSON output and should be paired with the current
frame, previous frame, action metadata, and replay hashes.

```text
You are annotating ARC-AGI gameplay for local adapter training.

The action labels are only input channels. Do not assume ACTION1 always means
spatial up, ACTION5 always means interact, or ACTION6 always means click-to-move.
Infer behavior only from the before/after observation.

Known canonical actions:
- ACTION1: W / ArrowUp, simple action, often up-like.
- ACTION2: S / ArrowDown, simple action, often down-like.
- ACTION3: A / ArrowLeft, simple action, often left-like.
- ACTION4: D / ArrowRight, simple action, often right-like.
- ACTION5: Space / F / Enter, primary simple action.
- ACTION6: coordinate click/touch with x,y data.
- ACTION7: undo/correction.
- RESET: explicit restart, not a normal attempt action.

Return exactly one JSON object:
{
  "action": "ACTION1|ACTION2|ACTION3|ACTION4|ACTION5|ACTION6|ACTION7|RESET",
  "controlLabel": "short human-facing button description",
  "coordinate": null,
  "intentHypothesis": "what the actor appeared to test",
  "observedEffect": "what changed after the action",
  "changedCellsSummary": "compact description of visible frame changes",
  "availableActionChange": "unchanged|expanded|restricted|unknown",
  "progressSignal": "none|local_progress|level_completed|game_completed",
  "failureSignal": "none|game_over|auto_reset|budget_exhausted|invalid_action",
  "noOp": true,
  "hiddenRuleHypothesis": "rule suggested by this action, or unknown",
  "disconfirmingEvidence": "what would disprove the hypothesis",
  "saltInsertionCandidate": {
    "candidate": "none|action_remap|object_role|target_transform|permission_gate|delayed_effect|undo_semantics|budget_rule|mode_toggle",
    "why": "why this slot could or could not support decentralized salt"
  },
  "aiPriorKnowledgeRisk": "low|medium|high",
  "teacherQuestion": "one concise question for a human teacher if uncertain",
  "confidence": "low|medium|high"
}

For ACTION6, set coordinate to {"x": <number>, "y": <number>}. For other
actions, use null.

Prefer uncertainty over invented certainty. If the result is unclear, set
confidence to low, write what was tested, and propose the next discriminating
action.
```

## Saltable Base-Layer Slots

These are the most promising places to add decentralized salt while keeping
attempts replay-verifiable:

- Action remap: a session salt maps `ACTION1..ACTION7` to a hidden semantic
  role for that game instance.
- Object role remap: visible colors/shapes keep their pixels but receive salted
  hidden roles such as key, hazard, switch, lock, timer, decoy, or goal.
- Target transform: `ACTION6` coordinates are deterministically transformed
  into local grid targets, regions, or object handles.
- Permission gate: an action only works after a salted precondition is met.
- Mode toggle: `ACTION5` or a click changes the meaning of later actions.
- Delayed effect: an action appears neutral until a later trigger reveals its
  consequence.
- Undo semantics: `ACTION7` may revert, branch, spend a resource, or expose a
  clue, but this must be very carefully signaled to humans.
- Budget rule: action cost, cooldown, or failure thresholds vary by salted rule.

The salt should be committed before the session and revealed only when replay
verification requires it. The client must not be able to choose or mutate salt
after seeing human or AI attempts.

## Local Action Lab Editor

A local editor for new gameplay actions should avoid arbitrary code from peers.
Use a deterministic rule DSL with a small set of replayable primitives.

Suggested UI flow:

1. Action vocabulary: choose an existing action channel or propose an extension
   such as `ACTION8` for future protocol work.
2. Trigger: choose keyboard, primary button, click coordinate, undo, timer, or
   object contact.
3. Preconditions: select visible object/color/region state, inventory/mode,
   previous action pattern, action budget, or salted hidden role.
4. Effect: move object, recolor cells, rotate object, toggle mode, reveal clue,
   block movement, complete level, fail level, or emit observation marker.
5. Salt slots: mark which constants can be committee-salted per session.
6. Test bench: run deterministic fixtures against the 25 public game families.
7. AI novelty check: ask local AI to classify whether the proposed behavior is
   already expressible with the known action base layer.
8. Human playtest: let local players try the rule without seeing its DSL.
9. Package: export a signed `idena-arc-action-rule-proposal-v1` artifact.

The editor should feel like assembling rule cards, not writing code. Each card
should show an icon, a compact label, and a before/after preview. The advanced
JSON manifest stays hidden unless the user opens it.

## Rule Proposal Artifact Sketch

```json
{
  "protocol": "idena-arc-action-rule-proposal-v1",
  "createdAt": "2026-04-30T00:00:00.000Z",
  "producerAddress": "0x...",
  "baseGameFamilies": ["ls20", "ft09"],
  "actionChannels": ["ACTION5", "ACTION6"],
  "dslVersion": "idena-arc-rule-dsl-v0",
  "ruleCards": [
    {
      "trigger": {"action": "ACTION6", "target": "saltedRole:key"},
      "preconditions": [{"type": "mode", "value": "default"}],
      "effects": [{"type": "toggleMode", "value": "armed"}],
      "observableFeedback": "target cell flashes for one frame"
    }
  ],
  "saltSlots": [
    {"name": "keyRoleColor", "type": "objectRole"},
    {"name": "armedAction", "type": "actionRemap"}
  ],
  "determinismTests": [],
  "localAiNoveltyReportHash": "sha256:...",
  "humanPlaytestReportHash": "sha256:...",
  "payloadHash": "sha256:...",
  "signature": {"scheme": "idena-node-signature", "value": "..."}
}
```

## Committee And Session Flow

Long-session rule proposal:

1. A player creates a local rule proposal and signs its manifest.
2. Other players import it manually or by CID, run the same deterministic test
   bench, and add signed review attestations.
3. Local AI novelty reports are included as evidence, but never decide alone.
4. A committee approves a proposal only if humans understand it, like it, and
   the AI novelty checks do not trivially solve it with existing behavior.

Short-session application:

1. A future session commits to a set of approved rule manifests and salt hashes.
2. Shortly before play, the selected manifest and minimum needed salt reveal are
   distributed to validators.
3. The game is played with deterministic salted behavior.
4. Replay verification uses the manifest, salt reveal, signed trace, and final
   state hashes.

This keeps the behavior unknown to most of the network until it matters, while
still making the result replayable and auditable after the session.

## Security Constraints

- Do not execute arbitrary peer-supplied code in the game client.
- Keep the first version to a deterministic DSL with bounded primitives.
- Canonicalize, hash, and identity-sign every proposal, review, and selected
  manifest.
- Treat local AI novelty checks as advisory evidence only.
- Keep generated salts outside renderer state until reveal is required.
- Never upload drafts automatically; proposal sharing remains explicit.
- Store failed, unfinished, reset, human, and AI attempts distinctly so training
  cannot confuse reset with failure.
