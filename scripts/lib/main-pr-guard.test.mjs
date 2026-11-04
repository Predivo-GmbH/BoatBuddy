import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mergedPull, assertGreenBeforeMerge, verifyMain, requiredWorkflows, githubClient } from '../verify-main-pr.mjs'

const context = { repo: 'example/repository', sha: 'a'.repeat(40), branch: 'main', ref: 'refs/heads/main' }
const pr = { number: 7, state: 'closed', merged_at: '2026-11-04T12:00:00Z', merge_commit_sha: context.sha,
  base: { ref: 'main', repo: { full_name: context.repo } }, head: { sha: 'b'.repeat(40), repo: { full_name: context.repo }, ref: 'feature' } }
const runs = requiredWorkflows.map((path, i) => ({ id: i + 1, workflow_id: i + 1, path,
  event: 'pull_request', head_sha: pr.head.sha, pull_requests: [{ number: 7 }],
  head_repository: { full_name: context.repo }, head_branch: 'feature',
  status: 'completed', conclusion: 'success', created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T11:00:00Z' }))
const check = { head_sha: pr.head.sha, status: 'completed', conclusion: 'success', started_at: '2026-11-04T10:00:00Z', completed_at: '2026-11-04T11:00:00Z' }
const status = { id: 1, context: 'external check', state: 'success', created_at: '2026-11-04T11:00:00Z' }

test('a merged PR with every required workflow green before merging passes', () => {
  assert.equal(mergedPull([pr], context), pr)
  assert.doesNotThrow(() => assertGreenBeforeMerge(pr, runs, [check], [status]))
  assert.doesNotThrow(() => assertGreenBeforeMerge(pr, runs.map(run => ({ ...run, pull_requests: [] })), [check], [status]))
})

test('direct pushes, unmerged PRs, old merges, other repos and other base branches are refused', () => {
  for (const candidates of [[], [{ ...pr, merged_at: null }], [{ ...pr, state: 'open' }],
    [{ ...pr, merge_commit_sha: 'c'.repeat(40) }], [{ ...pr, base: { ...pr.base, ref: 'other' } }],
    [{ ...pr, base: { ...pr.base, repo: { full_name: 'another/repo' } } }], [pr, pr]]) {
    assert.throws(() => mergedPull(candidates, context), /exact merge/)
  }
})

test('every required PR workflow must be present, for this head, complete, green and completed before merge', () => {
  for (let i = 0; i < runs.length; i++) {
    assert.throws(() => assertGreenBeforeMerge(pr, runs.filter((_, n) => n !== i), [], []), /green/)
    for (const mutation of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { conclusion: 'skipped' },
      { status: 'in_progress' }, { event: 'push' }, { head_sha: 'c'.repeat(40) }, { pull_requests: [{ number: 8 }] },
      { head_repository: { full_name: 'other/repo' } }, { head_branch: 'other' },
      { updated_at: '2026-11-04T12:00:01Z' }]) {
      const changed = structuredClone(runs); Object.assign(changed[i], mutation)
      assert.throws(() => assertGreenBeforeMerge(pr, changed, [], []), /green/)
    }
  }
})

test('an older successful run cannot hide a later failed run; successful reruns can recover', () => {
  const failed = { ...runs[0], id: 100, conclusion: 'failure' }
  assert.throws(() => assertGreenBeforeMerge(pr, [...runs, failed], [], []), /green/)
  assert.doesNotThrow(() => assertGreenBeforeMerge(pr, [...runs, failed, { ...failed, id: 101, conclusion: 'success' }], [check], []))
})

test('failed or pending additional workflows, checks and commit statuses block', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', null]) {
    assert.throws(() => assertGreenBeforeMerge(pr, [...runs, { ...runs[0], id: 99, workflow_id: 99, path: 'extra', conclusion }], [], []))
    assert.throws(() => assertGreenBeforeMerge(pr, runs, [{ ...check, conclusion }], []))
  }
  assert.throws(() => assertGreenBeforeMerge(pr, runs, [{ ...check, completed_at: '2026-11-04T12:01:00Z' }], []))
  assert.throws(() => assertGreenBeforeMerge(pr, runs, [check], [{ ...status, state: 'pending' }]), /commit status/)
  assert.doesNotThrow(() => assertGreenBeforeMerge(pr, runs, [check], [{ ...status, state: 'failure' }, { ...status, id: 2 }]))
})

