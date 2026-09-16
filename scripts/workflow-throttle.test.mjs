/**
 * THIS REPO'S CI MUST THROTTLE ITSELF, AND ITS DEPLOY MUST REFUSE TO BE THROTTLED.
 *
 * The rule is NOT implemented here. It lives once, in gate-kit
 * (conformance/workflow-throttle.js), and this file is the ten lines that make this repo
 * obey it. That is the entire point: on 2026-09-15 a one-line concurrency fix had to be
 * made in six separate repositories, and nothing anywhere would have noticed if one of
 * them had lost it again.
 *
 * WHAT IT CAUGHT, measured 2026-09-16 over 96 workflows on the six default branches:
 * 26 blocking findings. Every product's scheduled workflows fired with no concurrency
 * group at all, so a run that was still going kept its own runner slot while its
 * successor started beside it - and all 18 runner registrations are ONE laptop, which
 * peaked at 41 concurrent jobs against 87% idle. That is why a deploy meant waiting.
 *
 * THE RULE IS TWO-SIDED, and both halves are asserted here:
 *   - a superseded secret scan is waste and must be cancellable
 *   - a superseded DEPLOY must NOT be cancelled: a mirror killed in flight leaves
 *     production half-uploaded, and three simultaneous deploys had the office IP refused
 *     by the shared FTP host for 45 minutes on 2026-09-03
 *
 * Discovered, never listed: scripts/run-guards.mjs finds this by its filename, so nobody
 * has to remember to add it to a workflow.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { judgeRepo } from '@predivo-gmbh/gate-kit/conformance/workflow-throttle'

// Derived from THIS FILE, never from process.cwd() - a runner with a different
// working-directory would otherwise discover nothing and report a triumphant pass.
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIR = path.join(ROOT, '.github/workflows')

test('every workflow throttles itself, and the deploy refuses to be throttled', () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((name) => ({ name, text: fs.readFileSync(path.join(DIR, name), 'utf8') }))

  // ABSENCE IS NOT SUCCESS. If discovery matches nothing, that is a failure, not a pass -
  // otherwise a moved directory silently switches this guard off while still printing green.
  assert.ok(files.length > 0, `no workflow files under ${DIR} - a guard that cannot see is not a guard that found nothing`)

  const verdict = judgeRepo(files)
  assert.deepEqual(
    verdict.blocking,
    [],
    `\n\n${verdict.blocking.join('\n')}\n\n` +
      'Fix: give the workflow a top-level concurrency group. Add cancel-in-progress ONLY if\n' +
      'the job is safe to kill half-way through - a deploy and anything that WRITES is not.\n'
  )
})
