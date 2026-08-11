# BoatBuddy

Private web app for a small group of friends who share a Mastercraft boat (bookings, costs, logbook). German-only UI. Not a public SaaS.

## Stack
React + TypeScript + Vite + Tailwind + shadcn/ui + Supabase (Postgres / Auth / Deno edge functions). Repo: `Arivioo/BoatBuddy`, default branch `main`.

## Dev
- Install: `npm install`
- Dev server: `npm run dev`
- Before pushing: `npm run lint` && `npm run test:coverage` && `npm run build` (validate locally first).

## Deploy (staging-first, Metanet FTP, NEVER Vercel)
Follows the canonical deploy standard: `C:\Business\Internal Projects\standards\deploy-standard.md` (do NOT hand-write or "fix" the deploy config; copy from `project-starter`).
- **Push to `main` deploys STAGING only** (`staging.boatbuddy.predivo.ch`, htpasswd + noindex). `staging-gates.yml` runs the E2E gate.
- **PRODUCTION (`boatbuddy.predivo.ch`) is a manual promotion** (`gh workflow run deploy.yml -f confirm=deploy`), gated on green staging. Claude owns the promotion as the same-session closeout of a ready change (name the environment every time).
- Supabase keep-alive runs daily (GraphQL ping); gitleaks scans every push.

## How we work (canonical, do not duplicate here)
- A-to-Z workflow + phase gates: `C:\Business\Templates\1-Person AI Business Playbook\docs\ONE_PERSON_AI_BUSINESS_WORKFLOW.md`
- Design pipeline: `C:\Business\Templates\project-starter\docs\DESIGN_PIPELINE.md`
- Audit/QC framework: `C:\Business\Audits\audit-framework.md`
- Operating doctrine, gates, boundaries: the global `~/.claude/CLAUDE.md` + the Pre-Action Checklist.
- Human QA gate: after any UI change, run Playwright (desktop + mobile), check console, screenshot, before declaring done.

## Project-specific
- German-only copy: write `ä ö ü ß` as verified UTF-8 (mojibake verify-back `Ã`/`â€`); prefer server-side generation for accented DB text.
- Keep `docs/FEATURE_REGISTRY.md` + `app`/`e2e` tests in sync when adding/removing features.
