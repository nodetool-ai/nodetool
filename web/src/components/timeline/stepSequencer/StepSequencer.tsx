/** @jsxImportSource @emotion/react */
/**
 * The Step Sequencer (SQ27 to SQ46): the editor for a pattern region. Two menu
 * bars (figure p0724), the Pattern Browser, the inspector (p0757) and the row
 * grid (p0736). Every document edit goes through the timeline ops via
 * `useStepPatternOps`, one undo entry per gesture or command. View state
 * (mode, selection, zoom, panels, subrow visibility) is local and never an
 * undo entry.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import DisabledByDefaultOutlinedIcon from "@mui/icons-material/DisabledByDefaultOutlined";
import FiberManualRecordOutlinedIcon from "@mui/icons-material/FiberManualRecordOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import LibraryMusicOutlinedIcon from "@mui/icons-material/LibraryMusicOutlined";
import PianoOutlinedIcon from "@mui/icons-material/PianoOutlined";
import RotateLeftOutlinedIcon from "@mui/icons-material/RotateLeftOutlined";
import RotateRightOutlinedIcon from "@mui/icons-material/RotateRightOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import ViewAgendaOutlinedIcon from "@mui/icons-material/ViewAgendaOutlined";
import UnfoldMoreOutlinedIcon from "@mui/icons-material/UnfoldMoreOutlined";
import InputOutlinedIcon from "@mui/icons-material/InputOutlined";
import CallSplitOutlinedIcon from "@mui/icons-material/CallSplitOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";

import {
  STEP_PATTERN_PAGE_SIZE,
  STEP_PLAYBACK_MODES,
  STEP_RATES,
  normalizeStep,
  resolveTempo,
  stepPitch
} from "@nodetool-ai/timeline";
import type { Step, StepAutomationTarget, StepEditMode, StepPattern, StepRow } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import {
  Caption,
  ContextMenu,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  ICON_SIZE,
  InlineEditableText,
  MenuItemPrimitive,
  ScrollArea,
  Slider,
  SPACING,
  TextInput,
  Toolbar,
  ToolbarIconButton
} from "../../ui_primitives";
import ErrorBanner from "../../support/ErrorBanner";
import { StepLearnKeyboard } from "./StepLearnKeyboard";
import { MenuButton, type MenuRow } from "../pianoRoll/PianoRollMenus";
import { isMacPlatform } from "../pianoRoll/pianoRollTools";
import { playAuditionNote } from "../preview/audition";
import { trackRegionColor } from "../Tracks/regionColors";
import {
  StepSequencerGrid,
  ROW_HEADER_WIDTH_PX,
  RULER_HEIGHT_PX,
  createPlayingSource,
  stepX,
  stripWidth,
  type ValueDisplay
} from "./StepSequencerGrid";
import { StepSequencerInspector } from "./StepSequencerInspector";
import { StepPatternBrowser } from "./StepPatternBrowser";
import {
  STEP_COMMANDS,
  chordLabel,
  commandForKey,
  menuChord,
  nudgeOps,
  type CommandContext,
  type StepUiAction
} from "./stepSequencerCommands";
import {
  EDIT_MODE_ORDER,
  MODE_SPECS,
  PLAYBACK_GLYPH,
  clearPageOps,
  copyPage,
  learnTarget,
  pastePageOps,
  moveSelection,
  parseStepKey,
  playingSteps,
  rowSelection,
  stepKey,
  type PageAction,
  type PageClipboard,
  type StepKey
} from "./stepSequencerModel";
import { useStepPatternOps } from "./useStepPatternOps";
import { RowAssignmentMenu } from "./RowAssignmentMenu";
import {
  addRowOps,
  assignRowOps,
  assignmentGroups,
  patternRowSort,
  withKeptSort,
  sortOps,
  type AssignmentChoice
} from "./stepRowAssignments";
import { useStepMidiInput } from "./useStepMidiInput";

const MIN_STEP_WIDTH_PX = 20;
const MAX_STEP_WIDTH_PX = 72;
const MIN_ROW_HEIGHT_PX = 28;
const MAX_ROW_HEIGHT_PX = 88;
/** The Length menu sections: multiples of 4, 3, 5 and 7 up to 64 (SQ7, p. 731). */
const LENGTH_BASES = [4, 3, 5, 7] as const;
const lengthsFor = (base: number): number[] => Array.from({ length: Math.floor(64 / base) }, (_, i) => (i + 1) * base);

type LearnMode = "off" | "add" | "assign";

const sameAutomationTarget = (a: StepAutomationTarget, b: StepAutomationTarget): boolean =>
  a.kind === b.kind &&
  (a.kind !== "cc" || a.cc === (b as typeof a).cc) &&
  (a.kind !== "device" || (a.deviceId === (b as typeof a).deviceId && a.param === (b as typeof a).param));

interface ClipboardSteps {
  rows: Array<{
    type: "note" | "automation";
    firstStep: number;
    steps: Array<{ offset: number; value: NonNullable<StepRow["steps"][number]> }>;
  }>;
}

interface Props {
  clipId: string;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
}

const barStyles = css({ flexShrink: 0, flexWrap: "nowrap", overflow: "hidden" });
const iconSx = { fontSize: ICON_SIZE.sm };


