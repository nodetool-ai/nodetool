import React, { memo } from "react";
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
import { isEqual } from "lodash";

const HuggingFaceDownloadDialog: React.FC = () => {
  const { isDialogOpen, closeDialog, downloads } = useModelDownloadStore();

  const hasActiveDownloads = Object.keys(downloads).length > 0;

  const infoMessage = hasActiveDownloads
    ? "You can close this dialog and return later - downloads will continue in the background. Access downloads anytime via the Download icon in the toolbar."
    : "No active downloads. Start a download by selecting a model from the Recommended Models Dialog.";

  const cacheInfo =
    "Models are cached in ~/.cache/huggingface. Ollama models are stored in ~/.ollama.";

  return (
    <Dialog
      className="download-dialog"
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
      <DialogTitle sx={{ color: "inherit" }}>
        {hasActiveDownloads ? "Download Progress" : "Model Downloads"}
      </DialogTitle>
      <DialogContent>
        <Box
          mt={2}
          sx={{
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            paddingTop: 2
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: "rgba(255, 255, 255, 0.7)",
              display: "flex",
              alignItems: "center",
              gap: "0.5em"
            }}
          >
            <AnnouncementIcon
              fontSize="small"
              sx={{ color: ThemeNodetool.palette.c_info }}
            />
            {cacheInfo}
          </Typography>
        </Box>
        <Box mt={2}>
          {Object.keys(downloads).length > 0 ? (
            Object.keys(downloads).map((name) => (
              <DownloadProgress key={name} name={name} />
            ))
          ) : (
            <Typography
              variant="body1"
              sx={{ textAlign: "center", padding: "2em 0" }}
            >
              No active downloads
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingRight: "1.5em",
          color: "inherit"
        }}
      >
        <Typography
          variant="body1"
          sx={{
            padding: "0 1.5em .5em 1em",
            fontWeight: "200",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: "0.5em"
          }}
        >
          <AnnouncementIcon
            fontSize="small"
            sx={{ color: ThemeNodetool.palette.c_warning }}
          />
          {infoMessage}
        </Typography>
        <Button onClick={closeDialog} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default memo(HuggingFaceDownloadDialog, isEqual);
