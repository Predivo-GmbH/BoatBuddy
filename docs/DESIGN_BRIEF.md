# BoatBuddy — Design Brief

## Product
Private web app for 3 friends sharing a Mastercraft X2 wake-surfing boat. German UI only. Hosted at `boatbuddy.predivo.ch` behind a shared password gate.

## Tech Stack
React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Query v5 · Supabase (DB only) · Recharts · date-fns

## Theme: Nautical
Inspired by deep water, sail accents, and clean Swiss aesthetics.

### Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| background | `#F8FAFB` | `#0A1628` | Page background |
| foreground | `#0C1B33` | `#E8F0F7` | Primary text |
| muted | `#EEF3F7` | `#112340` | Secondary surfaces |
| muted-foreground | `#4A6080` | `#8AAEC6` | Secondary text |
| accent | `#0077B6` | `#38B6E8` | Buttons, links, active states |
| success | `#2D9E6B` | `#4ADE80` | Paid, positive values |
| warning | `#E09B3D` | `#FBBF24` | Pending items |
| destructive | `#D93F3F` | `#F87171` | Unpaid, delete actions |
| card | `#FFFFFF` | `#0F1F38` | Card backgrounds |
| border | `#C8D9E6` | `#1E3A55` | Borders, dividers |

### Person Colors
| Person | Light | Dark | Status |
|--------|-------|------|--------|
| Roger | `#0D9488` (teal) | `#2DD4BF` | Active owner |
| Dani | `#F59E0B` (amber) | `#FBBF24` | Active owner |
| Pedro | `#9CA3AF` (gray) | `#6B7280` | Historical (exited) |

### Typography
- Font: Inter (system fallback: ui-sans-serif, system-ui)
- Numbers: `tabular-nums` for financial data alignment

### Border Radius
- `sm`: 0.25rem · `default`: 0.5rem · `md`: 0.75rem · `lg`: 1rem

## CSS Patterns (defined in `src/index.css`)

| Class | Effect |
|-------|--------|
| `.card-premium` | Hover lift + glow + accent border |
| `.card-glow` | Accent-tinted box-shadow on hover |
| `.card-gradient-{green,red,blue,amber}` | Subtle gradient tint cards |
| `.card-glass` | Frosted glass card |
| `.card-accent-top` | 2px accent top border |
| `.slide-up` | Entrance animation (0.5s) |
| `.slide-up-stagger` | Staggered children entrance (60ms delay) |
| `.section-fade-in` | Fade-in for tab content |
| `.skeleton-shimmer` | Loading skeleton with shimmer |
| `.table-premium` | Sticky header with backdrop blur |
| `.row-accent` | Left border accent on hover |
| `.row-lift` | Horizontal shift on hover |
| `.today-pulse` | Calendar today indicator pulse |
| `.action-card` | Quick-action card with scale hover |
| `.press-scale` | Button press feedback |
| `.bar-grow` | Animated progress bar |
| `.stat-glow` | Subtle text glow for stat numbers |
| `.text-gradient-accent` | Gradient text (accent → success) |

All animations respect `prefers-reduced-motion: reduce`.

## Design Tokens
Machine-readable tokens at `docs/design-tokens.json`.

## Pages (6)
1. **Dashboard** — Stat cards, next reservation, quick actions
2. **Finanzen** — Tabs: Übersicht / Ausgaben / Einnahmen. Charts + tables
3. **Kalender** — Monthly grid, color-coded reservations + vacations
4. **Gast-Sessions** — Guest wake-surfing tracking + per-person stats
5. **Nutzungslog** — Season stats + boat usage log with activities
6. **Boot** — Tabs: Eigentümer / Abrechnung / Wartung / Gentleman-Rules

## Footer
BoatBuddy by Predivo GmbH. All rights reserved.
