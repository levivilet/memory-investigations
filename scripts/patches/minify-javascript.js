import {minify} from 'terser'
export async function minifyJavaScript(text, file, module) {
  // Terser 5.51.2 rejects the valid namespace name `default` in yoctocolors.
  // Preserve its semantics with a namespace import followed by a named export.
  const compatible = text.replace(/^export \* as default from (['"][^'"]+['"]);$/gm,
    'import * as __memoryDefaultNamespace from $1; export {__memoryDefaultNamespace as default};')
  const result = await minify({[file]:compatible}, {
    module, keep_fnames:true, keep_classnames:true,
    compress:{passes:2}, mangle:true, sourceMap:false, format:{comments:/^!/},
  })
  return result.code + '\n'
}
