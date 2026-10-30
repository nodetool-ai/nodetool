import {describe, it, expect, vi} from 'vitest';
import {ProcessingContext} from '@nodetool-ai/runtime';
import {executeScopedNode, localTransformersService, requireScopedService} from '../src/scoped-services.js';

function context(signal = new AbortController().signal): ProcessingContext {
  const result = new ProcessingContext({jobId:'fixture',userId:'alice',inheritHostDefaults:false});
  result.signal = signal;
  return result;
}

describe('scoped installed services', () => {
  it('reports installed but unconfigured services with actionable recovery', () => {
    for (const node of ['lib.browser.Screenshot','transformers.TextGeneration']) {
      expect(() => requireScopedService(node, {})).toThrow(expect.objectContaining({code:'FEATURE_NOT_CONFIGURED',recovery:expect.arrayContaining([expect.objectContaining({authorizationRequired:true,installCommand:expect.stringContaining('nodetool packs add')})])}));
    }
  });
  it('captures browser bytes and closes the isolated session', async () => {
    const close = vi.fn(async () => undefined);
    const openBrowser = vi.fn(async (ctx: ProcessingContext) => {
      expect(ctx.userId).toBe('alice');
      expect(ctx.environment.HOME).toBeUndefined();
      return {goto:vi.fn(async () => undefined),waitForSelector:vi.fn(async () => undefined),screenshot:async () => new Uint8Array([1,2]),screenshotOfElement:async () => new Uint8Array([3]),close};
    });
    expect(await executeScopedNode('lib.browser.Screenshot',{url:'https://example.com'},context(),{openBrowser})).toEqual({output:{type:'image',data:'AQI=',mime_type:'image/png'}});
    expect(close).toHaveBeenCalledOnce();
  });
  it('closes the browser while navigation is pending on cancellation', async () => {
    const controller = new AbortController();
    let rejectNavigation: (error: Error) => void = () => undefined;
    const close = vi.fn(async () => rejectNavigation(new Error('session closed')));
    const run = executeScopedNode('lib.browser.Screenshot',{url:'https://example.com'},context(controller.signal),{openBrowser:async () => ({goto:async () => new Promise((_resolve,reject) => {rejectNavigation=reject;controller.abort();}),waitForSelector:async () => undefined,screenshot:async () => new Uint8Array(),screenshotOfElement:async () => new Uint8Array(),close})});
    await expect(run).rejects.toMatchObject({name:'AbortError'});
    expect(close).toHaveBeenCalledOnce();
  });
  it('uses the actual pipeline interface with local-only models and disposes after generation', async () => {
    const dispose = vi.fn(async () => undefined);
    const pipeline = vi.fn(async () => Object.assign(async () => [{generated_text:'local answer'}],{dispose}));
    const openLocalGeneration = localTransformersService({pipeline,InterruptableStoppingCriteria:class {interrupt():void {}}},{small:'/approved/models/small'});
    expect(await executeScopedNode('transformers.TextGeneration',{model:'small',prompt:'hello'},context(),{openLocalGeneration})).toEqual({text:'local answer'});
    expect(pipeline).toHaveBeenCalledWith('text-generation','/approved/models/small',{local_files_only:true});
    expect(dispose).toHaveBeenCalledOnce();
    await expect(executeScopedNode('transformers.TextGeneration',{model:'/etc/passwd',prompt:'hello'},context(),{openLocalGeneration})).rejects.toThrow('not authorized');
  });
  it('interrupts in-flight local inference and disposes on cancellation', async () => {
    const controller = new AbortController();
    let fail: (error: Error) => void = () => undefined;
    const interrupt = vi.fn(() => fail(new Error('native interrupted')));
    const close = vi.fn(async () => undefined);
    await expect(executeScopedNode('transformers.TextGeneration',{prompt:'hello'},context(controller.signal),{openLocalGeneration:async () => ({interrupt,close,generate:async () => new Promise((_resolve,reject) => {fail=reject;controller.abort();})})})).rejects.toMatchObject({name:'AbortError'});
    expect(interrupt).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([
    { dtype: ' q4 ', device: ' cpu ', top_k: 0, expected: { dtype: 'q4', device: 'cpu' } },
    { dtype: 'auto', device: ' ', top_k: -1, expected: {} }
  ])('preserves configured model options and omits disabled top_k: $dtype/$device', async ({ dtype, device, top_k, expected }) => {
    const generate = vi.fn(async (_prompt: string, _options: Record<string, unknown>) => [{ generated_text: 'answer' }]);
    const pipeline = vi.fn(async () => Object.assign(generate, { dispose: async () => undefined }));
    const openLocalGeneration = localTransformersService({ pipeline, InterruptableStoppingCriteria: class { interrupt(): void {} } }, { small: '/approved/small' });
    await executeScopedNode('transformers.TextGeneration', { model: 'small', prompt: 'hello', dtype, device, top_k }, context(), { openLocalGeneration });
    expect(pipeline).toHaveBeenCalledWith('text-generation', '/approved/small', { local_files_only: true, ...expected });
    expect(generate.mock.calls[0]?.[1]).not.toHaveProperty('top_k');
  });
  it('rejects an empty prompt before opening or initializing local inference', async () => {
    const pipeline = vi.fn();
    const openLocalGeneration = vi.fn(localTransformersService({ pipeline, InterruptableStoppingCriteria: class { interrupt(): void {} } }, { small: '/approved/small' }));
    await expect(executeScopedNode('transformers.TextGeneration', { model: 'small', prompt: '' }, context(), { openLocalGeneration })).rejects.toThrow('Prompt is required');
    expect(openLocalGeneration).not.toHaveBeenCalled();
    expect(pipeline).not.toHaveBeenCalled();
  });
});

it('wires the public browser launch/page interfaces into a fresh session', async () => {
  const {isolatedBrowserService} = await import('../src/scoped-services.js');
  const close = vi.fn(async () => undefined);
  const launchBrowser = vi.fn(async () => ({client:{id:'isolated'},close}));
  const create = vi.fn(async () => ({goto:async () => undefined,waitForSelector:async () => undefined,screenshot:async () => new Uint8Array([9]),screenshotOfElement:async () => new Uint8Array([8])}));
  await executeScopedNode('lib.browser.Screenshot',{url:'https://example.com'},context(),{openBrowser:isolatedBrowserService({launchBrowser,CdpPage:{create}})});
  expect(launchBrowser).toHaveBeenCalledWith();
  expect(create).toHaveBeenCalledWith({id:'isolated'},{width:1280,height:900});
  expect(close).toHaveBeenCalledOnce();
});

it('awaits initialization settlement and disposes a local pipeline after an initialization abort', async () => {
  const controller = new AbortController();
  const dispose = vi.fn(async () => undefined);
  let settle: (() => void) | undefined;
  const initialized = new Promise<void>(resolve => {settle=resolve;});
  const pipeline = vi.fn(async () => {controller.abort();await initialized;return Object.assign(async () => [{generated_text:'unused'}],{dispose});});
  const service = localTransformersService({pipeline,InterruptableStoppingCriteria:class {interrupt():void {}}},{small:'/approved/small'});
  const run = executeScopedNode('transformers.TextGeneration',{model:'small',prompt:'hello'},context(controller.signal),{openLocalGeneration:service});
  expect(dispose).not.toHaveBeenCalled();
  settle?.();
  await expect(run).rejects.toMatchObject({name:'AbortError'});
  expect(dispose).toHaveBeenCalledOnce();
});

it('closes a browser that finishes launching after cancellation', async () => {
  const {isolatedBrowserService} = await import('../src/scoped-services.js');
  const controller = new AbortController();
  const close = vi.fn(async () => undefined);
  const create = vi.fn(async () => ({goto:async () => undefined,waitForSelector:async () => undefined,screenshot:async () => new Uint8Array(),screenshotOfElement:async () => new Uint8Array()}));
  const service = isolatedBrowserService({launchBrowser:async () => {controller.abort();return {client:{},close};},CdpPage:{create}});
  await expect(service(context(controller.signal))).rejects.toMatchObject({name:'AbortError'});
  expect(close).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
});

it('closes an isolated session during page initialization on cancellation', async () => {
  const {isolatedBrowserService} = await import('../src/scoped-services.js');
  const controller = new AbortController();
  let rejectSetup: (error: Error) => void = () => undefined;
  const close = vi.fn(async () => rejectSetup(new Error('session closed')));
  const service = isolatedBrowserService({launchBrowser:async () => ({client:{},close}),CdpPage:{create:async () => new Promise<never>((_resolve,reject) => {rejectSetup=reject;controller.abort();})}});
  await expect(service(context(controller.signal))).rejects.toMatchObject({name:'AbortError'});
  expect(close).toHaveBeenCalledOnce();
});

it.each(['file:///etc/passwd','http://localhost:7777','https://127.0.0.1','https://0x7f000001','https://169.254.169.254','https://user:password@example.com'])('rejects unsafe remote browser URL %s before opening a session', async url => {
  const openBrowser = vi.fn();
  await expect(executeScopedNode('lib.browser.Screenshot',{url},context(),{openBrowser})).rejects.toThrow();
  expect(openBrowser).not.toHaveBeenCalled();
});
