import test from 'node:test'
import assert from 'node:assert/strict'
import { mergedPull, assertGreenBeforeMerge, verifyMain, requiredWorkflows } from '../verify-main-pr.mjs'

const context = { repo: 'example/repository', sha: 'a'.repeat(40), branch: 'main', ref: 'refs/heads/main' }
const pr = { number: 7, state: 'closed', merged_at: '2026-11-04T12:00:00Z', merge_commit_sha: context.sha,
  base: { ref: 'main', repo: { full_name: context.repo } }, head: { sha: 'b'.repeat(40), repo: { full_name: context.repo }, ref: 'feature' } }
const runs = requiredWorkflows.map((path, i) => ({ id: i + 1, workflow_id: i + 1, path,
  event: 'pull_request', head_sha: pr.head.sha, pull_requests: [{ number: 7 }],
  head_repository: { full_name: context.repo }, head_branch: 'feature',
  status: 'completed', conclusion: 'success', created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T11:00:00Z' }))
const check = { status: 'completed', conclusion: 'success', started_at: '2026-11-04T10:00:00Z', completed_at: '2026-11-04T11:00:00Z' }
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
  assert.doesNotThrow(() => assertGreenBeforeMerge(pr, [...runs, failed, { ...failed, id: 101, conclusion: 'success' }], [], []))
})

test('failed or pending additional workflows, checks and commit statuses block', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', null]) {
    assert.throws(() => assertGreenBeforeMerge(pr, [...runs, { ...runs[0], id: 99, workflow_id: 99, path: 'extra', conclusion }], [], []))
    assert.throws(() => assertGreenBeforeMerge(pr, runs, [{ ...check, conclusion }], []))
  }
  assert.throws(() => assertGreenBeforeMerge(pr, runs, [{ ...check, completed_at: '2026-11-04T12:01:00Z' }], []))
  assert.throws(() => assertGreenBeforeMerge(pr, runs, [], [{ ...status, state: 'pending' }]))
  assert.doesNotThrow(() => assertGreenBeforeMerge(pr, runs, [], [{ ...status, state: 'failure' }, { ...status, id: 2 }]))
})

test('API integration uses exact merge/head SHAs, follows every evidence source, and fails closed', () => {
  const calls = []
  const read = (endpoint, key) => {
    calls.push([endpoint, key])
    if (endpoint.includes('/pulls?')) return [pr]
    if (key === 'workflow_runs') return runs
    if (key === 'check_runs') return [check]
    return [status]
  }
  assert.equal(verifyMain({ ...context, read }), 7)
  assert.equal(calls.length, 4)
  assert.ok(calls[0][0].includes(`/commits/${context.sha}/pulls`))
  assert.ok(calls.slice(1).every(([endpoint]) => endpoint.includes(pr.head.sha)))
  assert.throws(() => verifyMain({ ...context, read: () => { throw new Error('API unavailable') } }), /unavailable/)
  assert.throws(() => verifyMain({ ...context, ref: 'refs/heads/feature', read }), /default-branch/)
})
