import {test} from 'node:test'
import assert from 'node:assert/strict'
import {checkArchitecture} from '../scripts/check-architecture.js'
import {readFileSync} from 'node:fs'
const stock = JSON.parse(readFileSync('data/diagnostic-ci.json'))
test('rejects a cosmetic process patch that leaves the shared service running', () => {
  assert.throws(() => checkArchitecture('shared-in-main', stock))
})
test('rejects worker consolidation if native workers still run', () => {
  assert.throws(() => checkArchitecture('renderer-chunks', stock))
})
test('requires Git to activate in a repository', () => {
  const raw = structuredClone(stock)
  raw.trials[0].diagnostics.processes = raw.trials[0].diagnostics.processes.filter(p => p.name !== 'Extension builtin.git: Git')
  assert.throws(() => checkArchitecture('lazy-git-repository', raw))
})
