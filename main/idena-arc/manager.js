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
const LOCAL_AI_GAMEPLAY_ANNOTATION_PROTOCOL =
  'idena-arc-local-ai-gameplay-annotation-v0'
const HUMAN_REPLAY_ANNOTATION_PROTOCOL = 'idena-arc-human-replay-annotation-v0'
const NOEMON_STYLE_ANNOTATION_PROTOCOL = 'idena-arc-noemon-style-annotation-v0'
const ANNOTATION_VALIDATION_PROTOCOL = 'idena-arc-annotation-validation-v0'
const FRAME_CONTEXT_PROTOCOL = 'idena-arc-compact-frame-context-v0'
const TRAINING_EXAMPLE_PROTOCOL = 'idena-arc-training-example-v0'
const TRAINING_DATASET_EXPORT_PROTOCOL = 'idena-arc-training-dataset-export-v0'
const TEACHER_JOURNEY_PROTOCOL = 'idena-arc-teacher-journey-v1'
const ARC_TEACHER_TASK_TYPES = [
  'action_effect_prediction',
  'hypothesis_update',
  'world_model_compression',
  'discriminating_probe_policy',
  'misconception_detection',
  'transfer_check',
]
const PRIVATE_SIGNING_FIELD_KEYS = new Set([
  'nodeKey',
  'nodeKeyHex',
  'private_key',
  'privateKey',
  'privateKeyHex',
  'signer_private_key',
  'signerPrivateKey',
  'signerPrivateKeyHex',
])
const DEFAULT_PLAY_DURATION_MS = 3 * 60 * 1000
const DEFAULT_GRACE_PERIOD_MS = 30 * 1000
const DEFAULT_GENERATOR_VERSION = '0.1.0'
const MAX_ACTIONS = 512
const ARC_AGI_RUNTIME_DIRNAME = 'arc-agi-runtime'
const ARC_AGI_SETUP_TIMEOUT_MS = 20 * 60 * 1000
const ARC_AGI_PYTHON_INSTALL_TIMEOUT_MS = 45 * 60 * 1000
const ARC_AGI_PROBE_TIMEOUT_MS = 15 * 1000
const DEFAULT_CAPABILITY_TAGS = [
  'spatial-planning',
  'color-rule-inference',
  'delayed-effect',
  'object-transformation',
  'causal-trigger',
]
const IDENA_ARC_PROOF_CONTRACT_PLACEHOLDER = '<idena-arc-proof-contract>'
const ARC_ACTION_ALIASES = {
  reset: 'RESET',
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
const ARC_ACTION_BUTTON_DESCRIPTIONS = {
  ACTION1: {
    action: 'ACTION1',
    buttonLabel: 'Up',
    keys: ['W', 'ArrowUp'],
    description:
      'Up button / ACTION1. Compare the observed frame change, not only the expected direction.',
  },
  ACTION2: {
    action: 'ACTION2',
    buttonLabel: 'Down',
    keys: ['S', 'ArrowDown'],
    description:
      'Down button / ACTION2. Compare the observed frame change, not only the expected direction.',
  },
  ACTION3: {
    action: 'ACTION3',
    buttonLabel: 'Left',
    keys: ['A', 'ArrowLeft'],
    description:
      'Left button / ACTION3. Compare the observed frame change, not only the expected direction.',
  },
  ACTION4: {
    action: 'ACTION4',
    buttonLabel: 'Right',
    keys: ['D', 'ArrowRight'],
    description:
      'Right button / ACTION4. Compare the observed frame change, not only the expected direction.',
  },
  ACTION5: {
    action: 'ACTION5',
    buttonLabel: 'Action',
    keys: ['Space', 'F', 'Enter'],
    description:
      'Primary action / ACTION5. Compare which object or rule it tested.',
  },
  ACTION6: {
    action: 'ACTION6',
    buttonLabel: 'Board click',
    keys: ['Mouse', 'Touch'],
    description:
      'Coordinate action / ACTION6. Compare the clicked cell and resulting frame change.',
  },
  ACTION7: {
    action: 'ACTION7',
    buttonLabel: 'Undo',
    keys: ['Ctrl+Z', 'Cmd+Z'],
    description:
      'Undo / ACTION7. Compare whether it corrected exploration or hid an error.',
  },
  RESET: {
    action: 'RESET',
    buttonLabel: 'Reset',
    keys: ['R'],
    description:
      'Reset. Starts over and should be marked separately from a failed attempt.',
  },
}

function isoNow() {
  return new Date().toISOString()
}

function commandParts(command) {
  const parts = trimString(command).split(/\s+/u).filter(Boolean)

  return {
    command: parts[0] || '',
    args: parts.slice(1),
  }
}

function getVenvPythonPath(venvDir) {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python')
}

function toAsarUnpackedPath(filePath) {
  const asarSegment = `${path.sep}app.asar${path.sep}`

  if (filePath.includes(asarSegment)) {
    return filePath.replace(
      asarSegment,
      `${path.sep}app.asar.unpacked${path.sep}`
    )
  }

  const asarSuffix = `${path.sep}app.asar`

  return filePath.endsWith(asarSuffix) ? `${filePath}.unpacked` : filePath
}

function resolveExternalProcessCwd(rootDir) {
  const unpackedRootDir = toAsarUnpackedPath(rootDir)

  if (unpackedRootDir !== rootDir) {
    return path.dirname(rootDir)
  }

  return rootDir
}

function resolveBundledPath(rootDir, ...segments) {
  const bundledPath = path.join(rootDir, ...segments)
  const unpackedPath = toAsarUnpackedPath(bundledPath)

  if (unpackedPath !== bundledPath && fs.existsSync(unpackedPath)) {
    return unpackedPath
  }

  return bundledPath
}

function outputTail(value, maxChars = 2400) {
  const text = trimString(value)

  return text.length > maxChars ? text.slice(text.length - maxChars) : text
}

function runCapturedCommand({
  command,
  args = [],
  cwd = process.cwd(),
  env = process.env,
  timeoutMs = ARC_AGI_PROBE_TIMEOUT_MS,
  label = 'command',
  onOutput = null,
}) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
          }, timeoutMs)
        : null

    function settle(callback, value) {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stdout += text
      if (typeof onOutput === 'function') onOutput(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderr += text
      if (typeof onOutput === 'function') onOutput(text)
    })
    child.on('error', (error) => settle(reject, error))
    child.on('close', (code, signal) => {
      if (timedOut) {
        settle(
          reject,
          new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)
        )
        return
      }

      settle(resolve, {
        code,
        signal,
        stdout: outputTail(stdout),
        stderr: outputTail(stderr),
      })
    })
  })
}

async function runRequiredCommand(options) {
  const result = await runCapturedCommand(options)

  if (result.code !== 0) {
    const details = outputTail(`${result.stderr}\n${result.stdout}`)
    throw new Error(
      `${options.label || 'Command'} failed with code ${result.code}${
        details ? `: ${details}` : ''
      }`
    )
  }

  return result
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

function normalizeVisualMarker(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const x = normalizeNullableInteger(value.x, {min: 0, max: 4096})
  const y = normalizeNullableInteger(value.y, {min: 0, max: 4096})

  if (x === null || y === null) {
    return null
  }

  const frameWidth = normalizeNullableInteger(
    value.frameWidth || value.frame_width,
    {min: 1, max: 4096}
  )
  const frameHeight = normalizeNullableInteger(
    value.frameHeight || value.frame_height,
    {min: 1, max: 4096}
  )
  const fallbackId = `${x}:${y}`

  return {
    protocol: 'idena-arc-visual-marker-v0',
    markerId: boundedString(
      value.markerId || value.marker_id || value.id || fallbackId,
      40
    ),
    label: boundedString(value.label || value.markerLabel || fallbackId, 20),
    x,
    y,
    frameWidth,
    frameHeight,
    role: boundedString(value.role || 'evidence', 80),
    note: boundedString(value.note || value.description || value.event, 600),
  }
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

        const visualMarker = normalizeVisualMarker(
          item.visualMarker ||
            item.visual_marker ||
            item.marker ||
            (item.x !== undefined || item.y !== undefined ? item : null)
        )
        const description = boundedString(
          item.description ||
            item.event ||
            (visualMarker
              ? `Visual marker ${visualMarker.label} at ${visualMarker.x},${visualMarker.y}`
              : ''),
          600
        )
        const rawActionIndex =
          item.actionIndex !== undefined ? item.actionIndex : item.action_index
        const rawTimestamp = item.t_ms !== undefined ? item.t_ms : item.tMs

        return {
          actionIndex: normalizeNullableInteger(rawActionIndex),
          t_ms: normalizeNullableInteger(rawTimestamp, {
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
          }),
          description,
          observationHash: boundedString(
            item.observationHash || item.observation_hash,
            96
          ),
          ...(visualMarker ? {visualMarker} : {}),
        }
      })
      .filter((item) => item && (item.description || item.visualMarker))
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
    const actionIndex =
      typeof value.actionIndex !== 'undefined'
        ? value.actionIndex
        : value.action_index
    const selectedActionIndex =
      typeof actionIndex !== 'undefined' ? actionIndex : fallbackActionIndex
    return {
      protocol: 'idena-arc-recognition-moment-v1',
      actionIndex: normalizeNullableInteger(selectedActionIndex),
      t_ms: normalizeNullableInteger(value.t_ms || value.tMs, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
      }),
      description: boundedString(value.description || value.notes, 1000),
    }
  }

  return {
    protocol: 'idena-arc-recognition-moment-v1',
    actionIndex: normalizeNullableInteger(fallbackActionIndex),
    t_ms: null,
    description: boundedString(value, 1000),
  }
}

function normalizeNoemonStyleExplanation(input = {}, context = {}) {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : {ruleHypothesis: input}
  const summary = boundedString(
    source.summary || source.highLevelSummary || source.high_level_summary,
    1200
  )
  const gridSize = boundedString(
    source.gridSize || source.grid_size || source.outputSize,
    600
  )
  const invariants = normalizeStringList(source.invariants, {
    maxItems: 32,
    maxLength: 400,
  })
  const ruleHypothesis = boundedString(
    source.ruleHypothesis ||
      source.rule_hypothesis ||
      source.transformationRule ||
      source.transformation_rule,
    4000
  )
  const transformationAlgorithm = boundedString(
    source.transformationAlgorithm ||
      source.transformation_algorithm ||
      source.algorithm,
    4000
  )
  const actionPolicy = boundedString(
    source.actionPolicy || source.action_policy || source.policy,
    4000
  )
  const rejectedAlternatives = normalizeStringList(
    source.rejectedAlternatives ||
      source.rejected_alternatives ||
      source.rejectedAlternative ||
      source.rejected_alternative,
    {maxItems: 32, maxLength: 700}
  )
  const evidenceEvents = normalizeEvidenceEvents(
    source.evidenceEvents || source.evidence_events
  )
  const filledFieldCount = [
    summary,
    gridSize,
    ruleHypothesis,
    transformationAlgorithm,
    actionPolicy,
    invariants.length,
    rejectedAlternatives.length,
    evidenceEvents.length,
  ].filter(Boolean).length

  return {
    protocol: NOEMON_STYLE_ANNOTATION_PROTOCOL,
    role: boundedString(context.role || source.role, 80),
    summary,
    gridSize,
    invariants,
    ruleHypothesis,
    transformationAlgorithm,
    actionPolicy,
    rejectedAlternatives,
    evidenceEvents,
    filledFieldCount,
  }
}

function hasNoemonStyleSignal(value = {}) {
  return Boolean(
    value &&
      (value.summary ||
        value.gridSize ||
        value.ruleHypothesis ||
        value.transformationAlgorithm ||
        value.actionPolicy ||
        (Array.isArray(value.invariants) && value.invariants.length) ||
        (Array.isArray(value.rejectedAlternatives) &&
          value.rejectedAlternatives.length) ||
        (Array.isArray(value.evidenceEvents) && value.evidenceEvents.length))
  )
}

