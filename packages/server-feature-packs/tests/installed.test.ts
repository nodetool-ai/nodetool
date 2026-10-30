import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {createCoreExecutionHost} from '@nodetool-ai/nodes-core';
import {createLocalWorkspace} from '@nodetool-ai/runtime-core';
import {ProcessingContext,setDefaultModelInterfaces,encodeRawRgbaToPng} from '@nodetool-ai/runtime';
import {solidRgba} from '@nodetool-ai/runtime/media/testing';
import {createInstalledPackFeature,type InstalledPackHost} from '../src/index.js';

async function hostFixture(){
  const directory=await mkdtemp(join(tmpdir(),'installed-pack-'));
  const assets=new Map<string,{id:string;name:string;content_type:string;metadata:null;uri:string;bytes:Uint8Array}>();
  let counter=0;
  const host:InstalledPackHost={
    execution:createCoreExecutionHost({workspace:()=>createLocalWorkspace(directory)}),
    readSecret:async()=>undefined,
    readAsset:async(user,id)=>{const asset=assets.get(String(id).replace(/^asset:\/\//,''));if(user!=='alice'||!asset){throw new Error('Asset not found');}return asset.bytes;},
    getAssetInfo:async(user,id)=>{const asset=assets.get(String(id).replace(/^asset:\/\//,''));if(user!=='alice'||!asset){throw new Error('Asset not found');}return asset;},
    writeAsset:async(user,input)=>{if(user!=='alice'){throw new Error('Run owner mismatch');}const id=(++counter).toString(16).padStart(32,'0');const asset={id,name:input.name,content_type:input.contentType,metadata:null,uri:`asset://${id}`,bytes:input.content};assets.set(id,asset);return asset;}
  };
  return {host,assets,close:()=>rm(directory,{recursive:true,force:true})};
}
describe('explicit installed legacy node adapter',()=>{
  it('runs the actual installed text pack without admitting its other nodes',async()=>{
    const fixture=await hostFixture();
    try {
      await createInstalledPackFeature({packId:'text',nodeTypes:['nodetool.text.FilterString']}).activate(fixture.host);
      expect(fixture.host.execution.nodeTypes()).not.toContain('nodetool.text.SaveTextFile');
      expect(await fixture.host.execution.run({graph:{nodes:[{id:'filter',type:'nodetool.text.FilterString',properties:{value:'hello tenant',criteria:'tenant',filter_type:'contains'}}],edges:[]},userId:'alice',jobId:'job',signal:new AbortController().signal,emit:()=>undefined})).toEqual({'Filter String':['hello tenant']});
    }finally{await fixture.close();}
  });
  it('runs actual image SaveImage against owner-scoped asset persistence',async()=>{
    const fixture=await hostFixture();
    try {
      await createInstalledPackFeature({packId:'image',nodeTypes:['nodetool.image.SaveImage']}).activate(fixture.host);
      const data=await encodeRawRgbaToPng(solidRgba(2,2,[255,0,0,255]),2,2);
      const result=await fixture.host.execution.run({graph:{nodes:[{id:'save',type:'nodetool.image.SaveImage',properties:{name:'fixture.png',image:{type:'image',data,mime_type:'image/png'}}}],edges:[]},userId:'alice',jobId:'job',signal:new AbortController().signal,emit:()=>undefined});
      expect(result['Save Image Asset']).toBeInstanceOf(Array);
      expect(fixture.assets.size).toBe(1);
      expect([...fixture.assets.values()][0]?.bytes).toEqual(data);
      await expect(fixture.host.readAsset('bob',[...fixture.assets.keys()][0])).rejects.toThrow('Asset not found');
    }finally{await fixture.close();}
  });
  it('renders an actual installed GPU image generator and persists its image output',async()=>{
    const fixture=await hostFixture();
    try {
      await createInstalledPackFeature({packId:'image',nodeTypes:['lib.image.draw.Checkerboard','nodetool.image.SaveImage']}).activate(fixture.host);
      await fixture.host.execution.run({graph:{nodes:[{id:'render',type:'lib.image.draw.Checkerboard',properties:{width:4,height:4,cell_size:2}},{id:'save',type:'nodetool.image.SaveImage',properties:{name:'render.png'}}],edges:[{source:'render',sourceHandle:'output',target:'save',targetHandle:'image'}]},userId:'alice',jobId:'render-job',signal:new AbortController().signal,emit:()=>undefined});
      const asset=[...fixture.assets.values()][0];
      expect(asset).toBeDefined();
      if(!asset){throw new Error('Rendered image was not persisted');}
      const png=Buffer.from(asset.bytes);
      expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
      expect(png.readUInt32BE(16)).toBe(4);
      expect(png.readUInt32BE(20)).toBe(4);
    }finally{await fixture.close();}
  });
  it('refuses legacy nodes with unaudited direct filesystem access',()=>{
    expect(()=>createInstalledPackFeature({packId:'image',nodeTypes:['nodetool.image.LoadImageFile']})).toThrow('not audited');
  });
  it('isolates process defaults in contexts and copied contexts',async()=>{
    process.env.NODETOOL_ISOLATION_FIXTURE='host value';
    setDefaultModelInterfaces({getJob:async()=>({id:'global-leak'})});
    try {
      const defaultContext=new ProcessingContext({jobId:'default',userId:'alice'});
      expect(defaultContext.environment.NODETOOL_ISOLATION_FIXTURE).toBe('host value');
      expect(await defaultContext.getJob('default')).toEqual({id:'global-leak'});
      const context=new ProcessingContext({jobId:'isolated',userId:'alice',inheritHostDefaults:false,assetBytesResolver:async reference=>reference==='asset://owned' ? new Uint8Array([4,5]) : null});
      expect(context.environment.NODETOOL_ISOLATION_FIXTURE).toBeUndefined();
      expect(context.copy().environment.NODETOOL_ISOLATION_FIXTURE).toBeUndefined();
      await expect(context.getJob('other')).rejects.toThrow('explicit server feature');
      await expect(context.copy().getJob('other')).rejects.toThrow('explicit server feature');
      expect((await context.copy().resolveAssetBytes('asset://owned')).bytes).toEqual(new Uint8Array([4,5]));
      expect((await context.copy().resolveAssetBytes('file:///etc/passwd')).bytes).toBeNull();
    }finally{delete process.env.NODETOOL_ISOLATION_FIXTURE;setDefaultModelInterfaces(null);}
  });
});
