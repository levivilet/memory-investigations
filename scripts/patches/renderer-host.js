// Experimental Worker-compatible endpoints on one event loop. No eval or extra realms.
export const createWorkerClass = (baseUrl, mode) => class LocalWorker extends EventTarget {
  constructor(input, options = {}) {
    super()
    const url = new URL(input, baseUrl)
    const {port1, port2} = new MessageChannel()
    this.port = port1
    this.closed = false
    this.onmessage = null
    port1.onmessage = event => {
      const forwarded = new MessageEvent('message', {data: event.data, ports: event.ports})
      this.dispatchEvent(forwarded)
      this.onmessage?.(forwarded)
    }
    const own = Object.create(null)
    Object.assign(own, {
      location: url,
      name: options.name || '',
      WorkerGlobalScope: function WorkerGlobalScope() {},
      Worker: createWorkerClass(url, mode),
      postMessage: port2.postMessage.bind(port2),
      addEventListener: port2.addEventListener.bind(port2),
      removeEventListener: port2.removeEventListener.bind(port2),
      dispatchEvent: port2.dispatchEvent.bind(port2),
      close: () => this.terminate(),
      fetch: (resource, options) => fetch(typeof resource === 'string' ? new URL(resource, url) : resource, options),
    })
    const scope = new Proxy(own, {
      get(target, key) { if (key === 'self' || key === 'globalThis') return scope; return key in target ? target[key] : globalThis[key] },
      set(target, key, value) { target[key] = value; if (key === 'onmessage') port2.onmessage = value; return true },
    })
    port2.start()
    const chunk = new URL(url)
    chunk.pathname = chunk.pathname.replace(/\.js$/, '.memory.js')
    import(chunk.href).then(module => { if (!this.closed) return module.default(scope) }).catch(error => {
      console.error('Memory worker chunk failed', url.href, error)
      this.dispatchEvent(new ErrorEvent('error', {message: error.message, error}))
    })
  }
  postMessage(data, transfer) { this.port.postMessage(data, transfer) }
  terminate() { this.closed = true; this.port.close() }
}
