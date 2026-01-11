/**
 * Subgraph I/O management utilities
 * 
 * Functions for managing input/output slots on subgraph definitions
 */

import {
  SubgraphDefinition,
  SubgraphInput,
  SubgraphOutput
} from "../../../types/subgraph";

/**
 * Generates a UUID v4 string
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return hexValue.toString(16);
  });
}

/**
 * Generates a unique slot name
 */
function generateUniqueName(baseName: string, existingNames: string[]): string {
  const nameSet = new Set(existingNames);
  
  if (!nameSet.has(baseName)) {
    return baseName;
  }
  
  let counter = 1;
  while (nameSet.has(`${baseName}_${counter}`)) {
    counter++;
  }
  
  return `${baseName}_${counter}`;
}

/**
 * Adds an input slot to a subgraph definition
 * 
 * @param definition - Subgraph definition to modify
 * @param name - Name for the new input (optional)
 * @param type - Data type for the input (default: "*")
 * @returns Updated definition and the new input
 */
export function addInput(
  definition: SubgraphDefinition,
  name?: string,
  type: string = "*"
): { definition: SubgraphDefinition; input: SubgraphInput } {
  const existingNames = definition.inputs.map(i => i.name);
  const inputName = name 
    ? generateUniqueName(name, existingNames)
    : generateUniqueName("input", existingNames);
  
  const newInput: SubgraphInput = {
    id: generateUUID(),
    name: inputName,
    type,
    linkIds: [],
    label: inputName
  };
  
  const updated: SubgraphDefinition = {
    ...definition,
    inputs: [...definition.inputs, newInput],
    updated_at: new Date().toISOString()
  };
  
  return { definition: updated, input: newInput };
}

/**
 * Removes an input slot from a subgraph definition
 * 
 * @param definition - Subgraph definition to modify
 * @param inputId - ID of the input to remove
 * @returns Updated definition
 */
export function removeInput(
  definition: SubgraphDefinition,
  inputId: string
): SubgraphDefinition {
  const index = definition.inputs.findIndex(i => i.id === inputId);
  
  if (index === -1) {
    throw new Error(`Input ${inputId} not found in subgraph ${definition.id}`);
  }
  
  // Remove the input
  const inputs = [...definition.inputs];
  inputs.splice(index, 1);
  
  // TODO: Remove any internal edges connected to this input
  // This would require filtering edges that target SUBGRAPH_INPUT_NODE_ID
  
  return {
    ...definition,
    inputs,
    updated_at: new Date().toISOString()
  };
}

/**
 * Renames an input slot
 * 
 * @param definition - Subgraph definition to modify
 * @param inputId - ID of the input to rename
 * @param newName - New name for the input
 * @returns Updated definition
 */
export function renameInput(
  definition: SubgraphDefinition,
  inputId: string,
  newName: string
): SubgraphDefinition {
  const index = definition.inputs.findIndex(i => i.id === inputId);
  
  if (index === -1) {
    throw new Error(`Input ${inputId} not found in subgraph ${definition.id}`);
  }
  
  // Check for name conflicts
  const existingNames = definition.inputs
    .filter((_, i) => i !== index)
    .map(i => i.name);
  
  if (existingNames.includes(newName)) {
    throw new Error(`Input name "${newName}" already exists in subgraph ${definition.id}`);
  }
  
  const inputs = [...definition.inputs];
  inputs[index] = {
    ...inputs[index],
    name: newName,
    label: newName
  };
  
  return {
    ...definition,
    inputs,
    updated_at: new Date().toISOString()
  };
}

/**
 * Adds an output slot to a subgraph definition
 * 
 * @param definition - Subgraph definition to modify
 * @param name - Name for the new output (optional)
 * @param type - Data type for the output (default: "*")
 * @returns Updated definition and the new output
 */
