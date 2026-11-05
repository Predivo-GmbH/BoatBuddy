// RELEASE WHEN STAGING IS GREEN - the decisions of scripts/release-when-green.mjs, and the wiring that makes them run.
// Discovered by scripts/run-guards.mjs (any *.test.mjs), so it runs on every push without being named anywhere.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BRANCH, DEPLOY_WORKFLOW, PRODUCTION_JOBS, chooseShip, filesOfCompare, globToRegExp, productionCommit,
  pushPathFilter, releaseDecision, releaseWhenGreen, startsStagingRun,
} from './release-when-green.mjs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const DEPLOY = read(`.github/workflows/${DEPLOY_WORKFLOW}`)
const RELEASER = read('.github/workflows/release-when-green.yml')
const X = 'a'.repeat(40)
const Y = 'b'.repeat(40)
const P = 'c'.repeat(40)

test('GitHub filter globs: * stays inside a folder, ** crosses folders', () => {
  assert.ok(globToRegExp('*.md').test('README.md'))
  assert.ok(!globToRegExp('*.md').test('docs/a.md'))
  assert.ok(globToRegExp('**/*.md').test('docs/deep/a.md'))
  assert.ok(globToRegExp('**/*.md').test('a.md'))
  assert.ok(globToRegExp('docs/**').test('docs/x/y.png'))
  assert.ok(!globToRegExp('docs/**').test('src/docs.ts'))
  assert.ok(globToRegExp('.gitignore').test('.gitignore'))
  assert.ok(!globToRegExp('.gitignore').test('xgitignore'))
})

test("this repo's deploy.yml push filter is read, and it says what GitHub would do", () => {
  const filter = pushPathFilter(DEPLOY)
  assert.ok(filter, 'the push path filter of deploy.yml could not be read - release-when-green would never release a docs-only tip')
  assert.equal(startsStagingRun('docs/RECORD-x.md', filter), false)
  assert.equal(startsStagingRun('README.md', filter), false)
  assert.equal(startsStagingRun('package.json', filter), true)
  assert.equal(startsStagingRun('.github/workflows/deploy.yml', filter), true)
})

test('a filter shape the reader does not model is unknown, never a guess', () => {
  assert.equal(pushPathFilter('name: x\non:\n  push:\n    branches: [main]\n'), null)
  assert.equal(pushPathFilter("on:\n  push:\n    paths-ignore: ['*.md']\n"), null)
  assert.equal(pushPathFilter("on:\n  push:\n    paths-ignore:\n      - 'doc?/**'\n"), null)
  assert.equal(pushPathFilter('on:\n  workflow_dispatch:\n'), null)
})

test('a `paths` filter with ! excludes: the last match wins, as on GitHub', () => {
  const filter = pushPathFilter([
    'on:',
    '  push:',
    '    branches: [main]',
    '    paths:',
    "      - '**'",
    "      - '!*.md'",
    "      - '!docs/**'",
    "      - 'docs/support-kb/**'",
    "      - '!.github/workflows/warmup-check.yml'",
    '  schedule:',
    "    - cron: '0 2 * * *'",
  ].join('\n'))
  assert.deepEqual(filter, { kind: 'paths', patterns: ['**', '!*.md', '!docs/**', 'docs/support-kb/**', '!.github/workflows/warmup-check.yml'] })
  assert.equal(startsStagingRun('README.md', filter), false)
  assert.equal(startsStagingRun('docs/a.md', filter), false)
  assert.equal(startsStagingRun('docs/support-kb/a.md', filter), true)
  assert.equal(startsStagingRun('src/a.ts', filter), true)
  assert.equal(startsStagingRun('.github/workflows/warmup-check.yml', filter), false)
})

test('the release is the green commit while it is the tip, or a tip newer only by docs', () => {
  const filter = pushPathFilter(DEPLOY)
  assert.equal(chooseShip({ sha: X, tipSha: X, newerFiles: [], filter }).ship, X)
  assert.equal(chooseShip({ sha: X, tipSha: Y, newerFiles: ['docs/RECORD.md'], filter }).ship, Y)
  assert.equal(chooseShip({ sha: X, tipSha: Y, newerFiles: ['docs/RECORD.md', 'src/app.ts'], filter }).ship, null)
  assert.equal(chooseShip({ sha: X, tipSha: Y, newerFiles: null, filter }).ship, null, 'an unreadable compare is a no')
  assert.equal(chooseShip({ sha: X, tipSha: Y, newerFiles: ['docs/a.md'], filter: null }).ship, null, 'an unreadable filter is a no')
  assert.equal(chooseShip({ sha: X, tipSha: Y, newerFiles: [], filter }).ship, null, 'an empty "ahead" compare cannot be')
  assert.equal(chooseShip({ sha: X, tipSha: null, newerFiles: [], filter }).ship, null)
  assert.equal(chooseShip({ sha: 'main', tipSha: X, newerFiles: [], filter }).ship, null, 'only a full commit id is released')
})

