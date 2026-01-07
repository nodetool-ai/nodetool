/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Command, CommandInput, CommandSeparator } from "cmdk";
import { NodeMetadata, Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo, useMemo } from "react";
import { Dialog, Tooltip } from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import isEqual from "lodash/isEqual";
import React from "react";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../contexts/NodeContext";
import { create } from "zustand";
import NodeInfo from "../node_menu/NodeInfo";
import { isDevelopment } from "../../stores/ApiClient";
import { useWorkflowSearch } from "../../hooks/useWorkflowSearch";

type CommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
};

const styles = () =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "800px",
      width: "40vw",
      background: "transparent",
      boxShadow: "none"
    }
  });

const WorkflowCommands = memo(function WorkflowCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const {
    nodes,
    edges,
    currentWorkflow,
    workflowJSON,
    autoLayout
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    currentWorkflow: state.workflow,
    workflowJSON: state.workflowJSON,
    autoLayout: state.autoLayout
  }));
  const run = useWebsocketRunner((state) => state.run);
  const cancel = useWebsocketRunner((state) => state.cancel);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runWorkflow = useCallback(() => {
    run({}, currentWorkflow, nodes, edges);
  }, [run, currentWorkflow, nodes, edges]);

  const saveExample = useWorkflowManager((state) => state.saveExample);
  const downloadWorkflow = useCallback(() => {
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${currentWorkflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflowJSON, currentWorkflow]);

  const copyWorkflow = useCallback(() => {
    writeClipboard(workflowJSON(), true, true);
    addNotification({
      type: "info",
      alert: true,
      content: "Copied workflow JSON to Clipboard!"
    });
  }, [writeClipboard, workflowJSON, addNotification]);

  return (
    <Command.Group heading="Workflow">
      <Command.Item onSelect={() => executeAndClose(runWorkflow)}>
        Run Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(downloadWorkflow)}>
        Download Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(copyWorkflow)}>
        Copy Workflow as JSON
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(cancel)}>
        Cancel Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(autoLayout)}>
        Auto Layout
      </Command.Item>
      {isDevelopment && (
        <Command.Item onSelect={() => executeAndClose(() => saveExample(""))}>
          Save as Example
        </Command.Item>
      )}
    </Command.Group>
  );
});

interface HistoryActions {
  undo: () => void;
  redo: () => void;
}

const UndoCommands = memo(function UndoCommands({
  undo,
  redo
}: HistoryActions) {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);

  return (
    <Command.Group heading="Undo">
      <Command.Item onSelect={() => executeAndClose(undo)}>Undo</Command.Item>
      <Command.Item onSelect={() => executeAndClose(redo)}>Redo</Command.Item>
    </Command.Group>
  );
});

const LayoutCommands = memo(function LayoutCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const alignNodes = useAlignNodes();

  return (
    <Command.Group heading="Layout">
      <Command.Item
        onSelect={() =>
          executeAndClose(() => alignNodes({ arrangeSpacing: false }))
        }
      >
        Align Nodes
      </Command.Item>
      <Command.Item
        onSelect={() =>
          executeAndClose(() => alignNodes({ arrangeSpacing: true }))
        }
      >
        Align Nodes with Spacing
      </Command.Item>
    </Command.Group>
  );
});

const NodeCommands = memo(function NodeCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const reactFlowWrapper = useCommandMenu((state) => state.reactFlowWrapper);
  // const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const { width: reactFlowWidth, height: reactFlowHeight } = useMemo(
    () =>
      reactFlowWrapper.current?.getBoundingClientRect() ?? {
        width: 800,
        height: 600
      },
    [reactFlowWrapper]
  );

  const handleCreateNode = useCreateNode({
    x: reactFlowWidth / 2,
    y: reactFlowHeight / 2
  });

  const groupedByCategory = useMemo(() => {
    const metadata = useMetadataStore.getState().metadata;
    return Object.values(metadata).reduce<Record<string, NodeMetadata[]>>(
      (acc, curr) => {
        (acc[curr.namespace] = acc[curr.namespace] || []).push(curr);
        return acc;
      },
      {}
    );
  }, []);

  return (
    <>
      {Object.entries(groupedByCategory).map(([category, metadata], idx) => (
        <Command.Group key={idx} heading={category}>
          {metadata.map((meta, idx) => (
            <Tooltip
              key={idx}
              title={<NodeInfo nodeMetadata={meta} />}
              placement="right"
              enterDelay={0}
              leaveDelay={0}
              TransitionProps={{ timeout: 0 }}
              // open={hoveredItem === meta.title}
            >
              <Command.Item
                key={idx}
                onSelect={() => executeAndClose(() => handleCreateNode(meta))}
                // onMouseEnter={() => setHoveredItem(meta.title)}
                // onMouseLeave={() => setHoveredItem(null)}
                // onFocus={() => setHoveredItem(meta.title)}
                // onBlur={() => setHoveredItem(null)}
              >
                {meta.title}
              </Command.Item>
            </Tooltip>
          ))}
        </Command.Group>
      ))}
    </>
  );
});

