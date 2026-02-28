/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useRef, useState, useCallback, memo } from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import isEqual from "lodash/isEqual";
import { IconButton, Tooltip, Typography } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";
import { CopyButton } from "../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { NodeTextField, editorClassNames, cn } from "../editor_ui";

const STRING_INPUT_NODE_TYPE = "nodetool.input.StringInput";

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
        const maxLength =
          typeof maxLengthRaw === "number" && Number.isFinite(maxLengthRaw)
            ? Math.max(0, Math.floor(maxLengthRaw))
            : 0;
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
  const isConstantStringNode = nodeType === "nodetool.constant.String";
  const codeLanguage = determineCodeLanguage(nodeType);
  const isStringInputValue =
    nodeType === STRING_INPUT_NODE_TYPE && property.name === "value";
  const maxLength = isStringInputValue ? (stringInputConfig?.maxLength ?? 0) : 0;
  const multiline =
    isStringInputValue
      ? (stringInputConfig?.lineMode ?? "single_line") === "multiline"
      : true;

  const externalValue = typeof value === "string" ? value : "";
  const [draftValue, setDraftValue] = useState<string>(externalValue);
  const lastExternalValueRef = useRef<string>(externalValue);

  // Keep local draft in sync with store updates only when the user hasn't diverged.
  // This prevents trimming (stored value) from overwriting an over-limit draft on blur.
  useEffect(() => {
    if (!isStringInputValue) {
      return;
    }

    const prevExternal = lastExternalValueRef.current;
    if (externalValue !== prevExternal && draftValue === prevExternal) {
      setDraftValue(externalValue);
    }
    lastExternalValueRef.current = externalValue;
  }, [draftValue, externalValue, isStringInputValue]);

  const exceedsMaxLength =
    isStringInputValue && maxLength > 0 && draftValue.length > maxLength;

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
            flexDirection: "column",
            ...(isConstantStringNode
              ? {
                flex: "1 1 auto",
                minHeight: 0
              }
              : {})
          },
          ".property-row > .property-label": {
            order: 1
          },
          ".value-container": {
            width: "100%",
            order: 2,
            ...(isConstantStringNode
              ? {
                display: "flex",
                flexDirection: "column",
                flex: "1 1 auto",
                minHeight: 0
              }
              : {})
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
                isConstantStringNode
                  ? {
                    height: "100%",
                    "& .MuiInputBase-root": {
                      height: "100%",
                      alignItems: "stretch"
                    },
                    "& .MuiInputBase-inputMultiline": {
                      height: "100% !important",
                      maxHeight: "none !important",
                      overflow: "auto !important"
                    }
                  }
                  : isConstant
                  ? {
                    "& .MuiInputBase-inputMultiline": {
                      // Constant nodes intentionally allow larger editing surface.
                      maxHeight: "300px"
                    }
                  }
                  : undefined
              }
              value={isStringInputValue ? draftValue : (typeof value === "string" ? value : "")}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const raw = e.target.value ?? "";
                if (isStringInputValue) {
                  setDraftValue(raw);
                  onChange(
                    maxLength === 0 ? raw : raw.slice(0, Math.max(0, maxLength))
                  );
                  return;
                }
                onChange(raw);
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
              multiline={multiline}
              minRows={
                multiline
                  ? isStringInputValue
                    ? 4
                    : isConstantStringNode
                      ? 6
                      : 1
                  : 1
              }
              maxRows={
                isConstantStringNode
                  ? 200
                  : isConstant
                    ? 20
                    : multiline
                      ? (isStringInputValue ? 12 : 2)
                      : 1
              }
              slotProps={{
                // Intentionally do NOT set html maxLength for StringInput:
                // allow typing beyond limit, but only propagate up to maxLength.
                htmlInput: isStringInputValue
                  ? undefined
                  : isConstantStringNode
                    ? {
                      style: {
                        maxHeight: "none",
                        overflowY: "auto"
                      }
                    }
                    : undefined
              }}
              autoFocus={false}
              changed={changed}
            />
            {isStringInputValue && maxLength > 0 && (
              <Tooltip
                title={
                  exceedsMaxLength
                    ? `${draftValue.length - maxLength} characters over the limit; extra characters will not be sent.`
                    : "Max length. Extra characters will not be sent."
                }
                placement="bottom"
              >
                <Typography
                  variant="caption"
                  color={exceedsMaxLength ? "warning.main" : "text.secondary"}
                  sx={{ display: "block", marginTop: 0.5, width: "fit-content" }}
                >
                  {draftValue.length}/{maxLength}
                </Typography>
              </Tooltip>
            )}
          </div>
        </div>
        {isExpanded && (
          <TextEditorModal
            value={isStringInputValue ? draftValue : (typeof value === "string" ? value : "")}
            language={codeLanguage}
            onChange={(next) => {
              if (!isStringInputValue) {
                onChange(next);
                return;
              }
              const raw = typeof next === "string" ? next : "";
              setDraftValue(raw);
              onChange(
                maxLength === 0 ? raw : raw.slice(0, Math.max(0, maxLength))
              );
            }}
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