test('a newer tip the staging gate would refuse is never released in the green commit\'s place', () => {
  // Starts no staging run, but the production job's docs-only rule does not cover it: its release would go red.
  const filter = { kind: 'paths', patterns: ['**', '!.github/workflows/warmup-check.yml'] }
  assert.equal(chooseShip({ sha: X, tipSha: Y, newerFiles: ['.github/workflows/warmup-check.yml'], filter }).ship, null)
})

test('production never goes backwards, a release never runs twice, and an unreadable answer is a no', () => {
  const ok = { ship: X, productionSha: P, ancestry: 'ahead', shipReleases: [] }
  assert.equal(releaseDecision(ok).release, true)
  assert.equal(releaseDecision({ ...ok, shipReleases: [{ status: 'completed', conclusion: 'failure' }] }).release, true, 'a failed release of the commit may be retried by its next green staging run')
  assert.equal(releaseDecision({ ...ok, shipReleases: [{ status: 'queued', conclusion: null }] }).release, false)
  assert.equal(releaseDecision({ ...ok, shipReleases: [{ status: 'in_progress', conclusion: null }] }).release, false)
  assert.equal(releaseDecision({ ...ok, shipReleases: null }).release, false)
  assert.equal(releaseDecision({ ...ok, productionSha: null }).release, false)
  assert.equal(releaseDecision({ ...ok, productionSha: X, ancestry: null }).release, false, 'already live')
  assert.equal(releaseDecision({ ...ok, ancestry: 'identical' }).release, false)
  assert.equal(releaseDecision({ ...ok, ancestry: 'behind' }).release, false, 'would roll production back')
  assert.equal(releaseDecision({ ...ok, ancestry: 'diverged' }).release, false)
  assert.equal(releaseDecision({ ...ok, ancestry: null }).release, false)
})

test('the commit live in production is the newest dispatch whose production JOB succeeded', async () => {
  const runs = [
    { id: 1, status: 'in_progress' },
    { id: 2, status: 'completed' }, // gates red, deploy skipped
    { id: 3, status: 'completed' }, // deploy succeeded
    { id: 4, status: 'completed' },
  ]
  const jobs = {
    2: [{ name: PRODUCTION_JOBS[0], conclusion: 'skipped', head_sha: Y }],
    3: [{ name: 'gate-e2e', conclusion: 'success', head_sha: X }, { name: PRODUCTION_JOBS[0], conclusion: 'success', head_sha: X }],
    4: [{ name: PRODUCTION_JOBS[0], conclusion: 'success', head_sha: P }],
  }
  assert.equal(await productionCommit(runs, async (id) => jobs[id]), X)
  assert.equal(await productionCommit(runs, async (id) => (id === 2 ? null : jobs[id])), null, 'an unreadable job list is not "not deployed"')
  assert.equal(await productionCommit(runs.slice(0, 2), async (id) => jobs[id]), null)
})

test('a compare GitHub cut off or could not answer is not trusted', () => {
  assert.equal(filesOfCompare({ status: 'ahead', files: [] }), null)
  assert.equal(filesOfCompare({ status: 'diverged', files: [{ filename: 'a' }] }), null)
  assert.equal(filesOfCompare({ status: 'ahead', files: Array.from({ length: 300 }, (_, i) => ({ filename: `f${i}` })) }), null)
  assert.deepEqual(filesOfCompare({ status: 'ahead', files: [{ filename: 'b', previous_filename: 'a' }] }), ['b', 'a'])
})

