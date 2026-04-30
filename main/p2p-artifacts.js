const path = require('path')
const fs = require('fs-extra')

const appDataPath = require('./app-data-path')
const {
  canonicalJson,
  hashJsonPrefixed,
  idenaSignatureHashPrefixed,
  normalizeAddress,
  recoverIdenaSignatureAddress,
  sha256Hex,
  sha256Prefixed,
  verifyIdenaSignature,
} = require('./idena-arc/crypto')

const ARTIFACT_ENVELOPE_PROTOCOL = 'idena-p2p-artifact-envelope-v1'
const ARTIFACT_ENVELOPE_VERSION = 1
const ARTIFACT_INDEX_VERSION = 1
const ARTIFACT_SIGNATURE_TYPE = 'idena-node-dna-sign-v1'
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
const MAX_ENVELOPE_BYTES = 12 * 1024 * 1024
const DEFAULT_RELEASE_POLICY = 'private-by-default-explicit-publish-only'
const PLACEHOLDER_SIGNATURE_TYPES = new Set([
  'placeholder',
  'placeholder_sha256',
  'draft_sha256',
])
const ARTIFACT_TYPES = new Set([
  'arc-trace-bundle',
  'arc-annotation-bundle',
  'arc-training-dataset',
  'local-ai-update-bundle',
  'round-manifest',
])
const PRIVATE_FIELD_KEYS = new Set([
  'nodeKey',
  'nodeKeyHex',
  'private_key',
  'privateKey',
  'privateKeyHex',
  'signer_private_key',
  'signerPrivateKey',
  'signerPrivateKeyHex',
  'privateText',
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeId(value, fallback = 'artifact') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function safeFileName(value, fallback = 'artifact.bin') {
  const normalized = path
    .basename(String(value || '').trim())
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function normalizeArtifactType(value) {
  const artifactType = String(value || '').trim()

  if (!ARTIFACT_TYPES.has(artifactType)) {
    throw new Error('Unsupported signed artifact type')
  }

  return artifactType
}

function normalizeCid(value) {
  const cid = String(value || '').trim()

  if (!cid || cid.length > 256) {
    throw new Error('Artifact CID is required')
  }

  return cid
}

function containsPrivateField(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== 'object') {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsPrivateField(item, depth + 1))
  }

  return Object.entries(value).some(([key, item]) => {
    if (PRIVATE_FIELD_KEYS.has(key)) {
      return true
    }

    return containsPrivateField(item, depth + 1)
  })
}

function containsPlaceholderSignature(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== 'object') {
    return false
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsPlaceholderSignature(item, depth + 1))
  }

  const {signature} = value

  if (
    isPlainObject(signature) &&
    PLACEHOLDER_SIGNATURE_TYPES.has(String(signature.type || '').trim())
  ) {
    return true
  }

  return Object.values(value).some((item) =>
    containsPlaceholderSignature(item, depth + 1)
  )
}

function payloadHash(payload) {
  return hashJsonPrefixed(payload)
}

function compactHash(value) {
  return sha256Prefixed(canonicalJson(value)).replace(/^sha256:/, '')
}

function assertPathInsideRoots(filePath, roots, reason) {
  const resolvedPath = path.resolve(String(filePath || '').trim())
  const allowed = roots
    .map((root) => path.resolve(root))
    .some((root) => {
      const prefix = `${root}${path.sep}`

      return resolvedPath === root || resolvedPath.startsWith(prefix)
    })

  if (!allowed) {
    throw new Error(reason)
  }

  return resolvedPath
}

function normalizeSha256Hex(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
  return text.startsWith('sha256:') ? text.slice(7) : text
}