const options = { ...context, token: 'offline-fixture', apiUrl: 'https://api.test' }
const prefix = `${options.apiUrl}/repos/${context.repo}`
const pullsUrl = `${prefix}/commits/${context.sha}/pulls?per_page=100`
const runsUrl = `${prefix}/actions/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`
const checksUrl = `${prefix}/commits/${pr.head.sha}/check-runs?filter=latest&per_page=100`
const statusUrl = `${prefix}/commits/${pr.head.sha}/status?per_page=100`
const json = (body, { status = 200, link } = {}) => ({ ok: status >= 200 && status < 300, status,
  headers: { get: name => name === 'link' ? link ?? null : null }, json: async () => body })
const routes = (overrides = {}) => async url => {
  const responses = {
    [pullsUrl]: json([pr]),
    [runsUrl]: json({ total_count: runs.length, workflow_runs: runs }),
    [checksUrl]: json({ total_count: 1, check_runs: [check] }),
    [statusUrl]: json({ sha: pr.head.sha, total_count: 1, state: 'success', statuses: [status] }),
    ...overrides,
  }
  assert.ok(Object.hasOwn(responses, url), `Unexpected URL: ${url}`)
  return responses[url]
}

test('injected fetch accepts a green merged PR and reads every merge/head evidence page', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return routes({
      [pullsUrl]: json([], { link: `<${pullsUrl}&page=2>; rel="next"` }),
      [`${pullsUrl}&page=2`]: json([pr]),
      [runsUrl]: json({ total_count: runs.length, workflow_runs: runs.slice(0, 1) }, { link: `<${runsUrl}&page=2>; rel="next"` }),
      [`${runsUrl}&page=2`]: json({ total_count: runs.length, workflow_runs: runs.slice(1) }),
      [checksUrl]: json({ total_count: 2, check_runs: [check] }, { link: `<${checksUrl}&page=2>; rel="next"` }),
      [`${checksUrl}&page=2`]: json({ total_count: 2, check_runs: [{ ...check, name: 'other' }] }),
      [statusUrl]: json({ sha: pr.head.sha, total_count: 2, state: 'success', statuses: [status] }, { link: `<${statusUrl}&page=2>; rel="next"` }),
      [`${statusUrl}&page=2`]: json({ sha: pr.head.sha, total_count: 2, state: 'success', statuses: [{ ...status, context: 'other' }] }),
    })(url)
  }
  assert.equal(await verifyMain({ ...options, fetchImpl }), 7)
  assert.equal(calls.length, 8)
  assert.ok(calls.slice(0, 2).every(call => call.url.includes(`/commits/${context.sha}/pulls`)))
  assert.ok(calls.slice(2).every(call => call.url.includes(pr.head.sha)))
  assert.ok(calls.every(({ init }) => init.method === 'GET' && init.redirect === 'error'
    && init.headers.Authorization === 'Bearer offline-fixture' && init.signal instanceof AbortSignal))
})

test('injected fetch rejects direct pushes without asking for any checks', async () => {
  let calls = 0
  await assert.rejects(verifyMain({ ...options, fetchImpl: async url => {
    calls++
    assert.equal(url, pullsUrl)
    return json([])
  } }), /exact merge/)
  assert.equal(calls, 1)
})

test('green check runs pass with no legacy statuses even though GitHub reports combined pending', async () => {
  assert.equal(await verifyMain({ ...options, fetchImpl: routes({
    [statusUrl]: json({ sha: pr.head.sha, total_count: 0, state: 'pending', statuses: [] }),
  }) }), 7)
})

