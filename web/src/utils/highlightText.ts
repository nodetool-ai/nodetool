import { NodeMetadata } from "../stores/ApiTypes";
import { sanitizeText } from "./sanitize";

export const escapeHtml = (text: string): string => {
  return sanitizeText(text);
};

// Convert hex color to RGB values
export const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {return null;}
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(
    result[3],
    16
  )}`;
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
  isBulletList: boolean = false
): HighlightResult => {
  const highlightedWords: string[] = [];

  // If no search or matches, return plain text
  if (!searchTerm || !searchInfo?.matches) {
    const html = isBulletList
      ? formatBulletList(escapeHtml(text))
      : escapeHtml(text);
    return { html, highlightedWords };
  }

  // Get matches for this key
  const matches = searchInfo.matches
    .filter((match) => match.key === key)
    .flatMap((match) =>
      match.indices.map(([start, end]) => ({
        start,
        end,
        text: text.slice(start, end + 1),
        length: end - start + 1,
        // Calculate similarity to search term
        relevance: searchTerm
          ? text
              .slice(start, end + 1)
              .toLowerCase()
              .includes(searchTerm.toLowerCase())
            ? 2
            : text
                .slice(start, end + 1)
                .toLowerCase()
                .replace(/\s+/g, "")
                .includes(searchTerm.toLowerCase().replace(/\s+/g, ""))
            ? 1
            : 0
          : 0
      }))
    )
    .filter((match) => match.start < text.length); // Validate bounds

  if (matches.length === 0) {
    const html = isBulletList
      ? formatBulletList(escapeHtml(text))
      : escapeHtml(text);
    return { html, highlightedWords };
  }

  // Remove overlapping matches, keeping the better ones
  const nonOverlappingMatches = matches
    .sort((a, b) => {
      // First sort by relevance (descending)
      if (b.relevance !== a.relevance) {return b.relevance - a.relevance;}
      // Then by length (descending)
      if (b.length !== a.length) {return b.length - a.length;}
      // Then by start position (ascending)
      return a.start - b.start;
    })
    .filter((match, index, arr) => {
      // Keep this match if it doesn't overlap with any previous (better) matches
      return !arr
        .slice(0, index)
        .some(
          (prevMatch) =>
            match.start <= prevMatch.end && match.end >= prevMatch.start
        );
    });

  // Sort by position for processing
  const orderedMatches = [...nonOverlappingMatches].sort(
    (a, b) => a.start - b.start
  );

  // Find the best match for coloring (most relevant and longest)
  const bestMatch = nonOverlappingMatches[0];
  const longestLength =
    orderedMatches.length > 0 ? orderedMatches[0].length : 0;

  // Build highlighted HTML
  const parts: string[] = [];
  let lastEnd = 0;
  let hasColoredMatch = false;
  const rgbColor = hexToRgb(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--palette-primary-main"
    ) || "#fff"
  );

  for (const match of orderedMatches) {
    // Add text before match
    if (match.start > lastEnd) {
      parts.push(escapeHtml(text.slice(lastEnd, match.start)));
    }

    // Add highlighted match
    highlightedWords.push(match.text);
    const opacity = Math.round(
      (0.1 + 0.9 * (match.length / bestMatch.length)) * 100
    );
    const shouldColor = !hasColoredMatch && match === bestMatch;
    if (shouldColor) {hasColoredMatch = true;}
    const borderWidth = shouldColor ? "0px" : "1px";
    parts.push(
      `<span class="highlight" style="border-bottom: ${borderWidth} solid rgba(${
        rgbColor || "255, 0, 0"
      }, ${opacity}%);${
        shouldColor ? `color: var(--palette-primary-main);` : ""
      }transition: all 0.2s ease;">${escapeHtml(match.text)}</span>`
    );

    lastEnd = match.end + 1;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    parts.push(escapeHtml(text.slice(lastEnd)));
  }

  // Format result
  let html = parts.join("");
  if (isBulletList) {
    html = formatBulletList(html);
  }

  return { html, highlightedWords };
};

// Helper function for bullet list formatting
export const formatBulletList = (text: string): string => {
  const lines = text.split("\n").filter((line) => line.trim());
  return `<ul>${lines.map((line) => `<li>${line}</li>`).join("\n")}</ul>`;
};
