/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback, useMemo, useEffect, memo } from "react";
import {
  Button,
  IconButton,
  InputBase,
  Box,
  Tooltip,
  Typography
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useLocation, useNavigate } from "react-router-dom";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useWorkflowStore } from "../../stores/WorkflowStore";

const styles = (theme: any) =>
  css({
    "&": {
      fontSize: theme.fontSizeBig,
      color: theme.palette.c_white,
      position: "absolute",
      padding: "0 .5em .5em .5em",
      height: "2em",
      zIndex: 1000,
      left: "50%",
      top: ".25em",
      textAlign: "center",
      transform: "translateX(-50%)",
      fontWeight: "normal",
      backgroundColor: theme.palette.c_gray1,
      "&:hover": {
        color: theme.palette.c_hl1
      }
    },
    "&.last-workflow": {
      position: "absolute",
      top: ".6em",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    },
    "&.last-workflow button": {
      color: theme.palette.c_white,
      borderRadius: ".5em",
      textTransform: "none",
      fontSize: "1em",
      padding: ".1em .8em"
    },
    "&.last-workflow button.disabled": {
      backgroundColor: "transparent",
      color: theme.palette.c_gray6
    },
    "&.last-workflow button:hover ": {
      backgroundColor: theme.palette.c_gray3
    },
    "&.last-workflow span": {
      color: theme.palette.c_attention,
      marginLeft: "0.2em"
    },
    "& .edit-button": {
      display: "block",
      position: "absolute",
      right: "-.8em",
      top: ".1e2",
      width: "1em",
      height: "1em",
      opacity: 0,
      padding: "0",
      backgroundColor: "transparent"
    },
    "&:hover .edit-button:hover": {
      backgroundColor: "transparent"
    },
    "&:hover .edit-button": {
      display: "inline-block",
      opacity: 1
    },
    "& .confirm-buttons": {
      opacity: 1,
      position: "absolute",
      zIndex: 10,
      top: "50%",
      transform: "translateY(-50%)",
      right: "-45px",
      display: "flex",
      gap: "4px",
      backgroundColor: "transparent"
    },
    "&:hover .confirm-buttons": {
      opacity: 1
    },
    "& .confirm-buttons button:hover, & .edit-button:hover": {
      color: theme.palette.c_hl1,
      backgroundColor: "transparent"
    },
    "& .confirm-buttons button.cancel:hover": {
      color: theme.palette.c_delete
    },
    ".edit": {
      display: "flex",
      alignItems: "center",
      position: "relative",
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "4px",
      padding: "2px 8px",
      minWidth: "200px",
      border: `1px solid ${theme.palette.c_gray4}`
    },
    input: {
      fontSize: theme.fontSizeBig,
      padding: "6px 12px",
      width: "100%",
      textAlign: "center",
      backgroundColor: "transparent",
      border: "none",
      borderRadius: "0",
      color: theme.palette.c_white,
      "&:focus": {
        outline: "none"
      }
    }
  });

const LastWorkflowButton = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    workflow,
    setWorkflowAttributes,
    saveWorkflow,
    workflowDirty,
    lastWorkflow
  } = useNodeStore(
    useCallback(
      (state) => ({
        workflow: state.workflow,
        setWorkflowAttributes: state.setWorkflowAttributes,
        saveWorkflow: state.saveWorkflow,
        workflowDirty: state.getWorkflowIsDirty(),
        lastWorkflow: state.lastWorkflow
      }),
      []
    )
  );
  const createNewWorkflow = useWorkflowStore(
    useCallback((state) => state.createNew, [])
  );
  const addNotification = useNotificationStore(
    useCallback((state) => state.addNotification, [])
  );

  const [localName, setLocalName] = useState(workflow?.name || "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setLocalName(workflow?.name || "");
    }
  }, [workflow?.name, isEditing]);

  const handleNavigateToLastWorkflow = useCallback(() => {
    if (lastWorkflow) {
      navigate(`/editor/${lastWorkflow.id}`);
    }
  }, [lastWorkflow, navigate]);

  const handleEdit = useCallback(() => setIsEditing(true), []);
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setLocalName(e.target.value),
    []
  );

  const handleSave = useCallback(async () => {
    if (localName.trim() !== "" && workflow) {
      setWorkflowAttributes({ ...workflow, name: localName.trim() });
      await saveWorkflow();
      setIsEditing(false);
      addNotification({
        type: "info",
        content: "Workflow name updated!",
        alert: true,
        dismissable: true
      });
    }
  }, [
    localName,
    workflow,
    setWorkflowAttributes,
    saveWorkflow,
    addNotification
  ]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setLocalName(workflow?.name || "");
  }, [workflow]);

  const handleDoubleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true);
    }
  }, [isEditing]);

  const handleCreateWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  }, [navigate, createNewWorkflow]);

  const pathIsEditor = pathname.startsWith("/editor");
  const memoizedButton = useMemo(
    () => (
      <Button
        onClick={handleNavigateToLastWorkflow}
        onDoubleClick={handleDoubleClick}
        disabled={pathIsEditor}
        sx={{
          backgroundColor: !pathIsEditor
            ? ThemeNodetool.palette.c_gray2
            : "transparent"
        }}
      >
        {workflow?.name}
        {workflowDirty && <span>*</span>}
      </Button>
    ),
    [
      workflow?.name,
      workflowDirty,
      pathIsEditor,
      handleNavigateToLastWorkflow,
      handleDoubleClick
    ]
  );

  if (workflow?.id === "") {
    return (
      <div className="last-workflow" css={styles}>
        <Button
          onClick={handleCreateWorkflow}
          sx={{
            backgroundColor: ThemeNodetool.palette.c_gray2
          }}
        >
          Create New Workflow
        </Button>
      </div>
    );
  }

  return (
    <div className="last-workflow" css={styles}>
      {!pathIsEditor && (
        <Typography
          component="span"
          sx={{ position: "absolute", left: "-100px", pr: 4 }}
        >
          Go back to
        </Typography>
      )}
      {!isEditing ? (
        <>
          {memoizedButton}
          <Tooltip title="Edit workflow name" enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton
              className="edit-button"
              size="small"
              onClick={handleEdit}
              tabIndex={-1}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Box className="edit">
          <InputBase
            value={localName}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <div className="confirm-buttons">
            <Tooltip title="Save" enterDelay={TOOLTIP_ENTER_DELAY}>
              <IconButton size="small" onClick={handleSave}>
                <CheckIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Cancel" enterDelay={TOOLTIP_ENTER_DELAY}>
              <IconButton
                className="cancel"
                size="small"
                onClick={handleCancel}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </Box>
      )}
    </div>
  );
};

export default memo(LastWorkflowButton);
