/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import Editor from "react-simple-code-editor";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import { isEqual } from "lodash";
import Prism from "prismjs";
import "prismjs/components/prism-json";

const styles = (theme: any) =>
  css({
    ".editor": {
      backgroundColor: theme.palette.grey[600],
      border: `1px solid ${theme.palette.grey[500]}`,
      borderRadius: "4px",
      fontSize: "12px",
      minHeight: "100px",
      width: "100%",
      "&:focus-within": {
        borderColor: theme.palette.grey[400]
      }
    },
    ".textarea": {
      outline: "none"
    },
    ".error-line": {
      backgroundColor: "rgba(255, 0, 0, 0.4)",
      width: "100%",
      display: "inline-block"
    },
    ".error-message": {
      color: "red",
      fontSize: "12px",
      marginTop: "4px"
    }
  });

const JSONProperty = (props: PropertyProps) => {
  const id = `json-${props.property.name}-${props.propertyIndex}`;
  const [error, setError] = useState<{ message: string; line: number } | null>(
    null
  );
  const [value, setValue] = useState(props?.value?.data || "");

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
      if (!error) return highlighted;

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
    <div css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Editor
        value={value}
        onValueChange={handleChange}
        onBlur={() => validateJSON(value)}
        highlight={highlightWithErrors}
        padding={10}
        textareaClassName="textarea nodrag"
        className="editor"
        style={{
          fontFamily: "monospace",
          minHeight: "100px"
        }}
      />
      {error && <div className="error-message">{error.message}</div>}
    </div>
  );
};

export default memo(JSONProperty, isEqual);
