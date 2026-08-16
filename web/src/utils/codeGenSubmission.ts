/**
 * Translation between an accepted `submit_code` submission and Code Node data.
 *
 * A generated node is an ordinary Code Node: the submission only fills the
 * fields the node already has (`properties.code`, `dynamic_inputs`,
 * `dynamic_outputs`, `dynamic_properties`, `title`). Keeping the conversion
 * pure lets both the store action and the dialog seed use it.
 */
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import type { TypeMetadata } from "../stores/ApiTypes";
import type { DynamicSlotDeclaration, NodeData } from "../stores/NodeData";
import { toCodeGenType } from "./codeGenEntryPoints";
import { defaultValueForType, normalizeTypeMetadata } from "./dynamicSlots";

/** The `NodeData` fields an accepted submission writes, and only those. */
export type CodeGenNodeDataPatch = Required<
  Pick<
    NodeData,
    | "title"
    | "properties"
    | "dynamic_properties"
    | "dynamic_inputs"
    | "dynamic_outputs"
  >
>;

const toSlot = (port: codeGen.CodeGenInputPort): DynamicSlotDeclaration => {
  const slot: DynamicSlotDeclaration = {
    type: normalizeTypeMetadata(port.type)
  };
  if (port.description) {
    slot.description = port.description;
  }
  if (port.default !== undefined) {
    slot.default = port.default;
  }
  if (port.required !== undefined) {
    slot.required = port.required;
  }
  return slot;
};

/**
 * Node data for an accepted submission. Slots are replaced wholesale — the
 * submission is the node's complete new interface — while other properties
 * carry over so an unrelated inline field survives generation.
 */
export function codeGenSubmissionToNodeData(
  submission: codeGen.CodeGenSubmission,
  currentProperties: Record<string, unknown>
): CodeGenNodeDataPatch {
  const dynamic_inputs: Record<string, DynamicSlotDeclaration> = {};
  const dynamic_properties: Record<string, unknown> = {};
  for (const port of submission.inputs) {
    const slot = toSlot(port);
    dynamic_inputs[port.name] = slot;
    dynamic_properties[port.name] =
      slot.default ?? defaultValueForType(slot.type);
  }

  const dynamic_outputs: Record<string, TypeMetadata> = {};
  for (const port of submission.outputs) {
    dynamic_outputs[port.name] = normalizeTypeMetadata(port.type);
  }

  return {
    title: submission.title,
    properties: { ...currentProperties, code: submission.code },
    dynamic_properties,
    dynamic_inputs,
    dynamic_outputs
  };
}

/**
 * Describe a node's existing dynamic inputs to the generator. Slot names that
 * are not valid JavaScript identifiers are dropped — the request schema
 * rejects them, and generated code destructures the names verbatim.
 */
export function nodeInputsToCodeGenPorts(
  dynamicInputs: Record<string, DynamicSlotDeclaration> | undefined
): codeGen.CodeGenInputPort[] {
  const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  return Object.entries(dynamicInputs ?? {})
    .filter(([name]) => identifier.test(name))
    .map(([name, slot]) => {
      const port: codeGen.CodeGenInputPort = {
        name,
        type: toCodeGenType(slot.type)
      };
      if (slot.description) port.description = slot.description;
      if (slot.required !== undefined) port.required = slot.required;
      return port;
    });
}
