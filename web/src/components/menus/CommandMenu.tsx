/** @jsxImportSource @emotion/react */
import { Command, CommandInput } from "cmdk";
import { NodeMetadata, Workflow } from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo, useMemo } from "react";
import { css, Dialog } from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import { isEqual } from "lodash";
import React from "react";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../contexts/NodeContext";
import { create } from "zustand";

type CommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
};

const styles = (theme: any) =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "800px",
      width: "40vw",
      background: "transparent",
      boxShadow: "none"
    }
  });

const WorkflowCommands = memo(() => {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const {
    nodes,
    edges,
    currentWorkflow,
    getWorkflow,
    workflowJSON,
    saveWorkflow,
    newWorkflow,
    autoLayout
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    currentWorkflow: state.workflow,
    getWorkflow: state.getWorkflow,
    workflowJSON: state.workflowJSON,
    saveWorkflow: state.saveWorkflow,
    newWorkflow: state.newWorkflow,
    autoLayout: state.autoLayout
  }));
  const run = useWorkflowRunnner((state) => state.run);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const runWorkflow = useCallback(() => {
    run({}, currentWorkflow, nodes, edges);
  }, [run, currentWorkflow, nodes, edges]);

  const saveExample = useWorkflowStore((state) => state.saveExample);
  const downloadWorkflow = useCallback(() => {
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${currentWorkflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflowJSON, currentWorkflow]);

  const copyWorkflow = useCallback(() => {
    writeClipboard(JSON.stringify(workflowJSON()), true, true);
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
      <Command.Item onSelect={() => executeAndClose(saveWorkflow)}>
        Save Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(newWorkflow)}>
        New Workflow
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(useWorkflowRunnner.getState().cancel)}
      >
        Cancel Workflow
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(autoLayout)}>
        Auto Layout
      </Command.Item>
      {process.env.NODE_ENV === "development" && (
        <Command.Item
          onSelect={() =>
            executeAndClose(() =>
              saveExample(currentWorkflow.id, getWorkflow())
            )
          }
        >
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

const UndoCommands = memo(({ undo, redo }: HistoryActions) => {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);

  return (
    <Command.Group heading="Undo">
      <Command.Item onSelect={() => executeAndClose(undo)}>Undo</Command.Item>
      <Command.Item onSelect={() => executeAndClose(redo)}>Redo</Command.Item>
    </Command.Group>
  );
});

const LayoutCommands = memo(() => {
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

const NodeCommands = memo(() => {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const reactFlowWrapper = useCommandMenu((state) => state.reactFlowWrapper);

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
    const metadata = useMetadataStore.getState().getAllMetadata();
    return metadata.reduce<Record<string, NodeMetadata[]>>((acc, curr) => {
      (acc[curr.namespace] = acc[curr.namespace] || []).push(curr);
      return acc;
    }, {});
  }, []);

  return (
    <>
      {Object.entries(groupedByCategory).map(([category, metadata], idx) => (
        <Command.Group key={idx} heading={category}>
          {metadata.map((meta, idx) => (
            <Command.Item
              key={idx}
              onSelect={() => executeAndClose(() => handleCreateNode(meta))}
            >
              {meta.title}
            </Command.Item>
          ))}
        </Command.Group>
      ))}
    </>
  );
});

const ExampleCommands = memo(() => {
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const navigate = useNavigate();

  const { data: examples } = useQuery({
    queryKey: ["examples"],
    queryFn: useWorkflowStore.getState().loadExamples
  });

  const loadExample = useCallback(
    (workflow: Workflow) => {
      useWorkflowStore
        .getState()
        .copy(workflow)
        .then((workflow) => {
          navigate("/editor/" + workflow.id);
        });
    },
    [navigate]
  );

  if (!examples) return null;

  return (
    <Command.Group heading="Examples">
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
}>((set) => ({
  executeAndClose: () => {},
  reactFlowWrapper: { current: null }
}));

const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  setOpen,
  undo,
  redo,
  reactFlowWrapper
}) => {
  const [pastePosition, setPastePosition] = useState({ x: 0, y: 0 });
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: examples } = useQuery({
    queryKey: ["examples"],
    queryFn: useWorkflowStore.getState().loadExamples
  });

  const { width: reactFlowWidth, height: reactFlowHeight } = useMemo(
    () =>
      reactFlowWrapper.current?.getBoundingClientRect() ?? {
        width: 800,
        height: 600
      },
    [reactFlowWrapper]
  );

  const { saveExample } = useWorkflowStore((state) => ({
    saveExample: state.saveExample
  }));

  const { addNotification } = useNotificationStore((state) => ({
    addNotification: state.addNotification
  }));

  const {
    nodes,
    edges,
    currentWorkflow,
    getWorkflow,
    workflowJSON,
    saveWorkflow,
    newWorkflow,
    autoLayout
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    currentWorkflow: state.workflow,
    getWorkflow: state.getWorkflow,
    workflowJSON: state.workflowJSON,
    saveWorkflow: state.saveWorkflow,
    newWorkflow: state.newWorkflow,
    autoLayout: state.autoLayout
  }));
  const run = useWorkflowRunnner((state) => state.run);

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
      css={styles}
    >
      <Command label="Command Menu" className="command-menu">
        <CommandInput ref={input} />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
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
