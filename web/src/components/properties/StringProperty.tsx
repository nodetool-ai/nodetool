/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  useState,
  useCallback,
  memo,
  useMemo,
  useRef,
  useLayoutEffect
} from "react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import isEqual from "../../utils/isEqual";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { CopyButton, ToolbarIconButton, SPACING, Z_INDEX } from "../ui_primitives";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import {
  NodeTextField,
  NodeTextPreview,
  editorClassNames,
  cn
} from "../editor_ui";
import { useIsConnectedSelector } from "../../hooks/nodes/useIsConnected";
import ConnectedBadge from "./ConnectedBadge";
import { useInspectorHeaderSupplementalRegistration } from "../../hooks/useInspectorHeaderSupplemental";
import { getCodeNodeLanguage } from "../node/codeNodeUi";
import { isString } from "../../utils/typePredicates";

const propertyStyles = (theme: Theme) =>
  css({
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
      opacity: 0,
      zIndex: Z_INDEX.dropdown
    },
    ".property-row:hover .string-action-buttons, .property-row:focus-within .string-action-buttons": {
      opacity: 0.8
    },
    ".string-action-buttons .MuiIconButton-root": {
      margin: `0 0 0 ${theme.spacing(SPACING.sm)}`,
      padding: 0
    },
    ".string-action-buttons .MuiIconButton-root svg": {
      fontSize: "var(--fontSizeSmall)"
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
  isDynamicProperty,
  isInspector,
  onPropertyContextMenu
}: PropertyProps<string>) => {
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // On the canvas the field is a static preview until clicked, so it never
  // catches a pan or a zoom. The Inspector always shows the text field.
  const [isEditing, setIsEditing] = useState(false);
  const caretRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isConnectedSelector = useIsConnectedSelector(nodeId, property.name);
  const isConnected = useNodes(isConnectedSelector);
  const theme = useTheme();
  const inspectorToolbarActionSx = useMemo(
    () => ({
      color: theme.vars.palette.common.white,
      "& svg": { fontSize: "var(--fontSizeNormal)" }
    }),
    [theme]
  );

  // Dynamic inputs on the canvas (Concat, prompt variables) stack several
  // rows; start each at one line and grow with the text.
  const compactRows = isDynamicProperty === true && isInspector !== true;
  const codeLanguage = getCodeNodeLanguage(nodeType);
  const stringValue = isString(value) ? value : "";

  const startEditing = useCallback((caretOffset: number | null) => {
    caretRef.current = caretOffset;
    setIsEditing(true);
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!isEditing || !input) {
      return;
    }
    const caret = caretRef.current ?? input.value.length;
    input.focus();
    input.setSelectionRange(caret, caret);
  }, [isEditing]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return next;
    });
  }, []);

  const editorActions = useMemo(
    () => (
      <>
        <ToolbarIconButton
          className="inspector-supplemental-action"
          tooltip="Open Editor"
          icon={<OpenInFullIcon />}
          onClick={toggleExpand}
          size="small"
          sx={inspectorToolbarActionSx}
        />
        <CopyButton
          className="inspector-supplemental-action"
          value={value}
          buttonSize="small"
          sx={inspectorToolbarActionSx}
        />
      </>
    ),
    [inspectorToolbarActionSx, toggleExpand, value]
  );

  useInspectorHeaderSupplementalRegistration(
    editorActions,
    isInspector === true
  );

  if (isConnected) {
    return (
      <div className="string-property connected">
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
          isDynamicProperty={isDynamicProperty}
        />
        <ConnectedBadge />
      </div>
    );
  }

  return (
    <div className="string-property" css={propertyStyles(theme)}>
      <div className="property-row">
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
          isDynamicProperty={isDynamicProperty}
        />
        {!isInspector ? (
          <div className="string-action-buttons">
            <ToolbarIconButton
              tooltip="Open Editor"
              icon={<OpenInFullIcon />}
              onClick={toggleExpand}
              size="small"
            />
            <CopyButton value={value} buttonSize="small" />
          </div>
        ) : null}
        {isInspector || isEditing ? (
          <div
            className="value-container"
            onContextMenuCapture={onPropertyContextMenu}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <NodeTextField
              className={cn(
                "string-value-input",
                isFocused && editorClassNames.nowheel
              )}
              inputRef={inputRef}
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
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  inputRef.current?.blur();
                }
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              tabIndex={tabIndex}
              multiline
              minRows={compactRows ? 1 : 3}
              maxRows={compactRows ? 4 : 3}
              autoFocus={false}
            />
          </div>
        ) : (
          <div
            className="value-container"
            onContextMenuCapture={onPropertyContextMenu}
          >
            <NodeTextPreview
              className="string-value-input"
              value={stringValue}
              onActivate={startEditing}
              ariaLabel={`Edit ${property.name}`}
              tabIndex={tabIndex}
              minRows={compactRows ? 1 : 3}
              maxRows={compactRows ? 4 : 3}
            />
          </div>
        )}
      </div>
      {isExpanded && (
        <TextEditorModal
          value={stringValue}
          language={codeLanguage}
          nodeType={nodeType}
          propertyType={property.type?.type}
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
