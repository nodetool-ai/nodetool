/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import Actions from "./Actions";

const jsonStyles = (theme: Theme) =>
  css({
    "&": {
      backgroundColor: "transparent",
      height: "100%",
      width: "100%",
      padding: ".25em",
      overflow: "auto",
      userSelect: "text",
      cursor: "text",
      position: "relative"
    },
    ".json-content": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.vars.fontSizeSmaller,
      lineHeight: 1.4,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      padding: ".5em",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[900],
      color: theme.vars.palette.grey[100]
    },
    ".actions": {
      position: "absolute",
      maxWidth: "50%",
      left: "5.5em",
      bottom: ".1em",
      top: "unset",
      padding: "0",
      margin: "0",
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      zIndex: 10
    },
    ".actions button": {
      minWidth: "unset",
      width: "auto",
      lineHeight: "1.5em",
      padding: ".3em .3em 0 .3em",
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall
    },
    // Prism token styles for JSON
    ".token.property": {
      color: "#9cdcfe"
    },
    ".token.string": {
      color: "#ce9178"
    },
    ".token.number": {
      color: "#b5cea8"
    },
    ".token.boolean": {
      color: "#569cd6"
    },
    ".token.null": {
      color: "#569cd6"
    },
    ".token.punctuation": {
      color: "#d4d4d4"
    },
    ".token.operator": {
      color: "#d4d4d4"
    }
  });

type JSONRendererProps = {
  value: { type: "json"; data: string } | object;
  showActions?: boolean;
};

export const JSONRenderer: React.FC<JSONRendererProps> = ({
  value,
  showActions = true
}) => {
  const theme = useTheme();

  const { formattedJson, rawJson } = useMemo(() => {
    let jsonString: string;

    // Helper to detect byte array represented as object with numeric keys
    // e.g., { "0": 123, "1": 10, "2": 32, ... } - bytes serialized from Python
    const isByteArrayObject = (obj: unknown): obj is Record<string, number> => {
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        return false;
      }
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return false;
      }
      // Check if all keys are numeric strings and all values are numbers 0-255
      return keys.every((key) => {
        const numKey = parseInt(key, 10);
        const val = (obj as Record<string, unknown>)[key];
        return (
          !isNaN(numKey) &&
          numKey >= 0 &&
          typeof val === "number" &&
          val >= 0 &&
          val <= 255
        );
      });
    };

    // Convert byte array object back to string
    const byteArrayObjectToString = (obj: Record<string, number>): string => {
      const keys = Object.keys(obj)
        .map((k) => parseInt(k, 10))
        .sort((a, b) => a - b);
      const bytes = new Uint8Array(keys.map((k) => obj[String(k)]));
      return new TextDecoder().decode(bytes);
    };

    try {
      // Handle { type: "json", data: "..." } format
      if (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        (value as { type: string }).type === "json" &&
        "data" in value
      ) {
        const data = (value as { data: unknown }).data;

        // If data is already a string, try to parse and re-format
        if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data);
            jsonString = JSON.stringify(parsed, null, 2);
          } catch {
            // If parsing fails, use the raw data string
            jsonString = data;
          }
        } else if (isByteArrayObject(data)) {
          // Data is bytes serialized as object with numeric keys - convert back to string
          const decodedString = byteArrayObjectToString(data);
          try {
            const parsed = JSON.parse(decodedString);
            jsonString = JSON.stringify(parsed, null, 2);
          } catch {
            jsonString = decodedString;
          }
        } else if (Array.isArray(data)) {
          // Data might be a byte array as a regular array
          if (data.every((v) => typeof v === "number" && v >= 0 && v <= 255)) {
            const bytes = new Uint8Array(data);
            const decodedString = new TextDecoder().decode(bytes);
            try {
              const parsed = JSON.parse(decodedString);
              jsonString = JSON.stringify(parsed, null, 2);
            } catch {
              jsonString = decodedString;
            }
          } else {
            jsonString = JSON.stringify(data, null, 2) ?? "";
          }
        } else {
          // Data is already an object, stringify it
          jsonString = JSON.stringify(data, null, 2) ?? "";
        }
      } else if (isByteArrayObject(value)) {
        // Plain byte array object - convert to string
        jsonString = byteArrayObjectToString(value);
      } else {
        // It's a plain object, stringify it
        jsonString = JSON.stringify(value, null, 2) ?? "";
      }
    } catch {
      // Fallback for non-serializable objects
      jsonString = String(value);
    }

    // Ensure jsonString is always a string
    if (typeof jsonString !== "string") {
      jsonString = "";
    }

    // Only highlight if we have a valid string and Prism.languages.json is loaded
    let highlighted: string;
    try {
      highlighted =
        jsonString && Prism.languages.json
          ? Prism.highlight(jsonString, Prism.languages.json, "json")
          : jsonString;
    } catch {
      highlighted = jsonString;
    }

    return {
      formattedJson: highlighted,
      rawJson: jsonString
    };
  }, [value]);

  if (!value) {
    return null;
  }

  return (
    <div className="output json-output nodrag" css={jsonStyles(theme)}>
      {showActions && <Actions copyValue={rawJson} />}
      <div
        className="json-content"
        dangerouslySetInnerHTML={{ __html: formattedJson }}
      />
    </div>
  );
};
