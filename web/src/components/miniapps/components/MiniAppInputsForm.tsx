import React, { useEffect, useMemo, useState } from "react";
import { Tooltip, Typography } from "@mui/material";

import { Property, Workflow } from "../../../stores/ApiTypes";
import { PropertyProps } from "../../node/PropertyInput";
import StringProperty from "../../properties/StringProperty";
import IntegerProperty from "../../properties/IntegerProperty";
import FloatProperty from "../../properties/FloatProperty";
import BoolProperty from "../../properties/BoolProperty";
import ImageProperty from "../../properties/ImageProperty";
import AudioProperty from "../../properties/AudioProperty";
import FilePathProperty from "../../properties/FilePathProperty";
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
  image: "image",
  audio: "audio",
  file_path: "str"
};

const PROPERTY_COMPONENT_MAP: Partial<
  Record<Property["type"]["type"], React.ComponentType<PropertyProps>>
> = {
  str: StringProperty,
  int: IntegerProperty,
  float: FloatProperty,
  bool: BoolProperty,
  image: ImageProperty,
  audio: AudioProperty
};

const JSON_SCHEMA_EXTRA_TYPE_MAP: Partial<
  Record<string, React.ComponentType<PropertyProps>>
> = {
  file_path: FilePathProperty
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
        return "";
      case "boolean":
        return false;
      default:
        return null;
    }
  })();

  const property: Property = {
    name: definition.data.name,
    type: {
      type: KIND_TO_PROPERTY_TYPE[definition.kind],
      optional: true,
      values: null,
      type_args: [],
      type_name: null
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
      return "";
    case "boolean":
      return false;
    default:
      return undefined;
  }
};

const getStringInputConfig = (definition: MiniAppInputDefinition) => {
  const DEFAULT_STRING_INPUT_MAX_LENGTH = 100000;
  const data = definition.data as {
    max_length?: unknown;
    line_mode?: unknown;
    multiline?: unknown;
  };

  const maxLength = (() => {
    if (data.max_length === 0) {
      return 0;
    }
    if (typeof data.max_length === "number" && Number.isFinite(data.max_length)) {
      return Math.max(0, Math.floor(data.max_length));
    }
    return DEFAULT_STRING_INPUT_MAX_LENGTH;
  })();

  const lineMode =
    data.line_mode === "multiline" || data.multiline === true
      ? "multiline"
      : "single_line";

  return { maxLength, lineMode } as const;
};

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

          // Check json_schema_extra first (like PropertyInput.tsx does)
          let Component: React.ComponentType<PropertyProps> | undefined;
          if (property.json_schema_extra?.type) {
            Component = JSON_SCHEMA_EXTRA_TYPE_MAP[property.json_schema_extra.type as string];
          }

          // Fall back to type-based mapping
          if (!Component) {
            Component = PROPERTY_COMPONENT_MAP[property.type.type];
          }

          if (!Component) {
            return null;
          }

          return {
            definition,
            property,
            Component,
            propertyIndex: index.toString()
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
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
              const multiline = lineMode === "multiline";
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

export default MiniAppInputsForm;