function noemonStyleExplanationToText(value = {}) {
  if (!hasNoemonStyleSignal(value)) {
    return ''
  }

  return [
    value.summary ? `Summary: ${value.summary}` : '',
    value.gridSize ? `Grid size: ${value.gridSize}` : '',
    Array.isArray(value.invariants) && value.invariants.length
      ? `Invariants: ${value.invariants.join('; ')}`
      : '',
    value.ruleHypothesis ? `Rule hypothesis: ${value.ruleHypothesis}` : '',
    value.transformationAlgorithm
      ? `Transformation algorithm: ${value.transformationAlgorithm}`
      : '',
    value.actionPolicy ? `Action policy: ${value.actionPolicy}` : '',
    Array.isArray(value.rejectedAlternatives) &&
    value.rejectedAlternatives.length
      ? `Rejected alternatives: ${value.rejectedAlternatives.join('; ')}`
      : '',
    Array.isArray(value.evidenceEvents) && value.evidenceEvents.length
      ? `Evidence: ${value.evidenceEvents
          .map((item) => item.description)
          .filter(Boolean)
          .join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
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

function compressExplanationText(explanationText, {maxChars = 900} = {}) {
  const normalized = boundedString(explanationText, 12000)
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return {
      protocol: 'idena-arc-explanation-compression-v0',
      status: 'empty',
      strategy: 'deterministic-extractive-v0',
      sourceFormat: 'plain-text-v0',
      sourceTextHash: null,
      sourceCharCount: 0,
      compressedText: '',
      compressedTextHash: null,
      compressedCharCount: 0,
      lossy: false,
      needsBetterCompressor: false,
    }
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
  const selected = []
  let length = 0

  for (const sentence of sentences.length ? sentences : [normalized]) {
    const separatorLength = selected.length ? 1 : 0
    if (length + separatorLength + sentence.length > maxChars) {
      break
    }
    selected.push(sentence)
    length += separatorLength + sentence.length
  }

  let compressedText = selected.join(' ')
  if (!compressedText) {
    compressedText = normalized.slice(0, maxChars)
  }

  const lossy = compressedText.length < normalized.length

  return {
    protocol: 'idena-arc-explanation-compression-v0',
    status: 'compressed',
    strategy: 'deterministic-extractive-v0',
    sourceFormat: 'plain-text-v0',
    sourceTextHash: sha256Prefixed(normalized),
    sourceCharCount: normalized.length,
    compressedText,
    compressedTextHash: sha256Prefixed(compressedText),
    compressedCharCount: compressedText.length,
    lossy,
    needsBetterCompressor: lossy,
  }
}

function buildCompressionMetadata(explanationText) {
  const compressed = compressExplanationText(explanationText)

  return {
    ...compressed,
    futureStrategy: 'replace-with-model-summary-plus-evidence-pointers',
  }
}

function normalizeLocalAiGameplayAnnotation(input = {}, context = {}) {
  const explanationText = boundedString(
    input.explanationText || input.explanation || input.notes,
    12000
  )
  const attemptedActions = normalizeActions(
    input.attemptedActions || input.actionTrace || input.actions || []
  )
  const structuredExplanation = normalizeNoemonStyleExplanation(
    input.structuredExplanation ||
      input.noemonStyle ||
      input.noemon_style ||
      input.noemon ||
      {},
    {...context, role: 'local-ai-gameplay'}
  )
  const structuredExplanationText = noemonStyleExplanationToText(
    structuredExplanation
  )

  return {
    protocol: LOCAL_AI_GAMEPLAY_ANNOTATION_PROTOCOL,
    status: context.status,
    sessionId: context.sessionId,
    gameId: context.sessionId,
    resultId: context.resultId,
    participantId: context.participantId,
    model: boundedString(
      input.model || input.localModel || input.local_model,
      160
    ),
    provider: boundedString(input.provider || 'local-ai', 120),
    mode: boundedString(input.mode || 'gameplay', 80),
    attemptedActions,
    actionButtonDescriptions: normalizeActionButtonDescriptions(
      input.actionButtonDescriptions || input.buttonDescriptions,
      attemptedActions
    ),
    explanationText,
    actionRationales: normalizeEvidenceEvents(
      input.actionRationales || input.action_rationales
    ),
    uncertaintyNotes: boundedString(
      input.uncertaintyNotes || input.uncertainty_notes,
      4000
    ),
    memoryNotes: boundedString(input.memoryNotes || input.memory_notes, 4000),
    compression: buildCompressionMetadata(explanationText),
    structuredExplanation,
    structuredCompression: buildCompressionMetadata(structuredExplanationText),
  }
}

function normalizeHumanReplayAnnotation(input = {}, context = {}) {
  const explanationText = boundedString(
    input.explanationText || input.explanation || input.notes,
    12000
  )
  const replayActions = normalizeActions(
    input.replayActions ||
      input.actionTrace ||
      input.actions ||
      context.replayActions ||
      []
  )
  const structuredExplanation = normalizeNoemonStyleExplanation(
    input.structuredExplanation ||
      input.noemonStyle ||
      input.noemon_style ||
      input.noemon ||
      {},
    {...context, role: 'human-replay'}
  )
  const structuredExplanationText = noemonStyleExplanationToText(
    structuredExplanation
  )

  return {
    protocol: HUMAN_REPLAY_ANNOTATION_PROTOCOL,
    status: context.status,
    sessionId: context.sessionId,
    gameId: context.sessionId,
    resultId: context.resultId,
    participantId: context.participantId,
    replayActions,
    actionButtonDescriptions: normalizeActionButtonDescriptions(
      input.actionButtonDescriptions || input.buttonDescriptions,
      replayActions
    ),
    explanationText,
    keyMoments: normalizeEvidenceEvents(input.keyMoments || input.key_moments),
    corrections: normalizeStringList(input.corrections, {
      maxItems: 64,
      maxLength: 800,
    }),
    betterActionPlan: boundedString(
      input.betterActionPlan || input.better_action_plan,
      4000
    ),
    compression: buildCompressionMetadata(explanationText),
    structuredExplanation,
    structuredCompression: buildCompressionMetadata(structuredExplanationText),
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
    actionButtonComparison: normalizeActionButtonComparison(
      input.actionButtonComparison || input.action_button_comparison || {}
    ),
    failureModeAnnotations: normalizeFailureModeAnnotations(
      input.failureModeAnnotations || input.failure_mode_annotations || []
    ),
  }
}

function normalizeJourneyActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .slice(0, MAX_ACTIONS)
    .map((item, index) => {
      const normalized = normalizeAction(item)

      if (!normalized) return null

      const next = {
        index: Math.max(
          0,
          Math.trunc(
            Number(typeof item.index !== 'undefined' ? item.index : index) ||
              index
          )
        ),
        ...normalized,
        arcAction:
          boundedString(
            item.arcAction || arcActionName(normalized.action),
            80
          ) || null,
        stateHash: boundedString(item.stateHash, 160) || null,
        reason: boundedString(item.reason || item.rationale, 1000),
        observation: boundedString(item.observation, 1000),
        intendedTest: boundedString(item.intendedTest || item.intent, 1000),
        expectedObservation: boundedString(
          item.expectedObservation || item.expectedEffect,
          1000
        ),
        observedEffect: boundedString(
          item.observedEffect || item.observationAfter,
          1000
        ),
        localEffect: boundedString(item.localEffect, 1000),
        worldModelHypothesis: boundedString(
          item.worldModelHypothesis || item.ruleHypothesis,
          1000
        ),
        hypothesisStatus: ['new', 'kept', 'changed', 'rejected'].includes(
          String(item.hypothesisStatus || '').trim()
        )
          ? String(item.hypothesisStatus).trim()
          : '',
        analogyRisk: ['low', 'medium', 'high'].includes(
          String(item.analogyRisk || '').trim()
        )
          ? String(item.analogyRisk).trim()
          : '',
        nextDiscriminatingTest: boundedString(
          item.nextDiscriminatingTest || item.nextTest,
          1000
        ),
      }

      if (typeof item.score === 'number' && Number.isFinite(item.score)) {
        next.score = item.score
      }
      if (
        typeof item.confidence === 'number' &&
        Number.isFinite(item.confidence)
      ) {
        next.confidence = Math.max(0, Math.min(1, item.confidence))
      }
      if (item.probeFallback) {
        next.probeFallback = true
      }

      return next
    })
    .filter(Boolean)
}

function normalizeAttemptForTeacherJourney(input = {}, fallbackActor = '') {
  if (!input || typeof input !== 'object') return null

  const actions = normalizeJourneyActions(input.actions)
  const finalState =
    input.finalState && typeof input.finalState === 'object'
      ? JSON.parse(JSON.stringify(input.finalState))
      : null

  return {
    protocol: 'idena-arc-attempt-v1',
    actor: boundedString(input.actor || fallbackActor, 80),
    attemptIndex: Math.max(0, Math.trunc(Number(input.attemptIndex || 0) || 0)),
    startedAt: boundedString(input.startedAt, 80),
    endedAt: boundedString(input.endedAt, 80),
    actionCount: actions.length,
    actions,
    replayTimeline: Array.isArray(input.replayTimeline)
      ? input.replayTimeline.slice(0, MAX_ACTIONS + 1)
      : [],
    finalState,
    finalStateHash: boundedString(input.finalStateHash, 160) || null,
    completed: Boolean(input.completed),
    gameOver: Boolean(input.gameOver),
    stopReason: boundedString(input.stopReason, 240),
    model: boundedString(input.model, 160),
    runtime: boundedString(input.runtime, 160),
    notes: boundedString(input.notes, 2000),
  }
}

function normalizeCompressedTeacherMemory(input = {}) {
  if (!input || typeof input !== 'object') return null

  const compressedText = boundedString(input.compressedText || input.text, 4000)
  if (!compressedText) return null

  return {
    protocol: 'idena-arc-teacher-memory-v1',
    createdAt: boundedString(input.createdAt, 80) || isoNow(),
    sourceTextHash:
      boundedString(input.sourceTextHash, 160) ||
      sha256Prefixed(input.sourceText || compressedText),
    compressedText,
    compressedTextHash: sha256Prefixed(compressedText),
    compression:
      input.compression && typeof input.compression === 'object'
        ? {
            method: boundedString(input.compression.method, 120),
            maxChars: Number(input.compression.maxChars) || null,
          }
        : {method: 'main-normalize', maxChars: compressedText.length},
  }
}

function normalizeTeacherRounds(rounds) {
  return (Array.isArray(rounds) ? rounds : [])
    .slice(0, 32)
    .map((round, index) => ({
      protocol: 'idena-arc-teacher-round-v1',
      roundIndex: Math.max(
        0,
        Math.trunc(
          Number(
            typeof round.roundIndex !== 'undefined' ? round.roundIndex : index
          ) || index
        )
      ),
      createdAt: boundedString(round.createdAt, 80) || isoNow(),
      humanAttemptHash: boundedString(round.humanAttemptHash, 160) || null,
      localAiAttemptHash: boundedString(round.localAiAttemptHash, 160) || null,
      aiComparison: boundedString(round.aiComparison, 6000),
      humanFeedback: boundedString(round.humanFeedback, 6000),
      quickMarks: normalizeStringList(round.quickMarks, {
        maxItems: 24,
        maxLength: 80,
      }),
      failureModeAnnotations: normalizeFailureModeAnnotations(
        round.failureModeAnnotations || []
      ),
      compressedMemory: normalizeCompressedTeacherMemory(
        round.compressedMemory || {}
      ),
      retryAttemptIndex: Number.isFinite(Number(round.retryAttemptIndex))
        ? Math.max(0, Math.trunc(Number(round.retryAttemptIndex)))
        : null,
    }))
}

function normalizeProviderAnnotationDrafts(drafts) {
  return (Array.isArray(drafts) ? drafts : []).slice(0, 16).map((draft) => ({
    protocol: 'idena-arc-provider-annotation-draft-v1',
    createdAt: boundedString(draft.createdAt, 80) || isoNow(),
    provider: boundedString(draft.provider, 120),
    model: boundedString(draft.model, 160),
    costUsd:
      typeof draft.costUsd === 'number' && Number.isFinite(draft.costUsd)
        ? Math.max(0, draft.costUsd)
        : null,
    reviewedByHuman: Boolean(draft.reviewedByHuman),
    excludedFromTraining: Boolean(
      draft.reviewedByHuman ? draft.excludedFromTraining : true
    ),
    text: boundedString(draft.text || draft.content, 8000),
    provenanceHash:
      boundedString(draft.provenanceHash, 160) ||
      sha256Prefixed(
        `${draft.provider || ''}:${draft.model || ''}:${draft.text || ''}`
      ),
  }))
}

function normalizeFailureModeAnnotations(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 16)
    .map((item) => {
      const id = boundedString(item.id || item.failureMode, 120)

      if (!id) return null

      return {
        protocol: 'idena-arc-failure-mode-annotation-v1',
        id,
        label: boundedString(item.label || id, 120),
        failureMode: boundedString(item.failureMode || id, 120),
        createdAt: boundedString(item.createdAt, 80) || isoNow(),
        failedAbstraction: boundedString(item.failedAbstraction, 1200),
        humanCorrection: boundedString(
          item.humanCorrection || item.correction,
          1200
        ),
        capabilityTag: boundedString(item.capabilityTag, 120),
        adapterTarget: boundedString(item.adapterTarget, 240),
      }
    })
    .filter(Boolean)
}

function normalizeLevelTransferChecks(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 8)
    .map((item) => {
      const whyItWorked = boundedString(
        item.whyItWorked || item.why || item.explanation,
        1600
      )
      const shouldTransfer = boundedString(
        item.shouldTransfer || item.transferRule || item.transfer,
        1600
      )
      const disconfirmingEvidence = boundedString(
        item.disconfirmingEvidence || item.disconfirmingRule,
        1600
      )

      if (!whyItWorked && !shouldTransfer && !disconfirmingEvidence) {
        return null
      }

      return {
        protocol: 'idena-arc-level-transfer-check-v1',
        createdAt: boundedString(item.createdAt, 80) || isoNow(),
        whyItWorked,
        shouldTransfer,
        disconfirmingEvidence,
      }
    })
    .filter(Boolean)
}

function normalizeHypothesisTimeline(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 256)
    .map((item, index) => ({
      protocol: 'idena-arc-hypothesis-event-v1',
      attemptIndex: Number.isFinite(Number(item.attemptIndex))
        ? Math.max(0, Math.trunc(Number(item.attemptIndex)))
        : 0,
      actionIndex: Number.isFinite(Number(item.actionIndex))
        ? Math.max(0, Math.trunc(Number(item.actionIndex)))
        : index,
      action: boundedString(item.action, 80),
      stateHash: boundedString(item.stateHash, 160) || null,
      intendedTest: boundedString(item.intendedTest, 1000),
      expectedObservation: boundedString(item.expectedObservation, 1000),
      observedEffect: boundedString(item.observedEffect, 1000),
      localEffect: boundedString(item.localEffect, 1000),
      worldModelHypothesis: boundedString(item.worldModelHypothesis, 1000),
      hypothesisStatus: ['new', 'kept', 'changed', 'rejected'].includes(
        String(item.hypothesisStatus || '').trim()
      )
        ? String(item.hypothesisStatus).trim()
        : '',
      analogyRisk: ['low', 'medium', 'high'].includes(
        String(item.analogyRisk || '').trim()
      )
        ? String(item.analogyRisk).trim()
        : '',
      nextDiscriminatingTest: boundedString(item.nextDiscriminatingTest, 1000),
      confidence:
        typeof item.confidence === 'number' && Number.isFinite(item.confidence)
          ? Math.max(0, Math.min(1, item.confidence))
          : null,
    }))
}

function deriveHypothesisTimeline(localAiAttempts) {
  return (Array.isArray(localAiAttempts) ? localAiAttempts : [])
    .flatMap((attempt, attemptIndex) =>
      (Array.isArray(attempt.actions) ? attempt.actions : []).map(
        (action, actionIndex) => ({
          attemptIndex,
          actionIndex,
          action: action.action,
          stateHash: action.stateHash,
          intendedTest: action.intendedTest || action.reason,
          expectedObservation: action.expectedObservation,
          observedEffect: action.observedEffect || action.observation,
          localEffect: action.localEffect,
          worldModelHypothesis: action.worldModelHypothesis,
          hypothesisStatus: action.hypothesisStatus,
          analogyRisk: action.analogyRisk,
          nextDiscriminatingTest: action.nextDiscriminatingTest,
          confidence: action.confidence,
        })
      )
    )
    .slice(0, 256)
}

function normalizeCompressionAudit(input = {}, fallback = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    protocol: 'idena-arc-compression-audit-v1',
    status: boundedString(source.status || fallback.status || 'draft', 120),
    hasCompressedMemory: Boolean(
      source.hasCompressedMemory || fallback.hasCompressedMemory
    ),
    hasRecognitionMoment: Boolean(
      source.hasRecognitionMoment || fallback.hasRecognitionMoment
    ),
    failureModeCount: Number.isFinite(Number(source.failureModeCount))
      ? Math.max(0, Math.trunc(Number(source.failureModeCount)))
      : Number(fallback.failureModeCount || 0),
    completionComprehensionReady: Boolean(
      source.completionComprehensionReady ||
        fallback.completionComprehensionReady
    ),
  }
}

function normalizeTeacherJourney(input = {}, context = {}) {
  if (!input || typeof input !== 'object') return null

  const humanAttempt = normalizeAttemptForTeacherJourney(
    input.humanAttempt,
    'human'
  )
  const localAiAttempts = (
    Array.isArray(input.localAiAttempts) ? input.localAiAttempts : []
  )
    .map((attempt) => normalizeAttemptForTeacherJourney(attempt, 'local-ai'))
    .filter(Boolean)
    .slice(0, 16)

  if (!humanAttempt && !localAiAttempts.length) {
    return null
  }
  const failureModeAnnotations = normalizeFailureModeAnnotations(
    input.failureModeAnnotations || []
  )
  const levelTransferChecks = normalizeLevelTransferChecks(
    input.levelTransferChecks || []
  )
  const recognitionMoment = normalizeRecognitionMoment(input.recognitionMoment)
  const compressedTeacherMemory = normalizeCompressedTeacherMemory(
    input.compressedTeacherMemory || {}
  )
  const hypothesisTimeline = normalizeHypothesisTimeline(
    input.hypothesisTimeline && input.hypothesisTimeline.length
      ? input.hypothesisTimeline
      : deriveHypothesisTimeline(localAiAttempts)
  )
  const hasRecognitionMoment = Boolean(
    recognitionMoment &&
      (Number.isInteger(recognitionMoment.actionIndex) ||
        recognitionMoment.description)
  )

  return {
    protocol: TEACHER_JOURNEY_PROTOCOL,
    version: 1,
    status: context.status,
    phase: boundedString(input.phase, 80),
    createdAt: boundedString(input.createdAt, 80) || isoNow(),
    updatedAt: boundedString(input.updatedAt, 80) || isoNow(),
    game:
      input.game && typeof input.game === 'object'
        ? {
            gameId: boundedString(input.game.gameId, 160),
            title: boundedString(input.game.title, 240),
            initialStateHash:
              boundedString(input.game.initialStateHash, 160) || null,
            goalStateHash: boundedString(input.game.goalStateHash, 160) || null,
            renderer: boundedString(input.game.renderer, 120),
          }
        : {},
    humanAttempt,
    localAiAttempts,
    teacherRounds: normalizeTeacherRounds(input.teacherRounds),
    providerAnnotationDrafts: normalizeProviderAnnotationDrafts(
      input.providerAnnotationDrafts
    ),
    visualAnnotations: normalizeEvidenceEvents(
      input.visualAnnotations || input.visual_annotations
    ),
    visualEvidenceMarks: normalizeEvidenceEvents(
      input.visualEvidenceMarks ||
        input.visual_evidence_marks ||
        input.visualAnnotations ||
        input.visual_annotations
    ),
    recognitionMoment,
    hypothesisTimeline,
    failureModeAnnotations,
    levelTransferChecks,
    compressionAudit: normalizeCompressionAudit(input.compressionAudit, {
      hasCompressedMemory: Boolean(compressedTeacherMemory),
      hasRecognitionMoment,
      failureModeCount: failureModeAnnotations.length,
      completionComprehensionReady: levelTransferChecks.some(
        (item) =>
          item.whyItWorked && item.shouldTransfer && item.disconfirmingEvidence
      ),
    }),
    compressedTeacherMemory,
  }
}

function compressTeacherFeedbackText(text) {
  const source = boundedString(text, 12000)
  if (!source) return null

  const compressed = compressExplanationText(source, {maxChars: 1800})

  return {
    protocol: 'idena-arc-teacher-memory-v1',
    createdAt: isoNow(),
    sourceTextHash: compressed.sourceTextHash,
    compressedText: compressed.compressedText,
    compressedTextHash: compressed.compressedTextHash,
    compression: {
      method: compressed.strategy,
      maxChars: 1800,
      lossy: compressed.lossy,
    },
  }
}

function collectCapabilityTags(...sources) {
  const tags = sources.flatMap((source) =>
    normalizeCapabilityTags(source && source.capabilityTags)
  )

  return Array.from(new Set(tags)).slice(0, 16)
}

function normalizeFrameRows(frame) {
  return (Array.isArray(frame) ? frame : [])
    .filter((row) => Array.isArray(row))
    .slice(0, 128)
    .map((row) =>
      row
        .slice(0, 128)
        .map((cell) =>
          typeof cell === 'number' || typeof cell === 'string'
            ? cell
            : String(cell || '')
        )
    )
}

function summarizeFrame(frame) {
  const rows = normalizeFrameRows(frame)
  const width = Math.max(
    0,
    ...rows.map((row) => (Array.isArray(row) ? row.length : 0))
  )
  const colorCounts = new Map()

  rows.forEach((row) => {
    row.forEach((cell) => {
      const key = String(cell)
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1)
    })
  })

  const sortedColorCounts = Array.from(colorCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .slice(0, 24)
    .reduce((acc, [key, count]) => {
      acc[key] = count
      return acc
    }, {})

  return {
    width,
    height: rows.length,
    cellCount: rows.reduce((total, row) => total + row.length, 0),
    symbols: Object.keys(sortedColorCounts),
    colorCounts: sortedColorCounts,
    frameHash: rows.length ? hashJsonPrefixed(rows) : null,
  }
}

function recordingActionData(entry = {}) {
  const data = entry && entry.data ? entry.data : {}
  const actionInput = data.action_input || null
  return actionInput && actionInput.data ? actionInput.data : {}
}

function summarizeRecordingEntry(entry = {}, index = 0) {
  const data = entry && entry.data ? entry.data : {}
  const actionData = recordingActionData(entry)

  return {
    index,
    timestamp: entry.timestamp || '',
    phase: data.full_reset ? 'initial' : 'action',
    t_ms: Number(actionData.t_ms || 0) || 0,
    action: actionData.action || (data.full_reset ? 'RESET' : ''),
    arcAction: actionData.arc_action || arcActionName(actionData.action) || '',
    x: typeof actionData.x === 'number' ? actionData.x : null,
    y: typeof actionData.y === 'number' ? actionData.y : null,
    score: typeof data.score === 'number' ? data.score : null,
    levelsCompleted:
      typeof data.levels_completed === 'number' ? data.levels_completed : null,
    winLevels: typeof data.win_levels === 'number' ? data.win_levels : null,
    availableActions: Array.isArray(data.available_actions)
      ? data.available_actions.slice(0, 16)
      : [],
    stateHash: data.state_hash || null,
    frame: summarizeFrame(data.frame),
  }
}

function buildCompactFrameContext(bundle = {}) {
  const recording = bundle.recording || {}
  const entries = Array.isArray(recording.entries) ? recording.entries : []
  const actionTrace = entries
    .map((entry, index) => summarizeRecordingEntry(entry, index))
    .filter((entry) => entry.phase === 'action')
    .slice(0, MAX_ACTIONS)
    .map((entry) => ({
      index: entry.index,
      t_ms: entry.t_ms,
      action: entry.action,
      arcAction: entry.arcAction,
      x: entry.x,
      y: entry.y,
      score: entry.score,
      levelsCompleted: entry.levelsCompleted,
      stateHash: entry.stateHash,
    }))
  const milestoneIndices = new Set()
  let previousScore = null
  let previousLevelsCompleted = null

  if (entries.length) {
    milestoneIndices.add(0)
    milestoneIndices.add(entries.length - 1)
  }

  entries.forEach((entry, index) => {
    const data = entry && entry.data ? entry.data : {}
    const score = typeof data.score === 'number' ? data.score : null
    const levelsCompleted =
      typeof data.levels_completed === 'number' ? data.levels_completed : null

    if (score !== null && score !== previousScore) {
      milestoneIndices.add(index)
      previousScore = score
    }
    if (
      levelsCompleted !== null &&
      levelsCompleted !== previousLevelsCompleted
    ) {
      milestoneIndices.add(index)
      previousLevelsCompleted = levelsCompleted
    }
  })

  const milestones = Array.from(milestoneIndices)
    .sort((left, right) => left - right)
    .slice(0, 24)
    .map((index) => summarizeRecordingEntry(entries[index], index))

  return {
    protocol: FRAME_CONTEXT_PROTOCOL,
    source: 'recording-jsonl-v0',
    gameId: recording.gameId || '',
    entryCount: entries.length,
    actionCount: actionTrace.length,
    initial: entries.length ? summarizeRecordingEntry(entries[0], 0) : null,
    final: entries.length
      ? summarizeRecordingEntry(entries[entries.length - 1], entries.length - 1)
      : null,
    milestones,
    actionTrace,
  }
}

function actionHintsFromText(...values) {
  const text = values
    .flatMap((value) => {
      if (Array.isArray(value)) return value
      if (value && typeof value === 'object') {
        return Object.values(value)
      }
      return value
    })
    .join('\n')
  const hints = []
  const addHint = (value) => {
    const normalized = arcActionName(value) || String(value || '').toUpperCase()
    if (/^ACTION[1-7]$/.test(normalized) && !hints.includes(normalized)) {
      hints.push(normalized)
    }
  }
  const explicitActionPattern = /\bACTION\s*([1-7])\b/giu
  let match = explicitActionPattern.exec(text)
  while (match) {
    addHint(`ACTION${match[1]}`)
    match = explicitActionPattern.exec(text)
  }

  ;[
    'move_up',
    'move_down',
    'move_left',
    'move_right',
    'up',
    'down',
    'left',
    'right',
    'interact',
    'select',
    'click',
    'undo',
  ].forEach((alias) => {
    const pattern = new RegExp(`\\b${alias.replace('_', '[_ -]?')}\\b`, 'iu')
    if (pattern.test(text)) addHint(alias)
  })

  return hints.slice(0, 16)
}

function buildAnnotationValidationRecord(
  annotationPayload = {},
  bundle = {},
  verificationContext = {}
) {
  const trace = bundle.trace || {}
  const frameContext =
    annotationPayload.frameContext || buildCompactFrameContext(bundle)
  const traceActions = (
    Array.isArray(trace.actions)
      ? trace.actions
      : frameContext.actionTrace || []
  )
    .map((item) => arcActionName(item.action) || item.arcAction || item.action)
    .filter(Boolean)
  const localAi = annotationPayload.localAiGameplayAnnotation || {}
  const humanReplay = annotationPayload.humanReplayAnnotation || {}
  const humanRule = annotationPayload.humanRuleAnnotation || {}
  const teacherJourney = annotationPayload.teacherJourney || {}
  const localStructured = localAi.structuredExplanation || {}
  const replayStructured = humanReplay.structuredExplanation || {}
  const verifiedTraceCompleted = Boolean(
    verificationContext.verifiedCompleted ||
      (bundle.result && bundle.result.result === 'completed')
  )
  const completedAttemptPresent = Boolean(
    verifiedTraceCompleted ||
      (teacherJourney.humanAttempt && teacherJourney.humanAttempt.completed) ||
      (Array.isArray(teacherJourney.localAiAttempts) &&
        teacherJourney.localAiAttempts.some((attempt) => attempt.completed))
  )
  const teacherAttempts = [
    teacherJourney.humanAttempt,
    ...(Array.isArray(teacherJourney.localAiAttempts)
      ? teacherJourney.localAiAttempts
      : []),
  ].filter(Boolean)
  const teacherAttemptsReplayVerified = teacherAttempts.every(
    (attempt) => attempt.replayVerified === true
  )
  const teacherAttemptHashesMatch = teacherAttempts.every(
    (attempt) =>
      attempt.replayActionCountMatches !== false &&
      attempt.finalStateHashMatches !== false &&
      attempt.actionStateHashesMatch !== false
  )
  const humanAttemptMatchesTrace = Boolean(
    !teacherJourney.humanAttempt ||
      teacherJourney.humanAttempt.traceActionHashMatches === true
  )
  const hasTransferCheck = Boolean(
    Array.isArray(teacherJourney.levelTransferChecks) &&
      teacherJourney.levelTransferChecks.some(
        (item) =>
          item.whyItWorked && item.shouldTransfer && item.disconfirmingEvidence
      )
  )
  const textFields = [
    localAi.explanationText,
    localAi.uncertaintyNotes,
    noemonStyleExplanationToText(localStructured),
    humanReplay.explanationText,
    humanReplay.betterActionPlan,
    noemonStyleExplanationToText(replayStructured),
    humanRule.strategyChange,
    humanRule.teachingNotes,
  ]
  const predictedNextActions = actionHintsFromText(textFields)
  const expectedFinalAction = traceActions.length
    ? traceActions[traceActions.length - 1]
    : null
  const allEvidence = [
    ...(Array.isArray(humanRule.evidenceEvents)
      ? humanRule.evidenceEvents
      : []),
    ...(Array.isArray(humanReplay.keyMoments) ? humanReplay.keyMoments : []),
    ...(Array.isArray(localAi.actionRationales)
      ? localAi.actionRationales
      : []),
    ...(Array.isArray(localStructured.evidenceEvents)
      ? localStructured.evidenceEvents
      : []),
    ...(Array.isArray(replayStructured.evidenceEvents)
      ? replayStructured.evidenceEvents
      : []),
  ]
  const referencedEvidence = allEvidence.filter((item) =>
    Number.isInteger(item && item.actionIndex)
  )
  const validEvidenceRefs = referencedEvidence.filter(
    (item) => item.actionIndex >= 0 && item.actionIndex < traceActions.length
  )
  const checks = [
    {
      id: 'human-replay-explanation',
      passed: Boolean(
        humanReplay.explanationText || hasNoemonStyleSignal(replayStructured)
      ),
    },
    {
      id: 'local-ai-gameplay-explanation',
      passed: Boolean(
        localAi.explanationText || hasNoemonStyleSignal(localStructured)
      ),
    },
    {
      id: 'structured-action-policy',
      passed: Boolean(
        localStructured.actionPolicy || replayStructured.actionPolicy
      ),
    },
    {
      id: 'evidence-linked-to-replay',
      passed:
        referencedEvidence.length === 0 ||
        validEvidenceRefs.length === referencedEvidence.length,
    },
    {
      id: 'action-hints-observed-in-trace',
      passed:
        predictedNextActions.length === 0 ||
        predictedNextActions.some((action) => traceActions.includes(action)),
    },
    {
      id: 'completion-comprehension-check',
      passed: !completedAttemptPresent || hasTransferCheck,
    },
    {
      id: 'teacher-attempts-replay-verified',
      passed: teacherAttemptsReplayVerified,
    },
    {
      id: 'teacher-attempt-state-hashes-match',
      passed: teacherAttemptHashesMatch,
    },
    {
      id: 'human-attempt-matches-trace',
      passed: humanAttemptMatchesTrace,
    },
  ]
  const passedChecks = checks.filter((check) => check.passed).length
  const readinessScore =
    checks.length > 0 ? Number((passedChecks / checks.length).toFixed(3)) : 0
  const feedback = []

  if (!checks[0].passed) {
    feedback.push('Add a human replay explanation or structured replay rule.')
  }
  if (!checks[1].passed) {
    feedback.push('Add local-AI gameplay notes or a structured local policy.')
  }
  if (!checks[2].passed) {
    feedback.push('Add an action policy that can be tested on replay prefixes.')
  }
  if (!checks[3].passed) {
    feedback.push('Some evidence action indexes are outside the trace.')
  }
  if (!checks[4].passed) {
    feedback.push('Action hints in the explanation do not appear in the trace.')
  }
  if (!checks[5].passed) {
    feedback.push(
      'Completed runs need why-it-worked, transfer, and disconfirming-evidence notes before high-quality training.'
    )
  }
  if (!checks[6].passed) {
    feedback.push('Teacher attempts must replay from the original seed.')
  }
  if (!checks[7].passed) {
    feedback.push('Teacher attempt state hashes must match replayed states.')
  }
  if (!checks[8].passed) {
    feedback.push('The saved human attempt must match the verified trace.')
  }

  const usableForHighQualityTraining =
    readinessScore >= 0.8 &&
    traceActions.length > 0 &&
    checks[3].passed &&
    (!completedAttemptPresent || hasTransferCheck) &&
    teacherAttemptsReplayVerified &&
    teacherAttemptHashesMatch &&
    humanAttemptMatchesTrace

  let qualityTier = 'draft'
  if (usableForHighQualityTraining) {
    qualityTier = 'high-quality'
  } else if (completedAttemptPresent && !hasTransferCheck) {
    qualityTier = 'needs-completion-comprehension'
  }

  return {
    protocol: ANNOTATION_VALIDATION_PROTOCOL,
    strategy: 'deterministic-noemon-style-validator-v0',
    status: usableForHighQualityTraining
      ? 'usable-for-training'
      : 'needs-more-annotation',
    qualityTier,
    readinessScore,
    checks,
    feedback,
    replayPrefixTask: {
      kind: 'predict-final-action-from-annotation-v0',
      prefixActionCount: Math.max(0, traceActions.length - 1),
      expectedFinalAction,
      predictedNextActions,
      matchedExpected:
        expectedFinalAction !== null
          ? predictedNextActions.includes(expectedFinalAction)
          : null,
    },
  }
}

function hasAnnotationTrainingSignal(annotationPayload) {
  const human = annotationPayload.humanRuleAnnotation || {}
  const ai = annotationPayload.aiSelfAnnotation || {}
  const localAiGameplay = annotationPayload.localAiGameplayAnnotation || {}
  const humanReplay = annotationPayload.humanReplayAnnotation || {}
  const teacherJourney = annotationPayload.teacherJourney || {}
  const compressedTeacherMemory =
    annotationPayload.compressedTeacherMemory ||
    teacherJourney.compressedTeacherMemory ||
    null

  return Boolean(
    (Array.isArray(human.confirmedRules) && human.confirmedRules.length) ||
      (Array.isArray(human.wrongHypotheses) && human.wrongHypotheses.length) ||
      (Array.isArray(ai.failedAbstractions) && ai.failedAbstractions.length) ||
      localAiGameplay.explanationText ||
      humanReplay.explanationText ||
      (compressedTeacherMemory && compressedTeacherMemory.compressedText) ||
      (Array.isArray(teacherJourney.localAiAttempts) &&
        teacherJourney.localAiAttempts.some(
          (attempt) => attempt && attempt.replayVerified === true
        )) ||
      hasNoemonStyleSignal(localAiGameplay.structuredExplanation) ||
      hasNoemonStyleSignal(humanReplay.structuredExplanation)
  )
}

function compactAttemptActionsForTask(attempt) {
  return normalizeJourneyActions(attempt && attempt.actions).map((action) => ({
    action: action.action,
    arcAction: action.arcAction,
    stateHash: action.stateHash,
    intendedTest: action.intendedTest || action.reason || '',
    expectedObservation: action.expectedObservation || '',
    observedEffect: action.observedEffect || action.observation || '',
    localEffect: action.localEffect || '',
    worldModelHypothesis: action.worldModelHypothesis || '',
    hypothesisStatus: action.hypothesisStatus || '',
    analogyRisk: action.analogyRisk || '',
    nextDiscriminatingTest: action.nextDiscriminatingTest || '',
    probeFallback: Boolean(action.probeFallback),
    confidence:
      typeof action.confidence === 'number' ? action.confidence : null,
  }))
}

function compactTrainingText(value, maxLength = 1600) {
  return boundedString(value, maxLength)
}

function buildArcTeacherNegativeExamples({teacherJourney, comparison, human}) {
  const localAiAttempts = Array.isArray(teacherJourney.localAiAttempts)
    ? teacherJourney.localAiAttempts.filter(
        (attempt) => attempt && attempt.replayVerified === true
      )
    : []
  const localAiActions = localAiAttempts.flatMap((attempt) =>
    compactAttemptActionsForTask(attempt)
  )
  const levelTransferChecks = Array.isArray(teacherJourney.levelTransferChecks)
    ? teacherJourney.levelTransferChecks
    : []
  const failureModeAnnotations = [
    ...(Array.isArray(teacherJourney.failureModeAnnotations)
      ? teacherJourney.failureModeAnnotations
      : []),
    ...(Array.isArray(comparison.failureModeAnnotations)
      ? comparison.failureModeAnnotations
      : []),
  ]
  const records = []
  const seen = new Set()
  const pushRecord = (record) => {
    if (!record || !record.kind) return
    const key = `${record.kind}:${record.label || ''}:${record.evidence || ''}`
    if (seen.has(key)) return
    seen.add(key)
    records.push({
      protocol: 'idena-arc-negative-training-example-v1',
      kind: compactTrainingText(record.kind, 120),
      label: compactTrainingText(record.label || record.kind, 160),
      evidence: compactTrainingText(record.evidence, 1600),
      correction: compactTrainingText(record.correction, 1600),
      action: compactTrainingText(record.action, 80),
      source: compactTrainingText(record.source || 'teacher-journey', 120),
    })
  }

  failureModeAnnotations.forEach((item) => {
    pushRecord({
      kind: item.failureMode || item.id || 'teacher-marked-failure',
      label: item.label || item.failureMode || item.id,
      evidence: item.failedAbstraction,
      correction: item.humanCorrection,
      source: 'teacher-failure-chip',
    })
  })
  localAiActions
    .filter((action) => action.analogyRisk && action.analogyRisk !== 'low')
    .forEach((action) => {
      pushRecord({
        kind: 'wrong-analogy-risk',
        label: action.analogyRisk,
        action: action.action,
        evidence: action.worldModelHypothesis || action.intendedTest,
        correction:
          action.nextDiscriminatingTest ||
          'Treat the analogy as a hypothesis and test it against replay evidence.',
        source: 'local-ai-action',
      })
    })
  localAiAttempts.forEach((attempt) => {
    const stopReason = String(attempt.stopReason || '')
    if (/repeat|loop|stuck/i.test(stopReason)) {
      pushRecord({
        kind: 'repeated-state-loop',
        label: stopReason,
        evidence: `Local AI stopped with ${stopReason}.`,
        correction:
          'Switch to a discriminating probe when state hashes repeat.',
        source: 'local-ai-stop-reason',
      })
    }
    if (attempt.completed && !levelTransferChecks.length) {
      pushRecord({
        kind: 'accidental-win',
        label: 'completed-without-transfer-check',
        evidence: 'Attempt completed but has no level-transfer explanation.',
        correction:
          'Require why-it-worked, transfer, and disconfirming-evidence notes.',
        source: 'completion-check',
      })
    }
  })
  ;(human.wrongHypotheses || []).forEach((hypothesis) => {
    pushRecord({
      kind: 'wrong-human-recorded-hypothesis',
      label: 'wrong hypothesis',
      evidence: hypothesis,
      correction: comparison.humanVsAiGap || human.teachingNotes || '',
      source: 'human-rule-annotation',
    })
  })

  return records.slice(0, 32)
}

function buildArcTeacherPreferencePairs({
  teacherJourney,
  comparison,
  human,
  localAiGameplay,
  humanReplay,
  compressedTeacherMemory,
}) {
  const failureModeAnnotations = [
    ...(Array.isArray(teacherJourney.failureModeAnnotations)
      ? teacherJourney.failureModeAnnotations
      : []),
    ...(Array.isArray(comparison.failureModeAnnotations)
      ? comparison.failureModeAnnotations
      : []),
  ]
  const localAiAttempt =
    Array.isArray(teacherJourney.localAiAttempts) &&
    teacherJourney.localAiAttempts.length
      ? teacherJourney.localAiAttempts
          .filter((attempt) => attempt && attempt.replayVerified === true)
          .slice(-1)[0]
      : null
  const localAiActions = compactAttemptActionsForTask(localAiAttempt)
  const pairs = []
  const pushPair = (pair) => {
    const chosen = compactTrainingText(pair && pair.chosen, 2400)
    const rejected = compactTrainingText(pair && pair.rejected, 2400)
    if (!chosen || !rejected) return
    pairs.push({
      protocol: 'idena-arc-teacher-preference-pair-v1',
      taskType: compactTrainingText(pair.taskType, 120),
      rejected,
      chosen,
      reason: compactTrainingText(pair.reason, 1200),
      source: compactTrainingText(pair.source || 'teacher-review', 120),
    })
  }

  failureModeAnnotations.forEach((item) => {
    pushPair({
      taskType: 'misconception_detection',
      rejected: item.failedAbstraction,
      chosen: item.humanCorrection,
      reason: item.label || item.failureMode || item.id,
      source: 'teacher-failure-chip',
    })
  })
  pushPair({
    taskType: 'world_model_compression',
    rejected:
      localAiGameplay.explanationText ||
      (localAiGameplay.compression &&
        localAiGameplay.compression.compressedText) ||
      '',
    chosen:
      (compressedTeacherMemory && compressedTeacherMemory.compressedText) ||
      humanReplay.explanationText ||
      human.teachingNotes ||
      '',
    reason: 'Prefer evidence-linked teacher memory over broad AI summary.',
    source: 'teacher-compression',
  })
  pushPair({
    taskType: 'discriminating_probe_policy',
    rejected: localAiActions
      .map(
        (action) => `${action.action}: ${action.reason || action.intendedTest}`
      )
      .filter(Boolean)
      .slice(-4)
      .join('\n'),
    chosen:
      comparison.humanVsAiGap ||
      human.teachingNotes ||
      (humanReplay.corrections || []).join('\n'),
    reason: 'Prefer human correction when AI probes did not isolate the rule.',
    source: 'human-review',
  })

  return pairs.slice(0, 24)
}

function buildArcTeacherTrainingTasks({
  annotationPayload,
  annotationValidation,
  frameContext,
}) {
  const teacherJourney = annotationPayload.teacherJourney || {}
  const humanAttempt =
    teacherJourney.humanAttempt &&
    teacherJourney.humanAttempt.replayVerified === true &&
    teacherJourney.humanAttempt.traceActionHashMatches !== false
      ? teacherJourney.humanAttempt
      : null
  const localAiAttempt =
    Array.isArray(teacherJourney.localAiAttempts) &&
    teacherJourney.localAiAttempts.length
      ? teacherJourney.localAiAttempts
          .filter((attempt) => attempt && attempt.replayVerified === true)
          .slice(-1)[0]
      : null
  const comparison = annotationPayload.comparisonAnnotation || {}
  const human = annotationPayload.humanRuleAnnotation || {}
  const compressedTeacherMemory =
    annotationPayload.compressedTeacherMemory ||
    teacherJourney.compressedTeacherMemory ||
    null
  const failureModeAnnotations =
    teacherJourney.failureModeAnnotations ||
    comparison.failureModeAnnotations ||
    []
  const levelTransferChecks = teacherJourney.levelTransferChecks || []
  const localAiActions = compactAttemptActionsForTask(localAiAttempt)
  const humanActions = compactAttemptActionsForTask(humanAttempt)
  const source = {
    annotationHash: annotationPayload.annotationHash || null,
    traceHash: annotationPayload.traceHash || null,
    gameId:
      (teacherJourney.game && teacherJourney.game.gameId) ||
      frameContext.gameId ||
      '',
  }

  return ARC_TEACHER_TASK_TYPES.map((taskType) => {
    switch (taskType) {
      case 'action_effect_prediction':
        return {
          taskType,
          source,
          input: {frameContext, actions: localAiActions},
          target: {
            observedEffects: localAiActions.map((action) => ({
              action: action.action,
              expectedObservation: action.expectedObservation,
              observedEffect: action.observedEffect,
              localEffect: action.localEffect,
            })),
          },
        }
      case 'hypothesis_update':
        return {
          taskType,
          source,
          input: {hypothesisTimeline: teacherJourney.hypothesisTimeline || []},
          target: {
            updates: (teacherJourney.hypothesisTimeline || []).map((event) => ({
              action: event.action,
              worldModelHypothesis: event.worldModelHypothesis,
              hypothesisStatus: event.hypothesisStatus,
              observedEffect: event.observedEffect,
            })),
          },
        }
      case 'world_model_compression':
        return {
          taskType,
          source,
          input: {
            humanActions,
            localAiActions,
            failureModeAnnotations,
            visualEvidenceMarks: teacherJourney.visualEvidenceMarks || [],
          },
          target: {
            compressedTeacherMemory,
            confirmedRules: human.confirmedRules || [],
            recognitionMoment:
              teacherJourney.recognitionMoment ||
              human.recognitionMoment ||
              null,
          },
        }
      case 'discriminating_probe_policy':
        return {
          taskType,
          source,
          input: {
            uncertainActions: localAiActions.filter(
              (action) =>
                !action.confidence ||
                action.confidence < 0.5 ||
                action.probeFallback
            ),
          },
          target: {
            nextDiscriminatingTests: localAiActions
              .map((action) => action.nextDiscriminatingTest)
              .filter(Boolean),
          },
        }
      case 'misconception_detection':
        return {
          taskType,
          source,
          input: {
            localAiActions,
            localAiStopReason: localAiAttempt && localAiAttempt.stopReason,
            humanVsAiGap: comparison.humanVsAiGap || '',
          },
          target: {
            failureModeAnnotations,
            wrongHypotheses: human.wrongHypotheses || [],
            humanCorrection:
              comparison.humanVsAiGap || human.teachingNotes || '',
          },
        }
      case 'transfer_check':
        return {
          taskType,
          source,
          input: {
            completed:
              Boolean(humanAttempt && humanAttempt.completed) ||
              Boolean(localAiAttempt && localAiAttempt.completed),
            recognitionMoment:
              teacherJourney.recognitionMoment ||
              human.recognitionMoment ||
              null,
          },
          target: {
            levelTransferChecks,
            validationQualityTier: annotationValidation.qualityTier,
          },
        }
      default:
        return {taskType, source, input: {}, target: {}}
    }
  })
}

function buildTrainingExample(annotationPayload, annotationHash, bundle) {
  const human = annotationPayload.humanRuleAnnotation || {}
  const ai = annotationPayload.aiSelfAnnotation || {}
  const localAiGameplay = annotationPayload.localAiGameplayAnnotation || {}
  const humanReplay = annotationPayload.humanReplayAnnotation || {}
  const comparison = annotationPayload.comparisonAnnotation || {}
  const teacherJourney = annotationPayload.teacherJourney || null
  const compressedTeacherMemory =
    annotationPayload.compressedTeacherMemory ||
    (teacherJourney && teacherJourney.compressedTeacherMemory) ||
    null
  const reviewedProviderDrafts = (
    annotationPayload.providerAnnotationDrafts || []
  ).filter(
    (draft) =>
      draft && draft.reviewedByHuman && draft.excludedFromTraining !== true
  )
  const trace = bundle.trace || {}
  const result = bundle.result || {}
  const capabilityTags = collectCapabilityTags(human, comparison)
  const frameContext =
    annotationPayload.frameContext || buildCompactFrameContext(bundle)
  const annotationValidation =
    annotationPayload.annotationValidation ||
    buildAnnotationValidationRecord(annotationPayload, bundle)
  const trainingTasks = buildArcTeacherTrainingTasks({
    annotationPayload: {
      ...annotationPayload,
      annotationHash,
    },
    annotationValidation,
    frameContext,
  })
  const negativeExamples = buildArcTeacherNegativeExamples({
    teacherJourney: teacherJourney || {},
    comparison,
    human,
  })
  const preferencePairs = buildArcTeacherPreferencePairs({
    teacherJourney: teacherJourney || {},
    comparison,
    human,
    localAiGameplay,
    humanReplay,
    compressedTeacherMemory,
  })

  return {
    protocol: TRAINING_EXAMPLE_PROTOCOL,
    taskType: 'arc_teacher_multi_task',
    taskTypes: ARC_TEACHER_TASK_TYPES,
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
      annotationReadinessScore:
        typeof annotationValidation.readinessScore === 'number'
          ? annotationValidation.readinessScore
          : null,
      trainingQualityTier: annotationValidation.qualityTier || null,
    },
    input: {
      frameContext,
      actionButtonComparison: comparison.actionButtonComparison || null,
      replayPrefixTasks: annotationValidation.replayPrefixTask
        ? [annotationValidation.replayPrefixTask]
        : [],
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
      localAiGameplayExplanation:
        localAiGameplay.compression &&
        localAiGameplay.compression.compressedText
          ? localAiGameplay.compression.compressedText
          : '',
      localAiGameplayExplanationHash:
        localAiGameplay.compression &&
        localAiGameplay.compression.sourceTextHash
          ? localAiGameplay.compression.sourceTextHash
          : null,
      localAiAttemptedActions: localAiGameplay.attemptedActions || [],
      localAiActionButtonDescriptions:
        localAiGameplay.actionButtonDescriptions || [],
      localAiActionRationales: localAiGameplay.actionRationales || [],
      localAiGameplayCompression: localAiGameplay.compression || null,
      localAiStructuredExplanation:
        localAiGameplay.structuredExplanation || null,
      localAiStructuredCompression:
        localAiGameplay.structuredCompression || null,
      humanReplayExplanation:
        humanReplay.compression && humanReplay.compression.compressedText
          ? humanReplay.compression.compressedText
          : '',
      humanReplayExplanationHash:
        humanReplay.compression && humanReplay.compression.sourceTextHash
          ? humanReplay.compression.sourceTextHash
          : null,
      humanReplayKeyMoments: humanReplay.keyMoments || [],
      humanReplayActions: humanReplay.replayActions || [],
      humanReplayActionButtonDescriptions:
        humanReplay.actionButtonDescriptions || [],
      humanReplayCorrections: humanReplay.corrections || [],
      humanReplayCompression: humanReplay.compression || null,
      humanReplayStructuredExplanation:
        humanReplay.structuredExplanation || null,
      humanReplayStructuredCompression:
        humanReplay.structuredCompression || null,
      noemonStyle: {
        protocol: NOEMON_STYLE_ANNOTATION_PROTOCOL,
        localAiGameplay: {
          structuredExplanation: localAiGameplay.structuredExplanation || null,
          compressedText:
            localAiGameplay.structuredCompression &&
            localAiGameplay.structuredCompression.compressedText
              ? localAiGameplay.structuredCompression.compressedText
              : '',
        },
        humanReplay: {
          structuredExplanation: humanReplay.structuredExplanation || null,
          compressedText:
            humanReplay.structuredCompression &&
            humanReplay.structuredCompression.compressedText
              ? humanReplay.structuredCompression.compressedText
              : '',
        },
      },
      annotationValidation,
      humanVsAiGap: comparison.humanVsAiGap || '',
      suggestedAdapterTarget: comparison.suggestedAdapterTarget || '',
      teacherJourney,
      compressedTeacherMemory,
      teacherRounds:
        teacherJourney && Array.isArray(teacherJourney.teacherRounds)
          ? teacherJourney.teacherRounds
          : [],
      providerAnnotationDrafts: reviewedProviderDrafts,
      providerDraftPolicy:
        'Provider drafts are excluded unless reviewedByHuman=true.',
      negativeExamples,
      preferencePairs,
    },
    trainingTasks,
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

  if (normalized === 'RESET' || /^ACTION[1-7]$/.test(normalized)) {
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

function arcActionId(action) {
  const name = arcActionName(action)

  if (name === 'RESET') {
    return 0
  }

  const match = String(name || '').match(/^ACTION([1-7])$/)

  return match ? Number.parseInt(match[1], 10) : null
}

function containsPrivateSigningField(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== 'object') {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsPrivateSigningField(item, depth + 1))
  }

  return Object.entries(value).some(([key, item]) => {
    if (PRIVATE_SIGNING_FIELD_KEYS.has(key)) {
      return true
    }

    return containsPrivateSigningField(item, depth + 1)
  })
}

function actionButtonDescriptionForAction(action) {
  const normalized = arcActionName(action) || String(action || '').trim()
  const base = ARC_ACTION_BUTTON_DESCRIPTIONS[normalized]

  if (base) {
    return {
      protocol: 'idena-arc-action-button-description-v0',
      ...base,
    }
  }

  return {
    protocol: 'idena-arc-action-button-description-v0',
    action: normalized || 'ACTION',
    buttonLabel: normalized || 'Action',
    keys: [],
    description: `${
      normalized || 'Action'
    } button. Compare the observed frame change.`,
  }
}

function normalizeActionButtonDescription(input) {
  if (typeof input === 'string') {
    return actionButtonDescriptionForAction(input)
  }

  const suppliedAction = input && (input.action || input.arcAction || input.id)
  const action =
    arcActionName(suppliedAction) ||
    String(suppliedAction || '')
      .trim()
      .slice(0, 80)

  return actionButtonDescriptionForAction(action)
}

function buildUsedActionButtonDescriptions(actions) {
  const seen = new Set()
  const result = []

  normalizeActions(actions).forEach((item) => {
    const descriptor = actionButtonDescriptionForAction(item.action)

    if (!descriptor.action || seen.has(descriptor.action)) return
    seen.add(descriptor.action)
    result.push(descriptor)
  })

  return result
}

function normalizeActionButtonDescriptions(input, fallbackActions = []) {
  const seen = new Set()
  const result = (Array.isArray(input) ? input : [])
    .map(normalizeActionButtonDescription)
    .filter((item) => {
      if (!item.action || seen.has(item.action)) return false
      seen.add(item.action)
      return true
    })
    .slice(0, 16)

  return result.length
    ? result
    : buildUsedActionButtonDescriptions(fallbackActions)
}

function normalizeActionButtonComparison(input = {}) {
  const buttons = normalizeActionButtonDescriptions(input.buttons || [])

  return {
    protocol: 'idena-arc-action-button-comparison-v0',
    rule:
      boundedString(input.rule, 320) ||
      'Human and AI action annotations use the same ACTION button descriptions before comparing outcomes.',
    buttons: buttons.map((item) => {
      const source = (Array.isArray(input.buttons) ? input.buttons : []).find(
        (candidate) =>
          candidate &&
          (arcActionName(candidate.action || candidate.arcAction) ||
            candidate.action) === item.action
      )
      const usedBy = source && source.usedBy ? source.usedBy : {}

      return {
        ...item,
        usedBy: {
          human: Boolean(usedBy.human),
          localAi: Boolean(usedBy.localAi),
        },
      }
    }),
  }
}

function buildActionButtonComparisonFromDescriptions(
  humanDescriptions = [],
  localAiDescriptions = []
) {
  const humanButtons = normalizeActionButtonDescriptions(humanDescriptions)
  const localAiButtons = normalizeActionButtonDescriptions(localAiDescriptions)
  const byAction = new Map()

  humanButtons.concat(localAiButtons).forEach((item) => {
    if (!byAction.has(item.action)) byAction.set(item.action, item)
  })

  return {
    protocol: 'idena-arc-action-button-comparison-v0',
    rule: 'Human and AI action annotations use the same ACTION button descriptions before comparing outcomes.',
    buttons: Array.from(byAction.values())
      .sort((left, right) => left.action.localeCompare(right.action))
      .map((item) => ({
        ...item,
        usedBy: {
          human: humanButtons.some((button) => button.action === item.action),
          localAi: localAiButtons.some(
            (button) => button.action === item.action
          ),
        },
      })),
  }
}

function timestampFromOffset(baseIso, offsetMs) {
  const baseMs = Date.parse(baseIso || '')
  const startMs = Number.isFinite(baseMs) ? baseMs : 0

  return new Date(startMs + Math.max(0, Number(offsetMs) || 0)).toISOString()
}

function gridFrameFromState(state = {}) {
  if (Array.isArray(state.frame)) {
    return state.frame
  }

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

function recordingGameIdForSession(session) {
  return (
    (session &&
      session.game &&
      session.game.gameInfo &&
      session.game.gameInfo.gameId) ||
    (session &&
      session.game &&
      session.game.initialState &&
      session.game.initialState.gameId) ||
    (session && session.sessionId) ||
    ''
  )
}

function availableActionIdsFromState(state = {}) {
  if (Array.isArray(state.availableActionIds)) {
    return state.availableActionIds
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isFinite(item))
  }

  if (!Array.isArray(state.availableActions)) {
    return []
  }

  return state.availableActions
    .map((item) => {
      const match = String(item || '').match(/^ACTION([1-7])$/)
      return match ? Number(match[1]) : null
    })
    .filter((item) => Number.isFinite(item))
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
  const gameId = recordingGameIdForSession(session)
  const startedAt =
    session.manifest.startTime || session.createdAt || '1970-01-01T00:00:00Z'
  const timeline =
    Array.isArray(replay && replay.timeline) && replay.timeline.length
      ? replay.timeline
      : fallbackTimelineFromTrace(session, trace, replay)
  const entries = timeline.map((point, index) => {
    const state = point && point.state ? point.state : null
    const pointActionInput =
      point && point.actionInput ? point.actionInput : null
    const pointActionData =
      pointActionInput && pointActionInput.data ? pointActionInput.data : {}
    const actionName = pointActionInput
      ? arcActionName(
          pointActionData.action ||
            pointActionData.arc_action ||
            pointActionInput.id
        )
      : null
    const actionId = arcActionId(actionName)
    const actionInput = pointActionInput
      ? {
          id: actionId !== null ? actionId : pointActionInput.id,
          data: {
            game_id: gameId,
            ...pointActionData,
            arc_action: actionName,
          },
          reasoning: pointActionInput.reasoning || null,
        }
      : null
    let levelsCompleted = 0
    if (typeof (point && point.levelsCompleted) === 'number') {
      levelsCompleted = point.levelsCompleted
    } else if (typeof (state && state.levelsCompleted) === 'number') {
      levelsCompleted = state.levelsCompleted
    }

    let winLevels = 0
    if (typeof (point && point.winLevels) === 'number') {
      winLevels = point.winLevels
    } else if (typeof (state && state.winLevels) === 'number') {
      winLevels = state.winLevels
    }
    const availableActions = Array.isArray(point && point.availableActionIds)
      ? point.availableActionIds
      : availableActionIdsFromState(state || {})
    let phase = 'action'
    if (point && point.phase) {
      phase = point.phase
    } else if (point && point.fullReset) {
      phase = 'initial'
    }

    return {
      timestamp: timestampFromOffset(startedAt, point && point.t_ms),
      data: {
        game_id: gameId,
        phase,
        frame: gridFrameFromState(state || {}),
        state: state || null,
        game_state:
          state && typeof state.state !== 'undefined' ? state.state : null,
        levels_completed: levelsCompleted,
        win_levels: winLevels,
        score: typeof point.score === 'number' ? point.score : null,
        action_input: actionInput,
        guid:
          (point && point.guid) ||
          (state && state.guid) ||
          `${session.sessionId}:${trace.participantId || 'player'}:${index}`,
        full_reset: Boolean(
          typeof (point && point.fullReset) === 'boolean'
            ? point.fullReset
            : state && state.fullReset
        ),
        available_actions: availableActions,
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
  const gameId = recordingGameIdForSession(session)
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
      `phase: ${data.phase || (data.full_reset ? 'initial' : 'action')}`,
      `t_ms: ${Number(actionData.t_ms || 0) || 0}`,
      `action: ${actionData.action || 'RESET'}`,
      `arc_action: ${actionData.arc_action || ''}`,
      `levels_completed: ${
        typeof data.levels_completed === 'number' ? data.levels_completed : ''
      }`,
      `win_levels: ${
        typeof data.win_levels === 'number' ? data.win_levels : ''
      }`,
      `available_actions: ${
        Array.isArray(data.available_actions)
          ? data.available_actions.join(',')
          : ''
      }`,
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
  const externalProcessCwd = resolveExternalProcessCwd(rootDir)
  const sidecarPath = resolveBundledPath(
    rootDir,
    'python',
    'idena_arc',
    'arc_sidecar.py'
  )
  const pythonPackagePath = resolveBundledPath(rootDir, 'python', 'idena_arc')
  let arcAgiRuntimeInstallPromise = null

  function resolveBaseDir() {
    return baseDir || path.join(appDataPath('userData'), 'idena-arc')
  }

  function arcAgiRuntimeDir() {
    return path.join(resolveBaseDir(), ARC_AGI_RUNTIME_DIRNAME)
  }

  function arcAgiVenvDir() {
    return path.join(arcAgiRuntimeDir(), 'venv')
  }

  function arcAgiEnvironmentsDir() {
    return path.join(arcAgiRuntimeDir(), 'environment_files')
  }

  function arcAgiRecordingsDir() {
    return path.join(arcAgiRuntimeDir(), 'recordings')
  }

  function arcAgiVenvPythonPath() {
    return getVenvPythonPath(arcAgiVenvDir())
  }

  async function collectArcAgiCacheStatus() {
    const environmentsDir = arcAgiEnvironmentsDir()
    const recordingsDir = arcAgiRecordingsDir()
    const metadataFiles = []

    async function walk(dir) {
      let entries = []

      try {
        entries = await fs.readdir(dir, {withFileTypes: true})
      } catch {
        return
      }

      await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(entryPath)
          } else if (entry.isFile() && entry.name === 'metadata.json') {
            metadataFiles.push(entryPath)
          }
        })
      )
    }

    await walk(environmentsDir)

    const games = (
      await Promise.all(
        metadataFiles.map(async (metadataPath) => {
          try {
            const metadata = await fs.readJson(metadataPath)
            return {
              gameId: safeId(metadata.game_id || metadata.gameId, ''),
              baseGameId: safeId(
                String(metadata.game_id || metadata.gameId || '').split(
                  '-',
                  1
                )[0],
                ''
              ),
              title: boundedString(metadata.title || '', 160),
              tags: normalizeStringList(metadata.tags || [], {
                maxItems: 12,
                maxLength: 80,
              }),
              baselineActions: Array.isArray(metadata.baseline_actions)
                ? metadata.baseline_actions
                    .map((item) => Number.parseInt(item, 10))
                    .filter((item) => Number.isFinite(item) && item > 0)
                : [],
              downloadedAt:
                boundedString(metadata.date_downloaded || '', 80) || null,
            }
          } catch {
            return null
          }
        })
      )
    )
      .filter((item) => item && item.gameId)
      .sort((left, right) => left.gameId.localeCompare(right.gameId))

    return {
      environmentsDir,
      recordingsDir,
      cachedGameCount: games.length,
      cachedGames: games.slice(0, 100),
    }
  }

  function resolveSidecarPythonCommand() {
    const configured = pythonCommand || process.env.IDENA_ARC_PYTHON
    if (configured) {
      const parts = commandParts(configured)
      return {
        command: parts.command || 'python3',
        args: parts.args,
        source: 'configured',
      }
    }

    const managedPython = arcAgiVenvPythonPath()
    if (fs.existsSync(managedPython)) {
      return {
        command: managedPython,
        args: [],
        source: 'managed-arc-agi-runtime',
      }
    }

    return {
      command: 'python3',
      args: [],
      source: 'system-default',
    }
  }

  function python312Candidates() {
    const candidates = [
      process.env.IDENA_ARC_PYTHON,
      pythonCommand,
      process.platform === 'win32' ? 'py -3.12' : 'python3.12',
      process.platform === 'darwin'
        ? '/opt/homebrew/opt/python@3.12/bin/python3.12'
        : '',
      process.platform === 'darwin'
        ? '/usr/local/opt/python@3.12/bin/python3.12'
        : '',
      process.platform === 'win32' ? 'py -3' : 'python3',
      'python',
    ]
    const seen = new Set()

    return candidates
      .map((candidate) => trimString(candidate))
      .filter(Boolean)
      .filter((candidate) => {
        if (seen.has(candidate)) return false
        seen.add(candidate)
        return true
      })
      .map((candidate) => {
        const parts = commandParts(candidate)
        return {
          command: parts.command,
          args: parts.args,
          configured: candidate,
        }
      })
  }

  function homebrewCandidates() {
    if (process.platform !== 'darwin') {
      return []
    }

    return ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', 'brew']
  }

  async function resolveHomebrewCommand() {
    for (const command of homebrewCandidates()) {
      try {
        const result = await runCapturedCommand({
          command,
          args: ['--version'],
          cwd: externalProcessCwd,
          timeoutMs: ARC_AGI_PROBE_TIMEOUT_MS,
          label: 'Homebrew probe',
        })

        if (result.code === 0) {
          return {command}
        }
      } catch {
        // Try the next common Homebrew path.
      }
    }

    return null
  }

  async function probePython312Candidate(candidate) {
    try {
      const result = await runCapturedCommand({
        command: candidate.command,
        args: candidate.args.concat([
          '-c',
          [
            'import json, sys',
            'ok = sys.version_info >= (3, 12)',
            'print(json.dumps({"ok": ok, "version": sys.version.split()[0], "executable": sys.executable}))',
            'raise SystemExit(0 if ok else 1)',
          ].join('; '),
        ]),
        cwd: externalProcessCwd,
        timeoutMs: ARC_AGI_PROBE_TIMEOUT_MS,
        label: 'Python 3.12 probe',
      })
      const details = JSON.parse(result.stdout || '{}')

      return {
        ok: result.code === 0 && details.ok === true,
        ...candidate,
        version: details.version || null,
        executable: details.executable || null,
        error: result.code === 0 ? null : result.stderr || result.stdout,
      }
    } catch (error) {
      return {
        ok: false,
        ...candidate,
        version: null,
        executable: null,
        error: rpcErrorMessage(error),
      }
    }
  }

  async function findPython312Command() {
    const failures = []

    for (const candidate of python312Candidates()) {
      const probe = await probePython312Candidate(candidate)
      if (probe.ok) return probe
      failures.push(probe)
    }

    return {command: null, failures}
  }

  async function installPython312WithHomebrew() {
    const homebrew = await resolveHomebrewCommand()

    if (!homebrew) {
      return false
    }

    await runRequiredCommand({
      command: homebrew.command,
      args: ['install', 'python@3.12'],
      cwd: externalProcessCwd,
      timeoutMs: ARC_AGI_PYTHON_INSTALL_TIMEOUT_MS,
      label: 'Install Python 3.12 with Homebrew',
    })

    return true
  }

  async function resolvePython312Command({allowHomebrewInstall = false} = {}) {
    const found = await findPython312Command()

    if (found.command) {
      return found
    }

    if (allowHomebrewInstall && (await installPython312WithHomebrew())) {
      const afterInstall = await findPython312Command()
      if (afterInstall.command) {
        return afterInstall
      }
    }

    const failures = found.failures || []
    const checked = failures
      .map((item) => item.configured)
      .filter(Boolean)
      .join(', ')

    throw new Error(
      `Python 3.12 is required to prepare ARC-AGI public games. Install Python 3.12 and try again.${
        checked ? ` Checked: ${checked}.` : ''
      }`
    )
  }

  async function probeArcAgiPython(commandSpec) {
    try {
      const result = await runCapturedCommand({
        command: commandSpec.command,
        args: commandSpec.args.concat([
          '-c',
          [
            'import json, sys',
            'import arcengine',
            'import arc_agi',
            'print(json.dumps({"ready": True, "version": sys.version.split()[0], "executable": sys.executable}))',
          ].join('; '),
        ]),
        cwd: externalProcessCwd,
        timeoutMs: ARC_AGI_PROBE_TIMEOUT_MS,
        label: 'ARC-AGI runtime probe',
      })
      const details = JSON.parse(result.stdout || '{}')

      return {
        ready: result.code === 0 && details.ready === true,
        pythonPath: details.executable || commandSpec.command,
        pythonVersion: details.version || null,
        error: result.code === 0 ? null : outputTail(result.stderr),
      }
    } catch (error) {
      return {
        ready: false,
        pythonPath: commandSpec.command,
        pythonVersion: null,
        error: rpcErrorMessage(error),
      }
    }
  }

  async function getArcAgiRuntimeStatus() {
    const runtimeDir = arcAgiRuntimeDir()
    const venvPython = arcAgiVenvPythonPath()
    const sidecarPython = resolveSidecarPythonCommand()
    const installed = await fs.pathExists(venvPython)
    const probe = await probeArcAgiPython(sidecarPython)
    const cache = await collectArcAgiCacheStatus()

    if (probe.ready) {
      return {
        ok: true,
        ready: true,
        installed,
        installing: Boolean(arcAgiRuntimeInstallPromise),
        runtimeDir,
        venvPython,
        pythonPath: probe.pythonPath,
        pythonVersion: probe.pythonVersion,
        source: sidecarPython.source,
        cache,
        message:
          cache.cachedGameCount > 0
            ? `ARC-AGI public games are ready on this device; ${cache.cachedGameCount} game(s) are cached.`
            : 'ARC-AGI public games are ready on this device.',
      }
    }

    const candidate = await findPython312Command()
    const homebrew = candidate.command ? null : await resolveHomebrewCommand()
    let installPython = null
    let message =
      'Python 3.12 is required before IdenaArc can prepare ARC-AGI public games.'

    if (candidate.command) {
      installPython = {
        command: candidate.configured,
        version: candidate.version,
        executable: candidate.executable,
      }
      message =
        'ARC-AGI toolkit is not installed yet. Click Prepare runtime to create the local Python environment.'
    } else if (homebrew) {
      installPython = {
        command: 'brew install python@3.12',
        version: '3.12',
        executable: homebrew.command,
      }
      message =
        'Python 3.12 is missing. Click Prepare runtime to install python@3.12 with Homebrew and create the ARC-AGI environment.'
    }

    return {
      ok: true,
      ready: false,
      installed,
      installing: Boolean(arcAgiRuntimeInstallPromise),
      runtimeDir,
      venvPython,
      pythonPath: probe.pythonPath,
      pythonVersion: probe.pythonVersion,
      source: sidecarPython.source,
      cache,
      canInstall: Boolean(candidate.command || homebrew),
      installPython,
      error: probe.error,
      message,
    }
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

  function arcScorecardPath(sessionId, scorecardId) {
    return path.join(
      traceDir(),
      safeId(sessionId, 'session'),
      'arc-scorecards',
      `${safeId(scorecardId, 'scorecard')}.json`
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

  function assertPathInsideRoot(filePath, root, reason) {
    const resolvedPath = path.resolve(String(filePath || '').trim())
    const resolvedRoot = path.resolve(root)
    const prefix = `${resolvedRoot}${path.sep}`

    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(prefix)) {
      throw new Error(reason)
    }

    return resolvedPath
  }

  async function readTraceBundleInput(payload = {}) {
    if (payload.bundle) {
      return payload.bundle
    }

    if (payload.sessionId && payload.resultId) {
      return readJson(
        traceBundlePath(payload.sessionId, payload.resultId),
        null
      )
    }

    if (payload.bundlePath) {
      return readJson(
        assertPathInsideRoot(
          payload.bundlePath,
          traceDir(),
          'trace_bundle_path_outside_store'
        ),
        null
      )
    }

    return null
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

    if (payload.signerPrivateKey || payload.privateKey) {
      throw new Error(
        'Renderer-supplied private keys are not accepted for IdenaArc signing'
      )
    }

    if (adapter === 'rehearsal-devnet') {
      const signer = getDevnetSignerDetails()
      return {
        adapter,
        address: signer.address,
        privateKeyHex: signer.privateKeyHex,
      }
    }

    throw new Error('A managed internal signer is required for this adapter')
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

    if (payload.signerPrivateKey || payload.privateKey) {
      throw new Error(
        'Renderer-supplied private keys are not accepted for IdenaArc signing'
      )
    }

    if (adapter === 'rehearsal-devnet') {
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
          mode: proofMode,
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

    if (payload.signerPrivateKey || payload.privateKey) {
      throw new Error(
        'Renderer-supplied private keys are not accepted for IdenaArc signing'
      )
    }

    const payloadAddress = trimString(payload.address)
    const participantAddress = trimString(participant.address)

    if (payloadAddress) {
      return normalizeAddress(payloadAddress)
    }

    if (participantAddress) {
      return normalizeAddress(participantAddress)
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

  function isArcAgiPublicGenerator(generator = {}) {
    return generator && generator.kind === 'arc-agi-public-game-v0'
  }

  function withTransientArcAgiCredentials(generator = {}, payload = {}) {
    if (!isArcAgiPublicGenerator(generator)) {
      return generator
    }

    const arcApiKey = trimString(payload.arcApiKey || payload.arc_api_key)
    const arcBaseUrl = trimString(payload.arcBaseUrl || payload.arc_base_url)
    const scorecardMode = trimString(
      payload.scorecardMode || payload.arcScorecardMode
    )

    return {
      ...generator,
      ...(arcApiKey ? {arcApiKey} : {}),
      ...(arcBaseUrl ? {arcBaseUrl} : {}),
      ...(scorecardMode ? {scorecardMode} : {}),
    }
  }

  function sidecarEnvForPayload(payload = {}) {
    const generator = payload.generator || {}

    if (
      payload.command !== 'cacheArcAgiGames' &&
      !isArcAgiPublicGenerator(generator)
    ) {
      return process.env
    }

    const environmentsDir = arcAgiEnvironmentsDir()
    const recordingsDir = arcAgiRecordingsDir()

    return {
      ...process.env,
      IDENA_ARC_AGI_ENVIRONMENTS_DIR: environmentsDir,
      IDENA_ARC_AGI_RECORDINGS_DIR: recordingsDir,
      ENVIRONMENTS_DIR: environmentsDir,
      RECORDINGS_DIR: recordingsDir,
    }
  }

  function runSidecar(payload) {
    const python = resolveSidecarPythonCommand()

    return new Promise((resolve, reject) => {
      const child = spawn(python.command, python.args.concat([sidecarPath]), {
        cwd: externalProcessCwd,
        env: sidecarEnvForPayload(payload),
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

  async function installArcAgiRuntime() {
    const runtimeDir = arcAgiRuntimeDir()
    const venvDir = arcAgiVenvDir()
    const venvPython = arcAgiVenvPythonPath()
    const sourcePath = `${pythonPackagePath}[arc-agi]`
    const pipInstallSourceArgs =
      toAsarUnpackedPath(rootDir) === rootDir
        ? ['-m', 'pip', 'install', '-e', sourcePath]
        : ['-m', 'pip', 'install', sourcePath]
    const python312 = await resolvePython312Command({
      allowHomebrewInstall: true,
    })

    await fs.ensureDir(runtimeDir)

    if (!(await fs.pathExists(venvPython))) {
      await runRequiredCommand({
        command: python312.command,
        args: python312.args.concat(['-m', 'venv', venvDir]),
        cwd: externalProcessCwd,
        timeoutMs: ARC_AGI_SETUP_TIMEOUT_MS,
        label: 'Create ARC-AGI Python environment',
      })
    }

    await runRequiredCommand({
      command: venvPython,
      args: ['-m', 'pip', 'install', '--upgrade', 'pip'],
      cwd: externalProcessCwd,
      timeoutMs: ARC_AGI_SETUP_TIMEOUT_MS,
      label: 'Upgrade ARC-AGI runtime installer',
    })

    await runRequiredCommand({
      command: venvPython,
      args: pipInstallSourceArgs,
      cwd: externalProcessCwd,
      timeoutMs: ARC_AGI_SETUP_TIMEOUT_MS,
      label: 'Install ARC-AGI runtime packages',
    })

    const runtimeStatus = await getArcAgiRuntimeStatus()
    if (!runtimeStatus.ready) {
      throw new Error(
        `ARC-AGI runtime installation finished, but the toolkit is still unavailable${
          runtimeStatus.error ? `: ${runtimeStatus.error}` : '.'
        }`
      )
    }

    return {
      ...runtimeStatus,
      installed: true,
    }
  }

  async function cacheArcAgiPublicGames(payload = {}) {
    const gameIds = normalizeStringList(
      payload.gameIds || payload.arcAgiGameIds || payload.arcAgiGameId || [],
      {maxItems: 50, maxLength: 96}
    )
      .map((item) => safeId(item, ''))
      .filter(Boolean)
    const cacheAllPublic =
      payload.cacheAllPublic === undefined
        ? gameIds.length < 1
        : payload.cacheAllPublic !== false

    return runSidecar({
      command: 'cacheArcAgiGames',
      generator: {
        kind: 'arc-agi-public-game-v0',
        cacheAllPublic,
        gameIds,
        ...withTransientArcAgiCredentials(
          {kind: 'arc-agi-public-game-v0'},
          payload
        ),
      },
    })
  }

  async function listArcAgiPublicGames(payload = {}) {
    const result = await runSidecar({
      command: 'listArcAgiGames',
      generator: {
        kind: 'arc-agi-public-game-v0',
        ...withTransientArcAgiCredentials(
          {kind: 'arc-agi-public-game-v0'},
          payload
        ),
        cacheAllPublic: false,
        gameIds: normalizeStringList(
          payload.gameIds || payload.arcAgiGameIds || [],
          {maxItems: 50, maxLength: 96}
        )
          .map((item) => safeId(item, ''))
          .filter(Boolean),
      },
    })

    return {
      ...result,
      cached:
        result && Array.isArray(result.games)
          ? result.games.filter((game) => game && game.local)
          : [],
    }
  }

  async function ensureArcAgiRuntime() {
    const currentStatus = await getArcAgiRuntimeStatus()

    if (currentStatus.ready) {
      return currentStatus
    }

    return installArcAgiRuntime()
  }

  async function prepareArcAgiRuntime(payload = {}) {
    if (arcAgiRuntimeInstallPromise) {
      return arcAgiRuntimeInstallPromise
    }

    arcAgiRuntimeInstallPromise = ensureArcAgiRuntime()
      .then(async (result) => {
        if (payload.cacheArcAgiGames === false) {
          return {
            ...result,
            ok: true,
          }
        }

        let cacheResult = null
        try {
          cacheResult = await cacheArcAgiPublicGames(payload)
        } catch (error) {
          cacheResult = {
            ok: false,
            error: rpcErrorMessage(error),
          }
        }

        const runtimeStatus = await getArcAgiRuntimeStatus()
        const cachedCount =
          runtimeStatus.cache && runtimeStatus.cache.cachedGameCount
            ? runtimeStatus.cache.cachedGameCount
            : 0

        return {
          ...result,
          ...runtimeStatus,
          ok: true,
          cacheResult,
          message:
            cacheResult && cacheResult.ok === false
              ? `ARC-AGI runtime is installed, but game caching failed: ${
                  cacheResult.error ||
                  (cacheResult.cache &&
                    cacheResult.cache.failed &&
                    cacheResult.cache.failed[0] &&
                    cacheResult.cache.failed[0].error) ||
                  'unknown cache error'
                }`
              : `ARC-AGI runtime is ready${
                  cachedCount > 0 ? ` with ${cachedCount} cached game(s)` : ''
                }.`,
        }
      })
      .finally(() => {
        arcAgiRuntimeInstallPromise = null
      })

    return arcAgiRuntimeInstallPromise
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
      generator: withTransientArcAgiCredentials(
        session.manifest.generator,
        payload
      ),
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

  async function replayTrace(session, actions, payload = {}) {
    const game =
      session.game || (await generateGame({sessionId: session.sessionId})).game

    return runSidecar({
      command: 'replay',
      seed: session.finalSeed.finalSeed,
      generator: withTransientArcAgiCredentials(
        session.manifest.generator,
        payload
      ),
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
    const replay = await replayTrace(session, actions, payload)
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

  async function previewTrace(payload = {}) {
    let session = await readSession(payload.sessionId)

    if (!session.game) {
      session = (await generateGame(payload)).session
    }

    const actions = normalizeActions(payload.actions)
    const replay = await replayTrace(session, actions, payload)

    return {
      session,
      replay,
      actions: replay.actions || actions,
      finalState: replay.finalState,
      finalStateHash: replay.finalStateHash,
      score: replay.score,
      completed: Boolean(replay.completed),
    }
  }

  async function submitArcAgiScorecard(payload = {}) {
    let session = await readSession(payload.sessionId)

    if (!session.finalSeed) {
      const computed = await computeFinalSeed(payload)
      session = computed.session
    }

    if (!isArcAgiPublicGenerator(session.manifest.generator)) {
      throw new Error('Official ARC scorecards require an ARC-AGI public game')
    }

    const game =
      session.game ||
      (await generateGame({...payload, sessionId: session.sessionId})).game
    const actions = normalizeActions(payload.actions)
    const scorecardMode =
      trimString(payload.scorecardMode || payload.arcScorecardMode) ||
      'competition'
    const scorecard = await runSidecar({
      command: 'submitArcAgiScorecard',
      seed: session.finalSeed.finalSeed,
      generator: {
        ...withTransientArcAgiCredentials(session.manifest.generator, payload),
        scorecardMode,
        scorecardTags: normalizeStringList(
          payload.scorecardTags || ['idena-arc'],
          {maxItems: 12, maxLength: 80}
        ),
        sourceUrl: boundedString(payload.sourceUrl || '', 400),
      },
      initialState: game.initialState,
      actions,
    })
    const scorecardHash = hashJsonPrefixed(scorecard)
    const scorecardId =
      safeId(scorecard.scorecardId || scorecard.cardId, '') ||
      scorecardHash.slice(7, 19)
    const storedScorecard = {
      protocol: 'idena-arc-official-scorecard-record-v0',
      sessionId: session.sessionId,
      gameId: scorecard.gameId,
      scorecardId,
      scorecardUrl: scorecard.scorecardUrl,
      scorecardHash,
      mode: scorecard.mode || scorecardMode,
      submittedAt: isoNow(),
      actionCount: Array.isArray(scorecard.actions)
        ? scorecard.actions.length
        : actions.length,
      scorecard,
    }

    await writeJson(
      arcScorecardPath(session.sessionId, scorecardId),
      storedScorecard
    )

    session.arcScorecards = (
      Array.isArray(session.arcScorecards) ? session.arcScorecards : []
    )
      .filter((item) => item.scorecardId !== scorecardId)
      .concat({
        scorecardId,
        scorecardUrl: scorecard.scorecardUrl,
        scorecardHash,
        mode: storedScorecard.mode,
        gameId: scorecard.gameId,
        actionCount: storedScorecard.actionCount,
        submittedAt: storedScorecard.submittedAt,
      })

    await writeSession(session)

    return {
      session,
      scorecard: storedScorecard,
    }
  }

  async function verifyTraceBundle(payload = {}) {
    const bundle = await readTraceBundleInput(payload)

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

  function normalizedActionSequenceHash(actions) {
    return hashJsonPrefixed(
      normalizeActions(actions).map((action) => {
        const next = {action: action.action}
        if (typeof action.x === 'number') next.x = action.x
        if (typeof action.y === 'number') next.y = action.y
        return next
      })
    )
  }

  function replayActionPoints(replay = {}) {
    const timeline = Array.isArray(replay.timeline) ? replay.timeline : []

    return timeline.filter(
      (point) => point && (point.phase === 'action' || point.actionInput)
    )
  }

  function verifiedActionStateHash({replay, actionPoints, index}) {
    const point = actionPoints[index] || null
    if (point && point.stateHash) return point.stateHash

    const isLastAction =
      Array.isArray(actionPoints) && index === actionPoints.length - 1
    if (isLastAction && replay && replay.finalStateHash) {
      return replay.finalStateHash
    }

    return null
  }

  function verifiedActionEffect({point, stateHash, previousStateHash}) {
    const score =
      point && typeof point.score === 'number' ? `score=${point.score}; ` : ''
    const changed =
      stateHash && previousStateHash && stateHash !== previousStateHash
        ? 'state changed'
        : 'no verified state-hash change'

    return `${score}${changed}`
  }

  function enrichAttemptWithReplay({
    attempt,
    replay,
    fallbackActor,
    expectedTraceActions = null,
  }) {
    const actionPoints = replayActionPoints(replay)
    const normalizedActions = normalizeJourneyActions(attempt.actions)
    let previousStateHash =
      replay && Array.isArray(replay.timeline) && replay.timeline[0]
        ? replay.timeline[0].stateHash || null
        : null
    const replayActionCountMatches =
      actionPoints.length === normalizedActions.length
    let actionStateHashesMatch = replayActionCountMatches
    const suppliedFinalStateHash = attempt.finalStateHash || null
    const actions = normalizedActions.map((action, index) => {
      const point = actionPoints[index] || null
      const stateHash = verifiedActionStateHash({replay, actionPoints, index})
      if (action.stateHash && stateHash && action.stateHash !== stateHash) {
        actionStateHashesMatch = false
      }
      const observedEffect = verifiedActionEffect({
        point,
        stateHash,
        previousStateHash,
      })
      const next = {
        ...action,
        stateHash,
        observation: observedEffect,
        observedEffect,
        localEffect: observedEffect,
      }
      previousStateHash = stateHash || previousStateHash
      return next
    })
    const traceActionHashMatches = expectedTraceActions
      ? normalizedActionSequenceHash(actions) ===
        normalizedActionSequenceHash(expectedTraceActions)
      : null

    return {
      ...attempt,
      actor: attempt.actor || fallbackActor,
      actionCount: actions.length,
      actions,
      replayTimeline: Array.isArray(replay.timeline)
        ? replay.timeline.slice(0, MAX_ACTIONS + 1)
        : [],
      finalState: replay.finalState || attempt.finalState || null,
      finalStateHash: replay.finalStateHash || null,
      completed: Boolean(replay.completed),
      gameOver: Boolean(replay.finalState && replay.finalState.gameOver),
      replayVerified: true,
      replayActionCountMatches,
      suppliedFinalStateHash,
      finalStateHashMatches:
        !suppliedFinalStateHash ||
        suppliedFinalStateHash === replay.finalStateHash,
      actionStateHashesMatch,
      traceActionHashMatches,
    }
  }

  async function verifyTeacherAttemptReplay({
    session,
    attempt,
    fallbackActor,
    expectedTraceActions = null,
  }) {
    if (!attempt) return null

    const actions = normalizeActions(attempt.actions)

    try {
      const replay = await replayTrace(session, actions)
      return enrichAttemptWithReplay({
        attempt,
        replay,
        fallbackActor,
        expectedTraceActions,
      })
    } catch (error) {
      return {
        ...attempt,
        replayVerified: false,
        replayError: boundedString(
          error && error.message ? error.message : error,
          1000
        ),
        replayActionCountMatches: false,
        traceActionHashMatches: expectedTraceActions
          ? normalizedActionSequenceHash(actions) ===
            normalizedActionSequenceHash(expectedTraceActions)
          : null,
        finalStateHashMatches: false,
        actionStateHashesMatch: false,
      }
    }
  }

  async function verifyTeacherJourneyReplays({
    teacherJourney,
    sessionId,
    traceActions,
  }) {
    if (!teacherJourney) return null

    const session = await readSession(sessionId)
    const humanAttempt = await verifyTeacherAttemptReplay({
      session,
      attempt: teacherJourney.humanAttempt,
      fallbackActor: 'human',
      expectedTraceActions: traceActions,
    })
    const localAiAttempts = []

    for (const attempt of Array.isArray(teacherJourney.localAiAttempts)
      ? teacherJourney.localAiAttempts
      : []) {
      localAiAttempts.push(
        await verifyTeacherAttemptReplay({
          session,
          attempt,
          fallbackActor: 'local-ai',
        })
      )
    }

    const replayVerifiedAttempts = [humanAttempt, ...localAiAttempts].filter(
      Boolean
    )
    const replayVerification = {
      protocol: 'idena-arc-teacher-replay-verification-v1',
      checkedAt: teacherJourney.updatedAt || teacherJourney.createdAt || '',
      attemptCount: replayVerifiedAttempts.length,
      replayVerified: replayVerifiedAttempts.every(
        (attempt) => attempt.replayVerified === true
      ),
      stateHashesMatch: replayVerifiedAttempts.every(
        (attempt) =>
          attempt.replayActionCountMatches !== false &&
          attempt.finalStateHashMatches !== false &&
          attempt.actionStateHashesMatch !== false
      ),
      humanAttemptMatchesTrace:
        !humanAttempt || humanAttempt.traceActionHashMatches === true,
    }

    return {
      ...teacherJourney,
      humanAttempt,
      localAiAttempts,
      hypothesisTimeline: normalizeHypothesisTimeline(
        deriveHypothesisTimeline(localAiAttempts)
      ),
      replayVerification,
    }
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
      replayActions: Array.isArray(trace.actions) ? trace.actions : [],
    }
    const humanRuleAnnotation = normalizeHumanRuleAnnotation(
      payload.humanRuleAnnotation || {},
      context
    )
    const aiSelfAnnotation = normalizeAiSelfAnnotation(
      payload.aiSelfAnnotation || {},
      context
    )
    const localAiGameplayAnnotation = normalizeLocalAiGameplayAnnotation(
      payload.localAiGameplayAnnotation || {},
      context
    )
    const humanReplayAnnotation = normalizeHumanReplayAnnotation(
      payload.humanReplayAnnotation || {},
      context
    )
    const normalizedComparisonAnnotation = normalizeComparisonAnnotation(
      payload.comparisonAnnotation || {},
      context
    )
    const comparisonAnnotation = {
      ...normalizedComparisonAnnotation,
      actionButtonComparison: buildActionButtonComparisonFromDescriptions(
        humanReplayAnnotation.actionButtonDescriptions,
        localAiGameplayAnnotation.actionButtonDescriptions
      ),
    }
    const normalizedTeacherJourney = normalizeTeacherJourney(
      payload.teacherJourney || {},
      context
    )
    const teacherJourney = await verifyTeacherJourneyReplays({
      teacherJourney: normalizedTeacherJourney,
      sessionId,
      traceActions: Array.isArray(trace.actions) ? trace.actions : [],
    })
    const compressedTeacherMemory = normalizeCompressedTeacherMemory(
      payload.compressedTeacherMemory ||
        (teacherJourney && teacherJourney.compressedTeacherMemory) ||
        {}
    )
    const providerAnnotationDrafts = normalizeProviderAnnotationDrafts(
      payload.providerAnnotationDrafts ||
        (teacherJourney && teacherJourney.providerAnnotationDrafts) ||
        []
    )
    const frameContext = buildCompactFrameContext(traceBundle)
    const baseAnnotationPayload = {
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
      localAiGameplayAnnotation,
      humanReplayAnnotation,
      comparisonAnnotation,
      teacherJourney,
      compressedTeacherMemory,
      providerAnnotationDrafts,
      frameContext,
    }
    const annotationValidation = buildAnnotationValidationRecord(
      baseAnnotationPayload,
      traceBundle,
      {
        verifiedCompleted: Boolean(
          (traceVerification.replay && traceVerification.replay.completed) ||
            result.result === 'completed'
        ),
      }
    )
    const annotationPayload = {
      ...baseAnnotationPayload,
      annotationValidation,
    }
    const annotationHash = hashJsonPrefixed(annotationPayload)
    const traceHashesMatch =
      annotationPayload.traceHash === result.traceHash &&
      annotationPayload.recordingHash === traceBundle.recordingHash &&
      annotationPayload.agentLogHash === traceBundle.agentLogHash &&
      annotationPayload.finalSeedHash === result.finalSeedHash
    const traceIdentityVerified = Boolean(
      traceVerification.signatureValid || traceVerification.anchorValid
    )
    const hasTrainingSignal = hasAnnotationTrainingSignal(annotationPayload)
    const acceptedForTraining =
      annotationStatus === 'final' &&
      traceVerification.traceMatches &&
      traceVerification.recordingMatches &&
      traceVerification.agentLogMatches &&
      traceIdentityVerified &&
      traceHashesMatch &&
      hasTrainingSignal &&
      annotationValidation.status === 'usable-for-training'
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
      traceIdentityVerified,
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
      localAiGameplayAnnotation: bundle.annotation.localAiGameplayAnnotation,
      humanReplayAnnotation: bundle.annotation.humanReplayAnnotation,
      comparisonAnnotation: bundle.annotation.comparisonAnnotation,
      teacherJourney: bundle.annotation.teacherJourney,
      compressedTeacherMemory: bundle.annotation.compressedTeacherMemory,
      providerAnnotationDrafts: bundle.annotation.providerAnnotationDrafts,
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
        rebuilt.agentLogVerified &&
        rebuilt.traceIdentityVerified,
      annotationHashMatches,
      acceptedForTraining: rebuilt.acceptedForTraining,
      traceReplayVerified: rebuilt.traceReplayVerified,
      recordingVerified: rebuilt.recordingVerified,
      agentLogVerified: rebuilt.agentLogVerified,
      traceIdentityVerified: rebuilt.traceIdentityVerified,
      traceHashesMatch: rebuilt.traceHashesMatch,
      hasTrainingSignal: rebuilt.hasTrainingSignal,
      annotationHash: rebuilt.annotationHash,
      suppliedAnnotationHash,
    }
  }

  async function runLocalAiAttempt(payload = {}) {
    const actions = normalizeActions(payload.actions || [])
    const preview = actions.length
      ? await previewTrace({
          ...payload,
          actions,
        })
      : null

    return {
      ok: true,
      protocol: 'idena-arc-local-ai-attempt-result-v1',
      attempt: normalizeAttemptForTeacherJourney(
        {
          actor: 'local-ai',
          attemptIndex: payload.attemptIndex || 0,
          startedAt: payload.startedAt || isoNow(),
          endedAt: isoNow(),
          actions,
          replayTimeline:
            preview && preview.replay && Array.isArray(preview.replay.timeline)
              ? preview.replay.timeline
              : [],
          finalState: preview ? preview.finalState : null,
          finalStateHash: preview ? preview.finalStateHash : null,
          completed: Boolean(preview && preview.completed),
          gameOver: Boolean(
            preview && preview.finalState && preview.finalState.gameOver
          ),
          stopReason: payload.stopReason || 'provided_actions_previewed',
          model: payload.model || '',
          runtime: payload.runtime || '',
          notes:
            'Main-process preview wrapper. Renderer local AI chat performs live step selection.',
        },
        'local-ai'
      ),
      preview,
    }
  }

  async function reviewTeacherJourney(payload = {}) {
    const teacherJourney = normalizeTeacherJourney(
      payload.teacherJourney || payload,
      {status: payload.status || 'draft'}
    )
    const humanAttempt = teacherJourney && teacherJourney.humanAttempt
    const localAiAttempts =
      teacherJourney && Array.isArray(teacherJourney.localAiAttempts)
        ? teacherJourney.localAiAttempts
        : []
    const localAiAttempt = localAiAttempts.length
      ? localAiAttempts[localAiAttempts.length - 1]
      : null

    if (!humanAttempt || !localAiAttempt) {
      return {
        ok: false,
        error: 'teacher_journey_attempts_missing',
        comparison: '',
      }
    }

    let outcomeComparison =
      'Compare action effects and repeated state hashes before retrying.'
    if (localAiAttempt.completed && !humanAttempt.completed) {
      outcomeComparison =
        'The AI found a completion the human did not; ask whether it used the correct hidden rule.'
    } else if (!localAiAttempt.completed && humanAttempt.completed) {
      outcomeComparison =
        'The human found a completion the AI missed; teach the decisive action-effect relation.'
    }

    const comparison = [
      `Human: ${humanAttempt.completed ? 'completed' : 'unfinished'}, ${
        humanAttempt.actionCount
      } action(s).`,
      `Local AI: ${localAiAttempt.completed ? 'completed' : 'unfinished'}, ${
        localAiAttempt.actionCount
      } action(s), stop=${localAiAttempt.stopReason || 'unknown'}.`,
      outcomeComparison,
    ].join('\n')

    return {
      ok: true,
      protocol: 'idena-arc-teacher-review-v1',
      comparison,
      teacherJourney,
    }
  }

  async function compressTeacherFeedback(payload = {}) {
    const source = [
      payload.text,
      payload.humanFeedback,
      payload.teacherFeedback,
      payload.humanVsAiGap,
    ]
      .filter(Boolean)
      .join('\n')
    const compressedTeacherMemory = compressTeacherFeedbackText(source)

    return {
      ok: Boolean(compressedTeacherMemory),
      compressedTeacherMemory,
    }
  }

  async function finalizeTeacherJourney(payload = {}) {
    const teacherJourney = normalizeTeacherJourney(
      payload.teacherJourney || {},
      {status: 'final'}
    )
    const compressedTeacherMemory = normalizeCompressedTeacherMemory(
      payload.compressedTeacherMemory ||
        (teacherJourney && teacherJourney.compressedTeacherMemory) ||
        {}
    )

    return {
      ok: Boolean(teacherJourney),
      protocol: 'idena-arc-teacher-finalize-v1',
      teacherJourney: teacherJourney
        ? {
            ...teacherJourney,
            phase: 'finalized',
            compressedTeacherMemory,
          }
        : null,
      compressedTeacherMemory,
    }
  }

  async function importAnnotationBundle(payload = {}) {
    const bundle = payload.annotationBundle || payload.bundle || payload.payload

    if (!bundle || !bundle.annotation) {
      return {
        accepted: false,
        reason: 'annotation_bundle_required',
      }
    }

    const verification = await verifyAnnotationBundle({
      annotationBundle: bundle,
      traceBundle: payload.traceBundle,
    })

    if (!verification.ok) {
      return {
        accepted: false,
        reason: 'annotation_verification_failed',
        verification,
      }
    }

    await writeJson(
      annotationBundlePath(bundle.annotation.sessionId, bundle.annotationId),
      bundle
    )

    return {
      accepted: true,
      reason: null,
      annotationId: bundle.annotationId,
      annotationHash: bundle.annotationHash,
      verification,
      stored: {
        namespace: 'idena-arc/annotations',
        sessionId: bundle.annotation.sessionId,
        filename: `${safeId(bundle.annotationId, 'annotation')}.json`,
      },
    }
  }

  function verifyTrainingDatasetShape(dataset = {}) {
    if (!dataset || dataset.protocol !== TRAINING_DATASET_EXPORT_PROTOCOL) {
      return {ok: false, reason: 'dataset_protocol_invalid'}
    }

    const examples = Array.isArray(dataset.examples) ? dataset.examples : []
    const expectedCount = Number(dataset.exampleCount)

    if (
      Number.isFinite(expectedCount) &&
      expectedCount >= 0 &&
      examples.length !== expectedCount
    ) {
      return {ok: false, reason: 'dataset_example_count_mismatch'}
    }

    if (String(dataset.datasetHash || '').trim()) {
      const datasetWithoutHash = {...dataset}
      delete datasetWithoutHash.datasetHash
      delete datasetWithoutHash.stored

      if (dataset.datasetHash !== hashJsonPrefixed(datasetWithoutHash)) {
        return {ok: false, reason: 'dataset_hash_mismatch'}
      }
    }

    const invalidExample = examples.find(
      (example) =>
        !example ||
        typeof example !== 'object' ||
        Array.isArray(example) ||
        example.protocol !== TRAINING_EXAMPLE_PROTOCOL ||
        !String(example.annotationHash || '').trim() ||
        !String(example.traceHash || '').trim()
    )

    if (invalidExample) {
      return {ok: false, reason: 'dataset_example_invalid'}
    }

    return {
      ok: true,
      reason: null,
      exampleCount: examples.length,
      datasetHash: dataset.datasetHash || hashJsonPrefixed(dataset),
    }
  }

  function comparableTrainingExample(example = {}) {
    const comparable = {...example}
    delete comparable.privateText
    return comparable
  }

  async function verifyTrainingDatasetSources(dataset = {}) {
    const examples = Array.isArray(dataset.examples) ? dataset.examples : []
    const bundles = await listAnnotationBundles({})
    const bundlesByAnnotationHash = new Map()

    bundles.forEach((bundle) => {
      if (bundle && bundle.annotationHash && bundle.trainingExample) {
        bundlesByAnnotationHash.set(bundle.annotationHash, bundle)
      }
    })

    for (const example of examples) {
      const annotationHash = String(example.annotationHash || '').trim()
      const bundle = bundlesByAnnotationHash.get(annotationHash)

      if (!bundle) {
        return {
          ok: false,
          reason: 'dataset_annotation_source_missing',
          annotationHash,
        }
      }

      if (
        !bundle.acceptedForTraining ||
        !bundle.annotation ||
        bundle.annotation.status !== 'final'
      ) {
        return {
          ok: false,
          reason: 'dataset_annotation_source_not_final',
          annotationHash,
        }
      }

      const verification = await verifyAnnotationBundle({
        annotationBundle: bundle,
      }).catch((error) => ({
        ok: false,
        error: String(error && error.message ? error.message : error),
      }))

      if (!verification.ok) {
        return {
          ok: false,
          reason: 'dataset_annotation_source_verification_failed',
          annotationHash,
          verification,
        }
      }

      if (
        hashJsonPrefixed(comparableTrainingExample(example)) !==
        hashJsonPrefixed(bundle.trainingExample)
      ) {
        return {
          ok: false,
          reason: 'dataset_example_source_mismatch',
          annotationHash,
        }
      }
    }

    return {
      ok: true,
      reason: null,
      checkedExampleCount: examples.length,
    }
  }

  async function verifyTrainingDataset(payload = {}) {
    const dataset = payload.dataset || payload.trainingDataset || payload.bundle
    const verification = verifyTrainingDatasetShape(dataset)

    if (!verification.ok) {
      return {
        ok: false,
        reason: verification.reason,
        verification,
      }
    }

    const sourceVerification = await verifyTrainingDatasetSources(dataset)

    return {
      ...verification,
      ok: sourceVerification.ok,
      reason: sourceVerification.ok ? null : sourceVerification.reason,
      sourceVerified: sourceVerification.ok,
      sourceVerification,
    }
  }

  async function importTrainingDataset(payload = {}) {
    const dataset = payload.dataset || payload.trainingDataset || payload.bundle
    const verification = await verifyTrainingDataset(payload)

    if (!verification.ok) {
      return {
        accepted: false,
        reason: verification.reason,
        verification,
      }
    }

    const exportId =
      dataset.exportId ||
      `imported-${String(verification.datasetHash || '')
        .replace(/^sha256:/, '')
        .slice(0, 16)}`
    const datasetForStorage = {...dataset}
    delete datasetForStorage.stored

    await writeJson(trainingDatasetPath(exportId), datasetForStorage)

    return {
      accepted: true,
      reason: null,
      exportId,
      datasetHash: verification.datasetHash,
      verification,
      stored: {
        namespace: 'idena-arc/training-datasets',
        filename: `${safeId(exportId, 'export')}.json`,
      },
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
    const includePrivateFields = payload.includePrivateFields === true
    const examples = bundles
      .filter((bundle) => bundle && bundle.trainingExample)
      .filter((bundle) =>
        payload.includeDrafts ? true : bundle.annotation.status === 'final'
      )
      .map((bundle) => {
        if (!includePrivateFields) {
          return bundle.trainingExample
        }

        return {
          ...bundle.trainingExample,
          privateText: {
            localAiGameplayExplanation:
              (bundle.annotation.localAiGameplayAnnotation &&
                bundle.annotation.localAiGameplayAnnotation.explanationText) ||
              '',
            humanReplayExplanation:
              (bundle.annotation.humanReplayAnnotation &&
                bundle.annotation.humanReplayAnnotation.explanationText) ||
              '',
          },
        }
      })
    const exportId =
      payload.exportId ||
      `idena-arc-training-${Date.now().toString(36)}-${examples.length}`
    const dataset = {
      protocol: TRAINING_DATASET_EXPORT_PROTOCOL,
      exportId,
      access: 'local-only-private-by-default',
      releasePolicy: 'private-by-default-explicit-publish-only',
      privateFieldsIncluded: includePrivateFields,
      createdAt: isoNow(),
      exampleCount: examples.length,
      capabilityTags: Array.from(
        new Set(examples.flatMap((example) => example.capabilityTags || []))
      ).sort(),
      taskTypeCounts: examples
        .flatMap((example) =>
          Array.isArray(example.trainingTasks) ? example.trainingTasks : []
        )
        .reduce((acc, task) => {
          const taskType = task && task.taskType ? task.taskType : 'unknown'
          acc[taskType] = (acc[taskType] || 0) + 1
          return acc
        }, {}),
      negativeExampleCount: examples.reduce(
        (sum, example) =>
          sum +
          (Array.isArray(example.target && example.target.negativeExamples)
            ? example.target.negativeExamples.length
            : 0),
        0
      ),
      preferencePairCount: examples.reduce(
        (sum, example) =>
          sum +
          (Array.isArray(example.target && example.target.preferencePairs)
            ? example.target.preferencePairs.length
            : 0),
        0
      ),
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
    const bundle = await readTraceBundleInput(payload)

    if (!bundle) {
      throw new Error('Trace bundle is required')
    }

    if (containsPrivateSigningField(bundle)) {
      throw new Error('Trace bundle contains private signing material')
    }

    const verification = await verifyTraceBundle({bundle})

    if (!verification.ok) {
      throw new Error(
        verification.reason || 'trace_bundle_replay_verification_failed'
      )
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
      arcAgiRuntime: await getArcAgiRuntimeStatus(),
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
    prepareArcAgiRuntime,
    listArcAgiPublicGames,
    generateGame,
    submitTrace,
    previewTrace,
    runLocalAiAttempt,
    reviewTeacherJourney,
    compressTeacherFeedback,
    finalizeTeacherJourney,
    submitArcAgiScorecard,
    verifyTraceBundle,
    saveAnnotationBundle,
    verifyAnnotationBundle,
    importAnnotationBundle,
    listAnnotationBundles,
    exportTrainingDataset,
    verifyTrainingDataset,
    importTrainingDataset,
    uploadTraceBundle,
  }
}

module.exports = {
  PROTOCOL,
  TRACE_PROTOCOL,
  RESULT_PROTOCOL,
  TEACHER_JOURNEY_PROTOCOL,
  createIdenaArcManager,
}
