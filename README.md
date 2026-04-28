# IdenaArc

IdenaArc is a rehearsal-first research fork of
[IdenaAI](https://github.com/ubiubi18/IdenaAI) for decentralized ARC-style game
generation, replay-verifiable human/agent traces, and local AI annotation.

The project explores a narrow MVP:

1. bind a timed game session to an Idena address or rehearsal identity
2. exchange P2P-style salt commitments and reveals through a local relay
3. derive a final seed from session data, generator hash, salts, and entropy
4. generate one deterministic ARC-style game just in time
5. record actions, score, and feedback
6. prove the result through a trusted local signer or tx/IPFS anchor
7. replay the trace and verify the score independently
8. store verified annotations locally for later training experiments

This repository is not production software. It is an early research prototype
with no warranties of correctness, security, availability, or fitness for any
purpose. Do not use it with production funds, production rewards, mainnet
validation flows, or identities you cannot afford to reset.

The end-to-end flow is expected to take more work before it is reliable. Expect
days to weeks of iteration, and possibly longer than a month, before the full
rehearsal/game/replay/training pipeline works smoothly for outside testers.

IdenaArc must not modify Idena mainnet validation, train on live validation
flips, automate live validation play, or depend on production rewards. Use
rehearsal/devnet identities or throwaway addresses only.

## Current MVP

The first build slice is inside the Electron app at `/idena-arc`.

- local file-backed relay for session manifests and salt commit/reveal data
- deterministic `final_seed` derivation using canonical JSON and SHA-256
- Python sidecar at `python/idena_arc/arc_sidecar.py`
- ARCEngine-shaped sidecar boundary with a deterministic local-grid fallback
- playable Electron game board with keyboard, click, undo, reset, timer, and
  automatic trace recording
- ARC-style action metadata is stored with each replayed action (`ACTION1` to
  `ACTION7`) while the UI keeps readable local action names such as
  `move_right`
- ARC-style recording bundle output: each submitted trace carries a
  timestamped JSONL replay stream (`recording.entries` plus `recording.jsonl`)
  so gameplay can be inspected separately from signature and score verification
- standalone `.recording.jsonl` files are written next to local trace bundles
  using the ARC-style `{game_id}.{participant}.{max_actions}.{guid}` filename
  shape
- browser-demo mode on the raw Next dev URL so the board can be tested without
  Electron IPC; demo traces are replayed but intentionally unsigned
- no private-key entry in the renderer
- rehearsal devnet signatures through trusted main-process identity material
- external address proof through local-node `dna_sign` on loopback RPC, or a
  tx/IPFS anchor draft for later classical transaction / WASM-contract proof
- trace bundles stored under the Electron user data path in `idena-arc/`
- optional explicit IPFS upload through Idena RPC `ipfs_add`

The real ARCEngine / ARC-AGI environment module is the next generator target.
The bundled fallback keeps replay and verification testable even before Python
3.12, `arcengine`, and the optional `arc-agi` toolkit are installed.

ARC Prize's docs distinguish local engine play from online/swarm replays:
local toolkit play is useful for development, while official shareable replays
come from API or swarm runs. IdenaArc therefore stores its own ARC-style JSONL
recording in every local trace bundle instead of depending on official online
scorecards.

## Runtime

The app pins Node 24.15.0:

```bash
nvm use 24.15.0
npm install
npm start
```

If your shell defaults to another Node version, use `nvm` or call your local
Node 24.15.0 npm binary directly:

```bash
~/.nvm/versions/node/v24.15.0/bin/npm test
```

Optional ARCEngine work requires Python 3.12:

```bash
python3.12 -m venv .venv-idena-arc
. .venv-idena-arc/bin/activate
pip install -e python/idena_arc
```

To experiment with the open-source ARC-AGI Toolkit boundary:

```bash
pip install -e "python/idena_arc[arc-agi]"
```

The fallback sidecar and its tests run with the system Python 3.9.

## Patched rehearsal node

The rehearsal devnet must not silently run an unpatched official `idena-go`
binary. The app pins the node version to `v1.1.2`, but rehearsal startup now
requires an IdenaArc patched build marker. If the marker is missing, the app
builds the node from the bundled patched source in `idena-go/` using the local
`idena-wasm-binding/` artifacts.

For a reproducible clone:

```bash
git clone https://github.com/ubiubi18/IdenaArc-p2p
cd IdenaArc-p2p
nvm use 24.15.0
npm install
npm start
```

The clone must include `idena-go/` and `idena-wasm-binding/`. If those are
published as submodules later, clone with `--recursive`. If the patched
`idena-go` checkout is stored elsewhere, set:

```bash
IDENA_NODE_SOURCE_DIR=/path/to/patched/idena-go npm start
```

Future patched binary releases can be used by setting
`IDENA_ARC_NODE_RELEASE_URL` to the GitHub release API URL that contains the
patched platform assets. Official upstream binaries remain disabled for
rehearsal unless `IDENA_NODE_ALLOW_UPSTREAM_BINARY=1` is set explicitly.

## Checks

```bash
npm test -- main/idena-arc
npm run test:idena-arc:python
npm run build:renderer
```

## References

- [Idena validation protocol](https://docs.idena.io/docs/developer/validation)
- [Idena IPFS upload](https://docs.idena.io/docs/developer/ipfs/upload)
- [ARCEngine](https://github.com/arcprize/ARCEngine)
- [arcengine on PyPI](https://pypi.org/project/arcengine/)
- [ARC-AGI Toolkit](https://github.com/arcprize/ARC-AGI)
- [ARC-AGI Toolkit docs](https://docs.arcprize.org/toolkit/overview)
- [ARC recordings and replays](https://docs.arcprize.org/recordings)
- [ARC action interface](https://docs.arcprize.org/actions)
