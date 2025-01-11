import { NodeMetadata } from "../stores/ApiTypes";
import ThemeNodetool from "../components/themes/ThemeNodetool";

const escapeHtml = (text: string): string => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

export interface HighlightResult {
  html: string;
  highlightedWords: string[];
}

export const highlightText = (
  text: string,
  key: string,
  searchTerm: string | null,
  searchInfo?: NodeMetadata["searchInfo"],
  minMatchLength: number = 3
): HighlightResult => {
  const highlightedWords: string[] = [];

  if (!searchTerm || !searchInfo?.matches) {
    return { html: escapeHtml(text), highlightedWords };
  }

  // Get all valid matches first
  const allMatches = searchInfo.matches
    .filter((match) => match.key === key) // Only use matches from the specified key
    .flatMap((match) => {
      return match.indices
        .map(([start, end]) => {
          const matchText = text.slice(start, end + 1);

          // More strict validation
          if (start >= text.length) return null;
          if (matchText.length < minMatchLength) return null;
          // Check if match contains spaces (spans multiple words)
          if (matchText.includes(" ")) return null;

          return {
            indices: [start, end] as [number, number],
            text: matchText,
            length: matchText.length
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
    });

  // Find the longest match
  const longestMatch = allMatches.reduce((longest, current) => {
    if (!longest || current.length > longest.length) {
      return current;
    }
    return longest;
  }, null as (typeof allMatches)[0] | null);

  if (!longestMatch) {
    return { html: escapeHtml(text), highlightedWords };
  }

  // Create highlighted HTML with just the longest match
  const parts: string[] = [];
  const [start, end] = longestMatch.indices;

  // Add text before match
  if (start > 0) {
    parts.push(escapeHtml(text.slice(0, start)));
  }

  // Add the highlighted match
  highlightedWords.push(longestMatch.text);
  parts.push(
    `<span class="highlight" style="border-bottom: 1px solid ${
      ThemeNodetool.palette.c_hl1
    }">${escapeHtml(longestMatch.text)}</span>`
  );

  // Add text after match
  if (end + 1 < text.length) {
    parts.push(escapeHtml(text.slice(end + 1)));
  }

  return {
    html: parts.join(""),
    highlightedWords
  };
};