function validateAttachmentHash(attachment) {
  if (!isPlainObject(attachment)) {
    return {ok: false, reason: 'attachment_invalid'}
  }

  if (attachment.encoding !== 'base64') {
    return {ok: false, reason: 'attachment_encoding_unsupported'}
  }

  const expectedSha256 = normalizeSha256Hex(attachment.sha256)
  const contentBase64 = String(attachment.contentBase64 || '')
  const declaredSize = Number(attachment.sizeBytes)

  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || !contentBase64) {
    return {ok: false, reason: 'attachment_invalid'}
  }

  if (
    !Number.isInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > MAX_ATTACHMENT_BYTES
  ) {
    return {ok: false, reason: 'attachment_size_invalid'}
  }

  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) ||
    contentBase64.length % 4 !== 0
  ) {
    return {ok: false, reason: 'attachment_base64_invalid'}
  }

  const buffer = Buffer.from(contentBase64, 'base64')

  if (buffer.toString('base64') !== contentBase64) {
    return {ok: false, reason: 'attachment_base64_invalid'}
  }

  if (declaredSize !== buffer.length) {
    return {ok: false, reason: 'attachment_size_mismatch'}
  }

  if (sha256Hex(buffer) !== expectedSha256) {
    return {ok: false, reason: 'attachment_hash_mismatch'}
  }

  return {ok: true, buffer}
}

function normalizeAttachments(value) {
  return Array.isArray(value) ? value : []
}

function findLocalAiAdapterAttachment(envelope) {
  const attachments = normalizeAttachments(envelope && envelope.attachments)

  return (
    attachments.find(
      (attachment) => attachment.role === 'local-ai-adapter-artifact'
    ) || null
  )
}

function hasLocalAiConcreteAdapterPayload(bundle) {
  const payload = bundle && bundle.payload
  return (
    isPlainObject(payload) &&
    String(payload.deltaType || '').trim() === 'lora_adapter'
  )
}

function collectSourceHashes(artifactType, payload, supplied = {}) {
  const hashes = {...(isPlainObject(supplied) ? supplied : {})}

  function add(key, value) {
    const text = String(value || '').trim()

    if (text) {
      hashes[key] = text
    }
  }

  add('payloadHash', payloadHash(payload))

  if (artifactType === 'arc-trace-bundle') {
    add('traceHash', payload.traceHash)
    add('recordingHash', payload.recordingHash)
    add('recordingJsonlHash', payload.recordingJsonlHash)
    add('agentLogHash', payload.agentLogHash)
    add('finalSeedHash', payload.finalSeedHash)
    add('generatorHash', payload.generatorHash)
    add('resultHash', payload.resultHash)
  }

  if (artifactType === 'arc-annotation-bundle') {
    add('annotationHash', payload.annotationHash)
    add('traceHash', payload.traceHash)
    add('recordingHash', payload.recordingHash)
    add('agentLogHash', payload.agentLogHash)
    if (payload.annotation) {
      add('annotationTraceHash', payload.annotation.traceHash)
      add('annotationRecordingHash', payload.annotation.recordingHash)
      add('annotationAgentLogHash', payload.annotation.agentLogHash)
    }
  }

  if (artifactType === 'arc-training-dataset') {
    add('datasetHash', payload.datasetHash)
    add('exportId', payload.exportId)
    if (Array.isArray(payload.examples)) {
      const annotationHashes = payload.examples
        .map((example) => example && example.annotationHash)
        .filter(Boolean)
      const traceHashes = payload.examples
        .map((example) => example && example.traceHash)
        .filter(Boolean)

      if (annotationHashes.length) {
        add('annotationHashes', hashJsonPrefixed(annotationHashes.sort()))
      }
      if (traceHashes.length) {
        add('traceHashes', hashJsonPrefixed(traceHashes.sort()))
      }
    }
  }

  if (artifactType === 'local-ai-update-bundle') {
    add('bundleHash', payloadHash(payload))
    if (payload.payload) {
      add('adapterSha256', payload.payload.adapterSha256)
      add('baseModelHash', payload.payload.baseModelHash)
      add('trainingConfigHash', payload.payload.trainingConfigHash)
      if (payload.payload.manifest) {
        add('manifestSha256', payload.payload.manifest.sha256)
      }
    }
  }

  if (artifactType === 'round-manifest') {
    add('roundHash', payload.roundHash)
    add('manifestHash', payload.manifestHash)
  }

  return Object.keys(hashes)
    .sort()
    .reduce((result, key) => {
      result[key] = hashes[key]
      return result
    }, {})
}

