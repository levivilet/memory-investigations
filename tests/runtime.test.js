import test from 'node:test'
import { execFileSync } from 'node:child_process'
test('runtime replacement preserves application bytes and rejects checksum mismatch', () => {
  execFileSync('python3', ['tests/test_runtime.py'], { stdio: 'pipe' })
})
