/* global BigInt */
const crypto = require('crypto')
const {keccak_256: keccak256} = require('js-sha3')

const SECP256K1_P = BigInt(
  '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f'
)
const SECP256K1_N = BigInt(
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'
)
const SECP256K1_G = {
  x: BigInt(
    '0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
  ),
  y: BigInt(
    '0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'
  ),
}

function stripHexPrefix(value) {
  return typeof value === 'string' && value.startsWith('0x')
    ? value.slice(2)
    : value
}

function normalizeHex(value, {bytes, field = 'hex'} = {}) {
  const hex = String(stripHexPrefix(value) || '')
    .trim()
    .toLowerCase()

  if (!/^[a-f0-9]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`${field} must be an even-length hex string`)
  }

  if (bytes && hex.length !== bytes * 2) {
    throw new Error(`${field} must be ${bytes} bytes`)
  }

  return hex
}

function hexToBuffer(value, options = {}) {
  return Buffer.from(normalizeHex(value, options), 'hex')
}

function toHexString(bytes, withPrefix = true) {
  const hex = Buffer.from(bytes || []).toString('hex')
  return `${withPrefix ? '0x' : ''}${hex}`
}

function mod(value, modulo = SECP256K1_P) {
  const result = value % modulo
  return result >= 0n ? result : result + modulo
}

function powMod(base, exponent, modulo = SECP256K1_P) {
  let nextBase = mod(base, modulo)
  let nextExponent = exponent
  let result = 1n

  while (nextExponent > 0n) {
    if (nextExponent % 2n === 1n) {
      result = mod(result * nextBase, modulo)
    }
    nextBase = mod(nextBase * nextBase, modulo)
    nextExponent /= 2n
  }

  return result
}

function invert(value, modulo = SECP256K1_P) {
  let low = mod(value, modulo)
  let high = modulo
  let lm = 1n
  let hm = 0n

  if (low === 0n) {
    throw new Error('Cannot invert zero')
  }

  while (low > 1n) {
    const ratio = high / low
    const nm = hm - lm * ratio
    const next = high - low * ratio

    hm = lm
    high = low
    lm = nm
    low = next
  }

  return mod(lm, modulo)
}

function pointDouble(point) {
  if (!point || point.y === 0n) return null

  const slope = mod(3n * point.x * point.x * invert(2n * point.y))
  const x = mod(slope * slope - 2n * point.x)
  const y = mod(slope * (point.x - x) - point.y)

  return {x, y}
}

function pointAdd(left, right) {
  if (!left) return right
  if (!right) return left

  if (left.x === right.x) {
    return mod(left.y + right.y) === 0n ? null : pointDouble(left)
  }

  const slope = mod((right.y - left.y) * invert(right.x - left.x))
  const x = mod(slope * slope - left.x - right.x)
  const y = mod(slope * (left.x - x) - left.y)

  return {x, y}
}

function pointNegate(point) {
  return point ? {x: point.x, y: mod(-point.y)} : null
}

function multiplyPoint(scalar, point = SECP256K1_G) {
  let nextScalar = scalar
  let addend = point
  let result = null

  while (nextScalar > 0n) {
    if (nextScalar % 2n === 1n) {
      result = pointAdd(result, addend)
    }
    addend = pointDouble(addend)
    nextScalar /= 2n
  }

  return result
}

function decompressPoint(x, odd) {
  if (x < 0n || x >= SECP256K1_P) {
    throw new Error('Invalid secp256k1 point x-coordinate')
  }

  const alpha = mod(x * x * x + 7n)
  let y = powMod(alpha, (SECP256K1_P + 1n) / 4n)

  if (mod(y * y - alpha) !== 0n) {
    throw new Error('Invalid secp256k1 compressed point')
  }

  if (Boolean(y % 2n) !== Boolean(odd)) {
    y = SECP256K1_P - y
  }

  return {x, y}
}

function privateKeyToScalar(privateKey) {
  if (privateKey.length !== 32) {
    throw new Error('Invalid secp256k1 private key length')
  }

  const scalar = BigInt(`0x${privateKey.toString('hex')}`)

  if (scalar <= 0n || scalar >= SECP256K1_N) {
    throw new Error('Invalid secp256k1 private key')
  }

  return scalar
}

