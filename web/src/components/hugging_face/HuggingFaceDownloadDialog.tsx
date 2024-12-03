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
    <Dialog
      open={isDialogOpen}
      onClose={closeDialog}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          style: {
            backgroundColor: "rgba(0, 0, 0, 0.9)" // Darker backdrop
          }
        }
      }}
      PaperProps={{
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          color: "white"
        }
      }}
    >
      <DialogTitle sx={{ color: "inherit" }}>Download Progress</DialogTitle>
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
          paddingRight: "1.5em",
          color: "inherit" // Ensure text color is inherited
        }}
      >
        <Typography
          variant="body1"
          sx={{
            padding: "0 1.5em .5em",
            fontWeight: "200",
            color: "inherit" // Ensure text color is inherited
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
