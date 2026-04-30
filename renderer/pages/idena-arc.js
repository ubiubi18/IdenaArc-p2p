/* eslint-disable react/prop-types */
import React from 'react'
import {
  Badge,
  Box,
  Center,
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
  InputGroup,
  InputRightElement,
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
import {BASE_API_URL, BASE_INTERNAL_API_PORT} from '../shared/api/api-client'
import {
  useOptionalSettingsDispatch,
  useOptionalSettingsState,
} from '../shared/providers/settings-context'
import {buildLocalAiRuntimePayload} from '../shared/utils/ai-provider-readiness'
import {
  DEFAULT_LOCAL_AI_MEMORY_REFERENCE,
  RECOMMENDED_LOCAL_AI_OLLAMA_MODEL,
  buildRecommendedLocalAiMacPreset,
} from '../shared/utils/local-ai-settings'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  LaptopIcon,
  OpenIcon,
  RefreshIcon,
  SettingsIcon,
  TickIcon,
  UndoIcon,
} from '../shared/components/icons'

const DEFAULT_ACTIONS = ['move_right', 'move_down', 'move_down'].join('\n')
const DEFAULT_PLAY_DURATION_MS = 3 * 60 * 1000
const ARC_INPUT_DEBOUNCE_MS = 500
const ARC_HELD_KEY_REPEAT_MS = 500
const TEACHER_JOURNEY_PROTOCOL = 'idena-arc-teacher-journey-v1'
const LOCAL_AI_ATTEMPT_ACTION_CAP = 64
const LOCAL_AI_ATTEMPT_REPEATED_STATE_CAP = 4
const LOCAL_AI_ATTEMPT_WALL_MS = 5 * 60 * 1000
const LOCAL_AI_STEP_TIMEOUT_MS = 12000
const ARC_PUBLIC_GAMES = [
  {id: 'ls20', label: 'ls20 · Agent reasoning'},
  {id: 'ft09', label: 'ft09 · Elementary logic'},
  {id: 'vc33', label: 'vc33 · Orchestration'},
  {id: 'ar25', label: 'ar25 · Public ARC-AGI game'},
  {id: 'bp35', label: 'bp35 · Public ARC-AGI game'},
  {id: 'cd82', label: 'cd82 · Public ARC-AGI game'},
  {id: 'cn04', label: 'cn04 · Public ARC-AGI game'},
  {id: 'dc22', label: 'dc22 · Public ARC-AGI game'},
  {id: 'g50t', label: 'g50t · Public ARC-AGI game'},
  {id: 'ka59', label: 'ka59 · Public ARC-AGI game'},
  {id: 'lf52', label: 'lf52 · Public ARC-AGI game'},
  {id: 'lp85', label: 'lp85 · Public ARC-AGI game'},
  {id: 'm0r0', label: 'm0r0 · Public ARC-AGI game'},
  {id: 'r11l', label: 'r11l · Public ARC-AGI game'},
  {id: 're86', label: 're86 · Public ARC-AGI game'},
  {id: 's5i5', label: 's5i5 · Public ARC-AGI game'},
  {id: 'sb26', label: 'sb26 · Public ARC-AGI game'},
  {id: 'sc25', label: 'sc25 · Public ARC-AGI game'},
  {id: 'sk48', label: 'sk48 · Public ARC-AGI game'},
  {id: 'sp80', label: 'sp80 · Public ARC-AGI game'},
  {id: 'su15', label: 'su15 · Public ARC-AGI game'},
  {id: 'tn36', label: 'tn36 · Public ARC-AGI game'},
  {id: 'tr87', label: 'tr87 · Public ARC-AGI game'},
  {id: 'tu93', label: 'tu93 · Public ARC-AGI game'},
  {id: 'wa30', label: 'wa30 · Public ARC-AGI game'},
]
const ARC_COLOR_PALETTE = [
  '#000000',
  '#0074d9',
  '#ff4136',
  '#2ecc40',
  '#ffdc00',
  '#aaaaaa',
  '#f012be',
  '#ff851b',
  '#7fdbff',
  '#870c25',
  '#ffffff',
  '#39cccc',
  '#b10dc9',
  '#01ff70',
  '#85144b',
  '#001f3f',
]
const ARC_DISPLAY_COLOR_PALETTE = [
  '#11151c',
  '#3f6ed8',
  '#d55353',
  '#5fbf72',
  '#d8b44b',
  '#868d96',
  '#b852c8',
  '#d27a47',
  '#76c4da',
  '#873449',
  '#f3efe2',
  '#4fb5aa',
  '#8762cb',
  '#72c874',
  '#764268',
  '#1e3555',
]
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
const ARC_KEY_ACTIONS = {
  ArrowUp: 'ACTION1',
  w: 'ACTION1',
  W: 'ACTION1',
  ArrowDown: 'ACTION2',
  s: 'ACTION2',
  S: 'ACTION2',
  ArrowLeft: 'ACTION3',
  a: 'ACTION3',
  A: 'ACTION3',
  ArrowRight: 'ACTION4',
  d: 'ACTION4',
  D: 'ACTION4',
  ' ': 'ACTION5',
  Spacebar: 'ACTION5',
  f: 'ACTION5',
  F: 'ACTION5',
  e: 'ACTION5',
  E: 'ACTION5',
  Enter: 'ACTION5',
  z: 'ACTION7',
  Z: 'ACTION7',
  r: 'RESET',
  R: 'RESET',
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
const ARC_DPAD_CONTROLS = [
  {
    action: 'ACTION1',
    label: 'Action 1 / up',
    keyLabel: 'W',
    icon: <ArrowUpIcon />,
  },
  {
    action: 'ACTION3',
    label: 'Action 3 / left',
    keyLabel: 'A',
    icon: <ArrowLeftIcon />,
  },
  {
    action: 'ACTION4',
    label: 'Action 4 / right',
    keyLabel: 'D',
    icon: <ArrowRightIcon />,
  },
  {
    action: 'ACTION2',
    label: 'Action 2 / down',
    keyLabel: 'S',
    icon: <ArrowDownIcon />,
  },
]
const ARC_FACE_CONTROLS = [
  {action: 'ACTION5', label: 'ACTION5', keyLabel: 'Space / F'},
  {action: 'ACTION7', label: 'Undo', keyLabel: 'Ctrl+Z'},
]
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
const ARC_PUBLIC_GAME_ACTION_SETS = [
  {
    game: 'ls20',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4'],
    family: 'keyboard',
  },
  {game: 'ft09', actions: ['ACTION6'], family: 'click'},
  {game: 'vc33', actions: ['ACTION6'], family: 'click'},
  {
    game: 'ar25',
    actions: [
      'ACTION1',
      'ACTION2',
      'ACTION3',
      'ACTION4',
      'ACTION5',
      'ACTION6',
      'ACTION7',
    ],
    family: 'keyboard, click, undo',
  },
  {
    game: 'bp35',
    actions: ['ACTION3', 'ACTION4', 'ACTION6', 'ACTION7'],
    family: 'horizontal keyboard, click, undo',
  },
  {
    game: 'cd82',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5', 'ACTION6'],
    family: 'keyboard, click',
  },
  {
    game: 'cn04',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5', 'ACTION6'],
    family: 'keyboard, click',
  },
  {
    game: 'dc22',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION6'],
    family: 'keyboard, click',
  },
  {
    game: 'g50t',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5'],
    family: 'keyboard',
  },
  {
    game: 'ka59',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION6'],
    family: 'keyboard, click',
  },
  {
    game: 'lf52',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION6', 'ACTION7'],
    family: 'keyboard, click, undo',
  },
  {game: 'lp85', actions: ['ACTION6'], family: 'click'},
  {
    game: 'm0r0',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5', 'ACTION6'],
    family: 'keyboard, click',
  },
  {game: 'r11l', actions: ['ACTION6'], family: 'click'},
  {
    game: 're86',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5'],
    family: 'keyboard',
  },
  {game: 's5i5', actions: ['ACTION6'], family: 'click'},
  {
    game: 'sb26',
    actions: ['ACTION5', 'ACTION6', 'ACTION7'],
    family: 'primary action, click, undo',
  },
  {
    game: 'sc25',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION6'],
    family: 'keyboard, click',
  },
  {
    game: 'sk48',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION6', 'ACTION7'],
    family: 'keyboard, click, undo',
  },
  {
    game: 'sp80',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5', 'ACTION6'],
    family: 'keyboard, click',
  },
  {game: 'su15', actions: ['ACTION6', 'ACTION7'], family: 'click, undo'},
  {game: 'tn36', actions: ['ACTION6'], family: 'click'},
  {
    game: 'tr87',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4'],
    family: 'keyboard',
  },
  {
    game: 'tu93',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4'],
    family: 'keyboard',
  },
  {
    game: 'wa30',
    actions: ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5'],
    family: 'keyboard',
  },
]
const ARC_SALT_INSERTION_CANDIDATES = [
  'action_remap',
  'object_role',
  'target_transform',
  'permission_gate',
  'delayed_effect',
  'undo_semantics',
  'budget_rule',
  'mode_toggle',
]
const ACTION_LAB_RULE_EDITOR_STEPS = [
  'Choose an existing input channel.',
  'Pick a trigger and visible feedback.',
  'Add deterministic preconditions.',
  'Mark salted constants.',
  'Run human and local AI playtests.',
  'Export a signed rule proposal.',
]
const OPENAI_TEXT_PRICING_USD_PER_MTOK = {
  // Snapshot used for transparent estimates; platform billing remains authoritative.
  'gpt-5.5': {input: 2.5, output: 15},
  'gpt-5.5-mini': {input: 0.25, output: 2},
  'gpt-5.4': {input: 2.5, output: 15},
  'gpt-5.4-mini': {input: 0.25, output: 2},
  'gpt-5.3-chat-latest': {input: 1.75, output: 14},
  'gpt-5.3-codex': {input: 1.75, output: 14},
  'gpt-5-mini': {input: 0.25, output: 2},
  'gpt-4.1': {input: 2, output: 8},
  'gpt-4.1-mini': {input: 0.4, output: 1.6},
  'gpt-4o': {input: 2.5, output: 10},
  'gpt-4o-mini': {input: 0.15, output: 0.6},
  'o4-mini': {input: 1.1, output: 4.4},
}
const TEACHER_STEPS = [
  {id: 'play', label: 'Play'},
  {id: 'ai', label: 'AI try'},
  {id: 'compare', label: 'Compare'},
  {id: 'coach', label: 'Coach'},
]
const TEACHER_FEEDBACK_BUTTONS = [
  {
    id: 'missed-rule',
    label: 'Missed rule',
    failedAbstraction:
      'Missed the hidden rule and treated the board as a plain movement puzzle.',
    gap: 'The human tracked a rule that the AI did not model, then changed the action plan around that rule.',
    correction:
      'Before repeating an action, explain what hidden rule it is testing and what observation would disprove it.',
    capabilityTag: 'hidden-rule-tracking',
    adapterTarget: 'hidden-rule tracker',
  },
  {
    id: 'looped',
    label: 'Looped',
    failedAbstraction:
      'Repeated actions without extracting a new invariant from the changed frame.',
    gap: 'The human stopped probing once the action stopped producing new evidence; the AI kept looping.',
    correction:
      'After two similar observations, switch to a different probe or state the invariant that was learned.',
    capabilityTag: 'loop-avoidance',
    adapterTarget: 'novelty-aware action policy',
  },
  {
    id: 'overfit-color',
    label: 'Overfit color',
    failedAbstraction:
      'Overfit to visible colors instead of testing object roles and transitions.',
    gap: 'The human compared object roles across steps; the AI described surface color patterns only.',
    correction:
      'Name the object role and transition, not only its color, before choosing the next action.',
    capabilityTag: 'object-role-abstraction',
    adapterTarget: 'object-role abstraction',
  },
  {
    id: 'wrong-action',
    label: 'Wrong action',
    failedAbstraction:
      'Predicted the next action without linking it to replay evidence.',
    gap: 'The human selected actions from observed effects; the AI guessed from the current frame.',
    correction:
      'Tie every next action to the previous observation hash or visible state change.',
    capabilityTag: 'evidence-linked-policy',
    adapterTarget: 'evidence-linked action policy',
  },
]
const BROWSER_LOCAL_GENERATOR = {
  cid: 'browser-demo:renderer/pages/idena-arc.js',
  hash: 'browser-demo',
  version: '0.1.0',
  kind: 'idena-arc-local-grid-v0',
}
const BROWSER_ARC_FIXTURE_VERSION = '0.1.0'
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

function getP2pArtifactsBridge() {
  const bridge = global.p2pArtifacts

  if (bridge && bridge.bridgeMode !== 'browser_stub') {
    return bridge
  }

  return {
    exportSignedArtifact: async () => ({
      ok: false,
      error: 'Signed artifact export requires the Electron main process.',
    }),
    verifySignedArtifact: async () => ({
      ok: false,
      error: 'Signed artifact verification requires the Electron main process.',
    }),
    publishArtifactToIpfs: async () => ({
      ok: false,
      error: 'Signed artifact publishing requires the Electron main process.',
    }),
    importArtifactByCid: async () => ({
      ok: false,
      error: 'Signed artifact import requires the Electron main process.',
    }),
  }
}

function getLocalAiBridge() {
  const bridge = global.localAi

  if (bridge && typeof bridge.chat === 'function') {
    return bridge
  }

  return {
    bridgeMode: 'browser_stub',
    chat: async () => ({
      ok: false,
      error: 'local_ai_unavailable',
      lastError: 'Local AI chat is unavailable in browser demo mode.',
      content: null,
    }),
  }
}

function parseActions(value) {
  return String(value || '')
    .split('\n')
    .map((line, index) => {
      const parts = line.trim().split(/\s+/).filter(Boolean)
      const action = parts[0] || ''
      const x = Number(parts[1])
      const y = Number(parts[2])
      const item = {
        t_ms: index * 1000,
        action,
      }

      if (Number.isFinite(x) && Number.isFinite(y)) {
        item.x = Math.max(0, Math.min(63, Math.trunc(x)))
        item.y = Math.max(0, Math.min(63, Math.trunc(y)))
      }

      return item
    })
    .filter((item) => item.action)
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

function actionButtonShortLabel(action) {
  const descriptor = actionButtonDescriptionForAction(action)
  const keys = Array.isArray(descriptor.keys) ? descriptor.keys : []
  const keyLabel = keys.length ? `/${keys[0]}` : ''

  return `${descriptor.action} · ${descriptor.buttonLabel}${keyLabel}`
}

function buildUsedActionButtonDescriptions(actions) {
  const seen = new Set()
  const result = []

  ;(Array.isArray(actions) ? actions : []).forEach((item) => {
    const action =
      item && typeof item === 'object' ? item.arcAction || item.action : item
    const descriptor = actionButtonDescriptionForAction(action)

    if (!descriptor.action || seen.has(descriptor.action)) return
    seen.add(descriptor.action)
    result.push(descriptor)
  })

  return result
}

function buildActionButtonComparison(humanActions, aiActions) {
  const humanSet = new Set(
    buildUsedActionButtonDescriptions(humanActions).map((item) => item.action)
  )
  const aiSet = new Set(
    buildUsedActionButtonDescriptions(aiActions).map((item) => item.action)
  )
  const allActions = Array.from(new Set([...humanSet, ...aiSet])).sort()

  return {
    protocol: 'idena-arc-action-button-comparison-v0',
    rule: 'Human and AI action annotations use the same ACTION button descriptions before comparing outcomes.',
    buttons: allActions.map((action) => {
      const descriptor = actionButtonDescriptionForAction(action)

      return {
        ...descriptor,
        usedBy: {
          human: humanSet.has(action),
          localAi: aiSet.has(action),
        },
      }
    }),
  }
}

function visualAnnotationTitle(marker) {
  const label = String(marker && marker.label ? marker.label : marker?.id || '')
    .trim()
    .slice(0, 8)
  return label ? `(${label})` : '(?)'
}

function visualAnnotationDescription(marker) {
  const title = visualAnnotationTitle(marker)
  const note = String(marker && marker.note ? marker.note : '').trim()
  const coordinate =
    Number.isFinite(Number(marker && marker.x)) &&
    Number.isFinite(Number(marker && marker.y))
      ? `cell ${Math.trunc(Number(marker.x))},${Math.trunc(Number(marker.y))}`
      : 'marked cell'
  const actionText =
    Number.isFinite(Number(marker && marker.actionIndex)) &&
    Number(marker.actionIndex) >= 0
      ? ` after action ${Math.trunc(Number(marker.actionIndex)) + 1}`
      : ''

  return `${title} ${note || 'visual cue'} at ${coordinate}${actionText}`
}

function evidenceEventsFromText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((description) => ({description}))
}

function visualAnnotationEvidenceEvents(markers) {
  return (Array.isArray(markers) ? markers : [])
    .slice(0, 12)
    .map((marker, index) => {
      const x = Number(marker && marker.x)
      const y = Number(marker && marker.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null

      return {
        actionIndex:
          Number.isFinite(Number(marker.actionIndex)) &&
          Number(marker.actionIndex) >= 0
            ? Math.trunc(Number(marker.actionIndex))
            : null,
        description: visualAnnotationDescription(marker),
        visualMarker: {
          protocol: 'idena-arc-visual-marker-v0',
          markerId: String(marker.id || index + 1),
          label: String(marker.label || index + 1),
          x: Math.max(0, Math.trunc(x)),
          y: Math.max(0, Math.trunc(y)),
          frameWidth:
            Number.isFinite(Number(marker.frameWidth)) &&
            Number(marker.frameWidth) > 0
              ? Math.trunc(Number(marker.frameWidth))
              : null,
          frameHeight:
            Number.isFinite(Number(marker.frameHeight)) &&
            Number(marker.frameHeight) > 0
              ? Math.trunc(Number(marker.frameHeight))
              : null,
          role: String(marker.role || 'evidence'),
          note: String(marker.note || '').slice(0, 600),
        },
      }
    })
    .filter(Boolean)
}

function formatActionButtonDescriptionList(descriptions) {
  return (Array.isArray(descriptions) ? descriptions : [])
    .map((item) => {
      const keys =
        Array.isArray(item.keys) && item.keys.length
          ? ` (${item.keys.join('/')})`
          : ''

      return `${item.action}: ${item.buttonLabel}${keys}`
    })
    .join('\n')
}

function publicGameActionSet(gameId) {
  const baseId = baseArcGameId(gameId)

  return (
    ARC_PUBLIC_GAME_ACTION_SETS.find((item) => item.game === baseId) || null
  )
}

function currentArcActionSet({game, selectedArcAgiGame}) {
  const state =
    (game && game.initialState) || (game && game.currentState) || game || {}
  const stateActions = Array.isArray(state.availableActions)
    ? state.availableActions.map(arcActionName).filter(Boolean)
    : []
  const gameId =
    (state && state.gameId) ||
    (game && game.gameInfo && game.gameInfo.gameId) ||
    (selectedArcAgiGame && selectedArcAgiGame.baseGameId) ||
    (selectedArcAgiGame && selectedArcAgiGame.value) ||
    ''
  const catalogSet = publicGameActionSet(gameId)
  let actions = stateActions
  if (!actions.length && catalogSet) {
    actions = catalogSet.actions
  }
  if (!actions.length) {
    actions = Object.keys(ARC_ACTION_BUTTON_DESCRIPTIONS).filter(
      (action) => action !== 'RESET'
    )
  }

  return {
    gameId: baseArcGameId(gameId) || 'unknown',
    family: catalogSet ? catalogSet.family : 'runtime',
    actions: Array.from(new Set(actions)).sort(),
  }
}

function buildActionAnnotationPrompt(actionSet) {
  const actions = actionSet && actionSet.actions ? actionSet.actions : []
  const gameFamily =
    actionSet && actionSet.gameId ? actionSet.gameId : 'unknown'
  const actionGuide = formatActionButtonDescriptionList(
    actions.map(actionButtonDescriptionForAction)
  )
  const saltCandidates = ARC_SALT_INSERTION_CANDIDATES.join('|')

  return [
    'You are annotating ARC-AGI gameplay for local adapter training.',
    'Action labels are input channels. Infer behavior only from before/after observations.',
    `Game family: ${gameFamily}.`,
    `Allowed actions: ${actions.join(', ') || 'ACTION1..ACTION7'}.`,
    'Known button labels:',
    actionGuide,
    'Return exactly one JSON object per observed action:',
    '{',
    '  "action": "ACTION1|ACTION2|ACTION3|ACTION4|ACTION5|ACTION6|ACTION7|RESET",',
    '  "controlLabel": "short human-facing button description",',
    '  "coordinate": null,',
    '  "intentHypothesis": "what the actor appeared to test",',
    '  "observedEffect": "what changed after the action",',
    '  "changedCellsSummary": "compact visible frame delta",',
    '  "availableActionChange": "unchanged|expanded|restricted|unknown",',
    '  "progressSignal": "none|local_progress|level_completed|game_completed",',
    '  "failureSignal": "none|game_over|auto_reset|budget_exhausted|invalid_action",',
    '  "noOp": true,',
    '  "hiddenRuleHypothesis": "rule suggested by this action, or unknown",',
    '  "disconfirmingEvidence": "what would disprove the hypothesis",',
    `  "saltInsertionCandidate": {"candidate": "none|${saltCandidates}", "why": "..."},`,
    '  "aiPriorKnowledgeRisk": "low|medium|high",',
    '  "teacherQuestion": "one concise question for a human teacher if uncertain",',
    '  "confidence": "low|medium|high"',
    '}',
    'For ACTION6, set coordinate to {"x": <number>, "y": <number>}. For other actions, use null.',
    'Prefer uncertainty over invented certainty. If unclear, propose the next discriminating action.',
  ].join('\n')
}

function buildActionBaseLayerDraft({actor, actions, actionSet}) {
  return normalizeAttemptActions(actions).map((item, index) => {
    const action = arcActionName(item.arcAction || item.action) || item.action
    const descriptor = actionButtonDescriptionForAction(action)

    return {
      protocol: 'idena-arc-action-base-annotation-v1',
      actor,
      index,
      action,
      allowedInCurrentGame: Boolean(
        actionSet && actionSet.actions && actionSet.actions.includes(action)
      ),
      controlLabel: descriptor.buttonLabel,
      keys: descriptor.keys,
      coordinate:
        typeof item.x === 'number' && typeof item.y === 'number'
          ? {x: item.x, y: item.y}
          : null,
      beforeStateHash: item.beforeStateHash || null,
      afterStateHash: item.afterStateHash || item.stateHash || null,
      observedEffect: item.observation || 'not annotated yet',
      changedCellsSummary: 'unknown until before/after frame diff is attached',
      progressSignal: 'none',
      failureSignal: 'none',
      noOp: null,
      hiddenRuleHypothesis: item.reason || '',
      saltInsertionCandidate: {
        candidate: 'none',
        why: 'not evaluated yet',
      },
      teacherQuestion: '',
      confidence: 'low',
    }
  })
}

function buildActionLabDraft({actionSet, humanActions, localAiAttempts}) {
  const latestAiAttempt = latestAttempt(localAiAttempts)
  const aiActions =
    latestAiAttempt && Array.isArray(latestAiAttempt.actions)
      ? latestAiAttempt.actions
      : []
  const humanDraft = buildActionBaseLayerDraft({
    actor: 'human',
    actions: humanActions,
    actionSet,
  })
  const aiDraft = buildActionBaseLayerDraft({
    actor: 'local-ai',
    actions: aiActions,
    actionSet,
  })
  const payload = {
    protocol: 'idena-arc-action-base-annotation-draft-v1',
    createdAt: new Date().toISOString(),
    gameId: actionSet.gameId,
    actionFamily: actionSet.family,
    availableActions: actionSet.actions,
    human: humanDraft,
    localAi: aiDraft,
  }

  return {
    ...payload,
    draftHash: `renderer:${simpleHashHex(JSON.stringify(payload))}`,
  }
}

function isTypingTarget(target) {
  const tagName = String(target && target.tagName ? target.tagName : '')
    .trim()
    .toLowerCase()

  return Boolean(
    target &&
      (target.isContentEditable ||
        ['input', 'select', 'textarea'].includes(tagName))
  )
}

function shouldAcceptHeldKeyRepeat(event, repeatRef) {
  if (!event) {
    return true
  }

  const now = Date.now()
  const key = String(event.code || event.key || 'keyboard').trim()
  const repeatState =
    repeatRef && repeatRef.current ? repeatRef.current : Object.create(null)

  if (event.repeat !== true) {
    repeatState[key] = now
    return true
  }

  const previousAt = Number(
    repeatRef && repeatRef.current ? repeatRef.current[key] || 0 : 0
  )

  if (now - previousAt < ARC_HELD_KEY_REPEAT_MS) {
    return false
  }

  if (repeatRef && repeatRef.current) {
    repeatRef.current[key] = now
  }

  return true
}

function arcKeyActionFromEvent(event) {
  if (!event || event.defaultPrevented || isTypingTarget(event.target)) {
    return null
  }

  if (
    (event.metaKey || event.ctrlKey) &&
    String(event.key).toLowerCase() === 'z'
  ) {
    return 'ACTION7'
  }

  return ARC_KEY_ACTIONS[event.key] || null
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
    .map((item) =>
      typeof item.x === 'number' && typeof item.y === 'number'
        ? `${item.action} ${item.x} ${item.y}`
        : item.action
    )
    .filter(Boolean)
    .join('\n')
}

function appendAnnotationText(current, addition) {
  const existing = String(current || '').trim()
  const next = String(addition || '').trim()

  if (!next || existing.includes(next)) {
    return existing
  }

  return existing ? `${existing}\n${next}` : next
}

function formatActionForTeacher(item, index) {
  const action = item.arcAction || arcActionName(item.action) || item.action
  const x = Number(item.x)
  const y = Number(item.y)
  const coord =
    Number.isFinite(x) && Number.isFinite(y)
      ? ` (${Math.trunc(x)}, ${Math.trunc(y)})`
      : ''
  const score =
    typeof item.score === 'number' && Number.isFinite(item.score)
      ? ` -> score ${item.score}`
      : ''

  return `${index + 1}. ${actionButtonShortLabel(
    action || 'ACTION'
  )}${coord}${score}`
}

function normalizeCostNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function normalizePricingModelName(model) {
  const normalized = String(model || '')
    .trim()
    .toLowerCase()

  return normalized.startsWith('openai/') ? normalized.slice(7) : normalized
}

function resolveOpenAiTextPricing(model) {
  const normalized = normalizePricingModelName(model)
  if (!normalized) return null

  if (OPENAI_TEXT_PRICING_USD_PER_MTOK[normalized]) {
    return OPENAI_TEXT_PRICING_USD_PER_MTOK[normalized]
  }

  const prefix = Object.keys(OPENAI_TEXT_PRICING_USD_PER_MTOK).find((key) =>
    normalized.startsWith(`${key}-`)
  )

  return prefix ? OPENAI_TEXT_PRICING_USD_PER_MTOK[prefix] : null
}

function estimateTextCostUsd(usage = {}, pricing = null) {
  if (!pricing) return null

  return (
    (normalizeCostNumber(usage.promptTokens) / 1000000) *
      normalizeCostNumber(pricing.input) +
    (normalizeCostNumber(usage.completionTokens) / 1000000) *
      normalizeCostNumber(pricing.output)
  )
}

function formatUsd(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return '$0.00'
  if (parsed < 0.01) return '<$0.01'
  if (parsed < 1) return `$${parsed.toFixed(3)}`
  return `$${parsed.toFixed(2)}`
}

function formatTokenCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return '0'
  return new Intl.NumberFormat().format(Math.round(parsed))
}

function actionTimelineText(actionTimeline) {
  return (Array.isArray(actionTimeline) ? actionTimeline : [])
    .slice(0, 16)
    .map(formatActionForTeacher)
    .join('\n')
}

function timelinePointAction(point) {
  const input = point && point.actionInput ? point.actionInput : {}
  const data = input && input.data ? input.data : {}
  const action = data.arc_action || data.action || input.id || ''
  const x = Number(data.x)
  const y = Number(data.y)

  if (!action) return 'handoff'

  const label = actionButtonShortLabel(action)

  return Number.isFinite(x) && Number.isFinite(y)
    ? `${label} (${Math.trunc(x)}, ${Math.trunc(y)})`
    : label
}

function timelinePointState(point) {
  return point && point.state && typeof point.state === 'object'
    ? point.state
    : null
}

function aiReplayTimelineFromPreview(preview, prefixCount = 0) {
  const replay = preview && (preview.replay || preview)
  const timeline = Array.isArray(replay && replay.timeline)
    ? replay.timeline
    : []

  if (!timeline.length) return []

  const startIndex = Math.max(
    0,
    Math.min(Number(prefixCount) || 0, timeline.length - 1)
  )

  return timeline.slice(startIndex)
}

function initialAiReplayTimelineFromGame(game) {
  const initialState =
    game && game.initialState ? cloneJson(game.initialState) : null

  if (!initialState) return []

  return [
    {
      phase: 'initial',
      step: 0,
      t_ms: 0,
      actionInput: null,
      state: initialState,
      stateHash:
        game.initialStateHash ||
        `renderer:${simpleHashHex(JSON.stringify(initialState))}`,
      score: 0,
      fullReset: true,
    },
  ]
}

function describeAiReplayObservations(preview, prefixCount = 0) {
  const timeline = aiReplayTimelineFromPreview(preview, prefixCount)
  if (timeline.length < 2) {
    return 'No visible action transitions were returned by replay.'
  }

  return timeline
    .slice(1, 10)
    .map((point, index) => {
      const previous = timeline[index]
      const state = timelinePointState(point) || {}
      const previousHash = previous && previous.stateHash
      const changed =
        !previousHash || !point.stateHash || previousHash !== point.stateHash
      const levels = Number(state.levelsCompleted || point.levelsCompleted || 0)
      let status = 'no visible change'
      if (state.completed) {
        status = 'win'
      } else if (state.gameOver) {
        status = 'game-over'
      } else if (changed) {
        status = 'changed'
      }
      return `${timelinePointAction(point)} -> ${status}; levels=${levels}`
    })
    .join('\n')
}

function findArcProbeClickTargets(frame) {
  const rows = Array.isArray(frame) ? frame : []
  const height = rows.length || 64
  const width = Math.max(
    ...rows.map((row) => (Array.isArray(row) ? row.length : 0)),
    64
  )
  const targets = []
  const seen = new Set()
  const addTarget = (x, y) => {
    const next = {
      x: Math.max(0, Math.min(63, Math.trunc(x))),
      y: Math.max(0, Math.min(63, Math.trunc(y))),
    }
    const key = `${next.x}:${next.y}`
    if (!seen.has(key)) {
      seen.add(key)
      targets.push(next)
    }
  }

  addTarget(width / 2, height / 2)
  addTarget(width / 4, height / 4)
  addTarget((width * 3) / 4, height / 4)
  addTarget(width / 4, (height * 3) / 4)
  addTarget((width * 3) / 4, (height * 3) / 4)

  const colorHits = new Map()
  rows.forEach((row, y) => {
    if (!Array.isArray(row)) return
    row.forEach((value, x) => {
      const color = String(value)
      if (colorHits.has(color)) return
      colorHits.set(color, {x, y})
    })
  })

  Array.from(colorHits.entries())
    .filter(([color]) => !['0', '5', '8'].includes(color))
    .slice(0, 8)
    .forEach(([, cell]) => addTarget(cell.x, cell.y))

  return targets.slice(0, 8)
}

function estimateArcAiTokenUsage({
  game,
  playState,
  actionLog,
  attemptActions,
  explanation,
}) {
  const state =
    playState ||
    (game && game.initialState) ||
    (game && game.currentState) ||
    {}
  const frame = Array.isArray(state && state.frame) ? state.frame : []
  const width = Math.max(
    ...frame.map((row) => (Array.isArray(row) ? row.length : 0)),
    0
  )
  const cellCount = frame.length * Math.max(width, 1)
  const frameTokens = frame.length
    ? Math.min(2600, Math.ceil(cellCount / 3))
    : 500
  const humanActions = Array.isArray(actionLog) ? actionLog.length : 0
  const aiActions = Array.isArray(attemptActions) ? attemptActions.length : 0
  const explanationTokens = Math.ceil(String(explanation || '').length / 4)
  const promptTokens =
    700 + frameTokens + humanActions * 80 + aiActions * 35 + explanationTokens
  const completionTokens = 320 + aiActions * 24

  return {
    promptTokens: Math.max(0, Math.round(promptTokens)),
    completionTokens: Math.max(0, Math.round(completionTokens)),
    totalTokens: Math.max(0, Math.round(promptTokens + completionTokens)),
    basis: frame.length ? 'frame-action-estimate' : 'state-action-estimate',
  }
}

function resolveArcAiCostProfile(settings = {}, usage = {}) {
  const aiSolver = settings.aiSolver || {}
  const provider = String(aiSolver.provider || '').trim() || 'local-ai'
  const model = String(aiSolver.model || '').trim()
  const enabled = Boolean(aiSolver.enabled)
  const platformProvider = provider && provider !== 'local-ai'
  const pricing =
    provider === 'openai' ||
    provider === 'openai-compatible' ||
    (provider === 'openrouter' && normalizePricingModelName(model))
      ? resolveOpenAiTextPricing(model)
      : null
  const estimatedUsd = platformProvider
    ? estimateTextCostUsd(usage, pricing)
    : 0

  return {
    enabled,
    platformProvider,
    provider,
    model,
    pricing,
    estimatedUsd,
    estimated: true,
  }
}

function buildArcAiCostEvent({settings, usage, source = 'arc-ai-try'}) {
  const profile = resolveArcAiCostProfile(settings, usage)

  return {
    id: `${source}-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    source,
    provider: profile.provider,
    model: profile.model,
    platformProvider: profile.platformProvider,
    pricing: profile.pricing,
    estimated: profile.estimated,
    usage,
    estimatedUsd:
      typeof profile.estimatedUsd === 'number' ? profile.estimatedUsd : null,
  }
}

function summarizeArcAiCostEvents(events = []) {
  return (Array.isArray(events) ? events : []).reduce(
    (summary, event) => {
      const usage = event && event.usage ? event.usage : {}
      summary.count += 1
      summary.promptTokens += normalizeCostNumber(usage.promptTokens)
      summary.completionTokens += normalizeCostNumber(usage.completionTokens)
      summary.totalTokens += normalizeCostNumber(usage.totalTokens)
      if (typeof event.estimatedUsd === 'number') {
        summary.estimatedUsd += normalizeCostNumber(event.estimatedUsd)
      } else {
        summary.costUnknown = true
      }
      if (event.platformProvider) {
        summary.platformRuns += 1
      }
      return summary
    },
    {
      count: 0,
      platformRuns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedUsd: 0,
      costUnknown: false,
    }
  )
}

function buildIndependentAiAttemptText({game, playState}) {
  const initialState =
    playState ||
    (game && game.initialState) ||
    (game && game.currentState) ||
    {}
  const isArcAgiFrame =
    game && game.renderHints && game.renderHints.renderer === 'arc-agi-frame-v0'

  if (isArcAgiFrame) {
    const actionIds = Array.isArray(initialState.availableActionIds)
      ? initialState.availableActionIds.map((id) => `ACTION${id}`)
      : []
    const availableActions = Array.isArray(initialState.availableActions)
      ? initialState.availableActions
      : []
    const fallbackActions = ['ACTION4', 'ACTION2', 'ACTION1', 'ACTION3']
    const frame = Array.isArray(initialState.frame) ? initialState.frame : []
    const usableActions = Array.from(
      new Set(
        actionIds
          .concat(availableActions)
          .concat(fallbackActions)
          .map((action) => arcActionName(action) || action)
          .filter((action) => action && action !== 'RESET')
      )
    )
    const canClick =
      !usableActions.length ||
      usableActions.includes('ACTION6') ||
      availableActions.includes('ACTION6')
    const movementProbe = [
      'ACTION4',
      'ACTION4',
      'ACTION2',
      'ACTION2',
      'ACTION3',
      'ACTION1',
      'ACTION5',
      'ACTION4',
      'ACTION2',
      'ACTION5',
      'ACTION3',
      'ACTION1',
    ].filter(
      (action) => !usableActions.length || usableActions.includes(action)
    )
    const clickProbe = canClick
      ? findArcProbeClickTargets(frame).map(
          (cell) => `ACTION6 ${cell.x} ${cell.y}`
        )
      : []

    return usableActions
      .filter((action) => !['ACTION6', 'ACTION7'].includes(action))
      .concat(movementProbe)
      .concat(clickProbe)
      .slice(0, 24)
      .join('\n')
  }

  const player = initialState.player || {}
  const goal = initialState.goal || {}
  const playerX = Number(player.x)
  const playerY = Number(player.y)
  const goalX = Number(goal.x)
  const goalY = Number(goal.y)

  if (
    !Number.isFinite(playerX) ||
    !Number.isFinite(playerY) ||
    !Number.isFinite(goalX) ||
    !Number.isFinite(goalY)
  ) {
    return ''
  }

  const actions = []
  const horizontalAction = goalX >= playerX ? 'move_right' : 'move_left'
  const verticalAction = goalY >= playerY ? 'move_down' : 'move_up'
  for (
    let index = 0;
    index < Math.min(12, Math.abs(goalX - playerX));
    index += 1
  ) {
    actions.push(horizontalAction)
  }
  for (
    let index = 0;
    index < Math.min(12, Math.abs(goalY - playerY));
    index += 1
  ) {
    actions.push(verticalAction)
  }

  return actions.slice(0, 16).join('\n')
}

function _buildTeacherAiDraft({
  actionLog,
  actions,
  actionTimeline,
  game,
  selectedArcAgiGame,
  playState,
}) {
  const independentAttemptText = buildIndependentAiAttemptText({
    game,
    playState,
  })
  const attemptedActionsText =
    independentAttemptText ||
    (actionLog && actionLog.length
      ? buildActionsText(actionLog)
      : String(actions || '').trim())
  const attemptedActions = parseActions(attemptedActionsText)
  const gameId =
    (game && game.gameInfo && game.gameInfo.gameId) ||
    (game && game.initialState && game.initialState.gameId) ||
    (selectedArcAgiGame && selectedArcAgiGame.baseGameId) ||
    'current ARC game'
  const actionCount = attemptedActions.length
  const aiAttemptText = attemptedActions.map(formatActionForTeacher).join('\n')
  const actionButtonGuide = formatActionButtonDescriptionList(
    buildUsedActionButtonDescriptions(attemptedActions)
  )
  const timelineText = actionTimelineText(actionTimeline)
  const completed = Boolean(playState && playState.completed)

  return {
    attemptedActionsText,
    explanation: [
      `I tried ${gameId} with ${actionCount || 'no'} recorded actions.`,
      'My current hypothesis is that progress depends on testing actions, watching the next frame, and keeping only transitions that reveal a stable rule.',
      completed
        ? 'The replay reached a completed state, so I should explain which transition made completion possible.'
        : 'I do not know the rule yet, so I should keep probing actions and record what each action changed before asking the teacher.',
    ].join(' '),
    summary: completed
      ? 'Replay reached completion; explain the causal transition that made the final action work.'
      : 'Unknown rule; run broad probes, compare frame deltas, and ask the teacher which action-effect relation matters.',
    invariants: [
      'A useful action should change position, score, completion, available options, or a visible object role.',
      'A repeated action is only justified if it tests a stated rule.',
      'The explanation must reference replay evidence, not only the final frame.',
    ].join('\n'),
    actionPolicy: [
      '1. Pick one candidate action and observe the next frame.',
      '2. Name the visible or hidden state change caused by that action.',
      '3. Keep the action only if it supports the current rule hypothesis; otherwise switch probes.',
      '4. Ask the teacher for the missing rule when the same state repeats.',
    ].join('\n'),
    rejectedAlternatives: [
      'Repeating a direction without a new observation.',
      'Treating colors as the full rule without checking object roles.',
      'Choosing a final action without replay evidence.',
    ].join('\n'),
    rationales: [
      actionButtonGuide ? `Buttons used:\n${actionButtonGuide}` : '',
      aiAttemptText || timelineText,
    ]
      .filter(Boolean)
      .join('\n'),
    uncertaintyNotes: completed
      ? 'I still need the teacher to mark the exact moment where the hidden rule became clear.'
      : 'I am uncertain which action reveals the hidden rule. I should continue testing alternatives instead of stopping after the first small probe.',
    stopReason: completed
      ? 'Stopped after the replay reached a completed state.'
      : 'Did not solve; stopped only because this local draft reached the configured probe budget and needs teacher feedback.',
    missingCapability: completed
      ? ''
      : 'Better causal-state tracking across action prefixes.',
  }
}

function attemptActionItemsFromTimeline(actionTimeline) {
  return (Array.isArray(actionTimeline) ? actionTimeline : []).map(
    (item, index) => ({
      index,
      t_ms: Number(item && item.t_ms) || index * 1000,
      action: item && item.action ? item.action : '',
      arcAction:
        (item && item.arcAction) || arcActionName(item && item.action) || '',
      ...(item && typeof item.x === 'number' && typeof item.y === 'number'
        ? {x: item.x, y: item.y}
        : {}),
      stateHash: item && item.stateHash ? item.stateHash : null,
      score:
        item && typeof item.score === 'number' && Number.isFinite(item.score)
          ? item.score
          : null,
    })
  )
}

function normalizeAttemptActions(actions) {
  return (Array.isArray(actions) ? actions : []).map((item, index) => {
    const action = String(item && item.action ? item.action : item || '').trim()
    const normalized = {
      index,
      t_ms: Number(item && (item.t_ms || item.tMs)) || index * 1000,
      action,
      arcAction: arcActionName(action) || (item && item.arcAction) || action,
    }

    if (item && typeof item.x === 'number' && typeof item.y === 'number') {
      normalized.x = item.x
      normalized.y = item.y
    }
    if (item && item.reason) normalized.reason = String(item.reason)
    if (item && item.observation) {
      normalized.observation = String(item.observation)
    }
    if (item && item.stateHash) normalized.stateHash = item.stateHash
    if (item && typeof item.confidence === 'number') {
      normalized.confidence = Math.max(0, Math.min(1, item.confidence))
    }
    if (item && typeof item.score === 'number') normalized.score = item.score
    if (item && item.probeFallback) normalized.probeFallback = true
    if (item && item.runtimeError) {
      normalized.runtimeError = String(item.runtimeError)
    }

    return normalized
  })
}

function buildAttemptRecord({
  actor,
  actions,
  timeline,
  finalState,
  preview,
  stopReason,
  startedAt,
  endedAt,
  attemptIndex = 0,
  model = '',
  runtime = '',
  notes = '',
}) {
  const normalizedActions = normalizeAttemptActions(actions)
  const replay = preview && (preview.replay || preview)
  const final =
    finalState ||
    (preview && preview.finalState) ||
    (replay && replay.finalState) ||
    null

  return {
    protocol: 'idena-arc-attempt-v1',
    actor,
    attemptIndex,
    startedAt: startedAt || new Date().toISOString(),
    endedAt: endedAt || new Date().toISOString(),
    actionCount: normalizedActions.length,
    actions: normalizedActions,
    replayTimeline: Array.isArray(timeline) ? timeline : [],
    finalState: final ? cloneJson(final) : null,
    finalStateHash:
      (preview && preview.finalStateHash) ||
      (replay && replay.finalStateHash) ||
      (final ? `renderer:${simpleHashHex(JSON.stringify(final))}` : null),
    completed: Boolean(
      (preview && preview.completed) ||
        (replay && replay.completed) ||
        (final && final.completed)
    ),
    gameOver: Boolean((replay && replay.gameOver) || (final && final.gameOver)),
    stopReason: stopReason || 'saved',
    model,
    runtime,
    notes,
  }
}

function latestAttempt(attempts) {
  return Array.isArray(attempts) && attempts.length
    ? attempts[attempts.length - 1]
    : null
}

function gameIdentityForJourney(game, selectedArcAgiGame) {
  return {
    gameId:
      (game && game.gameInfo && game.gameInfo.gameId) ||
      (game && game.initialState && game.initialState.gameId) ||
      (selectedArcAgiGame && selectedArcAgiGame.baseGameId) ||
      '',
    title:
      (game && game.gameInfo && game.gameInfo.title) ||
      (selectedArcAgiGame && selectedArcAgiGame.label) ||
      '',
    initialStateHash:
      (game && game.initialStateHash) ||
      (game && game.initialState
        ? `renderer:${simpleHashHex(JSON.stringify(game.initialState))}`
        : null),
    goalStateHash: game && game.goalStateHash ? game.goalStateHash : null,
    renderer:
      game && game.renderHints && game.renderHints.renderer
        ? game.renderHints.renderer
        : '',
  }
}

function buildTeacherJourney({
  game,
  selectedArcAgiGame,
  humanAttempt,
  localAiAttempts,
  teacherRounds,
  compressedTeacherMemory,
  providerAnnotationDrafts,
  visualAnnotations,
  phase,
}) {
  return {
    protocol: TEACHER_JOURNEY_PROTOCOL,
    version: 1,
    phase,
    createdAt:
      (humanAttempt && humanAttempt.startedAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    game: gameIdentityForJourney(game, selectedArcAgiGame),
    humanAttempt: humanAttempt || null,
    localAiAttempts: Array.isArray(localAiAttempts) ? localAiAttempts : [],
    teacherRounds: Array.isArray(teacherRounds) ? teacherRounds : [],
    providerAnnotationDrafts: Array.isArray(providerAnnotationDrafts)
      ? providerAnnotationDrafts
      : [],
    visualAnnotations: visualAnnotationEvidenceEvents(visualAnnotations),
    compressedTeacherMemory: compressedTeacherMemory || null,
  }
}

function plainTextFromLocalAiResult(result) {
  if (!result) return ''
  if (typeof result.content === 'string') return result.content
  if (typeof result.text === 'string') return result.text
  if (typeof result.message === 'string') return result.message
  if (result.message && typeof result.message.content === 'string') {
    return result.message.content
  }
  if (Array.isArray(result.choices)) {
    const first = result.choices[0] || {}
    return (
      (first.message && first.message.content) ||
      first.text ||
      first.content ||
      ''
    )
  }
  return ''
}

function extractJsonObjectText(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (raw.startsWith('{') && raw.endsWith('}')) return raw

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const inner = fenced[1].trim()
    if (inner.startsWith('{') && inner.endsWith('}')) return inner
  }

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  return start >= 0 && end > start ? raw.slice(start, end + 1) : ''
}

function normalizeAiActionDecision(decision, game, fallbackAction) {
  const source =
    decision && typeof decision === 'object' && !Array.isArray(decision)
      ? decision
      : {}
  const isArcAgiFrame =
    game && game.renderHints && game.renderHints.renderer === 'arc-agi-frame-v0'
  const rawAction = String(
    source.action || source.arcAction || source.button || source.move || ''
  ).trim()
  const fallback = fallbackAction || {}
  let action =
    rawAction || fallback.action || (isArcAgiFrame ? 'ACTION4' : 'move_right')

  if (isArcAgiFrame) {
    action = arcActionName(action) || action.toUpperCase()
    if (!/^ACTION[1-7]$/.test(action) && action !== 'RESET') {
      action = arcActionName(fallback.action) || 'ACTION4'
    }
  } else if (/^ACTION[1-4]$/.test(String(action).toUpperCase())) {
    action =
      {
        ACTION1: 'move_up',
        ACTION2: 'move_down',
        ACTION3: 'move_left',
        ACTION4: 'move_right',
      }[String(action).toUpperCase()] ||
      fallback.action ||
      'move_right'
  }

  let confidence = 0.35
  if (Number.isFinite(Number(source.confidence))) {
    confidence = Math.max(0, Math.min(1, Number(source.confidence)))
  } else if (Number.isFinite(Number(fallback.confidence))) {
    confidence = Math.max(0, Math.min(1, Number(fallback.confidence)))
  }

  const normalized = {
    action,
    reason: String(
      source.reason ||
        source.rationale ||
        source.hypothesis ||
        fallback.reason ||
        'Probe one action and compare the next state.'
    ).slice(0, 1000),
    confidence,
  }

  const x = Number(typeof source.x !== 'undefined' ? source.x : fallback.x)
  const y = Number(typeof source.y !== 'undefined' ? source.y : fallback.y)
  if (Number.isFinite(x) && Number.isFinite(y)) {
    normalized.x = Math.max(0, Math.min(63, Math.trunc(x)))
    normalized.y = Math.max(0, Math.min(63, Math.trunc(y)))
  }

  return normalized
}

function parseLocalAiActionDecision(text, game, fallbackAction) {
  try {
    const jsonText = extractJsonObjectText(text)
    const parsed = jsonText ? JSON.parse(jsonText) : null
    return normalizeAiActionDecision(parsed, game, fallbackAction)
  } catch (error) {
    return normalizeAiActionDecision(
      {
        reason: `Local AI did not return strict JSON: ${
          error && error.message ? error.message : error
        }`,
      },
      game,
      fallbackAction
    )
  }
}

function compactStateForPrompt(state) {
  if (!state || typeof state !== 'object') return {}
  const frame = Array.isArray(state.frame) ? state.frame : []
  const height = frame.length
  const width = Math.max(
    ...frame.map((row) => (Array.isArray(row) ? row.length : 0)),
    0
  )

  return {
    engine: state.engine,
    gameId: state.gameId,
    turn: state.turn,
    completed: Boolean(state.completed),
    gameOver: Boolean(state.gameOver),
    levelsCompleted: Number(state.levelsCompleted || 0),
    winLevels: Number(state.winLevels || 0),
    availableActions: Array.isArray(state.availableActions)
      ? state.availableActions
      : [],
    availableActionIds: Array.isArray(state.availableActionIds)
      ? state.availableActionIds
      : [],
    player: state.player || null,
    goal: state.goal || null,
    gridSize: state.gridSize || null,
    frameSize: frame.length ? {width, height} : null,
    frameSample: frame.length
      ? frame
          .slice(0, 16)
          .map((row) => (Array.isArray(row) ? row.slice(0, 16) : row))
      : null,
  }
}

function buildLocalAiStepPrompt({
  game,
  state,
  actions,
  humanAttempt,
  teacherMemory,
  stepIndex,
}) {
  const isArcAgiFrame =
    game && game.renderHints && game.renderHints.renderer === 'arc-agi-frame-v0'
  const availableActions = isArcAgiFrame
    ? ['ACTION1', 'ACTION2', 'ACTION3', 'ACTION4', 'ACTION5', 'ACTION6']
    : ['move_up', 'move_down', 'move_left', 'move_right']
  const previousActions = normalizeAttemptActions(actions)
    .slice(-10)
    .map((item) => ({
      action: item.action,
      x: item.x,
      y: item.y,
      reason: item.reason,
      observation: item.observation,
      stateHash: item.stateHash,
    }))

  return [
    'You are the local AI learner in an ARC teacher loop.',
    'Play independently from the original initial state. Do not continue the human trace.',
    'Return exactly one JSON object and no prose outside JSON.',
    `Allowed actions: ${availableActions.join(', ')}.`,
    isArcAgiFrame
      ? 'For a coordinate/click action use {"action":"ACTION6","x":31,"y":31,"reason":"...","confidence":0.3}.'
      : 'For movement use {"action":"move_right","reason":"...","confidence":0.3}.',
    'When unsure, keep testing a new action and explain the expected observation.',
    JSON.stringify({
      stepIndex,
      state: compactStateForPrompt(state),
      previousActions,
      humanAttemptAvailable: Boolean(humanAttempt),
      humanActionCount: humanAttempt ? humanAttempt.actionCount : 0,
      teacherMemory:
        teacherMemory && teacherMemory.compressedText
          ? teacherMemory.compressedText
          : '',
    }),
  ].join('\n')
}

function summarizeAttemptObservation(preview, previousHash) {
  const replay = preview && (preview.replay || preview)
  const finalState =
    (preview && preview.finalState) || (replay && replay.finalState) || {}
  const nextHash =
    (preview && preview.finalStateHash) ||
    (replay && replay.finalStateHash) ||
    (finalState ? `renderer:${simpleHashHex(JSON.stringify(finalState))}` : '')
  const changed = !previousHash || !nextHash || previousHash !== nextHash
  const levels = Number(finalState.levelsCompleted || 0)

  if (finalState.completed) {
    return `completed=true; levels=${levels}; state changed=${changed}`
  }
  if (finalState.gameOver) {
    return `gameOver=true; levels=${levels}; state changed=${changed}`
  }
  return `completed=false; levels=${levels}; state changed=${changed}`
}

function buildLocalAiComparisonText({
  humanAttempt,
  localAiAttempt,
  teacherFeedback = '',
}) {
  if (!humanAttempt || !localAiAttempt) {
    return ''
  }

  const humanCompleted = humanAttempt.completed ? 'completed' : 'unfinished'
  const aiCompleted = localAiAttempt.completed ? 'completed' : 'unfinished'
  const humanActions = normalizeAttemptActions(humanAttempt.actions)
  const aiActions = normalizeAttemptActions(localAiAttempt.actions)
  const sharedButtons = buildActionButtonComparison(humanActions, aiActions)
  const aiStopped = localAiAttempt.stopReason || 'unknown'
  const actionDelta = aiActions.length - humanActions.length
  let actionDeltaText =
    'Both attempts used the same number of actions; compare the button effects and observations.'
  if (actionDelta > 0) {
    actionDeltaText = `The AI used ${actionDelta} more action(s), so the teacher should check whether it looped or explored useful alternatives.`
  } else if (actionDelta < 0) {
    actionDeltaText = `The human used ${Math.abs(
      actionDelta
    )} more action(s), so compare whether the AI found a shorter path or stopped too early.`
  }
  const teacherLine = String(teacherFeedback || '').trim()
    ? `Teacher correction to respect: ${teacherFeedback}`
    : ''

  return [
    `Human attempt: ${humanCompleted}, ${humanActions.length} action(s).`,
    `Local AI attempt: ${aiCompleted}, ${aiActions.length} action(s), stopped because ${aiStopped}.`,
    actionDeltaText,
    `Button basis: ${formatActionButtonDescriptionList(sharedButtons.buttons)}`,
    teacherLine,
  ]
    .filter(Boolean)
    .join('\n')
}

function compressTeacherMemoryText(text) {
  const source = String(text || '').trim()
  if (!source) return null

  const sentences = source
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
  const compressedText = sentences.slice(0, 6).join(' ').slice(0, 1400)

  return {
    protocol: 'idena-arc-teacher-memory-v1',
    createdAt: new Date().toISOString(),
    sourceTextHash: `renderer:${simpleHashHex(source)}`,
    compressedText,
    compression: {
      method: 'renderer-sentence-cap',
      maxChars: 1400,
    },
  }
}

async function runLocalAiAttemptWithPreview({
  game,
  basePayload,
  arcAgiTransientPayload,
  localAiSettings,
  humanAttempt,
  teacherMemory,
  attemptIndex = 0,
  onProgress,
}) {
  if (!game || !game.initialState) {
    throw new Error('Generate a game before running local AI.')
  }

  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  const localBridge = getLocalAiBridge()
  const localRuntimePayload = buildLocalAiRuntimePayload(localAiSettings || {})

  if (!localRuntimePayload.enabled) {
    throw new Error('Select local AI before running the AI attempt.')
  }

  if (!localBridge || typeof localBridge.chat !== 'function') {
    throw new Error('Local AI bridge is not available yet.')
  }

  const fallbackActions = parseActions(
    buildIndependentAiAttemptText({game, playState: game.initialState})
  )
  const safeFallbackActions = fallbackActions.length
    ? fallbackActions
    : parseActions('ACTION4\nACTION2\nACTION3\nACTION1')
  const actionItems = []
  const repeatedStates = new Map()
  let preview = null
  let currentState = cloneJson(game.initialState)
  let previousStateHash = game.initialStateHash || null
  const initialTimeline = initialAiReplayTimelineFromGame(game)
  let stopReason = 'action_cap'
  let lastRuntimeError = ''
  let usedProbeFallback = false
  let probeFallbackOnly = false

  if (typeof onProgress === 'function') {
    onProgress({
      actions: [],
      preview: null,
      timeline: initialTimeline,
      observationSummary:
        'Local AI is reading the first screen and choosing its first action.',
      stopReason: 'thinking',
      stepIndex: 0,
    })
  }

  for (let index = 0; index < LOCAL_AI_ATTEMPT_ACTION_CAP; index += 1) {
    if (Date.now() - startedAtMs > LOCAL_AI_ATTEMPT_WALL_MS) {
      stopReason = 'wall_time_cap'
      break
    }

    const fallback = safeFallbackActions[index % safeFallbackActions.length]
    const prompt = buildLocalAiStepPrompt({
      game,
      state: currentState,
      actions: actionItems,
      humanAttempt,
      teacherMemory,
      stepIndex: index,
    })
    let decision = null

    if (probeFallbackOnly) {
      lastRuntimeError =
        'Continuing local probe after the model did not answer earlier.'
    } else {
      try {
        const chatResult = await localBridge.chat({
          ...localRuntimePayload,
          messages: [
            {
              role: 'system',
              content:
                'Return strict JSON only. Choose one next ARC/game action.',
            },
            {role: 'user', content: prompt},
          ],
          responseFormat: {type: 'json_object'},
          generationOptions: {temperature: 0, num_predict: 160},
          timeoutMs: LOCAL_AI_STEP_TIMEOUT_MS,
        })
        if (chatResult && chatResult.ok !== false) {
          decision = parseLocalAiActionDecision(
            plainTextFromLocalAiResult(chatResult),
            game,
            fallback
          )
        } else {
          lastRuntimeError =
            (chatResult && (chatResult.lastError || chatResult.error)) ||
            'Local AI chat returned no action.'
        }
      } catch (error) {
        lastRuntimeError = String(
          error && error.message ? error.message : error
        )
      }
    }

    if (!decision) {
      usedProbeFallback = true
      probeFallbackOnly = true
      decision = normalizeAiActionDecision(
        {
          reason: lastRuntimeError
            ? `Local model did not return a valid action in time (${lastRuntimeError}). Continue with a local systematic probe and observe the replay delta.`
            : 'Local model did not return a valid action. Continue with a local systematic probe and observe the replay delta.',
          confidence: 0.12,
        },
        game,
        fallback
      )
      decision.probeFallback = true
      if (lastRuntimeError) decision.runtimeError = lastRuntimeError
      if (typeof onProgress === 'function') {
        onProgress({
          actions: actionItems.slice(),
          preview,
          timeline: preview
            ? aiReplayTimelineFromPreview(preview, 0)
            : initialTimeline,
          observationSummary:
            lastRuntimeError ||
            'Local model did not return an action; running a local probe.',
          stopReason: 'probe_fallback',
          stepIndex: index,
        })
      }
    }

    const nextAction = {
      ...decision,
      t_ms: (index + 1) * 1000,
    }
    const nextActions = actionItems.concat(nextAction)

    try {
      preview = await getIdenaArcBridge().previewTrace({
        ...basePayload,
        ...arcAgiTransientPayload,
        actions: nextActions,
      })
    } catch (error) {
      stopReason = 'preview_error'
      lastRuntimeError = String(error && error.message ? error.message : error)
      nextAction.observation = `Preview failed: ${lastRuntimeError}`
      actionItems.push(nextAction)
      break
    }

    const replay = preview && (preview.replay || preview)
    currentState =
      (preview && preview.finalState) ||
      (replay && replay.finalState) ||
      currentState
    const stateHash =
      (preview && preview.finalStateHash) ||
      (replay && replay.finalStateHash) ||
      `renderer:${simpleHashHex(JSON.stringify(currentState))}`
    nextAction.stateHash = stateHash
    nextAction.observation = summarizeAttemptObservation(
      preview,
      previousStateHash
    )
    previousStateHash = stateHash
    actionItems.push(nextAction)

    const seenCount = (repeatedStates.get(stateHash) || 0) + 1
    repeatedStates.set(stateHash, seenCount)
    const progressTimeline = aiReplayTimelineFromPreview(preview, 0)

    if (typeof onProgress === 'function') {
      onProgress({
        actions: actionItems.slice(),
        preview,
        timeline: progressTimeline,
        observationSummary: describeAiReplayObservations(preview, 0),
        stopReason: 'running',
        stepIndex: index,
      })
    }

    if (currentState && currentState.completed) {
      stopReason = 'solved'
      break
    }
    if (currentState && currentState.gameOver) {
      stopReason = 'game_over'
      break
    }
    if (seenCount >= LOCAL_AI_ATTEMPT_REPEATED_STATE_CAP) {
      stopReason = 'repeated_state_cap'
      break
    }
  }

  const endedAt = new Date().toISOString()
  const finalTimeline = preview
    ? aiReplayTimelineFromPreview(preview, 0)
    : initialTimeline
  let resolvedStopReason = stopReason
  if (stopReason === 'action_cap' && usedProbeFallback) {
    resolvedStopReason = 'probe_fallback_cap'
  } else if (
    stopReason === 'action_cap' &&
    actionItems.length < LOCAL_AI_ATTEMPT_ACTION_CAP
  ) {
    resolvedStopReason = lastRuntimeError || stopReason
  }

  const attempt = buildAttemptRecord({
    actor: 'local-ai',
    actions: actionItems,
    timeline: finalTimeline,
    preview,
    finalState: currentState,
    stopReason: resolvedStopReason,
    startedAt,
    endedAt,
    attemptIndex,
    model: localRuntimePayload.model || localRuntimePayload.publicModelId || '',
    runtime: localRuntimePayload.runtimeType || localRuntimePayload.mode || '',
    notes: lastRuntimeError,
  })

  return {
    ok: true,
    attempt,
    preview,
    timeline: finalTimeline,
    observationSummary: preview
      ? describeAiReplayObservations(preview, 0)
      : lastRuntimeError,
  }
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

function getSettingsRpcConnection(settings = {}) {
  if (settings.useExternalNode) {
    return {
      url: settings.url || BASE_API_URL,
      apiKey: settings.externalApiKey || '',
    }
  }

  const internalPort = Number(settings.internalPort)

  return {
    url: `http://127.0.0.1:${
      Number.isFinite(internalPort) && internalPort > 0
        ? Math.round(internalPort)
        : BASE_INTERNAL_API_PORT
    }`,
    apiKey: settings.internalApiKey || '',
  }
}

function arcAgiRuntimeReady(runtime) {
  return Boolean(runtime && runtime.ready)
}

function arcAgiRuntimeStatusText(runtime) {
  if (!runtime) {
    return 'Checking the local ARC-AGI runtime.'
  }

  if (runtime.ready) {
    if (runtime.browserFixture) {
      return (
        runtime.message ||
        'Browser ARC-AGI fixture ready for UI testing. Desktop builds use the local Python toolkit for real public games.'
      )
    }

    if (
      runtime.cacheResult &&
      runtime.cacheResult.ok === false &&
      runtime.message
    ) {
      return runtime.message
    }

    const cachedGameCount =
      runtime.cache && Number.isFinite(Number(runtime.cache.cachedGameCount))
        ? Number(runtime.cache.cachedGameCount)
        : 0
    const cacheSuffix =
      cachedGameCount > 0 ? ` ${cachedGameCount} public game(s) cached.` : ''

    return runtime.pythonVersion
      ? `Ready with Python ${runtime.pythonVersion}.${cacheSuffix}`
      : `Ready on this device.${cacheSuffix}`
  }

  if (runtime.installing) {
    return 'Preparing the local ARC-AGI runtime. This can take a few minutes on first use.'
  }

  return (
    runtime.message ||
    'ARC-AGI public games need a local Python runtime before they can be generated.'
  )
}

function baseArcGameId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split('-', 1)[0]
}

function normalizeArcAgiGameOption(item) {
  const gameId = String(item.gameId || item.id || '').trim()
  const baseGameId = String(item.baseGameId || baseArcGameId(gameId)).trim()
  const title = String(item.title || item.label || baseGameId.toUpperCase())
  const tags = Array.isArray(item.tags) ? item.tags : []
  const baselineActions = Array.isArray(item.baselineActions)
    ? item.baselineActions
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    : []
  const baselineTotalActions = baselineActions.reduce(
    (total, value) => total + value,
    0
  )
  const budgets = item.budgets || {}
  const budget5xTotal =
    Number.isFinite(Number(budgets.budget5xTotal)) && budgets.budget5xTotal > 0
      ? Number(budgets.budget5xTotal)
      : baselineTotalActions * 5
  const numberOfLevels =
    Number.isFinite(Number(budgets.numberOfLevels)) &&
    budgets.numberOfLevels > 0
      ? Number(budgets.numberOfLevels)
      : baselineActions.length

  return {
    ...item,
    value: gameId || baseGameId,
    gameId: gameId || baseGameId,
    baseGameId,
    title,
    label:
      item.label ||
      `${baseGameId || gameId} · ${title}${
        gameId && gameId !== baseGameId ? ` (${gameId})` : ''
      }`,
    tags,
    baselineActions,
    budgets: {
      ...budgets,
      numberOfLevels,
      baselineTotalActions,
      budget5xTotal,
    },
  }
}

function uniqueArcAgiGameOptions(games) {
  const seen = new Set()

  return (Array.isArray(games) ? games : [])
    .map(normalizeArcAgiGameOption)
    .filter((item) => item.value)
    .filter((item) => {
      if (seen.has(item.value)) return false
      seen.add(item.value)
      return true
    })
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

function isArcAgiPublicPayload(payload = {}, generator = {}) {
  const kind = String(payload.generatorKind || generator.kind || '').trim()

  return (
    kind === 'arc-agi-public-game-v0' ||
    Boolean(payload.arcAgiGameId || generator.gameId)
  )
}

function browserArcGameOption(gameId) {
  const selectedId = String(gameId || 'ls20').trim() || 'ls20'
  const selectedBase = baseArcGameId(selectedId)
  const option = ARC_PUBLIC_GAMES.find((item) => item.id === selectedId) ||
    ARC_PUBLIC_GAMES.find(
      (item) => baseArcGameId(item.id) === selectedBase
    ) || {id: selectedId, label: `${selectedBase} · Public ARC-AGI game`}

  return normalizeArcAgiGameOption(option)
}

function browserDemoGeneratorForPayload(payload = {}) {
  if (!isArcAgiPublicPayload(payload)) {
    return BROWSER_LOCAL_GENERATOR
  }

  const option = browserArcGameOption(payload.arcAgiGameId)
  const gameId = option.gameId || option.value || 'ls20'

  return {
    cid: `browser-demo:arc-agi-public-game-v0:${gameId}`,
    hash: `browser-demo-arc:${simpleHashHex(gameId).slice(0, 16)}`,
    version: BROWSER_ARC_FIXTURE_VERSION,
    kind: 'arc-agi-public-game-v0',
    gameId,
    baseGameId: option.baseGameId,
    title: option.title,
    browserFixture: true,
    license: 'browser-fixture-only',
  }
}

function browserArcFixtureRuntimeStatus() {
  return {
    ok: true,
    ready: true,
    browserFixture: true,
    message:
      'Browser ARC-AGI fixture ready for UI testing. Desktop builds use the local Python toolkit for real public games.',
    cache: {cachedGameCount: ARC_PUBLIC_GAMES.length},
    gameCount: ARC_PUBLIC_GAMES.length,
  }
}

function buildBrowserArcActionSpace() {
  return [
    {name: 'ACTION1', arcAction: 'ACTION1', label: 'Move up'},
    {name: 'ACTION2', arcAction: 'ACTION2', label: 'Move down'},
    {name: 'ACTION3', arcAction: 'ACTION3', label: 'Move left'},
    {name: 'ACTION4', arcAction: 'ACTION4', label: 'Move right'},
    {name: 'ACTION5', arcAction: 'ACTION5', label: 'Primary action'},
    {name: 'ACTION6', arcAction: 'ACTION6', label: 'Coordinate click'},
    {name: 'ACTION7', arcAction: 'ACTION7', label: 'Undo'},
  ]
}

function browserArcActionName(item) {
  const value =
    typeof item === 'string'
      ? item
      : item && (item.action || item.type || item.arcAction)

  return arcActionName(value)
}

function browserArcByte(seed, index) {
  const digest = simpleHashHex(seed)
  return parseInt(digest.slice(index * 2, index * 2 + 2), 16) || 0
}

function browserArcIsBlocked(state, x, y) {
  const cellX = Number(x)
  const cellY = Number(y)
  const gateOpen = Boolean(state && state.switchOn)

  if (cellX <= 0 || cellY <= 0 || cellX >= 63 || cellY >= 63) return true

  if (cellY >= 14 && cellY <= 17 && cellX >= 12 && cellX <= 52) {
    const fixedGap = cellX >= 7 && cellX <= 12
    const switchGap = gateOpen && cellX >= 30 && cellX <= 36
    return !fixedGap && !switchGap
  }

  if (cellX >= 20 && cellX <= 23 && cellY >= 25 && cellY <= 50) {
    return !(cellY >= 34 && cellY <= 39)
  }

  if (cellX >= 42 && cellX <= 45 && cellY >= 19 && cellY <= 44) {
    return !(cellY >= 26 && cellY <= 31)
  }

  return false
}

function paintBrowserArcCell(frame, x, y, value) {
  if (y >= 0 && y < frame.length && x >= 0 && x < frame[y].length) {
    frame[y][x] = value
  }
}

function paintBrowserArcDisc(frame, center, radius, value) {
  const cx = Number(center && center.x)
  const cy = Number(center && center.y)

  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) {
        paintBrowserArcCell(frame, x, y, value)
      }
    }
  }
}

function buildBrowserArcFrame(state = {}) {
  const size = 64
  const seedOffset = browserArcByte(`${state.gameId}:${state.seed}`, 0)
  const frame = Array.from({length: size}, (_row, y) =>
    Array.from({length: size}, (_cell, x) => {
      if (browserArcIsBlocked(state, x, y)) return 0
      if ((x * 17 + y * 13 + seedOffset) % 31 === 0) return 3
      return x % 8 === 0 || y % 8 === 0 ? 8 : 5
    })
  )

  ;(Array.isArray(state.trail) ? state.trail : [])
    .slice(-18)
    .forEach((cell) => {
      paintBrowserArcDisc(frame, cell, 1, 4)
    })

  if (state.clickTarget) {
    const target = state.clickTarget
    for (let offset = -3; offset <= 3; offset += 1) {
      paintBrowserArcCell(
        frame,
        Number(target.x) + offset,
        Number(target.y),
        11
      )
      paintBrowserArcCell(
        frame,
        Number(target.x),
        Number(target.y) + offset,
        11
      )
    }
  }

  paintBrowserArcDisc(frame, state.target, 3, 13)
  paintBrowserArcDisc(frame, state.target, 1, 3)
  paintBrowserArcDisc(frame, state.player, 2, 1)
  paintBrowserArcCell(
    frame,
    Number(state.player && state.player.x),
    Number(state.player && state.player.y),
    10
  )

  return frame
}

function scoreBrowserArcState(state, actionCount) {
  if (!state || !state.player || !state.target) return 0

  const remaining =
    Math.abs(Number(state.player.x) - Number(state.target.x)) +
    Math.abs(Number(state.player.y) - Number(state.target.y))
  const progress = Math.max(0, 126 - remaining)
  const completionBonus = state.completed ? 1200 : 0
  const switchBonus = state.switchOn ? 50 : 0

  return Math.max(0, completionBonus + progress * 8 + switchBonus - actionCount)
}

function buildBrowserArcInitialState(seed, generator = {}) {
  const option = browserArcGameOption(generator.gameId)
  const gameId = generator.gameId || option.gameId || 'ls20'
  const player = {
    x: 7 + (browserArcByte(`${seed}:${gameId}`, 0) % 5),
    y: 51 + (browserArcByte(`${seed}:${gameId}`, 1) % 6),
  }
  const target = {
    x: 51 + (browserArcByte(`${seed}:${gameId}`, 2) % 6),
    y: 6 + (browserArcByte(`${seed}:${gameId}`, 3) % 5),
  }
  const state = {
    engine: 'arc-agi-public-game-v0',
    arcengineAvailable: false,
    arcAgiAvailable: false,
    browserDemoArcFixture: true,
    gameId,
    levelId: `${gameId}:browser-fixture`,
    seed,
    gridSize: 64,
    turn: 0,
    state: 'NOT_FINISHED',
    guid: `browser-arc:${gameId}:0`,
    fullReset: true,
    levelsCompleted: 0,
    winLevels: 1,
    maxTurns: 512,
    player,
    target,
    trail: [],
    clickTarget: null,
    switchOn: false,
    actionInput: null,
    rawObservation: null,
    availableActions: buildBrowserArcActionSpace().map((item) => item.name),
    availableActionIds: [1, 2, 3, 4, 5, 6, 7],
    completed: false,
    gameOver: false,
  }

  state.frame = buildBrowserArcFrame(state)
  return state
}

function buildBrowserArcRenderHints(state) {
  const {width, height} = frameDimensions(state && state.frame)

  return {
    renderer: 'arc-agi-frame-v0',
    board: {
      type: 'color-grid',
      width,
      height,
      origin: 'top-left',
      palette: ARC_COLOR_PALETTE,
    },
    input: {
      modes: ['keyboard', 'action-buttons', 'coordinate-click'],
      keyboard: ARC_KEY_ACTIONS,
      coordinateAction: 'ACTION6',
    },
    objective: {
      type: 'public-arc-agi-fixture',
      visible: false,
      summary:
        'Browser-only ARC-style fixture for testing controls, recording, and annotation flow.',
    },
    browserDemoArcFixture: true,
  }
}

function browserArcStateHash(state) {
  return `browser-arc:${simpleHashHex(
    JSON.stringify({
      gameId: state && state.gameId,
      turn: state && state.turn,
      player: state && state.player,
      target: state && state.target,
      clickTarget: state && state.clickTarget,
      switchOn: state && state.switchOn,
      completed: state && state.completed,
    })
  )}`
}

function buildBrowserArcGame(seed, generator = {}) {
  const initialState = buildBrowserArcInitialState(seed, generator)
  const option = browserArcGameOption(initialState.gameId)

  return {
    protocol: 'idena-arc-sidecar-v0',
    engine: initialState.engine,
    arcengineAvailable: false,
    arcAgiAvailable: false,
    browserDemoArcFixture: true,
    generator,
    seed,
    gameId: initialState.gameId,
    title: `Browser ARC-AGI fixture: ${option.title}`,
    level: 0,
    gameInfo: {
      source: 'browser-demo-fixture',
      publicGameId: initialState.gameId,
      warning:
        'This is a local browser fixture, not an official ARC-AGI public game replay.',
    },
    actionSpace: buildBrowserArcActionSpace(),
    renderHints: buildBrowserArcRenderHints(initialState),
    initialState,
    initialStateHash: browserArcStateHash(initialState),
    goalStateHash: `browser-arc:${simpleHashHex(
      JSON.stringify({
        gameId: initialState.gameId,
        target: initialState.target,
        winLevels: initialState.winLevels,
      })
    )}`,
  }
}

function applyBrowserArcAction(state, item) {
  const action = browserArcActionName(item)
  const nextState = cloneJson(state)
  const current = nextState.player || {x: 8, y: 56}
  const deltaByAction = {
    ACTION1: {x: 0, y: -1},
    ACTION2: {x: 0, y: 1},
    ACTION3: {x: -1, y: 0},
    ACTION4: {x: 1, y: 0},
  }
  let delta = deltaByAction[action] || null

  nextState.trail = (Array.isArray(nextState.trail) ? nextState.trail : [])
    .concat({x: Number(current.x), y: Number(current.y)})
    .slice(-24)

  if (action === 'ACTION5') {
    nextState.switchOn = !nextState.switchOn
  }

  if (action === 'ACTION6' && item && typeof item === 'object') {
    const target = {
      x: clampCoordinate(Number(item.x || 0), 64),
      y: clampCoordinate(Number(item.y || 0), 64),
    }
    const dx = target.x - Number(current.x || 0)
    const dy = target.y - Number(current.y || 0)

    nextState.clickTarget = target
    delta =
      Math.abs(dx) >= Math.abs(dy)
        ? {x: Math.sign(dx), y: 0}
        : {x: 0, y: Math.sign(dy)}
  }

  if (delta) {
    const candidate = {
      x: clampCoordinate(Number(current.x || 0) + delta.x, 64),
      y: clampCoordinate(Number(current.y || 0) + delta.y, 64),
    }

    if (!browserArcIsBlocked(nextState, candidate.x, candidate.y)) {
      nextState.player = candidate
      nextState.bumped = false
    } else {
      nextState.bumped = true
    }
  }

  nextState.turn = Number(nextState.turn || 0) + 1
  nextState.levelsCompleted =
    Math.abs(Number(nextState.player.x) - Number(nextState.target.x)) +
      Math.abs(Number(nextState.player.y) - Number(nextState.target.y)) <=
    1
      ? 1
      : 0
  nextState.completed = nextState.levelsCompleted >= nextState.winLevels
  nextState.gameOver = nextState.turn >= nextState.maxTurns
  nextState.state = nextState.completed ? 'WIN' : 'NOT_FINISHED'
  nextState.guid = `browser-arc:${nextState.gameId}:${nextState.turn}`
  nextState.fullReset = false
  nextState.frame = buildBrowserArcFrame(nextState)

  return nextState
}

function replayBrowserArcState(initialState, actions) {
  return (Array.isArray(actions) ? actions : []).reduce(
    (state, item) => applyBrowserArcAction(state, item),
    cloneJson(initialState)
  )
}

function stampBrowserArcTurn(state, turn) {
  const nextState = cloneJson(state)

  nextState.turn = turn
  nextState.guid = `browser-arc:${nextState.gameId}:${nextState.turn}`
  nextState.frame = buildBrowserArcFrame(nextState)
  return nextState
}

function replayBrowserArc(game, actions) {
  const normalizedActions = Array.isArray(actions) ? actions : []
  const initialState = cloneJson(game.initialState)
  const effectiveActions = []
  let state = cloneJson(initialState)
  const replayedActions = []
  const timeline = [
    {
      phase: 'initial',
      step: 0,
      t_ms: 0,
      actionInput: null,
      state: cloneJson(state),
      stateHash: browserArcStateHash(state),
      score: scoreBrowserArcState(state, 0),
      fullReset: true,
    },
  ]

  normalizedActions.forEach((item, index) => {
    const action = browserArcActionName(item)
    if (!action) return
    if ((state.completed || state.gameOver) && action !== 'RESET') return

    const tMs = Number(item.t_ms || item.tMs || index * 1000) || 0
    const actionInputData = {
      action,
      arc_action: action,
      t_ms: tMs,
    }

    if (typeof item.x === 'number' && typeof item.y === 'number') {
      actionInputData.x = item.x
      actionInputData.y = item.y
    }

    if (action === 'RESET') {
      effectiveActions.length = 0
      state = stampBrowserArcTurn(initialState, 0)
    } else if (action === 'ACTION7') {
      effectiveActions.pop()
      state = stampBrowserArcTurn(
        replayBrowserArcState(initialState, effectiveActions),
        replayedActions.length + 1
      )
    } else {
      const effectiveAction = {...item, action}
      effectiveActions.push(effectiveAction)
      state = applyBrowserArcAction(state, effectiveAction)
    }

    const observationHash = browserArcStateHash(state)
    replayedActions.push({
      t_ms: tMs,
      action,
      arc_action: action,
      ...(typeof item.x === 'number' && typeof item.y === 'number'
        ? {x: item.x, y: item.y}
        : {}),
      observation_hash: observationHash,
    })
    timeline.push({
      phase: 'action',
      step: replayedActions.length,
      t_ms: tMs,
      actionInput: {
        id: replayedActions.length - 1,
        data: actionInputData,
      },
      state: cloneJson(state),
      stateHash: observationHash,
      score: scoreBrowserArcState(state, replayedActions.length),
      fullReset: action === 'RESET',
    })
  })

  return {
    protocol: 'idena-arc-sidecar-v0',
    engine: state.engine,
    arcengineAvailable: false,
    arcAgiAvailable: false,
    browserDemoArcFixture: true,
    renderHints: buildBrowserArcRenderHints(state),
    actionSpace: buildBrowserArcActionSpace(),
    actions: replayedActions,
    timeline,
    finalState: state,
    finalStateHash: browserArcStateHash(state),
    score: scoreBrowserArcState(state, replayedActions.length),
    completed: Boolean(state.completed),
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

function recordingFrameFromState(state = {}) {
  return Array.isArray(state.frame) ? state.frame : demoFrameFromState(state)
}

function demoFrameToText(frame) {
  const rows = Array.isArray(frame) ? frame : []
  const numeric = rows.some((row) =>
    (Array.isArray(row) ? row : []).some((value) => typeof value === 'number')
  )

  return rows
    .map((row) =>
      (Array.isArray(row) ? row : [])
        .map((value) =>
          numeric ? String(value).padStart(2, '0') : String(value)
        )
        .join(numeric ? ' ' : '')
    )
    .join('\n')
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
        frame: recordingFrameFromState(point.state || {}),
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

function buildBrowserAgentLog(session, trace, recording) {
  const entries = Array.isArray(recording && recording.entries)
    ? recording.entries
    : []
  const lines = [
    '# IdenaArc agent log v0',
    'protocol: idena-arc-agent-log-v0',
    'format: plain-text-log-v0',
    'access: post-session-training-artifact',
    'release_policy: embargo-until-submission-cutoff',
    `session_id: ${session.sessionId}`,
    `participant_id: ${trace.participantId || 'player'}`,
    `generator_hash: ${
      session.manifest && session.manifest.generator
        ? session.manifest.generator.hash
        : ''
    }`,
    `generator_version: ${
      session.manifest && session.manifest.generator
        ? session.manifest.generator.version
        : ''
    }`,
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
      demoFrameToText(data.frame) || '<empty>',
      `state: ${JSON.stringify(data.state || null)}`,
      ''
    )

    if (typeof score === 'number') {
      previousScore = score
    }
  })

  return {
    protocol: 'idena-arc-agent-log-v0',
    format: 'plain-text-log-v0',
    source: 'idena-arc-browser-demo-replay',
    access: 'post-session-training-artifact',
    releasePolicy: 'embargo-until-submission-cutoff',
    gameId: session.sessionId,
    participantId: trace.participantId || 'player',
    generatorHash:
      session.manifest && session.manifest.generator
        ? session.manifest.generator.hash
        : null,
    generatorVersion:
      session.manifest && session.manifest.generator
        ? session.manifest.generator.version
        : null,
    text: `${lines.join('\n').trimEnd()}\n`,
  }
}

function createBrowserDemoBridge() {
  const sessions = new Map()
  const generator = BROWSER_LOCAL_GENERATOR

  function getSession(sessionId) {
    const session = sessions.get(sessionId)
    if (!session)
      throw new Error(`Browser demo session not found: ${sessionId}`)
    return session
  }

  function sameGenerator(left, right) {
    return (
      left &&
      right &&
      left.cid === right.cid &&
      left.kind === right.kind &&
      left.gameId === right.gameId
    )
  }

  function ensureGeneratorForSession(session, payload = {}) {
    const nextGenerator = browserDemoGeneratorForPayload(payload)

    if (!session.manifest) session.manifest = {}
    if (!sameGenerator(session.manifest.generator, nextGenerator)) {
      session.manifest.generator = nextGenerator
      session.finalSeed = null
    }

    return nextGenerator
  }

  function computeSeedForSession(session, payload = {}) {
    const reveals = Array.isArray(payload.reveals) ? payload.reveals : []
    const sessionGenerator = ensureGeneratorForSession(session, payload)
    const seedMaterial = JSON.stringify({
      sessionId: session.sessionId,
      generator: sessionGenerator,
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
      arcAgiRuntime: browserArcFixtureRuntimeStatus(),
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
      const sessionGenerator = browserDemoGeneratorForPayload(payload)
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
          generator: sessionGenerator,
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
    prepareArcAgiRuntime: async () => browserArcFixtureRuntimeStatus(),
    listArcAgiPublicGames: async () => ({
      ok: true,
      browserFixture: true,
      games: ARC_PUBLIC_GAMES.map((item) => ({
        ...item,
        source: 'browser-demo-fixture',
      })),
      gameCount: ARC_PUBLIC_GAMES.length,
      message:
        'Browser demo catalog loaded. Desktop builds use the local Python toolkit for real public games.',
    }),
    generateGame: async (payload = {}) => {
      const session = getSession(payload.sessionId)
      const sessionGenerator = ensureGeneratorForSession(session, payload)

      if (!session.finalSeed) {
        computeSeedForSession(session, payload)
      }

      session.game = {
        ...(isArcAgiPublicPayload(payload, sessionGenerator)
          ? buildBrowserArcGame(session.finalSeed.finalSeed, sessionGenerator)
          : buildDemoGame(session.finalSeed.finalSeed, sessionGenerator)),
        generatedAt: new Date().toISOString(),
      }
      session.updatedAt = new Date().toISOString()

      return {session: cloneJson(session), game: cloneJson(session.game)}
    },
    submitTrace: async (payload = {}) => {
      const session = getSession(payload.sessionId)
      const sessionGenerator = ensureGeneratorForSession(session, payload)

      if (!session.finalSeed) {
        computeSeedForSession(session, payload)
      }

      if (!session.game) {
        session.game = isArcAgiPublicPayload(payload, sessionGenerator)
          ? buildBrowserArcGame(session.finalSeed.finalSeed, sessionGenerator)
          : buildDemoGame(session.finalSeed.finalSeed, sessionGenerator)
      }

      const participant = ensureDemoParticipant(session, payload)
      const replay =
        session.game.renderHints &&
        session.game.renderHints.renderer === 'arc-agi-frame-v0'
          ? replayBrowserArc(session.game, payload.actions)
          : replayDemo(session.game, payload.actions)
      const resultGenerator =
        session.manifest && session.manifest.generator
          ? session.manifest.generator
          : generator
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
      const agentLog = buildBrowserAgentLog(session, trace, recording)
      const resultId = `${participant.participantId}-${Date.now().toString(36)}`
      const recordingFilename = `${session.sessionId}.${participant.participantId}.512.${resultId}.recording.jsonl`
      const agentLogFilename = `${session.sessionId}.${participant.participantId}.512.${resultId}.agent.log.txt`
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
        agentLogHash: `demo:${simpleHashHex(agentLog.text)}`,
        agentLogFilename,
        result: {
          protocol: 'idena-arc-result-v0',
          sessionId: session.sessionId,
          playerAddress: participant.address,
          generatorCid: resultGenerator.cid,
          generatorHash: resultGenerator.hash,
          generatorVersion: resultGenerator.version,
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
        agentLog,
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
    previewTrace: async (payload = {}) => {
      const session = getSession(payload.sessionId)

      if (!session.game) {
        throw new Error('Generate a game before previewing trace actions.')
      }

      const replay =
        session.game.renderHints &&
        session.game.renderHints.renderer === 'arc-agi-frame-v0'
          ? replayBrowserArc(session.game, payload.actions)
          : replayDemo(session.game, payload.actions)

      return {
        session: cloneJson(session),
        replay,
        actions: replay.actions,
        finalState: replay.finalState,
        finalStateHash: replay.finalStateHash,
        score: replay.score,
        completed: replay.completed,
      }
    },
    runLocalAiAttempt: async (payload = {}) => {
      const preview = await getSession(payload.sessionId)
      const actions = Array.isArray(payload.actions) ? payload.actions : []

      return {
        ok: true,
        attempt: buildAttemptRecord({
          actor: 'local-ai',
          actions,
          timeline: [],
          preview: null,
          finalState:
            preview && preview.game && preview.game.initialState
              ? preview.game.initialState
              : null,
          stopReason: 'browser_demo_preview_only',
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        }),
      }
    },
    reviewTeacherJourney: async (payload = {}) => ({
      ok: true,
      comparison: buildLocalAiComparisonText({
        humanAttempt: payload.humanAttempt,
        localAiAttempt: latestAttempt(payload.localAiAttempts),
      }),
    }),
    compressTeacherFeedback: async (payload = {}) => ({
      ok: true,
      compressedTeacherMemory: compressTeacherMemoryText(
        [payload.text, payload.humanFeedback, payload.humanVsAiGap]
          .filter(Boolean)
          .join('\n')
      ),
    }),
    finalizeTeacherJourney: async (payload = {}) => ({
      ok: true,
      teacherJourney: payload.teacherJourney || null,
      compressedTeacherMemory: payload.compressedTeacherMemory || null,
    }),
    submitArcAgiScorecard: async () => ({
      ok: false,
      message:
        'Official ARC scorecard submission is only available in the desktop app.',
    }),
    verifyTraceBundle: async (payload = {}) => ({
      ok: Boolean(payload.bundle),
      traceMatches: Boolean(payload.bundle),
      recordingMatches: Boolean(payload.bundle && payload.bundle.recording),
      signatureValid: false,
      anchorValid: false,
    }),
    saveAnnotationBundle: async (payload = {}) => {
      const traceBundle = payload.traceBundle || payload.bundle || {}
      const result = traceBundle.result || {}
      const trace = traceBundle.trace || {}
      const status = payload.status === 'final' ? 'final' : 'draft'
      const annotation = {
        protocol: 'idena-arc-annotation-bundle-v0',
        access: 'local-only-private-by-default',
        releasePolicy: 'private-by-default-explicit-publish-only',
        status,
        sessionId: result.sessionId || trace.sessionId || payload.sessionId,
        resultId: traceBundle.resultId || payload.resultId,
        participantId: trace.participantId || payload.participantId || 'player',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        traceHash: result.traceHash || null,
        recordingHash: traceBundle.recordingHash || null,
        recordingJsonlHash: traceBundle.recordingJsonlHash || null,
        agentLogHash: traceBundle.agentLogHash || null,
        finalSeedHash: result.finalSeedHash || null,
        generatorHash: result.generatorHash || null,
        humanRuleAnnotation: payload.humanRuleAnnotation || {},
        aiSelfAnnotation: payload.aiSelfAnnotation || {},
        localAiGameplayAnnotation: payload.localAiGameplayAnnotation || {},
        humanReplayAnnotation: payload.humanReplayAnnotation || {},
        comparisonAnnotation: payload.comparisonAnnotation || {},
        teacherJourney: payload.teacherJourney || null,
        compressedTeacherMemory: payload.compressedTeacherMemory || null,
        providerAnnotationDrafts: Array.isArray(
          payload.providerAnnotationDrafts
        )
          ? payload.providerAnnotationDrafts
          : [],
      }
      const annotationHash = `demo:${simpleHashHex(JSON.stringify(annotation))}`
      const hasTrainingSignal = Boolean(
        (annotation.humanRuleAnnotation.confirmedRules || '').trim() ||
          (annotation.humanRuleAnnotation.wrongHypotheses || '').trim() ||
          (annotation.aiSelfAnnotation.failedAbstractions || '').trim() ||
          (annotation.localAiGameplayAnnotation.explanationText || '').trim() ||
          (annotation.humanReplayAnnotation.explanationText || '').trim()
      )
      const acceptedForTraining = status === 'final' && hasTrainingSignal
      const trainingExample = acceptedForTraining
        ? {
            protocol: 'idena-arc-training-example-v0',
            source: 'idena-arc-browser-demo-annotation-v0',
            access: 'local-only-private-by-default',
            annotationHash,
            traceHash: annotation.traceHash,
            capabilityTags: String(
              annotation.comparisonAnnotation.capabilityTags || ''
            )
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
            input: {
              actionButtonComparison:
                annotation.comparisonAnnotation.actionButtonComparison ||
                payload.actionButtonComparison ||
                null,
            },
            target: {
              localAiAttemptedActions:
                annotation.localAiGameplayAnnotation.attemptedActions || [],
              localAiActionButtonDescriptions:
                annotation.localAiGameplayAnnotation.actionButtonDescriptions ||
                [],
              humanReplayActions:
                annotation.humanReplayAnnotation.replayActions || [],
              humanReplayActionButtonDescriptions:
                annotation.humanReplayAnnotation.actionButtonDescriptions || [],
              teacherJourney: annotation.teacherJourney || null,
              compressedTeacherMemory:
                annotation.compressedTeacherMemory || null,
            },
          }
        : null

      return {
        protocol: 'idena-arc-annotation-record-v0',
        annotationId: `browser-${Date.now().toString(36)}`,
        annotationHash,
        acceptedForTraining,
        traceReplayVerified: true,
        recordingVerified: Boolean(traceBundle.recording),
        agentLogVerified: Boolean(traceBundle.agentLog),
        traceHashesMatch: true,
        hasTrainingSignal,
        privateByDefault: true,
        uploaded: false,
        annotation,
        trainingExample,
        stored: {
          namespace: 'browser-demo-memory',
          filename: 'not-persisted.json',
        },
      }
    },
    verifyAnnotationBundle: async (payload = {}) => ({
      ok: Boolean(payload.annotationBundle || payload.bundle),
      annotationHashMatches: true,
      acceptedForTraining: Boolean(
        (payload.annotationBundle || payload.bundle || {}).acceptedForTraining
      ),
    }),
    listAnnotationBundles: async () => [],
    exportTrainingDataset: async (payload = {}) => {
      const bundle = payload.annotationBundle || {}
      const examples = bundle.trainingExample ? [bundle.trainingExample] : []
      return {
        protocol: 'idena-arc-training-dataset-export-v0',
        exportId: `browser-${Date.now().toString(36)}`,
        access: 'local-only-private-by-default',
        releasePolicy: 'private-by-default-explicit-publish-only',
        privateFieldsIncluded: false,
        exampleCount: examples.length,
        examples,
        datasetHash: `demo:${simpleHashHex(JSON.stringify(examples))}`,
      }
    },
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

function JsonDetails({label = 'Raw JSON', value, defaultOpen = false}) {
  if (!value) return null

  return (
    <Box
      as="details"
      open={defaultOpen ? true : undefined}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="md"
      bg="gray.50"
    >
      <Box
        as="summary"
        px={3}
        py={2}
        cursor="pointer"
        fontWeight={600}
        fontSize="sm"
        color="brandGray.500"
      >
        {label}
      </Box>
      <Box px={3} pb={3}>
        <JsonBlock value={value} />
      </Box>
    </Box>
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

function FoldoutPanel({
  title,
  description,
  badge,
  children,
  mt = 6,
  id,
  defaultOpen = false,
}) {
  return (
    <Box
      id={id}
      as="details"
      open={defaultOpen ? true : undefined}
      w="full"
      mt={mt}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="md"
      bg="white"
    >
      <Flex
        as="summary"
        cursor="pointer"
        align="center"
        justify="space-between"
        gap={4}
        px={5}
        py={4}
      >
        <Box minW={0}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            {title}
          </Heading>
          {description ? (
            <Text color="muted" fontSize="sm" mt={1}>
              {description}
            </Text>
          ) : null}
        </Box>
        {badge}
      </Flex>
      <Box px={5} pb={5}>
        {children}
      </Box>
    </Box>
  )
}

function JourneyStep({
  index,
  icon,
  label,
  tone = 'gray',
  done,
  active,
  children,
}) {
  let color = tone
  let background = 'gray.50'
  let circleBackground = 'gray.200'
  let circleColor = 'brandGray.500'
  let badgeText = index
  let badgeColor = 'gray'
  let stepIcon = icon || index

  if (active) {
    color = 'blue'
    background = 'blue.50'
    circleBackground = 'blue.500'
    circleColor = 'white'
    badgeColor = 'blue'
  }

  if (done) {
    color = 'green'
    background = 'green.50'
    circleBackground = 'green.500'
    circleColor = 'white'
    badgeText = 'OK'
    badgeColor = 'green'
    stepIcon = <TickIcon boxSize={4} />
  }

  return (
    <Stack
      spacing={3}
      borderWidth="1px"
      borderColor={`${color}.100`}
      bg={background}
      borderRadius="md"
      p={4}
      minH="156px"
    >
      <HStack spacing={3} align="center">
        <Center
          boxSize={9}
          borderRadius="full"
          bg={circleBackground}
          color={circleColor}
          flexShrink={0}
          fontWeight={700}
        >
          {stepIcon}
        </Center>
        <Text color="brandGray.500" fontSize="sm" fontWeight={700}>
          {label}
        </Text>
        <Badge ml="auto" colorScheme={badgeColor}>
          {badgeText}
        </Badge>
      </HStack>
      {children}
    </Stack>
  )
}

function SourceTile({selected, icon, label, onClick}) {
  return (
    <Tooltip label={label}>
      <Box
        as="button"
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
        borderWidth="1px"
        borderColor={selected ? 'blue.300' : 'gray.200'}
        bg={selected ? 'blue.50' : 'white'}
        color={selected ? 'blue.700' : 'brandGray.500'}
        borderRadius="md"
        px={2}
        py={3}
        minH="76px"
        textAlign="left"
        w="full"
        _hover={{
          borderColor: selected ? 'blue.400' : 'gray.300',
          bg: selected ? 'blue.50' : 'gray.50',
        }}
      >
        <HStack spacing={2}>
          <Center
            boxSize={8}
            borderRadius="md"
            bg={selected ? 'blue.500' : 'gray.100'}
            color={selected ? 'white' : 'brandGray.500'}
            flexShrink={0}
          >
            {icon}
          </Center>
          <Text fontSize="sm" fontWeight={700} lineHeight="short">
            {label}
          </Text>
          {selected ? <TickIcon boxSize={4} /> : null}
        </HStack>
      </Box>
    </Tooltip>
  )
}

function ActionLabPanel({
  game,
  selectedArcAgiGame,
  actionTimeline,
  localAiAttempts,
}) {
  const [draftText, setDraftText] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  const actionSet = React.useMemo(
    () => currentArcActionSet({game, selectedArcAgiGame}),
    [game, selectedArcAgiGame]
  )
  const actionDescriptions = React.useMemo(
    () => actionSet.actions.map(actionButtonDescriptionForAction),
    [actionSet.actions]
  )
  const promptText = React.useMemo(
    () => buildActionAnnotationPrompt(actionSet),
    [actionSet]
  )
  const latestAiAttempt = latestAttempt(localAiAttempts)
  const hasObservedActions = Boolean(
    (Array.isArray(actionTimeline) && actionTimeline.length) ||
      (latestAiAttempt &&
        Array.isArray(latestAiAttempt.actions) &&
        latestAiAttempt.actions.length)
  )

  const handleBuildDraft = React.useCallback(() => {
    const draft = buildActionLabDraft({
      actionSet,
      humanActions: actionTimeline,
      localAiAttempts,
    })
    setDraftText(JSON.stringify(draft, null, 2))
  }, [actionSet, actionTimeline, localAiAttempts])

  const handleCopyPrompt = React.useCallback(async () => {
    setCopied(false)
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
    }
  }, [promptText])

  return (
    <FoldoutPanel
      title="Action Lab"
      description="Base action annotation and salted rule prototyping."
      badge={<Badge colorScheme="purple">prototype</Badge>}
    >
      <Stack spacing={5}>
        <Flex justify="space-between" gap={3} flexWrap="wrap">
          <HStack spacing={2} flexWrap="wrap">
            <Badge colorScheme="blue">{actionSet.gameId}</Badge>
            <Badge colorScheme="gray">{actionSet.family}</Badge>
            <Badge colorScheme="purple">
              {actionSet.actions.length} action(s)
            </Badge>
          </HStack>
          <HStack spacing={2} flexWrap="wrap">
            <SecondaryButton onClick={handleCopyPrompt}>
              {copied ? 'Prompt copied' : 'Copy AI prompt'}
            </SecondaryButton>
            <PrimaryButton
              isDisabled={!hasObservedActions}
              onClick={handleBuildDraft}
            >
              Build annotation draft
            </PrimaryButton>
          </HStack>
        </Flex>

        <SimpleGrid columns={[1, null, 2]} spacing={5}>
          <Stack spacing={3}>
            <Box>
              <Text fontWeight={600} mb={2}>
                Current game action channels
              </Text>
              <SimpleGrid columns={[1, 2]} spacing={2}>
                {actionDescriptions.map((item) => (
                  <Box
                    key={item.action}
                    borderWidth="1px"
                    borderRadius="md"
                    bg="gray.50"
                    p={3}
                  >
                    <HStack spacing={2} flexWrap="wrap">
                      <Badge colorScheme="blue">{item.action}</Badge>
                      <Text fontSize="sm" fontWeight={700}>
                        {item.buttonLabel}
                      </Text>
                    </HStack>
                    <HStack spacing={1} mt={2} flexWrap="wrap">
                      {(item.keys || []).map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </HStack>
                    <Text mt={2} fontSize="xs" color="muted">
                      {item.description}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>

            <Box>
              <Text fontWeight={600} mb={2}>
                Public 25 action map
              </Text>
              <Stack
                spacing={2}
                maxH="220px"
                overflowY="auto"
                borderWidth="1px"
                borderRadius="md"
                p={3}
              >
                {ARC_PUBLIC_GAME_ACTION_SETS.map((item) => (
                  <Flex
                    key={item.game}
                    justify="space-between"
                    gap={3}
                    fontSize="xs"
                    align="flex-start"
                  >
                    <Badge colorScheme="gray" flexShrink={0}>
                      {item.game}
                    </Badge>
                    <Text color="brandGray.500" textAlign="right">
                      {item.actions.join(', ')}
                    </Text>
                  </Flex>
                ))}
              </Stack>
            </Box>
          </Stack>

          <Stack spacing={4}>
            <Field label="Local AI action annotation prompt">
              <Textarea
                value={promptText}
                isReadOnly
                minH="280px"
                fontFamily="mono"
                fontSize="xs"
              />
              <FormHelperText>
                Feed this with one observed before/after action at a time. It
                forces uncertainty instead of guessed hidden rules.
              </FormHelperText>
            </Field>

            <Box borderWidth="1px" borderRadius="md" p={4} bg="green.50">
              <HStack spacing={2} mb={3}>
                <Badge colorScheme="green">Rule editor sketch</Badge>
                <Text fontSize="sm" color="brandGray.500">
                  deterministic DSL, no peer code
                </Text>
              </HStack>
              <SimpleGrid columns={[1, 2]} spacing={2}>
                {ACTION_LAB_RULE_EDITOR_STEPS.map((step, index) => (
                  <HStack
                    key={step}
                    spacing={2}
                    align="flex-start"
                    borderWidth="1px"
                    borderColor="green.100"
                    borderRadius="md"
                    bg="white"
                    p={2}
                  >
                    <Badge colorScheme="green">{index + 1}</Badge>
                    <Text fontSize="xs" color="brandGray.500">
                      {step}
                    </Text>
                  </HStack>
                ))}
              </SimpleGrid>
              <HStack spacing={1} mt={3} flexWrap="wrap">
                {ARC_SALT_INSERTION_CANDIDATES.map((candidate) => (
                  <Code key={candidate} fontSize="xs">
                    {candidate}
                  </Code>
                ))}
              </HStack>
            </Box>
          </Stack>
        </SimpleGrid>

        {draftText ? (
          <Field label="Action annotation draft">
            <Textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              minH="260px"
              fontFamily="mono"
              fontSize="xs"
            />
            <FormHelperText>
              Local draft only. It becomes training data only after teacher
              review and finalization.
            </FormHelperText>
          </Field>
        ) : null}
      </Stack>
    </FoldoutPanel>
  )
}

function ArcQuickStartPanel({
  adapter,
  arcAgiGameId,
  arcAgiGameOptions,
  arcAgiRuntime,
  busy,
  game,
  gameSource,
  handleResolveIdentity,
  handleSetupAndGenerate,
  identity,
  localAi,
  onUseLocalAi,
  onToggleAdvancedConnection,
  rpcUrl,
  selectedArcAgiGame,
  setArcAgiGameId,
  setGameSource,
  settings,
  showAdvancedConnection,
  showExpertMode,
}) {
  const aiSolver = settings?.aiSolver || {}
  const aiProvider = String(aiSolver.provider || 'openai').trim()
  const aiReady = Boolean(aiSolver.enabled)
  const localAiEnabled = Boolean(localAi?.enabled)
  const localAiSelected = aiReady && aiProvider === 'local-ai'
  const localAiReady = localAiSelected && localAiEnabled
  const cloudAiSelected = aiReady && aiProvider !== 'local-ai'
  const runtimeReady = arcAgiRuntimeReady(arcAgiRuntime)
  const selectedGameBudget =
    selectedArcAgiGame && selectedArcAgiGame.budgets
      ? selectedArcAgiGame.budgets
      : null
  const nodeLabel =
    adapter === 'rehearsal-devnet'
      ? 'Rehearsal devnet'
      : String(rpcUrl || '').replace(/^https?:\/\//, '') || 'Current node'
  let aiLabel = 'Off'
  if (aiReady) {
    aiLabel = aiProvider
    if (aiProvider === 'local-ai') {
      aiLabel = localAiEnabled ? 'Local AI' : 'Local AI selected'
    }
  }
  let localAiStatusLabel = 'Local AI off'
  let localAiStatusColor = 'gray'
  let localAiHelperText =
    'Use local AI so the lesson can train local adapters later.'

  if (cloudAiSelected) {
    localAiStatusLabel = 'Cloud helper'
    localAiStatusColor = 'orange'
  }

  if (localAiEnabled) {
    localAiStatusLabel = 'Local AI on'
    localAiStatusColor = 'orange'
    localAiHelperText = 'Local runtime is on. Select it for this game.'
  }

  if (localAiReady) {
    localAiStatusLabel = 'Local AI selected'
    localAiStatusColor = 'green'
    localAiHelperText = 'The AI step uses the local runtime after you finish.'
  }
  let selectedGameBudgetText = ''
  if (selectedGameBudget) {
    if (selectedGameBudget.numberOfLevels) {
      selectedGameBudgetText = showExpertMode
        ? `${selectedGameBudget.numberOfLevels} level(s), ${selectedGameBudget.budget5xTotal} action budget.`
        : `${selectedGameBudget.numberOfLevels} level(s)`
    } else if (runtimeReady) {
      selectedGameBudgetText =
        'Catalog loaded; baseline budget is available after game load.'
    } else {
      selectedGameBudgetText = 'ARC-AGI runtime prepares on demand.'
    }
  }
  const identityReady = Boolean(identity && identity.address)
  const gameReady = Boolean(game)
  const selectedGameLabel =
    gameSource === 'arc-agi-public'
      ? selectedArcAgiGame?.baseGameId?.toUpperCase() || arcAgiGameId
      : 'Practice'

  return (
    <Stack
      spacing={4}
      bg="white"
      borderWidth="1px"
      borderColor="blue.100"
      borderRadius="md"
      p={5}
      mt={6}
    >
      <Flex align="center" justify="space-between" gap={4} flexWrap="wrap">
        <HStack spacing={3}>
          <Center boxSize={10} borderRadius="full" bg="blue.500" color="white">
            <TickIcon boxSize={5} />
          </Center>
          <Heading as="h2" fontSize="lg" fontWeight={700}>
            Ready to play
          </Heading>
        </HStack>
        <HStack spacing={2}>
          {showExpertMode ? (
            <Badge colorScheme={identityReady ? 'green' : 'gray'}>Node</Badge>
          ) : null}
          <Badge colorScheme={localAiStatusColor}>AI</Badge>
          <Badge colorScheme={gameReady ? 'green' : 'blue'}>
            {gameReady ? 'Ready' : 'Next'}
          </Badge>
        </HStack>
      </Flex>

      <SimpleGrid columns={[1, 1, 3]} spacing={3}>
        <JourneyStep
          index="1"
          icon={<LaptopIcon boxSize={4} />}
          label="Local AI"
          done={localAiReady}
          active={!localAiReady}
        >
          <Stack spacing={2}>
            <HStack spacing={2} minH={8} flexWrap="wrap">
              <Badge colorScheme={localAiStatusColor}>
                {localAiStatusLabel}
              </Badge>
              {cloudAiSelected ? (
                <Badge colorScheme="orange">not training target</Badge>
              ) : null}
            </HStack>
            <Text fontSize="sm" color="brandGray.500" noOfLines={2}>
              {localAiHelperText}
            </Text>
            {!localAiReady ? (
              <HStack spacing={2} flexWrap="wrap">
                <PrimaryButton
                  leftIcon={<LaptopIcon />}
                  size="sm"
                  onClick={onUseLocalAi}
                >
                  Use local AI
                </PrimaryButton>
                <Tooltip label="Local AI settings">
                  <IconButton
                    as="a"
                    href="/settings/ai?setup=1"
                    aria-label="Local AI settings"
                    icon={<SettingsIcon />}
                    size="sm"
                    variant="outline"
                  />
                </Tooltip>
              </HStack>
            ) : (
              <HStack spacing={2}>
                <Badge colorScheme="green">teacher loop</Badge>
                <Text fontSize="xs" color="muted" noOfLines={1}>
                  Human first, AI second
                </Text>
              </HStack>
            )}
            {showExpertMode ? (
              <Stack spacing={2} pt={2} borderTopWidth="1px">
                <HStack spacing={2} minH={8}>
                  <Badge colorScheme={identityReady ? 'green' : 'gray'}>
                    {identityReady ? 'ID' : 'RPC'}
                  </Badge>
                  <Text fontSize="sm" color="brandGray.500" noOfLines={1}>
                    {identityReady ? identity.address : nodeLabel}
                  </Text>
                </HStack>
                <HStack spacing={2}>
                  <Tooltip label="Resolve identity">
                    <IconButton
                      aria-label="Resolve identity"
                      icon={<KeyIcon />}
                      size="sm"
                      colorScheme={identityReady ? 'green' : 'blue'}
                      variant={identityReady ? 'solid' : 'outline'}
                      isLoading={busy === 'Resolve identity'}
                      onClick={handleResolveIdentity}
                    />
                  </Tooltip>
                  <Tooltip label="Advanced setup">
                    <IconButton
                      aria-label="Advanced setup"
                      icon={<SettingsIcon />}
                      size="sm"
                      variant={showAdvancedConnection ? 'solid' : 'outline'}
                      onClick={onToggleAdvancedConnection}
                    />
                  </Tooltip>
                </HStack>
              </Stack>
            ) : null}
          </Stack>
        </JourneyStep>

        <JourneyStep
          index="2"
          icon={
            gameSource === 'arc-agi-public' ? (
              <GlobeIcon boxSize={4} />
            ) : (
              <LaptopIcon boxSize={4} />
            )
          }
          label="Game"
          done={gameReady}
          active={identityReady || !gameReady}
        >
          <Stack spacing={3}>
            <SimpleGrid columns={2} spacing={2}>
              <SourceTile
                selected={gameSource === 'local-grid'}
                icon={<LaptopIcon boxSize={5} />}
                label="Practice"
                onClick={() => setGameSource('local-grid')}
              />
              <SourceTile
                selected={gameSource === 'arc-agi-public'}
                icon={<GlobeIcon boxSize={5} />}
                label="ARC"
                onClick={() => setGameSource('arc-agi-public')}
              />
            </SimpleGrid>
            {gameSource === 'arc-agi-public' ? (
              <Select
                aria-label="ARC-AGI game"
                value={arcAgiGameId}
                onChange={(e) => setArcAgiGameId(e.target.value)}
                size="sm"
              >
                {arcAgiGameOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            ) : (
              <HStack spacing={2} minH={8}>
                <Badge colorScheme="blue">{selectedGameLabel}</Badge>
                <Text fontSize="sm" color="muted">
                  Private sandbox
                </Text>
              </HStack>
            )}
            {gameSource === 'arc-agi-public' && selectedGameBudget ? (
              <Text color="muted" fontSize="xs" noOfLines={1}>
                {selectedGameBudgetText}
              </Text>
            ) : null}
          </Stack>
        </JourneyStep>

        <JourneyStep
          index="3"
          icon={<RefreshIcon boxSize={4} />}
          label="Play"
          done={gameReady}
          active={!gameReady}
        >
          <Stack spacing={3}>
            <PrimaryButton
              leftIcon={<RefreshIcon />}
              isLoading={busy === 'Setup + generate'}
              onClick={handleSetupAndGenerate}
            >
              New game
            </PrimaryButton>
            <HStack spacing={2}>
              <Tooltip label={localAiReady ? 'Local AI selected' : 'AI setup'}>
                <IconButton
                  as="a"
                  href="/settings/ai?setup=1"
                  aria-label="AI setup"
                  icon={<LaptopIcon />}
                  size="sm"
                  colorScheme={localAiReady ? 'green' : 'blue'}
                  variant={localAiReady ? 'solid' : 'outline'}
                />
              </Tooltip>
              <Badge colorScheme={localAiReady ? 'green' : 'gray'}>
                {localAiReady ? aiLabel : 'AI later'}
              </Badge>
            </HStack>
          </Stack>
        </JourneyStep>
      </SimpleGrid>
    </Stack>
  )
}

function ArtifactCheckBadge({label, ok}) {
  return (
    <Badge colorScheme={ok ? 'green' : 'gray'}>
      {label}: {ok ? 'ok' : 'pending'}
    </Badge>
  )
}

function SignedArtifactSummary({result}) {
  if (!result) return null

  const verification = result.verification || {}
  const checks = verification.checks || {}

  return (
    <Stack spacing={2} borderWidth="1px" borderColor="gray.100" p={3}>
      <HStack spacing={2} flexWrap="wrap">
        <Badge colorScheme={verification.ok ? 'green' : 'orange'}>
          {verification.ok ? 'Verified' : verification.reason || 'Pending'}
        </Badge>
        <ArtifactCheckBadge label="signature" ok={checks.signature} />
        <ArtifactCheckBadge label="hash" ok={checks.hash} />
        <ArtifactCheckBadge label="replay" ok={checks.replay} />
        {result.cid ? <Badge colorScheme="blue">CID</Badge> : null}
      </HStack>
      <Text color="muted" fontSize="xs">
        {result.artifactType || verification.artifactType || '-'} ·{' '}
        {result.payloadHash || verification.payloadHash || '-'}
      </Text>
      {result.envelopePath ? (
        <Text color="muted" fontSize="xs">
          {result.envelopePath}
        </Text>
      ) : null}
      {result.cid ? (
        <Code display="block" whiteSpace="pre-wrap" fontSize="xs">
          {result.cid}
        </Code>
      ) : null}
      {result.consumption ? (
        <Text color="muted" fontSize="xs">
          Import route:{' '}
          {result.consumption.imported ? 'accepted' : 'not consumed'}{' '}
          {result.consumption.reason ? `· ${result.consumption.reason}` : ''}
        </Text>
      ) : null}
    </Stack>
  )
}

function ActionButtonComparisonPanel({humanActions, aiActions}) {
  const comparison = buildActionButtonComparison(humanActions, aiActions)
  const rows = comparison.buttons

  if (!rows.length) return null

  return (
    <Box bg="gray.50" borderRadius="md" borderWidth="1px" p={4}>
      <Flex justify="space-between" gap={3} flexWrap="wrap" mb={3}>
        <HStack spacing={2}>
          <Badge colorScheme="teal">Button map</Badge>
          <Text fontSize="sm" color="brandGray.500">
            shared labels for comparison
          </Text>
        </HStack>
      </Flex>
      <SimpleGrid columns={[1, null, 2]} spacing={2}>
        {rows.map((item) => (
          <Box
            key={item.action}
            borderWidth="1px"
            borderRadius="md"
            bg="white"
            p={3}
          >
            <Flex justify="space-between" align="flex-start" gap={2}>
              <Box minW={0}>
                <HStack spacing={2} flexWrap="wrap">
                  <Badge>{item.action}</Badge>
                  <Text fontSize="sm" fontWeight={700}>
                    {item.buttonLabel}
                  </Text>
                  {(item.keys || []).slice(0, 2).map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </HStack>
                <Text mt={2} fontSize="xs" color="muted">
                  {item.description}
                </Text>
              </Box>
              <HStack spacing={1} flexShrink={0}>
                <Badge colorScheme={item.usedBy.human ? 'blue' : 'gray'}>
                  Human
                </Badge>
                <Badge colorScheme={item.usedBy.localAi ? 'purple' : 'gray'}>
                  AI
                </Badge>
              </HStack>
            </Flex>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  )
}

function VisualTeachingMarksPanel({
  frame,
  markers,
  setMarkers,
  actionTimeline,
  isDisabled = false,
}) {
  const safeMarkers = Array.isArray(markers) ? markers : []
  const {width, height} = React.useMemo(() => frameDimensions(frame), [frame])
  const canAnnotate = Boolean(
    !isDisabled && width > 0 && height > 0 && typeof setMarkers === 'function'
  )

  const addMarker = React.useCallback(
    (cell) => {
      if (!canAnnotate || !cell) return

      setMarkers((current) => {
        const list = Array.isArray(current) ? current : []
        const used = new Set(list.map((item) => Number(item.id)))
        let nextId = 1
        while (used.has(nextId)) nextId += 1

        const lastActionIndex =
          Array.isArray(actionTimeline) && actionTimeline.length
            ? actionTimeline.length - 1
            : null

        return list.concat({
          id: nextId,
          label: String(nextId),
          x: cell.x,
          y: cell.y,
          frameWidth: width,
          frameHeight: height,
          actionIndex: lastActionIndex,
          role: 'evidence',
          note: '',
          createdAt: new Date().toISOString(),
        })
      })
    },
    [actionTimeline, canAnnotate, height, setMarkers, width]
  )

  const updateMarker = React.useCallback(
    (id, patch) => {
      if (typeof setMarkers !== 'function') return
      setMarkers((current) =>
        (Array.isArray(current) ? current : []).map((item) =>
          item.id === id ? {...item, ...patch} : item
        )
      )
    },
    [setMarkers]
  )

  const removeMarker = React.useCallback(
    (id) => {
      if (typeof setMarkers !== 'function') return
      setMarkers((current) =>
        (Array.isArray(current) ? current : []).filter((item) => item.id !== id)
      )
    },
    [setMarkers]
  )

  return (
    <Box borderWidth="1px" borderColor="blue.100" borderRadius="md" p={3}>
      <Flex justify="space-between" gap={3} flexWrap="wrap" mb={3}>
        <Box>
          <Text fontWeight={600}>Visual proof marks</Text>
          <Text color="muted" fontSize="xs">
            {isDisabled
              ? 'Tap Done first; then place numbered proof marks on the saved frame.'
              : 'Click or tap the board to place numbered markers, then explain what each mark revealed.'}
          </Text>
        </Box>
        <Badge colorScheme={safeMarkers.length ? 'blue' : 'gray'}>
          {safeMarkers.length} mark(s)
        </Badge>
      </Flex>

      {width && height ? (
        <ArcAgiFrameCanvas
          frame={frame}
          canAct={false}
          actionSpace={[]}
          onAction={() => {}}
          maxBoardWidth="420px"
          annotationMode={canAnnotate}
          annotationMarkers={safeMarkers}
          onAnnotateCell={addMarker}
        />
      ) : (
        <Box bg="gray.50" borderRadius="md" p={4}>
          <Text color="muted" fontSize="sm">
            Finish a run first; the final frame will appear here for visual
            marks.
          </Text>
        </Box>
      )}

      {safeMarkers.length ? (
        <Stack spacing={3} mt={3}>
          {safeMarkers.map((marker) => (
            <Box
              key={marker.id}
              borderWidth="1px"
              borderColor="gray.100"
              borderRadius="md"
              p={3}
            >
              <HStack spacing={2} mb={2} flexWrap="wrap">
                <Badge colorScheme="blue">
                  {visualAnnotationTitle(marker)}
                </Badge>
                <Text color="muted" fontSize="xs">
                  x {marker.x} · y {marker.y}
                </Text>
                <Select
                  size="sm"
                  w="auto"
                  value={
                    Number.isFinite(Number(marker.actionIndex))
                      ? String(marker.actionIndex)
                      : ''
                  }
                  onChange={(event) =>
                    updateMarker(marker.id, {
                      actionIndex:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    })
                  }
                >
                  <option value="">no step</option>
                  {(Array.isArray(actionTimeline) ? actionTimeline : []).map(
                    (item, index) => (
                      <option key={`${item.action}:${index}`} value={index}>
                        {index + 1}. {actionButtonShortLabel(item.action)}
                      </option>
                    )
                  )}
                </Select>
                <SecondaryButton
                  size="sm"
                  onClick={() => removeMarker(marker.id)}
                >
                  Remove
                </SecondaryButton>
              </HStack>
              <Textarea
                minH="64px"
                value={marker.note || ''}
                onChange={(event) =>
                  updateMarker(marker.id, {note: event.target.value})
                }
                placeholder={`What did ${visualAnnotationTitle(
                  marker
                )} show? e.g. + sign rotates figure toward keyhole`}
              />
            </Box>
          ))}
        </Stack>
      ) : null}
    </Box>
  )
}

function TeacherLoopPanel({
  teacherStep,
  setTeacherStep,
  attemptPhase,
  game,
  selectedArcAgiGame,
  catalogCount,
  annotationStatus,
  traceBundleReady,
  actionTimeline,
  humanAttempt,
  localAiAttempts,
  teacherRounds,
  compressedTeacherMemory,
  localAiAttemptActions,
  setLocalAiAttemptActions,
  localAiGameplayExplanation,
  setLocalAiGameplayExplanation,
  humanReplayExplanation,
  setHumanReplayExplanation,
  visualAnnotations,
  setVisualAnnotations,
  confirmedRules,
  setConfirmedRules,
  humanVsAiGap,
  setHumanVsAiGap,
  teachingNotes,
  setTeachingNotes,
  humanReplayCorrections,
  setHumanReplayCorrections,
  capabilityTags,
  handleEndHumanAttempt,
  handleDraftLocalAiAttempt,
  handleReviewTeacherJourney,
  handleRetryLocalAiAttempt,
  handleApplyTeacherFeedback,
  handleSaveAnnotation,
  handleExportTrainingDataset,
  annotationBundle,
  trainingDataset,
  localAiReplay,
  localAiReplayIndex,
  setLocalAiReplayIndex,
  localAiReplayPlaying,
  setLocalAiReplayPlaying,
  arcAiCostEstimate,
  arcAiCostSummary,
  lastArcAiCostEvent,
  onResetArcAiCost,
  localAiEnabled,
  localAiSelected,
  onUseLocalAi,
  showExpertMode,
  busy,
}) {
  const stepIndex = Math.max(
    0,
    TEACHER_STEPS.findIndex((step) => step.id === teacherStep)
  )
  const hasTrace = actionTimeline.length > 0
  const latestAiAttempt = latestAttempt(localAiAttempts)
  const hasAiAttempt = Boolean(
    latestAiAttempt ||
      String(localAiAttemptActions || '').trim() ||
      String(localAiGameplayExplanation || '').trim()
  )
  const hasComparison = Boolean(String(humanVsAiGap || '').trim())
  const hasCoaching = Boolean(
    String(teachingNotes || '').trim() ||
      String(humanReplayCorrections || '').trim()
  )
  const localAiUsable = Boolean(localAiEnabled && localAiSelected)
  let aiRunBlockReason = ''
  if (!game) {
    aiRunBlockReason = 'Start a game first.'
  } else if (!humanAttempt) {
    aiRunBlockReason = 'Tap Done after your run first.'
  } else if (!localAiUsable) {
    aiRunBlockReason = 'Use local AI first.'
  }
  const aiRunBlocked = Boolean(aiRunBlockReason)
  let aiRunStatusLabel = 'Local AI off'
  let aiRunStatusColor = 'gray'
  if (localAiEnabled) {
    aiRunStatusLabel = 'Local AI on'
    aiRunStatusColor = 'orange'
  }
  if (localAiUsable) {
    aiRunStatusLabel = 'Local AI selected'
    aiRunStatusColor = 'green'
  }
  let readiness = {label: 'Play first', colorScheme: 'gray'}
  if (hasTrace || humanAttempt) {
    readiness = {label: 'Human saved', colorScheme: 'orange'}
  }
  if (hasAiAttempt) {
    readiness = {label: 'AI turn', colorScheme: 'purple'}
  }
  if (hasComparison) {
    readiness = {label: 'Compare', colorScheme: 'blue'}
  }
  if (hasCoaching) {
    readiness = {label: 'Teacher reply ready', colorScheme: 'green'}
  }
  const gameLabel =
    (game && game.gameInfo && game.gameInfo.title) ||
    (selectedArcAgiGame && selectedArcAgiGame.label) ||
    'No game loaded'
  const traceText = actionTimelineText(actionTimeline)
  const humanMoveCount =
    humanAttempt && Number.isFinite(Number(humanAttempt.actionCount))
      ? Number(humanAttempt.actionCount)
      : actionTimeline.length
  const aiAttemptActionItems = latestAiAttempt
    ? normalizeAttemptActions(latestAiAttempt.actions)
    : parseActions(localAiAttemptActions)
  const aiTimeline = Array.isArray(localAiReplay && localAiReplay.timeline)
    ? localAiReplay.timeline
    : []
  const aiReplayStepCount = Math.max(0, aiTimeline.length - 1)
  const safeAiReplayIndex = Math.max(
    0,
    Math.min(
      Number(localAiReplayIndex) || 0,
      Math.max(0, aiTimeline.length - 1)
    )
  )
  const aiReplayPoint = aiTimeline[safeAiReplayIndex] || null
  const aiReplayState = timelinePointState(aiReplayPoint)
  const aiReplayFrame = Array.isArray(aiReplayState && aiReplayState.frame)
    ? aiReplayState.frame
    : []
  const humanFinalState =
    humanAttempt && humanAttempt.finalState ? humanAttempt.finalState : null
  const humanFinalFrame = Array.isArray(
    humanFinalState && humanFinalState.frame
  )
    ? humanFinalState.frame
    : []
  const initialFrame = Array.isArray(
    game && game.initialState && game.initialState.frame
  )
    ? game.initialState.frame
    : []
  let visualTeachingFrame = initialFrame
  if (aiReplayFrame.length) {
    visualTeachingFrame = aiReplayFrame
  }
  if (humanFinalFrame.length) {
    visualTeachingFrame = humanFinalFrame
  }
  const aiReplayActionLabel = aiReplayPoint
    ? timelinePointAction(aiReplayPoint)
    : 'waiting'
  const aiReplayStatus = localAiReplay ? localAiReplay.status || '' : ''
  const aiReplayThinking =
    busy === 'Draft AI attempt' && aiReplayStatus === 'thinking'
  const aiReplayStepLabel =
    localAiReplay && Number.isFinite(Number(localAiReplay.stepIndex))
      ? `step ${Number(localAiReplay.stepIndex) + 1}`
      : 'step 1'
  let aiReplayHeaderText = 'no AI run yet'
  if (aiReplayThinking) {
    aiReplayHeaderText = `thinking ${aiReplayStepLabel}`
  } else if (aiReplayStepCount) {
    aiReplayHeaderText = `${safeAiReplayIndex}/${aiReplayStepCount} · ${aiReplayActionLabel}`
  } else if (localAiReplay) {
    aiReplayHeaderText = aiReplayStatus || 'waiting'
  }
  const aiReplayProgress =
    aiTimeline.length > 1
      ? (safeAiReplayIndex / Math.max(1, aiTimeline.length - 1)) * 100
      : 0
  const costUsage = (arcAiCostEstimate && arcAiCostEstimate.usage) || {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  }
  const costProviderLabel = arcAiCostEstimate
    ? `${arcAiCostEstimate.provider || 'local-ai'} ${
        arcAiCostEstimate.model || ''
      }`.trim()
    : 'local-ai'
  const lastCostUsage =
    lastArcAiCostEvent && lastArcAiCostEvent.usage
      ? lastArcAiCostEvent.usage
      : null
  const platformCostActive = Boolean(
    arcAiCostEstimate && arcAiCostEstimate.platformProvider
  )
  const pricingKnown = Boolean(arcAiCostEstimate && arcAiCostEstimate.pricing)
  let nextRunCostLabel = '$0.00'
  if (platformCostActive && pricingKnown) {
    nextRunCostLabel = formatUsd(arcAiCostEstimate.estimatedUsd)
  } else if (platformCostActive) {
    nextRunCostLabel = 'tokens only'
  }
  let costHelperText = 'Local AI has no platform token bill.'
  if (platformCostActive && pricingKnown) {
    costHelperText = `Estimate: ${formatTokenCount(
      costUsage.promptTokens
    )} in / ${formatTokenCount(
      costUsage.completionTokens
    )} out tokens. Platform billing is authoritative.`
  } else if (platformCostActive) {
    costHelperText =
      'No built-in pricing for this provider/model yet; token usage is still tracked.'
  }

  return (
    <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
      <Flex justify="space-between" align="flex-start" gap={4} flexWrap="wrap">
        <Box>
          <HStack spacing={3} mb={1} flexWrap="wrap">
            <Heading as="h2" fontSize="md" fontWeight={600}>
              Help the AI learn
            </Heading>
            <Badge colorScheme={readiness.colorScheme}>{readiness.label}</Badge>
            <Badge
              colorScheme={annotationStatus === 'final' ? 'green' : 'gray'}
            >
              {annotationStatus}
            </Badge>
          </HStack>
          <Text color="muted" fontSize="sm">
            Play first. Then the AI tries alone, and you tell it what it missed.
          </Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap">
          <Badge colorScheme={aiRunStatusColor}>{aiRunStatusLabel}</Badge>
          <Badge colorScheme="blue">{catalogCount} ARC games</Badge>
          <Badge colorScheme="orange">
            {humanAttempt ? `${humanAttempt.actionCount} human` : attemptPhase}
          </Badge>
          <Badge colorScheme="purple">
            {Array.isArray(localAiAttempts) ? localAiAttempts.length : 0} AI
          </Badge>
          <Badge colorScheme="green">
            {Array.isArray(teacherRounds) ? teacherRounds.length : 0} reviews
          </Badge>
          {trainingDataset && trainingDataset.exampleCount ? (
            <Badge colorScheme="green">
              {trainingDataset.exampleCount} examples
            </Badge>
          ) : null}
        </HStack>
      </Flex>

      <SimpleGrid columns={[2, 4]} spacing={2}>
        {TEACHER_STEPS.map((step, index) => {
          const isActive = step.id === teacherStep
          const isDone =
            (step.id === 'play' && hasTrace) ||
            (step.id === 'ai' && hasAiAttempt) ||
            (step.id === 'compare' && hasComparison) ||
            (step.id === 'coach' && hasCoaching)

          return (
            <Box
              key={step.id}
              as="button"
              type="button"
              onClick={() => setTeacherStep(step.id)}
              textAlign="left"
              borderWidth="1px"
              borderColor={isActive ? 'blue.500' : 'gray.200'}
              bg={isActive ? 'blue.010' : 'white'}
              borderRadius="md"
              px={3}
              py={2}
              minH="52px"
            >
              <HStack spacing={2} justify="space-between">
                <Text fontSize="sm" fontWeight={600}>
                  {index + 1}. {step.label}
                </Text>
                {isDone ? <Badge colorScheme="green">done</Badge> : null}
              </HStack>
            </Box>
          )
        })}
      </SimpleGrid>
      <Progress
        value={((stepIndex + 1) / TEACHER_STEPS.length) * 100}
        size="xs"
        colorScheme="blue"
        borderRadius="full"
      />

      <HStack spacing={3} flexWrap="wrap">
        <PrimaryButton
          isDisabled={!game || busy === 'End human attempt'}
          isLoading={busy === 'End human attempt'}
          onClick={handleEndHumanAttempt}
        >
          Done
        </PrimaryButton>
        <PrimaryButton
          isLoading={busy === 'Draft AI attempt'}
          isDisabled={aiRunBlocked}
          onClick={() => handleDraftLocalAiAttempt()}
        >
          AI try
        </PrimaryButton>
        <SecondaryButton
          isDisabled={!humanAttempt || !latestAiAttempt}
          onClick={handleReviewTeacherJourney}
        >
          Compare
        </SecondaryButton>
        <SecondaryButton
          isLoading={busy === 'Draft AI attempt'}
          isDisabled={!humanAttempt || !latestAiAttempt || !localAiUsable}
          onClick={handleRetryLocalAiAttempt}
        >
          Try again
        </SecondaryButton>
        <PrimaryButton
          isLoading={busy === 'Finalize annotation'}
          isDisabled={!humanAttempt || !latestAiAttempt}
          onClick={() => handleSaveAnnotation('final')}
        >
          Save lesson
        </PrimaryButton>
        {compressedTeacherMemory ? (
          <Badge colorScheme="green">memory compressed</Badge>
        ) : null}
      </HStack>

      {showExpertMode ? (
        <ActionButtonComparisonPanel
          humanActions={actionTimeline}
          aiActions={aiAttemptActionItems}
        />
      ) : null}

      <Grid templateColumns={['1fr', null, '1fr 1fr']} gap={5}>
        <Stack spacing={4}>
          <Box bg="gray.50" borderRadius="md" p={4}>
            <HStack spacing={2} mb={3} flexWrap="wrap">
              <Badge colorScheme="blue">Human run</Badge>
              <Text fontSize="sm" color="brandGray.500" noOfLines={1}>
                {gameLabel}
              </Text>
            </HStack>
            {traceText && showExpertMode ? (
              <Code
                display="block"
                whiteSpace="pre-wrap"
                colorScheme="gray"
                fontSize="xs"
                maxH="150px"
                overflowY="auto"
              >
                {traceText}
              </Code>
            ) : null}
            {traceText && !showExpertMode ? (
              <Text color="brandGray.500" fontSize="sm" fontWeight={600}>
                {humanMoveCount} move(s) saved.
              </Text>
            ) : null}
            {!traceText ? (
              <Text color="muted" fontSize="sm">
                Play the board, then tap Done. Finished and unfinished runs both
                count.
              </Text>
            ) : null}
          </Box>

          <Field label="What did you notice?">
            <Textarea
              minH="90px"
              value={humanReplayExplanation}
              onChange={(e) => setHumanReplayExplanation(e.target.value)}
              placeholder="The rule became clear when..."
            />
          </Field>
          <Field label="Rule you found">
            <Textarea
              minH="72px"
              value={confirmedRules}
              onChange={(e) => setConfirmedRules(e.target.value)}
              placeholder="One teachable rule per line"
            />
          </Field>
          <VisualTeachingMarksPanel
            frame={visualTeachingFrame}
            markers={visualAnnotations}
            setMarkers={setVisualAnnotations}
            actionTimeline={actionTimeline}
            isDisabled={!humanAttempt}
          />
        </Stack>

        <Stack spacing={4}>
          <Box bg="purple.50" borderRadius="md" p={4}>
            <Flex justify="space-between" gap={3} flexWrap="wrap" mb={3}>
              <HStack spacing={2}>
                <Badge colorScheme="purple">AI try</Badge>
                <Text fontSize="sm" color="brandGray.500">
                  same start
                </Text>
              </HStack>
              <SecondaryButton
                isLoading={busy === 'Draft AI attempt'}
                isDisabled={aiRunBlocked}
                onClick={() => handleDraftLocalAiAttempt()}
              >
                Watch AI
              </SecondaryButton>
            </Flex>
            <Text fontSize="sm" color="brandGray.500">
              AI starts from the same first screen. It does not copy your moves.
            </Text>
            {aiRunBlocked ? (
              <HStack spacing={2} mt={3} flexWrap="wrap">
                <Badge colorScheme="orange">{aiRunBlockReason}</Badge>
                {!localAiUsable ? (
                  <SecondaryButton size="sm" onClick={onUseLocalAi}>
                    Use local AI
                  </SecondaryButton>
                ) : null}
              </HStack>
            ) : null}
          </Box>

          {platformCostActive || showExpertMode ? (
            <Box bg="gray.50" borderRadius="md" borderWidth="1px" p={4}>
              <Flex justify="space-between" gap={3} flexWrap="wrap" mb={3}>
                <HStack spacing={2}>
                  <Badge colorScheme={platformCostActive ? 'orange' : 'green'}>
                    Cost
                  </Badge>
                  <Text fontSize="sm" color="brandGray.500" noOfLines={1}>
                    {costProviderLabel}
                  </Text>
                </HStack>
                <SecondaryButton
                  size="sm"
                  isDisabled={!arcAiCostSummary || !arcAiCostSummary.count}
                  onClick={onResetArcAiCost}
                >
                  Reset
                </SecondaryButton>
              </Flex>
              <SimpleGrid columns={3} spacing={2}>
                <Box>
                  <Text fontSize="xs" color="muted">
                    Next run
                  </Text>
                  <Text fontSize="sm" fontWeight={700}>
                    {nextRunCostLabel}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="muted">
                    Tokens
                  </Text>
                  <Text fontSize="sm" fontWeight={700}>
                    {formatTokenCount(costUsage.totalTokens)}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="muted">
                    Session
                  </Text>
                  <Text fontSize="sm" fontWeight={700}>
                    {formatUsd(
                      arcAiCostSummary && arcAiCostSummary.estimatedUsd
                    )}
                  </Text>
                </Box>
              </SimpleGrid>
              <Text mt={3} fontSize="xs" color="muted">
                {costHelperText}
              </Text>
              {lastCostUsage ? (
                <Text mt={1} fontSize="xs" color="muted">
                  {`Last run: ${formatTokenCount(
                    lastCostUsage.totalTokens
                  )} tokens, ${formatUsd(lastArcAiCostEvent.estimatedUsd)}.`}
                </Text>
              ) : null}
            </Box>
          ) : null}

          <Box
            bg="#141821"
            color="white"
            borderRadius="md"
            borderWidth="1px"
            borderColor="blackAlpha.700"
            p={3}
          >
            <Flex justify="space-between" align="center" gap={3} mb={3}>
              <HStack spacing={2} minW={0}>
                <Badge colorScheme="purple">Live replay</Badge>
                <Text
                  color="whiteAlpha.700"
                  fontSize="xs"
                  noOfLines={1}
                  fontVariantNumeric="tabular-nums"
                >
                  {aiReplayHeaderText}
                </Text>
              </HStack>
              <HStack spacing={1}>
                <Tooltip label="Previous AI frame">
                  <IconButton
                    aria-label="Previous AI frame"
                    icon={<ArrowLeftIcon />}
                    size="sm"
                    variant="secondary"
                    isDisabled={!aiReplayStepCount}
                    onClick={() => {
                      setLocalAiReplayPlaying(false)
                      setLocalAiReplayIndex((current) =>
                        Math.max(0, Number(current || 0) - 1)
                      )
                    }}
                  />
                </Tooltip>
                <Tooltip
                  label={
                    localAiReplayPlaying ? 'Pause AI replay' : 'Play AI replay'
                  }
                >
                  <IconButton
                    aria-label={
                      localAiReplayPlaying
                        ? 'Pause AI replay'
                        : 'Play AI replay'
                    }
                    icon={
                      localAiReplayPlaying ? (
                        <Box w={3} h={3} borderRadius="sm" bg="currentColor" />
                      ) : (
                        <ArrowRightIcon />
                      )
                    }
                    size="sm"
                    variant="secondary"
                    isDisabled={!aiReplayStepCount}
                    onClick={() =>
                      setLocalAiReplayPlaying((current) => !current)
                    }
                  />
                </Tooltip>
                <Tooltip label="Next AI frame">
                  <IconButton
                    aria-label="Next AI frame"
                    icon={<ArrowRightIcon />}
                    size="sm"
                    variant="secondary"
                    isDisabled={!aiReplayStepCount}
                    onClick={() => {
                      setLocalAiReplayPlaying(false)
                      setLocalAiReplayIndex((current) =>
                        Math.min(aiReplayStepCount, Number(current || 0) + 1)
                      )
                    }}
                  />
                </Tooltip>
              </HStack>
            </Flex>

            {aiReplayFrame.length ? (
              <ArcAgiFrameCanvas
                frame={aiReplayFrame}
                canAct={false}
                actionSpace={[]}
                onAction={() => {}}
                maxBoardWidth="420px"
              />
            ) : (
              <Center
                minH="180px"
                borderRadius="md"
                borderWidth="1px"
                borderColor="whiteAlpha.200"
                bg="whiteAlpha.100"
              >
                <Text color="whiteAlpha.700" fontSize="sm">
                  Let the AI try to see it move.
                </Text>
              </Center>
            )}

            <Progress
              value={aiReplayProgress}
              size="xs"
              mt={3}
              borderRadius="full"
              colorScheme="purple"
              bg="whiteAlpha.200"
            />
            {localAiReplay &&
            localAiReplay.observationSummary &&
            (!showExpertMode || aiReplayThinking || !aiReplayStepCount) ? (
              <Text mt={2} color="whiteAlpha.700" fontSize="xs">
                {localAiReplay.observationSummary}
              </Text>
            ) : null}
            {showExpertMode &&
            localAiReplay &&
            localAiReplay.observationSummary ? (
              <Code
                display="block"
                mt={3}
                p={2}
                borderRadius="md"
                whiteSpace="pre-wrap"
                colorScheme="purple"
                fontSize="xs"
                maxH="96px"
                overflowY="auto"
              >
                {localAiReplay.observationSummary}
              </Code>
            ) : null}
          </Box>

          {showExpertMode ? (
            <Field label="AI action attempt">
              <Textarea
                minH="88px"
                value={localAiAttemptActions}
                onChange={(e) => setLocalAiAttemptActions(e.target.value)}
                placeholder={'ACTION4\nACTION2\nACTION6 31 31'}
              />
            </Field>
          ) : null}
          <Field label="AI says / asks">
            <Textarea
              minH="118px"
              value={localAiGameplayExplanation}
              onChange={(e) => setLocalAiGameplayExplanation(e.target.value)}
              placeholder="AI explains the attempt, uncertainty, and question for the teacher"
            />
          </Field>
        </Stack>
      </Grid>

      <Grid templateColumns={['1fr', null, '1fr 1fr']} gap={5}>
        <Stack spacing={4}>
          <Box>
            <Text fontWeight={600} mb={2}>
              Quick teacher marks
            </Text>
            <HStack spacing={2} flexWrap="wrap">
              {TEACHER_FEEDBACK_BUTTONS.map((item) => (
                <SecondaryButton
                  key={item.id}
                  isDisabled={!latestAiAttempt}
                  onClick={() => handleApplyTeacherFeedback(item)}
                >
                  {item.label}
                </SecondaryButton>
              ))}
            </HStack>
          </Box>
          <Field label="What did AI miss?">
            <Textarea
              minH="92px"
              value={humanVsAiGap}
              onChange={(e) => setHumanVsAiGap(e.target.value)}
              placeholder="The AI missed..."
            />
          </Field>
          {showExpertMode ? (
            <Text fontSize="xs" color="muted">
              Tags: {capabilityTags || 'none'}
            </Text>
          ) : null}
        </Stack>

        <Stack spacing={4}>
          <Field label="Your reply to AI">
            <Textarea
              minH="92px"
              value={teachingNotes}
              onChange={(e) => setTeachingNotes(e.target.value)}
              placeholder="Next time, test..."
            />
          </Field>
          <Field label="What should AI try next?">
            <Textarea
              minH="80px"
              value={humanReplayCorrections}
              onChange={(e) => setHumanReplayCorrections(e.target.value)}
              placeholder="Concrete correction the AI should learn"
            />
          </Field>
          <HStack spacing={3} flexWrap="wrap">
            {showExpertMode ? (
              <SecondaryButton
                isLoading={busy === 'Save annotation draft'}
                isDisabled={!traceBundleReady || !latestAiAttempt}
                onClick={() => handleSaveAnnotation('draft')}
              >
                Save draft
              </SecondaryButton>
            ) : null}
            <PrimaryButton
              isLoading={busy === 'Finalize annotation'}
              isDisabled={
                !traceBundleReady || !humanAttempt || !latestAiAttempt
              }
              onClick={() => handleSaveAnnotation('final')}
            >
              Save lesson
            </PrimaryButton>
            {showExpertMode ? (
              <SecondaryButton
                isLoading={busy === 'Export training dataset'}
                isDisabled={
                  !annotationBundle || !annotationBundle.trainingExample
                }
                onClick={handleExportTrainingDataset}
              >
                Export dataset stub
              </SecondaryButton>
            ) : null}
          </HStack>
        </Stack>
      </Grid>
    </Stack>
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

function ArcPadButton({control, disabled, onAction, gridArea}) {
  return (
    <Tooltip label={control.label}>
      <IconButton
        aria-label={control.label}
        icon={React.cloneElement(control.icon, {boxSize: 5})}
        gridArea={gridArea}
        minW={12}
        h={12}
        borderRadius="8px"
        color={disabled ? '#687080' : '#f6f8fb'}
        bg={disabled ? '#202632' : '#19202b'}
        borderWidth="1px"
        borderColor={
          disabled ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.18)'
        }
        boxShadow={
          disabled
            ? 'inset 0 1px 3px rgba(255, 255, 255, 0.04)'
            : 'inset 0 2px 5px rgba(255,255,255,.10), 0 5px 0 #0d1118'
        }
        transform="translateY(0)"
        transition="transform .08s ease, box-shadow .08s ease, background .12s ease"
        isDisabled={disabled}
        onClick={() => onAction(control.action)}
        _hover={
          disabled
            ? undefined
            : {
                bg: '#222b38',
              }
        }
        _active={
          disabled
            ? undefined
            : {
                transform: 'translateY(4px)',
                boxShadow:
                  'inset 0 2px 5px rgba(255,255,255,.08), 0 1px 0 #0d1118',
              }
        }
      />
    </Tooltip>
  )
}

function ArcGamepad({canAct, actionSpace, onAction}) {
  const canUse = React.useCallback(
    (action) => !actionSpace.length || actionSpace.includes(action),
    [actionSpace]
  )

  return (
    <Stack
      spacing={6}
      p={4}
      borderWidth="1px"
      borderColor="rgba(255,255,255,.10)"
      borderRadius="8px"
      bg="linear-gradient(180deg, rgba(23,29,40,.96), rgba(15,20,29,.96))"
      boxShadow="inset 0 1px 0 rgba(255,255,255,.08), 0 10px 24px rgba(0,0,0,.18)"
    >
      <Box>
        <HStack justify="space-between" mb={3}>
          <Text
            color="#d8e0ee"
            fontSize="xs"
            fontWeight={700}
            letterSpacing="0"
            textTransform="uppercase"
          >
            D-pad
          </Text>
          <HStack spacing={1}>
            <Kbd
              bg="rgba(255,255,255,.09)"
              color="#d8e0ee"
              borderColor="rgba(255,255,255,.14)"
            >
              W
            </Kbd>
            <Kbd
              bg="rgba(255,255,255,.09)"
              color="#d8e0ee"
              borderColor="rgba(255,255,255,.14)"
            >
              A
            </Kbd>
            <Kbd
              bg="rgba(255,255,255,.09)"
              color="#d8e0ee"
              borderColor="rgba(255,255,255,.14)"
            >
              S
            </Kbd>
            <Kbd
              bg="rgba(255,255,255,.09)"
              color="#d8e0ee"
              borderColor="rgba(255,255,255,.14)"
            >
              D
            </Kbd>
          </HStack>
        </HStack>
        <Grid
          templateAreas={`". up ." "left center right" ". down ."`}
          templateColumns="repeat(3, 52px)"
          templateRows="repeat(3, 52px)"
          gap={2}
          alignItems="center"
          justifyContent="center"
        >
          <ArcPadButton
            gridArea="up"
            control={ARC_DPAD_CONTROLS[0]}
            disabled={!canAct || !canUse('ACTION1')}
            onAction={onAction}
          />
          <ArcPadButton
            gridArea="left"
            control={ARC_DPAD_CONTROLS[1]}
            disabled={!canAct || !canUse('ACTION3')}
            onAction={onAction}
          />
          <Flex
            gridArea="center"
            h={12}
            borderRadius="8px"
            bg="#0f141d"
            borderWidth="1px"
            borderColor="rgba(255,255,255,.10)"
            align="center"
            justify="center"
            boxShadow="inset 0 2px 5px rgba(0,0,0,.4)"
          >
            <Box w={3} h={3} borderRadius="full" bg="rgba(255,255,255,.22)" />
          </Flex>
          <ArcPadButton
            gridArea="right"
            control={ARC_DPAD_CONTROLS[2]}
            disabled={!canAct || !canUse('ACTION4')}
            onAction={onAction}
          />
          <ArcPadButton
            gridArea="down"
            control={ARC_DPAD_CONTROLS[3]}
            disabled={!canAct || !canUse('ACTION2')}
            onAction={onAction}
          />
        </Grid>
      </Box>
      <Box>
        <HStack align="flex-end" justify="center" spacing={5}>
          <Tooltip label={ARC_FACE_CONTROLS[0].label}>
            <Box
              as="button"
              type="button"
              aria-label={ARC_FACE_CONTROLS[0].label}
              w={16}
              h={16}
              borderRadius="full"
              bg={!canAct || !canUse('ACTION5') ? '#202632' : '#cf5d6a'}
              color="white"
              fontWeight={800}
              fontSize="sm"
              boxShadow={
                !canAct || !canUse('ACTION5')
                  ? 'inset 0 2px 4px rgba(255, 255, 255, 0.04)'
                  : 'inset 0 2px 8px rgba(255,255,255,.18), 0 6px 0 #7a2733'
              }
              cursor={!canAct || !canUse('ACTION5') ? 'not-allowed' : 'pointer'}
              opacity={!canAct || !canUse('ACTION5') ? 0.55 : 1}
              onClick={() => {
                if (canAct && canUse('ACTION5')) onAction('ACTION5')
              }}
            >
              A
            </Box>
          </Tooltip>
          <Tooltip label={ARC_FACE_CONTROLS[1].label}>
            <IconButton
              aria-label={ARC_FACE_CONTROLS[1].label}
              icon={<UndoIcon />}
              w={12}
              h={12}
              minW={12}
              borderRadius="full"
              bg={!canAct || !canUse('ACTION7') ? '#202632' : '#45a6a0'}
              color="white"
              boxShadow={
                !canAct || !canUse('ACTION7')
                  ? 'inset 0 2px 4px rgba(255, 255, 255, 0.04)'
                  : 'inset 0 2px 8px rgba(255,255,255,.18), 0 5px 0 #1b6461'
              }
              isDisabled={!canAct || !canUse('ACTION7')}
              onClick={() => onAction('ACTION7')}
            />
          </Tooltip>
        </HStack>
        <HStack mt={4} spacing={2} justify="center">
          <Box w={12} h="3px" borderRadius="full" bg="rgba(255,255,255,.22)" />
          <Box w={12} h="3px" borderRadius="full" bg="rgba(255,255,255,.22)" />
          <Box w={12} h="3px" borderRadius="full" bg="rgba(255,255,255,.22)" />
        </HStack>
      </Box>
    </Stack>
  )
}

function frameDimensions(frame) {
  const rows = Array.isArray(frame) ? frame : []
  return {
    width: Math.max(
      ...rows.map((row) => (Array.isArray(row) ? row.length : 0)),
      0
    ),
    height: rows.length,
  }
}

function frameValueColor(value) {
  const index = Math.abs(Number(value) || 0) % ARC_DISPLAY_COLOR_PALETTE.length
  return ARC_DISPLAY_COLOR_PALETTE[index]
}

function ArcAgiFrameCanvas({
  frame,
  canAct,
  actionSpace,
  onAction,
  maxBoardWidth = '100%',
  annotationMode = false,
  annotationMarkers = [],
  onAnnotateCell,
}) {
  const canvasRef = React.useRef(null)
  const [hoverCell, setHoverCell] = React.useState(null)
  const {width, height} = React.useMemo(() => frameDimensions(frame), [frame])
  const safeAnnotationMarkers = React.useMemo(
    () => (Array.isArray(annotationMarkers) ? annotationMarkers : []),
    [annotationMarkers]
  )
  const canAnnotate = Boolean(
    annotationMode && typeof onAnnotateCell === 'function'
  )
  const canClick =
    canAct && (!actionSpace.length || actionSpace.includes('ACTION6'))
  const isInteractive = canClick || canAnnotate

  const pointToCell = React.useCallback(
    (event) => {
      const canvas = canvasRef.current
      if (!canvas || !width || !height) return null

      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * width)
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * height)

      if (x < 0 || x >= width || y < 0 || y >= height) return null
      return {x, y}
    },
    [height, width]
  )

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !width || !height) return

    const rect = canvas.getBoundingClientRect()
    const dpr =
      typeof window !== 'undefined' && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1
    const cssWidth = Math.max(1, rect.width || canvas.clientWidth || width)
    const cssHeight = Math.max(1, rect.height || canvas.clientHeight || height)
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))

    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, pixelWidth, pixelHeight)
    ctx.fillStyle = '#0b1018'
    ctx.fillRect(0, 0, pixelWidth, pixelHeight)

    const cellWidth = pixelWidth / width
    const cellHeight = pixelHeight / height

    frame.forEach((row, y) => {
      if (!Array.isArray(row)) return
      row.forEach((value, x) => {
        ctx.fillStyle = frameValueColor(value)
        ctx.fillRect(
          Math.floor(x * cellWidth),
          Math.floor(y * cellHeight),
          Math.ceil((x + 1) * cellWidth) - Math.floor(x * cellWidth),
          Math.ceil((y + 1) * cellHeight) - Math.floor(y * cellHeight)
        )
      })
    })

    const minCellSize = Math.min(cellWidth, cellHeight)
    if (minCellSize >= 7) {
      ctx.strokeStyle = 'rgba(12, 17, 26, 0.18)'
      ctx.lineWidth = Math.max(0.5, 0.55 * dpr)
      ctx.beginPath()
      for (let x = 1; x < width; x += 1) {
        const px = Math.round(x * cellWidth)
        ctx.moveTo(px, 0)
        ctx.lineTo(px, pixelHeight)
      }
      for (let y = 1; y < height; y += 1) {
        const py = Math.round(y * cellHeight)
        ctx.moveTo(0, py)
        ctx.lineTo(pixelWidth, py)
      }
      ctx.stroke()
    }

    safeAnnotationMarkers.forEach((marker, index) => {
      const x = Number(marker && marker.x)
      const y = Number(marker && marker.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      if (x < 0 || x >= width || y < 0 || y >= height) return

      const centerX = (Math.trunc(x) + 0.5) * cellWidth
      const centerY = (Math.trunc(y) + 0.5) * cellHeight
      const label = String(marker.label || marker.id || index + 1).slice(0, 4)
      const radius = Math.max(8 * dpr, Math.min(cellWidth, cellHeight) * 1.18)

      ctx.save()
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(37, 99, 235, 0.94)'
      ctx.fill()
      ctx.lineWidth = Math.max(2 * dpr, radius * 0.16)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)'
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = `${Math.max(
        10 * dpr,
        radius * 0.78
      )}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, centerX, centerY + 0.5 * dpr)
      ctx.restore()
    })

    if (isInteractive && hoverCell) {
      ctx.strokeStyle = '#9bdcff'
      ctx.lineWidth = Math.max(2, Math.round(2 * dpr))
      ctx.strokeRect(
        Math.floor(hoverCell.x * cellWidth) + ctx.lineWidth / 2,
        Math.floor(hoverCell.y * cellHeight) + ctx.lineWidth / 2,
        Math.max(1, Math.floor(cellWidth) - ctx.lineWidth),
        Math.max(1, Math.floor(cellHeight) - ctx.lineWidth)
      )
    }
  }, [frame, height, hoverCell, isInteractive, safeAnnotationMarkers, width])

  React.useEffect(() => {
    draw()
  }, [draw])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let frameId = 0
    const scheduleDraw = () => {
      if (frameId) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(draw)
    }
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleDraw)
        : null

    if (observer) observer.observe(canvas)
    window.addEventListener('resize', scheduleDraw)
    scheduleDraw()

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      if (observer) observer.disconnect()
      window.removeEventListener('resize', scheduleDraw)
    }
  }, [draw])

  return (
    <Box
      position="relative"
      w="full"
      maxW={maxBoardWidth}
      borderWidth="1px"
      borderColor="rgba(255,255,255,.08)"
      borderRadius="8px"
      bg="#070b11"
      boxShadow="inset 0 0 0 1px rgba(255,255,255,.05), 0 18px 42px rgba(0,0,0,.30)"
      overflow="hidden"
    >
      <Box
        as="canvas"
        ref={canvasRef}
        display="block"
        w="full"
        data-testid="arc-agi-frame-canvas"
        style={{
          aspectRatio: `${width || 1} / ${height || 1}`,
          imageRendering: 'pixelated',
          cursor: isInteractive ? 'crosshair' : 'default',
          touchAction: 'none',
        }}
        onMouseMove={(event) => {
          setHoverCell(pointToCell(event))
        }}
        onMouseLeave={() => setHoverCell(null)}
        onClick={(event) => {
          const cell = pointToCell(event)
          if (canAnnotate && cell) {
            onAnnotateCell(cell)
            return
          }
          if (canClick && cell) onAction('ACTION6', cell)
        }}
      />
      {hoverCell && isInteractive ? (
        <Badge
          position="absolute"
          right={3}
          bottom={3}
          colorScheme="blue"
          borderRadius="md"
          px={2}
          py={1}
          fontVariantNumeric="tabular-nums"
        >
          x {hoverCell.x} · y {hoverCell.y}
        </Badge>
      ) : null}
    </Box>
  )
}