function envelopeForSigning(envelope) {
  const {signature, cid, stored, ...signable} = envelope
  return signable
}

function buildArtifactSignatureMessage(envelope) {
  return `${ARTIFACT_ENVELOPE_PROTOCOL}:${hashJsonPrefixed(
    envelopeForSigning(envelope)
  )}`
}

function buildUnsignedEnvelope({
  artifactType,
  payload,
  attachments = [],
  producer,
  releasePolicy,
  sourceHashes,
  createdAt,
}) {
  const normalizedArtifactType = normalizeArtifactType(artifactType)
  const normalizedProducer = normalizeAddress(producer.address)
  const nextPayloadHash = payloadHash(payload)

  return {
    protocol: ARTIFACT_ENVELOPE_PROTOCOL,
    version: ARTIFACT_ENVELOPE_VERSION,
    artifactType: normalizedArtifactType,
    createdAt: createdAt || new Date().toISOString(),
    producerAddress: normalizedProducer,
    producerIdentityStatus: producer.identityStatus || null,
    payloadHash: nextPayloadHash,
    sourceHashes: collectSourceHashes(
      normalizedArtifactType,
      payload,
      sourceHashes
    ),
    attachments: normalizeAttachments(attachments),
    releasePolicy: String(releasePolicy || '').trim() || DEFAULT_RELEASE_POLICY,
    privateByDefault: true,
    payload,
    signature: null,
    cid: null,
  }
}

async function signEnvelope(envelope, signPayload) {
  if (typeof signPayload !== 'function') {
    throw new Error('Idena node signing is unavailable')
  }

  const message = buildArtifactSignatureMessage(envelope)
  const signatureValue = String(await signPayload(message)).trim()

  if (!signatureValue) {
    throw new Error('Idena node returned an empty artifact signature')
  }

  const recoveredAddress = normalizeAddress(
    recoverIdenaSignatureAddress(message, signatureValue, 'prefix')
  )
  const producerAddress = normalizeAddress(envelope.producerAddress)

  if (recoveredAddress !== producerAddress) {
    throw new Error('Artifact signer does not match producer address')
  }

  return {
    type: ARTIFACT_SIGNATURE_TYPE,
    format: 'prefix',
    signed: true,
    address: recoveredAddress,
    message,
    messageHash: idenaSignatureHashPrefixed(message, 'prefix'),
    value: signatureValue,
  }
}

function verifyEnvelopeSignature(envelope) {
  const signature =
    envelope && isPlainObject(envelope.signature) ? envelope.signature : null

  if (!signature) {
    return {ok: false, reason: 'signature_missing'}
  }

  if (
    PLACEHOLDER_SIGNATURE_TYPES.has(String(signature.type || '').trim()) ||
    signature.signed === false
  ) {
    return {ok: false, reason: 'placeholder_signature_rejected'}
  }

  if (signature.type !== ARTIFACT_SIGNATURE_TYPE) {
    return {ok: false, reason: 'signature_type_unsupported'}
  }

  if (signature.format !== 'prefix') {
    return {ok: false, reason: 'signature_format_unsupported'}
  }

  const expectedMessage = buildArtifactSignatureMessage(envelope)
  const expectedHash = idenaSignatureHashPrefixed(expectedMessage, 'prefix')

  if (
    signature.message !== expectedMessage ||
    signature.messageHash !== expectedHash
  ) {
    return {ok: false, reason: 'signature_message_mismatch'}
  }

  let producerAddress
  let signatureAddress

  try {
    producerAddress = normalizeAddress(envelope.producerAddress)
    signatureAddress = normalizeAddress(signature.address)
  } catch {
    return {ok: false, reason: 'signature_address_invalid'}
  }

  if (producerAddress !== signatureAddress) {
    return {ok: false, reason: 'signature_signer_mismatch'}
  }

  const signatureValid = verifyIdenaSignature(
    expectedMessage,
    signature.value,
    producerAddress,
    'prefix'
  )

  if (!signatureValid) {
    return {ok: false, reason: 'signature_invalid'}
  }

  return {
    ok: true,
    signed: true,
    signerAddress: producerAddress,
    signatureType: signature.type,
    messageHash: signature.messageHash,
  }
}

