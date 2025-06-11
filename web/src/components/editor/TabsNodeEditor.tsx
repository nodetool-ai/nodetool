/** @jsxImportSource @emotion/react */
import { css, ThemeProvider } from "@emotion/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import NodeEditor from "../node_editor/NodeEditor";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeProvider } from "../../contexts/NodeContext";
import StatusMessage from "../panels/StatusMessage";
import AppToolbar from "../panels/AppToolbar";
import { Workflow } from "../../stores/ApiTypes";
import { generateCSS } from "../themes/GenerateCSS";
import { Box } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import TabsBar from "./TabsBar";
import KeyboardProvider from "../KeyboardProvider";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import WorkflowFormModal from "../workflows/WorkflowFormModal";
import AppHeader from "../panels/AppHeader";
import { getIsElectronDetails } from "../../utils/browser";

const styles = (theme: any) =>
  css({
    position: "absolute",
    top: 0,
    left: 0,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    flex: 1,
    minWidth: 0,
    "& .tabs-container": {
      display: "flex",
      backgroundColor: theme.palette.c_gray0,
      alignItems: "center",
      position: "relative",
      padding: "0",
      height: "32px",
      width: "100%",
      WebkitAppRegion: "drag"
    },
    "& .tabs": {
      flex: 1,
      zIndex: 1000,
      display: "flex",
      flexWrap: "nowrap",
      minHeight: "32px",
      overflowX: "auto",
      overflowY: "hidden",
      padding: "0 10px",
      paddingLeft: "40px",
      paddingRight: "138px",
      whiteSpace: "nowrap",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      backdropFilter: "blur(8px)",
      position: "relative",
      WebkitAppRegion: "drag",

      "&::-webkit-scrollbar": {
        display: "none"
      }
    },
    "& .tab": {
      WebkitAppRegion: "no-drag",
      padding: "4px 16px",
      height: "32px",
      display: "flex",
      flexWrap: "nowrap",
      lineHeight: "1.1em",
      alignItems: "center",
      gap: "8px",
      minWidth: "80px",
      flex: "0 0 auto",
      cursor: "pointer",
      color: theme.palette.c_gray5,
      background: "transparent",
      borderRadius: "2px 2px 0 0",
      fontSize: "13px",
      letterSpacing: "0.3px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative",
      marginRight: "1px",
      border: "none",
      boxSizing: "border-box",

      "&::before": {
        content: '""',
        position: "absolute",
        bottom: 0,
        left: 4,
        right: 4,
        height: "2px",
        background: theme.palette.c_hl1,
        opacity: 0,
        transform: "scaleX(0.7)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      },

      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        color: theme.palette.c_white,
        "&::before": {
          opacity: 0.3,
          transform: "scaleX(0.3)"
        }
      },

      "&.active": {
        color: theme.palette.c_white,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        "&::before": {
          opacity: 0.8,
          transform: "scaleX(1)"
        }
      },

      "& .close-icon": {
        opacity: 0.4,
        transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
        fontSize: "14px",
        "&:hover": {
          opacity: 1,
          transform: "scale(1.1) rotate(90deg)",
          color: theme.palette.c_hl1
        }
      }
    },
    "& .tab.drop-target::before": {
      content: '""',
      position: "absolute",
      left: 0,
      top: "20%",
      bottom: "20%",
      width: "2px",
      background: `linear-gradient(to bottom, 
        transparent 0%, 
        ${theme.palette.c_hl1} 50%, 
        transparent 100%
      )`,
      boxShadow: `0 0 8px ${theme.palette.c_hl1}`
    },
    "& .tab.drop-target-right::after": {
      content: '""',
      position: "absolute",
      right: 0,
      top: "20%",
      bottom: "20%",
      width: "2px",
      background: `linear-gradient(to bottom, 
        transparent 0%, 
        ${theme.palette.c_hl1} 50%, 
        transparent 100%
      )`,
      boxShadow: `0 0 8px ${theme.palette.c_hl1}`
    },
    "& .editor-container": {
      flex: 1,
      position: "relative",
      borderTop: "none",
      overflow: "hidden",
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
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
    },
    "& .new-workflow-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "30px",
      height: "30px",
      background: theme.palette.background.default,
      border: `1px solid ${theme.palette.c_gray1}`,
      borderBottom: "none",
      color: theme.palette.c_gray5,
      cursor: "pointer",
      borderRadius: "5px 5px 0 0",
      padding: 0,
      marginLeft: "2px",
      transition: "all 0.1s ease-in-out",
      WebkitAppRegion: "no-drag",
      position: "relative",
      zIndex: 1001,

      "&:hover": {
        color: theme.palette.c_gray6,
        background: theme.palette.c_gray1
      },

      "& svg": {
        fontSize: "20px"
      }
    },
    "& .window-controls": {
      display: "flex",
      height: "32px",
      WebkitAppRegion: "no-drag",
      flexShrink: 0
    },
    "& .window-control-button": {
      width: "46px",
      height: "100%",
      border: "none",
      background: "transparent",
      color: theme.palette.c_white,
      fontSize: "14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "background-color 0.2s",
      outline: "none",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)"
      }
    },
    "& .window-control-button#close-button:hover": {
      backgroundColor: "#e81123"
    }
  });

