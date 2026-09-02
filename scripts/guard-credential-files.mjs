#!/usr/bin/env node
/**
 * GUARD: no credential-shaped file may be committable in this repo.
 *
 * WHY THIS EXISTS (2026-09-02)
 * ----------------------------
 * `docs/Credentials.txt` has been gitignored for a long time, but the password
 * rotation on 2026-08-30 left `docs/Credentials.txt.bak-2026-08-30-before-mailbox-pw`
 * sitting untracked in the working tree, matched by NOTHING in .gitignore - one
 * careless `git add .` from being committed forever. BoatBuddy has no user
 * accounts, so the single shared password in that file is the entire door for all
 * three owners.
 *
 * .gitignore alone is not a control:
 *   - it is silent, so nobody learns the next backup is exposed;
 *   - `git add -f` walks straight past it;
 *   - its patterns are CASE-SENSITIVE on the Linux CI runner even though this
 *     developer machine has core.ignorecase=true, so `CREDENTIALS.TXT` is ignored
 *     locally and NOT ignored in CI - the worst possible split.
 *
 * The global pre-commit hook is not a control for this repo either: it matches
 * secret VALUES harvested from BackOffice's credentials file, so it does not know
 * BoatBuddy's password at all, and it has no filename rule of any kind.
 *
 * So this guard checks NAMES, in CI, where nothing can bypass it.
 *
 * USAGE
 *   node scripts/guard-credential-files.mjs           # audit this repository
 *   node scripts/guard-credential-files.mjs --dir DIR # audit an arbitrary directory
 *
 * Exit 0 = clean. Exit 1 = refused (prints the offending PATHS - never contents).
 *
 * THIS FILE NEVER OPENS A MATCHED FILE. It reasons about names only, on purpose:
 * reading one to "check whether it is really a secret" is how a secret reaches a log.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Names that are allowed even though they look credential-shaped. */
const ALLOWLIST = new Set(['.env.example', '.env.sample', '.env.template', '.env.defaults'])

/** Backup / copy suffixes, stripped repeatedly before the stem is classified. */
const BACKUP_SUFFIX = /(\.bak(-[^.]*)?|\.backup|\.orig|\.old|\.save|\.copy|\.tmp|~| - Copy)$/i

/** A file whose *stem* matches any of these is a credential STORE. */
const STORE_PATTERNS = [
  /^credentials?\b/i, // Credentials.txt, credential.json
  /^\.env(\..+)?$/i, // .env, .env.local, .env.eval
  /^\.?htpasswd$/i, // htpasswd / .htpasswd
  /^id_(rsa|dsa|ecdsa|ed25519)$/i, // private SSH keys
  /\.(pem|p12|pfx|keystore|jks|ppk)$/i, // key material
  /^(secrets?|passwords?|passwd)\.(txt|md|csv|json|ya?ml|env|ini|conf|cfg)$/i,
]

/** Strip every backup suffix so `Credentials.txt.bak-2026-08-30-before-x` -> `Credentials.txt`. */
export function stripBackupSuffixes(basename) {
  // A dated rotation suffix can contain dots and dashes; peel that documented shape first.
  let stem = basename.replace(/\.bak-\d{4}-\d{2}-\d{2}(-.*)?$/i, '')
  let previous
  do {
    previous = stem
    stem = stem.replace(BACKUP_SUFFIX, '')
  } while (stem !== previous)
  return stem
}

/** True when this basename names a credential store (ignoring any backup suffix). */
export function isCredentialShaped(basename) {
  if (ALLOWLIST.has(basename)) return false
  const stem = stripBackupSuffixes(basename)
  if (ALLOWLIST.has(stem)) return false
  return STORE_PATTERNS.some((re) => re.test(stem))
}

/** True when this basename is a backup/copy artefact of anything at all. */
export function isBackupArtefact(basename) {
  return /\.bak(-|$|\.)/i.test(basename) || BACKUP_SUFFIX.test(basename)
}

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)

/** Canonical paths whose ignore rules must keep working, checked the way CI sees them. */
const MUST_STAY_IGNORED = [
  'docs/Credentials.txt',
  'docs/Credentials.txt.bak-2026-01-01-example',
  'docs/credentials.txt',
  'docs/credentials.txt.bak-2026-01-01-example',
  'Credentials.txt',
  'src/Credentials.txt',
  '.env.local',
]

function isIgnored(p) {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '-q', '--', p], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function auditDirectory(dir) {
  const failures = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (isCredentialShaped(entry.name)) failures.push(full)
    }
  }
  walk(dir)
  return failures
}

function auditRepository() {
  const failures = []

  // A. Nothing credential-shaped may be TRACKED. Case-insensitive, so it catches
  //    names the .gitignore patterns would miss on a case-sensitive runner.
  for (const p of git(['ls-files', '-z'])) {
    if (isCredentialShaped(path.basename(p))) {
      failures.push('TRACKED credential-shaped file: ' + p)
    }
  }

  // B. Nothing credential-shaped or backup-shaped may be untracked AND unignored -
  //    that is precisely "one `git add .` from being committed".
  for (const p of git(['ls-files', '--others', '--exclude-standard', '-z'])) {
    const base = path.basename(p)
    if (isCredentialShaped(base)) {
      failures.push('UNIGNORED credential-shaped file (a `git add .` would commit it): ' + p)
    } else if (isBackupArtefact(base)) {
      failures.push('UNIGNORED backup artefact (a `git add .` would commit it): ' + p)
    }
  }

  // C. The ignore rules themselves must still bite. If someone deletes the
  //    .gitignore block, A and B stay green on a clean checkout and only this fails.
  for (const p of MUST_STAY_IGNORED) {
    if (!isIgnored(p)) {
      failures.push('.gitignore NO LONGER IGNORES: ' + p)
    }
  }

  return failures
}

function main() {
  const argv = process.argv.slice(2)
  const dirFlag = argv.indexOf('--dir')
  const scanningDir = dirFlag !== -1

  if (scanningDir && !argv[dirFlag + 1]) {
    console.error('guard-credential-files: --dir needs a directory')
    process.exit(2)
  }

  const target = scanningDir ? path.resolve(argv[dirFlag + 1]) : process.cwd()
  const failures = scanningDir
    ? auditDirectory(target).map((p) => 'credential-shaped file: ' + p)
    : auditRepository()

  if (failures.length === 0) {
    const where = scanningDir ? target : 'repository'
    console.log('guard-credential-files: OK - nothing credential-shaped is committable (' + where + ')')
    process.exit(0)
  }

  console.error('')
  console.error('REFUSED - credential-shaped files found')
  console.error('')
  for (const f of failures) console.error('  - ' + f)
  console.error('')
  console.error('Fix it, do not bypass:')
  console.error('  - a credentials file NEVER belongs in the tree: keep it outside the repo,')
  console.error('    or ignored AND named so the .gitignore block matches it;')
  console.error('  - a BACKUP of a credentials file is still a credentials file;')
  console.error('  - never open the file to check what is in it - print a line COUNT, or hash it.')
  console.error('')
  process.exit(1)
}

// Run only when executed directly, so the pattern helpers stay importable by the test suite.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
