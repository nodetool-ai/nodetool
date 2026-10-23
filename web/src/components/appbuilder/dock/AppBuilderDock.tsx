import React, { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { useTranslation } from "react-i18next";
import { Puck, createUsePuck } from "@puckeditor/core";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import TuneIcon from "@mui/icons-material/Tune";

import { useAppBuilderDockLayoutStore } from "../../../stores/appbuilder/useAppBuilderDockLayoutStore";
import { DockCanvas } from "../../dock/DockCanvas";
import { DockLayoutMenu } from "../../dock/DockLayoutMenu";
import DockPanelHeader from "../../dock/DockPanelHeader";
import { useDockPresentation, type DockPanelView } from "../../dock/useDockPresentation";
import {
  EditorButton,
  FlexColumn,
  ScrollArea,
  SPACING,
  Toolbar,
  ToolbarGroup,
  ToolbarIconButton
} from "../../ui_primitives";
import { appBuilderPanelRegistrations } from "./appBuilderPanels";

const usePuck = createUsePuck();

/** The canvas mounts with the editor so Puck's preview is ready before its tab is first shown. */
const EAGER_PANELS = ["canvas"] as const;

interface AppBuilderDockProps {
  /** Toolbar controls placed before the App Data toggle. */
  actions?: ReactNode;
  /** Toolbar controls placed after the App Data toggle, such as Back and Save. */
  trailingActions?: ReactNode;
  /** The App Data panel body. Without it the panel and its toggle are left out. */
  dataPanel?: ReactNode;
  /** The app builder agent. Without it the Agent panel is left out of the dock while its place in the layout stays. */
  assistantPanel?: ReactNode;
}

/** Undo and redo over Puck's history, which its default header used to draw. */
const HistoryControls: React.FC = () => {
  const { t } = useTranslation();
  const back = usePuck((s) => s.history.back);
  const forward = usePuck((s) => s.history.forward);
  const hasPast = usePuck((s) => s.history.hasPast);
  const hasFuture = usePuck((s) => s.history.hasFuture);
  return (
    <ToolbarGroup>
      <ToolbarIconButton
        icon={<UndoIcon fontSize="small" />}
        tooltip={t("i18n-next8.appBuilder.dock.undo")}
        aria-label={t("i18n-next8.appBuilder.dock.undo")}
        disabled={!hasPast}
        onClick={back}
      />
      <ToolbarIconButton
        icon={<RedoIcon fontSize="small" />}
        tooltip={t("i18n-next8.appBuilder.dock.redo")}
        aria-label={t("i18n-next8.appBuilder.dock.redo")}
        disabled={!hasFuture}
        onClick={forward}
      />
    </ToolbarGroup>
  );
};

/** Puck's field inspector, under a strip naming the selected component (or the page). */
const PropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const selected = usePuck((s) => {
    if (!s.selectedItem) return s.config.root?.label ?? t("i18n-next8.appBuilder.dock.page");
    const type = String(s.selectedItem.type);
    return s.config.components[type]?.label ?? type;
  });
  return (
    <>
      <DockPanelHeader title={t("i18n-next8.appBuilder.dock.properties")} label={selected} />
      <ScrollArea fullHeight sx={{ flex: 1, minHeight: 0 }}>
        <Puck.Fields />
      </ScrollArea>
    </>
  );
};

/**
 * The builder's panels in the shared dock (the one the game and timeline
 * editors use): the canvas in the viewport, Components and Outline on the
 * left, Properties, App Data and the agent on the right. Panels move, group, resize and
 * hide, and the layout is saved per user. Rendered as Puck's children, so
 * Puck draws none of its own chrome and every panel reads Puck's store.
 */
const AppBuilderDock: React.FC<AppBuilderDockProps> = ({
  actions,
  trailingActions,
  dataPanel,
  assistantPanel
}) => {
  const { t } = useTranslation();
  const store = useAppBuilderDockLayoutStore();
  const layout = useStore(store, (state) => state.layout);
  const dataOpen = !layout.hidden.includes("data");
  const registrations = useMemo(() => appBuilderPanelRegistrations(t), [t]);
  useEffect(() => {
    store.getState().registerPanels(registrations);
  }, [store, registrations, layout]);
  const root = useRef<HTMLDivElement>(null);
  const hasData = dataPanel !== undefined;

  const views: DockPanelView[] = [
    {
      id: "canvas",
      node: (
        <ScrollArea fullHeight sx={{ flex: 1, minHeight: 0, bgcolor: "background.default" }}>
          <Puck.Preview />
        </ScrollArea>
      )
    },
    {
      id: "components",
      node: (
        <ScrollArea fullHeight sx={{ flex: 1, minHeight: 0 }}>
          <Puck.Components />
        </ScrollArea>
      )
    },
    {
      id: "outline",
      node: (
        <ScrollArea fullHeight sx={{ flex: 1, minHeight: 0 }}>
          <Puck.Outline />
        </ScrollArea>
      )
    },
    { id: "fields", node: <PropertiesPanel /> },
    { id: "data", node: dataPanel, visible: hasData },
    { id: "assistant", node: assistantPanel, visible: assistantPanel !== undefined }
  ].filter((view) => view.visible !== false);
  const presentation = useDockPresentation({
    store,
    layout,
    registry: registrations,
    availableIds: views.map((view) => view.id),
    views,
    root
  });

  return (
    <FlexColumn ref={root} gap={0} sx={{ width: "100%", height: "100%", minHeight: 0 }}>
      <Toolbar>
        <HistoryControls />
        <ToolbarGroup sx={{ marginLeft: "auto", gap: SPACING.sm }}>
          {actions}
          <DockLayoutMenu
            store={store}
            panels={registrations.filter((entry) => views.some((view) => view.id === entry.id))}
          />
          {hasData && (
            <EditorButton
              size="small"
              variant={dataOpen ? "contained" : "text"}
              startIcon={<TuneIcon />}
              onClick={() => store.getState().togglePanels(["data"])}
              aria-pressed={dataOpen}
            >
              {t("i18n-next115.appBuilder.appData")}
            </EditorButton>
          )}
          {trailingActions}
        </ToolbarGroup>
      </Toolbar>
      <DockCanvas presentation={presentation} store={store} eagerPanels={EAGER_PANELS} />
    </FlexColumn>
  );
};

export default AppBuilderDock;
