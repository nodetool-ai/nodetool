import { useState, useCallback, memo, useRef } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { isEqual } from "lodash";
import { useFocusPan } from "../../hooks/useFocusPan";

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId
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

  return (
    <div className="string-property">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
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
