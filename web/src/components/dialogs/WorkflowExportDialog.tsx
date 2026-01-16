/**
 * WorkflowExportDialog Component - Research Feature
 *
 * Dialog for exporting workflows as shareable JSON files.
 * Part of the Workflow Marketplace research feature.
 *
 * Features:
 * - Configure workflow metadata (name, description, tags, category)
 * - Preview exported JSON
 * - Download as file
 * - Copy to clipboard
 * - Generate shareable URL
 *
 * Status: EXPERIMENTAL - This is a research feature.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  CircularProgress,
  Alert
} from "@mui/material";
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  Link as LinkIcon,
  Edit as EditIcon,
  Check as CheckIcon
} from "@mui/icons-material";
import { useMarketplaceStore, ShareableWorkflowInput, WorkflowCategory } from "../../stores/MarketplaceStore";
import { Node, Edge } from "../../stores/ApiTypes";

interface WorkflowExportDialogProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
  graph: { nodes: Node[]; edges: Edge[] };
}

const CATEGORIES: { value: WorkflowCategory; label: string }[] = [
  { value: "text-generation", label: "Text Generation" },
  { value: "image-generation", label: "Image Generation" },
  { value: "audio-generation", label: "Audio Generation" },
  { value: "video-generation", label: "Video Generation" },
  { value: "data-processing", label: "Data Processing" },
  { value: "automation", label: "Automation" },
  { value: "research", label: "Research" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" }
];

const SUGGESTED_TAGS = [
  "AI",
  "LLM",
  "Image",
  "Audio",
  "Video",
  "Chat",
  "Pipeline",
  "Transform",
  "Analysis",
  "Generator"
];

export const WorkflowExportDialog: React.FC<WorkflowExportDialogProps> = ({
  open,
  onClose,
  workflowId: _workflowId,
  workflowName,
  graph
}) => {
  const {
    exportWorkflow,
    generateShareUrl,
    isLoading,
    error,
    setError
  } = useMarketplaceStore();

  const [name, setName] = useState(workflowName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState<WorkflowCategory>("other");
  const [version, setVersion] = useState("1.0.0");
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const metadata: ShareableWorkflowInput = useMemo(
    () => ({
      name,
      description,
      tags,
      version,
      category,
      author: undefined
    }),
    [name, description, tags, version, category]
  );

  const shareableWorkflow = useMemo(
    () => exportWorkflow(graph, metadata),
    [graph, metadata, exportWorkflow]
  );

  const jsonPreview = useMemo(
    () => JSON.stringify(shareableWorkflow, null, 2),
    [shareableWorkflow]
  );

  const shareableUrl = useMemo(
    () => generateShareUrl(shareableWorkflow),
    [shareableWorkflow, generateShareUrl]
  );

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonPreview], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_").toLowerCase()}_v${version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [jsonPreview, name, version]);

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonPreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  }, [jsonPreview, setError]);

  const handleGenerateShareUrl = useCallback(() => {
    setShareUrl(shareableUrl);
  }, [shareableUrl]);

  const handleAddTag = (tag: string) => {
    if (!tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleClose = useCallback(() => {
    setName(workflowName);
    setDescription("");
    setTags([]);
    setCategory("other");
    setVersion("1.0.0");
    setShowJsonPreview(false);
    setShareUrl(null);
    setError(null);
    onClose();
  }, [workflowName, onClose, setError]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { maxHeight: "90vh" }
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <DownloadIcon color="primary" />
        Export Workflow
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Workflow Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            disabled={isLoading}
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="Describe what this workflow does..."
            disabled={isLoading}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={category}
                label="Category"
                onChange={(e) => setCategory(e.target.value as WorkflowCategory)}
                disabled={isLoading}
              >
                {CATEGORIES.map((cat) => (
                  <MenuItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              sx={{ width: 120 }}
              disabled={isLoading}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Tags
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  onDelete={() => handleRemoveTag(tag)}
                />
              ))}
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {SUGGESTED_TAGS.filter(t => !tags.includes(t)).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  onClick={() => handleAddTag(tag)}
                  clickable
                />
              ))}
            </Box>
          </Box>

          <Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="subtitle2">
                Workflow Summary
              </Typography>
              <Button
                size="small"
                startIcon={showJsonPreview ? <EditIcon /> : <DownloadIcon />}
                onClick={() => setShowJsonPreview(!showJsonPreview)}
              >
                {showJsonPreview ? "Hide JSON" : "Show JSON"}
              </Button>
            </Box>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {graph.nodes.length} nodes • {graph.edges.length} connections
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Categories: {category}
              </Typography>
            </Paper>
          </Box>

          {showJsonPreview && (
            <Paper
              variant="outlined"
              sx={{
                p: 1,
                maxHeight: 200,
                overflow: "auto",
                bgcolor: "grey.50"
              }}
            >
              <Typography
                component="pre"
                sx={{
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all"
                }}
              >
                {jsonPreview}
              </Typography>
            </Paper>
          )}

          {shareUrl && (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: "primary.50" }}>
              <Typography variant="subtitle2" gutterBottom>
                Shareable URL
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TextField
                  value={shareUrl}
                  fullWidth
                  size="small"
                  InputProps={{
                    readOnly: true
                  }}
                />
                <Tooltip title="Copy URL">
                  <IconButton
                    onClick={() => navigator.clipboard.writeText(shareUrl)}
                    color="primary"
                  >
                    <CopyIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Share this URL to let others import this workflow
              </Typography>
            </Paper>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>

        <Box sx={{ flex: 1 }} />

        {shareUrl ? (
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            disabled={isLoading}
          >
            Copy Share URL
          </Button>
        ) : (
          <Button
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={handleGenerateShareUrl}
            disabled={isLoading || !name}
          >
            Generate Share URL
          </Button>
        )}

        <Button
          variant="outlined"
          startIcon={copied ? <CheckIcon /> : <CopyIcon />}
          onClick={handleCopyToClipboard}
          disabled={isLoading}
        >
          {copied ? "Copied!" : "Copy JSON"}
        </Button>

        <Button
          variant="contained"
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          onClick={handleDownload}
          disabled={isLoading || !name}
        >
          Download JSON
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkflowExportDialog;
