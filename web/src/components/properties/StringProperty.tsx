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
    "& .string-action-buttons": {
      position: "absolute",
      right: 0,
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: ".5em",
      opacity: 0,
      backgroundColor: theme.palette.c_gray1,
      borderRadius: "4px",
      padding: 0,
      margin: 0,
      transition: "opacity 0.2s",
      pointerEvents: "none",
      "& .MuiIconButton-root": {
        margin: 0,
        padding: 0
      }
    },
    "& .MuiInputBase-root": {
      width: "calc(100% - .5em)"
    },
    "& .MuiInputBase-input": {
      minHeight: "1.25em"
    },
    "&.string-property:hover .string-action-buttons": {
      opacity: 0.8,
      pointerEvents: "auto"
    }
  });

const StringProperty = ({
  property,
  propertyIndex,
  value,
  onChange,
  tabIndex,
  nodeId,
  nodeType
}: PropertyProps) => {
  const theme = useTheme();
  const id = `textfield-${property.name}-${propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
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
      <div className="string-property" css={styles(theme)}>
        <div style={{ position: "relative", marginBottom: "4px" }}>
          <PropertyLabel
            name={property.name}
            description={property.description}
            id={id}
          />
          <div className="string-action-buttons">
            <Tooltip title="Open Editor" placement="bottom">
              <IconButton
                size="small"
                onClick={toggleExpand}
                // className="nodrag"
                // style={{ padding: "2px" }}
              >
                <OpenInFullIcon sx={{ fontSize: "0.75rem" }} />
              </IconButton>
            </Tooltip>
            <CopyToClipboardButton
              textToCopy={value || ""}
              size="small"
              // style={{ padding: "2px" }}
            />
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <TextField
            value={value || ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange(e.target.value)
            }
            onFocus={(e) => {
              handleFocus(e);
              setIsFocused(true);
            }}
            onBlur={() => setIsFocused(false)}
            className={`nodrag ${isFocused ? "nowheel" : ""}`}
            tabIndex={tabIndex}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            multiline
            rows={1}
            maxRows={4}
            fullWidth
            size="small"
            variant="outlined"
            sx={{
              "& .MuiOutlinedInput-root": {
                padding: "0",
                "& textarea": {
                  padding: "4px 0",
                  resize: "none"
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
                    backgroundColor: "var(--palette-c_gray2)"
                  }
                }
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
    <div className="string-property" css={styles(theme)}>
      <div style={{ position: "relative", marginBottom: "4px" }}>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
        {!isConnected && (
          <div className="string-action-buttons">
            <CopyToClipboardButton textToCopy={value || ""} size="small" />
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
