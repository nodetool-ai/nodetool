/**
 * HTML Generator Utility
 *
 * Generates clean, semantic HTML5 from builder elements.
 * Handles property binding resolution and HTML sanitization.
 */

import type {
  BuilderElement,
  HTMLGenerationOptions
} from "../types/builder.types";
import type { CSSProperties } from "react";

/**
 * HTML special character escapes
 */
const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

/**
 * Self-closing HTML tags
 */
const selfClosingTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

/**
 * Escape HTML special characters in text content
 */
export const escapeHtml = (text: string): string => {
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
};

/**
 * Convert CSSProperties to inline style string
 */
export const stylesToString = (styles: CSSProperties): string => {
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${cssKey}: ${value}`;
    })
    .join("; ");
};

/**
 * Parse style string back to CSSProperties
 */
export const stringToStyles = (styleString: string): CSSProperties => {
  const styles: Record<string, string> = {};
  const pairs = styleString.split(";").filter((s) => s.trim());

  for (const pair of pairs) {
    const colonIndex = pair.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }
    const key = pair.substring(0, colonIndex).trim();
    const value = pair.substring(colonIndex + 1).trim();

    // Convert kebab-case to camelCase
    const camelKey = key.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    );
    styles[camelKey] = value;
  }

  return styles as CSSProperties;
};

/**
 * Resolve a media reference (ImageRef, VideoRef, AudioRef) to a URL
 */
export const resolveMediaRef = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    // Try common URL properties
    const mediaValue = value as Record<string, unknown>;
    if (typeof mediaValue.uri === "string") {
      return mediaValue.uri;
    }
    if (typeof mediaValue.url === "string") {
      return mediaValue.url;
    }
    if (typeof mediaValue.src === "string") {
      return mediaValue.src;
    }
    if (typeof mediaValue.data === "string") {
      // Base64 data URL
      const mimeType =
        typeof mediaValue.type === "string" ? mediaValue.type : "image/png";
      return `data:${mimeType};base64,${mediaValue.data}`;
    }
  }

  return "";
};

/**
 * Resolve property value based on type
 */
export const resolvePropertyValue = (
  value: unknown,
  propertyType: string
): string => {
  if (value === undefined || value === null) {
    return "";
  }

  switch (propertyType) {
    case "ImageRef":
    case "VideoRef":
    case "AudioRef":
      return resolveMediaRef(value);

    case "number":
      return String(value);

    case "boolean":
      return String(value);

    case "object":
    case "array":
      return JSON.stringify(value);

    case "string":
    default:
      return String(value);
  }
};

/**
 * Resolve template syntax in text (e.g., {{property_name}})
 */
export const resolveTemplates = (
  text: string,
  propertyValues: Record<string, unknown>
): string => {
  return text.replace(/\{\{(\w+)\}\}/g, (match, propName) => {
    const value = propertyValues[propName];
    if (value !== undefined) {
      // Auto-detect type and resolve appropriately
      if (typeof value === "object" && value !== null) {
        // Check if it's a media reference
        const mediaUrl = resolveMediaRef(value);
        if (mediaUrl) {
          return mediaUrl;
        }
        return JSON.stringify(value);
      }
      return String(value);
    }
    return match; // Keep original if not found
  });
};

/**
 * Resolve all property bindings for an element
 */
export const resolveBindings = (
  element: BuilderElement,
  propertyValues: Record<string, unknown>
): { textContent?: string; attributes: Record<string, string> } => {
  const result = {
    textContent: element.textContent,
    attributes: { ...element.attributes }
  };

  // Process explicit bindings
  for (const [_key, binding] of Object.entries(element.propertyBindings)) {
    const value = propertyValues[binding.propertyName];
    if (value === undefined) {
      continue;
    }

    const resolvedValue = resolvePropertyValue(value, binding.propertyType);

    if (binding.bindingType === "content") {
      result.textContent = resolvedValue;
    } else if (binding.bindingType === "attribute" && binding.attributeName) {
      result.attributes[binding.attributeName] = resolvedValue;
    }
  }

  // Process template syntax in text content
  if (result.textContent) {
    result.textContent = resolveTemplates(result.textContent, propertyValues);
  }

  // Process template syntax in attributes
  for (const [attrName, attrValue] of Object.entries(result.attributes)) {
    result.attributes[attrName] = resolveTemplates(attrValue, propertyValues);
  }

  return result;
};

/**
 * Generate HTML attributes string
 */
export const generateAttributeString = (
  attributes: Record<string, string>,
  styles: CSSProperties,
  inlineStyles: boolean
): string => {
  const parts: string[] = [];

  // Add regular attributes
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}="${escapeHtml(String(value))}"`);
    }
  }

  // Add inline styles if enabled
  if (inlineStyles && Object.keys(styles).length > 0) {
    const styleString = stylesToString(styles);
    if (styleString) {
      parts.push(`style="${escapeHtml(styleString)}"`);
    }
  }

  return parts.length > 0 ? " " + parts.join(" ") : "";
};

