const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const {createIdenaArcManager} = require('./manager')
const {
  privateKeyToAddress,
  signIdenaMessageWithPrivateKey,
} = require('./crypto')

describe('idena-arc manager', () => {
  const privateKey =
    '0x0202020202020202020202020202020202020202020202020202020202020202'
  const address = privateKeyToAddress(privateKey)
  let baseDir
  let manager

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'idena-arc-test-'))
    manager = createIdenaArcManager({
      baseDir,
      pythonCommand: process.env.PYTHON || 'python3',
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    })
  })

  afterEach(async () => {
    await fs.remove(baseDir)
  })

  it('runs a local relay session through signed replay verification', async () => {
    const created = await manager.createSession({
      participantId: 'alice',
      playDurationMs: 10000,
    })
    const committed = await manager.commitSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
    })

    await manager.revealSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
      salt: committed.salt,
    })

    const seed = await manager.computeFinalSeed({
      sessionId: created.sessionId,
      reveals: [{participantId: 'alice', salt: committed.salt}],
    })
    const generated = await manager.generateGame({
      sessionId: created.sessionId,
      reveals: [{participantId: 'alice', salt: committed.salt}],
    })
    const submitted = await manager.submitTrace({
      sessionId: created.sessionId,
      participantId: 'alice',
      signerPrivateKey: privateKey,
      actions: ['move_right', 'move_down'],
    })
    const verified = await manager.verifyTraceBundle({
      bundle: submitted.bundle,
    })

    expect(seed.finalSeedHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(generated.game.initialStateHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(submitted.bundle.verified).toBe(true)
    expect(submitted.bundle.recordingHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(submitted.bundle.recordingJsonlHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(submitted.bundle.recordingFilename).toMatch(/\.recording\.jsonl$/)
    expect(submitted.bundle.agentLogHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(submitted.bundle.agentLogFilename).toMatch(/\.agent\.log\.txt$/)
    expect(submitted.bundle.recording).toMatchObject({
      protocol: 'idena-arc-recording-v0',
      format: 'arc-style-jsonl-v0',
      gameId: created.sessionId,
    })
    expect(submitted.bundle.agentLog).toMatchObject({
      protocol: 'idena-arc-agent-log-v0',
      format: 'plain-text-log-v0',
      access: 'post-session-training-artifact',
      gameId: created.sessionId,
    })
    expect(submitted.bundle.agentLog.text).toContain(
      'release_policy: embargo-until-submission-cutoff'
    )
    expect(submitted.bundle.agentLog.text).toContain('action: move_right')
    expect(submitted.bundle.agentLog.text).toContain('arc_action: ACTION4')
    expect(submitted.bundle.agentLog.text).toContain('frame:\n')
    expect(submitted.bundle.recording.entries[0].data.full_reset).toBe(true)
    expect(
      submitted.bundle.recording.entries[1].data.action_input.data
    ).toMatchObject({
      action: 'move_right',
      arc_action: 'ACTION4',
      game_id: created.sessionId,
    })
    expect(submitted.bundle.recording.jsonl.trim().split('\n')).toHaveLength(
      submitted.bundle.recording.entries.length
    )
    await expect(
      fs.readFile(
        path.join(
          baseDir,
          'traces',
          created.sessionId,
          submitted.bundle.recordingFilename
        ),
        'utf8'
      )
    ).resolves.toBe(submitted.bundle.recording.jsonl)
    await expect(
      fs.readFile(
        path.join(
          baseDir,
          'traces',
          created.sessionId,
          submitted.bundle.agentLogFilename
        ),
        'utf8'
      )
    ).resolves.toBe(submitted.bundle.agentLog.text)
    expect(verified.ok).toBe(true)
    expect(verified.recordingMatches).toBe(true)
    expect(verified.agentLogMatches).toBe(true)

    const badHash = {
      ...submitted.bundle,
      recordingHash: `sha256:${'0'.repeat(64)}`,
    }
    const rejected = await manager.verifyTraceBundle({bundle: badHash})

    const staleRecording = {
      ...submitted.bundle,
      recording: {
        ...submitted.bundle.recording,
        entries: submitted.bundle.recording.entries.map((entry, index) =>
          index === 1
            ? {
                ...entry,
                data: {...entry.data, score: Number(entry.data.score) + 1},
              }
            : entry
        ),
      },
    }
    const staleRejected = await manager.verifyTraceBundle({
      bundle: staleRecording,
    })
    const staleAgentLog = {
      ...submitted.bundle,
      agentLog: {
        ...submitted.bundle.agentLog,
        text: submitted.bundle.agentLog.text.replace(
          'action: move_right',
          'action: move_left'
        ),
      },
    }
    const staleAgentRejected = await manager.verifyTraceBundle({
      bundle: staleAgentLog,
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.recordingMatches).toBe(false)
    expect(staleRejected.ok).toBe(false)
    expect(staleRejected.recordingMatches).toBe(false)
    expect(staleAgentRejected.ok).toBe(false)
    expect(staleAgentRejected.agentLogMatches).toBe(false)
  })

  it('stores private hidden-rule annotations and exports training examples only after final verification', async () => {
    const created = await manager.createSession({
      participantId: 'alice',
      playDurationMs: 10000,
    })
    const committed = await manager.commitSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
    })

    await manager.revealSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
      salt: committed.salt,
    })
    await manager.generateGame({
      sessionId: created.sessionId,
      reveals: [{participantId: 'alice', salt: committed.salt}],
    })

    const submitted = await manager.submitTrace({
      sessionId: created.sessionId,
      participantId: 'alice',
      signerPrivateKey: privateKey,
      actions: ['move_right', 'move_down'],
    })
    const draft = await manager.saveAnnotationBundle({
      status: 'draft',
      traceBundle: submitted.bundle,
      humanRuleAnnotation: {
        confirmedRules: 'The target is reached by moving on the grid.',
        recognitionMoment: {
          actionIndex: 1,
          description: 'The score increased after moving toward the target.',
        },
        capabilityTags: 'spatial-planning, causal-trigger',
      },
      aiSelfAnnotation: {
        failedAbstractions: 'The random baseline did not model distance.',
        stopReason: 'Action budget reached.',
      },
      comparisonAnnotation: {
        humanVsAiGap: 'The human used the visible target and obstacle.',
        capabilityTags: 'spatial-planning',
        suggestedAdapterTarget: 'grid-distance planner',
      },
    })
    const final = await manager.saveAnnotationBundle({
      ...draft.annotation,
      status: 'final',
      traceBundle: submitted.bundle,
      humanRuleAnnotation: draft.annotation.humanRuleAnnotation,
      aiSelfAnnotation: draft.annotation.aiSelfAnnotation,
      comparisonAnnotation: draft.annotation.comparisonAnnotation,
    })
    const verified = await manager.verifyAnnotationBundle({
      annotationBundle: final,
      traceBundle: submitted.bundle,
    })
    const dataset = await manager.exportTrainingDataset({
      annotationBundle: final,
    })

    expect(draft.acceptedForTraining).toBe(false)
    expect(final.annotationHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(final.acceptedForTraining).toBe(true)
    expect(final.privateByDefault).toBe(true)
    expect(final.uploaded).toBe(false)
    expect(final.trainingExample).toMatchObject({
      protocol: 'idena-arc-training-example-v0',
      access: 'local-only-private-by-default',
      traceHash: submitted.bundle.result.traceHash,
      recordingHash: submitted.bundle.recordingHash,
      agentLogHash: submitted.bundle.agentLogHash,
    })
    expect(verified).toMatchObject({
      ok: true,
      annotationHashMatches: true,
      acceptedForTraining: true,
      traceReplayVerified: true,
      recordingVerified: true,
      agentLogVerified: true,
    })
    expect(dataset).toMatchObject({
      protocol: 'idena-arc-training-dataset-export-v0',
      privateFieldsIncluded: false,
      exampleCount: 1,
    })
    expect(dataset.datasetHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(dataset.examples[0].capabilityTags).toContain('spatial-planning')

    const staleAnnotation = {
      ...final,
      annotation: {
        ...final.annotation,
        traceHash: `sha256:${'1'.repeat(64)}`,
      },
    }
    const rejected = await manager.verifyAnnotationBundle({
      annotationBundle: staleAnnotation,
      traceBundle: submitted.bundle,
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.annotationHashMatches).toBe(false)
  })

  it('uses external RPC adapters for identity and IPFS calls', async () => {
    const calls = []
    const rpcClient = {
      create: () => ({
        post: async (_url, body) => {
          calls.push(body)
          if (body.method === 'dna_epoch') {
            return {data: {result: {epoch: 12, currentPeriod: 'None'}}}
          }
          if (body.method === 'dna_identity') {
            return {data: {result: {state: 'Human'}}}
          }
          if (body.method === 'ipfs_add') {
            return {data: {result: {cid: 'bafytest'}}}
          }
          return {data: {result: null}}
        },
      }),
    }
    manager = createIdenaArcManager({
      baseDir,
      rpcClient,
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    })

    const identity = await manager.resolveIdentity({
      rpcUrl: 'http://127.0.0.1:9009',
      address,
    })
    const upload = await manager.uploadTraceBundle({
      rpcUrl: 'http://127.0.0.1:9009',
      bundle: {protocol: 'idena-arc-trace-bundle-v0', resultId: 'r1'},
    })

    expect(identity.identityStatus).toBe('Human')
    expect(upload.cid).toBe('bafytest')
    expect(calls.map((call) => call.method)).toEqual([
      'dna_epoch',
      'dna_identity',
      'ipfs_add',
    ])
  })

  it('allows rehearsal identity resolution before an identity exists', async () => {
    const calls = []
    manager = createIdenaArcManager({
      baseDir,
      rpcClient: {
        create: () => ({
          post: async (_url, body) => {
            calls.push(body)
            if (body.method === 'dna_epoch') {
              return {data: {result: {epoch: 12, currentPeriod: 'None'}}}
            }
            return {data: {result: null}}
          },
        }),
      },
      validationDevnet: {
        getConnectionDetails: () => ({
          url: 'http://127.0.0.1:9101',
          apiKey: 'devnet-key',
        }),
        getPrimarySignerDetails: () => {
          throw new Error('Primary rehearsal signer is unavailable.')
        },
      },
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    })

    const identity = await manager.resolveIdentity({
      adapter: 'rehearsal-devnet',
    })

    expect(identity).toMatchObject({
      ok: true,
      adapter: 'rehearsal-devnet',
      address: null,
      identity: null,
      identityStatus: null,
      unresolved: true,
      reason: 'rehearsal_identity_unavailable',
    })
    expect(calls.map((call) => call.method)).toEqual(['dna_epoch'])
  })

  it('marks external identity resolution unreachable when RPC transport fails', async () => {
    manager = createIdenaArcManager({
      baseDir,
      rpcClient: {
        create: () => ({
          post: async () => {
            throw new Error('fetch failed')
          },
        }),
      },
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    })

    const identity = await manager.resolveIdentity({
      rpcUrl: 'http://127.0.0.1:9009',
      address,
    })

    expect(identity).toMatchObject({
      ok: false,
      adapter: 'external',
      rpcReachable: false,
      error: 'Idena RPC is unavailable at http://127.0.0.1:9009: fetch failed',
    })
    expect(identity.hint).toContain('Rehearsal devnet adapter')
  })

  it('surfaces running rehearsal connection details in status', async () => {
    manager = createIdenaArcManager({
      baseDir,
      validationDevnet: {
        getStatus: async () => ({
          active: true,
          stage: 'running',
          primaryRpcUrl: 'http://127.0.0.1:22300',
        }),
        getConnectionDetails: () => ({
          url: 'http://127.0.0.1:22300',
          apiKey: 'devnet-key',
        }),
        getPrimarySignerDetails: () => ({
          adapter: 'rehearsal-devnet',
          address,
          privateKeyHex: privateKey,
        }),
      },
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    })

    await expect(manager.status()).resolves.toMatchObject({
      ok: true,
      recommendedAdapter: 'rehearsal-devnet',
      rehearsalDevnet: {
        active: true,
        primaryRpcUrl: 'http://127.0.0.1:22300',
      },
      rehearsalConnection: {
        adapter: 'rehearsal-devnet',
        url: 'http://127.0.0.1:22300',
        apiKey: 'devnet-key',
      },
      rehearsalSigner: {
        adapter: 'rehearsal-devnet',
        address,
      },
    })
  })

  it('uses local node dna_sign without accepting a renderer private key', async () => {
    const calls = []
    const rpcClient = {
      create: () => ({
        post: async (_url, body) => {
          calls.push(body)
          if (body.method === 'dna_getCoinbaseAddr') {
            return {data: {result: address}}
          }
          if (body.method === 'dna_sign') {
            return {
              data: {
                result: signIdenaMessageWithPrivateKey(
                  privateKey,
                  body.params[0],
                  body.params[1]
                ),
              },
            }
          }
          return {data: {result: null}}
        },
      }),
    }
    manager = createIdenaArcManager({
      baseDir,
      rpcClient,
      logger: {
        error: () => {},
        info: () => {},
        debug: () => {},
      },
    })

    const created = await manager.createSession({
      participantId: 'alice',
      playDurationMs: 10000,
    })
    const committed = await manager.commitSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
    })

    await manager.revealSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
      salt: committed.salt,
    })
    await manager.generateGame({
      sessionId: created.sessionId,
      reveals: [{participantId: 'alice', salt: committed.salt}],
    })

    const submitted = await manager.submitTrace({
      sessionId: created.sessionId,
      participantId: 'alice',
      rpcUrl: 'http://127.0.0.1:9009',
      proofMode: 'node-signature',
      actions: ['move_right', 'move_down'],
    })
    const verified = await manager.verifyTraceBundle({
      bundle: submitted.bundle,
    })

    expect(submitted.bundle.verified).toBe(true)
    expect(submitted.bundle.result.signature.type).toBe(
      'idena-node-dna-sign-v0'
    )
    expect(submitted.bundle.result.playerAddress).toBe(address)
    expect(verified.ok).toBe(true)
    expect(calls.map((call) => call.method)).toEqual([
      'dna_getCoinbaseAddr',
      'dna_sign',
    ])
  })

  it('stores tx-anchor proof drafts without marking identity verified early', async () => {
    const created = await manager.createSession({
      participantId: 'alice',
      address,
      playDurationMs: 10000,
    })
    const committed = await manager.commitSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
    })

    await manager.revealSalt({
      sessionId: created.sessionId,
      participantId: 'alice',
      salt: committed.salt,
    })
    await manager.generateGame({
      sessionId: created.sessionId,
      reveals: [{participantId: 'alice', salt: committed.salt}],
    })

    const submitted = await manager.submitTrace({
      sessionId: created.sessionId,
      participantId: 'alice',
      address,
      proofMode: 'tx-anchor',
      actions: ['move_right'],
    })

    expect(submitted.bundle.replayVerified).toBe(true)
    expect(submitted.bundle.verified).toBe(false)
    expect(submitted.bundle.result.identityProof.type).toBe(
      'idena-arc-tx-anchor-v0'
    )
    expect(
      submitted.bundle.result.identityProof.instructions.payloadText
    ).toMatch(/^idena-arc:v0:sha256:/)
  })
})
