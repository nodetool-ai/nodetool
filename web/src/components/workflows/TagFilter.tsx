/** @jsxImportSource @emotion/react */
import { Box } from "@mui/material";
import { EditorButton, Tooltip } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
import { memo, useCallback, useMemo } from "react";

interface TagFilterProps {
  tags: Record<string, Workflow[]>;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

const TagFilter = memo(({
  tags,
  selectedTag,
  onSelectTag
}: TagFilterProps) => {
  const sortedTags = useMemo(() =>
    Object.keys(tags)
      .filter((tag) => tag !== "start")
      .sort((a, b) => a.localeCompare(b)),
    [tags]
  );

  const handleSelectGettingStarted = useCallback(() => {
    onSelectTag("getting-started");
  }, [onSelectTag]);

  const handleSelectAll = useCallback(() => {
    onSelectTag(null);
  }, [onSelectTag]);

  const handleTagClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const tag = event.currentTarget.dataset.tag;
    if (tag) {
      onSelectTag(tag);
    }
  }, [onSelectTag]);

  return (
    <Box className="tag-menu">
      <div className="button-row">
        <Tooltip
          title="Basic examples to get started"
          delay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <EditorButton
            onClick={handleSelectGettingStarted}
            variant="outlined"
            className={selectedTag === "getting-started" ? "selected" : ""}
            density="normal"
          >
            Getting Started
          </EditorButton>
        </Tooltip>
        {sortedTags.map((tag) => (
            <Tooltip
              key={tag}
              title={`Show ${tag} examples`}
              delay={TOOLTIP_ENTER_DELAY}
              leaveDelay={TOOLTIP_LEAVE_DELAY}
            >
              <EditorButton
                onClick={handleTagClick}
                data-tag={tag}
                variant="outlined"
                className={selectedTag === tag ? "selected" : ""}
                density="normal"
              >
                {tag}
              </EditorButton>
            </Tooltip>
          ))}
        <Tooltip
          title="Show all example workflows"
          delay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <EditorButton
            onClick={handleSelectAll}
            className={selectedTag === null ? "selected" : ""}
            density="normal"
          >
            SHOW ALL
          </EditorButton>
        </Tooltip>
      </div>
    </Box>
  );
});

TagFilter.displayName = "TagFilter";

export default TagFilter;
