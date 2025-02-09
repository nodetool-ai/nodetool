/** @jsxImportSource @emotion/react */
import { css, ThemeProvider } from "@emotion/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";
import NodeEditor from "../node_editor/NodeEditor";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeProvider } from "../../contexts/NodeContext";
import StatusMessage from "../panels/StatusMessage";
import AppHeaderActions from "../panels/AppHeaderActions";
import { Workflow } from "../../stores/ApiTypes";
import { createPortal } from "react-dom";
import { generateCSS } from "../themes/GenerateCSS";
import { Box } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import TabsBar from "./TabsBar";
import KeyboardProvider from "../KeyboardProvider";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    flex: 1,
    minWidth: 0,
    "& .tabs-container": {
      display: "flex",
      alignItems: "center",
      position: "relative"
    },
    "& .tabs": {
      width: "100%",
      zIndex: 1000,
      display: "flex",
      flexWrap: "nowrap",
      minHeight: "30px",
      maxHeight: "100px",
      overflowX: "auto",
      overflowY: "hidden",
      padding: "0 10px",
      paddingTop: "5px",
      whiteSpace: "nowrap",
      maxWidth: "100%",
      scrollbarWidth: "none",
      msOverflowStyle: "none",

      "&::-webkit-scrollbar": {
        display: "none"
      },

      "&::-webkit-scrollbar-track": {
        display: "none"
      },

      "&::-webkit-scrollbar-thumb": {
        display: "none"
      }
    },
    "& .tab:hover": {
      color: theme.palette.c_gray6,
      background: theme.palette.c_gray1
    },
    "& .tab.active": {
      color: theme.palette.c_white,
      textShadow: "0 0 2px rgba(0, 0, 0, 0.5)",
      backgroundColor: theme.palette.c_editor_bg_color,
      borderBottom: "none",
      zIndex: 1
    },
    "& .tab": {
      padding: "5px 5px 5px 15px",
      height: "30px",
      display: "flex",
      flexWrap: "nowrap",
      lineHeight: "1.1em",
      alignItems: "center",
      gap: "8px",
      minWidth: "100px",
      flex: "0 0 auto",
      cursor: "pointer",
      color: theme.palette.c_gray5,
      background: theme.palette.background.default,
      borderRadius: "5px 5px 0 0",
      fontSize: theme.fontSizeNormal,
      transition: "all 0.1s ease-in-out",
      position: "relative",
      marginRight: "2px",
      border: `1px solid ${theme.palette.c_gray1}`,
      borderBottom: "none",
      boxSizing: "border-box",

      "& .close-icon": {
        opacity: 0.4,
        transition: "all 0.1s ease-in-out",
        "&:hover": {
          opacity: 1,
          transform: "rotate(90deg)",
          color: theme.palette.c_hl1
        }
      },

      "&.drop-target::before": {
        content: '""',
        position: "absolute",
        left: -1,
        top: 0,
        bottom: 0,
        width: 2,
        background: theme.palette.c_hl1
      },

      "&.drop-target-right::after": {
        content: '""',
        position: "absolute",
        right: -1,
        top: 0,
        bottom: 0,
        width: 2,
        background: theme.palette.c_hl1
      }
    },
    "& .editor-container": {
      flex: 1,
      position: "relative",
      borderTop: "none",
      overflow: "hidden"
    },
    ".status-message-container": {
      position: "absolute",
      top: "-70px",
      right: "300px",
      zIndex: 10000
    },
    "& .scroll-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "24px",
      height: "30px",
      background: theme.palette.background.default,
      border: "none",
      cursor: "pointer",
      color: theme.palette.c_gray5,
      transition: "all 0.1s ease-in-out",
      padding: 0,
      flexShrink: 0,
      visibility: "visible",

      "&[data-hidden='true']": {
        visibility: "hidden"
      },

      "&:hover": {
        color: theme.palette.c_white,
        background: theme.palette.c_gray1
      },

      "&:disabled": {
        opacity: 0.3,
        "&:hover": {
          color: theme.palette.c_gray5,
          background: theme.palette.background.default
        }
      }
    }
  });

const TabsNodeEditor = () => {
  const { openWorkflows, currentWorkflowId, loadingStates } =
    useWorkflowManager((state) => ({
      openWorkflows: state.openWorkflows,
      currentWorkflowId: state.currentWorkflowId,
      loadingStates: state.loadingStates
    }));
  const workflows = useMemo(() => {
    const loadingWorkflows = Object.keys(loadingStates)
      .filter((id) => !openWorkflows.some((w) => w.id === id))
      .map(
        (id) =>
          ({
            id,
            name: "Loading...",
            thumbnail: "",
            access: "private",
            description: "",
            isDirty: false,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            graph: { nodes: [], edges: [] }
          } as Workflow)
      );
    return [...openWorkflows, ...loadingWorkflows];
  }, [openWorkflows, loadingStates]);

  return (
    <ThemeProvider theme={ThemeNodes}>
      <div css={styles}>
        <TabsBar workflows={workflows} />
        <div className="editor-container" css={generateCSS}>
          {workflows.map((workflow) => (
            <Box
              key={workflow.id}
              sx={{
                overflow: "hidden",
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: currentWorkflowId === workflow.id ? "block" : "none"
              }}
            >
              <ReactFlowProvider>
                <ContextMenuProvider active={currentWorkflowId === workflow.id}>
                  <KeyboardProvider active={currentWorkflowId === workflow.id}>
                    <NodeProvider workflowId={workflow.id}>
                      {currentWorkflowId === workflow.id &&
                        createPortal(
                          <div className="actions-container">
                            <AppHeaderActions />
                          </div>,
                          document.body
                        )}
                      <div className="status-message-container">
                        <StatusMessage />
                      </div>
                      <NodeEditor workflowId={workflow.id} />
                    </NodeProvider>
                  </KeyboardProvider>
                </ContextMenuProvider>
              </ReactFlowProvider>
            </Box>
          ))}
        </div>
      </div>
    </ThemeProvider>
  );
};

export default TabsNodeEditor;
