import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CheckIcon from "@mui/icons-material/Check";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import { GAME_LAYOUT_PRESETS } from "../../../stores/game/GamePanelLayout";
import type { GamePanelLayoutState } from "../../../stores/game/GamePanelLayoutStore";
import type { GamePanelRegistration } from "./panelRegistry";
import { Caption, ContextMenu, Dialog, EditorButton, FlexColumn, FlexRow, ListSubheader, MenuItemPrimitive, SPACING, TextInput } from "../../ui_primitives";
import ReportBugButton from "../../support/ReportBugButton";

interface GameLayoutMenuProps {
  readonly store: StoreApi<GamePanelLayoutState>;
  readonly panels: readonly Pick<GamePanelRegistration, "id" | "title">[];
}

type NameDialog = { readonly mode: "save" | "rename"; readonly from?: string } | null;

/** The editor's Layout menu: built-in and saved layouts, saving the current one, and which panels are open. */
export function GameLayoutMenu({ store, panels }: GameLayoutMenuProps): ReactNode {
  const customLayouts = useStore(store, (state) => state.customLayouts);
  const hidden = useStore(store, (state) => state.layout.hidden);
  const button = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("Default");
  const [dialog, setDialog] = useState<NameDialog>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setCurrent("Default"); setDialog(null); setError(null); }, [store]);
  const custom = customLayouts.some((entry) => entry.name === current);
  const act = (action: () => void): boolean => {
    try { action(); setError(null); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change saved layout"); return false; }
  };
  const close = (): void => setOpen(false);
  const openDialog = (next: NonNullable<NameDialog>): void => {
    close();
    setError(null);
    setName(next.mode === "rename" ? next.from ?? "" : "");
    setDialog(next);
  };
  const confirmName = (): void => {
    const trimmed = name.trim();
    const done = dialog?.mode === "rename" && dialog.from
      ? act(() => store.getState().renameLayout(dialog.from ?? "", name))
      : act(() => store.getState().saveLayout(name));
    if (done) { setCurrent(trimmed); setDialog(null); }
  };

  return <>
    <EditorButton ref={button} size="small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(true)}
      startIcon={<DashboardOutlinedIcon fontSize="small" />} endIcon={<ArrowDropDownIcon fontSize="small" />}
      sx={{ color: "text.secondary", "&:hover": { color: "text.primary" } }}>
      {current}
    </EditorButton>
    <ContextMenu open={open} anchorEl={button.current} onClose={close} aria-label="Layout">
      <ListSubheader>Layouts</ListSubheader>
      {[...GAME_LAYOUT_PRESETS, ...customLayouts.map((entry) => entry.name)].map((layoutName) => <MenuItemPrimitive key={layoutName}
        label={layoutName} selected={layoutName === current} icon={layoutName === current ? <CheckIcon /> : <span />}
        onClick={() => { close(); if (act(() => store.getState().selectLayout(layoutName))) { setCurrent(layoutName); } }} />)}
      <MenuItemPrimitive dividerBefore label="Save layout as…" icon={<SaveOutlinedIcon />} onClick={() => openDialog({ mode: "save" })} />
      <MenuItemPrimitive label="Rename layout…" icon={<DriveFileRenameOutlineIcon />} disabled={!custom}
        tooltip={custom ? undefined : "Built-in layouts cannot be renamed"} onClick={() => openDialog({ mode: "rename", from: current })} />
      <MenuItemPrimitive label="Delete layout" icon={<DeleteOutlineIcon />} color="error" disabled={!custom}
        tooltip={custom ? undefined : "Built-in layouts cannot be deleted"}
        onClick={() => { close(); if (act(() => store.getState().deleteLayout(current))) { setCurrent("Default"); } }} />
      {panels.length > 0 && <ListSubheader>Panels</ListSubheader>}
      {panels.map((panel) => {
        const shown = !hidden.includes(panel.id);
        return <MenuItemPrimitive key={panel.id} label={panel.title} selected={shown}
          icon={shown ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
          disabled={panel.id === "viewport"} secondary={shown ? undefined : "Hidden"}
          onClick={() => act(() => store.getState().dispatch({ type: shown ? "hide" : "reveal", panelId: panel.id }))} />;
      })}
    </ContextMenu>
    <Dialog open={dialog !== null} onClose={() => setDialog(null)} maxWidth="xs" fullWidth
      title={dialog?.mode === "rename" ? "Rename layout" : "Save layout"}
      onConfirm={confirmName} confirmText={dialog?.mode === "rename" ? "Rename" : "Save"} confirmDisabled={!name.trim()}>
      <FlexColumn gap={SPACING.md}>
        <TextInput label="Layout name" autoFocus value={name} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) { event.preventDefault(); confirmName(); } }} />
        {error && <FlexRow gap={SPACING.xs} align="center"><Caption role="alert" color="error">{error}</Caption>
          <ReportBugButton context={{ source: "panel-crash", summary: "Game layout could not be changed", errorText: error }} />
        </FlexRow>}
      </FlexColumn>
    </Dialog>
    {error && dialog === null && <Caption role="alert" color="error" sx={{ whiteSpace: "nowrap" }}>{error}</Caption>}
  </>;
}
