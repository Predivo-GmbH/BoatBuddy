import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

import { AktivitaetenEditor } from '@/components/nutzung/AktivitaetenEditor'
import { BottomNav } from '@/components/shared/BottomNav'
import type { Aktivitaet } from '@/types'

// ---------------------------------------------------------------------------
// AktivitaetenEditor
// ---------------------------------------------------------------------------

describe('AktivitaetenEditor', () => {
  it('renders "Aktivität hinzufügen" button when value is empty', () => {
    const onChange = vi.fn()
    render(<AktivitaetenEditor value={[]} onChange={onChange} />)

    expect(screen.getByRole('button', { name: /Aktivität hinzufügen/i })).toBeInTheDocument()
  })

  it('does not render any row controls when value is empty', () => {
    const onChange = vi.fn()
    render(<AktivitaetenEditor value={[]} onChange={onChange} />)

    expect(screen.queryByLabelText('Aktivität entfernen')).not.toBeInTheDocument()
  })

  it('renders one row with a type select and duration input for each existing activity', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [
      { typ: 'wakesurfen', dauer_min: 45 },
      { typ: 'cruisen', dauer_min: 60 },
    ]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    expect(selects[0]).toHaveValue('wakesurfen')
    expect(selects[1]).toHaveValue('cruisen')

    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveValue(45)
    expect(inputs[1]).toHaveValue(60)
  })

  it('renders a remove button with correct aria-label for each activity', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [
      { typ: 'wakesurfen', dauer_min: 30 },
      { typ: 'wakeboarden', dauer_min: 20 },
    ]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    const removeButtons = screen.getAllByLabelText('Aktivität entfernen')
    expect(removeButtons).toHaveLength(2)
  })

  it('clicking "Aktivität hinzufügen" calls onChange with a new default row appended', () => {
    const onChange = vi.fn()
    const existing: Aktivitaet[] = [{ typ: 'cruisen', dauer_min: 60 }]
    render(<AktivitaetenEditor value={existing} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Aktivität hinzufügen/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([
      { typ: 'cruisen', dauer_min: 60 },
      { typ: 'wakesurfen', dauer_min: 30 },
    ])
  })

  it('clicking add on an empty list calls onChange with a single default row', () => {
    const onChange = vi.fn()
    render(<AktivitaetenEditor value={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Aktivität hinzufügen/i }))

    expect(onChange).toHaveBeenCalledWith([{ typ: 'wakesurfen', dauer_min: 30 }])
  })

  it('changing the activity type select calls onChange with the updated type', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [{ typ: 'wakesurfen', dauer_min: 30 }]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'wakeboarden' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([{ typ: 'wakeboarden', dauer_min: 30 }])
  })

  it('changing the type of the second row leaves the first row untouched', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [
      { typ: 'wakesurfen', dauer_min: 30 },
      { typ: 'cruisen', dauer_min: 45 },
    ]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'sonstiges' } })

    expect(onChange).toHaveBeenCalledWith([
      { typ: 'wakesurfen', dauer_min: 30 },
      { typ: 'sonstiges', dauer_min: 45 },
    ])
  })

  it('changing the duration input calls onChange with the updated dauer_min', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [{ typ: 'wakesurfen', dauer_min: 30 }]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([{ typ: 'wakesurfen', dauer_min: 90 }])
  })

  it('entering an invalid duration falls back to 1', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [{ typ: 'wakesurfen', dauer_min: 30 }]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith([{ typ: 'wakesurfen', dauer_min: 1 }])
  })

  it('clicking the remove button removes the activity at that index', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [
      { typ: 'wakesurfen', dauer_min: 30 },
      { typ: 'cruisen', dauer_min: 60 },
      { typ: 'wakeboarden', dauer_min: 20 },
    ]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    const removeButtons = screen.getAllByLabelText('Aktivität entfernen')
    // Remove the middle item (index 1)
    fireEvent.click(removeButtons[1])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([
      { typ: 'wakesurfen', dauer_min: 30 },
      { typ: 'wakeboarden', dauer_min: 20 },
    ])
  })

  it('clicking remove on the only activity results in an empty array', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [{ typ: 'wakesurfen', dauer_min: 30 }]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Aktivität entfernen'))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('clicking remove on the first of two activities removes only the first', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [
      { typ: 'cruisen', dauer_min: 45 },
      { typ: 'sonstiges', dauer_min: 15 },
    ]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    const removeButtons = screen.getAllByLabelText('Aktivität entfernen')
    fireEvent.click(removeButtons[0])

    expect(onChange).toHaveBeenCalledWith([{ typ: 'sonstiges', dauer_min: 15 }])
  })

  it('renders all four activity type options in each select', () => {
    const onChange = vi.fn()
    const activities: Aktivitaet[] = [{ typ: 'wakesurfen', dauer_min: 30 }]
    render(<AktivitaetenEditor value={activities} onChange={onChange} />)

    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
    expect(options).toEqual(['wakesurfen', 'wakeboarden', 'cruisen', 'sonstiges'])
  })

  it('duration input has min attribute of 1', () => {
    const onChange = vi.fn()
    render(<AktivitaetenEditor value={[{ typ: 'wakesurfen', dauer_min: 30 }]} onChange={onChange} />)

    expect(screen.getByRole('spinbutton')).toHaveAttribute('min', '1')
  })
})

