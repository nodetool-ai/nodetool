/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState } from "react";
import { Box, Typography, Paper, Divider, Stack, Dialog, DialogTitle, DialogContent } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
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
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDestructiveDialog, setShowDestructiveDialog] = useState(false);

  return (
    <Box css={styles}>
      <Typography variant="h4" gutterBottom>UI Primitives - Button Components</Typography>
      
      {/* DialogActionButtons Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">DialogActionButtons</Typography>
        <Stack direction="row" spacing={2} mb={2}>
          <button onClick={() => setShowDialog(true)}>Open Standard Dialog</button>
          <button onClick={() => setShowDestructiveDialog(true)}>Open Destructive Dialog</button>
        </Stack>
        
        <Dialog open={showDialog} onClose={() => setShowDialog(false)}>
          <DialogTitle>Confirm Action</DialogTitle>
          <DialogContent>Are you sure you want to proceed?</DialogContent>
          <DialogActionButtons
            onConfirm={() => setShowDialog(false)}
            onCancel={() => setShowDialog(false)}
            confirmText="Confirm"
            cancelText="Cancel"
          />
        </Dialog>
        
        <Dialog open={showDestructiveDialog} onClose={() => setShowDestructiveDialog(false)}>
          <DialogTitle>Delete Item?</DialogTitle>
          <DialogContent>This action cannot be undone.</DialogContent>
          <DialogActionButtons
            onConfirm={() => setShowDestructiveDialog(false)}
            onCancel={() => setShowDestructiveDialog(false)}
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
          <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" onClick={() => {}} />
          <ToolbarIconButton icon={<RefreshIcon />} tooltip="Refresh" onClick={() => {}} />
          <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" onClick={() => {}} />
        </div>
        <div className="demo-row">
          <span className="demo-label">Primary:</span>
          <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" variant="primary" onClick={() => {}} />
        </div>
        <div className="demo-row">
          <span className="demo-label">Error:</span>
          <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" variant="error" onClick={() => {}} />
        </div>
        <div className="demo-row">
          <span className="demo-label">Active:</span>
          <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" active onClick={() => {}} />
        </div>
      </Paper>
      
      {/* PlaybackButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">PlaybackButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Toggle mode:</span>
          <PlaybackButton
            state={playbackState}
            onPlay={() => setPlaybackState("playing")}
            onPause={() => setPlaybackState("paused")}
          />
          <Typography variant="body2">State: {playbackState}</Typography>
        </div>
        <div className="demo-row">
          <span className="demo-label">Stop button:</span>
          <PlaybackButton
            state={playbackState}
            playbackAction="stop"
            onStop={() => setPlaybackState("stopped")}
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">Sizes:</span>
          <PlaybackButton state="stopped" buttonSize="small" onPlay={() => {}} />
          <PlaybackButton state="stopped" buttonSize="medium" onPlay={() => {}} />
          <PlaybackButton state="stopped" buttonSize="large" onPlay={() => {}} />
        </div>
      </Paper>
      
      {/* ExpandCollapseButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">ExpandCollapseButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Rotate variant:</span>
          <ExpandCollapseButton
            expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          />
          <Typography variant="body2">Expanded: {expanded ? "Yes" : "No"}</Typography>
        </div>
        <div className="demo-row">
          <span className="demo-label">Chevron variant:</span>
          <ExpandCollapseButton
            expanded={expanded}
            iconVariant="chevron"
            onClick={() => setExpanded(!expanded)}
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
          <RefreshButton onClick={() => {}} tooltip="Refresh data" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Reset:</span>
          <RefreshButton onClick={() => {}} tooltip="Reset" iconVariant="reset" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Loading:</span>
          <RefreshButton onClick={() => {}} isLoading />
        </div>
        <div className="demo-row">
          <span className="demo-label">Sizes:</span>
          <RefreshButton onClick={() => {}} buttonSize="small" />
          <RefreshButton onClick={() => {}} buttonSize="medium" />
          <RefreshButton onClick={() => {}} buttonSize="large" />
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
            onSelectAll={() => setSelectedCount(10)}
            onClear={() => setSelectedCount(0)}
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">Toggle variant:</span>
          <SelectionControls
            selectedCount={selectedCount}
            totalCount={10}
            onSelectAll={() => setSelectedCount(10)}
            onClear={() => setSelectedCount(0)}
            variant="toggle"
          />
        </div>
      </Paper>
      
      {/* CreateFab Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">CreateFab</Typography>
        <div className="demo-row">
          <span className="demo-label">Icon only:</span>
          <CreateFab onClick={() => {}} tooltip="Create new" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Extended:</span>
          <CreateFab onClick={() => {}} label="New Workflow" />
        </div>
        <div className="demo-row">
          <span className="demo-label">Secondary:</span>
          <CreateFab onClick={() => {}} label="Add Item" fabColor="secondary" />
        </div>
      </Paper>
      
      {/* RunWorkflowButton Demo */}
      <Paper className="section" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" className="section-title">RunWorkflowButton</Typography>
        <div className="demo-row">
          <span className="demo-label">Button variant:</span>
          <RunWorkflowButton
            isRunning={isRunning}
            onRun={() => setIsRunning(true)}
            onStop={() => setIsRunning(false)}
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">With label:</span>
          <RunWorkflowButton
            isRunning={isRunning}
            onRun={() => setIsRunning(true)}
            onStop={() => setIsRunning(false)}
            showLabel
          />
        </div>
        <div className="demo-row">
          <span className="demo-label">FAB variant:</span>
          <RunWorkflowButton
            isRunning={isRunning}
            onRun={() => setIsRunning(true)}
            onStop={() => setIsRunning(false)}
            variant="fab"
          />
        </div>
      </Paper>
    </Box>
  );
};

export default UIPrimitivesButtonsDemo;
