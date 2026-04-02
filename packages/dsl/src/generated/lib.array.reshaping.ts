// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Reshape 1D — lib.array.reshaping.Reshape1D
export interface Reshape1DInputs {
  values?: Connectable<unknown>;
  num_elements?: Connectable<number>;
}

export interface Reshape1DOutputs {
  output: unknown;
}

export function reshape1D(
  inputs: Reshape1DInputs
): DslNode<Reshape1DOutputs, "output"> {
  return createNode(
    "lib.array.reshaping.Reshape1D",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Reshape 2D — lib.array.reshaping.Reshape2D
export interface Reshape2DInputs {
  values?: Connectable<unknown>;
  num_rows?: Connectable<number>;
  num_cols?: Connectable<number>;
}

export interface Reshape2DOutputs {
  output: unknown;
}

export function reshape2D(
  inputs: Reshape2DInputs
): DslNode<Reshape2DOutputs, "output"> {
  return createNode(
    "lib.array.reshaping.Reshape2D",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Reshape 3D — lib.array.reshaping.Reshape3D
export interface Reshape3DInputs {
  values?: Connectable<unknown>;
  num_rows?: Connectable<number>;
  num_cols?: Connectable<number>;
  num_depths?: Connectable<number>;
}

export interface Reshape3DOutputs {
  output: unknown;
}

export function reshape3D(
  inputs: Reshape3DInputs
): DslNode<Reshape3DOutputs, "output"> {
  return createNode(
    "lib.array.reshaping.Reshape3D",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Reshape 4D — lib.array.reshaping.Reshape4D
export interface Reshape4DInputs {
  values?: Connectable<unknown>;
  num_rows?: Connectable<number>;
  num_cols?: Connectable<number>;
  num_depths?: Connectable<number>;
  num_channels?: Connectable<number>;
}

export interface Reshape4DOutputs {
  output: unknown;
}

export function reshape4D(
  inputs: Reshape4DInputs
): DslNode<Reshape4DOutputs, "output"> {
  return createNode(
    "lib.array.reshaping.Reshape4D",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
