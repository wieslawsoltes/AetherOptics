/** Zero-dependency packer for this repository's acyclic, named-export ES modules.
 * This intentionally supports only the static syntax used here, not arbitrary npm packages.
 * Source remains ordinary ES modules; no transform is needed to serve the source tree.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
async function bundle(entry){
  const modules=[],done=new Set(),visiting=new Set();
  async function visit(name){
    if(done.has(name))return;
    if(visiting.has(name))throw new Error(`Cyclic module dependency: ${name}`);
    visiting.add(name);
    let source=await readFile(path.join(root,'src',name),'utf8');
    const imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"];?/gm)];
    for(const [,bindings,dependency]of imports){await visit(dependency);if(!/^[\w\s,]+$/.test(bindings))throw new Error('The local packer supports named imports without aliases only.');}
    source=source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"];?/gm,(_,bindings,dependency)=>`const {${bindings}}=__modules[${JSON.stringify(dependency)}];`);
    const exports=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(x=>x[1]);
    source=source.replace(/^export\s+/gm,'').replaceAll('import.meta.url','globalThis.__AETHER_MODULE_URL__');
    if(/^import\s/m.test(source)||/^export\s/m.test(source))throw new Error(`Unsupported module syntax in ${name}`);
    modules.push(`// ---- ${name} ----\n__modules[${JSON.stringify(name)}]=(()=>{\n${source}\nreturn {${exports.join(',')}};\n})();`);
    visiting.delete(name);done.add(name);
  }
  await visit(entry);
  return `(()=>{\n'use strict';\nconst __modules=Object.create(null);\n${modules.join('\n')}\n})();`;
}
const worker=await bundle('worker.js'),app=await bundle('app.js'),css=await readFile(path.join(root,'style.css'),'utf8');
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>\n${css}\n</style>`);
const javascript=`globalThis.__AETHER_WORKER__=${JSON.stringify(worker)};\n${app}`;
html=html.replace('<script type="module" src="src/app.js"></script>',()=>`<script>\n${javascript.replace(/<\/script/gi,'<\\/script')}\n</script>`);
await mkdir(path.join(root,'dist'),{recursive:true});await writeFile(path.join(root,'dist/index.html'),html);
await writeFile(path.join(root,'dist/worker.bundle.js'),worker);await writeFile(path.join(root,'dist/app.bundle.js'),app);
console.log(`Built self-contained dist/index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KiB). No runtime dependencies.`);
