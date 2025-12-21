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

  const typeMap = new Map<string, TypeMetadata>();
  const addType = (type?: TypeMetadata) => {
    if (!type) {
      return;
    }
    typeMap.set(hashType(type), type);
  };

  metadata.forEach((node) => {
    node.properties.forEach((prop) => addType(prop.type));
    node.outputs?.forEach((output) => addType(output.type));
  });

  const allTypes = Array.from(typeMap.values());
  const matrix: ConnectabilityMatrix = {};

  allTypes.forEach((sourceType) => {
    const sourceKey = hashType(sourceType);
    matrix[sourceKey] = {};

    allTypes.forEach((targetType) => {
      const targetKey = hashType(targetType);
      matrix[sourceKey][targetKey] = isConnectable(
        sourceType,
        targetType,
        true
      );
    });
  });

  connectabilityMatrix = matrix;
}

export function isConnectableCached(
  sourceType: TypeMetadata,
  targetType: TypeMetadata
) {
  const sourceKey = hashType(sourceType);
  const targetKey = hashType(targetType);
  const cached = connectabilityMatrix?.[sourceKey]?.[targetKey];

  if (typeof cached === "boolean") {
    return cached;
  }

  return isConnectable(sourceType, targetType, true);
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
      // Exclude matches that are only connectable because the property is "any"
      if (prop.type.type === "any") {
        return false;
      }
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
          // Exclude matches that are only connectable because the output is "any"
          if (output.type.type === "any") {
            return false;
          }
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
  // Helper to build a minimal TypeMetadata object
  const buildTypeMeta = (t: string) => ({
    type: t,
    optional: true,
    type_args: [] as any[],
    type_name: t
  });

  let filtered = metadata;

  // --- Input Filtering ---
  if (inputType) {
    if (inputType === "any") {
      // Strict match: property type must be exactly 'any'
      filtered = filtered.filter((node) =>
        node.properties.some((prop) => prop.type.type === "any")
      );
    } else {
      filtered = filterTypesByInputType(filtered, buildTypeMeta(inputType));
    }
  }

  // --- Output Filtering ---
  if (outputType) {
    if (outputType === "any") {
      filtered = filtered.filter((node) =>
        node.outputs.some((out) => out.type.type === "any")
      );
    } else {
      filtered = filterTypesByOutputType(filtered, buildTypeMeta(outputType));
    }
  }

  return filtered;
};

// -----------------------------
// Strict / Exact type matching
// -----------------------------
/**
 * Recursively checks whether a TypeMetadata tree contains the given type name.
 * This is used for the NodeMenu where we only care if a node *mentions* a type
 * (directly or nested inside list/union/dict/etc.), not whether types are
 * connectable.
 */
export const typeTreeContains = (
  meta: TypeMetadata | undefined,
  targetType: TypeName
): boolean => {
  if (!meta) {return false;}

  if (meta.type === targetType) {return true;}

  if (meta.type_args && meta.type_args.length > 0) {
    return meta.type_args.some((arg) => typeTreeContains(arg, targetType));
  }

  return false;
};

/**
 * Filter helpers that *do not* use connectability – they only look for an exact
 * occurrence of the requested type in the property / output signatures.
 */
export const filterTypesByInputExact = (
  metadata: NodeMetadata[],
  inputType: TypeName
): NodeMetadata[] => {
  if (!inputType) {return metadata;}

  if (inputType === "any") {
    return metadata.filter((node) =>
      node.properties.some((prop) => prop.type.type === "any")
    );
  }

  return metadata.filter((node) =>
    node.properties.some((prop) => prop.type.type === inputType)
  );
};

export const filterTypesByOutputExact = (
  metadata: NodeMetadata[],
  outputType: TypeName
): NodeMetadata[] => {
  if (!outputType) {return metadata;}

  if (outputType === "any") {
    return metadata.filter((node) =>
      node.outputs.some((out) => out.type.type === "any")
    );
  }

  // Special case: "notype" means the node produces **no** outputs.
  if (outputType === "notype") {
    return metadata.filter((node) => node.outputs.length === 0);
  }

  return metadata.filter((node) =>
    node.outputs.some((out) => out.type.type === outputType)
  );
};

/**
 * Strict variant of type filtering used by the NodeMenu.  Does *not* rely on
 * connectability – it only checks if the node definitions contain the type
 * literally.
 */
export const filterDataByExactType = (
  metadata: NodeMetadata[],
  inputType: TypeName | undefined,
  outputType: TypeName | undefined
): NodeMetadata[] => {
  let filtered = metadata;

  if (inputType) {
    filtered = filterTypesByInputExact(filtered, inputType);
  }

  if (outputType) {
    filtered = filterTypesByOutputExact(filtered, outputType);
  }

  return filtered;
};
