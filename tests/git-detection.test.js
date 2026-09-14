import {test} from 'node:test'
import assert from 'node:assert/strict'
import {memoryHasGitRepository} from '../scripts/patches/git-detection.js'
test('finds repository markers in the workspace and parents, including encoded paths', async () => {
  for (const marker of ['file:///tmp/a%20b/.git', 'file:///tmp/.git']) {
    assert.equal(await memoryHasGitRepository(async () => 'file:///tmp/a%20b/nested', async uri => uri === marker), true)
  }
})
test('stops at filesystem root and rechecks after a repository is created', async () => {
  const calls = [], markers = new Set()
  const exists = async uri => { calls.push(uri); return markers.has(uri) }
  const workspace = async () => 'file:///tmp/plain/'
  assert.equal(await memoryHasGitRepository(workspace, exists), false)
  assert.deepEqual(calls, ['file:///tmp/plain/.git', 'file:///tmp/.git', 'file:///.git'])
  markers.add('file:///tmp/plain/.git')
  assert.equal(await memoryHasGitRepository(workspace, exists), true)
})
test('does not probe local paths for virtual workspaces', async () => {
  assert.equal(await memoryHasGitRepository(async () => 'memfs:///workspace', () => { throw Error('unexpected probe') }), false)
})
