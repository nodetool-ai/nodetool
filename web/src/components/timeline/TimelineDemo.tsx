/** @jsxImportSource @emotion/react */
import React, { useEffect } from "react";
import { Box, Button, Typography, Stack } from "@mui/material";
import { ThemeProvider, CssBaseline, createTheme } from "@mui/material";
import TimelineEditor from "./TimelineEditor";
import useTimelineStore from "../../stores/TimelineStore";

// Create a dark theme for the demo
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#90caf9"
    },
    background: {
      default: "#121212",
      paper: "#1e1e1e"
    }
  }
});

/**
 * Demo page for the Timeline Editor component.
 * This can be used for standalone testing without the full app context.
 */
const TimelineDemo: React.FC = () => {
  const { createProject, addTrack, addClip, project, reset } = useTimelineStore();

  // Initialize with sample data
  useEffect(() => {
    if (!project) {
      createProject("Demo Timeline", 30);
    }
  }, [project, createProject]);

  const handleAddSampleClips = () => {
    // Add video track with clips
    const videoTrackId = addTrack("video", "Video 1");
    if (videoTrackId) {
      addClip(videoTrackId, {
        type: "video",
        sourceRef: null,
        sourceUrl: "",
        name: "Intro Video",
        startTime: 0,
        duration: 5,
        inPoint: 0,
        outPoint: 5,
        sourceDuration: 10,
        speed: 1,
        opacity: 1
      });
      addClip(videoTrackId, {
        type: "video",
        sourceRef: null,
        sourceUrl: "",
        name: "Main Content",
        startTime: 6,
        duration: 8,
        inPoint: 0,
        outPoint: 8,
        sourceDuration: 15,
        speed: 1,
        opacity: 1
      });
      addClip(videoTrackId, {
        type: "video",
        sourceRef: null,
        sourceUrl: "",
        name: "Outro",
        startTime: 15,
        duration: 4,
        inPoint: 0,
        outPoint: 4,
        sourceDuration: 8,
        speed: 1,
        opacity: 1
      });
    }

    // Add audio track with clips
    const audioTrackId = addTrack("audio", "Background Music");
    if (audioTrackId) {
      addClip(audioTrackId, {
        type: "audio",
        sourceRef: null,
        sourceUrl: "",
        name: "Background Track",
        startTime: 0,
        duration: 20,
        inPoint: 0,
        outPoint: 20,
        sourceDuration: 30,
        speed: 1,
        volume: 0.8
      });
    }

    // Add another audio track for voiceover
    const voTrackId = addTrack("audio", "Voiceover");
    if (voTrackId) {
      addClip(voTrackId, {
        type: "audio",
        sourceRef: null,
        sourceUrl: "",
        name: "Intro VO",
        startTime: 1,
        duration: 3,
        inPoint: 0,
        outPoint: 3,
        sourceDuration: 5,
        speed: 1,
        volume: 1
      });
      addClip(voTrackId, {
        type: "audio",
        sourceRef: null,
        sourceUrl: "",
        name: "Main VO",
        startTime: 7,
        duration: 6,
        inPoint: 0,
        outPoint: 6,
        sourceDuration: 10,
        speed: 1,
        volume: 1
      });
    }

    // Add image track
    const imageTrackId = addTrack("image", "Overlays");
    if (imageTrackId) {
      addClip(imageTrackId, {
        type: "image",
        sourceRef: null,
        sourceUrl: "",
        name: "Logo",
        startTime: 0,
        duration: 3,
        inPoint: 0,
        outPoint: 3,
        sourceDuration: 3,
        speed: 1,
        opacity: 0.9
      });
      addClip(imageTrackId, {
        type: "image",
        sourceRef: null,
        sourceUrl: "",
        name: "Lower Third",
        startTime: 8,
        duration: 4,
        inPoint: 0,
        outPoint: 4,
        sourceDuration: 4,
        speed: 1,
        opacity: 1
      });
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default"
        }}
      >
        {/* Demo Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper"
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h5" component="h1">
              Timeline Editor Demo
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={handleAddSampleClips}
            >
              Add Sample Clips
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={reset}
            >
              Reset Timeline
            </Button>
          </Stack>
        </Box>

        {/* Timeline Editor */}
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          <TimelineEditor showPreview={true} />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default TimelineDemo;
