/* eslint-disable react/prop-types */
import React from 'react'
import {
  Badge,
  Box,
  Code,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  Heading,
  HStack,
  IconButton,
  Input,
  Kbd,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from '@chakra-ui/react'
import Layout from '../shared/components/layout'
import {Page, PageTitle} from '../shared/components/components'
import {PrimaryButton, SecondaryButton} from '../shared/components/button'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  RefreshIcon,
  UndoIcon,
} from '../shared/components/icons'

const DEFAULT_ACTIONS = ['move_right', 'move_down', 'move_down'].join('\n')
const DEFAULT_RPC_URL = 'http://127.0.0.1:9009'
const DEFAULT_PLAY_DURATION_MS = 3 * 60 * 1000
const LOCAL_ACTION_DELTAS = {
  move_up: {x: 0, y: -1},
  up: {x: 0, y: -1},
  move_right: {x: 1, y: 0},
  right: {x: 1, y: 0},
  move_down: {x: 0, y: 1},
  down: {x: 0, y: 1},
  move_left: {x: -1, y: 0},
  left: {x: -1, y: 0},
}
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
const KEY_ACTIONS = {
  ArrowUp: 'move_up',
  w: 'move_up',
  W: 'move_up',
  ArrowRight: 'move_right',
  d: 'move_right',
  D: 'move_right',
  ArrowDown: 'move_down',
  s: 'move_down',
  S: 'move_down',
  ArrowLeft: 'move_left',
  a: 'move_left',
  A: 'move_left',
}
const DIRECTION_CONTROLS = [
  {
    action: 'move_up',
    arcAction: 'ACTION1',
    label: 'Move up',
    icon: <ArrowUpIcon />,
  },
  {
    action: 'move_left',
    arcAction: 'ACTION3',
    label: 'Move left',
    icon: <ArrowLeftIcon />,
  },
  {
    action: 'move_right',
    arcAction: 'ACTION4',
    label: 'Move right',
    icon: <ArrowRightIcon />,
  },
  {
    action: 'move_down',
    arcAction: 'ACTION2',
    label: 'Move down',
    icon: <ArrowDownIcon />,
  },
]
let browserDemoBridge = null

function getIdenaArcBridge() {
  const bridge = global.idenaArc

  if (bridge && bridge.bridgeMode !== 'browser_stub') {
    return bridge
  }

  if (!browserDemoBridge) {
    browserDemoBridge = createBrowserDemoBridge()
  }

  return browserDemoBridge
}

function parseActions(value) {
  return String(value || '')
    .split('\n')
    .map((line, index) => ({
      t_ms: index * 1000,
      action: line.trim(),
    }))
    .filter((item) => item.action)
}

function arcActionName(action) {
  return (
    ARC_ACTION_ALIASES[
      String(action || '')
        .trim()
        .toLowerCase()
    ] || null
  )
}

function cloneJson(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value
}

function getGridSize(state) {
  return Math.max(1, Number(state && state.gridSize ? state.gridSize : 5))
}

function clampCoordinate(value, size) {
  return Math.max(0, Math.min(size - 1, value))
}

function sameCell(left, right) {
  return Boolean(
    left &&
      right &&
      Number(left.x) === Number(right.x) &&
      Number(left.y) === Number(right.y)
  )
}

function isBlockedCell(state, cell) {
  return (Array.isArray(state && state.obstacles) ? state.obstacles : []).some(
    (obstacle) => sameCell(obstacle, cell)
  )
}

function applyLocalAction(state, actionName) {
  if (!state) return state

  const nextState = cloneJson(state)
  const size = getGridSize(nextState)
  const delta = LOCAL_ACTION_DELTAS[String(actionName || '').trim()] || {
    x: 0,
    y: 0,
  }
  const current = nextState.player || {x: 0, y: 0}
  const candidate = {
    x: clampCoordinate(Number(current.x || 0) + delta.x, size),
    y: clampCoordinate(Number(current.y || 0) + delta.y, size),
  }

  if (!isBlockedCell(nextState, candidate)) {
    nextState.player = candidate
  }

  nextState.turn = Number(nextState.turn || 0) + 1
  nextState.completed = sameCell(nextState.player, nextState.goal)
  return nextState
}

function replayLocalActions(initialState, actionLog) {
  return (Array.isArray(actionLog) ? actionLog : []).reduce(
    (state, item) => applyLocalAction(state, item.action),
    cloneJson(initialState)
  )
}

function buildActionsText(actionLog) {
  return (Array.isArray(actionLog) ? actionLog : [])
    .map((item) => item.action)
    .filter(Boolean)
    .join('\n')
}

