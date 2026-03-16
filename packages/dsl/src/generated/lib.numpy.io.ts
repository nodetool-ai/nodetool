// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { FolderRef } from "../types.js";

// Save Array — lib.numpy.io.SaveArray
export interface SaveArrayInputs {
  values?: Connectable<unknown>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveArray(inputs: SaveArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.io.SaveArray", inputs as Record<string, unknown>);
}
