/**
 * CodeAssistantDialog — edit a Code node's body with an AI co-writer.
 *
 * A large dialog with a Monaco editor on the left, editing a **draft** of the
 * node's code, and the assistant chat panel on the right. The dialog registers
 * a handler on the code assistant bridge, so the chat agent's `ui_code_*`
 * tools read and mutate the same draft the editor shows — edits appear live.
 *
 * Nothing is persisted before Apply: Apply writes the draft code, ports, and
 * packages back to the node in one undoable update; Cancel leaves the node
 * untouched (and the host's discard plan removes a node created only to open
 * the dialog).
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { shallow } from "zustand/shallow";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import {
  BORDER_RADIUS,
  Box,
  Chip,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  Text,
  TYPOGRAPHY
} from "../../ui_primitives";
import { useNodes } from "../../../contexts/NodeContext";
import { useMonacoEditor } from "../../../hooks/editor/useMonacoEditor";
import type { TypeMetadata } from "../../../stores/ApiTypes";
import type { DynamicSlotDeclaration } from "../../../stores/NodeData";
import {
  defaultValueForType,
  normalizeTypeMetadata
} from "../../../utils/dynamicSlots";
import type {
  CodeAssistantPort,
  CodeAssistantState
} from "./codeAssistantBridge";
import { registerCodeAssistantHandler } from "./codeAssistantBridge";
import CodeAssistantChatPanel from "./CodeAssistantChatPanel";
import ResizableSideDock from "../../chat/assistant/ResizableSideDock";

const CHAT_PANEL_WIDTH = 360;

export interface CodeAssistantDialogProps {
  open: boolean;
  /** The Code node the applied draft is written to. */
  nodeId: string;
  onClose: () => void;
  /** Typed inputs seeded from a source handle (store request). */
  inputs?: readonly codeGen.CodeGenInputPort[];
  /** Set when launched from a destination handle (store request). */
  expectedOutput?: codeGen.CodeGenExpectedOutput;
}

/** A saved `packages` entry is a specifier string or a declaration object. */
const packageSpecifier = (entry: unknown): string | null => {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry !== null && typeof entry === "object") {
    const specifier = (entry as { specifier?: unknown }).specifier;
    if (typeof specifier === "string") {
      return specifier;
    }
  }
  return null;
};

const PortChips = ({
  label,
  ports
}: {
  label: string;
  ports: readonly CodeAssistantPort[];
}) => (
  <FlexRow gap={SPACING.xs} align="center" sx={{ flexWrap: "wrap" }}>
    <Label>{label}</Label>
    {ports.length === 0 ? (
      <Text size="smaller" color="secondary">
        none
      </Text>
    ) : (
      ports.map((port) => (
        <Chip key={port.name} compact label={`${port.name}: ${port.type}`} />
      ))
    )}
  </FlexRow>
);

