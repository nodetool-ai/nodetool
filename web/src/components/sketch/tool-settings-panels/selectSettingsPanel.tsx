import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CropIcon from "@mui/icons-material/Crop";
import GestureOutlinedIcon from "@mui/icons-material/GestureOutlined";
import PentagonOutlinedIcon from "@mui/icons-material/PentagonOutlined";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import OpacityIcon from "@mui/icons-material/Opacity";
import BorderStyleIcon from "@mui/icons-material/BorderStyle";
import {
  iconButtonCompactSx,
  sketchButtonSmallSx,
  SKETCH_COLORS
} from "../sketchStyles";
import { SelectSettings, SelectToolMode } from "../types";
import {
  Divider,
  EditorButton,
  FlexRow,
  Text,
  ToolbarIconButton,
  Tooltip,
  Box,
  BORDER_RADIUS,
  Slider,
  ICON_SIZE
} from "../../ui_primitives";
import { RefineSelectionPopover } from "./refine-selection";
import { useSketchStore } from "../state";

interface SelectSettingsPanelProps {
  settings: SelectSettings;
  onChange: (settings: Partial<SelectSettings>) => void;
  hasActiveSelection: boolean;
  onInvertSelection: () => void;
  onCropCanvasToSelection?: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onConvertSelectionToBorder: () => void;
}

