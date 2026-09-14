import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { analyze, median, role, assertGap } from '../scripts/analyze.js'
const data = JSON.parse(await readFile(new URL('../data/published-benchmark.json', import.meta.url)))
test('recomputed trial medians reproduce every published uncapped metric', () => {
  for (const e of analyze(data).editors) for (const [key, value] of Object.entries(e.metrics)) {
    assert.equal(value.median, data.summaries.find(s=>s.editor===e.id).groups.find(g=>g.budgetMiB===null).metrics[key].median)
  }
})
test('failed trials never contribute zero-memory measurements or qualify', () => {
  const copy = structuredClone(data)
  const t = copy.trials.find(t=>t.editor==='lvce'&&t.budgetMiB===null)
  t.status='failed';t.samples=[]
  assert.equal(analyze(copy).editors.find(e=>e.id==='lvce').qualified,false)
  assert.throws(()=>assertGap(copy),/Incomplete baseline/)
})
test('historical generic process labels are never guessed',()=>assert.equal(role({name:'lvce'}),'Unattributed (historical data)'))
test('Chromium process.title combined command line still classifies',()=>assert.equal(role({cmdline:['lvce --type=utility --utility-sub-type=node.mojom.NodeService']}),'Node utility services'))
test('gap assertion can fail and pass with the real measured symptom',()=>{
  assert.equal(assertGap(data).passed,false)
  assert.equal(assertGap(data,'lvce','basic-electron',300).passed,true)
})
test('median rejects missing data and does not mutate inputs',()=>{
  const a=[9,1,3,7];assert.equal(median(a),5);assert.deepEqual(a,[9,1,3,7]);assert.throws(()=>median([]))
})
test('every complete process snapshot conserves recorded whole-app PSS', async()=>{
 const {readdir}=await import('node:fs/promises')
 for(const name of await readdir(new URL('../data/',import.meta.url))){
  if(!name.endsWith('.json'))continue
  const raw=JSON.parse(await readFile(new URL('../data/'+name,import.meta.url)))
  for(const t of raw.trials||[])for(const s of t.samples)assert.equal(s.processes.reduce((sum,p)=>sum+p.pss,0),s.pss,`${name} PID total`)
 }
})
test('metric and table output escapes data-provided markup', async()=>{
 const {chart}=await import('../site/render.js')
 const result=analyze(data)
 result.editors[0].version='<img src=x onerror=alert(1)>'
 const html=chart(result)
 assert(!html.includes('<img'))
 assert(html.includes('&lt;img'))
})
