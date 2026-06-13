// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Read Text File — nodetool.workspace.ReadTextFile
export interface ReadTextFileInputs {
  path?: Connectable<string>;
  encoding?: Connectable<string>;
}

export interface ReadTextFileOutputs {
  output: string;
}

export function readTextFile(inputs: ReadTextFileInputs): DslNode<ReadTextFileOutputs, "output"> {
  return createNode("nodetool.workspace.ReadTextFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Write Text File — nodetool.workspace.WriteTextFile
export interface WriteTextFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
  encoding?: Connectable<string>;
  append?: Connectable<boolean>;
}

export interface WriteTextFileOutputs {
  output: string;
}

export function writeTextFile(inputs: WriteTextFileInputs): DslNode<WriteTextFileOutputs, "output"> {
  return createNode("nodetool.workspace.WriteTextFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Read Binary File — nodetool.workspace.ReadBinaryFile
export interface ReadBinaryFileInputs {
  path?: Connectable<string>;
}

export interface ReadBinaryFileOutputs {
  output: string;
}

export function readBinaryFile(inputs: ReadBinaryFileInputs): DslNode<ReadBinaryFileOutputs, "output"> {
  return createNode("nodetool.workspace.ReadBinaryFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Write Binary File — nodetool.workspace.WriteBinaryFile
export interface WriteBinaryFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
}

export interface WriteBinaryFileOutputs {
  output: string;
}

export function writeBinaryFile(inputs: WriteBinaryFileInputs): DslNode<WriteBinaryFileOutputs, "output"> {
  return createNode("nodetool.workspace.WriteBinaryFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
