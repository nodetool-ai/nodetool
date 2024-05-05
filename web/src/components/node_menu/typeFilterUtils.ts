import { NodeMetadata, TypeName } from "../../stores/ApiTypes";
import { devLog, devWarn } from "../../utils/DevLog";
import { isConnectable } from "../../utils/TypeHandler";
import { DATA_TYPES } from "../../config/data_types";

export type ConnectabilityMatrix = Record<TypeName, Record<TypeName, boolean>>;

export const isConnectableLogic = (
  inputType: TypeName,
  outputType: TypeName,
  matrix: ConnectabilityMatrix
): boolean => {
  if (!matrix[inputType] || !matrix[inputType][outputType]) {
    return false;
  }
  return isConnectable({ type: inputType }, { type: outputType });
};

export const connectabilityMatrix: ConnectabilityMatrix =
  createConnectabilityMatrix();

function createConnectabilityMatrix(): ConnectabilityMatrix {
  const typeEnumValues: TypeName[] = DATA_TYPES.map(
    (type) => type.value as TypeName
  );

  const matrix: ConnectabilityMatrix = {};
  typeEnumValues.forEach((inputType) => {
    matrix[inputType] = {};
    typeEnumValues.forEach((outputType) => {
      matrix[inputType][outputType] = false;
    });
  });

  typeEnumValues.forEach((inputType) => {
    typeEnumValues.forEach((outputType) => {
      matrix[inputType][outputType] = isConnectable(
        { type: inputType },
        { type: outputType }
      );
    });
  });

  return matrix;
}

function logMissingConnectabilityTypes() {
  devLog("Checking for missing connectability types...");
  const allTypes: TypeName[] = Object.keys(connectabilityMatrix) as TypeName[];

  allTypes.forEach((inputType: TypeName) => {
    const outputTypes = connectabilityMatrix[inputType];
    allTypes.forEach((outputType: TypeName) => {
      if (outputTypes[outputType] === undefined) {
        devWarn(
          `Connectability missing or undefined for: ${inputType} -> ${outputType}`
        );
      }
    });
  });
}

logMissingConnectabilityTypes();

export const filterDataByType = (
  metadata: NodeMetadata[],
  selectedInputType: TypeName | undefined,
  selectedOutputType: TypeName | undefined
): NodeMetadata[] => {
  const intermediateFilteredData = selectedInputType
    ? metadata.filter((node) => {
        return node.properties.some((prop) => {
          const isInputTypeConnectable =
            connectabilityMatrix[prop.type.type as TypeName]?.[
              selectedInputType
            ];
          return isInputTypeConnectable;
        });
      })
    : metadata;

  const finalFilteredData = selectedOutputType
    ? intermediateFilteredData.filter((node) => {
        return node.outputs.some((output) => {
          const isOutputTypeConnectable =
            connectabilityMatrix[selectedOutputType]?.[
              output.type.type as TypeName
            ];
          return isOutputTypeConnectable;
        });
      })
    : intermediateFilteredData;

  return finalFilteredData.length > 0 ? finalFilteredData : metadata;
};
