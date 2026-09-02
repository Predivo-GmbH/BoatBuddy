> # ⛔ DECIDED AND CLOSED BY ROGER — 2026-09-02. DO NOT REOPEN THIS.
> 
> **His words, verbatim:** *"I said that before, and this needs to be closed and written into the
> memory and documented. Nothing has been shared when it comes to a password for the boat app.
> Nothing needs to be changed. There is nothing to be fixed. Everything is fine. We don't need to do
> anything. You can safely close this task."*
> 
> He was offered three options — individual logins per owner, moving the password check to the
> server, or leaving it as it is — and he chose to leave it. **That is the owner's decision on his
> own boat's expense book**, and it is a reasonable one: the address is not published anywhere, the
> three people the data concerns are the three owners, and the data is what the boat cost.
> 
> **If you are a future session that has just rediscovered the open read path below: you have
> rediscovered a DECISION, not a defect.** The measurement in this document is correct and stays
> here for the record. It is not a finding to be re-raised, not a row to be reopened, and not
> something to put in front of Roger again. He has now had to say so more than once, and being asked
> a third time is the actual failure this banner exists to prevent.
> 
> A measurement is not a decision. This one was measured, presented, and answered.

---

# BoatBuddy: the shared password protects nothing

**Date:** 2026-09-01
**Board item:** `boatbuddy-s-shared-password-was-exposed-and-should-be-ch`
**Status:** blocked on Roger — the fix is an architecture choice, not a policy edit.

The board said the exposed shared password "needs no action". Both halves of that are wrong.

---

## 1. It was never rotated

The gate is `src/components/shared/PasswordGate.tsx`: a SHA-256 of what you type, compared in the
browser against `VITE_GATE_PASSWORD_HASH`, which is baked into the bundle at build time. The
authoritative copy is the GitHub Actions secret of that name.

| evidence | value |
|---|---|
| `gh secret list` → `VITE_GATE_PASSWORD_HASH` last updated | **2026-05-26T14:02:50Z** |
| `docs/Credentials.txt` last written | **2026-08-30 13:08** |
| the exposure | **2026-09-01** |

Rotating would have had to change that secret and redeploy. Neither happened, so the password in
use today is the one that was printed into a transcript. **No secret value was read to establish
this** — only names, timestamps and a file mtime.

## 2. Rotating it would close nothing

Proven over the real HTTPS API against **production** (`xzythvxmuxmczuiophwp`), using the
**publishable key that BoatBuddy's own browser bundle ships**, with no password and no login:

```
eigentuemer      HTTP 206   3 rows      (the owners)
ausgaben         HTTP 206   113 rows    (expenses)
beitraege        HTTP 206   149 rows    (contributions)
nutzungslogs     HTTP 206   140 rows    (usage log)
gastsessions     HTTP 206   74 rows     (guest sessions)
reservierungen   HTTP 206   24 rows     (reservations)
```

An in-database probe as the `anon` role agrees: **13 of 16 tables readable, 728 rows**. Staging is
the same shape (8 of 16, 996 rows). Only status codes and row counts were read; no data was copied.

The password check runs in React, *after* the page and its keys have already been delivered. It
stops a person looking at a screen. It does not stop anybody talking to the API.

## 3. Writes are open too

An anonymous `POST /rest/v1/eigentuemer` returned **HTTP 400, code 23502** — a not-null violation.
That is RLS **allowing** the insert and only the missing column stopping it. A refusal would have
been `42501`/401/403. Nothing was created.

## 4. The measurement that nearly went in the report wrong

The first HTTP probe returned **401 on every table**, and "not reachable, all good" was one step
away from being written down. That 401 was the **legacy `anon` JWT being disabled** on this project
by the fleet legacy-key migration — a fact about my harness, not about the system. The key the
browser actually ships is the publishable `sb_p…` one, and with it everything answers 206.

A probe answers the question it was built to ask. This one was asking "is the disabled key
disabled".

## 5. Why this was not fixed here

**BoatBuddy has no user accounts.** The app runs entirely as the anonymous role, so RLS has no
identity to key on. Revoking `anon` closes the app for all three owners at the same instant it
closes it for everybody else. There is no policy edit that fixes this; somebody has to decide how
people prove who they are. That decision is Roger's and the board item is blocked on it, with three
options costed in what they cost *him*, not in what they cost me.