function scoreLocalState(state, actionCount) {
  if (!state || !state.player || !state.goal) return 0
  const size = getGridSize(state)
  const maxDistance = (size - 1) * 2
  const remaining =
    Math.abs(Number(state.player.x) - Number(state.goal.x)) +
    Math.abs(Number(state.player.y) - Number(state.goal.y))
  const progress = maxDistance - remaining
  const completionBonus = state.completed ? 700 : 0
  const efficiency = Math.max(0, 200 - actionCount * 8)
  return Math.max(0, completionBonus + progress * 25 + efficiency)
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getPlayDuration(session) {
  const manifest = session && session.manifest

  if (!manifest || !manifest.startTime || !manifest.endTime) {
    return DEFAULT_PLAY_DURATION_MS
  }

  const start = new Date(manifest.startTime).getTime()
  const end = new Date(manifest.endTime).getTime()
  const duration = end - start

  return Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_PLAY_DURATION_MS
}

function cellTypeFor(state, x, y) {
  const cell = {x, y}

  if (sameCell(state && state.player, cell)) return 'player'
  if (sameCell(state && state.goal, cell)) return 'goal'
  if (isBlockedCell(state, cell)) return 'obstacle'
  return 'empty'
}

function moveActionForCell(state, x, y) {
  const player = state && state.player

  if (!player) return null

  const dx = Number(x) - Number(player.x)
  const dy = Number(y) - Number(player.y)

  if (Math.abs(dx) + Math.abs(dy) !== 1) return null
  if (dx === 1) return 'move_right'
  if (dx === -1) return 'move_left'
  if (dy === 1) return 'move_down'
  if (dy === -1) return 'move_up'
  return null
}

function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  const cryptoRef = typeof window !== 'undefined' ? window.crypto : undefined

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    cryptoRef.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

function simpleHashHex(value) {
  const input = String(value || '')
  const bytes = []
  let hash = 2166136261

  for (let index = 0; index < 32; index += 1) {
    for (let charIndex = 0; charIndex < input.length; charIndex += 1) {
      hash =
        (hash * 16777619 + input.charCodeAt(charIndex) + index) % 4294967296
    }
    hash = (hash + index * 2654435761) % 4294967296
    bytes.push(Math.floor(hash % 256))
  }

  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function buildRenderHints(state) {
  const size = getGridSize(state)

  return {
    renderer: 'idena-arc-grid-v0',
    board: {
      type: 'square-grid',
      width: size,
      height: size,
      origin: 'top-left',
    },
    input: {
      modes: ['keyboard', 'direction-buttons', 'adjacent-cell-click'],
      keyboard: KEY_ACTIONS,
    },
    objective: {
      type: 'reach-goal',
      visible: true,
      summary: 'Reach the target cell while avoiding blocked cells.',
    },
  }
}

function buildDemoInitialState(seed) {
  const digest = simpleHashHex(seed)
  const byteAt = (index) => parseInt(digest.slice(index * 2, index * 2 + 2), 16)
  const size = 5
  const goal = {
    x: byteAt(0) % size,
    y: byteAt(1) % size,
  }
  let obstacle = {
    x: byteAt(2) % size,
    y: byteAt(3) % size,
  }

  if (sameCell(goal, {x: 0, y: 0})) {
    goal.x = 4
    goal.y = 4
  }

  if (sameCell(obstacle, {x: 0, y: 0}) || sameCell(obstacle, goal)) {
    obstacle = {x: (goal.x + 2) % size, y: (goal.y + 1) % size}
  }

  return {
    engine: 'browser-demo-local-grid-v0',
    arcengineAvailable: false,
    arcAgiAvailable: false,
    gridSize: size,
    player: {x: 0, y: 0},
    goal,
    obstacles: [obstacle],
    turn: 0,
    completed: false,
  }
}

function buildDemoGame(seed, generator = {}) {
  const initialState = buildDemoInitialState(seed)

  return {
    protocol: 'idena-arc-sidecar-v0',
    engine: initialState.engine,
    arcengineAvailable: false,
    arcAgiAvailable: false,
    generator,
    seed,
    title: 'IdenaArc Browser Demo Grid',
    level: 0,
    actionSpace: DIRECTION_CONTROLS.map(({action, arcAction, label}) => ({
      name: action,
      arcAction,
      label,
    })),
    renderHints: buildRenderHints(initialState),
    initialState,
    initialStateHash: `demo:${simpleHashHex(JSON.stringify(initialState))}`,
    goalStateHash: `demo:${simpleHashHex(
      JSON.stringify({goal: initialState.goal, gridSize: initialState.gridSize})
    )}`,
  }
}

function ensureDemoParticipant(session, payload = {}) {
  const participantId = String(payload.participantId || 'player-1')
  const participants = session.participants || {}
  const existing = participants[participantId] || {}

  participants[participantId] = {
    participantId,
    address: payload.address || existing.address || null,
    identityStatus: existing.identityStatus || null,
    adapter: 'browser-demo',
    joinedAt: existing.joinedAt || new Date().toISOString(),
    ...existing,
  }
  session.participants = participants
  return participants[participantId]
}

function replayDemo(game, actions) {
  const normalizedActions = Array.isArray(actions) ? actions : []
  let state = cloneJson(game.initialState)
  const replayedActions = []
  const timeline = [
    {
      phase: 'initial',
      step: 0,
      t_ms: 0,
      actionInput: null,
      state: cloneJson(state),
      stateHash: `demo:${simpleHashHex(JSON.stringify(state))}`,
      score: scoreLocalState(state, 0),
      fullReset: true,
    },
  ]

  normalizedActions.forEach((item, index) => {
    if (state.completed) return

    const action = String(item.action || item.type || item || '').trim()
    if (!action) return

    state = applyLocalAction(state, action)
    const observationHash = `demo:${simpleHashHex(JSON.stringify(state))}`
    replayedActions.push({
      t_ms: Number(item.t_ms || item.tMs || index * 1000) || 0,
      action,
      observation_hash: observationHash,
    })
    timeline.push({
      phase: 'action',
      step: replayedActions.length,
      t_ms: Number(item.t_ms || item.tMs || index * 1000) || 0,
      actionInput: {
        id: replayedActions.length - 1,
        data: {
          action,
          arc_action: arcActionName(action),
          t_ms: Number(item.t_ms || item.tMs || index * 1000) || 0,
        },
      },
      state: cloneJson(state),
      stateHash: observationHash,
      score: scoreLocalState(state, replayedActions.length),
      fullReset: false,
    })
  })

  return {
    protocol: 'idena-arc-sidecar-v0',
    engine: state.engine,
    arcengineAvailable: false,
    arcAgiAvailable: false,
    renderHints: buildRenderHints(state),
    actions: replayedActions,
    timeline,
    finalState: state,
    finalStateHash: `demo:${simpleHashHex(JSON.stringify(state))}`,
    score: scoreLocalState(state, replayedActions.length),
    completed: Boolean(state.completed),
  }
}

function demoTimestampFromOffset(baseIso, offsetMs) {
  const parsed = Date.parse(baseIso || '')
  const startMs = Number.isFinite(parsed) ? parsed : 0

  return new Date(startMs + Math.max(0, Number(offsetMs) || 0)).toISOString()
}

function demoFrameFromState(state = {}) {
  const size = getGridSize(state)
  const frame = Array.from({length: size}, () =>
    Array.from({length: size}, () => '.')
  )
  const place = (cell, value) => {
    const x = Number(cell && cell.x)
    const y = Number(cell && cell.y)

    if (x >= 0 && x < size && y >= 0 && y < size) {
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

function buildBrowserRecording(session, trace, replay) {
  const timeline = Array.isArray(replay.timeline) ? replay.timeline : []
  const entries = timeline.map((point, index) => {
    const actionInput = point.actionInput
      ? {
          id: point.actionInput.id,
          data: {
            game_id: session.sessionId,
            ...(point.actionInput.data || {}),
            arc_action: arcActionName(point.actionInput.data.action),
          },
          reasoning: point.actionInput.reasoning || null,
        }
      : null

    return {
      timestamp: demoTimestampFromOffset(
        session.manifest && session.manifest.startTime,
        point.t_ms
      ),
      data: {
        game_id: session.sessionId,
        frame: demoFrameFromState(point.state || {}),
        state: point.state || null,
        score: typeof point.score === 'number' ? point.score : null,
        action_input: actionInput,
        guid: `${session.sessionId}:${
          trace.participantId || 'player'
        }:${index}`,
        full_reset: Boolean(point.fullReset || index === 0),
        state_hash: point.stateHash || null,
      },
    }
  })
  const jsonl = entries.map((entry) => JSON.stringify(entry)).join('\n')

  return {
    protocol: 'idena-arc-recording-v0',
    format: 'arc-style-jsonl-v0',
    source: 'idena-arc-browser-demo-replay',
    gameId: session.sessionId,
    generatorHash: session.manifest && session.manifest.generator.hash,
    generatorVersion: session.manifest && session.manifest.generator.version,
    entries,
    jsonl: jsonl ? `${jsonl}\n` : '',
  }
}

function createBrowserDemoBridge() {
  const sessions = new Map()
  const generator = {
    cid: 'browser-demo:renderer/pages/idena-arc.js',
    hash: 'browser-demo',
    version: '0.1.0',
  }

  function getSession(sessionId) {
    const session = sessions.get(sessionId)
    if (!session)
      throw new Error(`Browser demo session not found: ${sessionId}`)
    return session
  }

  function computeSeedForSession(session, payload = {}) {
    const reveals = Array.isArray(payload.reveals) ? payload.reveals : []
    const seedMaterial = JSON.stringify({
      sessionId: session.sessionId,
      generator,
      manifest: session.manifest,
      commitments: Object.values(session.participants || {}).map(
        (item) => item.commitment
      ),
      reveals,
    })
    const finalSeed = simpleHashHex(seedMaterial)

    session.finalSeed = {
      finalSeed,
      finalSeedHash: `demo:${simpleHashHex(finalSeed)}`,
      computedAt: new Date().toISOString(),
    }
    session.updatedAt = new Date().toISOString()
    return session.finalSeed
  }

  return {
    bridgeMode: 'browser_demo',
    status: async () => ({
      ok: true,
      protocol: 'idena-arc-session-v0',
      bridgeMode: 'browser_demo',
      warning:
        'Browser demo mode is for UI testing only. It does not sign Idena results.',
      generator,
      sessions: Array.from(sessions.values()).slice(-10).reverse(),
    }),
    resolveIdentity: async (payload = {}) => ({
      ok: true,
      adapter: 'browser-demo',
      address: payload.address || null,
      epoch: {mode: 'browser-demo'},
      identity: null,
      identityStatus: null,
      unresolved: !payload.address,
      reason: payload.address ? null : 'browser_demo_unsigned',
    }),
    createSession: async (payload = {}) => {
      const createdAt = new Date().toISOString()
      const sessionId =
        String(payload.sessionId || '').trim() ||
        `idena-arc-browser-${Date.now().toString(36)}`
      const startTime = new Date()
      const endTime = new Date(startTime.getTime() + DEFAULT_PLAY_DURATION_MS)
      const session = {
        protocol: 'idena-arc-session-v0',
        sessionId,
        createdAt,
        updatedAt: createdAt,
        relay: {type: 'browser-memory-demo-v0'},
        manifest: {
          protocol: 'idena-arc-session-v0',
          sessionId,
          generator,
          rehearsalEpochOrRound: null,
          networkEntropy: `browser-demo:${createdAt}`,
          sessionNonce: simpleHashHex(`${sessionId}:${createdAt}`),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          submissionCutoff: new Date(endTime.getTime() + 30000).toISOString(),
        },
        participants: {},
        finalSeed: null,
        game: null,
        results: [],
      }

      ensureDemoParticipant(session, payload)
      sessions.set(sessionId, session)
      return cloneJson(session)
    },
    joinSession: async (payload = {}) => {
      const session = getSession(payload.sessionId)
      const participant = ensureDemoParticipant(session, payload)
      session.updatedAt = new Date().toISOString()
      return {session: cloneJson(session), participant: cloneJson(participant)}
    },
    commitSalt: async (payload = {}) => {
      const session = getSession(payload.sessionId)
      const participant = ensureDemoParticipant(session, payload)
      const salt = String(payload.salt || randomHex(32))
      const commitment = `demo:${simpleHashHex(`idena-arc-salt-v0:${salt}`)}`

      participant.commitment = commitment
      participant.committedAt = new Date().toISOString()
      participant.revealedSaltHash = null
      participant.revealedAt = null
      session.updatedAt = new Date().toISOString()

      return {
        session: cloneJson(session),
        participant: cloneJson(participant),
        salt,
        commitment,
      }
    },
    revealSalt: async (payload = {}) => {
      const session = getSession(payload.sessionId)
      const participant = ensureDemoParticipant(session, payload)
      const salt = String(payload.salt || '')
      const commitment = `demo:${simpleHashHex(`idena-arc-salt-v0:${salt}`)}`

      if (participant.commitment && participant.commitment !== commitment) {
        throw new Error('Salt does not match commitment')
      }

      participant.revealedSaltHash = `demo:${simpleHashHex(salt)}`
      participant.revealedAt = new Date().toISOString()
      participant.revealAccepted = true
      session.updatedAt = new Date().toISOString()

      return {
        session: cloneJson(session),
        participant: cloneJson(participant),
        salt,
      }
    },
    computeFinalSeed: async (payload = {}) => {
      const session = getSession(payload.sessionId)
      computeSeedForSession(session, payload)

      return {session: cloneJson(session), ...session.finalSeed}
    },
    generateGame: async (payload = {}) => {
      const session = getSession(payload.sessionId)

      if (!session.finalSeed) {
        computeSeedForSession(session, payload)
      }

      session.game = {
        ...buildDemoGame(session.finalSeed.finalSeed, generator),
        generatedAt: new Date().toISOString(),
      }
      session.updatedAt = new Date().toISOString()

      return {session: cloneJson(session), game: cloneJson(session.game)}
    },
    submitTrace: async (payload = {}) => {
      const session = getSession(payload.sessionId)

      if (!session.finalSeed) {
        computeSeedForSession(session, payload)
      }

      if (!session.game) {
        session.game = buildDemoGame(session.finalSeed.finalSeed, generator)
      }

      const participant = ensureDemoParticipant(session, payload)
      const replay = replayDemo(session.game, payload.actions)
      const trace = {
        protocol: 'idena-arc-trace-v0',
        sessionId: session.sessionId,
        playerAddress: participant.address,
        participantId: participant.participantId,
        initialStateHash: session.game.initialStateHash,
        actions: replay.actions,
        finalStateHash: replay.finalStateHash,
        score: replay.score,
        feedback: payload.feedback || {},
      }
      const recording = buildBrowserRecording(session, trace, replay)
      const resultId = `${participant.participantId}-${Date.now().toString(36)}`
      const recordingFilename = `${session.sessionId}.${participant.participantId}.512.${resultId}.recording.jsonl`
      const bundle = {
        protocol: 'idena-arc-trace-bundle-v0',
        resultId,
        verified: false,
        replayVerified: true,
        signatureValid: false,
        anchorValid: false,
        recordingHash: `demo:${simpleHashHex(JSON.stringify(recording))}`,
        recordingJsonlHash: `demo:${simpleHashHex(recording.jsonl)}`,
        recordingFilename,
        result: {
          protocol: 'idena-arc-result-v0',
          sessionId: session.sessionId,
          playerAddress: participant.address,
          generatorCid: generator.cid,
          generatorHash: generator.hash,
          generatorVersion: generator.version,
          finalSeedHash: session.finalSeed && session.finalSeed.finalSeedHash,
          score: replay.score,
          result: replay.completed ? 'completed' : 'attempted',
          traceHash: `demo:${simpleHashHex(JSON.stringify(trace))}`,
          clientVersion: 'idena-arc-browser-demo-v0.1.0',
          createdAt: new Date().toISOString(),
          signature: null,
          identityProof: {
            type: 'browser-demo-proof-v0',
            status: 'unsigned',
          },
        },
        trace,
        replay,
        recording,
      }

      session.results = (session.results || []).concat({
        resultId,
        participantId: participant.participantId,
        score: replay.score,
        verified: false,
        storedAt: new Date().toISOString(),
      })
      session.updatedAt = new Date().toISOString()

      return {session: cloneJson(session), bundle}
    },
    verifyTraceBundle: async (payload = {}) => ({
      ok: Boolean(payload.bundle),
      traceMatches: Boolean(payload.bundle),
      recordingMatches: Boolean(payload.bundle && payload.bundle.recording),
      signatureValid: false,
      anchorValid: false,
    }),
    uploadTraceBundle: async () => ({
      ok: false,
      error: 'Browser demo mode cannot upload trace bundles.',
    }),
  }
}

function JsonBlock({value}) {
  if (!value) return null

  return (
    <Code
      display="block"
      w="full"
      whiteSpace="pre-wrap"
      borderRadius="md"
      p={4}
      colorScheme="gray"
      fontSize="xs"
      maxH="360px"
      overflowY="auto"
    >
      {JSON.stringify(value, null, 2)}
    </Code>
  )
}

function Field({label, children}) {
  return (
    <FormControl>
      <FormLabel mb={2} color="brandGray.500" fontWeight={500}>
        {label}
      </FormLabel>
      {children}
    </FormControl>
  )
}

function ArcCell({type, selected, playing, x, y, onClick}) {
  const isPlayer = type === 'player'
  const isGoal = type === 'goal'
  const isObstacle = type === 'obstacle'
  let borderColor = 'gray.300'
  let backgroundColor = 'white'
  let hoverBackground = 'blue.010'

  if (isObstacle) {
    borderColor = 'gray.600'
    backgroundColor = 'gray.700'
  }

  if (isGoal) {
    backgroundColor = 'green.010'
    hoverBackground = 'green.020'
  }

  if (selected) {
    borderColor = 'blue.500'
  }

  return (
    <Box
      as="button"
      type="button"
      aria-label={`Cell ${x + 1}, ${y + 1}: ${type}`}
      position="relative"
      w={['44px', '56px']}
      h={['44px', '56px']}
      flexShrink={0}
      borderWidth={selected ? '2px' : '1px'}
      borderColor={borderColor}
      borderRadius="sm"
      bg={backgroundColor}
      boxShadow={isPlayer ? '0 0 0 2px rgba(87, 143, 255, 0.22)' : 'none'}
      cursor={playing && !isObstacle ? 'pointer' : 'default'}
      transition="background 0.15s ease, border-color 0.15s ease, transform 0.15s ease"
      _hover={
        playing && !isObstacle
          ? {
              bg: hoverBackground,
              borderColor: 'blue.500',
            }
          : undefined
      }
      _focus={{
        outline: '2px solid',
        outlineColor: 'blue.500',
        outlineOffset: '2px',
      }}
      onClick={onClick}
    >
      <Flex position="absolute" inset={0} align="center" justify="center">
        {isGoal ? (
          <Box
            w="46%"
            h="46%"
            borderWidth="2px"
            borderColor="green.500"
            borderRadius="2px"
            transform="rotate(45deg)"
          />
        ) : null}
        {isObstacle ? (
          <Box w="64%" h="12%" borderRadius="full" bg="gray.300" />
        ) : null}
        {isPlayer ? (
          <Box
            w="44%"
            h="44%"
            borderRadius="full"
            bg="blue.500"
            borderWidth="3px"
            borderColor="white"
            boxShadow="0 6px 16px rgba(87, 143, 255, 0.35)"
          />
        ) : null}
      </Flex>
    </Box>
  )
}

function DirectionButton({control, disabled, onAction}) {
  return (
    <Tooltip label={control.label}>
      <IconButton
        aria-label={control.label}
        icon={React.cloneElement(control.icon, {boxSize: 5})}
        variant="secondary"
        minW={10}
        h={10}
        borderRadius="md"
        isDisabled={disabled}
        onClick={() => onAction(control.action)}
      />
    </Tooltip>
  )
}

function ArcGameBoard({
  game,
  state,
  playing,
  selectedCell,
  actionLog,
  elapsedMs,
  durationMs,
  onStart,
  onAction,
  onUndo,
  onReset,
  onSelectCell,
}) {
  const size = getGridSize(state || (game && game.initialState))
  const completed = Boolean(state && state.completed)
  const score = scoreLocalState(state, actionLog.length)
  let playStatus = 'Ready'
  let startLabel = 'Start'
  const remainingMs = Math.max(
    0,
    Number(durationMs || 0) - Number(elapsedMs || 0)
  )
  const progressValue = Math.min(
    100,
    Math.max(0, (Number(elapsedMs || 0) / Number(durationMs || 1)) * 100)
  )
  const canAct = Boolean(
    game && state && playing && !completed && remainingMs > 0
  )

  if (playing) {
    playStatus = 'Playing'
    startLabel = 'Playing'
  }

  if (actionLog.length && !playing) {
    startLabel = 'Resume'
  }

  if (completed) {
    playStatus = 'Completed'
  }

  const handleKeyDown = React.useCallback(
    (event) => {
      const action = KEY_ACTIONS[event.key]

      if (!action || !canAct) return

      event.preventDefault()
      onAction(action)
    },
    [canAct, onAction]
  )

  if (!game) {
    return (
      <Stack
        spacing={3}
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="gray.300"
        borderRadius="md"
        p={5}
        bg="gray.50"
      >
        <Text fontWeight={600}>No generated game yet</Text>
        <Text color="muted" fontSize="sm">
          Create a session, commit and reveal a salt, then generate a game. The
          playable board appears here and records the trace automatically.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack spacing={4}>
      <Flex
        align={['stretch', 'center']}
        justify="space-between"
        gap={3}
        flexDirection={['column', 'row']}
      >
        <Box>
          <Text fontWeight={600}>{game.title || 'IdenaArc Local Grid'}</Text>
          <HStack
            spacing={2}
            mt={1}
            color="muted"
            fontSize="sm"
            flexWrap="wrap"
          >
            <Text>Level {Number(game.level || 0)}</Text>
            <Text>Score {score}</Text>
            <Text>{playStatus}</Text>
          </HStack>
        </Box>
        <HStack spacing={2}>
          <PrimaryButton onClick={onStart} isDisabled={!game || completed}>
            {startLabel}
          </PrimaryButton>
          <Tooltip label="Undo last action">
            <IconButton
              aria-label="Undo last action"
              icon={<UndoIcon />}
              variant="secondary"
              h={8}
              minW={8}
              isDisabled={!actionLog.length}
              onClick={onUndo}
            />
          </Tooltip>
          <Tooltip label="Reset game">
            <IconButton
              aria-label="Reset game"
              icon={<RefreshIcon />}
              variant="secondary"
              h={8}
              minW={8}
              onClick={onReset}
            />
          </Tooltip>
        </HStack>
      </Flex>

      <Box>
        <HStack justify="space-between" mb={2} color="muted" fontSize="sm">
          <Text>Time {formatClock(remainingMs)}</Text>
          <Text>{actionLog.length} actions</Text>
        </HStack>
        <Progress
          value={progressValue}
          size="sm"
          borderRadius="full"
          colorScheme={remainingMs <= 30000 ? 'orange' : 'blue'}
          bg="gray.100"
        />
      </Box>

      <Flex
        gap={5}
        align={['stretch', 'flex-start']}
        flexDirection={['column', 'row']}
      >
        <Box
          tabIndex={0}
          role="application"
          aria-label="IdenaArc playable grid"
          onKeyDown={handleKeyDown}
          p={3}
          bg="gray.50"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          _focus={{
            outline: '2px solid',
            outlineColor: 'blue.500',
            outlineOffset: '2px',
          }}
        >
          <Grid
            templateColumns={`repeat(${size}, max-content)`}
            gap={2}
            w="max-content"
            maxW="100%"
          >
            {Array.from({length: size * size}, (_, index) => {
              const x = index % size
              const y = Math.floor(index / size)
              const type = cellTypeFor(state, x, y)
              const selected = sameCell(selectedCell, {x, y})

              return (
                <ArcCell
                  key={`${x}:${y}`}
                  type={type}
                  x={x}
                  y={y}
                  selected={selected}
                  playing={canAct}
                  onClick={() => {
                    const action = moveActionForCell(state, x, y)
                    onSelectCell({x, y})
                    if (action && canAct) {
                      onAction(action)
                    }
                  }}
                />
              )
            })}
          </Grid>
        </Box>

        <Stack spacing={4} minW={['auto', '180px']}>
          <Box>
            <Text fontWeight={600} mb={2}>
              Controls
            </Text>
            <Grid templateColumns="repeat(3, 40px)" gap={2} alignItems="center">
              <Box />
              <DirectionButton
                control={DIRECTION_CONTROLS[0]}
                disabled={!canAct}
                onAction={onAction}
              />
              <Box />
              <DirectionButton
                control={DIRECTION_CONTROLS[1]}
                disabled={!canAct}
                onAction={onAction}
              />
              <Box h={10} borderRadius="md" bg="gray.100" />
              <DirectionButton
                control={DIRECTION_CONTROLS[2]}
                disabled={!canAct}
                onAction={onAction}
              />
              <Box />
              <DirectionButton
                control={DIRECTION_CONTROLS[3]}
                disabled={!canAct}
                onAction={onAction}
              />
              <Box />
            </Grid>
            <HStack
              mt={3}
              spacing={1}
              color="muted"
              fontSize="sm"
              flexWrap="wrap"
            >
              <Kbd>WASD</Kbd>
              <Text>or</Text>
              <Kbd>Arrow keys</Kbd>
            </HStack>
          </Box>

          <Box>
            <Text fontWeight={600} mb={2}>
              Legend
            </Text>
            <Stack spacing={2} color="muted" fontSize="sm">
              <HStack>
                <Box w={3} h={3} borderRadius="full" bg="blue.500" />
                <Text>Player</Text>
              </HStack>
              <HStack>
                <Box
                  w={3}
                  h={3}
                  borderWidth="2px"
                  borderColor="green.500"
                  transform="rotate(45deg)"
                />
                <Text>Target</Text>
              </HStack>
              <HStack>
                <Box w={4} h={2} borderRadius="full" bg="gray.600" />
                <Text>Blocked</Text>
              </HStack>
            </Stack>
          </Box>
        </Stack>
      </Flex>
    </Stack>
  )
}

export default function IdenaArcPage() {
  const toast = useToast()
  const [mounted, setMounted] = React.useState(false)
  const [busy, setBusy] = React.useState(null)
  const [adapter, setAdapter] = React.useState('external')
  const [proofMode, setProofMode] = React.useState('node-signature')
  const [rpcUrl, setRpcUrl] = React.useState(DEFAULT_RPC_URL)
  const [apiKey, setApiKey] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [proofTxHash, setProofTxHash] = React.useState('')
  const [proofCid, setProofCid] = React.useState('')
  const [proofContract, setProofContract] = React.useState('')
  const [sessionId, setSessionId] = React.useState('')
  const [participantId, setParticipantId] = React.useState('player-1')
  const [salt, setSalt] = React.useState('')
  const [actions, setActions] = React.useState(DEFAULT_ACTIONS)
  const [status, setStatus] = React.useState(null)
  const [identity, setIdentity] = React.useState(null)
  const [session, setSession] = React.useState(null)
  const [game, setGame] = React.useState(null)
  const [playState, setPlayState] = React.useState(null)
  const [playing, setPlaying] = React.useState(false)
  const [startedAt, setStartedAt] = React.useState(null)
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const [actionLog, setActionLog] = React.useState([])
  const [selectedCell, setSelectedCell] = React.useState(null)
  const [bundle, setBundle] = React.useState(null)
  const [lastResult, setLastResult] = React.useState(null)
  const adapterTouchedRef = React.useRef(false)

  const playDurationMs = React.useMemo(
    () => getPlayDuration(session),
    [session]
  )

  const applyStatus = React.useCallback((result) => {
    setStatus(result)

    const connection = result && result.rehearsalConnection
    if (!connection || !connection.url || adapterTouchedRef.current) {
      return
    }

    setAdapter('rehearsal-devnet')
    setProofMode('devnet-local-signature')
    setRpcUrl(connection.url)
    setApiKey(connection.apiKey || '')

    if (result.rehearsalSigner && result.rehearsalSigner.address) {
      setAddress(result.rehearsalSigner.address)
    }
  }, [])

  const basePayload = React.useMemo(
    () => ({
      adapter,
      proofMode,
      rpcUrl,
      apiKey,
      address,
      proofTxHash,
      proofCid,
      proofContract,
      participantId,
      sessionId,
    }),
    [
      adapter,
      proofMode,
      rpcUrl,
      apiKey,
      address,
      proofTxHash,
      proofCid,
      proofContract,
      participantId,
      sessionId,
    ]
  )

  const recordingSummary = React.useMemo(() => {
    if (!bundle || !bundle.recording) return null
    const entries = Array.isArray(bundle.recording.entries)
      ? bundle.recording.entries.length
      : 0
    const jsonlLines = bundle.recording.jsonl
      ? bundle.recording.jsonl.trim().split('\n').filter(Boolean).length
      : 0

    return {
      protocol: bundle.recording.protocol,
      entries,
      jsonlLines,
      hash: bundle.recordingHash,
      jsonlHash: bundle.recordingJsonlHash,
      filename: bundle.recordingFilename,
      lastArcAction:
        bundle.recording.entries &&
        bundle.recording.entries
          .map(
            (entry) =>
              entry &&
              entry.data &&
              entry.data.action_input &&
              entry.data.action_input.data &&
              entry.data.action_input.data.arc_action
          )
          .filter(Boolean)
          .slice(-1)[0],
    }
  }, [bundle])

  const run = React.useCallback(
    async (label, action) => {
      setBusy(label)
      try {
        const result = await action()
        setLastResult(result)
        return result
      } catch (error) {
        const message = String(error && error.message ? error.message : error)
        toast({
          title: `${label} failed`,
          description: message,
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
        const failure = {
          ok: false,
          action: label,
          error: message,
        }
        setLastResult(failure)
        return failure
      } finally {
        setBusy(null)
      }
    },
    [toast]
  )

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    let ignore = false
    getIdenaArcBridge()
      .status()
      .then((result) => {
        if (!ignore) applyStatus(result)
      })
      .catch(() => {})

    return () => {
      ignore = true
    }
  }, [applyStatus])

  React.useEffect(() => {
    if (!playing || !startedAt) return undefined

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)

    return () => clearInterval(timer)
  }, [playing, startedAt])

  React.useEffect(() => {
    if (!playing) return

    if (
      (playState && playState.completed) ||
      elapsedMs >= Math.max(1000, playDurationMs)
    ) {
      setPlaying(false)
    }
  }, [elapsedMs, playDurationMs, playState, playing])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const renderGameMode = () => {
      if (playing) return 'playing'
      if (game) return 'ready'
      return 'setup'
    }

    window.render_game_to_text = () =>
      JSON.stringify({
        mode: renderGameMode(),
        coordinateSystem: 'origin top-left, x right, y down',
        sessionId: session && session.sessionId,
        gridSize: playState && playState.gridSize,
        player: playState && playState.player,
        goal: playState && playState.goal,
        obstacles: playState && playState.obstacles,
        completed: Boolean(playState && playState.completed),
        score: playState ? scoreLocalState(playState, actionLog.length) : 0,
        actions: actionLog.map((item) => item.action),
        elapsedMs,
        remainingMs: Math.max(0, playDurationMs - elapsedMs),
        traceSubmitted: Boolean(bundle),
        replayVerified: Boolean(bundle && bundle.replayVerified),
        recordingProtocol: recordingSummary && recordingSummary.protocol,
        recordingEntries:
          bundle && bundle.recording && Array.isArray(bundle.recording.entries)
            ? bundle.recording.entries.length
            : 0,
        recordingJsonlLines:
          recordingSummary && recordingSummary.jsonlLines
            ? recordingSummary.jsonlLines
            : 0,
        recordingJsonlHash:
          recordingSummary && recordingSummary.jsonlHash
            ? recordingSummary.jsonlHash
            : null,
        recordingFilename:
          recordingSummary && recordingSummary.filename
            ? recordingSummary.filename
            : null,
        lastArcAction:
          recordingSummary && recordingSummary.lastArcAction
            ? recordingSummary.lastArcAction
            : null,
      })
    window.advanceTime = async (ms) => {
      setElapsedMs((current) =>
        Math.min(playDurationMs, current + Math.max(0, Number(ms) || 0))
      )
      return true
    }

    return () => {
      delete window.render_game_to_text
      delete window.advanceTime
    }
  }, [
    actionLog,
    bundle,
    elapsedMs,
    game,
    playDurationMs,
    playState,
    playing,
    recordingSummary,
    session,
  ])

  const resetPlayFromGame = React.useCallback((nextGame) => {
    const initialState = nextGame && nextGame.initialState

    setPlayState(initialState ? cloneJson(initialState) : null)
    setPlaying(false)
    setStartedAt(null)
    setElapsedMs(0)
    setActionLog([])
    setSelectedCell(null)
    setActions('')
    setBundle(null)
  }, [])

  const handleStartPlay = React.useCallback(() => {
    if (!game) return

    setPlayState((current) => current || cloneJson(game.initialState))
    setStartedAt(Date.now() - elapsedMs)
    setPlaying(true)
  }, [elapsedMs, game])

  const handleLocalAction = React.useCallback(
    (action) => {
      if (!game || !playState) return
      if (playState.completed || elapsedMs >= playDurationMs) {
        setPlaying(false)
        return
      }

      const effectiveStartedAt = startedAt || Date.now()
      const tMs = Math.max(0, Date.now() - effectiveStartedAt)
      const nextAction = {
        t_ms: Math.trunc(tMs),
        action,
      }

      if (!startedAt) {
        setStartedAt(effectiveStartedAt)
      }

      setPlaying(true)
      setPlayState((current) => applyLocalAction(current, action))
      setActionLog((current) => {
        const nextLog = current.concat(nextAction)
        setActions(buildActionsText(nextLog))
        return nextLog
      })
      setBundle(null)
    },
    [elapsedMs, game, playDurationMs, playState, startedAt]
  )

  const handleUndoAction = React.useCallback(() => {
    if (!game || !game.initialState) return

    setActionLog((current) => {
      const nextLog = current.slice(0, -1)
      setPlayState(replayLocalActions(game.initialState, nextLog))
      setActions(buildActionsText(nextLog))
      setBundle(null)
      return nextLog
    })
  }, [game])

  const handleResetPlay = React.useCallback(() => {
    if (game) {
      resetPlayFromGame(game)
    }
  }, [game, resetPlayFromGame])

  const handleActionsChange = React.useCallback(
    (value) => {
      setActions(value)
      const parsedActions = parseActions(value)
      setActionLog(parsedActions)
      if (game && game.initialState) {
        setPlayState(replayLocalActions(game.initialState, parsedActions))
      }
      setBundle(null)
    },
    [game]
  )

  const handleResolveIdentity = React.useCallback(async () => {
    const result = await run('Resolve identity', () =>
      getIdenaArcBridge().resolveIdentity(basePayload)
    )
    setIdentity(result)
    if (!result || result.ok === false) return
    if (result && result.address) {
      setAddress(result.address)
    }
  }, [basePayload, run])

  const handleCreateSession = React.useCallback(async () => {
    const result = await run('Create session', () =>
      getIdenaArcBridge().createSession(basePayload)
    )
    if (!result || result.ok === false) return
    setSession(result)
    setSessionId(result.sessionId)
    setGame(null)
    resetPlayFromGame(null)
  }, [basePayload, resetPlayFromGame, run])

  const handleJoinSession = React.useCallback(async () => {
    const result = await run('Join session', () =>
      getIdenaArcBridge().joinSession(basePayload)
    )
    if (!result || result.ok === false) return
    setSession(result.session)
    if (result.session && result.session.game) {
      setGame(result.session.game)
      resetPlayFromGame(result.session.game)
    }
  }, [basePayload, resetPlayFromGame, run])

  const handleCommitSalt = React.useCallback(async () => {
    const result = await run('Commit salt', () =>
      getIdenaArcBridge().commitSalt(basePayload)
    )
    if (!result || result.ok === false) return
    setSalt(result.salt)
    setSession(result.session)
  }, [basePayload, run])

  const handleRevealSalt = React.useCallback(async () => {
    const result = await run('Reveal salt', () =>
      getIdenaArcBridge().revealSalt({...basePayload, salt})
    )
    if (!result || result.ok === false) return
    setSession(result.session)
  }, [basePayload, run, salt])

  const handleComputeSeed = React.useCallback(async () => {
    const result = await run('Compute seed', () =>
      getIdenaArcBridge().computeFinalSeed({
        ...basePayload,
        reveals: [{participantId, salt}],
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
  }, [basePayload, participantId, run, salt])

  const handleGenerateGame = React.useCallback(async () => {
    const result = await run('Generate game', () =>
      getIdenaArcBridge().generateGame({
        ...basePayload,
        reveals: [{participantId, salt}],
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
    setGame(result.game)
    resetPlayFromGame(result.game)
  }, [basePayload, participantId, resetPlayFromGame, run, salt])

  const handleSubmitTrace = React.useCallback(async () => {
    const result = await run('Submit trace', () =>
      getIdenaArcBridge().submitTrace({
        ...basePayload,
        actions: actionLog.length ? actionLog : parseActions(actions),
        feedback: {
          difficulty: 2,
          human_notes: 'MVP smoke trace',
        },
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
    setBundle(result.bundle)
  }, [actionLog, actions, basePayload, run])

  const pageContent = (
    <Page>
      <Flex w="full" align="flex-start" justify="space-between" gap={4}>
        <Box>
          <HStack spacing={3} mb={2}>
            <PageTitle mb={0}>IdenaArc</PageTitle>
            <Badge colorScheme="blue" borderRadius="full" px={2}>
              MVP
            </Badge>
          </HStack>
          <Text color="muted" maxW="760px">
            Rehearsal-first ARC-style sessions with local salt relay,
            deterministic replay, and Idena proof anchors. Private keys never go
            into the web interface.
          </Text>
        </Box>
        <SecondaryButton
          onClick={() => getIdenaArcBridge().status().then(applyStatus)}
        >
          Refresh
        </SecondaryButton>
      </Flex>

      <SimpleGrid columns={[1, 1, 2]} spacing={6} w="full" mt={6}>
        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Identity
          </Heading>
          <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
            <Field label="Adapter">
              <Select
                value={adapter}
                onChange={(e) => {
                  const nextAdapter = e.target.value
                  adapterTouchedRef.current = true
                  setAdapter(nextAdapter)
                  if (nextAdapter === 'rehearsal-devnet') {
                    setProofMode('devnet-local-signature')
                    if (status && status.rehearsalConnection) {
                      setRpcUrl(status.rehearsalConnection.url || '')
                      setApiKey(status.rehearsalConnection.apiKey || '')
                    }
                    if (
                      status &&
                      status.rehearsalSigner &&
                      status.rehearsalSigner.address
                    ) {
                      setAddress(status.rehearsalSigner.address)
                    }
                  } else if (proofMode === 'devnet-local-signature') {
                    setProofMode('node-signature')
                  }
                }}
              >
                <option value="external">External RPC</option>
                <option value="rehearsal-devnet">Rehearsal devnet</option>
              </Select>
            </Field>
            <Field label="Participant">
              <Input
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
              />
            </Field>
          </Grid>
          <Field label="Proof mode">
            <Select
              value={proofMode}
              isDisabled={adapter === 'rehearsal-devnet'}
              onChange={(e) => setProofMode(e.target.value)}
            >
              {adapter === 'rehearsal-devnet' ? (
                <option value="devnet-local-signature">
                  Devnet local signature
                </option>
              ) : null}
              <option value="node-signature">
                Local node signature (dna_sign)
              </option>
              <option value="tx-anchor">Tx/IPFS anchor proof</option>
            </Select>
            <FormHelperText>
              Private keys stay out of the renderer. Use local node signing for
              localhost RPC, or create an anchor payload for a classical tx /
              idena.social-style contract proof.
            </FormHelperText>
          </Field>
          <Field label="RPC URL">
            <Input
              value={rpcUrl}
              isDisabled={adapter === 'rehearsal-devnet'}
              onChange={(e) => setRpcUrl(e.target.value)}
            />
          </Field>
          <Field label="API key">
            <Input
              value={apiKey}
              isDisabled={adapter === 'rehearsal-devnet'}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field label="Address">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <FormHelperText>
              Leave empty with a local node and IdenaArc will ask
              dna_getCoinbaseAddr. Tx-anchor mode needs an explicit address.
            </FormHelperText>
          </Field>
          {proofMode === 'tx-anchor' ? (
            <Stack spacing={4}>
              <Field label="Proof tx hash">
                <Input
                  value={proofTxHash}
                  onChange={(e) => setProofTxHash(e.target.value)}
                  placeholder="optional after broadcast"
                />
              </Field>
              <Field label="Proof CID">
                <Input
                  value={proofCid}
                  onChange={(e) => setProofCid(e.target.value)}
                  placeholder="optional IPFS proof payload CID"
                />
              </Field>
              <Field label="Proof contract">
                <Input
                  value={proofContract}
                  onChange={(e) => setProofContract(e.target.value)}
                  placeholder="<idena-arc-proof-contract>"
                />
              </Field>
            </Stack>
          ) : null}
          <PrimaryButton
            alignSelf="flex-start"
            isLoading={busy === 'Resolve identity'}
            onClick={handleResolveIdentity}
          >
            Resolve identity
          </PrimaryButton>
          <JsonBlock value={identity} />
        </Stack>

        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Session
          </Heading>
          <Field label="Session ID">
            <Input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            />
          </Field>
          <HStack spacing={3} flexWrap="wrap">
            <PrimaryButton
              isLoading={busy === 'Create session'}
              onClick={handleCreateSession}
            >
              Create
            </PrimaryButton>
            <SecondaryButton
              isLoading={busy === 'Join session'}
              onClick={handleJoinSession}
              isDisabled={!sessionId}
            >
              Join
            </SecondaryButton>
          </HStack>
          <HStack spacing={3} flexWrap="wrap">
            <SecondaryButton
              isLoading={busy === 'Commit salt'}
              onClick={handleCommitSalt}
              isDisabled={!sessionId && !session}
            >
              Commit salt
            </SecondaryButton>
            <SecondaryButton
              isLoading={busy === 'Reveal salt'}
              onClick={handleRevealSalt}
              isDisabled={!salt}
            >
              Reveal salt
            </SecondaryButton>
            <SecondaryButton
              isLoading={busy === 'Compute seed'}
              onClick={handleComputeSeed}
              isDisabled={!salt}
            >
              Derive seed
            </SecondaryButton>
          </HStack>
          <Field label="Salt">
            <Input value={salt} onChange={(e) => setSalt(e.target.value)} />
          </Field>
          <JsonBlock value={session} />
        </Stack>
      </SimpleGrid>

      <SimpleGrid columns={[1, 1, 2]} spacing={6} w="full" mt={6}>
        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Game
          </Heading>
          <HStack spacing={3} flexWrap="wrap">
            <PrimaryButton
              alignSelf="flex-start"
              isLoading={busy === 'Generate game'}
              onClick={handleGenerateGame}
              isDisabled={!sessionId || !salt}
            >
              Generate
            </PrimaryButton>
            {game ? (
              <Badge colorScheme={game.arcAgiAvailable ? 'green' : 'orange'}>
                {game.arcAgiAvailable ? 'ARC-AGI toolkit ready' : 'Local grid'}
              </Badge>
            ) : null}
          </HStack>
          <ArcGameBoard
            game={game}
            state={playState}
            playing={playing}
            selectedCell={selectedCell}
            actionLog={actionLog}
            elapsedMs={elapsedMs}
            durationMs={playDurationMs}
            onStart={handleStartPlay}
            onAction={handleLocalAction}
            onUndo={handleUndoAction}
            onReset={handleResetPlay}
            onSelectCell={setSelectedCell}
          />
          {game ? (
            <Box>
              <Text fontWeight={600} mb={2}>
                Game state
              </Text>
              <JsonBlock
                value={{
                  initialStateHash: game.initialStateHash,
                  goalStateHash: game.goalStateHash,
                  currentState: playState,
                  renderHints: game.renderHints,
                }}
              />
            </Box>
          ) : null}
        </Stack>

        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Trace
          </Heading>
          <Field label="Actions">
            <Textarea
              minH="140px"
              value={actions}
              onChange={(e) => handleActionsChange(e.target.value)}
            />
            <FormHelperText>
              Playing the board records this list automatically. You can still
              edit it manually for replay-verification tests.
            </FormHelperText>
          </Field>
          <PrimaryButton
            alignSelf="flex-start"
            isLoading={busy === 'Submit trace'}
            onClick={handleSubmitTrace}
            isDisabled={!game || (proofMode === 'tx-anchor' && !address)}
          >
            {proofMode === 'tx-anchor'
              ? 'Submit trace + proof draft'
              : 'Submit signed trace'}
          </PrimaryButton>
          {recordingSummary ? (
            <Stack
              spacing={2}
              borderWidth="1px"
              borderColor="green.200"
              bg="green.010"
              borderRadius="md"
              p={3}
            >
              <HStack spacing={2} flexWrap="wrap">
                <Badge colorScheme="green">Recording ready</Badge>
                <Text fontSize="sm" color="brandGray.500">
                  {recordingSummary.entries} entries,{' '}
                  {recordingSummary.jsonlLines} JSONL lines
                </Text>
              </HStack>
              <Code
                display="block"
                whiteSpace="pre-wrap"
                colorScheme="green"
                fontSize="xs"
              >
                {recordingSummary.jsonlHash || recordingSummary.hash}
              </Code>
              {recordingSummary.filename ? (
                <Text fontSize="xs" color="brandGray.500">
                  {recordingSummary.filename}
                </Text>
              ) : null}
              {recordingSummary.lastArcAction ? (
                <Text fontSize="xs" color="brandGray.500">
                  Last ARC action {recordingSummary.lastArcAction}
                </Text>
              ) : null}
            </Stack>
          ) : null}
          <JsonBlock value={bundle} />
        </Stack>
      </SimpleGrid>

      <Stack spacing={4} w="full" mt={6}>
        <Heading as="h2" fontSize="md" fontWeight={600}>
          Runtime
        </Heading>
        <JsonBlock value={lastResult || status} />
      </Stack>
    </Page>
  )

  return mounted ? (
    <Layout syncing={false} offline={false} allowWhenNodeUnavailable>
      {pageContent}
    </Layout>
  ) : (
    <Box minH="100vh" bg="gray.50">
      {pageContent}
    </Box>
  )
}
