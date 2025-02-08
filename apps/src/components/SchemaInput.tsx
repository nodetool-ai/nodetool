import React from "react";
import { Input, Textarea, Box, Text, FieldLabel } from "@chakra-ui/react";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";
import { Field } from "./ui/field";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "./ui/select";
import { JSONSchema } from "../src/types/workflow";
import AudioInput from "./AudioInput";
import { createListCollection } from "@chakra-ui/react";
import ImageInput from "./ImageInput";
import VideoInput from "./VideoInput";
import DocumentInput from "./DocumentInput";

interface SchemaInputProps {
  name: string;
  schema: JSONSchema;
  value: any;
  onChange: (value: any) => void;
  className?: string;
}

export const SchemaInput: React.FC<SchemaInputProps> = ({
  name,
  schema,
  value,
  onChange,
  className,
}) => {
  const renderInput = () => {
    if (!schema || typeof schema !== "object") {
      console.warn("Invalid schema provided to SchemaInput");
      return null;
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      const options = createListCollection({
        items: schema.enum.map((option) => ({
          label: String(option),
          value: String(option),
        })),
      });

      return (
        <SelectRoot
          collection={options}
          value={value || ""}
          onChange={onChange}
        >
          <SelectTrigger>
            <SelectValueText placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {options.items.map((option) => (
              <SelectItem item={option} key={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      );
    }

    switch (schema.type) {
      case "boolean":
        return (
          <Checkbox checked={value || false} onChange={onChange}>
            {schema.description}
          </Checkbox>
        );

      case "number":
      case "integer":
        if (schema.minimum !== undefined && schema.maximum !== undefined) {
          return (
            <Slider
              value={value || schema.minimum}
              min={schema.minimum}
              max={schema.maximum}
              step={schema.type === "integer" ? 1 : 0.1}
              onChange={onChange}
            />
          );
        }
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            min={schema.minimum}
            max={schema.maximum}
          />
        );

      case "object": {
        const typeEnum = schema.properties?.type?.enum;
        if (Array.isArray(typeEnum)) {
          if (typeEnum.includes("audio")) {
            return <AudioInput onChange={onChange} />;
          }
          if (typeEnum.includes("image")) {
            return <ImageInput onChange={onChange} />;
          }
          if (typeEnum.includes("video")) {
            return <VideoInput onChange={onChange} />;
          }
          if (typeEnum.includes("document")) {
            return <DocumentInput onChange={onChange} />;
          }
        }
        return null;
      }

      case "string":
        if (schema.maxLength && schema.maxLength > 100) {
          return (
            <Textarea
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={schema.description}
            />
          );
        }
        return (
          <Input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={schema.description}
          />
        );

      default:
        return (
          <Input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={schema.description}
          />
        );
    }
  };

  return (
    <Field
      className={
        className ? `schema-input-root ${className}` : "schema-input-root"
      }
      width="100%"
    >
      <FieldLabel>{schema.title || schema.label || name}</FieldLabel>
      {renderInput()}
    </Field>
  );
};
