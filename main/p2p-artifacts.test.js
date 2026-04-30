const os = require('os')
const path = require('path')
const fs = require('fs-extra')

const {
  ARTIFACT_SIGNATURE_TYPE,
  buildArtifactSignatureMessage,
  buildUnsignedEnvelope,
  createP2pArtifactManager,
  payloadHash,
} = require('./p2p-artifacts')
const {
  canonicalJson,
  idenaSignatureHashPrefixed,
  privateKeyToAddress,
  sha256Hex,
  signIdenaMessageWithPrivateKey,
} = require('./idena-arc/crypto')

const PRIVATE_KEY_A =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const PRIVATE_KEY_B =
  '0x0000000000000000000000000000000000000000000000000000000000000002'

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}

function createSignedManager({
  baseDir,
  privateKey = PRIVATE_KEY_A,
  rpc,
  allowedBundleRoots,
  consumeVerifiedArtifact,
} = {}) {
  const address = privateKeyToAddress(privateKey)

  return {
    address,
    manager: createP2pArtifactManager({
      logger: createLogger(),
      baseDir,
      allowedBundleRoots,
      getIdentity: async () => ({
        address,
        status: 'validated',
      }),
      signPayload: async (message) =>
        signIdenaMessageWithPrivateKey(privateKey, message, 'prefix'),
      callNodeRpc: rpc,
      consumeVerifiedArtifact,
      verifyArcTraceBundle: async ({bundle}) => ({
        ok: bundle && bundle.protocol === 'idena-arc-trace-bundle-v0',
      }),
      verifyArcAnnotationBundle: async ({annotationBundle: bundle}) => ({
        ok: Boolean(bundle && bundle.annotationHash),
        traceReplayVerified: true,
        recordingVerified: true,
        agentLogVerified: true,
      }),
    }),
  }
}

function traceBundle(overrides = {}) {
  return {
    protocol: 'idena-arc-trace-bundle-v0',
    resultId: 'result-1',
    traceHash: 'sha256:trace',
    recordingHash: 'sha256:recording',
    recordingJsonlHash: 'sha256:recording-jsonl',
    agentLogHash: 'sha256:agent-log',
    finalSeedHash: 'sha256:seed',
    generatorHash: 'sha256:generator',
    replayVerified: true,
    ...overrides,
  }
}

function annotationBundle(overrides = {}) {
  return {
    protocol: 'idena-arc-annotation-record-v0',
    annotationId: 'annotation-1',
    annotationHash: 'sha256:annotation',
    acceptedForTraining: true,
    traceReplayVerified: true,
    recordingVerified: true,
    agentLogVerified: true,
    annotation: {
      traceHash: 'sha256:trace',
      recordingHash: 'sha256:recording',
      agentLogHash: 'sha256:agent-log',
    },
    trainingExample: {
      protocol: 'idena-arc-training-example-v0',
      annotationHash: 'sha256:annotation',
      traceHash: 'sha256:trace',
    },
    ...overrides,
  }
}

function localAiBundle(overrides = {}) {
  return {
    version: 1,
    bundleType: 'local-ai-update',
    payload: {
      epoch: 7,
      identity: privateKeyToAddress(PRIVATE_KEY_A),
      baseModelHash: 'sha256:base-model',
      adapterSha256: 'sha256:adapter',
      trainingConfigHash: 'sha256:training-config',
      manifest: {
        sha256: 'sha256:manifest',
      },
    },
    signature: {
      type: 'idena_rpc_signature',
      signed: true,
      value: '0xsigned-inner-bundle',
    },
    ...overrides,
  }
}

