/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback } from "react";
import { Chip } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    fontWeight: "400",
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.grey[0],
    whiteSpace: "pre-wrap",
    marginBottom: "0.25em",
    display: "flex",
    flexDirection: "column",
    gap: "0.25em",
    ".first-line": {
      lineHeight: "1.2em",
      opacity: 0.85
    },
    ".tags-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.25em"
    },
    ".rest-description": {
      lineHeight: "1.2em",
      whiteSpace: "pre-wrap",
      opacity: 0.85
    }
  });

interface NodeDescriptionProps {
  description: string;
  className?: string;
  onTagClick?: (tag: string) => void;
}

const NodeDescription = React.memo(
  ({ description, className, onTagClick }: NodeDescriptionProps) => {
    const theme = useTheme();

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
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                compact
                size="small"
                variant="outlined"
                onClick={onTagClick ? createTagClickHandler(tag) : undefined}
                sx={{ cursor: onTagClick ? "pointer" : "default", textTransform: "uppercase" }}
              />
            ))}
          </div>
        )}
        {restOfDescription && (
          <div className="rest-description">{restOfDescription}</div>
        )}
      </div>
    );
  }
);

NodeDescription.displayName = "NodeDescription";

export default NodeDescription;
