/**
 * Component Registry
 *
 * Defines the available HTML components for the builder palette.
 * Components are categorized for easy navigation.
 */

import type { ComponentDefinition } from "../types/builder.types";

/**
 * Layout components
 */
const layoutComponents: ComponentDefinition[] = [
  {
    id: "div-container",
    name: "Container",
    description: "A basic div container for grouping elements",
    category: "layout",
    icon: "ViewModule",
    tag: "div",
    type: "container",
    defaultAttributes: {},
    defaultStyles: {
      padding: "16px",
      minHeight: "100px"
    },
    canHaveChildren: true
  },
  {
    id: "section",
    name: "Section",
    description: "A semantic section element",
    category: "layout",
    icon: "Crop169",
    tag: "section",
    type: "container",
    defaultAttributes: {},
    defaultStyles: {
      padding: "24px",
      marginBottom: "16px"
    },
    canHaveChildren: true
  },
  {
    id: "flex-row",
    name: "Flex Row",
    description: "A horizontal flex container",
    category: "layout",
    icon: "ViewColumn",
    tag: "div",
    type: "container",
    defaultAttributes: {},
    defaultStyles: {
      display: "flex",
      flexDirection: "row",
      gap: "8px",
      alignItems: "center"
    },
    canHaveChildren: true
  },
  {
    id: "flex-column",
    name: "Flex Column",
    description: "A vertical flex container",
    category: "layout",
    icon: "ViewStream",
    tag: "div",
    type: "container",
    defaultAttributes: {},
    defaultStyles: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    canHaveChildren: true
  },
  {
    id: "grid",
    name: "Grid",
    description: "A CSS grid container",
    category: "layout",
    icon: "GridView",
    tag: "div",
    type: "container",
    defaultAttributes: {},
    defaultStyles: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "16px"
    },
    canHaveChildren: true
  }
];

/**
 * Typography components
 */
const typographyComponents: ComponentDefinition[] = [
  {
    id: "heading-1",
    name: "Heading 1",
    description: "Main page heading",
    category: "typography",
    icon: "Title",
    tag: "h1",
    type: "heading",
    defaultAttributes: {},
    defaultStyles: {
      fontSize: "32px",
      fontWeight: "bold",
      marginBottom: "16px"
    },
    defaultTextContent: "Heading 1",
    canHaveChildren: false
  },
  {
    id: "heading-2",
    name: "Heading 2",
    description: "Section heading",
    category: "typography",
    icon: "Title",
    tag: "h2",
    type: "heading",
    defaultAttributes: {},
    defaultStyles: {
      fontSize: "24px",
      fontWeight: "bold",
      marginBottom: "12px"
    },
    defaultTextContent: "Heading 2",
    canHaveChildren: false
  },
  {
    id: "heading-3",
    name: "Heading 3",
    description: "Subsection heading",
    category: "typography",
    icon: "Title",
    tag: "h3",
    type: "heading",
    defaultAttributes: {},
    defaultStyles: {
      fontSize: "20px",
      fontWeight: "bold",
      marginBottom: "8px"
    },
    defaultTextContent: "Heading 3",
    canHaveChildren: false
  },
  {
    id: "paragraph",
    name: "Paragraph",
    description: "A paragraph of text",
    category: "typography",
    icon: "Subject",
    tag: "p",
    type: "text",
    defaultAttributes: {},
    defaultStyles: {
      fontSize: "16px",
      lineHeight: "1.5",
      marginBottom: "8px"
    },
    defaultTextContent: "Enter your text here...",
    canHaveChildren: false
  },
  {
    id: "span",
    name: "Span",
    description: "Inline text element",
    category: "typography",
    icon: "TextFields",
    tag: "span",
    type: "text",
    defaultAttributes: {},
    defaultStyles: {},
    defaultTextContent: "Text",
    canHaveChildren: false
  },
  {
    id: "link",
    name: "Link",
    description: "A hyperlink",
    category: "typography",
    icon: "Link",
    tag: "a",
    type: "text",
    defaultAttributes: {
      href: "#"
    },
    defaultStyles: {
      color: "#0066cc",
      textDecoration: "underline"
    },
    defaultTextContent: "Link text",
    canHaveChildren: false
  }
];

/**
 * Form components
 */