describe('P2P artifact envelopes', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'idena-p2p-artifacts-'))
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  it('uses stable canonical payload hashes', () => {
    expect(payloadHash({b: 2, a: 1})).toBe(payloadHash({a: 1, b: 2}))
    expect(canonicalJson({b: 2, a: 1})).toBe('{"a":1,"b":2}')
  })

  it('exports and verifies a signed ARC trace artifact', async () => {
    const {manager, address} = createSignedManager({baseDir: tempDir})
    const exported = await manager.exportSignedArtifact({
      artifactType: 'arc-trace-bundle',
      payload: traceBundle(),
    })
    const verified = await manager.verifySignedArtifact({
      envelopePath: exported.envelopePath,
    })

    expect(exported).toMatchObject({
      ok: true,
      artifactType: 'arc-trace-bundle',
      producerAddress: address,
    })
    expect(verified.verification).toMatchObject({
      ok: true,
      signatureValid: true,
      hashValid: true,
      replayVerified: true,
    })
  })

  it('rejects a tampered payload', async () => {
    const {manager} = createSignedManager({baseDir: tempDir})
    const exported = await manager.exportSignedArtifact({
      artifactType: 'arc-trace-bundle',
      payload: traceBundle(),
    })
    const envelope = await fs.readJson(exported.envelopePath)

    envelope.payload.traceHash = 'sha256:tampered'

    const verified = await manager.verifySignedArtifact({envelope})

    expect(verified.verification).toMatchObject({
      ok: false,
      reason: 'payload_hash_mismatch',
      hashValid: false,
    })
  })

  it('rejects a wrong signer', async () => {
    const producerAddress = privateKeyToAddress(PRIVATE_KEY_A)
    const envelope = buildUnsignedEnvelope({
      artifactType: 'arc-trace-bundle',
      payload: traceBundle(),
      producer: {
        address: producerAddress,
        identityStatus: 'validated',
      },
    })
    const message = buildArtifactSignatureMessage(envelope)

    envelope.signature = {
      type: ARTIFACT_SIGNATURE_TYPE,
      format: 'prefix',
      signed: true,
      address: producerAddress,
      message,
      messageHash: idenaSignatureHashPrefixed(message, 'prefix'),
      value: signIdenaMessageWithPrivateKey(PRIVATE_KEY_B, message, 'prefix'),
    }

    const {manager} = createSignedManager({baseDir: tempDir})
    const verified = await manager.verifySignedArtifact({envelope})

    expect(verified.verification).toMatchObject({
      ok: false,
      reason: 'signature_invalid',
      signatureValid: false,
    })
  })

  it('rejects placeholder signatures for peer artifacts', async () => {
    const envelope = buildUnsignedEnvelope({
      artifactType: 'local-ai-update-bundle',
      payload: localAiBundle({
        signature: {
          type: 'placeholder_sha256',
          signed: false,
          value: 'draft',
        },
      }),
      producer: {
        address: privateKeyToAddress(PRIVATE_KEY_A),
        identityStatus: 'validated',
      },
    })
    const message = buildArtifactSignatureMessage(envelope)

    envelope.signature = {
      type: ARTIFACT_SIGNATURE_TYPE,
      format: 'prefix',
      signed: true,
      address: privateKeyToAddress(PRIVATE_KEY_A),
      message,
      messageHash: idenaSignatureHashPrefixed(message, 'prefix'),
      value: signIdenaMessageWithPrivateKey(PRIVATE_KEY_A, message, 'prefix'),
    }

    const {manager} = createSignedManager({baseDir: tempDir})
    const verified = await manager.verifySignedArtifact({envelope})

    expect(verified.verification).toMatchObject({
      ok: false,
      reason: 'placeholder_signature_rejected',
      sourceVerified: false,
    })
  })

  it('rejects private training text for peer artifact export', async () => {
    const {manager} = createSignedManager({baseDir: tempDir})

    await expect(
      manager.exportSignedArtifact({
        artifactType: 'arc-training-dataset',
        payload: {
          protocol: 'idena-arc-training-dataset-export-v0',
          exportId: 'dataset-private',
          exampleCount: 1,
          examples: [
            {
              protocol: 'idena-arc-training-example-v0',
              annotationHash: 'sha256:annotation',
              traceHash: 'sha256:trace',
              privateText: {
                teacherNotes: 'local-only note',
              },
            },
          ],
        },
      })
    ).rejects.toThrow('Artifact payload contains private fields')
  })

  it('rejects oversized CID payloads before JSON parsing', async () => {
    const rpc = jest.fn(async (method) => {
      if (method === 'ipfs_get') {
        return `{"protocol":"idena-p2p-artifact-envelope-v1","padding":"${'a'.repeat(
          13 * 1024 * 1024
        )}"}`
      }

      throw new Error(`Unexpected RPC method ${method}`)
    })
    const {manager} = createSignedManager({baseDir: tempDir, rpc})

    await expect(
      manager.importArtifactByCid({cid: 'bafyoversized'})
    ).rejects.toThrow('artifact_envelope_too_large')
  })

  it('rejects renderer-supplied envelope paths outside the artifact store', async () => {
    const {manager} = createSignedManager({baseDir: tempDir})
    const outsidePath = path.join(tempDir, 'outside-envelope.json')

    await fs.writeJson(outsidePath, {})

    await expect(
      manager.verifySignedArtifact({envelopePath: outsidePath})
    ).rejects.toThrow('artifact_envelope_path_outside_store')
  })

  it('rejects renderer-supplied Local AI bundle paths outside managed roots', async () => {
    const allowedRoot = path.join(tempDir, 'local-ai', 'bundles')
    const outsidePath = path.join(tempDir, 'outside-bundle.json')
    const {manager} = createSignedManager({
      baseDir: tempDir,
      allowedBundleRoots: [allowedRoot],
    })

    await fs.writeJson(outsidePath, localAiBundle())

    await expect(
      manager.exportSignedArtifact({
        artifactType: 'local-ai-update-bundle',
        bundlePath: outsidePath,
      })
    ).rejects.toThrow('local_ai_bundle_path_outside_store')
  })

  it('publishes a signed trace artifact to IPFS without automatic sharing', async () => {
    const ipfs = new Map()
    const rpc = jest.fn(async (method, params) => {
      if (method !== 'ipfs_add') {
        throw new Error(`Unexpected RPC method ${method}`)
      }

      const cid = `bafytest${ipfs.size + 1}`
      ipfs.set(cid, params[0])
      return {cid}
    })
    const {manager} = createSignedManager({baseDir: tempDir, rpc})
    const exported = await manager.exportSignedArtifact({
      artifactType: 'arc-trace-bundle',
      payload: traceBundle(),
    })
    const published = await manager.publishArtifactToIpfs({
      envelopePath: exported.envelopePath,
      pin: true,
    })
    const index = await fs.readJson(path.join(tempDir, 'index.json'))

    expect(published).toMatchObject({
      ok: true,
      cid: 'bafytest1',
      artifactType: 'arc-trace-bundle',
    })
    expect(rpc).toHaveBeenCalledWith('ipfs_add', [expect.any(String), true])
    expect(index.artifacts[0]).toEqual(
      expect.objectContaining({
        cid: 'bafytest1',
        artifactType: 'arc-trace-bundle',
        payloadHash: exported.payloadHash,
      })
    )
  })

  it('imports a signed annotation artifact by CID after hash and replay checks', async () => {
    const ipfs = new Map()
    const rpc = jest.fn(async (method, params) => {
      if (method === 'ipfs_add') {
        const cid = `bafyannotation${ipfs.size + 1}`
        ipfs.set(cid, params[0])
        return {cid}
      }

      if (method === 'ipfs_get') {
        return ipfs.get(params[0])
      }

      throw new Error(`Unexpected RPC method ${method}`)
    })
    const {manager} = createSignedManager({baseDir: tempDir, rpc})
    const exported = await manager.exportSignedArtifact({
      artifactType: 'arc-annotation-bundle',
      payload: annotationBundle(),
    })
    const published = await manager.publishArtifactToIpfs({
      envelopePath: exported.envelopePath,
    })
    const imported = await manager.importArtifactByCid({cid: published.cid})

    expect(imported).toMatchObject({
      ok: true,
      cid: published.cid,
      artifactType: 'arc-annotation-bundle',
      payloadHash: exported.payloadHash,
    })
    expect(imported.verification).toMatchObject({
      ok: true,
      signatureValid: true,
      hashValid: true,
      replayVerified: true,
    })
  })

  it('imports a signed Local AI adapter bundle by CID while keeping aggregation out of scope', async () => {
    const ipfs = new Map()
    const rpc = jest.fn(async (method, params) => {
      if (method === 'ipfs_add') {
        const cid = `bafylocalai${ipfs.size + 1}`
        ipfs.set(cid, params[0])
        return {cid}
      }

      if (method === 'ipfs_get') {
        return ipfs.get(params[0])
      }

      throw new Error(`Unexpected RPC method ${method}`)
    })
    const {manager} = createSignedManager({baseDir: tempDir, rpc})
    const exported = await manager.exportSignedArtifact({
      artifactType: 'local-ai-update-bundle',
      payload: localAiBundle(),
    })
    const published = await manager.publishArtifactToIpfs({
      envelopePath: exported.envelopePath,
    })
    const imported = await manager.importArtifactByCid({cid: published.cid})

    expect(imported).toMatchObject({
      ok: true,
      artifactType: 'local-ai-update-bundle',
      payloadHash: exported.payloadHash,
    })
    expect(imported.verification.sourceVerified).toBe(true)
  })

  it('carries a small Local AI adapter attachment and routes verified CID imports to a consumer', async () => {
    const ipfs = new Map()
    const adapterBytes = Buffer.from('small-adapter-bytes')
    const adapterSha256 = sha256Hex(adapterBytes)
    const localAiRoot = path.join(tempDir, 'local-ai', 'bundles')
    const artifactPath = path.join(localAiRoot, 'adapter.safetensors')
    const consumeVerifiedArtifact = jest.fn(
      async ({envelope: artifactEnvelope}) => ({
        imported: true,
        artifactType: artifactEnvelope.artifactType,
        attachmentCount: artifactEnvelope.attachments.length,
      })
    )
    const rpc = jest.fn(async (method, params) => {
      if (method === 'ipfs_add') {
        const cid = `bafyadapter${ipfs.size + 1}`
        ipfs.set(cid, params[0])
        return {cid}
      }

      if (method === 'ipfs_get') {
        return ipfs.get(params[0])
      }

      throw new Error(`Unexpected RPC method ${method}`)
    })

    await fs.ensureDir(localAiRoot)
    await fs.writeFile(artifactPath, adapterBytes)

    const baseBundle = localAiBundle()
    const {manager} = createSignedManager({
      baseDir: tempDir,
      rpc,
      allowedBundleRoots: [localAiRoot],
      consumeVerifiedArtifact,
    })
    const exported = await manager.exportSignedArtifact({
      artifactType: 'local-ai-update-bundle',
      payload: localAiBundle({
        payload: {
          ...baseBundle.payload,
          deltaType: 'lora_adapter',
          adapterFormat: 'peft_lora_v1',
          adapterSha256,
          trainingConfigHash: 'sha256:training-config',
          adapterArtifact: {
            file: 'adapter.safetensors',
            sizeBytes: adapterBytes.length,
          },
        },
      }),
      artifactPath,
    })
    const envelope = await fs.readJson(exported.envelopePath)
    const published = await manager.publishArtifactToIpfs({
      envelopePath: exported.envelopePath,
    })
    const imported = await manager.importArtifactByCid({cid: published.cid})

    expect(envelope.attachments).toHaveLength(1)
    expect(envelope.attachments[0]).toMatchObject({
      role: 'local-ai-adapter-artifact',
      file: 'adapter.safetensors',
      sha256: adapterSha256,
      sizeBytes: adapterBytes.length,
      encoding: 'base64',
    })
    expect(imported.consumption).toMatchObject({
      imported: true,
      artifactType: 'local-ai-update-bundle',
      attachmentCount: 1,
    })
    expect(consumeVerifiedArtifact).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed Local AI adapter attachment encoding', async () => {
    const adapterBytes = Buffer.from('small-adapter-bytes')
    const adapterSha256 = sha256Hex(adapterBytes)
    const localAiRoot = path.join(tempDir, 'local-ai', 'bundles')
    const artifactPath = path.join(localAiRoot, 'adapter.safetensors')

    await fs.ensureDir(localAiRoot)
    await fs.writeFile(artifactPath, adapterBytes)

    const baseBundle = localAiBundle()
    const {manager} = createSignedManager({
      baseDir: tempDir,
      allowedBundleRoots: [localAiRoot],
    })
    const exported = await manager.exportSignedArtifact({
      artifactType: 'local-ai-update-bundle',
      payload: localAiBundle({
        payload: {
          ...baseBundle.payload,
          deltaType: 'lora_adapter',
          adapterFormat: 'peft_lora_v1',
          adapterSha256,
          trainingConfigHash: 'sha256:training-config',
          adapterArtifact: {
            file: 'adapter.safetensors',
            sizeBytes: adapterBytes.length,
          },
        },
      }),
      artifactPath,
    })
    const envelope = await fs.readJson(exported.envelopePath)

    envelope.attachments[0].contentBase64 = '!!!!'

    const verified = await manager.verifySignedArtifact({envelope})

    expect(verified.verification).toMatchObject({
      ok: false,
      reason: 'attachment_base64_invalid',
      hashValid: false,
    })
  })
})
