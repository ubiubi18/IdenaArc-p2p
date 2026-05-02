# ARC-AGI-3 and HRM Analysis Design Note

This note records how the ARC Prize HRM analysis should shape IdenaArc's
ARC-AGI-3-facing design.

## Decision

The HRM analysis is relevant to ARC-AGI-3, but it should be treated as a
benchmark-hygiene warning rather than as a model architecture recommendation.

Do not import HRM as a first-class dependency for IdenaArc. Instead, preserve
the lesson that strong benchmark numbers can come from outer-loop refinement,
augmentation, and task-specific adaptation rather than from broadly
transferable reasoning.

## Source Context

- ARC Prize's HRM analysis repo:
  <https://github.com/arcprize/hierarchical-reasoning-model-analysis>
- ARC Prize's HRM findings:
  <https://arcprize.org/blog/hrm-analysis>
- ARC-AGI-3 competition page:
  <https://arcprize.org/competitions/2026/arc-agi-3>
- ARC-AGI-3 technical report:
  <https://arxiv.org/abs/2603.24621>

ARC Prize's HRM analysis found that the architecture itself was not the main
driver of ARC-AGI-1 performance. The larger drivers were outer-loop refinement,
training-time augmentation, and task-specific adaptation around the evaluation
tasks.

ARC-AGI-3 changes the benchmark shape from static grids to interactive
turn-based environments. That makes the HRM lesson more important, not less:
IdenaArc must separate genuine transferable capability from performance created
by scripted exploration, repeated retries, environment-specific traces, or
adapter memorization.

## Design Implications

IdenaArc should treat ARC-AGI-3-style games as interactive hidden-rule systems:

- score action efficiency, not only completion
- preserve hidden seeds and held-out generator variants
- distinguish training-time adaptation from inference-time policy quality
- log exploration strategy separately from final action sequence
- report whether success came from reusable rules, brute-force probing, or
  trace-specific memorization
- require replay-verifiable traces for any claimed improvement
- avoid letting public logs, generated fixtures, or post-session annotations
  become inputs to the same live session

## Adapter Evaluation Policy

Adapter reports should include these labels:

- `transfer_candidate`: the adapter improves held-out seeds or held-out
  generator variants without seeing their post-session traces
- `environment_specific`: the adapter improves only a known game family or
  specific public fixture
- `exploration_script`: the adapter mainly changes the probing policy, action
  order, or retry budget
- `trace_memorization_risk`: the adapter's gain disappears when replay logs,
  sample ids, or fixed layouts are rotated

Only `transfer_candidate` results should be candidates for broader P2P
distribution or global update pools.

## Practical Rule

For ARC-AGI-3 work, IdenaArc should optimize the loop around observation,
hypothesis formation, action, feedback, and revision. It should not optimize for
static answer replay. Architecture changes are secondary until the evaluation
loop proves that gains survive hidden seeds, held-out variants, and replay
audits.
