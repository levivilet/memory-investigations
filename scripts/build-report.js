import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {analyze} from './analyze.js'
import {reportSummaries} from './report-summaries.js'
import {chart,roleTable,experiments,workers,escape,mib} from '../site/render.js'
const datasets={},manifest=[]
for(const file of await readdir('data')) {
  if(!file.endsWith('.json'))continue
  const bytes=await readFile('data/'+file), raw=JSON.parse(bytes)
  manifest.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length})
  if(raw.trials && raw.protocol?.repeats>=3)datasets[file.replace('.json','')]=analyze(raw)
}
const diagnosticCandidates = await Promise.all(['diagnostic-ci.json', 'diagnostic-gc.json'].map(async file => ({file, raw: JSON.parse(await readFile('data/' + file))})))
const currentRuntime = datasets.matched.editors.find(e => e.id === 'basic-electron').version.match(/Electron ([0-9.]+)/)[1]
const diagnosticFile = diagnosticCandidates.filter(({raw}) => raw.trials[0].diagnostics.versions.electron === currentRuntime && raw.trials[0].diagnostics.targets.every(t => t.heapAfterGc)).sort((a,b) => b.raw.capturedAt.localeCompare(a.raw.capturedAt))[0]?.file
if (!diagnosticFile) throw new Error('No complete GC diagnostic for the measured runtime')
const diagRaw=JSON.parse(await readFile('data/'+diagnosticFile))
const diagnostic=diagRaw.trials[0].diagnostics
const data={datasets,diagnostic,diagnosticSource:diagnosticFile,manifest}
const selected=datasets.matched?'matched':'published-benchmark'
let html=await readFile('site/index.html','utf8')
const chosen=datasets[selected]
const a=chosen.editors.find(e=>e.id==='lvce'),b=chosen.editors.find(e=>e.id==='basic-electron')
const preparation = JSON.parse(await readFile('data/minified-preparation.json'))
const replace={...reportSummaries(datasets, diagRaw, preparation),CHART:chart(chosen),ROLES:roleTable(chosen),EXPERIMENTS:experiments(data),WORKERS:workers(diagnostic),LVCE:mib(a.metrics.pss.median),BASIC:mib(b.metrics.pss.median),GAP:mib(a.metrics.pss.median-b.metrics.pss.median),OPTIONS:Object.keys(datasets).map(id=>`<option value="${escape(id)}" ${id===selected?'selected':''}>${escape(id)}</option>`).join(''),EVIDENCE:manifest.map(f=>`<li><a href="data/${escape(f.file)}">${escape(f.file)}</a> <small>${Math.round(f.bytes/1024)} KiB · SHA-256 <code>${f.sha256}</code></small></li>`).join('')}
for(const [key,value] of Object.entries(replace))html=html.replaceAll('{{'+key+'}}',value)
if(/\{\{[A-Z_]+\}\}/.test(html))throw new Error('Unresolved report placeholder')
await mkdir('.tmp/pages',{recursive:true})
for(const file of ['style.css','app.js','render.js'])await cp('site/'+file,'.tmp/pages/'+file)
await cp('data','.tmp/pages/data',{recursive:true})
await writeFile('.tmp/pages/index.html',html)
await writeFile('.tmp/pages/report-data.json',JSON.stringify(data))
await writeFile('.tmp/pages/evidence-manifest.json',JSON.stringify(manifest,null,2)+'\n')
console.log('Built report with',Object.keys(datasets).length,'datasets and',diagnostic.targets.length,'worker targets')
