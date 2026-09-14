import {readFile, readdir, copyFile} from 'node:fs/promises'
import path from 'node:path'
import {analyze} from './analyze.js'
const root=path.resolve(process.argv[2] || '.tmp/new-run')
const files=await readdir(root,{recursive:true})
const required=['matched','minified','minified-control','workers','workers-control','no-git','no-git-control']
const pending=[]
for(const name of required){
 const matches=files.filter(f=>path.basename(f)===name+'.json')
 if(matches.length!==1)throw new Error(`Expected exactly one ${name}.json, got ${matches.length}`)
 const from=path.join(root,matches[0]),raw=JSON.parse(await readFile(from))
 const result=analyze(raw)
 if(result.editors.length!==2 || result.editors.some(e=>!e.qualified))throw new Error(`Incomplete baseline in ${name}`)
 pending.push({name,from,raw})
}
const first=pending[0].raw
for(const {name,raw} of pending){
 if(!raw.runUrl || raw.runUrl!==first.runUrl || raw.commit!==first.commit)throw new Error(`Mixed Actions runs: ${name}`)
 if(raw.fixtureSha256!==first.fixtureSha256)throw new Error(`Mixed fixtures: ${name}`)
 if(name.endsWith('-control'))continue
 const control=pending.find(p=>p.name===name+'-control')?.raw
 if(control)for(const key of ['cpu','kernel','arch','logicalCpus','display'])if(raw.host[key]!==control.host[key])throw new Error(`Host mismatch in ${name}: ${key}`)
}
for(const {name,from} of pending)await copyFile(from,`data/${name}.json`)
for(const name of ['minified-preparation.json','no-git-preparation.json','workers-preparation.json','diagnostic.json']){
 const matches=files.filter(f=>path.basename(f)===name)
 if(matches.length!==1)throw new Error(`Missing or ambiguous ${name}`)
 await copyFile(path.join(root,matches[0]),'data/'+(name==='diagnostic.json'?'diagnostic-ci.json':name))
}
console.log('Imported complete comparison sets from',first.runUrl)
