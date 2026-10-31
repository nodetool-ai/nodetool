import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {featureRecovery} from '@nodetool-ai/server-features';
import {formatCliError} from '../src/lean/errors.js';
import {createProgram} from '../src/lean/program.js';

describe('feature recovery at CLI boundaries', () => {
  it('preserves nullable pack IDs and separate adapter installation in stderr JSON', () => {
    const recovery = [featureRecovery('provider-anthropic','@nodetool-ai/provider-anthropic',null),featureRecovery('automation','@nodetool-ai/automation-nodes')];
    const error = Object.assign(new Error('Feature unavailable'),{code:'FEATURE_NOT_CONFIGURED',featureIds:['provider-anthropic','automation'],recovery});
    expect(JSON.parse(formatCliError(error))).toEqual({message:error.message,code:error.code,featureIds:error.featureIds,recovery});
  });
  it.each(['validate','run'])('returns actionable structured errors from native %s without installation', async action => {
    const directory = await mkdtemp(join(tmpdir(),'cli-feature-recovery-'));
    try {
      const file = join(directory,'missing.json');
      const graph = {nodes:[{id:'shot',type:'lib.browser.Screenshot',properties:{url:'https://example.com'}}],edges:[]};
      await writeFile(file,JSON.stringify(graph));
      let failure: unknown;
      const output: string[] = [];
      try {await createProgram({env:{},stdout:value=>output.push(value)}).parseAsync(['node','nodetool',action,file]);}
      catch (error) {failure=error;}
      expect(failure).toBeInstanceOf(Error);
      const payload = JSON.parse(formatCliError(failure));
      expect(payload.validation_issues).toEqual(JSON.parse(output.join('')).issues);
      expect(payload).toMatchObject({code:'FEATURE_NOT_INSTALLED',featureIds:['automation'],recovery:[{featureId:'automation',packId:'automation',packageName:'@nodetool-ai/automation-nodes',installCommand:'nodetool packs add automation --yes',adapterInstallCommand:'npm install @nodetool-ai/server-feature-packs',configuration:expect.stringContaining('nodetool packs add cli-workflow --yes'),restart:'Run the command again.'}],validation_issues:[{nodeType:'lib.browser.Screenshot'}]});
    } finally {await rm(directory,{recursive:true,force:true});}
  });
  it.each(['FEATURE_NOT_INSTALLED','FEATURE_NOT_CONFIGURED','FEATURE_INITIALIZATION_FAILED'])('preserves %s HTTP recovery payload in CLI stderr', async code => {
    const recovery = [featureRecovery('transformers-js','@nodetool-ai/transformers-js-nodes')];
    const validation_issues = [{nodeType:'transformers.TextGeneration',code,featureIds:['transformers-js'],recovery}];
    let failure: unknown;
    try {
      await createProgram({env:{NODETOOL_API_TOKEN:'fixture'},stdout:()=>undefined,fetch:async () => new Response(JSON.stringify({error:'Feature unavailable',code,validation_issues}),{status:422})}).parseAsync(['node','nodetool','workflows','run','fixture']);
    } catch (error) {failure=error;}
    expect(failure).toBeInstanceOf(Error);
    expect(JSON.parse(formatCliError(failure))).toMatchObject({code,validation_issues});
  });
});
