import { useState, useCallback, memo, useRef, useMemo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { isEqual } from "lodash";
import { useFocusPan } from "../../hooks/useFocusPan";
import { TextField } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";

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
      <div
        className="string-property"
        style={{ padding: 0, position: "relative" }}
      >
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          className="nodrag nowheel"
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
        <div style={{ position: "absolute", top: "1px", right: "3px" }}>
          <CopyToClipboardButton textToCopy={value || ""} size="small" />
        </div>
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
        <div className="container" style={{ position: "relative" }}>
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
            style={{ width: "100%", paddingRight: "1em" }}
          />
          <div
            style={{
              position: "absolute",
              right: "-.2em",
              top: "0.04em"
            }}
          >
            <CopyToClipboardButton textToCopy={value || ""} size="small" />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(StringProperty, isEqual);