// ---------------------------------------------------------------------------
// BottomNav
// ---------------------------------------------------------------------------

describe('BottomNav', () => {
  const renderNav = (initialPath = '/dashboard') =>
    render(
      <MemoryRouter initialEntries={[initialPath]}>
        <BottomNav />
      </MemoryRouter>
    )

  it('renders a nav element with role navigation', () => {
    renderNav()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders all 6 navigation labels', () => {
    renderNav()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Finanzen')).toBeInTheDocument()
    expect(screen.getByText('Kalender')).toBeInTheDocument()
    expect(screen.getByText('Gäste')).toBeInTheDocument()
    expect(screen.getByText('Nutzung')).toBeInTheDocument()
    expect(screen.getByText('Boot')).toBeInTheDocument()
  })

  it('links point to the correct routes', () => {
    renderNav()

    const links = screen.getAllByRole('link')
    const hrefs = links.map(link => link.getAttribute('href'))

    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/finanzen')
    expect(hrefs).toContain('/kalender')
    expect(hrefs).toContain('/gastsessions')
    expect(hrefs).toContain('/nutzung')
    expect(hrefs).toContain('/boot')
    expect(hrefs).toContain('/neuigkeiten')
  })

  it('renders exactly 7 links', () => {
    renderNav()
    expect(screen.getAllByRole('link')).toHaveLength(7)
  })

  it('nav element has lg:hidden class (hidden on large screens)', () => {
    renderNav()
    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('lg:hidden')
  })

  it('the active link (/dashboard) receives the text-accent class', () => {
    renderNav('/dashboard')
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink).toHaveClass('text-accent')
  })

  it('inactive links receive text-muted-foreground class, not text-accent', () => {
    renderNav('/dashboard')
    const finanzenLink = screen.getByRole('link', { name: /finanzen/i })
    expect(finanzenLink).toHaveClass('text-muted-foreground')
    expect(finanzenLink).not.toHaveClass('text-accent')
  })

  it('active link changes when a different path is active', () => {
    renderNav('/finanzen')
    const finanzenLink = screen.getByRole('link', { name: /finanzen/i })
    const homeLink = screen.getByRole('link', { name: /home/i })

    expect(finanzenLink).toHaveClass('text-accent')
    expect(homeLink).not.toHaveClass('text-accent')
  })

  it('nav is fixed to the bottom with the correct positioning classes', () => {
    renderNav()
    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('fixed')
    expect(nav).toHaveClass('bottom-0')
  })

  it('Home link href is /dashboard, not /home or /', () => {
    renderNav()
    const homeLink = screen.getByRole('link', { name: /home/i })
    expect(homeLink).toHaveAttribute('href', '/dashboard')
  })

  it('Gäste link href is /gastsessions', () => {
    renderNav()
    const gaesteLink = screen.getByRole('link', { name: /gäste/i })
    expect(gaesteLink).toHaveAttribute('href', '/gastsessions')
  })
})
