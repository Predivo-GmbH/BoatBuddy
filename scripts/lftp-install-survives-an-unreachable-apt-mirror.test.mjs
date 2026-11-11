// 11.11.2026 from ~13:55Z GitHub's machines could not resolve azure.archive.ubuntu.com and every apt step failed; a deploy
// whose first line was a bare `apt-get install lftp` went red on every GitHub machine (Cockpit #1104, BackOffice #363,
// mitchind #192 fixed the same thing).
// PROVES, by reading every .github/workflows/*.yml: each apt install of lftp (1) is skipped when the tools are already
// there (the laptop runner), (2) on failure points apt at archive.ubuntu.com once and tries again — no bare one-shot
// install is left. A second failure still fails the step (the retry line is not guarded).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function repoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (existsSync(join(dir, '.github', 'workflows'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('no .github/workflows above ' + fileURLToPath(import.meta.url))
    dir = up
  }
}

const wfDir = join(repoRoot(), '.github', 'workflows')
const files = readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n)).map((n) => ({ n, lines: readFileSync(join(wfDir, n), 'utf8').split(/\r?\n/) }))

test('no workflow installs lftp with a bare one-shot apt-get', () => {
  const bare = []
  for (const { n, lines } of files) {
    lines.forEach((l, i) => {
      if (/^\s*#/.test(l) || !/apt-get\s+install/.test(l) || !/\blftp\b/.test(l)) return
      const firstTry = /if ! \{ .*apt-get\s+install.*; \}; then/.test(l)
      const retry = /archive\.ubuntu\.com/.test(lines[i - 1] || '')
      if (!firstTry && !retry) bare.push(`${n}:${i + 1}: ${l.trim()}`)
    })
  }
  assert.deepEqual(bare, [], 'bare lftp installs left:\n' + bare.join('\n'))
})

test('every guarded lftp install is skipped when lftp exists and has its archive.ubuntu.com fallback', () => {
  for (const { n, lines } of files) {
    const text = lines.join('\n')
    const guards = (text.match(/^\s*if .*! command -v lftp >\/dev\/null 2>&1.*; then$/gm) || []).length
    const fallbacks = (text.match(/s#http:\/\/azure\.archive\.ubuntu\.com\/ubuntu#http:\/\/archive\.ubuntu\.com\/ubuntu#g/g) || []).length
    assert.equal(fallbacks, guards, `${n}: each guarded install needs its mirror fallback`)
  }
})
