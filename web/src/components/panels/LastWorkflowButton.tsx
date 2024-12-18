/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback, useMemo } from "react";
import { Button, IconButton, InputBase, Box, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { TOOLTIP_DELAY } from "../../config/constants";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useLocation, useNavigate } from "react-router-dom";

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
    "&.last-workflow button": {
      color: theme.palette.c_white,
      backgroundColor: "transparent",
      borderRadius: "1em",
      textTransform: "none",
      fontSize: "1em"
    },
    "&.last-workflow button.disabled": {
      borderRadius: "0",
      backgroundColor: theme.palette.c_gray1,
      color: theme.palette.c_gray6
    },
    "&.last-workflow button:hover ": {
      backgroundColor: theme.palette.c_gray3,
      borderRadius: "1em"
    },
    "&.last-workflow span": {
      color: theme.palette.c_attention,
      marginLeft: "0.2em"
    },
    "& .edit-button": {
      display: "block",
      position: "absolute",
      left: "-.8em",
      top: ".5em",
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
      opacity: 0,
      position: "absolute",
      zIndex: 10,
      top: "0",
      right: "-2em",
      width: "5em",
      height: "1.5em",
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
      alignItems: "flex-start"
    },
    input: {
      fontSize: theme.fontSizeBig,
      padding: ".5em 2em .2em 1em",
      marginLeft: "3em",
      textAlign: "center",
      backgroundColor: theme.palette.c_gray2,
      border: "none",
      borderRadius: "0",
      color: theme.palette.c_white,
      "&:focus": {
        outline: "none"
      }
    }
  });

const LastWorkflowButton = React.memo(() => {
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
  const addNotification = useNotificationStore(
    useCallback((state) => state.addNotification, [])
  );

  const [localName, setLocalName] = useState(workflow?.name || "");
  const [isEditing, setIsEditing] = useState(false);

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

  const memoizedButton = useMemo(
    () => (
      <Button
        onClick={handleNavigateToLastWorkflow}
        onDoubleClick={handleDoubleClick}
        disabled={pathname.startsWith("/editor")}
      >
        {workflow?.name}
        {workflowDirty && <span>*</span>}
      </Button>
    ),
    [
      workflow?.name,
      workflowDirty,
      pathname,
      handleNavigateToLastWorkflow,
      handleDoubleClick
    ]
  );

  if (!workflow) return null;

  return (
    <div className="last-workflow" css={styles}>
      {!isEditing ? (
        <>
          <Tooltip title="Edit workflow name" enterDelay={TOOLTIP_DELAY}>
            <IconButton
              className="edit-button"
              size="small"
              onClick={handleEdit}
              tabIndex={-1}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {memoizedButton}
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
            <Tooltip title="Save" enterDelay={TOOLTIP_DELAY}>
              <IconButton size="small" onClick={handleSave}>
                <CheckIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Cancel" enterDelay={TOOLTIP_DELAY}>
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
});

export default LastWorkflowButton;
