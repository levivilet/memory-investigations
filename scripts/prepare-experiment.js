import { cp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { transform } from 'esbuild'
const root = path.resolve('vendor/benchmark')
const mode = process.argv[2] || 'matched'
if (!['matched', 'minified', 'workers', 'no-git'].includes(mode)) throw new Error('Unknown experiment')
const apps = path.join(root, '.tmp/apps')
const lvce = path.join(apps, 'lvce/usr/lib/lvce')
const pkg = JSON.parse(await readFile(path.join(lvce, 'resources/app/package.json')))
const lockPath = path.join(root, 'editors.lock.json')
const lock = JSON.parse(await readFile(lockPath))
const basic = lock.find(e => e.id === 'basic-electron')
await rm(path.join(apps, 'basic-electron'), { recursive: true, force: true })
await cp(lvce, path.join(apps, 'basic-electron'), { recursive: true })
await rm(path.join(apps, 'basic-electron/resources/app'), { recursive: true })
await rm(path.join(apps, 'basic-electron/resources/default_app.asar'), { force: true })
await cp(path.join(root, 'basic-electron'), path.join(apps, 'basic-electron/resources/app'), { recursive: true })
Object.assign(basic, { binary: 'lvce', version: `Electron ${pkg.electronVersion} (LVCE runtime)`, runtimeArchiveSha256: lock.find(e => e.id === 'lvce').sha256, notes: 'Minimal app installed into a copy of the exact LVCE runtime; original Electron 40 download metadata is retained as historical provenance only.' })
const changes = []
if (mode === 'no-git') {
  const config = JSON.parse(await readFile(path.join(lvce, 'resources/app/config.json')))
  const manifest = path.join(lvce, 'resources/app/static', config.commit, 'extensions/builtin.git/extension.json')
  const extension = JSON.parse(await readFile(manifest))
  extension.disabled = true
  await writeFile(manifest, JSON.stringify(extension, null, 2))
  changes.push({ file: manifest.split('/resources/app/')[1], change: 'disabled: true; diagnostic ablation removes Git functionality' })
}
if (mode === 'minified') {
  const app = path.join(lvce, 'resources/app')
  for (const relative of await readdir(app, { recursive: true })) {
    if (!/\.(m?js|cjs)$/.test(relative)) continue
    const file = path.join(app, relative)
    const source = await readFile(file, 'utf8')
    const result = await transform(source, { loader: 'js', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: true, keepNames: true, target: 'esnext', legalComments: 'inline' })
    await writeFile(file, result.code)
    changes.push({ file: relative, before: Buffer.byteLength(source), after: Buffer.byteLength(result.code), sha256: createHash('sha256').update(result.code).digest('hex') })
  }
}
if (mode === 'workers') {
  const file = path.join(apps, 'basic-electron/resources/app/renderer.js')
  await writeFile(file, (await readFile(file, 'utf8')) + '\nwindow.benchmarkWorkers = Array.from({length: 20}, () => new Worker(URL.createObjectURL(new Blob(["self.onmessage = () => {}"], {type: "text/javascript"}))));\n')
}
await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n')
await mkdir('results', {recursive: true})
await writeFile(`results/${mode}-preparation.json`, JSON.stringify({ mode, electronVersion: pkg.electronVersion, changes, timestamp: new Date().toISOString() }, null, 2))
console.log(mode, pkg.electronVersion, changes.length, 'transformed files')
