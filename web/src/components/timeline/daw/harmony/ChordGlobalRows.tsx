/**
 * The music view's two global rows under the ruler, as in Logic Pro: Signature
 * (the time signature and key) and Chord (the first chord track's chords).
 * The user mostly watches the chords. A click on a chord opens a small picker,
 * a drag on the line between two chords moves the change, and the Chord row
 * menu runs the chord operations the agent also uses.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";
import {
  CHORD_ROOT_NAMES,
  chordName,
  chordSymbol,
  listProgressionInfo,
  parseChordSymbol,
  resolveTempo,
  sortChords,
  type TimelineChord
} from "@nodetool-ai/timeline";
import { timelineOpFromToolArgs, type TimelineOp } from "@nodetool-ai/timeline/ops";

import { useNotificationStore } from "../../../../stores/NotificationStore";
import { useTimelineStore, useTimelineStoreApi } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { getTimelineAgentHandler } from "../../timelineAgentBridge";
import {
  Box,
  BORDER_RADIUS,
  ContextMenu,
  EditorButton,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  MOTION,
  Popover,
  SPACING,
  Text,
  TextInput,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  Z_INDEX,
  getSpacingPx
} from "../../../ui_primitives";
import { beatTicks, docTickToMs, msToDocTick } from "./chordGrid";
import { previewChord } from "./chordPreview";
import { useHarmonyUIStore } from "./harmonyUIStore";
import {
  chordNumeral,
  diatonicChords,
  keyShort,
  withBoundaryAt,
  withChordChoice,
  type ChordChoice
} from "./chordRows";
import { ProgressionBrowser } from "./ProgressionBrowser";
import "./harmony.css";

export const SIGNATURE_ROW_PX = 22;
export const CHORD_ROW_PX = 24;
/** Height the two rows add under the ruler. */
export const CHORD_GLOBAL_ROWS_PX = SIGNATURE_ROW_PX + CHORD_ROW_PX;

/** Pixels the pointer travels before a press on a change line is a drag. */
const DRAG_SLOP_PX = 2;
/** Width of the pointer target on a change line. */
const LINE_HIT_PX = 8;

export interface ChordGlobalRowsProps {
  /** Width of the header column, a CSS length. */
  headerWidth: number | string;
  /** Width of the scrollable lane content. */
  totalWidthPx: number;
}

interface LineDrag {
  rightId: string;
  startX: number;
  moved: boolean;
}

