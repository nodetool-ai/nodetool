/**
 * The piano roll's note functions: quantize, scale quantize, transpose, legato,
 * clipboard and selection commands. Each one reads the clip's notes as the
 * store holds them now and writes once, so each is one undo step.
 */

import { useMemo, useRef } from "react";
import {
  deleteDuplicates,
  forceLegato,
  moveNotes,
  quantizeNotes,
  removeNotes,
  removeOverlaps,
  scaleQuantizeNotes
} from "@nodetool-ai/timeline";
import type { MidiNote, QuantizeDivision } from "@nodetool-ai/timeline";

import type { QuantizeSettings } from "../../../stores/timeline/TimelineUIStore";
import { decodeNoteClipboard, encodeNoteClipboard, pasteNotes } from "./noteClipboard";
import {
  invertSelection,
  selectFollowing,
  selectMuted,
  selectSamePitch,
  toggleMuteSelection,
  type ScaleSnap
} from "./pianoRollTools";

export interface PianoRollFunctionsInput {
  /** The clip's notes as the store holds them now. */
  latestNotes: () => ReadonlyArray<MidiNote>;
  selectedIds: () => ReadonlySet<string>;
  setSelectedIds: (ids: Set<string>) => void;
  /** Write a note list: one undo step. */
  write: (notes: MidiNote[]) => void;
  quantizeSettings: () => QuantizeSettings;
  gridPhaseTick: number;
  scale: () => ScaleSnap | null;
  playheadTick: () => number;
}

export interface PianoRollFunctions {
  quantize: (opts?: { value?: QuantizeDivision; lengths?: boolean; noteIds?: Iterable<string> }) => void;
  scaleQuantize: () => void;
  transpose: (semitones: number) => void;
  forceLegato: () => void;
  removeOverlaps: () => void;
  deleteDuplicates: () => void;
  toggleMute: () => void;
  deleteSelected: () => void;
  copy: () => Promise<void>;
  cut: () => Promise<void>;
  paste: () => Promise<void>;
  selectAll: () => void;
  deselectAll: () => void;
  selectFollowing: () => void;
  selectSamePitch: () => void;
  selectMuted: () => void;
  invertSelection: () => void;
}

export function usePianoRollFunctions(input: PianoRollFunctionsInput): PianoRollFunctions {
  // The callbacks read the newest input at call time, so they stay stable.
  const ref = useRef(input);
  ref.current = input;
  return useMemo((): PianoRollFunctions => {
    const ids = (): string[] => [...ref.current.selectedIds()];
    const selectedNotes = (): MidiNote[] => {
      const sel = ref.current.selectedIds();
      return ref.current.latestNotes().filter((n) => sel.has(n.id));
    };
    const copy = async (): Promise<void> => {
      const selected = selectedNotes();
      if (selected.length === 0) return;
      try {
        await navigator.clipboard.writeText(encodeNoteClipboard(selected));
      } catch {
        // No clipboard permission: the keyboard shortcut still works.
      }
    };
    const deleteSelected = (): void => {
      const list = ids();
      if (list.length === 0) return;
      ref.current.write(removeNotes(ref.current.latestNotes(), list));
      ref.current.setSelectedIds(new Set());
    };
    return {
      quantize: (opts) => {
        const notes = ref.current.latestNotes();
        if (notes.length === 0) return;
        const settings = ref.current.quantizeSettings();
        const selection = ref.current.selectedIds();
        ref.current.write(
          quantizeNotes(notes, {
            division: opts?.value ?? settings.value,
            strength: settings.strengthPct / 100,
            swing: settings.swingPct / 100,
            target: opts?.lengths ? "start_and_length" : "start",
            phaseTick: ref.current.gridPhaseTick,
            ...(opts?.noteIds
              ? { noteIds: new Set(opts.noteIds) }
              : selection.size > 0
                ? { noteIds: selection }
                : {})
          })
        );
      },
      scaleQuantize: () => {
        const scale = ref.current.scale();
        const notes = ref.current.latestNotes();
        if (!scale || notes.length === 0) return;
        const selection = ref.current.selectedIds();
        ref.current.write(
          scaleQuantizeNotes(notes, scale.root, scale.intervals, selection.size > 0 ? selection : undefined)
        );
      },
      transpose: (semitones) => {
        const list = ids();
        if (list.length === 0) return;
        ref.current.write(moveNotes(ref.current.latestNotes(), list, { deltaTick: 0, deltaPitch: semitones }));
      },
      forceLegato: () => {
        const list = ids();
        if (list.length > 0) ref.current.write(forceLegato(ref.current.latestNotes(), list));
      },
      removeOverlaps: () => {
        const list = ids();
        if (list.length > 0) ref.current.write(removeOverlaps(ref.current.latestNotes(), list));
      },
      deleteDuplicates: () => {
        const list = ids();
        if (list.length === 0) return;
        const next = deleteDuplicates(ref.current.latestNotes(), list);
        ref.current.write(next);
        const alive = new Set(next.map((n) => n.id));
        ref.current.setSelectedIds(new Set(list.filter((id) => alive.has(id))));
      },
      toggleMute: () => {
        const sel = ref.current.selectedIds();
        if (sel.size > 0) ref.current.write(toggleMuteSelection(ref.current.latestNotes(), sel));
      },
      deleteSelected,
      copy,
      cut: async () => {
        await copy();
        deleteSelected();
      },
      paste: async () => {
        let text = "";
        try {
          text = await navigator.clipboard.readText();
        } catch {
          return;
        }
        const copied = decodeNoteClipboard(text);
        if (!copied) return;
        const copies = pasteNotes(copied, ref.current.playheadTick());
        ref.current.write([...ref.current.latestNotes(), ...copies]);
        ref.current.setSelectedIds(new Set(copies.map((n) => n.id)));
      },
      selectAll: () => ref.current.setSelectedIds(new Set(ref.current.latestNotes().map((n) => n.id))),
      deselectAll: () => ref.current.setSelectedIds(new Set()),
      selectFollowing: () =>
        ref.current.setSelectedIds(
          selectFollowing(ref.current.latestNotes(), ref.current.selectedIds(), ref.current.playheadTick())
        ),
      selectSamePitch: () =>
        ref.current.setSelectedIds(selectSamePitch(ref.current.latestNotes(), ref.current.selectedIds())),
      selectMuted: () => ref.current.setSelectedIds(selectMuted(ref.current.latestNotes())),
      invertSelection: () =>
        ref.current.setSelectedIds(invertSelection(ref.current.latestNotes(), ref.current.selectedIds()))
    };
  }, []);
}
