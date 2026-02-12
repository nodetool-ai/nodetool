/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Paper,
  Typography,
  Box,
  CircularProgress
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { Step } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    ".step-item": {
      padding: "0.85rem 1rem",
      borderRadius: "10px",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      border: `1px solid ${theme.vars.palette.grey[800]}44`,
      transition: "all 0.2s ease",
      position: "relative",
      overflow: "hidden",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        borderColor: theme.vars.palette.grey[700]
      },
      "&.running": {
        backgroundColor: `rgba(25, 30, 40, 0.5)`,
        borderColor: `${theme.vars.palette.primary.main}44`,
        boxShadow: `0 0 15px ${theme.vars.palette.primary.main}11`
      },
      "&.completed": {
        backgroundColor: `rgba(20, 25, 20, 0.3)`,
        borderColor: `${theme.vars.palette.success.main}22`
      }
    },
    ".step-content": {
      display: "flex",
      alignItems: "flex-start",
      gap: "0.85rem"
    },
    ".step-status-icon": {
      marginTop: "2px",
      color: theme.vars.palette.grey[600],
      fontSize: "1.1rem",
      flexShrink: 0
    },
    ".step-completed-icon": {
      color: theme.vars.palette.success.main,
      filter: `drop-shadow(0 0 2px ${theme.vars.palette.success.main}66)`
    },
    ".step-running-spinner": {
      color: theme.vars.palette.primary.main
    },
    ".step-text": {
      fontSize: "0.85rem",
      lineHeight: "1.5",
      color: theme.vars.palette.grey[300],
      transition: "color 0.2s ease"
    },
    ".step-text.completed": {
      color: theme.vars.palette.grey[500],
      textDecoration: "line-through",
      opacity: 0.8
    },
    "@keyframes shine": {
      "0%": { backgroundPosition: "200% center" },
      "100%": { backgroundPosition: "-200% center" }
    },
    ".shine-effect": {
      background: `linear-gradient(90deg, ${theme.vars.palette.grey[300]} 0%, #fff 20%, ${theme.vars.palette.grey[300]} 40%)`,
      backgroundSize: "200% auto",
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animation: "shine 3s linear infinite",
      fontWeight: 500
    }
  });

interface StepViewProps {
  step: Step;
}

const StepView: React.FC<StepViewProps> = ({ step }) => {
  const theme = useTheme();
  // Simple heuristic for running state: has start time but not completed
  const isRunning = step.start_time > 0 && !step.completed;

  return (
    <div css={styles(theme)}>
      <Paper 
        className={`step-item ${isRunning ? "running" : ""} ${step.completed ? "completed" : ""}`} 
        elevation={0}
      >
        <div className="step-content">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "20px" 
            }}
          >
            {isRunning ? (
              <CircularProgress size={16} className="step-running-spinner" thickness={5} />
            ) : step.completed ? (
              <CheckCircleRoundedIcon className="step-status-icon step-completed-icon" />
            ) : (
              <RadioButtonUncheckedRoundedIcon className="step-status-icon" />
            )}
          </Box>
          <Typography
            className={`step-text ${
              step.completed
                ? "completed"
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

export default memo(StepView);
