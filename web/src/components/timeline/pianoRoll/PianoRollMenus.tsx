/**
 * The Edit, Functions and View menus of the piano roll toolbar. Each row shows
 * its shortcut where one exists. Rows that need a selection are disabled
 * without one, except the quantizes, which fall back to every note.
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import {
  ContextMenu,
  EditorButton,
  MenuItemPrimitive
} from "../../ui_primitives";
import type { PianoRollSettings } from "../../../stores/timeline/TimelineUIStore";
import type { PianoRollFunctions } from "./usePianoRollFunctions";

export interface PianoRollMenusProps {
  mac: boolean;
  hasSelection: boolean;
  hasNotes: boolean;
  scaleReady: boolean;
  settings: PianoRollSettings;
  setSettings: (patch: Partial<PianoRollSettings>) => void;
  fns: PianoRollFunctions;
  onUndo: () => void;
  onRedo: () => void;
  onZoomToFit: () => void;
  onShortcuts: () => void;
}

export interface MenuRow {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  radio?: boolean;
  dividerBefore?: boolean;
  /** A row with a submenu opens it on click and runs nothing itself. */
  submenu?: MenuRow[];
  testId?: string;
  run: () => void;
}

export interface MenuButtonProps {
  label: string;
  rows: MenuRow[];
}

export const MenuButton: React.FC<MenuButtonProps> = ({ label, rows }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [sub, setSub] = useState<{ anchor: HTMLElement; rows: MenuRow[] } | null>(null);
  const close = useCallback(() => {
    setAnchorEl(null);
    setSub(null);
  }, []);
  return (
    <>
      <EditorButton
        variant="text"
        endIcon={<ExpandMoreIcon fontSize="small" />}
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        {label}
      </EditorButton>
      <ContextMenu open={anchorEl !== null} anchorEl={anchorEl} onClose={close}>
        {rows.map((row) => (
          <MenuItemPrimitive
            key={row.id}
            label={row.label}
            shortcut={row.shortcut}
            disabled={row.disabled}
            dividerBefore={row.dividerBefore}
            checkable={row.checked === undefined ? undefined : row.radio ? "radio" : "checkbox"}
            checked={row.checked}
            hasSubmenu={row.submenu !== undefined}
            data-testid={row.testId}
            onClick={(event) => {
              if (row.submenu) {
                setSub({ anchor: event.currentTarget, rows: row.submenu });
                return;
              }
              close();
              row.run();
            }}
          />
        ))}
      </ContextMenu>
      <ContextMenu
        open={sub !== null}
        anchorEl={sub?.anchor ?? null}
        onClose={close}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {(sub?.rows ?? []).map((row) => (
          <MenuItemPrimitive
            key={row.id}
            label={row.label}
            shortcut={row.shortcut}
            disabled={row.disabled}
            dividerBefore={row.dividerBefore}
            checkable={row.checked === undefined ? undefined : row.radio ? "radio" : "checkbox"}
            checked={row.checked}
            data-testid={row.testId}
            onClick={() => {
              close();
              row.run();
            }}
          />
        ))}
      </ContextMenu>
    </>
  );
};

