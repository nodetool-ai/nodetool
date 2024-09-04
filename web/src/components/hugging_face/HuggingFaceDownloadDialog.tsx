import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box
} from "@mui/material";
import { useHuggingFaceStore } from "../../stores/HuggingFaceStore";
import { DownloadProgress } from "./DownloadProgress";

const HuggingFaceDownloadDialog: React.FC = () => {
  const { isDialogOpen, closeDialog, downloads } = useHuggingFaceStore();

  return (
    <Dialog open={isDialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
      <DialogTitle>Download HuggingFace Models</DialogTitle>
      <DialogContent>
        <Box mt={2}>
          {Object.keys(downloads).map((name) => (
            <DownloadProgress key={name} name={name} />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HuggingFaceDownloadDialog;
