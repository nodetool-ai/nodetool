export { isolatedBrowserService, localTransformersService } from './scoped-services.js';
export type { LocalTransformersRuntime } from './scoped-services.js';
import { SCOPED_NODE_TYPES, executeScopedNode, requireScopedService, type ScopedPackServices } from './scoped-services.js';
export type { ScopedPackServices, ScopedBrowserSession, ScopedLocalGeneration } from './scoped-services.js';
import { z } from 'zod';
import { importPack, readCatalogIndex } from '@nodetool-ai/pack-core';
import { NodeRegistry, createGraphNodeTypeResolver } from '@nodetool-ai/node-sdk';
import type { NodeExecutor } from '@nodetool-ai/execution-core';
import { ProcessingContext, type BaseProvider, type AssetInfoEntry } from '@nodetool-ai/runtime';
import { safeFetch } from '@nodetool-ai/runtime-core';
import type { StorageAdapter } from '@nodetool-ai/storage';
import type { CoreRunRequest, createCoreExecutionHost } from '@nodetool-ai/nodes-core';
import type { ServerFeature } from '@nodetool-ai/server-features';

export interface InstalledPackHost {
  readonly execution: ReturnType<typeof createCoreExecutionHost>;
  readonly readSecret: (userId:string,key:string)=>Promise<string|undefined>;
  readonly readAsset: (userId:string,reference:unknown)=>Promise<Uint8Array>;
  readonly getAssetInfo: (userId:string,reference:unknown)=>Promise<AssetInfoEntry>;
  readonly writeAsset: (userId:string,asset:{name:string;contentType:string;content:Uint8Array;metadata?:Record<string,unknown>|null})=>Promise<AssetInfoEntry & {uri:string}>;
}
export interface InstalledPackOptions extends ScopedPackServices {
  readonly packId:string;
  /** Only these existing node types become executable, even if a registrar exports more. */
  readonly nodeTypes:readonly string[];
  readonly requires?:readonly string[];
  readonly resolveProvider?: (userId:string,providerId:string)=>Promise<BaseProvider>;
}
const ISOLATED_NODE_TYPES = new Set(['nodetool.text.FilterString','nodetool.text.FilterRegexString','nodetool.image.SaveImage','lib.image.draw.Checkerboard']);

function unsupported(operation:string):never { throw new Error(`Feature server-feature-packs does not provide ${operation}. Configure a feature implementing that persistence operation.`); }

function scopedContext(host:InstalledPackHost,request:CoreRunRequest,options:InstalledPackOptions):ProcessingContext {
  if(!request.workspace){throw new Error('Feature server-feature-packs requires a run workspace');}
  const storage:StorageAdapter={
    store:async (key,content,contentType)=> (await host.writeAsset(request.userId,{name:key.split('/').at(-1) ?? 'asset',contentType:contentType ?? 'application/octet-stream',content})).uri,
    retrieve:uri=>host.readAsset(request.userId,uri),
    exists:async uri=>{await host.getAssetInfo(request.userId,uri);return true;},
    uriForKey:key=>`asset://${key}`,
    list:async()=>unsupported('asset listing'),
    delete:async()=>unsupported('asset deletion'),
    stat:async uri=>{const bytes=await host.readAsset(request.userId,uri);const info=await host.getAssetInfo(request.userId,uri);return {key:info.id,size:bytes.byteLength,modifiedAt:0,contentType:info.content_type};},
    localPath:async()=>null
  };
  const context=new ProcessingContext({
    inheritHostDefaults:false,
    jobId:request.jobId,userId:request.userId,workspace:request.workspace,
    storage,assetStorage:storage,assetOutputMode:'storage_url',
    retainMessageQueue:false,sandboxModuleCatalog:null,
    onMessage:request.emit,
    assetBytesResolver:reference=>host.readAsset(request.userId,reference),
    secretResolver:(key,userId)=>{
      if(userId!==request.userId){throw new Error('Run owner mismatch');}
      return host.readSecret(userId,key);
    },
    fetchFn:(url,init)=>safeFetch(url,{...init,signal:request.signal}),
    modelInterfaces:{
      createAsset:args=>{
        if(args.userId!==request.userId){throw new Error('Run owner mismatch');}
        return host.writeAsset(request.userId,args);
      },
      getAssetInfo:args=>{
        if(args.userId!==request.userId){throw new Error('Run owner mismatch');}
        return host.getAssetInfo(request.userId,args.assetId);
      }
    }
  });
  context.signal=request.signal;
  context.setProviderResolver(providerId=>{
    if(!options.resolveProvider){throw new Error(`Feature ${options.packId} requires an explicitly configured provider resolver for ${providerId}`);}
    return options.resolveProvider(request.userId,providerId);
  });
  return context;
}

