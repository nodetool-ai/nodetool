import React, { useEffect, useMemo, useState } from "react";
import { Tooltip, Typography } from "@mui/material";

import { Property, Workflow } from "../../../stores/ApiTypes";
import { getComponentForProperty } from "../../node/PropertyInput";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import ImageModelSelect from "../../properties/ImageModelSelect";
import VideoModelSelect from "../../properties/VideoModelSelect";
import TTSModelSelect from "../../properties/TTSModelSelect";
import ASRModelSelect from "../../properties/ASRModelSelect";
import EmbeddingModelSelect from "../../properties/EmbeddingModelSelect";
import PropertyLabel from "../../node/PropertyLabel";
import { NodeTextField, editorClassNames, cn } from "../../editor_ui";
import {
  MiniAppInputDefinition,
  MiniAppInputKind,
  MiniAppInputValues
} from "../types";

interface MiniAppInputsFormProps {
  workflow: Workflow;
  inputDefinitions: MiniAppInputDefinition[];
  inputValues: MiniAppInputValues;
  onInputChange: (name: string, value: unknown) => void;
  onError?: (message: string | null) => void;
}

const KIND_TO_PROPERTY_TYPE: Record<
  MiniAppInputKind,
  Property["type"]["type"]
> = {
  string: "str",
  integer: "int",
  float: "float",
  boolean: "bool",
  color: "color",
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  dataframe: "dataframe",
  file_path: "str",
  folder_path: "str",
  folder: "folder",
  select: "enum",
  language_model: "language_model",
  image_model: "image_model",
  video_model: "video_model",
  tts_model: "tts_model",
  asr_model: "asr_model",
  embedding_model: "embedding_model",
  image_list: "list",
  video_list: "list",
  audio_list: "list",
  text_list: "list"
};

const createPropertyFromDefinition = (
  definition: MiniAppInputDefinition
): Property => {
  const defaultValue = (() => {
    if (definition.defaultValue !== undefined) {
      return definition.defaultValue;
    }
    if (definition.data.value !== undefined) {
      return definition.data.value;
    }
    switch (definition.kind) {
      case "string":
      case "file_path":
      case "folder_path":
        return "";
      case "boolean":
        return false;
      case "select":
        // Default to first option if available
        return definition.data.options?.[0] ?? "";
      case "image_list":
      case "video_list":
      case "audio_list":
      case "text_list":
        return [];
      default:
        return null;
    }
  })();

  // For select kind, use the options from the node data
  const enumValues =
    definition.kind === "select" && definition.data.options
      ? definition.data.options
      : null;
  const enumTypeName =
    definition.kind === "select" ? definition.data.enum_type_name ?? null : null;

  // For list kinds, set the appropriate element type in type_args
  const getTypeArgsForKind = (kind: MiniAppInputKind) => {
    switch (kind) {
      case "image_list":
        return [{ type: "image", optional: false, type_args: [] }];
      case "video_list":
        return [{ type: "video", optional: false, type_args: [] }];
      case "audio_list":
        return [{ type: "audio", optional: false, type_args: [] }];
      case "text_list":
        return [{ type: "str", optional: false, type_args: [] }];
      default:
        return [];
    }
  };

  const property: Property = {
    name: definition.data.name,
    type: {
      type: KIND_TO_PROPERTY_TYPE[definition.kind],
      optional: true,
      values: enumValues,
      type_args: getTypeArgsForKind(definition.kind),
      type_name: enumTypeName
    },
    default: defaultValue,
    title: definition.data.label,
    description: definition.data.description,
    min:
      definition.kind === "integer" || definition.kind === "float"
        ? definition.data.min ?? null
        : null,
    max:
      definition.kind === "integer" || definition.kind === "float"
        ? definition.data.max ?? null
        : null,
    required: false
  };

  // Set json_schema_extra for file_path to trigger FilePathProperty component
  if (definition.kind === "file_path") {
    property.json_schema_extra = { type: "file_path" };
  }
  if (definition.kind === "folder_path") {
    property.json_schema_extra = { type: "folder_path" };
  }

  return property;
};

