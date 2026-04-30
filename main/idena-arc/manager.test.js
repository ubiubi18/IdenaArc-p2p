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
      validationDevnet: {
        getPrimarySignerDetails: () => ({
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
    const preview = await manager.previewTrace({
      sessionId: created.sessionId,
      actions: ['move_right'],
    })
    const submitted = await manager.submitTrace({
      sessionId: created.sessionId,
      participantId: 'alice',
      adapter: 'rehearsal-devnet',
      actions: ['move_right', 'move_down'],
    })
    const verified = await manager.verifyTraceBundle({
      bundle: submitted.bundle,
    })

    expect(seed.finalSeedHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(generated.game.initialStateHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(preview.finalStateHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(preview.actions).toHaveLength(1)
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
    expect(submitted.bundle.recording.entries[0].data).toMatchObject({
      levels_completed: 0,
      win_levels: 0,
      available_actions: [],
    })
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

  it('rejects renderer-supplied private keys for trace signing', async () => {
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

    await expect(
      manager.submitTrace({
        sessionId: created.sessionId,
        participantId: 'alice',
        signerPrivateKey: privateKey,
        actions: ['move_right'],
      })
    ).rejects.toThrow('Renderer-supplied private keys')
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
      adapter: 'rehearsal-devnet',
      actions: ['move_right', 'move_down'],
    })
    const draft = await manager.saveAnnotationBundle({
      status: 'draft',
      traceBundle: submitted.bundle,
      humanRuleAnnotation: {
        confirmedRules: 'The target is reached by moving on the grid.',
        evidenceEvents: [
          {
            actionIndex: 0,
            description:
              'Marker (1) showed the plus sign changed the figure orientation.',
            visualMarker: {
              markerId: 'plus-1',
              label: '1',
              x: 2,
              y: 3,
              frameWidth: 5,
              frameHeight: 5,
              role: 'causal-cue',
              note: 'Touching the plus sign rotated the figure.',
            },
          },
        ],
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
      localAiGameplayAnnotation: {
        model: 'local-test-agent',
        attemptedActions: ['move_right', 'move_down'],
        explanationText:
          'The local AI tried a direct path and did not preserve obstacle context.',
        structuredExplanation: {
          summary: 'Use the visible target to choose a short path.',
          invariants: 'Keep the player inside the grid.',
          actionPolicy: 'Prefer ACTION4 first, then ACTION2 toward the target.',
          rejectedAlternatives: 'Do not sample random directions first.',
        },
        actionRationales: 'Action 1 tested whether right movement was open.',
        uncertaintyNotes: 'The target rule was unresolved during gameplay.',
      },
      humanReplayAnnotation: {
        explanationText:
          'Replay shows the useful clue was the state change after the first move.',
        structuredExplanation: {
          summary: 'Replay confirms target-directed grid movement.',
          invariants: 'The target and obstacle positions stay fixed.',
          actionPolicy: 'The successful prefix is ACTION4 followed by ACTION2.',
          rejectedAlternatives: 'Ignoring score deltas was less useful.',
        },
        keyMoments: [
          'Action 1 exposed the target direction.',
          {
            actionIndex: 1,
            description: 'Marker (2) showed the target/keyhole.',
            visualMarker: {
              markerId: 'keyhole-2',
              label: '2',
              x: 4,
              y: 1,
              frameWidth: 5,
              frameHeight: 5,
              note: 'The rotated figure fit here.',
            },
          },
        ],
        corrections: 'Try target-directed movement before random exploration.',
      },
      comparisonAnnotation: {
        humanVsAiGap: 'The human used the visible target and obstacle.',
        capabilityTags: 'spatial-planning',
        suggestedAdapterTarget: 'grid-distance planner',
      },
      teacherJourney: {
        protocol: 'idena-arc-teacher-journey-v1',
        phase: 'finalized',
        game: {
          gameId: created.sessionId,
          initialStateHash: submitted.bundle.trace.initialStateHash,
        },
        humanAttempt: {
          actor: 'human',
          actionCount: 2,
          actions: [
            {action: 'move_right', reason: 'Test right movement.'},
            {action: 'move_down', reason: 'Move toward target.'},
          ],
          completed: false,
          stopReason: 'human_stopped',
        },
        localAiAttempts: [
          {
            actor: 'local-ai',
            attemptIndex: 0,
            actionCount: 2,
            actions: [
              {
                action: 'move_right',
                reason: 'Follow the visible target.',
                observation: 'Score improved.',
                confidence: 0.7,
              },
              {
                action: 'move_down',
                reason: 'Continue target-directed movement.',
                observation: 'State changed.',
                confidence: 0.6,
              },
            ],
            completed: false,
            stopReason: 'action_cap',
          },
        ],
        teacherRounds: [
          {
            roundIndex: 0,
            aiComparison:
              'The human used target-directed movement before random probes.',
            humanFeedback:
              'Try the visible target rule before sampling random actions.',
            quickMarks: ['missed-rule'],
          },
        ],
        visualAnnotations: [
          {
            actionIndex: 0,
            description:
              'Marker (1) links the visual plus sign to the rotation clue.',
            visualMarker: {
              markerId: 'plus-1',
              label: '1',
              x: 2,
              y: 3,
              frameWidth: 5,
              frameHeight: 5,
              note: 'Same marker as the human proof event.',
            },
          },
        ],
        providerAnnotationDrafts: [
          {
            provider: 'openai',
            model: 'gpt-5.5',
            costUsd: 0.12,
            reviewedByHuman: false,
            text: 'Provider draft should not become training target.',
          },
        ],
      },
      compressedTeacherMemory: {
        compressedText:
          'Teacher says to try the visible target rule before random probes.',
      },
      providerAnnotationDrafts: [
        {
          provider: 'openai',
          model: 'gpt-5.5',
          costUsd: 0.12,
          reviewedByHuman: false,
          text: 'Provider draft should not become training target.',
        },
      ],
    })
    const final = await manager.saveAnnotationBundle({
      ...draft.annotation,
      status: 'final',
      traceBundle: submitted.bundle,
      humanRuleAnnotation: draft.annotation.humanRuleAnnotation,
      aiSelfAnnotation: draft.annotation.aiSelfAnnotation,
      localAiGameplayAnnotation: draft.annotation.localAiGameplayAnnotation,
      humanReplayAnnotation: draft.annotation.humanReplayAnnotation,
      comparisonAnnotation: draft.annotation.comparisonAnnotation,
      teacherJourney: draft.annotation.teacherJourney,
      compressedTeacherMemory: draft.annotation.compressedTeacherMemory,
      providerAnnotationDrafts: draft.annotation.providerAnnotationDrafts,
    })
    const verified = await manager.verifyAnnotationBundle({
      annotationBundle: final,
      traceBundle: submitted.bundle,
    })
    const dataset = await manager.exportTrainingDataset({
      annotationBundle: final,
    })
    const importedAnnotation = await manager.importAnnotationBundle({
      annotationBundle: final,
      traceBundle: submitted.bundle,
    })
    const importedDataset = await manager.importTrainingDataset({dataset})

    expect(draft.acceptedForTraining).toBe(false)
    expect(final.annotationHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(final.acceptedForTraining).toBe(true)
    expect(final.privateByDefault).toBe(true)
    expect(final.uploaded).toBe(false)
    expect(final.annotation.frameContext).toMatchObject({
      protocol: 'idena-arc-compact-frame-context-v0',
      actionCount: 2,
    })
    expect(final.annotation.annotationValidation).toMatchObject({
      protocol: 'idena-arc-annotation-validation-v0',
      status: 'usable-for-training',
      replayPrefixTask: {
        expectedFinalAction: 'ACTION2',
        matchedExpected: true,
      },
    })
    expect(
      final.annotation.localAiGameplayAnnotation.actionButtonDescriptions
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'ACTION4',
          buttonLabel: 'Right',
        }),
        expect.objectContaining({
          action: 'ACTION2',
          buttonLabel: 'Down',
        }),
      ])
    )
    expect(final.annotation.humanReplayAnnotation).toMatchObject({
      replayActions: [{action: 'move_right'}, {action: 'move_down'}],
      actionButtonDescriptions: expect.arrayContaining([
        expect.objectContaining({action: 'ACTION4', buttonLabel: 'Right'}),
        expect.objectContaining({action: 'ACTION2', buttonLabel: 'Down'}),
      ]),
      keyMoments: expect.arrayContaining([
        expect.objectContaining({
          description: 'Marker (2) showed the target/keyhole.',
          visualMarker: expect.objectContaining({
            protocol: 'idena-arc-visual-marker-v0',
            markerId: 'keyhole-2',
            label: '2',
            x: 4,
            y: 1,
          }),
        }),
      ]),
    })
    expect(final.annotation.humanRuleAnnotation.evidenceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionIndex: 0,
          visualMarker: expect.objectContaining({
            protocol: 'idena-arc-visual-marker-v0',
            markerId: 'plus-1',
            label: '1',
            role: 'causal-cue',
          }),
        }),
      ])
    )
    expect(final.annotation.teacherJourney).toMatchObject({
      protocol: 'idena-arc-teacher-journey-v1',
      humanAttempt: {
        actor: 'human',
        actionCount: 2,
      },
      localAiAttempts: [
        expect.objectContaining({
          actor: 'local-ai',
          stopReason: 'action_cap',
        }),
      ],
      visualAnnotations: expect.arrayContaining([
        expect.objectContaining({
          visualMarker: expect.objectContaining({
            markerId: 'plus-1',
            label: '1',
          }),
        }),
      ]),
    })
    expect(final.annotation.providerAnnotationDrafts[0]).toMatchObject({
      provider: 'openai',
      reviewedByHuman: false,
      excludedFromTraining: true,
    })
    expect(final.trainingExample).toMatchObject({
      protocol: 'idena-arc-training-example-v0',
      access: 'local-only-private-by-default',
      traceHash: submitted.bundle.result.traceHash,
      recordingHash: submitted.bundle.recordingHash,
      agentLogHash: submitted.bundle.agentLogHash,
      input: {
        frameContext: {
          protocol: 'idena-arc-compact-frame-context-v0',
          actionCount: 2,
        },
        actionButtonComparison: {
          protocol: 'idena-arc-action-button-comparison-v0',
          buttons: expect.arrayContaining([
            expect.objectContaining({
              action: 'ACTION4',
              usedBy: {human: true, localAi: true},
            }),
          ]),
        },
      },
      target: {
        localAiGameplayExplanation:
          'The local AI tried a direct path and did not preserve obstacle context.',
        localAiGameplayExplanationHash:
          final.annotation.localAiGameplayAnnotation.compression.sourceTextHash,
        localAiAttemptedActions: [
          {t_ms: 0, action: 'move_right'},
          {t_ms: 0, action: 'move_down'},
        ],
        localAiActionButtonDescriptions: expect.arrayContaining([
          expect.objectContaining({action: 'ACTION4', buttonLabel: 'Right'}),
        ]),
        humanReplayExplanation:
          'Replay shows the useful clue was the state change after the first move.',
        humanReplayExplanationHash:
          final.annotation.humanReplayAnnotation.compression.sourceTextHash,
        humanReplayActions: expect.arrayContaining([
          expect.objectContaining({action: 'move_right'}),
          expect.objectContaining({action: 'move_down'}),
        ]),
        humanReplayActionButtonDescriptions: expect.arrayContaining([
          expect.objectContaining({action: 'ACTION4', buttonLabel: 'Right'}),
        ]),
        noemonStyle: {
          protocol: 'idena-arc-noemon-style-annotation-v0',
          humanReplay: {
            structuredExplanation: {
              actionPolicy:
                'The successful prefix is ACTION4 followed by ACTION2.',
            },
          },
        },
        annotationValidation: {
          status: 'usable-for-training',
        },
        compressedTeacherMemory: {
          compressedText:
            'Teacher says to try the visible target rule before random probes.',
        },
        teacherRounds: expect.arrayContaining([
          expect.objectContaining({
            quickMarks: ['missed-rule'],
          }),
        ]),
        providerAnnotationDrafts: [],
        providerDraftPolicy:
          'Provider drafts are excluded unless reviewedByHuman=true.',
      },
    })
    expect(
      final.annotation.localAiGameplayAnnotation.compression.sourceTextHash
    ).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(
      final.annotation.humanReplayAnnotation.compression.sourceTextHash
    ).toMatch(/^sha256:[a-f0-9]{64}$/)
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
    expect(dataset.examples[0].privateText).toBeUndefined()
    expect(importedAnnotation).toMatchObject({
      accepted: true,
      annotationHash: final.annotationHash,
      stored: {
        namespace: 'idena-arc/annotations',
      },
    })
    expect(importedDataset).toMatchObject({
      accepted: true,
      datasetHash: dataset.datasetHash,
      verification: {
        sourceVerified: true,
      },
      stored: {
        namespace: 'idena-arc/training-datasets',
      },
    })

    const forgedButtonBundle = await manager.saveAnnotationBundle({
      ...draft.annotation,
      status: 'final',
      traceBundle: submitted.bundle,
      localAiGameplayAnnotation: {
        ...draft.annotation.localAiGameplayAnnotation,
        actionButtonDescriptions: [
          {
            action: 'ACTION4',
            buttonLabel: 'Down',
            keys: ['S'],
            description: 'Forged renderer label.',
          },
        ],
      },
      humanReplayAnnotation: {
        ...draft.annotation.humanReplayAnnotation,
        actionButtonDescriptions: [
          {
            action: 'ACTION4',
            buttonLabel: 'Down',
            keys: ['S'],
            description: 'Forged renderer label.',
          },
        ],
      },
      comparisonAnnotation: {
        ...draft.annotation.comparisonAnnotation,
        actionButtonComparison: {
          protocol: 'idena-arc-action-button-comparison-v0',
          buttons: [
            {
              protocol: 'idena-arc-action-button-description-v0',
              action: 'ACTION4',
              buttonLabel: 'Down',
              keys: ['S'],
              description: 'Forged comparison.',
              usedBy: {
                human: false,
                localAi: false,
              },
            },
          ],
        },
      },
    })
    const forgedAction4 =
      forgedButtonBundle.annotation.localAiGameplayAnnotation.actionButtonDescriptions.find(
        (item) => item.action === 'ACTION4'
      )
    const forgedComparisonAction4 =
      forgedButtonBundle.annotation.comparisonAnnotation.actionButtonComparison.buttons.find(
        (item) => item.action === 'ACTION4'
      )

    expect(forgedAction4).toMatchObject({
      action: 'ACTION4',
      buttonLabel: 'Right',
      keys: ['D', 'ArrowRight'],
    })
    expect(forgedComparisonAction4).toMatchObject({
      action: 'ACTION4',
      buttonLabel: 'Right',
      usedBy: {
        human: true,
        localAi: true,
      },
    })

    const forgedDataset = {
      ...dataset,
      exportId: 'forged-dataset',
      examples: dataset.examples.map((example, index) =>
        index === 0
          ? {
              ...example,
              target: {
                ...example.target,
                localAiAttemptedActions: [{t_ms: 0, action: 'ACTION1'}],
              },
            }
          : example
      ),
    }
    delete forgedDataset.datasetHash
    const forgedDatasetImport = await manager.importTrainingDataset({
      dataset: forgedDataset,
    })

    expect(forgedDatasetImport).toMatchObject({
      accepted: false,
      reason: 'dataset_example_source_mismatch',
    })

    const missingSourceDataset = {
      ...dataset,
      exportId: 'missing-source-dataset',
      examples: dataset.examples.map((example, index) =>
        index === 0
          ? {
              ...example,
              annotationHash: `sha256:${'9'.repeat(64)}`,
            }
          : example
      ),
    }
    delete missingSourceDataset.datasetHash
    const missingSourceImport = await manager.importTrainingDataset({
      dataset: missingSourceDataset,
    })

    expect(missingSourceImport).toMatchObject({
      accepted: false,
      reason: 'dataset_annotation_source_missing',
    })

    const privateDataset = await manager.exportTrainingDataset({
      annotationBundle: final,
      includePrivateFields: true,
    })

    expect(privateDataset.privateFieldsIncluded).toBe(true)
    expect(privateDataset.examples[0].privateText).toMatchObject({
      localAiGameplayExplanation:
        'The local AI tried a direct path and did not preserve obstacle context.',
      humanReplayExplanation:
        'Replay shows the useful clue was the state change after the first move.',
    })

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
      validationDevnet: {
        getPrimarySignerDetails: () => ({
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
      adapter: 'rehearsal-devnet',
      actions: ['move_right', 'move_down'],
    })

    const identity = await manager.resolveIdentity({
      rpcUrl: 'http://127.0.0.1:9009',
      address,
    })
    const upload = await manager.uploadTraceBundle({
      rpcUrl: 'http://127.0.0.1:9009',
      bundle: submitted.bundle,
    })

    expect(identity.identityStatus).toBe('Human')
    expect(upload.cid).toBe('bafytest')
    expect(calls.map((call) => call.method)).toEqual([
      'dna_epoch',
      'dna_identity',
      'ipfs_add',
    ])
  })

  it('rejects unverifiable or out-of-store trace bundle uploads', async () => {
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
      adapter: 'rehearsal-devnet',
      actions: ['move_right', 'move_down'],
    })
    const tampered = {
      ...submitted.bundle,
      trace: {
        ...submitted.bundle.trace,
        actions: ['move_left'],
      },
    }
    const outsidePath = path.join(
      os.tmpdir(),
      `idena-arc-outside-${Date.now()}.json`
    )

    await fs.writeJson(outsidePath, submitted.bundle)

    await expect(
      manager.uploadTraceBundle({
        rpcUrl: 'http://127.0.0.1:9009',
        bundle: tampered,
      })
    ).rejects.toThrow('trace_bundle_replay_verification_failed')
    await expect(
      manager.uploadTraceBundle({
        rpcUrl: 'http://127.0.0.1:9009',
        bundlePath: outsidePath,
      })
    ).rejects.toThrow('trace_bundle_path_outside_store')

    await fs.remove(outsidePath)
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
      },
      rehearsalSigner: {
        adapter: 'rehearsal-devnet',
        address,
      },
      arcAgiRuntime: {
        ok: true,
        ready: expect.any(Boolean),
        runtimeDir: path.join(baseDir, 'arc-agi-runtime'),
      },
    })
    await expect(manager.status()).resolves.toMatchObject({
      rehearsalConnection: expect.not.objectContaining({
        apiKey: expect.anything(),
      }),
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
