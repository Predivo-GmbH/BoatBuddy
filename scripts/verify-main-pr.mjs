// SR-SUP-12: Roger's free release gate. Missing evidence and API errors fail closed.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const requiredWorkflows = ['.github/workflows/test.yml', '.github/workflows/gitleaks.yml', '.github/workflows/security.yml']

function apiPages(endpoint, key) {
  const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', endpoint], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }))
  if (!Array.isArray(pages)) throw new Error('Invalid GitHub pagination response')
  return pages.flatMap(page => {
    const rows = key ? page[key] : page
    if (!Array.isArray(rows)) throw new Error('Incomplete GitHub response')
    return rows
  })
}

export function mergedPull(pulls, { repo, sha, branch }) {
  const found = pulls.filter(pr => pr.merged_at && pr.state === 'closed'
    && pr.merge_commit_sha === sha && pr.base?.ref === branch && pr.base?.repo?.full_name === repo)
  if (found.length !== 1) throw new Error('Commit must be the exact merge of one pull request into the default branch')
  if (!/^[a-f0-9]{40}$/.test(found[0].head?.sha ?? '')) throw new Error('Missing PR head SHA')
  return found[0]
}

export function assertGreenBeforeMerge(pr, runs, checks, statuses) {
  const merged = Date.parse(pr.merged_at)
  if (!Number.isFinite(merged)) throw new Error('Invalid merge timestamp')
  const before = value => Number.isFinite(Date.parse(value)) && Date.parse(value) <= merged
  // GitHub returns pull_requests: [] for runs after a merged head branch is deleted.
  // Keep exact head SHA, repository and branch matching even when that association disappears.
  const ownRuns = runs.filter(run => run.event === 'pull_request' && run.head_sha === pr.head.sha
    && run.head_repository?.full_name === pr.head.repo?.full_name && run.head_branch === pr.head.ref
    && (!run.pull_requests?.length || run.pull_requests.some(p => p.number === pr.number)) && before(run.created_at))
  for (const workflow of requiredWorkflows) {
    const latest = ownRuns.filter(run => run.path === workflow).sort((a, b) => b.id - a.id)[0]
    if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success' || !before(latest.updated_at)) {
      throw new Error(`PR did not have a completed green ${workflow} before merging`)
    }
  }
  for (const run of ownRuns) {
    if (ownRuns.some(other => other.workflow_id === run.workflow_id && other.id > run.id)) continue
    if (run.status !== 'completed' || !['success', 'skipped', 'neutral'].includes(run.conclusion) || !before(run.updated_at)) {
      throw new Error('A PR workflow was pending or unsuccessful at merge time')
    }
  }
  for (const check of checks.filter(check => before(check.started_at))) {
    if (check.status !== 'completed' || !['success', 'skipped', 'neutral'].includes(check.conclusion) || !before(check.completed_at)) {
      throw new Error('A PR check was pending or unsuccessful at merge time')
    }
  }
  const latestStatuses = new Map()
  for (const status of [...statuses].sort((a, b) => b.id - a.id)) {
    if (before(status.created_at) && !latestStatuses.has(status.context)) latestStatuses.set(status.context, status)
  }
  if ([...latestStatuses.values()].some(status => status.state !== 'success')) throw new Error('A PR commit status was pending or unsuccessful at merge time')
}

export function verifyMain({ repo, sha, branch = 'main', ref, read = apiPages }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '') || ref !== `refs/heads/${branch}`) {
    throw new Error('Only a default-branch commit with a valid repository/SHA may pass')
  }
  const prefix = `repos/${repo}`
  const pr = mergedPull(read(`${prefix}/commits/${sha}/pulls?per_page=100`), { repo, sha, branch })
  const head = pr.head.sha
  assertGreenBeforeMerge(pr,
    read(`${prefix}/actions/runs?event=pull_request&head_sha=${head}&per_page=100`, 'workflow_runs'),
    read(`${prefix}/commits/${head}/check-runs?filter=latest&per_page=100`, 'check_runs'),
    read(`${prefix}/commits/${head}/statuses?per_page=100`))
  return pr.number
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const number = verifyMain({ repo: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF })
    console.log(`Main provenance passed: merged PR #${number} had green checks before merging.`)
  } catch (error) {
    // Never print gh stderr: transport diagnostics can contain authentication details.
    console.error(`Main provenance refused: ${error.status ? 'GitHub API request failed' : error.message}`)
    process.exitCode = 1
  }
}
