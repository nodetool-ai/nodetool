import { Graph } from '@nodetool-ai/execution-core';
import { TypeMetadata } from '@nodetool-ai/protocol';
import type { CoreNodeDefinition, ValidationIssue } from './index.js';

/** Validates the saved graph without executing nodes or dropping unavailable data. */
export function validateCoreGraph(graph: unknown, definitions: ReadonlyMap<string,CoreNodeDefinition>, nodeFeatures: Readonly<Record<string,readonly string[]>> = {}): ValidationIssue[] {
  let parsed: Graph;
  try { parsed = Graph.fromDict(graph,{skipErrors:false,allowUndefinedProperties:true}); }
  catch (error) { return [{code:'INVALID_GRAPH',message:error instanceof Error ? error.message : String(error)}]; }
  const issues: ValidationIssue[] = [];
  const nodes = new Map(parsed.nodes.map(node => [node.id,node]));
  const seen = new Set<string>();
  const incoming = new Map<string,Set<string>>();
  const degree = new Map(parsed.nodes.map(node => [node.id,0]));
  const downstream = new Map<string,string[]>();
  for (const node of parsed.nodes) {
    if (seen.has(node.id)) { issues.push({nodeId:node.id,code:'DUPLICATE_NODE_ID',message:`Duplicate node ID: ${node.id}`}); }
    seen.add(node.id);
    const definition = definitions.get(node.type);
    if (!definition) {
      const featureIds = nodeFeatures[node.type] ?? (node.type === 'nodetool.code.Code' ? ['sandbox'] : []);
      issues.push({nodeId:node.id,nodeType:node.type,code:featureIds.length ? 'FEATURE_NOT_INSTALLED' : 'UNKNOWN_NODE_TYPE',featureIds,message:`Node type is unavailable: ${node.type}`});
    }
  }
  for (const edge of parsed.edges) {
    const source = nodes.get(edge.source);const target = nodes.get(edge.target);
    if (!source || !target) { issues.push({code:'DANGLING_EDGE',message:`Edge references a missing node: ${edge.source} -> ${edge.target}`});continue; }
    degree.set(target.id,(degree.get(target.id) ?? 0)+1);
    const targets=downstream.get(source.id) ?? [];targets.push(target.id);downstream.set(source.id,targets);
    if (edge.edge_type === 'control') { continue; }
    const connected = incoming.get(target.id) ?? new Set<string>();connected.add(edge.targetHandle);incoming.set(target.id,connected);
    const sourceDefinition=definitions.get(source.type)?.type;const targetDefinition=definitions.get(target.type)?.type;
    const sourceType=sourceDefinition?.outputs?.[edge.sourceHandle];
    const targetType=targetDefinition?.propertyTypes?.[edge.targetHandle];
    if (sourceDefinition && !sourceType && !definitions.get(source.type)?.dynamicOutputs) { issues.push({nodeId:source.id,code:'UNKNOWN_OUTPUT',message:`Unknown output handle: ${source.type}.${edge.sourceHandle}`}); }
    if (targetDefinition && !targetType && !targetDefinition.supportsDynamicInputs) { issues.push({nodeId:target.id,code:'UNKNOWN_INPUT',message:`Unknown input handle: ${target.type}.${edge.targetHandle}`}); }
    if (sourceType && targetType && !TypeMetadata.fromString(sourceType).isCompatibleWith(TypeMetadata.fromString(targetType))) { issues.push({nodeId:target.id,code:'TYPE_MISMATCH',message:`Cannot connect ${sourceType} to ${targetType}: ${edge.source} -> ${edge.target}`}); }
  }
  const ready=[...degree].filter(([,count])=>count===0).map(([id])=>id);
  for(let index=0;index<ready.length;index++) {
    for(const target of downstream.get(ready[index]) ?? []) { const next=(degree.get(target) ?? 0)-1;degree.set(target,next);if(next===0){ready.push(target);} }
  }
  if(ready.length!==nodes.size) { issues.push({code:'CYCLE',message:'Graph contains a cycle'}); }
  for(const node of parsed.nodes) {
    const definition=definitions.get(node.type);
    for(const property of definition?.required ?? []) {
      const value=node.properties?.[property];
      const unselectedModel = property === 'model' && typeof value === 'object' && value !== null && (!('id' in value) || typeof value.id !== 'string' || value.id.length === 0);
      if(!incoming.get(node.id)?.has(property) && (value===undefined || value===null || value==='' || unselectedModel)) { issues.push({nodeId:node.id,code:'MISSING_PROPERTY',message:`Missing required property: ${node.type}.${property}`}); }
    }
    for(const [property,type] of Object.entries(definition?.type.propertyTypes ?? {})) {
      const value=node.properties?.[property];
      if(value===null || value===undefined){continue;}
      const valid=type==='str' ? typeof value==='string' : type==='bool' ? typeof value==='boolean' : type==='int' ? typeof value==='number' && Number.isInteger(value) : type==='float' ? typeof value==='number' && Number.isFinite(value) : true;
      if(!valid) { issues.push({nodeId:node.id,code:'INVALID_PROPERTY',message:`Property ${node.type}.${property} must be ${type}`}); }
    }
  }
  return issues;
}
