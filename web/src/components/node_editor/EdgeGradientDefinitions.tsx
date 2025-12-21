import React from "react";
import { DataType } from "../../config/data_types";

interface EdgeGradientDefinitionsProps {
  dataTypes: DataType[];
  activeGradientKeys: string[]; // Changed from all dataTypes to specific keys
}

const EdgeGradientDefinitions: React.FC<EdgeGradientDefinitionsProps> = ({
  dataTypes,
  activeGradientKeys
}) => {
  const gradients: JSX.Element[] = [];

  activeGradientKeys.forEach((key) => {
    // key is like "gradient-slug1-slug2"
    const parts = key.replace("gradient-", "").split("-");
    if (parts.length !== 2) {return;} // Should not happen with correct keys

    const slug1 = parts[0];
    const slug2 = parts[1];

    const sourceType = dataTypes.find((dt) => dt.slug === slug1);
    const targetType = dataTypes.find((dt) => dt.slug === slug2);

    if (!sourceType || !targetType) {return;} // Should find types if slugs are valid

    gradients.push(
      <linearGradient id={key} x1="0%" y1="0%" x2="100%" y2="0%" key={key}>
        <stop
          offset="0%"
          style={{ stopColor: sourceType.color, stopOpacity: 1 }}
        />
        <stop
          offset="100%"
          style={{ stopColor: targetType.color, stopOpacity: 1 }}
        />
      </linearGradient>
    );
  });

  return (
    <svg style={{ height: 0, width: 0, position: "absolute" }}>
      <defs>{gradients}</defs>
    </svg>
  );
};

export default EdgeGradientDefinitions;
