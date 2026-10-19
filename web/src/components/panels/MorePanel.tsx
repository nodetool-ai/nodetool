import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = LEFT_PANEL_MORE_GROUPS.map((group) => {
    const translatedGroup = t(`i18n-next31.more.group.${group.id}`);
    const categories = group.categories
      .map((category) => ({
        ...category,
        label: t(`i18n-next31.more.category.${category.id}.label`),
        description: t(
          `i18n-next31.more.category.${category.id}.description`
        )
      }))
      .filter((category) => {
        if (hiddenViews.includes(category.id)) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        return `${translatedGroup} ${category.label} ${category.description}`
          .toLowerCase()
          .includes(normalizedQuery);
      });
    return { ...group, label: translatedGroup, categories };
  }).filter((group) => group.categories.length > 0);

  return (
    <FlexColumn fullHeight>
      {!isMobile && (
        <PanelHeader
          title={t("i18n-next31.more.title")}
          description={t("i18n-next31.more.description")}
        />
      )}
      <FlexColumn sx={{ py: SPACING.md, px: isMobile ? SPACING.xl : 0 }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          ariaLabel={t("i18n-next31.more.search")}
          placeholder={t("i18n-next31.more.search")}
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