function ArcAgiFrameBoard({
  game,
  state,
  playing,
  actionLog,
  previewPending,
  onStart,
  onAction,
  onReset,
}) {
  const consoleRef = React.useRef(null)
  const heldKeyRepeatRef = React.useRef({})
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const frame = React.useMemo(
    () => (Array.isArray(state && state.frame) ? state.frame : []),
    [state]
  )
  const actionSpace = React.useMemo(() => {
    if (Array.isArray(state && state.availableActions)) {
      return state.availableActions
    }

    if (Array.isArray(game && game.actionSpace)) {
      return game.actionSpace.map((item) => item.arcAction || item.name)
    }

    return []
  }, [game, state])
  const {width, height} = React.useMemo(() => frameDimensions(frame), [frame])
  const gameOver = Boolean(state && state.gameOver)
  const failed = Boolean(state && state.failed)
  const completed = Boolean(state && state.completed)
  const canAct = Boolean(
    game && playing && !previewPending && !completed && !gameOver
  )
  const canQueueAction = Boolean(game && playing && !completed && !gameOver)
  const canReset = Boolean(
    game &&
      !previewPending &&
      (gameOver || actionSpace.includes('RESET') || actionLog.length)
  )
  let startLabel = 'Start'

  if (playing) {
    startLabel = 'Playing'
  } else if (actionLog.length) {
    startLabel = 'Resume'
  }

  const handleToggleFullscreen = React.useCallback(() => {
    if (typeof document === 'undefined') return
    const element = consoleRef.current
    const activeElement =
      document.fullscreenElement || document.webkitFullscreenElement

    if (activeElement) {
      const exitFullscreen =
        document.exitFullscreen || document.webkitExitFullscreen
      if (exitFullscreen) exitFullscreen.call(document)
      return
    }

    if (!element) return
    const requestFullscreen =
      element.requestFullscreen || element.webkitRequestFullscreen
    if (requestFullscreen) requestFullscreen.call(element)
  }, [])

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const updateFullscreenState = () => {
      const activeElement =
        document.fullscreenElement || document.webkitFullscreenElement
      setIsFullscreen(Boolean(activeElement === consoleRef.current))
    }

    document.addEventListener('fullscreenchange', updateFullscreenState)
    document.addEventListener('webkitfullscreenchange', updateFullscreenState)
    updateFullscreenState()

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState)
      document.removeEventListener(
        'webkitfullscreenchange',
        updateFullscreenState
      )
    }
  }, [])

  const handleArcKeyDown = React.useCallback(
    (event) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return
      }

      const action = arcKeyActionFromEvent(event)
      const resetRequested = action === 'RESET'

      if (action && (canQueueAction || canReset)) {
        event.preventDefault()
        event.stopPropagation()
      }

      if (
        !action ||
        (resetRequested
          ? !canReset
          : !canQueueAction ||
            (actionSpace.length && !actionSpace.includes(action)))
      ) {
        return
      }

      if (!shouldAcceptHeldKeyRepeat(event, heldKeyRepeatRef)) {
        return
      }

      if (event.repeat === true && previewPending) {
        return
      }

      if (resetRequested) {
        onReset()
      } else {
        onAction(action, {
          inputSource: 'keyboard',
          heldKeyRepeat: event.repeat === true,
          keyId: event.code || event.key || action,
        })
      }
    },
    [actionSpace, canQueueAction, canReset, onAction, onReset, previewPending]
  )

  React.useEffect(() => {
    if (!canQueueAction && !canReset) return undefined

    window.addEventListener('keydown', handleArcKeyDown)
    return () => window.removeEventListener('keydown', handleArcKeyDown)
  }, [canQueueAction, canReset, handleArcKeyDown])

  if (!frame.length) {
    return (
      <Stack
        spacing={3}
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="orange.200"
        borderRadius="md"
        p={5}
        bg="orange.010"
      >
        <Text fontWeight={600}>ARC-AGI frame unavailable</Text>
        <Text color="muted" fontSize="sm">
          Install the optional Python 3.12 `arc-agi` runtime and make the
          selected public game available locally to render real ARC-AGI frames.
        </Text>
      </Stack>
    )
  }

  return (
    <Box
      ref={consoleRef}
      data-testid="arc-game-console"
      w="full"
      maxW={isFullscreen ? '100vw' : '1240px'}
      minH={isFullscreen ? '100vh' : 'auto'}
      mx="auto"
      p={[3, 4, 5]}
      borderRadius="8px"
      bg="linear-gradient(145deg, #252b36 0%, #1a202b 52%, #121821 100%)"
      color="white"
      borderWidth="1px"
      borderColor="rgba(255,255,255,.10)"
      boxShadow="inset 0 1px 0 rgba(255,255,255,.14), inset 0 -16px 34px rgba(0,0,0,.22), 0 22px 54px rgba(15,23,42,.28)"
      sx={{
        '&:fullscreen': {
          width: '100vw',
          height: '100vh',
          overflow: 'auto',
        },
        '&:-webkit-full-screen': {
          width: '100vw',
          height: '100vh',
          overflow: 'auto',
        },
      }}
    >
      <Stack spacing={4}>
        <Flex
          justify="space-between"
          gap={3}
          flexWrap="wrap"
          align="center"
          px={[1, 2]}
        >
          <Box minW={0}>
            <HStack spacing={3} flexWrap="wrap">
              <Box
                w={3}
                h={3}
                borderRadius="full"
                bg={playing ? '#39d98a' : '#ffcf5a'}
                boxShadow={
                  playing
                    ? '0 0 0 4px rgba(57,217,138,.12)'
                    : '0 0 0 4px rgba(255,207,90,.12)'
                }
              />
              <Text color="#f6f8fb" fontWeight={800}>
                {game.title || state.gameId}
              </Text>
            </HStack>
            <HStack
              mt={1}
              color="#aeb8c7"
              fontSize="sm"
              spacing={2}
              flexWrap="wrap"
            >
              <Text>
                {width}x{height}
              </Text>
              <Text>{state.state || 'state unknown'}</Text>
              <Text>
                {Number(state.levelsCompleted || 0)} level(s) completed
              </Text>
              <Text>{actionLog.length} actions</Text>
              {previewPending ? <Text>updating frame</Text> : null}
            </HStack>
          </Box>
          <HStack spacing={2}>
            <PrimaryButton
              onClick={onStart}
              isDisabled={!game || completed || gameOver}
            >
              {startLabel}
            </PrimaryButton>
            <SecondaryButton onClick={onReset} isDisabled={!canReset}>
              Reset
            </SecondaryButton>
            <Tooltip label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <IconButton
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                icon={<OpenIcon />}
                variant="secondary"
                h={9}
                minW={9}
                borderRadius="8px"
                bg="rgba(255,255,255,.08)"
                color="#edf2fb"
                borderWidth="1px"
                borderColor="rgba(255,255,255,.12)"
                _hover={{bg: 'rgba(255,255,255,.14)'}}
                onClick={handleToggleFullscreen}
              />
            </Tooltip>
          </HStack>
        </Flex>

        <Flex
          gap={[4, 5, 6]}
          align="stretch"
          flexDirection={['column', null, 'row']}
        >
          <Box
            tabIndex={0}
            role="application"
            aria-label="ARC-AGI playable frame"
            flex="1"
            minW={0}
            p={[2, 3, 4]}
            borderRadius="8px"
            bg="linear-gradient(180deg, #111722, #0b1018)"
            borderWidth="1px"
            borderColor="rgba(255,255,255,.08)"
            boxShadow="inset 0 2px 18px rgba(0,0,0,.58)"
            _focus={{
              outline: '2px solid',
              outlineColor: '#7fd5ff',
              outlineOffset: '3px',
            }}
          >
            <ArcAgiFrameCanvas
              frame={frame}
              canAct={canAct}
              actionSpace={actionSpace}
              onAction={onAction}
              maxBoardWidth={isFullscreen ? 'min(78vh, 1120px)' : '100%'}
            />
          </Box>

          <Stack
            spacing={4}
            w={['full', null, isFullscreen ? '320px' : '280px']}
            flexShrink={0}
            justify="center"
          >
            <ArcGamepad
              canAct={canAct}
              actionSpace={actionSpace}
              onAction={onAction}
            />
            <Box
              p={3}
              borderRadius="8px"
              bg="rgba(10,14,22,.56)"
              color="#aeb8c7"
              fontSize="xs"
              borderWidth="1px"
              borderColor="rgba(255,255,255,.10)"
            >
              <HStack spacing={2} flexWrap="wrap">
                <Kbd
                  bg="rgba(255,255,255,.09)"
                  color="#d8e0ee"
                  borderColor="rgba(255,255,255,.14)"
                >
                  WASD
                </Kbd>
                <Kbd
                  bg="rgba(255,255,255,.09)"
                  color="#d8e0ee"
                  borderColor="rgba(255,255,255,.14)"
                >
                  Space
                </Kbd>
                <Kbd
                  bg="rgba(255,255,255,.09)"
                  color="#d8e0ee"
                  borderColor="rgba(255,255,255,.14)"
                >
                  Ctrl+Z
                </Kbd>
              </HStack>
              {gameOver ? (
                <Text mt={2} color={failed ? '#ffcf5a' : 'orange.200'}>
                  {failed
                    ? 'Attempt failed: reset when you are ready to start over.'
                    : 'Game over: reset before sending more actions.'}
                </Text>
              ) : null}
            </Box>
          </Stack>
        </Flex>
      </Stack>
    </Box>
  )
}

