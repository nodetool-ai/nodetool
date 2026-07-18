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
import { NodeContext } from "../../../contexts/NodeContext";
import { AppEvent } from "../types";
import { useAppRuntimeContext } from "../runtime/AppRuntimeContext";
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

const ModelSelect: React.FC<{
  input: WorkflowInputIO;
  modelId: string;
  onChange: (value: unknown) => void;
}> = ({ input, modelId, onChange }) => {
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
const InputControl: React.FC<{
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
    const modelId = (resolved as { id?: string } | undefined)?.id || "";
    return (
      <FlexColumn gap={SPACING.micro} fullWidth>
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={inputId}
        />
        <ModelSelect input={input} modelId={modelId} onChange={handleChange} />
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
  const { io } = useAppRuntimeContext();
  const { value, setValue, emit } = useWidgetRuntime({
    id: props.id,
    bindingMode: "write",
    binding: props.binding,
    events: props.events
  });

  const input = useMemo(
    () => io.inputs.find((i) => i.name === props.binding),
    [io.inputs, props.binding]
  );

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
    <InputControl
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
 * WorkflowInput — so an app authored from scratch can offer media pickers. */
export type FixedInputKind = "image" | "audio" | "video" | "document" | "color";

const FIXED_KIND_NODE_TYPE: Record<FixedInputKind, string> = {
  image: "nodetool.input.ImageInput",
  audio: "nodetool.input.AudioInput",
  video: "nodetool.input.VideoInput",
  document: "nodetool.input.DocumentInput",
  color: "nodetool.input.ColorInput"
};

export interface FixedInputWidgetProps {
  id: string;
  binding?: string;
  label?: string;
  description?: string;
  events?: AppEvent[];
}

export const FixedKindInputWidget: React.FC<
  FixedInputWidgetProps & { kind: FixedInputKind }
> = ({ kind, ...props }) => {
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
      name: props.binding || props.id,
      label: props.label || props.binding || kind,
      kind,
      description: props.description
    }),
    [kind, props.binding, props.description, props.id, props.label]
  );

  return (
    <InputControl
      input={input}
      value={value}
      onValue={(next) => {
        setValue(next);
        emit("change");
      }}
    />
  );
};
