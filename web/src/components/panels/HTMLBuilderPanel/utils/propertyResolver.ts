/**
 * Property Resolver Utility
 *
 * Handles the resolution of dynamic properties from NodeTool workflows
 * to their values for use in HTML generation.
 */

import type {
  WorkflowInput,
  NodeToolPropertyType,
  PropertyBinding
} from "../types/builder.types";

/**
 * Type mapping from NodeTool API types to builder property types
 */
const typeMapping: Record<string, NodeToolPropertyType> = {
  string: "string",
  str: "string",
  text: "string",
  int: "number",
  integer: "number",
  float: "number",
  number: "number",
  bool: "boolean",
  boolean: "boolean",
  image: "ImageRef",
  ImageRef: "ImageRef",
  video: "VideoRef",
  VideoRef: "VideoRef",
  audio: "AudioRef",
  AudioRef: "AudioRef",
  TextRef: "TextRef",
  object: "object",
  dict: "object",
  list: "array",
  array: "array",
  any: "any"
};

/**
 * Map an API type to a NodeTool property type
 */
export const mapPropertyType = (apiType: string): NodeToolPropertyType => {
  return typeMapping[apiType] || "any";
};

/**
 * Check if a property type is a media type
 */
export const isMediaType = (type: NodeToolPropertyType): boolean => {
  return ["ImageRef", "VideoRef", "AudioRef"].includes(type);
};

/**
 * Check if a property type is a primitive
 */
export const isPrimitiveType = (type: NodeToolPropertyType): boolean => {
  return ["string", "number", "boolean"].includes(type);
};

/**
 * Get the appropriate HTML attribute for a media type
 */
export const getMediaAttribute = (
  type: NodeToolPropertyType,
  tag: string
): string => {
  switch (type) {
    case "ImageRef":
      return tag === "img" ? "src" : "data-image";
    case "VideoRef":
      return tag === "video" ? "src" : "data-video";
    case "AudioRef":
      return tag === "audio" ? "src" : "data-audio";
    default:
      return "data-value";
  }
};

/**
 * Create a property binding configuration
 */
export const createPropertyBinding = (
  propertyName: string,
  propertyType: NodeToolPropertyType,
  bindingType: PropertyBinding["bindingType"],
  attributeName?: string,
  styleProperty?: string
): PropertyBinding => {
  return {
    propertyName,
    propertyType,
    bindingType,
    attributeName,
    styleProperty
  };
};

/**
 * Suggest bindings for an element based on its tag
 */
