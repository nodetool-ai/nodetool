// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";

// Reshape 1D — lib.numpy.reshaping.Reshape1D
export interface Reshape1DInputs {
  values?: Connectable<unknown>;
  num_elements?: Connectable<number>;
}

export function reshape1D(inputs: Reshape1DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.reshaping.Reshape1D", inputs as Record<string, unknown>);
}

// Reshape 2D — lib.numpy.reshaping.Reshape2D
export interface Reshape2DInputs {
  values?: Connectable<unknown>;
  num_rows?: Connectable<number>;
  num_cols?: Connectable<number>;
}

export function reshape2D(inputs: Reshape2DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.reshaping.Reshape2D", inputs as Record<string, unknown>);
}

// Reshape 3D — lib.numpy.reshaping.Reshape3D
export interface Reshape3DInputs {
  values?: Connectable<unknown>;
  num_rows?: Connectable<number>;
  num_cols?: Connectable<number>;
  num_depths?: Connectable<number>;
}

export function reshape3D(inputs: Reshape3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.reshaping.Reshape3D", inputs as Record<string, unknown>);
}

// Reshape 4D — lib.numpy.reshaping.Reshape4D
export interface Reshape4DInputs {
  values?: Connectable<unknown>;
  num_rows?: Connectable<number>;
  num_cols?: Connectable<number>;
  num_depths?: Connectable<number>;
  num_channels?: Connectable<number>;
}

export function reshape4D(inputs: Reshape4DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.reshaping.Reshape4D", inputs as Record<string, unknown>);
}
