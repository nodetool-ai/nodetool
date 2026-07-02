import { memo } from "react";

import { Tooltip, ToolbarIconButton } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { LEFT_PANEL_TOP_LEVEL } from "../../config/quickAccessCategories";
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
  ({ activeCategory, onCategoryClick, hiddenViews, labelOverrides }) => (
    <>
      {LEFT_PANEL_TOP_LEVEL.filter(
        (cat) => !hiddenViews?.includes(cat.id)
      ).map((cat) => {
        const label = labelOverrides?.[cat.id] ?? cat.label;
        return (
          <Tooltip
            key={cat.id}
            title={label}
            placement="right-start"
            delay={TOOLTIP_ENTER_DELAY}
          >
            <ToolbarIconButton
              tabIndex={-1}
              ariaLabel={label}
              className={activeCategory === cat.id ? "active" : ""}
              onClick={() => onCategoryClick(cat.id)}
              icon={cat.icon}
            />
          </Tooltip>
        );
      })}
    </>
  )
);

QuickAccessSidebar.displayName = "QuickAccessSidebar";

export default QuickAccessSidebar;