const CodeAssistantDialogInner = ({
  open,
  nodeId,
  onClose,
  inputs,
  expectedOutput
}: CodeAssistantDialogProps) => {
  const { findNode, updateNodeData } = useNodes(
    (state) => ({
      findNode: state.findNode,
      updateNodeData: state.updateNodeData
    }),
    shallow
  );

  // The dialog mounts fresh on every open (both hosts render it
  // conditionally), so the draft seeds once from the node's current state.
  const [seed] = useState(() => {
    const node = findNode(nodeId);
    const data = node?.data;
    const code =
      typeof data?.properties?.code === "string"
        ? (data.properties.code as string)
        : "";
    const inputPorts: CodeAssistantPort[] = Object.entries(
      data?.dynamic_inputs ?? {}
    ).map(([name, slot]) => ({ name, type: slot.type?.type ?? "any" }));
    for (const port of inputs ?? []) {
      if (!inputPorts.some((existing) => existing.name === port.name)) {
        inputPorts.push({ name: port.name, type: port.type.type });
      }
    }
    const outputPorts: CodeAssistantPort[] = Object.entries(
      data?.dynamic_outputs ?? {}
    ).map(([name, type]) => ({ name, type: type?.type ?? "any" }));
    if (
      expectedOutput &&
      !outputPorts.some((existing) => existing.name === expectedOutput.name)
    ) {
      outputPorts.push({
        name: expectedOutput.name,
        type: expectedOutput.type.type
      });
    }
    const packages = (
      Array.isArray(data?.properties?.packages)
        ? (data.properties.packages as unknown[])
        : []
    )
      .map(packageSpecifier)
      .filter((specifier): specifier is string => specifier !== null);
    return {
      code,
      inputs: inputPorts,
      outputs: outputPorts,
      packages,
      title: data?.title
    };
  });

  const [draftCode, setDraftCode] = useState(seed.code);
  const [draftInputs, setDraftInputs] = useState<CodeAssistantPort[]>(
    seed.inputs
  );
  const [draftOutputs, setDraftOutputs] = useState<CodeAssistantPort[]>(
    seed.outputs
  );
  const [draftPackages, setDraftPackages] = useState<string[]>(seed.packages);

  // The bridge handler reads through refs so it always sees the latest draft
  // without re-registering on every keystroke.
  const draftRef = useRef({
    code: draftCode,
    inputs: draftInputs,
    outputs: draftOutputs,
    packages: draftPackages
  });
  draftRef.current = {
    code: draftCode,
    inputs: draftInputs,
    outputs: draftOutputs,
    packages: draftPackages
  };

  useEffect(
    () =>
      registerCodeAssistantHandler(nodeId, {
        getState: (): CodeAssistantState => ({
          node_id: nodeId,
          code: draftRef.current.code,
          inputs: draftRef.current.inputs.map((port) => ({ ...port })),
          outputs: draftRef.current.outputs.map((port) => ({ ...port })),
          packages: [...draftRef.current.packages]
        }),
        setCode: (code) => setDraftCode(code),
        setPorts: ({ inputs: nextInputs, outputs: nextOutputs }) => {
          if (nextInputs) {
            setDraftInputs(nextInputs.map((port) => ({ ...port })));
          }
          if (nextOutputs) {
            setDraftOutputs(nextOutputs.map((port) => ({ ...port })));
          }
        },
        setPackages: (packages) => setDraftPackages([...packages])
      }),
    [nodeId]
  );

  const { MonacoEditor, monacoLoadError, isMonacoLoading, loadMonacoIfNeeded } =
    useMonacoEditor();
  useEffect(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  const handleEditorChange = useCallback((next: string | undefined) => {
    setDraftCode(next ?? "");
  }, []);

  const workflowId = findNode(nodeId)?.data.workflow_id ?? "";
  const nodeTitle = seed.title || "Code";

  const handleApply = useCallback(() => {
    const node = findNode(nodeId);
    if (!node) {
      onClose();
      return;
    }
    const { code, inputs, outputs, packages } = draftRef.current;

    const dynamic_inputs: Record<string, DynamicSlotDeclaration> = {};
    const dynamic_properties: Record<string, unknown> = {};
    const existingInputs = node.data.dynamic_inputs ?? {};
    const existingValues = node.data.dynamic_properties ?? {};
    for (const port of inputs) {
      const type = normalizeTypeMetadata(port.type);
      // A port the node already declares keeps its declaration and value; a
      // new one starts with the type's default value.
      dynamic_inputs[port.name] =
        existingInputs[port.name]?.type.type === type.type
          ? existingInputs[port.name]
          : { type };
      dynamic_properties[port.name] =
        port.name in existingValues
          ? existingValues[port.name]
          : defaultValueForType(type);
    }

    const dynamic_outputs: Record<string, TypeMetadata> = {};
    for (const port of outputs) {
      dynamic_outputs[port.name] = normalizeTypeMetadata(port.type);
    }

    // Untouched packages keep the node's stored declarations (pack-version
    // stamps included); a changed list is written as plain specifiers.
    const packagesChanged =
      packages.length !== seed.packages.length ||
      packages.some((specifier, i) => specifier !== seed.packages[i]);

    updateNodeData(nodeId, {
      properties: {
        ...node.data.properties,
        code,
        ...(packagesChanged ? { packages } : {})
      },
      dynamic_inputs,
      dynamic_properties,
      dynamic_outputs
    });
    onClose();
  }, [findNode, nodeId, onClose, seed.packages, updateNodeData]);

  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 2
    }),
    []
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Code assistant"
      minWidth="min(1100px, 100vw - 32px)"
      actions={
        <FlexRow gap={SPACING.md}>
          <EditorButton onClick={onClose}>Cancel</EditorButton>
          <EditorButton variant="contained" onClick={handleApply}>
            Apply
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexRow
        gap={SPACING.md}
        sx={{ height: "min(70vh, 640px)", minHeight: 0, alignItems: "stretch" }}
      >
        <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minWidth: 0 }}>
          <FlexRow gap={SPACING.md} align="center" sx={{ flexWrap: "wrap" }}>
            <Text weight={600}>{nodeTitle}</Text>
            <PortChips label="Inputs" ports={draftInputs} />
            <PortChips label="Outputs" ports={draftOutputs} />
            {draftPackages.length > 0 && (
              <FlexRow gap={SPACING.xs} align="center" sx={{ flexWrap: "wrap" }}>
                <Label>Packages</Label>
                {draftPackages.map((specifier) => (
                  <Chip key={specifier} compact label={specifier} />
                ))}
              </FlexRow>
            )}
          </FlexRow>
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              border: "1px solid var(--palette-grey-500)",
              borderRadius: BORDER_RADIUS.sm,
              overflow: "hidden"
            }}
          >
            {MonacoEditor ? (
              <MonacoEditor
                value={draftCode}
                onChange={handleEditorChange}
                language="javascript"
                theme="vs-dark"
                width="100%"
                height="100%"
                options={editorOptions}
              />
            ) : monacoLoadError ? (
              <Text size="small" color="error">
                {monacoLoadError}
              </Text>
            ) : isMonacoLoading ? (
              <LoadingSpinner />
            ) : (
              <Box
                component="pre"
                aria-label="Code draft"
                sx={{
                  ...TYPOGRAPHY.mono.code,
                  margin: 0,
                  padding: SPACING.md,
                  overflow: "auto",
                  height: "100%"
                }}
              >
                {draftCode}
              </Box>
            )}
          </Box>
        </FlexColumn>
        <ResizableSideDock
          storageKey="code_assistant"
          defaultWidth={CHAT_PANEL_WIDTH}
          ariaLabel="Resize code assistant"
        >
          <CodeAssistantChatPanel nodeId={nodeId} workflowId={workflowId} />
        </ResizableSideDock>
      </FlexRow>
    </Dialog>
  );
};

export const CodeAssistantDialog = memo(CodeAssistantDialogInner);
CodeAssistantDialog.displayName = "CodeAssistantDialog";

export default CodeAssistantDialog;
