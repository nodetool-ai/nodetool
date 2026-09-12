import { useCallback, useState } from "react";

import {
  LEFT_PANEL_MORE_GROUPS,
  type LeftPanelTopLevelCategory
} from "../../config/quickAccessCategories";
import type { LeftPanelView } from "../../stores/PanelStore";
import {
  EmptyState,
  FlexColumn,
  ListGroup,
  ListItemRow,
  PADDING,
  ScrollArea,
  SearchInput,
  SectionHeader,
  SPACING
} from "../ui_primitives";
import PanelHeadline from "../ui/PanelHeadline";
import AppPagesList from "./AppPagesList";

interface MorePanelProps {
  readonly onSelectView: (view: LeftPanelView) => void;
  readonly hiddenViews?: readonly LeftPanelView[];
  readonly includeAppPages?: boolean;
  readonly onAppPageAction?: () => void;
  readonly isMobile?: boolean;
}

interface MorePanelCategoryRowProps {
  readonly category: LeftPanelTopLevelCategory;
  readonly onSelectView: (view: LeftPanelView) => void;
}

const EMPTY_VIEWS: readonly LeftPanelView[] = [];
const NOOP = (): void => undefined;

const MorePanelCategoryRow = ({
  category,
  onSelectView
}: MorePanelCategoryRowProps) => {
  const handleClick = useCallback(
    () => onSelectView(category.id),
    [category.id, onSelectView]
  );

  return (
    <ListItemRow
      icon={category.icon}
      primary={category.label}
      secondary={category.description}
      onClick={handleClick}
    />
  );
};

const MorePanel: React.FC<MorePanelProps> = ({
  onSelectView,
  hiddenViews = EMPTY_VIEWS,
  includeAppPages = false,
  onAppPageAction,
  isMobile = false
}) => {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = LEFT_PANEL_MORE_GROUPS.map((group) => ({
    ...group,
    categories: group.categories.filter((category) => {
      if (hiddenViews.includes(category.id)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return `${group.label} ${category.label} ${category.description}`
        .toLowerCase()
        .includes(normalizedQuery);
    })
  })).filter((group) => group.categories.length > 0);

  return (
    <FlexColumn fullHeight>
      {!isMobile && (
        <PanelHeadline
          title="More"
          description="Search and open additional panels."
        />
      )}
      <FlexColumn padding={PADDING.spacious} gap={SPACING.md}>
        <SearchInput
          value={query}
          onChange={setQuery}
          ariaLabel="Search all panels"
          placeholder="Search all panels"
          fullWidth
        />
      </FlexColumn>
      <ScrollArea
        fullHeight
        thin
        sx={{ flex: 1, minHeight: 0, height: "auto" }}
      >
        <FlexColumn padding={PADDING.spacious} gap={SPACING.lg}>
          {filteredGroups.map((group) => (
            <FlexColumn key={group.id}>
              <SectionHeader title={group.label} size="small" />
              <ListGroup compact flush>
                {group.categories.map((category) => (
                  <MorePanelCategoryRow
                    key={category.id}
                    category={category}
                    onSelectView={onSelectView}
                  />
                ))}
              </ListGroup>
            </FlexColumn>
          ))}
          {includeAppPages && (
            <AppPagesList
              onAction={onAppPageAction ?? NOOP}
              query={query}
              showSectionTitle
              showEmptyState={filteredGroups.length === 0}
            />
          )}
          {filteredGroups.length === 0 && !includeAppPages && (
            <EmptyState
              variant="no-results"
              title="No panels found"
              description="No panels match your search."
              size="small"
            />
          )}
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default MorePanel;
