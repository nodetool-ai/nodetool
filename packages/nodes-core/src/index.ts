import { trace } from '@opentelemetry/api';
import { Graph, WorkflowRunner, type NodeExecutor, type ProcessingContext, type ResolvedNodeType } from '@nodetool-ai/execution-core';
import type { NodeDescriptor, ProcessingMessage } from '@nodetool-ai/protocol';
import { validateCoreGraph } from './validation.js';
import { safeFetch, type TextProvider, type TextUsage, type Workspace } from '@nodetool-ai/runtime-core';

export interface CoreRunRequest {
  readonly graph: unknown;
  readonly workspace?: Workspace;
  readonly params?: Record<string, unknown>;
  readonly signal: AbortSignal;
  readonly userId: string;
  readonly jobId: string;
  readonly emit: (message: ProcessingMessage) => void;
  readonly recordUsage?: (usage: TextUsage) => void;
}
export interface CoreNodeDefinition {
  readonly type: ResolvedNodeType;
  readonly required?: readonly string[];
  readonly dynamicOutputs?: boolean;
  readonly create: (node: NodeDescriptor, request: CoreRunRequest) => NodeExecutor;
}
export interface CoreExecutionOptions {
  readonly nodeFeatures?: Readonly<Record<string, readonly string[]>>;
  readonly workspace?: (userId: string, jobId: string) => Workspace | Promise<Workspace>;
  readonly provider?: TextProvider | ((userId: string) => TextProvider | Promise<TextProvider>);
}
export interface ValidationIssue { readonly nodeId?: string; readonly nodeType?: string; readonly message: string; readonly code?: string; readonly featureIds?: readonly string[] }

