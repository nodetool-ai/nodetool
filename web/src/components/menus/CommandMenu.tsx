/** @jsxImportSource @emotion/react */
import { Command, CommandInput } from "cmdk";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo, useMemo } from "react";
import { useNodeStore } from "../../stores/NodeStore";
import { Dialog } from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import { css } from "@emotion/react";
import { useMetadata } from "../../serverState/useMetadata";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";

// does not work with object syntax
const styles = (theme: any) => css`
  .MuiDialog-paper {
    max-width: 800px;
    width: 40vw;
    background: transparent;
    box-shadow: none;
  }
  .command-menu {
    width: 100%;
    min-height: 400px;
  }

  [cmdk-dialog] {
    z-index: 9999;
  }

  [cmdk-root] {
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    padding: 8px;
    color: ${theme.palette.c_gray1};
    font-family: ${theme.fontFamily1};
    box-shadow: 0 20px 68px rgba(0, 0, 0, 0.55);
    border: 1px solid ${theme.palette.c_gray8};
    background: rgba(18, 18, 18, 0.8);
    backdrop-filter: blur(10px);
  }

  [cmdk-input] {
    font-family: ${theme.fontFamily1};
    width: calc(100% - 32px);
    margin: 16px;
    padding: 12px 16px;
    font-size: 20px;
    border: none;
    outline: none;
    background: rgba(255, 255, 255, 0.06);
    color: ${theme.palette.c_white};
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  [cmdk-input]:hover,
  [cmdk-input]:focus {
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 0 2px ${theme.palette.c_hl1};
  }

  [cmdk-input]::placeholder {
    color: ${theme.palette.c_gray9};
  }

  [cmdk-item] {
    position: relative;
    content-visibility: auto;
    cursor: pointer;
    height: 40px;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    color: ${theme.palette.c_gray6};
    user-select: none;
    will-change: background, color;
    transition: all 150ms ease;
    border-radius: 8px;
    margin: 0 8px;
  }

  [cmdk-item][data-selected="true"] {
    background: rgba(255, 255, 255, 0.1);
    color: ${theme.palette.c_white};
  }

  [cmdk-item][data-selected="true"]:after {
    content: "";
    position: absolute;
    left: 0;
    width: 3px;
    height: 20px;
    background: ${theme.palette.c_hl1};
    border-radius: 0 3px 3px 0;
    transition: all 150ms ease;
  }

  [cmdk-item]:active {
    background: rgba(255, 255, 255, 0.2);
  }

  [cmdk-item] svg {
    width: 18px;
    height: 18px;
    color: ${theme.palette.c_gray5};
  }

  [cmdk-list] {
    height: 330px;
    max-height: 400px;
    overflow: auto;
    overscroll-behavior: contain;
    transition: 100ms ease;
    transition-property: height;
    scrollbar-width: thin;
    scrollbar-color: ${theme.palette.c_gray6} transparent;
  }

  [cmdk-list]::-webkit-scrollbar {
    width: 6px;
  }

  [cmdk-list]::-webkit-scrollbar-thumb {
    background-color: ${theme.palette.c_gray6};
    border-radius: 3px;
  }

  [cmdk-group-heading] {
    user-select: none;
    font-size: 12px;
    font-weight: 600;
    margin: 16px 16px 8px;
    color: ${theme.palette.c_gray3};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  [cmdk-empty] {
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    white-space: pre-wrap;
    color: ${theme.palette.c_gray6};
  }
`;

type CommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;
};

const CommandMenu = memo(function CommandMenu({
  open,
  setOpen,
  undo,
  redo,
  reactFlowWrapper
}: CommandMenuProps) {
  const saveWorkflow = useNodeStore((state) => state.saveWorkflow);
  const newWorkflow = useNodeStore((state) => state.newWorkflow);
  const runWorkflow = useWorkflowRunnner((state) => state.run);
  const cancelWorkflow = useWorkflowRunnner((state) => state.cancel);
  const autoLayout = useNodeStore((state) => state.autoLayout);
  const workflowJSON = useNodeStore((state) => state.workflowJSON);
  const workflow = useNodeStore((state) => state.workflow);
  const input = useRef<HTMLInputElement>(null);
  const [pastePosition, setPastePosition] = useState({ x: 0, y: 0 });
  const alignNodes = useAlignNodes();
  const { data } = useMetadata();
  const { width: reactFlowWidth, height: reactFlowHeight } =
    reactFlowWrapper.current?.getBoundingClientRect() ?? {
      width: 800,
      height: 600
    };
  const handleCreateNode = useCreateNode({
    x: reactFlowWidth / 2,
    y: reactFlowHeight / 2
  });
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  // const runSelected = useWorkflowRunnner((state) => state.runSelected);
  // const { handleCopy, handlePaste } = useCopyPaste();
  const { writeClipboard } = useClipboard();

  useEffect(() => {
    const focusInput = () => {
      const inputElement = document.querySelector("input[cmdk-input]");
      (inputElement as HTMLInputElement)?.focus();
    };
    if (open) {
      // Delay focus to ensure the element is in the DOM
      setTimeout(focusInput, 0);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setPastePosition(getMousePosition());
    }
  }, [open, pastePosition]);

  const groupedByCategory = useMemo(
    () =>
      data?.metadata.reduce<Record<string, NodeMetadata[]>>((acc, curr) => {
        (acc[curr.namespace] = acc[curr.namespace] || []).push(curr);
        return acc;
      }, {}),
    [data?.metadata]
  );

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const downloadWorkflow = useCallback(() => {
    const json = workflowJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${workflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflowJSON, workflow.name]);

  const copyWorkflow = useCallback(() => {
    writeClipboard(JSON.stringify(workflow), true, true);
    addNotification({
      type: "info",
      alert: true,
      content: "Copied workflow JSON to Clipboard!"
    });
  }, [addNotification, workflow, writeClipboard]);

  const executeAndClose = useCallback(
    (action: () => void) => {
      action();
      close();
    },
    [close]
  );

  return (
    <Dialog css={styles} open={open} onClose={() => setOpen(false)}>
      <Command label="Command Menu" className="command-menu">
        <CommandInput ref={input} />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
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
            <Command.Item onSelect={() => executeAndClose(cancelWorkflow)}>
              Cancel Workflow
            </Command.Item>
            <Command.Item onSelect={() => executeAndClose(autoLayout)}>
              Auto Layout
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Undo">
            <Command.Item onSelect={() => executeAndClose(undo)}>
              Undo
            </Command.Item>
            <Command.Item onSelect={() => executeAndClose(redo)}>
              Redo
            </Command.Item>
          </Command.Group>

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

          {groupedByCategory &&
            Object.entries(groupedByCategory).map((entry, idx) => {
              const [category, metadata] = entry;
              return (
                <Command.Group key={idx} heading={category}>
                  {metadata.map((meta, idx) => (
                    <Command.Item
                      key={idx}
                      onSelect={() =>
                        executeAndClose(() => handleCreateNode(meta))
                      }
                    >
                      {meta.title}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
        </Command.List>
      </Command>
    </Dialog>
  );
});

export default CommandMenu;
