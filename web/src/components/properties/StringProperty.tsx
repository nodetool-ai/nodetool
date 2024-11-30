/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, memo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { Tooltip } from "@mui/material";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css({
    ".container": {
      display: "flex",
      gap: "8px",
      alignItems: "center"
    },
    input: {
      flex: 1,
      padding: "8px",
      border: `1px solid ${theme.palette.c_gray3}`,
      borderRadius: "4px",
      color: theme.palette.text.primary,
      "&:focus": {
        borderColor: theme.palette.c_hl,
        boxShadow: `0 0 0 2px ${theme.palette.c_hl}25`
      }
    },
    ".expand-button": {
      padding: "6px",
      minWidth: "18px",
      height: "18px",
      border: `1px solid ${theme.palette.c_gray3}`,
      borderRadius: "5px",
      fontSize: "8px",
      fontWeight: 600,
      backgroundColor: "transparent",
      color: theme.palette.text.secondary,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.palette.action.hover,
        borderColor: theme.palette.c_hl,
        color: theme.palette.text.primary
      }
    }
  });

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange
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
    <div className="string-property" css={styles}>
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
        />
        <Tooltip title="Open Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
          <button className="expand-button" onClick={toggleExpand}>
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
};

export default memo(StringProperty, isEqual);
