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
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { getComponentForProperty } from "../../node/PropertyInput.resolver";
import PropertyLabel from "../../node/PropertyLabel";
import { NodeTextField } from "../../editor_ui";
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
  const nodeStore = useContext(NodeContext);

  const input = useMemo(
    () => io.inputs.find((i) => i.name === props.binding),
    [io.inputs, props.binding]
  );
  const property = useMemo(
    () => (input ? createPropertyForInput(input) : null),
    [input]
  );
  const Component = useMemo(
    () =>
      input &&
      property &&
      input.kind !== "string" &&
      !MODEL_INPUT_KINDS.has(input.kind)
        ? getComponentForProperty(property)
        : null,
    [input, property]
  );

  // The visible string draft may exceed maxLength while typing; only the
  // propagated value is truncated (mini-app form behavior).
  const [stringDraft, setStringDraft] = useState<string | null>(null);
  useEffect(() => {
    setStringDraft(null);
  }, [props.binding]);

  if (!input || !property) {
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

  const handleChange = (next: unknown) => {
    setValue(normalizeInputValue(input, next));
    emit("change");
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
        <NodeTextField
          id={inputId}
          value={draft}
          multiline={multiline}
          minRows={multiline ? 4 : 1}
          maxRows={multiline ? 12 : 1}
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
