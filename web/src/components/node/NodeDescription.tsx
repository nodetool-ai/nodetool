/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback } from "react";

const styles = (theme: Theme) =>
  css({
    fontWeight: "400",
    fontSize: theme.fontSizeNormal,
    color: theme.vars.palette.grey[0],
    whiteSpace: "pre-wrap",
    marginBottom: "0.5em",
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",
    ".first-line": {
      lineHeight: "1.2em"
    },
    ".tags-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5em"
    },
    ".tag": {
      fontWeight: "600",
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[1000],
      backgroundColor: theme.vars.palette.grey[400],
      borderRadius: "0.5em",
      padding: "0.2em 0.5em",
      textTransform: "uppercase",
      display: "inline-block",
      "&:hover": {
        filter: "brightness(1.2)"
      }
    },
    ".rest-description": {
      lineHeight: "1.2em",
      whiteSpace: "pre-wrap"
    }
  });

interface NodeDescriptionProps {
  description: string;
  className?: string;
  onTagClick?: (tag: string) => void;
}

const NodeDescription = React.memo(({
  description,
  className,
  onTagClick
}: NodeDescriptionProps) => {
  const theme = useTheme();

<<<<<<< HEAD
  const handleTagClick = useCallback(
    (tag: string) => {
      if (onTagClick) {
        onTagClick(tag);
      }
    },
    [onTagClick]
  );

  const createTagClickHandler = useCallback(
    (tag: string) => () => handleTagClick(tag),
    [handleTagClick]
  );
=======
  const handleTagClick = useCallback((tag: string) => () => {
    if (onTagClick) {
      onTagClick(tag);
    }
  }, [onTagClick]);
>>>>>>> origin/main

  if (!description) {
    return null;
  }

  const lines = description.split("\n");
  const firstLine = lines[0] || "";
  const tagsLine = lines.length > 1 ? lines[1] : "";
  const restOfDescription =
    lines.length > 2
      ? lines
          .slice(2)
          .map((line) => line.trim())
          .join("\n")
      : "";

  const tags = tagsLine
    ? tagsLine
        .split(",")
        .map((tag) => tag.trim())
        .filter((t) => t)
    : [];

  return (
    <div css={styles(theme)} className={className}>
      {firstLine && <span className="first-line">{firstLine}</span>}
      {tags.length > 0 && (
        <div className="tags-container">
          {tags.map((tag, index) => (
            <span
              key={index}
              className="tag"
<<<<<<< HEAD
              onClick={createTagClickHandler(tag)}
              style={{ cursor: onTagClick ? "pointer" : "default" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {restOfDescription && (
        <div className="rest-description">{restOfDescription}</div>
      )}
    </div>
  );
});

NodeDescription.displayName = "NodeDescription";

export default NodeDescription;