const resolveInputValue = (
  definition: MiniAppInputDefinition,
  property: Property,
  values: MiniAppInputValues
): unknown => {
  const storedValue = values[definition.data.name];
  if (storedValue !== undefined) {
    return storedValue;
  }
  if (property.default !== undefined && property.default !== null) {
    return property.default;
  }

  switch (definition.kind) {
    case "string":
    case "file_path":
    case "folder_path":
      return "";
    case "boolean":
      return false;
    case "image_list":
    case "video_list":
    case "audio_list":
    case "text_list":
      return [];
    default:
      return undefined;
  }
};

const getStringInputConfig = (definition: MiniAppInputDefinition) => {
  const data = definition.data as {
    max_length?: unknown;
    line_mode?: unknown;
    multiline?: unknown;
  };

  const maxLength =
    typeof data.max_length === "number" && Number.isFinite(data.max_length)
      ? Math.max(0, Math.floor(data.max_length))
      : 0;

  const lineMode =
    data.line_mode === "multi_line" ||
    data.line_mode === "multiline" ||
    data.multiline === true
      ? "multi_line"
      : "single_line";

  return { maxLength, lineMode } as const;
};

const SPECIAL_RENDER_KINDS: ReadonlySet<MiniAppInputKind> = new Set([
  "string",
  "language_model",
  "image_model",
  "video_model",
  "tts_model",
  "asr_model",
  "embedding_model"
]);

