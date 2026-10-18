import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CheckIcon from "@mui/icons-material/Check";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import type { DockLayoutState } from "../../stores/dock/DockLayoutStore";
import { capitalizeLabel, type DockPanelRegistration } from "../../stores/dock/DockLayout";
import { Caption, ContextMenu, Dialog, EditorButton, FlexColumn, FlexRow, ListSubheader, MenuItemPrimitive, SPACING, TextInput } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

interface DockLayoutMenuProps {
  readonly store: StoreApi<DockLayoutState>;
  readonly panels: readonly Pick<DockPanelRegistration, "id" | "title">[];
}

type NameDialog = { readonly mode: "save" | "rename"; readonly from?: string } | null;

/** The editor's Layout menu: built-in and saved layouts, saving the current one, and which panels are open. */
export function DockLayoutMenu({ store, panels }: DockLayoutMenuProps): ReactNode {
  const model = store.getState().model;
  const customLayouts = useStore(store, (state) => state.customLayouts);
  const hidden = useStore(store, (state) => state.layout.hidden);
  const button = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const current = useStore(store, (state) => state.activeLayoutName);
  const [dialog, setDialog] = useState<NameDialog>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDialog(null); setError(null); }, [store]);
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
    const done = dialog?.mode === "rename" && dialog.from
      ? act(() => store.getState().renameLayout(dialog.from ?? "", name))
      : act(() => store.getState().saveLayout(name));
    if (done) { setDialog(null); }
  };

  return <>
    <EditorButton ref={button} size="small" data-dock-layout-menu aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(true)}
      startIcon={<DashboardOutlinedIcon fontSize="small" />} endIcon={<ArrowDropDownIcon fontSize="small" />}
      sx={{ color: "text.secondary", "&:hover": { color: "text.primary" } }}>
      {current ?? "Layout"}
    </EditorButton>
    <ContextMenu open={open} anchorEl={button.current} onClose={close} aria-label="Layout">
      <ListSubheader>Layouts</ListSubheader>
      {[...model.presets, ...customLayouts.map((entry) => entry.name)].map((layoutName) => <MenuItemPrimitive key={layoutName}
        label={layoutName} selected={layoutName === current} icon={layoutName === current ? <CheckIcon /> : <span />}
        onClick={() => { close(); act(() => store.getState().selectLayout(layoutName)); }} />)}
      <MenuItemPrimitive dividerBefore label="Reset to saved layout" icon={<RestartAltIcon />} disabled={current === null}
        tooltip={current === null ? "Choose a layout first" : undefined}
        onClick={() => { close(); act(() => store.getState().resetLayout()); }} />
      <MenuItemPrimitive dividerBefore label="Save layout as…" icon={<SaveOutlinedIcon />} onClick={() => openDialog({ mode: "save" })} />
      <MenuItemPrimitive label="Rename layout…" icon={<DriveFileRenameOutlineIcon />} disabled={!custom}
        tooltip={custom ? undefined : "Built-in layouts cannot be renamed"} onClick={() => openDialog({ mode: "rename", from: current ?? "" })} />
      <MenuItemPrimitive label="Delete layout" icon={<DeleteOutlineIcon />} color="error" disabled={!custom}
        tooltip={custom ? undefined : "Built-in layouts cannot be deleted"}
        onClick={() => { close(); act(() => store.getState().deleteLayout(current ?? "")); }} />
      {panels.length > 0 && <ListSubheader>Panels</ListSubheader>}
      {panels.map((panel) => {
        const shown = !hidden.includes(panel.id);
        return <MenuItemPrimitive key={panel.id} label={panel.title}
          icon={shown ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
          disabled={model.requiredPanels.includes(panel.id)} secondary={shown ? undefined : "Hidden"}
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
          <ReportBugButton context={{ source: "panel-crash", summary: `${capitalizeLabel(model.editorLabel)} layout could not be changed`, errorText: error }} />
        </FlexRow>}
      </FlexColumn>
    </Dialog>
    {error && dialog === null && <Caption role="alert" color="error" sx={{ whiteSpace: "nowrap" }}>{error}</Caption>}
  </>;
}
