// Experimental service contexts share the main event loop, but keep distinct IPC endpoints.
const { MessageChannelMain } = require('electron')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { pathToFileURL } = require('node:url')
const contexts = new Map()
exports.context = name => contexts.get(name) || process
exports.launch = (file, argv, name) => {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const { port1, port2 } = new MessageChannelMain()
  const listeners = new EventEmitter()
  const local = new Proxy(process, {
    get(target, key) {
      if (key === 'parentPort') return port2
      if (key === 'argv') return [target.execPath, file, ...argv]
      if (key === 'type') return 'utility'
      if (key === 'on' || key === 'once' || key === 'off') return listeners[key].bind(listeners)
      if (key === 'exit') return code => { child.kill(); if (code) console.error('Experimental service exited:', name, code) }
      return Reflect.get(target, key)
    },
    set(target, key, value) {
      if (key === 'exitCode' || key === 'title') return true
      return Reflect.set(target, key, value)
    },
  })
  contexts.set(name, local)
  child.postMessage = (data, transfer) => port1.postMessage(data, transfer || [])
  child.kill = () => { port1.close(); port2.close(); child.emit('exit', 0); return true }
  port1.on('message', ({data, ports}) => child.emit('message', ports.length ? {...data, params: [...ports, ...data.params]} : data))
  port1.start()
  port2.start()
  // Defer until the caller has installed its ready/error listeners.
  setImmediate(() => import(pathToFileURL(file).href).catch(error => {
    child.stderr.write(String(error.stack))
    child.emit('exit', 1)
  }))
  return child
}