function privateKeyToPublicKey(privateKeyHex) {
  const privateKey = Buffer.isBuffer(privateKeyHex)
    ? privateKeyHex
    : hexToBuffer(privateKeyHex, {bytes: 32, field: 'privateKey'})
  const point = multiplyPoint(privateKeyToScalar(privateKey))

  if (!point) {
    throw new Error('Failed to derive secp256k1 public key')
  }

  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(point.x.toString(16).padStart(64, '0'), 'hex'),
    Buffer.from(point.y.toString(16).padStart(64, '0'), 'hex'),
  ])
}

function publicKeyToPoint(publicKeyHex) {
  const publicKey = Buffer.isBuffer(publicKeyHex)
    ? publicKeyHex
    : hexToBuffer(publicKeyHex, {bytes: 65, field: 'publicKey'})

  if (publicKey[0] !== 0x04) {
    throw new Error('Only uncompressed secp256k1 public keys are supported')
  }

  const point = {
    x: BigInt(`0x${publicKey.slice(1, 33).toString('hex')}`),
    y: BigInt(`0x${publicKey.slice(33).toString('hex')}`),
  }

  if (
    point.x <= 0n ||
    point.x >= SECP256K1_P ||
    point.y <= 0n ||
    point.y >= SECP256K1_P ||
    mod(point.y * point.y - point.x * point.x * point.x - 7n) !== 0n
  ) {
    throw new Error('Invalid secp256k1 public key point')
  }

  return point
}

function publicKeyToAddress(publicKeyHex, withPrefix = true) {
  const publicKey = Buffer.isBuffer(publicKeyHex)
    ? publicKeyHex
    : hexToBuffer(publicKeyHex, {bytes: 65, field: 'publicKey'})
  const publicKeyHash = Buffer.from(
    keccak256.arrayBuffer(publicKey.slice(1))
  ).slice(12)

  return toHexString(publicKeyHash, withPrefix)
}

function privateKeyToAddress(privateKeyHex, withPrefix = true) {
  return publicKeyToAddress(privateKeyToPublicKey(privateKeyHex), withPrefix)
}

function normalizeAddress(value) {
  const address = String(value || '').trim()

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid Idena address')
  }

  return `0x${address.slice(2).toLowerCase()}`
}

function normalizeForJson(value) {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item))
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        const nextValue = normalizeForJson(value[key])

        if (typeof nextValue !== 'undefined') {
          result[key] = nextValue
        }

        return result
      }, {})
  }

  return undefined
}

function canonicalJson(value) {
  return JSON.stringify(normalizeForJson(value))
}

function sha256Buffer(value) {
  return crypto
    .createHash('sha256')
    .update(Buffer.isBuffer(value) ? value : String(value), 'utf8')
    .digest()
}

function sha256Hex(value) {
  return sha256Buffer(value).toString('hex')
}

function sha256Prefixed(value) {
  return `sha256:${sha256Hex(value)}`
}

function hashJson(value) {
  return sha256Hex(canonicalJson(value))
}

function hashJsonPrefixed(value) {
  return `sha256:${hashJson(value)}`
}

function randomSaltHex() {
  return crypto.randomBytes(32).toString('hex')
}

function normalizeSalt(salt) {
  return normalizeHex(salt, {bytes: 32, field: 'salt'})
}

function buildSaltCommitment(salt) {
  return sha256Prefixed(`idena-arc-salt-v0:${normalizeSalt(salt)}`)
}

function assertSaltCommitment(salt, commitment) {
  const expected = buildSaltCommitment(salt)

  if (expected !== String(commitment || '').trim()) {
    throw new Error('Salt reveal does not match commitment')
  }

  return true
}

function buildFinalSeedMaterial({
  sessionId,
  generator = {},
  rehearsalEpochOrRound = null,
  commitments = [],
  reveals = [],
  networkEntropy = null,
  sessionNonce = null,
}) {
  return {
    protocol: 'idena-arc-final-seed-v0',
    sessionId: String(sessionId || ''),
    generatorCid: String(generator.cid || ''),
    generatorHash: String(generator.hash || ''),
    generatorVersion: String(generator.version || ''),
    rehearsalEpochOrRound,
    commitments: commitments
      .map((item) => ({
        participantId: String(item.participantId || ''),
        commitment: String(item.commitment || ''),
      }))
      .sort((left, right) =>
        left.participantId.localeCompare(right.participantId)
      ),
    reveals: reveals
      .map((item) => ({
        participantId: String(item.participantId || ''),
        saltHash: sha256Prefixed(normalizeSalt(item.salt)),
      }))
      .sort((left, right) =>
        left.participantId.localeCompare(right.participantId)
      ),
    networkEntropy,
    sessionNonce,
  }
}

