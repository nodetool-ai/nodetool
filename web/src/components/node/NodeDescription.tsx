/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";

const styles = (theme: any) =>
  css({
    fontWeight: "400",
    fontSize: theme.fontSizeNormal,
    color: theme.palette.c_white,
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
      color: theme.palette.c_black,
      backgroundColor: theme.palette.c_gray4,
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

const NodeDescription: React.FC<NodeDescriptionProps> = ({
  description,
  className,
  onTagClick
}) => {
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

  const handleTagClick = (tag: string) => {
    if (onTagClick) {
      onTagClick(tag);
    }
  };

  return (
    <div css={styles} className={className}>
      {firstLine && <span className="first-line">{firstLine}</span>}
      {tags.length > 0 && (
        <div className="tags-container">
          {tags.map((tag, index) => (
            <span
              key={index}
              className="tag"
              onClick={() => handleTagClick(tag)}
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
};

export default NodeDescription;
