import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalWorkspace} from '@nodetool-ai/runtime-core';
import {createCoreExecutionHost} from '../src/index.js';
const node = (id:string,type:string,properties:Record<string,unknown>) => ({id,type,properties});
const edge = (source:string,target:string,sourceHandle='output',targetHandle='value') => ({source,target,sourceHandle,targetHandle});
const request = (graph:unknown) => ({graph,signal:new AbortController().signal,userId:'owner',jobId:'job',emit:()=>undefined});
describe('lean actor composition',()=>{
  it('runs saved constants through output nodes with the canonical graph shape',async()=>{
    const host=createCoreExecutionHost();
    expect(await host.run(request({nodes:[node('a','nodetool.constant.String',{value:'hello'}),node('b','nodetool.output.Output',{name:'result'})],edges:[edge('a','b')]}))).toEqual({result:['hello']});
  });
  it('does not execute an untaken branch',async()=>{
    const host=createCoreExecutionHost();
    const result=await host.run(request({nodes:[node('a','nodetool.constant.String',{value:'yes'}),node('b','nodetool.control.If',{condition:true}),node('c','nodetool.output.Output',{name:'taken'}),node('d','nodetool.json.Parse',{})],edges:[edge('a','b'),edge('b','c','if_true'),edge('b','d','if_false','text')]}));
    expect(result.taken).toEqual(['yes']);
  });
  it('streams a deterministic remote provider and passes cancellation',async()=>{
    let signal:AbortSignal|undefined;
    const recorded: Array<{inputTokens:number;outputTokens:number}> = [];
    const host=createCoreExecutionHost({provider:{async *stream(req){signal=req.signal;yield {done:false,text:'one'};yield {done:false,text:'two'};yield {done:true,usage:{inputTokens:1,outputTokens:2}};}}});
    const result=await host.run({...request({nodes:[node('a','openai.text.ChatComplete',{model:'fixture',prompt:'hello'})],edges:[]}),recordUsage:usage=>recorded.push(usage)});
    expect(Object.values(result).flat()).toContain('onetwo');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(recorded).toEqual([{inputTokens:1,outputTokens:2}]);
  });
  it('rejects unavailable nodes without mutating their properties',()=>{
    const host=createCoreExecutionHost();const graph={nodes:[node('a','nodetool.code.Code',{code:'preserved'})],edges:[]};
    expect(host.validate(graph)[0]?.code).toBe('FEATURE_NOT_INSTALLED');
    expect(graph.nodes[0]?.properties.code).toBe('preserved');
  });
  it('rejects cancellation before a node can start',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(createCoreExecutionHost().run({...request({nodes:[],edges:[]}),signal:controller.signal})).rejects.toThrow();
  });
});

describe('static graph validation',()=>{
  it('rejects a cycle before any node executes',()=>{
    const host=createCoreExecutionHost();
    expect(host.validate({nodes:[node('a','nodetool.output.Output',{}),node('b','nodetool.output.Output',{})],edges:[edge('a','b'),edge('b','a')]}).some(issue=>issue.code==='CYCLE')).toBe(true);
  });
  it('rejects dangling endpoints and duplicate IDs',()=>{
    const host=createCoreExecutionHost();
    const issues=host.validate({nodes:[node('a','nodetool.constant.String',{}),node('a','nodetool.output.Output',{})],edges:[edge('a','missing')]});
    expect(issues.map(issue=>issue.code)).toContain('DUPLICATE_NODE_ID');
    expect(issues.map(issue=>issue.code)).toContain('DANGLING_EDGE');
  });
  it('validates declared handles and scalar edge types',()=>{
    const host=createCoreExecutionHost();
    const issues=host.validate({nodes:[node('a','nodetool.constant.String',{value:'hello'}),node('b','nodetool.control.If',{})],edges:[edge('a','b','output','condition'),edge('a','b','typo','typo')]});
    expect(issues.map(issue=>issue.code)).toContain('TYPE_MISMATCH');
    expect(issues.map(issue=>issue.code)).toContain('UNKNOWN_INPUT');
    expect(issues.map(issue=>issue.code)).toContain('UNKNOWN_OUTPUT');
  });
  it('requires configured HTTP URL and remote model and prompt',()=>{
    const host=createCoreExecutionHost();
    const issues=host.validate({nodes:[node('a','nodetool.http.Request',{}),node('b','openai.text.ChatComplete',{})],edges:[]});
    expect(issues.filter(issue=>issue.code==='MISSING_PROPERTY')).toHaveLength(3);
    expect(host.validate({nodes:[node('a','openai.text.ChatComplete',{model:{id:''},prompt:'hello'})],edges:[]})[0]?.code).toBe('MISSING_PROPERTY');
  });
  it('rejects scalar property type errors and accepts a connected required property',()=>{
    const host=createCoreExecutionHost();
    expect(host.validate({nodes:[node('a','nodetool.constant.Integer',{value:'wrong'})],edges:[]})[0]?.code).toBe('INVALID_PROPERTY');
    expect(host.validate({nodes:[node('a','nodetool.constant.String',{value:'https://example.com'}),node('b','nodetool.http.Request',{})],edges:[edge('a','b','output','url')]})).toEqual([]);
  });
  it('validates a large linear graph without recursion',()=>{
    const host=createCoreExecutionHost();
    const nodes=Array.from({length:10000},(_,index)=>node(String(index),'nodetool.output.Output',{}));
    const edges=nodes.slice(1).map((entry,index)=>edge(String(index),entry.id));
    expect(host.validate({nodes,edges})).toEqual([]);
  });
  it('runs the existing ValueInput ID with a named runtime parameter',async()=>{
    const host=createCoreExecutionHost();
    expect(await host.run({...request({nodes:[node('a','nodetool.input.ValueInput',{name:'payload'}),node('b','nodetool.output.Output',{name:'result'})],edges:[edge('a','b')]}),params:{payload:{unchanged:true}}})).toEqual({result:[{unchanged:true}]});
  });
});


describe('run workspace composition',()=>{
  it('provides a real local workspace to explicitly registered nodes',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'nodetool-core-workspace-'));
    try {
      const scopes:Array<[string,string]>=[];
      const host=createCoreExecutionHost({workspace:(userId,jobId)=>{
        scopes.push([userId,jobId]);
        return createLocalWorkspace(directory);
      }});
      const input={...request({nodes:[node('writer','fixture.WriteWorkspace',{})],edges:[]}),recordUsage:()=>undefined};
      host.register({type:{nodeType:'fixture.WriteWorkspace',outputs:{output:'str'}},create:(_node,run)=>({process:async()=>{
        expect(run.signal).toBe(input.signal);
        expect(run.emit).toBe(input.emit);
        expect(run.recordUsage).toBe(input.recordUsage);
        if(!run.workspace){throw new Error('Run workspace was not composed');}
        await run.workspace.write('nested/result.txt','stored bytes','text/plain');
        return {output:await run.workspace.readText('nested/result.txt')};
      }})});
      expect(await host.run(input)).toEqual({writer:['stored bytes']});
      expect(scopes).toEqual([['owner','job']]);
      expect(await readFile(join(directory,'nested','result.txt'),'utf8')).toBe('stored bytes');
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
});
