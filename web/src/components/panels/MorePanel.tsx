import { useCallback, useState } from "react";

import {
  LEFT_PANEL_MORE_GROUPS,
  type LeftPanelTopLevelCategory
} from "../../config/quickAccessCategories";
import type { LeftPanelView } from "../../stores/PanelStore";
import {
  FlexColumn,
  ListGroup,
  ListItemRow,
  ScrollArea,
  SearchInput,
  SectionHeader,
  SPACING,
  PanelHeader
} from "../ui_primitives";
import AppPagesList from "./AppPagesList";

interface MorePanelProps {
  readonly onSelectView: (view: LeftPanelView) => void;
  readonly hiddenViews?: readonly LeftPanelView[];
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
        <PanelHeader
          title="More"
          description="Search and open additional panels."
        />
      )}
      <FlexColumn sx={{ py: SPACING.md, px: isMobile ? SPACING.xl : 0 }}>
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
        <FlexColumn
          gap={SPACING.lg}
          sx={{ pb: SPACING.md, px: isMobile ? SPACING.xl : 0 }}
        >
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
          <AppPagesList
            onAction={onAppPageAction ?? NOOP}
            query={query}
            showSectionTitle
            showEmptyState={filteredGroups.length === 0}
            scope={isMobile ? "all" : "sidebar"}
          />
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default MorePanel;
