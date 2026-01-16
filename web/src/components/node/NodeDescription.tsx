import React, { useCallback } from "react";
import { useTheme } from "@mui/material";
import { css } from "@emotion/react";

interface NodeDescriptionProps {
  description?: string;
  className?: string;
  onTagClick?: (tag: string) => void;
}

const styles = (theme: any) => css`
  font-size: 13px;
  line-height: 1.5;
  color: ${theme.vars.palette.text.primary};
  white-space: pre-wrap;
  word-break: break-word;

  .first-line {
    display: block;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }

  .tag {
    background-color: ${theme.vars.palette.primary.dark};
    color: ${theme.vars.palette.primary.contrastText};
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .rest-description {
    margin-top: 4px;
    color: ${theme.vars.palette.text.secondary};
  }
`;

const NodeDescription = React.memo(({
  description,
  className,
  onTagClick
}: NodeDescriptionProps) => {
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
          {tags.map((tag, index) => (
            <span
              key={index}
              className="tag"
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
