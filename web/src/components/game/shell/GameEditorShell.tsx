import { Fragment, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";

import { Box, EditorUiProvider, FlexColumn, FlexRow, ResizableDock, SPACING } from "../../ui_primitives";
import GameToolbar from "./GameToolbar";
import GameStatusBar from "./GameStatusBar";
import { isEditableElement } from "../../../utils/browser";
import { gamePanelRegistry, type GameDimension, type GamePanelRegion, type GamePanelRegistry } from "./panelRegistry";
import { GAME_EDITOR_ROOT_SX } from "./gameEditorStyles";

export interface GamePanelView {
  readonly id: string;
  readonly node: ReactNode;
  readonly visible?: boolean;
  readonly dock?: Omit<ComponentProps<typeof ResizableDock>, "children">;
  readonly keyboardScope?: boolean;
}
interface GameEditorShellProps {
  readonly dimension: GameDimension;
  readonly toolbar: ComponentProps<typeof GameToolbar>;
  readonly status: ComponentProps<typeof GameStatusBar>;
  readonly panels: readonly GamePanelView[];
  readonly registry?: GamePanelRegistry;
  readonly notices?: ReactNode;
  readonly mobile?: ReactNode;
  readonly dialogs?: ReactNode;
  readonly bottomSx?: ComponentProps<typeof FlexColumn>["sx"];
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

export default function GameEditorShell({ dimension, toolbar, status, panels, registry = gamePanelRegistry,
  notices, mobile, dialogs, bottomSx, onKeyDown }: GameEditorShellProps): ReactNode {
  const views = new Map<string, GamePanelView>();
  for (const view of panels) {
    if (view.visible !== false) {
      views.set(view.id, view);
    }
  }
  const entries = registry.panels(dimension).flatMap((entry) => {
    const view = views.get(entry.id);
    return view ? [{ ...view, region: entry.defaultRegion }] : [];
  });
  const renderRegion = (region: GamePanelRegion): ReactNode => {
    const groups = new Map<string, { dock?: GamePanelView["dock"]; panels: GamePanelView[] }>();
    for (const view of entries.filter((entry) => entry.region === region)) {
      const key = view.dock ? `${view.dock.storagePrefix ?? ""}:${view.dock.storageKey}` : view.id;
      const group = groups.get(key);
      if (group) { group.panels.push(view); }
      else { groups.set(key, { dock: view.dock, panels: [view] }); }
    }
    return [...groups].map(([key, group]) => {
      const nodes = group.panels.map((view) => <Box key={view.id}
        data-game-undo-scope={view.keyboardScope || undefined} sx={{ display: "contents" }}>{view.node}</Box>);
      return group.dock ? <ResizableDock key={key} {...group.dock}>
        <FlexColumn
          gap={region === "left" && dimension === "2d" ? SPACING.sm : undefined}
          sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>{nodes}</FlexColumn>
      </ResizableDock> : <Fragment key={key}>{nodes}</Fragment>;
    });
  };
  const bottom = entries.some((entry) => entry.region === "bottom");
  return <EditorUiProvider scope="inspector"><FlexColumn sx={GAME_EDITOR_ROOT_SX}
    onKeyDown={(event) => {
      const target = event.target;
      if (event.defaultPrevented || toolbar.playSession || !(target instanceof HTMLElement)
        || Boolean(isEditableElement(target)) || !target.closest("[data-game-undo-scope]")) { return; }
      onKeyDown?.(event);
    }}>
    <GameToolbar {...toolbar} />
    {notices}
    <FlexRow sx={{ flex: 1, minHeight: 0 }}>
      <FlexRow component="section" role="region" aria-label="Game left panels" sx={{ minHeight: 0, flexShrink: 0 }}>{renderRegion("left")}</FlexRow>
      <FlexColumn gap={dimension === "2d" ? SPACING.sm : undefined} sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <FlexColumn component="section" role="region" aria-label="Game viewport panels"
          sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>{renderRegion("viewport")}</FlexColumn>
        {bottom && <FlexColumn component="section" role="region" aria-label="Game bottom panels" sx={bottomSx}>{renderRegion("bottom")}</FlexColumn>}
      </FlexColumn>
      <FlexRow component="section" role="region" aria-label="Game right panels" sx={{ minHeight: 0, flexShrink: 0 }}>{renderRegion("right")}</FlexRow>
    </FlexRow>
    <GameStatusBar {...status} />
    {mobile}
    {dialogs}
  </FlexColumn></EditorUiProvider>;
}
