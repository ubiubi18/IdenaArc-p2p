const path = require('path')
const {spawn} = require('child_process')
const fs = require('fs-extra')
const httpClient = require('../utils/fetch-client')
const appDataPath = require('../app-data-path')
const {
  canonicalJson,
  sha256Hex,
  sha256Prefixed,
  hashJsonPrefixed,
  randomSaltHex,
  buildSaltCommitment,
  assertSaltCommitment,
  deriveFinalSeed,
  privateKeyToAddress,
  normalizeAddress,
  idenaSignatureHashPrefixed,
  recoverIdenaSignatureAddress,
  signPayloadWithPrivateKey,
  verifyIdenaSignature,
  verifyPayloadSignature,
} = require('./crypto')

const PROTOCOL = 'idena-arc-session-v0'
const TRACE_PROTOCOL = 'idena-arc-trace-v0'
const RESULT_PROTOCOL = 'idena-arc-result-v0'
const RECORDING_PROTOCOL = 'idena-arc-recording-v0'
const AGENT_LOG_PROTOCOL = 'idena-arc-agent-log-v0'
const ANNOTATION_BUNDLE_PROTOCOL = 'idena-arc-annotation-bundle-v0'
const HUMAN_RULE_ANNOTATION_PROTOCOL = 'idena-arc-hidden-rule-annotation-v0'
const AI_SELF_ANNOTATION_PROTOCOL = 'idena-arc-ai-self-annotation-v0'
const COMPARISON_ANNOTATION_PROTOCOL = 'idena-arc-comparison-annotation-v0'
const TRAINING_EXAMPLE_PROTOCOL = 'idena-arc-training-example-v0'
const TRAINING_DATASET_EXPORT_PROTOCOL = 'idena-arc-training-dataset-export-v0'
const DEFAULT_PLAY_DURATION_MS = 3 * 60 * 1000
const DEFAULT_GRACE_PERIOD_MS = 30 * 1000
const DEFAULT_GENERATOR_VERSION = '0.1.0'
const MAX_ACTIONS = 512
const DEFAULT_CAPABILITY_TAGS = [
  'spatial-planning',
  'color-rule-inference',
  'delayed-effect',
  'object-transformation',
  'causal-trigger',
]
const IDENA_ARC_PROOF_CONTRACT_PLACEHOLDER = '<idena-arc-proof-contract>'
const ARC_ACTION_ALIASES = {
  move_up: 'ACTION1',
  up: 'ACTION1',
  move_down: 'ACTION2',
  down: 'ACTION2',
  move_left: 'ACTION3',
  left: 'ACTION3',
  move_right: 'ACTION4',
  right: 'ACTION4',
  interact: 'ACTION5',
  select: 'ACTION5',
  click: 'ACTION6',
  undo: 'ACTION7',
}

function isoNow() {
  return new Date().toISOString()
}

function safeId(value, fallback) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || fallback
  )
}

function trimString(value) {
  return String(value || '').trim()
}

function boundedString(value, maxLength = 2000) {
  return trimString(value).slice(0, maxLength)
}

function normalizeStringList(value, {maxItems = 32, maxLength = 240} = {}) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringList(item, {maxItems: 1, maxLength}))
      .slice(0, maxItems)
  }

  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => boundedString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeCapabilityTags(value) {
  const tags = normalizeStringList(value, {maxItems: 16, maxLength: 80}).map(
    (item) => safeId(item, '')
  )

  return Array.from(new Set(tags.filter(Boolean))).slice(0, 16)
}

function normalizeAnnotationStatus(value) {
  return trimString(value).toLowerCase() === 'final' ? 'final' : 'draft'
}

function normalizeNullableInteger(value, {min = 0, max = MAX_ACTIONS} = {}) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(min, Math.min(max, parsed))
}

function normalizeDifficulty(value) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(1, Math.min(5, parsed))
}

function normalizeEvidenceEvents(value) {
  if (Array.isArray(value)) {
    return value
      .slice(0, 64)
      .map((item) => {
        if (typeof item === 'string') {
          return {
            actionIndex: null,
            t_ms: null,
            description: boundedString(item, 400),
          }
        }

        if (!item || typeof item !== 'object') {
          return null
        }

        return {
          actionIndex: normalizeNullableInteger(
            item.actionIndex || item.action_index
          ),
          t_ms: normalizeNullableInteger(item.t_ms || item.tMs, {
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
          }),
          description: boundedString(item.description || item.event, 600),
          observationHash: boundedString(
            item.observationHash || item.observation_hash,
            96
          ),
        }
      })
      .filter((item) => item && item.description)
  }

  return normalizeStringList(value, {maxItems: 64, maxLength: 600}).map(
    (description) => ({
      actionIndex: null,
      t_ms: null,
      description,
    })
  )
}

function normalizeRecognitionMoment(value, fallbackActionIndex = null) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      actionIndex: normalizeNullableInteger(
        value.actionIndex || value.action_index || fallbackActionIndex
      ),
      t_ms: normalizeNullableInteger(value.t_ms || value.tMs, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
      }),
      description: boundedString(value.description || value.notes, 1000),
    }
  }

  return {
    actionIndex: normalizeNullableInteger(fallbackActionIndex),
    t_ms: null,
    description: boundedString(value, 1000),
  }
}

function normalizeHumanRuleAnnotation(input = {}, context = {}) {
  const capabilityTags = normalizeCapabilityTags(
    input.capabilityTags || input.capability_tags
  )

  return {
    protocol: HUMAN_RULE_ANNOTATION_PROTOCOL,
    status: context.status,
    sessionId: context.sessionId,
    gameId: context.sessionId,
    resultId: context.resultId,
    participantId: context.participantId,
    ruleHypotheses: normalizeStringList(
      input.ruleHypotheses || input.rule_hypotheses
    ),
    confirmedRules: normalizeStringList(
      input.confirmedRules || input.confirmed_rules
    ),
    evidenceEvents: normalizeEvidenceEvents(
      input.evidenceEvents || input.evidence_events
    ),
    recognitionMoment: normalizeRecognitionMoment(
      input.recognitionMoment || input.recognition_moment,
      input.recognitionActionIndex || input.recognition_action_index
    ),
    wrongHypotheses: normalizeStringList(
      input.wrongHypotheses || input.wrong_hypotheses
    ),
    strategyChange: boundedString(
      input.strategyChange || input.strategy_change,
      1600
    ),
    difficulty: normalizeDifficulty(input.difficulty),
    teachingNotes: boundedString(input.teachingNotes || input.teaching_notes),
    capabilityTags,
  }
}

function normalizeAiSelfAnnotation(input = {}, context = {}) {
  return {
    protocol: AI_SELF_ANNOTATION_PROTOCOL,
    status: context.status,
    sessionId: context.sessionId,
    gameId: context.sessionId,
    resultId: context.resultId,
    participantId: context.participantId,
    attemptedHypotheses: normalizeStringList(
      input.attemptedHypotheses || input.hypotheses
    ),
    evidenceUsed: normalizeStringList(input.evidenceUsed || input.evidence),
    uncertaintyReducingActions: normalizeStringList(
      input.uncertaintyReducingActions || input.uncertainty_reducing_actions
    ),
    repeatedLoops: normalizeStringList(
      input.repeatedLoops || input.repeated_loops
    ),
    failedAbstractions: normalizeStringList(
      input.failedAbstractions || input.failed_abstractions
    ),
    finalKnownState: boundedString(
      input.finalKnownState || input.final_known_state,
      1600
    ),
    stopReason: boundedString(input.stopReason || input.stop_reason, 1000),
    missingCapability: boundedString(
      input.missingCapability || input.missing_capability,
      400
    ),
  }
}

