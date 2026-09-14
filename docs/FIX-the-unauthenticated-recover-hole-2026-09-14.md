# Anyone could make BoatBuddy send password-reset mail. Closed 2026-09-15.

## What was wrong

BoatBuddy's Supabase Auth (GoTrue) accepted a **tokenless, unauthenticated
`POST /auth/v1/recover`** on both projects. No captcha, no session, nothing — a stranger who
knew (or guessed) an address could make our project send password-reset mail to it, repeatedly,
with only Supabase's own per-address rate limiter in the way.

Measured live before the fix, with the reserved probe address
`signin-captcha-guard@boatbuddy-test.local` (the `.local` TLD is non-routable, so no real
person was mailed):

| project | ref | tokenless `POST /auth/v1/recover` |
|---|---|---|
| production | `xzythvxmuxmczuiophwp` | **HTTP 200 `{}` — open** |
| staging | `svpewgbwousyheohlrtt` | **HTTP 200 `{}` — open** |

This is the fleet-wide shape measured on 2026-09-14: 11 of 12 products would email a stranger's
password-reset request, and the sharp endpoint is `/recover`, not `/otp`.

## Why BoatBuddy's fix is not the fleet's fix

Everywhere else the fix is a Cloudflare Turnstile token threaded through the client's Auth call
sites, then `security_captcha_enabled` flipped on the project. **BoatBuddy has no Auth call
sites to thread it through.** Re-verified from source on 2026-09-15, independently of the
earlier session that first said so:

- `src/` contains exactly **one** Supabase reference: `createClient(url, anonKey)` in
  `src/lib/supabase.ts`. `.auth` is never touched anywhere in the repo.
- A repo-wide search of `src/`, `supabase/`, `e2e/`, `tests/`, `scripts/`, `playwright/`,
  `public/` and `docs/` for `supabase.auth.`, `signInWith`, `resetPasswordForEmail`, `signUp(`,
  `verifyOtp`, `getSession`, `getUser(` and any literal `/auth/v1/` returns hits in **one file
  only** — `scripts/signin-captcha.prod.test.mjs`, the guard itself.
- The app's actual access control is `src/components/shared/PasswordGate.tsx`: a **client-side
  SHA-256** comparison against `VITE_GATE_PASSWORD_HASH`, gating a `sessionStorage` flag. It
  makes **no network call at all**, so no Supabase Auth setting can affect it.
- `select count(*) from auth.users` returns **0 on both projects**. Not one account has ever
  existed.

So captcha would have gated a door that no code opens. Turning the email provider off removes
the door. That is not a preference between two valid options; it is what the code makes true.

## What changed

Two Management API calls, nothing else. No code change was needed to close the hole.

```
PATCH https://api.supabase.com/v1/projects/xzythvxmuxmczuiophwp/config/auth
PATCH https://api.supabase.com/v1/projects/svpewgbwousyheohlrtt/config/auth
     {"external_email_enabled": false}
```

The management token was read in-process from the gitignored `docs/Credentials.txt`; it was
never printed, never put on a command line, never logged.

GoTrue also nulls `security_captcha_provider` and `rate_limit_email_sent` when the email
provider goes off — both are email-path settings and both come back when it is re-enabled.

## Proof, red then green

Run in one sitting on DESKTOP-124K6MV, 2026-09-15:

```
node scripts/signin-captcha.prod.test.mjs     # BEFORE
FAIL - production (xzythvxmuxmczuiophwp): tokenless /recover must be refused ...
       found state=open (tokenless /recover accepted (HTTP 200) - the exact hole this guard exists for)
1 project(s) are in the wrong state - the sign-in-email hole is NOT fully closed.
exit 1

node scripts/signin-captcha.prod.test.mjs     # AFTER
ok - production (xzythvxmuxmczuiophwp): CLOSED via email-provider-off
ok - staging    (svpewgbwousyheohlrtt): CLOSED via email-provider-off
All 2 enforced project(s) are closed. exit 0
```

That is the real sequence, not a defect injection: the same command, the same machine, before
and after the two PATCHes.

## Proof a real user is unaffected

A captcha or a provider switch that locks legitimate users out is a worse outage than the hole,
so this was measured rather than assumed. BoatBuddy has no Supabase login, so "can a customer
still sign in" here means: does the password gate still open, and does the app still read its
data?

1. **The password gate** — `src/components/shared/__tests__/passwordgate.test.tsx`, 22 tests,
   pass. It is a pure client-side SHA-256 check and issues no network request, so no GoTrue
   setting can reach it.
2. **The data path** — the anon-key PostgREST reads that `src/lib/supabase.ts` exists to make,
   run before and after the change, identical both times:

   | table | rows (production) |
   |---|---|
   | `beitraege` | 149 |
   | `ausgaben` | 114 |
   | `reservierungen` | 26 |
   | `nutzungslogs` | 142 |

3. **The nightly liveness job** — `.github/workflows/keep-alive.yml` pings GraphQL and, as a
   backup, `/auth/v1/token?grant_type=password`. Re-run by hand after the change: GraphQL
   **200** on both projects, so the job still passes. The auth ping moved from HTTP 400 to
   HTTP 422 `email_provider_disabled`, which that workflow only logs — it fails only when
   GraphQL is not 200, or when both pings are unreachable.

`https://boatbuddy.predivo.ch` itself could **not** be loaded from our own machines during this
work (connection refused / timed out from the work PC, from Chrome, and from an off-network
fetch). That is the known Metanet edge condition already tracked in
`metanet-blocked-our-ip-again-2026-09-09`, not something this change caused — the change touches
only the Supabase project's auth settings, and the site is served from Metanet.

## The guard

`scripts/signin-captcha.prod.test.mjs` probes the live state of both projects and exits 0 only
while a tokenless `/recover` is refused — by **either** valid mechanism, captcha or
email-provider-off, so a future switch to captcha would not read as a regression. Both projects
are `enforced: true` as of this change. It is credential-free by design: the anon key it needs
is the public one every browser gets.

`.github/workflows/auth-hole-guard.yml` runs it daily and on demand, so the closed state cannot
go quietly stale.

## Rollback

One call per project, inverted:

```
PATCH https://api.supabase.com/v1/projects/<ref>/config/auth  {"external_email_enabled": true}
```

If any future code path here genuinely needs Supabase email auth, re-enable it **and** close the
hole the fleet way in the same change — Turnstile token threaded through the new call sites
first, then `security_captcha_enabled`, in that order. Flipping the server switch before the
client sends a token is what locks real customers out.
