// Utility functions for converting between different editor formats
// (Slate.js, Markdown, and Lexical)

export const convertSlateToLexical = (slateData: any): string => {
  // For now, just extract the plain text as a starting point.
  // This is a placeholder and will need to be made more robust.
  try {
    if (Array.isArray(slateData) && slateData.length > 0) {
      const text = slateData
        .map((node: any) =>
          node.children.map((child: any) => child.text).join("\n")
        )
        .join("\n");

      return JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: text,
                  type: "text",
                  version: 1
                }
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1
            }
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1
        }
      });
    }
  } catch (e) {
    console.error("Error converting Slate to Lexical:", e);
  }

  // Return a default empty state if conversion fails
  return JSON.stringify({
    root: {
      children: [{ type: "paragraph", children: [{ type: "text", text: "" }] }]
    }
  });
};

/**
 * Detects if a string contains markdown-like syntax
 */
export const isMarkdownText = (text: string): boolean => {
  if (!text || typeof text !== "string") {return false;}

  // Check for common markdown patterns
  return (
    /#{1,6}\s/.test(text) || // Headers
    /\*\*[^*]+\*\*/.test(text) || // Bold
    /\*[^*]+\*/.test(text) || // Italic
    /\[[^\]]+\]\([^)]+\)/.test(text) || // Links
    /^[*+-]\s/m.test(text) || // Lists
    /^\d+\.\s/m.test(text) || // Ordered lists
    /^>\s/m.test(text) || // Blockquotes
    /```/.test(text) || // Code blocks
    /`[^`]+`/.test(text) // Inline code
  );
};
