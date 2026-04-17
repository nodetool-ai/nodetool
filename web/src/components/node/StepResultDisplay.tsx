/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { StepResult } from "../../stores/ApiTypes";
import { CollapsibleSection, Text } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    ".step-result-container": {
      marginBottom: "0.5rem",
      borderRadius: "var(--rounded-xl)",
      backgroundColor: `rgba(40, 45, 50, 0.3)`,
      backdropFilter: "blur(4px)",
      border: `1px solid ${theme.vars.palette.success.main}33`,
      overflow: "hidden",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },

    ".step-result-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem"
    },

    ".step-result-icon": {
      color: theme.vars.palette.success.light,
      fontSize: "1.1rem",
      flexShrink: 0,
      filter: `drop-shadow(0 0 3px ${theme.vars.palette.success.main})`
    },

    ".step-result-title": {
      fontWeight: 700,
      fontSize: "0.8rem",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.vars.palette.success.light,
      flex: 1
    },

    ".step-result-content": {
      padding: "0.5rem 1rem 1rem 1rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}33`
    },

    ".result-value": {
      marginTop: "0.5rem",
      padding: "1rem",
      borderRadius: "var(--rounded-lg)",
      backgroundColor: `rgba(0, 0, 0, 0.4)`,
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      fontSize: "0.8rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[300],
      overflowX: "auto",
      fontFamily: theme.fontFamily2 || "monospace",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },

    ".result-primitive": {
      color: theme.vars.palette.grey[200],
      fontSize: "0.85rem",
      padding: "0.5rem 1rem",
      fontFamily: theme.fontFamily1,
      backgroundColor: `rgba(0, 0, 0, 0.2)`
    },

    ".result-type-label": {
      display: "inline-block",
      fontSize: "0.6rem",
      fontWeight: 700,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      letterSpacing: "1px",
      marginBottom: "0.25rem"
    }
  });

interface StepResultDisplayProps {
  stepResult: StepResult;
}

const StepResultDisplay: React.FC<StepResultDisplayProps> = ({
  stepResult
}) => {
  const theme = useTheme();

  const { displayValue, isPrimitive, resultType } = useMemo(() => {
    const result = stepResult.result;

    // Handle null or undefined
    if (result === null || result === undefined) {
      return {
        displayValue: String(result),
        isPrimitive: true,
        resultType: "null"
      };
    }

    // Handle primitive types
    if (typeof result === "string") {
      return {
        displayValue: result,
        isPrimitive: true,
        resultType: "string"
      };
    }

    if (typeof result === "number") {
      return {
        displayValue: String(result),
        isPrimitive: true,
        resultType: "number"
      };
    }

    if (typeof result === "boolean") {
      return {
        displayValue: String(result),
        isPrimitive: true,
        resultType: "boolean"
      };
    }

    // Handle objects and arrays - format as JSON
    try {
      return {
        displayValue: JSON.stringify(result, null, 2),
        isPrimitive: false,
        resultType: Array.isArray(result) ? "array" : "object"
      };
    } catch {
      // JSON.stringify failed, convert to string
      return {
        displayValue: String(result),
        isPrimitive: true,
        resultType: "unknown"
      };
    }
  }, [stepResult.result]);

  // For primitive types, show inline without expand
  if (isPrimitive && displayValue.length < 100) {
    return (
      <div className="step-result-container" css={styles(theme)}>
        <div className="step-result-header">
          <CheckCircleOutlineIcon className="step-result-icon" />
          <Text className="step-result-title">
            Step Completed
          </Text>
        </div>
        <div className="result-primitive">
          <Text className="result-type-label">{resultType}</Text>
          <div>{displayValue}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="step-result-container" css={styles(theme)}>
      <CollapsibleSection
        defaultOpen={false}
        title={
          <div className="step-result-header">
            <CheckCircleOutlineIcon className="step-result-icon" />
            <Text className="step-result-title">
              Step Completed
            </Text>
          </div>
        }
        compact
      >
        <div className="step-result-content">
          <Text className="result-type-label">{resultType}</Text>
          <pre className="result-value">{displayValue}</pre>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default React.memo(StepResultDisplay);
