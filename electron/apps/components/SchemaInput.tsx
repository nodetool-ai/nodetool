import React from "react";
import { Input, Textarea, Box, Text, FieldLabel } from "@chakra-ui/react";
import { Checkbox } from "./ui/checkbox";
import { useColorModeValue } from "./ui/color-mode";
import { Slider } from "./ui/slider";
import { Field } from "./ui/field";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "./ui/select";
import { JSONSchema } from "../types/workflow";
import AudioInput from "./AudioInput";
import { createListCollection } from "@chakra-ui/react";

interface SchemaInputProps {
  name: string;
  schema: JSONSchema;
  value: any;
  onChange: (value: any) => void;
}

export const SchemaInput: React.FC<SchemaInputProps> = ({
  name,
  schema,
  value,
  onChange,
}) => {
  const dropzoneBg = useColorModeValue("gray.50", "gray.700");
  const dropzoneBorder = useColorModeValue("gray.200", "gray.600");

  const renderInput = () => {
    if (schema.enum) {
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

      case "object":
        if (schema.properties?.type.enum?.includes("audio")) {
          return <AudioInput />;
        }
        if (schema.properties?.uri) {
          return (
            <Box
              border="2px dashed"
              borderColor={dropzoneBorder}
              borderRadius="md"
              p={4}
              bg={dropzoneBg}
              textAlign="center"
              cursor="pointer"
              _hover={{ borderColor: "blue.500" }}
              onClick={() => {
                /* Implement file input click handler */
              }}
            >
              <Text>Drop files here or click to upload</Text>
              {value?.uri && <Text mt={2}>Selected: {value.uri}</Text>}
            </Box>
          );
        }
        return null;

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
    <Field width="100%">
      <FieldLabel>{schema.title || schema.label || name}</FieldLabel>
      {renderInput()}
    </Field>
  );
};
