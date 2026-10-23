import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import type { TFunction } from "i18next";

import type { DockPanelRegistration } from "../../dock/panelRegistry";
import type { SketchPanelId } from "../../../stores/sketch/SketchDockLayout";

export type SketchPanelRegistration = DockPanelRegistration & { readonly id: SketchPanelId };

const icon = { fontSize: "small" } as const;

/** The panels the sketch dock can hold, in the order the Layout menu lists them. */
export function sketchPanelRegistrations(t: TFunction): readonly SketchPanelRegistration[] {
  return [
    { id: "canvas", title: t("i18n-next4.sketch.dock.canvas"), icon: <BrushOutlinedIcon {...icon} />, defaultRegion: "viewport" },
    { id: "color", title: t("i18n-next4.sketch.color.title"), icon: <PaletteOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "layers", title: t("i18n-next4.sketch.layers"), icon: <LayersOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "history", title: t("i18n-next4.sketch.history"), icon: <HistoryOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "properties", title: t("i18n-next4.sketch.dock.properties"), icon: <TuneOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "canvasSize", title: t("i18n-next4.sketch.dock.canvasSize"), icon: <AspectRatioOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "assistant", title: t("i18n-next4.sketch.assistant"), icon: <SmartToyOutlinedIcon {...icon} />, defaultRegion: "left" }
  ];
}
