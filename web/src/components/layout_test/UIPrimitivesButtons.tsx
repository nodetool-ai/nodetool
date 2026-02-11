/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback } from "react";
import { Box, Typography, Paper, Stack, Dialog, DialogTitle, DialogContent, Button } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import GridViewIcon from "@mui/icons-material/GridView";
import ListIcon from "@mui/icons-material/List";

import {
  DialogActionButtons,
  ToolbarIconButton,
  PlaybackButton,
  ExpandCollapseButton,
  ViewModeToggle,
  RefreshButton,
  SelectionControls,
  CreateFab,
  RunWorkflowButton
} from "../ui_primitives";

const styles = css`
  padding: 24px;
  
  .section {
    margin-bottom: 32px;
  }
  
  .section-title {
    margin-bottom: 16px;
    font-weight: 600;
  }
  
  .demo-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  
  .demo-label {
    min-width: 120px;
    color: #888;
    font-size: 14px;
  }
`;

const UIPrimitivesButtonsDemo = () => {
  // State for interactive demos
  const [playbackState, setPlaybackState] = useState<"stopped" | "playing" | "paused">("stopped");
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [selectedCount, setSelectedCount] = useState(3);
  const [isRunning, setIsRunning] = useState(false);
  const [_isLoading, _setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDestructiveDialog, setShowDestructiveDialog] = useState(false);

  // Memoized handlers to prevent unnecessary re-renders
  const handleOpenDialog = useCallback(() => setShowDialog(true), []);
  const handleOpenDestructiveDialog = useCallback(() => setShowDestructiveDialog(true), []);
  const handleCloseDialog = useCallback(() => setShowDialog(false), []);
  const handleCloseDestructiveDialog = useCallback(() => setShowDestructiveDialog(false), []);
  const handleEmptyClick = useCallback(() => {}, []);

  const handleSetPlaybackPlaying = useCallback(() => setPlaybackState("playing"), []);
  const handleSetPlaybackPaused = useCallback(() => setPlaybackState("paused"), []);
  const handleSetPlaybackStopped = useCallback(() => setPlaybackState("stopped"), []);

  const handleToggleExpanded = useCallback(() => setExpanded(prev => !prev), []);

  const handleSelectAll = useCallback(() => setSelectedCount(10), []);
  const handleClearSelection = useCallback(() => setSelectedCount(0), []);

  const handleSetRunning = useCallback(() => setIsRunning(true), []);
  const handleSetStopped = useCallback(() => setIsRunning(false), []);

  return (
    <Box css={styles}>
      <Typography variant="h4" gutterBottom>UI Primitives - Button Components</Typography>

      {/* DialogActionButtons Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">DialogActionButtons</Typography>
        <Stack direction="row" spacing={2} mb={2}>
          <Button variant="contained" onClick={handleOpenDialog}>Open Standard Dialog</Button>
          <Button variant="contained" onClick={handleOpenDestructiveDialog}>Open Destructive Dialog</Button>
        </Stack>

        <Dialog open={showDialog} onClose={handleCloseDialog}>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogContent>Are you sure you want to proceed?</DialogContent>
          <DialogActionButtons
            onConfirm={handleCloseDialog}
            onCancel={handleCloseDialog}
            confirmText="Confirm"
            cancelText="Cancel"
          />
        </Dialog>

        <Dialog open={showDestructiveDialog} onClose={handleCloseDestructiveDialog}>
          <DialogTitle>Delete Item?</DialogTitle>
          <DialogContent>This action cannot be undone.</DialogContent>
          <DialogActionButtons
            onConfirm={handleCloseDestructiveDialog}
            onCancel={handleCloseDestructiveDialog}
            confirmText="Delete"
            cancelText="Cancel"
            destructive
          />
        </Dialog>
      </Paper>

      {/* ToolbarIconButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">ToolbarIconButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Default:</span>
          <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" onClick={handleEmptyClick} />
          <ToolbarIconButton icon={<RefreshIcon />} tooltip="Refresh" onClick={handleEmptyClick} />
          <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" onClick={handleEmptyClick} />
        </div>
        <div className="demo-row">
          <span className="demo-label">Primary:</span>
          <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" variant="primary" onClick={handleEmptyClick} />
        </div>
        <div className="demo-row">
          <span className="demo-label">Error:</span>
          <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" variant="error" onClick={handleEmptyClick} />
        </div>
        <div className="demo-row">
          <span className="demo-label">Active:</span>
          <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" active onClick={handleEmptyClick} />
        </div>
      </Paper>

      {/* PlaybackButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">PlaybackButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Toggle mode:</span>
          <PlaybackButton
            state={playbackState}
            onPlay={handleSetPlaybackPlaying}
            onPause={handleSetPlaybackPaused}
          />
          <Typography variant="body2">State: {playbackState}</Typography>
        </div>
        <div className="demo-row">
          <span className="demo-label">Stop button:</span>
          <PlaybackButton
            state={playbackState}
            playbackAction="stop"
            onStop={handleSetPlaybackStopped}
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">Sizes:</span>
          <PlaybackButton state="stopped" buttonSize="small" onPlay={handleEmptyClick} />
          <PlaybackButton state="stopped" buttonSize="medium" onPlay={handleEmptyClick} />
          <PlaybackButton state="stopped" buttonSize="large" onPlay={handleEmptyClick} />
        </div>
      </Paper>

      {/* ExpandCollapseButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">ExpandCollapseButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Rotate variant:</span>
          <ExpandCollapseButton
            expanded={expanded}
            onClick={handleToggleExpanded}
          />
          <Typography variant="body2">Expanded: {expanded ? "Yes" : "No"}</Typography>
        </div>
        <div className="demo-row">
          <span className="demo-label">Chevron variant:</span>
          <ExpandCollapseButton
            expanded={expanded}
            iconVariant="chevron"
            onClick={handleToggleExpanded}
          />
        </div>
      </Paper>

      {/* ViewModeToggle Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">ViewModeToggle</Typography>
        <div className="demo-row">
          <span className="demo-label">Grid/List:</span>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
              { value: "list", icon: <ListIcon />, tooltip: "List view" }
            ]}
          />
          <Typography variant="body2">Current: {viewMode}</Typography>
        </div>
      </Paper>

      {/* RefreshButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">RefreshButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Refresh:</span>
          <RefreshButton onClick={handleEmptyClick} tooltip="Refresh data" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Reset:</span>
          <RefreshButton onClick={handleEmptyClick} tooltip="Reset" iconVariant="reset" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Loading:</span>
          <RefreshButton onClick={handleEmptyClick} isLoading />
        </div>
        <div className="demo-row">
          <span className="demo-label">Sizes:</span>
          <RefreshButton onClick={handleEmptyClick} buttonSize="small" />
          <RefreshButton onClick={handleEmptyClick} buttonSize="medium" />
          <RefreshButton onClick={handleEmptyClick} buttonSize="large" />
        </div>
      </Paper>

      {/* SelectionControls Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">SelectionControls</Typography>
        <div className="demo-row">
          <span className="demo-label">Buttons variant:</span>
          <SelectionControls
            selectedCount={selectedCount}
            totalCount={10}
            onSelectAll={handleSelectAll}
            onClear={handleClearSelection}
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">Toggle variant:</span>
          <SelectionControls
            selectedCount={selectedCount}
            totalCount={10}
            onSelectAll={handleSelectAll}
            onClear={handleClearSelection}
            variant="toggle"
          />
        </div>
      </Paper>

      {/* CreateFab Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">CreateFab</Typography>
        <div className="demo-row">
          <span className="demo-label">Icon only:</span>
          <CreateFab onClick={handleEmptyClick} tooltip="Create new" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Extended:</span>
          <CreateFab onClick={handleEmptyClick} label="New Workflow" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Secondary:</span>
          <CreateFab onClick={handleEmptyClick} label="Add Item" fabColor="secondary" />
        </div>
      </Paper>

      {/* RunWorkflowButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">RunWorkflowButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Button variant:</span>
          <RunWorkflowButton
            isRunning={isRunning}
            onRun={handleSetRunning}
            onStop={handleSetStopped}
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">With label:</span>
          <RunWorkflowButton
            isRunning={isRunning}
            onRun={handleSetRunning}
            onStop={handleSetStopped}
            showLabel
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">FAB variant:</span>
          <RunWorkflowButton
            isRunning={isRunning}
            onRun={handleSetRunning}
            onStop={handleSetStopped}
            variant="fab"
          />
        </div>
      </Paper>
    </Box>
  );
};

export default UIPrimitivesButtonsDemo;
