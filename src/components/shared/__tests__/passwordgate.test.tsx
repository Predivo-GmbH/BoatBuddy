import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'boatbuddy-unlocked'
const CORRECT_PASSWORD = 'correct'
// SHA-256("correct") in hex
const CORRECT_HASH =
  '15a596e3c98c407e043751ff3b21ff0358a1bdfdf3fe948b1523893a8e5de2e8'

// Provide crypto.subtle for jsdom (Node's built-in webcrypto)
import { webcrypto } from 'node:crypto'
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
})

// ---------------------------------------------------------------------------
// sessionStorage mock
// ---------------------------------------------------------------------------

let mockStorage: Record<string, string> = {}

function setupStorageMock() {
  mockStorage = {}
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => mockStorage[key] ?? null
  )
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, val: string) => { mockStorage[key] = val }
  )
}

// ---------------------------------------------------------------------------
// Dynamic import helper — re-evaluates PasswordGate with fresh env each time
// ---------------------------------------------------------------------------

type PGType = typeof import('../PasswordGate')
let PasswordGate: PGType['PasswordGate']

async function loadPasswordGate() {
  vi.resetModules()
  vi.stubEnv('VITE_GATE_PASSWORD_HASH', CORRECT_HASH)
  const mod: PGType = await import('../PasswordGate')
  PasswordGate = mod.PasswordGate
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PasswordGate', () => {
  beforeEach(async () => {
    setupStorageMock()
    await loadPasswordGate()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  // -------------------------------------------------------------------------
  // Locked state
  // -------------------------------------------------------------------------

  describe('locked state (sessionStorage empty)', () => {
    it('renders the BoatBuddy heading', () => {
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.getByRole('heading', { name: 'BoatBuddy' })).toBeInTheDocument()
    })

    it('renders the subtitle prompt text', () => {
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.getByText('Passwort eingeben um fortzufahren')).toBeInTheDocument()
    })

    it('renders a password input with correct type and aria-label', () => {
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      const input = screen.getByLabelText('Passwort')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('renders the submit button labelled "Weiter"', () => {
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.getByRole('button', { name: 'Weiter' })).toBeInTheDocument()
    })

    it('does NOT render children when locked', () => {
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.queryByText('Protected')).not.toBeInTheDocument()
    })

    it('does NOT show the error message initially', () => {
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Unlocked state
  // -------------------------------------------------------------------------

  describe('unlocked state (sessionStorage pre-set)', () => {
    it('renders children when sessionStorage has unlock flag', () => {
      mockStorage[STORAGE_KEY] = 'true'
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.getByText('Protected')).toBeInTheDocument()
    })

    it('does NOT render the password form when unlocked', () => {
      mockStorage[STORAGE_KEY] = 'true'
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.queryByLabelText('Passwort')).not.toBeInTheDocument()
    })

    it('treats "false" as locked', () => {
      mockStorage[STORAGE_KEY] = 'false'
      render(<PasswordGate><div>Protected</div></PasswordGate>)
      expect(screen.queryByText('Protected')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Weiter' })).toBeInTheDocument()
    })

    it('renders nested children correctly when unlocked', () => {
      mockStorage[STORAGE_KEY] = 'true'
      render(
        <PasswordGate>
          <main><h2>Dashboard</h2><p>Welcome back</p></main>
        </PasswordGate>
      )
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByText('Welcome back')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Correct password submission
  // -------------------------------------------------------------------------

  describe('correct password submission', () => {
    it('unlocks and shows children after correct password', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), CORRECT_PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.getByText('Protected')).toBeInTheDocument()
      })
    })

    it('persists unlocked state to sessionStorage', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), CORRECT_PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(mockStorage[STORAGE_KEY]).toBe('true')
      })
    })

    it('hides the gate form after unlocking', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), CORRECT_PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Weiter' })).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Wrong password submission
  // -------------------------------------------------------------------------

  describe('wrong password submission', () => {
    it('shows "Falsches Passwort" error', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText('Falsches Passwort')).toBeInTheDocument()
      })
    })

    it('does NOT unlock or render children', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.queryByText('Protected')).not.toBeInTheDocument()
      })
    })

    it('clears the password input', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Passwort')).toHaveValue('')
      })
    })

    it('does NOT write to sessionStorage', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(mockStorage[STORAGE_KEY]).toBeUndefined()
      })
    })

    it('clears error when user starts typing again', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: 'Weiter' }))
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

      await user.type(screen.getByLabelText('Passwort'), 'a')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('allows retry — correct password after failed attempt', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      // Wrong attempt
      await user.type(screen.getByLabelText('Passwort'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: 'Weiter' }))
      await waitFor(() => expect(screen.getByText('Falsches Passwort')).toBeInTheDocument())

      // Correct attempt
      await user.type(screen.getByLabelText('Passwort'), CORRECT_PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.getByText('Protected')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Form behaviour
  // -------------------------------------------------------------------------

  describe('form behaviour', () => {
    it('submits on Enter keypress', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), CORRECT_PASSWORD)
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Protected')).toBeInTheDocument()
      })
    })

    it('shows error when submitting empty password', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.click(screen.getByRole('button', { name: 'Weiter' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('updates the input value as user types', async () => {
      const user = userEvent.setup()
      render(<PasswordGate><div>Protected</div></PasswordGate>)

      await user.type(screen.getByLabelText('Passwort'), 'mypassword')
      expect(screen.getByLabelText('Passwort')).toHaveValue('mypassword')
    })
  })
})
