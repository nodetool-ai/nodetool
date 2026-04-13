/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, memo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import isEqual from "fast-deep-equal";
import { useNodes } from "../../contexts/NodeContext";
import { CopyButton, Tooltip, ToolbarIconButton } from "../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { NodeTextField, editorClassNames, cn } from "../editor_ui";
import { useIsConnectedSelector } from "../../hooks/nodes/useIsConnected";
import ConnectedBadge from "./ConnectedBadge";

const determineCodeLanguage = (nodeType: string) => {
  if (nodeType === "nodetool.code.ExecutePython") {
    return "python";
  }
  if (
    nodeType === "nodetool.code.ExecuteJavaScript" ||
    nodeType === "nodetool.code.Code"
  ) {
    return "javascript";
  }
  if (nodeType === "nodetool.code.ExecuteBash") {
    return "bash";
  }
  if (nodeType === "nodetool.code.ExecuteRuby") {
    return "ruby";
  }
  if (
    nodeType === "nodetool.code.ExecuteLua" ||
    nodeType === "nodetool.code.EvaluateExpression"
  ) {
    return "lua";
  }
  return "text";
};

const propertyStyles = css({
  "--property-reset-button-offset": "64px",
  ".property-row": {
    width: "100%",
    display: "flex",
    flexDirection: "column"
  },
  ".property-row > .property-label": {
    order: 1
  },
  ".value-container": {
    width: "100%",
    order: 2
  },
  ".string-action-buttons": {
    position: "absolute",
    right: 0,
    top: "-3px",
    opacity: 0.8,
    zIndex: 10
  },
  ".string-action-buttons .MuiIconButton-root": {
    margin: "0 0 0 5px",
    padding: 0
  },
  ".string-action-buttons .MuiIconButton-root svg": {
    fontSize: "0.75rem"
  }
});

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId,
  nodeType,
  isDynamicProperty
}: PropertyProps) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isConnectedSelector = useIsConnectedSelector(nodeId, property.name);
  const isConnected = useNodes(isConnectedSelector);

  const codeLanguage = determineCodeLanguage(nodeType);
  const stringValue = typeof value === "string" ? value : "";

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return next;
    });
  }, []);

  if (isConnected) {
    return (
      <div className="string-property connected">
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
        <ConnectedBadge />
      </div>
    );
  }

  return (
    <div className="string-property" css={propertyStyles}>
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
            <ToolbarIconButton tooltip="Open Editor" icon={<OpenInFullIcon />} onClick={toggleExpand} size="small" />
            <CopyButton value={value} buttonSize="small" />
          </div>
        )}
        <div
          className="value-container"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <NodeTextField
            className={cn(
              "string-value-input",
              isFocused && editorClassNames.nowheel
            )}
            value={stringValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              onChange(e.target.value ?? "");
            }}
            onFocus={(e) => {
              e.preventDefault();
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
            multiline
            minRows={3}
            maxRows={3}
            autoFocus={false}
          />
        </div>
      </div>
      {isExpanded && (
        <TextEditorModal
          value={stringValue}
          language={codeLanguage}
          onChange={(next) => onChange(next)}
          onClose={toggleExpand}
          propertyName={property.name}
          propertyDescription={property.description || ""}
        />
      )}
    </div>
  );
};

export default memo(StringProperty, isEqual);
