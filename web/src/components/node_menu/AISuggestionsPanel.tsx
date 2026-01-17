/**
 * AI Suggestions Panel Component
 *
 * Displays AI-powered node suggestions in the workflow editor.
 * This is an experimental feature that provides smart recommendations
 * to help users discover relevant nodes for their workflows.
 */

import React, { useEffect } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
  Collapse
} from "@mui/material";
import {
  Lightbulb as LightbulbIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AutoAwesome as AIIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon
} from "@mui/icons-material";
import { useAISuggestions } from "../../hooks/useAISuggestions";
import { NodeSuggestion, useAISuggestionsStore } from "../../stores/AISuggestionsStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";

interface AISuggestionsPanelProps {
  workflowId?: string;
  onSelectSuggestion?: (suggestion: NodeSuggestion) => void;
  compact?: boolean;
}

export const AISuggestionsPanel: React.FC<AISuggestionsPanelProps> = ({
  _workflowId,
  onSelectSuggestion,
  compact = false
}) => {
  const {
    suggestions,
    isLoading,
    error,
    refreshSuggestions,
    _clearSuggestions
  } = useAISuggestions({ enabled: true, maxSuggestions: 5 });

  const [isExpanded, setIsExpanded] = React.useState(true);
  const recordFeedback = useAISuggestionsStore((state) => state.recordFeedback);
  const feedback = useAISuggestionsStore((state) => state.feedback);

  // Refresh suggestions when panel becomes visible
  useEffect(() => {
    if (isExpanded) {
      refreshSuggestions();
    }
  }, [isExpanded, refreshSuggestions]);

  const handleSelectSuggestion = (suggestion: NodeSuggestion) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
    } else {
      // Default behavior: add the suggested node to the workflow
      useNodeMenuStore.getState().setSearchTerm(suggestion.metadata.display_name || "");
      useNodeMenuStore.getState().openNodeMenu({
        x: 100,
        y: 100,
        searchTerm: suggestion.metadata.display_name || ""
      });
    }
  };

  const handleRefresh = () => {
    refreshSuggestions();
  };

  const handleFeedback = (nodeType: string, helpful: boolean, event: React.MouseEvent) => {
    event.stopPropagation();
    recordFeedback(nodeType, helpful);
  };

  if (error) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: "rgba(211, 47, 47, 0.1)",
          borderRadius: 2
        }}
      >
        <Typography color="error" variant="body2">
          Failed to load suggestions
        </Typography>
      </Paper>
    );
  }

  if (!isExpanded && suggestions.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: "rgba(25, 118, 210, 0.05)",
        borderRadius: 2,
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1.5,
          borderBottom: isExpanded ? 1 : 0,
          borderColor: "divider",
          cursor: "pointer"
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AIIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight="medium">
            AI Suggestions
          </Typography>
          {!compact && suggestions.length > 0 && (
            <Chip
              label={suggestions.length}
              size="small"
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Refresh suggestions">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small">
            {isExpanded ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            )}
          </IconButton>
        </Box>
      </Box>

      {/* Content */}
      <Collapse in={isExpanded}>
        {isLoading ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 3
            }}
          >
            <CircularProgress size={24} sx={{ mr: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Analyzing workflow...
            </Typography>
          </Box>
        ) : suggestions.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              textAlign: "center"
            }}
          >
            <LightbulbIcon
              sx={{ fontSize: 32, color: "text.secondary", mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary">
              No suggestions available
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Select a node to get personalized suggestions
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 0 }}>
            {suggestions.map((suggestion, index) => (
              <ListItem
                key={`${suggestion.nodeType}-${index}`}
                disablePadding
                sx={{
                  borderBottom:
                    index < suggestions.length - 1 ? 1 : 0,
                  borderColor: "divider"
                }}
                secondaryAction={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Tooltip title="This is helpful">
                      <IconButton
                        size="small"
                        onClick={(e) => handleFeedback(suggestion.nodeType, true, e)}
                        sx={{
                          opacity: feedback[suggestion.nodeType]?.helpful === true ? 1 : 0.5,
                          color: feedback[suggestion.nodeType]?.helpful === true ? "success.main" : "inherit"
                        }}
                      >
                        <ThumbUpIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="This is not helpful">
                      <IconButton
                        size="small"
                        onClick={(e) => handleFeedback(suggestion.nodeType, false, e)}
                        sx={{
                          opacity: feedback[suggestion.nodeType]?.helpful === false ? 1 : 0.5,
                          color: feedback[suggestion.nodeType]?.helpful === false ? "error.main" : "inherit"
                        }}
                      >
                        <ThumbDownIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
              >
                <ListItemButton
                  onClick={() => handleSelectSuggestion(suggestion)}
                  sx={{
                    py: 1,
                    "&:hover": {
                      bgcolor: "rgba(25, 118, 210, 0.08)"
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <AIIcon
                      fontSize="small"
                      sx={{
                        color: getConfidenceColor(suggestion.confidence)
                      }}
                    />
                  </ListItemIcon>
                    <ListItemText
                    // @ts-expect-error - display_name property exists on NodeMetadata at runtime
                    primary={suggestion.metadata.display_name || suggestion.nodeType.split(".").pop()}
                    // @ts-expect-error - display_name property exists on NodeMetadata at runtime
                    secondary={suggestion.reason}
                    primaryTypographyProps={{
                      variant: "body2",
                      fontWeight: "medium",
                      noWrap: true
                    }}
                    secondaryTypographyProps={{
                      variant: "caption",
                      noWrap: true,
                      sx: {
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden"
                      }
                    }}
                  />
                  <Chip
                    label={`${Math.round(suggestion.confidence * 100)}%`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.65rem",
                      bgcolor: getConfidenceBgColor(suggestion.confidence),
                      color: getConfidenceColor(suggestion.confidence)
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Collapse>
    </Paper>
  );
};

/**
 * Get color based on confidence level
 */
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.7) {
    return "success.main";
  }
  if (confidence >= 0.5) {
    return "warning.main";
  }
  return "text.secondary";
};

const getConfidenceBgColor = (confidence: number): string => {
  if (confidence >= 0.7) {
    return "rgba(46, 125, 50, 0.1)";
  }
  if (confidence >= 0.5) {
    return "rgba(237, 108, 2, 0.1)";
  }
  return "rgba(0, 0, 0, 0.05)";
};

/**
 * Get background color based on confidence level
 */
const getConfidenceBgColor = (confidence: number): string => {
  if (confidence >= 0.7) {
    return "rgba(46, 125, 50, 0.1)";
  }
  if (confidence >= 0.5) {
    return "rgba(237, 108, 2, 0.1)";
  }
  return "rgba(0, 0, 0, 0.05)";
};

export default AISuggestionsPanel;