export const ChordGlobalRows: React.FC<ChordGlobalRowsProps> = ({ headerWidth, totalWidthPx }) => {
  const { t } = useTranslation();
  const storeApi = useTimelineStoreApi();
  const tempoState = useTimelineStore((s) => s.tempo);
  const track = useTimelineStore((s) => s.tracks.find((tr) => tr.type === "chord"));
  const setTrackChords = useTimelineStore((s) => s.setTrackChords);
  const tempo = useMemo(() => resolveTempo({ tempo: tempoState }), [tempoState]);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<LineDrag | null>(null);
  const [draft, setDraft] = useState<TimelineChord[] | null>(null);
  const [menu, setMenu] = useState<{ anchor?: HTMLElement; position?: { x: number; y: number } } | null>(null);
  const [picker, setPicker] = useState<{ chordId: string; anchor: HTMLElement } | null>(null);
  const [sevenths, setSevenths] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [symbolError, setSymbolError] = useState("");
  const [browsing, setBrowsing] = useState<HTMLElement | null>(null);
  const [browserKey, setBrowserKey] = useState(() => diatonicChords(tempoState?.key, false)[0].root);
  const [transposeAt, setTransposeAt] = useState<HTMLElement | null>(null);
  const [semitones, setSemitones] = useState("1");
  const showNumerals = useHarmonyUIStore((s) => s.showNumerals);
  const setShowNumerals = useHarmonyUIStore((s) => s.setShowNumerals);

  const stored = useMemo(() => sortChords(track?.chords ?? []), [track?.chords]);
  const chords = draft ?? stored;
  const locked = track?.locked === true;
  const tickToX = useCallback((tick: number) => docTickToMs(tick, tempo) / msPerPx, [tempo, msPerPx]);
  const step = beatTicks(tempo);
  const label = `${tempo.timeSignature.beatsPerBar}/${tempo.timeSignature.beatUnit}  ${keyShort(tempo.key)}`.trim();

  /** Runs a chord operation through the open timeline, the way the agent does. */
  const runOp = useCallback(
    async (name: Parameters<typeof timelineOpFromToolArgs>[0], args: Record<string, unknown>): Promise<void> => {
      try {
        const id = storeApi.getState().sequenceId;
        if (!id) {
          throw new Error(t("i18n-next77.harmony.chordRows.noTimeline"));
        }
        await getTimelineAgentHandler(id).applyOp(timelineOpFromToolArgs(name, args) as TimelineOp);
      } catch (error) {
        addNotification({
          type: "error",
          content: error instanceof Error ? error.message : String(error),
          dedupeKey: "chord-row-op"
        });
      }
    },
    [addNotification, storeApi, t]
  );

  const openMenuAt = (event: React.MouseEvent): void => {
    event.preventDefault();
    setMenu({ position: { x: event.clientX, y: event.clientY } });
  };

  const detectFromSelection = (): void => {
    const state = storeApi.getState();
    const selected = [...useTimelineUIStore.getState().selectedClipIds].filter((id) =>
      state.clips.some((c) => c.id === id && (c.mediaType === "midi" || c.mediaType === "audio"))
    );
    if (selected.length === 0) {
      addNotification({
        type: "info",
        content: t("i18n-next77.harmony.chordRows.selectClip"),
        dedupeKey: "chord-row-select"
      });
      return;
    }
    void runOp("detect_chords", { clipIds: selected });
  };

  const applyProgression = (index: number): void => {
    const info = listProgressionInfo()[index];
    if (!info) {
      return;
    }
    const minor = tempo.key?.mode === "minor";
    void runOp("apply_progression", {
      progression: info.id,
      key: `${CHORD_ROOT_NAMES[browserKey]}${minor ? " minor" : ""}`
    });
  };

  const commitChoice = (chordId: string, choice: ChordChoice & { inversion?: number }): void => {
    if (!track) {
      return;
    }
    setTrackChords(track.id, withChordChoice(stored, chordId, choice));
    setPicker(null);
  };

  const submitSymbol = (chordId: string): void => {
    const parsed = parseChordSymbol(symbol);
    if (!parsed.ok) {
      setSymbolError(parsed.error);
      return;
    }
    commitChoice(chordId, parsed);
  };

  /** Tab in the picker: keep a changed symbol, then edit the next (or, with Shift, the previous) chord. */
  const pickNext = (chordId: string, step: 1 | -1): void => {
    if (symbol.trim() && symbol !== chordSymbol(stored.find((c) => c.id === chordId) ?? stored[0])) {
      const parsed = parseChordSymbol(symbol);
      if (!parsed.ok) {
        setSymbolError(parsed.error);
        return;
      }
      if (track) setTrackChords(track.id, withChordChoice(stored, chordId, parsed));
    }
    const index = stored.findIndex((c) => c.id === chordId);
    const next = stored[index + step];
    const anchor = next ? laneRef.current?.querySelector<HTMLElement>(`[data-chord-id="${CSS.escape(next.id)}"]`) : null;
    if (next && anchor) {
      openPicker(next, anchor);
    } else {
      setPicker(null);
    }
  };

  const openPicker = (chord: TimelineChord, anchor: HTMLElement): void => {
    setSymbol(chordSymbol(chord));
    setSymbolError("");
    setPicker({ chordId: chord.id, anchor });
  };

  const tickAt = (clientX: number): number => {
    const rect = laneRef.current?.getBoundingClientRect();
    return Math.max(0, msToDocTick(((rect ? clientX - rect.left : 0) + scrollLeftPx) * msPerPx, tempo));
  };

  const onLinePointerDown = (event: React.PointerEvent<HTMLElement>, rightId: string): void => {
    if (locked || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { rightId, startX: event.clientX, moved: false };
  };
  const onLinePointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_SLOP_PX) {
      return;
    }
    drag.moved = true;
    setDraft(withBoundaryAt(stored, drag.rightId, tickAt(event.clientX), step));
  };
  const onLinePointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (!drag?.moved || !track) {
      return;
    }
    setTrackChords(track.id, withBoundaryAt(stored, drag.rightId, tickAt(event.clientX), step));
  };

  const pickerChord = picker ? stored.find((c) => c.id === picker.chordId) : undefined;
  const triads = diatonicChords(tempo.key, sevenths);
  const closeMenu = (): void => setMenu(null);
  const afterMenu = (action: () => void) => (): void => {
    closeMenu();
    action();
  };

  const rowSx = (height: number) => ({
    height,
    flexShrink: 0,
    borderBottom: (theme: { vars: { palette: { divider: string } } }) => `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: "background.paper"
  });
  const headerSx = {
    width: headerWidth,
    flexShrink: 0,
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: getSpacingPx(SPACING.sm),
    paddingInline: getSpacingPx(SPACING.lg),
    color: "text.secondary",
    borderRight: (theme: { vars: { palette: { divider: string } } }) => `1px solid ${theme.vars.palette.divider}`
  };
  const viewportSx = { position: "relative", flex: "1 1 auto", minWidth: 0, height: "100%", overflow: "hidden" } as const;

  return (
    <FlexColumn data-testid="chord-global-rows" sx={{ flexShrink: 0 }}>
      <FlexRow align="stretch" fullWidth sx={rowSx(SIGNATURE_ROW_PX)} data-testid="signature-row">
        <Box sx={headerSx}>
          <Text size="smaller" color="secondary">{t("i18n-next77.harmony.chordRows.signature")}</Text>
        </Box>
        <Box sx={{ ...viewportSx, display: "flex", alignItems: "center", paddingInline: getSpacingPx(SPACING.md) }}>
          <Text size="smaller" family="secondary" data-testid="signature-label">{label}</Text>
        </Box>
      </FlexRow>
      <FlexRow align="stretch" fullWidth sx={rowSx(CHORD_ROW_PX)} data-testid="chord-row">
        <Box sx={headerSx}>
          <Text size="smaller" color="secondary">{t("i18n-next77.harmony.chordRows.chord")}</Text>
          <ToolbarIconButton
            icon={<AddIcon />}
            tooltip={t("i18n-next77.harmony.chordRows.menu")}
            aria-label={t("i18n-next77.harmony.chordRows.menu")}
            data-testid="chord-row-menu"
            onClick={(event) => setMenu({ anchor: event.currentTarget })}
          />
        </Box>
        <Box ref={laneRef} sx={viewportSx} onContextMenu={openMenuAt} data-testid="chord-row-lane">
          <Box sx={{ position: "absolute", top: 0, left: 0, height: "100%", width: totalWidthPx, transform: `translateX(${-scrollLeftPx}px)` }}>
            {chords.map((chord, index) => {
              const left = tickToX(chord.startTick);
              const width = tickToX(chord.startTick + chord.durationTick) - left;
              const isOpen = picker?.chordId === chord.id;
              return (
                <Box
                  key={chord.id}
                  role="button"
                  tabIndex={0}
                  data-chord-id={chord.id}
                  aria-label={t("i18n-next77.harmony.chordLane.chordAriaLabel", { chord: chordName(chord) })}
                  onClick={(event: React.MouseEvent<HTMLElement>) => openPicker(chord, event.currentTarget)}
                  onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openPicker(chord, event.currentTarget);
                    }
                  }}
                  data-open={isOpen || undefined}
                  style={{ left, width: Math.max(2, width - 1) }}
                  sx={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    paddingInline: getSpacingPx(SPACING.sm),
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    cursor: locked ? "default" : "pointer",
                    borderRadius: BORDER_RADIUS.xs,
                    // One chord color for every chord, as in Logic. The name carries the root.
                    backgroundColor: "c_timeline_chord_fill",
                    boxShadow: (theme) => `inset 0 0 0 1px ${isOpen ? theme.vars.palette.text.primary : theme.vars.palette.divider}`,
                    color: "text.primary",
                    transition: MOTION.background,
                    "&:hover": { backgroundImage: (theme) => `linear-gradient(${theme.vars.palette.c_overlay_strong}, ${theme.vars.palette.c_overlay_strong})` },
                    "&:focus-visible": { outline: (theme) => `1px solid ${theme.vars.palette.primary.main}`, outlineOffset: -1 }
                  }}
                >
                  {width > 18 && (
                    <Text size="smaller" weight={600} color="inherit" truncate>
                      {showNumerals ? chordNumeral(chord, tempo.key) : chordName(chord)}
                    </Text>
                  )}
                  {index > 0 && (
                    <Box
                      aria-hidden
                      data-chord-line={chord.id}
                      onClick={(event: React.MouseEvent) => event.stopPropagation()}
                      onPointerDown={(event: React.PointerEvent<HTMLElement>) => onLinePointerDown(event, chord.id)}
                      onPointerMove={onLinePointerMove}
                      onPointerUp={onLinePointerUp}
                      onPointerCancel={() => {
                        dragRef.current = null;
                        setDraft(null);
                      }}
                      sx={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: LINE_HIT_PX,
                        cursor: locked ? "default" : "col-resize",
                        borderLeft: (theme) => `1px solid ${theme.vars.palette.text.disabled}`,
                        "&:hover": { borderLeftColor: locked ? undefined : "text.primary" }
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
          {chords.length === 0 && (
            <FlexRow
              align="center"
              gap={1}
              sx={{ position: "absolute", inset: 0, paddingInline: getSpacingPx(SPACING.md), zIndex: Z_INDEX.base }}
              data-testid="chord-row-empty"
            >
              <Text size="smaller" color="secondary" truncate>{t("i18n-next77.harmony.chordRows.empty")}</Text>
              <EditorButton density="compact" onClick={(event) => setBrowsing(event.currentTarget)}>
                {t("i18n-next77.harmony.chordRows.applyProgression")}
              </EditorButton>
            </FlexRow>
          )}
        </Box>
      </FlexRow>

      <ContextMenu
        open={menu !== null}
        anchorEl={menu?.anchor ?? null}
        position={menu?.position ?? null}
        onClose={closeMenu}
      >
        <MenuItemPrimitive
          label={t("i18n-next77.harmony.chordRows.applyProgression")}
          onClick={(event) => {
            const anchor = menu?.anchor ?? (event.currentTarget as HTMLElement);
            closeMenu();
            setBrowsing(anchor);
          }}
        />
        <MenuItemPrimitive
          label={t("i18n-next77.harmony.chordRows.detect")}
          onClick={afterMenu(detectFromSelection)}
        />
        <MenuItemPrimitive
          label={t("i18n-next77.harmony.chordRows.showNumerals")}
          checkable="checkbox"
          checked={showNumerals}
          onClick={afterMenu(() => setShowNumerals(!showNumerals))}
        />
        <MenuItemPrimitive
          label={t("i18n-next77.harmony.chordRows.transpose")}
          disabled={chords.length === 0}
          onClick={(event) => {
            const anchor = menu?.anchor ?? (event.currentTarget as HTMLElement);
            closeMenu();
            setTransposeAt(anchor);
          }}
        />
        <MenuItemPrimitive
          label={t("i18n-next77.harmony.chordRows.clear")}
          color="error"
          disabled={chords.length === 0}
          onClick={afterMenu(() => void runOp("clear_chords", {}))}
        />
      </ContextMenu>

      <Popover
        open={picker !== null && pickerChord !== undefined}
        anchorEl={picker?.anchor ?? null}
        onClose={() => setPicker(null)}
        placement="bottom-left"
      >
        {pickerChord && (
          <FlexColumn gap={2} sx={{ padding: getSpacingPx(SPACING.md), minWidth: 240 }} data-testid="chord-picker">
            <ToggleGroup
              size="small"
              segmented
              exclusive
              value={sevenths ? "sevenths" : "triads"}
              onChange={(_event, value: string | null) => {
                if (value) {
                  setSevenths(value === "sevenths");
                }
              }}
              aria-label={t("i18n-next77.harmony.chordRows.pickerMode")}
            >
              <ToggleOption value="triads">{t("i18n-next77.harmony.chordRows.triads")}</ToggleOption>
              <ToggleOption value="sevenths">{t("i18n-next77.harmony.chordRows.sevenths")}</ToggleOption>
            </ToggleGroup>
            <FlexRow wrap gap={1}>
              {triads.map((choice) => {
                const current = choice.root === pickerChord.root && choice.quality === pickerChord.quality && !pickerChord.inversion;
                return (
                  <EditorButton
                    key={`${choice.root}-${choice.quality}`}
                    density="compact"
                    variant={current ? "contained" : "outlined"}
                    aria-pressed={current}
                    onClick={() => commitChoice(pickerChord.id, choice)}
                  >
                    {chordName(choice)}
                  </EditorButton>
                );
              })}
            </FlexRow>
            <TextInput
              size="small"
              compact
              label={t("i18n-next77.harmony.chordRows.symbol")}
              value={symbol}
              errorMessage={symbolError || undefined}
              onChange={(event) => {
                setSymbol(event.target.value);
                setSymbolError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSymbol(pickerChord.id);
                } else if (event.key === "Tab") {
                  event.preventDefault();
                  pickNext(pickerChord.id, event.shiftKey ? -1 : 1);
                }
              }}
            />
            <FlexRow justify="space-between" align="center">
              <Text size="smaller" color="secondary">{t("i18n-next77.harmony.chordRows.tabHint")}</Text>
              <EditorButton density="compact" onClick={() => previewChord(pickerChord)} data-testid="chord-preview">
                {t("i18n-next77.harmony.chordRows.preview")}
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        )}
      </Popover>

      <Popover
        open={transposeAt !== null}
        anchorEl={transposeAt}
        onClose={() => setTransposeAt(null)}
        placement="bottom-left"
      >
        <FlexColumn gap={2} sx={{ padding: getSpacingPx(SPACING.md), minWidth: 200 }} data-testid="chord-transpose">
          <TextInput
            size="small"
            compact
            type="number"
            label={t("i18n-next77.harmony.chordRows.semitones")}
            value={semitones}
            onChange={(event) => setSemitones(event.target.value)}
          />
          <EditorButton
            density="compact"
            variant="contained"
            disabled={!Number.isInteger(Number(semitones)) || Number(semitones) === 0}
            onClick={() => {
              setTransposeAt(null);
              void runOp("transpose_chords", { semitones: Number(semitones) });
            }}
          >
            {t("i18n-next77.harmony.chordRows.transposeApply")}
          </EditorButton>
        </FlexColumn>
      </Popover>

      <Popover open={browsing !== null} anchorEl={browsing} onClose={() => setBrowsing(null)} placement="bottom-left">
        <div className="fablesynth harmony-root" data-testid="chord-row-progressions">
          <ProgressionBrowser
            chordKey={browserKey}
            setKey={setBrowserKey}
            current={-1}
            load={applyProgression}
            onClose={() => setBrowsing(null)}
            target={t("i18n-next77.harmony.chordRows.target")}
          />
        </div>
      </Popover>
    </FlexColumn>
  );
};
