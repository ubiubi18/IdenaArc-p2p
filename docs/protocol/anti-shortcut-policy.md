# IdenaArc Anti-Shortcut Policy

IdenaArc intentionally records rich post-session traces because they are useful
for replay audits, local annotation, and later federated learning. The same
replay and `log.txt` artifacts can also make future tasks easier for coding
agents that search old logs. This document defines the MVP posture for keeping
logs useful without turning them into pre-session shortcuts.

## Threat Model

Assume an agent can read all public historical traces, grep large uncompressed
logs, write analysis scripts, and replay old games offline. The goal is not to
hide completed sessions forever. The goal is to prevent advance knowledge of a
new session instance and to make success require transferable conceptual
reasoning rather than memorizing a fixed action sequence or brute-forcing one
generator family.

IdenaArc does not claim AI resistance from obscurity. Published logs are
training data and pressure-test data. If agents learn a game family from them,
that family has become easier and should be rotated or made more compositional.

## Session Controls

- Final seeds are derived only after salt reveal and network/session entropy.
- Generated instances are released at the play window, not during the commit
  phase.
- Raw traces, JSONL recordings, and agent `log.txt` files are embargoed until
  after the submission cutoff.
- Identity-bound rate limits cap how many fresh instances one address can probe
  before or during a session.
- Rehearsal/devnet runs must keep production validation and rewards out of scope.

## Trace Release Controls

- The default local artifact is private user data. Uploading to IPFS or sharing
  a bundle must be explicit.
- Public replay bundles should include session timing, generator hash, final seed
  hash, action count, score, and replay result so they are useful for audit.
- Public replay bundles should not be published before the play window closes.
- For active benchmark families, public releases may be delayed, sampled, or
  aggregated while private verified traces remain available for local/federated
  training.

## Generator Controls

- Use generator families with seed-dependent mechanics, layouts, object
  semantics, and goal conditions, not just seed-dependent maps.
- Rotate generator versions when public agents become efficient at a family.
- Keep held-out families or held-out composition rules for evaluation.
- Measure action efficiency against human baselines and known agent baselines.
- Treat strong agent performance as feedback that the family needs evolution,
  not as proof that identity or timing failed.

## ARC-AGI-3 Benchmark Hygiene

ARC-AGI-3-style evaluation is interactive. A good result can come from a better
exploration loop or environment-specific adaptation without proving broad
reasoning transfer. IdenaArc should therefore label adapter gains by whether
they transfer to hidden seeds and held-out generator variants, or whether they
mainly reflect scripted probing, public-fixture familiarity, or trace
memorization. See
[arc-agi-3-hrm-design-note.md](arc-agi-3-hrm-design-note.md).

## Federated Learning Boundary

The federated path should reward conceptual transfer without leaking fresh
session answers:

- verified local traces can train local adapters after the session
- shared metadata can include scores, action counts, generator hashes, and model
  reports
- raw gradients are out of scope for the MVP
- adapter evaluations should use hidden seeds or held-out generator variants
- aggregation should prefer evaluation reports and signed adapter manifests over
  live-session action suggestions

## Agent Log Semantics

The `.agent.log.txt` artifact is a post-session training and audit artifact. It
is deliberately simple: one append-only text stream with frame, state hash,
action, ARC action name, score, and score delta per step. It is not an allowed
input to participants before or during the same session.
