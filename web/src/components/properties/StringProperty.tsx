import { useState, useCallback, memo, useRef, useMemo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { isEqual } from "lodash";
import { useFocusPan } from "../../hooks/useFocusPan";
import { TextField } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId,
  nodeType
}: PropertyProps) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const handleFocus = useFocusPan(nodeId);
  const edges = useNodes((state) => state.edges);
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) => edge.target === nodeId && edge.targetHandle === property.name
    );
  }, [edges, nodeId, property.name]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const showTextEditor =
    !isConnected &&
    (nodeType === "nodetool.constant.String" ||
      (nodeType === "nodetool.input.StringInput" && property.name == "value") ||
      (nodeType === "nodetool.text.FormatText" &&
        property.name === "template") ||
      (nodeType === "nodetool.text.Template" && property.name === "string") ||
      (nodeType === "nodetool.list.MapTemplate" &&
        property.name === "template"));

  if (showTextEditor) {
    return (
      <div className="string-property">
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          className="nodrag nowheel"
          style={{
            width: "100%",
            minHeight: "48px",
            maxHeight: "800px",
            borderRadius: "4px",
            fontSize: "12px"
          }}
          tabIndex={tabIndex}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          ref={(textarea) => {
            if (textarea) {
              textarea.style.height = "auto";
              textarea.style.height = `${textarea.scrollHeight}px`;
            }
          }}
        />
        {isExpanded && (
          <TextEditorModal
            value={value || ""}
            onChange={onChange}
            onClose={toggleExpand}
            propertyName={property.name}
            propertyDescription={property.description || ""}
          />
        )}
      </div>
    );
  }

  return (
    <div className="string-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      {!isConnected && (
        <div className="container">
          <input
            type="text"
            id={id}
            name={property.name}
            className="nodrag"
            value={value || ""}
            onChange={handleChange}
            onFocus={handleFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            tabIndex={tabIndex}
          />
        </div>
      )}
    </div>
  );
};

export default memo(StringProperty, isEqual);