export const StepSequencer: React.FC<Props> = memo(({ clipId, toolbarStart, toolbarEnd }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { mode: schemeMode, systemMode } = useColorScheme();
  const scheme = ((schemeMode === "system" ? systemMode : schemeMode) ?? "dark") as "light" | "dark";
  const mac = useMemo(() => isMacPlatform(), []);
  const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
  const tracks = useTimelineStore((s) => s.tracks);
  const tempo = useTimelineStore((s) => s.tempo);
  const playbackApi = useTimelinePlaybackStoreApi();
  const ops = useStepPatternOps();
  const pattern = clip?.pattern;
  const trackIndex = tracks.findIndex((tr) => tr.id === clip?.trackId);
  const track = tracks[trackIndex];
  const instrument = track?.instrument;

  const [editMode, setEditMode] = useState<StepEditMode>("onOff");
  const [lastValueMode, setLastValueMode] = useState<StepEditMode>("velocity");
  const [selection, setSelection] = useState<Set<StepKey>>(new Set());
  const [anchor, setAnchor] = useState<StepKey | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [showBrowser, setShowBrowser] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [valueDisplay, setValueDisplay] = useState<ValueDisplay>("selectedRow");
  const [showRowColors, setShowRowColors] = useState(true);
  const [stepWidth, setStepWidth] = useState(40);
  const [rowHeight, setRowHeight] = useState(60);
  const [autoZoom, setAutoZoom] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<Map<string, boolean>>(new Map());
  const [midiOut, setMidiOut] = useState(true);
  const [preview, setPreview] = useState(false);
  const [stepRecord, setStepRecord] = useState(false);
  const [liveRecord, setLiveRecord] = useState(false);
  const [learn, setLearn] = useState<LearnMode>("off");
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const playing = useMemo(() => createPlayingSource(), []);
  const [renaming, setRenaming] = useState<{ rowId: string; name: string } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const clipboard = useRef<ClipboardSteps | null>(null);
  const nudgeDragged = useRef(false);
  const rowClipboard = useRef<{ clipId: string; rowId: string } | null>(null);
  const [pageClipboard, setPageClipboard] = useState<PageClipboard | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const baseColor = useMemo(
    () => clip?.labelColor ?? trackRegionColor(theme, scheme, Math.max(0, trackIndex)),
    [clip?.labelColor, theme, scheme, trackIndex]
  );

  const groups = useMemo(() => assignmentGroups(track, t), [track, t]);
  // The row color choices: the track palette of the active scheme (SQ36, p. 760).
  const colorChoices = useMemo(() => Array.from({ length: 6 }, (_, i) => trackRegionColor(theme, scheme, i)), [theme, scheme]);

  const rowColor = useCallback(
    (rowIndex: number) => trackRegionColor(theme, scheme, Math.max(0, trackIndex) + rowIndex),
    [theme, scheme, trackIndex]
  );

  const runOps = useCallback(
    (list: TimelineOp[]): Promise<void> => {
      if (list.length === 0) return Promise.resolve();
      return ops.run(withKeptSort(list, clipRef.current?.pattern)).then(
        () => setError(null),
        (err: unknown) => setError(err instanceof Error ? err.message : String(err))
      );
    },
    [ops]
  );
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const getSelection = useCallback(() => selectionRef.current, []);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const onError = useCallback((m: string) => setError(m), []);
  const rowSort = useMemo(() => patternRowSort(clip?.pattern), [clip?.pattern]);
  const rowSortRef = useRef(rowSort);
  rowSortRef.current = rowSort;
  const selectedRowIdsRef = useRef<ReadonlySet<string>>(selectedRowIds);
  selectedRowIdsRef.current = selectedRowIds;
  /** A row edit applies to every selected row when the edited row is one of them (p. 749). */
  const targetRows = useCallback((rowId: string): string[] => {
    const sel = selectedRowIdsRef.current;
    if (!sel.has(rowId)) return [rowId];
    const order = clipRef.current?.pattern?.rows.map((r) => r.id) ?? [];
    return order.filter((id) => sel.has(id));
  }, []);
  const onAssignRow = useCallback(
    (rowId: string, choice: AssignmentChoice) => {
      const p = clipRef.current?.pattern;
      if (p) void runOps(assignRowOps(clipId, p, targetRows(rowId), choice, rowSortRef.current));
    },
    [runOps, clipId, targetRows]
  );
  const onAssignRows = useCallback(
    (rowIds: string[], choice: AssignmentChoice) => {
      const p = clipRef.current?.pattern;
      if (p && rowIds.length > 0) void runOps(assignRowOps(clipId, p, rowIds, choice, rowSortRef.current));
    },
    [runOps, clipId]
  );
  const onRowPlayback = useCallback(
    (rowId: string, playback: StepRow["playback"]) =>
      void runOps(targetRows(rowId).map((row) => ({ op: "set_pattern_row" as const, clipId, row, playback }))),
    [runOps, clipId, targetRows]
  );
  // A dragged row ends the kept sort: `move_pattern_row` clears `rowSort` (SQ36).
  const onMoveRow = useCallback(
    (rowId: string, toIndex: number) => void runOps([{ op: "move_pattern_row", clipId, row: rowId, toIndex }]),
    [runOps, clipId]
  );

  // Prune selection that points at removed rows or steps.
  useEffect(() => {
    if (!pattern) return;
    const ids = new Set(pattern.rows.map((r) => r.id));
    setSelection((sel) => {
      const next = new Set([...sel].filter((k) => ids.has(parseStepKey(k).rowId)));
      return next.size === sel.size ? sel : next;
    });
    setSelectedRowIds((sel) => {
      const next = new Set([...sel].filter((id) => ids.has(id)));
      return next.size === sel.size ? sel : next;
    });
  }, [pattern]);

  // Playing step: a frame in the playhead color per row (MUSIC_EDITOR_UI 4.3).
  // It goes to the strips through `playing`, never through React state (F34).
  useEffect(() => {
    if (!pattern || !clip) return;
    const bpm = resolveTempo({ tempo }).bpm;
    // null forces the first apply to write, so a replaced effect clears a
    // stale frame (F51).
    let lastSig: string | null = null;
    const apply = (ms: number) => {
      const running = playbackApi.getState().isPlaying;
      const next = running ? playingSteps(pattern, clip, bpm, ms) : new Map<string, number>();
      const sig = [...next].map(([k, v]) => `${k}:${v}`).join(",");
      if (sig !== lastSig) {
        lastSig = sig;
        playing.set(next);
      }
    };
    apply(playbackApi.getState().getTimeMs());
    const offTime = playbackApi.getState().subscribeTime(apply);
    // Pause changes isPlaying without a time tick: clear the frame then (F51).
    const offState = playbackApi.subscribe((st, prev) => {
      if (st.isPlaying !== prev.isPlaying) apply(st.getTimeMs());
    });
    return () => {
      offTime();
      offState();
    };
  }, [pattern, clip, tempo, playbackApi, playing]);

  // Preview (SQ37): loop the region from its start. An edit does not restart
  // it, and a pause from the transport turns Preview off.
  useEffect(() => {
    if (!preview || !clipRef.current) return;
    let lastMs = 0;
    const start = () => {
      const c = clipRef.current;
      if (c) playbackApi.getState().playSpan(c.startMs, c.startMs + c.durationMs);
    };
    start();
    const unTime = playbackApi.getState().subscribeTime((ms) => {
      lastMs = ms;
    });
    const unState = playbackApi.subscribe((s, prev) => {
      if (!prev.isPlaying || s.isPlaying) return;
      const c = clipRef.current;
      if (c && lastMs >= c.startMs + c.durationMs - 1) queueMicrotask(start);
      else setPreview(false);
    });
    return () => {
      unTime();
      unState();
      if (playbackApi.getState().isPlaying) playbackApi.getState().pause();
    };
  }, [preview, playbackApi]);

  const expandedRows = useMemo(() => {
    const out = new Set<string>();
    for (const r of pattern?.rows ?? []) {
      const o = expandedOverride.get(r.id);
      if (o ?? r.subrowsExpanded === true) out.add(r.id);
    }
    return out;
  }, [pattern, expandedOverride]);

  // Auto zoom: fit every visible row and subrow to the viewport height, and refit on resize.
  const visibleLines = (pattern?.rows ?? []).reduce(
    (n, r) => n + 1 + (expandedRows.has(r.id) ? r.subrows.length : 0),
    0
  );
  useEffect(() => {
    const el = viewportRef.current;
    if (!autoZoom || !el) return;
    const fit = () => {
      // The step ruler sits above the rows inside the viewport (F30).
      const h = el.clientHeight - RULER_HEIGHT_PX;
      setRowHeight(Math.max(MIN_ROW_HEIGHT_PX, Math.min(MAX_ROW_HEIGHT_PX, Math.floor(h / Math.max(1, visibleLines)))));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoZoom, visibleLines]);

  const onSelectionChange = useCallback((next: Set<StepKey>, a: StepKey | null) => {
    setSelection(next);
    setAnchor(a);
    setSelectedRowIds((sel) => (sel.size === 0 ? sel : new Set()));
  }, []);
  const auditionRef = useRef<(row: StepRow, step: number, values?: Partial<Step>) => void>(() => undefined);
  const onSelectRow = useCallback((rowId: string, additive: boolean) => {
    const row = clipRef.current?.pattern?.rows.find((r) => r.id === rowId);
    if (row) auditionRef.current(row, 0);
    setSelectedRowIds((sel) => {
      const next = additive ? new Set(sel) : new Set<string>();
      if (additive && next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
    if (!additive) {
      setSelection(new Set());
      setAnchor(stepKey(rowId, 0));
    }
  }, []);
  const expandedRef = useRef(expandedRows);
  expandedRef.current = expandedRows;
  const rowIdsRef = useRef<string[]>([]);
  rowIdsRef.current = pattern?.rows.map((r) => r.id) ?? [];
  const onToggleExpanded = useCallback((rowId: string, all: boolean) => {
    const show = !expandedRef.current.has(rowId);
    setExpandedOverride((m) => {
      const next = new Map(m);
      for (const id of all ? rowIdsRef.current : [rowId]) next.set(id, show);
      return next;
    });
  }, []);
  const onRenameRow = useCallback((rowId: string) => {
    const row = clipRef.current?.pattern?.rows.find((r) => r.id === rowId);
    if (row) setRenaming({ rowId, name: row.name ?? "" });
  }, []);
  const commitRename = useCallback(() => {
    if (!renaming) return;
    const name = renaming.name.trim();
    setRenaming(null);
    if (name) void runOps([{ op: "set_pattern_row", clipId, row: renaming.rowId, name }]);
    rootRef.current?.focus({ preventScroll: true });
  }, [renaming, runOps, clipId]);
  const [visiblePage, setVisiblePage] = useState(0);
  const [libraryRevision, setLibraryRevision] = useState(0);

  // MIDI Out auditions the step as it plays: its note, octave and velocity (SQ37).
  const audition = useCallback(
    (row: StepRow, step: number, values?: Partial<Step>) => {
      const p = clipRef.current?.pattern;
      if (!midiOut || !instrument || row.assignment.type === "automation" || !p) return;
      // A value drag auditions the dragged value (F31).
      const n = normalizeStep({ ...row.steps[step], ...values });
      const pitch = stepPitch(row, n, { pattern: p, instrument, key: tempo?.key });
      if (pitch !== null) void playAuditionNote(instrument, pitch, n.velocity);
    },
    [midiOut, instrument, tempo]
  );

  auditionRef.current = audition;

  const focusRowIds = useMemo(() => {
    if (selectedRowIds.size > 0) return [...selectedRowIds];
    const rows = new Set<string>();
    for (const k of selection) rows.add(parseStepKey(k).rowId);
    return [...rows];
  }, [selectedRowIds, selection]);

  const clipTrackId = clip?.trackId;
  const ctx = useMemo<CommandContext | null>(
    () =>
      pattern && clipTrackId
        ? { clipId, trackId: clipTrackId, pattern, selection, rowIds: focusRowIds, editMode }
        : null,
    [pattern, clipTrackId, clipId, selection, focusRowIds, editMode]
  );

  const handleUi = useCallback(
    (action: StepUiAction) => {
      if (!pattern) return;
      switch (action.type) {
        case "setMode":
          setEditMode(action.mode);
          if (action.mode !== "onOff") setLastValueMode(action.mode);
          return;
        case "cycleMode": {
          const i = EDIT_MODE_ORDER.indexOf(editMode);
          const next = EDIT_MODE_ORDER[(i + action.dir + EDIT_MODE_ORDER.length) % EDIT_MODE_ORDER.length]!;
          setEditMode(next);
          if (next !== "onOff") setLastValueMode(next);
          return;
        }
        case "move": {
          const r = moveSelection(pattern, selection, anchor, action.dx, action.dy, action.extend);
          setSelection(r.selection);
          setAnchor(r.anchor);
          return;
        }
        case "subrows": {
          const ids = action.all ? pattern.rows.map((r) => r.id) : focusRowIds;
          setExpandedOverride((m) => {
            const next = new Map(m);
            for (const id of ids) next.set(id, action.show);
            return next;
          });
          return;
        }
        case "toggle":
          if (action.what === "browser") setShowBrowser((v) => !v);
          else if (action.what === "inspector") setShowInspector((v) => !v);
          else if (action.what === "learnAdd") setLearn((v) => (v === "add" ? "off" : "add"));
          else setLiveRecord((v) => !v);
          return;
        case "nextPage": {
          const el = scrollRef.current;
          if (!el) return;
          const pageW = stepX(STEP_PATTERN_PAGE_SIZE, stepWidth);
          const next = el.scrollLeft + pageW >= el.scrollWidth - el.clientWidth + 1 ? 0 : el.scrollLeft + pageW;
          el.scrollLeft = next;
          return;
        }
        case "renameRow": {
          const rowId = focusRowIds[0];
          const row = pattern.rows.find((r) => r.id === rowId);
          if (!row) return;
          setRenaming({ rowId: row.id, name: row.name ?? "" });
          return;
        }
        case "save":
          void runOps([{ op: "save_step_pattern", clipId, name: pattern.name || t("stepSequencer.browser.untitled"), kind: action.kind }]).then(() =>
            setLibraryRevision((n) => n + 1)
          );
          return;
        case "clipboard": {
          const byRow = new Map<string, number[]>();
          for (const k of selection) {
            const { rowId, step } = parseStepKey(k);
            byRow.set(rowId, [...(byRow.get(rowId) ?? []), step]);
          }
          if (action.action === "copySteps" || action.action === "cutSteps") {
            const rows = pattern.rows
              .filter((r) => byRow.has(r.id))
              .map((r) => {
                const steps = byRow.get(r.id)!.sort((a, b) => a - b);
                return {
                  type: r.assignment.type === "automation" ? ("automation" as const) : ("note" as const),
                  firstStep: steps[0]!,
                  steps: steps.map((s) => ({ offset: s - steps[0]!, value: { ...(r.steps[s] ?? {}) } }))
                };
              });
            clipboard.current = rows.length ? { rows } : null;
            if (action.action === "cutSteps") {
              void runOps(
                [...byRow].map(([row, steps]) => ({
                  op: "clear_pattern" as const,
                  clipId,
                  scope: "steps" as const,
                  row,
                  steps: steps.map((s) => s + 1)
                }))
              );
            }
            return;
          }
          // Paste at the anchor step, row by row downward, keeping each step's
          // offset; needs the same row type. Paste writes every setting, and an
          // unset source rate takes the target's rate (p. 750, D81). Paste
          // Steps writes only the current edit mode's value and keeps the
          // target's other settings (F15).
          const onlyField = action.action === "pasteStepsOnly" ? (MODE_SPECS[editMode].kind === "rate" ? "stepRate" : MODE_SPECS[editMode].field) : null;
          const data = clipboard.current;
          if (!data || !anchor) return;
          const { rowId, step } = parseStepKey(anchor);
          const startRow = pattern.rows.findIndex((r) => r.id === rowId);
          const list: TimelineOp[] = [];
          data.rows.forEach((src, i) => {
            const target = pattern.rows[startRow + i];
            if (!target) return;
            const type = target.assignment.type === "automation" ? "automation" : "note";
            if (type !== src.type) return;
            for (const { offset, value } of src.steps) {
              const s = step + offset;
              if (s >= target.lengthSteps) continue;
              if (onlyField) {
                const v = (value as Record<string, unknown>)[onlyField];
                const values = { [onlyField]: v ?? (onlyField === "on" ? false : null) };
                if (v === undefined && onlyField !== "on" && onlyField !== "stepRate") continue;
                list.push({ op: "set_steps", clipId, row: target.id, steps: [s + 1], values } as TimelineOp);
                continue;
              }
              const targetRate = target.steps[s]?.stepRate;
              list.push({ op: "clear_pattern", clipId, scope: "steps", row: target.id, steps: [s + 1] });
              const { stepRate, ...rest } = value;
              const rate = stepRate ?? targetRate;
              const values: typeof rest & { on: boolean; stepRate?: typeof rate } = { ...rest, on: value.on === true };
              if (rate) values.stepRate = rate;
              list.push({ op: "set_steps", clipId, row: target.id, steps: [s + 1], values } as TimelineOp);
            }
          });
          void runOps(list);
          return;
        }
        case "rowClipboard": {
          const rowId = focusRowIds[0];
          if (action.action === "copy") {
            if (rowId) rowClipboard.current = { clipId, rowId };
            return;
          }
          const src = rowClipboard.current;
          if (!src) return;
          if (action.action === "pasteNew") {
            runOps([{ op: "copy_pattern_row", clipId: src.clipId, row: src.rowId, toClipId: clipId, asNew: true }]);
          } else if (rowId) {
            runOps([
              {
                op: "copy_pattern_row",
                clipId: src.clipId,
                row: src.rowId,
                toClipId: clipId,
                toRow: rowId,
                settingsOnly: action.action === "pasteSettings" || undefined
              }
            ]);
          }
          return;
        }
      }
    },
    [pattern, editMode, selection, anchor, focusRowIds, stepWidth, runOps, clipId, t]
  );

  const runCommand = useCallback(
    (id: string) => {
      const cmd = STEP_COMMANDS.find((c) => c.id === id);
      if (!cmd || !ctx) return;
      const result = cmd.run(ctx);
      if (!result) return;
      if (result.ops) void runOps(result.ops);
      if (result.ui) handleUi(result.ui);
    },
    [ctx, runOps, handleUi]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      const cmd = commandForKey(e, mac);
      if (!cmd || !ctx) return;
      const result = cmd.run(ctx);
      if (!result) return;
      e.preventDefault();
      e.stopPropagation();
      if (result.ops) void runOps(result.ops);
      if (result.ui) handleUi(result.ui);
    },
    [mac, ctx, runOps, handleUi]
  );

  // Step-recorded notes of one chord collect here and write as one run, so
  // the chord is one undo entry at the chord boundary (F2).
  const chordOps = useRef<TimelineOp[]>([]);
  // A mode change ends the chord: notes held while it changes are dropped (F57).
  useEffect(() => {
    chordOps.current = [];
  }, [learn, stepRecord]);
  // Learn (Add) assignments queued but not yet written, so a burst adds once (F58).
  const pendingLearn = useRef(new Set<string>());
  const learnAdd = (key: string, list: TimelineOp[]) => {
    if (pendingLearn.current.has(key)) return;
    pendingLearn.current.add(key);
    void runOps(list).finally(() => pendingLearn.current.delete(key));
  };
  /** A controller, pitch bend or pressure event in Learn or step recording (SQ38). */
  const learnAutomation = (target: StepAutomationTarget, value: number) => {
    if (!pattern) return;
    const existing = pattern.rows.find((r) => r.assignment.type === "automation" && sameAutomationTarget(r.assignment.target, target));
    const assignment = { type: "automation" as const, target };
    if (learn === "add" && !existing) learnAdd(JSON.stringify(assignment), [{ op: "add_pattern_rows", clipId, rows: [{ assignment }] }, ...sortOps(clipId, rowSort)]);
    else if (learn === "assign" && focusRowIds[0]) void runOps([{ op: "set_pattern_row", clipId, row: focusRowIds[0], assignment }]);
    else if (stepRecord && existing && anchor)
      void runOps([{ op: "set_steps", clipId, row: existing.id, steps: [parseStepKey(anchor).step + 1], values: { value } }]);
  };
  /** A played note from hardware MIDI or the on-screen keyboard (SQ38, SQ40). */
  const playNote = (pitch: number, velocity: number) => {
    if (!pattern) return;
    const target = learnTarget(pattern, instrument, pitch);
    if (learn === "add") {
      if ("add" in target) learnAdd(JSON.stringify(target.add), [{ op: "add_pattern_rows", clipId, rows: [target.add] }, ...sortOps(clipId, rowSort)]);
      return;
    }
    if (learn === "assign") {
      const rowId = focusRowIds[0];
      const assignment = "add" in target && "pad" in target.add ? { type: "kit" as const, pad: target.add.pad } : { type: "note" as const, pitch };
      if (rowId) void runOps([{ op: "set_pattern_row", clipId, row: rowId, assignment }]);
      return;
    }
    // Step recording ships in P2 (D102); it writes onto existing rows only.
    if (stepRecord && anchor && "rowId" in target) {
      const { step } = parseStepKey(anchor);
      chordOps.current.push({ op: "set_steps", clipId, row: target.rowId, steps: [step + 1], values: { on: true, velocity } });
    }
  };
  const releaseChord = () => {
    const chord = chordOps.current;
    chordOps.current = [];
    if (chord.length > 0 && stepRecord) void runOps(chord);
    if (stepRecord) handleUi({ type: "move", dx: 1, dy: 0, extend: false });
  };
  // Learn and step recording from hardware MIDI (SQ38, SQ40).
  useStepMidiInput({
    enabled: learn !== "off" || stepRecord,
    onUnavailable: (reason) => {
      // Learn keeps the on-screen keyboard without Web MIDI (F23).
      setStepRecord(false);
      setError(t("stepSequencer.midiUnavailable", { reason }));
    },
    onNote: (pitch, velocity) => playNote(pitch, velocity),
    onChordReleased: () => releaseChord(),
    onController: (cc, value) => learnAutomation({ kind: "cc", cc }, value),
    onPitchBend: (value) => learnAutomation({ kind: "pitchBend" }, Math.round((value / 16383) * 127)),
    onPressure: (value) => learnAutomation({ kind: "channelPressure" }, value)
  });

  if (!clip) return null;
  if (!pattern) {
    return (
      <FlexColumn fullWidth align="center" justify="center" gap={SPACING.md} sx={{ flex: 1, p: SPACING.xl }} data-testid="step-sequencer-convert">
        <Caption color="muted">{t("stepSequencer.notPattern")}</Caption>
        <EditorButton variant="outlined" onClick={() => runOps([{ op: "convert_midi_to_pattern", clipIds: [clipId] }])}>
          {t("stepSequencer.convertToPattern")}
        </EditorButton>
      </FlexColumn>
    );
  }

  const focusRow = pattern.rows.find((r) => r.id === focusRowIds[0]);
  /** The checked state of a toggle or radio command (F46). */
  const commandChecked = (id: string): boolean | undefined => {
    if (id.startsWith("mode.")) return editMode === id.slice(5);
    if (id.startsWith("patternPlayback.")) return pattern.playback === id.slice(16);
    if (id.startsWith("rowPlayback.")) return focusRow ? focusRow.playback === id.slice(12) : undefined;
    switch (id) {
      case "mono":
        return pattern.mono;
      case "browser":
        return showBrowser;
      case "inspector":
        return showInspector;
      case "liveRecord":
        return liveRecord;
      case "learnAdd":
        return learn === "add";
      default:
        return undefined;
    }
  };
  const menuRows = (menu: "edit" | "functions" | "view"): MenuRow[] => {
    const isNav = (id: string) => id.startsWith("move") || id.startsWith("extend");
    const toRow = (c: (typeof STEP_COMMANDS)[number]): MenuRow => ({
      id: c.id,
      label: t(`stepSequencer.cmd.${c.id}`),
      shortcut: chordLabel(menuChord(c, mac), mac),
      checked: commandChecked(c.id),
      radio: c.id.startsWith("mode.") || c.id.startsWith("patternPlayback.") || c.id.startsWith("rowPlayback."),
      disabled: ctx ? c.run(ctx) === null : true,
      testId: `step-cmd-${c.id}`,
      run: () => runCommand(c.id)
    });
    const inMenu = STEP_COMMANDS.filter((c) => c.menu === menu).filter(
      (c) => c.id !== "deleteUnusedRows" || pattern.rows.some((r) => !r.steps.some((s) => s?.on))
    );
    const rows: MenuRow[] = inMenu.filter((c) => !isNav(c.id)).map(toRow);
    // Selection navigation sits in a submenu, so every command has a menu item (SQ35, F41).
    const nav = inMenu.filter((c) => isNav(c.id));
    if (nav.length > 0) {
      rows.push({
        id: "navigate",
        label: t("stepSequencer.menu.navigate"),
        dividerBefore: true,
        testId: "step-menu-navigate",
        submenu: nav.map((c, i) => ({ ...toRow(c), dividerBefore: i === 4 })),
        run: () => undefined
      });
    }
    if (menu === "functions") {
      rows.push({
        id: "convertToMidi",
        label: t("stepSequencer.convertToMidi"),
        dividerBefore: true,
        run: () => runOps([{ op: "convert_pattern_to_midi", clipIds: [clipId] }])
      });
      rows.push({
        id: "separateRows",
        label: t("stepSequencer.separateRows"),
        run: () => runOps([{ op: "separate_pattern_rows", clipId }])
      });
    }
    if (menu === "view") {
      rows.push(
        ...(["editing", "selectedRow", "all"] as const).map((v, i) => ({
          id: `display.${v}`,
          label: t(`stepSequencer.view.display.${v}`),
          radio: true,
          checked: valueDisplay === v,
          dividerBefore: i === 0,
          run: () => setValueDisplay(v)
        })),
        {
          id: "sort",
          label: t("stepSequencer.view.sortRows"),
          dividerBefore: true,
          submenu: (["type", "typeAndNote", "typeAndName", "typeAndKitPad"] as const).flatMap((by) =>
            [false, true].map((descending) => ({
              id: `sort.${by}.${descending}`,
              label: `${t(`stepSequencer.view.sort.${by}`)} (${t(descending ? "stepSequencer.view.descending" : "stepSequencer.view.ascending")})`,
              checked: rowSort?.by === by && rowSort.descending === descending,
              run: () => void runOps(sortOps(clipId, { by, descending }))
            }))
          ),
          run: () => undefined
        },
        {
          id: "rowColors",
          label: t("stepSequencer.view.rowColors"),
          checked: showRowColors,
          run: () => setShowRowColors((v) => !v)
        }
      );
    }
    return rows;
  };

  const addRowExtra = [
    { id: "learnAdd", label: t("stepSequencer.cmd.learnAdd"), dividerBefore: true, run: () => setLearn("add") },
    { id: "learnAssign", label: t("stepSequencer.addRow.learnAssign"), run: () => setLearn("assign") }
  ];

  // Page overview menu: Cut, Copy, Paste and Clear Page (p. 733).
  const onPageAction = (page: number, action: PageAction) => {
    const size = STEP_PATTERN_PAGE_SIZE;
    if (action === "cut" || action === "copy") setPageClipboard(copyPage(pattern, page, size));
    if (action === "cut" || action === "clear") void runOps(clearPageOps(clipId, pattern, page, size));
    if (action === "paste" && pageClipboard) void runOps(pastePageOps(clipId, pattern, pageClipboard, page, size));
  };

  const maxSteps = Math.max(pattern.lengthSteps, ...pattern.rows.map((r) => r.lengthSteps));
  const pages = Math.ceil(maxSteps / STEP_PATTERN_PAGE_SIZE);
  const inspectorRows = pattern.rows.filter((r) => focusRowIds.includes(r.id));
  const inspectorStepTargets = pattern.rows
    .map((row) => ({ row, steps: rowSelection(selection, row.id) }))
    .filter((x) => x.steps.length > 0);
  const valueModeActive = editMode !== "onOff";
  const nudgeAll = (dir: number) => {
    if (ctx && dir !== 0) void runOps(nudgeOps(ctx, pattern.rows.map((r) => r.id), dir));
  };
  // A vertical drag on Increment or Decrement moves one unit per 8 px, committed once (F32, p. 751).
  const nudgeHandlers = (dir: 1 | -1) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const startY = e.clientY;
      const id = e.pointerId;
      const el = e.currentTarget;
      el.setPointerCapture?.(id);
      nudgeDragged.current = false;
      let units = 0;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        units = Math.round((startY - ev.clientY) / 8);
        if (units !== 0) nudgeDragged.current = true;
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        if (ev.type === "pointerup" && nudgeDragged.current) nudgeAll(units);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    },
    onClick: () => {
      if (nudgeDragged.current) nudgeDragged.current = false;
      else nudgeAll(dir);
    }
  });

  const learnButton =
    learn !== "off" ? (
      <EditorButton
        size="small"
        variant="contained"
        color={learn === "add" ? "error" : "warning"}
        onClick={() => setLearn("off")}
        data-testid="learn-button"
      >
        {t(learn === "add" ? "stepSequencer.learnAdd" : "stepSequencer.learnAssign")}
      </EditorButton>
    ) : (
      <ToolbarIconButton tooltip={t("stepSequencer.toolbar.addRow")} aria-haspopup="menu" onClick={(e) => setAddAnchor(e.currentTarget)} data-testid="add-row">
        <AddOutlinedIcon sx={iconSx} />
      </ToolbarIconButton>
    );

  return (
    <FlexColumn
      ref={rootRef}
      fullWidth
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => {
        // A click anywhere but a text field gives the editor its keys (F3).
        if (!(e.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) {
          rootRef.current?.focus({ preventScroll: true });
        }
      }}
      data-testid="step-sequencer"
      data-timeline-piano-roll="step-sequencer"
      role="region"
      aria-label={t("stepSequencer.aria.editor", { name: clip.name ?? pattern.name })}
      sx={{
        flex: "1 1 0",
        minHeight: 0,
        outline: "none",
        "&:focus-visible": { boxShadow: (th) => `inset 0 0 0 2px ${th.vars.palette.primary.main}` }
      }}
    >
      {/* Bar 1 (SQ28) */}
      <Toolbar css={barStyles} data-testid="step-sequencer-bar1">
        {toolbarStart}
        <MenuButton label={t("stepSequencer.menu.edit")} rows={menuRows("edit")} />
        <MenuButton label={t("stepSequencer.menu.functions")} rows={menuRows("functions")} />
        <MenuButton label={t("stepSequencer.menu.view")} rows={menuRows("view")} />
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.browser")} active={showBrowser} onClick={() => setShowBrowser((v) => !v)} data-testid="toggle-browser">
          <LibraryMusicOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.inspector")} active={showInspector} onClick={() => setShowInspector((v) => !v)} data-testid="toggle-inspector">
          <TuneOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.midiIn")} active={stepRecord} onClick={() => setStepRecord((v) => !v)}>
          <InputOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.midiOut")} active={midiOut} onClick={() => setMidiOut((v) => !v)} sx={midiOut ? { color: "success.main" } : undefined}>
          <PianoOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.mono")} active={pattern.mono} onClick={() => runOps([{ op: "set_pattern", clipId, mono: !pattern.mono }])} data-testid="toggle-mono">
          <CallSplitOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <FlexRow gap={SPACING.none} sx={{ ml: SPACING.sm }}>
          <EditorButton
            size="small"
            variant={editMode === "onOff" ? "contained" : "outlined"}
            onClick={() => setEditMode("onOff")}
            sx={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, minWidth: 72 }}
            data-testid="mode-onoff"
          >
            {t("stepSequencer.mode.onOff")}
          </EditorButton>
          <ModeSelect
            value={valueModeActive ? editMode : lastValueMode}
            active={valueModeActive}
            onPick={(m) => {
              setEditMode(m);
              setLastValueMode(m);
            }}
          />
        </FlexRow>
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.liveRecord")} active={liveRecord} onClick={() => setLiveRecord((v) => !v)} sx={liveRecord ? { color: "error.main" } : undefined}>
          <FiberManualRecordOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.preview")} active={preview} onClick={() => setPreview((v) => !v)} data-testid="toggle-preview">
          <VolumeUpOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <FlexRow sx={{ flex: 1 }} />
        <UnfoldMoreOutlinedIcon sx={{ ...iconSx, color: "text.secondary" }} />
        <Slider
          size="small"
          aria-label={t("stepSequencer.toolbar.verticalZoom")}
          min={MIN_ROW_HEIGHT_PX}
          max={MAX_ROW_HEIGHT_PX}
          value={rowHeight}
          onChange={(_, v) => {
            setAutoZoom(false);
            setRowHeight(v as number);
          }}
          sx={{ width: 72 }}
        />
        <ToolbarIconButton tooltip={t("stepSequencer.toolbar.autoZoom")} active={autoZoom} onClick={() => setAutoZoom((v) => !v)}>
          <ViewAgendaOutlinedIcon sx={iconSx} />
        </ToolbarIconButton>
        <Slider
          size="small"
          aria-label={t("stepSequencer.toolbar.stepWidth")}
          min={MIN_STEP_WIDTH_PX}
          max={MAX_STEP_WIDTH_PX}
          value={stepWidth}
          onChange={(_, v) => setStepWidth(v as number)}
          sx={{ width: 72 }}
        />
        {toolbarEnd}
      </Toolbar>
      {/* Bar 2 */}
      <Toolbar css={barStyles} data-testid="step-sequencer-bar2">
        <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: ROW_HEADER_WIDTH_PX - 16, flexShrink: 0 }}>
          {learnButton}
          <PlainSelect
            tooltip={t("stepSequencer.toolbar.stepRate")}
            label={`/${pattern.stepRate.replace(/^1\//, "")}`}
            value={pattern.stepRate}
            options={STEP_RATES.map((r) => ({ value: r, label: r }))}
            onPick={(v) => runOps([{ op: "set_pattern", clipId, stepRate: v as typeof pattern.stepRate }])}
          />
          <PlainSelect
            tooltip={t("stepSequencer.toolbar.playback")}
            label={PLAYBACK_GLYPH[pattern.playback]}
            value={pattern.playback}
            options={STEP_PLAYBACK_MODES.map((m) => ({ value: m, label: t(`stepSequencer.playback.${m}`) }))}
            onPick={(v) => runOps([{ op: "set_pattern", clipId, playback: v as typeof pattern.playback }])}
          />
          <ToolbarIconButton tooltip={t("stepSequencer.cmd.rotatePatternLeft")} onClick={() => runCommand("rotatePatternLeft")}>
            <RotateLeftOutlinedIcon sx={iconSx} />
          </ToolbarIconButton>
          <ToolbarIconButton tooltip={t("stepSequencer.cmd.rotatePatternRight")} onClick={() => runCommand("rotatePatternRight")}>
            <RotateRightOutlinedIcon sx={iconSx} />
          </ToolbarIconButton>
          <ToolbarIconButton tooltip={t("stepSequencer.toolbar.decrement")} {...nudgeHandlers(-1)}>
            <KeyboardArrowDownOutlinedIcon sx={iconSx} />
          </ToolbarIconButton>
          <ToolbarIconButton tooltip={t("stepSequencer.toolbar.increment")} {...nudgeHandlers(1)}>
            <KeyboardArrowUpOutlinedIcon sx={iconSx} />
          </ToolbarIconButton>
          <ToolbarIconButton tooltip={t("stepSequencer.cmd.randomizeAll")} onClick={() => runCommand("randomizeAll")}>
            <CasinoOutlinedIcon sx={iconSx} />
          </ToolbarIconButton>
          <ToolbarIconButton
            tooltip={t(editMode === "onOff" ? "stepSequencer.cmd.clearPattern" : "stepSequencer.cmd.clearModeAll")}
            onClick={() => runCommand(editMode === "onOff" ? "clearPattern" : "clearModeAll")}
          >
            <DisabledByDefaultOutlinedIcon sx={iconSx} />
          </ToolbarIconButton>
        </FlexRow>
        <FlexRow
          role={editingName ? undefined : "button"}
          tabIndex={editingName ? undefined : 0}
          aria-label={editingName ? undefined : t("stepSequencer.toolbar.renamePattern")}
          onKeyDown={(e: React.KeyboardEvent) => {
            // Enter or F2 renames the pattern from the keyboard (F35).
            if (editingName || (e.key !== "Enter" && e.key !== "F2")) return;
            e.preventDefault();
            e.stopPropagation();
            setEditingName(true);
          }}
        >
        <InlineEditableText
          editing={editingName}
          onEditingChange={setEditingName}
          value={pattern.name}
          placeholder={t("stepSequencer.browser.untitled")}
          onCommit={(name: string) => runOps([{ op: "set_pattern", clipId, name }])}
          ariaLabel={t("stepSequencer.toolbar.patternName")}
        />
        </FlexRow>
        <FlexRow sx={{ flex: 1 }} />
        {pages > 1 && (
          <FlexRow gap={SPACING.xs} data-testid="page-overview">
            {Array.from({ length: pages }, (_, p) => (
              <PageOverview
                key={p}
                page={p}
                pattern={pattern}
                color={baseColor}
                active={p === visiblePage}
                canPaste={pageClipboard !== null}
                onPageAction={onPageAction}
                onClick={() => {
                  if (scrollRef.current) scrollRef.current.scrollLeft = stepX(p * STEP_PATTERN_PAGE_SIZE, stepWidth);
                }}
              />
            ))}
          </FlexRow>
        )}
        <FlexRow sx={{ flex: 1 }} />
        <PlainSelect
          tooltip={t("stepSequencer.toolbar.length")}
          label={t("stepSequencer.toolbar.steps", { n: pattern.lengthSteps })}
          value={String(pattern.lengthSteps)}
          options={[]}
          groups={LENGTH_BASES.map((base) => ({
            label: t("stepSequencer.toolbar.lengthBased", { n: base }),
            options: lengthsFor(base).map((n) => ({ value: String(n), label: t("stepSequencer.toolbar.steps", { n }) }))
          }))}
          onPick={(v) => runOps([{ op: "set_pattern", clipId, lengthSteps: Number(v) }])}
        />
      </Toolbar>
      {learn !== "off" && <StepLearnKeyboard onNote={playNote} onRelease={releaseChord} />}
      {error && (
        <ErrorBanner report={{ source: "operation-failure", summary: t("stepSequencer.editFailed"), errorText: error }}>{error}</ErrorBanner>
      )}
      <FlexRow sx={{ flex: 1, minHeight: 0 }}>
        {showBrowser && <StepPatternBrowser clipId={clipId} patternName={pattern.name} run={ops.run} onError={onError} libraryRevision={libraryRevision} />}
        {showInspector && (
          <StepSequencerInspector
            clipId={clipId}
            pattern={pattern}
            rows={inspectorRows}
            stepTargets={inspectorStepTargets}
            instrument={instrument}
            assignmentGroups={groups}
            onAssignRows={onAssignRows}
            runOps={runOps}
          />
        )}
        <FlexRow ref={viewportRef} data-testid="step-sequencer-viewport" sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <ScrollArea
            ref={scrollRef}
            sx={{ flex: 1, minHeight: 0 }}
            data-testid="step-sequencer-scroll"
            onScroll={(e: React.UIEvent<HTMLDivElement>) =>
              setVisiblePage(Math.round(e.currentTarget.scrollLeft / Math.max(1, stepX(STEP_PATTERN_PAGE_SIZE, stepWidth))))
            }
          >
            <div style={{ width: ROW_HEADER_WIDTH_PX + stripWidth(maxSteps, stepWidth) + 16 }}>
              <StepSequencerGrid
                clipId={clipId}
                pattern={pattern}
                instrument={instrument}
                baseColor={baseColor}
                rowColor={rowColor}
                scheme={scheme}
                showRowColors={showRowColors}
                editMode={editMode}
                stepWidth={stepWidth}
                rowHeight={rowHeight}
                valueDisplay={valueDisplay}
                selection={selection}
                getSelection={getSelection}
                onSelectionChange={onSelectionChange}
                selectedRowIds={selectedRowIds}
                onSelectRow={onSelectRow}
                expandedRows={expandedRows}
                onToggleExpanded={onToggleExpanded}
                onRenameRow={onRenameRow}
                assignmentGroups={groups}
                onAssignRow={onAssignRow}
                onRowPlayback={onRowPlayback}
                onMoveRow={onMoveRow}
                colorChoices={colorChoices}
                playing={playing}
                mac={mac}
                runOps={runOps}
                onStepAudition={audition}
              />
              {pattern.rows.length === 0 && (
                <EmptyState
                  size="small"
                  title={t("stepSequencer.addRow.emptyTitle")}
                  description={t("stepSequencer.addRow.emptyDescription")}
                  actionText={t("stepSequencer.toolbar.addRow")}
                  onAction={() => setAddAnchor(rootRef.current?.querySelector<HTMLElement>("[data-testid=add-row]") ?? null)}
                />
              )}
            </div>
          </ScrollArea>
        </FlexRow>
      </FlexRow>
      <Dialog
        open={renaming !== null}
        title={t("stepSequencer.row.renameTitle")}
        onClose={() => setRenaming(null)}
        onCancel={() => setRenaming(null)}
        onConfirm={commitRename}
        content={
          <TextInput
            autoFocus
            fullWidth
            label={t("stepSequencer.row.rename")}
            value={renaming?.name ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
            }}
          />
        }
      />
      <RowAssignmentMenu
        anchorEl={addAnchor}
        groups={groups}
        extra={addRowExtra}
        onClose={() => setAddAnchor(null)}
        onPick={(choice) => void runOps(addRowOps(clipId, pattern, choice, rowSort))}
      />
    </FlexColumn>
  );
});
StepSequencer.displayName = "StepSequencer";

