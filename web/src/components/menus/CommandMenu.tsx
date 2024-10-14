/** @jsxImportSource @emotion/react */
import { Command, CommandInput } from "cmdk";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo, useMemo } from "react";
import { useNodeStore } from "../../stores/NodeStore";
import { css, Dialog } from "@mui/material";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import { isEqual } from "lodash";
import React from "react";
import { onBlur, onFocus } from "../../stores/KeyPressedStore";
import useMetadataStore from "../../stores/MetadataStore";

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

const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  setOpen,
  undo,
  redo,
  reactFlowWrapper
}) => {
  const saveWorkflow = useNodeStore((state) => state.saveWorkflow);
  const newWorkflow = useNodeStore((state) => state.newWorkflow);
  const runWorkflow = useWorkflowRunnner((state) => state.run);
  const cancelWorkflow = useWorkflowRunnner((state) => state.cancel);
  const autoLayout = useNodeStore((state) => state.autoLayout);
  const workflowJSON = useNodeStore((state) => state.workflowJSON);
  const workflow = useNodeStore((state) => state.workflow);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

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

  const [pastePosition, setPastePosition] = useState({ x: 0, y: 0 });
  const alignNodes = useAlignNodes();
  const input = useRef<HTMLInputElement>(null);
  const { writeClipboard } = useClipboard();
  const metadata = useMetadataStore((state) => state.getAllMetadata());
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
      metadata.reduce<Record<string, NodeMetadata[]>>((acc, curr) => {
        (acc[curr.namespace] = acc[curr.namespace] || []).push(curr);
        return acc;
      }, {}),
    [metadata]
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
  }, [workflow.name, workflowJSON]);

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
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      className="command-menu-dialog"
      css={styles}
    >
      <Command label="Command Menu" className="command-menu">
        <CommandInput ref={input} onFocus={onFocus} onBlur={onBlur} />
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
};

export default React.memo(CommandMenu, isEqual);
