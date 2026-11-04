import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhoneUpload } from '../usePhoneUpload'

const mocks = vi.hoisted(() => ({ single: vi.fn(), extract: vi.fn(), toast: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase', () => {
  const query = {
    insert: vi.fn(() => query), select: vi.fn(() => query), eq: vi.fn(() => query), single: mocks.single,
  }
  mocks.from.mockReturnValue(query)
  return { supabase: { from: mocks.from } }
})
vi.mock('@/lib/extractInvoice', () => ({ extractFromStorage: mocks.extract }))
vi.mock('sonner', () => ({ toast: { error: mocks.toast } }))

beforeEach(() => {
  vi.useFakeTimers()
  mocks.single.mockReset()
  mocks.extract.mockReset()
  mocks.toast.mockClear()
  mocks.from.mockClear()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('phone upload completion without public Realtime', () => {
  it('polls the new session and extracts exactly once after upload', async () => {
    mocks.single.mockResolvedValueOnce({ data: { id: 'session-id', expires_at: new Date(Date.now() + 600_000).toISOString() }, error: null })
      .mockResolvedValue({ data: { status: 'uploaded', storage_path: 'phone-uploads/test/photo.jpg' } })
    mocks.extract.mockResolvedValue({ betrag: 25 })
    const onExtracted = vi.fn()
    const { result } = renderHook(() => usePhoneUpload({ onExtracted }))
    await act(async () => { await result.current.createSession() })
    expect(result.current.session?.token).toMatch(/^[a-f0-9]{32}$/)
    expect(result.current.session?.uploadUrl).toContain('/phone-upload?token=')
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(onExtracted).toHaveBeenCalledWith({ status: 'ready', data: { betrag: 25 }, dokument_pfad: 'phone-uploads/test/photo.jpg' })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(mocks.extract).toHaveBeenCalledTimes(1)
    expect(mocks.single).toHaveBeenCalledTimes(2)
  })

  it('keeps polling while pending and stops on cancellation', async () => {
    mocks.single.mockResolvedValueOnce({ data: { id: 'session-id', expires_at: new Date(Date.now() + 600_000).toISOString() }, error: null })
      .mockResolvedValue({ data: { status: 'pending', storage_path: null } })
    const { result } = renderHook(() => usePhoneUpload())
    await act(async () => { await result.current.createSession() })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(mocks.single).toHaveBeenCalledTimes(3)
    act(() => { result.current.cancelSession() })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(mocks.single).toHaveBeenCalledTimes(3)
    expect(result.current.session).toBeNull()
  })

  it('stops polling when the upload dialog unmounts', async () => {
    mocks.single.mockResolvedValueOnce({ data: { id: 'session-id', expires_at: new Date(Date.now() + 600_000).toISOString() }, error: null })
    const { result, unmount } = renderHook(() => usePhoneUpload())
    await act(async () => { await result.current.createSession() })
    unmount()
    await vi.advanceTimersByTimeAsync(4000)
    expect(mocks.single).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed extraction available for manual receipt entry', async () => {
    mocks.single.mockResolvedValueOnce({ data: { id: 'session-id', expires_at: new Date(Date.now() + 600_000).toISOString() }, error: null })
      .mockResolvedValue({ data: { status: 'uploaded', storage_path: 'phone-uploads/test/photo.jpg' } })
    mocks.extract.mockRejectedValue(new Error('fixture extraction failure'))
    const onExtracted = vi.fn()
    const { result } = renderHook(() => usePhoneUpload({ onExtracted }))
    await act(async () => { await result.current.createSession() })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(onExtracted).toHaveBeenCalledWith({ status: 'error', dokument_pfad: 'phone-uploads/test/photo.jpg' })
  })
})
