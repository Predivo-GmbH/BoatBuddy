import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const root = new URL('../../', import.meta.url)
const read = name => fs.readFileSync(new URL(name, root), 'utf8').replaceAll('\r\n', '\n')

test('BoatBuddy CSP preserves camera/blob/realtime and adds isolation and token-page privacy', () => {
  const ht = read('public/.htaccess')
  for (const directive of ["object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    "img-src 'self' data: blob:", 'https://xzythvxmuxmczuiophwp.supabase.co', 'wss://xzythvxmuxmczuiophwp.supabase.co']) assert.ok(ht.includes(directive), directive)
  assert.match(ht, /Header always set Referrer-Policy "same-origin"/)
  assert.match(ht, /Header always set Referrer-Policy "no-referrer" "expr=%\{THE_REQUEST\}/)
  const pattern = /m#(.*?)#/.exec(ht)[1]
  for (const route of ['/phone-upload', '/phone-upload?token=offline-fixture', '/phone-upload/']) assert.ok(new RegExp(pattern).test(`GET ${route} HTTP/1.1`))
  for (const route of ['/', '/dashboard', '/phone-upload-other', '/finanzen?next=/phone-upload']) assert.equal(new RegExp(pattern).test(`GET ${route} HTTP/1.1`), false)
  assert.match(ht, /camera=\(self\)/)
  assert.match(ht, /Header always set Cross-Origin-Opener-Policy "same-origin"/)
  assert.match(ht, /<FilesMatch "\\\.html\$">\s+Header always set Cache-Control "no-cache, no-store, must-revalidate"\s+Header always set Cross-Origin-Resource-Policy "same-origin"/)
  assert.match(ht, /Header always unset X-Powered-By/)
})

test('every Google font weight and subset is served locally with a valid woff2 file and license', () => {
  assert.doesNotMatch(read('index.html') + read('public/.htaccess'), /fonts\.googleapis\.com|fonts\.gstatic\.com/)
  const css = read('public/fonts/inter.css')
  const sources = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1])
  assert.ok(sources.length)
  for (const source of sources) {
    assert.match(source, /^\/fonts\/inter-[a-f0-9]+\.woff2$/)
    assert.equal(fs.readFileSync(new URL(`public${source}`, root)).subarray(0, 4).toString(), 'wOF2')
  }
  for (const weight of [400, 500, 600, 700]) assert.ok(css.includes(`font-weight: ${weight};`))
  assert.match(read('public/fonts/OFL.txt'), /SIL OPEN FONT LICENSE/)
})

test('every workflow uses GitHub-hosted runners and locked installs; staging alone verifies FTPS', () => {
  for (const file of fs.readdirSync(new URL('.github/workflows/', root))) {
    const text = read(`.github/workflows/${file}`).split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
    for (const [, runner] of text.matchAll(/runs-on:\s*([^\n]+)/g)) assert.equal(runner, 'ubuntu-latest', file)
    assert.doesNotMatch(text, /npm\s+install\b/, file)
  }
  const deploy = read('.github/workflows/deploy.yml')
  const staging = deploy.split('  deploy-staging:')[1].split('  gate-integration:')[0]
  assert.doesNotMatch(staging, /--insecure|set ssl:verify-certificate no|set ftp:ssl-protect-data no/)
  assert.equal([...staging.matchAll(/FTP_HOST: tertia.sui-inter.net/g)].length, 3)
  assert.equal([...staging.matchAll(/set ssl:verify-certificate yes/g)].length, 2)
  assert.equal([...staging.matchAll(/set ftp:ssl-protect-data yes/g)].length, 2)
  assert.match(staging, /sed -i 's\/xzythvxmuxmczuiophwp\/svpewgbwousyheohlrtt\/g'/)
  const production = deploy.split('\n  deploy:')[1]
  assert.match(production, /needs: \[main-pr-guard, gate-integration, gate-e2e, gate-security\]/)
  assert.match(production, /ssl:verify-certificate no; set ftp:ssl-protect-data no/)
  const mainGuard = read('.github/workflows/main-pr-guard.yml')
  assert.match(mainGuard, /push:\s+branches: \[main\]/)
  assert.doesNotMatch(mainGuard, /paths-ignore|cancel-in-progress: true/)
})

test('every edge handler Response carries no-store, including validation errors', () => {
  for (const file of ['extract-expense', 'backfill-reservierungen']) {
    const source = ts.createSourceFile('handler.ts', read(`supabase/functions/${file}/index.ts`), ts.ScriptTarget.Latest, true)
    const variables = new Map()
    const collect = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, node.initializer)
      ts.forEachChild(node, collect)
    }
    collect(source)
    const object = node => {
      if (node && ts.isIdentifier(node)) return object(variables.get(node.text))
      if (!node || !ts.isObjectLiteralExpression(node)) return {}
      return Object.assign({}, ...node.properties.map(prop => {
        if (ts.isSpreadAssignment(prop)) return object(prop.expression)
        if (ts.isPropertyAssignment(prop)) return { [prop.name.text]: prop.initializer }
        return {}
      }))
    }
    let responses = 0
    const visit = node => {
      if (ts.isNewExpression(node) && node.expression.getText(source) === 'Response') {
        responses++
        const cache = object(object(node.arguments?.[1]).headers)['Cache-Control']
        assert.equal(cache?.text, 'no-store', `${file} Response at ${node.getStart(source)} must not cache personal data`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.ok(responses > 0)
  }
})
