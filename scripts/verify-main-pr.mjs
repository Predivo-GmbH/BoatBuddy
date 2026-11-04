// SR-SUP-12: Roger's free release gate. Missing evidence and API errors fail closed.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const requiredWorkflows = ['.github/workflows/test.yml', '.github/workflows/gitleaks.yml', '.github/workflows/security.yml']

// BackOffice 56a98437: Node supplies fetch even when the runner has no GitHub CLI.
// Keep credentials on this API origin/path and reject truncated or looping pagination.
export function githubClient({ token = process.env.GITHUB_TOKEN,
  apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com', fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN is required to read PR evidence')
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'boatbuddy-verify-main-pr' }
  return async (endpoint, readPage = body => body) => {
    const first = new URL(`${apiUrl.replace(/\/$/, '')}/${endpoint}`)
    const items = []
    const seen = new Set()
    let url = first.href
    let total
    while (url) {
      const next = new URL(url)
      if (next.origin !== first.origin || next.pathname !== first.pathname || next.username || next.password) {
        throw new Error('GitHub API returned an unsafe pagination link')
      }
      if (seen.has(url) || seen.size >= 50) throw new Error('Too many or repeated pages of GitHub evidence')
      seen.add(url)
      let response
      try {
        response = await fetchImpl(url, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(30000) })
      } catch {
        // Transport errors can contain credentials; never echo their message or body.
        throw new Error('GitHub API request failed')
      }
      if (!response.ok) throw new Error(`GitHub API answered HTTP ${response.status}`)
      let body
      try { body = await response.json() } catch { throw new Error('GitHub API returned invalid JSON') }
      const batch = readPage(body)
      if (!Array.isArray(batch)) throw new Error('GitHub API returned no evidence list')
      if (!Array.isArray(body)) {
        if (!Number.isSafeInteger(body.total_count) || body.total_count < 0
          || (total !== undefined && total !== body.total_count)) throw new Error('GitHub evidence count changed or is missing')
        total = body.total_count
      }
      items.push(...batch)
      url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1] ?? null
    }
    if (total !== undefined && total !== items.length) throw new Error('GitHub API returned incomplete evidence')
    return items
  }
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
  if (!checks.length) throw new Error('PR has no check runs')
  for (const check of checks) {
    if (check.head_sha !== pr.head.sha || check.status !== 'completed'
      || !['success', 'skipped', 'neutral'].includes(check.conclusion) || !before(check.completed_at)) {
      throw new Error('A PR check was pending or unsuccessful at merge time')
    }
  }
  const latestStatuses = new Map()
  for (const status of [...statuses].sort((a, b) => b.id - a.id)) {
    if (!before(status.updated_at ?? status.created_at)) throw new Error('A PR commit status finished after merge or has no timestamp')
    if (!latestStatuses.has(status.context)) latestStatuses.set(status.context, status)
  }
  if ([...latestStatuses.values()].some(status => status.state !== 'success')) throw new Error('A PR commit status was pending or unsuccessful at merge time')
}

export async function verifyMain({ repo, sha, branch = 'main', ref, token, apiUrl, fetchImpl }) {
  if (!/^[A-Za-z\d-]+\/(?!\.\.?$)[\w.-]+$/.test(repo ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '') || ref !== `refs/heads/${branch}`) {
    throw new Error('Only a default-branch commit with a valid repository/SHA may pass')
  }
  const read = githubClient({ token, apiUrl, fetchImpl })
  const prefix = `repos/${repo}`
  const pr = mergedPull(await read(`${prefix}/commits/${sha}/pulls?per_page=100`), { repo, sha, branch })
  const head = pr.head.sha
  assertGreenBeforeMerge(pr,
    await read(`${prefix}/actions/runs?event=pull_request&head_sha=${head}&per_page=100`, body => body?.workflow_runs),
    await read(`${prefix}/commits/${head}/check-runs?filter=latest&per_page=100`, body => body?.check_runs),
    await read(`${prefix}/commits/${head}/status?per_page=100`, body => {
      if (body?.sha !== head) throw new Error('Combined status does not prove the PR head')
      // GitHub reports pending with zero legacy status contexts; check runs still decide.
      if (body.total_count > 0 && body.state !== 'success') throw new Error('PR combined status is not green')
      return body.statuses
    }))
  return pr.number
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const number = await verifyMain({ repo: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF })
    console.log(`Main provenance passed: merged PR #${number} had green checks before merging.`)
  } catch (error) {
    console.error(`Main provenance refused: ${error.message}`)
    process.exitCode = 1
  }
}
