import { memo, useCallback } from "react";

import {
  FlexColumn,
  SPACING,
  Tooltip,
  ToolbarIconButton
} from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  isMorePanelView,
  LEFT_PANEL_TOP_LEVEL
} from "../../config/quickAccessCategories";
import type { LeftPanelTopLevelCategory } from "../../config/quickAccessCategories";
import type { LeftPanelView } from "../../stores/PanelStore";

interface QuickAccessSidebarProps {
  readonly activeCategory: LeftPanelView | "";
  readonly onCategoryClick: (id: LeftPanelView) => void;
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
  const handleClick = useCallback(
    () => onCategoryClick(category.id),
    [category.id, onCategoryClick]
  );

  return (
    <Tooltip
      title={category.label}
      placement="right-start"
      delay={TOOLTIP_ENTER_DELAY}
    >
      <ToolbarIconButton
        tabIndex={-1}
        ariaLabel={category.label}
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
  ({ activeCategory, onCategoryClick }) => {
    return (
      <FlexColumn className="quick-access-top" gap={SPACING.md}>
        {LEFT_PANEL_TOP_LEVEL.map((category) => (
          <QuickAccessButton
            key={category.id}
            category={category}
            active={
              category.id === "more"
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