function ArcGameBoard({
  game,
  state,
  playing,
  previewPending,
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
  const heldKeyRepeatRef = React.useRef({})
  const isArcAgiFrame = Boolean(
    game && game.renderHints && game.renderHints.renderer === 'arc-agi-frame-v0'
  )
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
    game && state && playing && !completed && remainingMs > 0 && !isArcAgiFrame
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
      if (event.defaultPrevented || isTypingTarget(event.target)) {
        return
      }

      const action = KEY_ACTIONS[event.key]

      if (!action || !canAct) return

      event.preventDefault()
      event.stopPropagation()

      if (!shouldAcceptHeldKeyRepeat(event, heldKeyRepeatRef)) {
        return
      }

      onAction(action, {
        inputSource: 'keyboard',
        heldKeyRepeat: event.repeat === true,
        keyId: event.code || event.key || action,
      })
    },
    [canAct, onAction]
  )

  React.useEffect(() => {
    if (!canAct) return undefined

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canAct, handleKeyDown])

  if (!game) {
    return (
      <Stack
        spacing={4}
        align="center"
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="gray.300"
        borderRadius="md"
        p={6}
        bg="gray.50"
      >
        <Center boxSize={12} borderRadius="full" bg="blue.50" color="blue.500">
          <RefreshIcon boxSize={5} />
        </Center>
        <Text fontWeight={700}>New game</Text>
        <HStack spacing={2} flexWrap="wrap" justify="center">
          <Badge>1 Local AI</Badge>
          <Badge>2 Game</Badge>
          <Badge colorScheme="blue">3 Play</Badge>
        </HStack>
      </Stack>
    )
  }

  if (isArcAgiFrame) {
    return (
      <ArcAgiFrameBoard
        game={game}
        state={state || game.initialState}
        playing={playing}
        actionLog={actionLog}
        previewPending={previewPending}
        onStart={onStart}
        onAction={onAction}
        onReset={onReset}
      />
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
  const settings = useOptionalSettingsState({})
  const settingsDispatch = useOptionalSettingsDispatch({})
  const settingsRpcConnection = React.useMemo(
    () => getSettingsRpcConnection(settings),
    [settings]
  )
  const [mounted, setMounted] = React.useState(false)
  const [busy, setBusy] = React.useState(null)
  const [adapter, setAdapter] = React.useState('external')
  const [proofMode, setProofMode] = React.useState('node-signature')
  const [rpcUrl, setRpcUrl] = React.useState(settingsRpcConnection.url)
  const [apiKey, setApiKey] = React.useState(settingsRpcConnection.apiKey)
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [address, setAddress] = React.useState('')
  const [proofTxHash, setProofTxHash] = React.useState('')
  const [proofCid, setProofCid] = React.useState('')
  const [proofContract, setProofContract] = React.useState('')
  const [gameSource, setGameSource] = React.useState('local-grid')
  const [arcAgiGameId, setArcAgiGameId] = React.useState('ls20')
  const [sessionId, setSessionId] = React.useState('')
  const [participantId, setParticipantId] = React.useState('player-1')
  const [salt, setSalt] = React.useState('')
  const [actions, setActions] = React.useState(DEFAULT_ACTIONS)
  const [status, setStatus] = React.useState(null)
  const [arcAgiRuntime, setArcAgiRuntime] = React.useState(null)
  const [arcAgiGames, setArcAgiGames] = React.useState(ARC_PUBLIC_GAMES)
  const [arcAgiGamesStatus, setArcAgiGamesStatus] = React.useState(null)
  const [arcAgiGameCatalogLoaded, setArcAgiGameCatalogLoaded] =
    React.useState(false)
  const [arcApiKey, setArcApiKey] = React.useState('')
  const [arcScorecardMode, setArcScorecardMode] = React.useState('competition')
  const [identity, setIdentity] = React.useState(null)
  const [session, setSession] = React.useState(null)
  const [game, setGame] = React.useState(null)
  const [playState, setPlayState] = React.useState(null)
  const [playing, setPlaying] = React.useState(false)
  const [arcPreviewPending, setArcPreviewPending] = React.useState(false)
  const [startedAt, setStartedAt] = React.useState(null)
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const [actionLog, setActionLog] = React.useState([])
  const [selectedCell, setSelectedCell] = React.useState(null)
  const [bundle, setBundle] = React.useState(null)
  const [arcScorecard, setArcScorecard] = React.useState(null)
  const [annotationStatus, setAnnotationStatus] = React.useState('draft')
  const [teacherStep, setTeacherStep] = React.useState('play')
  const [attemptPhase, setAttemptPhase] = React.useState('setup')
  const [humanAttempt, setHumanAttempt] = React.useState(null)
  const [localAiAttempts, setLocalAiAttempts] = React.useState([])
  const [teacherRounds, setTeacherRounds] = React.useState([])
  const [providerAnnotationDrafts, setProviderAnnotationDrafts] =
    React.useState([])
  const [compressedTeacherMemory, setCompressedTeacherMemory] =
    React.useState(null)
  const [confirmedRules, setConfirmedRules] = React.useState('')
  const [ruleHypotheses, setRuleHypotheses] = React.useState('')
  const [wrongHypotheses, setWrongHypotheses] = React.useState('')
  const [recognitionActionIndex, setRecognitionActionIndex] = React.useState('')
  const [recognitionNotes, setRecognitionNotes] = React.useState('')
  const [evidenceEvents, setEvidenceEvents] = React.useState('')
  const [visualAnnotations, setVisualAnnotations] = React.useState([])
  const [strategyChange, setStrategyChange] = React.useState('')
  const [teachingNotes, setTeachingNotes] = React.useState('')
  const [localAiGameplayExplanation, setLocalAiGameplayExplanation] =
    React.useState('')
  const [localAiGameplaySummary, setLocalAiGameplaySummary] = React.useState('')
  const [localAiGameplayInvariants, setLocalAiGameplayInvariants] =
    React.useState('')
  const [localAiGameplayActionPolicy, setLocalAiGameplayActionPolicy] =
    React.useState('')
  const [
    localAiGameplayRejectedAlternatives,
    setLocalAiGameplayRejectedAlternatives,
  ] = React.useState('')
  const [localAiAttemptActions, setLocalAiAttemptActions] = React.useState('')
  const [localAiReplay, setLocalAiReplay] = React.useState(null)
  const [localAiReplayIndex, setLocalAiReplayIndex] = React.useState(0)
  const [localAiReplayPlaying, setLocalAiReplayPlaying] = React.useState(false)
  const [arcAiCostEvents, setArcAiCostEvents] = React.useState([])
  const [localAiActionRationales, setLocalAiActionRationales] =
    React.useState('')
  const [localAiUncertaintyNotes, setLocalAiUncertaintyNotes] =
    React.useState('')
  const [humanReplayExplanation, setHumanReplayExplanation] = React.useState('')
  const [humanReplaySummary, setHumanReplaySummary] = React.useState('')
  const [humanReplayInvariants, setHumanReplayInvariants] = React.useState('')
  const [humanReplayActionPolicy, setHumanReplayActionPolicy] =
    React.useState('')
  const [humanReplayRejectedAlternatives, setHumanReplayRejectedAlternatives] =
    React.useState('')
  const [humanReplayKeyMoments, setHumanReplayKeyMoments] = React.useState('')
  const [humanReplayCorrections, setHumanReplayCorrections] = React.useState('')
  const [aiFailedAbstractions, setAiFailedAbstractions] = React.useState('')
  const [aiStopReason, setAiStopReason] = React.useState('')
  const [missingCapability, setMissingCapability] = React.useState('')
  const [humanVsAiGap, setHumanVsAiGap] = React.useState('')
  const [capabilityTags, setCapabilityTags] = React.useState(
    'spatial-planning, causal-trigger'
  )
  const [suggestedAdapterTarget, setSuggestedAdapterTarget] = React.useState('')
  const [annotationBundle, setAnnotationBundle] = React.useState(null)
  const [trainingDataset, setTrainingDataset] = React.useState(null)
  const [signedArtifactResult, setSignedArtifactResult] = React.useState(null)
  const [signedArtifactImportCid, setSignedArtifactImportCid] =
    React.useState('')
  const [showExpertMode, setShowExpertMode] = React.useState(false)
  const [showAdvancedConnection, setShowAdvancedConnection] =
    React.useState(false)
  const [lastResult, setLastResult] = React.useState(null)
  const adapterTouchedRef = React.useRef(false)
  const rpcConnectionTouchedRef = React.useRef(false)
  const actionLogRef = React.useRef([])
  const arcPreviewRequestRef = React.useRef(0)
  const arcActionInFlightRef = React.useRef(false)
  const arcQueuedActionsRef = React.useRef([])
  const drainArcQueuedActionRef = React.useRef(null)
  const lastArcInputRef = React.useRef({action: '', at: 0})
  const lastHeldKeyActionRef = React.useRef({})
  const scrollToGamePanel = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.setTimeout(() => {
      document
        .getElementById('idena-arc-game-panel')
        ?.scrollIntoView({behavior: 'smooth', block: 'start'})
    }, 0)
  }, [])

  const playDurationMs = React.useMemo(
    () => getPlayDuration(session),
    [session]
  )

  React.useEffect(() => {
    actionLogRef.current = actionLog
  }, [actionLog])
  const arcAgiGameOptions = React.useMemo(
    () => uniqueArcAgiGameOptions(arcAgiGames),
    [arcAgiGames]
  )
  const selectedArcAgiGame = React.useMemo(() => {
    const selectedBase = baseArcGameId(arcAgiGameId)

    return (
      arcAgiGameOptions.find((item) => item.value === arcAgiGameId) ||
      arcAgiGameOptions.find((item) => item.baseGameId === selectedBase) ||
      null
    )
  }, [arcAgiGameId, arcAgiGameOptions])
  const currentArcAiCostEstimate = React.useMemo(() => {
    const attemptActions = parseActions(localAiAttemptActions)
    const usage = estimateArcAiTokenUsage({
      game,
      playState,
      actionLog,
      attemptActions,
      explanation: localAiGameplayExplanation,
    })

    return {
      usage,
      ...resolveArcAiCostProfile(settings, usage),
    }
  }, [
    actionLog,
    game,
    localAiAttemptActions,
    localAiGameplayExplanation,
    playState,
    settings,
  ])
  const arcAiCostSummary = React.useMemo(
    () => summarizeArcAiCostEvents(arcAiCostEvents),
    [arcAiCostEvents]
  )
  const lastArcAiCostEvent = arcAiCostEvents.length
    ? arcAiCostEvents[arcAiCostEvents.length - 1]
    : null
  const arcAiSolverSettings = settings.aiSolver || {}
  const arcLocalAiEnabled = Boolean(
    settings.localAi && settings.localAi.enabled
  )
  const arcLocalAiSelected = Boolean(
    arcAiSolverSettings.enabled &&
      String(arcAiSolverSettings.provider || '') === 'local-ai'
  )
  const arcLocalAiUsable = Boolean(arcLocalAiEnabled && arcLocalAiSelected)
  const latestLocalAiAttempt = React.useMemo(
    () => latestAttempt(localAiAttempts),
    [localAiAttempts]
  )
  const teacherJourney = React.useMemo(
    () =>
      buildTeacherJourney({
        game,
        selectedArcAgiGame,
        humanAttempt,
        localAiAttempts,
        teacherRounds,
        compressedTeacherMemory,
        providerAnnotationDrafts,
        visualAnnotations,
        phase: attemptPhase,
      }),
    [
      attemptPhase,
      compressedTeacherMemory,
      game,
      humanAttempt,
      localAiAttempts,
      providerAnnotationDrafts,
      selectedArcAgiGame,
      teacherRounds,
      visualAnnotations,
    ]
  )
  const handleResetArcAiCost = React.useCallback(() => {
    setArcAiCostEvents([])
  }, [])
  const signedArtifactSource = React.useMemo(() => {
    if (trainingDataset) {
      return {
        artifactType: 'arc-training-dataset',
        payload: trainingDataset,
        label: 'Training dataset',
      }
    }

    if (annotationBundle) {
      return {
        artifactType: 'arc-annotation-bundle',
        payload: annotationBundle,
        label: 'Annotation bundle',
      }
    }

    if (bundle) {
      return {
        artifactType: 'arc-trace-bundle',
        payload: bundle,
        label: 'Trace bundle',
      }
    }

    return null
  }, [annotationBundle, bundle, trainingDataset])

  const applyStatus = React.useCallback((result) => {
    setStatus(result)
    setArcAgiRuntime(
      result && result.arcAgiRuntime ? result.arcAgiRuntime : null
    )

    const connection = result && result.rehearsalConnection
    if (!connection || !connection.url || adapterTouchedRef.current) {
      return
    }

    setAdapter('rehearsal-devnet')
    setProofMode('devnet-local-signature')
    setRpcUrl(connection.url)
    setApiKey('')

    if (result.rehearsalSigner && result.rehearsalSigner.address) {
      setAddress(result.rehearsalSigner.address)
    }
  }, [])

  React.useEffect(() => {
    if (adapter === 'rehearsal-devnet' || rpcConnectionTouchedRef.current) {
      return
    }

    setRpcUrl(settingsRpcConnection.url)
    setApiKey(settingsRpcConnection.apiKey)
  }, [adapter, settingsRpcConnection])

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
      generatorKind:
        gameSource === 'arc-agi-public'
          ? 'arc-agi-public-game-v0'
          : 'idena-arc-local-grid-v0',
      arcAgiGameId: gameSource === 'arc-agi-public' ? arcAgiGameId : '',
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
      gameSource,
      arcAgiGameId,
      participantId,
      sessionId,
    ]
  )
  const arcAgiTransientPayload = React.useMemo(
    () => ({
      arcApiKey,
      scorecardMode: arcScorecardMode,
    }),
    [arcApiKey, arcScorecardMode]
  )

  const recordingSummary = React.useMemo(() => {
    if (!bundle || !bundle.recording) return null
    const entries = Array.isArray(bundle.recording.entries)
      ? bundle.recording.entries.length
      : 0
    const jsonlLines = bundle.recording.jsonl
      ? bundle.recording.jsonl.trim().split('\n').filter(Boolean).length
      : 0
    const agentLogLines =
      bundle.agentLog && bundle.agentLog.text
        ? bundle.agentLog.text.trim().split('\n').filter(Boolean).length
        : 0

    return {
      protocol: bundle.recording.protocol,
      entries,
      jsonlLines,
      hash: bundle.recordingHash,
      jsonlHash: bundle.recordingJsonlHash,
      filename: bundle.recordingFilename,
      agentLogHash: bundle.agentLogHash,
      agentLogFilename: bundle.agentLogFilename,
      agentLogLines,
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
  const gameBadge = React.useMemo(() => {
    if (!game) return null
    if (game.arcAgiAvailable) {
      return {colorScheme: 'green', label: 'ARC-AGI toolkit ready'}
    }
    if (game.browserDemoArcFixture) {
      return {colorScheme: 'green', label: 'Browser ARC fixture'}
    }
    return {colorScheme: 'orange', label: 'Local grid'}
  }, [game])

  const actionTimeline = React.useMemo(() => {
    if (humanAttempt && Array.isArray(humanAttempt.actions)) {
      return attemptActionItemsFromTimeline(humanAttempt.actions).slice(0, 24)
    }

    if (!bundle || !bundle.recording || !bundle.recording.entries) {
      return actionLog.map((item, index) => ({
        index,
        t_ms: item.t_ms,
        action: item.action,
        arcAction: arcActionName(item.action) || item.action,
        x: item.x,
        y: item.y,
        stateHash: null,
        score: null,
      }))
    }

    return bundle.recording.entries
      .map((entry, index) => {
        const data = entry && entry.data ? entry.data : {}
        const actionInput = data.action_input || null
        const actionData =
          actionInput && actionInput.data ? actionInput.data : {}

        return {
          index,
          t_ms: Number(actionData.t_ms || 0) || 0,
          action: actionData.action || 'RESET',
          arcAction: actionData.arc_action || null,
          x: typeof actionData.x === 'number' ? actionData.x : undefined,
          y: typeof actionData.y === 'number' ? actionData.y : undefined,
          stateHash: data.state_hash || null,
          score: data.score,
        }
      })
      .slice(0, 24)
  }, [actionLog, bundle, humanAttempt])

  const annotationPayload = React.useMemo(() => {
    const localAiAttemptActionItems =
      latestLocalAiAttempt && Array.isArray(latestLocalAiAttempt.actions)
        ? normalizeAttemptActions(latestLocalAiAttempt.actions)
        : parseActions(localAiAttemptActions)
    const humanReplayActions =
      humanAttempt && Array.isArray(humanAttempt.actions)
        ? normalizeAttemptActions(humanAttempt.actions)
        : actionTimeline.map((item) => ({
            index: item.index,
            t_ms: item.t_ms,
            action: item.action,
            arcAction:
              item.arcAction || arcActionName(item.action) || item.action,
            ...(typeof item.x === 'number' && typeof item.y === 'number'
              ? {x: item.x, y: item.y}
              : {}),
          }))
    const actionButtonComparison = buildActionButtonComparison(
      humanReplayActions,
      localAiAttemptActionItems
    )
    const typedEvidenceEvents = evidenceEventsFromText(evidenceEvents)
    const visualEvidenceEvents =
      visualAnnotationEvidenceEvents(visualAnnotations)
    const humanReplayKeyMomentEvents = evidenceEventsFromText(
      humanReplayKeyMoments
    ).concat(visualEvidenceEvents)

    return {
      status: annotationStatus,
      traceBundle: bundle,
      actionButtonComparison,
      humanRuleAnnotation: {
        ruleHypotheses,
        confirmedRules,
        evidenceEvents: typedEvidenceEvents.concat(visualEvidenceEvents),
        recognitionMoment: {
          actionIndex: recognitionActionIndex,
          description: recognitionNotes,
        },
        wrongHypotheses,
        strategyChange,
        difficulty: 3,
        teachingNotes,
        capabilityTags,
      },
      aiSelfAnnotation: {
        failedAbstractions: aiFailedAbstractions,
        stopReason: aiStopReason,
        missingCapability,
      },
      localAiGameplayAnnotation: {
        provider: 'local-ai',
        mode: 'gameplay',
        attemptedActions: localAiAttemptActionItems,
        actionButtonDescriptions: buildUsedActionButtonDescriptions(
          localAiAttemptActionItems
        ),
        explanationText: localAiGameplayExplanation,
        structuredExplanation: {
          summary: localAiGameplaySummary,
          invariants: localAiGameplayInvariants,
          actionPolicy: localAiGameplayActionPolicy,
          rejectedAlternatives: localAiGameplayRejectedAlternatives,
        },
        actionRationales: localAiActionRationales,
        uncertaintyNotes: localAiUncertaintyNotes,
      },
      humanReplayAnnotation: {
        replayActions: humanReplayActions,
        actionButtonDescriptions:
          buildUsedActionButtonDescriptions(humanReplayActions),
        explanationText: humanReplayExplanation,
        structuredExplanation: {
          summary: humanReplaySummary,
          invariants: humanReplayInvariants,
          actionPolicy: humanReplayActionPolicy,
          rejectedAlternatives: humanReplayRejectedAlternatives,
          evidenceEvents: visualEvidenceEvents,
        },
        keyMoments: humanReplayKeyMomentEvents,
        corrections: humanReplayCorrections,
      },
      comparisonAnnotation: {
        humanVsAiGap,
        capabilityTags,
        suggestedAdapterTarget,
        actionButtonComparison,
      },
      teacherJourney,
      compressedTeacherMemory,
      providerAnnotationDrafts,
    }
  }, [
    actionTimeline,
    aiFailedAbstractions,
    aiStopReason,
    annotationStatus,
    bundle,
    capabilityTags,
    confirmedRules,
    evidenceEvents,
    humanVsAiGap,
    humanReplayCorrections,
    humanReplayActionPolicy,
    humanReplayExplanation,
    humanReplayInvariants,
    humanReplayKeyMoments,
    humanReplayRejectedAlternatives,
    humanReplaySummary,
    humanAttempt,
    localAiActionRationales,
    localAiAttemptActions,
    latestLocalAiAttempt,
    localAiGameplayActionPolicy,
    localAiGameplayExplanation,
    localAiGameplayInvariants,
    localAiGameplayRejectedAlternatives,
    localAiGameplaySummary,
    localAiUncertaintyNotes,
    missingCapability,
    recognitionActionIndex,
    recognitionNotes,
    ruleHypotheses,
    strategyChange,
    suggestedAdapterTarget,
    teachingNotes,
    teacherJourney,
    compressedTeacherMemory,
    providerAnnotationDrafts,
    visualAnnotations,
    wrongHypotheses,
  ])

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
    const timeline = Array.isArray(localAiReplay && localAiReplay.timeline)
      ? localAiReplay.timeline
      : []

    if (!localAiReplayPlaying || timeline.length < 2) return undefined

    const timer = setInterval(() => {
      setLocalAiReplayIndex((current) => {
        const next = Math.min(timeline.length - 1, Number(current || 0) + 1)
        if (next >= timeline.length - 1) {
          setLocalAiReplayPlaying(false)
        }
        return next
      })
    }, 550)

    return () => clearInterval(timer)
  }, [localAiReplay, localAiReplayPlaying])

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

    window.render_game_to_text = () => {
      const arcFrame = Array.isArray(playState && playState.frame)
        ? playState.frame
        : []
      const arcFrameWidth = Math.max(
        ...arcFrame.map((row) => (Array.isArray(row) ? row.length : 0)),
        0
      )
      const arcLastAction = actionLog.length
        ? actionLog[actionLog.length - 1].action
        : null

      return JSON.stringify({
        mode: renderGameMode(),
        coordinateSystem: 'origin top-left, x right, y down',
        sessionId: session && session.sessionId,
        gridSize: playState && playState.gridSize,
        arc:
          playState && playState.engine === 'arc-agi-public-game-v0'
            ? {
                gameId: playState.gameId,
                turn: playState.turn,
                state: playState.state,
                completed: Boolean(playState.completed),
                gameOver: Boolean(playState.gameOver),
                levelsCompleted: Number(playState.levelsCompleted || 0),
                winLevels: Number(playState.winLevels || 0),
                availableActions: Array.isArray(playState.availableActions)
                  ? playState.availableActions
                  : [],
                frameWidth: arcFrameWidth,
                frameHeight: arcFrame.length,
                actionCount: actionLog.length,
                lastAction: arcLastAction,
              }
            : null,
        player: playState && playState.player,
        goal: playState && playState.goal,
        obstacles: playState && playState.obstacles,
        completed: Boolean(playState && playState.completed),
        score: playState ? scoreLocalState(playState, actionLog.length) : 0,
        actions: actionLog.map((item) => item.action),
        elapsedMs,
        remainingMs: Math.max(0, playDurationMs - elapsedMs),
        traceSubmitted: Boolean(bundle),
        arcScorecardUrl:
          arcScorecard &&
          arcScorecard.scorecard &&
          arcScorecard.scorecard.scorecardUrl
            ? arcScorecard.scorecard.scorecardUrl
            : null,
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
        agentLogLines:
          recordingSummary && recordingSummary.agentLogLines
            ? recordingSummary.agentLogLines
            : 0,
        agentLogHash:
          recordingSummary && recordingSummary.agentLogHash
            ? recordingSummary.agentLogHash
            : null,
        agentLogFilename:
          recordingSummary && recordingSummary.agentLogFilename
            ? recordingSummary.agentLogFilename
            : null,
        lastArcAction:
          recordingSummary && recordingSummary.lastArcAction
            ? recordingSummary.lastArcAction
            : null,
        annotationHash:
          annotationBundle && annotationBundle.annotationHash
            ? annotationBundle.annotationHash
            : null,
        annotationAcceptedForTraining: Boolean(
          annotationBundle && annotationBundle.acceptedForTraining
        ),
        teacherStep,
        teacherJourneyProtocol: TEACHER_JOURNEY_PROTOCOL,
        attemptPhase,
        humanAttemptSaved: Boolean(humanAttempt),
        humanAttemptActionCount:
          humanAttempt && Array.isArray(humanAttempt.actions)
            ? humanAttempt.actions.length
            : 0,
        localAiAttemptCount: Array.isArray(localAiAttempts)
          ? localAiAttempts.length
          : 0,
        latestLocalAiStopReason:
          latestLocalAiAttempt && latestLocalAiAttempt.stopReason
            ? latestLocalAiAttempt.stopReason
            : null,
        localAiAttemptActions: parseActions(localAiAttemptActions).map(
          (item) => item.action
        ),
        localAiReplayFrames:
          localAiReplay && Array.isArray(localAiReplay.timeline)
            ? localAiReplay.timeline.length
            : 0,
        localAiReplayIndex,
        localAiReplayPlaying,
        trainingExampleCount:
          trainingDataset && trainingDataset.exampleCount
            ? trainingDataset.exampleCount
            : 0,
      })
    }
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
    arcScorecard,
    annotationBundle,
    attemptPhase,
    bundle,
    elapsedMs,
    game,
    humanAttempt,
    latestLocalAiAttempt,
    localAiAttemptActions,
    localAiAttempts,
    localAiReplay,
    localAiReplayIndex,
    localAiReplayPlaying,
    playDurationMs,
    playState,
    playing,
    recordingSummary,
    session,
    teacherStep,
    trainingDataset,
  ])

  const resetPlayFromGame = React.useCallback((nextGame) => {
    const initialState = nextGame && nextGame.initialState

    setPlayState(initialState ? cloneJson(initialState) : null)
    setPlaying(false)
    setArcPreviewPending(false)
    setStartedAt(null)
    setElapsedMs(0)
    setActionLog([])
    actionLogRef.current = []
    arcActionInFlightRef.current = false
    arcQueuedActionsRef.current = []
    lastArcInputRef.current = {action: '', at: 0}
    lastHeldKeyActionRef.current = {}
    setSelectedCell(null)
    setActions('')
    setBundle(null)
    setArcScorecard(null)
    setSignedArtifactResult(null)
    setSignedArtifactImportCid('')
    setLocalAiReplay(null)
    setLocalAiReplayIndex(0)
    setLocalAiReplayPlaying(false)
    setVisualAnnotations([])
    setAttemptPhase(nextGame ? 'human_play' : 'setup')
    setHumanAttempt(null)
    setLocalAiAttempts([])
    setTeacherRounds([])
    setProviderAnnotationDrafts([])
    setCompressedTeacherMemory(null)
    setAnnotationBundle(null)
    setTrainingDataset(null)
  }, [])

  const handleStartPlay = React.useCallback(() => {
    if (!game) return

    setPlayState((current) => current || cloneJson(game.initialState))
    setStartedAt(Date.now() - elapsedMs)
    setPlaying(true)
  }, [elapsedMs, game])

  const handleLocalAction = React.useCallback(
    (action, actionData = {}) => {
      if (!game || !playState) return
      if (
        playState.completed ||
        playState.gameOver ||
        elapsedMs >= playDurationMs
      ) {
        setPlaying(false)
        return
      }

      const isArcAgiFrame =
        game.renderHints && game.renderHints.renderer === 'arc-agi-frame-v0'
      const keyboardInput = actionData.inputSource === 'keyboard'
      const heldKeyRepeat = actionData.heldKeyRepeat === true
      const keyId = String(actionData.keyId || action || 'keyboard')

      if (keyboardInput) {
        const now = Date.now()
        const previousAt = Number(lastHeldKeyActionRef.current[keyId] || 0)

        if (
          now - previousAt < ARC_HELD_KEY_REPEAT_MS ||
          (heldKeyRepeat && isArcAgiFrame && arcActionInFlightRef.current)
        ) {
          return
        }

        lastHeldKeyActionRef.current[keyId] = now
      }

      if (isArcAgiFrame) {
        const now = Date.now()
        const lastInput = lastArcInputRef.current || {action: '', at: 0}
        if (
          lastInput.action === action &&
          now - Number(lastInput.at || 0) < ARC_INPUT_DEBOUNCE_MS
        ) {
          return
        }

        if (arcActionInFlightRef.current) {
          lastArcInputRef.current = {action, at: now}
          arcQueuedActionsRef.current = arcQueuedActionsRef.current
            .concat([{action, actionData}])
            .slice(-24)
          return
        }

        if (
          lastInput.action === action &&
          now - Number(lastInput.at || 0) < ARC_INPUT_DEBOUNCE_MS
        ) {
          return
        }
        arcActionInFlightRef.current = true
        lastArcInputRef.current = {action, at: now}
        setArcPreviewPending(true)
      }

      const effectiveStartedAt = startedAt || Date.now()
      const tMs = Math.max(0, Date.now() - effectiveStartedAt)
      const nextAction = {
        t_ms: Math.trunc(tMs),
        action,
        ...(typeof actionData.x === 'number' && typeof actionData.y === 'number'
          ? {x: actionData.x, y: actionData.y}
          : {}),
      }

      if (!startedAt) {
        setStartedAt(effectiveStartedAt)
      }

      const nextLog = actionLogRef.current.concat(nextAction)
      actionLogRef.current = nextLog

      setPlaying(true)
      setActionLog(nextLog)
      setActions(buildActionsText(nextLog))

      if (isArcAgiFrame) {
        const requestId = arcPreviewRequestRef.current + 1
        arcPreviewRequestRef.current = requestId
        const finishPreview = () => {
          if (arcPreviewRequestRef.current !== requestId) return
          arcActionInFlightRef.current = false
          setArcPreviewPending(false)
          const nextQueuedAction = arcQueuedActionsRef.current.shift()
          if (nextQueuedAction && drainArcQueuedActionRef.current) {
            window.setTimeout(() => {
              if (drainArcQueuedActionRef.current) {
                drainArcQueuedActionRef.current(nextQueuedAction)
              }
            }, 0)
          }
        }

        getIdenaArcBridge()
          .previewTrace({
            ...basePayload,
            ...arcAgiTransientPayload,
            actions: nextLog,
          })
          .then((result) => {
            if (arcPreviewRequestRef.current !== requestId || !result) return

            const nextState =
              result.finalState ||
              (result.replay && result.replay.finalState) ||
              null

            if (nextState) {
              setPlayState(nextState)
              if (nextState.completed || nextState.gameOver) {
                setPlaying(false)
              }
            }
          })
          .catch((error) => {
            if (arcPreviewRequestRef.current !== requestId) return

            const message =
              error && error.message
                ? error.message
                : 'Unable to replay the ARC action locally.'
            setLastResult({ok: false, error: message})
            toast({
              title: 'ARC replay preview failed',
              description: message,
              status: 'error',
            })
          })
          .finally(finishPreview)
      } else {
        setPlayState((current) => applyLocalAction(current, action))
      }

      setBundle(null)
      setArcScorecard(null)
    },
    [
      arcAgiTransientPayload,
      basePayload,
      elapsedMs,
      game,
      playDurationMs,
      playState,
      startedAt,
      toast,
    ]
  )

  React.useEffect(() => {
    drainArcQueuedActionRef.current = (queuedAction) => {
      if (!queuedAction) return
      handleLocalAction(queuedAction.action, queuedAction.actionData || {})
    }

    return () => {
      drainArcQueuedActionRef.current = null
    }
  }, [handleLocalAction])

  const handleUndoAction = React.useCallback(() => {
    if (!game || !game.initialState) return

    setActionLog((current) => {
      const nextLog = current.slice(0, -1)
      actionLogRef.current = nextLog
      setPlayState(replayLocalActions(game.initialState, nextLog))
      setActions(buildActionsText(nextLog))
      setBundle(null)
      setArcScorecard(null)
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
      arcQueuedActionsRef.current = []
      actionLogRef.current = parsedActions
      setActionLog(parsedActions)
      if (game && game.initialState) {
        if (
          game.renderHints &&
          game.renderHints.renderer === 'arc-agi-frame-v0'
        ) {
          const requestId = arcPreviewRequestRef.current + 1
          arcPreviewRequestRef.current = requestId
          setArcPreviewPending(true)
          getIdenaArcBridge()
            .previewTrace({
              ...basePayload,
              ...arcAgiTransientPayload,
              actions: parsedActions,
            })
            .then((result) => {
              if (arcPreviewRequestRef.current !== requestId || !result) return
              const nextState =
                result.finalState ||
                (result.replay && result.replay.finalState) ||
                null
              if (nextState) setPlayState(nextState)
            })
            .catch(() => {})
            .finally(() => {
              if (arcPreviewRequestRef.current !== requestId) return
              arcActionInFlightRef.current = false
              setArcPreviewPending(false)
            })
        } else {
          setPlayState(replayLocalActions(game.initialState, parsedActions))
        }
      }
      setBundle(null)
      setArcScorecard(null)
    },
    [arcAgiTransientPayload, basePayload, game]
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

  const handlePrepareArcAgiRuntime = React.useCallback(async () => {
    const result = await run('Prepare ARC-AGI runtime', () =>
      getIdenaArcBridge().prepareArcAgiRuntime({
        ...arcAgiTransientPayload,
        cacheAllPublic: true,
      })
    )
    if (!result || result.ok === false) return
    setArcAgiRuntime(result)
  }, [arcAgiTransientPayload, run])

  const handleLoadArcAgiGames = React.useCallback(async () => {
    const result = await run('Load ARC-AGI games', () =>
      getIdenaArcBridge().listArcAgiPublicGames
        ? getIdenaArcBridge().listArcAgiPublicGames(arcAgiTransientPayload)
        : Promise.resolve({ok: false, games: ARC_PUBLIC_GAMES})
    )

    if (!result || result.ok === false || !Array.isArray(result.games)) {
      setArcAgiGamesStatus(result)
      return result
    }

    const options = uniqueArcAgiGameOptions(result.games)
    setArcAgiGames(options.length ? options : ARC_PUBLIC_GAMES)
    setArcAgiGamesStatus(result)
    setArcAgiGameCatalogLoaded(true)

    const selectedBase = baseArcGameId(arcAgiGameId)
    const exact = options.find((item) => item.value === arcAgiGameId)
    const versioned = options.find(
      (item) => item.baseGameId === selectedBase && item.value.includes('-')
    )

    if (!exact && versioned) {
      setArcAgiGameId(versioned.value)
    }

    return result
  }, [arcAgiGameId, arcAgiTransientPayload, run])

  React.useEffect(() => {
    if (
      gameSource !== 'arc-agi-public' ||
      !arcAgiRuntimeReady(arcAgiRuntime) ||
      arcAgiGameCatalogLoaded ||
      busy
    ) {
      return
    }

    handleLoadArcAgiGames()
  }, [
    arcAgiGameCatalogLoaded,
    arcAgiRuntime,
    busy,
    gameSource,
    handleLoadArcAgiGames,
  ])

  const handleSetupAndGenerate = React.useCallback(async () => {
    const result = await run('Setup + generate', async () => {
      const bridge = getIdenaArcBridge()
      let runtime = arcAgiRuntime

      if (gameSource === 'arc-agi-public' && !arcAgiRuntimeReady(runtime)) {
        runtime = await bridge.prepareArcAgiRuntime({
          ...arcAgiTransientPayload,
          cacheAllPublic: false,
          gameIds: [arcAgiGameId],
        })
        if (!arcAgiRuntimeReady(runtime)) {
          throw new Error(
            (runtime && runtime.message) || 'ARC-AGI runtime is not ready yet.'
          )
        }
      }

      const created = await bridge.createSession({
        ...basePayload,
        sessionId: sessionId || '',
      })
      const nextSessionId = created.sessionId
      const nextPayload = {
        ...basePayload,
        sessionId: nextSessionId,
      }
      const committed = await bridge.commitSalt(nextPayload)
      const nextSalt = committed.salt
      const reveals = [{participantId, salt: nextSalt}]
      const revealed = await bridge.revealSalt({
        ...nextPayload,
        salt: nextSalt,
      })
      const seed = await bridge.computeFinalSeed({
        ...nextPayload,
        reveals,
      })
      const generated = await bridge.generateGame({
        ...nextPayload,
        ...arcAgiTransientPayload,
        reveals,
      })

      return {
        ok: true,
        runtime,
        created,
        committed,
        revealed,
        seed,
        generated,
      }
    })

    if (!result || result.ok === false) return

    if (result.runtime) {
      setArcAgiRuntime(result.runtime)
    }

    setSalt(result.committed.salt)
    setSessionId(result.created.sessionId)
    setSession(result.generated.session)
    setGame(result.generated.game)
    resetPlayFromGame(result.generated.game)
    scrollToGamePanel()
  }, [
    arcAgiRuntime,
    arcAgiGameId,
    arcAgiTransientPayload,
    basePayload,
    gameSource,
    participantId,
    resetPlayFromGame,
    run,
    scrollToGamePanel,
    sessionId,
  ])

  const handleGenerateGame = React.useCallback(async () => {
    let preparedRuntime = null
    const result = await run('Generate game', async () => {
      const bridge = getIdenaArcBridge()

      if (
        gameSource === 'arc-agi-public' &&
        !arcAgiRuntimeReady(arcAgiRuntime)
      ) {
        preparedRuntime = await bridge.prepareArcAgiRuntime({
          ...arcAgiTransientPayload,
          cacheAllPublic: false,
          gameIds: [arcAgiGameId],
        })
        if (!arcAgiRuntimeReady(preparedRuntime)) {
          throw new Error(
            (preparedRuntime && preparedRuntime.message) ||
              'ARC-AGI runtime is not ready yet.'
          )
        }
      }

      return bridge.generateGame({
        ...basePayload,
        ...arcAgiTransientPayload,
        reveals: [{participantId, salt}],
      })
    })
    if (!result || result.ok === false) return
    if (preparedRuntime) {
      setArcAgiRuntime(preparedRuntime)
    }
    setSession(result.session)
    setGame(result.game)
    resetPlayFromGame(result.game)
    scrollToGamePanel()
  }, [
    arcAgiRuntime,
    arcAgiGameId,
    arcAgiTransientPayload,
    basePayload,
    gameSource,
    participantId,
    resetPlayFromGame,
    run,
    salt,
    scrollToGamePanel,
  ])

  const handleSubmitTrace = React.useCallback(async () => {
    let recordedActions = parseActions(actions)
    if (actionLog.length) {
      recordedActions = actionLog
    } else if (humanAttempt && Array.isArray(humanAttempt.actions)) {
      recordedActions = humanAttempt.actions
    }
    const result = await run('Submit trace', () =>
      getIdenaArcBridge().submitTrace({
        ...basePayload,
        ...arcAgiTransientPayload,
        actions: recordedActions,
        feedback: {
          difficulty: 2,
          human_notes: 'MVP smoke trace',
        },
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
    setBundle(result.bundle)
    if (
      result.bundle &&
      result.bundle.replay &&
      result.bundle.replay.finalState
    ) {
      setPlayState(result.bundle.replay.finalState)
    }
    setAnnotationBundle(null)
    setTrainingDataset(null)
    setSignedArtifactResult(null)
    setSignedArtifactImportCid('')
    setTeacherStep('ai')
  }, [
    actionLog,
    actions,
    arcAgiTransientPayload,
    basePayload,
    humanAttempt,
    run,
  ])

  const handleEndHumanAttempt = React.useCallback(async () => {
    const result = await run('End human attempt', async () => {
      if (!game || !game.initialState) {
        throw new Error('Generate a game before ending an attempt.')
      }

      let savedActions = []
      if (actionLog.length) {
        savedActions = actionLog
      } else if (showExpertMode) {
        savedActions = parseActions(actions)
      }
      let preview = null
      let previewError = ''

      try {
        preview = await getIdenaArcBridge().previewTrace({
          ...basePayload,
          ...arcAgiTransientPayload,
          actions: savedActions,
        })
      } catch (error) {
        previewError = String(error && error.message ? error.message : error)
      }

      const finalState =
        (preview && preview.finalState) ||
        (preview && preview.replay && preview.replay.finalState) ||
        playState ||
        game.initialState
      const timeline = preview ? aiReplayTimelineFromPreview(preview, 0) : []
      let stopReason = 'human_stopped'
      if (finalState && finalState.completed) {
        stopReason = 'completed'
      } else if (previewError) {
        stopReason = `preview_error: ${previewError}`
      }
      const attempt = buildAttemptRecord({
        actor: 'human',
        actions: savedActions,
        timeline,
        preview,
        finalState,
        stopReason,
        startedAt: startedAt
          ? new Date(startedAt).toISOString()
          : new Date().toISOString(),
        endedAt: new Date().toISOString(),
        notes: previewError,
      })

      return {ok: true, attempt, preview}
    })

    if (!result || result.ok === false) return

    setHumanAttempt(result.attempt)
    setLocalAiAttempts([])
    setTeacherRounds([])
    setCompressedTeacherMemory(null)
    setProviderAnnotationDrafts([])
    setLocalAiReplay(null)
    setLocalAiReplayIndex(0)
    setLocalAiReplayPlaying(false)
    setVisualAnnotations([])
    setLocalAiAttemptActions('')
    setLocalAiGameplayExplanation('')
    setLocalAiGameplaySummary('')
    setLocalAiGameplayInvariants('')
    setLocalAiGameplayActionPolicy('')
    setLocalAiGameplayRejectedAlternatives('')
    setLocalAiActionRationales('')
    setLocalAiUncertaintyNotes('')
    setAiStopReason('')
    setMissingCapability('')
    setBundle(null)
    setArcScorecard(null)
    setAnnotationBundle(null)
    setTrainingDataset(null)
    setSignedArtifactResult(null)
    setSignedArtifactImportCid('')
    setPlayState(cloneJson(game.initialState))
    setPlaying(false)
    setArcPreviewPending(false)
    setStartedAt(null)
    setElapsedMs(0)
    setActionLog([])
    actionLogRef.current = []
    arcActionInFlightRef.current = false
    arcQueuedActionsRef.current = []
    lastArcInputRef.current = {action: '', at: 0}
    lastHeldKeyActionRef.current = {}
    setActions('')
    setAttemptPhase('human_saved')
    setTeacherStep('ai')
  }, [
    actionLog,
    actions,
    arcAgiTransientPayload,
    basePayload,
    game,
    playState,
    run,
    showExpertMode,
    startedAt,
  ])

  const handleSubmitArcScorecard = React.useCallback(async () => {
    const result = await run('Submit ARC scorecard', () =>
      getIdenaArcBridge().submitArcAgiScorecard({
        ...basePayload,
        ...arcAgiTransientPayload,
        actions: actionLog.length ? actionLog : parseActions(actions),
        scorecardTags: ['idena-arc', arcScorecardMode],
      })
    )

    if (!result || result.ok === false) return
    setSession(result.session)
    setArcScorecard(result.scorecard)
  }, [
    actionLog,
    actions,
    arcAgiTransientPayload,
    arcScorecardMode,
    basePayload,
    run,
  ])

  const handleDraftLocalAiAttempt = React.useCallback(
    async (memoryOverride = null) => {
      if (!arcLocalAiUsable) {
        toast({
          title: 'Use local AI first',
          description:
            'The teacher loop does not run probe or cloud attempts as the learner.',
          status: 'warning',
          duration: 4500,
          isClosable: true,
        })
        setTeacherStep('ai')
        return {ok: false, error: 'local_ai_not_selected'}
      }

      const result = await run('Draft AI attempt', async () => {
        if (!humanAttempt) {
          throw new Error('End the human attempt first so the AI starts clean.')
        }

        return runLocalAiAttemptWithPreview({
          game,
          basePayload,
          arcAgiTransientPayload,
          localAiSettings: settings.localAi,
          humanAttempt,
          teacherMemory: memoryOverride || compressedTeacherMemory,
          attemptIndex: localAiAttempts.length,
          onProgress: ({
            actions: nextActions,
            preview: progressPreview,
            timeline = [],
            observationSummary,
            stopReason,
            stepIndex,
          }) => {
            const progressTimeline = Array.isArray(timeline) ? timeline : []
            setLocalAiAttemptActions(buildActionsText(nextActions))
            setLocalAiReplay(
              progressPreview || progressTimeline.length
                ? {
                    preview: progressPreview,
                    prefixCount: 0,
                    replayActions: nextActions,
                    timeline: progressTimeline,
                    observationSummary,
                    status: stopReason || 'running',
                    stepIndex,
                    createdAt: new Date().toISOString(),
                  }
                : null
            )
            setLocalAiReplayIndex(0)
            setLocalAiReplayPlaying(
              progressTimeline.length > 1 && stopReason !== 'thinking'
            )
          },
        })
      })

      if (!result || result.ok === false) return result

      const {attempt, preview} = result
      const attemptedActionsText = buildActionsText(attempt.actions)
      const actionRationales = normalizeAttemptActions(attempt.actions)
        .map(
          (item, index) =>
            `${index + 1}. ${item.action}: ${item.reason || 'No reason'} -> ${
              item.observation || 'no observation'
            }`
        )
        .join('\n')
      const explanation = [
        `Local AI started from the original seed with ${attempt.actionCount} action(s).`,
        `Stop reason: ${attempt.stopReason}.`,
        attempt.completed
          ? 'It reached completion and should explain the decisive transition.'
          : 'It did not solve yet, so the teacher should correct the missing rule, looping pattern, or wrong action-effect hypothesis.',
        result.observationSummary || '',
      ]
        .filter(Boolean)
        .join('\n')
      const costUsage = estimateArcAiTokenUsage({
        game,
        playState: game && game.initialState,
        actionLog: humanAttempt ? humanAttempt.actions : [],
        attemptActions: attempt.actions,
        explanation,
      })
      const costEvent = buildArcAiCostEvent({
        settings,
        usage: costUsage,
        source: 'arc-ai-try',
      })

      setLocalAiAttempts((current) => current.concat(attempt))
      setLocalAiAttemptActions(attemptedActionsText)
      setLocalAiGameplayExplanation(explanation)
      setLocalAiGameplaySummary(
        attempt.completed
          ? 'The local AI solved the replay from the initial seed.'
          : 'The local AI explored independently and stopped before a solved state.'
      )
      setLocalAiGameplayInvariants(
        'Each action is judged by the next replay state hash, visible frame change, score, completion flag, and repeated-state count.'
      )
      setLocalAiGameplayActionPolicy(
        'Choose one action, observe the next state, avoid repeated state hashes, and ask the teacher when the action-effect relation is unclear.'
      )
      setLocalAiGameplayRejectedAlternatives(
        attempt.stopReason === 'repeated_state_cap'
          ? 'Repeating actions that returned the same state hash.'
          : ''
      )
      setLocalAiActionRationales(actionRationales)
      setLocalAiUncertaintyNotes(
        attempt.completed
          ? ''
          : 'The local AI needs teacher feedback before retrying this seed.'
      )
      setAiStopReason(attempt.stopReason)
      setMissingCapability(
        attempt.completed ? '' : 'Causal rule extraction from replay deltas.'
      )
      setLocalAiReplay(
        preview || (Array.isArray(result.timeline) && result.timeline.length)
          ? {
              preview,
              prefixCount: 0,
              replayActions: attempt.actions,
              timeline: Array.isArray(result.timeline) ? result.timeline : [],
              observationSummary: result.observationSummary,
              status: attempt.stopReason,
              stepIndex: Math.max(0, attempt.actionCount - 1),
              createdAt: new Date().toISOString(),
            }
          : null
      )
      setLocalAiReplayIndex(0)
      setLocalAiReplayPlaying(
        Array.isArray(result.timeline) && result.timeline.length > 1
      )
      setArcAiCostEvents((current) => current.concat(costEvent).slice(-100))
      setAttemptPhase('ai_attempted')
      setTeacherStep('compare')
      return result
    },
    [
      arcAgiTransientPayload,
      arcLocalAiUsable,
      basePayload,
      compressedTeacherMemory,
      game,
      humanAttempt,
      localAiAttempts,
      run,
      settings,
      toast,
    ]
  )

  const handleApplyTeacherFeedback = React.useCallback((item) => {
    if (!item) return

    setAiFailedAbstractions((current) =>
      appendAnnotationText(current, item.failedAbstraction)
    )
    setHumanVsAiGap((current) => appendAnnotationText(current, item.gap))
    setTeachingNotes((current) =>
      appendAnnotationText(current, item.correction)
    )
    setHumanReplayCorrections((current) =>
      appendAnnotationText(current, item.correction)
    )
    setSuggestedAdapterTarget((current) =>
      String(current || '').trim() ? current : item.adapterTarget || ''
    )
    setCapabilityTags((current) => {
      const tag = String(item.capabilityTag || '').trim()
      if (!tag) return current
      const tags = String(current || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

      return tags.includes(tag) ? tags.join(', ') : tags.concat(tag).join(', ')
    })
    setTeacherStep('coach')
  }, [])

  const handleReviewTeacherJourney = React.useCallback(() => {
    const aiAttempt = latestAttempt(localAiAttempts)
    if (!humanAttempt || !aiAttempt) return

    const comparisonText = buildLocalAiComparisonText({
      humanAttempt,
      localAiAttempt: aiAttempt,
      teacherFeedback: teachingNotes || humanReplayCorrections,
    })
    const round = {
      protocol: 'idena-arc-teacher-round-v1',
      roundIndex: teacherRounds.length,
      createdAt: new Date().toISOString(),
      humanAttemptHash: `renderer:${simpleHashHex(
        JSON.stringify(humanAttempt.actions || [])
      )}`,
      localAiAttemptHash: `renderer:${simpleHashHex(
        JSON.stringify(aiAttempt.actions || [])
      )}`,
      aiComparison: comparisonText,
      humanFeedback: '',
      quickMarks: [],
      compressedMemory: compressedTeacherMemory,
      retryAttemptIndex: null,
    }

    setHumanVsAiGap((current) => appendAnnotationText(current, comparisonText))
    setTeacherRounds((current) => current.concat(round))
    setAttemptPhase('review')
    setTeacherStep('coach')
  }, [
    compressedTeacherMemory,
    humanAttempt,
    humanReplayCorrections,
    localAiAttempts,
    teacherRounds.length,
    teachingNotes,
  ])

  const compressCurrentTeacherFeedback = React.useCallback(() => {
    const source = [
      humanVsAiGap,
      teachingNotes,
      humanReplayCorrections,
      confirmedRules,
      recognitionNotes,
    ]
      .filter((value) => String(value || '').trim())
      .join('\n')
    const memory = compressTeacherMemoryText(source)

    if (memory) {
      setCompressedTeacherMemory(memory)
      setTeacherRounds((current) => {
        if (!current.length) return current
        return current.map((round, index) =>
          index === current.length - 1
            ? {
                ...round,
                humanFeedback: source,
                compressedMemory: memory,
              }
            : round
        )
      })
    }

    return memory
  }, [
    confirmedRules,
    humanReplayCorrections,
    humanVsAiGap,
    recognitionNotes,
    teachingNotes,
  ])

  const handleRetryLocalAiAttempt = React.useCallback(async () => {
    const memory = compressCurrentTeacherFeedback()
    const result = await handleDraftLocalAiAttempt(memory)
    if (!result || result.ok === false) return
    setAttemptPhase('retry_ready')
    if (memory) {
      setTeacherRounds((current) => {
        if (!current.length) return current
        return current.map((round, index) =>
          index === current.length - 1
            ? {
                ...round,
                retryAttemptIndex: localAiAttempts.length,
              }
            : round
        )
      })
    }
  }, [
    compressCurrentTeacherFeedback,
    handleDraftLocalAiAttempt,
    localAiAttempts,
  ])

  const handleSaveAnnotation = React.useCallback(
    async (nextStatus) => {
      setAnnotationStatus(nextStatus)
      let finalMemory = compressedTeacherMemory
      if (nextStatus === 'final') {
        finalMemory =
          compressCurrentTeacherFeedback() || compressedTeacherMemory
        setAttemptPhase('finalized')
      }
      const result = await run(
        nextStatus === 'final'
          ? 'Finalize annotation'
          : 'Save annotation draft',
        async () => {
          let payload = {
            ...annotationPayload,
            status: nextStatus,
            compressedTeacherMemory: finalMemory,
            teacherJourney: {
              ...teacherJourney,
              phase: nextStatus === 'final' ? 'finalized' : attemptPhase,
              compressedTeacherMemory: finalMemory,
            },
          }

          if (!payload.traceBundle && humanAttempt) {
            const traceResult = await getIdenaArcBridge().submitTrace({
              ...basePayload,
              ...arcAgiTransientPayload,
              actions: humanAttempt.actions || [],
              feedback: {
                difficulty: 2,
                human_notes:
                  'Teacher-loop trace created from saved human attempt.',
              },
            })
            if (
              !traceResult ||
              traceResult.ok === false ||
              !traceResult.bundle
            ) {
              throw new Error(
                (traceResult && traceResult.error) ||
                  'Unable to create trace bundle for saved human attempt.'
              )
            }
            setSession(traceResult.session)
            setBundle(traceResult.bundle)
            payload = {
              ...payload,
              traceBundle: traceResult.bundle,
            }
          }

          return getIdenaArcBridge().saveAnnotationBundle(payload)
        }
      )

      if (!result || result.ok === false) return
      setAnnotationBundle(result)
      setSignedArtifactResult(null)
    },
    [
      annotationPayload,
      arcAgiTransientPayload,
      attemptPhase,
      basePayload,
      compressCurrentTeacherFeedback,
      compressedTeacherMemory,
      humanAttempt,
      run,
      teacherJourney,
    ]
  )

  const handleExportTrainingDataset = React.useCallback(async () => {
    const result = await run('Export training dataset', () =>
      getIdenaArcBridge().exportTrainingDataset({
        annotationBundle,
      })
    )

    if (!result || result.ok === false) return
    setTrainingDataset(result)
    setSignedArtifactResult(null)
  }, [annotationBundle, run])

  const handleExportSignedArtifact = React.useCallback(async () => {
    if (!signedArtifactSource) return

    const result = await run('Export signed artifact', () =>
      getP2pArtifactsBridge().exportSignedArtifact({
        artifactType: signedArtifactSource.artifactType,
        payload: signedArtifactSource.payload,
        releasePolicy: 'private-by-default-explicit-publish-only',
      })
    )

    if (!result || result.ok === false) return
    setSignedArtifactResult(result)
  }, [run, signedArtifactSource])

  const handlePublishSignedArtifact = React.useCallback(async () => {
    if (!signedArtifactResult || !signedArtifactResult.envelopePath) return

    const result = await run('Publish signed artifact', () =>
      getP2pArtifactsBridge().publishArtifactToIpfs({
        envelopePath: signedArtifactResult.envelopePath,
        pin: true,
      })
    )

    if (!result || result.ok === false) return
    setSignedArtifactResult(result)
    if (result.cid) {
      setSignedArtifactImportCid(result.cid)
    }
  }, [run, signedArtifactResult])

  const handleVerifyOrImportSignedArtifact = React.useCallback(async () => {
    const cid = String(signedArtifactImportCid || '').trim()

    if (!cid && (!signedArtifactResult || !signedArtifactResult.envelopePath)) {
      return
    }

    const result = await run(
      cid ? 'Import signed artifact' : 'Verify signed artifact',
      () =>
        cid
          ? getP2pArtifactsBridge().importArtifactByCid({cid})
          : getP2pArtifactsBridge().verifySignedArtifact({
              envelopePath: signedArtifactResult.envelopePath,
            })
    )

    if (result) {
      setSignedArtifactResult(result)
    }
  }, [run, signedArtifactImportCid, signedArtifactResult])

  let traceBadgeColor = 'gray'
  let traceBadgeLabel = 'No trace'
  if (bundle) {
    traceBadgeColor = 'green'
    traceBadgeLabel = 'Submitted'
  } else if (actionLog.length) {
    traceBadgeColor = 'blue'
    traceBadgeLabel = `${actionLog.length} action(s)`
  }
  const shouldShowTracePanel = Boolean(
    showExpertMode && (game || actionLog.length || bundle || arcScorecard)
  )
  const shouldShowTeacherPanel = Boolean(
    game || bundle || annotationBundle || trainingDataset
  )
  const shouldShowActionLabPanel = Boolean(
    showExpertMode &&
      (gameSource === 'arc-agi-public' ||
        game ||
        arcAgiGameCatalogLoaded ||
        arcAgiGamesStatus)
  )
  const shouldShowSignedArtifactPanel = Boolean(
    showExpertMode &&
      (signedArtifactSource || signedArtifactResult || signedArtifactImportCid)
  )
  const shouldShowAdvancedAnnotationFields = Boolean(
    showExpertMode && (bundle || annotationBundle || trainingDataset)
  )
  const shouldShowRuntimeDiagnostics = Boolean(showExpertMode && lastResult)
  const shouldShowAdvancedConnection = Boolean(
    showAdvancedConnection ||
      (showExpertMode && (session || identity)) ||
      (lastResult && lastResult.ok === false)
  )
  const handleToggleAdvancedConnection = React.useCallback(() => {
    const nextValue = !showAdvancedConnection
    setShowAdvancedConnection(nextValue)
    if (nextValue) {
      setShowExpertMode(true)
    }

    if (nextValue && typeof window !== 'undefined') {
      window.setTimeout(() => {
        document
          .getElementById('idena-arc-advanced-setup')
          ?.scrollIntoView({behavior: 'smooth', block: 'start'})
      }, 0)
    }
  }, [showAdvancedConnection])

  const handleUseLocalAiForArc = React.useCallback(() => {
    if (typeof settingsDispatch.updateLocalAiSettings === 'function') {
      settingsDispatch.updateLocalAiSettings({
        enabled: true,
        ...buildRecommendedLocalAiMacPreset(),
      })
    }
    if (typeof settingsDispatch.updateAiSolverSettings === 'function') {
      settingsDispatch.updateAiSolverSettings({
        enabled: true,
        provider: 'local-ai',
        model: RECOMMENDED_LOCAL_AI_OLLAMA_MODEL,
        localAiMemoryReference: DEFAULT_LOCAL_AI_MEMORY_REFERENCE,
      })
    }
    toast({
      title: 'Local AI selected',
      description:
        'Qwen/Ollama is selected. Cloud providers stay helpers only.',
      status: 'success',
      duration: 3500,
      isClosable: true,
    })
  }, [settingsDispatch, toast])

  const pageContent = (
    <Page px={[4, 6, 8, 10]} py={[4, 5, 6]}>
      <Flex w="full" align="flex-start" justify="space-between" gap={4}>
        <Box>
          <HStack spacing={3} mb={2}>
            <PageTitle mb={0}>IdenaArc</PageTitle>
            <Badge
              colorScheme={showExpertMode ? 'purple' : 'blue'}
              borderRadius="full"
              px={2}
            >
              {showExpertMode ? 'Expert' : 'Player'}
            </Badge>
          </HStack>
          <Text color="muted" maxW="760px">
            Play first. Then watch the AI try the same game and save one lesson.
          </Text>
        </Box>
        <HStack spacing={2}>
          <Tooltip
            label={showExpertMode ? 'Hide expert tools' : 'Expert tools'}
          >
            <IconButton
              aria-label={
                showExpertMode ? 'Hide expert tools' : 'Show expert tools'
              }
              icon={<SettingsIcon />}
              colorScheme={showExpertMode ? 'purple' : 'gray'}
              variant={showExpertMode ? 'solid' : 'outline'}
              onClick={() => setShowExpertMode((value) => !value)}
            />
          </Tooltip>
          <Tooltip label="Refresh status">
            <IconButton
              aria-label="Refresh status"
              icon={<RefreshIcon />}
              onClick={() => getIdenaArcBridge().status().then(applyStatus)}
            />
          </Tooltip>
        </HStack>
      </Flex>

      <ArcQuickStartPanel
        adapter={adapter}
        arcAgiGameId={arcAgiGameId}
        arcAgiGameOptions={arcAgiGameOptions}
        arcAgiRuntime={arcAgiRuntime}
        busy={busy}
        game={game}
        gameSource={gameSource}
        handleResolveIdentity={handleResolveIdentity}
        handleSetupAndGenerate={handleSetupAndGenerate}
        identity={identity}
        localAi={settings.localAi}
        onUseLocalAi={handleUseLocalAiForArc}
        onToggleAdvancedConnection={handleToggleAdvancedConnection}
        rpcUrl={rpcUrl}
        selectedArcAgiGame={selectedArcAgiGame}
        setArcAgiGameId={setArcAgiGameId}
        setGameSource={setGameSource}
        settings={settings}
        showAdvancedConnection={showAdvancedConnection}
        showExpertMode={showExpertMode}
      />

      {shouldShowAdvancedConnection ? (
        <FoldoutPanel
          id="idena-arc-advanced-setup"
          title="Advanced"
          description="RPC / proof / salt"
          defaultOpen
          badge={
            <Badge colorScheme={session ? 'green' : 'gray'}>
              {session ? 'Ready' : 'Optional'}
            </Badge>
          }
        >
          <SimpleGrid columns={[1, 1, 2]} spacing={6} w="full" mt={6}>
            <Stack
              spacing={5}
              bg="white"
              borderRadius="md"
              borderWidth="1px"
              p={5}
            >
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
                          setApiKey('')
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
                  Private keys stay out of the renderer. Use local node signing
                  for localhost RPC, or create an anchor payload for a classical
                  tx / idena.social-style contract proof.
                </FormHelperText>
              </Field>
              <Field label="RPC URL">
                <Input
                  value={rpcUrl}
                  isDisabled={adapter === 'rehearsal-devnet'}
                  onChange={(e) => {
                    rpcConnectionTouchedRef.current = true
                    setRpcUrl(e.target.value)
                  }}
                />
                <FormHelperText>
                  Defaults to the active node connection from Settings.
                </FormHelperText>
              </Field>
              <Field label="API key">
                <InputGroup>
                  <Input
                    value={apiKey}
                    type={showApiKey ? 'text' : 'password'}
                    isDisabled={adapter === 'rehearsal-devnet'}
                    pr="2.5rem"
                    onChange={(e) => {
                      rpcConnectionTouchedRef.current = true
                      setApiKey(e.target.value)
                    }}
                  />
                  <InputRightElement w="2.25rem" h="2rem" m="1">
                    <IconButton
                      size="xs"
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      icon={showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                      isDisabled={adapter === 'rehearsal-devnet'}
                      bg={showApiKey ? 'gray.300' : 'white'}
                      fontSize={18}
                      _hover={{
                        bg: showApiKey ? 'gray.300' : 'white',
                      }}
                      onClick={() => setShowApiKey((value) => !value)}
                    />
                  </InputRightElement>
                </InputGroup>
                {adapter === 'rehearsal-devnet' ? (
                  <FormHelperText>
                    Managed internally for the rehearsal devnet; it is not
                    exposed to the renderer.
                  </FormHelperText>
                ) : null}
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
              <JsonDetails label="Identity response" value={identity} />
            </Stack>

            <Stack
              spacing={5}
              bg="white"
              borderRadius="md"
              borderWidth="1px"
              p={5}
            >
              <Heading as="h2" fontSize="md" fontWeight={600}>
                Session
              </Heading>
              <Field label="Session ID">
                <Input
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                />
              </Field>
              <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                <Field label="Game source">
                  <Select
                    value={gameSource}
                    onChange={(e) => setGameSource(e.target.value)}
                  >
                    <option value="local-grid">IdenaArc local grid</option>
                    <option value="arc-agi-public">ARC-AGI public game</option>
                  </Select>
                  <FormHelperText>
                    ARC-AGI public games run through the optional official
                    toolkit; downloaded game sources are not vendored by
                    default.
                  </FormHelperText>
                </Field>
                <Field label="ARC-AGI game">
                  <Select
                    value={arcAgiGameId}
                    isDisabled={gameSource !== 'arc-agi-public'}
                    onChange={(e) => setArcAgiGameId(e.target.value)}
                  >
                    {arcAgiGameOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                  {selectedArcAgiGame ? (
                    <FormHelperText>
                      {selectedArcAgiGame.budgets.numberOfLevels
                        ? `${selectedArcAgiGame.budgets.numberOfLevels} level(s), human baseline ${selectedArcAgiGame.budgets.baselineTotalActions} action(s), default 5x budget ${selectedArcAgiGame.budgets.budget5xTotal}.`
                        : 'Baseline actions load after the ARC-AGI catalog is available.'}
                    </FormHelperText>
                  ) : null}
                </Field>
              </Grid>
              {gameSource === 'arc-agi-public' ? (
                <Box
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={
                    arcAgiRuntimeReady(arcAgiRuntime)
                      ? 'green.200'
                      : 'orange.200'
                  }
                  bg={
                    arcAgiRuntimeReady(arcAgiRuntime) ? 'green.50' : 'orange.50'
                  }
                  p={4}
                >
                  <Flex
                    align={['stretch', 'center']}
                    justify="space-between"
                    gap={3}
                    direction={['column', 'row']}
                  >
                    <Box>
                      <Text fontWeight={600}>
                        ARC-AGI runtime{' '}
                        {arcAgiRuntimeReady(arcAgiRuntime)
                          ? 'ready'
                          : 'not ready'}
                      </Text>
                      <Text color="muted" fontSize="sm">
                        {arcAgiRuntimeStatusText(arcAgiRuntime)}
                      </Text>
                    </Box>
                    <HStack alignSelf={['stretch', 'center']} spacing={2}>
                      <SecondaryButton
                        isLoading={busy === 'Prepare ARC-AGI runtime'}
                        onClick={handlePrepareArcAgiRuntime}
                      >
                        {arcAgiRuntimeReady(arcAgiRuntime)
                          ? 'Check runtime'
                          : 'Prepare runtime'}
                      </SecondaryButton>
                      {arcAgiRuntimeReady(arcAgiRuntime) ? (
                        <SecondaryButton
                          isLoading={busy === 'Load ARC-AGI games'}
                          onClick={handleLoadArcAgiGames}
                        >
                          Load games
                        </SecondaryButton>
                      ) : null}
                    </HStack>
                  </Flex>
                  {arcAgiGamesStatus && arcAgiGamesStatus.gameCount ? (
                    <Text color="muted" fontSize="xs" mt={3}>
                      {arcAgiGamesStatus.gameCount} public ARC-AGI game(s)
                      discovered.
                    </Text>
                  ) : null}
                  <Grid templateColumns={['1fr', '1fr 1fr']} gap={3} mt={4}>
                    <Field label="ARC API key">
                      <Input
                        type="password"
                        value={arcApiKey}
                        onChange={(e) => setArcApiKey(e.target.value)}
                        placeholder="Optional; uses env or anonymous access if empty"
                      />
                    </Field>
                    <Field label="ARC scorecard mode">
                      <Select
                        value={arcScorecardMode}
                        onChange={(e) => setArcScorecardMode(e.target.value)}
                      >
                        <option value="competition">
                          Competition official
                        </option>
                        <option value="online">Online scorecard</option>
                      </Select>
                    </Field>
                  </Grid>
                </Box>
              ) : null}
              <HStack spacing={3} flexWrap="wrap">
                <PrimaryButton
                  isLoading={busy === 'Setup + generate'}
                  onClick={handleSetupAndGenerate}
                >
                  Setup + generate
                </PrimaryButton>
                <SecondaryButton
                  isLoading={busy === 'Create session'}
                  onClick={handleCreateSession}
                >
                  Create
                </SecondaryButton>
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
              <JsonDetails label="Session JSON" value={session} />
            </Stack>
          </SimpleGrid>
        </FoldoutPanel>
      ) : null}

      <Grid
        templateColumns="minmax(0, 1fr)"
        gap={6}
        w="full"
        mt={6}
        alignItems="start"
      >
        <Stack
          id="idena-arc-game-panel"
          spacing={5}
          bg="white"
          borderRadius="md"
          borderWidth="1px"
          p={5}
          minW={0}
        >
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Game
          </Heading>
          {game || (sessionId && salt) || gameBadge ? (
            <HStack spacing={3} flexWrap="wrap">
              {game || (sessionId && salt) ? (
                <PrimaryButton
                  alignSelf="flex-start"
                  isLoading={busy === 'Generate game'}
                  onClick={handleGenerateGame}
                  isDisabled={!sessionId || !salt}
                >
                  New game
                </PrimaryButton>
              ) : null}
              {gameBadge ? (
                <Badge colorScheme={gameBadge.colorScheme}>
                  {gameBadge.label}
                </Badge>
              ) : null}
            </HStack>
          ) : null}
          <ArcGameBoard
            game={game}
            state={playState}
            playing={playing}
            previewPending={arcPreviewPending}
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
            <HStack spacing={3} flexWrap="wrap">
              <PrimaryButton isDisabled={playing} onClick={handleStartPlay}>
                Play
              </PrimaryButton>
              <PrimaryButton
                isLoading={busy === 'End human attempt'}
                onClick={handleEndHumanAttempt}
              >
                Done
              </PrimaryButton>
              <SecondaryButton
                isLoading={busy === 'Draft AI attempt'}
                isDisabled={!humanAttempt}
                onClick={() => handleDraftLocalAiAttempt()}
              >
                AI try
              </SecondaryButton>
              <SecondaryButton
                isDisabled={!humanAttempt || !latestLocalAiAttempt}
                onClick={handleReviewTeacherJourney}
              >
                Compare
              </SecondaryButton>
            </HStack>
          ) : null}
          {game && showExpertMode ? (
            <Box>
              <Text fontWeight={600} mb={2}>
                Game state
              </Text>
              <JsonDetails
                label="Game state JSON"
                value={{
                  initialStateHash: game.initialStateHash,
                  goalStateHash: game.goalStateHash,
                  gameInfo: game.gameInfo,
                  currentState: playState,
                  renderHints: game.renderHints,
                }}
              />
            </Box>
          ) : null}
        </Stack>

        {shouldShowTracePanel ? (
          <FoldoutPanel
            title="Replay trace and submission"
            description="The game records actions automatically. Open this only when you want to inspect, edit, or submit the trace."
            mt={0}
            badge={
              <Badge colorScheme={traceBadgeColor}>{traceBadgeLabel}</Badge>
            }
          >
            <Stack spacing={5} minW={0}>
              <Field label="Actions">
                <Textarea
                  minH="140px"
                  value={actions}
                  onChange={(e) => handleActionsChange(e.target.value)}
                />
                <FormHelperText>
                  Playing the board records this list automatically. You can
                  still edit it manually for replay-verification tests.
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
              <SecondaryButton
                alignSelf="flex-start"
                isLoading={busy === 'Submit ARC scorecard'}
                onClick={handleSubmitArcScorecard}
                isDisabled={!game || gameSource !== 'arc-agi-public'}
              >
                Submit ARC scorecard
              </SecondaryButton>
              {arcScorecard && arcScorecard.scorecardUrl ? (
                <Stack
                  spacing={2}
                  borderWidth="1px"
                  borderColor="blue.200"
                  bg="blue.010"
                  borderRadius="md"
                  p={3}
                >
                  <HStack spacing={2} flexWrap="wrap">
                    <Badge colorScheme="blue">ARC scorecard submitted</Badge>
                    <Text fontSize="sm" color="brandGray.500">
                      {arcScorecard.mode || arcScorecardMode}
                    </Text>
                  </HStack>
                  <Code
                    display="block"
                    whiteSpace="pre-wrap"
                    colorScheme="blue"
                    fontSize="xs"
                  >
                    {arcScorecard.scorecardUrl}
                  </Code>
                  <Text fontSize="xs" color="brandGray.500">
                    {arcScorecard.actionCount || 0} action(s) sent to ARC.
                  </Text>
                </Stack>
              ) : null}
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
                  {recordingSummary.agentLogFilename ? (
                    <Text fontSize="xs" color="brandGray.500">
                      {recordingSummary.agentLogLines} log.txt lines ·{' '}
                      {recordingSummary.agentLogFilename}
                    </Text>
                  ) : null}
                  {recordingSummary.lastArcAction ? (
                    <Text fontSize="xs" color="brandGray.500">
                      Last ARC action {recordingSummary.lastArcAction}
                    </Text>
                  ) : null}
                </Stack>
              ) : null}
              <JsonDetails label="Trace JSON" value={arcScorecard || bundle} />
            </Stack>
          </FoldoutPanel>
        ) : null}
      </Grid>

      {shouldShowTeacherPanel ? (
        <Box w="full" mt={6}>
          <TeacherLoopPanel
            teacherStep={teacherStep}
            setTeacherStep={setTeacherStep}
            attemptPhase={attemptPhase}
            game={game}
            selectedArcAgiGame={selectedArcAgiGame}
            catalogCount={arcAgiGameOptions.length}
            annotationStatus={annotationStatus}
            traceBundleReady={Boolean(bundle || humanAttempt)}
            actionTimeline={actionTimeline}
            humanAttempt={humanAttempt}
            localAiAttempts={localAiAttempts}
            teacherRounds={teacherRounds}
            compressedTeacherMemory={compressedTeacherMemory}
            localAiAttemptActions={localAiAttemptActions}
            setLocalAiAttemptActions={setLocalAiAttemptActions}
            localAiGameplayExplanation={localAiGameplayExplanation}
            setLocalAiGameplayExplanation={setLocalAiGameplayExplanation}
            humanReplayExplanation={humanReplayExplanation}
            setHumanReplayExplanation={setHumanReplayExplanation}
            visualAnnotations={visualAnnotations}
            setVisualAnnotations={setVisualAnnotations}
            confirmedRules={confirmedRules}
            setConfirmedRules={setConfirmedRules}
            humanVsAiGap={humanVsAiGap}
            setHumanVsAiGap={setHumanVsAiGap}
            teachingNotes={teachingNotes}
            setTeachingNotes={setTeachingNotes}
            humanReplayCorrections={humanReplayCorrections}
            setHumanReplayCorrections={setHumanReplayCorrections}
            capabilityTags={capabilityTags}
            handleEndHumanAttempt={handleEndHumanAttempt}
            handleDraftLocalAiAttempt={handleDraftLocalAiAttempt}
            handleReviewTeacherJourney={handleReviewTeacherJourney}
            handleRetryLocalAiAttempt={handleRetryLocalAiAttempt}
            handleApplyTeacherFeedback={handleApplyTeacherFeedback}
            handleSaveAnnotation={handleSaveAnnotation}
            handleExportTrainingDataset={handleExportTrainingDataset}
            annotationBundle={annotationBundle}
            trainingDataset={trainingDataset}
            localAiReplay={localAiReplay}
            localAiReplayIndex={localAiReplayIndex}
            setLocalAiReplayIndex={setLocalAiReplayIndex}
            localAiReplayPlaying={localAiReplayPlaying}
            setLocalAiReplayPlaying={setLocalAiReplayPlaying}
            arcAiCostEstimate={currentArcAiCostEstimate}
            arcAiCostSummary={arcAiCostSummary}
            lastArcAiCostEvent={lastArcAiCostEvent}
            onResetArcAiCost={handleResetArcAiCost}
            localAiEnabled={arcLocalAiEnabled}
            localAiSelected={arcLocalAiSelected}
            onUseLocalAi={handleUseLocalAiForArc}
            showExpertMode={showExpertMode}
            busy={busy}
          />
        </Box>
      ) : null}

      {shouldShowActionLabPanel ? (
        <ActionLabPanel
          game={game}
          selectedArcAgiGame={selectedArcAgiGame}
          actionTimeline={actionTimeline}
          localAiAttempts={localAiAttempts}
        />
      ) : null}

      {shouldShowSignedArtifactPanel ? (
        <FoldoutPanel
          title="Signed artifact"
          description="Manual sharing only. Exports stay local unless you explicitly publish the signed envelope to IPFS."
          badge={
            <Badge colorScheme={signedArtifactSource ? 'blue' : 'gray'}>
              {signedArtifactSource
                ? signedArtifactSource.label
                : 'Nothing ready'}
            </Badge>
          }
        >
          <Stack spacing={4}>
            <HStack spacing={2} flexWrap="wrap">
              <SecondaryButton
                isLoading={busy === 'Export signed artifact'}
                isDisabled={!signedArtifactSource}
                onClick={handleExportSignedArtifact}
              >
                Export signed artifact
              </SecondaryButton>
              <SecondaryButton
                isLoading={busy === 'Publish signed artifact'}
                isDisabled={
                  !signedArtifactResult || !signedArtifactResult.envelopePath
                }
                onClick={handlePublishSignedArtifact}
              >
                Publish to IPFS
              </SecondaryButton>
            </HStack>
            <Grid
              templateColumns={['1fr', null, 'minmax(0, 1fr) auto']}
              gap={3}
            >
              <Input
                value={signedArtifactImportCid}
                onChange={(event) =>
                  setSignedArtifactImportCid(event.target.value)
                }
                placeholder="Optional CID to verify/import manually"
              />
              <SecondaryButton
                isLoading={
                  busy === 'Verify signed artifact' ||
                  busy === 'Import signed artifact'
                }
                isDisabled={
                  !String(signedArtifactImportCid || '').trim() &&
                  (!signedArtifactResult || !signedArtifactResult.envelopePath)
                }
                onClick={handleVerifyOrImportSignedArtifact}
              >
                Verify/import artifact
              </SecondaryButton>
            </Grid>
            <SignedArtifactSummary result={signedArtifactResult} />
          </Stack>
        </FoldoutPanel>
      ) : null}

      {shouldShowAdvancedAnnotationFields ? (
        <Box
          as="details"
          w="full"
          mt={6}
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          bg="white"
        >
          <Flex
            as="summary"
            cursor="pointer"
            align="center"
            justify="space-between"
            gap={4}
            px={5}
            py={4}
          >
            <Box>
              <Heading as="h2" fontSize="md" fontWeight={600}>
                Advanced annotation fields
              </Heading>
              <Text color="muted" fontSize="sm" mt={1}>
                Raw local fields for schema review and adapter training exports.
              </Text>
            </Box>
            <Badge
              colorScheme={annotationStatus === 'final' ? 'green' : 'gray'}
            >
              {annotationStatus}
            </Badge>
          </Flex>
          <Box px={5} pb={5}>
            <SimpleGrid columns={[1, 1, 2]} spacing={6} w="full">
              <Stack
                spacing={5}
                bg="white"
                borderRadius="md"
                borderWidth="1px"
                p={5}
              >
                <Flex justify="space-between" gap={3} flexWrap="wrap">
                  <Box>
                    <Heading as="h2" fontSize="md" fontWeight={600}>
                      Hidden-rule annotation
                    </Heading>
                    <Text color="muted" fontSize="sm" mt={1}>
                      Local/private by default. Save after replay verification;
                      upload is never automatic.
                    </Text>
                  </Box>
                  <Badge
                    colorScheme={
                      annotationStatus === 'final' ? 'green' : 'gray'
                    }
                  >
                    {annotationStatus}
                  </Badge>
                </Flex>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Confirmed hidden rules">
                    <Textarea
                      minH="110px"
                      value={confirmedRules}
                      onChange={(e) => setConfirmedRules(e.target.value)}
                      placeholder="One discovered rule per line"
                    />
                  </Field>
                  <Field label="Rule hypotheses">
                    <Textarea
                      minH="110px"
                      value={ruleHypotheses}
                      onChange={(e) => setRuleHypotheses(e.target.value)}
                      placeholder="Hypotheses tested while exploring"
                    />
                  </Field>
                  <Field label="Recognition action index">
                    <Input
                      value={recognitionActionIndex}
                      onChange={(e) =>
                        setRecognitionActionIndex(e.target.value)
                      }
                      placeholder="e.g. 4"
                    />
                  </Field>
                  <Field label="Recognition notes">
                    <Input
                      value={recognitionNotes}
                      onChange={(e) => setRecognitionNotes(e.target.value)}
                      placeholder="What made the rule click?"
                    />
                  </Field>
                </Grid>
                <Field label="Evidence events">
                  <Textarea
                    minH="90px"
                    value={evidenceEvents}
                    onChange={(e) => setEvidenceEvents(e.target.value)}
                    placeholder="Observation/action moments that supported the rule"
                  />
                </Field>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Wrong hypotheses">
                    <Textarea
                      minH="90px"
                      value={wrongHypotheses}
                      onChange={(e) => setWrongHypotheses(e.target.value)}
                    />
                  </Field>
                  <Field label="Strategy change">
                    <Textarea
                      minH="90px"
                      value={strategyChange}
                      onChange={(e) => setStrategyChange(e.target.value)}
                    />
                  </Field>
                </Grid>
                <Field label="Teaching notes">
                  <Textarea
                    minH="90px"
                    value={teachingNotes}
                    onChange={(e) => setTeachingNotes(e.target.value)}
                    placeholder="Compressed explanation useful for adapter training"
                  />
                </Field>
                <Field label="Human replay explanation">
                  <Textarea
                    minH="120px"
                    value={humanReplayExplanation}
                    onChange={(e) => setHumanReplayExplanation(e.target.value)}
                    placeholder="Plain-text replay explanation to compress later"
                  />
                </Field>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Replay summary">
                    <Textarea
                      minH="80px"
                      value={humanReplaySummary}
                      onChange={(e) => setHumanReplaySummary(e.target.value)}
                      placeholder="High-level rule summary"
                    />
                  </Field>
                  <Field label="Replay invariants">
                    <Textarea
                      minH="80px"
                      value={humanReplayInvariants}
                      onChange={(e) => setHumanReplayInvariants(e.target.value)}
                      placeholder="One preserved fact per line"
                    />
                  </Field>
                  <Field label="Replay action policy">
                    <Textarea
                      minH="90px"
                      value={humanReplayActionPolicy}
                      onChange={(e) =>
                        setHumanReplayActionPolicy(e.target.value)
                      }
                      placeholder="How the replay rule chooses actions"
                    />
                  </Field>
                  <Field label="Replay rejected alternatives">
                    <Textarea
                      minH="90px"
                      value={humanReplayRejectedAlternatives}
                      onChange={(e) =>
                        setHumanReplayRejectedAlternatives(e.target.value)
                      }
                      placeholder="Hypotheses ruled out during replay"
                    />
                  </Field>
                </Grid>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Replay key moments">
                    <Textarea
                      minH="90px"
                      value={humanReplayKeyMoments}
                      onChange={(e) => setHumanReplayKeyMoments(e.target.value)}
                    />
                  </Field>
                  <Field label="Replay corrections">
                    <Textarea
                      minH="90px"
                      value={humanReplayCorrections}
                      onChange={(e) =>
                        setHumanReplayCorrections(e.target.value)
                      }
                    />
                  </Field>
                </Grid>
              </Stack>

              <Stack
                spacing={5}
                bg="white"
                borderRadius="md"
                borderWidth="1px"
                p={5}
              >
                <Heading as="h2" fontSize="md" fontWeight={600}>
                  AI comparison + dataset stub
                </Heading>
                <Field label="Local AI attempted actions">
                  <Textarea
                    minH="90px"
                    value={localAiAttemptActions}
                    onChange={(e) => setLocalAiAttemptActions(e.target.value)}
                    placeholder={'ACTION4\nACTION2\nACTION6 31 31'}
                  />
                </Field>
                <Field label="Local AI gameplay explanation">
                  <Textarea
                    minH="120px"
                    value={localAiGameplayExplanation}
                    onChange={(e) =>
                      setLocalAiGameplayExplanation(e.target.value)
                    }
                    placeholder="Plain-text gameplay explanation to compress later"
                  />
                </Field>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Local AI summary">
                    <Textarea
                      minH="80px"
                      value={localAiGameplaySummary}
                      onChange={(e) =>
                        setLocalAiGameplaySummary(e.target.value)
                      }
                      placeholder="High-level policy summary"
                    />
                  </Field>
                  <Field label="Local AI invariants">
                    <Textarea
                      minH="80px"
                      value={localAiGameplayInvariants}
                      onChange={(e) =>
                        setLocalAiGameplayInvariants(e.target.value)
                      }
                      placeholder="One preserved fact per line"
                    />
                  </Field>
                  <Field label="Local AI action policy">
                    <Textarea
                      minH="90px"
                      value={localAiGameplayActionPolicy}
                      onChange={(e) =>
                        setLocalAiGameplayActionPolicy(e.target.value)
                      }
                      placeholder="How the local AI chose actions"
                    />
                  </Field>
                  <Field label="Local AI rejected alternatives">
                    <Textarea
                      minH="90px"
                      value={localAiGameplayRejectedAlternatives}
                      onChange={(e) =>
                        setLocalAiGameplayRejectedAlternatives(e.target.value)
                      }
                      placeholder="Hypotheses the AI abandoned"
                    />
                  </Field>
                </Grid>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Local AI action rationales">
                    <Textarea
                      minH="90px"
                      value={localAiActionRationales}
                      onChange={(e) =>
                        setLocalAiActionRationales(e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Local AI uncertainty notes">
                    <Textarea
                      minH="90px"
                      value={localAiUncertaintyNotes}
                      onChange={(e) =>
                        setLocalAiUncertaintyNotes(e.target.value)
                      }
                    />
                  </Field>
                </Grid>
                <Field label="AI failed abstractions">
                  <Textarea
                    minH="90px"
                    value={aiFailedAbstractions}
                    onChange={(e) => setAiFailedAbstractions(e.target.value)}
                    placeholder="Where the local AI looped, overfit, or gave up"
                  />
                </Field>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="AI stop reason">
                    <Textarea
                      minH="80px"
                      value={aiStopReason}
                      onChange={(e) => setAiStopReason(e.target.value)}
                    />
                  </Field>
                  <Field label="Missing capability">
                    <Textarea
                      minH="80px"
                      value={missingCapability}
                      onChange={(e) => setMissingCapability(e.target.value)}
                    />
                  </Field>
                </Grid>
                <Field label="Human vs AI gap">
                  <Textarea
                    minH="80px"
                    value={humanVsAiGap}
                    onChange={(e) => setHumanVsAiGap(e.target.value)}
                  />
                </Field>
                <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                  <Field label="Capability tags">
                    <Input
                      value={capabilityTags}
                      onChange={(e) => setCapabilityTags(e.target.value)}
                    />
                  </Field>
                  <Field label="Adapter target">
                    <Input
                      value={suggestedAdapterTarget}
                      onChange={(e) =>
                        setSuggestedAdapterTarget(e.target.value)
                      }
                      placeholder="e.g. delayed-effect tracker"
                    />
                  </Field>
                </Grid>
                {actionTimeline.length ? (
                  <Box>
                    <Text fontWeight={600} mb={2}>
                      Replay timeline
                    </Text>
                    <Stack spacing={1} maxH="160px" overflowY="auto">
                      {actionTimeline.map((item) => (
                        <HStack
                          key={`${item.index}:${item.action}`}
                          fontSize="xs"
                        >
                          <Badge>{item.index}</Badge>
                          <Text minW="150px">
                            {actionButtonShortLabel(
                              item.arcAction || item.action
                            )}
                          </Text>
                          <Text color="muted">
                            {typeof item.score === 'number'
                              ? `score ${item.score}`
                              : ''}
                          </Text>
                        </HStack>
                      ))}
                    </Stack>
                  </Box>
                ) : null}
                <JsonDetails
                  label="Annotation JSON"
                  value={trainingDataset || annotationBundle}
                />
              </Stack>
            </SimpleGrid>
          </Box>
        </Box>
      ) : null}

      {shouldShowRuntimeDiagnostics ? (
        <FoldoutPanel
          title="Runtime diagnostics"
          description="Raw bridge responses for debugging when something fails."
          badge={<Badge colorScheme="blue">Debug</Badge>}
        >
          <JsonDetails label="Runtime JSON" value={lastResult} />
        </FoldoutPanel>
      ) : null}
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
