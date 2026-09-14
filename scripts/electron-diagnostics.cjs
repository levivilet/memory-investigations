// Diagnostic-only instrumentation. Never import during comparison trials.
const { app, webContents } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const output = process.env.XDG_STATE_HOME
const evidence = { kind: 'instrumented-diagnostic-not-baseline', targets: [], errors: [] }
const sessions = new Set()
setTimeout(async () => {
  try {
    evidence.versions = process.versions
    evidence.processes = app.getAppMetrics()
    evidence.mainHeap = process.getHeapStatistics()
    evidence.mainMemory = process.memoryUsage()
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() !== 'window') continue
      const debug = wc.debugger
      debug.attach('1.3')
      debug.on('message', async (_event, method, params) => {
        if (method !== 'Target.attachedToTarget') return
        const { sessionId, targetInfo } = params
        if (sessions.has(sessionId)) return
        sessions.add(sessionId)
        const row = { ...targetInfo, sessionId }
        evidence.targets.push(row)
        try {
          await debug.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId)
        } catch (e) { row.attachError = e.message }
        try {
          row.heap = await debug.sendCommand('Runtime.getHeapUsage', {}, sessionId)
          row.resources = await debug.sendCommand('Runtime.evaluate', { expression: '({url: self.location.href, resources: performance.getEntriesByType("resource").map(r => ({name:r.name,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize}))})', returnByValue: true }, sessionId)
        } catch (e) { row.error = e.message }
      })
      evidence.renderer = { pid: wc.getOSProcessId(), url: wc.getURL(), heap: await debug.sendCommand('Runtime.getHeapUsage') }
      await debug.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
      evidence.dom = await debug.sendCommand('Memory.getDOMCounters')
    }
  } catch (e) { evidence.errors.push(e.stack) }
  setTimeout(() => {
    fs.mkdirSync(output, {recursive:true})
    fs.writeFileSync(path.join(output, 'diagnostics.json'), JSON.stringify(evidence, null, 2))
  }, 5000)
}, 12000)
