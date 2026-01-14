import { useCallback } from "react";
import { useNotesActions } from "../stores/NotesStore";

export const useNotes = ({ _active }: { _active: boolean }) => {
  const { addNote } = useNotesActions();

  const addNoteAtCenter = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    const centerX = -viewport.x / viewport.zoom + 400;
    const centerY = -viewport.y / viewport.zoom + 300;
    addNote("New note", { x: centerX, y: centerY });
  }, [addNote]);

  return {
    addNote,
    addNoteAtCenter,
  };
};
