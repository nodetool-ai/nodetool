import { Tool as RealTool } from "../../../../packages/agents/src/tools/base-tool.ts";
// Preserve the actual agent permission and tool implementations without loading
// the server's tool catalog and its ambient model/database dependencies.
export { Tool } from '../../../../packages/agents/src/tools/base-tool.ts';
export { TOOL_CALL_ID_FIELD } from '../../../../packages/agents/src/tools/subtask-fields.ts';
export { gateLegacyTools } from '../../../../packages/agents/src/capabilities/legacy-tools.ts';
export { gateFromContext } from '../../../../packages/agents/src/capabilities/gate-from-context.ts';
export { agentActivityReporter } from '../../../../packages/agents/src/capabilities/agent-activity.ts';
// Native hosts supply executable tools per context with setInjectedTools().
// No server-wide catalog is granted by importing an agent node.
export function getBuiltinTools() { return []; }
export function getMediaTools() { return []; }
export { capabilityRunForTools } from '../../../../packages/agents/src/capabilities/legacy-tools.ts';
export { contextSecretAvailability } from '../../../../packages/agents/src/capabilities/invoke.ts';
export { buildToolBridge } from '../../../../packages/agents/src/codeact/tool-api.ts';
export { mountCapabilityModules } from '../../../../packages/agents/src/codeact/capability-modules.ts';
import { capabilityRunForTools } from '../../../../packages/agents/src/capabilities/legacy-tools.ts';
// The native host has no ambient server toolbelt. Context-injected tools are
// mounted by the sandbox adapter and are the run's complete capability grant.
export function assembleSandboxToolbelt() { return []; }
class InjectedCapabilityTool extends RealTool {
  constructor(tool){super();this.tool=tool;}
  get name(){return this.tool.name;}
  get description(){return this.tool.description??'';}
  get inputSchema(){return this.tool.inputSchema??{type:'object',properties:{}};}
  process(context,args){return this.tool.execute?this.tool.execute(context,args):this.tool.process(context,args);}
}
export function createCapabilityRun(options) {
  const tools=(options.context._injectedTools??[]).map(tool=>tool instanceof RealTool?tool:new InjectedCapabilityTool(tool));
  const run=capabilityRunForTools(tools,options.context,{gate:options.gate,signal:options.context.signal});
  const invoke=run.invoke;
  const granted=new Set(tools.map(tool=>tool.name));
  run.invoke=(name,args)=>{
    if(!granted.has(name))throw new Error(`Capability '${name}' is not granted`);
    return invoke(name,args);
  };
  return run;
}
