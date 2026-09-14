import test from 'node:test'
import { execFileSync } from 'node:child_process'
test('runtime replacement preserves application bytes and rejects checksum mismatch', () => {
  execFileSync('python3', ['tests/test_runtime.py'], { stdio: 'pipe' })
})

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('stale installed runtime is rejected before replacing the basic app', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'memory-runtime-test-'))
  try {
    const root = path.join(fixture, 'vendor/benchmark')
    const lvce = path.join(root, '.tmp/apps/lvce/usr/lib/lvce')
    const basic = path.join(root, '.tmp/apps/basic-electron')
    await mkdir(path.join(lvce, 'resources/app'), { recursive: true })
    await mkdir(basic, { recursive: true })
    await writeFile(path.join(lvce, 'resources/app/package.json'), JSON.stringify({ electronVersion: '43.1.0' }))
    await writeFile(path.join(lvce, 'lvce'), '#!/bin/sh\nprintf "43.1.0\\n"\n', { mode: 0o755 })
    await writeFile(path.join(basic, 'marker'), 'preserved')
    const runtime = { version: 'Electron 44.3.0', sha256: 'same-pin' }
    await writeFile(path.join(root, 'editors.lock.json'), JSON.stringify([{ id: 'lvce', runtime }, { id: 'basic-electron', ...runtime }]))
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/prepare-experiment.js', import.meta.url)), 'matched'], { cwd: fixture, stdio: 'pipe' }), /Installed Electron 43\.1\.0 does not match pinned 44\.3\.0/)
    assert.equal(await readFile(path.join(basic, 'marker'), 'utf8'), 'preserved')
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
