import { NodeMetadata } from "../stores/ApiTypes";
import ThemeNodetool from "../components/themes/ThemeNodetool";
import { devLog } from "../utils/DevLog";

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

          // Basic validation
          if (start >= text.length || matchText.length < minMatchLength) {
            return null;
          }

          // Verify match contains part of the search term
          const searchTermLower = searchTerm.toLowerCase();
          const matchTextLower = matchText.toLowerCase();
          const searchParts = searchTermLower.split(/\s+/);
          if (!searchParts.some((part) => matchTextLower.includes(part))) {
            return null;
          }

          return {
            indices: [start, end] as [number, number],
            text: matchText,
            length: matchText.length
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
    });

  // Find the longest match that isn't contained within another match
  const longestMatch = allMatches.reduce((longest, current) => {
    if (!longest) return current;

    // Check if current match overlaps with longest match
    const [cStart, cEnd] = current.indices;
    const [lStart, lEnd] = longest.indices;

    // If they overlap, take the longer one
    if (!(cEnd < lStart || cStart > lEnd)) {
      return current.length > longest.length ? current : longest;
    }

    // If they don't overlap, keep the longest one seen so far
    return current.length > longest.length ? current : longest;
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
