/**
 * Timeline Inspector Panel
 * Side panel for editing clip properties:
 * - Name, Color
 * - Speed/Rate (with pitch lock option for audio)
 * - Volume (audio), Opacity (video/image)
 * - Fade In/Out duration
 * - In/Out points (numerical editing)
 */
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  Slider,
  Divider,
  InputAdornment
} from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import { IDockviewPanelProps } from "dockview";
import useTimelineStore, { Clip } from "../../../stores/TimelineStore";
import { TimelinePanelProps } from "../timelinePanelConfig";
import { formatTimeShort } from "../../../utils/timelineUtils";

const styles = (theme: Theme) =>
  css({
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,
    paddingTop: "1.75rem",

    ".inspector-header": {
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`
    },

    ".inspector-content": {
      flex: 1,
      overflowY: "auto",
      padding: theme.spacing(2)
    },

    ".inspector-section": {
      marginBottom: theme.spacing(2.5)
    },

    ".inspector-section-title": {
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      marginBottom: theme.spacing(1)
    },

    ".inspector-row": {
      display: "flex",
      alignItems: "center",
      marginBottom: theme.spacing(1.5),
      gap: theme.spacing(1)
    },

    ".inspector-label": {
      width: "80px",
      fontSize: "0.8rem",
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary
    },

    ".inspector-value": {
      flex: 1
    },

    ".inspector-empty": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      textAlign: "center",
      padding: theme.spacing(2)
    },

    ".color-swatch": {
      width: 24,
      height: 24,
      borderRadius: 4,
      cursor: "pointer",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      "&:hover": {
        borderColor: "rgba(255, 255, 255, 0.5)"
      }
    },

    ".color-options": {
      display: "flex",
      gap: theme.spacing(0.5),
      flexWrap: "wrap"
    }
  });

// Predefined clip colors
const CLIP_COLORS = [
  "#3a7bc8",
  "#4ca84c",
  "#c96b3a",
  "#8a4cd9",
  "#d9534f",
  "#3ab5a8",
  "#d9a23a",
  "#d94c9b"
];

const TimelineInspectorPanel: React.FC<
  IDockviewPanelProps<TimelinePanelProps>
> = () => {
  const theme = useTheme();

  const { project, selection, getClipById, updateClip } = useTimelineStore();

  // Get the selected clip(s)
  const selectedClipData = useMemo(() => {
    if (!project || selection.selectedClipIds.length === 0) {
      return null;
    }

    // For now, just show the first selected clip
    const firstClipId = selection.selectedClipIds[0];
    return getClipById(firstClipId);
  }, [project, selection.selectedClipIds, getClipById]);

  const clip = selectedClipData?.clip;
  const track = selectedClipData?.track;

  // Update handlers
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!clip || !track) return;
      updateClip(track.id, clip.id, { name: e.target.value });
    },
    [clip, track, updateClip]
  );

  const handleSpeedChange = useCallback(
    (_e: Event, value: number | number[]) => {
      if (!clip || !track) return;
      updateClip(track.id, clip.id, { speed: value as number });
    },
    [clip, track, updateClip]
  );

  const handleVolumeChange = useCallback(
    (_e: Event, value: number | number[]) => {
      if (!clip || !track) return;
      updateClip(track.id, clip.id, { volume: value as number });
    },
    [clip, track, updateClip]
  );

  const handleOpacityChange = useCallback(
    (_e: Event, value: number | number[]) => {
      if (!clip || !track) return;
      updateClip(track.id, clip.id, { opacity: value as number });
    },
    [clip, track, updateClip]
  );

  const handleFadeInChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!clip || !track) return;
      const value = parseFloat(e.target.value) || 0;
      updateClip(track.id, clip.id, { fadeIn: Math.max(0, value) });
    },
    [clip, track, updateClip]
  );

  const handleFadeOutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!clip || !track) return;
      const value = parseFloat(e.target.value) || 0;
      updateClip(track.id, clip.id, { fadeOut: Math.max(0, value) });
    },
    [clip, track, updateClip]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!clip || !track) return;
      updateClip(track.id, clip.id, { color });
    },
    [clip, track, updateClip]
  );

  const handleInPointChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!clip || !track) return;
      const value = parseFloat(e.target.value) || 0;
      const clampedValue = Math.max(0, Math.min(value, clip.outPoint - 0.1));
      const durationChange = clampedValue - clip.inPoint;

      updateClip(track.id, clip.id, {
        inPoint: clampedValue,
        startTime: clip.startTime + durationChange,
        duration: clip.duration - durationChange
      });
    },
    [clip, track, updateClip]
  );

  const handleOutPointChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!clip || !track) return;
      const value = parseFloat(e.target.value) || 0;
      const clampedValue = Math.max(clip.inPoint + 0.1, Math.min(value, clip.sourceDuration));

      updateClip(track.id, clip.id, {
        outPoint: clampedValue,
        duration: clampedValue - clip.inPoint
      });
    },
    [clip, track, updateClip]
  );

  if (!clip || !track) {
    return (
      <Box css={styles(theme)}>
        <div className="inspector-empty">
          <Typography variant="body2">No clip selected</Typography>
          <Typography variant="caption" sx={{ mt: 1 }}>
            Select a clip to view and edit its properties
          </Typography>
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)} className="timeline-inspector-panel">
      {/* Header */}
      <div className="inspector-header">
        <Typography variant="subtitle2">{clip.name}</Typography>
        <Typography variant="caption" color="textSecondary">
          {clip.type.charAt(0).toUpperCase() + clip.type.slice(1)} Clip •{" "}
          {formatTimeShort(clip.duration)}
        </Typography>
      </div>

      {/* Content */}
      <div className="inspector-content">
        {/* Basic Properties */}
        <div className="inspector-section">
          <Typography className="inspector-section-title">
            Properties
          </Typography>

          <div className="inspector-row">
            <Typography className="inspector-label">Name</Typography>
            <TextField
              className="inspector-value"
              size="small"
              value={clip.name}
              onChange={handleNameChange}
              disabled={clip.locked}
            />
          </div>

          <div className="inspector-row">
            <Typography className="inspector-label">Color</Typography>
            <div className="color-options">
              {CLIP_COLORS.map((color) => (
                <div
                  key={color}
                  className="color-swatch"
                  style={{
                    backgroundColor: color,
                    outline:
                      clip.color === color ? "2px solid white" : "none",
                    outlineOffset: 2
                  }}
                  onClick={() => handleColorChange(color)}
                />
              ))}
            </div>
          </div>
        </div>

        <Divider sx={{ my: 2 }} />

        {/* Timing */}
        <div className="inspector-section">
          <Typography className="inspector-section-title">Timing</Typography>

          <div className="inspector-row">
            <Typography className="inspector-label">Start</Typography>
            <Typography variant="body2">
              {formatTimeShort(clip.startTime)}
            </Typography>
          </div>

          <div className="inspector-row">
            <Typography className="inspector-label">Duration</Typography>
            <Typography variant="body2">
              {formatTimeShort(clip.duration)}
            </Typography>
          </div>

          <div className="inspector-row">
            <Typography className="inspector-label">In Point</Typography>
            <TextField
              className="inspector-value"
              size="small"
              type="number"
              value={clip.inPoint.toFixed(2)}
              onChange={handleInPointChange}
              disabled={clip.locked}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">s</InputAdornment>
                )
              }}
              inputProps={{ step: 0.1, min: 0, max: clip.outPoint - 0.1 }}
            />
          </div>

          <div className="inspector-row">
            <Typography className="inspector-label">Out Point</Typography>
            <TextField
              className="inspector-value"
              size="small"
              type="number"
              value={clip.outPoint.toFixed(2)}
              onChange={handleOutPointChange}
              disabled={clip.locked}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">s</InputAdornment>
                )
              }}
              inputProps={{
                step: 0.1,
                min: clip.inPoint + 0.1,
                max: clip.sourceDuration
              }}
            />
          </div>
        </div>

        <Divider sx={{ my: 2 }} />

        {/* Speed */}
        <div className="inspector-section">
          <Typography className="inspector-section-title">Speed</Typography>

          <div className="inspector-row">
            <Typography className="inspector-label">Rate</Typography>
            <div className="inspector-value">
              <Slider
                value={clip.speed}
                onChange={handleSpeedChange}
                min={0.25}
                max={4}
                step={0.25}
                marks={[
                  { value: 0.5, label: "0.5x" },
                  { value: 1, label: "1x" },
                  { value: 2, label: "2x" }
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}x`}
                disabled={clip.locked}
              />
            </div>
          </div>
        </div>

        <Divider sx={{ my: 2 }} />

        {/* Audio/Visual Properties */}
        {clip.type === "audio" && (
          <div className="inspector-section">
            <Typography className="inspector-section-title">Audio</Typography>

            <div className="inspector-row">
              <Typography className="inspector-label">Volume</Typography>
              <div className="inspector-value">
                <Slider
                  value={clip.volume ?? 1}
                  onChange={handleVolumeChange}
                  min={0}
                  max={2}
                  step={0.1}
                  marks={[
                    { value: 0, label: "0%" },
                    { value: 1, label: "100%" },
                    { value: 2, label: "200%" }
                  ]}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  disabled={clip.locked}
                />
              </div>
            </div>
          </div>
        )}

        {(clip.type === "video" || clip.type === "image") && (
          <div className="inspector-section">
            <Typography className="inspector-section-title">Visual</Typography>

            <div className="inspector-row">
              <Typography className="inspector-label">Opacity</Typography>
              <div className="inspector-value">
                <Slider
                  value={clip.opacity ?? 1}
                  onChange={handleOpacityChange}
                  min={0}
                  max={1}
                  step={0.05}
                  marks={[
                    { value: 0, label: "0%" },
                    { value: 0.5, label: "50%" },
                    { value: 1, label: "100%" }
                  ]}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  disabled={clip.locked}
                />
              </div>
            </div>
          </div>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Fades */}
        <div className="inspector-section">
          <Typography className="inspector-section-title">Fades</Typography>

          <div className="inspector-row">
            <Typography className="inspector-label">Fade In</Typography>
            <TextField
              className="inspector-value"
              size="small"
              type="number"
              value={clip.fadeIn?.toFixed(2) || "0.00"}
              onChange={handleFadeInChange}
              disabled={clip.locked}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">s</InputAdornment>
                )
              }}
              inputProps={{ step: 0.1, min: 0 }}
            />
          </div>

          <div className="inspector-row">
            <Typography className="inspector-label">Fade Out</Typography>
            <TextField
              className="inspector-value"
              size="small"
              type="number"
              value={clip.fadeOut?.toFixed(2) || "0.00"}
              onChange={handleFadeOutChange}
              disabled={clip.locked}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">s</InputAdornment>
                )
              }}
              inputProps={{ step: 0.1, min: 0 }}
            />
          </div>
        </div>

        {/* Selection info */}
        {selection.selectedClipIds.length > 1 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="textSecondary">
              {selection.selectedClipIds.length} clips selected
            </Typography>
          </>
        )}
      </div>
    </Box>
  );
};

export default TimelineInspectorPanel;