const ExampleCommands = memo(function ExampleCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const navigate = useNavigate();
  const { loadTemplates, copy } = useWorkflowManager((state) => ({
    loadTemplates: state.loadTemplates,
    copy: state.copy
  }));

  const { data: examples } = useQuery<WorkflowList>({
    queryKey: ["templates"],
    queryFn: loadTemplates
  });

  const loadExample = useCallback(
    (workflow: Workflow) => {
      copy(workflow).then((workflow) => {
        navigate("/editor/" + workflow.id);
      });
    },
    [copy, navigate]
  );

  if (!examples) {return null;}

  return (
    <Command.Group heading="Templates">
      {examples.workflows.map((example, idx) => (
        <Command.Item
          key={idx}
          onSelect={() => executeAndClose(() => loadExample(example))}
        >
          {example.name}
        </Command.Item>
      ))}
    </Command.Group>
  );
});

// Create a context/store for command menu state
const useCommandMenu = create<{
  executeAndClose: (action: () => void) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
}>((_set) => ({
  executeAndClose: () => {},
  reactFlowWrapper: { current: null }
}));

interface NodeSearchResult {
  id: string;
  label: string;
  type: string;
  position: { x: number; y: number };
}

const NodeSearchCommands = memo(function NodeSearchCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const [searchQuery, setSearchQuery] = useState("");
  const { searchNodes, focusNode, addToRecent } = useWorkflowSearch();
  const nodes = useNodes((state) => state.nodes);

  const results = useMemo<NodeSearchResult[]>(() => {
    return searchNodes(searchQuery);
  }, [searchNodes, searchQuery]);

  const handleSelectNode = useCallback(
    (node: NodeSearchResult) => {
      executeAndClose(() => {
        focusNode(node.id);
        addToRecent({ id: node.id, type: "node", name: node.label });
      });
    },
    [executeAndClose, focusNode, addToRecent]
  );

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Command.Group heading="Search Nodes">
      <Command.Input
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search nodes in current workflow..."
        css={css({
          width: "100%",
          padding: "8px 12px",
          marginBottom: "8px",
          borderRadius: "4px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.2)",
          color: "inherit",
          fontSize: "14px",
          "&::placeholder": {
            color: "rgba(255,255,255,0.5)"
          },
          "&:focus": {
            outline: "none",
            borderColor: "rgba(255,255,255,0.3)"
          }
        })}
      />
      {results.length > 0 && (
        <>
          {results.slice(0, 10).map((node) => (
            <Command.Item
              key={node.id}
              onSelect={() => handleSelectNode(node)}
              css={css({
                padding: "8px 12px",
                cursor: "pointer",
                borderRadius: "4px",
                "&[data-selected]": {
                  backgroundColor: "rgba(255,255,255,0.1)"
                }
              })}
            >
              <span css={css({ fontWeight: 500 })}>{node.label}</span>
              <span
                css={css({
                  fontSize: "12px",
                  opacity: 0.6,
                  marginLeft: "8px"
                })}
              >
                {node.type}
              </span>
            </Command.Item>
          ))}
        </>
      )}
      {searchQuery && results.length === 0 && (
        <Command.Empty css={css({ padding: "8px", opacity: 0.6 })}>
          No nodes found
        </Command.Empty>
      )}
    </Command.Group>
  );
});