export const suggestBindings = (
  tag: string,
  availableInputs: WorkflowInput[]
): Array<{
  input: WorkflowInput;
  suggestedAttribute: string;
  bindingType: PropertyBinding["bindingType"];
}> => {
  const suggestions: Array<{
    input: WorkflowInput;
    suggestedAttribute: string;
    bindingType: PropertyBinding["bindingType"];
  }> = [];

  for (const input of availableInputs) {
    switch (input.type) {
      case "ImageRef":
        if (tag === "img") {
          suggestions.push({
            input,
            suggestedAttribute: "src",
            bindingType: "attribute"
          });
        }
        break;

      case "VideoRef":
        if (tag === "video" || tag === "source") {
          suggestions.push({
            input,
            suggestedAttribute: "src",
            bindingType: "attribute"
          });
        }
        break;

      case "AudioRef":
        if (tag === "audio" || tag === "source") {
          suggestions.push({
            input,
            suggestedAttribute: "src",
            bindingType: "attribute"
          });
        }
        break;

      case "string":
        // Text content suggestion for text-containing elements
        if (["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "button", "a", "label"].includes(tag)) {
          suggestions.push({
            input,
            suggestedAttribute: "textContent",
            bindingType: "content"
          });
        }
        // Value suggestion for inputs
        if (["input", "textarea"].includes(tag)) {
          suggestions.push({
            input,
            suggestedAttribute: "value",
            bindingType: "attribute"
          });
        }
        // href for links
        if (tag === "a") {
          suggestions.push({
            input,
            suggestedAttribute: "href",
            bindingType: "attribute"
          });
        }
        break;

      case "number":
        // Numeric inputs
        if (tag === "input") {
          suggestions.push({
            input,
            suggestedAttribute: "value",
            bindingType: "attribute"
          });
        }
        break;

      case "boolean":
        // Checkbox checked state
        if (tag === "input") {
          suggestions.push({
            input,
            suggestedAttribute: "checked",
            bindingType: "attribute"
          });
        }
        // Disabled/hidden states
        suggestions.push({
          input,
          suggestedAttribute: "hidden",
          bindingType: "attribute"
        });
        break;
    }
  }

  return suggestions;
};

/**
 * Get bindable attributes for an HTML tag
 */
export const getBindableAttributes = (
  tag: string
): Array<{ name: string; description: string; types: NodeToolPropertyType[] }> => {
  const commonAttrs = [
    {
      name: "id",
      description: "Element ID",
      types: ["string"] as NodeToolPropertyType[]
    },
    {
      name: "class",
      description: "CSS classes",
      types: ["string"] as NodeToolPropertyType[]
    },
    {
      name: "title",
      description: "Tooltip text",
      types: ["string"] as NodeToolPropertyType[]
    },
    {
      name: "hidden",
      description: "Hide element",
      types: ["boolean"] as NodeToolPropertyType[]
    }
  ];

  const tagSpecificAttrs: Record<
    string,
    Array<{ name: string; description: string; types: NodeToolPropertyType[] }>
  > = {
    img: [
      {
        name: "src",
        description: "Image source URL",
        types: ["string", "ImageRef"]
      },
      { name: "alt", description: "Alternative text", types: ["string"] },
      { name: "width", description: "Image width", types: ["number", "string"] },
      { name: "height", description: "Image height", types: ["number", "string"] }
    ],
    video: [
      {
        name: "src",
        description: "Video source URL",
        types: ["string", "VideoRef"]
      },
      { name: "poster", description: "Poster image", types: ["string", "ImageRef"] },
      { name: "width", description: "Video width", types: ["number", "string"] },
      { name: "height", description: "Video height", types: ["number", "string"] }
    ],
    audio: [
      {
        name: "src",
        description: "Audio source URL",
        types: ["string", "AudioRef"]
      }
    ],
    a: [
      { name: "href", description: "Link URL", types: ["string"] },
      { name: "target", description: "Link target", types: ["string"] }
    ],
    input: [
      { name: "value", description: "Input value", types: ["string", "number"] },
      {
        name: "placeholder",
        description: "Placeholder text",
        types: ["string"]
      },
      { name: "name", description: "Input name", types: ["string"] },
      { name: "disabled", description: "Disabled state", types: ["boolean"] },
      { name: "checked", description: "Checked state", types: ["boolean"] },
      { name: "min", description: "Minimum value", types: ["number", "string"] },
      { name: "max", description: "Maximum value", types: ["number", "string"] }
    ],
    textarea: [
      { name: "value", description: "Text content", types: ["string"] },
      {
        name: "placeholder",
        description: "Placeholder text",
        types: ["string"]
      },
      { name: "name", description: "Field name", types: ["string"] },
      { name: "disabled", description: "Disabled state", types: ["boolean"] }
    ],
    button: [
      { name: "disabled", description: "Disabled state", types: ["boolean"] }
    ],
    iframe: [
      { name: "src", description: "Frame source URL", types: ["string"] },
      { name: "width", description: "Frame width", types: ["number", "string"] },
      { name: "height", description: "Frame height", types: ["number", "string"] }
    ]
  };

  return [...commonAttrs, ...(tagSpecificAttrs[tag] || [])];
};

/**
 * Get bindable style properties
 */
export const getBindableStyles = (): Array<{
  name: string;
  cssProperty: string;
  description: string;
  types: NodeToolPropertyType[];
}> => [
  {
    name: "Width",
    cssProperty: "width",
    description: "Element width",
    types: ["string", "number"]
  },
  {
    name: "Height",
    cssProperty: "height",
    description: "Element height",
    types: ["string", "number"]
  },
  {
    name: "Color",
    cssProperty: "color",
    description: "Text color",
    types: ["string"]
  },
  {
    name: "Background Color",
    cssProperty: "backgroundColor",
    description: "Background color",
    types: ["string"]
  },
  {
    name: "Background Image",
    cssProperty: "backgroundImage",
    description: "Background image URL",
    types: ["string", "ImageRef"]
  },
  {
    name: "Font Size",
    cssProperty: "fontSize",
    description: "Text size",
    types: ["string", "number"]
  },
  {
    name: "Opacity",
    cssProperty: "opacity",
    description: "Element opacity",
    types: ["number"]
  },
  {
    name: "Padding",
    cssProperty: "padding",
    description: "Inner spacing",
    types: ["string", "number"]
  },
  {
    name: "Margin",
    cssProperty: "margin",
    description: "Outer spacing",
    types: ["string", "number"]
  },
  {
    name: "Border Radius",
    cssProperty: "borderRadius",
    description: "Corner rounding",
    types: ["string", "number"]
  }
];

/**
 * Validate that a property type is compatible with a binding target
 */
export const isCompatibleType = (
  propertyType: NodeToolPropertyType,
  targetTypes: NodeToolPropertyType[]
): boolean => {
  if (targetTypes.includes("any")) {
    return true;
  }
  if (propertyType === "any") {
    return true;
  }
  return targetTypes.includes(propertyType);
};

/**
 * Extract workflow inputs from node metadata
 * This would integrate with the actual workflow store in the full implementation
 */
export const extractWorkflowInputs = (
  nodeData: Record<string, unknown>
): WorkflowInput[] => {
  const inputs: WorkflowInput[] = [];

  // Look for input node properties
  if (nodeData && typeof nodeData === "object") {
    for (const [key, value] of Object.entries(nodeData)) {
      if (value && typeof value === "object") {
        const valueObj = value as Record<string, unknown>;
        // Check for type information
        if (valueObj.type) {
          inputs.push({
            name: key,
            type: mapPropertyType(String(valueObj.type)),
            description: String(valueObj.description || ""),
            defaultValue: valueObj.default
          });
        }
      }
    }
  }

  return inputs;
};

/**
 * Format a property value for display
 */
export const formatPropertyValue = (
  value: unknown,
  type: NodeToolPropertyType
): string => {
  if (value === undefined || value === null) {
    return "(empty)";
  }

  switch (type) {
    case "ImageRef":
    case "VideoRef":
    case "AudioRef":
      if (typeof value === "object" && value !== null) {
        const mediaObj = value as Record<string, unknown>;
        return String(mediaObj.name || mediaObj.uri || mediaObj.url || "(media)");
      }
      return String(value);

    case "object":
    case "array":
      return JSON.stringify(value, null, 2);

    case "boolean":
      return value ? "true" : "false";

    default:
      return String(value);
  }
};

/**
 * Get icon name for a property type
 */
export const getPropertyTypeIcon = (type: NodeToolPropertyType): string => {
  switch (type) {
    case "string":
      return "TextFields";
    case "number":
      return "Numbers";
    case "boolean":
      return "ToggleOn";
    case "ImageRef":
      return "Image";
    case "VideoRef":
      return "VideoLibrary";
    case "AudioRef":
      return "AudioFile";
    case "TextRef":
      return "Description";
    case "object":
      return "DataObject";
    case "array":
      return "DataArray";
    default:
      return "HelpOutline";
  }
};
