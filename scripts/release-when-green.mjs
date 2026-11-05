#!/usr/bin/env node
// A CHANGE GOES LIVE AS SOON AS ITS STAGING RUN IS GREEN (Roger 2026-11-05, pop-up: customer products go live
// "as soon as staging is green, like Cockpit already does"; this replaces the daily Promotion Sweep he chose on
// 2026-09-18 as the way a change reaches production - the sweep and self-heal stay behind this as the backstop).
//
// WHY. Measured 2026-11-05 over 132 live code PRs of the customer products: 91 % of merge->production time was the
// wait for something to dispatch the release (median 2.4-6.9 h, p90 13-17 h), and on 05.11 the sweep shipped nothing
// at all. Cockpit (release-when-green since 2026-10-14) has a median of 0.37 h. Analysis:
// C:\Business\Docs\factory-system\_research\deploy-failure-analysis-2026-11-05.md.
//
// .github/workflows/release-when-green.yml runs this when a push run of deploy.yml on main COMPLETES GREEN, with the
// run's own commit X (workflow_run.head_sha, never "whatever main is now"). It dispatches deploy.yml with
// confirm=deploy and release_sha=<the commit to ship>, and deploy.yml runs its gates and deploys only while main still
// points at that commit (a newer push gets its own staging run, and that run releases it). So the release is EXACTLY
// the commit staging proved:
//   - X itself when X is still the tip of main, or the tip when it is newer than X only by files that start no
//     staging run (deploy.yml's own push filter, read from the file - the staging gate in deploy.yml accepts exactly
//     that case). A GitHub dispatch can only name a branch or a tag, and every production reader in the fleet
//     (production-monitor self-heal, check-deploy-failures, release attribution, last-production-commit) counts only
//     dispatches of main, so a commit that is no longer the tip is left to the newer commit's own staging run;
//   - only when the commit live in production is an ANCESTOR of it (never roll production backwards);
//   - never twice: not while a release of it is queued or running, not when it is already live;
//   - anything it could not read is a "no", said in the log. Nothing here guesses.
//
// deploy.yml keeps every gate: its production job still refuses a commit without a green staging run of its own.
//
// env: GH_TOKEN (this repository's GITHUB_TOKEN, actions: write), GITHUB_REPOSITORY, SHA (the green staging commit).
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const BRANCH = 'main'
export const DEPLOY_WORKFLOW = 'deploy.yml'
/** The jobs of deploy.yml that write production. A dispatch whose one of these concluded success is a release. */
export const PRODUCTION_JOBS = ['deploy']
/** How many dispatch runs (newest first) are read to find the commit live in production. */
export const MAX_RELEASES_READ = 30
/**
 * The docs-only rule of deploy.yml's "Verify staging gate" step (its SAFE pattern): the production job accepts a
 * commit without its own staging run only when everything since a green staged commit matches this. A newer tip is
 * released in X's place only when its files both start no staging run AND pass this, so the gate never refuses it.
 */
export const GATE_DOCS_ONLY = /^(docs\/|.*\.md$|README|LICENSE|\.gitignore$|\.gitleaks\.toml$|\.gitleaksignore$)/

/** A GitHub workflow filter glob as a RegExp: `*` stays inside a folder, `**` crosses folders. Pure. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2 } else { re += '.*'; i += 1 }
    } else if (c === '*') re += '[^/]*'
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/**
 * The `on.push` path filter of a workflow file: { kind: 'paths-ignore' | 'paths', patterns } or null when it cannot
 * be read with certainty (no push trigger, no filter, an unexpected shape). Only the plain block shape this fleet
 * writes is understood; anything else is null, and null means "do not release a commit by this rule". Pure.
 */