const WorkflowNavigationCommands = memo(function WorkflowNavigationCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const { searchWorkflows, addToRecent } = useWorkflowSearch();
  const { openWorkflows } = useWorkflowManager((state) => ({
    openWorkflows: state.openWorkflows
  }));

  const results = useMemo(() => {
    return searchWorkflows(searchQuery);
  }, [searchWorkflows, searchQuery]);

  const handleSelectWorkflow = useCallback(
    (workflow: { id: string; name: string }) => {
      executeAndClose(() => {
        navigate("/editor/" + workflow.id);
        addToRecent({ id: workflow.id, type: "workflow", name: workflow.name });
      });
    },
    [executeAndClose, navigate, addToRecent]
  );

  return (
    <Command.Group heading="Go to Workflow">
      <Command.Input
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search workflows..."
        css={css({
          width: "100%",
          padding: "8px 12px",
          marginBottom: "8px",
          borderRadius: "4px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.2)",
          color: "inherit",
          fontSize: "14px",
          "&::placeholder": {
            color: "rgba(255,255,255,0.5)"
          },
          "&:focus": {
            outline: "none",
            borderColor: "rgba(255,255,255,0.3)"
          }
        })}
      />
      {results.length > 0 && (
        <>
          {results.slice(0, 10).map((workflow) => {
            const isOpen = openWorkflows.some((w) => w.id === workflow.id);
            return (
              <Command.Item
                key={workflow.id}
                onSelect={() => handleSelectWorkflow(workflow)}
                css={css({
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  "&[data-selected]": {
                    backgroundColor: "rgba(255,255,255,0.1)"
                  }
                })}
              >
                <span css={css({ fontWeight: 500 })}>{workflow.name}</span>
                {isOpen && (
                  <span
                    css={css({
                      fontSize: "10px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(76, 175, 80, 0.3)"
                    })}
                  >
                    OPEN
                  </span>
                )}
              </Command.Item>
            );
          })}
        </>
      )}
      {searchQuery && results.length === 0 && (
        <Command.Empty css={css({ padding: "8px", opacity: 0.6 })}>
          No workflows found
        </Command.Empty>
      )}
    </Command.Group>
  );
});

const RecentCommands = memo(function RecentCommands() {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const { recentItems, focusNode } = useWorkflowSearch();
  const navigate = useNavigate();

  const handleSelectRecent = useCallback(
    (item: { id: string; type: "node" | "workflow"; name: string }) => {
      executeAndClose(() => {
        if (item.type === "node") {
          focusNode(item.id);
        } else {
          navigate("/editor/" + item.id);
        }
      });
    },
    [executeAndClose, focusNode, navigate]
  );

  if (recentItems.length === 0) {
    return null;
  }

  return (
    <Command.Group heading="Recent">
      {recentItems.slice(0, 5).map((item) => (
        <Command.Item
          key={`${item.type}-${item.id}`}
          onSelect={() => handleSelectRecent(item)}
          css={css({
            padding: "8px 12px",
            cursor: "pointer",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            "&[data-selected]": {
              backgroundColor: "rgba(255,255,255,0.1)"
            }
          })}
        >
          <span css={css({ fontWeight: 500 })}>{item.name}</span>
          <span
            css={css({
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              backgroundColor:
                item.type === "node"
                  ? "rgba(33, 150, 243, 0.3)"
                  : "rgba(156, 39, 176, 0.3)"
            })}
          >
            {item.type.toUpperCase()}
          </span>
        </Command.Item>
      ))}
    </Command.Group>
  );
});

const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  setOpen,
  undo,
  redo,
  reactFlowWrapper
}) => {
  const [pastePosition, setPastePosition] = useState({ x: 0, y: 0 });
  const input = useRef<HTMLInputElement>(null);

  const executeAndClose = useCallback(
    (action: () => void) => {
      action();
      setOpen(false);
    },
    [setOpen]
  );

  // Set up command menu context
  useEffect(() => {
    useCommandMenu.setState({
      executeAndClose,
      reactFlowWrapper
    });
  }, [executeAndClose, reactFlowWrapper]);

  useEffect(() => {
    const focusInput = () => {
      const inputElement = document.querySelector("input[cmdk-input]");
      (inputElement as HTMLInputElement)?.focus();
    };
    if (open) {
      setTimeout(focusInput, 0);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setPastePosition(getMousePosition());
    }
  }, [open, pastePosition]);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      className="command-menu-dialog"
      css={styles()}
    >
      <Command label="Command Menu" className="command-menu">
        <CommandInput ref={input} />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <RecentCommands />
          <CommandSeparator />
          <WorkflowNavigationCommands />
          <CommandSeparator />
          <NodeSearchCommands />
          <CommandSeparator />
          <WorkflowCommands />
          <UndoCommands undo={undo} redo={redo} />
          <LayoutCommands />
          <NodeCommands />
          <ExampleCommands />
        </Command.List>
      </Command>
    </Dialog>
  );
};

export default React.memo(CommandMenu, isEqual);
