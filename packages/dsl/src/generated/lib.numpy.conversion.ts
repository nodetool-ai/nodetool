// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// List To Array — lib.numpy.conversion.ListToArray
export interface ListToArrayInputs {
  values?: Connectable<unknown[]>;
}

export function listToArray(inputs: ListToArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.conversion.ListToArray", inputs as Record<string, unknown>);
}

// Array To List — lib.numpy.conversion.ArrayToList
export interface ArrayToListInputs {
  values?: Connectable<unknown>;
}

export function arrayToList(inputs: ArrayToListInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("lib.numpy.conversion.ArrayToList", inputs as Record<string, unknown>);
}

// Scalar To Array — lib.numpy.conversion.ScalarToArray
export interface ScalarToArrayInputs {
  value?: Connectable<number>;
}

export function scalarToArray(inputs: ScalarToArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.conversion.ScalarToArray", inputs as Record<string, unknown>);
}

// Array To Scalar — lib.numpy.conversion.ArrayToScalar
export interface ArrayToScalarInputs {
  values?: Connectable<unknown>;
}

export function arrayToScalar(inputs: ArrayToScalarInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.numpy.conversion.ArrayToScalar", inputs as Record<string, unknown>);
}

// Convert To Image — lib.numpy.conversion.ConvertToImage
export interface ConvertToImageInputs {
  values?: Connectable<unknown>;
}

export function convertToImage(inputs: ConvertToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("lib.numpy.conversion.ConvertToImage", inputs as Record<string, unknown>);
}

// Convert To Audio — lib.numpy.conversion.ConvertToAudio
export interface ConvertToAudioInputs {
  values?: Connectable<unknown>;
  sample_rate?: Connectable<number>;
}

export function convertToAudio(inputs: ConvertToAudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("lib.numpy.conversion.ConvertToAudio", inputs as Record<string, unknown>);
}

// Convert To Array — lib.numpy.conversion.ConvertToArray
export interface ConvertToArrayInputs {
  image?: Connectable<ImageRef>;
}

export function convertToArray(inputs: ConvertToArrayInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.numpy.conversion.ConvertToArray", inputs as Record<string, unknown>);
}
