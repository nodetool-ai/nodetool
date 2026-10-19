import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  Dialog,
  ToolbarIconButton,
  TextInput,
  Checkbox,
  FlexColumn,
  FlexRow,
  DropZone,
  Text,
  Caption,
  ScrollArea,
  AlertBanner,
  SPACING,
  getSpacingPx,
  ICON_SIZE
} from "../../ui_primitives";
import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { NodeData } from "../../../stores/NodeData";
import {
  bytesToBase64,
  resolveComfyWorkflow,
  paramToDynInput,
  type ComfyResolvedSchema,
  type ComfyDynInput
} from "../../../utils/comfyDynamicSchema";
import { normalizeDynamicSlots } from "../../../utils/dynamicSlots";
import { replaceDynamicSlots } from "../../../utils/replaceDynamicSlots";
import { isString } from "../../../utils/typePredicates";

/** Wait this long after the last keystroke before parsing pasted JSON. */
const PARSE_DEBOUNCE_MS = 300;

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

interface ComfyWorkflowLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Loads a ComfyUI workflow into the Run ComfyUI Workflow node: paste API-format
 * JSON or drop a `.json`/`.png` exported by ComfyUI. Derives typed inputs
 * (the App Mode inputs, else Load nodes and prompt text) and outputs (Save
 * nodes), and lets the user expose additional scalar params as typed inputs.
 */
