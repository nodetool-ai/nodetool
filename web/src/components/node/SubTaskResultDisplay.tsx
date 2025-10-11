/** @jsxImportSource @emotion/react */
import React, { useState, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Typography, Box, Collapse, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { SubTaskResult } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    ".subtask-result-container": {
      marginBottom: "0.75rem",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.success.dark}`,
      overflow: "hidden",
      transition: "all 0.2s ease"
    },

    ".subtask-result-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.875rem 1rem",
      cursor: "pointer",
      userSelect: "none",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
      }
    },

    ".subtask-result-icon": {
      color: theme.vars.palette.success.main,
      fontSize: "1.25rem",
      flexShrink: 0
    },

    ".subtask-result-title": {
      fontWeight: 600,
      fontSize: "0.875rem",
      color: theme.vars.palette.success.light,
      flex: 1
    },

    ".expand-button": {
      padding: "4px",
      transition: "transform 0.2s ease",
      color: theme.vars.palette.grey[400],
      "&.expanded": {
        transform: "rotate(180deg)"
      }
    },

    ".subtask-result-content": {
      padding: "0 1rem 1rem 1rem",
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".result-value": {
      marginTop: "0.5rem",
      padding: "1rem",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.grey[1000] || "#0a0a0a",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      fontSize: "0.8125rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[200],
      overflowX: "auto",
      fontFamily: theme.fontFamily2 || "monospace",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },

    ".result-primitive": {
      color: theme.vars.palette.grey[100],
      fontSize: "0.875rem",
      padding: "0.5rem 1rem",
      fontFamily: theme.fontFamily1
    },

    ".result-type-label": {
      display: "inline-block",
      fontSize: "0.6875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[500],
      letterSpacing: "0.5px",
      marginBottom: "0.5rem"
    }
  });

interface SubTaskResultDisplayProps {
  subtaskResult: SubTaskResult;
}

const SubTaskResultDisplay: React.FC<SubTaskResultDisplayProps> = ({
  subtaskResult
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const { displayValue, isPrimitive, resultType } = useMemo(() => {
    const result = subtaskResult.result;

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
  }, [subtaskResult.result]);

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  // For primitive types, show inline without expand
  if (isPrimitive && displayValue.length < 100) {
    return (
      <div className="subtask-result-container" css={styles(theme)}>
        <div className="subtask-result-header">
          <CheckCircleOutlineIcon className="subtask-result-icon" />
          <Typography className="subtask-result-title">
            Subtask Completed
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
    <div className="subtask-result-container" css={styles(theme)}>
      <div className="subtask-result-header" onClick={handleToggle}>
        <CheckCircleOutlineIcon className="subtask-result-icon" />
        <Typography className="subtask-result-title">
          Subtask Completed
        </Typography>
        <IconButton
          size="small"
          className={`expand-button ${expanded ? "expanded" : ""}`}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </div>
      <Collapse in={expanded}>
        <div className="subtask-result-content">
          <Typography className="result-type-label">{resultType}</Typography>
          <pre className="result-value">{displayValue}</pre>
        </div>
      </Collapse>
    </div>
  );
};

export default React.memo(SubTaskResultDisplay);
