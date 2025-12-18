/** @jsxImportSource @emotion/react */
import React, { useState, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box, Collapse, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { StepResult } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    ".step-result-container": {
      marginBottom: "0.5rem",
      borderRadius: "12px",
      backgroundColor: `rgba(40, 45, 50, 0.3)`,
      backdropFilter: "blur(4px)",
      border: `1px solid ${theme.vars.palette.success.main}33`,
      overflow: "hidden",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },

    ".step-result-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.75rem 1rem",
      cursor: "pointer",
      userSelect: "none",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: `rgba(50, 60, 70, 0.4)`
      }
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

    ".expand-button": {
      padding: "4px",
      transition: "transform 0.3s ease",
      color: theme.vars.palette.grey[400],
      "&.expanded": {
        transform: "rotate(180deg)"
      }
    },

    ".step-result-content": {
      padding: "0.5rem 1rem 1rem 1rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}33`
    },

    ".result-value": {
      marginTop: "0.5rem",
      padding: "1rem",
      borderRadius: "8px",
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
  const [expanded, setExpanded] = useState(false);

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
    } catch (error) {
      return {
        displayValue: String(result),
        isPrimitive: true,
        resultType: "unknown"
      };
    }
  }, [stepResult.result]);

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  // For primitive types, show inline without expand
  if (isPrimitive && displayValue.length < 100) {
    return (
      <div className="step-result-container" css={styles(theme)}>
        <div className="step-result-header">
          <CheckCircleOutlineIcon className="step-result-icon" />
          <Typography className="step-result-title">
            Step Completed
          </Typography>
        </div>
        <div className="result-primitive">
          <Typography className="result-type-label">{resultType}</Typography>
          <div>{displayValue}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="step-result-container" css={styles(theme)}>
      <div className="step-result-header" onClick={handleToggle}>
        <CheckCircleOutlineIcon className="step-result-icon" />
        <Typography className="step-result-title">
          Step Completed
        </Typography>
        <IconButton
          size="small"
          className={`expand-button ${expanded ? "expanded" : ""}`}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </div>
      <Collapse in={expanded}>
        <div className="step-result-content">
          <Typography className="result-type-label">{resultType}</Typography>
          <pre className="result-value">{displayValue}</pre>
        </div>
      </Collapse>
    </div>
  );
};

export default React.memo(StepResultDisplay);
