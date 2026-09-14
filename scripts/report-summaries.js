import { median } from './analyze.js'
import { mib, escape } from '../site/render.js'

export function reportSummaries(datasets, diagnosticRaw, preparation) {
  const matched = datasets.matched
  const get = (name, editor = 'lvce') => datasets[name].editors.find(e => e.id === editor)
  const lvce = get('matched'), basic = get('matched', 'basic-electron')
  const pss = e => e.metrics.pss.median
  const role = (e, name) => e.roles[name].pss.median
  const change = (name, editor = 'lvce') => pss(get(name, editor)) - pss(get(name + '-control', editor))
  const signed = value => `${value >= 0 ? '+' : '−'}${mib(Math.abs(value))}`
  const trial = diagnosticRaw.trials[0], diagnostic = trial.diagnostics
  const extension = diagnostic.targets.find(t => t.url.includes('extensionManagementWorkerMain.js'))
  const afterGc = diagnostic.targets.map(t => t.heapAfterGc?.usedSize)
  if (afterGc.some(value => !Number.isFinite(value))) throw new Error('Incomplete GC diagnostic')
  const beforeBytes = preparation.changes.reduce((n, f) => n + f.before, 0)
  const afterBytes = preparation.changes.reduce((n, f) => n + f.after, 0)
  const serviceCosts = diagnostic.processes.filter(p => p.serviceName === 'node.mojom.NodeService').map(p => {
    const values = trial.samples.filter(s => s.phase === 'idle').map(s => s.processes.find(process => process.pid === p.pid)?.pss)
    if (values.some(v => !Number.isFinite(v))) throw new Error(`Incomplete diagnostic PID ${p.pid}`)
    return `${escape(p.name)}: ${mib(median(values))} MiB`
  })
  return {
    RUNTIME: escape(basic.version),
    CAPTURE: escape(matched.capturedAt),
    ROLE_SUMMARY: `In the matched CI run, Node utility services account for <strong>${mib(role(lvce, 'Node utility services'))} MiB PSS</strong>. The renderer and workers account for <strong>${mib(role(lvce, 'Renderer + web workers'))} MiB</strong>, versus <strong>${mib(role(basic, 'Renderer + web workers'))} MiB</strong> in basic Electron: <strong>${mib(role(lvce, 'Renderer + web workers') - role(basic, 'Renderer + web workers'))} MiB extra</strong>. Main-process PSS is ${mib(role(lvce, 'Main process'))} versus ${mib(role(basic, 'Main process'))} MiB. Shared-page redistribution offsets some additions; the whole-app gap is ${mib(pss(lvce) - pss(basic))} MiB.`,
    EXPERIMENT_SUMMARY: `<p><strong>Git disabled: ${signed(change('no-git'))} MiB PSS.</strong> LVCE changes from ${mib(pss(get('no-git-control')))} to ${mib(pss(get('no-git')))} MiB. Its process count changes from ${get('no-git-control').metrics.processCount.median} to ${get('no-git').metrics.processCount.median}. The unchanged basic app also changes by ${signed(change('no-git', 'basic-electron'))} MiB in this job; the raw reduction is an opportunity estimate, not a guaranteed product saving.</p><p><strong>20 empty workers: ${signed(change('workers', 'basic-electron'))} MiB PSS.</strong> This measures worker runtime cost even when the workers do no useful work.</p><p><strong>Minification:</strong> JavaScript changes from ${mib(beforeBytes)} to ${mib(afterBytes)} MiB on disk (${(100 * (1 - afterBytes / beforeBytes)).toFixed(1)}% smaller). LVCE PSS changes by ${signed(change('minified'))} MiB, while the unchanged basic app changes by ${signed(change('minified', 'basic-electron'))} MiB. Compare the run ranges above and account for drift before inferring an improvement.</p>`,
    HEAP_SUMMARY: `In this ${escape(diagnostic.versions.electron)} diagnostic, extension management reports ${mib(extension.heap.usedSize)} MiB used before collection and ${mib(extension.heapAfterGc.usedSize)} MiB after collection. All ${diagnostic.targets.length} workers together report ${mib(afterGc.reduce((a, b) => a + b, 0))} MiB of JS heap after GC. Allocated heap is not proof of retained objects, and heap timing varies substantially. Live JavaScript objects alone do not explain the renderer's entire resident footprint.`,
    DOM_SUMMARY: `The page itself reports ${mib(diagnostic.renderer.heap.usedSize)} MiB of JS heap before collection; the diagnostic counts ${diagnostic.dom.nodes.toLocaleString('en-US')} DOM nodes and ${diagnostic.dom.jsEventListeners} event listeners.`,
    SERVICE_SUMMARY: `The separate diagnostic measures median PSS of ${serviceCosts.join('; ')}. These instrumented observations must not be added to the comparison totals. Full PID mappings are in the diagnostic JSON.`,
  }
}
