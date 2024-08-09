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

// does not work with object syntax
const styles = (theme: any) => css`
  .MuiDialog-paper {
    max-width: 800px;
    width: 30vw;
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
    border-radius: 8px;
    overflow: hidden;
    padding: 8px;
    color: ${theme.palette.c_gray1};
    font-family:
    box-shadow: 0 16px 8px rgb(0 0 0 / 20%);
    border: 1px solid ${theme.palette.c_gray8};
    background: ${theme.palette.c_gray1};
  }
  [cmdk-linear-badge] {
    height: 24px;
    padding: 0 8px;
    font-size: 12px;
    color: ${theme.palette.c_gray11};
    background: ${theme.palette.c_gray3};
    border-radius: 4px;
    width: fit-content;
    display: flex;
    align-items: center;
    margin: 16px 16px 0;
  }
  [cmdk-linear-shortcuts] {
    display: flex;
    margin-left: auto;
    gap: 8px;
  }
  [cmdk-linear-shortcuts] kbd {
    font-family: ${theme.fontFamily1};
    font-size: 13px;
    color: ${theme.palette.c_gray11};
  }
  [cmdk-input] {
    font-family: ${theme.fontFamily1};
    width: calc(100% - 20px);
    margin: 10px 5px 10px 10px;
    padding: 10px;
    font-size: 20px;
    border: 1px solid ${theme.palette.c_gray2};
    outline: 0;
    background: ${theme.palette.c_gray1};
    color: ${theme.palette.c_white};
    border-radius: 2px;
    transition: background 0.2s;
  }

  [cmdk-input]:hover,
  [cmdk-input]:focus,
  [cmdk-input]:active {
    background: ${theme.palette.c_gray2};
    border: 1px solid transparent;
  }
  [cmdk-input]::placeholder {
    color: ${theme.palette.c_gray9};
  }
  [cmdk-item] {
    position: relative;
    content-visibility: auto;
    cursor: pointer;
    height: 28px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 32px;
    color: ${theme.palette.c_white};
    user-select: none;
    will-change: background, color;
    transition: all 150ms ease;
    transition-property: none;
  }
  [cmdk-item][data-selected="true"] {
    background: ${theme.palette.c_gray2};
  }
  [cmdk-item][data-selected="true"] {
    color: ${theme.palette.c_gray6};
  }
  [cmdk-item][data-selected="true"] svg {
    color: ${theme.palette.c_gray6};
  }
  [cmdk-item][data-selected="true"]:after {
    content: "";
    position: absolute;
    left: 0;
    z-index: 123;
    width: 3px;
    height: 100%;
    background: ${theme.palette.c_hl1};
  }
  [cmdk-item][data-disabled="true"] {
    color: ${theme.palette.c_gray3};
    cursor: not-allowed;
  }
  [cmdk-item]:active {
    transition-property: background;
    background: ${theme.palette.c_gray2};
  }
  [cmdk-item] + [cmdk-item] {
    margin-top: 4px;
  }
  [cmdk-item] svg {
    width: 16px;
    height: 16px;
    color: ${theme.palette.c_gray5};
  }
  [cmdk-list] {
    height: 300px;
    max-height: 400px;
    overflow: auto;
    overscroll-behavior: contain;
    transition: 100ms ease;
    transition-property: height;
  }
  [cmdk-list-sizer] {
    padding-bottom: 20px;
  }
  [cmdk-group-heading] {
    user-select: none;
    font-size: 14px;
    font-weight: 600;
    margin: 20px 10px 10px;
    color: ${theme.palette.c_gray6};
    border-bottom: 1px solid ${theme.palette.c_gray2};
    padding: 8px;
    display: flex;
    align-items: center;
  }
  [cmdk-group-items] {
    width: 90%;
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
  // reactFlowWrapper: React.RefObject<HTMLDivElement>;
};

const CommandMenu = memo(function CommandMenu({
  open,
  setOpen,
  undo,
  redo
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
  const handleCreateNode = useCreateNode();
  // const runSelected = useWorkflowRunnner((state) => state.runSelected);
  // const { handleCopy, handlePaste } = useCopyPaste();

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

  return (
    <Dialog css={styles} open={open} onClose={() => setOpen(false)}>
      <Command label="Command Menu" className="command-menu">
        <CommandInput ref={input} />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Group heading="Workflow">
            <Command.Item onSelect={() => runWorkflow()}>
              Run Workflow
            </Command.Item>
            <Command.Item onSelect={downloadWorkflow}>
              Download Workflow as JSON
            </Command.Item>
            <Command.Item
              onSelect={() => {
                saveWorkflow();
                close();
              }}
            >
              Save Workflow
            </Command.Item>
            <Command.Item
              onSelect={() => {
                newWorkflow();
                close();
              }}
            >
              New Workflow
            </Command.Item>
            <Command.Item
              onSelect={() => {
                cancelWorkflow();
                close();
              }}
            >
              Cancel Workflow
            </Command.Item>
            <Command.Item
              onSelect={() => {
                autoLayout();
                close();
              }}
            >
              Auto Layout
            </Command.Item>
            {/* <Command.Item
              onSelect={() => {
                runSelected();
                close();
              }}
            >
              Run Selected Nodes
            </Command.Item> */}
          </Command.Group>

          <Command.Group heading="Undo">
            <Command.Item
              onSelect={() => {
                undo();
                close();
              }}
            >
              Undo
            </Command.Item>
            <Command.Item
              onSelect={() => {
                redo();
                close();
              }}
            >
              Redo
            </Command.Item>
          </Command.Group>

          {/* <Command.Group heading="Edit">
            <Command.Item
              onSelect={() => {
                handleCopy();
                close();
              }}
            >
              Copy
            </Command.Item>
            <Command.Item
              onSelect={() => {
                handlePaste();
                close();
              }}
            >
              Paste
            </Command.Item>
          </Command.Group> */}

          <Command.Group heading="Layout">
            <Command.Item
              onSelect={() => {
                alignNodes({ arrangeSpacing: false });
                close();
              }}
            >
              Align Nodes
            </Command.Item>
            <Command.Item
              onSelect={() => {
                alignNodes({ arrangeSpacing: true });
                close();
              }}
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
                      onSelect={() => handleCreateNode(meta)}
                    >
                      {meta.node_type.split(".").pop()}
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
