# BoatBuddy — Change Workflow

How changes reach production. There are **two distinct paths** — pick by *what* you are changing. The #1 mistake is treating a data change like a deploy (or vice-versa).

---

## 1. Code / schema changes → staging-first, manual prod gate

Anything in the repo: React code, `supabase/migrations/`, edge functions, `.htaccess`, CI config.

```
edit → commit → push main
        │
        ▼
   [CI: validate-staging]  lint · unit + integration tests
        │
        ▼
   [deploy-staging]        build w/ staging env → FTP staging.boatbuddy.predivo.ch
        │
        ▼
   [e2e-staging]           health check + Playwright E2E against staging
        │
        ▼
   ⛔ MANUAL GATE — production is NOT auto-deployed
        │
        ▼  (only via:  gh workflow run deploy.yml -f confirm=deploy)
   [deploy]                re-runs staging+E2E, then FTP boatbuddy.predivo.ch
```

- **Push to `main` deploys to STAGING only.** It never touches production.
- **Production requires an explicit manual run** with the typed confirmation:
  `gh workflow run deploy.yml -f confirm=deploy` (or the "Run workflow" button → type `deploy`).
- DB schema changes are SQL files in `supabase/migrations/`. Since 2026-08-21 CI auto-applies them: `scripts/apply-migrations.mjs` runs on both deploy lanes before the edge-function deploy (staging on push, production on the manual promotion run). Migrations reach staging first, then production — never apply one straight to prod manually.

## 2. Business / operational data → through the app UI

The real boat's records: ownership shares, account balance, expenses, contributions, reservations, news entries, gentleman-rules.

- **This is not a deploy.** Staging-first does not apply — staging has a *separate* test database, so editing real numbers there proves nothing.
- **Edit through the app's own UI** (Boot › Eigentümer "Bearbeiten", Finanzen forms, Neuigkeiten "Neuer Eintrag", etc.). The UI runs validation + the changelog triggers, so the data stays consistent and self-documents in Neuigkeiten.
- If a routine operation has **no UI**, that is a product gap → build the feature, don't hand-edit the DB. (Example: the season/account reset is now Boot › Abrechnung › "Konto zurücksetzen".)

## 3. Direct production DB writes → break-glass only

Writing prod rows with the service-role key (REST/SQL) is **break-glass**, not routine. Allowed only when:
1. There is genuinely no UI **and** no time to build one (true incident), and
2. The change is recorded — what, why, and verified-back (re-read the stored value).

For any accented text (ä ö ü ß) written through a tool, write UTF-8 and **read it back**, grepping for `Ã` / `Â` / `â€` before declaring done (see the global umlaut rule).

---

## Environments

| | Production | Staging |
|---|---|---|
| Frontend | https://boatbuddy.predivo.ch | https://staging.boatbuddy.predivo.ch (.htpasswd: `staging` / `<see docs/Credentials.txt>`, noindex) |
| Supabase | `xzythvxmuxmczuiophwp` | `svpewgbwousyheohlrtt` |
| Deploy trigger | manual `workflow_dispatch confirm=deploy` | push to `main` |

Credentials in `docs/Credentials.txt`.
