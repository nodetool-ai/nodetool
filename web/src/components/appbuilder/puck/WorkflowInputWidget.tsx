/** @jsxImportSource @emotion/react */
/**
 * A widget bound to a workflow InputNode that renders the right input control
 * for the node's type — the same surface the mini-app form offered: strings
 * (with line mode + max length), numbers (clamped/rounded), booleans, colors,
 * media, documents, dataframes, paths, selects, media lists, and the six
 * model selects.
 *
 * Providers: the property components need a theme and TanStack Query (both app
 * globals). AudioProperty additionally resolves its node via NodeContext, so
 * the surface mounting this widget must provide the workflow's node store
 * (PuckAppEditor and the mini-app pages do); without one the audio kind
 * degrades to a hint instead of crashing.
 */
import React, { useContext, useEffect, useMemo, useState } from "react";

import {
  Box,
  Caption,
  FlexColumn,
  TextInput,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { getComponentForProperty } from "../../node/PropertyInput.resolver";
import PropertyLabel from "../../node/PropertyLabel";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import ImageModelSelect from "../../properties/ImageModelSelect";
import VideoModelSelect from "../../properties/VideoModelSelect";
import TTSModelSelect from "../../properties/TTSModelSelect";
import ASRModelSelect from "../../properties/ASRModelSelect";
import EmbeddingModelSelect from "../../properties/EmbeddingModelSelect";
import HuggingFaceModelSelect from "../../properties/HuggingFaceModelSelect";
import type { HuggingFaceModelValueInput } from "../../../stores/ApiTypes";
import { NodeContext } from "../../../contexts/NodeContext";
import { AppEvent } from "../types";
import {
  useAppRuntimeContext,
  useBindingRef
} from "../runtime/AppRuntimeContext";
import {
  createPropertyForInput,
  MODEL_INPUT_KINDS,
  normalizeInputValue,
  resolveInputValue
} from "../inputProperty";
import { WorkflowInputIO } from "../workflowIO";
import { useWidgetRuntime } from "./useWidgetRuntime";

export interface WorkflowInputWidgetProps {
  id: string;
  binding?: string;
  /** Overrides the input node's own name — app wording beats graph wording. */
  label?: string;
  events?: AppEvent[];
}

const Placeholder: React.FC<{ text: string }> = ({ text }) => (
  <FlexColumn
    align="center"
    justify="center"
    fullWidth
    sx={{
      minHeight: 56,
      p: SPACING.md,
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: BORDER_RADIUS.md
    }}
  >
    <Caption color="secondary">{text}</Caption>
  </FlexColumn>
);

const EMPTY_HF_MODEL: HuggingFaceModelValueInput = {
  type: "hf.model",
  repo_id: ""
};

const ModelSelect: React.FC<{
  input: WorkflowInputIO;
  /** The stored reference; every select but the HF one keys off its `id`. */
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ input, value, onChange }) => {
  const modelId = (value as { id?: string } | undefined)?.id || "";
  switch (input.kind) {
    case "language_model":
      return <LanguageModelSelect onChange={onChange} value={modelId} />;
    case "image_model":
      return <ImageModelSelect onChange={onChange} value={modelId} />;
    case "video_model":
      return <VideoModelSelect onChange={onChange} value={modelId} />;
    case "tts_model":
      return <TTSModelSelect onChange={onChange} value={modelId} />;
    case "asr_model":
      return <ASRModelSelect onChange={onChange} value={modelId} />;
    case "huggingface_model":
      // A HuggingFace reference is `{type, repo_id, path}`, not an id, so this
      // one takes the whole stored value.
      return (
        <HuggingFaceModelSelect
          modelType="hf.model"
          onChange={onChange}
          value={
            (value as HuggingFaceModelValueInput | undefined) ?? EMPTY_HF_MODEL
          }
        />
      );
    default:
      return <EmbeddingModelSelect onChange={onChange} value={modelId} />;
  }
};

/**
 * The shared control core: renders the right editor for a WorkflowInputIO and
 * pushes normalized values out. Used by WorkflowInputWidget (input resolved
 * from the workflow) and the fixed-kind palette widgets (input synthesized
 * from widget props).
 */