export function pushPathFilter(yamlText) {
  const lines = String(yamlText).replace(/\r\n/g, '\n').split('\n')
  const indentOf = (l) => l.search(/\S/)
  const isNoise = (l) => /^\s*(#.*)?$/.test(l)
  const onAt = lines.findIndex((l) => /^on:\s*(#.*)?$/.test(l))
  if (onAt < 0) return null
  let pushAt = -1
  for (let i = onAt + 1; i < lines.length; i++) {
    if (isNoise(lines[i])) continue
    if (indentOf(lines[i]) === 0) break
    if (/^ {2}push:\s*(#.*)?$/.test(lines[i])) { pushAt = i; break }
  }
  if (pushAt < 0) return null
  let filter = null
  let inFilter = false
  for (let i = pushAt + 1; i < lines.length; i++) {
    const l = lines[i]
    if (isNoise(l)) continue
    const ind = indentOf(l)
    if (ind <= 2) break
    if (ind === 4) {
      const key = /^ {4}([\w-]+):\s*([^#]*?)\s*(#.*)?$/.exec(l)
      if (!key) return null
      inFilter = key[1] === 'paths' || key[1] === 'paths-ignore'
      if (inFilter) {
        if (filter || key[2]) return null // two filters, or an inline list: not a shape this reads
        filter = { kind: key[1], patterns: [] }
      }
      continue
    }
    const item = /^\s+-\s+(['"]?)(.+?)\1\s*(#.*)?$/.exec(l)
    if (!item) return null
    if (inFilter) filter.patterns.push(item[2])
  }
  if (!filter || filter.patterns.length === 0) return null
  // GitHub's `?`, `+` and `[...]` mean something this reader does not model: unknown, not a guess.
  if (filter.patterns.some((p) => /[?+[\]]/.test(p))) return null
  return filter
}

/** Would a push that changes only `file` start a staging run under this filter? GitHub's rule: the last match wins. Pure. */
export function startsStagingRun(file, filter) {
  let last = null // the last pattern that matched: true = a plain one, false = a negated (!) one
  for (const raw of filter.patterns) {
    const negated = raw.startsWith('!')
    if (globToRegExp(negated ? raw.slice(1) : raw).test(file)) last = !negated
  }
  // paths: the file counts when the last match is a plain pattern. paths-ignore: it is ignored when it is.
  return filter.kind === 'paths' ? last === true : last !== true
}

/**
 * The changed files of a GitHub compare payload, both sides of a rename, or null when the payload cannot be trusted:
 * not ahead/identical, empty where it cannot be, or cut off at GitHub's 300 files. Pure.
 */
export function filesOfCompare(body) {
  if (!body || !['ahead', 'identical'].includes(body.status)) return null
  const files = Array.isArray(body.files) ? body.files : null
  if (!files) return null
  if (files.length >= 300) return null
  if (body.status === 'ahead' && files.length === 0) return null
  return files.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]))
}

const short = (s) => String(s || '').slice(0, 7)

/**
 * Which commit does a green staging run of `sha` release? `sha` itself while it is the tip of main; the tip when it is
 * newer only by files that start no staging run; otherwise none - the newer commit releases itself when its own
 * staging run goes green. Pure.
 * @returns {{ ship: string | null, why: string }}
 */
export function chooseShip({ sha, tipSha, newerFiles, filter }) {
  if (!/^[0-9a-f]{40}$/.test(String(sha))) return { ship: null, why: `no valid staging commit was handed over (${JSON.stringify(sha)})` }
  if (!tipSha) return { ship: null, why: `could not read where ${BRANCH} points - not releasing a branch whose tip is unknown` }
  if (tipSha === sha) return { ship: sha, why: `${short(sha)} is green on staging and is still the tip of ${BRANCH}` }
  if (!Array.isArray(newerFiles)) return { ship: null, why: `${BRANCH} moved on to ${short(tipSha)} and what changed could not be read - its own staging run releases it` }
  if (!filter) return { ship: null, why: `${BRANCH} moved on to ${short(tipSha)} and deploy.yml's push filter could not be read - not guessing which files start a staging run` }
  if (newerFiles.length && newerFiles.every((f) => !startsStagingRun(f, filter) && GATE_DOCS_ONLY.test(f))) {
    return { ship: tipSha, why: `${short(sha)} is green on staging; ${BRANCH} is newer only by ${newerFiles.length} file(s) that start no staging run, so its tip ${short(tipSha)} ships the same app` }
  }
  return { ship: null, why: `${BRANCH} moved on to ${short(tipSha)}, which has a staging run of its own and releases itself when it goes green` }
}

/**
 * Release `ship` now? Pure.
 * @param {{ ship: string, productionSha: string | null, ancestry: string | null, shipReleases: { status: string, conclusion: string | null }[] | null }} p
 *   productionSha: the commit live in production, null when it could not be established.
 *   ancestry: GitHub's compare status of productionSha...ship ('ahead' = ship descends from production).
 * @returns {{ release: boolean, why: string }}
 */
export function releaseDecision({ ship, productionSha, ancestry, shipReleases }) {
  if (!Array.isArray(shipReleases)) return { release: false, why: `could not read the releases already made of ${short(ship)} - not risking a second one` }
  const running = shipReleases.find((r) => r.status !== 'completed')
  if (running) return { release: false, why: `a release of ${short(ship)} is already ${running.status}` }
  if (!productionSha) return { release: false, why: 'could not establish which commit is live in production - not releasing anything that might roll it back' }
  if (productionSha === ship || ancestry === 'identical') return { release: false, why: `${short(ship)} is already live in production` }
  if (ancestry !== 'ahead') {
    return { release: false, why: `${short(ship)} does not descend from production's ${short(productionSha)} (compare: ${ancestry ?? 'unreadable'}) - releasing it would roll production back` }
  }
  return { release: true, why: `${short(ship)} is green on staging and descends from production's ${short(productionSha)}` }
}

/** From dispatch runs of main (newest first) and a jobs lookup, the commit of the newest production job that succeeded. */
export async function productionCommit(dispatchRuns, jobsOf, max = MAX_RELEASES_READ) {
  for (const run of dispatchRuns.filter((r) => r.status === 'completed').slice(0, max)) {
    const jobs = await jobsOf(run.id)
    if (!Array.isArray(jobs)) return null // unreadable is not "none"
    const shipped = jobs.find((j) => PRODUCTION_JOBS.includes(j.name) && j.conclusion === 'success')
    if (shipped && /^[0-9a-f]{40}$/.test(shipped.head_sha || '')) return shipped.head_sha
  }
  return null
}

/**
 * deploy.yml names a pinned dispatch after its pin (its `run-name`), because a dispatch run's head_sha is whatever main
 * pointed at when GitHub created it, and the API does not return a run's inputs. Same idea as techLEARN's release.yml.
 */
export const pinTitle = (sha) => `Release ${sha} (release-when-green)`

/** The commit a dispatch run was pinned to, from its name, or null for a run that carries no pin. Pure. */
export function pinOf(run) {
  const m = /^Release ([0-9a-f]{40}) \(release-when-green\)$/.exec(String(run?.display_title ?? ''))
  return m ? m[1] : null
}

/**
 * Will this dispatch run really release its head commit? A run without a pin (the button, the sweep, a session) does;
 * a run whose pin is not its head commit skips every gate and deploy (release-pin), so it is no release of anything and
 * must not stop the real one (Codex review 2026-11-05). Pure.
 */
export const releasesItsHead = (run) => {
  const pin = pinOf(run)
  return pin === null || pin === run.head_sha
}

/** Read, decide, dispatch; when main moved between the decision and the dispatch, decide again (at most 3 times). */
export async function releaseWhenGreen(opts) {
  let out
  for (let pass = 1; pass <= 3; pass++) {
    out = await releasePass(opts)
    if (!out.retry) return out
    ;(opts.log ?? console.log)(`Deciding again (pass ${pass + 1}): main moved while the release of ${short(out.ship)} was dispatched.`)
  }
  return { ...out, retry: false }
}

/** One pass: read, decide, dispatch, confirm. `api(path, init)` answers { ok, status, body }. */
export async function releasePass({ repo, sha, workflowText, api, wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log, now = () => Date.now() }) {
  const ref = await api(`/repos/${repo}/git/ref/heads/${BRANCH}`)
  const tipSha = ref.ok ? ref.body?.object?.sha ?? null : null
  let newerFiles = []
  if (tipSha && tipSha !== sha) {
    const cmp = await api(`/repos/${repo}/compare/${sha}...${tipSha}`)
    newerFiles = cmp.ok ? filesOfCompare(cmp.body) : null
  }
  const chosen = chooseShip({ sha, tipSha, newerFiles, filter: pushPathFilter(workflowText) })
  if (!chosen.ship) {
    log(`Not releasing: ${chosen.why}`)
    return { release: false, why: chosen.why, dispatched: false }
  }
  const ship = chosen.ship
  log(`Candidate: ${chosen.why}`)

  // The run list is read UNFILTERED and narrowed here: GitHub has answered filtered lists (branch=, event=, status=,
  // head_sha=) partially or empty (08-deployment.md, 2026-10-05 and 2026-10-22). Three pages = the last 300 runs.
  const runs = []
  let readable = true
  for (let page = 1; page <= 3; page++) {
    const r = await api(`/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW}/runs?per_page=100&page=${page}`)
    if (!r.ok || !Array.isArray(r.body?.workflow_runs)) { readable = false; break }
    runs.push(...r.body.workflow_runs)
    if (r.body.workflow_runs.length < 100) break
  }
  const dispatches = readable ? runs.filter((r) => r.event === 'workflow_dispatch' && r.head_branch === BRANCH) : null
  const shipReleases = dispatches
    ? dispatches.filter((r) => r.head_sha === ship && releasesItsHead(r)).map((r) => ({ status: r.status, conclusion: r.conclusion }))
    : null
  const productionSha = dispatches
    ? await productionCommit(dispatches, async (id) => {
      const j = await api(`/repos/${repo}/actions/runs/${id}/jobs?per_page=100`)
      return j.ok && Array.isArray(j.body?.jobs) ? j.body.jobs : null
    })
    : null
  let ancestry = null
  if (productionSha && productionSha !== ship) {
    const cmp = await api(`/repos/${repo}/compare/${productionSha}...${ship}`)
    ancestry = cmp.ok ? cmp.body?.status ?? null : null
  }
  const d = releaseDecision({ ship, productionSha, ancestry, shipReleases })
  log(`${d.release ? 'Releasing' : 'Not releasing'}: ${d.why}`)
  if (!d.release) return { ...d, ship, dispatched: false }

  const dispatchedAt = now()
  const sent = await api(`/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: BRANCH, inputs: { confirm: 'deploy', release_sha: ship } }),
  })
  if (!sent.ok) throw new Error(`the production release of ${short(ship)} could not be dispatched (HTTP ${sent.status}); the Promotion Sweep and self-heal are still behind this`)
  log(`Production release of ${ship} dispatched (deploy.yml, confirm=deploy, release_sha=${short(ship)}).`)

  // CONFIRM WHAT GITHUB MADE OF IT. The dispatch names the branch, so if main moved in the second between reading its
  // tip and this dispatch, the run carries the newer commit and ships nothing (release-pin). A newer CODE commit then
  // releases itself when its staging run is green (and this run no longer counts as its release: releasesItsHead), but
  // a newer DOCS-only commit starts no staging run, so nothing else would ever release it: decide again now.
  // Waiting here also lets GitHub list the new run before a second staging completion is decided (this workflow's
  // concurrency group queues it behind this pass), so the same commit is never dispatched twice.
  let mine = null
  for (let i = 0; i < 6 && !mine; i++) {
    await wait(i === 0 ? 15_000 : 10_000)
    const after = await api(`/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW}/runs?per_page=30`)
    mine = after.ok
      ? (after.body?.workflow_runs || []).find((r) => r.event === 'workflow_dispatch' && pinOf(r) === ship && Date.parse(r.created_at) >= dispatchedAt - 120_000) ?? null
      : null
  }
  if (!mine) {
    log('The release run is not listed yet; it is in the deploy-production queue.')
    return { ...d, ship, dispatched: true }
  }
  if (mine.head_sha !== ship) {
    log(`Main moved on to ${short(mine.head_sha)} before GitHub created the run (${mine.html_url}): it ships nothing.`)
    return { ...d, ship, dispatched: false, retry: true, superseded: mine.html_url }
  }
  log(`Release run: ${mine.html_url}`)
  return { ...d, ship, dispatched: true }
}

async function main() {
  const token = process.env.GH_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const sha = process.env.SHA
  if (!token || !repo || !sha) throw new Error('release-when-green needs GH_TOKEN, GITHUB_REPOSITORY and SHA')
  const api = async (path, init = {}) => {
    try {
      const r = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'release-when-green' },
        signal: AbortSignal.timeout(30_000),
      })
      return { ok: r.ok, status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) }
    } catch {
      return { ok: false, status: 0, body: null }
    }
  }
  const workflowText = readFileSync(new URL(`../.github/workflows/${DEPLOY_WORKFLOW}`, import.meta.url), 'utf8')
  await releaseWhenGreen({ repo, sha, workflowText, api })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`::error::${error.message}`); process.exitCode = 1 })
}