export const PianoRollMenus: React.FC<PianoRollMenusProps> = memo(
  ({ mac, hasSelection, hasNotes, scaleReady, settings, setSettings, fns, onUndo, onRedo, onZoomToFit, onShortcuts }) => {
    const { t } = useTranslation();
    const L = (key: string) => t(`pass3_20.pianoRoll.logic.${key}`);
    const mod = mac ? "⌘" : "Ctrl+";
    const sel = !hasSelection;

    const edit: MenuRow[] = [
      { id: "undo", label: L("menu.undo"), shortcut: `${mod}Z`, run: onUndo },
      { id: "redo", label: L("menu.redo"), shortcut: mac ? "⇧⌘Z" : "Ctrl+Y", run: onRedo },
      { id: "cut", label: L("menu.cut"), shortcut: `${mod}X`, disabled: sel, dividerBefore: true, run: () => void fns.cut() },
      { id: "copy", label: L("menu.copy"), shortcut: `${mod}C`, disabled: sel, run: () => void fns.copy() },
      { id: "paste", label: L("menu.paste"), shortcut: `${mod}V`, run: () => void fns.paste() },
      { id: "delete", label: L("menu.delete"), shortcut: mac ? "⌫" : "Del", disabled: sel, run: fns.deleteSelected },
      { id: "selectAll", label: L("menu.selectAll"), shortcut: `${mod}A`, disabled: !hasNotes, dividerBefore: true, run: fns.selectAll },
      { id: "deselectAll", label: L("menu.deselectAll"), shortcut: "Esc", disabled: sel, run: fns.deselectAll },
      { id: "selectFollowing", label: L("menu.selectFollowing"), disabled: !hasNotes, run: fns.selectFollowing },
      { id: "selectSamePitch", label: L("menu.selectSamePitch"), disabled: sel, run: fns.selectSamePitch },
      { id: "selectMuted", label: L("menu.selectMuted"), disabled: !hasNotes, run: fns.selectMuted },
      { id: "invert", label: L("menu.invertSelection"), disabled: !hasNotes, run: fns.invertSelection }
    ];

    const functions: MenuRow[] = [
      { id: "quantize", label: L("menu.quantize"), shortcut: "Q", disabled: !hasNotes, run: () => fns.quantize() },
      { id: "quantizeLengths", label: L("menu.quantizeLengths"), disabled: !hasNotes, run: () => fns.quantize({ lengths: true }) },
      { id: "scaleQuantize", label: L("menu.scaleQuantize"), disabled: !hasNotes || !scaleReady, run: fns.scaleQuantize },
      { id: "semiUp", label: L("menu.transposeUp"), shortcut: "↑", disabled: sel, dividerBefore: true, run: () => fns.transpose(1) },
      { id: "semiDown", label: L("menu.transposeDown"), shortcut: "↓", disabled: sel, run: () => fns.transpose(-1) },
      { id: "octUp", label: L("menu.octaveUp"), shortcut: mac ? "⇧↑" : "Shift+↑", disabled: sel, run: () => fns.transpose(12) },
      { id: "octDown", label: L("menu.octaveDown"), shortcut: mac ? "⇧↓" : "Shift+↓", disabled: sel, run: () => fns.transpose(-12) },
      { id: "legato", label: L("menu.forceLegato"), disabled: sel, dividerBefore: true, run: fns.forceLegato },
      { id: "overlaps", label: L("menu.removeOverlaps"), disabled: sel, run: fns.removeOverlaps },
      { id: "duplicates", label: L("menu.deleteDuplicates"), disabled: sel, run: fns.deleteDuplicates },
      { id: "mute", label: L("menu.muteToggle"), shortcut: "M", disabled: sel, dividerBefore: true, run: fns.toggleMute }
    ];

    const view: MenuRow[] = [
      { id: "inspector", label: L("menu.localInspector"), checked: settings.inspector !== false, run: () => setSettings({ inspector: settings.inspector === false }) },
      { id: "midiDraw", label: L("menu.midiDraw"), checked: settings.midiDraw, run: () => setSettings({ midiDraw: !settings.midiDraw }) },
      { id: "collapse", label: L("menu.collapseMode"), checked: settings.collapse, run: () => setSettings({ collapse: !settings.collapse }) },
      { id: "catch", label: L("menu.catchPlayhead"), checked: settings.catchPlayhead, run: () => setSettings({ catchPlayhead: !settings.catchPlayhead }) },
      { id: "link", label: L("menu.link"), checked: settings.link, run: () => setSettings({ link: !settings.link }) },
      { id: "colorVelocity", label: `${L("menu.noteColor")}: ${L("menu.noteColorVelocity")}`, checked: settings.noteColor === "velocity", radio: true, dividerBefore: true, run: () => setSettings({ noteColor: "velocity" }) },
      { id: "colorClip", label: `${L("menu.noteColor")}: ${L("menu.noteColorClip")}`, checked: settings.noteColor === "clip", radio: true, run: () => setSettings({ noteColor: "clip" }) },
      { id: "noteNames", label: L("menu.noteNames"), checked: settings.noteNames, dividerBefore: true, run: () => setSettings({ noteNames: !settings.noteNames }) },
      { id: "zoomFit", label: L("menu.zoomToFit"), disabled: !hasNotes, dividerBefore: true, run: onZoomToFit },
      { id: "shortcuts", label: L("menu.keyboardShortcuts"), run: onShortcuts }
    ];

    return (
      <>
        <MenuButton label={L("menu.edit")} rows={edit} />
        <MenuButton label={L("menu.functions")} rows={functions} />
        <MenuButton label={L("menu.view")} rows={view} />
      </>
    );
  }
);

PianoRollMenus.displayName = "PianoRollMenus";
