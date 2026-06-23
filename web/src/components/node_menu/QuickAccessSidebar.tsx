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
}

/**
 * Vertical icon list of left-panel top-level views. Returns just the
 * buttons — the parent provides container styling via `.vertical-toolbar`.
 */
const QuickAccessSidebar = memo<QuickAccessSidebarProps>(
  ({ activeCategory, onCategoryClick, hiddenViews }) => (
    <>
      {LEFT_PANEL_TOP_LEVEL.filter(
        (cat) => !hiddenViews?.includes(cat.id)
      ).map((cat) => (
        <Tooltip
          key={cat.id}
          title={cat.label}
          placement="right-start"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <ToolbarIconButton
            tabIndex={-1}
            ariaLabel={cat.label}
            className={activeCategory === cat.id ? "active" : ""}
            onClick={() => onCategoryClick(cat.id)}
            icon={cat.icon}
          />
        </Tooltip>
      ))}
    </>
  )
);

QuickAccessSidebar.displayName = "QuickAccessSidebar";

export default QuickAccessSidebar;
