/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import NodeEditor from "../node_editor/NodeEditor";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../contexts/NodeContext";
import StatusMessage from "../panels/StatusMessage";
import { Workflow, WorkflowAttributes } from "../../stores/ApiTypes";
import { generateCSS } from "../themes/GenerateCSS";
import { Box } from "@mui/material";

import TabsBar from "./TabsBar";
import KeyboardProvider from "../KeyboardProvider";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import WorkflowFormModal from "../workflows/WorkflowFormModal";
import FloatingToolBar from "../panels/FloatingToolBar";
import { getIsElectronDetails } from "../../utils/browser";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    flex: 1,
    minWidth: 0,
    "& .tabs-container": {
      display: "flex",
      backgroundColor: theme.vars.palette.grey[900],
      alignItems: "center",
      position: "relative",
      padding: "4px 0px 0px 10px",
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
      whiteSpace: "nowrap",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      // backdropFilter: "blur(8px)",
      position: "relative",
      WebkitAppRegion: "drag",

      "&::-webkit-scrollbar": {
        display: "none"
      }
    },
    "& .tab": {
      WebkitAppRegion: "no-drag",
      padding: "0px 20px",
      height: "32px",
      display: "flex",
      flexWrap: "nowrap",
      lineHeight: "1.1em",
      alignItems: "center",
      gap: "8px",
      minWidth: "80px",
      flex: "0 0 auto",
      cursor: "pointer",
      color: theme.vars.palette.grey[200],
      background: theme.vars.palette.grey[800],
      borderRadius: "8px 8px 0 0",
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      borderBottom: "none",
      fontSize: "13px",
      letterSpacing: "0.3px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative",
      marginRight: "1px",
      boxSizing: "border-box",

      "&::before": {
        content: '""',
        position: "absolute",
        bottom: 0,
        left: 4,
        right: 4,
        height: "2px",
        background: "var(--palette-primary-main)",
        opacity: 0,
        transform: "scaleX(0.7)",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      },

      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        color: theme.vars.palette.grey[0],
        borderColor: theme.vars.palette.grey[700],
        "&::before": {
          opacity: 0.3,
          transform: "scaleX(0.3)"
        }
      },

      "&.active": {
        color: theme.vars.palette.grey[0],
        background: theme.vars.palette.c_editor_bg_color,
        zIndex: 2,
        borderColor: theme.vars.palette.grey[700]
      },

      "& .close-icon": {
        opacity: 0.4,
        transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
        fontSize: "14px",
        "&:hover": {
          opacity: 1,
          transform: "scale(1.1) rotate(90deg)",
          color: "var(--palette-primary-main)"
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
      background: `${"var(--palette-primary-main)"}`,
      boxShadow: "none"
    },
    "& .tab.drop-target-right::after": {
      content: '""',
      position: "absolute",
      right: 0,
      top: "20%",
      bottom: "20%",
      width: "2px",
      background: `${"var(--palette-primary-main)"}`,
      boxShadow: "none"
    },
    "& .editor-container": {
      flex: 1,
      position: "relative",
      borderTop: "none",
      overflow: "hidden",
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      backgroundColor: "var(--c_editor_bg_color)"
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
      background: theme.vars.palette.background.default,
      border: "none",
      cursor: "pointer",
      color: theme.vars.palette.grey[200],
      transition: "all 0.1s ease-in-out",
      padding: 0,
      flexShrink: 0,
      visibility: "visible",

      "&[data-hidden='true']": {
        visibility: "hidden"
      },

      "&:hover": {
        color: theme.vars.palette.grey[0],
        background: theme.vars.palette.grey[800]
      },

      "&:disabled": {
        opacity: 0.3,
        "&:hover": {
          color: theme.vars.palette.grey[200],
          background: theme.vars.palette.background.default
        }
      }
    },
    "& .new-workflow-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "30px",
      height: "30px",
      background: theme.vars.palette.primary.main,
      border: "none",
      cursor: "pointer",
      marginTop: "1px",
      borderRadius: "5px 5px 0 0",
      padding: 0,
      marginLeft: "10px",
      transition: "all 0.1s ease-in-out",
      WebkitAppRegion: "no-drag",
      position: "relative",
      zIndex: 1001,
      "& svg path": {
        color: theme.vars.palette.grey[900]
      },

      "&:hover": {
        color: theme.vars.palette.grey[0],
        background: theme.vars.palette.grey[300]
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
      color: theme.vars.palette.grey[0],
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
      backgroundColor: "var(--c_delete)"
    }
  });

