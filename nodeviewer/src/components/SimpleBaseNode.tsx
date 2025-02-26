/**
 * SimpleBaseNode renders a single node in the workflow without interactive functionality
 */
import React, { useMemo } from "react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { NodeMetadata } from "../stores/SimpleNodeStore";
import { NodeData } from "../stores/NodeData";
import { colorForType } from "../utils/ColorUtils";

// CSS styles for the component are now in simple-nodes.css

// Helper function to darken a hex color
const darkenHexColor = (hex: string, percent: number): string => {
  // Remove the # if present
  hex = hex.replace("#", "");

  // Parse the hex color
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Darken the color
  const darkenAmount = percent / 100;
  const dr = Math.floor(r * (1 - darkenAmount));
  const dg = Math.floor(g * (1 - darkenAmount));
  const db = Math.floor(b * (1 - darkenAmount));

  // Convert back to hex
  return `#${dr.toString(16).padStart(2, "0")}${dg
    .toString(16)
    .padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
};

// Helper function to simulate opacity
const simulateOpacity = (
  hex: string,
  opacity: number,
  bgHex: string
): string => {
  // Remove the # if present
  hex = hex.replace("#", "");
  bgHex = bgHex.replace("#", "");

  // Parse the hex colors
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const bgR = parseInt(bgHex.substring(0, 2), 16);
  const bgG = parseInt(bgHex.substring(2, 4), 16);
  const bgB = parseInt(bgHex.substring(4, 6), 16);

  // Blend the colors
  const blendR = Math.floor(r * opacity + bgR * (1 - opacity));
  const blendG = Math.floor(g * opacity + bgG * (1 - opacity));
  const blendB = Math.floor(b * opacity + bgB * (1 - opacity));

  // Convert back to hex
  return `#${blendR.toString(16).padStart(2, "0")}${blendG
    .toString(16)
    .padStart(2, "0")}${blendB.toString(16).padStart(2, "0")}`;
};

interface SimpleBaseNodeProps extends NodeProps<Node<NodeData>> {
  metadata: NodeMetadata;
}
const getHeaderFooterColors = (metadata: NodeMetadata) => {
  const firstOutputColor = metadata?.outputs?.[0]?.type?.type;
  return {
    headerColor: firstOutputColor
      ? darkenHexColor(
          simulateOpacity(colorForType(firstOutputColor), 0.5, "#2b2e31"),
          20
        )
      : "",
    footerColor: firstOutputColor
      ? darkenHexColor(
          simulateOpacity(colorForType(firstOutputColor), 0.25, "#2b2e31"),
          100
        )
      : "",
  };
};

const valueToString = (value: any) => {
  if (typeof value === "object" && value !== null) {
    if ("name" in value) {
      return value.name;
    }
    if ("title" in value) {
      return value.title;
    }
    if ("description" in value) {
      return value.description;
    }
    if ("type" in value) {
      return value.type;
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return value?.toString() || "";
};

const SimpleBaseNode: React.FC<SimpleBaseNodeProps> = ({
  type,
  data,
  metadata,
}) => {
  // Get header and footer colors
  const { headerColor, footerColor } = useMemo(() => {
    return getHeaderFooterColors(metadata);
  }, [metadata]);

  const properties = (metadata?.properties || []).filter((property) =>
    metadata?.basic_fields?.includes(property.name)
  );

  return (
    <div className="simple-node">
      {/* Node Header */}
      <div
        className="node-header"
        style={{ "--header-bg-color": headerColor } as React.CSSProperties}
      >
        <div className="node-title">{metadata?.title || type}</div>
      </div>

      {/* Node Content */}
      <div className="node-content">
        {/* Properties */}
        {properties.map((property) => (
          <div key={property.name} className="node-property">
            <div className="property-label">{property.name}</div>
            <div className="property-value">
              {valueToString(data.properties[property.name]) || ""}
            </div>

            {/* Input Handle */}
            <Handle
              type="target"
              position={Position.Left}
              id={property.name}
              className="input-handle"
              style={
                {
                  background: colorForType(property.type.type),
                } as React.CSSProperties
              }
            />
          </div>
        ))}
      </div>

      {/* Additional Outputs Section */}
      {metadata?.outputs?.filter(
        (output) => !properties.some((prop) => prop.name === output.name)
      ).length > 0 && (
        <div className="additional-outputs">
          {metadata?.outputs
            ?.filter(
              (output) => !properties.some((prop) => prop.name === output.name)
            )
            .map((output, index) => (
              <div key={output.name} className="node-output">
                <div className="output-label">{output.name}</div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.name}
                  className="output-handle"
                  style={
                    {
                      background: colorForType(output.type.type),
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
        </div>
      )}

      {/* Node Footer */}
      <div
        className="node-footer"
        style={{ "--footer-bg-color": footerColor } as React.CSSProperties}
      >
        {metadata?.namespace || "unknown"}
      </div>
    </div>
  );
};

export default SimpleBaseNode;
