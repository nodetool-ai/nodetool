/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { VersionHistoryPanel } from "../version";
import { useVersionHistoryStore, WorkflowVersion } from "../../stores/VersionHistoryStore";
import { useAutosave } from "../../hooks/useAutosave";
import { Drawer } from "@mui/material";
// import { getIsElectronDetails } from "../../utils/browser";

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
      backgroundColor: theme.vars.palette.c_tabs_header,
      backdropFilter: "blur(12px)",
      alignItems: "center",
      position: "relative",
      padding: "4px 0px 0px 10px",
      width: "calc(100% - 50px)", // -50px to account for the run as app button
      WebkitAppRegion: "drag",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
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
      color: theme.vars.palette.text.secondary,
      background: "transparent",
      borderRadius: "8px 8px 0 0",
      border: `1px solid transparent`,
      borderBottom: "none",
      fontSize: "13px",
      letterSpacing: "0.3px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative",
      marginRight: "4px",
      boxSizing: "border-box",

      "&::before": {
        content: '""',
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "1px",
        background: theme.vars.palette.divider,
        opacity: 0,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      },

      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary,
        borderColor: theme.vars.palette.divider,
        "&::before": {
          opacity: 1
        }
      },

      "&.active": {
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.selected,
        zIndex: 2,
        borderColor: theme.vars.palette.divider,
        boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.1)",
        "&::before": {
          background: theme.vars.palette.primary.main,
          height: "1px",
          opacity: 1
        }
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
      color: theme.vars.palette.text.secondary,
      transition: "all 0.1s ease-in-out",
      padding: 0,
      flexShrink: 0,
      visibility: "visible",

      "&[data-hidden='true']": {
        visibility: "hidden"
      },

      "&:hover": {
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.hover
      },

      "&:disabled": {
        opacity: 0.3,
        "&:hover": {
          color: theme.vars.palette.text.secondary,
          background: theme.vars.palette.background.default
        }
      }
    },
    "& .new-workflow-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "30px",
      background: theme.vars.palette.primary.main,
      border: "none",
      cursor: "pointer",
      marginTop: "1px",
      borderRadius: "8px 8px 0 0",
      padding: 0,
      marginLeft: "10px",
      transition: "all 0.1s ease-in-out",
      WebkitAppRegion: "no-drag",
      position: "relative",
      zIndex: 1001,
      "& svg path": {
        color: theme.vars.palette.primary.contrastText
      },

      "&:hover": {
        color: theme.vars.palette.primary.contrastText,
        background: theme.vars.palette.primary.dark
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
      color: theme.vars.palette.text.primary,
      fontSize: "14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "background-color 0.2s",
      outline: "none",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .window-control-button#close-button:hover": {
      backgroundColor: "var(--c_delete)"
    }
  });

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

  const { isHistoryPanelOpen, setHistoryPanelOpen, saveVersion, incrementEditCount } = useVersionHistoryStore(
    (state) => ({
      isHistoryPanelOpen: state.isHistoryPanelOpen,
      setHistoryPanelOpen: state.setHistoryPanelOpen,
      saveVersion: state.saveVersion,
      incrementEditCount: state.incrementEditCount
    })
  );

  const { saveWorkflow: saveWorkflowToBackend } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow
  }));

  // Autosave hook integration
  const getWorkflowForAutosave = useCallback(() => {
    if (!activeNodeStore) {
      return undefined;
    }
    return activeNodeStore.getState().getWorkflow();
  }, [activeNodeStore]);

  const getIsDirty = useCallback(() => {
    if (!activeNodeStore) {
      return false;
    }
    return activeNodeStore.getState().workflowIsDirty;
  }, [activeNodeStore]);

  const handleAutosaveWorkflow = useCallback(async (workflow: Workflow) => {
    await saveWorkflowToBackend(workflow);
  }, [saveWorkflowToBackend]);

  // Use the autosave hook
  useAutosave({
    workflowId: currentWorkflowId || null,
    getWorkflow: getWorkflowForAutosave,
    isDirty: getIsDirty,
    onSaveWorkflow: handleAutosaveWorkflow
  });

  // Track edit counts for significant changes autosave
  useEffect(() => {
    if (!activeNodeStore || !currentWorkflowId) {
      return;
    }

    // Subscribe to node store changes to increment edit count
    const unsubscribe = activeNodeStore.subscribe((state, prevState) => {
      // Only count significant changes (nodes or edges changed)
      if (state.nodes !== prevState.nodes || state.edges !== prevState.edges) {
        incrementEditCount(currentWorkflowId);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeNodeStore, currentWorkflowId, incrementEditCount]);

  // const electronDetectionDetails = getIsElectronDetails();
  // const isElectron = electronDetectionDetails.isElectron;
  // const isMac = normalizedPlatform.includes("mac");
  // const platform = window.navigator.platform;
  // const normalizedPlatform = platform.toLowerCase();

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
    if (!hasHydratedRef.current && isHydrating) {
      return;
    }

    const ids = new Set<string>();
    openWorkflows.forEach((w) => ids.add(w.id));
    if (currentWorkflowId) {
      ids.add(currentWorkflowId);
    }
    setStorageOpenIds(Array.from(ids));

    if (!hasHydratedRef.current && !isHydrating) {
      hasHydratedRef.current = true;
    }
  }, [openWorkflows, currentWorkflowId]);

  const idsForTabs = useMemo(() => {
    const ids = new Set<string>();
    storageOpenIds.forEach((id) => ids.add(id));
    openWorkflows.forEach((w) => ids.add(w.id));
    if (currentWorkflowId) {
      ids.add(currentWorkflowId);
    }
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
      if (loaded) {
        return loaded;
      }
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

  // Handler to restore a workflow version
  const handleRestoreVersion = (version: WorkflowVersion) => {
    if (!activeNodeStore || !currentWorkflowId) {
      return;
    }

    const storeState = activeNodeStore.getState();
    const workflow = storeState.getWorkflow();

    // Save current state as a "restore" version before applying the old one
    if (workflow && workflow.graph) {
      saveVersion(currentWorkflowId, workflow.graph, "restore", "Before restore");
    }

    // Import the conversion functions dynamically to avoid circular deps
    import("../../stores/graphNodeToReactFlowNode").then(({ graphNodeToReactFlowNode }) => {
      import("../../stores/graphEdgeToReactFlowEdge").then(({ graphEdgeToReactFlowEdge }) => {
        const graph = version.graph_snapshot;
        const newNodes = graph.nodes.map((n) =>
          graphNodeToReactFlowNode({ ...workflow, graph } as Workflow, n)
        );
        const newEdges = graph.edges.map((e) => graphEdgeToReactFlowEdge(e));

        storeState.setNodes(newNodes);
        storeState.setEdges(newEdges);
        storeState.setWorkflowDirty(true);
      });
    });

    setHistoryPanelOpen(false);
  };

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
        <TabsBar
          workflows={tabsToRender}
          currentWorkflowId={currentWorkflowId!}
        />
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
              {activeNodeStore && (
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
              )}
            </Box>
          </div>
        )}
      </div>

      {/* Version History Drawer */}
      <Drawer
        anchor="right"
        open={isHistoryPanelOpen && !!currentWorkflowId}
        onClose={() => setHistoryPanelOpen(false)}
        variant="persistent"
        sx={{
          "& .MuiDrawer-paper": {
            width: 360,
            top: hideContent ? 0 : 40,
            height: hideContent ? "100%" : "calc(100% - 40px)"
          }
        }}
      >
        {currentWorkflowId && (
          <VersionHistoryPanel
            workflowId={currentWorkflowId}
            onRestore={handleRestoreVersion}
            onClose={() => setHistoryPanelOpen(false)}
          />
        )}
      </Drawer>
    </>
  );
};

export default TabsNodeEditor;
