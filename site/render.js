export const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
export const mib = value => (value/1048576).toFixed(1)
export const names = {'lvce':'LVCE Editor','basic-electron':'Basic Electron','zed':'Zed','atom':'Atom (archived)'}
export function chart(dataset, metric='pss') {
  const editors=dataset.editors.filter(e=>e.metrics[metric] && (names[e.id] || dataset.editors.length<=2))
  const max=Math.max(...editors.map(e=>e.metrics[metric].max))*1.15
  return `<div class="bar-chart" role="img" aria-label="${escape(metric.toUpperCase())} memory comparison in MiB; full values follow in table">${editors.map(e=>`<div class="bar-row"><span>${escape(names[e.id]||e.id)}</span><div class="track"><div class="bar ${e.id==='lvce'?'lvce':''}" style="width:${e.metrics[metric].median/max*100}%"></div></div><b>${mib(e.metrics[metric].median)}</b></div>`).join('')}</div><div class="table-scroll"><table><caption>Median of three run medians; range of run medians. MiB.</caption><thead><tr><th>Application / runtime</th><th>Passed</th><th>${escape(metric.toUpperCase())}</th><th>Range</th><th>Processes</th></tr></thead><tbody>${editors.map(e=>`<tr><th>${escape(names[e.id]||e.id)}<small>${escape(e.version)}</small></th><td>${e.passed}/${e.attempted}${e.qualified?'':' · incomplete'}</td><td>${mib(e.metrics[metric].median)}</td><td>${mib(e.metrics[metric].min)}–${mib(e.metrics[metric].max)}</td><td>${e.metrics.processCount.median}</td></tr>`).join('')}</tbody></table></div>`
}
export function roleTable(dataset, metric='pss') {
  const lvce=dataset.editors.find(e=>e.id==='lvce'), basic=dataset.editors.find(e=>e.id==='basic-electron')
  if (!lvce || !basic) return ''
  const roles=[...new Set([...Object.keys(lvce.roles),...Object.keys(basic.roles)])]
  return `<div class="table-scroll"><table><caption>Process-role attribution · ${escape(metric.toUpperCase())} MiB</caption><thead><tr><th>Role</th><th>LVCE</th><th>Basic</th><th>Difference</th></tr></thead><tbody>${roles.map(role=>{
    const a=lvce.roles[role]?.[metric]?.median||0,b=basic.roles[role]?.[metric]?.median||0
    return `<tr><th>${escape(role)}</th><td>${mib(a)}</td><td>${mib(b)}</td><td class="${a>b?'positive':''}">${a>b?'+':''}${mib(a-b)}</td></tr>`
  }).join('')}</tbody></table></div><p class="note">Role medians are calculated independently and may not sum to the whole-application median. Missing command lines remain unattributed. Zygote-labelled children are not guessed from PID order.</p>`
}
export function experiments(data) {
  return `<div class="table-scroll"><table><caption>Controlled interventions · PSS MiB · negative change means less memory</caption><thead><tr><th>Experiment</th><th>Control</th><th>Changed</th><th>Change</th><th>Range of run medians</th></tr></thead><tbody>${['minified','workers','no-git'].map(id=>{
    const before=data.datasets[id+'-control'],after=data.datasets[id],editor=id==='workers'?'basic-electron':'lvce'
    if(!before||!after)return `<tr><th>${escape(id)}</th><td colspan="4">Awaiting same-host evidence</td></tr>`
    const a=before.editors.find(e=>e.id===editor),b=after.editors.find(e=>e.id===editor)
    if(!a?.qualified||!b?.qualified)return `<tr><th>${escape(id)}</th><td colspan="4">Incomplete trials; no savings claim</td></tr>`
    const x=a.metrics.pss,y=b.metrics.pss
    return `<tr><th>${escape({'minified':'Minify LVCE JavaScript','workers':'Add 20 empty web workers','no-git':'Disable built-in Git'}[id])}</th><td>${mib(x.median)}</td><td>${mib(y.median)}</td><td>${y.median>x.median?'+':''}${mib(y.median-x.median)}</td><td>${mib(x.min)}–${mib(x.max)} → ${mib(y.min)}–${mib(y.max)}</td></tr>`
  }).join('')}</tbody></table></div>`
}
export function workers(diagnostic) {
  if(!diagnostic)return '<p>Diagnostic evidence unavailable.</p>'
  return `<div class="table-scroll"><table><caption>Separate instrumented run · JavaScript heap MiB, not PSS</caption><thead><tr><th>Worker</th><th>Used heap</th><th>Heap capacity</th><th>Used after GC</th></tr></thead><tbody>${[...diagnostic.targets].sort((a,b)=>(b.heap?.usedSize||0)-(a.heap?.usedSize||0)).map(t=>`<tr><th>${escape(t.url.split('/').at(-1))}</th><td>${t.heap?mib(t.heap.usedSize):'unavailable'}</td><td>${t.heap?mib(t.heap.totalSize):'unavailable'}</td><td>${t.heapAfterGc?mib(t.heapAfterGc.usedSize):'not collected'}</td></tr>`).join('')}</tbody></table></div>`
}
