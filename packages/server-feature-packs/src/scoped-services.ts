import { assertSafePublicHttpsUrl } from '@nodetool-ai/runtime-core';
import type { ProcessingContext } from '@nodetool-ai/runtime';
import { FeatureNotInstalledError } from '@nodetool-ai/server-features';
import { z } from 'zod';

/** Each call must create a fresh isolated browser session, never a shared signed-in page. */
export interface ScopedBrowserSession {
  goto(url: string, options: {waitUntil: 'domcontentloaded'; timeout: number}): Promise<{status: number | null} | void>;
  waitForSelector(selector: string, options: {timeout: number}): Promise<{exists: true} | void>;
  screenshot(): Promise<Uint8Array>;
  screenshotOfElement(selector: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface ScopedLocalGeneration {
  /** Must interrupt native inference, including an in-flight generate call. */
  interrupt(): void;
  generate(prompt: string, options: Readonly<Record<string, unknown>>): Promise<string>;
  close(): Promise<void>;
}

export interface ScopedPackServices {
  readonly openBrowser?: (context: ProcessingContext) => Promise<ScopedBrowserSession>;
  /** Resolve only administrator-approved local models and cache paths, per run owner. */
  readonly openLocalGeneration?: (inputs: Readonly<Record<string, unknown>>, context: ProcessingContext) => Promise<ScopedLocalGeneration>;
}

export const SCOPED_NODE_TYPES = new Set(['lib.browser.Screenshot', 'transformers.TextGeneration']);

export function requireScopedService(nodeType: string, services: ScopedPackServices): void {
  if ((nodeType === 'lib.browser.Screenshot' && !services.openBrowser) ||
      (nodeType === 'transformers.TextGeneration' && !services.openLocalGeneration)) {
    const pack = nodeType === 'lib.browser.Screenshot' ? 'automation' : 'transformers-js';
    throw new FeatureNotInstalledError(nodeType, [pack], 'FEATURE_NOT_CONFIGURED', new Map([[pack, `@nodetool-ai/${pack}-nodes`]]));
  }
}

export async function executeScopedNode(nodeType: string, inputs: Record<string, unknown>, context: ProcessingContext, services: ScopedPackServices): Promise<Record<string, unknown>> {
  const signal = context.signal;
  signal?.throwIfAborted();
  requireScopedService(nodeType, services);
  if (nodeType === 'lib.browser.Screenshot') {
    if (!services.openBrowser) { throw new Error('Browser service missing'); }
    if (typeof inputs.url !== 'string' || !inputs.url) { throw new Error('URL is required'); }
    assertSafePublicHttpsUrl(inputs.url);
    const url = new URL(inputs.url);
    if (url.username || url.password) { throw new Error('Browser URL must not contain credentials'); }
    const page = await services.openBrowser(context);
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => closing ??= page.close();
    const onAbort = (): void => { void close().catch(() => { /* The awaited finally reports close failures. */ }); };
    signal?.addEventListener('abort', onAbort, {once:true});
    try {
      signal?.throwIfAborted();
      const timeout = typeof inputs.timeout === 'number' ? inputs.timeout : 30000;
      await page.goto(inputs.url, {waitUntil:'domcontentloaded', timeout});
      signal?.throwIfAborted();
      const selector = typeof inputs.selector === 'string' ? inputs.selector : '';
      if (selector) { await page.waitForSelector(selector, {timeout}); }
      const bytes = selector ? await page.screenshotOfElement(selector) : await page.screenshot();
      signal?.throwIfAborted();
      return {output:{type:'image',data:Buffer.from(bytes).toString('base64'),mime_type:'image/png'}};
    } catch (error) {
      signal?.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      await close();
    }
  }
  if (!services.openLocalGeneration) { throw new Error('Local generation service missing'); }
  if (typeof inputs.prompt !== 'string' || !inputs.prompt) { throw new Error('Prompt is required'); }
  const generation = await services.openLocalGeneration(inputs, context);
  const interrupt = (): void => generation.interrupt();
  signal?.addEventListener('abort', interrupt, {once:true});
  try {
    signal?.throwIfAborted();
    const text = await generation.generate(inputs.prompt, inputs);
    signal?.throwIfAborted();
    return {text};
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', interrupt);
    await generation.close();
  }
}

/** Structural subset of @huggingface/transformers, supplied by an explicitly installed runtime. */
export interface LocalTransformersRuntime {
  /** Checked at invocation because upstream overloads span every supported modality. */
  pipeline: unknown;
  InterruptableStoppingCriteria: new () => {interrupt(): void};
}

/** Model identifiers come from configuration, never arbitrary workflow filesystem paths. */
export function localTransformersService(runtime: LocalTransformersRuntime, models: Readonly<Record<string, string>>): NonNullable<ScopedPackServices['openLocalGeneration']> {
  return async (inputs, context) => {
    context.signal?.throwIfAborted();
    const modelId = typeof inputs.model === 'string' ? inputs.model :
      typeof inputs.model === 'object' && inputs.model !== null && 'repo_id' in inputs.model && typeof inputs.model.repo_id === 'string' ? inputs.model.repo_id : '';
    if (!Object.hasOwn(models, modelId)) { throw new Error('Local model is not authorized in the configured model allowlist'); }
    const model = models[modelId];
    if (!model) { throw new Error('Configured local model path is empty'); }
    const stopping = new runtime.InterruptableStoppingCriteria();
    const modelOptionsSchema = z.object({local_files_only:z.literal(true),dtype:z.string().optional(),device:z.string().optional()});
    const initialize = z.function({input:z.tuple([z.literal('text-generation'),z.string(),modelOptionsSchema])}).parse(runtime.pipeline);
    const modelOptions = modelOptionsSchema.parse({local_files_only:true});
    for (const option of ['dtype', 'device'] as const) {
      const value = inputs[option];
      const normalized = value === undefined || value === null ? '' : String(value).trim();
      if (normalized && normalized !== 'auto') { modelOptions[option] = normalized; }
    }
    let pipeline: unknown;
    try {
      // The upstream pipeline initializer has no cancellation or disposable handle
      // until it resolves. Await settlement so an aborted run cannot orphan it.
      pipeline = await initialize('text-generation', model, modelOptions);
    } catch (error) {
      context.signal?.throwIfAborted();
      throw error;
    }
    if ((typeof pipeline !== 'object' && typeof pipeline !== 'function') || pipeline === null || !('dispose' in pipeline)) {
      throw new Error('Local text-generation runtime returned a pipeline without disposal');
    }
    const disposePipeline = z.function({input:z.tuple([]),output:z.promise(z.void())}).parse(pipeline.dispose);
    const dispose = (): Promise<void> => disposePipeline.call(pipeline);
    if (context.signal?.aborted) { await dispose(); context.signal.throwIfAborted(); }
    const callable = z.function({input:z.tuple([z.string(),z.record(z.string(),z.unknown())])}).safeParse(pipeline);
    if (!callable.success) {
      await dispose();
      throw new Error('Local text-generation runtime returned a non-callable pipeline');
    }
    const generate = callable.data;
    return {
      interrupt: () => stopping.interrupt(),
      generate: async (prompt, options) => {
        const configuredTopK = Number(options.top_k);
        const topK = Number.isFinite(configuredTopK) ? configuredTopK : 50;
        const sampling = topK > 0 ? {top_k:topK} : undefined;
        const generationOptions = {
          max_new_tokens: options.max_new_tokens ?? 128, temperature: options.temperature ?? 1,
          top_p: options.top_p ?? 1,
          do_sample: options.do_sample ?? true, repetition_penalty: options.repetition_penalty ?? 1,
          return_full_text:false, stopping_criteria:stopping, ...sampling
        };
        const result = await generate(prompt, generationOptions);
        const output = z.array(z.object({ generated_text: z.string() })).safeParse(result);
        if (!output.success) { throw new Error('Local text-generation pipeline returned a non-text result'); }
        return output.data[0]?.generated_text ?? '';
      },
      close: dispose
    };
  };
}

/** Accept the public @nodetool-ai/browser API after explicit package installation. */
export function isolatedBrowserService<Client>(runtime: {
  launchBrowser(): Promise<{client: Client; close(): Promise<void>}>;
  CdpPage: {create(client: Client, viewport: {width: number; height: number}): Promise<Omit<ScopedBrowserSession, 'close'>>};
}): NonNullable<ScopedPackServices['openBrowser']> {
  return async context => {
    context.signal?.throwIfAborted();
    // No port or shared profile is accepted from the workflow.
    const session = await runtime.launchBrowser();
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => closing ??= session.close();
    const onAbort = (): void => { void close().catch(() => { /* Awaited cleanup reports failures. */ }); };
    context.signal?.addEventListener('abort', onAbort, {once:true});
    try {
      context.signal?.throwIfAborted();
      const page = await runtime.CdpPage.create(session.client, {width:1280,height:900});
      context.signal?.throwIfAborted();
      return {
        goto: (url, options) => page.goto(url, options),
        waitForSelector: (selector, options) => page.waitForSelector(selector, options),
        screenshot: () => page.screenshot(),
        screenshotOfElement: selector => page.screenshotOfElement(selector),
        close
      };
    } catch (error) {
      await close();
      context.signal?.throwIfAborted();
      throw error;
    } finally {
      context.signal?.removeEventListener('abort', onAbort);
    }
  };
}