test('API errors and malformed, incomplete, mismatched, failed or late evidence block', async () => {
  const badChecks = [
    { total_count: 0, check_runs: [] }, { total_count: 2, check_runs: [check] },
    ...[{ conclusion: 'failure' }, { status: 'in_progress' }, { head_sha: context.sha },
      { completed_at: null }, { completed_at: '2026-11-04T12:00:01Z' },
      { started_at: '2026-11-04T12:00:01Z', completed_at: '2026-11-04T12:00:02Z' }]
      .map(patch => ({ total_count: 1, check_runs: [{ ...check, ...patch }] })),
  ]
  const badStatuses = [
    { sha: context.sha, total_count: 0, state: 'pending', statuses: [] },
    { sha: pr.head.sha, total_count: 1, state: 'success', statuses: [] },
    ...['pending', 'failure', 'error'].map(state => ({ sha: pr.head.sha, total_count: 1, state, statuses: [{ ...status, state }] })),
    ...[{ state: 'failure' }, { created_at: null }, { updated_at: '2026-11-04T12:00:01Z' }]
      .map(patch => ({ sha: pr.head.sha, total_count: 1, state: 'success', statuses: [{ ...status, ...patch }] })),
  ]
  for (const overrides of [
    ...[pullsUrl, runsUrl, checksUrl, statusUrl].flatMap(url => [
      { [url]: json({}, { status: 403 }) }, { [url]: json({}) },
      { [url]: { ...json(null), json: async () => { throw new Error('invalid JSON') } } },
    ]),
    { [pullsUrl]: json([{ ...pr, head: {} }]) },
    { [runsUrl]: json({ total_count: 4, workflow_runs: runs }) },
    ...badChecks.map(body => ({ [checksUrl]: json(body) })),
    ...badStatuses.map(body => ({ [statusUrl]: json(body) })),
  ]) await assert.rejects(verifyMain({ ...options, fetchImpl: routes(overrides) }))
})

test('a failed second page of checks or statuses cannot hide behind a green first page', async () => {
  for (const overrides of [
    {
      [checksUrl]: json({ total_count: 2, check_runs: [check] }, { link: `<${checksUrl}&page=2>; rel="next"` }),
      [`${checksUrl}&page=2`]: json({ total_count: 2, check_runs: [{ ...check, conclusion: 'failure' }] }),
    },
    {
      [statusUrl]: json({ sha: pr.head.sha, total_count: 2, state: 'success', statuses: [status] }, { link: `<${statusUrl}&page=2>; rel="next"` }),
      [`${statusUrl}&page=2`]: json({ sha: pr.head.sha, total_count: 2, state: 'failure', statuses: [{ ...status, context: 'other', state: 'failure' }] }),
    },
  ]) await assert.rejects(verifyMain({ ...options, fetchImpl: routes(overrides) }))
})

test('pagination refuses foreign origins, other paths, userinfo, loops and changing counts', async () => {
  for (const next of ['https://untrusted.test/steal', checksUrl, pullsUrl, pullsUrl.replace('https://', 'https://user@')]) {
    await assert.rejects(verifyMain({ ...options, fetchImpl: routes({
      [pullsUrl]: json([], { link: `<${next}>; rel="next"` }),
    }) }), /unsafe pagination|repeated pages/)
  }
  await assert.rejects(verifyMain({ ...options, fetchImpl: routes({
    [checksUrl]: json({ total_count: 2, check_runs: [check] }, { link: `<${checksUrl}&page=2>; rel="next"` }),
    [`${checksUrl}&page=2`]: json({ total_count: 3, check_runs: [check] }),
  }) }), /count changed/)
})

test('missing token, invalid inputs and network failures fail closed without leaking diagnostics', async () => {
  const neverFetch = () => assert.fail('must reject before fetching')
  assert.throws(() => githubClient({ token: '', fetchImpl: neverFetch }), /GITHUB_TOKEN/)
  for (const patch of [{ ref: 'refs/heads/feature' }, { sha: 'abc' }, { repo: 'owner/..' }, { repo: 'owner/.' }, { repo: '../bad' }]) {
    await assert.rejects(verifyMain({ ...options, ...patch, fetchImpl: neverFetch }), /default-branch/)
  }
  await assert.rejects(verifyMain({ ...options, fetchImpl: async () => { throw new Error('sensitive transport diagnostics') } }),
    error => error.message === 'GitHub API request failed')
})

test('the blocking workflow uses GITHUB_TOKEN and the guard never shells out', () => {
  const source = fs.readFileSync(new URL('../verify-main-pr.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /child_process|execFile|spawn|['"]gh['"]/)
  const workflow = fs.readFileSync(new URL('../../.github/workflows/main-pr-guard.yml', import.meta.url), 'utf8')
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github.token \}\}/)
  assert.doesNotMatch(workflow, /continue-on-error:|\|\|\s*true/)
})
