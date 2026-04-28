const {
  canonicalJson,
  buildSaltCommitment,
  assertSaltCommitment,
  deriveFinalSeed,
  privateKeyToAddress,
  recoverIdenaSignatureAddress,
  signIdenaMessageWithPrivateKey,
  signPayloadWithPrivateKey,
  verifyIdenaSignature,
  verifyPayloadSignature,
} = require('./crypto')

describe('idena-arc crypto', () => {
  const privateKey =
    '0x0101010101010101010101010101010101010101010101010101010101010101'

  it('canonicalizes object keys recursively', () => {
    expect(canonicalJson({b: 1, a: {d: 4, c: 3}})).toBe(
      '{"a":{"c":3,"d":4},"b":1}'
    )
  })

  it('validates salt commitments', () => {
    const salt =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const commitment = buildSaltCommitment(salt)

    expect(commitment).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(assertSaltCommitment(salt, commitment)).toBe(true)
    expect(() =>
      assertSaltCommitment(
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        commitment
      )
    ).toThrow('Salt reveal does not match commitment')
  })

  it('derives the same final seed for sorted participant material', () => {
    const first = deriveFinalSeed({
      sessionId: 'session-1',
      generator: {cid: 'local:test', hash: 'sha256:a', version: '0.1.0'},
      commitments: [
        {participantId: 'b', commitment: 'sha256:2'},
        {participantId: 'a', commitment: 'sha256:1'},
      ],
      reveals: [
        {
          participantId: 'b',
          salt: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        {
          participantId: 'a',
          salt: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
      networkEntropy: 'entropy',
      sessionNonce: 'nonce',
    })
    const second = deriveFinalSeed({
      sessionId: 'session-1',
      generator: {cid: 'local:test', hash: 'sha256:a', version: '0.1.0'},
      commitments: [
        {participantId: 'a', commitment: 'sha256:1'},
        {participantId: 'b', commitment: 'sha256:2'},
      ],
      reveals: [
        {
          participantId: 'a',
          salt: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        {
          participantId: 'b',
          salt: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      ],
      networkEntropy: 'entropy',
      sessionNonce: 'nonce',
    })

    expect(first.finalSeed).toEqual(second.finalSeed)
    expect(first.finalSeedHash).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('signs and verifies an Idena address-bound payload', () => {
    const address = privateKeyToAddress(privateKey)
    const payload = {
      protocol: 'idena-arc-result-v0',
      sessionId: 'session-1',
      playerAddress: address,
      score: 42,
    }
    const signature = signPayloadWithPrivateKey(privateKey, payload)

    expect(signature.address).toBe(address)
    expect(verifyPayloadSignature(payload, signature, address)).toBe(true)
    expect(
      verifyPayloadSignature({...payload, score: 41}, signature, address)
    ).toBe(false)
  })

  it('recovers addresses from Idena node-style signatures', () => {
    const address = privateKeyToAddress(privateKey)
    const message =
      'idena-arc-result-v0:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const signature = signIdenaMessageWithPrivateKey(
      privateKey,
      message,
      'prefix'
    )

    expect(recoverIdenaSignatureAddress(message, signature, 'prefix')).toBe(
      address
    )
    expect(verifyIdenaSignature(message, signature, address, 'prefix')).toBe(
      true
    )
    expect(
      verifyIdenaSignature(`${message}:tampered`, signature, address, 'prefix')
    ).toBe(false)
  })
})
