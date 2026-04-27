ARC-AGI Training Pipeline

P2P-pipeline for decentralised ARC-AGI AI training.

To be build on top of a fork of https://github.com/arcprize/ARCEngine , while also using https://docs.idena.io/docs/developer/validation flows and https://docs.idena.io/docs/developer/ipfs/upload ipfs network

To be integrated into https://github.com/ubiubi18/IdenaAI_Benchmarker

The idea: short human-play sessions generate reproducible traces from p2p-salted procedural ARC-style games.

These traces can help train open-source adapters for ARC-style interactive reasoning agents.

```text
Forking the Idena identity / session layer
        ↓
Salted procedural task generator
        ↓
ARC-AGI-3 local environment
        ↓
Human web player / agent player
        ↓
Replay + trace storage
        ↓
Local adapter training
        ↓
Federated aggregation
        ↓
Open-source packaged ARC agent
        ↓
(optional) individual Kaggle / ARC Prize submissions of participants are possible, since network security is in symbiosis with specialized ARC-AGI adapter training
```

more to come...
