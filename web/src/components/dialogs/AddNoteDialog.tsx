/** @jsxImportSource @emotion/react */
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useNotesActions } from "../../stores/NotesStore";

interface AddNoteDialogProps {
  open: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

const noteColors = [
  "#fef3c7", // yellow
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fce7f3", // pink
  "#f3e8ff", // purple
  "#ffedd5", // orange
];

const AddNoteDialog: React.FC<AddNoteDialogProps> = ({
  open,
  onClose,
  initialPosition,
}) => {
  const theme = useTheme();
  const [content, setContent] = useState("");
  const [selectedColor, setSelectedColor] = useState(noteColors[0]);

  const { addNote } = useNotesActions();

  const handleAddNote = useCallback(() => {
    if (content.trim()) {
      addNote(content.trim(), initialPosition || { x: 100, y: 100 }, selectedColor);
      setContent("");
      setSelectedColor(noteColors[0]);
      onClose();
    }
  }, [content, selectedColor, initialPosition, addNote, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleAddNote();
      } else if (event.key === "Escape") {
        onClose();
      }
    },
    [handleAddNote, onClose]
  );

  const handleClose = useCallback(() => {
    setContent("");
    setSelectedColor(noteColors[0]);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Note</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            variant="outlined"
            label="Note content"
            placeholder="Enter your note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            sx={{ mb: 2 }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Color
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            {noteColors.map((color) => (
              <Box
                key={color}
                onClick={() => setSelectedColor(color)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  backgroundColor: color,
                  cursor: "pointer",
                  border:
                    selectedColor === color
                      ? `2px solid ${theme.vars.palette.primary.main}`
                      : "2px solid transparent",
                  boxShadow:
                    selectedColor === color
                      ? `0 0 0 2px ${theme.vars.palette.background.paper}`
                      : "none",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    transform: "scale(1.1)",
                  },
                }}
              />
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleAddNote}
          variant="contained"
          disabled={!content.trim()}
        >
          Add Note
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddNoteDialog;
