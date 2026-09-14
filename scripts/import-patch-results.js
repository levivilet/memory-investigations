import {readFile, readdir, copyFile} from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {analyze} from './analyze.js'
import {checkArchitecture} from './check-architecture.js'
const root = path.resolve(process.argv[2])
const modes = ['shared-in-main','services-in-main','renderer-chunks','lazy-git','rollup-terser','combined']
const files = await readdir(root, {recursive:true}), pending = []
const read = async name => {
  const matches = files.filter(f => path.basename(f) === name + '.json')
  assert.equal(matches.length, 1, `Expected exactly one ${name}.json`)
  const from = path.join(root, matches[0]), raw = JSON.parse(await readFile(from))
  pending.push({name,from})
  return raw
}
let source
for (const mode of modes) {
  const control = await read(mode+'-control'), changed = await read(mode)
  source ||= control
  for (const raw of [control,changed]) {
    assert.ok(raw.runUrl?.startsWith('https://github.com/levivilet/memory-investigations/actions/runs/'))
    assert.equal(raw.commit, source.commit, 'Mixed benchmark commits')
    assert.equal(raw.runUrl, source.runUrl, 'Mixed benchmark runs')
    assert.equal(raw.fixtureSha256, source.fixtureSha256)
    const analysis = analyze(raw)
    assert.equal(analysis.editors.length, 2)
    assert.ok(analysis.editors.every(e => e.qualified), `Incomplete trials: ${mode}`)
    const lvce = raw.editors.find(e=>e.id==='lvce'), basic = raw.editors.find(e=>e.id==='basic-electron')
    assert.equal(lvce.runtime.version, 'Electron 44.3.0')
    assert.equal(basic.version, lvce.runtime.version)
    assert.equal(basic.runtimeArchiveSha256, lvce.runtime.sha256)
  }
  assert.deepEqual(control.protocol, changed.protocol)
  for (const key of ['cpu','kernel','arch','logicalCpus','display']) assert.equal(control.host[key], changed.host[key])
  const prep = await read(mode+'-preparation')
  assert.equal(prep.applicationCommit, '9637939')
  assert.equal(prep.electronVersion, '44.3.0')
  const diagnostic = await read(mode+'-diagnostic')
  assert.equal(diagnostic.commit, source.commit)
  assert.equal(diagnostic.runUrl, source.runUrl)
  checkArchitecture(mode, diagnostic)
}
for (const mode of ['lazy-git','combined']) {
const repository = await read(mode+'-repository')
assert.equal(repository.protocol.workspace_kind, 'git')
assert.ok(analyze(repository).editors.every(e=>e.qualified))
assert.equal(repository.commit, source.commit)
assert.equal(repository.runUrl, source.runUrl)
const repoDiagnostic = await read(mode+'-repository-diagnostic')
assert.equal(repoDiagnostic.commit, source.commit)
assert.equal(repoDiagnostic.runUrl, source.runUrl)
checkArchitecture(mode+'-repository', repoDiagnostic)
}
// Validate the whole set before replacing any published evidence.
for (const {name,from} of pending) await copyFile(from, `data/${name}.json`)
console.log('Imported production patch evidence from', source.runUrl)
