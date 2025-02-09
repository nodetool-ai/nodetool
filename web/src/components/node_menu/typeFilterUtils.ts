import { console } from "node:inspector/promises";
import { NodeMetadata, TypeMetadata, TypeName } from "../../stores/ApiTypes";
import { isConnectable } from "../../utils/TypeHandler";

export type ConnectabilityMatrix = Record<TypeName, Record<TypeName, boolean>>;

const hashType = (type: TypeMetadata): string => {
  if (type) {
    return `${type.type}_${type.type_args.map((t) => hashType(t)).join("_")}`;
  }
  return "";
};

let connectabilityMatrix: ConnectabilityMatrix | null = null;

export function createConnectabilityMatrix(metadata: NodeMetadata[]) {
  if (connectabilityMatrix) {
    return;
  }

  // Get unique types by using a Map with hashType as key
  const typeMap = new Map<string, TypeMetadata>();
  metadata
    .flatMap((node) => node.properties.map((prop) => prop.type))
    .forEach((type) => {
      typeMap.set(hashType(type), type);
    });
  const allTypes = Array.from(typeMap.values());

  const matrix: ConnectabilityMatrix = {};

  // Initialize the matrix with nested objects first
  allTypes.forEach((inputType) => {
    matrix[hashType(inputType)] = {};
  });

  // Now set the connectability values
  allTypes.forEach((inputType) => {
    allTypes.forEach((outputType) => {
      matrix[hashType(inputType)][hashType(outputType)] = isConnectable(
        inputType,
        outputType,
        true
      );
    });
  });

  connectabilityMatrix = matrix;
}

export function isConnectableCached(
  inputType: TypeMetadata,
  outputType: TypeMetadata
) {
  return (
    connectabilityMatrix?.[hashType(inputType)]?.[hashType(outputType)] ?? false
  );
}

/**
 * Filter node that can be connected to the input type.
 * @param metadata - The metadata to filter.
 * @param inputType - The selected input type.
 * @returns The filtered metadata.
 */
export const filterTypesByInputType = (
  metadata: NodeMetadata[],
  inputType: TypeMetadata
): NodeMetadata[] => {
  return metadata.filter((node) => {
    return node.properties.some((prop) => {
      return isConnectableCached(inputType, prop.type);
    });
  });
};

/**
 * Filter node that can be connected to the output type.
 * @param metadata - The metadata to filter.
 * @param outputType - The selected output type.
 * @returns The filtered metadata.
 */
export const filterTypesByOutputType = (
  metadata: NodeMetadata[],
  outputType: TypeMetadata
): NodeMetadata[] => {
  return outputType
    ? metadata.filter((node) => {
        return node.outputs.some((output) => {
          return isConnectableCached(output.type, outputType);
        });
      })
    : metadata;
};

/**
 * Filters the metadata by the selected input and output types.
 * @param metadata - The metadata to filter.
 * @param inputType - The selected input type.
 * @param outputType - The selected output type.
 * @returns The filtered metadata.
 */
export const filterDataByType = (
  metadata: NodeMetadata[],
  inputType: TypeName | undefined,
  outputType: TypeName | undefined
): NodeMetadata[] => {
  const intermediateFilteredData = inputType
    ? filterTypesByInputType(metadata, {
        type: inputType,
        optional: true,
        type_args: [],
        type_name: inputType
      })
    : metadata;
  return outputType
    ? filterTypesByOutputType(intermediateFilteredData, {
        type: outputType,
        optional: true,
        type_args: [],
        type_name: outputType
      })
    : intermediateFilteredData;
};
