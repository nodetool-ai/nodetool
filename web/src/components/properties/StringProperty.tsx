/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, memo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import isEqual from "lodash/isEqual";
import { IconButton, Tooltip } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";
import { CopyButton } from "../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { NodeTextField, editorClassNames, cn } from "../editor_ui";

const STRING_INPUT_NODE_TYPE = "nodetool.input.StringInput";
const DEFAULT_STRING_INPUT_MAX_LENGTH = 100000;

const determineCodeLanguage = (nodeType: string) => {
  if (nodeType === "nodetool.code.ExecutePython") {
    return "python";
  }
  if (nodeType === "nodetool.code.ExecuteJavaScript") {
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

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId,
  nodeType,
  isDynamicProperty,
  changed
}: PropertyProps) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // const focusHandler = useFocusPan(nodeId);
  // const handleFocus = isInspector ? () => {} : focusHandler;
  const { isConnected, stringInputConfig } = useNodes(
    useCallback(
      (state) => {
        const connected = state.edges.some(
          (edge) =>
            edge.target === nodeId && edge.targetHandle === property.name
        );

        if (nodeType !== STRING_INPUT_NODE_TYPE || property.name !== "value") {
          return { isConnected: connected, stringInputConfig: null };
        }

        const node = state.findNode(nodeId);
        const props = (node?.data as any)?.properties ?? {};
        const maxLengthRaw = props?.max_length;
        const maxLength = (() => {
          if (maxLengthRaw === 0) {
            return 0;
          }
          if (typeof maxLengthRaw === "number" && Number.isFinite(maxLengthRaw)) {
            return Math.max(0, Math.floor(maxLengthRaw));
          }
          return DEFAULT_STRING_INPUT_MAX_LENGTH;
        })();
        const lineMode =
          props?.line_mode === "multiline" || props?.multiline === true
            ? "multiline"
            : "single_line";

        return {
          isConnected: connected,
          stringInputConfig: { maxLength, lineMode } as const
        };
      },
      [nodeId, nodeType, property.name]
    )
  );

  const showTextEditor = !isConnected;
  const isConstant = nodeType.startsWith("nodetool.constant.");
  const codeLanguage = determineCodeLanguage(nodeType);
  const isStringInputValue =
    nodeType === STRING_INPUT_NODE_TYPE && property.name === "value";
  const maxLength = isStringInputValue ? (stringInputConfig?.maxLength ?? 0) : 0;
  const multiline =
    isStringInputValue
      ? (stringInputConfig?.lineMode ?? "single_line") === "multiline"
      : true;

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
      <div
        className={`string-property ${isConstant ? "constant-node" : ""}`}
        css={css({
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
        })}
      >
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
              sx={
                isConstant
                  ? {
                    "& .MuiInputBase-inputMultiline": {
                      // Constant nodes intentionally allow larger editing surface.
                      maxHeight: "300px"
                    }
                  }
                  : undefined
              }
              value={value || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                {
                  const raw = e.target.value ?? "";
                  const next =
                    isStringInputValue && maxLength > 0
                      ? raw.slice(0, maxLength)
                      : raw;
                  onChange(next);
                }
              }
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
              multiline={multiline}
              minRows={multiline ? (isStringInputValue ? 4 : 1) : 1}
              maxRows={
                isConstant ? 20 : multiline ? (isStringInputValue ? 12 : 2) : 1
              }
              slotProps={{
                htmlInput:
                  isStringInputValue && maxLength > 0
                    ? { maxLength }
                    : undefined
              }}
              autoFocus={false}
              changed={changed}
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
    <div
      className={`string-property ${isConstant ? "constant-node" : ""}`}
      css={css({
        ".property-row": {
          width: "100%",
          display: "flex",
          flexDirection: "column"
        }
      })}
    >
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
