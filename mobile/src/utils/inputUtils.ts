import { MiniAppInputKind } from "../types/miniapp";

export const getInputKind = (nodeType: string): MiniAppInputKind | null => {
  if (nodeType === "nodetool.input.TextInput") {return "string";}
  if (nodeType === "nodetool.input.IntegerInput") {return "integer";}
  if (nodeType === "nodetool.input.FloatInput") {return "float";}
  if (nodeType === "nodetool.input.BooleanInput") {return "boolean";}
  // Add other mappings if necessary, or check for includes as the original screen did
  if (nodeType.includes("Integer")) {return "integer";}
  if (nodeType.includes("Float")) {return "float";}
  if (nodeType.includes("Boolean")) {return "boolean";}
  if (nodeType.includes("Input")) {return "string";} // Fallback for other inputs
  
  return null;
};