/**
 * Generate HTML for a single element
 */
export const generateElementHTML = (
  element: BuilderElement,
  elements: Record<string, BuilderElement>,
  propertyValues: Record<string, unknown>,
  options: HTMLGenerationOptions,
  depth: number = 0
): string => {
  const prefix = options.prettyPrint ? options.indentation.repeat(depth) : "";
  const newline = options.prettyPrint ? "\n" : "";

  // Resolve property bindings
  const resolved = resolveBindings(element, propertyValues);

  // Build attributes string
  const attrString = generateAttributeString(
    resolved.attributes,
    element.styles,
    options.inlineStyles
  );

  // Check if self-closing tag
  if (selfClosingTags.has(element.tag)) {
    return `${prefix}<${element.tag}${attrString} />${newline}`;
  }

  // Generate children HTML
  const childrenHTML = element.children
    .map((childId) => {
      const child = elements[childId];
      return child
        ? generateElementHTML(child, elements, propertyValues, options, depth + 1)
        : "";
    })
    .join("");

  // Text content (escaped)
  const textContent = resolved.textContent
    ? escapeHtml(resolved.textContent)
    : "";

  const hasContent = element.children.length > 0 || textContent;

  // Empty element
  if (!hasContent) {
    return `${prefix}<${element.tag}${attrString}></${element.tag}>${newline}`;
  }

  // Text-only element (no children)
  if (textContent && element.children.length === 0) {
    return `${prefix}<${element.tag}${attrString}>${textContent}</${element.tag}>${newline}`;
  }

  // Element with children (and possibly text)
  const textPart = textContent
    ? `${prefix}${options.indentation}${textContent}${newline}`
    : "";

  return (
    `${prefix}<${element.tag}${attrString}>${newline}` +
    `${textPart}${childrenHTML}` +
    `${prefix}</${element.tag}>${newline}`
  );
};

/**
 * Generate style tag content for non-inline styles
 */
export const generateStyleTag = (
  elements: Record<string, BuilderElement>,
  indentation: string
): string => {
  const rules: string[] = [];

  for (const element of Object.values(elements)) {
    if (Object.keys(element.styles).length > 0) {
      const selector = `#${element.id}`;
      const styleString = stylesToString(element.styles);
      rules.push(`${indentation}${indentation}${selector} { ${styleString} }`);
    }
  }

  if (rules.length === 0) {
    return "";
  }

  return `${indentation}<style>\n${rules.join("\n")}\n${indentation}</style>\n`;
};

/**
 * Generate complete HTML document
 */
