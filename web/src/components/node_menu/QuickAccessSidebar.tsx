import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  FlexColumn,
  SPACING,
  Tooltip,
  ToolbarIconButton
} from "../ui_primitives";
import {
  isDocumentPanelView,
  isMorePanelView,
  LEFT_PANEL_TOP_LEVEL
} from "../../config/quickAccessCategories";
import type { LeftPanelTopLevelCategory } from "../../config/quickAccessCategories";
import type { LeftPanelView } from "../../stores/PanelStore";

interface QuickAccessSidebarProps {
  readonly activeCategory: LeftPanelView | "";
  readonly onCategoryClick: (id: LeftPanelView) => void;
  readonly hiddenViews?: readonly LeftPanelView[];
}

interface QuickAccessButtonProps {
  readonly category: LeftPanelTopLevelCategory;
  readonly active: boolean;
  readonly onCategoryClick: (id: LeftPanelView) => void;
}

const QuickAccessButton = ({
  category,
  active,
  onCategoryClick
}: QuickAccessButtonProps) => {
  const { t } = useTranslation();
  const label = t(`i18n-next50-node-menu.quickAccess.${category.id}`, {
    defaultValue: category.label
  });
  const handleClick = useCallback(
    () => onCategoryClick(category.id),
    [category.id, onCategoryClick]
  );

  return (
    <Tooltip
      title={label}
      placement="right-start"
    >
      <ToolbarIconButton
        tabIndex={-1}
        ariaLabel={label}
        aria-pressed={active}
        active={active}
        onClick={handleClick}
        icon={category.icon}
      />
    </Tooltip>
  );
};

/**
 * Vertical icon list of left-panel top-level views. Returns just the
 * buttons — the parent provides container styling via `.vertical-toolbar`.
 */
const QuickAccessSidebar = memo<QuickAccessSidebarProps>(
  ({ activeCategory, onCategoryClick, hiddenViews = [] }) => {
    return (
      <FlexColumn className="quick-access-top" gap={SPACING.md}>
        {LEFT_PANEL_TOP_LEVEL.filter(
          (category) => !hiddenViews.includes(category.id)
        ).map((category) => (
          <QuickAccessButton
            key={category.id}
            category={category}
            active={
              category.id === "documents"
                ? isDocumentPanelView(activeCategory)
                : category.id === "more"
                ? isMorePanelView(activeCategory)
                : activeCategory === category.id
            }
            onCategoryClick={onCategoryClick}
          />
        ))}
      </FlexColumn>
    );
  }
);

QuickAccessSidebar.displayName = "QuickAccessSidebar";

export default QuickAccessSidebar;
