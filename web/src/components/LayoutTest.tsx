/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";
import {
  Tabs,
  Tab,
  Box,
  Switch,
  Typography,
  Paper,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  FormControlLabel,
  Chip
} from "@mui/material";
import type { Theme } from "@mui/material/styles";

// Icons for demos
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import SortIcon from "@mui/icons-material/Sort";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

// Import all UI primitives
import {
  DialogActionButtons,
  ToolbarIconButton,
  PlaybackButton,
  ExpandCollapseButton,
  ViewModeToggle,
  RefreshButton,
  SelectionControls,
  CreateFab,
  RunWorkflowButton,
  CopyButton,
  CloseButton,
  DeleteButton,
  DownloadButton,
  UploadButton,
  EditButton,
  SettingsButton,
  NavButton,
  NodeTextField,
  NodeSwitch,
  NodeSlider,
  EditorButton
} from "./ui_primitives";

const styles = (theme: Theme) => css`
  min-height: 100vh;
  background: ${theme.vars.palette.background.default};
  padding: 0;
  
  .layout-header {
    background: linear-gradient(135deg, ${theme.vars.palette.grey[900]} 0%, ${theme.vars.palette.grey[800]} 100%);
    padding: 32px;
    border-bottom: 1px solid ${theme.vars.palette.divider};
  }
  
  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  
  .logo-accent {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, ${theme.vars.palette.primary.main} 0%, ${theme.vars.palette.secondary.main} 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    color: white;
  }
  
  .main-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px;
  }
  
  .tabs-container {
    background: ${theme.vars.palette.background.paper};
    border-radius: 12px;
    margin-bottom: 24px;
    overflow: hidden;
    border: 1px solid ${theme.vars.palette.divider};
  }
  
  .component-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 24px;
  }
  
  .component-card {
    border-radius: 12px;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px solid ${theme.vars.palette.divider};
    background: ${theme.vars.palette.background.paper};
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    }
  }
  
  .card-header {
    background: ${theme.vars.palette.grey[800]};
    padding: 16px 20px;
    border-bottom: 1px solid ${theme.vars.palette.divider};
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .card-title {
    font-weight: 600;
    font-size: 15px;
    color: ${theme.vars.palette.text.primary};
  }
  
  .card-body {
    padding: 20px;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .demo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  
  .demo-label {
    font-size: 12px;
    color: ${theme.vars.palette.text.secondary};
    min-width: 70px;
  }
  
  .demo-value {
    font-size: 12px;
    color: ${theme.vars.palette.primary.main};
    font-family: monospace;
    background: ${theme.vars.palette.grey[800]};
    padding: 2px 8px;
    border-radius: 4px;
  }
`;

// Component categories
const categories = [
  { id: "action", label: "Action Buttons", count: 8 },
  { id: "control", label: "Control Buttons", count: 5 },
  { id: "dialog", label: "Dialog Actions", count: 2 },
  { id: "input", label: "Input Controls", count: 4 },
  { id: "fab", label: "FABs", count: 2 }
] as const;

type CategoryId = typeof categories[number]["id"];