function deriveFinalSeed(input) {
  const material = buildFinalSeedMaterial(input)
  const finalSeed = hashJson(material)

  return {
    finalSeed,
    finalSeedHash: `sha256:${finalSeed}`,
    material,
  }
}

function signableMessageHash(payload) {
  return sha256Buffer(
    canonicalJson({
      domain: 'idena-arc-signed-payload-v0',
      payload,
    })
  )
}

function idenaSignatureHash(value, format = 'doubleHash') {
  const text = String(value || '')
  const normalizedFormat = String(format || 'doubleHash')

  if (normalizedFormat === 'prefix') {
    const message = Buffer.from(text, 'utf8')
    return Buffer.from(
      keccak256.arrayBuffer(
        Buffer.concat([
          Buffer.from(`\x00Idena Signed Message:\n${message.length}`, 'utf8'),
          message,
        ])
      )
    )
  }

  if (normalizedFormat === 'doubleHash') {
    const first = Buffer.from(keccak256.arrayBuffer(Buffer.from(text, 'utf8')))
    return Buffer.from(keccak256.arrayBuffer(first))
  }

  throw new Error(`Unsupported Idena signature format: ${normalizedFormat}`)
}

function idenaSignatureHashPrefixed(value, format) {
  return `keccak256:${idenaSignatureHash(value, format).toString('hex')}`
}

function normalizeSignatureValue(value) {
  return normalizeHex(value, {bytes: 64, field: 'signature'})
}

function normalizeRecoverableSignatureValue(value) {
  return normalizeHex(value, {bytes: 65, field: 'signature'})
}

function signPayloadWithPrivateKey(privateKeyHex, payload) {
  const privateKey = hexToBuffer(privateKeyHex, {
    bytes: 32,
    field: 'privateKey',
  })
  const d = privateKeyToScalar(privateKey)
  const messageHash = signableMessageHash(payload)
  const e = BigInt(`0x${messageHash.toString('hex')}`)
  let r = 0n
  let s = 0n

  while (r === 0n || s === 0n) {
    const k = privateKeyToScalar(crypto.randomBytes(32))
    const point = multiplyPoint(k)

    const nextR = mod(point.x, SECP256K1_N)
    if (nextR !== 0n) {
      const nextS = mod(invert(k, SECP256K1_N) * (e + nextR * d), SECP256K1_N)

      r = nextR
      s = nextS > SECP256K1_N / 2n ? SECP256K1_N - nextS : nextS
    }
  }

  const publicKey = privateKeyToPublicKey(privateKey)

  return {
    type: 'idena-arc-secp256k1-v0',
    address: publicKeyToAddress(publicKey),
    publicKey: toHexString(publicKey),
    messageHash: `sha256:${messageHash.toString('hex')}`,
    value: `0x${r.toString(16).padStart(64, '0')}${s
      .toString(16)
      .padStart(64, '0')}`,
  }
}

function signIdenaMessageWithPrivateKey(privateKeyHex, message, format) {
  const privateKey = hexToBuffer(privateKeyHex, {
    bytes: 32,
    field: 'privateKey',
  })
  const d = privateKeyToScalar(privateKey)
  const messageHash = idenaSignatureHash(message, format)
  const e = BigInt(`0x${messageHash.toString('hex')}`)
  let r = 0n
  let s = 0n
  let recovery = 0

  while (r === 0n || s === 0n) {
    const k = privateKeyToScalar(crypto.randomBytes(32))
    const point = multiplyPoint(k)

    const nextR = mod(point.x, SECP256K1_N)
    if (nextR !== 0n) {
      const nextS = mod(invert(k, SECP256K1_N) * (e + nextR * d), SECP256K1_N)
      recovery = Number(point.y % 2n) + (point.x >= SECP256K1_N ? 2 : 0)
      r = nextR
      s = nextS

      if (nextS > SECP256K1_N / 2n) {
        s = SECP256K1_N - nextS
        recovery = recovery % 2 === 0 ? recovery + 1 : recovery - 1
      }
    }
  }

  return `0x${r.toString(16).padStart(64, '0')}${s
    .toString(16)
    .padStart(64, '0')}${recovery.toString(16).padStart(2, '0')}`
}

