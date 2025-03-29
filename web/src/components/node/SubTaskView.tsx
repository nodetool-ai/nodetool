/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Box,
  Collapse
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { SubTask } from "../../stores/ApiTypes";

const styles = (theme: any) =>
  css({
    ".subtask-item": {
      padding: "0.5rem",
      marginBottom: "0.5rem",
      borderLeft: `2px solid ${theme.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".subtask-content": {
      display: "flex",
      alignItems: "center"
    },
    ".subtask-completed": {
      color: theme.palette.c_gray10
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
      marginLeft: "2rem"
    }
  });

interface SubTaskViewProps {
  subtask: SubTask;
}

const SubTaskView: React.FC<SubTaskViewProps> = ({ subtask }) => {
  const [expanded, setExpanded] = React.useState(false);
  const hasDependencies = subtask.input_files.length > 0;

  return (
    <div css={styles}>
      <Paper className="subtask-item" elevation={0}>
        <div className="subtask-content">
          <Checkbox checked={subtask.completed} disabled size="small" />
          <ListItemText
            primary={
              <Typography
                variant="body1"
                className={subtask.completed ? "subtask-completed" : ""}
              >
                {subtask.content}
              </Typography>
            }
          />
          {hasDependencies && (
            <Box
              ml={1}
              onClick={() => setExpanded(!expanded)}
              sx={{ cursor: "pointer" }}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </Box>
          )}
        </div>

        {hasDependencies && (
          <Collapse in={expanded}>
            <Box ml={3} mt={1}>
              <List dense disablePadding>
                {subtask.input_files.map((depId) => (
                  <ListItem key={depId} dense disablePadding>
                    <div className="dependency-marker">
                      &rarr;&nbsp;
                      {depId}
                    </div>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Collapse>
        )}
      </Paper>
    </div>
  );
};

export default SubTaskView;