export const ComfyWorkflowLoader: React.FC<ComfyWorkflowLoaderProps> = memo(
  ({ nodeId, data }) => {
    const { t } = useTranslation();
    const updateNodeData = useNodes((state) => state.updateNodeData);
    const nodeStore = useNodeStoreRef();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [schema, setSchema] = useState<ComfyResolvedSchema | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    // A workflow set without the loader (over the API, or by an agent) has
    // no slots on the node. Derive them once so its handles can be wired;
    // the run declares the same slots from the same server-side parser.
    const workflow = data.properties?.workflow;
    const hasSlots =
      Object.keys(data.dynamic_inputs ?? {}).length > 0 ||
      Object.keys(data.dynamic_outputs ?? {}).length > 0;
    const dynamicPropertiesRef = useRef(data.dynamic_properties);
    useEffect(() => {
      dynamicPropertiesRef.current = data.dynamic_properties;
    }, [data.dynamic_properties]);
    useEffect(() => {
      if (hasSlots || !isString(workflow) || !workflow.trim()) {
        return;
      }
      const controller = new AbortController();
      resolveComfyWorkflow({ workflow }, controller.signal)
        .then((resolved) => {
          updateNodeData(
            nodeId,
            {
              dynamic_inputs: normalizeDynamicSlots(resolved.dynamic_inputs),
              dynamic_outputs: resolved.dynamic_outputs,
              dynamic_properties: {
                ...resolved.dynamic_properties,
                ...dynamicPropertiesRef.current
              }
            },
            { quiet: true }
          );
        })
        .catch(() => {
          // An unparseable workflow keeps no slots; running it reports why.
        });
      return () => controller.abort();
    }, [hasSlots, workflow, nodeId, updateNodeData]);

    const applySchema = useCallback((resolved: ComfyResolvedSchema) => {
      setSchema(resolved);
      setError(null);
      setSelected(new Set());
    }, []);

    // The server parses the workflow. Pasted text is sent once typing pauses,
    // and a newer edit cancels the request still in flight.
    useEffect(() => {
      if (!text.trim()) {
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        resolveComfyWorkflow({ workflow: text }, controller.signal)
          .then(applySchema)
          .catch((err: unknown) => {
            if (controller.signal.aborted) return;
            setSchema(null);
            setError(
              errorMessage(err, t("i18n-next39.nodeEditor.comfy.failedToParse"))
            );
          });
      }, PARSE_DEBOUNCE_MS);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }, [text, applySchema, t]);

    const parseText = useCallback((value: string) => {
      setText(value);
      if (!value.trim()) {
        setSchema(null);
        setError(null);
      }
    }, []);

    const handleFile = useCallback(
      async (file: File) => {
        try {
          if (file.name.toLowerCase().endsWith(".png")) {
            setText("");
            const buf = await file.arrayBuffer();
            applySchema(
              await resolveComfyWorkflow({ png_base64: bytesToBase64(buf) })
            );
          } else {
            setText(await file.text());
          }
        } catch (err) {
          setSchema(null);
          setError(
            errorMessage(err, t("i18n-next39.nodeEditor.comfy.failedToLoadFile"))
          );
        }
      },
      [applySchema, t]
    );

    const onFilesDrop = useCallback(
      (files: File[]) => {
        const file = files[0];
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
      const dynamic_inputs = {
        ...schema.dynamic_inputs
      } satisfies Record<string, ComfyDynInput>;
      const dynamic_properties = {
        ...schema.dynamic_properties
      } satisfies Record<string, unknown>;
      for (const param of schema.available_params) {
        if (!selected.has(param.handle)) continue;
        dynamic_inputs[param.handle] = paramToDynInput(param);
        dynamic_properties[param.handle] = param.default;
      }
      // Preserve existing edited values for handles that still exist.
      const existing = data.dynamic_properties ?? {};
      for (const key of Object.keys(dynamic_properties)) {
        if (key in existing) dynamic_properties[key] = existing[key];
      }
      replaceDynamicSlots(nodeStore, nodeId, {
        properties: {
          ...data.properties,
          workflow: JSON.stringify(schema.prompt)
        },
        dynamic_inputs: normalizeDynamicSlots(dynamic_inputs),
        dynamic_outputs: schema.dynamic_outputs,
        dynamic_properties
      });
      setOpen(false);
    }, [schema, selected, data, nodeId, nodeStore]);

    const summary = useMemo(() => {
      if (!schema) return null;
      const nIn = Object.keys(schema.dynamic_inputs).length;
      const nOut = Object.keys(schema.dynamic_outputs).length;
      const nNodes = Object.keys(schema.prompt).length;
      const nodeCountKey = nNodes === 1 ? "nodes_one" : "nodes_other";
      const inputCountKey = nIn === 1 ? "inputs_one" : "inputs_other";
      const outputCountKey = nOut === 1 ? "outputs_one" : "outputs_other";
      return `${t(`i18n-next39.nodeEditor.comfy.summary.${nodeCountKey}`, {
        count: nNodes
      })} · ${t(`i18n-next39.nodeEditor.comfy.summary.${inputCountKey}`, {
        count: nIn
      })}${schema.app_mode_inputs ? ` ${t("i18n-next39.nodeEditor.comfy.appModeSource")}` : ""} · ${t(
        `i18n-next39.nodeEditor.comfy.summary.${outputCountKey}`,
        { count: nOut }
      )}`;
    }, [schema, t]);

    return (
      <>
        <ToolbarIconButton
          title={t("i18n-next39.nodeEditor.comfy.loadWorkflow")}
          size="small"
          onClick={() => setOpen(true)}
          sx={{
            padding: getSpacingPx(SPACING.xs),
            color: "var(--palette-text-secondary)",
            "&:hover": {
              color: "var(--palette-text-primary)",
              backgroundColor: "var(--palette-c_overlay)"
            }
          }}
        >
          <UploadFileIcon sx={{ fontSize: ICON_SIZE.sm }} />
        </ToolbarIconButton>

        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={t("i18n-next39.nodeEditor.comfy.loadWorkflowTitle")}
          maxWidth="sm"
          fullWidth
          confirmText={t("i18n-next39.nodeEditor.comfy.apply")}
          confirmDisabled={!schema}
          onConfirm={handleApply}
        >
          <FlexColumn gap={SPACING.sm} sx={{ minWidth: 0 }}>
            <Caption>
              {t("i18n-next39.nodeEditor.comfy.instructions")}
            </Caption>
            <DropZone onFilesDrop={onFilesDrop} sx={{ p: SPACING.xs }}>
              <TextInput
                label={t("i18n-next39.nodeEditor.comfy.workflowJson")}
                value={text}
                onChange={(e) => parseText(e.target.value)}
                multiline
                rows={6}
                compact
                placeholder='{ "3": { "class_type": "KSampler", "inputs": { ... } } }'
              />
              <FlexRow gap={SPACING.xs} align="center" sx={{ mt: SPACING.xs }}>
                <ToolbarIconButton
                  title={t("i18n-next39.nodeEditor.comfy.chooseFile")}
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadFileIcon sx={{ fontSize: ICON_SIZE.md }} />
                </ToolbarIconButton>
                <Caption>{t("i18n-next39.nodeEditor.comfy.dropFileHere")}</Caption>
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
            </DropZone>

            {error && (
              <AlertBanner severity="error" compact>
                {error}
              </AlertBanner>
            )}

            {schema && (
              <FlexColumn gap={SPACING.micro}>
                <Text size="small">{summary}</Text>
                {schema.available_params.length > 0 && (
                  <>
                    <Caption>{t("i18n-next39.nodeEditor.comfy.exposeParameters")}</Caption>
                    <ScrollArea style={{ maxHeight: 180 }}>
                      <FlexColumn gap={SPACING.none}>
                        {schema.available_params.map((param) => (
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