const formComponents: ComponentDefinition[] = [
  {
    id: "form",
    name: "Form",
    description: "A form container",
    category: "forms",
    icon: "Assignment",
    tag: "form",
    type: "form",
    defaultAttributes: {},
    defaultStyles: {
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    },
    canHaveChildren: true
  },
  {
    id: "text-input",
    name: "Text Input",
    description: "A text input field",
    category: "forms",
    icon: "TextFields",
    tag: "input",
    type: "input",
    defaultAttributes: {
      type: "text",
      placeholder: "Enter text..."
    },
    defaultStyles: {
      padding: "8px 12px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      fontSize: "14px"
    },
    canHaveChildren: false
  },
  {
    id: "email-input",
    name: "Email Input",
    description: "An email input field",
    category: "forms",
    icon: "Email",
    tag: "input",
    type: "input",
    defaultAttributes: {
      type: "email",
      placeholder: "Enter email..."
    },
    defaultStyles: {
      padding: "8px 12px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      fontSize: "14px"
    },
    canHaveChildren: false
  },
  {
    id: "textarea",
    name: "Text Area",
    description: "A multiline text input",
    category: "forms",
    icon: "Notes",
    tag: "textarea",
    type: "input",
    defaultAttributes: {
      placeholder: "Enter text...",
      rows: "4"
    },
    defaultStyles: {
      padding: "8px 12px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      fontSize: "14px",
      resize: "vertical"
    },
    canHaveChildren: false
  },
  {
    id: "select",
    name: "Select",
    description: "A dropdown select",
    category: "forms",
    icon: "ArrowDropDown",
    tag: "select",
    type: "input",
    defaultAttributes: {},
    defaultStyles: {
      padding: "8px 12px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      fontSize: "14px"
    },
    canHaveChildren: true
  },
  {
    id: "checkbox",
    name: "Checkbox",
    description: "A checkbox input",
    category: "forms",
    icon: "CheckBox",
    tag: "input",
    type: "input",
    defaultAttributes: {
      type: "checkbox"
    },
    defaultStyles: {
      width: "16px",
      height: "16px"
    },
    canHaveChildren: false
  },
  {
    id: "label",
    name: "Label",
    description: "A form label",
    category: "forms",
    icon: "Label",
    tag: "label",
    type: "text",
    defaultAttributes: {},
    defaultStyles: {
      fontSize: "14px",
      fontWeight: "500",
      marginBottom: "4px"
    },
    defaultTextContent: "Label",
    canHaveChildren: false
  }
];

/**
 * Media components
 */
const mediaComponents: ComponentDefinition[] = [
  {
    id: "image",
    name: "Image",
    description: "An image element",
    category: "media",
    icon: "Image",
    tag: "img",
    type: "image",
    defaultAttributes: {
      src: "https://via.placeholder.com/300x200",
      alt: "Image description"
    },
    defaultStyles: {
      maxWidth: "100%",
      height: "auto"
    },
    canHaveChildren: false
  },
  {
    id: "video",
    name: "Video",
    description: "A video element",
    category: "media",
    icon: "VideoLibrary",
    tag: "video",
    type: "media",
    defaultAttributes: {
      controls: "true"
    },
    defaultStyles: {
      maxWidth: "100%"
    },
    canHaveChildren: true
  },
  {
    id: "audio",
    name: "Audio",
    description: "An audio element",
    category: "media",
    icon: "AudioFile",
    tag: "audio",
    type: "media",
    defaultAttributes: {
      controls: "true"
    },
    defaultStyles: {
      width: "100%"
    },
    canHaveChildren: true
  },
  {
    id: "iframe",
    name: "iFrame",
    description: "An embedded iframe",
    category: "media",
    icon: "WebAsset",
    tag: "iframe",
    type: "media",
    defaultAttributes: {
      src: "about:blank",
      frameborder: "0"
    },
    defaultStyles: {
      width: "100%",
      height: "300px",
      border: "none"
    },
    canHaveChildren: false
  }
];

/**
 * Interactive components
 */
const interactiveComponents: ComponentDefinition[] = [
  {
    id: "button",
    name: "Button",
    description: "A clickable button",
    category: "interactive",
    icon: "SmartButton",
    tag: "button",
    type: "button",
    defaultAttributes: {
      type: "button"
    },
    defaultStyles: {
      padding: "8px 16px",
      backgroundColor: "#0066cc",
      color: "#ffffff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "500"
    },
    defaultTextContent: "Button",
    canHaveChildren: false
  },
  {
    id: "submit-button",
    name: "Submit Button",
    description: "A form submit button",
    category: "interactive",
    icon: "Send",
    tag: "button",
    type: "button",
    defaultAttributes: {
      type: "submit"
    },
    defaultStyles: {
      padding: "10px 24px",
      backgroundColor: "#28a745",
      color: "#ffffff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "500"
    },
    defaultTextContent: "Submit",
    canHaveChildren: false
  }
];

/**
 * All component definitions organized by category
 */
export const componentRegistry: ComponentDefinition[] = [
  ...layoutComponents,
  ...typographyComponents,
  ...formComponents,
  ...mediaComponents,
  ...interactiveComponents
];

/**
 * Get components by category
 */
export const getComponentsByCategory = (
  category: ComponentDefinition["category"]
): ComponentDefinition[] => {
  return componentRegistry.filter((c) => c.category === category);
};

/**
 * Get component by ID
 */
export const getComponentById = (id: string): ComponentDefinition | undefined => {
  return componentRegistry.find((c) => c.id === id);
};

/**
 * Get all categories
 */
export const getCategories = (): Array<{
  id: ComponentDefinition["category"];
  name: string;
  icon: string;
}> => [
  { id: "layout", name: "Layout", icon: "ViewModule" },
  { id: "typography", name: "Typography", icon: "Title" },
  { id: "forms", name: "Forms", icon: "Assignment" },
  { id: "media", name: "Media", icon: "Image" },
  { id: "interactive", name: "Interactive", icon: "TouchApp" }
];