export const SelectSettingsPanel = memo(function SelectSettingsPanel({
  settings,
  onChange,
  hasActiveSelection,
  onInvertSelection,
  onCropCanvasToSelection,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onConvertSelectionToBorder
}: SelectSettingsPanelProps) {
  const { t } = useTranslation();
  const refineAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const selectionPreviewMode = useSketchStore((s) => s.selectionPreviewMode);
  const setSelectionPreviewMode = useSketchStore(
    (s) => s.setSelectionPreviewMode
  );
  const showAsMask = selectionPreviewMode === "mask";

  return (
    <>
      <SketchModeToggle
        value={settings.mode}
        onChange={(_e, v: SelectToolMode | null) => {
          if (v != null) {
            onChange({ mode: v });
          }
        }}
      >
        <SketchModeOption
          value="rectangle"
          variant="icon"
          aria-label={t("i18n-cont-sketch-tools-08.selection.rectangularMarquee")}
          title={t("i18n-cont-sketch-tools-08.selection.rectangularMarquee")}
        >
          <RectangleOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="ellipse"
          variant="icon"
          aria-label={t("i18n-cont-sketch-tools-08.selection.ellipticalMarquee")}
          title={t("i18n-cont-sketch-tools-08.selection.ellipticalMarquee")}
        >
          <RadioButtonUncheckedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="lasso"
          variant="icon"
          aria-label={t("i18n-cont-sketch-tools-08.selection.freehandLasso")}
          title={t("i18n-cont-sketch-tools-08.selection.freehandLassoTooltip")}
        >
          <GestureOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="lasso_polygon"
          variant="icon"
          aria-label={t("i18n-cont-sketch-tools-08.selection.polygonSelection")}
          title={t("i18n-cont-sketch-tools-08.selection.polygon")}
        >
          <PentagonOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
        <SketchModeOption
          value="magic_wand"
          variant="icon"
          aria-label={t("i18n-cont-sketch-tools-08.selection.magicWand")}
          title={t("i18n-cont-sketch-tools-08.selection.magicWandTooltip")}
        >
          <AutoAwesomeOutlinedIcon fontSize="inherit" />
        </SketchModeOption>
      </SketchModeToggle>

      {settings.mode === "magic_wand" ? (
        <>
          <Box className="setting-row">
            <Text className="setting-label">{t("i18n-cont-sketch-tools-08.selection.toleranceAbbreviation")}</Text>
            <Slider
              size="small"
              min={0}
              max={255}
              value={settings.magicWandTolerance}
              onChange={(_, v) => onChange({ magicWandTolerance: v as number })}
            />
            <Text className="setting-value">{settings.magicWandTolerance}</Text>
          </Box>
          <SketchModeToggle
            exclusive={false}
            value={[
              ...(settings.contiguous ? ["contiguous"] : []),
              ...(settings.sampleAllLayers ? ["allLayers"] : [])
            ]}
            onChange={(_, vals: string[]) => {
              onChange({
                contiguous: vals.includes("contiguous"),
                sampleAllLayers: vals.includes("allLayers")
              });
            }}
            sx={{ flexWrap: "wrap" }}
          >
            <SketchModeOption value="contiguous">{t("i18n-cont-sketch-tools-08.selection.contiguous")}</SketchModeOption>
            <SketchModeOption value="allLayers">{t("i18n-cont-sketch-tools-08.selection.allLayers")}</SketchModeOption>
          </SketchModeToggle>
        </>
      ) : null}

      <FlexRow
        align="center"
        wrap
        gap={0.5}
        fullWidth
        sx={{
          rowGap: 1
        }}
      >
        <FlexRow
          align="center"
          wrap
          gap={1}
          sx={{
            flex: 1,
            minWidth: 0
          }}
        >
          <EditorButton
            variant="text"
            color="inherit"
            onClick={onInvertSelection}
            sx={{
              ...sketchButtonSmallSx,
              minWidth: "60px",
              height: 24,
              lineHeight: 1
            }}
          >
            {t("i18n-cont-sketch-tools-08.selection.invert")}
          </EditorButton>
          <Tooltip title={t("i18n-cont-sketch-tools-08.selection.refineSelectionTooltip")}>
            <span>
              <EditorButton
                ref={refineAnchorRef}
                variant="text"
                color="inherit"
                disabled={!hasActiveSelection}
                onClick={() => setRefineOpen(true)}
                startIcon={<TuneIcon />}
                sx={{
                  ...sketchButtonSmallSx,
                  minWidth: "76px",
                  height: 24,
                  lineHeight: 1,
                  "& .MuiButton-startIcon": { mr: 0.5 }
                }}
              >
                {t("i18n-cont-sketch-tools-08.selection.refine")}
              </EditorButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              showAsMask
                ? t("i18n-cont-sketch-tools-08.selection.redOverlayTooltip")
                : t("i18n-cont-sketch-tools-08.selection.marchingAntsTooltip")
            }
          >
            <span>
              <ToolbarIconButton
                onClick={() =>
                  setSelectionPreviewMode(showAsMask ? "ants" : "mask")
                }
                aria-label={
                  showAsMask
                    ? t("i18n-cont-sketch-tools-08.selection.switchToMarchingAnts")
                    : t("i18n-cont-sketch-tools-08.selection.switchToMaskOverlay")
                }
                sx={{
                  ...iconButtonCompactSx,
                  borderRadius: BORDER_RADIUS.xs,
                  height: 24,
                  width: 24,
                  color: showAsMask
                    ? "error.light"
                    : SKETCH_COLORS.textSecondary
                }}
              >
                {showAsMask ? (
                  <OpacityIcon sx={{ fontSize: ICON_SIZE.sm }} />
                ) : (
                  <BorderStyleIcon sx={{ fontSize: ICON_SIZE.sm }} />
                )}
              </ToolbarIconButton>
            </span>
          </Tooltip>
        </FlexRow>
        {onCropCanvasToSelection ? (
          <FlexRow
            align="center"
            gap={1}
            sx={{
              flexShrink: 0,
              ml: "auto"
            }}
          >
            <Divider
              orientation="vertical"
              flexItem
              sx={{ alignSelf: "stretch", borderColor: "grey.700" }}
            />
            <Tooltip title={t("i18n-cont-sketch-tools-08.selection.cropCanvasToSelection")}>
              <span>
                <ToolbarIconButton
                  disabled={!hasActiveSelection}
                  onClick={onCropCanvasToSelection}
                  aria-label={t("i18n-cont-sketch-tools-08.selection.cropCanvasToSelection")}
                  sx={{
                    ...iconButtonCompactSx,
                    borderRadius: BORDER_RADIUS.xs,
                    color: SKETCH_COLORS.textSecondary
                  }}
                >
                  <CropIcon sx={{ fontSize: ICON_SIZE.md }} />
                </ToolbarIconButton>
              </span>
            </Tooltip>
          </FlexRow>
        ) : null}
      </FlexRow>

      <RefineSelectionPopover
        open={refineOpen}
        anchorEl={refineAnchorRef.current}
        onClose={() => setRefineOpen(false)}
        settings={settings}
        onChange={onChange}
        onFeatherSelection={onFeatherSelection}
        onSmoothSelectionBorders={onSmoothSelectionBorders}
        onConvertSelectionToBorder={onConvertSelectionToBorder}
      />
    </>
  );
});
