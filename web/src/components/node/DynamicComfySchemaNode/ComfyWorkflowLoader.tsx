import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  Dialog,
  ToolbarIconButton,
  Tooltip,
  TextInput,
  Checkbox,
  FlexColumn,
  FlexRow,
  Box,
  Text,
  Caption,
  ScrollArea
} from "../../ui_primitives";
import { useNodes } from "../../../contexts/NodeContext";
import { NodeData } from "../../../stores/NodeData";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import {
  parseComfyWorkflowJson,
  extractComfyPromptFromPng,
  resolveComfySchema,
  paramToDynInput,
  type ComfyResolvedSchema,
  type ComfyDynInput
} from "../../../utils/comfyDynamicSchema";

interface ComfyWorkflowLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Loads a ComfyUI workflow into the Run ComfyUI Workflow node: paste API-format
 * JSON or drop a `.json`/`.png` exported by ComfyUI. Derives typed inputs
 * (Load nodes) and outputs (Save nodes), and lets the user expose additional
 * scalar params as typed inputs.
 */
export const ComfyWorkflowLoader: React.FC<ComfyWorkflowLoaderProps> = memo(
  ({ nodeId, data }) => {
    const updateNodeData = useNodes((state) => state.updateNodeData);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [schema, setSchema] = useState<ComfyResolvedSchema | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const applySchema = useCallback((resolved: ComfyResolvedSchema) => {
      setSchema(resolved);
      setError(null);
      setSelected(new Set());
    }, []);

    const parseText = useCallback(
      (value: string) => {
        setText(value);
        if (!value.trim()) {
          setSchema(null);
          setError(null);
          return;
        }
        try {
          applySchema(resolveComfySchema(parseComfyWorkflowJson(value)));
        } catch (err) {
          setSchema(null);
          setError(err instanceof Error ? err.message : "Failed to parse");
        }
      },
      [applySchema]
    );

    const handleFile = useCallback(
      async (file: File) => {
        try {
          if (file.name.toLowerCase().endsWith(".png")) {
            const buf = await file.arrayBuffer();
            applySchema(resolveComfySchema(extractComfyPromptFromPng(buf)));
            setText("");
          } else {
            const content = await file.text();
            setText(content);
            applySchema(resolveComfySchema(parseComfyWorkflowJson(content)));
          }
        } catch (err) {
          setSchema(null);
          setError(err instanceof Error ? err.message : "Failed to load file");
        }
      },
      [applySchema]
    );

    const onDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      },
      [handleFile]
    );

    const toggleParam = useCallback((handle: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(handle)) next.delete(handle);
        else next.add(handle);
        return next;
      });
    }, []);

    const handleApply = useCallback(() => {
      if (!schema) return;
      const dynamic_inputs: Record<string, ComfyDynInput> = {
        ...schema.dynamic_inputs
      };
      const dynamic_properties: Record<string, unknown> = {
        ...schema.dynamic_properties
      };
      for (const param of schema.availableParams) {
        if (!selected.has(param.handle)) continue;
        dynamic_inputs[param.handle] = paramToDynInput(param);
        dynamic_properties[param.handle] = param.default;
      }
      // Preserve existing edited values for handles that still exist.
      const existing = data.dynamic_properties ?? {};
      for (const key of Object.keys(dynamic_properties)) {
        if (key in existing) dynamic_properties[key] = existing[key];
      }
      updateNodeData(nodeId, {
        properties: {
          ...data.properties,
          workflow: JSON.stringify(schema.prompt)
        },
        dynamic_inputs,
        dynamic_outputs: schema.dynamic_outputs,
        dynamic_properties
      });
      setOpen(false);
    }, [schema, selected, data, nodeId, updateNodeData]);

    const summary = useMemo(() => {
      if (!schema) return null;
      const nIn = Object.keys(schema.dynamic_inputs).length;
      const nOut = Object.keys(schema.dynamic_outputs).length;
      const nNodes = Object.keys(schema.prompt).length;
      return `${nNodes} nodes · ${nIn} typed input${nIn === 1 ? "" : "s"} · ${nOut} output${nOut === 1 ? "" : "s"}`;
    }, [schema]);

    return (
      <>
        <Tooltip title="Load Workflow" arrow delay={TOOLTIP_ENTER_DELAY}>
          <ToolbarIconButton
            title="Load Workflow"
            size="small"
            onClick={() => setOpen(true)}
            sx={{
              padding: "4px",
              color: "rgba(255, 255, 255, 0.5)",
              "&:hover": {
                color: "rgba(255, 255, 255, 0.9)",
                backgroundColor: "rgba(255, 255, 255, 0.08)"
              }
            }}
          >
            <UploadFileIcon sx={{ fontSize: 16 }} />
          </ToolbarIconButton>
        </Tooltip>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Load ComfyUI Workflow"
          maxWidth="sm"
          fullWidth
          showActions
          confirmText="Apply"
          confirmDisabled={!schema}
          onConfirm={handleApply}
          onCancel={() => setOpen(false)}
        >
          <FlexColumn gap={1.5} sx={{ minWidth: 0 }}>
            <Caption>
              Paste a workflow in API (prompt) format — use “Save (API Format)”
              in ComfyUI — or drop a .json/.png file exported by ComfyUI.
            </Caption>
            <Box
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              sx={{
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: 1,
                p: 1
              }}
            >
              <TextInput
                label="Workflow JSON"
                value={text}
                onChange={(e) => parseText(e.target.value)}
                multiline
                rows={6}
                compact
                placeholder='{ "3": { "class_type": "KSampler", "inputs": { ... } } }'
              />
              <FlexRow gap={1} align="center" sx={{ mt: 1 }}>
                <ToolbarIconButton
                  title="Choose file"
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadFileIcon sx={{ fontSize: 18 }} />
                </ToolbarIconButton>
                <Caption>or drop a .json / .png here</Caption>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.png,application/json,image/png"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
              </FlexRow>
            </Box>

            {error && (
              <Caption color="error" role="alert">
                {error}
              </Caption>
            )}

            {schema && (
              <FlexColumn gap={0.5}>
                <Text size="small">{summary}</Text>
                {schema.availableParams.length > 0 && (
                  <>
                    <Caption>Expose additional parameters as inputs:</Caption>
                    <ScrollArea style={{ maxHeight: 180 }}>
                      <FlexColumn gap={0}>
                        {schema.availableParams.map((param) => (
                          <Checkbox
                            key={param.handle}
                            compact
                            size="small"
                            checked={selected.has(param.handle)}
                            onChange={() => toggleParam(param.handle)}
                            label={`${param.label} (${param.type})`}
                          />
                        ))}
                      </FlexColumn>
                    </ScrollArea>
                  </>
                )}
              </FlexColumn>
            )}
          </FlexColumn>
        </Dialog>
      </>
    );
  }
);

ComfyWorkflowLoader.displayName = "ComfyWorkflowLoader";
