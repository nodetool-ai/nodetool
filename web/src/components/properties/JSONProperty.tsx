/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import Editor from "react-simple-code-editor";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import { IconButton, Tooltip } from "@mui/material";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { CopyButton } from "../ui_primitives";
import TextEditorModal from "./TextEditorModal";

const JSONProperty = (props: PropertyProps) => {
  const id = `json-${props.property.name}-${props.propertyIndex}`;
  const [error, setError] = useState<{ message: string; line: number } | null>(
    null
  );
  const [value, setValue] = useState(props?.value?.data || "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new Event("close-text-editor-modal"));
      }
      return next;
    });
  }, []);

  const validateJSON = useCallback(
    (code: string) => {
      try {
        JSON.parse(code);
        setError(null);
        props.onChange({
          type: "json",
          data: code
        });
      } catch (e) {
        const errorMessage = (e as Error).message;
        const lineMatch = errorMessage.match(/line (\d+)/);
        const lineNumber = lineMatch ? parseInt(lineMatch[1]) : 1;

        setError({ message: errorMessage, line: lineNumber });
        props.onChange({
          type: "json",
          data: code
        });
      }
    },
    [props]
  );

  const handleChange = useCallback((code: string) => {
    setValue(code);
  }, []);

  const highlightWithErrors = useCallback(
    (code: string) => {
      const highlighted = Prism.highlight(code, Prism.languages.json, "json");
      if (!error) {
        return highlighted;
      }

      const lines = highlighted.split("\n");
      return lines
        .map((line, i) =>
          i === error.line - 1
            ? `<span class="error-line">${line}</span>`
            : line
        )
        .join("\n");
    },
    [error]
  );

  return (
    <div
      className="json-property"
      css={css({
        ".property-row": {
          display: "flex",
          flexDirection: "column",
          gap: "4px"
        },
        ".value-container": {
          width: "100%",
          position: "relative"
        },
        ".json-action-buttons": {
          position: "absolute",
          right: 0,
          top: "-3px",
          opacity: 0.8,
          zIndex: 10
        },
        ".json-action-buttons .MuiIconButton-root": {
          margin: "0 0 0 5px",
          padding: 0
        },
        ".json-action-buttons .MuiIconButton-root svg": {
          fontSize: "0.75rem"
        },
        ".editor": {
          fontFamily: "monospace",
          fontSize: "var(--fontSizeSmaller)",
          lineHeight: "1.25em",
          minHeight: "100px",
          maxHeight: "200px",
          overflow: "auto !important"
        },
        ".editor textarea": {
          resize: "none",
          padding: "4px 8px 0 8px",
          lineHeight: "18px",
          boxSizing: "content-box"
        },
        ".editor:focus-within": {
          borderColor: "var(--palette-grey-400) !important"
        },
        ".editor-wrapper": {
          minHeight: "100px",
          maxHeight: "200px",
          overflow: "hidden",
          backgroundColor: "var(--palette-grey-600)",
          border: "1px solid var(--palette-grey-500)",
          borderRadius: "4px"
        }
      })}
    >
      <div
        className="property-row"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
        {isHovered && (
          <div className="json-action-buttons">
            <Tooltip title="Open Editor" placement="bottom">
              <IconButton size="small" onClick={toggleExpand} aria-label="Open JSON editor">
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
          <div
            className={`editor-wrapper nodrag ${isFocused ? "nowheel" : ""}`}
          >
            <Editor
              value={value}
              onValueChange={handleChange}
              onBlur={() => {
                validateJSON(value);
                setIsFocused(false);
              }}
              onFocus={() => setIsFocused(true)}
              highlight={highlightWithErrors}
              padding={10}
              textareaClassName={`textarea nodrag ${
                isFocused ? "nowheel" : ""
              }`}
              className="editor"
            />
          </div>
        </div>
        {error && <div className="error-message">{error.message}</div>}
      </div>
      {isExpanded && (
        <TextEditorModal
          value={value || ""}
          language="json"
          onChange={(newValue: string) => {
            setValue(newValue);
            validateJSON(newValue);
          }}
          onClose={toggleExpand}
          propertyName={props.property.name}
          propertyDescription={props.property.description || ""}
        />
      )}
    </div>
  );
};

export default memo(JSONProperty, isEqual);