function normalizeComparisonAnnotation(input = {}, context = {}) {
  return {
    protocol: COMPARISON_ANNOTATION_PROTOCOL,
    status: context.status,
    sessionId: context.sessionId,
    gameId: context.sessionId,
    resultId: context.resultId,
    participantId: context.participantId,
    humanVsAiGap: boundedString(
      input.humanVsAiGap || input.human_vs_ai_gap,
      1600
    ),
    capabilityTags: normalizeCapabilityTags(
      input.capabilityTags || input.capability_tags
    ),
    suggestedAdapterTarget: boundedString(
      input.suggestedAdapterTarget || input.suggested_adapter_target,
      400
    ),
  }
}

function collectCapabilityTags(...sources) {
  const tags = sources.flatMap((source) =>
    normalizeCapabilityTags(source && source.capabilityTags)
  )

  return Array.from(new Set(tags)).slice(0, 16)
}

function hasAnnotationTrainingSignal(annotationPayload) {
  const human = annotationPayload.humanRuleAnnotation || {}
  const ai = annotationPayload.aiSelfAnnotation || {}

  return Boolean(
    (Array.isArray(human.confirmedRules) && human.confirmedRules.length) ||
      (Array.isArray(human.wrongHypotheses) && human.wrongHypotheses.length) ||
      (Array.isArray(ai.failedAbstractions) && ai.failedAbstractions.length)
  )
}

function buildTrainingExample(annotationPayload, annotationHash, bundle) {
  const human = annotationPayload.humanRuleAnnotation || {}
  const ai = annotationPayload.aiSelfAnnotation || {}
  const comparison = annotationPayload.comparisonAnnotation || {}
  const trace = bundle.trace || {}
  const result = bundle.result || {}
  const capabilityTags = collectCapabilityTags(human, comparison)

  return {
    protocol: TRAINING_EXAMPLE_PROTOCOL,
    source: 'idena-arc-local-annotation-v0',
    access: 'local-only-private-by-default',
    releasePolicy: 'private-by-default',
    sessionId: annotationPayload.sessionId,
    resultId: annotationPayload.resultId,
    participantId: annotationPayload.participantId,
    annotationHash,
    traceHash: annotationPayload.traceHash,
    recordingHash: annotationPayload.recordingHash,
    agentLogHash: annotationPayload.agentLogHash,
    finalSeedHash: annotationPayload.finalSeedHash,
    generatorHash: result.generatorHash || null,
    capabilityTags: capabilityTags.length
      ? capabilityTags
      : DEFAULT_CAPABILITY_TAGS,
    metrics: {
      score: typeof result.score === 'number' ? result.score : null,
      actionCount: Array.isArray(trace.actions) ? trace.actions.length : 0,
      replayVerified: true,
    },
    target: {
      confirmedRules: human.confirmedRules || [],
      wrongHypotheses: human.wrongHypotheses || [],
      recognitionMoment: human.recognitionMoment || null,
      strategyChange: human.strategyChange || '',
      teachingNotes: human.teachingNotes || '',
      aiFailedAbstractions: ai.failedAbstractions || [],
      aiStopReason: ai.stopReason || '',
      missingCapability: ai.missingCapability || '',
      humanVsAiGap: comparison.humanVsAiGap || '',
      suggestedAdapterTarget: comparison.suggestedAdapterTarget || '',
    },
  }
}

function normalizeProofMode(payload = {}, adapter = 'external') {
  const mode = trimString(payload.proofMode || payload.signingMode)

  if (adapter === 'rehearsal-devnet') {
    return 'devnet-local-signature'
  }

  return mode || 'node-signature'
}

function isLoopbackRpcUrl(value) {
  try {
    const parsed = new URL(value)
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function buildResultProofMessage(resultPayload) {
  return `idena-arc-result-v0:${hashJsonPrefixed(resultPayload)}`
}

function buildAnchorPayload({resultPayload, trace, proof = {}}) {
  const resultPayloadHash = hashJsonPrefixed(resultPayload)

  return {
    protocol: 'idena-arc-proof-anchor-v0',
    proofType: 'idena-tx-or-contract-anchor',
    resultPayloadHash,
    sessionId: resultPayload.sessionId,
    playerAddress: resultPayload.playerAddress,
    participantId: trace.participantId,
    traceHash: resultPayload.traceHash,
    finalSeedHash: resultPayload.finalSeedHash,
    generatorHash: resultPayload.generatorHash,
    proofTxHash: trimString(proof.txHash || proof.proofTxHash) || null,
    proofCid: trimString(proof.cid || proof.proofCid) || null,
    proofContract:
      trimString(proof.contract || proof.proofContract) ||
      IDENA_ARC_PROOF_CONTRACT_PLACEHOLDER,
    createdAt: resultPayload.createdAt,
  }
}

function rpcErrorMessage(error) {
  return String(error && error.message ? error.message : error)
}

function isFailedRpcResult(value) {
  return Boolean(value && typeof value === 'object' && value.error)
}

function buildTransactionProofAnchor({resultPayload, trace, proof}) {
  const anchorPayload = buildAnchorPayload({resultPayload, trace, proof})
  const payloadHash = hashJsonPrefixed(anchorPayload)
  const payloadText = `idena-arc:v0:${payloadHash}`

  return {
    type: 'idena-arc-tx-anchor-v0',
    status:
      anchorPayload.proofTxHash || anchorPayload.proofCid
        ? 'submitted-reference'
        : 'draft',
    expectedAddress: resultPayload.playerAddress,
    payloadHash,
    resultPayloadHash: anchorPayload.resultPayloadHash,
    txHash: anchorPayload.proofTxHash,
    cid: anchorPayload.proofCid,
    contract: anchorPayload.proofContract,
    instructions: {
      payloadText,
      ipfsObject: anchorPayload,
      dnaSendTransactionDraft: {
        from: resultPayload.playerAddress,
        to: resultPayload.playerAddress,
        amount: '0',
        payloadText,
      },
      contractCallDraft: {
        from: resultPayload.playerAddress,
        contract: anchorPayload.proofContract,
        method: 'submitProof',
        args: [
          {value: payloadHash},
          {value: anchorPayload.resultPayloadHash},
          {value: anchorPayload.traceHash},
        ],
      },
    },
  }
}

function verifyTransactionProofAnchor(resultPayload, proof) {
  if (!proof || proof.type !== 'idena-arc-tx-anchor-v0') {
    return false
  }

  const expectedResultPayloadHash = hashJsonPrefixed(resultPayload)

  return (
    proof.resultPayloadHash === expectedResultPayloadHash &&
    proof.expectedAddress === resultPayload.playerAddress &&
    Boolean(proof.txHash || proof.cid)
  )
}

function normalizeAction(action) {
  if (typeof action === 'string') {
    return {
      t_ms: 0,
      action: action.trim(),
    }
  }

  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return null
  }

  const name = String(action.action || action.type || '').trim()

  if (!name) {
    return null
  }

  const normalized = {
    t_ms: Math.max(0, Math.trunc(Number(action.t_ms || action.tMs || 0) || 0)),
    action: name.slice(0, 80),
  }
  const x = Number(action.x)
  const y = Number(action.y)

  if (Number.isFinite(x) && Number.isFinite(y)) {
    normalized.x = Math.max(0, Math.min(63, Math.trunc(x)))
    normalized.y = Math.max(0, Math.min(63, Math.trunc(y)))
  }

  return normalized
}

function normalizeActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .slice(0, MAX_ACTIONS)
    .map(normalizeAction)
    .filter(Boolean)
}

function arcActionName(action) {
  const normalized = String(action || '')
    .trim()
    .toUpperCase()

  if (/^ACTION[1-7]$/.test(normalized)) {
    return normalized
  }

  return (
    ARC_ACTION_ALIASES[
      String(action || '')
        .trim()
        .toLowerCase()
    ] || null
  )
}

