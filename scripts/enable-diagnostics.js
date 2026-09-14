import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const file = 'vendor/benchmark/.tmp/apps/lvce/usr/lib/lvce/resources/app/packages/main-process/dist/mainProcessMain.js'
await appendFile(file, `\nimport(${JSON.stringify(pathToFileURL(path.resolve('scripts/electron-diagnostics.cjs')).href)});\n`)
