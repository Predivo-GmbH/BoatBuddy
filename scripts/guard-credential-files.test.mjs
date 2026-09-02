/**
 * Tests for the credential-file guard.
 *
 * Run: node --test scripts/guard-credential-files.test.mjs
 *
 * The decoy files these tests create contain the literal string
 * "DECOY - not a real credential". The real docs/Credentials.txt and its backup
 * are never read, copied or opened by this suite - the guard classifies NAMES.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isCredentialShaped, isBackupArtefact, stripBackupSuffixes } from './guard-credential-files.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GUARD = path.join(HERE, 'guard-credential-files.mjs')
const REPO_ROOT = path.resolve(HERE, '..')

/** The exact filename that sat unignored in the working tree on 2026-08-30. */
const REAL_BACKUP_NAME = 'Credentials.txt.bak-2026-08-30-before-mailbox-pw'

const runGuard = (args, cwd = REPO_ROOT) =>
  spawnSync(process.execPath, [GUARD, ...args], { cwd, encoding: 'utf8' })

test('the rotation backup suffix is stripped back to the credential stem', () => {
  assert.equal(stripBackupSuffixes(REAL_BACKUP_NAME), 'Credentials.txt')
  assert.equal(stripBackupSuffixes('Credentials.txt.bak'), 'Credentials.txt')
  assert.equal(stripBackupSuffixes('Credentials.txt.orig'), 'Credentials.txt')
  assert.equal(stripBackupSuffixes('Credentials.txt~'), 'Credentials.txt')
})

test('credential stores are recognised, including every backup spelling', () => {
  for (const name of [
    'Credentials.txt',
    'credentials.txt',
    'CREDENTIALS.TXT', // the case the .gitignore patterns miss on a Linux runner
    REAL_BACKUP_NAME,
    'Credentials.txt.bak',
    'credentials.json',
    '.env',
    '.env.local',
    '.env.eval',
    'id_rsa',
    'server.pem',
    'secrets.yaml',
    'passwords.csv',
    '.htpasswd',
  ]) {
    assert.equal(isCredentialShaped(name), true, name + ' should be refused')
  }
})

test('real BoatBuddy filenames that merely look similar are NOT refused', () => {
  for (const name of [
    '.env.example',
    'PasswordGate.tsx',
    'passwordgate.test.tsx',
    'FINDING-the-password-gate-protects-nothing-2026-09-01.md',
    'gate-a-routes.json',
    'package-lock.json',
    'guard-credential-files.mjs',
  ]) {
    assert.equal(isCredentialShaped(name), false, name + ' should be allowed')
  }
})

test('backup artefacts of anything are recognised as backup artefacts', () => {
  assert.equal(isBackupArtefact(REAL_BACKUP_NAME), true)
  assert.equal(isBackupArtefact('pre-commit.bak-2026-08-25-before-hc'), true)
  assert.equal(isBackupArtefact('package.json'), false)
})

test('the guard REFUSES a directory holding a decoy of the same shape', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-guard-decoy-'))
  try {
    fs.mkdirSync(path.join(dir, 'docs'))
    fs.writeFileSync(path.join(dir, 'docs', REAL_BACKUP_NAME), 'DECOY - not a real credential')
    fs.writeFileSync(path.join(dir, '.env.example'), 'ok')

    const r = runGuard(['--dir', dir])
    assert.equal(r.status, 1, 'guard must exit 1 on a decoy')
    assert.match(r.stderr, /REFUSED/)
    assert.match(r.stderr, new RegExp(REAL_BACKUP_NAME.replace(/\./g, '\\.')))
    assert.doesNotMatch(r.stderr, /\.env\.example/)
    // It reports the PATH and never the contents.
    assert.doesNotMatch(r.stderr, /DECOY - not a real credential/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the guard PASSES a directory with nothing credential-shaped in it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-guard-clean-'))
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), '# clean')
    fs.writeFileSync(path.join(dir, '.env.example'), 'ok')
    const r = runGuard(['--dir', dir])
    assert.equal(r.status, 0, r.stderr)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('this repository is currently clean under the guard', () => {
  const r = runGuard([])
  assert.equal(r.status, 0, r.stderr)
})
