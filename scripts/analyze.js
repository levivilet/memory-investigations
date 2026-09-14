export const MiB = 1024 * 1024
export const median = values => {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error('Expected finite, nonempty measurements')
  const sorted = [...values].sort((a,b) => a-b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2
}
export const distribution = values => ({ median: median(values), min: Math.min(...values), max: Math.max(...values) })
export function role(process) {
  const cmd = (process.cmdline || []).join(' ')
  if (!cmd) return 'Unattributed (historical data)'
  if (cmd.includes('--type=renderer')) return 'Renderer + web workers'
  if (cmd.includes('--type=gpu-process')) return 'GPU process'
  if (cmd.includes('node.mojom.NodeService')) return 'Node utility services'
  if (cmd.includes('network.mojom.NetworkService')) return 'Network service'
  if (cmd.includes('--type=zygote')) return 'Zygote / unlabelled child'
  if (cmd.includes('--type=')) return 'Other Chromium helper'
  return 'Main process'
}
export function analyze(data) {
  const editors = []
  for (const editor of data.editors) {
    const attempts = data.trials.filter(t => t.editor === editor.id && t.budgetMiB === null)
    const trials = attempts.filter(t => t.status === 'passed')
    if (!attempts.length) continue
    const metrics = {}, roles = {}
    const idle = trials.map(t => t.samples.filter(s => s.phase === 'idle'))
    if (idle.some(s => !s.length)) throw new Error('Successful trial missing idle samples')
    for (const key of ['pss','uss','rss','current','anon','file','kernel','processCount']) {
      if (trials.length) metrics[key] = distribution(idle.map(samples => median(samples.map(s => s[key]))))
    }
    const keys = new Set(idle.flatMap(samples => samples.flatMap(s => s.processes.map(role))))
    for (const name of keys) {
      roles[name] = {}
      for (const metric of ['pss','uss','rss']) {
        roles[name][metric] = distribution(idle.map(samples => median(samples.map(s => s.processes.filter(p => role(p) === name).reduce((sum,p) => sum+p[metric], 0)))))
      }
    }
    const representative = trials.length ? [...trials].sort((a,b) => median(a.samples.filter(s=>s.phase==='idle').map(s=>s.pss))-median(b.samples.filter(s=>s.phase==='idle').map(s=>s.pss)))[Math.floor(trials.length/2)] : null
    editors.push({id:editor.id, version:editor.version, attempted:attempts.length, passed:trials.length, qualified:trials.length === data.protocol.repeats && trials.length === attempts.length && new Set(trials.map(t=>t.repeat)).size === trials.length && trials.length >= 3, metrics, roles, representative:representative?.samples.find(s=>s.phase==='idle'), lowestTestedBudgetMiB:data.summaries?.find(s=>s.editor===editor.id)?.lowestTestedBudgetMiB ?? null})
  }
  return {capturedAt:data.capturedAt, commit:data.commit, runUrl:data.runUrl, protocol:data.protocol, editors}
}
export function assertGap(data, target='lvce', baseline='basic-electron', maximumMiB=0) {
  const analysis=analyze(data)
  const get = id => {
    const editor=analysis.editors.find(e=>e.id===id)
    if (!editor?.qualified) throw new Error(`Incomplete baseline: ${id}`)
    return editor.metrics.pss.median/MiB
  }
  const gap=get(target)-get(baseline)
  return {gapMiB:gap, maximumMiB, passed:gap<=maximumMiB}
}