function timestampFromOffset(baseIso, offsetMs) {
  const baseMs = Date.parse(baseIso || '')
  const startMs = Number.isFinite(baseMs) ? baseMs : 0

  return new Date(startMs + Math.max(0, Number(offsetMs) || 0)).toISOString()
}

function gridFrameFromState(state = {}) {
  const gridSize = Math.max(0, Math.trunc(Number(state.gridSize || 0)))

  if (!gridSize) {
    return []
  }

  const frame = Array.from({length: gridSize}, () =>
    Array.from({length: gridSize}, () => '.')
  )
  const place = (cell, value) => {
    const x = Math.trunc(Number(cell && cell.x))
    const y = Math.trunc(Number(cell && cell.y))

    if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
      frame[y][x] = value
    }
  }

  ;(Array.isArray(state.obstacles) ? state.obstacles : []).forEach((cell) =>
    place(cell, '#')
  )
  place(state.goal, 'G')
  place(state.player, 'P')

  return frame
}

function frameToText(frame) {
  return (Array.isArray(frame) ? frame : [])
    .map((row) => (Array.isArray(row) ? row : []).map(String).join(''))
    .join('\n')
}

function fallbackTimelineFromTrace(session, trace, replay) {
  const actions = Array.isArray(trace.actions) ? trace.actions : []
  const timeline = [
    {
      phase: 'initial',
      step: 0,
      t_ms: 0,
      actionInput: null,
      state: session.game && session.game.initialState,
      stateHash: trace.initialStateHash,
      score: 0,
      fullReset: true,
    },
  ]

  actions.forEach((action, index) => {
    timeline.push({
      phase: 'action',
      step: index + 1,
      t_ms: action.t_ms,
      actionInput: {
        id: index,
        data: {
          action: action.action,
          t_ms: action.t_ms,
        },
      },
      state: null,
      stateHash: action.observation_hash,
      score: null,
      fullReset: false,
    })
  })

  if (!actions.length && replay && replay.finalState) {
    timeline[0] = {
      ...timeline[0],
      state: replay.finalState,
      stateHash: replay.finalStateHash,
      score: replay.score,
    }
  }

  return timeline
}

function buildReplayRecording({session, trace, replay}) {
  const gameId = session.sessionId
  const startedAt =
    session.manifest.startTime || session.createdAt || '1970-01-01T00:00:00Z'
  const timeline =
    Array.isArray(replay && replay.timeline) && replay.timeline.length
      ? replay.timeline
      : fallbackTimelineFromTrace(session, trace, replay)
  const entries = timeline.map((point, index) => {
    const actionInput =
      point && point.actionInput
        ? {
            id: point.actionInput.id,
            data: {
              game_id: gameId,
              ...(point.actionInput.data || {}),
              arc_action: arcActionName(point.actionInput.data.action),
            },
            reasoning: point.actionInput.reasoning || null,
          }
        : null
    const state = point && point.state ? point.state : null

    return {
      timestamp: timestampFromOffset(startedAt, point && point.t_ms),
      data: {
        game_id: gameId,
        frame: gridFrameFromState(state || {}),
        state: state || null,
        score: typeof point.score === 'number' ? point.score : null,
        action_input: actionInput,
        guid: `${gameId}:${trace.participantId || 'player'}:${index}`,
        full_reset: Boolean(point.fullReset || index === 0),
        state_hash: point.stateHash || null,
      },
    }
  })
  const jsonl = entries.map((entry) => canonicalJson(entry)).join('\n')

  return {
    protocol: RECORDING_PROTOCOL,
    format: 'arc-style-jsonl-v0',
    source: 'idena-arc-sidecar-replay',
    gameId,
    generatorHash: session.manifest.generator.hash,
    generatorVersion: session.manifest.generator.version,
    entries,
    jsonl: jsonl ? `${jsonl}\n` : '',
  }
}

function buildAgentLog({session, trace, recording}) {
  const gameId = session.sessionId
  const participantId = trace.participantId || 'player'
  const entries = Array.isArray(recording && recording.entries)
    ? recording.entries
    : []
  const lines = [
    '# IdenaArc agent log v0',
    `protocol: ${AGENT_LOG_PROTOCOL}`,
    'format: plain-text-log-v0',
    'access: post-session-training-artifact',
    'release_policy: embargo-until-submission-cutoff',
    `session_id: ${gameId}`,
    `participant_id: ${participantId}`,
    `generator_hash: ${session.manifest.generator.hash}`,
    `generator_version: ${session.manifest.generator.version}`,
    `final_seed_hash: ${
      session.finalSeed && session.finalSeed.finalSeedHash
        ? session.finalSeed.finalSeedHash
        : ''
    }`,
    `initial_state_hash: ${trace.initialStateHash || ''}`,
    `final_state_hash: ${trace.finalStateHash || ''}`,
    `score: ${typeof trace.score === 'number' ? trace.score : ''}`,
    '',
  ]
  let previousScore = null

  entries.forEach((entry, index) => {
    const data = entry && entry.data ? entry.data : {}
    const actionInput = data.action_input || null
    const actionData = actionInput && actionInput.data ? actionInput.data : {}
    const score = typeof data.score === 'number' ? data.score : null
    const scoreDelta =
      typeof score === 'number' && typeof previousScore === 'number'
        ? score - previousScore
        : null
    const frameText = frameToText(data.frame)

    lines.push(
      `--- step ${index} ---`,
      `timestamp: ${entry.timestamp || ''}`,
      `phase: ${data.full_reset ? 'initial' : 'action'}`,
      `t_ms: ${Number(actionData.t_ms || 0) || 0}`,
      `action: ${actionData.action || 'RESET'}`,
      `arc_action: ${actionData.arc_action || ''}`,
      `score: ${typeof score === 'number' ? score : ''}`,
      `score_delta: ${typeof scoreDelta === 'number' ? scoreDelta : ''}`,
      `state_hash: ${data.state_hash || ''}`,
      'frame:',
      frameText || '<empty>',
      `state: ${data.state ? canonicalJson(data.state) : 'null'}`,
      ''
    )

    if (typeof score === 'number') {
      previousScore = score
    }
  })

  return {
    protocol: AGENT_LOG_PROTOCOL,
    format: 'plain-text-log-v0',
    source: 'idena-arc-sidecar-replay',
    access: 'post-session-training-artifact',
    releasePolicy: 'embargo-until-submission-cutoff',
    gameId,
    participantId,
    generatorHash: session.manifest.generator.hash,
    generatorVersion: session.manifest.generator.version,
    text: `${lines.join('\n').trimEnd()}\n`,
  }
}

function buildRecordingFilename({session, trace, resultId}) {
  return `${safeId(session.sessionId, 'game')}.${safeId(
    trace.participantId,
    'player'
  )}.${MAX_ACTIONS}.${safeId(resultId, 'result')}.recording.jsonl`
}

function buildAgentLogFilename({session, trace, resultId}) {
  return `${safeId(session.sessionId, 'game')}.${safeId(
    trace.participantId,
    'player'
  )}.${MAX_ACTIONS}.${safeId(resultId, 'result')}.agent.log.txt`
}

function parseJsonOutput(stdout, stderr) {
  try {
    return JSON.parse(stdout || '{}')
  } catch (error) {
    const details = String(stderr || '').trim()
    throw new Error(
      `IdenaArc sidecar returned invalid JSON${
        details ? `: ${details.slice(0, 400)}` : ''
      }`
    )
  }
}

