import { NodeMetadata, TypeMetadata, TypeName } from "../../stores/ApiTypes";
import { isConnectable } from "../../utils/TypeHandler";

type ConnectabilityMatrix = Record<TypeName, Record<TypeName, boolean>>;

// TypeMetadata objects come from fetched node metadata and are never mutated
// after load, so caching their hash by object identity is safe.
const hashTypeCache = new WeakMap<TypeMetadata, string>();

const hashType = (type: TypeMetadata): string => {
  if (!type) {
    return "";
  }
  const cached = hashTypeCache.get(type);
  if (cached !== undefined) {
    return cached;
  }
  // Include type_name for enums to prevent different enums from colliding
  const enumIdentity = type.type === "enum" && type.type_name ? `@${type.type_name}` : "";
  const result = `${type.type}${enumIdentity}_${(type.type_args ?? []).map((t) => hashType(t)).join("_")}`;
  hashTypeCache.set(type, result);
  return result;
};

let connectabilityMatrix: ConnectabilityMatrix | null = null;

export function createConnectabilityMatrix(metadata: NodeMetadata[]): void {
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
): boolean {
  const sourceKey = hashType(sourceType);
  const targetKey = hashType(targetType);
  const cached = connectabilityMatrix?.[sourceKey]?.[targetKey];

  if (cached != null) {
    return cached;
  }

  return isConnectable(sourceType, targetType, true);
}

// `priorityOf` walks every property (or output) of a node, so ranking up front
// costs one scan per node instead of two per comparison.
const sortByPriorityThenTitle = (
  nodes: NodeMetadata[],
  priorityOf: (node: NodeMetadata) => number
): NodeMetadata[] =>
  nodes
    .map((node) => ({ node, priority: priorityOf(node) }))
    .sort(
      (a, b) =>
        a.priority - b.priority || a.node.title.localeCompare(b.node.title)
    )
    .map(({ node }) => node);

/**
 * Calculate match priority for a node based on how well its properties match the input type.
 * Lower numbers = higher priority (better match).
 *
 * Priority levels:
 * - 0: Exact type match (same type and type_name for enums)
 * - 1: Same base type (e.g., enum to enum with different type_name)
 * - 2: Compatible but different type (e.g., enum to str)
 * - 3: Compatible only because the property is `any`
 * - 4: No match (should be filtered out)
 */
const getInputMatchPriority = (
  inputType: TypeMetadata,
  node: NodeMetadata
): number => {
  let bestPriority = 4;

  for (const prop of node.properties) {
    if (!isConnectableCached(inputType, prop.type)) {
      continue;
    }

    // An `any` property accepts everything, so it says nothing about how well
    // the node fits — rank it below every typed match but keep it reachable.
    if (prop.type.type === "any" && inputType.type !== "any") {
      bestPriority = Math.min(bestPriority, 3);
      continue;
    }

    // Exact match: same type and (for enums) same type_name
    if (prop.type.type === inputType.type) {
      if (inputType.type === "enum") {
        if (prop.type.type_name === inputType.type_name) {
          return 0; // Best possible match
        }
        bestPriority = Math.min(bestPriority, 1);
      } else {
        return 0; // Exact type match for non-enums
      }
    } else {
      // Compatible but different type (e.g., enum -> str)
      bestPriority = Math.min(bestPriority, 2);
    }
  }

  return bestPriority;
};

/**
 * Filter node that can be connected to the input type.
 * Results are sorted by match quality: exact matches first, then compatible matches.
 * @param metadata - The metadata to filter.
 * @param inputType - The selected input type.
 * @returns The filtered metadata, sorted by match priority.
 */
export const filterTypesByInputType = (
  metadata: NodeMetadata[],
  inputType: TypeMetadata
): NodeMetadata[] => {
  const filtered = metadata.filter((node) => {
    return node.properties.some((prop) =>
      isConnectableCached(inputType, prop.type)
    );
  });

  return sortByPriorityThenTitle(filtered, (node) =>
    getInputMatchPriority(inputType, node)
  );
};

/**
 * Calculate match priority for a node based on how well its outputs match the output type.
 * Lower numbers = higher priority (better match).
 */
const getOutputMatchPriority = (
  outputType: TypeMetadata,
  node: NodeMetadata
): number => {
  let bestPriority = 4;

  for (const output of node.outputs) {
    if (!isConnectableCached(output.type, outputType)) {
      continue;
    }

    // An `any` output fits every input, so it says nothing about how well the
    // node fits — rank it below every typed match but keep it reachable.
    if (output.type.type === "any" && outputType.type !== "any") {
      bestPriority = Math.min(bestPriority, 3);
      continue;
    }

    // Exact match: same type and (for enums) same type_name
    if (output.type.type === outputType.type) {
      if (outputType.type === "enum") {
        if (output.type.type_name === outputType.type_name) {
          return 0; // Best possible match
        }
        bestPriority = Math.min(bestPriority, 1);
      } else {
        return 0; // Exact type match for non-enums
      }
    } else {
      // Compatible but different type (e.g., str -> enum)
      bestPriority = Math.min(bestPriority, 2);
    }
  }

  return bestPriority;
};

/**
 * Filter node that can be connected to the output type.
 * Results are sorted by match quality: exact matches first, then compatible matches.
 * @param metadata - The metadata to filter.
 * @param outputType - The selected output type.
 * @returns The filtered metadata, sorted by match priority.
 */
export const filterTypesByOutputType = (
  metadata: NodeMetadata[],
  outputType: TypeMetadata
): NodeMetadata[] => {
  if (!outputType) {
    return metadata;
  }

  const filtered = metadata.filter((node) => {
    return node.outputs.some((output) =>
      isConnectableCached(output.type, outputType)
    );
  });

  return sortByPriorityThenTitle(filtered, (node) =>
    getOutputMatchPriority(outputType, node)
  );
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
  const buildTypeMeta = (t: string) => ({
    type: t,
    optional: true,
    type_args: [] as TypeMetadata[],
    type_name: t
  });

  let filtered = metadata;

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
