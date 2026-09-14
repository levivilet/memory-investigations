import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
const root = path.resolve('vendor/benchmark/.tmp/apps/lvce/usr/lib/lvce/resources/app')
const files = []
for (const name of await readdir(root, {recursive:true})) {
  if (!/\.(m?js|cjs)$/.test(name)) continue
  const bytes = await readFile(path.join(root,name))
  files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
}
files.sort((a,b)=>b.bytes-a.bytes)
await writeFile('data/source-inventory.json',JSON.stringify({config:JSON.parse(await readFile(path.join(root,'config.json'))), totalBytes:files.reduce((n,f)=>n+f.bytes,0),fileCount:files.length,files},null,2)+'\n')
console.log(files.length, files.reduce((n,f)=>n+f.bytes,0), files.slice(0,12))
