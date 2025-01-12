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

  devLog("\n=== HIGHLIGHT DEBUG ===");
  devLog("Input:", { text, key, searchTerm });
  devLog("Search info:", searchInfo);

  if (!searchTerm || !searchInfo?.matches) {
    devLog("No search term or matches, returning plain text");
    return { html: escapeHtml(text), highlightedWords };
  }

  // Get all valid matches first
  const allMatches = searchInfo.matches
    .filter((match) => match.key === key) // Only use matches from the specified key
    .flatMap((match) => {
      devLog(`Found matches for key "${key}":`, match);
      return match.indices
        .map(([start, end]) => {
          const matchText = text.slice(start, end + 1);
          devLog("Potential match:", { start, end, matchText });

          // Basic validation
          if (start >= text.length) {
            devLog("Invalid: start index beyond text length");
            return null;
          }
          if (matchText.length < minMatchLength) {
            devLog("Invalid: match too short");
            return null;
          }

          // Verify match contains part of the search term
          const searchTermLower = searchTerm.toLowerCase();
          const matchTextLower = matchText.toLowerCase();
          const searchParts = searchTermLower.split(/\s+/);
          if (!searchParts.some((part) => matchTextLower.includes(part))) {
            devLog("Invalid: match does not contain any part of search term");
            return null;
          }

          devLog("Valid match");
          return {
            indices: [start, end] as [number, number],
            text: matchText,
            length: matchText.length
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
    });

  devLog("Valid matches:", allMatches);

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
