import { useState, useCallback, memo, useRef } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { isEqual } from "lodash";
import { useFocusPan } from "../../hooks/useFocusPan";
import { TextField } from "@mui/material";

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId,
  isConnected,
  nodeType
}: PropertyProps) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFocus = useFocusPan(nodeId);

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
    nodeType === "nodetool.constant.String" ||
    nodeType === "nodetool.input.StringInput";

  if (showTextEditor) {
    return (
      <div className="string-property">
        {!isConnected && (
          <textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            className="nodrag"
            rows={2}
            style={{ width: "100%", minHeight: "48px", maxHeight: "160px" }}
            tabIndex={tabIndex}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        )}
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
        <>
          <div className="container">
            <input
              ref={inputRef}
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
        </>
      )}
    </div>
  );
};

export default memo(StringProperty, isEqual);
