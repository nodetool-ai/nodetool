import React from "react";
import { DataType } from "../../config/data_types"; // Corrected import

interface EdgeGradientDefinitionsProps {
  dataTypes: DataType[];
}

const EdgeGradientDefinitions: React.FC<EdgeGradientDefinitionsProps> = ({
  dataTypes
}) => {
  const gradients: JSX.Element[] = [];

  // Gradients for connections
  dataTypes.forEach((sourceType) => {
    dataTypes.forEach((targetType) => {
      if (sourceType.slug === targetType.slug) {
        return; // Skip if types are the same
      }
      gradients.push(
        <linearGradient
          id={`gradient-${sourceType.slug}-${targetType.slug}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
          key={`grad-${sourceType.slug}-${targetType.slug}`}
        >
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
  });

  return (
    <svg style={{ height: 0, width: 0, position: "absolute" }}>
      <defs>{gradients}</defs>
    </svg>
  );
};

export default EdgeGradientDefinitions;