const WindowControls = () => {
  const handleMinimize = () => (window as any).api?.windowControls?.minimize();
  const handleMaximize = () => (window as any).api?.windowControls?.maximize();
  const handleClose = () => (window as any).api?.windowControls?.close();

  if (!(window as any).api?.windowControls) {
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

type TabsNodeEditorProps = {
  hideContent?: boolean;
};

const TabsNodeEditor = ({ hideContent = false }: TabsNodeEditorProps) => {
  const { openWorkflows, currentWorkflowId } = useWorkflowManager((state) => ({
    openWorkflows: state.openWorkflows,
    currentWorkflowId: hideContent ? undefined : state.currentWorkflowId
  }));

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  const electronDetectionDetails = getIsElectronDetails();
  const isElectron = electronDetectionDetails.isElectron;
  const platform = window.navigator.platform;
  const isMac = platform.toLowerCase().includes("mac");

  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null);

  // Determine tab ids: storage open ids + currently loaded ones + active id
  // Seed from localStorage on mount to show placeholders during hydration,
  // then keep this in sync with store updates so UI reflects removals immediately.
  const [storageOpenIds, setStorageOpenIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("openWorkflows");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // When openWorkflows/currentWorkflowId change, update our local id list
  // to avoid stale tabs lingering after removal.
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    const isHydrating = openWorkflows.length === 0 && !currentWorkflowId;
    if (!hasHydratedRef.current && isHydrating) return;

    const ids = new Set<string>();
    openWorkflows.forEach((w) => ids.add(w.id));
    if (currentWorkflowId) ids.add(currentWorkflowId);
    setStorageOpenIds(Array.from(ids));

    if (!hasHydratedRef.current && !isHydrating) {
      hasHydratedRef.current = true;
    }
  }, [openWorkflows, currentWorkflowId]);

  const idsForTabs = useMemo(() => {
    const ids = new Set<string>();
    storageOpenIds.forEach((id) => ids.add(id));
    openWorkflows.forEach((w) => ids.add(w.id));
    if (currentWorkflowId) ids.add(currentWorkflowId);
    return Array.from(ids);
  }, [storageOpenIds, openWorkflows, currentWorkflowId]);

  // Build a quick map for loaded workflows
  const openMap = useMemo(() => {
    const map = new Map<string, WorkflowAttributes>();
    openWorkflows.forEach((w) => map.set(w.id, w));
    return map;
  }, [openWorkflows]);

  // Fire queries for ids not yet in openWorkflows
  const queryResults = useQueries({
    queries: idsForTabs.map((id) => ({
      queryKey: ["workflow", id],
      queryFn: async () => {
        const { client } = await import("../../stores/ApiClient");
        const { createErrorMessage } = await import(
          "../../utils/errorHandling"
        );
        const { data, error } = await client.GET("/api/workflows/{id}", {
          params: { path: { id } }
        });
        if (error) {
          throw createErrorMessage(error, "Failed to load workflow");
        }
        return data;
      },
      enabled: !openMap.has(id)
    }))
  });

  const tabsToRender = useMemo(() => {
    return idsForTabs.map((id, index) => {
      const loaded = openMap.get(id);
      if (loaded) return loaded;
      const res = queryResults[index];
      if (res && res.data) {
        const { graph, ...attrs } = res.data as any;
        return attrs as WorkflowAttributes;
      }
      return {
        id,
        name: res?.isError ? "Error" : "Loading...",
        access: "private",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        description: ""
      } as WorkflowAttributes;
    });
  }, [idsForTabs, openMap, queryResults]);

  const theme = useTheme();

  return (
    <>
      {workflowToEdit && (
        <WorkflowFormModal
          open={!!workflowToEdit}
          onClose={() => setWorkflowToEdit(null)}
          workflow={workflowToEdit}
        />
      )}
      <div
        css={styles(theme)}
        className="tabs-node-editor"
        style={{
          top: hideContent ? 0 : 40,
          height: hideContent ? "100%" : "calc(100% - 40px)"
        }}
      >
        <div className="tabs-container">
          <TabsBar
            workflows={tabsToRender}
            currentWorkflowId={currentWorkflowId!}
          />
          {!isMac && isElectron && <WindowControls />}
        </div>
        {!hideContent && (
          <div
            className="editor-container"
            css={generateCSS}
            style={{ flex: 1, minHeight: 0, minWidth: 0 }}
          >
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
              {activeNodeStore ? (
                <NodeContext.Provider value={activeNodeStore}>
                  <ReactFlowProvider>
                    <ContextMenuProvider>
                      <ConnectableNodesProvider>
                        <KeyboardProvider>
                          <div className="status-message-container">
                            <StatusMessage />
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

                          <FloatingToolBar
                            setWorkflowToEdit={(wf) => setWorkflowToEdit(wf)}
                          />
                        </KeyboardProvider>
                      </ConnectableNodesProvider>
                    </ContextMenuProvider>
                  </ReactFlowProvider>
                </NodeContext.Provider>
              ) : (
                <StatusMessage />
              )}
            </Box>
          </div>
        )}
      </div>
    </>
  );
};

export default TabsNodeEditor;
