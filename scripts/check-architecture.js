import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
export function checkArchitecture(mode, raw) {
  assert.ok(['shared-in-main','services-in-main','renderer-chunks','lazy-git','rollup-terser','combined','lazy-git-repository','combined-repository'].includes(mode), 'Unknown experiment')
  assert.equal(raw.trials.length, 1)
  const trial = raw.trials[0]
  assert.equal(trial.editor, 'lvce')
  assert.equal(trial.status, 'passed', 'Diagnostic must pass edit/save')
  const d = trial.diagnostics
  assert.equal(d.versions.electron, '44.3.0')
  assert.deepEqual(d.errors, [], 'Incomplete diagnostic')
  assert.ok(d.renderer?.heapAfterGc, 'Renderer diagnostic missing')
  assert.ok(d.targets.every(target => target.heapAfterGc && !target.error), 'Incomplete worker diagnostics')
  const services = d.processes.filter(p => p.serviceName === 'node.mojom.NodeService').map(p => p.name)
  const has = name => services.includes(name)
  if (['shared-in-main','services-in-main','combined','combined-repository'].includes(mode)) assert.equal(has('shared-process'), false)
  if (['services-in-main','combined','combined-repository'].includes(mode)) assert.equal(has('File System Process'), false)
  else assert.equal(has('File System Process'), true)
  if (['lazy-git','combined'].includes(mode)) {
    assert.equal(has('Extension builtin.git: Git'), false)
    assert.ok(d.targets.every(t => !t.url.includes('/builtin.git/')))
  } else {
    assert.equal(has('Extension builtin.git: Git'), true, 'Git must remain active in other experiments')
  }
  if (['renderer-chunks','combined','combined-repository'].includes(mode)) {
    assert.equal(d.targets.length, 0, 'Native workers remain')
    assert.ok(d.renderer.chunks.length >= (mode === 'combined' ? 15 : 17), 'Expected startup services did not load')
    assert.ok(d.renderer.chunks.every(c => c.state === 'loaded'), 'Chunk load failed')
  } else assert.ok(d.targets.length >= (mode === 'lazy-git' ? 15 : 17), 'Startup services are missing')
  return {services, workerCount:d.targets.length, chunkCount:d.renderer.chunks?.length || 0}
}
if (process.argv[1]?.endsWith('/check-architecture.js')) {
  const [mode, file] = process.argv.slice(2)
  console.log(checkArchitecture(mode, JSON.parse(await readFile(file))))
}
