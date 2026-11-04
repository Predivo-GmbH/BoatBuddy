// Edge functions run on Supabase's Edge Runtime, which does NOT provide Node's globals.
// `Buffer.from(...)` without an import passed every offline test (Node and newer local Deno
// have the global) and threw a ReferenceError on the platform: member-session answered 503 to
// every sign-in (staging release run 41929196303, 2026-11-04). A Node global used in an edge
// function must be imported from its `node:` module.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

export const NODE_GLOBALS = Object.freeze(['Buffer', 'process', 'global', 'setImmediate', 'clearImmediate', '__dirname', '__filename', 'require'])

/** Node globals a source uses as free identifiers without importing them. */
export function unimportedNodeGlobals(source, fileName = 'edge.ts') {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const declared = new Set()
  const used = new Set()
  const visit = node => {
    if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) {
      if (node.name) declared.add(node.name.text)
    } else if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isParameter(node) || ts.isClassDeclaration(node)) &&
        node.name && ts.isIdentifier(node.name)) {
      declared.add(node.name.text)
    } else if (ts.isIdentifier(node) && NODE_GLOBALS.includes(node.text)) {
      const parent = node.parent
      const isMemberName = (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node)
      if (!isMemberName) used.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return [...used].filter(name => !declared.has(name)).sort()
}

function edgeSources(dir = 'supabase/functions') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return edgeSources(path)
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

test('no edge function uses a Node global it did not import', () => {
  const files = edgeSources()
  assert.ok(files.length >= 5, 'the edge function sources were found')
  for (const file of files) {
    assert.deepEqual(unimportedNodeGlobals(readFileSync(file, 'utf8'), file), [], `${file} must import these from node:`)
  }
})

test('the detector catches the line that broke member-session, and accepts its fix', () => {
  const broken = `import { timingSafeEqual } from 'node:crypto'\nexport const f = (a, h) => timingSafeEqual(a, Buffer.from(h, 'hex'))`
  assert.deepEqual(unimportedNodeGlobals(broken), ['Buffer'])
  assert.deepEqual(unimportedNodeGlobals(`import { Buffer } from 'node:buffer'\n${broken}`), [])
  assert.deepEqual(unimportedNodeGlobals(`const x = process.env.X; setImmediate(() => {})`), ['process', 'setImmediate'])
  // Names that are only property names, strings or comments are not uses.
  assert.deepEqual(unimportedNodeGlobals(`// Buffer\nconst o = { global: 1, process: 2 }; o.global; const s = 'Buffer'; rpc({ p_key: 'global' })`), [])
})
