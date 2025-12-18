/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Paper,
  Typography,
  Checkbox,
  Box,
  CircularProgress
} from "@mui/material";
import { Step } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    ".step-item": {
      padding: "0.625rem 0.75rem",
      marginBottom: "0.5rem",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[750],
        borderColor: theme.vars.palette.grey[600]
      }
    },
    ".step-content": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem"
    },
    ".step-completed": {
      color: theme.vars.palette.grey[500],
      textDecoration: "line-through",
      opacity: 0.7
    },
    ".step-text": {
      fontSize: "0.875rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[200]
    },
    ".step-tool svg": {
      fontSize: "0.5rem"
    },
    ".step-tool": {
      marginLeft: "0.5rem",
      fontSize: "0.5rem"
    },
    ".dependency-marker": {
      display: "flex",
      color: theme.vars.palette.text.secondary,
      marginLeft: "-.5em",
      paddingLeft: "0",
      fontSize: "0.8em",
      wordBreak: "break-all"
    },
    "@keyframes shine": {
      "0%": { backgroundPosition: "-200%" },
      "100%": { backgroundPosition: "200%" }
    },
    ".shine-effect": {
      background: `linear-gradient(90deg, ${"var(--palette-primary-main)"}, ${"var(--palette-secondary-main)"}, ${"var(--palette-primary-main)"})`,
      backgroundSize: "200%",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animation: "shine 5s infinite"
    }
  });

interface StepViewProps {
  step: Step;
}

const StepView: React.FC<StepViewProps> = ({ step }) => {
  const theme = useTheme();
  const hasDependencies = step.depends_on
    ? step.depends_on.length > 0
    : false;
  const isRunning = step.start_time > 0 && !step.completed;

  return (
    <div css={styles(theme)}>
      <Paper className="step-item" elevation={0}>
        <div className="step-content">
          <Box
            sx={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            {isRunning ? (
              <CircularProgress size={18} />
            ) : (
              <Checkbox
                checked={step.completed}
                disabled
                size="small"
                sx={
                  step.completed
                    ? {
                        color: (theme) => theme.vars.palette.success.main,
                        "&.Mui-disabled": {
                          color: (theme) => theme.vars.palette.success.main
                        }
                      }
                    : {}
                }
              />
            )}
          </Box>
          <Typography
            className={`step-text ${
              step.completed
                ? "step-completed"
                : isRunning
                ? "shine-effect"
                : ""
            }`}
          >
            {step.instructions}
          </Typography>
        </div>
      </Paper>
    </div>
  );
};

export default StepView;
