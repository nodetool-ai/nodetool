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
