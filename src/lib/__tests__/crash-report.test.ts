import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isChunkLoadError, reloadOnceForChunk } from '../crash-report'

describe('isChunkLoadError', () => {
  it('detects "Failed to fetch dynamically imported module"', () => {
    const error = new Error('Failed to fetch dynamically imported module: https://example.com/assets/foo-abc123.js')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects "Loading chunk" failures', () => {
    const error = new Error('Loading chunk 42 failed.')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects "error loading dynamically imported module"', () => {
    const error = new Error('error loading dynamically imported module: https://example.com/assets/bar-def456.js')
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('detects errors named ChunkLoadError', () => {
    const error = new Error('some webpack message')
    error.name = 'ChunkLoadError'
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('ignores a normal error', () => {
    const error = new Error('Cannot read properties of undefined')
    expect(isChunkLoadError(error)).toBe(false)
  })
})

describe('reloadOnceForChunk', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('reloads once for a given chunk, then returns false on the same chunk', () => {
    const reload = vi.fn()
    const error = new Error('Failed to fetch dynamically imported module: https://example.com/assets/foo-abc123.js')

    const first = reloadOnceForChunk(error, reload)
    expect(first).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    const second = reloadOnceForChunk(error, reload)
    expect(second).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads independently for a different chunk', () => {
    const reload = vi.fn()
    const errorA = new Error('Failed to fetch dynamically imported module: https://example.com/assets/foo-abc123.js')
    const errorB = new Error('Failed to fetch dynamically imported module: https://example.com/assets/bar-def456.js')

    expect(reloadOnceForChunk(errorA, reload)).toBe(true)
    expect(reloadOnceForChunk(errorB, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
