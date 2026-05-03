/** @jsxImportSource @emotion/react */
import React from "react";
import { Dialog } from "../ui_primitives";
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
      slotProps={{
        paper: {
          sx: {
            width: "90vw",
            height: "85vh",
            maxWidth: "1600px"
          }
        }
      }}
    >
      <VibeCodingPanel workflow={workflow} onClose={onClose} />
    </Dialog>
  );
};

export default VibeCodingModal;
