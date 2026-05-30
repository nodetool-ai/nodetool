/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  workflowQueryKey,
  fetchWorkflowById
} from "../../serverState/useWorkflow";
import NodeEditor from "../node_editor/NodeEditor";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../contexts/NodeContext";
import StatusMessage from "../panels/StatusMessage";
import { Workflow, WorkflowAttributes } from "../../stores/ApiTypes";
import { generateCSS } from "../themes/GenerateCSS";
import { useMediaQuery } from "@mui/material";
import { FlexColumn } from "../ui_primitives";

import TabsBar from "./TabsBar";
import ChainEditorBridge from "../chain_editor/ChainEditorBridge";
import FileTabContent from "./FileTabContent";
import KeyboardProvider from "../KeyboardProvider";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ConnectableNodesProvider } from "../../providers/ConnectableNodesProvider";
import FloatingToolBar from "../panels/FloatingToolBar";
import QueueOverlay from "../panels/QueueOverlay";
import NodeCreateBridge from "./NodeCreateBridge";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  useAutosave,
  triggerAutosaveForWorkflow
} from "../../hooks/useAutosave";
import { useSettingsStore } from "../../stores/SettingsStore";
import type { NodeStore } from "../../stores/NodeStore";
import { useFileTabsStore } from "../../stores/FileTabsStore";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import SubgraphTabContent from "./SubgraphTabContent";

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
      alignItems: "stretch",
      position: "relative",
      paddingLeft: "28px",
      height: "34px",
      width: "100%",
      WebkitAppRegion: "drag",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      userSelect: "none"
    },
    "& .tabs": {
      flex: 1,
      zIndex: 1000,
      display: "flex",
      flexWrap: "nowrap",
      alignItems: "stretch",
      overflowX: "auto",
      overflowY: "hidden",
      whiteSpace: "nowrap",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      position: "relative",
      WebkitAppRegion: "drag",

      "&::-webkit-scrollbar": {
        display: "none"
      }
    },
    "& .tab": {
      WebkitAppRegion: "no-drag",
      padding: "0 12px 0 14px",
      height: "34px",
      display: "flex",
      flexWrap: "nowrap",
      alignItems: "center",
      gap: "10px",
      minWidth: "170px",
      flex: "0 0 auto",
      cursor: "default",
      color: theme.vars.palette.text.secondary,
      background: "transparent",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 400,
      lineHeight: 1,
      transition: "color 120ms, background-color 120ms",
      position: "relative",
      boxSizing: "border-box",

      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.03)"
      },

      "&.active": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "var(--c_editor_bg_color)",
        zIndex: 2,
        "&:hover": {
          backgroundColor: "var(--c_editor_bg_color)"
        },
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: theme.vars.palette.primary.main
        }
      },

      "& .tab-name": {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0
      },

      "& .dirty-dot": {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.primary.main,
        marginLeft: "-4px",
        flexShrink: 0,
        display: "inline-block"
      },

      "& .close-icon": {
        width: "18px",
        height: "18px",
        padding: "4px",
        boxSizing: "border-box",
        borderRadius: "3px",
        fontSize: "var(--fontSizeSmaller)",
        color: theme.vars.palette.text.disabled,
        cursor: "pointer",
        flexShrink: 0,
        transition: "color 120ms, background-color 120ms",
        "&:hover": {
          color: theme.vars.palette.text.primary,
          backgroundColor: "rgba(255,255,255,0.06)"
        }
      }
    },
    "& .tab.drop-target::before": {
      content: '""',
      position: "absolute",
      left: 0,
      top: "20%",
      bottom: "20%",
      right: "auto",
      height: "auto",
      width: "2px",
      background: "var(--palette-primary-main)",
      boxShadow: "none"
    },
    "& .tab.drop-target-right::after": {
      content: '""',
      position: "absolute",
      right: 0,
      top: "20%",
      bottom: "20%",
      width: "2px",
      background: "var(--palette-primary-main)",
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
      height: "34px",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: theme.vars.palette.text.disabled,
      transition: "color 120ms, background-color 120ms",
      padding: 0,
      flexShrink: 0,
      visibility: "visible",

      "&[data-hidden='true']": {
        visibility: "hidden"
      },

      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.03)"
      },

      "&:disabled": {
        opacity: 0.3,
        "&:hover": {
          color: theme.vars.palette.text.disabled,
          background: "transparent"
        }
      },

      "& svg": {
        fontSize: "var(--fontSizeNormal)"
      }
    },
    "& .new-workflow-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "34px",
      background: "transparent",
      border: "none",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      cursor: "pointer",
      padding: 0,
      color: theme.vars.palette.text.disabled,
      transition: "color 120ms, background-color 120ms",
      WebkitAppRegion: "no-drag",
      position: "relative",
      zIndex: 1001,

      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.03)"
      },

      "& svg": {
        fontSize: "var(--fontSizeNormal)"
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
      fontSize: "var(--fontSizeNormal)",
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

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

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

  const nodeStores = useWorkflowManager((state) => state.nodeStores);

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

  // Use the autosave hook
  useAutosave({
    workflowId: currentWorkflowId || null,
    getWorkflow: getWorkflowForAutosave,
    isDirty: getIsDirty
  });

  // Save previous workflow when switching tabs
  const prevWorkflowIdRef = useRef<string | null>(null);
  const prevNodeStoreRef = useRef<NodeStore | undefined>(undefined);

  useEffect(() => {
    const prevId = prevWorkflowIdRef.current;
    const prevStore = prevNodeStoreRef.current;

    // Update refs for next tab switch
    prevWorkflowIdRef.current = currentWorkflowId || null;
    prevNodeStoreRef.current = activeNodeStore;

    // If tab actually changed and we have a previous store, autosave it
    if (prevId && prevId !== currentWorkflowId && prevStore) {
      const autosaveSettings = useSettingsStore.getState().settings.autosave;
      if (!autosaveSettings?.enabled) {return;}

      const prevState = prevStore.getState();
      if (prevState.workflowIsDirty) {
        const workflow = prevState.getWorkflow();
        if (workflow?.graph?.nodes && workflow.graph.nodes.length > 0) {
          triggerAutosaveForWorkflow(prevId, workflow.graph, "autosave", {
            description: "Before tab switch",
            force: true,
            maxVersions: autosaveSettings.maxVersionsPerWorkflow
          });
        }
      }
    }
  }, [currentWorkflowId, activeNodeStore]);

  // Determine tab ids: storage open ids + currently loaded ones + active id
  // Seed from localStorage on mount to show placeholders during hydration,
  // then keep this in sync with store updates so UI reflects removals immediately.
  const [storageOpenIds, setStorageOpenIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("openWorkflows");
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as string[] : [];
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
  // Uses shared query key and staleTime for proper deduplication
  const queryResults = useQueries({
    queries: idsForTabs.map((id) => ({
      queryKey: workflowQueryKey(id),
      queryFn: async () => {
        try {
          return await fetchWorkflowById(id);
        } catch (error) {
          const code = (error as { data?: { code?: string } })?.data?.code;
          const message = (error as { message?: string })?.message ?? "";
          if (
            code === "NOT_FOUND" ||
            String(error).includes("404") ||
            /not found/i.test(message)
          ) {
            return { __missing: true, id };
          }
          throw error;
        }
      },
      staleTime: 60 * 1000,
      retry: false,
      enabled: !openMap.has(id)
    }))
  });

  useEffect(() => {
    const missingIds = idsForTabs.filter((id, index) => {
      const res = queryResults[index];
      return Boolean(res?.data && "__missing" in res.data);
    });
    if (missingIds.length === 0) {
      return;
    }
    const missingIdSet = new Set(missingIds);
    const filtered = storageOpenIds.filter((id) => !missingIdSet.has(id));
    if (areStringArraysEqual(filtered, storageOpenIds)) {
      return;
    }

    setStorageOpenIds(filtered);
    try {
      localStorage.setItem("openWorkflows", JSON.stringify(filtered));
    } catch {
      // Ignore storage failures to avoid blocking rendering.
    }
  }, [idsForTabs, queryResults, storageOpenIds]);

  const tabsToRender = useMemo(() => {
    return idsForTabs.map((id, index) => {
      const loaded = openMap.get(id);
      if (loaded) {
        return loaded;
      }
      const res = queryResults[index];
      if (res && res.data && !("__missing" in res.data)) {
        const { graph: _graph, ...attrs } = res.data as Workflow;
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
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const editorViewMode = useSettingsStore((s) => s.settings.editorViewMode);
  const setEditorViewMode = useSettingsStore((s) => s.setEditorViewMode);

  // On mobile, default to chain view (persisted — only runs once)
  const hasSetMobileDefault = useRef(false);
  useEffect(() => {
    if (isMobile && editorViewMode === "graph" && !hasSetMobileDefault.current) {
      hasSetMobileDefault.current = true;
      setEditorViewMode("chain");
    }
  }, [isMobile, editorViewMode, setEditorViewMode]);

  const showChainView = editorViewMode === "chain";

  const activeFileTabId = useFileTabsStore((state) => state.activeFileTabId);
  const openFileTabs = useFileTabsStore((state) => state.openFileTabs);
  const activeFileTab = useMemo(
    () =>
      activeFileTabId
        ? openFileTabs.find((t) => t.asset.id === activeFileTabId)
        : undefined,
    [activeFileTabId, openFileTabs]
  );

  const activeSubgraphKey = useSubgraphTabsStore((state) => state.activeKey);
  const subgraphTabs = useSubgraphTabsStore((state) => state.tabs);
  const activeSubgraphTab = useMemo(
    () =>
      activeSubgraphKey
        ? subgraphTabs.find((t) => t.key === activeSubgraphKey)
        : undefined,
    [activeSubgraphKey, subgraphTabs]
  );

  return (
    <>
      <div
        css={styles(theme)}
        className="tabs-node-editor"
        style={{
          top: hideContent || isMobile ? 0 : 40,
          height: hideContent || isMobile ? "100%" : "calc(100% - 40px)"
        }}
      >
        {!isMobile && (
          <TabsBar
            workflows={tabsToRender}
            currentWorkflowId={currentWorkflowId!}
          />
        )}
        {!hideContent && (
          <div
            className="editor-container"
            css={generateCSS}
            style={{ flex: 1, minHeight: 0, minWidth: 0 }}
          >
            {activeFileTab && (
              <FlexColumn
                key={`file-${activeFileTab.asset.id}`}
                fullWidth
                fullHeight
                sx={{
                  overflow: "hidden",
                  position: "absolute",
                  minHeight: 0,
                  minWidth: 0
                }}
              >
                <FileTabContent asset={activeFileTab.asset} />
              </FlexColumn>
            )}
            {activeSubgraphTab && !activeFileTab && (
              <SubgraphTabContent
                key={activeSubgraphTab.key}
                tab={activeSubgraphTab}
              />
            )}
            {openWorkflows.map((workflow) => {
              const store = nodeStores[workflow.id];
              if (!store) return null;
              const isActive =
                workflow.id === currentWorkflowId &&
                !activeFileTab &&
                !activeSubgraphTab;
              return (
                <FlexColumn
                  key={workflow.id}
                  fullWidth
                  fullHeight
                  sx={{
                    overflow: "hidden",
                    position: "absolute",
                    minHeight: 0,
                    minWidth: 0,
                    opacity: isActive ? 1 : 0,
                    pointerEvents: isActive ? "auto" : "none",
                    zIndex: isActive ? 1 : 0
                  }}
                >
                  <NodeContext.Provider value={store}>
                    {showChainView ? (
                      <ReactFlowProvider>
                        <ChainEditorBridge isActive={isActive} />
                        {isActive && <FloatingToolBar />}
                      </ReactFlowProvider>
                    ) : (
                      <ReactFlowProvider>
                        <ContextMenuProvider>
                          <ConnectableNodesProvider>
                            <KeyboardProvider>
                              {isActive && (
                                <div className="status-message-container">
                                  <StatusMessage />
                                </div>
                              )}
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
                                  workflowId={workflow.id}
                                  active={isActive}
                                />
                              </div>
                              {isActive && <FloatingToolBar />}
                              {isActive && <QueueOverlay />}
                              {isActive && <NodeCreateBridge />}
                            </KeyboardProvider>
                          </ConnectableNodesProvider>
                        </ContextMenuProvider>
                      </ReactFlowProvider>
                    )}
                  </NodeContext.Provider>
                </FlexColumn>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default TabsNodeEditor;
