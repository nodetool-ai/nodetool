/** @jsxImportSource @emotion/react */
import { EditorButton } from "../editor_ui/EditorButton";
import { FlexRow } from "../ui_primitives/FlexRow";
import { Popover } from "../ui_primitives/Popover";
import { Tooltip } from "../ui_primitives/Tooltip";
import { Box } from "../ui_primitives/Box";
import { Workflow } from "../../stores/ApiTypes";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
import { memo, useCallback, useMemo, useState } from "react";
import {
  TOP_CATEGORIES,
  categoryCounts,
  overflowTagsWithCounts
} from "../../utils/templateCategories";

interface TagFilterProps {
  groupedTags: Record<string, Workflow[]>;
  workflows: Workflow[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

const TagFilter = memo(({
  groupedTags,
  workflows,
  selectedTag,
  onSelectTag
}: TagFilterProps) => {
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  const counts = useMemo(() => categoryCounts(workflows), [workflows]);
  const overflow = useMemo(
    () => overflowTagsWithCounts(groupedTags),
    [groupedTags]
  );

  const visibleCategories = useMemo(
    () => TOP_CATEGORIES.filter((c) => counts[c.id] > 0),
    [counts]
  );

  const handleSelectAll = useCallback(() => {
    onSelectTag(null);
  }, [onSelectTag]);

  const handleCategoryClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const id = event.currentTarget.dataset.categoryId;
      if (id) {
        onSelectTag(`cat:${id}`);
      }
    },
    [onSelectTag]
  );

  const handleTagClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const tag = event.currentTarget.dataset.tag;
      if (tag) {
        onSelectTag(tag);
        setMoreAnchor(null);
      }
    },
    [onSelectTag]
  );

  const openMore = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMoreAnchor(event.currentTarget);
  }, []);

  const closeMore = useCallback(() => setMoreAnchor(null), []);

  const moreSelected = useMemo(() => {
    if (!selectedTag || selectedTag.startsWith("cat:")) {
      return false;
    }
    return overflow.some((t) => t.tag === selectedTag);
  }, [selectedTag, overflow]);

  return (
    <Box className="tag-menu">
      <div className="button-row">
        <Tooltip
          title="Show all example workflows"
          delay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <EditorButton
            onClick={handleSelectAll}
            variant="outlined"
            className={selectedTag === null ? "selected" : ""}
            density="normal"
          >
            All
          </EditorButton>
        </Tooltip>
        {visibleCategories.map((cat) => (
          <Tooltip
            key={cat.id}
            title={`${cat.label} templates (${counts[cat.id]})`}
            delay={TOOLTIP_ENTER_DELAY}
            leaveDelay={TOOLTIP_LEAVE_DELAY}
          >
            <EditorButton
              onClick={handleCategoryClick}
              data-category-id={cat.id}
              variant="outlined"
              className={selectedTag === `cat:${cat.id}` ? "selected" : ""}
              density="normal"
            >
              {cat.label}
            </EditorButton>
          </Tooltip>
        ))}
        {overflow.length > 0 && (
          <EditorButton
            onClick={openMore}
            variant="outlined"
            className={moreSelected ? "selected" : ""}
            density="normal"
          >
            More…
          </EditorButton>
        )}
      </div>
      <Popover
        open={Boolean(moreAnchor)}
        anchorEl={moreAnchor}
        onClose={closeMore}
        placement="bottom-left"
        maxWidth={360}
      >
        <FlexRow
          wrap
          sx={{
            gap: "6px",
            padding: "12px"
          }}
        >
          {overflow.map(({ tag, count }) => (
            <EditorButton
              key={tag}
              onClick={handleTagClick}
              data-tag={tag}
              variant="outlined"
              className={selectedTag === tag ? "selected" : ""}
              density="normal"
            >
              {tag} <span style={{ opacity: 0.6, marginLeft: 6 }}>{count}</span>
            </EditorButton>
          ))}
        </FlexRow>
      </Popover>
    </Box>
  );
});

TagFilter.displayName = "TagFilter";

export default TagFilter;