function validateEnvelopeShape(envelope) {
  if (!isPlainObject(envelope)) {
    return {ok: false, reason: 'envelope_invalid'}
  }

  if (estimateJsonBytes(envelope) > MAX_ENVELOPE_BYTES) {
    return {ok: false, reason: 'artifact_envelope_too_large'}
  }

  if (envelope.protocol !== ARTIFACT_ENVELOPE_PROTOCOL) {
    return {ok: false, reason: 'envelope_protocol_invalid'}
  }

  if (envelope.version !== ARTIFACT_ENVELOPE_VERSION) {
    return {ok: false, reason: 'envelope_version_invalid'}
  }

  try {
    normalizeArtifactType(envelope.artifactType)
  } catch {
    return {ok: false, reason: 'artifact_type_invalid'}
  }

  if (!isPlainObject(envelope.payload)) {
    return {ok: false, reason: 'payload_invalid'}
  }

  if (containsPrivateField(envelope.payload)) {
    return {ok: false, reason: 'private_fields_rejected'}
  }

  const attachments = normalizeAttachments(envelope.attachments)
  for (const attachment of attachments) {
    const attachmentCheck = validateAttachmentHash(attachment)

    if (!attachmentCheck.ok) {
      return attachmentCheck
    }
  }

  try {
    normalizeAddress(envelope.producerAddress)
  } catch {
    return {ok: false, reason: 'producer_address_invalid'}
  }

  const expectedPayloadHash = payloadHash(envelope.payload)

  if (envelope.payloadHash !== expectedPayloadHash) {
    return {
      ok: false,
      reason: 'payload_hash_mismatch',
      expectedPayloadHash,
    }
  }

  return {
    ok: true,
    payloadHash: expectedPayloadHash,
  }
}

function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function assertJsonTextSize(text) {
  if (Buffer.byteLength(String(text || ''), 'utf8') > MAX_ENVELOPE_BYTES) {
    throw new Error('artifact_envelope_too_large')
  }
}

function parseIpfsPayload(result) {
  if (typeof result === 'string') {
    assertJsonTextSize(result)
    return JSON.parse(result)
  }

  if (!isPlainObject(result)) {
    throw new Error('IPFS artifact payload is empty')
  }

  if (typeof result.content === 'string') {
    assertJsonTextSize(result.content)
    return JSON.parse(result.content)
  }

  if (typeof result.data === 'string') {
    assertJsonTextSize(result.data)
    return JSON.parse(result.data)
  }

  if (typeof result.value === 'string') {
    assertJsonTextSize(result.value)
    return JSON.parse(result.value)
  }

  if (typeof result.Data === 'string') {
    assertJsonTextSize(result.Data)
    return JSON.parse(result.Data)
  }

  if (estimateJsonBytes(result) > MAX_ENVELOPE_BYTES) {
    throw new Error('artifact_envelope_too_large')
  }

  return result
}

function extractCid(result) {
  if (typeof result === 'string') {
    return result
  }

  if (!isPlainObject(result)) {
    return ''
  }

  return String(result.cid || result.Hash || result.hash || result.Cid || '')
}

