import React, { memo, useMemo } from "react";
import { DataType } from "../../config/data_types";

interface EdgeGradientDefinitionsProps {
  dataTypes: DataType[];
  activeGradientKeys: string[];
}

const SVG_STYLE: React.CSSProperties = { height: 0, width: 0, position: "absolute" };

const EdgeGradientDefinitions: React.FC<EdgeGradientDefinitionsProps> = ({
  dataTypes,
  activeGradientKeys
}) => {
  const dataTypeBySlug = useMemo(
    () => new Map(dataTypes.map((dt) => [dt.slug, dt])),
    [dataTypes]
  );

  const gradients = useMemo(() => {
    const elements: React.JSX.Element[] = [];

    activeGradientKeys.forEach((key) => {
      const parts = key.replace("gradient-", "").split("-");
      if (parts.length !== 2) {return;}

      const sourceType = dataTypeBySlug.get(parts[0]);
      const targetType = dataTypeBySlug.get(parts[1]);

      if (!sourceType || !targetType) {return;}

      elements.push(
        <linearGradient id={key} x1="0%" y1="0%" x2="100%" y2="0%" key={key}>
          <stop offset="0%" stopColor={sourceType.color} stopOpacity={1} />
          <stop offset="100%" stopColor={targetType.color} stopOpacity={1} />
        </linearGradient>
      );
    });

    return elements;
  }, [activeGradientKeys, dataTypeBySlug]);

  return (
    <svg style={SVG_STYLE}>
      <defs>{gradients}</defs>
    </svg>
  );
};

EdgeGradientDefinitions.displayName = "EdgeGradientDefinitions";

export default memo(EdgeGradientDefinitions, (prev, next) => {
  if (prev.dataTypes !== next.dataTypes) return false;
  if (prev.activeGradientKeys.length !== next.activeGradientKeys.length) return false;
  for (let i = 0; i < prev.activeGradientKeys.length; i++) {
    if (prev.activeGradientKeys[i] !== next.activeGradientKeys[i]) return false;
  }
  return true;
});
