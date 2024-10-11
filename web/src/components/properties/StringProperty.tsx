import { useState, useCallback } from "react";
import PropertyLabel from "../node/PropertyLabel";
import TextareaAutosize from "react-textarea-autosize";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { Tooltip } from "@mui/material";

export default function StringProperty({
  property,
  propertyIndex,
  value,
  onChange
}: PropertyProps) {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
      <div className="string-property__container">
        <TextareaAutosize
          id={id}
          name={property.name}
          minRows={1}
          maxRows={4}
          className="string-property__textarea nodrag nowheel"
          value={value || ""}
          onChange={handleChange}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        <Tooltip title="Open Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
          <button
            className="string-property__expand-button"
            onClick={toggleExpand}
          >
            {isExpanded ? "↙" : "↗"}
          </button>
        </Tooltip>
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