function createIdenaArcManager({
  logger: _logger,
  validationDevnet,
  baseDir,
  pythonCommand,
  rpcClient = httpClient,
} = {}) {
  const rootDir = path.join(__dirname, '..', '..')
  const sidecarPath = path.join(
    rootDir,
    'python',
    'idena_arc',
    'arc_sidecar.py'
  )

  function resolveBaseDir() {
    return baseDir || path.join(appDataPath('userData'), 'idena-arc')
  }

  function relayDir() {
    return path.join(resolveBaseDir(), 'relay')
  }

  function traceDir() {
    return path.join(resolveBaseDir(), 'traces')
  }

  function annotationDir() {
    return path.join(resolveBaseDir(), 'annotations')
  }

  function datasetDir() {
    return path.join(resolveBaseDir(), 'training-datasets')
  }

  function sessionPath(sessionId) {
    return path.join(relayDir(), `${safeId(sessionId, 'session')}.json`)
  }

  function traceBundlePath(sessionId, resultId) {
    return path.join(
      traceDir(),
      safeId(sessionId, 'session'),
      `${safeId(resultId, 'result')}.json`
    )
  }

  function annotationBundlePath(sessionId, annotationId) {
    return path.join(
      annotationDir(),
      safeId(sessionId, 'session'),
      `${safeId(annotationId, 'annotation')}.json`
    )
  }

  function trainingDatasetPath(exportId) {
    return path.join(datasetDir(), `${safeId(exportId, 'export')}.json`)
  }

  function recordingJsonlPath(sessionId, filename) {
    return path.join(traceDir(), safeId(sessionId, 'session'), filename)
  }

  function agentLogPath(sessionId, filename) {
    return path.join(traceDir(), safeId(sessionId, 'session'), filename)
  }

  async function readJson(filePath, fallback = null) {
    try {
      return await fs.readJson(filePath)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return fallback
      }
      throw error
    }
  }

  async function writeJson(filePath, value) {
    await fs.ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    return value
  }

  async function readSession(sessionId) {
    const session = await readJson(sessionPath(sessionId), null)

    if (!session) {
      throw new Error(`IdenaArc session not found: ${sessionId}`)
    }

    return session
  }

  async function writeSession(session) {
    return writeJson(sessionPath(session.sessionId), {
      ...session,
      updatedAt: isoNow(),
    })
  }

  async function listSessions() {
    await fs.ensureDir(relayDir())
    const files = (await fs.readdir(relayDir())).filter((file) =>
      file.endsWith('.json')
    )
    const sessions = await Promise.all(
      files.map((file) => readJson(path.join(relayDir(), file), null))
    )

    return sessions
      .filter(Boolean)
      .sort((left, right) =>
        String(right.updatedAt || '').localeCompare(
          String(left.updatedAt || '')
        )
      )
  }

  async function callNodeRpc(connection, method, params = []) {
    const connectionKey =
      (connection && connection.apiKey) || (connection && connection.key) || ''
    const normalizedConnection = {
      url: String(connection && connection.url ? connection.url : '').trim(),
      key: String(connectionKey).trim(),
    }

    if (!normalizedConnection.url) {
      throw new Error('Idena RPC URL is required')
    }

    const client = rpcClient.create({
      baseURL: normalizedConnection.url,
      timeout: 5000,
      validateStatus: (statusCode) => statusCode >= 200 && statusCode < 500,
      headers: {'Content-Type': 'application/json'},
    })
    const {data} = await client.post('/', {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
      key: normalizedConnection.key,
    })

    if (data && data.error) {
      throw new Error(data.error.message || `Idena RPC error: ${method}`)
    }

    return data ? data.result : undefined
  }

  function getGeneratorDescriptor(payload = {}) {
    const arcAgiGameId = safeId(
      payload.arcAgiGameId || payload.publicGameId || payload.gameId,
      ''
    )

    if (
      payload.generatorKind === 'arc-agi-public-game-v0' ||
      payload.generatorType === 'arc-agi-public-game-v0' ||
      arcAgiGameId
    ) {
      const gameId = arcAgiGameId || 'ls20'
      const gameVersion = safeId(payload.arcAgiGameVersion, '')
      const fullGameId = gameVersion ? `${gameId}-${gameVersion}` : gameId

      return {
        cid: `arc-agi:${fullGameId}`,
        hash: sha256Prefixed(`arc-agi-public-game-v0:${fullGameId}`),
        version: DEFAULT_GENERATOR_VERSION,
        kind: 'arc-agi-public-game-v0',
        gameId: fullGameId,
        license: 'official ARC-AGI Toolkit runtime integration',
        sourcePolicy:
          'Use through arc-agi/arcengine runtime. Do not vendor downloaded game sources unless their license metadata is present.',
      }
    }

    const hash = fs.existsSync(sidecarPath)
      ? sha256Prefixed(fs.readFileSync(sidecarPath))
      : null

    return {
      cid: 'local:python/idena_arc/arc_sidecar.py',
      hash,
      version: DEFAULT_GENERATOR_VERSION,
      kind: 'idena-arc-local-grid-v0',
    }
  }

  function getDevnetSignerDetails() {
    if (
      !validationDevnet ||
      typeof validationDevnet.getPrimarySignerDetails !== 'function'
    ) {
      throw new Error('Validation rehearsal signer is not available')
    }

    return validationDevnet.getPrimarySignerDetails()
  }

  function getOptionalDevnetSignerDetails() {
    try {
      return getDevnetSignerDetails()
    } catch {
      return null
    }
  }

  function resolveInternalSigner(payload = {}) {
    const adapter = String(
      payload.adapter || payload.identityAdapter || 'external'
    )

    if (adapter === 'rehearsal-devnet') {
      const signer = getDevnetSignerDetails()
      return {
        adapter,
        address: signer.address,
        privateKeyHex: signer.privateKeyHex,
      }
    }

    const privateKeyHex = String(
      payload.signerPrivateKey || payload.privateKey || ''
    ).trim()

    if (!privateKeyHex) {
      throw new Error('A local signer private key is required for this adapter')
    }

    return {
      adapter: 'external',
      address: privateKeyToAddress(privateKeyHex),
      privateKeyHex,
    }
  }

  async function createNodeSignature(payload, resultPayload) {
    const connection = resolveRpcConnection(payload)

    if (!isLoopbackRpcUrl(connection.url)) {
      throw new Error(
        'Local node signing requires a loopback Idena RPC URL. Use tx-anchor proof mode for remote RPCs.'
      )
    }

    const message = buildResultProofMessage(resultPayload)
    const signatureValue = await callNodeRpc(connection, 'dna_sign', [
      message,
      'prefix',
    ])
    const address = recoverIdenaSignatureAddress(
      message,
      signatureValue,
      'prefix'
    )

    return {
      type: 'idena-node-dna-sign-v0',
      address,
      format: 'prefix',
      message,
      messageHash: idenaSignatureHashPrefixed(message, 'prefix'),
      value: signatureValue,
    }
  }

  async function buildResultIdentityProof(payload, resultPayload, trace) {
    const adapter = String(
      payload.adapter || payload.identityAdapter || 'external'
    )
    const proofMode = normalizeProofMode(payload, adapter)

    if (
      adapter === 'rehearsal-devnet' ||
      payload.signerPrivateKey ||
      payload.privateKey
    ) {
      const signer = resolveInternalSigner(payload)

      if (
        resultPayload.playerAddress &&
        normalizeAddress(resultPayload.playerAddress) !==
          normalizeAddress(signer.address)
      ) {
        throw new Error('Signer address does not match participant address')
      }

      const signature = signPayloadWithPrivateKey(
        signer.privateKeyHex,
        resultPayload
      )

      return {
        address: signature.address,
        signature,
        identityProof: {
          type: 'idena-arc-signature-proof-v0',
          status: 'verified',
          mode: adapter === 'rehearsal-devnet' ? proofMode : 'internal-signer',
        },
      }
    }

    if (proofMode === 'node-signature') {
      const signature = await createNodeSignature(payload, resultPayload)

      if (
        resultPayload.playerAddress &&
        normalizeAddress(resultPayload.playerAddress) !==
          normalizeAddress(signature.address)
      ) {
        throw new Error(
          'Node signer address does not match participant address'
        )
      }

      return {
        address: signature.address,
        signature,
        identityProof: {
          type: 'idena-node-signature-proof-v0',
          status: 'verified',
          mode: proofMode,
        },
      }
    }

    if (proofMode === 'tx-anchor') {
      if (!resultPayload.playerAddress) {
        throw new Error('Address is required for tx-anchor proof mode')
      }

      const identityProof = buildTransactionProofAnchor({
        resultPayload,
        trace,
        proof: {
          txHash: payload.proofTxHash,
          cid: payload.proofCid,
          contract: payload.proofContract,
        },
      })

      return {
        address: resultPayload.playerAddress,
        signature: null,
        identityProof,
      }
    }

    throw new Error(`Unsupported IdenaArc proof mode: ${proofMode}`)
  }

  async function resolveParticipantAddressForResult(payload, participant = {}) {
    const adapter = String(
      payload.adapter || payload.identityAdapter || 'external'
    )
    const payloadAddress = trimString(payload.address)
    const participantAddress = trimString(participant.address)

    if (payloadAddress) {
      return normalizeAddress(payloadAddress)
    }

    if (participantAddress) {
      return normalizeAddress(participantAddress)
    }

    if (payload.signerPrivateKey || payload.privateKey) {
      return normalizeAddress(
        privateKeyToAddress(payload.signerPrivateKey || payload.privateKey)
      )
    }

    if (adapter === 'rehearsal-devnet') {
      return normalizeAddress(getDevnetSignerDetails().address)
    }

    if (normalizeProofMode(payload, adapter) === 'node-signature') {
      const connection = resolveRpcConnection(payload)

      if (isLoopbackRpcUrl(connection.url)) {
        const coinbase = await callNodeRpc(
          connection,
          'dna_getCoinbaseAddr',
          []
        ).catch(() => '')

        if (coinbase) {
          return normalizeAddress(coinbase)
        }
      }
    }

    return null
  }

  function resolveRpcConnection(payload = {}) {
    const adapter = String(
      payload.adapter || payload.identityAdapter || 'external'
    )

    if (adapter === 'rehearsal-devnet') {
      if (
        !validationDevnet ||
        typeof validationDevnet.getConnectionDetails !== 'function'
      ) {
        throw new Error('Validation rehearsal network is not available')
      }

      const connection = validationDevnet.getConnectionDetails()
      return {
        adapter,
        url: connection.url,
        apiKey: connection.apiKey,
      }
    }

    return {
      adapter: 'external',
      url: String(payload.rpcUrl || payload.url || '').trim(),
      apiKey: String(payload.apiKey || payload.key || '').trim(),
    }
  }

  async function resolveIdentity(payload = {}) {
    const adapter = String(
      payload.adapter || payload.identityAdapter || 'external'
    )
    let connection
    try {
      connection = resolveRpcConnection(payload)
    } catch (error) {
      if (adapter !== 'rehearsal-devnet') {
        throw error
      }

      connection = {
        adapter,
        url: '',
        apiKey: '',
        error: error.message,
      }
    }
    let address = String(payload.address || '').trim()

    if (!address && connection.adapter === 'rehearsal-devnet') {
      const signer = getOptionalDevnetSignerDetails()
      address = signer && signer.address ? signer.address : ''
    }

    if (
      !address &&
      connection.adapter === 'external' &&
      isLoopbackRpcUrl(connection.url)
    ) {
      address = await callNodeRpc(connection, 'dna_getCoinbaseAddr', []).catch(
        () => ''
      )
    }

    if (!address && connection.adapter === 'rehearsal-devnet') {
      const rehearsalEpoch = connection.url
        ? await callNodeRpc(connection, 'dna_epoch', []).catch((error) => ({
            error: error.message,
          }))
        : {
            error:
              connection.error ||
              'Rehearsal identity is not available before the devnet signer is ready',
          }

      return {
        ok: true,
        adapter: connection.adapter,
        address: null,
        epoch: rehearsalEpoch,
        identity: null,
        identityStatus: null,
        unresolved: true,
        reason: 'rehearsal_identity_unavailable',
      }
    }

    if (!address) {
      throw new Error(
        'Idena address is required, or connect to a local node that exposes dna_getCoinbaseAddr'
      )
    }

    const [epoch, identity] = await Promise.all([
      callNodeRpc(connection, 'dna_epoch', []).catch((error) => ({
        error: rpcErrorMessage(error),
      })),
      callNodeRpc(connection, 'dna_identity', [address]).catch((error) => ({
        error: rpcErrorMessage(error),
      })),
    ])
    const rpcUnavailable =
      isFailedRpcResult(epoch) &&
      isFailedRpcResult(identity) &&
      epoch.error === identity.error
    let hint = null

    if (rpcUnavailable) {
      hint =
        connection.adapter === 'external'
          ? 'If the validation rehearsal devnet is running, choose the Rehearsal devnet adapter instead of External RPC.'
          : 'The rehearsal devnet RPC is not reachable yet.'
    }

    return {
      ok: !rpcUnavailable,
      adapter: connection.adapter,
      address,
      epoch,
      identity,
      identityStatus:
        identity && typeof identity.state === 'string' ? identity.state : null,
      rpcReachable: !rpcUnavailable,
      error: rpcUnavailable
        ? `Idena RPC is unavailable at ${connection.url}: ${epoch.error}`
        : null,
      hint,
    }
  }

  function ensureParticipant(session, payload = {}) {
    const participantId = safeId(
      payload.participantId || payload.address || 'player-1',
      'player-1'
    )
    const participants =
      session.participants && typeof session.participants === 'object'
        ? {...session.participants}
        : {}
    const existing = participants[participantId] || {}

    participants[participantId] = {
      participantId,
      address: String(payload.address || existing.address || '').trim() || null,
      identityStatus: payload.identityStatus || existing.identityStatus || null,
      adapter: payload.adapter || existing.adapter || 'external',
      joinedAt: existing.joinedAt || isoNow(),
      ...existing,
    }
    session.participants = participants

    return participants[participantId]
  }

  async function createSession(payload = {}) {
    const createdAt = isoNow()
    const sessionId =
      safeId(payload.sessionId, '') ||
      `idena-arc-local-${Date.now().toString(36)}`
    const startTime = payload.startTime
      ? new Date(payload.startTime)
      : new Date(Date.now())
    const endTime = new Date(
      startTime.getTime() +
        (Number(payload.playDurationMs) > 0
          ? Number(payload.playDurationMs)
          : DEFAULT_PLAY_DURATION_MS)
    )
    const submissionCutoff = new Date(
      endTime.getTime() +
        (Number(payload.gracePeriodMs) > 0
          ? Number(payload.gracePeriodMs)
          : DEFAULT_GRACE_PERIOD_MS)
    )
    const generator = {
      ...getGeneratorDescriptor(payload),
      ...(payload.generator || {}),
    }
    const session = {
      protocol: PROTOCOL,
      sessionId,
      createdAt,
      updatedAt: createdAt,
      relay: {
        type: 'local-file-v0',
      },
      manifest: {
        protocol: PROTOCOL,
        sessionId,
        generator,
        rehearsalEpochOrRound:
          payload.rehearsalEpochOrRound || payload.epoch || null,
        networkEntropy: payload.networkEntropy || `local-clock:${createdAt}`,
        sessionNonce:
          payload.sessionNonce || sha256Hex(`${sessionId}:${createdAt}`),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        submissionCutoff: submissionCutoff.toISOString(),
      },
      participants: {},
      finalSeed: null,
      game: null,
      results: [],
    }

    if (payload.participantId || payload.address) {
      ensureParticipant(session, payload)
    }

    await writeSession(session)
    return session
  }

  async function joinSession(payload = {}) {
    const session = await readSession(payload.sessionId)
    const participant = ensureParticipant(session, payload)

    await writeSession(session)
    return {
      session,
      participant,
    }
  }

  async function commitSalt(payload = {}) {
    const session = await readSession(payload.sessionId)
    const participant = ensureParticipant(session, payload)
    const salt = String(payload.salt || randomSaltHex()).trim()
    const commitment = buildSaltCommitment(salt)

    participant.commitment = commitment
    participant.committedAt = isoNow()
    participant.revealedSaltHash = null
    participant.revealedAt = null

    await writeSession(session)

    return {
      session,
      participant,
      salt,
      commitment,
    }
  }

  async function revealSalt(payload = {}) {
    const session = await readSession(payload.sessionId)
    const participant = ensureParticipant(session, payload)
    const salt = String(payload.salt || '').trim()

    assertSaltCommitment(salt, participant.commitment)

    participant.revealedSaltHash = sha256Prefixed(salt)
    participant.revealedAt = isoNow()
    participant.revealAccepted = true

    await writeSession(session)

    return {
      session,
      participant,
      salt,
    }
  }

  async function computeFinalSeed(payload = {}) {
    const session = await readSession(payload.sessionId)
    const participants = Object.values(session.participants || {})
    const revealPayloads = (
      Array.isArray(payload.reveals) ? payload.reveals : []
    )
      .map((item) => ({
        participantId: safeId(item.participantId || item.address, ''),
        salt: item.salt,
      }))
      .filter((item) => item.participantId && item.salt)
    const revealsByParticipant = new Map(
      revealPayloads.map((item) => [item.participantId, item.salt])
    )
    const reveals = participants
      .map((participant) => {
        const salt = revealsByParticipant.get(participant.participantId)

        if (!salt) {
          return null
        }

        assertSaltCommitment(salt, participant.commitment)
        return {
          participantId: participant.participantId,
          salt,
        }
      })
      .filter(Boolean)

    if (reveals.length < 1) {
      throw new Error('At least one salt reveal is required')
    }

    const seed = deriveFinalSeed({
      sessionId: session.sessionId,
      generator: session.manifest.generator,
      rehearsalEpochOrRound: session.manifest.rehearsalEpochOrRound,
      commitments: participants
        .filter((participant) => participant.commitment)
        .map((participant) => ({
          participantId: participant.participantId,
          commitment: participant.commitment,
        })),
      reveals,
      networkEntropy: session.manifest.networkEntropy,
      sessionNonce: session.manifest.sessionNonce,
    })

    session.finalSeed = {
      ...seed,
      computedAt: isoNow(),
    }

    await writeSession(session)

    return {
      session,
      ...session.finalSeed,
    }
  }

  function runSidecar(payload) {
    const command = pythonCommand || process.env.IDENA_ARC_PYTHON || 'python3'

    return new Promise((resolve, reject) => {
      const child = spawn(command, [sidecarPath], {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `IdenaArc sidecar exited with code ${code}: ${stderr.slice(
                0,
                400
              )}`
            )
          )
          return
        }

        resolve(parseJsonOutput(stdout, stderr))
      })
      child.stdin.end(`${JSON.stringify(payload)}\n`)
    })
  }

  async function generateGame(payload = {}) {
    let session = await readSession(payload.sessionId)

    if (!session.finalSeed) {
      const computed = await computeFinalSeed(payload)
      session = computed.session
    }

    const game = await runSidecar({
      command: 'generate',
      seed: session.finalSeed.finalSeed,
      generator: session.manifest.generator,
    })

    session.game = {
      ...game,
      generatedAt: isoNow(),
    }

    await writeSession(session)

    return {
      session,
      game: session.game,
    }
  }

  async function replayTrace(session, actions) {
    const game =
      session.game || (await generateGame({sessionId: session.sessionId})).game

    return runSidecar({
      command: 'replay',
      seed: session.finalSeed.finalSeed,
      generator: session.manifest.generator,
      initialState: game.initialState,
      actions,
    })
  }

  function verifyResultSignature(resultPayload, signature, expectedAddress) {
    if (!signature) {
      return false
    }

    if (signature.type === 'idena-node-dna-sign-v0') {
      const expectedMessage = buildResultProofMessage(resultPayload)

      return (
        signature.message === expectedMessage &&
        signature.messageHash ===
          idenaSignatureHashPrefixed(expectedMessage, signature.format) &&
        verifyIdenaSignature(
          signature.message,
          signature.value,
          expectedAddress,
          signature.format
        )
      )
    }

    return verifyPayloadSignature(resultPayload, signature, expectedAddress)
  }

  async function submitTrace(payload = {}) {
    let session = await readSession(payload.sessionId)

    if (!session.game) {
      session = (await generateGame(payload)).session
    }

    const participant = ensureParticipant(session, payload)
    participant.address = await resolveParticipantAddressForResult(
      payload,
      participant
    )
    const actions = normalizeActions(payload.actions)
    const replay = await replayTrace(session, actions)
    const trace = {
      protocol: TRACE_PROTOCOL,
      sessionId: session.sessionId,
      playerAddress: participant.address,
      participantId: participant.participantId,
      initialStateHash: session.game.initialStateHash,
      actions: replay.actions || actions,
      finalStateHash: replay.finalStateHash,
      score: replay.score,
      feedback:
        payload.feedback && typeof payload.feedback === 'object'
          ? payload.feedback
          : {},
    }
    const traceHash = hashJsonPrefixed(trace)
    const resultId = `${participant.participantId}-${Date.now().toString(36)}`
    const resultPayload = {
      protocol: RESULT_PROTOCOL,
      sessionId: session.sessionId,
      playerAddress: participant.address,
      playerIdentityStatus: participant.identityStatus,
      generatorCid: session.manifest.generator.cid,
      generatorHash: session.manifest.generator.hash,
      generatorVersion: session.manifest.generator.version,
      seedCommitments: Object.values(session.participants || {})
        .map((item) => item.commitment)
        .filter(Boolean),
      finalSeedHash: session.finalSeed.finalSeedHash,
      startTime: session.manifest.startTime,
      endTime: session.manifest.endTime,
      score: replay.score,
      result: replay.completed ? 'completed' : 'attempted',
      traceHash,
      clientVersion: 'idena-arc-client-v0.1.0',
      createdAt: isoNow(),
    }
    const identityProof = await buildResultIdentityProof(
      payload,
      resultPayload,
      trace
    )
    const result = {
      ...resultPayload,
      playerAddress: identityProof.address,
      signature: identityProof.signature,
      identityProof: identityProof.identityProof,
    }
    const signatureValid = verifyResultSignature(
      resultPayload,
      identityProof.signature,
      result.playerAddress
    )
    const anchorValid = verifyTransactionProofAnchor(
      resultPayload,
      identityProof.identityProof
    )
    const replayVerified = true
    const recording = buildReplayRecording({session, trace, replay})
    const recordingHash = hashJsonPrefixed(recording)
    const recordingJsonlHash = sha256Prefixed(recording.jsonl)
    const recordingFilename = buildRecordingFilename({session, trace, resultId})
    const agentLog = buildAgentLog({session, trace, recording})
    const agentLogHash = sha256Prefixed(agentLog.text)
    const agentLogFilename = buildAgentLogFilename({session, trace, resultId})
    const verified = replayVerified && (signatureValid || anchorValid)
    const bundle = {
      protocol: 'idena-arc-trace-bundle-v0',
      resultId,
      verified,
      replayVerified,
      signatureValid,
      anchorValid,
      recordingHash,
      recordingJsonlHash,
      recordingFilename,
      agentLogHash,
      agentLogFilename,
      result,
      trace,
      replay,
      recording,
      agentLog,
    }

    await writeJson(traceBundlePath(session.sessionId, resultId), bundle)
    await fs.outputFile(
      recordingJsonlPath(session.sessionId, recordingFilename),
      recording.jsonl,
      'utf8'
    )
    await fs.outputFile(
      agentLogPath(session.sessionId, agentLogFilename),
      agentLog.text,
      'utf8'
    )

    session.results = (Array.isArray(session.results) ? session.results : [])
      .filter((item) => item.resultId !== resultId)
      .concat({
        resultId,
        participantId: participant.participantId,
        playerAddress: result.playerAddress,
        score: result.score,
        traceHash,
        recordingHash,
        recordingJsonlHash,
        recordingFilename,
        agentLogHash,
        agentLogFilename,
        verified,
        storedAt: isoNow(),
      })

    await writeSession(session)

    return {
      session,
      bundle,
    }
  }

  async function verifyTraceBundle(payload = {}) {
    const bundle = payload.bundle || (await readJson(payload.bundlePath, null))

    if (!bundle) {
      throw new Error('Trace bundle is required')
    }

    const session = await readSession(bundle.result.sessionId)
    const actions = normalizeActions(bundle.trace.actions)
    const replay = await replayTrace(session, actions)
    const expectedTrace = {
      ...bundle.trace,
      actions: replay.actions || actions,
      finalStateHash: replay.finalStateHash,
      score: replay.score,
    }
    const traceMatches =
      hashJsonPrefixed(expectedTrace) === bundle.result.traceHash &&
      replay.finalStateHash === bundle.trace.finalStateHash &&
      replay.score === bundle.result.score
    const expectedRecording = buildReplayRecording({
      session,
      trace: expectedTrace,
      replay,
    })
    const expectedRecordingHash = hashJsonPrefixed(expectedRecording)
    const expectedRecordingJsonlHash = sha256Prefixed(expectedRecording.jsonl)
    const expectedAgentLog = buildAgentLog({
      session,
      trace: expectedTrace,
      recording: expectedRecording,
    })
    const expectedAgentLogHash = sha256Prefixed(expectedAgentLog.text)
    const expectedAgentLogObjectHash = hashJsonPrefixed(expectedAgentLog)
    const suppliedRecordingObjectHash = bundle.recording
      ? hashJsonPrefixed(bundle.recording)
      : null
    const suppliedRecordingJsonlHash =
      bundle.recording && typeof bundle.recording.jsonl === 'string'
        ? sha256Prefixed(bundle.recording.jsonl)
        : null
    const suppliedAgentLogObjectHash = bundle.agentLog
      ? hashJsonPrefixed(bundle.agentLog)
      : null
    const suppliedAgentLogHash =
      bundle.agentLog && typeof bundle.agentLog.text === 'string'
        ? sha256Prefixed(bundle.agentLog.text)
        : null
    const recordingMatches =
      Boolean(bundle.recording) &&
      suppliedRecordingObjectHash === expectedRecordingHash &&
      suppliedRecordingJsonlHash === expectedRecordingJsonlHash &&
      (!bundle.recordingHash ||
        bundle.recordingHash === expectedRecordingHash) &&
      (!bundle.recordingJsonlHash ||
        bundle.recordingJsonlHash === expectedRecordingJsonlHash)
    const agentLogMatches =
      Boolean(bundle.agentLog) &&
      suppliedAgentLogObjectHash === expectedAgentLogObjectHash &&
      suppliedAgentLogHash === expectedAgentLogHash &&
      (!bundle.agentLogHash || bundle.agentLogHash === expectedAgentLogHash)
    const resultPayload = {...bundle.result}
    const {signature, identityProof} = resultPayload
    delete resultPayload.signature
    delete resultPayload.identityProof
    const signatureValid = verifyResultSignature(
      resultPayload,
      signature,
      bundle.result.playerAddress
    )
    const anchorValid = verifyTransactionProofAnchor(
      resultPayload,
      identityProof
    )

    return {
      ok:
        traceMatches &&
        recordingMatches &&
        agentLogMatches &&
        (signatureValid || anchorValid),
      traceMatches,
      recordingMatches,
      agentLogMatches,
      recordingHash: expectedRecordingHash,
      recordingJsonlHash: expectedRecordingJsonlHash,
      agentLogHash: expectedAgentLogHash,
      signatureValid,
      anchorValid,
      replay,
    }
  }

  async function loadTraceBundleForAnnotation(payload = {}) {
    if (payload.traceBundle || payload.bundle) {
      return payload.traceBundle || payload.bundle
    }

    const {sessionId, resultId} = payload

    if (!sessionId || !resultId) {
      throw new Error('Session id and result id are required')
    }

    const bundle = await readJson(traceBundlePath(sessionId, resultId), null)

    if (!bundle) {
      throw new Error(`Trace bundle not found: ${sessionId}/${resultId}`)
    }

    return bundle
  }

  async function buildAnnotationBundle(payload = {}) {
    const traceBundle = await loadTraceBundleForAnnotation(payload)
    const traceVerification = await verifyTraceBundle({bundle: traceBundle})
    const result = traceBundle.result || {}
    const trace = traceBundle.trace || {}
    const annotationStatus = normalizeAnnotationStatus(payload.status)
    const resultId = traceBundle.resultId || result.resultId || payload.resultId
    const sessionId = result.sessionId || trace.sessionId || payload.sessionId
    const participantId =
      trace.participantId || payload.participantId || result.playerAddress
    const context = {
      status: annotationStatus,
      sessionId,
      resultId,
      participantId,
    }
    const humanRuleAnnotation = normalizeHumanRuleAnnotation(
      payload.humanRuleAnnotation || {},
      context
    )
    const aiSelfAnnotation = normalizeAiSelfAnnotation(
      payload.aiSelfAnnotation || {},
      context
    )
    const comparisonAnnotation = normalizeComparisonAnnotation(
      payload.comparisonAnnotation || {},
      context
    )
    const annotationPayload = {
      protocol: ANNOTATION_BUNDLE_PROTOCOL,
      access: 'local-only-private-by-default',
      releasePolicy: 'private-by-default-explicit-publish-only',
      status: annotationStatus,
      sessionId,
      resultId,
      participantId,
      createdAt: payload.createdAt || isoNow(),
      updatedAt: payload.updatedAt || isoNow(),
      traceHash: result.traceHash || null,
      recordingHash: traceBundle.recordingHash || null,
      recordingJsonlHash: traceBundle.recordingJsonlHash || null,
      agentLogHash: traceBundle.agentLogHash || null,
      finalSeedHash: result.finalSeedHash || null,
      generatorHash: result.generatorHash || null,
      humanRuleAnnotation,
      aiSelfAnnotation,
      comparisonAnnotation,
    }
    const annotationHash = hashJsonPrefixed(annotationPayload)
    const traceHashesMatch =
      annotationPayload.traceHash === result.traceHash &&
      annotationPayload.recordingHash === traceBundle.recordingHash &&
      annotationPayload.agentLogHash === traceBundle.agentLogHash &&
      annotationPayload.finalSeedHash === result.finalSeedHash
    const hasTrainingSignal = hasAnnotationTrainingSignal(annotationPayload)
    const acceptedForTraining =
      annotationStatus === 'final' &&
      traceVerification.traceMatches &&
      traceVerification.recordingMatches &&
      traceVerification.agentLogMatches &&
      traceHashesMatch &&
      hasTrainingSignal
    const trainingExample = acceptedForTraining
      ? buildTrainingExample(annotationPayload, annotationHash, traceBundle)
      : null

    return {
      protocol: 'idena-arc-annotation-record-v0',
      annotationId: `${safeId(resultId, 'result')}-${annotationHash.slice(
        7,
        19
      )}`,
      annotationHash,
      acceptedForTraining,
      traceReplayVerified: Boolean(traceVerification.traceMatches),
      recordingVerified: Boolean(traceVerification.recordingMatches),
      agentLogVerified: Boolean(traceVerification.agentLogMatches),
      traceHashesMatch,
      hasTrainingSignal,
      privateByDefault: true,
      uploaded: false,
      annotation: annotationPayload,
      trainingExample,
      verification: {
        traceMatches: traceVerification.traceMatches,
        recordingMatches: traceVerification.recordingMatches,
        agentLogMatches: traceVerification.agentLogMatches,
        signatureValid: traceVerification.signatureValid,
        anchorValid: traceVerification.anchorValid,
      },
    }
  }

  async function saveAnnotationBundle(payload = {}) {
    const bundle = await buildAnnotationBundle(payload)

    await writeJson(
      annotationBundlePath(bundle.annotation.sessionId, bundle.annotationId),
      bundle
    )

    return {
      ...bundle,
      stored: {
        namespace: 'idena-arc/annotations',
        sessionId: bundle.annotation.sessionId,
        filename: `${safeId(bundle.annotationId, 'annotation')}.json`,
      },
    }
  }

  async function verifyAnnotationBundle(payload = {}) {
    const bundle =
      payload.annotationBundle ||
      payload.bundle ||
      (payload.annotationPath
        ? await readJson(payload.annotationPath, null)
        : null) ||
      (payload.sessionId && payload.annotationId
        ? await readJson(
            annotationBundlePath(payload.sessionId, payload.annotationId),
            null
          )
        : null)

    if (!bundle || !bundle.annotation) {
      throw new Error('Annotation bundle is required')
    }

    const rebuilt = await buildAnnotationBundle({
      ...bundle.annotation,
      status: bundle.annotation.status,
      traceBundle: payload.traceBundle,
      sessionId: bundle.annotation.sessionId,
      resultId: bundle.annotation.resultId,
      humanRuleAnnotation: bundle.annotation.humanRuleAnnotation,
      aiSelfAnnotation: bundle.annotation.aiSelfAnnotation,
      comparisonAnnotation: bundle.annotation.comparisonAnnotation,
      createdAt: bundle.annotation.createdAt,
      updatedAt: bundle.annotation.updatedAt,
    })
    const suppliedAnnotationHash = hashJsonPrefixed(bundle.annotation)
    const annotationHashMatches =
      rebuilt.annotationHash === bundle.annotationHash &&
      suppliedAnnotationHash === bundle.annotationHash

    return {
      ok:
        annotationHashMatches &&
        rebuilt.traceReplayVerified &&
        rebuilt.recordingVerified &&
        rebuilt.agentLogVerified,
      annotationHashMatches,
      acceptedForTraining: rebuilt.acceptedForTraining,
      traceReplayVerified: rebuilt.traceReplayVerified,
      recordingVerified: rebuilt.recordingVerified,
      agentLogVerified: rebuilt.agentLogVerified,
      traceHashesMatch: rebuilt.traceHashesMatch,
      hasTrainingSignal: rebuilt.hasTrainingSignal,
      annotationHash: rebuilt.annotationHash,
      suppliedAnnotationHash,
    }
  }

  async function listAnnotationBundles(payload = {}) {
    const root = payload.sessionId
      ? path.join(annotationDir(), safeId(payload.sessionId, 'session'))
      : annotationDir()

    await fs.ensureDir(root)
    const files = payload.sessionId
      ? (await fs.readdir(root)).map((file) => path.join(root, file))
      : (
          await Promise.all(
            (
              await fs.readdir(root)
            ).map(async (entry) => {
              const entryPath = path.join(root, entry)
              const stat = await fs.stat(entryPath).catch(() => null)
              return stat && stat.isDirectory()
                ? (await fs.readdir(entryPath)).map((file) =>
                    path.join(entryPath, file)
                  )
                : []
            })
          )
        ).flat()
    const bundles = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map((file) => readJson(file, null))
    )

    return bundles
      .filter(Boolean)
      .sort((left, right) =>
        String(
          right.annotation && right.annotation.updatedAt
            ? right.annotation.updatedAt
            : ''
        ).localeCompare(
          String(
            left.annotation && left.annotation.updatedAt
              ? left.annotation.updatedAt
              : ''
          )
        )
      )
  }

  async function exportTrainingDataset(payload = {}) {
    const bundles = payload.annotationBundle
      ? [payload.annotationBundle]
      : await listAnnotationBundles({sessionId: payload.sessionId})
    const examples = bundles
      .filter((bundle) => bundle && bundle.trainingExample)
      .filter((bundle) =>
        payload.includeDrafts ? true : bundle.annotation.status === 'final'
      )
      .map((bundle) => bundle.trainingExample)
    const exportId =
      payload.exportId ||
      `idena-arc-training-${Date.now().toString(36)}-${examples.length}`
    const dataset = {
      protocol: TRAINING_DATASET_EXPORT_PROTOCOL,
      exportId,
      access: 'local-only-private-by-default',
      releasePolicy: 'private-by-default-explicit-publish-only',
      privateFieldsIncluded: false,
      createdAt: isoNow(),
      exampleCount: examples.length,
      capabilityTags: Array.from(
        new Set(examples.flatMap((example) => example.capabilityTags || []))
      ).sort(),
      examples,
    }
    const datasetHash = hashJsonPrefixed(dataset)

    await writeJson(trainingDatasetPath(exportId), {
      ...dataset,
      datasetHash,
    })

    return {
      ...dataset,
      datasetHash,
      stored: {
        namespace: 'idena-arc/training-datasets',
        filename: `${safeId(exportId, 'export')}.json`,
      },
    }
  }

  async function uploadTraceBundle(payload = {}) {
    const bundle = payload.bundle || (await readJson(payload.bundlePath, null))

    if (!bundle) {
      throw new Error('Trace bundle is required')
    }

    const connection = resolveRpcConnection(payload)
    const result = await callNodeRpc(connection, 'ipfs_add', [
      canonicalJson(bundle),
      Boolean(payload.pin),
    ])

    return {
      ok: true,
      cid: result && (result.cid || result.Hash || result.hash || result),
      result,
    }
  }

  async function status() {
    await fs.ensureDir(resolveBaseDir())
    const rehearsalDevnet =
      validationDevnet && typeof validationDevnet.getStatus === 'function'
        ? await validationDevnet.getStatus().catch((error) => ({
            active: false,
            error: rpcErrorMessage(error),
          }))
        : null
    const rehearsalConnection =
      validationDevnet &&
      typeof validationDevnet.getConnectionDetails === 'function'
        ? (() => {
            try {
              const connection = validationDevnet.getConnectionDetails()
              return {
                adapter: 'rehearsal-devnet',
                url: connection.url,
                apiKey: connection.apiKey,
              }
            } catch {
              return null
            }
          })()
        : null
    const rehearsalSigner = getOptionalDevnetSignerDetails()

    return {
      ok: true,
      protocol: PROTOCOL,
      baseDir: resolveBaseDir(),
      generator: getGeneratorDescriptor(),
      rehearsalDevnet,
      rehearsalConnection,
      rehearsalSigner: rehearsalSigner
        ? {
            adapter: rehearsalSigner.adapter,
            address: rehearsalSigner.address,
          }
        : null,
      recommendedAdapter: rehearsalConnection ? 'rehearsal-devnet' : 'external',
      sessions: (await listSessions()).slice(0, 10),
    }
  }

  return {
    status,
    listSessions,
    resolveIdentity,
    createSession,
    joinSession,
    commitSalt,
    revealSalt,
    computeFinalSeed,
    generateGame,
    submitTrace,
    verifyTraceBundle,
    saveAnnotationBundle,
    verifyAnnotationBundle,
    listAnnotationBundles,
    exportTrainingDataset,
    uploadTraceBundle,
  }
}

module.exports = {
  PROTOCOL,
  TRACE_PROTOCOL,
  RESULT_PROTOCOL,
  createIdenaArcManager,
}
