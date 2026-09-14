import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {minifyJavaScript} from '../scripts/patches/minify-javascript.js'
test('preserves namespace default re-exports and named exports without source maps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'memory-minify-'))
  try {
    await writeFile(path.join(directory,'base.mjs'), 'export const color = value => value;')
    const source = "export * from './base.mjs';\nexport * as default from './base.mjs';"
    await writeFile(path.join(directory,'original.mjs'),source)
    const minified = await minifyJavaScript(source, 'entry.mjs', true)
    assert.ok(!minified.includes('sourceMappingURL'))
    await writeFile(path.join(directory,'changed.mjs'),minified)
    const a = await import(pathToFileURL(path.join(directory,'original.mjs')))
    const b = await import(pathToFileURL(path.join(directory,'changed.mjs')))
    assert.deepEqual(Object.keys(b), Object.keys(a))
    assert.equal(a.default, b.default)
    assert.equal(b.color('value'), 'value')
  } finally { await rm(directory,{recursive:true,force:true}) }
})
test('accepts top-level await even when the module has no imports or exports', async () => {
  const result = await minifyJavaScript('async function main() { return 1 }\nawait main();', 'worker.js', true)
  assert.match(result, /await/)
})
