const {
  __test__: {sanitizeLocalAiRuntimePayload},
} = require('./preload')

describe('preload bridge sanitizers', () => {
  it('preserves bounded Local AI chat fallback controls across IPC', () => {
    const payload = sanitizeLocalAiRuntimePayload({
      model: 'qwen3.6:27b',
      generationOptions: {
        temperature: 0.2,
        num_predict: 4096,
        num_ctx: 65536,
      },
      fallbackGenerationOptions: {
        temperature: 0,
        num_predict: 32,
        num_ctx: 8192,
      },
      modelFallbacks: [
        'qwen3.5:9b',
        'x'.repeat(300),
        '',
        '__proto__',
        ...Array.from({length: 12}, (_, index) => `fallback-${index}`),
      ],
      visionModelFallbacks: ['molmo2:4b'],
    })

    expect(payload).toMatchObject({
      model: 'qwen3.6:27b',
      generationOptions: {
        temperature: 0.2,
        num_predict: 2048,
        num_ctx: 32768,
      },
      fallbackGenerationOptions: {
        temperature: 0,
        num_predict: 32,
        num_ctx: 8192,
      },
      visionModelFallbacks: ['molmo2:4b'],
    })
    expect(payload.modelFallbacks).toHaveLength(7)
    expect(payload.modelFallbacks[0]).toBe('qwen3.5:9b')
    expect(payload.modelFallbacks[1]).toHaveLength(256)
    expect(payload.modelFallbacks).not.toContain('')
  })

  it('does not invent fallback generation options when none were supplied', () => {
    const payload = sanitizeLocalAiRuntimePayload({
      generationOptions: {
        temperature: 0,
        num_predict: 128,
      },
    })

    expect(payload.generationOptions).toMatchObject({
      temperature: 0,
      num_predict: 128,
    })
    expect(payload.fallbackGenerationOptions).toBeNull()
    expect(payload.modelFallbacks).toEqual([])
    expect(payload.visionModelFallbacks).toEqual([])
  })
})
