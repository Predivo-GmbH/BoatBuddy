import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = fs.readFileSync(new URL('../../.gitleaks.toml', import.meta.url), 'utf8')
const rules = config.split('[[rules]]').slice(1)
const jwt = rules.find(rule => /^\s*id = "jwt"/m.test(rule))
const allowlists = jwt?.split('[[rules.allowlists]]').slice(1) ?? []
const entries = allowlists.map(block => {
  const path = /^paths = \['''(.*)'''\]$/m.exec(block)?.[1]
  const secret = /^regexes = \['''(.*)'''\]$/m.exec(block)?.[1]
  assert.ok(path && secret, 'Each public JWT exception must have both a path and a secret pattern')
  const parts = /^\^([\w-]+)\\\.([\w-]+)\\\./.exec(secret)
  assert.ok(parts, 'Match the exact public header and payload, never a whole file')
  return { block, path: new RegExp(path), secret: new RegExp(secret), header: parts[1], payload: parts[2] }
})
const signature = 'x'.repeat(43) // Synthetic, never a usable signed credential.
const matches = (entry, path, token) => entry.path.test(path) && entry.secret.test(token)

test('only the two verified Supabase anon payloads have jwt-specific, path-scoped AND exceptions', () => {
  assert.equal(rules.length, 1)
  assert.equal(allowlists.length, 2)
  for (const entry of entries) {
    assert.match(entry.block, /^condition = "AND"$/m)
    assert.match(entry.block, /^regexTarget = "secret"$/m)
    const claims = JSON.parse(Buffer.from(entry.payload, 'base64url'))
    assert.equal(claims.role, 'anon')
    assert.equal(claims.iss, 'supabase')
    assert.ok(['xzythvxmuxmczuiophwp', 'svpewgbwousyheohlrtt'].includes(claims.ref))
    const token = `${entry.header}.${entry.payload}.${signature}`
    for (const prefix of ['', 'dist/']) {
      for (const chunk of ['supabase', 'useKontoberechnung']) {
        assert.ok(matches(entry, `${prefix}assets/${chunk}-offline123.js`, token))
      }
    }
  }
})

test('service-role tokens, another project, changed dates and different headers remain detectable in allowed chunks', () => {
  for (const entry of entries) {
    const claims = JSON.parse(Buffer.from(entry.payload, 'base64url'))
    for (const patch of [{ role: 'service_role' }, { ref: 'another-project' }, { exp: claims.exp + 1 }]) {
      const payload = Buffer.from(JSON.stringify({ ...claims, ...patch })).toString('base64url')
      assert.equal(matches(entry, 'dist/assets/supabase-offline123.js', `${entry.header}.${payload}.${signature}`), false)
    }
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    assert.equal(matches(entry, 'dist/assets/supabase-offline123.js', `${header}.${entry.payload}.${signature}`), false)
  }
})

test('the public payload does not exempt other paths, whole lines, or credential shapes', () => {
  for (const entry of entries) {
    const token = `${entry.header}.${entry.payload}.${signature}`
    for (const path of ['src/lib/supabase.ts', 'dist/assets/other-offline123.js', 'dist/assets/supabase-offline123.js.map',
      'nested/dist/assets/supabase-offline123.js', 'dist/assets/supabase.js']) {
      assert.equal(matches(entry, path, token), false)
    }
    for (const value of [`prefix${token}`, `${token}suffix`, `const token = "${token}";`, 'sk_live_offline_fixture']) {
      assert.equal(matches(entry, 'dist/assets/supabase-offline123.js', value), false)
    }
  }
})