export function addOutput(
  definition: SubgraphDefinition,
  name?: string,
  type: string = "*"
): { definition: SubgraphDefinition; output: SubgraphOutput } {
  const existingNames = definition.outputs.map(o => o.name);
  const outputName = name 
    ? generateUniqueName(name, existingNames)
    : generateUniqueName("output", existingNames);
  
  const newOutput: SubgraphOutput = {
    id: generateUUID(),
    name: outputName,
    type,
    linkIds: [],
    label: outputName
  };
  
  const updated: SubgraphDefinition = {
    ...definition,
    outputs: [...definition.outputs, newOutput],
    updated_at: new Date().toISOString()
  };
  
  return { definition: updated, output: newOutput };
}

/**
 * Removes an output slot from a subgraph definition
 * 
 * @param definition - Subgraph definition to modify
 * @param outputId - ID of the output to remove
 * @returns Updated definition
 */
export function removeOutput(
  definition: SubgraphDefinition,
  outputId: string
): SubgraphDefinition {
  const index = definition.outputs.findIndex(o => o.id === outputId);
  
  if (index === -1) {
    throw new Error(`Output ${outputId} not found in subgraph ${definition.id}`);
  }
  
  // Remove the output
  const outputs = [...definition.outputs];
  outputs.splice(index, 1);
  
  // TODO: Remove any internal edges connected to this output
  // This would require filtering edges that source from SUBGRAPH_OUTPUT_NODE_ID
  
  return {
    ...definition,
    outputs,
    updated_at: new Date().toISOString()
  };
}

/**
 * Renames an output slot
 * 
 * @param definition - Subgraph definition to modify
 * @param outputId - ID of the output to rename
 * @param newName - New name for the output
 * @returns Updated definition
 */
export function renameOutput(
  definition: SubgraphDefinition,
  outputId: string,
  newName: string
): SubgraphDefinition {
  const index = definition.outputs.findIndex(o => o.id === outputId);
  
  if (index === -1) {
    throw new Error(`Output ${outputId} not found in subgraph ${definition.id}`);
  }
  
  // Check for name conflicts
  const existingNames = definition.outputs
    .filter((_, i) => i !== index)
    .map(o => o.name);
  
  if (existingNames.includes(newName)) {
    throw new Error(`Output name "${newName}" already exists in subgraph ${definition.id}`);
  }
  
  const outputs = [...definition.outputs];
  outputs[index] = {
    ...outputs[index],
    name: newName,
    label: newName
  };
  
  return {
    ...definition,
    outputs,
    updated_at: new Date().toISOString()
  };
}

/**
 * Updates the type of an input slot
 * 
 * @param definition - Subgraph definition to modify
 * @param inputId - ID of the input to update
 * @param type - New data type
 * @returns Updated definition
 */
export function updateInputType(
  definition: SubgraphDefinition,
  inputId: string,
  type: string
): SubgraphDefinition {
  const index = definition.inputs.findIndex(i => i.id === inputId);
  
  if (index === -1) {
    throw new Error(`Input ${inputId} not found in subgraph ${definition.id}`);
  }
  
  const inputs = [...definition.inputs];
  inputs[index] = {
    ...inputs[index],
    type
  };
  
  return {
    ...definition,
    inputs,
    updated_at: new Date().toISOString()
  };
}

/**
 * Updates the type of an output slot
 * 
 * @param definition - Subgraph definition to modify
 * @param outputId - ID of the output to update
 * @param type - New data type
 * @returns Updated definition
 */
export function updateOutputType(
  definition: SubgraphDefinition,
  outputId: string,
  type: string
): SubgraphDefinition {
  const index = definition.outputs.findIndex(o => o.id === outputId);
  
  if (index === -1) {
    throw new Error(`Output ${outputId} not found in subgraph ${definition.id}`);
  }
  
  const outputs = [...definition.outputs];
  outputs[index] = {
    ...outputs[index],
    type
  };
  
  return {
    ...definition,
    outputs,
    updated_at: new Date().toISOString()
  };
}
