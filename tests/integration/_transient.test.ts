/**
 * Unit tests for the transient-upstream guard. These run everywhere (no staging
 * credentials needed) so the retry behaviour itself is never taken on trust.
 */
import { describe, test, expect } from 'vitest'
import { q, isTransient } from './_transient'

const html502 = {
  message:
    '<html>\n<head><title>502 Bad Gateway</title></head>\n<body>\n<center><h1>502 Bad Gateway</h1></center>\n<hr><center>cloudflare</center>\n</body>\n</html>\n',
}

describe('isTransient', () => {
  test('recognises the Cloudflare HTML 502 that broke the gate', () => {
    expect(isTransient(html502)).toBe(true)
  })

  test('does NOT treat a real Postgres error as transient', () => {
    expect(isTransient({ message: 'duplicate key value violates unique constraint' })).toBe(false)
  })

  test('handles null / undefined / empty errors', () => {
    expect(isTransient(null)).toBe(false)
    expect(isTransient(undefined)).toBe(false)
    expect(isTransient({})).toBe(false)
  })
})

describe('q', () => {
  test('retries a transient failure and returns the eventual success', async () => {
    let calls = 0
    const res = await q(() => {
      calls++
      return Promise.resolve(calls < 3 ? { data: null, error: html502 } : { data: { id: 'x' }, error: null })
    })
    expect(calls).toBe(3)
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ id: 'x' })
  })

  test('does NOT retry a 23505 unique violation — the suite deliberately expects one', async () => {
    let calls = 0
    const res = await q(() => {
      calls++
      return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
    })
    expect(calls).toBe(1)
    expect((res.error as { code: string }).code).toBe('23505')
  })

  test('a persistent outage fails with a message naming the outage, not an opaque assertion', async () => {
    let calls = 0
    await expect(
      q(() => {
        calls++
        return Promise.resolve({ data: null, error: html502 })
      }, 3),
    ).rejects.toThrow(/staging Supabase unreachable after 3 attempts.*502 Bad Gateway.*NOT a failure of the commit/s)
    expect(calls).toBe(3)
  })

  test('a clean first call costs exactly one attempt', async () => {
    let calls = 0
    const res = await q(() => {
      calls++
      return Promise.resolve({ data: [1], error: null })
    })
    expect(calls).toBe(1)
    expect(res.data).toEqual([1])
  })
})