export const generateFullHTML = (
  elements: Record<string, BuilderElement>,
  rootElementIds: string[],
  propertyValues: Record<string, unknown>,
  options: HTMLGenerationOptions
): string => {
  const { indentation } = options;

  // Generate body content
  const bodyContent = rootElementIds
    .map((id) => {
      const element = elements[id];
      return element
        ? generateElementHTML(
            element,
            elements,
            propertyValues,
            options,
            options.includeFullStructure ? 2 : 0
          )
        : "";
    })
    .join("");

  // Return just body content if not full structure
  if (!options.includeFullStructure) {
    return bodyContent;
  }

  // Build meta tags
  const metaTags = (options.metaTags || [])
    .map(
      (meta) =>
        `${indentation}${indentation}<meta name="${escapeHtml(meta.name)}" content="${escapeHtml(meta.content)}">`
    )
    .join("\n");

  // Build custom head elements
  const headElements = (options.headElements || [])
    .map((el) => `${indentation}${indentation}${el}`)
    .join("\n");

  // Build style tag if not inlining
  const styleTag = !options.inlineStyles
    ? generateStyleTag(elements, indentation)
    : "";

  // Build doctype
  const doctype = options.includeDoctype ? "<!DOCTYPE html>\n" : "";

  // Assemble full document
  return `${doctype}<html lang="en">
${indentation}<head>
${indentation}${indentation}<meta charset="UTF-8">
${indentation}${indentation}<meta name="viewport" content="width=device-width, initial-scale=1.0">
${metaTags ? metaTags + "\n" : ""}${headElements ? headElements + "\n" : ""}${styleTag}${indentation}</head>
${indentation}<body>
${bodyContent}${indentation}</body>
</html>`;
};

/**
 * Validate HTML structure
 */
export const validateHTML = (html: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Simple validation checks
  // Check for matching tags (basic)
  const openTagRegex = /<(\w+)(?:\s[^>]*)?>/g;
  const closeTagRegex = /<\/(\w+)>/g;
  const selfClosingRegex = /<(\w+)(?:\s[^>]*)?\s*\/>/g;

  const openTags: string[] = [];
  let match;

  // Track self-closing tags to exclude
  const selfClosed = new Set<string>();
  while ((match = selfClosingRegex.exec(html)) !== null) {
    selfClosed.add(match[1].toLowerCase());
  }

  // Count open tags (excluding self-closing)
  while ((match = openTagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    if (!selfClosingTags.has(tag) && !selfClosed.has(tag)) {
      openTags.push(tag);
    }
  }

  // Count close tags
  const closeTags: string[] = [];
  while ((match = closeTagRegex.exec(html)) !== null) {
    closeTags.push(match[1].toLowerCase());
  }

  // Basic matching check
  if (openTags.length !== closeTags.length) {
    errors.push(
      `Mismatched tags: ${openTags.length} open tags, ${closeTags.length} close tags`
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Minify HTML by removing unnecessary whitespace
 */
export const minifyHTML = (html: string): string => {
  return html
    .replace(/>\s+</g, "><") // Remove whitespace between tags
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
};

/**
 * Pretty print HTML with proper indentation
 */
export const prettyPrintHTML = (
  html: string,
  indentation: string = "  "
): string => {
  let result = "";
  let depth = 0;
  const tags = html.match(/<[^>]+>|[^<]+/g) || [];

  for (const tag of tags) {
    if (tag.startsWith("</")) {
      // Closing tag
      depth--;
      result += indentation.repeat(Math.max(0, depth)) + tag.trim() + "\n";
    } else if (tag.startsWith("<") && !tag.endsWith("/>") && !tag.includes("<!")) {
      // Opening tag
      result += indentation.repeat(depth) + tag.trim() + "\n";
      depth++;
    } else if (tag.startsWith("<")) {
      // Self-closing or special tag
      result += indentation.repeat(depth) + tag.trim() + "\n";
    } else {
      // Text content
      const trimmed = tag.trim();
      if (trimmed) {
        result += indentation.repeat(depth) + trimmed + "\n";
      }
    }
  }

  return result;
};
