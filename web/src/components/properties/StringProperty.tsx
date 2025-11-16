import { useState, useCallback, memo, useRef, useMemo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { isEqual } from "lodash";
import { useFocusPan } from "../../hooks/useFocusPan";
import { TextField, IconButton, Tooltip } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";

const determineCodeLanguage = (nodeType: string) => {
  if (nodeType == "nodetool.code.ExecutePython") {
    return "python";
  }
  if (nodeType == "nodetool.code.ExecuteJavaScript") {
    return "javascript";
  }
  if (nodeType == "nodetool.code.ExecuteBash") {
    return "bash";
  }
  if (nodeType == "nodetool.code.ExecuteRuby") {
    return "ruby";
  }
  if (
    nodeType == "nodetool.code.ExecuteLua" ||
    nodeType == "nodetool.code.EvaluateExpression"
  ) {
    return "lua";
  }
  return "text";
};

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId,
  nodeType,
  isInspector,
  isDynamicProperty
}: PropertyProps) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // const focusHandler = useFocusPan(nodeId);
  // const handleFocus = isInspector ? () => {} : focusHandler;
  const edges = useNodes((state) => state.edges);
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) => edge.target === nodeId && edge.targetHandle === property.name
    );
  }, [edges, nodeId, property.name]);

  const showTextEditor = !isConnected;
  const isConstant = nodeType.startsWith("nodetool.constant.");
  const codeLanguage = determineCodeLanguage(nodeType);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        // Notify all other modals to close themselves
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return next;
    });
  }, []);

  if (showTextEditor) {
    return (
      <div className={`string-property ${isConstant ? "constant-node" : ""}`}>
        <div
          className="property-row"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <PropertyLabel
            name={property.name}
            description={property.description}
            id={id}
            isDynamicProperty={isDynamicProperty}
          />
          {isHovered && (
            <div className="string-action-buttons">
              <Tooltip title="Open Editor" placement="bottom">
                <IconButton size="small" onClick={toggleExpand}>
                  <OpenInFullIcon />
                </IconButton>
              </Tooltip>
              <CopyToClipboardButton copyValue={value} size="small" />
            </div>
          )}
          <div 
            className="value-container"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <TextField
              className={`string-value-input nodrag ${isFocused ? "nowheel" : ""}`}
              value={value || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(e.target.value)
              }
              onFocus={(e) => {
                // handleFocus(e);
                setIsFocused(true);
              }}
              onBlur={() => {
                setIsFocused(false);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              tabIndex={tabIndex}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              multiline
              minRows={1}
              maxRows={isConstant ? 20 : 2}
              fullWidth
              size="small"
              variant="outlined"
              autoFocus
            />
          </div>
        </div>
        {isExpanded && (
          <TextEditorModal
            value={value || ""}
            language={codeLanguage}
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
    <div className={`string-property ${isConstant ? "constant-node" : ""}`}>
      <div
        className="property-row"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
      </div>
    </div>
  );
};

export default memo(StringProperty, isEqual);