function envelopeIndexEntry(envelope, extra = {}) {
  return {
    artifactType: envelope.artifactType,
    payloadHash: envelope.payloadHash,
    producerAddress: envelope.producerAddress,
    signature: envelope.signature
      ? {
          type: envelope.signature.type,
          address: envelope.signature.address,
          messageHash: envelope.signature.messageHash,
          value: envelope.signature.value,
        }
      : null,
    cid: envelope.cid || null,
    envelopePath: extra.envelopePath || null,
    direction: extra.direction || 'local',
    createdAt: envelope.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

function mergeIndexEntry(index, entry) {
  const artifacts = Array.isArray(index.artifacts) ? index.artifacts : []
  const key = entry.cid
    ? `cid:${entry.cid}`
    : `payload:${entry.artifactType}:${entry.payloadHash}:${entry.producerAddress}`
  const nextArtifacts = artifacts.filter((item) => {
    const itemKey = item.cid
      ? `cid:${item.cid}`
      : `payload:${item.artifactType}:${item.payloadHash}:${item.producerAddress}`

    return itemKey !== key
  })

  nextArtifacts.push(entry)

  return {
    version: ARTIFACT_INDEX_VERSION,
    artifacts: nextArtifacts.sort((left, right) =>
      String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
    ),
  }
}

function createP2pArtifactManager({
  logger,
  baseDir,
  allowedBundleRoots,
  getIdentity,
  signPayload,
  callNodeRpc,
  consumeVerifiedArtifact,
  verifyArcTraceBundle,
  verifyArcAnnotationBundle,
  verifyArcTrainingDataset,
} = {}) {
  function resolveBaseDir() {
    return baseDir || path.join(appDataPath('userData'), 'p2p-artifacts')
  }

  function envelopeDir() {
    return path.join(resolveBaseDir(), 'envelopes')
  }

  function localAiBundleRoots() {
    if (Array.isArray(allowedBundleRoots) && allowedBundleRoots.length) {
      return allowedBundleRoots
    }

    const userDataPath = appDataPath('userData')

    return [
      path.join(userDataPath, 'local-ai', 'bundles'),
      path.join(userDataPath, 'local-ai', 'incoming'),
    ]
  }

  function indexPath() {
    return path.join(resolveBaseDir(), 'index.json')
  }

  async function readIndex() {
    return fs.readJson(indexPath()).catch(() => ({
      version: ARTIFACT_INDEX_VERSION,
      artifacts: [],
    }))
  }

  async function writeIndex(index) {
    await fs.ensureDir(resolveBaseDir())
    await fs.writeJson(indexPath(), index, {spaces: 2})
    return indexPath()
  }

  function envelopePath(envelope) {
    const hash = compactHash(envelope).slice(0, 20)

    return path.join(
      envelopeDir(),
      `${safeId(envelope.artifactType)}-${hash}.json`
    )
  }

  async function writeEnvelope(envelope) {
    const targetPath = envelopePath(envelope)

    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeJson(targetPath, envelope, {spaces: 2})
    return targetPath
  }

  async function readEnvelope(input = {}) {
    if (isPlainObject(input.envelope)) {
      return input.envelope
    }

    if (input.envelopePath) {
      return fs.readJson(
        assertPathInsideRoots(
          input.envelopePath,
          [envelopeDir()],
          'artifact_envelope_path_outside_store'
        )
      )
    }

    throw new Error('Signed artifact envelope is required')
  }

  async function resolveProducer() {
    if (typeof getIdentity !== 'function') {
      throw new Error('Idena identity callback is unavailable')
    }

    const identity = await getIdentity()
    const address =
      typeof identity === 'string'
        ? identity
        : identity && (identity.address || identity.identity)

    return {
      address: normalizeAddress(address),
      identityStatus:
        identity && typeof identity === 'object'
          ? identity.status || identity.identityStatus || null
          : null,
    }
  }

  async function readArtifactPayload(input = {}) {
    const artifactType = normalizeArtifactType(input.artifactType)
    let payload =
      input.payload ||
      input.bundle ||
      input.annotationBundle ||
      input.trainingDataset ||
      null
    const attachments = []

    if (!payload && input.bundlePath) {
      if (artifactType !== 'local-ai-update-bundle') {
        throw new Error('bundlePath is only supported for Local AI artifacts')
      }

      payload = await fs.readJson(
        assertPathInsideRoots(
          input.bundlePath,
          localAiBundleRoots(),
          'local_ai_bundle_path_outside_store'
        )
      )
    }

    if (!isPlainObject(payload)) {
      throw new Error('Artifact payload is required')
    }

    if (containsPrivateField(payload)) {
      throw new Error('Artifact payload contains private fields')
    }

    if (input.artifactPath) {
      if (artifactType !== 'local-ai-update-bundle') {
        throw new Error('artifactPath is only supported for Local AI artifacts')
      }

      const attachmentPath = assertPathInsideRoots(
        input.artifactPath,
        localAiBundleRoots(),
        'local_ai_artifact_path_outside_store'
      )
      const buffer = await fs.readFile(attachmentPath)

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new Error('local_ai_artifact_attachment_too_large')
      }

      const expectedSha256 =
        payload && payload.payload
          ? normalizeSha256Hex(payload.payload.adapterSha256)
          : ''
      const actualSha256 = sha256Hex(buffer)

      if (expectedSha256 && actualSha256 !== expectedSha256) {
        throw new Error('local_ai_artifact_sha256_mismatch')
      }

      const artifactFile =
        (payload.payload &&
          payload.payload.adapterArtifact &&
          payload.payload.adapterArtifact.file) ||
        path.basename(attachmentPath)

      attachments.push({
        role: 'local-ai-adapter-artifact',
        file: safeFileName(artifactFile, `adapter-${actualSha256}.bin`),
        sha256: actualSha256,
        sizeBytes: buffer.length,
        encoding: 'base64',
        contentBase64: buffer.toString('base64'),
      })
    }

    return {artifactType, payload, attachments}
  }

  async function runSourceChecks(envelope) {
    if (containsPlaceholderSignature(envelope.payload)) {
      return {
        ok: false,
        reason: 'placeholder_signature_rejected',
        replayVerified: false,
      }
    }

    if (
      envelope.artifactType === 'arc-trace-bundle' &&
      typeof verifyArcTraceBundle === 'function'
    ) {
      const result = await verifyArcTraceBundle({bundle: envelope.payload})
      return {
        ok: Boolean(result && result.ok),
        reason: result && result.ok ? null : 'trace_replay_check_failed',
        replayVerified: Boolean(result && result.ok),
        details: result || null,
      }
    }

    if (
      envelope.artifactType === 'arc-annotation-bundle' &&
      typeof verifyArcAnnotationBundle === 'function'
    ) {
      const result = await verifyArcAnnotationBundle({
        annotationBundle: envelope.payload,
      })

      return {
        ok: Boolean(result && result.ok),
        reason: result && result.ok ? null : 'annotation_hash_check_failed',
        replayVerified: Boolean(
          result &&
            result.traceReplayVerified &&
            result.recordingVerified &&
            result.agentLogVerified
        ),
        details: result || null,
      }
    }

    if (envelope.artifactType === 'arc-training-dataset') {
      if (typeof verifyArcTrainingDataset === 'function') {
        const result = await verifyArcTrainingDataset({
          dataset: envelope.payload,
        })

        return {
          ok: Boolean(result && result.ok),
          reason:
            result && result.ok
              ? null
              : (result && result.reason) || 'dataset_source_check_failed',
          replayVerified: Boolean(result && result.sourceVerified),
          details: result || null,
        }
      }

      const examples = Array.isArray(envelope.payload.examples)
        ? envelope.payload.examples
        : []
      const expectedCount = Number(envelope.payload.exampleCount)

      if (
        Number.isFinite(expectedCount) &&
        expectedCount >= 0 &&
        examples.length !== expectedCount
      ) {
        return {
          ok: false,
          reason: 'dataset_example_count_mismatch',
          replayVerified: false,
        }
      }

      if (String(envelope.payload.datasetHash || '').trim()) {
        const {datasetHash, stored, ...datasetWithoutHash} = envelope.payload

        if (datasetHash !== hashJsonPrefixed(datasetWithoutHash)) {
          return {
            ok: false,
            reason: 'dataset_hash_mismatch',
            replayVerified: false,
          }
        }
      }

      const invalidExample = examples.find(
        (example) =>
          !isPlainObject(example) ||
          !String(example.protocol || '').trim() ||
          !String(example.annotationHash || '').trim() ||
          !String(example.traceHash || '').trim()
      )

      if (invalidExample) {
        return {
          ok: false,
          reason: 'dataset_example_invalid',
          replayVerified: false,
        }
      }
    }

    if (envelope.artifactType === 'local-ai-update-bundle') {
      if (
        envelope.payload.version !== 1 ||
        envelope.payload.bundleType !== 'local-ai-update' ||
        !isPlainObject(envelope.payload.payload) ||
        !isPlainObject(envelope.payload.signature)
      ) {
        return {
          ok: false,
          reason: 'local_ai_bundle_schema_invalid',
          replayVerified: false,
        }
      }

      if (hasLocalAiConcreteAdapterPayload(envelope.payload)) {
        const attachment = findLocalAiAdapterAttachment(envelope)
        const adapterSha256 = normalizeSha256Hex(
          envelope.payload.payload.adapterSha256
        )

        if (!attachment) {
          return {
            ok: false,
            reason: 'adapter_attachment_required',
            replayVerified: false,
          }
        }

        if (normalizeSha256Hex(attachment.sha256) !== adapterSha256) {
          return {
            ok: false,
            reason: 'adapter_attachment_hash_mismatch',
            replayVerified: false,
          }
        }
      }
    }

    return {
      ok: true,
      reason: null,
      replayVerified: true,
      details: null,
    }
  }

  async function verifyEnvelope(envelope) {
    const shape = validateEnvelopeShape(envelope)
    const signature = shape.ok ? verifyEnvelopeSignature(envelope) : null
    const source =
      shape.ok && signature && signature.ok
        ? await runSourceChecks(envelope)
        : null

    const ok = Boolean(shape.ok && signature && signature.ok && source.ok)
    const reason =
      (shape && shape.reason) ||
      (signature && signature.reason) ||
      (source && source.reason) ||
      null

    return {
      ok,
      reason,
      artifactType: envelope && envelope.artifactType,
      protocol: envelope && envelope.protocol,
      payloadHash:
        (shape && shape.payloadHash) || (envelope && envelope.payloadHash),
      producerAddress: envelope && envelope.producerAddress,
      cid: envelope && envelope.cid ? envelope.cid : null,
      signatureValid: Boolean(signature && signature.ok),
      hashValid: Boolean(shape && shape.ok),
      replayVerified: Boolean(source && source.replayVerified),
      sourceVerified: Boolean(source && source.ok),
      checks: {
        schema: Boolean(shape && shape.ok),
        hash: Boolean(shape && shape.ok),
        signature: Boolean(signature && signature.ok),
        replay: Boolean(source && source.replayVerified),
      },
      sourceDetails: source && source.details ? source.details : null,
    }
  }

  async function upsertEnvelopeIndex(envelope, extra = {}) {
    const index = await readIndex()
    const nextIndex = mergeIndexEntry(
      index,
      envelopeIndexEntry(envelope, extra)
    )

    await writeIndex(nextIndex)
    return nextIndex
  }

  async function exportSignedArtifact(input = {}) {
    const {artifactType, payload, attachments} = await readArtifactPayload(
      input
    )
    const producer = await resolveProducer()
    const unsignedEnvelope = buildUnsignedEnvelope({
      artifactType,
      payload,
      attachments,
      producer,
      releasePolicy: input.releasePolicy,
      sourceHashes: input.sourceHashes,
      createdAt: input.createdAt,
    })
    const signature = await signEnvelope(unsignedEnvelope, signPayload)
    const envelope = {
      ...unsignedEnvelope,
      signature,
    }
    const verification = await verifyEnvelope(envelope)

    if (!verification.ok) {
      throw new Error(verification.reason || 'signed_artifact_invalid')
    }

    const storedPath = await writeEnvelope(envelope)

    await upsertEnvelopeIndex(envelope, {
      envelopePath: storedPath,
      direction: 'exported',
    })

    if (logger && typeof logger.info === 'function') {
      logger.info('Signed P2P artifact exported', {
        artifactType,
        payloadHash: envelope.payloadHash,
        producerAddress: envelope.producerAddress,
        envelopePath: storedPath,
      })
    }

    return {
      ok: true,
      artifactType,
      protocol: ARTIFACT_ENVELOPE_PROTOCOL,
      payloadHash: envelope.payloadHash,
      producerAddress: envelope.producerAddress,
      envelopePath: storedPath,
      cid: null,
      signature: envelope.signature,
      verification,
    }
  }

  async function verifySignedArtifact(input = {}) {
    const envelope = await readEnvelope(input)
    const verification = await verifyEnvelope(envelope)

    return {
      ok: verification.ok,
      verification,
      artifactType: envelope.artifactType,
      payloadHash: envelope.payloadHash,
      producerAddress: envelope.producerAddress,
      cid: envelope.cid || null,
      envelopePath: input.envelopePath || null,
      envelope,
    }
  }

  async function publishArtifactToIpfs(input = {}) {
    if (typeof callNodeRpc !== 'function') {
      throw new Error('Idena node IPFS RPC is unavailable')
    }

    const envelope = await readEnvelope(input)
    const verification = await verifyEnvelope(envelope)

    if (!verification.ok) {
      throw new Error(verification.reason || 'signed_artifact_invalid')
    }

    const publishedEnvelope = {
      ...envelope,
      cid: null,
    }
    const result = await callNodeRpc('ipfs_add', [
      canonicalJson(publishedEnvelope),
      Boolean(input.pin),
    ])
    const cid = extractCid(result)

    if (!cid) {
      throw new Error('Idena node did not return an artifact CID')
    }

    const storedEnvelope = {
      ...publishedEnvelope,
      cid,
    }
    const storedPath = await writeEnvelope(storedEnvelope)

    await upsertEnvelopeIndex(storedEnvelope, {
      envelopePath: storedPath,
      direction: 'published',
    })

    return {
      ok: true,
      cid,
      artifactType: storedEnvelope.artifactType,
      payloadHash: storedEnvelope.payloadHash,
      producerAddress: storedEnvelope.producerAddress,
      envelopePath: storedPath,
      signature: storedEnvelope.signature,
      verification: {
        ...verification,
        cid,
      },
      result,
    }
  }

  async function importArtifactByCid(input = {}) {
    if (typeof callNodeRpc !== 'function') {
      throw new Error('Idena node IPFS RPC is unavailable')
    }

    const cid = normalizeCid(input.cid)
    const result = await callNodeRpc('ipfs_get', [cid])
    const importedEnvelope = {
      ...parseIpfsPayload(result),
      cid,
    }
    const verification = await verifyEnvelope(importedEnvelope)

    if (!verification.ok) {
      throw new Error(verification.reason || 'signed_artifact_invalid')
    }

    const storedPath = await writeEnvelope(importedEnvelope)

    await upsertEnvelopeIndex(importedEnvelope, {
      envelopePath: storedPath,
      direction: 'imported',
    })

    const consumption =
      typeof consumeVerifiedArtifact === 'function'
        ? await consumeVerifiedArtifact({
            envelope: importedEnvelope,
            envelopePath: storedPath,
            verification,
          })
        : null

    return {
      ok: true,
      cid,
      artifactType: importedEnvelope.artifactType,
      payloadHash: importedEnvelope.payloadHash,
      producerAddress: importedEnvelope.producerAddress,
      envelopePath: storedPath,
      signature: importedEnvelope.signature,
      verification,
      consumption,
    }
  }

  return {
    exportSignedArtifact,
    verifySignedArtifact,
    publishArtifactToIpfs,
    importArtifactByCid,
  }
}

module.exports = {
  ARTIFACT_ENVELOPE_PROTOCOL,
  ARTIFACT_ENVELOPE_VERSION,
  ARTIFACT_SIGNATURE_TYPE,
  DEFAULT_RELEASE_POLICY,
  buildArtifactSignatureMessage,
  buildUnsignedEnvelope,
  collectSourceHashes,
  createP2pArtifactManager,
  payloadHash,
  verifyEnvelopeSignature,
}
