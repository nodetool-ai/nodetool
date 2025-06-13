/** @jsxImportSource @emotion/react */
import { useState, useCallback, memo, useRef, useMemo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { isEqual } from "lodash";
import { useFocusPan } from "../../hooks/useFocusPan";
import { TextField, IconButton } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { css } from "@emotion/react";

const buttonContainerStyles = css`
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  .string-property:hover & {
    opacity: 1;
  }
`;

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

  const showTextEditor = !isConnected;

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      return !prev;
    });
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  if (showTextEditor) {
    return (
      <div className="string-property">
        <div style={{ position: "relative", marginBottom: "4px" }}>
          <PropertyLabel
            name={property.name}
            description={property.description}
            id={id}
          />
          <div css={buttonContainerStyles}>
            <IconButton
              size="small"
              onClick={toggleExpand}
              className="nodrag"
              style={{ padding: "2px" }}
            >
              <OpenInFullIcon sx={{ fontSize: "0.875rem" }} />
            </IconButton>
            <CopyToClipboardButton
              textToCopy={value || ""}
              size="small"
              style={{ padding: "2px" }}
            />
          </div>
        </div>
        <div style={{ position: "relative" }}>
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
            style={{
              maxHeight: "80px",
              minHeight: "24px",
              height: "24px",
              overflowY: "auto",
              resize: "none"
            }}
            ref={(textarea) => {
              if (textarea) {
                textarea.style.height = "24px";
                const newHeight = Math.min(
                  Math.max(textarea.scrollHeight, 24),
                  80
                );
                textarea.style.height = `${newHeight}px`;
              }
            }}
          />
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
      <div style={{ position: "relative", marginBottom: "4px" }}>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
        {!isConnected && (
          <div css={buttonContainerStyles}>
            <IconButton
              size="small"
              onClick={toggleExpand}
              className="nodrag"
              style={{ padding: "2px" }}
            >
              <OpenInFullIcon sx={{ fontSize: "0.875rem" }} />
            </IconButton>
            <CopyToClipboardButton
              textToCopy={value || ""}
              size="small"
              style={{ padding: "2px" }}
            />
          </div>
        )}
      </div>
      {!isConnected && (
        <div style={{ position: "relative" }}>
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
            style={{ width: "100%", height: "24px" }}
          />
        </div>
      )}
    </div>
  );
};

export default memo(StringProperty, isEqual);
