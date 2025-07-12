/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  Paper,
  Typography,
  ListItemText,
  Checkbox,
  Box,
  CircularProgress
} from "@mui/material";
import { SubTask } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    ".subtask-item": {
      padding: "0.5rem",
      marginBottom: "0.5rem",
      borderLeft: `2px solid ${theme.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.palette.grey[600]
      }
    },
    ".subtask-content": {
      display: "flex",
      alignItems: "center"
    },
    ".subtask-completed": {
      color: theme.palette.grey[800]
    },
    ".subtask-tool svg": {
      fontSize: "0.5rem"
    },
    ".subtask-tool": {
      marginLeft: "0.5rem",
      fontSize: "0.5rem"
    },
    ".dependency-marker": {
      display: "flex",
      color: theme.palette.text.secondary,
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

interface SubTaskViewProps {
  subtask: SubTask;
}

const SubTaskView: React.FC<SubTaskViewProps> = ({ subtask }) => {
  const hasDependencies = (subtask as any).input_tasks
    ? (subtask as any).input_tasks.length > 0
    : false;
  const isRunning = subtask.start_time > 0 && !subtask.completed;

  return (
    <div css={styles}>
      <Paper className="subtask-item" elevation={0}>
        <div className="subtask-content">
          <Box
            sx={{
              width: 32, // size of spinner (20) + marginRight (12)
              height: 32, // Assuming checkbox 'small' fits within this
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "12px" // Keep the original margin outside the box
            }}
          >
            {isRunning ? (
              <CircularProgress size={20} />
            ) : (
              <Checkbox
                checked={subtask.completed}
                disabled
                size="small"
                sx={
                  subtask.completed
                    ? {
                        color: (theme) => theme.palette.success.main,
                        "&.Mui-disabled": {
                          color: (theme) => theme.palette.success.main
                        }
                      }
                    : {}
                }
              />
            )}
          </Box>
          <ListItemText
            primary={
              <Typography
                variant="body1"
                className={
                  subtask.completed
                    ? "subtask-completed"
                    : isRunning
                    ? "shine-effect"
                    : ""
                }
              >
                {subtask.content}
              </Typography>
            }
          />
        </div>
      </Paper>
    </div>
  );
};

export default SubTaskView;
