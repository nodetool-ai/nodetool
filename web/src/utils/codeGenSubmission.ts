/**
 * Description of a Code Node's existing inputs for the `submit_code` generator.
 */
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import type { DynamicSlotDeclaration } from "../stores/NodeData";
import { toCodeGenType } from "./codeGenEntryPoints";

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
