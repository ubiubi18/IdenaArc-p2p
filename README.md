# IdenaArc

Research fork of [IdenaAI](https://github.com/ubiubi18/IdenaAI) for
rehearsal-first ARC-style game sessions, P2P salt exchange, replay verification,
and local AI trace annotation.

Experimental research software, published in the spirit of open source
collaboration. It is not production-ready. Do not use it with mainnet
validation, production rewards, live validation automation, production funds, or
identities that cannot be reset.

## MVP Scope

- Electron page: `/idena-arc`
- local file-backed relay for session manifests, salt commits, and salt reveals
- canonical JSON + SHA-256 final seed derivation
- Python sidecar: `python/idena_arc/arc_sidecar.py`
- deterministic local-grid fallback generator/replayer
- optional ARC-AGI public game runtime fixtures (`ls20`, `ft09`, `vc33`) through
  the official `arc-agi` toolkit; downloaded game sources are not vendored
  unless their license metadata permits redistribution
- browser demo bridge for raw Next dev testing without Electron IPC
- signed result path through local node `dna_sign` or rehearsal devnet signer
- tx/IPFS proof-anchor draft mode; no renderer private-key input
- local trace bundle storage under Electron user data `idena-arc/`
- local hidden-rule annotations and local-only training-example exports
- optional explicit `ipfs_add` upload only

## Trace Artifacts

Each submitted trace can include:

- `recording.entries` and `recording.jsonl`
- standalone `{game_id}.{participant}.{max_actions}.{guid}.recording.jsonl`
- `agentLog.text`
- standalone `{game_id}.{participant}.{max_actions}.{guid}.agent.log.txt`
- `ACTION1`-`ACTION7` ARC-style action metadata
- hashes for replay, JSONL, agent log, and result payloads
- `humanRuleAnnotation`, `aiSelfAnnotation`, and `comparisonAnnotation`
- `idena-arc-training-example-v0` records from finalized verified annotations

Replay and agent logs are post-session training/audit artifacts. They must not
be released before the play window and submission cutoff close. See
[`docs/protocol/anti-shortcut-policy.md`](docs/protocol/anti-shortcut-policy.md).
Annotations are private by default and are never uploaded automatically.

## Runtime

Node is pinned to `24.15.0`.

```bash
nvm use 24.15.0
npm install
npm run setup:sources
npm start
```

Fallback Python tests run on system Python. Optional ARCEngine work should use
Python 3.12:

```bash
python3.12 -m venv .venv-idena-arc
. .venv-idena-arc/bin/activate
pip install -e python/idena_arc
pip install -e "python/idena_arc[arc-agi]"
```

## Rehearsal Node

Rehearsal devnet requires the IdenaArc patched `idena-go` build marker. The app
builds from pinned source mirrors when the patched binary is missing. The source
mirrors are not meant to be hand-edited in this repo; refresh them with:

```bash
npm run setup:sources
```

Override source path:

```bash
IDENA_NODE_SOURCE_DIR=/path/to/patched/idena-go npm start
```

Official upstream binaries are disabled for rehearsal unless explicitly allowed:

```bash
IDENA_NODE_ALLOW_UPSTREAM_BINARY=1 npm start
```

For deliberate real-session testing from Terminal, use an explicit real app
profile and safety override:

```bash
IDENA_DESKTOP_USER_DATA_DIR="$HOME/Library/Application Support/IdenaArc" \
IDENA_DESKTOP_ALLOW_DEV_SESSION_AUTO=1 \
npm start
```

## Large bundled artifacts

Large source/runtime artifacts are generated locally from pinned mirrors and are
ignored by git. Packaged builds include only the prepared `idena-go` binary from
`build/node/current`; do not add new large tracked artifacts outside the
release-artifact allowlist.

## Checks

```bash
npm test -- main/idena-arc
npm run test:idena-arc:python
npm run build:renderer
npm run audit:privacy
```

## References

- [Protocol schema](docs/protocol/idena-arc-trace-bundle.schema.json)
- [Hidden-rule annotation schema](docs/protocol/idena-arc-hidden-rule-annotation.schema.json)
- [Training example schema](docs/protocol/idena-arc-training-example.schema.json)
- [Anti-shortcut policy](docs/protocol/anti-shortcut-policy.md)
- [Hidden-rule adapter pipeline](docs/protocol/hidden-rule-adapter-pipeline.md)
- [ARC-AGI-3 / HRM design note](docs/protocol/arc-agi-3-hrm-design-note.md)
- [ARC-AGI-3 agents compatibility note](docs/protocol/arc-agi-3-agents-compatibility-note.md)
- [Idena validation](https://docs.idena.io/docs/developer/validation)
- [Idena IPFS upload](https://docs.idena.io/docs/developer/ipfs/upload)
- [ARCEngine](https://github.com/arcprize/ARCEngine)
- [ARC-AGI Toolkit docs](https://docs.arcprize.org/toolkit/overview)
- [ARC recordings](https://docs.arcprize.org/recordings-replays)
- [ARC actions](https://docs.arcprize.org/actions)
