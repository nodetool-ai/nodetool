/**
 * Passthrough computation utilities for bypassed nodes.
 *
 * When a node is bypassed, its inputs should be intelligently mapped to outputs
 * based on type matching and name matching to allow the workflow to continue.
 */

import { NodeMetadata, Property, OutputSlot } from "../stores/ApiTypes";

/**
 * Represents a mapping from an input to an output for passthrough
 */
export interface PassthroughMapping {
  inputName: string;
  outputName: string;
  type: string;
}

/**
 * Computes the passthrough mappings for a bypassed node.
 *
 * Algorithm:
 * 1. First, try exact name matches where input and output have the same name and type
 * 2. Then, try type-only matches for unmatched inputs/outputs
 * 3. Single I/O case: If one input and one output of same type, auto-connect
 *
 * @param metadata The node's metadata containing properties (inputs) and outputs
 * @returns Array of passthrough mappings
 */
export function computePassthrough(
  metadata: NodeMetadata
): PassthroughMapping[] {
  const mappings: PassthroughMapping[] = [];
  const inputs = metadata.properties.filter(
    (p) => p.type?.type && !isExcludedFromPassthrough(p)
  );
  const outputs = metadata.outputs || [];

  // Track which outputs have been matched
  const matchedOutputs = new Set<string>();
  const matchedInputs = new Set<string>();

  // 1. Try exact name AND type matches first
  for (const input of inputs) {
    const inputType = input.type?.type;
    if (!inputType) {continue;}

    const matchingOutput = outputs.find(
      (o) =>
        o.name === input.name &&
        typesAreCompatible(inputType, o.type?.type) &&
        !matchedOutputs.has(o.name)
    );

    if (matchingOutput) {
      mappings.push({
        inputName: input.name,
        outputName: matchingOutput.name,
        type: inputType
      });
      matchedOutputs.add(matchingOutput.name);
      matchedInputs.add(input.name);
    }
  }

  // 2. Try similar name matches (e.g., "image_in" -> "image_out", "input" -> "output")
  for (const input of inputs) {
    if (matchedInputs.has(input.name)) {continue;}

    const inputType = input.type?.type;
    if (!inputType) {continue;}

    const matchingOutput = outputs.find(
      (o) =>
        areNamesSimilar(input.name, o.name) &&
        typesAreCompatible(inputType, o.type?.type) &&
        !matchedOutputs.has(o.name)
    );

    if (matchingOutput) {
      mappings.push({
        inputName: input.name,
        outputName: matchingOutput.name,
        type: inputType
      });
      matchedOutputs.add(matchingOutput.name);
      matchedInputs.add(input.name);
    }
  }

  // 3. Try type-only matches for remaining unmatched inputs
  for (const input of inputs) {
    if (matchedInputs.has(input.name)) {continue;}

    const inputType = input.type?.type;
    if (!inputType) {continue;}

    const matchingOutput = outputs.find(
      (o) =>
        typesAreCompatible(inputType, o.type?.type) &&
        !matchedOutputs.has(o.name)
    );

    if (matchingOutput) {
      mappings.push({
        inputName: input.name,
        outputName: matchingOutput.name,
        type: inputType
      });
      matchedOutputs.add(matchingOutput.name);
      matchedInputs.add(input.name);
    }
  }

  return mappings;
}

/**
 * Check if two types are compatible for passthrough
 * For now, this is strict equality, but could be expanded for type coercion
 */
function typesAreCompatible(
  inputType: string | undefined,
  outputType: string | undefined
): boolean {
  if (!inputType || !outputType) {return false;}

  // Exact match
  if (inputType === outputType) {return true;}

  // "any" type matches anything
  if (inputType === "any" || outputType === "any") {return true;}

  return false;
}

/**
 * Check if two names are similar enough to be considered a match
 * E.g., "image_in" and "image_out", "input" and "output"
 */
function areNamesSimilar(inputName: string, outputName: string): boolean {
  // Normalize names by removing common suffixes/prefixes
  const normalize = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/_?in$/i, "")
      .replace(/_?out$/i, "")
      .replace(/_?input$/i, "")
      .replace(/_?output$/i, "")
      .replace(/^input_?/i, "")
      .replace(/^output_?/i, "");
  };

  const normalizedInput = normalize(inputName);
  const normalizedOutput = normalize(outputName);

  // If both normalize to empty string, they're probably "input"/"output" pair
  if (normalizedInput === "" && normalizedOutput === "") {return true;}

  // Check if normalized names match
  return normalizedInput !== "" && normalizedInput === normalizedOutput;
}

/**
 * Check if a property should be excluded from passthrough mapping
 * Some properties are configuration-only and shouldn't be passed through
 */
function isExcludedFromPassthrough(property: Property): boolean {
  const excludedNames = [
    "seed",
    "steps",
    "guidance_scale",
    "width",
    "height",
    "batch_size",
    "num_inference_steps"
  ];

  return excludedNames.includes(property.name.toLowerCase());
}

/**
 * Returns a human-readable description of the passthrough for a bypassed node
 */
export function getPassthroughDescription(
  mappings: PassthroughMapping[]
): string {
  if (mappings.length === 0) {
    return "No passthrough available - outputs will be null";
  }

  return mappings
    .map((m) => `${m.inputName} → ${m.outputName} (${m.type})`)
    .join("\n");
}

/**
 * Check if a node can be meaningfully bypassed
 * Returns true if there's at least one potential passthrough mapping
 */
export function canBypass(metadata: NodeMetadata): boolean {
  const mappings = computePassthrough(metadata);
  return mappings.length > 0;
}
