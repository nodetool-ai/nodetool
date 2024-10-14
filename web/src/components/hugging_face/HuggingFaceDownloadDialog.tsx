import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography
} from "@mui/material";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { DownloadProgress } from "./DownloadProgress";
import ThemeNodetool from "../themes/ThemeNodetool";

const HuggingFaceDownloadDialog: React.FC = () => {
  const { isDialogOpen, closeDialog, downloads } = useModelDownloadStore();

  return (
    <Dialog open={isDialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Download Progress</DialogTitle>
      <DialogContent>
        <Box mt={2}>
          {Object.keys(downloads).map((name) => (
            <DownloadProgress key={name} name={name} />
          ))}
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingRight: "1.5em"
        }}
      >
        <Typography
          variant="body1"
          style={{
            padding: "0 1.5em .5em",
            fontWeight: "200"
          }}
        >
          <AnnouncementIcon
            fontSize="small"
            sx={{
              verticalAlign: "middle",
              marginRight: "0.5em",

              color: ThemeNodetool.palette.c_warning
            }}
          />
          Downloads will continue in the background after closing this dialog.
        </Typography>
        <Button onClick={closeDialog} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HuggingFaceDownloadDialog;
