import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {createMinimalServer} from '@nodetool-ai/server-minimal';
import {pack,unpack} from 'msgpackr';

/** The caller supplies the canonical, explicitly authorized pack installation. */
export async function runScopedPackedSmoke(install) {
  const directory = await mkdtemp(join(tmpdir(), 'scoped-packed-'));
  const alice = 'packed-alice-token-0000000000000000';
  const bob = 'packed-bob-token-000000000000000000';
  const headers = {authorization:`Bearer ${alice}`};
  const options = {directory,masterKey:'packed-scope-master-key-000000000000',tokens:{[alice]:'alice',[bob]:'bob'}};
  const graphs = [
    {nodes:[{id:'shot',type:'lib.browser.Screenshot',properties:{url:'https://example.com'}}],edges:[]},
    {nodes:[{id:'local',type:'transformers.TextGeneration',properties:{prompt:'hello',model:'small'}}],edges:[]}
  ];
  let app;
  const ids = [];
  let browserClosed = 0;
  let inferenceDisposed = 0;
  let interrupted = 0;
  let waitingStarted = false;
  try {
    app = await createMinimalServer(options);
    for (const [index, graph] of graphs.entries()) {
      const created = await app.inject({method:'POST',url:'/api/workflows',headers,payload:{graph}});
      assert.equal(created.statusCode,200);
      const id = created.json().id;
      ids.push(id);
      const missing = await app.inject({method:'POST',url:`/api/workflows/${id}/run`,headers,payload:{}});
      assert.equal(missing.statusCode,422);
      const diagnostic = missing.json();
      assert.equal(diagnostic.code,'FEATURE_NOT_INSTALLED');
      const recovery = diagnostic.validation_issues[0].recovery[0];
      const packId = index === 0 ? 'automation' : 'transformers-js';
      assert.equal(recovery.packId,packId);
      assert.equal(recovery.packageName,`@nodetool-ai/${packId}-nodes`);
      assert.match(recovery.installCommand,new RegExp(`nodetool packs add.*${packId}`));
      assert.ok(recovery.configuration && recovery.restart && recovery.authorizationRequired);
      await app.ready();
      const socket = await app.injectWS(`/ws?api_key=${alice}`);
      try {
        const frame = new Promise((resolve,reject) => {
          const timer = globalThis.setTimeout(() => reject(new Error('No packed MsgPack recovery frame')),3000);
          socket.once('message',bytes => {globalThis.clearTimeout(timer);resolve(unpack(bytes));});
        });
        socket.send(pack({command:'run_job',data:{workflow_id:id}}));
        const failed = await frame;
        assert.equal(failed.code,diagnostic.code);
        assert.deepEqual(failed.validation_issues,diagnostic.validation_issues);
      } finally {socket.close();}
    }
    await app.close();
    app = undefined;
    await install();
    // Import the installed adapter and real catalog packs only after authorization.
    const {createInstalledPackFeature, isolatedBrowserService, localTransformersService} = await import('@nodetool-ai/server-feature-packs');
    const browser = {
      launchBrowser:async () => ({client:{owner:'alice'},close:async () => {browserClosed++;}}),
      CdpPage:{create:async client => {
        assert.equal(client.owner,'alice');
        return {goto:async () => undefined,waitForSelector:async () => undefined,screenshot:async () => new Uint8Array([137,80,78,71]),screenshotOfElement:async () => new Uint8Array([137,80,78,71])};
      }}
    };
    const transformers = {
      InterruptableStoppingCriteria:class {
        interrupt() {interrupted++;this.reject?.(new Error('native inference interrupted'));}
      },
      pipeline:async (task,model,configuration) => {
        assert.equal(task,'text-generation');
        assert.equal(model,'/approved/models/small');
        assert.equal(configuration.local_files_only,true);
        return Object.assign(async (prompt, settings) => {
          if (prompt === 'wait') {
            waitingStarted = true;
            return new Promise((_resolve,reject) => {settings.stopping_criteria.reject=reject;});
          }
          return [{generated_text:`local: ${prompt}`}];
        },{dispose:async () => {inferenceDisposed++;}});
      }
    };
    for (const [packId,nodeType] of [['automation','lib.browser.Screenshot'],['transformers-js','transformers.TextGeneration']]) {
      await assert.rejects(createMinimalServer({...options,features:[{id:packId,load:async () => createInstalledPackFeature({packId,nodeTypes:[nodeType]})}]}), error => error.code === 'FEATURE_NOT_CONFIGURED' && error.recovery[0].packId === packId);
    }
    const openBrowser = isolatedBrowserService(browser);
    const openLocalGeneration = localTransformersService(transformers,{small:'/approved/models/small'});
    const features = [
      {id:'automation',load:async () => createInstalledPackFeature({packId:'automation',nodeTypes:['lib.browser.Screenshot'],openBrowser:async context => {
        assert.equal(context.userId,'alice');
        assert.equal(context.environment.HOME,undefined);
        assert.ok(context.workspace);
        assert.equal(await context.getSecret('NOT_CONFIGURED'),null);
        await assert.rejects(context.getAssetInfo('f'.repeat(32)));
        return openBrowser(context);
      }})},
      {id:'transformers-js',load:async () => createInstalledPackFeature({packId:'transformers-js',nodeTypes:['transformers.TextGeneration'],openLocalGeneration})}
    ];
    app = await createMinimalServer({...options,features});
    const capabilities = (await app.inject({url:'/api/capabilities',headers})).json().capabilities;
    assert.ok(capabilities.includes('browser:screenshot'));
    assert.ok(capabilities.includes('local-inference:text-generation'));
    async function run(id) {
      const response = await app.inject({method:'POST',url:`/api/workflows/${id}/run`,headers,payload:{}});
      assert.equal(response.statusCode,202,response.body);
      return response.json().job_id;
    }
    async function finished(id) {
      for (let attempt=0;attempt<300;attempt++) {
        const job = (await app.inject({url:`/api/jobs/${id}`,headers})).json();
        if (job.status !== 'running') {return job;}
        await setTimeout(10);
      }
      throw new Error('Scoped packed job did not settle');
    }
    for (const [index,id] of ids.entries()) {
      const stored = (await app.inject({url:`/api/workflows/${id}`,headers})).json();
      assert.deepEqual(stored.graph,graphs[index]);
      assert.equal((await app.inject({url:`/api/workflows/${id}`,headers:{authorization:`Bearer ${bob}`}})).statusCode,404);
      const job = await finished(await run(id));
      assert.equal(job.status,'completed',job.error);
      if (index === 1) {assert.deepEqual(job.metadata_json.result,{'Text Generation':['local: hello']});}
    }
    assert.equal(browserClosed,1);
    assert.equal(inferenceDisposed,1);
    const waiting = (await app.inject({method:'POST',url:'/api/workflows',headers,payload:{graph:{...graphs[1],nodes:[{...graphs[1].nodes[0],properties:{prompt:'wait',model:'small'}}]}}})).json();
    const waitingJob = await run(waiting.id);
    for (let attempt=0;attempt<300 && !waitingStarted;attempt++) {await setTimeout(10);}
    assert.equal(waitingStarted,true);
    assert.equal((await app.inject({method:'POST',url:`/api/jobs/${waitingJob}/cancel`,headers})).statusCode,200);
    assert.equal((await finished(waitingJob)).status,'cancelled');
    assert.equal(interrupted,1);
    assert.equal(inferenceDisposed,2);
    process.stdout.write('Packed browser/local inference missing -> authorized install -> explicit configuration -> retry, owner isolation and cancellation passed\n');
  } finally {
    await app?.close();
    await rm(directory,{recursive:true,force:true});
  }
}
