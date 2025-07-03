/** @jsxImportSource @emotion/react */
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
import { css, useTheme } from "@emotion/react";

const styles = (theme: any) =>
  css({
    ".property-row": {
      // display: "flex",
      // alignItems: "center",
      // gap: "0.5em",
      // position: "relative",
      width: "100%"
    },
    ".value-container": {
      width: "100%"
      // flex: "1 1 auto",
      // minWidth: 0
    },
    "& .string-value-input": {
      fontSize: theme.fontSizeSmaller,
    },
    "& .string-action-buttons": {
      position: "absolute",
      right: "0",
      top: "-3px",
      opacity: 0.8,
      "& .MuiIconButton-root": {
        margin: "0 0 0 5px",
        padding: 0
      },
      "& .MuiIconButton-root svg": {
        fontSize: "0.75rem"
      }
    },

    "& .string-value-display": {
      // minHeight: "1.5em",
      padding: "0",
      lineHeight: "1em",
      cursor: "pointer",
      borderRadius: "4px",
      border: "1px solid transparent",
      backgroundColor: "transparent",
      transition: "all 0.2s ease",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.text.primary,
      fontFamily: "inherit",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "none",
      "&:hover": {
        backgroundColor: theme.palette.grey[600],
        border: "1px solid " + theme.palette.grey[500]
      },
      "&.empty": {
        color: theme.palette.text.secondary,
        fontStyle: "italic"
      }
    },

    "& .MuiOutlinedInput-root": {
      padding: "0",
      "& textarea": {
        resize: "none",
        minHeight: "1.25em",
        padding: "0.25em 0.5em",
        lineHeight: "1.25em",
        border: "1px solid var(--palette-grey-600)"
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderWidth: "0"
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderWidth: "0"
      },
      "&.Mui-hover .MuiOutlinedInput-notchedOutline": {
        borderWidth: "0"
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderWidth: "0"
      },
      "&.Mui-focused": {
        "& .MuiOutlinedInput-input": {
          backgroundColor: "var(--palette-grey-600)"
        }
      }
    },
    "& .MuiTextField-root": {
      marginTop: "-5px",
      padding: "0",
      width: "100%"
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
  isInspector
}: PropertyProps) => {
  const theme = useTheme();
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const focusHandler = useFocusPan(nodeId);
  const handleFocus = isInspector ? () => {} : focusHandler;
  const edges = useNodes((state) => state.edges);
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) => edge.target === nodeId && edge.targetHandle === property.name
    );
  }, [edges, nodeId, property.name]);

  const showTextEditor = !isConnected;

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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const startEditing = useCallback(() => {
    if (!isConnected) {
      setIsEditing(true);
    }
  }, [isConnected]);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        stopEditing();
      } else if (e.key === "Escape") {
        stopEditing();
      }
    },
    [stopEditing]
  );

  if (showTextEditor) {
    return (
      <div className="string-property" css={styles(theme)}>
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
          {isHovered && (
            <div className="string-action-buttons">
              <Tooltip title="Open Editor" placement="bottom">
                <IconButton size="small" onClick={toggleExpand}>
                  <OpenInFullIcon />
                </IconButton>
              </Tooltip>
              <CopyToClipboardButton textToCopy={value || ""} size="small" />
            </div>
          )}
          <div className="value-container">
            <TextField
              className={`string-value-input ${isFocused ? "nowheel" : ""}`}
              value={value || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange(e.target.value)
              }
              onFocus={(e) => {
                handleFocus(e);
                setIsFocused(true);
              }}
              onBlur={() => {
                setIsFocused(false);
                stopEditing();
              }}
              onKeyDown={handleKeyDown}
              tabIndex={tabIndex}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              multiline
              minRows={1}
              maxRows={2}
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
    <div className="string-property" css={styles(theme)}>
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
