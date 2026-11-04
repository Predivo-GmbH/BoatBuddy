# Runbook: the server-checked member password

Background: `docs/DECISIONS.md`, «Server-checked shared member password» (Roger, 2026-11-04).

## 1. Shipping it: two releases, never one

The old front end reads and writes the database as `anon`. Removing that access in the same
release that ships the new (member) front end would cut the live site off for the minutes
between the migration step and the FTP upload, and for good if a step in between failed. So
the change ships in two releases.

**Release 1 (this PR).** Migration `034_member_access_alongside_anon.sql` is additive: the
membership helper, member grants and policies, member Storage policies and the server-set QR
expiry. Every anon right stays. The deploy job runs, in this order: settings, migrations,
edge functions except `extract-expense`, the sign-in smoke (`scripts/member-gate-smoke.mjs`),
the front end upload, and only then `extract-expense`. If anything fails before the upload,
the old front end is still live and still works, receipt extraction included.

The sign-in smoke sends a random wrong password (must answer 401), then the real one from the
`MEMBER_GATE_PASSWORD` secret (must answer 200 with a session of at most 15 minutes), and
signs that session out at once with `/auth/v1/logout?scope=local`, which ends only that one
session, never the other devices of the shared member identity. It prints neither the
password nor a token. Without the secret the step FAILS and names it; it never skips. It also ships `public/release.json` (`{"memberSession": true}`), which
is how a later run can tell that the member front end is live.

Expected in the log of every release-1 run: a notice from `apply-migrations.mjs` that
`035_revoke_anonymous_access.sql` is deferred because gate `member-frontend-live` is off.

**Why `extract-expense` ships last (re-review F3, 2026-11-04).** The new `extract-expense`
accepts only a member session; the old front end calls it with the public key. Deployed with
the other functions, a failed smoke or FTP upload would have left the old front end live
without receipt extraction. Two options were weighed: keep the new function accepting the old
anonymous call until release 2, or deploy it after the upload. The second is chosen because it
is simpler and safer: it changes only the deploy order (the early deploy excludes it, step
«Deploy extract-expense (member-only) to <env> after the front end» ships it), it never
reopens the function to anonymous callers, and it needs no follow-up change in release 2. The
OLD function accepts the new front end's member call, so if that late step fails both front
ends still extract; the step fails red and the next release ships it. The only remaining gap
is a browser tab still running the old front end after the upload: its next extraction fails
until it reloads. Its data access is unaffected.

**Caller address (re-review F1).** Rate limits key on `cf-connecting-ip` when it is a valid
public address, else on the rightmost `X-Forwarded-For` entry. With neither (missing, invalid
or a private gateway address), `member-session` applies no per-address limit (the 60 wrong
passwords per hour still apply) and `extract-expense` no per-address hourly cap (its daily cap
still applies), so one shared address can never lock out every member. On STAGING only, each
function logs once per cold start the SHAPE of these headers (entry count, whether the
rightmost entry equals `cf-connecting-ip`, whether it is private), never an address. Read it
in the staging function logs after the first release to confirm which source is used.

**Release 2 (a later, separate PR).** Migration `035_revoke_anonymous_access.sql` holds the
anon revokes, the policy drops and the "no anonymous access remains" guard. Its first line is
`-- release-gate: member-frontend-live`. `apply-migrations.mjs` applies it only when BOTH:

1. `supabase/release-gates.json` has `"member-frontend-live": true`, and
2. the environment's LIVE site answers `/release.json` with `{"memberSession": true}`
   (checked before this run's own upload, so it is always a previous release's front end).

Otherwise it is deferred: not applied, not recorded, named in the log, and the job goes on.

How to do release 2:

1. Release 1 is promoted to production and verified: the member sign-in works there and the
   «Member sign-in refuses a wrong password and accepts the real one (production)» step was
   green.
2. Open a PR that only flips `"member-frontend-live"` to `true` in
   `supabase/release-gates.json` (and updates the assertion in
   `scripts/lib/release-gate.test.mjs` / `scripts/member-release.test.mjs` that pins it off).
3. Merge: the staging push applies 035 to staging (staging already serves release 1), then
   the integration and E2E gates run against the revoked database.
4. Promote to production as usual. If production does not yet serve the member front end,
   035 is deferred with a warning and that run delivers release 1 instead; the next
   promotion applies 035.

Check afterwards: `apply-migrations` printed `applying 035_revoke_anonymous_access.sql ... ok`
in each environment.

## 2. After changing the shared password

The password is checked only by `member-session` against the `MEMBER_PASSWORD_HASH` function
secret (from the `VITE_GATE_PASSWORD_HASH` repository secret; the next release run writes it).
Changing it stops NEW sign-ins with the old password. It does NOT end sessions already handed
out: they are sessions of the one shared member identity, and they keep refreshing.

So after every password change:

1. Update `VITE_GATE_PASSWORD_HASH` (SHA-256 hex of the new password) and
   `MEMBER_GATE_PASSWORD` (the password itself, used by the staging E2E sign-in test and by
   the release sign-in smoke in both environments). Update both in the same sitting: with only
   one changed, the next release stops at the smoke with «HTTP 401 to the real password».
2. Run the staging release, then promote production, so both projects get the new hash.
3. **Admin global sign-out of the member identity, in each project (staging and
   production):** user `07a91df9-55d7-42b4-9944-82f5b88dcf7e` (`members@boatbuddy.invalid`).
   Global sign-out needs one valid session of that user: mint it server-side with the
   project's service key exactly as `scripts/lib/staging-member.mjs` does
   (`auth.admin.generateLink({ type: 'magiclink', email })`, then `auth.verifyOtp` with the
   hashed token; no mail is sent), then call `auth.admin.signOut(<that access token>, 'global')`
   (or `signOut({ scope: 'global' })` on that client). This revokes every refresh token of the
   shared identity on every device. Each device then has to type the new password once its
   current access token (at most 15 minutes) expires. Never print the service key or a token
   while doing this.

**On the Free plan refresh tokens do not expire.** Supabase offers the absolute time-box
(720 h) and inactivity timeout (168 h) only on Pro plans and up; `configure-auth.mjs` applies
them where offered and warns otherwise. On Free, a refresh token that is never used up keeps
working until it is revoked, which is why step 3 is not optional. Removing the membership
flag from the identity (`app_metadata.boatbuddy_member`) also refuses all table access at
once, for every outstanding token.

## 3. When members see a sign-in message

| Message | Meaning | What to do |
|---|---|---|
| «Falsches Passwort» | The server compared and refused (401). | Type it again. |
| «Zu viele Anmeldeversuche …» | 429: ten attempts from this address in 15 minutes, or sixty WRONG passwords across all addresses in this hour. | Wait; it clears at the next quarter hour / hour. Sixty wrong passwords an hour means someone is guessing. |
| «Anmeldung gerade nicht möglich …» | 503 or no answer: missing hash secret, member identity or rate counter, or Supabase down. | Run the staging release; the smoke step names the fault. |
