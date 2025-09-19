import React, { FormEvent, useCallback, useEffect, useMemo } from "react";
import { Button, Tooltip, Typography } from "@mui/material";
import { ReactFlowProvider } from "@xyflow/react";
import SendIcon from "@mui/icons-material/Send";

import { Property, Workflow } from "../../../stores/ApiTypes";
import { createNodeStore } from "../../../stores/NodeStore";
import { NodeContext } from "../../../contexts/NodeContext";
import { PropertyProps } from "../../node/PropertyInput";
import StringProperty from "../../properties/StringProperty";
import IntegerProperty from "../../properties/IntegerProperty";
import FloatProperty from "../../properties/FloatProperty";
import BoolProperty from "../../properties/BoolProperty";
import ImageProperty from "../../properties/ImageProperty";
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
  isSubmitDisabled: boolean;
  onSubmit: () => void | Promise<void>;
  onError: (message: string | null) => void;
}

const KIND_TO_PROPERTY_TYPE: Record<
  MiniAppInputKind,
  Property["type"]["type"]
> = {
  string: "str",
  integer: "int",
  float: "float",
  boolean: "bool",
  image: "image"
};

const PROPERTY_COMPONENT_MAP: Partial<
  Record<Property["type"]["type"], React.ComponentType<PropertyProps>>
> = {
  str: StringProperty,
  int: IntegerProperty,
  float: FloatProperty,
  bool: BoolProperty,
  image: ImageProperty
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
        return "";
      case "boolean":
        return false;
      default:
        return null;
    }
  })();

  return {
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
        : null
  } satisfies Property;
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
      return "";
    case "boolean":
      return false;
    default:
      return undefined;
  }
};

const MiniAppInputsForm: React.FC<MiniAppInputsFormProps> = ({
  workflow,
  inputDefinitions,
  inputValues,
  onInputChange,
  isSubmitDisabled,
  onSubmit,
  onError
}) => {
  const handleSubmitEvent = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void onSubmit();
    },
    [onSubmit]
  );

  const propertyEntries = useMemo(
    () =>
      inputDefinitions
        .map((definition, index) => {
          const property = createPropertyFromDefinition(definition);
          const Component = PROPERTY_COMPONENT_MAP[property.type.type];
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

  return (
    <form
      className="inputs-card glass-card"
      onSubmit={handleSubmitEvent}
      autoComplete="off"
    >
      <div className="inputs-shell">
        {propertyEntries.length > 0 ? (
          propertyEntries.map(
            ({ definition, property, Component, propertyIndex }) => {
              const inputId = `miniapp-input-${definition.nodeId}`;
              const value = resolveInputValue(
                definition,
                property,
                inputValues
              );

              const handleChange = (nextValue: unknown) => {
                onError(null);
                onInputChange(definition.data.name, nextValue);
              };

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
                      variant="body2"
                      color="text.secondary"
                    >
                      {definition.data.description}
                    </Typography>
                  )}
                </div>
              );
            }
          )
        ) : (
          <Typography variant="body2" color="text.secondary">
            This workflow does not define any configurable inputs.
          </Typography>
        )}
      </div>

      <div className="composer-actions">
        <Tooltip
          title={
            isSubmitDisabled
              ? "Select a workflow to run"
              : "Run the workflow with the configured inputs"
          }
        >
          <span>
            <Button
              color="primary"
              variant="contained"
              type="submit"
              endIcon={<SendIcon />}
              disabled={isSubmitDisabled}
              className="generate-button"
            >
              Run Workflow
            </Button>
          </span>
        </Tooltip>
      </div>
    </form>
  );
};

export default MiniAppInputsForm;
