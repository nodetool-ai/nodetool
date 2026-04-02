// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// List To Array — lib.numpy.conversion.ListToArray
export interface ListToArrayInputs {
  values?: Connectable<unknown[]>;
}

export interface ListToArrayOutputs {
  output: unknown;
}

export function listToArray(
  inputs: ListToArrayInputs
): DslNode<ListToArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ListToArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Array To List — lib.numpy.conversion.ArrayToList
export interface ArrayToListInputs {
  values?: Connectable<unknown>;
}

export interface ArrayToListOutputs {
  output: unknown[];
}

export function arrayToList(
  inputs: ArrayToListInputs
): DslNode<ArrayToListOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ArrayToList",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Scalar To Array — lib.numpy.conversion.ScalarToArray
export interface ScalarToArrayInputs {
  value?: Connectable<number>;
}

export interface ScalarToArrayOutputs {
  output: unknown;
}

export function scalarToArray(
  inputs: ScalarToArrayInputs
): DslNode<ScalarToArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ScalarToArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Array To Scalar — lib.numpy.conversion.ArrayToScalar
export interface ArrayToScalarInputs {
  values?: Connectable<unknown>;
}

export interface ArrayToScalarOutputs {
  output: number;
}

export function arrayToScalar(
  inputs: ArrayToScalarInputs
): DslNode<ArrayToScalarOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ArrayToScalar",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Convert To Image — lib.numpy.conversion.ConvertToImage
export interface ConvertToImageInputs {
  values?: Connectable<unknown>;
}

export interface ConvertToImageOutputs {
  output: ImageRef;
}

export function convertToImage(
  inputs: ConvertToImageInputs
): DslNode<ConvertToImageOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ConvertToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Convert To Audio — lib.numpy.conversion.ConvertToAudio
export interface ConvertToAudioInputs {
  values?: Connectable<unknown>;
  sample_rate?: Connectable<number>;
}

export interface ConvertToAudioOutputs {
  output: AudioRef;
}

export function convertToAudio(
  inputs: ConvertToAudioInputs
): DslNode<ConvertToAudioOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ConvertToAudio",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Convert To Array — lib.numpy.conversion.ConvertToArray
export interface ConvertToArrayInputs {
  image?: Connectable<ImageRef>;
}

export interface ConvertToArrayOutputs {
  output: unknown;
}

export function convertToArray(
  inputs: ConvertToArrayInputs
): DslNode<ConvertToArrayOutputs, "output"> {
  return createNode(
    "lib.numpy.conversion.ConvertToArray",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