const MiniAppInputsForm: React.FC<MiniAppInputsFormProps> = ({
  inputDefinitions,
  inputValues,
  onInputChange,
  onError
}) => {
  const [stringDrafts, setStringDrafts] = useState<Record<string, string>>({});

  // Seed drafts for string inputs from stored values.
  useEffect(() => {
    const next: Record<string, string> = {};
    let changed = false;

    inputDefinitions.forEach((definition) => {
      if (definition.kind !== "string") {
        return;
      }
      const key = definition.data.name;
      if (stringDrafts[key] !== undefined) {
        return;
      }
      const stored = inputValues[key];
      next[key] = typeof stored === "string" ? stored : "";
      changed = true;
    });

    if (changed) {
      setStringDrafts((prev) => ({ ...next, ...prev }));
    }
  }, [inputDefinitions, inputValues, stringDrafts]);

  const propertyEntries = useMemo(
    () =>
      inputDefinitions
        .map((definition, index) => {
          const property = createPropertyFromDefinition(definition);

          // Special render kinds don't need a Component
          if (SPECIAL_RENDER_KINDS.has(definition.kind)) {
            return {
              definition,
              property,
              Component: undefined,
              propertyIndex: index.toString()
            };
          }

          const Component = getComponentForProperty(property);

          return {
            definition,
            property,
            Component,
            propertyIndex: index.toString()
          };
        }),
    [inputDefinitions]
  );

  if (propertyEntries.length === 0) {
    return null;
  }

  return (
    <div className="inputs-card application-card">
      <div className="inputs-shell">
        {propertyEntries.map(
          ({ definition, property, Component, propertyIndex }) => {
            const inputId = `miniapp-input-${definition.nodeId}`;
            const value = resolveInputValue(
              definition,
              property,
              inputValues
            );

            const handleChange = (nextValue: unknown) => {
              onError?.(null);
              onInputChange(definition.data.name, nextValue);
            };

            if (definition.kind === "string") {
              const { maxLength, lineMode } = getStringInputConfig(definition);
              const multiline = lineMode === "multi_line";
              const draft = stringDrafts[definition.data.name] ?? (typeof value === "string" ? value : "");
              const exceedsMaxLength = maxLength > 0 && draft.length > maxLength;

              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="string-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <NodeTextField
                        className={cn("string-value-input", editorClassNames.nowheel)}
                        value={draft}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const raw = e.target.value ?? "";
                          setStringDrafts((prev) => ({
                            ...prev,
                            [definition.data.name]: raw
                          }));

                          // Allow typing past limit, but only propagate within limit.
                          const sent =
                            maxLength === 0 ? raw : raw.slice(0, Math.max(0, maxLength));
                          handleChange(sent);
                        }}
                        tabIndex={Number(propertyIndex) + 1}
                        multiline={multiline}
                        minRows={multiline ? 4 : 1}
                        maxRows={multiline ? 12 : 1}
                        slotProps={{ htmlInput: undefined }}
                      />
                      {maxLength > 0 && (
                        <Tooltip
                          title={
                            exceedsMaxLength
                              ? `${draft.length - maxLength} characters over the limit; extra characters will not be sent.`
                              : "Max length. Extra characters will not be sent."
                          }
                          placement="bottom"
                        >
                          <Typography
                            variant="caption"
                            color={exceedsMaxLength ? "warning.main" : "text.secondary"}
                            sx={{ display: "block", marginTop: 0.5, width: "fit-content" }}
                          >
                            {draft.length}/{maxLength}
                          </Typography>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // Language model input
            if (definition.kind === "language_model") {
              const modelValue = value as { id?: string } | undefined;
              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="model-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <LanguageModelSelect
                        onChange={handleChange}
                        value={modelValue?.id || ""}
                      />
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // Image model input
            if (definition.kind === "image_model") {
              const modelValue = value as { id?: string } | undefined;
              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="model-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <ImageModelSelect
                        onChange={handleChange}
                        value={modelValue?.id || ""}
                      />
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // Video model input
            if (definition.kind === "video_model") {
              const modelValue = value as { id?: string } | undefined;
              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="model-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <VideoModelSelect
                        onChange={handleChange}
                        value={modelValue?.id || ""}
                      />
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // TTS model input
            if (definition.kind === "tts_model") {
              const modelValue = value as { id?: string } | undefined;
              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="model-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <TTSModelSelect
                        onChange={handleChange}
                        value={modelValue?.id || ""}
                      />
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // ASR model input
            if (definition.kind === "asr_model") {
              const modelValue = value as { id?: string } | undefined;
              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="model-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <ASRModelSelect
                        onChange={handleChange}
                        value={modelValue?.id || ""}
                      />
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // Embedding model input
            if (definition.kind === "embedding_model") {
              const modelValue = value as { id?: string } | undefined;
              return (
                <div
                  className="input-field"
                  key={`${definition.nodeId}-${property.name}`}
                >
                  <div className="input-field-control">
                    <div className="model-property">
                      <PropertyLabel
                        name={property.name}
                        description={property.description}
                        id={inputId}
                      />
                      <EmbeddingModelSelect
                        onChange={handleChange}
                        value={modelValue?.id || ""}
                      />
                    </div>
                  </div>
                  {definition.data.description && (
                    <Typography
                      id={`${inputId}-description`}
                      variant="caption"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }

            // Generic component rendering (Component should be defined at this point)
            if (!Component) {
              return null;
            }

            return (
              <div
                className="input-field"
                key={`${definition.nodeId}-${property.name}`}
              >
                <div className="input-field-control">
                  <Component
                    property={property}
                    value={value}
                    nodeType={definition.nodeType}
                    nodeId={definition.nodeId}
                    propertyIndex={propertyIndex}
                    onChange={handleChange}
                    tabIndex={Number(propertyIndex) + 1}
                  />
                </div>
                {definition.data.description && (
                  <Typography
                    id={`${inputId}-description`}
                    variant="caption"
                    color="text.secondary"
                  >
                    {definition.data.description}
                  </Typography>
                )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
};

MiniAppInputsForm.displayName = 'MiniAppInputsForm';

export default React.memo(MiniAppInputsForm);