async function canonicalOutputs(outputs:Record<string,unknown>,context:ProcessingContext):Promise<Record<string,unknown>> {
  return Object.fromEntries(await Promise.all(Object.entries(outputs).map(async ([key,value])=>{
    if(typeof value==='object' && value!==null && 'type' in value && 'uri' in value && typeof value.uri==='string'){
      const match=/^asset:\/\/([a-f0-9]{32})(?:\.[A-Za-z0-9]{1,8})?$/.exec(value.uri);
      const id=match?.[1];
      if(id){
        const asset=await context.getAssetInfo(id);
        if(!asset){throw new Error('Node returned an asset outside the run owner scope');}
        return [key,{...value,asset_id:asset.id,uri:`asset://${asset.id}`}];
      }
    }
    return [key,value];
  })));
}

function bindExecutor(executor:NodeExecutor,context:ProcessingContext):NodeExecutor {
  const bound:NodeExecutor={...executor,process:async(inputs)=>canonicalOutputs(await executor.process(inputs,context),context)};
  if(executor.genProcess){const generate=executor.genProcess;bound.genProcess=(inputs)=>generate(inputs,context);}
  if(executor.run){const run=executor.run;bound.run=(inputs,outputs)=>run(inputs,outputs,context);}
  return bound;
}

/** Admits only administrator-selected nodes from one explicitly installed catalog pack. */
export function createInstalledPackFeature(options:InstalledPackOptions):ServerFeature<InstalledPackHost> {
  const pack=readCatalogIndex().packs.find(entry=>entry.id===options.packId);
  if(!pack){throw new Error(`Unknown installed node pack: ${options.packId}`);}
  if(!options.nodeTypes.length || new Set(options.nodeTypes).size!==options.nodeTypes.length){throw new Error('Select a nonempty unique nodeTypes list');}
  for(const nodeType of options.nodeTypes){
    if(!ISOLATED_NODE_TYPES.has(nodeType) && !SCOPED_NODE_TYPES.has(nodeType)){throw new Error(`Node ${nodeType} is not audited for the isolated pack host. Extract its filesystem/provider access through the scoped context before enabling it.`);}
    if(readCatalogIndex().owners[nodeType]!==pack.id){throw new Error(`Node ${nodeType} does not belong to pack ${pack.id}`);}}
  return {
    descriptor:{id:pack.id,apiVersion:1,packageName:pack.npm.name,packId:pack.id,nodeTypes:options.nodeTypes,requires:options.requires,capabilities:[`nodes:${pack.id}`, ...options.nodeTypes.flatMap(type => type === "lib.browser.Screenshot" ? ["browser:screenshot"] : type === "transformers.TextGeneration" ? ["local-inference:text-generation"] : [])]},
    activate:async host=>{
      for (const nodeType of options.nodeTypes) { requireScopedService(nodeType, options); }
      const registry=new NodeRegistry();
      const module=await importPack(pack.id);
      const registrar=z.object({[pack.registrar]:z.custom<(registry:NodeRegistry)=>void>(value=>typeof value==='function')}).parse(module)[pack.registrar];
      registry.registerPackage(pack.id,registrar);
      const resolver=createGraphNodeTypeResolver(registry);
      const contexts=new WeakMap<CoreRunRequest,ProcessingContext>();
      for(const nodeType of options.nodeTypes){
        const type=await resolver.resolveNodeType(nodeType);
        const metadata=registry.getMetadata(nodeType);
        if(!type || !metadata || !registry.getClass(nodeType)){throw new Error(`Installed pack ${pack.id} did not register configured node ${nodeType}`);}
        host.execution.register({type,dynamicOutputs:metadata.supports_dynamic_outputs,required:metadata.properties.filter(property=>property.required && property.default==null).map(property=>property.name),create:(node,request)=>{
          let context=contexts.get(request);
          if(!context){context=scopedContext(host,request,options);contexts.set(request,context);}
          if (SCOPED_NODE_TYPES.has(nodeType)) {
            const scoped = context;
            return {process: inputs => executeScopedNode(nodeType, inputs, scoped, options)};
          }
          return bindExecutor(registry.resolve(node),context);
        }});
      }
    }
  };
}
