# IdenaArc Hidden-Rule Adapter Pipeline

This document defines the target pipeline for decentralized hidden-rule games,
human/AI annotations, local adapter training, peer adapter calls, global
backtesting, and occasional base-model retraining.

It is a protocol target, not a production claim.

## Objective

Generate short interactive games whose full rules are unknown until a session
opens. Humans and local AI agents play the same fresh task under time pressure.
Afterwards, humans annotate:

- which hidden rules they discovered
- what observations made the rules recognizable
- where the local AI failed, looped, or gave up
- which concepts should be trained as reusable capabilities

The goal is not to make games impossible for AI by secrecy. The goal is to force
agents to learn compact transferable concepts instead of replaying old logs,
brute-forcing one generator family, or memorizing action sequences.

## Actors

- **Generator author**: publishes deterministic generator code and metadata.
- **Entropy contributors**: commit/reveal salts for one session.
- **Human player**: plays and annotates the hidden rules after the session.
- **Local AI player**: attempts the same game and self-annotates failures.
- **Local trainer**: builds user-private adapters from verified traces.
- **Backtest peers**: evaluate submitted adapters on hidden seeds or held-out
  generator variants.
- **Aggregator**: selects approved adapters or training pools for later global
  model updates.
- **Adapter serving peer**: exposes selected local adapters to other identities
  under quota and policy controls.

## Session Flow

1. Commit generator hash/CID and version.
2. Collect peer salt commitments.
3. Reveal salts near `T0`.
4. Derive `final_seed` from session id, generator, salts, entropy, and nonce.
5. Generate the game instance at `T0`.
6. Human and local AI play inside the fixed time window.
7. Store replay-verified traces, JSONL recordings, and agent logs locally.
8. Human annotates their own play and the local AI play.
9. Local trainer builds or updates compact adapters.
10. Optional: submit adapter manifest for peer backtesting.
11. Optional: approved adapters contribute to global adapter/base-model updates.

## Hidden-Rule Game Requirements

Generators should produce seed-dependent hidden mechanics, not only
seed-dependent maps.

Recommended rule dimensions:

- object affordances
- transformation rules
- causal triggers
- delayed effects
- compositional subgoals
- misleading local optima
- sparse reward transitions
- visual or symbolic invariants
- rules that change by level or phase

Avoid publishing artifacts that reveal the final rule instance before the
session cutoff. Public artifacts before `T0` should be limited to generator hash,
version, schema, and high-level capability family.

## Trace Artifacts

Per participant:

- `trace`: normalized action stream, feedback, score, state hashes
- `recording.jsonl`: replayable state/action/score stream
- `agent.log.txt`: append-only text stream for coding-agent analysis
- `humanRuleAnnotation`: post-session human explanation of discovered rules
- `aiSelfAnnotation`: local AI explanation of hypotheses, failures, and stop
  condition
- `localAiGameplayAnnotation`: local AI gameplay explanation plus a
  Noemon-style structured summary, invariants, action policy, and rejected
  alternatives
- `humanReplayAnnotation`: human replay explanation plus the same structured
  fields for replay/audit training
- `comparisonAnnotation`: human comparison between human play and AI play
- `frameContext`: compact replay-derived frame metadata, action trace, and
  milestone snapshots for training without rereading the full JSONL
- `annotationValidation`: deterministic local checks that score whether the
  annotation has enough explanation, policy, evidence, and replay consistency
- `trainingExample`: local-only compact adapter-training example derived from a
  finalized verified annotation

These are post-session training artifacts. They must not be exposed to other
participants before the play window and submission cutoff close.

## ARC-AGI Public Fixtures

The MVP can use public ARC-AGI games such as `ls20`, `ft09`, and `vc33` as
annotation fixtures when the optional official `arc-agi` Python runtime is
installed. This integration is runtime-based. IdenaArc should not vendor
downloaded ARC-AGI game source files unless the copied file tree carries license
metadata that permits redistribution.

Public ARC-AGI fixtures are useful for testing human annotation UX, but they do
not provide IdenaArc's decentralized hidden-seed property by themselves.

## Human Rule Annotation

Minimum fields:

- `session_id`
- `game_id`
- `participant_id`
- `rule_hypotheses`
- `confirmed_rules`
- `evidence_events`
- `recognition_moment`
- `wrong_hypotheses`
- `strategy_change`
- `difficulty`
- `teaching_notes`