const ModeSelect: React.FC<{ value: StepEditMode; active: boolean; onPick: (m: StepEditMode) => void }> = ({ value, active, onPick }) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <EditorButton
        size="small"
        variant={active ? "contained" : "outlined"}
        endIcon={<UnfoldMoreOutlinedIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, minWidth: 140, justifyContent: "space-between" }}
        data-testid="mode-select"
      >
        {value === "velocity" ? t("stepSequencer.mode.velocityValue") : t(`stepSequencer.mode.${value}`)}
      </EditorButton>
      <ContextMenu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {EDIT_MODE_ORDER.filter((m) => m !== "onOff").map((m) => (
          <MenuItemPrimitive
            key={m}
            label={m === "velocity" ? t("stepSequencer.mode.velocityValue") : t(`stepSequencer.mode.${m}`)}
            checkable="radio"
            checked={m === value}
            onClick={() => {
              setAnchor(null);
              onPick(m);
            }}
          />
        ))}
      </ContextMenu>
    </>
  );
};

const PlainSelect: React.FC<{
  tooltip: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  /** Sections shown as submenus, as the Length menu (SQ7). */
  groups?: Array<{ label: string; options: Array<{ value: string; label: string }> }>;
  onPick: (v: string) => void;
}> = ({ tooltip, label, value, options, groups, onPick }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [sub, setSub] = useState<{ anchor: HTMLElement; options: Array<{ value: string; label: string }> } | null>(null);
  const close = () => {
    setAnchor(null);
    setSub(null);
  };
  const item = (o: { value: string; label: string }) => (
    <MenuItemPrimitive
      key={o.value}
      label={o.label}
      checkable="radio"
      checked={o.value === value}
      onClick={() => {
        close();
        onPick(o.value);
      }}
    />
  );
  return (
    <>
      <EditorButton size="small" variant="text" endIcon={<ExpandMoreOutlinedIcon />} aria-label={tooltip} title={tooltip} onClick={(e) => setAnchor(e.currentTarget)}>
        {label}
      </EditorButton>
      <ContextMenu open={anchor !== null} anchorEl={anchor} onClose={close}>
        {options.map(item)}
        {groups?.map((g) => (
          <MenuItemPrimitive
            key={g.label}
            label={g.label}
            hasSubmenu
            onClick={(e: React.MouseEvent<HTMLElement>) => setSub({ anchor: e.currentTarget, options: g.options })}
          />
        ))}
      </ContextMenu>
      <ContextMenu
        open={sub !== null}
        anchorEl={sub?.anchor ?? null}
        onClose={close}
        maxHeight="60vh"
        // The Length select sits at the right edge, so its sections open to the left.
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {sub?.options.map(item)}
      </ContextMenu>
    </>
  );
};

