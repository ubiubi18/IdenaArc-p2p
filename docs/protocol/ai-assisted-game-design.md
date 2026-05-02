# AI-Assisted P2P Game Design

This note starts the protocol path for natural-language game design in
IdenaArc. The main decision is deliberately narrow: AI can help humans turn
plain language into candidate rule cards, but AI output is not the authority
for live gameplay.

## Important For IdenaArc

- AI is a compiler assistant. It drafts deterministic rule cards from human
  language; it does not run inside the final game.
- Any private AI provider may be used for authoring. Local AI is preferred for
  privacy, but cloud providers are acceptable if the human accepts that drafting
  risk.
- The publishable artifact is the human-signed
  `idena-arc-game-ingredient-v0`, not the model prompt or raw model output.
- Final games are constituted at short-session start from multiple signed
  ingredients, salt reveals, and session entropy.
- The anti-frontrun unit is a non-blocking ingredient commitment. Before `T0`,
  peers see only interface metadata such as ports, budget, and capability tags,
  not concrete rule constants or object roles.
- The game must be generatable without any late peer delivery. If a contributor
  does not replicate an optional payload before the pre-constitution cutoff, the
  canonical generator fills the missing slot from final entropy.
- Peers verify deterministic DSL, hashes, signatures, salts, and replay proofs.
  They do not need to trust another peer's model or prompt history.

## Authoring Flow

1. A verified human writes a rule idea in natural language.
2. The local client asks an AI compiler to return strict JSON using
   `idena-arc-rule-dsl-v0` concepts.
3. The client validates the draft as `idena-arc-design-draft-v0`.
4. The human edits cards through the Game Designer UI until deterministic checks
   pass.
5. The human signs only the compiled ingredient artifact.
6. The ingredient can be shared as a private-by-default P2P artifact and later
   committed into a short-session constitution.

Drafts can include prompts and provider metadata, but those are local
traceability records. They should not be required for consensus.

## Ingredient Card Families

The first DSL should support partial ingredients, not full games:

- **Action cards**: define what an action channel can do.
- **Template-overlay cards**: bias generator-owned templates with abstract
  ports, action budget, and public compatibility metadata.
- **Path cards**: add route fragments, locks, shortcuts, loops, hazards, and
  slow or fast lanes.
- **Path-dependent action cards**: change actions based on route segment,
  visited regions, inventory, prior action sequence, mode, or salted role.
- **Object-role cards**: assign hidden roles to colors, shapes, regions, or
  symbols.
- **Scoring cards**: define progress, level completion, failure, budget, and
  recovery signals.
- **Salt-slot cards**: mark constants that are resolved only through
  commit/reveal at constitution time.

Cards must declare what they provide, what they require, their complexity, their
action-budget impact, and their fallback behavior.

## Non-Blocking Ingredient Commitments

People should not publish complete games before a session, and the session must
not depend on a peer showing up at start time. Contributors publish commitments
to optional overlays that can bias a generator-owned template graph. The overlay
is never a required map sector; it is a hint that can be ignored or replaced.

Before `T0`, an ingredient commitment exposes only:

- size class or template family
- entry and exit ports
- min/max action budget
- required capability tags
- conflict tags
- fallback behavior
- payload hash, if a concrete payload was already replicated before cutoff

The canonical generator must be able to fill every slot without the optional
payload. If a payload is available before the cutoff, final entropy may select
it as an overlay. If it is missing, final entropy selects a generator-catalog
replacement with the same public interface.

The best policy is that a player should not play a game containing their own
concrete ingredient. If that is too strict for early experiments, the
constitution should limit each identity to one small overlay and rely on salted
placement, role remapping, and generator-catalog replacement so no author can
pre-solve the full game.

## Constitution Flow

The game exists only after constitution:

1. Collect ingredient commitments, public interfaces, and participant salt
   commitments.
2. Close ingredient payload replication before the pre-constitution cutoff.
3. Reveal salts near `T0`.
4. Derive final seed from session id, ingredient set hash, accepted salts,
   network/session entropy, and nonce.
5. Generate a complete baseline game from the canonical generator.
6. Deterministically apply available compatible overlays.
7. Fill missing or incompatible slots from generator catalog by predefined
   fallback rules.
8. Run solvability and replay checks.
9. Publish `idena-arc-game-constitution-v0` at short-session start.

This prevents a single participant from knowing or controlling the final game
while preserving auditability after the session.

## Compiler Prompt Boundary

The AI compiler should be instructed to:

- return strict JSON only
- map ideas onto `ACTION1` through `ACTION7` and `RESET` first
- use deterministic triggers, preconditions, effects, and observable feedback
- mark salt slots instead of choosing final hidden constants
- include uncertainty and verifier warnings instead of inventing validity
- reject arbitrary code, timers without bounds, network calls, hidden model
  calls, and unbounded randomness

If a natural-language request cannot compile into bounded deterministic cards,
the correct result is a draft with `readyForSigning: false`.

## UI Start

The first Game Designer UI should add a natural-language box to the existing
Action Lab:

- write the desired rule or path behavior
- copy an AI compiler prompt for any private provider
- generate a local deterministic skeleton for review
- show salt-slot candidates and verifier warnings
- keep the advanced JSON visible only in expert mode

Later versions can call the configured local or cloud AI provider directly, but
the compiled and signed artifact shape should stay provider-independent.
