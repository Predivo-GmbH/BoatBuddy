// @vitest-environment node
import { it, expect, vi } from 'vitest'
import { createPhoneHandler, type UploadSession } from './handler.ts'

const token = 'a'.repeat(32) // synthetic 128-bit capability fixture
const now = 1_800_000_000_000
function harness() {
  const deps = {
    now: () => now,
    lookup: vi.fn(async (): Promise<UploadSession | null> => ({ id: 'fixture', status: 'pending', expires_at: new Date(now + 600_000).toISOString() })),
    upload: vi.fn(async () => {}), complete: vi.fn(async () => true),
  }
  return { deps, handle: createPhoneHandler(deps) }
}
function req(value = token, type = 'application/json', body: BodyInit = '{}') {
  return new Request('http://offline/phone-upload', { method: 'POST', headers: { 'x-upload-token': value, 'Content-Type': type }, body })
}
const photo = () => req(token, 'image/jpeg', new Uint8Array([255, 216, 255, 224]))
it('validates one capability without returning row data', async () => {
  const { handle, deps } = harness(); const res = await handle(req())
  expect(await res.json()).toEqual({ valid: true }); expect(deps.upload).not.toHaveBeenCalled()
  expect(res.headers.get('cache-control')).toBe('no-store')
})
it.each(['', 'short', '../other', 'f'.repeat(33)])('rejects invalid capabilities before database access (%#)', async value => {
  const { handle, deps } = harness(); expect((await handle(req(value))).status).toBe(404)
  expect(deps.lookup).not.toHaveBeenCalled()
})
it.each([null, { id: 'x', status: 'uploaded', expires_at: new Date(now + 600_000).toISOString() },
  { id: 'x', status: 'pending', expires_at: new Date(now).toISOString() },
  { id: 'x', status: 'pending', expires_at: 'invalid' }])('refuses missing, replayed and expired uploads (%#)', async row => {
  const { deps } = harness(); deps.lookup.mockResolvedValue(row)
  expect((await createPhoneHandler(deps)(photo())).status).toBe(404); expect(deps.upload).not.toHaveBeenCalled()
})
it('uploads only the fixed photo path and completes only that token', async () => {
  const { handle, deps } = harness(); expect((await handle(photo())).status).toBe(200)
  expect(deps.upload).toHaveBeenCalledWith(`phone-uploads/${token}/photo.jpg`, expect.any(Uint8Array))
  expect(deps.complete).toHaveBeenCalledWith(token, `phone-uploads/${token}/photo.jpg`, new Date(now).toISOString())
})
it('rejects an expiry/race during upload without reporting success', async () => {
  const { deps } = harness(); deps.complete.mockResolvedValue(false)
  expect((await createPhoneHandler(deps)(photo())).status).toBe(409)
})
it.each(['text/html', 'application/pdf'])('refuses nonphoto content types (%#)', async type => {
  const { handle, deps } = harness(); expect((await handle(req(token, type))).status).toBe(415)
  expect(deps.upload).not.toHaveBeenCalled()
})
it('refuses a forged image MIME type', async () => {
  expect((await harness().handle(req(token, 'image/jpeg', '<html>'))).status).toBe(415)
})
it('limits actual photo bytes', async () => {
  const { handle, deps } = harness()
  expect((await handle(req(token, 'image/jpeg', new Uint8Array(10 * 1024 * 1024 + 1)))).status).toBe(413)
  expect(deps.upload).not.toHaveBeenCalled()
})
it('sanitizes backend errors', async () => {
  const { deps } = harness(); deps.lookup.mockRejectedValue(new Error('private detail'))
  const res = await createPhoneHandler(deps)(req()); expect(res.status).toBe(503)
  expect(await res.text()).not.toContain('private')
})