function fakeGitHub({ tip, production, runs = [], compare = {} }) {
  const sent = []
  const api = async (path, init) => {
    if (init?.method === 'POST') { sent.push({ path, body: JSON.parse(init.body) }); return { ok: true, status: 204, body: null } }
    if (path.endsWith(`/git/ref/heads/${BRANCH}`)) return { ok: true, status: 200, body: { object: { sha: tip } } }
    if (path.includes('/compare/')) {
      const key = path.split('/compare/')[1]
      return key in compare ? { ok: true, status: 200, body: compare[key] } : { ok: false, status: 404, body: null }
    }
    if (path.includes('/jobs')) {
      const id = Number(path.split('/runs/')[1].split('/')[0])
      return { ok: true, status: 200, body: { jobs: [{ name: PRODUCTION_JOBS[0], conclusion: 'success', head_sha: id === 7 ? production : X }] } }
    }
    if (path.includes('/runs?')) return { ok: true, status: 200, body: { workflow_runs: runs } }
    return { ok: false, status: 404, body: null }
  }
  return { api, sent }
}

test('end to end: the green tip is dispatched on main, pinned to that exact commit', async () => {
  const gh = fakeGitHub({
    tip: X,
    production: P,
    runs: [{ id: 7, event: 'workflow_dispatch', head_branch: BRANCH, head_sha: P, status: 'completed', conclusion: 'success' }],
    compare: { [`${P}...${X}`]: { status: 'ahead' } },
  })
  const out = await releaseWhenGreen({ repo: 'o/r', sha: X, workflowText: DEPLOY, api: gh.api, wait: async () => {}, log: () => {} })
  assert.equal(out.dispatched, true)
  assert.equal(gh.sent.length, 1)
  assert.match(gh.sent[0].path, new RegExp(`/actions/workflows/${DEPLOY_WORKFLOW}/dispatches$`))
  assert.deepEqual(gh.sent[0].body, { ref: BRANCH, inputs: { confirm: 'deploy', release_sha: X } })
})

test('end to end: nothing is dispatched when main moved on by code, or production is newer', async () => {
  const moved = fakeGitHub({ tip: Y, production: P, compare: { [`${X}...${Y}`]: { status: 'ahead', files: [{ filename: 'src/a.ts' }] } } })
  assert.equal((await releaseWhenGreen({ repo: 'o/r', sha: X, workflowText: DEPLOY, api: moved.api, wait: async () => {}, log: () => {} })).dispatched, false)
  assert.equal(moved.sent.length, 0)
  const backwards = fakeGitHub({
    tip: X,
    production: P,
    runs: [{ id: 7, event: 'workflow_dispatch', head_branch: BRANCH, head_sha: P, status: 'completed', conclusion: 'success' }],
    compare: { [`${P}...${X}`]: { status: 'behind' } },
  })
  assert.equal((await releaseWhenGreen({ repo: 'o/r', sha: X, workflowText: DEPLOY, api: backwards.api, wait: async () => {}, log: () => {} })).dispatched, false)
  assert.equal(backwards.sent.length, 0)
})

test('the wiring: release-when-green.yml listens to this deploy workflow by its exact name, after green pushes of main', () => {
  const name = /^name:\s*(.+?)\s*$/m.exec(DEPLOY)?.[1]?.replace(/^['"]|['"]$/g, '')
  assert.ok(name, 'deploy.yml has no name')
  assert.match(RELEASER, new RegExp(`workflows:\\s*\\[\\s*['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\]`), 'release-when-green.yml must name deploy.yml\'s workflow exactly, or it never runs')
  assert.match(RELEASER, /github\.event\.workflow_run\.event == 'push'/)
  assert.match(RELEASER, /github\.event\.workflow_run\.head_branch == 'main'/)
  assert.match(RELEASER, /github\.event\.workflow_run\.conclusion == 'success'/)
  assert.match(RELEASER, /SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/, 'the commit staging proved, never the tip of main')
  assert.match(RELEASER, /cancel-in-progress: false/)
})

test('the wiring: deploy.yml takes release_sha and ships nothing when main no longer points at it', () => {
  assert.match(DEPLOY, /\n {6}release_sha:\n/, 'deploy.yml must declare the release_sha input, or every automatic dispatch is refused (HTTP 422)')
  const deployJob = DEPLOY.split(/\n {2}deploy:\n/)[1]?.split(/\n {2}[\w-]+:\n/)[0] ?? ''
  assert.match(deployJob, /\(inputs\.release_sha \|\| github\.sha\) == github\.sha/, 'the production job must refuse a pin that is not the commit it would ship')
})