const LayoutTest: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<CategoryId>("action");
  const { mode, setMode } = useColorScheme();
  
  // Demo states
  const [playbackState, setPlaybackState] = useState<"stopped" | "playing" | "paused">("stopped");
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [sortMode, setSortMode] = useState("name");
  const [selectedCount, setSelectedCount] = useState(3);
  const [isRunning, setIsRunning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDestructiveDialog, setShowDestructiveDialog] = useState(false);
  const [textValue, setTextValue] = useState("Sample text");
  const [switchValue, setSwitchValue] = useState(true);
  const [sliderValue, setSliderValue] = useState(50);

  const toggleColorMode = () => {
    setMode(mode === "light" ? "dark" : "light");
  };

  const renderActionButtons = () => (
    <div className="component-grid">
      {/* Copy Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">CopyButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Default:</span>
            <CopyButton value="Copied text" tooltip="Copy to clipboard" />
          </div>
          <div className="demo-row">
            <span className="demo-label">Sizes:</span>
            <CopyButton value="Text" buttonSize="small" />
            <CopyButton value="Text" buttonSize="medium" />
            <CopyButton value="Text" buttonSize="large" />
          </div>
        </div>
      </Paper>

      {/* Close Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">CloseButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Variants:</span>
            <CloseButton onClick={() => {}} tooltip="Close" iconVariant="close" />
            <CloseButton onClick={() => {}} tooltip="Clear" iconVariant="clear" />
          </div>
          <div className="demo-row">
            <span className="demo-label">Sizes:</span>
            <CloseButton onClick={() => {}} buttonSize="small" />
            <CloseButton onClick={() => {}} buttonSize="medium" />
            <CloseButton onClick={() => {}} buttonSize="large" />
          </div>
        </div>
      </Paper>

      {/* Delete Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">DeleteButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Variants:</span>
            <DeleteButton onClick={() => {}} tooltip="Delete" iconVariant="delete" />
            <DeleteButton onClick={() => {}} tooltip="Clear" iconVariant="clear" />
            <DeleteButton onClick={() => {}} tooltip="Remove" iconVariant="outline" />
          </div>
        </div>
      </Paper>

      {/* Download Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">DownloadButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Icon:</span>
            <DownloadButton onClick={() => {}} tooltip="Download" />
            <DownloadButton onClick={() => {}} iconVariant="file" />
          </div>
          <div className="demo-row">
            <span className="demo-label">With label:</span>
            <DownloadButton onClick={() => {}} label="Download" />
          </div>
          <div className="demo-row">
            <span className="demo-label">Loading:</span>
            <DownloadButton onClick={() => {}} isLoading />
          </div>
        </div>
      </Paper>

      {/* Upload Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">UploadButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Variants:</span>
            <UploadButton onFileSelect={() => {}} tooltip="Upload" iconVariant="upload" />
            <UploadButton onFileSelect={() => {}} iconVariant="file" />
            <UploadButton onFileSelect={() => {}} iconVariant="cloud" />
          </div>
          <div className="demo-row">
            <span className="demo-label">With label:</span>
            <UploadButton onFileSelect={() => {}} label="Upload Files" />
          </div>
        </div>
      </Paper>

      {/* Edit Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">EditButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Variants:</span>
            <EditButton onClick={() => {}} tooltip="Edit" iconVariant="edit" />
            <EditButton onClick={() => {}} tooltip="Edit note" iconVariant="note" />
            <EditButton onClick={() => {}} tooltip="Rename" iconVariant="rename" />
          </div>
        </div>
      </Paper>

      {/* Settings Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">SettingsButton</span>
          <Chip label="New" size="small" color="primary" />
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Variants:</span>
            <SettingsButton onClick={() => {}} tooltip="Settings" iconVariant="settings" />
            <SettingsButton onClick={() => {}} tooltip="Tune" iconVariant="tune" />
            <SettingsButton onClick={() => {}} tooltip="More" iconVariant="moreVert" />
            <SettingsButton onClick={() => {}} tooltip="More" iconVariant="moreHoriz" />
          </div>
        </div>
      </Paper>

      {/* Toolbar Icon Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">ToolbarIconButton</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Default:</span>
            <ToolbarIconButton icon={<SaveIcon />} tooltip="Save" onClick={() => {}} />
            <ToolbarIconButton icon={<RefreshIcon />} tooltip="Refresh" onClick={() => {}} />
            <ToolbarIconButton icon={<DeleteIcon />} tooltip="Delete" onClick={() => {}} />
          </div>
          <div className="demo-row">
            <span className="demo-label">Variants:</span>
            <ToolbarIconButton icon={<SaveIcon />} tooltip="Primary" variant="primary" onClick={() => {}} />
            <ToolbarIconButton icon={<DeleteIcon />} tooltip="Error" variant="error" onClick={() => {}} />
          </div>
          <div className="demo-row">
            <span className="demo-label">Active:</span>
            <ToolbarIconButton icon={<SaveIcon />} tooltip="Active" active onClick={() => {}} />
          </div>
        </div>
      </Paper>
    </div>
  );

  const renderControlButtons = () => (
    <div className="component-grid">
      {/* Playback Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">PlaybackButton</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Toggle:</span>
            <PlaybackButton
              state={playbackState}
              onPlay={() => setPlaybackState("playing")}
              onPause={() => setPlaybackState("paused")}
            />
            <span className="demo-value">{playbackState}</span>
          </div>
          <div className="demo-row">
            <span className="demo-label">Stop:</span>
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
        </div>
      </Paper>

      {/* Expand/Collapse Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">ExpandCollapseButton</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Rotate:</span>
            <ExpandCollapseButton expanded={expanded} onClick={() => setExpanded(!expanded)} />
            <span className="demo-value">{expanded ? "expanded" : "collapsed"}</span>
          </div>
          <div className="demo-row">
            <span className="demo-label">Chevron:</span>
            <ExpandCollapseButton expanded={expanded} iconVariant="chevron" onClick={() => setExpanded(!expanded)} />
          </div>
        </div>
      </Paper>

      {/* View Mode Toggle */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">ViewModeToggle</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Grid/List:</span>
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
                { value: "list", icon: <ViewListIcon />, tooltip: "List view" }
              ]}
            />
            <span className="demo-value">{viewMode}</span>
          </div>
          <div className="demo-row">
            <span className="demo-label">Sort:</span>
            <ViewModeToggle
              value={sortMode}
              onChange={setSortMode}
              options={[
                { value: "name", icon: <SortByAlphaIcon />, tooltip: "Sort by name" },
                { value: "date", icon: <SortIcon />, tooltip: "Sort by date" }
              ]}
            />
            <span className="demo-value">{sortMode}</span>
          </div>
        </div>
      </Paper>

      {/* Refresh Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">RefreshButton</span>
        </div>
        <div className="card-body">
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
        </div>
      </Paper>

      {/* Selection Controls */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">SelectionControls</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Buttons:</span>
            <SelectionControls
              selectedCount={selectedCount}
              totalCount={10}
              onSelectAll={() => setSelectedCount(10)}
              onClear={() => setSelectedCount(0)}
            />
          </div>
          <div className="demo-row">
            <span className="demo-label">Toggle:</span>
            <SelectionControls
              selectedCount={selectedCount}
              totalCount={10}
              onSelectAll={() => setSelectedCount(10)}
              onClear={() => setSelectedCount(0)}
              variant="toggle"
            />
          </div>
        </div>
      </Paper>
    </div>
  );

  const renderDialogActions = () => (
    <div className="component-grid">
      {/* Dialog Action Buttons */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">DialogActionButtons</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <EditorButton onClick={() => setShowDialog(true)}>Open Standard Dialog</EditorButton>
          </div>
          <div className="demo-row">
            <EditorButton onClick={() => setShowDestructiveDialog(true)} sx={{ color: "error.main" }}>
              Open Destructive Dialog
            </EditorButton>
          </div>
        </div>
      </Paper>

      {/* Nav Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">NavButton</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Icon only:</span>
            <NavButton icon={<PlayArrowIcon />} tooltip="Navigate" onClick={() => {}} />
          </div>
          <div className="demo-row">
            <span className="demo-label">With label:</span>
            <NavButton icon={<PlayArrowIcon />} label="Run" onClick={() => {}} />
          </div>
          <div className="demo-row">
            <span className="demo-label">Active:</span>
            <NavButton icon={<PlayArrowIcon />} label="Active" active onClick={() => {}} />
          </div>
        </div>
      </Paper>

      {/* Dialogs */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>Are you sure you want to proceed with this action?</DialogContent>
        <DialogActionButtons
          onConfirm={() => setShowDialog(false)}
          onCancel={() => setShowDialog(false)}
          confirmText="Confirm"
          cancelText="Cancel"
        />
      </Dialog>

      <Dialog open={showDestructiveDialog} onClose={() => setShowDestructiveDialog(false)}>
        <DialogTitle>Delete Item?</DialogTitle>
        <DialogContent>This action cannot be undone. Are you sure you want to delete this item?</DialogContent>
        <DialogActionButtons
          onConfirm={() => setShowDestructiveDialog(false)}
          onCancel={() => setShowDestructiveDialog(false)}
          confirmText="Delete"
          cancelText="Cancel"
          destructive
        />
      </Dialog>
    </div>
  );

  const renderInputControls = () => (
    <div className="component-grid">
      {/* Node TextField */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">NodeTextField</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <NodeTextField
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Enter text..."
            />
          </div>
          <div className="demo-row">
            <NodeTextField
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              changed
              placeholder="Changed state"
            />
          </div>
          <div className="demo-row">
            <NodeTextField
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              invalid
              placeholder="Invalid state"
            />
          </div>
        </div>
      </Paper>

      {/* Node Switch */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">NodeSwitch</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Default:</span>
            <NodeSwitch checked={switchValue} onChange={(e) => setSwitchValue(e.target.checked)} />
            <span className="demo-value">{switchValue ? "on" : "off"}</span>
          </div>
        </div>
      </Paper>

      {/* Node Slider */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">NodeSlider</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <NodeSlider
              value={sliderValue}
              onChange={(_, v) => setSliderValue(v as number)}
              min={0}
              max={100}
            />
            <span className="demo-value">{sliderValue}</span>
          </div>
        </div>
      </Paper>

      {/* Editor Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">EditorButton</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <EditorButton>Default</EditorButton>
            <EditorButton variant="contained" color="primary">Primary</EditorButton>
            <EditorButton variant="outlined">Outlined</EditorButton>
          </div>
        </div>
      </Paper>
    </div>
  );

  const renderFabs = () => (
    <div className="component-grid">
      {/* Create FAB */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">CreateFab</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Icon:</span>
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
        </div>
      </Paper>

      {/* Run Workflow Button */}
      <Paper className="component-card" elevation={0}>
        <div className="card-header">
          <span className="card-title">RunWorkflowButton</span>
        </div>
        <div className="card-body">
          <div className="demo-row">
            <span className="demo-label">Button:</span>
            <RunWorkflowButton
              isRunning={isRunning}
              onRun={() => setIsRunning(true)}
              onStop={() => setIsRunning(false)}
            />
            <span className="demo-value">{isRunning ? "running" : "stopped"}</span>
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
            <span className="demo-label">FAB:</span>
            <RunWorkflowButton
              isRunning={isRunning}
              onRun={() => setIsRunning(true)}
              onStop={() => setIsRunning(false)}
              variant="fab"
            />
          </div>
        </div>
      </Paper>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "action":
        return renderActionButtons();
      case "control":
        return renderControlButtons();
      case "dialog":
        return renderDialogActions();
      case "input":
        return renderInputControls();
      case "fab":
        return renderFabs();
      default:
        return null;
    }
  };

  return (
    <Box css={styles(theme)}>
      {/* Header */}
      <div className="layout-header">
        <div className="header-content">
          <div className="header-title">
            <div className="logo-accent">NT</div>
            <div>
              <Typography variant="h4" fontWeight={700} color="text.primary">
                UI Primitives
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Component Library & Design System
              </Typography>
            </div>
          </div>
          <Stack direction="row" alignItems="center" spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={mode === "dark"}
                  onChange={toggleColorMode}
                  icon={<LightModeIcon />}
                  checkedIcon={<DarkModeIcon />}
                />
              }
              label={mode === "dark" ? "Dark" : "Light"}
            />
          </Stack>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Tabs */}
        <Paper className="tabs-container" elevation={0}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            {categories.map((cat) => (
              <Tab
                key={cat.id}
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>{cat.label}</span>
                    <Chip label={cat.count} size="small" />
                  </Stack>
                }
                value={cat.id}
              />
            ))}
          </Tabs>
        </Paper>

        {/* Content */}
        {renderContent()}
      </div>
    </Box>
  );
};

export default LayoutTest;
