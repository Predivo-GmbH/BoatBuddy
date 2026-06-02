import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn (class name utility)', () => {
  // -------------------------------------------------------------------------
  // Basic merging
  // -------------------------------------------------------------------------

  describe('basic class name merging', () => {
    it('returns a single class name unchanged', () => {
      expect(cn('foo')).toBe('foo')
    })

    it('joins multiple class names with a space', () => {
      expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz')
    })

    it('returns an empty string when called with no arguments', () => {
      expect(cn()).toBe('')
    })

    it('returns an empty string when all arguments are empty strings', () => {
      expect(cn('', '', '')).toBe('')
    })
  })

  // -------------------------------------------------------------------------
  // Falsy value handling (clsx behaviour)
  // -------------------------------------------------------------------------

  describe('falsy value handling', () => {
    it('ignores undefined values', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar')
    })

    it('ignores null values', () => {
      expect(cn('foo', null, 'bar')).toBe('foo bar')
    })

    it('ignores false values', () => {
      expect(cn('foo', false, 'bar')).toBe('foo bar')
    })

    it('ignores 0 (falsy number)', () => {
      // clsx treats 0 as falsy — included for completeness
      expect(cn('foo', 0 as unknown as string, 'bar')).toBe('foo bar')
    })

    it('handles a mix of falsy and truthy values', () => {
      expect(cn(undefined, null, false, 'visible', undefined)).toBe('visible')
    })
  })

  // -------------------------------------------------------------------------
  // Conditional class names (clsx object/array syntax)
  // -------------------------------------------------------------------------

  describe('conditional classes via object syntax', () => {
    it('includes a class when its condition is true', () => {
      expect(cn({ active: true })).toBe('active')
    })

    it('excludes a class when its condition is false', () => {
      expect(cn({ active: false })).toBe('')
    })

    it('handles mixed true/false conditions', () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
    })

    it('combines static classes with conditional object classes', () => {
      expect(cn('base', { extra: true, hidden: false })).toBe('base extra')
    })
  })

  describe('conditional classes via array syntax', () => {
    it('flattens a plain array of class names', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar')
    })

    it('handles nested arrays', () => {
      expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz')
    })

    it('handles arrays with falsy entries', () => {
      expect(cn(['foo', false, undefined, 'bar'])).toBe('foo bar')
    })
  })

  // -------------------------------------------------------------------------
  // Tailwind class deduplication (twMerge behaviour)
  // -------------------------------------------------------------------------

  describe('Tailwind class deduplication', () => {
    it('keeps only the last conflicting Tailwind utility (text-color)', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('keeps only the last conflicting padding utility', () => {
      expect(cn('p-2', 'p-4')).toBe('p-4')
    })

    it('keeps only the last conflicting margin utility', () => {
      expect(cn('m-2', 'm-8')).toBe('m-8')
    })

    it('keeps only the last conflicting background-color utility', () => {
      expect(cn('bg-red-500', 'bg-green-300')).toBe('bg-green-300')
    })

    it('preserves non-conflicting utilities alongside deduplicated ones', () => {
      expect(cn('flex', 'text-sm', 'text-lg', 'font-bold')).toBe(
        'flex text-lg font-bold'
      )
    })

    it('deduplicates across conditional and static classes', () => {
      expect(cn('p-2', { 'p-4': true })).toBe('p-4')
    })

    it('handles axis-specific padding without stripping unrelated axis', () => {
      // px-2 and py-4 are not conflicting — both should survive
      expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
    })

    it('resolves px vs p conflict in favour of the last one', () => {
      // p-4 covers all axes, so px-2 followed by p-4 → p-4 wins
      expect(cn('px-2', 'p-4')).toBe('p-4')
    })

    it('resolves font-size conflict (text-sm vs text-xl)', () => {
      expect(cn('text-sm', 'text-xl')).toBe('text-xl')
    })
  })

  // -------------------------------------------------------------------------
  // Real-world usage patterns from the codebase
  // -------------------------------------------------------------------------

  describe('real-world patterns', () => {
    it('merges base component class with a caller-supplied override', () => {
      // Mirrors how BoatIcon uses cn('h-5 w-5', className)
      expect(cn('h-5 w-5', 'h-6 w-6')).toBe('h-6 w-6')
    })

    it('applies only the variant class when the base is empty', () => {
      expect(cn('', 'text-accent')).toBe('text-accent')
    })

    it('handles many arguments without duplicating separating spaces', () => {
      const result = cn('a', 'b', 'c', 'd', 'e')
      expect(result.split(' ').length).toBe(5)
    })

    it('preserves non-Tailwind custom classes untouched', () => {
      expect(cn('custom-class', 'another-custom')).toBe(
        'custom-class another-custom'
      )
    })

    it('works with template-literal-style class strings containing spaces', () => {
      expect(cn('flex items-center', 'gap-2')).toBe('flex items-center gap-2')
    })
  })
})