function recoverPublicKeyFromSignatureHash(messageHash, signatureValue) {
  const signatureHex = normalizeRecoverableSignatureValue(signatureValue)
  const r = BigInt(`0x${signatureHex.slice(0, 64)}`)
  const s = BigInt(`0x${signatureHex.slice(64, 128)}`)
  let recovery = Number.parseInt(signatureHex.slice(128), 16)

  if (recovery >= 27) {
    recovery -= 27
  }

  if (
    recovery < 0 ||
    recovery > 3 ||
    r <= 0n ||
    r >= SECP256K1_N ||
    s <= 0n ||
    s >= SECP256K1_N
  ) {
    throw new Error('Invalid recoverable secp256k1 signature')
  }

  const x = r + BigInt(Math.floor(recovery / 2)) * SECP256K1_N
  if (x >= SECP256K1_P) {
    throw new Error('Invalid recoverable secp256k1 signature point')
  }

  const rPoint = decompressPoint(x, recovery % 2 === 1)
  const e = BigInt(`0x${messageHash.toString('hex')}`)
  const rInv = invert(r, SECP256K1_N)
  const q = multiplyPoint(
    rInv,
    pointAdd(multiplyPoint(s, rPoint), pointNegate(multiplyPoint(e)))
  )

  if (!q) {
    throw new Error('Failed to recover secp256k1 public key')
  }

  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(q.x.toString(16).padStart(64, '0'), 'hex'),
    Buffer.from(q.y.toString(16).padStart(64, '0'), 'hex'),
  ])
}

function recoverIdenaSignatureAddress(message, signatureValue, format) {
  const publicKey = recoverPublicKeyFromSignatureHash(
    idenaSignatureHash(message, format),
    signatureValue
  )

  return publicKeyToAddress(publicKey)
}

function verifyIdenaSignature(
  message,
  signatureValue,
  expectedAddress,
  format
) {
  try {
    return (
      normalizeAddress(
        recoverIdenaSignatureAddress(message, signatureValue, format)
      ) === normalizeAddress(expectedAddress)
    )
  } catch {
    return false
  }
}

function verifyPayloadSignatureUnsafe(payload, signature, expectedAddress) {
  const nextSignature = signature || {}

  if (nextSignature.type !== 'idena-arc-secp256k1-v0') {
    return false
  }

  const messageHash = signableMessageHash(payload)
  if (nextSignature.messageHash !== `sha256:${messageHash.toString('hex')}`) {
    return false
  }

  const publicKey = hexToBuffer(nextSignature.publicKey, {
    bytes: 65,
    field: 'publicKey',
  })
  const signatureAddress = normalizeAddress(publicKeyToAddress(publicKey))
  const declaredAddress = normalizeAddress(nextSignature.address)

  if (signatureAddress !== declaredAddress) {
    return false
  }

  if (
    expectedAddress &&
    signatureAddress !== normalizeAddress(expectedAddress)
  ) {
    return false
  }

  const signatureHex = normalizeSignatureValue(nextSignature.value)
  const r = BigInt(`0x${signatureHex.slice(0, 64)}`)
  const s = BigInt(`0x${signatureHex.slice(64)}`)

  if (r <= 0n || r >= SECP256K1_N || s <= 0n || s >= SECP256K1_N) {
    return false
  }

  const q = publicKeyToPoint(publicKey)
  const e = BigInt(`0x${messageHash.toString('hex')}`)
  const w = invert(s, SECP256K1_N)
  const u1 = mod(e * w, SECP256K1_N)
  const u2 = mod(r * w, SECP256K1_N)
  const point = pointAdd(multiplyPoint(u1), multiplyPoint(u2, q))

  return Boolean(point && mod(point.x, SECP256K1_N) === r)
}

function verifyPayloadSignature(payload, signature, expectedAddress) {
  try {
    return verifyPayloadSignatureUnsafe(payload, signature, expectedAddress)
  } catch {
    return false
  }
}

module.exports = {
  canonicalJson,
  sha256Hex,
  sha256Prefixed,
  hashJson,
  hashJsonPrefixed,
  randomSaltHex,
  normalizeSalt,
  buildSaltCommitment,
  assertSaltCommitment,
  buildFinalSeedMaterial,
  deriveFinalSeed,
  privateKeyToPublicKey,
  publicKeyToAddress,
  privateKeyToAddress,
  normalizeAddress,
  idenaSignatureHash,
  idenaSignatureHashPrefixed,
  signPayloadWithPrivateKey,
  signIdenaMessageWithPrivateKey,
  recoverIdenaSignatureAddress,
  verifyIdenaSignature,
  verifyPayloadSignature,
}
