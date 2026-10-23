import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import ViewQuiltOutlinedIcon from "@mui/icons-material/ViewQuiltOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import type { TFunction } from "i18next";

import type { DockPanelRegistration } from "../../dock/panelRegistry";
import type { AppBuilderPanelId } from "../../../stores/appbuilder/AppBuilderDockLayout";

type AppBuilderPanelRegistration = DockPanelRegistration & { readonly id: AppBuilderPanelId };

const icon = { fontSize: "small" } as const;

/** The panels the app builder dock can hold. */
export function appBuilderPanelRegistrations(t: TFunction): readonly AppBuilderPanelRegistration[] {
  return [
    { id: "canvas", title: t("i18n-next8.appBuilder.dock.canvas"), icon: <ViewQuiltOutlinedIcon {...icon} />, defaultRegion: "viewport" },
    { id: "components", title: t("i18n-next8.appBuilder.dock.components"), icon: <DashboardCustomizeOutlinedIcon {...icon} />, defaultRegion: "left" },
    { id: "outline", title: t("i18n-next8.appBuilder.dock.outline"), icon: <AccountTreeOutlinedIcon {...icon} />, defaultRegion: "left" },
    { id: "fields", title: t("i18n-next8.appBuilder.dock.properties"), icon: <EditOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "data", title: t("i18n-next8.appBuilder.shell.appDataLabel"), icon: <TuneIcon {...icon} />, defaultRegion: "right" }
  ];
}
