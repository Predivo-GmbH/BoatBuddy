import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

// cn utility relies on clsx + tailwind-merge — no mock needed, real impl works in jsdom

const MockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg data-testid="mock-icon" {...props} />
)

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { PageHeader } from '../PageHeader'
import { StatCard } from '../StatCard'
import { Footer } from '../Footer'
import { ConfirmDialog } from '../ConfirmDialog'
import { ErrorBoundary } from '../ErrorBoundary'

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="My Fleet" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Fleet')
  })

  it('renders subtitle when provided', () => {
    render(<PageHeader title="My Fleet" subtitle="Manage your boats" />)
    expect(screen.getByText('Manage your boats')).toBeInTheDocument()
  })

  it('does not render subtitle element when omitted', () => {
    render(<PageHeader title="My Fleet" />)
    expect(screen.queryByText('Manage your boats')).not.toBeInTheDocument()
  })

  it('renders the action slot', () => {
    render(
      <PageHeader
        title="My Fleet"
        action={<button>Add Boat</button>}
      />
    )
    expect(screen.getByRole('button', { name: 'Add Boat' })).toBeInTheDocument()
  })

  it('renders title and action together without subtitle', () => {
    render(
      <PageHeader
        title="Trips"
        action={<a href="/new">New Trip</a>}
      />
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trips')
    expect(screen.getByRole('link', { name: 'New Trip' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Total Trips" value="42" icon={MockIcon} />)
    expect(screen.getByText('Total Trips')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<StatCard label="Distance" value="120 nm" subtitle="This month" icon={MockIcon} />)
    expect(screen.getByText('This month')).toBeInTheDocument()
  })

  it('does not render subtitle element when omitted', () => {
    render(<StatCard label="Distance" value="120 nm" icon={MockIcon} />)
    // Only label + value paragraphs should exist; no third text
    expect(screen.queryByText('This month')).not.toBeInTheDocument()
  })

  it('renders the icon component', () => {
    render(<StatCard label="Fuel" value="50 L" icon={MockIcon} />)
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument()
  })

  it('applies gradient class when gradient prop is set', () => {
    const { container } = render(
      <StatCard label="Fuel" value="50 L" icon={MockIcon} gradient="green" />
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('card-gradient-green')
  })

  it('does not apply gradient class when gradient is "none"', () => {
    const { container } = render(
      <StatCard label="Fuel" value="50 L" icon={MockIcon} gradient="none" />
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).not.toContain('card-gradient-none')
    expect(card.className).not.toMatch(/card-gradient-/)
  })

  it('applies a custom className', () => {
    const { container } = render(
      <StatCard label="Fuel" value="50 L" icon={MockIcon} className="custom-class" />
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('custom-class')
  })

  it('applies accentColor when provided instead of default card-accent-top', () => {
    const { container } = render(
      <StatCard label="Fuel" value="50 L" icon={MockIcon} accentColor="card-accent-red" />
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('card-accent-red')
    expect(card.className).not.toContain('card-accent-top')
  })
})

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

describe('Footer', () => {
  it('renders the copyright text', () => {
    render(<Footer />)
    expect(
      screen.getByText('BoatBuddy by Predivo GmbH. Alle Rechte vorbehalten.')
    ).toBeInTheDocument()
  })

  it('renders the tagline text', () => {
    render(<Footer />)
    // The tagline contains a middot HTML entity rendered as text
    const tagline = screen.getByText(/Swiss-made/)
    expect(tagline).toBeInTheDocument()
    expect(tagline).toHaveTextContent('Swiss-made')
  })

  it('renders a footer element as the root', () => {
    const { container } = render(<Footer />)
    expect(container.querySelector('footer')).toBeInTheDocument()
  })

  it('renders the Shield icon (svg) inside the tagline span', () => {
    const { container } = render(<Footer />)
    // lucide-react icons render as <svg> elements
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

describe('ConfirmDialog', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when open is false', () => {
    render(
      <ConfirmDialog open={false} onConfirm={onConfirm} onCancel={onCancel} />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when open is true', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders default title and description', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />
    )
    expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument()
    expect(
      screen.getByText('Dieser Vorgang kann nicht rückgängig gemacht werden.')
    ).toBeInTheDocument()
  })

  it('renders custom title, description and confirmLabel', () => {
    render(
      <ConfirmDialog
        open={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
        title="Trip löschen?"
        description="Das kann nicht rückgängig gemacht werden."
        confirmLabel="Ja, löschen"
      />
    )
    expect(screen.getByText('Trip löschen?')).toBeInTheDocument()
    expect(screen.getByText('Das kann nicht rückgängig gemacht werden.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ja, löschen' })).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} confirmLabel="Löschen" />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when backdrop is clicked', () => {
    const { container } = render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />
    )
    // The backdrop is the fixed overlay div (first child of the portal)
    const backdrop = container.ownerDocument.querySelector(
      '.fixed.inset-0'
    ) as HTMLElement
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape key is pressed', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call onCancel on Escape when isPending is true', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} isPending={true} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('disables both buttons when isPending is true', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} isPending={true} />
    )
    expect(screen.getByRole('button', { name: /Löschen/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeDisabled()
  })

  it('does not disable buttons when isPending is false', () => {
    render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} isPending={false} />
    )
    expect(screen.getByRole('button', { name: 'Löschen' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).not.toBeDisabled()
  })

  it('does not call onCancel when backdrop is clicked and isPending is true', () => {
    const { container } = render(
      <ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} isPending={true} />
    )
    const backdrop = container.ownerDocument.querySelector(
      '.fixed.inset-0'
    ) as HTMLElement
    fireEvent.click(backdrop)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

function Bomb() {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress the expected React error output so the test log stays clean
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>Everything is fine</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('Everything is fine')).toBeInTheDocument()
  })

  it('shows the fallback heading when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Etwas ist schiefgelaufen'
    )
  })

  it('shows the reload instruction text when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText('Bitte lade die Seite neu.')).toBeInTheDocument()
  })

  it('renders a reload button when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(
      screen.getByRole('button', { name: 'Seite neu laden' })
    ).toBeInTheDocument()
  })

  it('does not show the fallback UI when children render successfully', () => {
    render(
      <ErrorBoundary>
        <span>All good</span>
      </ErrorBoundary>
    )
    expect(screen.queryByText('Etwas ist schiefgelaufen')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seite neu laden' })).not.toBeInTheDocument()
  })
})
