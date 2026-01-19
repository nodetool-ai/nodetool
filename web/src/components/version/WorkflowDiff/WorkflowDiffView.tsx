import React, { useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import type { WorkflowDiffViewProps } from './types';
import { getChangeColor, getChangeIcon } from './algorithm';

const WorkflowDiffView: React.FC<WorkflowDiffViewProps> = ({
  oldVersion,
  newVersion,
  diff,
  viewMode = 'unified',
  onNodeClick,
  onClose,
}) => {
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  const changeCounts = useMemo(() => {
    const { summary } = diff;
    return [
      { label: 'Added', count: summary.nodesAdded + summary.edgesAdded, color: 'success', icon: '+' },
      { label: 'Removed', count: summary.nodesRemoved + summary.edgesRemoved, color: 'error', icon: '-' },
      { label: 'Modified', count: summary.nodesModified + summary.edgesModified, color: 'warning', icon: '~' },
    ];
  }, [diff]);

  const renderNodeItem = (nodeDiff: typeof diff.addedNodes[0]) => {
    const color = getChangeColor(nodeDiff.changeType);
    const icon = getChangeIcon(nodeDiff.changeType);
    const label = (nodeDiff.node?.data as Record<string, unknown>)?.label as string || nodeDiff.nodeId;

    return (
      <ListItem
        key={nodeDiff.nodeId}
        onClick={() => onNodeClick?.(nodeDiff.nodeId)}
        sx={{
          cursor: onNodeClick ? 'pointer' : 'default',
          '&:hover': { bgcolor: 'action.hover' },
          borderLeft: `3px solid`,
          borderColor: color,
        }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 'bold', color, width: 20, textAlign: 'center' }}
          >
            {icon}
          </Typography>
        </ListItemIcon>
        <ListItemText
          primary={label}
          secondary={nodeDiff.node?.type}
          primaryTypographyProps={{
            sx: {
              textDecoration: nodeDiff.changeType === 'removed' ? 'line-through' : 'none',
              color: nodeDiff.changeType === 'removed' ? 'text.disabled' : 'text.primary',
            },
          }}
        />
        {nodeDiff.changeType === 'modified' && (
          <Tooltip title="Properties changed">
            <EditIcon fontSize="small" sx={{ color: 'warning.main' }} />
          </Tooltip>
        )}
      </ListItem>
    );
  };

  const renderSummarySection = () => (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      {changeCounts.map((item) => (
        <Chip
          key={item.label}
          label={`${item.label}: ${item.count}`}
          color={item.color as 'success' | 'error' | 'warning'}
          size="small"
          icon={
            <Typography sx={{ fontWeight: 'bold', px: 0.5 }}>
              {item.icon}
            </Typography>
          }
        />
      ))}
    </Box>
  );

  const renderUnifiedView = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {diff.addedNodes.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 'bold', mb: 1 }}>
            Added Nodes ({diff.addedNodes.length})
          </Typography>
          <List dense disablePadding>
            {diff.addedNodes.map(renderNodeItem)}
          </List>
        </Paper>
      )}

      {diff.removedNodes.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ color: 'error.main', fontWeight: 'bold', mb: 1 }}>
            Removed Nodes ({diff.removedNodes.length})
          </Typography>
          <List dense disablePadding>
            {diff.removedNodes.map(renderNodeItem)}
          </List>
        </Paper>
      )}

      {diff.modifiedNodes.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ color: 'warning.main', fontWeight: 'bold', mb: 1 }}>
            Modified Nodes ({diff.modifiedNodes.length})
          </Typography>
          <List dense disablePadding>
            {diff.modifiedNodes.map(renderNodeItem)}
          </List>
        </Paper>
      )}

      {diff.addedEdges.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 'bold', mb: 1 }}>
            Added Connections ({diff.addedEdges.length})
          </Typography>
          <List dense disablePadding>
            {diff.addedEdges.map((edge) => (
              <ListItem
                key={edge.edgeId}
                sx={{
                  borderLeft: `3px solid`,
                  borderColor: 'success.main',
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                    +
                  </Typography>
                </ListItemIcon>
                <ListItemText
                  primary={`${edge.edge?.source} → ${edge.edge?.target}`}
                  secondary={edge.edge?.label}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {diff.removedEdges.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ color: 'error.main', fontWeight: 'bold', mb: 1 }}>
            Removed Connections ({diff.removedEdges.length})
          </Typography>
          <List dense disablePadding>
            {diff.removedEdges.map((edge) => (
              <ListItem
                key={edge.edgeId}
                sx={{
                  borderLeft: `3px solid`,
                  borderColor: 'error.main',
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                    -
                  </Typography>
                </ListItemIcon>
                <ListItemText
                  primary={`${edge.edge?.source} → ${edge.edge?.target}`}
                  secondary={edge.edge?.label}
                  primaryTypographyProps={{
                    sx: { textDecoration: 'line-through', color: 'text.disabled' },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {diff.addedNodes.length === 0 &&
        diff.removedNodes.length === 0 &&
        diff.modifiedNodes.length === 0 &&
        diff.addedEdges.length === 0 &&
        diff.removedEdges.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No changes between versions
          </Typography>
        )}
    </Box>
  );

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CompareArrowsIcon color="primary" />
          <Typography variant="h6">Workflow Changes</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, value) => value && {}}
            size="small"
          >
            <ToggleButton value="unified">Unified</ToggleButton>
            <ToggleButton value="split">Split</ToggleButton>
          </ToggleButtonGroup>
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Box sx={{ display: 'flex', gap: 3, mb: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              From
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {oldVersion.name}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {formatDate(oldVersion.updatedAt)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              To
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {newVersion.name}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {formatDate(newVersion.updatedAt)}
            </Typography>
          </Box>
        </Box>
        {renderSummarySection()}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {renderUnifiedView()}
      </Box>

      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
          fontSize: '0.75rem',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AddCircleOutlineIcon fontSize="inherit" sx={{ color: 'success.main' }} />
          <Typography variant="caption" color="text.secondary">
            Added
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <RemoveCircleOutlineIcon fontSize="inherit" sx={{ color: 'error.main' }} />
          <Typography variant="caption" color="text.secondary">
            Removed
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <EditIcon fontSize="inherit" sx={{ color: 'warning.main' }} />
          <Typography variant="caption" color="text.secondary">
            Modified
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default WorkflowDiffView;
