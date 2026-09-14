import {execFileSync} from 'node:child_process'
import { readFile, writeFile, readdir, mkdir, cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { minify } from 'terser'
import { rollup } from 'rollup'
const mode = process.argv[2]
const receiptDirectory = process.env.MEMORY_PATCH_RECEIPTS || 'results'
const app = path.resolve('vendor/benchmark/.tmp/apps/lvce/usr/lib/lvce/resources/app')
const config = JSON.parse(await readFile(path.join(app, 'config.json')))
const lock = JSON.parse(await readFile('vendor/benchmark/editors.lock.json'))
const runtime = lock.find(e => e.id === 'lvce').runtime
const actual = execFileSync(path.resolve(app, '../../lvce'), ['-p', 'process.versions.electron'], {encoding:'utf8', env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}}).trim()
if (actual !== runtime.version.replace('Electron ', '') || config.commit !== '9637939') throw new Error('Unexpected application or runtime; reinstall pinned build')
const changes = []
const sha = text => createHash('sha256').update(text).digest('hex')
const edit = async (relative, transform) => {
  const file = path.join(app, relative), before = await readFile(file, 'utf8'), after = await transform(before)
  if (before === after) return
  await writeFile(file, after)
  changes.push({file: relative, before: Buffer.byteLength(before), after: Buffer.byteLength(after), beforeSha256: sha(before), sha256: sha(after)})
}
const replace = (text, from, to) => {
  if (text.split(from).length !== 2) throw new Error(`Expected exactly one patch anchor: ${from}`)
  return text.replace(from, to)
}
if (mode === 'combined') {
  // Git is patched before chunk generation so its changed activation code is included.
  for (const variant of ['services-in-main', 'lazy-git', 'renderer-chunks']) {
    execFileSync(process.execPath, ['scripts/patch-app.js', variant], {stdio:'inherit', env:{...process.env, MEMORY_PATCH_RECEIPTS:'.tmp/combined-preparation'}})
    const receipt = `.tmp/combined-preparation/${variant}-preparation.json`
    changes.push(...JSON.parse(await readFile(receipt)).changes.map(change => ({...change, variant})))
    await rm(receipt)
  }
} else if (['shared-in-main', 'services-in-main'].includes(mode)) {
  await cp('scripts/patches/process-host.cjs', path.join(app, 'memory-process-host.cjs'))
  const host = JSON.stringify(path.join(app, 'memory-process-host.cjs'))
  await edit('packages/main-process/dist/mainProcessMain.js', text => {
    text = `import __memoryHost from ${host};\n` + text
    return replace(text, 'const childProcess = utilityProcess.fork(path, actualArgv, {', `const childProcess = ((${mode === 'services-in-main' ? "name === 'File System Process' || " : ''}name === 'shared-process') ? __memoryHost.launch : utilityProcess.fork)(path, actualArgv, {`)

  })
  // The fork adapter receives Electron's options object, including serviceName.
  await edit('memory-process-host.cjs', text => replace(text, 'exports.launch = (file, argv, name) => {', 'exports.launch = (file, argv, { serviceName: name }) => {'))
  const shared = 'packages/shared-process'
  const files = (await readdir(path.join(app, shared, 'src'), {recursive: true})).filter(f => f.endsWith('.js')).map(f => `${shared}/src/${f}`)
  files.push(`${shared}/node_modules/@lvce-editor/ipc/dist/index.js`)
  for (const file of files) {
    const text = await readFile(path.join(app, file), 'utf8')
    if (/\bprocess\b/.test(text)) await edit(file, text => `import __memoryHost from ${host};\nconst process = __memoryHost.context('shared-process');\n` + text)
  }
  if (mode === 'services-in-main') await edit(`${shared}/node_modules/@lvce-editor/file-system-process/dist/index.js`, text => `import __memoryHost from ${host};\nconst process = __memoryHost.context('File System Process');\n` + text)
} else if (mode === 'renderer-chunks') {
  const base = `static/${config.commit}`
  await cp('scripts/patches/renderer-host.js', path.join(app, base, 'js/memory-renderer-host.js'))
  const entries = (await readdir(path.join(app, base), {recursive:true})).filter(f => /(?:WorkerMain|gitMain)\.js$/.test(f) && (f.startsWith('packages/') || f.startsWith('extensions/builtin.git/')))
  for (const entry of entries) {
    const file = `${base}/${entry}`
    const bundle = await rollup({input:path.join(app, file), external: () => true, treeshake:false, onwarn() {}})
    const {output} = await bundle.generate({format:'es', sourcemap:false})
    await bundle.close()
    if (output[0].imports.length) throw new Error(`Worker has external imports: ${entry}`)
    const source = output[0].code.replace(/^export \{[^}]*\};?$/gm, '')
    const chunk = `export default async function(__scope) {
      const globalThis = __scope, self = __scope, Worker = __scope.Worker, WorkerGlobalScope = __scope.WorkerGlobalScope;
      const window = undefined, document = undefined, location = __scope.location;
      const postMessage = __scope.postMessage, addEventListener = __scope.addEventListener, removeEventListener = __scope.removeEventListener, close = __scope.close, fetch = __scope.fetch;
      await (async () => { ${source} })();
    }\n`
    const relative = file.replace(/\.js$/, '.memory.js')
    await writeFile(path.join(app, relative), chunk)
    changes.push({file:relative, before:0, after:Buffer.byteLength(chunk), sha256:sha(chunk)})
  }
  await edit('config.json', text => {
    const updated = JSON.parse(text)
    const header = updated.files[`/${config.commit}/packages/renderer-process/dist/rendererProcessMain.js`]
    updated.files[`/${config.commit}/js/memory-renderer-host.js`] = header
    for (const headers of Object.values(updated.headers)) {
      if (headers['Content-Type'] === 'text/html' && headers['Content-Security-Policy'] && !headers['Content-Security-Policy'].includes('connect-src')) headers['Content-Security-Policy'] += " connect-src 'self';"
    }
    for (const entry of entries) updated.files[`/${config.commit}/${entry.replace(/\.js$/, '.memory.js')}`] = header
    return JSON.stringify(updated, null, 2) + '\n'
  })
  await edit(`${base}/packages/renderer-process/dist/rendererProcessMain.js`, text => `import {createWorkerClass} from '../../../js/memory-renderer-host.js';\nconst Worker = createWorkerClass(location.href, 'all');\n` + text)
} else if (mode === 'lazy-git') {
  const gitDetection = await readFile('scripts/patches/git-detection.js', 'utf8')
  await edit(`static/${config.commit}/packages/extension-management-worker/dist/extensionManagementWorkerMain.js`, text => {
    const helper = gitDetection.replace('export const ', 'const ') + '\n'
    text = replace(text, 'const activateByEvent = async (event, assetDir, platform, application) => {', helper + 'const activateByEvent = async (event, assetDir, platform, application) => {')
    return replace(text, 'const matchingExtensions = extensions.filter(extension => matchesEvent$1(extension, event));', `const candidates = extensions.filter(extension => matchesEvent$1(extension, event));
    const allowGit = event.startsWith('onCommand:') || !candidates.some(e => e.id === 'builtin.git') || await memoryHasGitRepository(getWorkspaceUri, exists);
    const matchingExtensions = candidates.filter(extension => extension.id !== 'builtin.git' || allowGit);`)
  })
} else if (mode === 'rollup-terser') {
  // Rollup processes the main bundle without relocating imports or dynamic chunks.
  const entry = 'packages/main-process/dist/mainProcessMain.js'
  const bundle = await rollup({input: path.join(app, entry), external: () => true, onwarn(warning) { if (warning.code !== 'EVAL') console.warn(warning.message) }})
  const {output} = await bundle.generate({format: 'es', sourcemap: false})
  await bundle.close()
  await edit(entry, () => output[0].code)
  for (const file of await readdir(app, {recursive:true})) {
    if (file.endsWith('.map')) { await rm(path.join(app, file)); changes.push({file, removed: true}); continue }
    if (!/\.(m?js|cjs)$/.test(file)) continue
    let directory = path.dirname(path.join(app, file)), module = file.endsWith('.mjs')
    if (!/\.(mjs|cjs)$/.test(file)) for (;;) {
      try { module = JSON.parse(await readFile(path.join(directory, 'package.json'))).type === 'module'; break }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (directory === app) break
      directory = path.dirname(directory)
    }
    await edit(file, async text => (await minify({[file]:text}, {module, keep_fnames: true, keep_classnames: true, compress: {passes: 2}, mangle: true, sourceMap: false, format: {comments: /^!/}})).code + '\n')
  }
} else { throw new Error(`Unknown patch experiment ${mode}`) }
await mkdir(receiptDirectory, {recursive:true})
await writeFile(`${receiptDirectory}/${mode}-preparation.json`, JSON.stringify({mode, applicationCommit: config.commit, electronVersion: actual, runtimeArchiveSha256: runtime.sha256, applicationArchiveSha256: lock.find(e => e.id === 'lvce').sha256, changes, timestamp: new Date().toISOString()}, null, 2) + '\n')
console.log(mode, changes.length, 'patched files')