/** Composes audited nodes with the existing actor engine and wire graph format. */
export function createCoreExecutionHost(options: CoreExecutionOptions = {}) {
  const definitions = new Map<string, CoreNodeDefinition>();
  const register = (definition: CoreNodeDefinition): void => {
    if (definitions.has(definition.type.nodeType)) { throw new Error(`Duplicate node type: ${definition.type.nodeType}`); }
    definitions.set(definition.type.nodeType, definition);
  };
  const simple = (nodeType: string, process: (inputs: Record<string, unknown>, request: CoreRunRequest) => Promise<Record<string, unknown>>, outputs: Record<string,string> = {output:'any'}): void => {
    const propertyTypes: Record<string,string> = {value:'any',name:'str',description:'str'};
    if ((nodeType.endsWith('.String') || nodeType.endsWith('.StringInput')) || nodeType === 'nodetool.text.Template') { propertyTypes.value = 'str'; }
    if (nodeType.endsWith('.Integer') || nodeType.endsWith('.IntegerInput')) { propertyTypes.value = 'int'; }
    if (nodeType.endsWith('.Float') || nodeType.endsWith('.FloatInput')) { propertyTypes.value = 'float'; }
    if (nodeType.endsWith('.Bool') || nodeType.endsWith('.BooleanInput')) { propertyTypes.value = 'bool'; }
    if (nodeType.endsWith('.List')) { propertyTypes.value = 'list[any]'; }
    if (nodeType.endsWith('.TextList') || nodeType.endsWith('.StringListInput') || nodeType.endsWith('.TextListInput')) { propertyTypes.value = 'list[str]'; }
    if (nodeType.endsWith('.Dict')) { propertyTypes.value = 'dict[str,any]'; }
    if (nodeType.startsWith('nodetool.input.')) { Object.assign(propertyTypes,{min:'float',max:'float',max_length:'int'}); }
    if (nodeType === 'nodetool.control.If') { propertyTypes.condition='bool'; }
    if (nodeType === 'nodetool.text.Template') { propertyTypes.string='str'; }
    if (nodeType === 'nodetool.json.Parse') { propertyTypes.text='str'; }
    if (nodeType === 'nodetool.http.Request') { Object.assign(propertyTypes,{url:'str',method:'str',body:'str'}); }
    const required = nodeType === 'nodetool.http.Request' ? ['url'] : [];
    const outputTypes = Object.keys(outputs).length === 1 && outputs.output === 'any' && nodeType.startsWith('nodetool.constant.') ? {output:propertyTypes.value} : outputs;
    register({required,type: {nodeType, propertyTypes, outputs:outputTypes, supportsDynamicInputs: nodeType === 'nodetool.text.Concat' || nodeType === 'nodetool.text.Template', descriptorDefaults: {input_mode:'buffered', retry_safe:false}}, create: (_node, request) => ({appendStaticInputs:nodeType === 'nodetool.constant.List' || nodeType === 'nodetool.constant.TextList' ? ['value'] : undefined,process: inputs => process(inputs, request)})});
  };
  const constants: Record<string,unknown> = {Bool:false,Integer:0,Float:0,String:'',List:[],TextList:[],Dict:{},JSON:{}};
  for (const [name,fallback] of Object.entries(constants)) {
    simple(`nodetool.constant.${name}`, async inputs => ({output: inputs.value ?? fallback}));
  }
  for (const name of ['StringInput','IntegerInput','FloatInput','BooleanInput','StringListInput','TextListInput','ValueInput']) {
    simple(`nodetool.input.${name}`, async inputs => {
      if (name === 'IntegerInput' || name === 'FloatInput') {
        const value = Math.min(Math.max(Number(inputs.value ?? 0),Number(inputs.min ?? 0)),Number(inputs.max ?? 99999));
        return {output:name === 'IntegerInput' ? Math.trunc(value) : value};
      }
      if (name === 'StringInput') {
        const value = String(inputs.value ?? '');
        const max = Number(inputs.max_length ?? 0);
        return {output:max > 0 ? value.slice(0,max) : value};
      }
      return {output:inputs.value ?? (name === 'BooleanInput' ? false : name === 'ValueInput' ? null : [])};
    });
  }
  simple('nodetool.output.Output', async inputs => ({output: inputs.value ?? inputs.input ?? null}));
  simple('nodetool.control.If', async inputs => inputs.condition ? {if_true: inputs.value ?? null} : {if_false: inputs.value ?? null}, {if_true:'any',if_false:'any'});
  simple('nodetool.text.Concat', async inputs => ({output: Object.values(inputs).flatMap(value => Array.isArray(value) ? value : [value]).map(value => String(value ?? '')).join('')}));
  simple('nodetool.text.Template', async inputs => {
    let result = String(inputs.string ?? '');
    for (const [key,value] of Object.entries(inputs)) {
      if (key === 'string') { continue; }
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}|(?<!\\{)\\{${escaped}\\}(?!\\})`, 'g'), () => String(value ?? ''));
    }
    return {output:result};
  });
  simple('nodetool.json.Parse', async inputs => ({output: JSON.parse(String(inputs.text ?? inputs.value ?? ''))}));
  simple('nodetool.json.Stringify', async inputs => ({output: JSON.stringify(inputs.value)}));
  simple('nodetool.http.Request', async (inputs,request) => {
    const method = String(inputs.method ?? 'GET').toUpperCase();
    const init: RequestInit = {method,signal:request.signal};
    if (typeof inputs.body === 'string') { init.body = inputs.body; }
    const response = await safeFetch(String(inputs.url), init);
    return {output:await response.text(), status:response.status};
  }, {output:'str',status:'int'});
  register({required:['model','prompt'],type:{nodeType:'openai.text.ChatComplete', propertyTypes:{model:'any',prompt:'str',text:'str'}, supportsDynamicInputs:false, outputs:{output:'str'}, descriptorDefaults:{input_mode:'buffered',is_streaming_output:true}}, create:(_node,request) => ({
    process: async () => { throw new Error('Remote text nodes require streaming execution'); },
    async *genProcess(inputs,context) {
      const provider = typeof options.provider === 'function' ? await options.provider(request.userId) : options.provider;
      if (!provider) { throw new Error('Remote text provider is not configured'); }
      let output = '';
      const model = typeof inputs.model === 'object' && inputs.model !== null && 'id' in inputs.model ? String(inputs.model.id) : String(inputs.model ?? '');
      for await (const chunk of provider.stream({model,messages:[{role:'user',content:String(inputs.prompt ?? inputs.text ?? '')}],signal:context?.signal ?? request.signal})) {
        if (!chunk.done) { output += chunk.text; yield {output}; }
        else {
          request.recordUsage?.(chunk.usage);
          trace.getActiveSpan()?.setAttributes({'gen_ai.usage.input_tokens':chunk.usage.inputTokens,'gen_ai.usage.output_tokens':chunk.usage.outputTokens});
        }
      }
    }
  })});
  function validate(graph: unknown): ValidationIssue[] {
    return validateCoreGraph(graph,definitions,options.nodeFeatures);
  }
  async function run(request: CoreRunRequest): Promise<Record<string,unknown>> {
    request.signal.throwIfAborted();
    const issues = validate(request.graph);
    if (issues.length) { throw new Error(issues.map(issue => issue.message).join('\n')); }
    const workspace = options.workspace ? await options.workspace(request.userId,request.jobId) : request.workspace;
    const executionRequest: CoreRunRequest = workspace ? {...request,workspace} : request;
    request.signal.throwIfAborted();
    const graph = await Graph.loadFromDict(request.graph, {skipErrors:false,allowUndefinedProperties:true,resolver:type => definitions.get(type)?.type ?? null});
    const context: ProcessingContext = {signal:request.signal, emit:request.emit};
    const runner = new WorkflowRunner(request.jobId, {executionContext:context,resolveExecutor:node => {
      const definition = definitions.get(node.type);
      if (!definition) { throw new Error(`Node type is unavailable: ${node.type}`); }
      return definition.create(node, executionRequest);
    }});
    const cancel = (): void => { runner.cancel(); };
    request.signal.addEventListener('abort',cancel,{once:true});
    try {
      if (request.signal.aborted) { runner.cancel(); }
      const result = await runner.run({job_id:request.jobId,params:request.params},{nodes:[...graph.nodes],edges:[...graph.edges]});
      if (result.status === 'cancelled') { throw new DOMException('Workflow cancelled','AbortError'); }
      if (result.status === 'failed') { throw new Error(result.error ?? 'Workflow failed'); }
      return result.outputs;
    } finally { request.signal.removeEventListener('abort',cancel); }
  }
  /** Describe registered node types so clients can author graphs without the full catalog. */
  function describe(): readonly { nodeType: string; properties: Record<string,string>; outputs: Record<string,string>; required: readonly string[]; dynamicInputs: boolean }[] {
    return [...definitions.values()].map(definition => ({
      nodeType: definition.type.nodeType,
      properties: {...definition.type.propertyTypes},
      outputs: {...definition.type.outputs},
      required: [...(definition.required ?? [])],
      dynamicInputs: definition.type.supportsDynamicInputs ?? false
    }));
  }
  return {register,validate,run,describe,nodeTypes:(): readonly string[] => [...definitions.keys()]};
}
