import { Fragment, memo } from "react";

import {
  Divider,
  FlexColumn,
  SPACING,
  Tooltip,
  ToolbarIconButton
} from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { LEFT_PANEL_GROUPS } from "../../config/quickAccessCategories";
import type {
  LeftPanelGroup,
  LeftPanelTopLevelCategory
} from "../../config/quickAccessCategories";
import type { LeftPanelView } from "../../stores/PanelStore";

interface QuickAccessSidebarProps {
  activeCategory: LeftPanelView | "";
  onCategoryClick: (id: LeftPanelView) => void;
  /** Top-level views to omit from the rail (e.g. show only Assets on /chat). */
  hiddenViews?: readonly LeftPanelView[];
  /** Per-view label overrides (e.g. "Assets" -> "Workflow Output" while a workflow is open). */
  labelOverrides?: Partial<Record<LeftPanelView, string>>;
}

/**
 * Vertical icon list of left-panel top-level views. Returns just the
 * buttons — the parent provides container styling via `.vertical-toolbar`.
 */
const QuickAccessSidebar = memo<QuickAccessSidebarProps>(
  ({ activeCategory, onCategoryClick, hiddenViews, labelOverrides }) => {
    const visibleGroups = LEFT_PANEL_GROUPS.map((group) => ({
      ...group,
      categories: group.categories.filter(
        (category) => !hiddenViews?.includes(category.id)
      )
    })).filter((group) => group.categories.length > 0);
    const topGroups = visibleGroups.filter(
      (group) => group.placement === "top"
    );
    const bottomGroups = visibleGroups.filter(
      (group) => group.placement === "bottom"
    );

    const renderCategory = (category: LeftPanelTopLevelCategory) => {
      const label = labelOverrides?.[category.id] ?? category.label;
      return (
        <Tooltip
          key={category.id}
          title={label}
          placement="right-start"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <ToolbarIconButton
            tabIndex={-1}
            ariaLabel={label}
            className={activeCategory === category.id ? "active" : ""}
            onClick={() => onCategoryClick(category.id)}
            icon={category.icon}
          />
        </Tooltip>
      );
    };

    const renderGroups = (groups: readonly LeftPanelGroup[]) =>
      groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 && (
            <Divider className="toolbar-divider" sx={{ mx: SPACING.lg }} />
          )}
          <FlexColumn className="quick-access-group" gap={SPACING.md}>
            {group.categories.map(renderCategory)}
          </FlexColumn>
        </Fragment>
      ));

    return (
      <>
        <FlexColumn className="quick-access-top" gap={SPACING.md}>
          {renderGroups(topGroups)}
        </FlexColumn>
        <FlexColumn className="quick-access-bottom" gap={SPACING.md}>
          {renderGroups(bottomGroups)}
        </FlexColumn>
      </>
    );
  }
);

QuickAccessSidebar.displayName = "QuickAccessSidebar";

export default QuickAccessSidebar;
