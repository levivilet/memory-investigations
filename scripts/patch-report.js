import {median} from './analyze.js'
import {escape, mib} from '../site/render.js'
export const patchModes = ['shared-in-main','services-in-main','renderer-chunks','lazy-git','rollup-terser','combined']
const labels = {combined:'Processes + chunks + lazy Git','shared-in-main':'Shared service in main','services-in-main':'Shared + filesystem in main','renderer-chunks':'Workers → renderer chunks','lazy-git':'Git only after repository detection','rollup-terser':'Rollup + Terser, no source maps'}
export function patchReport(datasets, raw) {
  if (!patchModes.every(mode => datasets[mode] && datasets[mode+'-control'])) return '<p>Production patch experiments are being measured. No savings are claimed until the complete paired trials and architecture checks pass.</p>'
  const rows = patchModes.map(mode => {
    const before = datasets[mode+'-control'], after = datasets[mode]
    const a = before.editors.find(e=>e.id==='lvce'), b = after.editors.find(e=>e.id==='lvce')
    if (![...before.editors,...after.editors].every(e=>e.qualified)) throw new Error(`Incomplete published patch: ${mode}`)
    const basicA = before.editors.find(e=>e.id==='basic-electron'), basicB = after.editors.find(e=>e.id==='basic-electron')
    const diag = raw[mode+'-diagnostic'].trials[0].diagnostics
    const trials = raw[mode].trials.filter(t=>t.editor==='lvce' && t.status==='passed')
    return {mode, a, b, delta:b.metrics.pss.median-a.metrics.pss.median, drift:basicB.metrics.pss.median-basicA.metrics.pss.median, workers:diag.targets.length, chunks:diag.renderer.chunks?.length || 0, peak:median(trials.map(t=>t.final.peak)), probe:median(trials.map(t=>median(t.probeMs))), ready:median(trials.map(t=>t.readyMs))}
  })
  const table = `<div class="table-scroll"><table><caption>Production patches · three runs per application per block · PSS MiB</caption><thead><tr><th>Patch</th><th>Control</th><th>Patched</th><th>Change</th><th>Basic app drift</th><th>Patched USS</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${labels[r.mode]}</th><td>${mib(r.a.metrics.pss.median)}</td><td>${mib(r.b.metrics.pss.median)}</td><td>${mib(r.delta)}</td><td>${mib(r.drift)}</td><td>${mib(r.b.metrics.uss.median)}</td></tr>`).join('')}</tbody></table></div>`
  const architecture = `<div class="table-scroll"><table><caption>Architecture and functional probes · diagnostics are separate from memory trials</caption><thead><tr><th>Patch</th><th>Processes</th><th>Workers / chunks</th><th>Peak cgroup MiB</th><th>Ready ms</th><th>Edit/save ms</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${labels[r.mode]}</th><td>${r.a.metrics.processCount.median} → ${r.b.metrics.processCount.median}</td><td>${r.workers} / ${r.chunks}</td><td>${mib(r.peak)}</td><td>${r.ready.toFixed(0)}</td><td>${r.probe.toFixed(0)}</td></tr>`).join('')}</tbody></table></div>`
  const source = datasets[patchModes[0]]
  return `<p>Measured ${escape(source.capturedAt)} in <a href="${escape(source.runUrl)}">this Actions run</a>, benchmark commit <code>${escape(source.commit)}</code>. Every patch starts from the checksum-pinned v0.114.2 Debian application; both applications use Electron 44.3.0.</p>${table}${architecture}<p class="note">Negative change means less memory. Basic-app drift is a separate unmodified control, not an automatic correction. Ready time includes the fixed ten-second settling period. Edit/save probes measure the complete automated operation, not per-keystroke latency. Peak is cgroup charged memory and cannot be subtracted from PSS. Full run-median ranges and process-role attribution are available in the evidence selector above.</p>`
}
