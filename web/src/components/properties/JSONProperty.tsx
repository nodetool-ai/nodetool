import { memo, useCallback, useState } from "react";
import Editor from "react-simple-code-editor";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import { IconButton, Tooltip } from "@mui/material";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { CopyToClipboardButton } from "../common/CopyToClipboardButton";
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
    <div className="json-property">
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
