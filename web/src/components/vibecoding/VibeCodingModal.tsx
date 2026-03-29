/** @jsxImportSource @emotion/react */
import React from "react";
import { Dialog, DialogContent } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import VibeCodingPanel from "./VibeCodingPanel";

interface VibeCodingModalProps {
  open: boolean;
  workflow: Workflow | null;
  onClose: () => void;
}

const VibeCodingModal: React.FC<VibeCodingModalProps> = ({
  open,
  workflow,
  onClose
}) => {
  if (!workflow) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: "90vw",
          height: "85vh",
          maxWidth: "1600px"
        }
      }}
    >
      <DialogContent sx={{ p: 0, display: "flex", flexDirection: "column" }}>
        <VibeCodingPanel workflow={workflow} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
};

export default VibeCodingModal;
