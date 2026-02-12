/**
 * DataFlowControls component for toggling and configuring data flow visualization.
 *
 * EXPERIMENTAL FEATURE: Provides UI controls to enable/disable data flow animations
 * and configure animation behavior.
 *
 * @experimental
 */
import { memo, useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Popover,
  Typography,
  Slider,
  FormControlLabel,
  Switch,
  Divider,
  Badge,
} from "@mui/material";
import {
  Timeline,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { useDataFlowAnimationStore } from "../../stores/DataFlowAnimationStore";
import { useTheme } from "@mui/material/styles";

interface DataFlowControlsProps {
  workflowId: string;
}

const DataFlowControls: React.FC<DataFlowControlsProps> = memo(({ workflowId }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const settings = useDataFlowAnimationStore((state) => state.settings);
  const updateSettings = useDataFlowAnimationStore((state) => state.updateSettings);

  const workflowState = useDataFlowAnimationStore((state) =>
    state.getWorkflowState(workflowId)
  );
  const setWorkflowEnabled = useDataFlowAnimationStore((state) => state.setWorkflowEnabled);

  const handleToggle = () => {
    const newEnabled = workflowState?.enabled ?? true;
    setWorkflowEnabled(workflowId, newEnabled);
  };

  const handleSettingsClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setAnchorEl(null);
  };

  const handleSpeedChange = (_event: Event, newValue: number | number[]) => {
    updateSettings({ animationSpeed: newValue as number });
  };

  const handleParticleSizeChange = (_event: Event, newValue: number | number[]) => {
    updateSettings({ particleSize: newValue as number });
  };

  const handleShowDataLabelsToggle = (
    _event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => {
    updateSettings({ showDataLabels: checked });
  };

  const handleGlobalEnabledToggle = (
    _event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => {
    updateSettings({ enabled: checked });
  };

  const isEnabled = workflowState?.enabled ?? true;
  const isWorkflowRunning = workflowState?.isRunning ?? false;

  return (
    <>
      <Tooltip
        title={
          isEnabled
            ? "Data Flow Visualization Enabled"
            : "Data Flow Visualization Disabled"
        }
        placement="left"
        arrow
      >
        <Badge
          color="primary"
          variant="dot"
          invisible={!isEnabled || !isWorkflowRunning}
          sx={{
            "& .MuiBadge-dot": {
              width: 8,
              height: 8,
            },
          }}
        >
          <IconButton
            onClick={handleToggle}
            size="small"
            sx={{
              position: "absolute",
              bottom: 80,
              right: 20,
              zIndex: 10,
              backgroundColor: theme.vars.palette.Paper.paper,
              backdropFilter: "blur(8px)",
              border: `1px solid ${theme.vars.palette.divider}`,
              color: isEnabled
                ? theme.palette.primary.main
                : theme.vars.palette.text.secondary,
              opacity: isEnabled ? 1 : 0.6,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
              },
            }}
          >
            <Timeline fontSize="small" />
          </IconButton>
        </Badge>
      </Tooltip>

      <Tooltip title="Data Flow Settings" placement="left" arrow>
        <IconButton
          onClick={handleSettingsClick}
          size="small"
          sx={{
            position: "absolute",
            bottom: 80,
            right: 60,
            zIndex: 10,
            backgroundColor: theme.vars.palette.Paper.paper,
            backdropFilter: "blur(8px)",
            border: `1px solid ${theme.vars.palette.divider}`,
            color: theme.vars.palette.text.secondary,
            "&:hover": {
              backgroundColor: theme.vars.palette.action.hover,
              color: theme.palette.primary.main,
            },
          }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleSettingsClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            width: 280,
            p: 2,
          },
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Data Flow Settings
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
          Configure animation behavior for workflow execution visualization
        </Typography>

        <Divider sx={{ mb: 2 }} />

        <FormControlLabel
          control={
            <Switch
              checked={settings.enabled}
              onChange={handleGlobalEnabledToggle}
              size="small"
            />
          }
          label={
            <Box>
              <Typography variant="body2">Enable Data Flow</Typography>
              <Typography variant="caption" color="text.secondary">
                Show animated particles on edges
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0, mb: 2 }}
        />

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            Animation Speed: {settings.animationSpeed}
          </Typography>
          <Slider
            value={settings.animationSpeed}
            onChange={handleSpeedChange}
            min={1}
            max={5}
            marks={[
              { value: 1, label: "Slow" },
              { value: 3, label: "Medium" },
              { value: 5, label: "Fast" },
            ]}
            valueLabelDisplay="auto"
            size="small"
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            Particle Size: {settings.particleSize}px
          </Typography>
          <Slider
            value={settings.particleSize}
            onChange={handleParticleSizeChange}
            min={4}
            max={12}
            marks={[
              { value: 4, label: "Small" },
              { value: 8, label: "Medium" },
              { value: 12, label: "Large" },
            ]}
            valueLabelDisplay="auto"
            size="small"
          />
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={settings.showDataLabels}
              onChange={handleShowDataLabelsToggle}
              size="small"
            />
          }
          label={
            <Box>
              <Typography variant="body2">Show Data Labels</Typography>
              <Typography variant="caption" color="text.secondary">
                Display data type on animated particles
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0, mb: 1 }}
        />

        <Divider sx={{ my: 2 }} />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontStyle: "italic" }}
        >
          Experimental Feature: Data flow visualization may impact performance with
          large workflows.
        </Typography>
      </Popover>
    </>
  );
});

DataFlowControls.displayName = "DataFlowControls";

export default DataFlowControls;