const WindowControls = () => {
  const handleMinimize = () => window.api?.windowControls?.minimize();
  const handleMaximize = () => window.api?.windowControls?.maximize();
  const handleClose = () => window.api?.windowControls?.close();

  if (!window.api?.windowControls) {
    console.warn(
      "[TabsNodeEditor] window.api.windowControls not found. Window controls will not function."
    );
    return null;
  }

  return (
    <div className="window-controls">
      <button
        className="window-control-button"
        onClick={handleMinimize}
        title="Minimize"
      >
        &#x2014;
      </button>
      <button
        className="window-control-button"
        onClick={handleMaximize}
        title="Maximize"
      >
        &#x2610;
      </button>
      <button
        className="window-control-button"
        id="close-button"
        onClick={handleClose}
        title="Close"
      >
        &#x2715;
      </button>
    </div>
  );
};

const TabsNodeEditor = () => {
  const { openWorkflows, currentWorkflowId, loadingStates, getNodeStore } =
    useWorkflowManager((state) => ({
      openWorkflows: state.openWorkflows,
      currentWorkflowId: state.currentWorkflowId,
      loadingStates: state.loadingStates,
      getNodeStore: state.getNodeStore
    }));

  const electronDetectionDetails = getIsElectronDetails();
  const isElectron = electronDetectionDetails.isElectron;
  const platform = window.navigator.platform;
  const isMac = platform.toLowerCase().includes("mac");

  const workflowsForTabs = useMemo(() => {
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
            graph: { nodes: [], edges: [] },
            run_mode: "workflow"
          } as Workflow)
      );
    return [...openWorkflows, ...loadingWorkflows];
  }, [openWorkflows, loadingStates]);

  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null);

  const activeNodeStore = useMemo(() => {
    if (currentWorkflowId) {
      return getNodeStore(currentWorkflowId);
    }
    return undefined;
  }, [currentWorkflowId, getNodeStore]);

  return (
    <>
      {workflowToEdit && (
        <WorkflowFormModal
          open={!!workflowToEdit}
          onClose={() => setWorkflowToEdit(null)}
          workflow={workflowToEdit}
        />
      )}
      <ThemeProvider theme={ThemeNodes}>
        <div css={styles}>
          <div className="tabs-container">
            <TabsBar workflows={workflowsForTabs} />
            {!isMac && isElectron && <WindowControls />}
          </div>
          <div
            className="editor-container"
            css={generateCSS}
            style={{ flex: 1, minHeight: 0, minWidth: 0 }}
          >
            {activeNodeStore ? (
              <Box
                key={currentWorkflowId}
                sx={{
                  overflow: "hidden",
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  minHeight: 0,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                <ReactFlowProvider>
                  <ContextMenuProvider active={true}>
                    <ConnectableNodesProvider active={true}>
                      <KeyboardProvider active={true}>
                        <NodeProvider createStore={() => activeNodeStore}>
                          <div
                            style={{
                              flexShrink: 0,
                              position: "relative",
                              zIndex: 1
                            }}
                          >
                            <AppHeader />
                            <div className="actions-container">
                              <AppToolbar
                                setWorkflowToEdit={setWorkflowToEdit}
                              />
                            </div>
                            <div className="status-message-container">
                              <StatusMessage />
                            </div>
                          </div>
                          <div
                            style={{
                              flex: 1,
                              minHeight: 0,
                              position: "relative",
                              width: "100%",
                              height: "100%"
                            }}
                          >
                            <NodeEditor
                              workflowId={currentWorkflowId!}
                              active={true}
                            />
                          </div>
                        </NodeProvider>
                      </KeyboardProvider>
                    </ConnectableNodesProvider>
                  </ContextMenuProvider>
                </ReactFlowProvider>
              </Box>
            ) : (
              <StatusMessage />
            )}
          </div>
        </div>
      </ThemeProvider>
    </>
  );
};

export default TabsNodeEditor;
