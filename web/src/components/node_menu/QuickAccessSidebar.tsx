import { memo } from "react";

import { Tooltip, ToolbarIconButton } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  QUICK_ACCESS_CATEGORIES,
  type QuickAccessCategoryId
} from "../../config/quickAccessCategories";

interface QuickAccessSidebarProps {
  activeCategory: QuickAccessCategoryId | "";
  onCategoryClick: (id: QuickAccessCategoryId) => void;
}

/**
 * Vertical icon list of left-panel categories (plan §7.2). Returns just the
 * buttons — the parent provides container styling (already in place via
 * `.vertical-toolbar` in `PanelLeft.tsx`).
 */
const QuickAccessSidebar = memo<QuickAccessSidebarProps>(
  ({ activeCategory, onCategoryClick }) => (
    <>
      {QUICK_ACCESS_CATEGORIES.map((cat) => (
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