/** A page thumbnail: one dot per on step, framed when visible (p. 724). Control-click opens the page menu (p. 733). */
const PageOverview: React.FC<{
  page: number;
  pattern: StepPattern;
  color: string;
  active: boolean;
  canPaste: boolean;
  onClick: () => void;
  onPageAction: (page: number, action: PageAction) => void;
}> = ({ page, pattern, color, active, canPaste, onClick, onPageAction }) => {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const from = page * STEP_PATTERN_PAGE_SIZE;
  const pick = (action: PageAction) => () => {
    setMenu(null);
    onPageAction(page, action);
  };
  return (
    <>
      <ToolbarIconButton
        tooltip={t("stepSequencer.toolbar.page", { page: page + 1 })}
        onClick={onClick}
        onContextMenu={(e: React.MouseEvent) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        active={active}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${STEP_PATTERN_PAGE_SIZE} ${Math.max(1, pattern.rows.length)}`} preserveAspectRatio="none" aria-hidden>
          {pattern.rows.flatMap((r, y) =>
            Array.from({ length: STEP_PATTERN_PAGE_SIZE }, (_, i) =>
              r.steps[from + i]?.on ? <rect key={`${r.id}-${i}`} x={i + 0.15} y={y + 0.15} width={0.7} height={0.7} fill={color} /> : null
            )
          )}
        </svg>
      </ToolbarIconButton>
      <ContextMenu open={menu !== null} position={menu} onClose={() => setMenu(null)}>
        <MenuItemPrimitive label={t("stepSequencer.pageMenu.cut")} onClick={pick("cut")} />
        <MenuItemPrimitive label={t("stepSequencer.pageMenu.copy")} onClick={pick("copy")} />
        <MenuItemPrimitive label={t("stepSequencer.pageMenu.paste")} disabled={!canPaste} onClick={pick("paste")} />
        <MenuItemPrimitive label={t("stepSequencer.pageMenu.clear")} dividerBefore onClick={pick("clear")} />
      </ContextMenu>
    </>
  );
};