The useful training target is the compact explanation: what concept let the
human stop brute-forcing and start solving.

## Noemon-Style Annotation Loop

IdenaArc stores a light-weight version of the Noemon reasoner/validator pattern
for both local-AI gameplay and human replay annotations:

- `summary`: concise current rule or policy hypothesis
- `gridSize`: how size/frame dimensions matter, if known
- `invariants`: preserved facts observed across replay states
- `ruleHypothesis` / `transformationAlgorithm`: explicit causal rule text
- `actionPolicy`: how the next action is selected from the replay state
- `rejectedAlternatives`: hypotheses that were tested and ruled out
- `evidenceEvents`: replay-linked moments supporting the hypothesis

The local deterministic validator does not replace model judging. It prepares
replay-prefix tasks and records whether action hints in the explanation are
consistent with the verified trace. Later model validators can consume the same
record and compare predicted actions through sidecar replay.

## AI Self-Annotation

The local AI should produce a separate post-run report:

- attempted hypotheses
- evidence used
- actions that reduced uncertainty
- repeated loops
- failed abstractions
- final known state
- reason for stopping or giving up
- proposed missing capability

This report should be generated after the session, from the local replay and
agent log. It should not receive privileged future-session data.

## Local Adapter Training

Local adapters are user-private by default.

Training inputs:

- verified human traces
- verified local AI traces
- human rule annotations
- AI self-annotations
- comparison annotations
- rejected hypotheses and corrections
- compact frame context and replay-prefix validation tasks

Training objective:

- learn reusable capabilities such as spatial matching, causal rule discovery,
  delayed-effect tracking, subgoal decomposition, and uncertainty reduction
- minimize action count on unseen seeds
- improve explanation quality, not only final score

Adapters should be small, capability-scoped, and manifest-bound.

## Peer Adapter Calls

Peers may expose selected local adapters as services, not raw private training
data.

Request policy:

- requester proves Idena identity
- request references adapter manifest hash and task capability tag
- serving peer enforces quotas and local allow/block policy
- no request may ask for live hidden session answers
- responses must include adapter id, model hash, confidence, and traceable
  output metadata

Use cases:

- ask another peer's visual-matching adapter to analyze a post-session trace
- compare local causal-rule hypotheses against a remote adapter
- run backtests on held-out seeds without sharing private annotations

## Backtesting

Adapters submitted for network consideration are evaluated by random or
committee-selected peers.

Backtest inputs:

- hidden seeds
- held-out generator variants
- frozen benchmark manifests
- action-count budget
- explanation-quality rubric

Backtest outputs:

- `adapter_hash`
- `base_model_hash`
- `benchmark_manifest_hash`
- `score`
- `action_count`
- `completion_rate`
- `rule_explanation_score`
- `failure_modes`
- evaluator signatures

An adapter that only memorizes public logs should fail held-out variants or show
poor explanation transfer.

## Global Update Path

The global path should be annotation-led first, adapter-led second.

1. Collect verified annotation pools.
2. Backtest submitted adapters.
3. Rank adapters by hidden-seed performance and explanation quality.
4. Select training pools and adapter reports.
5. Periodically train a new global adapter or base-model checkpoint.
6. Publish signed manifests and evaluation reports.
7. Distribute approved artifacts through identity-gated P2P transport.

Base-model retraining should be rare. Local adapters should absorb most
capability updates between global releases.

## Anti-Shortcut Rules

The system should make old replays useful for learning but insufficient for
fresh-session shortcutting:

- late seed reveal
- trace embargo until after cutoff
- identity-bound probing limits
- generator version rotation
- held-out rule compositions
- hidden-seed backtesting
- action-count and explanation-quality metrics
- no live-session remote adapter answer market

See [anti-shortcut-policy.md](anti-shortcut-policy.md).

## MVP Implementation Order

1. Store human rule annotations next to trace bundles.
2. Store AI self-annotations next to local AI traces.
3. Add local adapter manifest format for capability-scoped adapters.
4. Add local training stub that consumes verified traces and annotations.
5. Add peer backtest manifest and signed result format.
6. Add adapter service discovery with identity-gated request quotas.
7. Add committee/global aggregation flow after local backtesting is stable.
