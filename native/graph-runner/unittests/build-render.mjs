import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { parityPlugins } from '../guest/parity/profile.mjs';
import { capabilityPlugins } from '../guest/host/plugins.mjs';
import { textEncodingBanner } from '../guest/text-encoding-banner.mjs';
const banner = textEncodingBanner;
await build({
  banner:{js:banner},
  entryPoints:[fileURLToPath(new URL('./render.test.mjs',import.meta.url))],
  outfile:process.argv[2],bundle:true,format:'iife',platform:'browser',target:'es2022',
  plugins:await parityPlugins({modules:[],builtinShims:{}})
});
await build({
  entryPoints:[fileURLToPath(new URL('../guest/entry.mjs',import.meta.url))],
  outfile:process.argv[2]+'.runner.js',bundle:true,format:'esm',platform:'browser',target:'es2022',banner:{js:banner},
  plugins:[{name:'compute-probe',setup(b) {
    b.onResolve({filter:/^@nodetool-ai\/core-nodes\/nodes\/(constant|control|input)$/},args=> {
      if(!args.importer.endsWith('/guest/entry.mjs')) return;
      if(args.path.endsWith('/constant')) return {path:fileURLToPath(new URL('./compute-run-node.mjs',import.meta.url))};
      return {path:args.path,namespace:'empty-probe'};
    });
    b.onLoad({filter:/.*/,namespace:'empty-probe'},()=>({contents:'export {}'}));
  }},...capabilityPlugins(),...await parityPlugins({modules:[],builtinShims:{}})]
});
