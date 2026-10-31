import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {createMinimalServer} from '@nodetool-ai/server-minimal';
import {encodeRawRgbaToPng} from '@nodetool-ai/runtime';
import {solidRgba} from '@nodetool-ai/runtime/media/testing';
import imageFeature from '../src/image.js';

it('composes the actual installed image feature with authenticated SQLite HTTP runs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'minimal-installed-image-'));
  const headers={authorization:`Bearer ${'a'.repeat(32)}`};
  const app=await createMinimalServer({directory,masterKey:'master'.repeat(8),tokens:{['a'.repeat(32)]:'alice',['b'.repeat(32)]:'bob'},features:[{id:'image',load:async()=>imageFeature}]});
  try {
    const bytes=await encodeRawRgbaToPng(solidRgba(2,2,[255,0,0,255]),2,2);
    const uploaded=await app.inject({method:'POST',url:'/api/assets',headers:{...headers,'content-type':'application/octet-stream'},payload:Buffer.from(bytes)});
    expect(uploaded.statusCode).toBe(200);
    const assetId:string=uploaded.json().id;
    const created=await app.inject({method:'POST',url:'/api/workflows',headers,payload:{graph:{nodes:[{id:'save',type:'nodetool.image.SaveImage',properties:{name:'copied.png',image:{type:'image',asset_id:assetId,uri:`asset://${assetId}`}}}],edges:[]}}});
    expect(created.statusCode).toBe(200);
    const run=await app.inject({method:'POST',url:`/api/workflows/${created.json().id}/run`,headers,payload:{}});
    expect(run.statusCode).toBe(202);
    let job:{status?:string;error?:string;metadata_json?:{result?:Record<string,unknown>}}={};
    for(let attempt=0;attempt<100;attempt++){
      job=(await app.inject({method:'GET',url:`/api/jobs/${run.json().job_id}`,headers})).json();
      if(job.status!=='running'){break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    expect(job.status,job.error).toBe('completed');
    const results=job.metadata_json?.result?.['Save Image Asset'];
    expect(Array.isArray(results)).toBe(true);
    if(!Array.isArray(results)){throw new Error('Image result missing');}
    const result:unknown=results[0];
    if(typeof result!=='object'||result===null||!('uri'in result)||typeof result.uri!=='string'){throw new Error('Image reference missing');}
    const match=/^asset:\/\/([a-f0-9]{32})$/.exec(result.uri);
    const persistedId=match?.[1];
    expect(persistedId).toBeDefined();
    expect(persistedId).not.toBe(assetId);
    const read=await app.inject({method:'GET',url:`/api/storage/${persistedId}`,headers});
    expect(read.statusCode).toBe(200);
    expect(read.rawPayload).toEqual(Buffer.from(bytes));
    expect((await app.inject({method:'GET',url:`/api/storage/${persistedId}`,headers:{authorization:`Bearer ${'b'.repeat(32)}`}})).statusCode).toBe(404);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