export const WorkflowInputControl: React.FC<{
  input: WorkflowInputIO;
  value: unknown;
  onValue: (value: unknown) => void;
}> = ({ input, value, onValue }) => {
  const nodeStore = useContext(NodeContext);
  const property = useMemo(() => createPropertyForInput(input), [input]);
  const Component = useMemo(
    () =>
      input.kind !== "string" && !MODEL_INPUT_KINDS.has(input.kind)
        ? getComponentForProperty(property)
        : null,
    [input.kind, property]
  );

  // The visible string draft may exceed maxLength while typing; only the
  // propagated value is truncated (mini-app form behavior).
  const [stringDraft, setStringDraft] = useState<string | null>(null);
  useEffect(() => {
    setStringDraft(null);
  }, [input.name]);

  const handleChange = (next: unknown) => {
    onValue(normalizeInputValue(input, next));
  };

  const resolved = resolveInputValue(input, property, value);
  const inputId = `appbuilder-input-${input.nodeId}`;

  if (input.kind === "string") {
    const maxLength = input.maxLength ?? 0;
    const multiline = Boolean(input.multiline);
    const draft = stringDraft ?? (typeof resolved === "string" ? resolved : "");
    const exceeds = maxLength > 0 && draft.length > maxLength;
    return (
      <FlexColumn gap={SPACING.micro} fullWidth>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={inputId}
        />
        <TextInput
          id={inputId}
          value={draft}
          multiline={multiline}
          minRows={multiline ? 4 : undefined}
          maxRows={multiline ? 12 : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value ?? "";
            setStringDraft(raw);
            handleChange(raw);
          }}
        />
        {maxLength > 0 && (
          <Caption color={exceeds ? "warning" : "secondary"}>
            {draft.length}/{maxLength}
            {exceeds ? " — extra characters will not be sent" : ""}
          </Caption>
        )}
      </FlexColumn>
    );
  }

  if (MODEL_INPUT_KINDS.has(input.kind)) {
    return (
      <FlexColumn gap={SPACING.micro} fullWidth>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={inputId}
        />
        <ModelSelect input={input} value={resolved} onChange={handleChange} />
      </FlexColumn>
    );
  }

  if (input.kind === "audio" && !nodeStore) {
    return (
      <Placeholder text={`Audio input "${input.name}" needs the workflow's node store — open the app from the app builder or mini-app page.`} />
    );
  }

  if (!Component) return null;

  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      <Component
        property={property}
        value={resolved}
        nodeType={input.nodeType}
        nodeId={input.nodeId}
        propertyIndex="0"
        onChange={handleChange}
        tabIndex={0}
      />
      {input.description ? (
        <Caption color="secondary">{input.description}</Caption>
      ) : null}
    </FlexColumn>
  );
};

export const WorkflowInputWidget: React.FC<WorkflowInputWidgetProps> = (
  props
) => {
  const { ioFor } = useAppRuntimeContext();
  const ref = useBindingRef(props.binding, "write");
  const { value, setValue, emit } = useWidgetRuntime({
    id: props.id,
    bindingMode: "write",
    binding: props.binding,
    events: props.events
  });

  // An app binds several workflows, so the node lives in the graph of the
  // operation the binding names — not necessarily the default one.
  const io = ioFor(ref?.kind === "input" ? ref.operationId : undefined);

  // The binding resolves to a node ID; a legacy document's bare name resolves
  // through the scope, and only a scope-less surface falls back to the name.
  const input = useMemo(() => {
    const found =
      ref?.kind === "input"
        ? io.inputs.find((i) => i.nodeId === ref.nodeId)
        : io.inputs.find((i) => i.name === props.binding);
    if (!found || !props.label) return found;
    return { ...found, name: props.label, label: props.label };
  }, [io.inputs, props.binding, props.label, ref]);

  if (!input) {
    return (
      <Placeholder
        text={
          props.binding
            ? `Unknown workflow input "${props.binding}"`
            : "Bind to a workflow input"
        }
      />
    );
  }

  return (
    <WorkflowInputControl
      input={input}
      value={value}
      onValue={(next) => {
        setValue(next);
        emit("change");
      }}
    />
  );
};

/**
 * The model kinds a ModelSelect widget can offer. The same ones the workflow
 * input form resolves, picked here by the app author instead of by a node's
 * type — an app often wants to drive an LLM node's `model` property directly.
 */
export const MODEL_WIDGET_KINDS = [
  "language_model",
  "image_model",
  "video_model",
  "tts_model",
  "asr_model",
  "embedding_model",
  "huggingface_model"
] as const;

export type ModelWidgetKind = (typeof MODEL_WIDGET_KINDS)[number];

