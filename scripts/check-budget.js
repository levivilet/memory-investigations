import {readFile} from 'node:fs/promises'
import {assertGap} from './analyze.js'
const result=assertGap(JSON.parse(await readFile(process.argv[2])), 'lvce', 'basic-electron', Number(process.argv[3] || 0))
console.log(JSON.stringify(result,null,2))
process.exitCode=result.passed?0:1
