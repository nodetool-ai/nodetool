/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MOTION } from "./tokens";

const hexToRgb = (hex: string) => {
  const normalizedHex = hex.trim();
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    normalizedHex
  );
  if (!result) {return null;}
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(
    result[3],
    16
  )}`;
};

interface HighlightTextProps {
  text: string;
  query: string | null;
  className?: string;
  matchStyle?: "primary" | "underline";
  isBulletList?: boolean;
}

interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Tokenize text by splitting on the query string
 * Returns an array of text parts with match indicators
 */
const tokenize = (text: string, query: string | null): TextPart[] => {
  if (!query || query.trim() === "") {
    return [{ text, match: false }];
  }

  try {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escapedQuery})`, "gi");

    const parts = text.split(re).filter(Boolean);

    return parts.map((part) => {
      const matches = re.test(part);
      // Reset lastIndex — the /g regex is reused across parts and keeps state.
      re.lastIndex = 0;
      return {
        text: part,
        match: matches
      };
    });
  } catch (error) {
    console.warn("Tokenize error:", error);
    return [{ text, match: false }];
  }
};

const highlightStyles = (theme: Theme, matchStyle: "primary" | "underline") => {
  const rgbColor = hexToRgb(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--palette-primary-main"
    ) || "#1976d2"
  );

  return css({
    ".highlight-match": {
      ...(matchStyle === "primary" && {
        color: "var(--palette-primary-main)",
        fontWeight: 600
      }),
      ...(matchStyle === "underline" && {
        borderBottom: `2px solid rgba(${rgbColor || "25, 118, 210"}, 0.6)`,
        color: "var(--palette-primary-main)"
      }),
      transition: MOTION.all
    },
    "ul": {
      listStyleType: "disc",
      paddingLeft: "1.5em",
      margin: "0.5em 0"
    },
    "li": {
      marginBottom: "0.25em"
    }
  });
};

/**
 * Format text as bullet list if needed
 */
const formatBulletList = (text: string): string[] => {
  return text.split("\n").filter((line) => line.trim());
};

/**
 * HighlightText component that safely highlights matching text
 * Uses React components instead of dangerouslySetInnerHTML
 */
export const HighlightText = memo<HighlightTextProps>(
  ({ text, query, className, matchStyle = "primary", isBulletList = false }) => {
    const theme = useTheme();

    const styles = useMemo(
      () => highlightStyles(theme, matchStyle),
      [theme, matchStyle]
    );

    const parts = useMemo(
      () => tokenize(text, query),
      [text, query]
    );

    const lines = useMemo(
      () => isBulletList ? formatBulletList(text) : null,
      [text, isBulletList]
    );

    if (isBulletList && lines) {
      return (
        <ul className={className} css={styles}>
          {lines.map((line, lineIndex) => {
            const lineParts = tokenize(line, query);
            return (
              <li key={`${line}-${lineIndex}`}>
                {lineParts.map((part, partIndex) =>
                  part.match ? (
                    <span key={`${lineIndex}-${partIndex}-${part.text}`} className="highlight-match">
                      {part.text}
                    </span>
                  ) : (
                    <span key={`${lineIndex}-${partIndex}-${part.text}`}>{part.text}</span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    return (
      <span className={className} css={styles}>
        {parts.map((part, index) =>
          part.match ? (
            <span key={`${index}-${part.text}`} className="highlight-match">
              {part.text}
            </span>
          ) : (
            <span key={`${index}-${part.text}`}>{part.text}</span>
          )
        )}
      </span>
    );
  }
);

HighlightText.displayName = "HighlightText";
