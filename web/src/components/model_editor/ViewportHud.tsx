import { memo } from "react";
import { useTranslation } from "react-i18next";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import GridOnIcon from "@mui/icons-material/GridOn";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";

import {
  Divider,
  EditorButton,
  FlexRow,
  MenuItemPrimitive,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";
import { MenuButton } from "./MenuButton";
import {
  EDITOR_SHORTCUTS,
  shortcutKeys,
  withShortcut,
  type EditorAction
} from "./editorShortcuts";
import type { ViewPreset } from "./ViewportHelpers";
import type { ViewPrefs } from "./viewPrefs";

const VIEW_ACTIONS: Record<ViewPreset, EditorAction> = {
  front: "viewFront",
  back: "viewBack",
  right: "viewRight",
  left: "viewLeft",
  top: "viewTop",
  bottom: "viewBottom"
};

const shortcutLabel = (action: EditorAction): string =>
  EDITOR_SHORTCUTS.find((s) => s.action === action)?.keys.join("+") ?? "";

interface ViewportHudProps {
  className?: string;
  prefs: ViewPrefs;
  canFocus: boolean;
  onView: (view: ViewPreset) => void;
  onFrameAll: () => void;
  onFocus: () => void;
  onTogglePref: (key: keyof ViewPrefs) => void;
}

/** Camera views, framing and display toggles over the top-left of the viewport. */
const ViewportHud = ({
  className,
  prefs,
  canFocus,
  onView,
  onFrameAll,
  onFocus,
  onTogglePref
}: ViewportHudProps) => {
  const { t } = useTranslation();
  const viewLabels: Record<ViewPreset, string> = {
    front: t("i18n-next38.viewport.front"),
    back: t("i18n-next38.viewport.back"),
    right: t("i18n-next38.viewport.right"),
    left: t("i18n-next38.viewport.left"),
    top: t("i18n-next38.viewport.top"),
    bottom: t("i18n-next38.viewport.bottom")
  };
  return (
    <FlexRow className={className}>
      <MenuButton label={t("i18n-next38.viewport.view")} icon={<VideocamOutlinedIcon />} tooltip={t("i18n-next38.viewport.cameraViews")}>
        {(close) => [
          ...(Object.keys(viewLabels) as ViewPreset[]).map((view) => (
            <MenuItemPrimitive
              key={view}
              label={viewLabels[view]}
              shortcut={shortcutLabel(VIEW_ACTIONS[view])}
              onClick={() => {
                onView(view);
                close();
              }}
            />
          )),
          <MenuItemPrimitive
            key="frame"
            label={t("i18n-next38.viewport.frameAll")}
            dividerBefore
            shortcut={shortcutLabel("frameAll")}
            onClick={() => {
              onFrameAll();
              close();
            }}
          />
        ]}
      </MenuButton>
      <Tooltip title={withShortcut(t("i18n-next38.viewport.frameAllObjects"), "frameAll")}>
        <EditorButton
          density="compact"
          variant="text"
          startIcon={<FitScreenIcon />}
          sx={{ whiteSpace: "nowrap" }}
          onClick={onFrameAll}
        >
          {t("i18n-next38.viewport.frameAll")}
        </EditorButton>
      </Tooltip>
      <Tooltip title={withShortcut(t("i18n-next38.viewport.frameSelection"), "focusSelection")}>
        {/* The span keeps the tooltip on a disabled button. */}
        <span>
          <EditorButton
            density="compact"
            variant="text"
            startIcon={<CenterFocusStrongIcon />}
            sx={{ whiteSpace: "nowrap" }}
            onClick={onFocus}
            disabled={!canFocus}
          >
            {t("i18n-next38.viewport.frameSelection")}
          </EditorButton>
        </span>
      </Tooltip>
      <Divider orientation="vertical" flexItem />
      <ToolbarIconButton
        icon={<GridOnIcon fontSize="small" />}
        tooltip={t("i18n-next38.viewport.grid")}
        shortcut={shortcutKeys("toggleGrid")}
        onClick={() => onTogglePref("grid")}
        active={prefs.grid}
        size="small"
      />
      <ToolbarIconButton
        icon={<ViewInArOutlinedIcon fontSize="small" />}
        tooltip={t("i18n-next38.viewport.wireframeOverlay")}
        shortcut={shortcutKeys("toggleWireframe")}
        onClick={() => onTogglePref("wireframe")}
        active={prefs.wireframe}
        size="small"
      />
      <ToolbarIconButton
        icon={<LightbulbOutlinedIcon fontSize="small" />}
        tooltip={t("i18n-next38.viewport.lightIcons")}
        onClick={() => onTogglePref("lightIcons")}
        active={prefs.lightIcons}
        size="small"
      />
    </FlexRow>
  );
};

export default memo(ViewportHud);
