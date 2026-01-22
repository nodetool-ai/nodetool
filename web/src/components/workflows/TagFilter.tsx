/** @jsxImportSource @emotion/react */
import { Box, Button, Tooltip } from "@mui/material";
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

  const handleSelectTag = useCallback((tag: string) => {
    onSelectTag(tag);
  }, [onSelectTag]);

  const handleTagClick = useCallback((tag: string) => {
    handleSelectTag(tag);
  }, [handleSelectTag]);

  return (
    <Box className="tag-menu">
      <div className="button-row">
        <Tooltip
          title="Basic examples to get started"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <Button
            onClick={handleSelectGettingStarted}
            variant="outlined"
            className={selectedTag === "getting-started" ? "selected" : ""}
          >
            Getting Started
          </Button>
        </Tooltip>
          {sortedTags.map((tag) => (
            <Tooltip
              key={tag}
              title={`Show ${tag} examples`}
              enterDelay={TOOLTIP_ENTER_DELAY}
              leaveDelay={TOOLTIP_LEAVE_DELAY}
            >
              <Button
                onClick={handleTagClick.bind(null, tag)}
                variant="outlined"
                className={selectedTag === tag ? "selected" : ""}
              >
                {tag}
              </Button>
            </Tooltip>
          ))}
        <Tooltip
          title="Show all example workflows"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <Button
            onClick={handleSelectAll}
            className={selectedTag === null ? "selected" : ""}
          >
            SHOW ALL
          </Button>
        </Tooltip>
      </div>
    </Box>
  );
});

TagFilter.displayName = "TagFilter";

export default TagFilter;
