/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, memo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "@mui/material";
import { isEqual } from "lodash";

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex
}: PropertyProps) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="string-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <div className="container">
        <input
          type="text"
          id={id}
          name={property.name}
          className="nodrag"
          value={value || ""}
          onChange={handleChange}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          tabIndex={tabIndex}
        />
        <button
          className="expand-button"
          onClick={toggleExpand}
          tabIndex={-1}
          aria-label="Open Editor"
        >
          {isExpanded ? "↙" : "↗"}
        </button>
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
};

export default memo(StringProperty, isEqual);