const MODEL_KIND_NODE_TYPE = {
  language_model: "nodetool.input.LanguageModelInput",
  image_model: "nodetool.input.ImageModelInput",
  video_model: "nodetool.input.VideoModelInput",
  tts_model: "nodetool.input.TTSModelInput",
  asr_model: "nodetool.input.ASRModelInput",
  embedding_model: "nodetool.input.EmbeddingModelInput",
  huggingface_model: "nodetool.input.HuggingFaceModelInput"
} satisfies Record<ModelWidgetKind, string>;

const isModelKind = (value: unknown): value is ModelWidgetKind =>
  MODEL_WIDGET_KINDS.includes(value as ModelWidgetKind);

export interface ModelSelectWidgetProps {
  id: string;
  binding?: string;
  label?: string;
  modelKind?: string;
  events?: AppEvent[];
}

/**
 * Picks a model and writes its reference — `{type, id, provider, name}` — to
 * the bound input or node property.
 */
export const ModelSelectWidget: React.FC<ModelSelectWidgetProps> = (props) => {
  const kind = isModelKind(props.modelKind) ? props.modelKind : "language_model";
  const { value, setValue, emit } = useWidgetRuntime({
    id: props.id,
    bindingMode: "write",
    binding: props.binding,
    events: props.events
  });

  const input = useMemo<WorkflowInputIO>(
    () => ({
      nodeId: props.id,
      nodeType: MODEL_KIND_NODE_TYPE[kind],
      name: props.label || "Model",
      label: props.label || "Model",
      kind
    }),
    [kind, props.id, props.label]
  );

  return (
    <WorkflowInputControl
      input={input}
      value={value}
      onValue={(next) => {
        setValue(next);
        emit("change");
      }}
    />
  );
};

/** Kinds exposed as standalone palette widgets alongside the auto-resolving
 * WorkflowInput — so an app authored from scratch can offer media pickers,
 * paths, tables, and the media list controls. */
export type FixedInputKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "color"
  | "dataframe"
  | "file_path"
  | "folder_path"
  | "model3d"
  | "image_size"
  | "image_list"
  | "video_list"
  | "audio_list"
  | "text_list";

const FIXED_KIND_NODE_TYPE = {
  image: "nodetool.input.ImageInput",
  audio: "nodetool.input.AudioInput",
  video: "nodetool.input.VideoInput",
  document: "nodetool.input.DocumentInput",
  color: "nodetool.input.ColorInput",
  dataframe: "nodetool.input.DataframeInput",
  file_path: "nodetool.input.FilePathInput",
  folder_path: "nodetool.input.FolderPathInput",
  model3d: "nodetool.input.Model3DInput",
  image_size: "nodetool.input.ImageSizeInput",
  image_list: "nodetool.input.ImageListInput",
  video_list: "nodetool.input.VideoListInput",
  audio_list: "nodetool.input.AudioListInput",
  text_list: "nodetool.input.TextListInput"
} satisfies Record<FixedInputKind, string>;

export interface FixedInputWidgetProps {
  id: string;
  binding?: string;
  label?: string;
  description?: string;
  /** Hint shown under the control — path inputs have nothing else to guide on. */
  placeholder?: string;
  events?: AppEvent[];
}

export const FixedKindInputWidget: React.FC<
  FixedInputWidgetProps & {
    kind: FixedInputKind;
    /** Caps the control's height; the grid editors grow with their rows. */
    maxHeight?: number;
  }
> = ({ kind, maxHeight, ...props }) => {
  const { value, setValue, emit } = useWidgetRuntime({
    id: props.id,
    bindingMode: "write",
    binding: props.binding,
    events: props.events
  });

  const input = useMemo<WorkflowInputIO>(
    () => ({
      nodeId: props.id,
      nodeType: FIXED_KIND_NODE_TYPE[kind],
      // The control labels itself from `name`, so the widget's own label wins
      // over the raw binding token.
      name: props.label || props.binding || props.id,
      label: props.label || props.binding || kind,
      kind,
      description: props.description || props.placeholder
    }),
    [
      kind,
      props.binding,
      props.description,
      props.id,
      props.label,
      props.placeholder
    ]
  );

  const control = (
    <WorkflowInputControl
      input={input}
      value={value}
      onValue={(next) => {
        setValue(next);
        emit("change");
      }}
    />
  );

  if (!maxHeight) return control;
  return (
    <Box sx={{ width: "100%", maxHeight, overflow: "auto" }}>{control}</Box>
  );
};
