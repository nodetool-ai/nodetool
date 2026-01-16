/**
 * WorkflowImportDialog Component - Research Feature
 *
 * Dialog for importing workflows from URLs, files, or clipboard.
 * Part of the Workflow Marketplace research feature.
 *
 * Features:
 * - Import from URL (shareable workflow links)
 * - Import from local JSON file
 * - Import from clipboard
 * - Preview imported workflow
 * - Validate workflow compatibility
 *
 * Status: EXPERIMENTAL - This is a research feature.
 */

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip
} from "@mui/material";
import {
  Close as CloseIcon,
  CloudDownload as CloudDownloadIcon,
  FileOpen as FileOpenIcon,
  ContentPaste as ContentPasteIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Link as LinkIcon
} from "@mui/icons-material";
import { useMarketplaceStore, ShareableWorkflow } from "../../stores/MarketplaceStore";

interface WorkflowImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (workflow: ShareableWorkflow) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index} style={{ paddingTop: 16 }}>
    {value === index && children}
  </div>
);

export const WorkflowImportDialog: React.FC<WorkflowImportDialogProps> = ({
  open,
  onClose,
  onImport
}) => {
  const {
    importFromUrl,
    importFromFile,
    importFromClipboard,
    isLoading,
    error,
    setError
  } = useMarketplaceStore();

  const [activeTab, setActiveTab] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [importedWorkflow, setImportedWorkflow] = useState<ShareableWorkflow | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const handleImportFromUrl = useCallback(async () => {
    if (!urlInput.trim()) {
      setError("Please enter a URL");
      return;
    }

    try {
      setValidationWarnings([]);
      const workflow = await importFromUrl(urlInput.trim());
      setValidationWarnings(validateWorkflow(workflow));
      setImportedWorkflow(workflow);
    } catch {
      setError("Failed to import from URL. Please check the URL and try again.");
    }
  }, [urlInput, importFromUrl, setError, validateWorkflow]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setValidationWarnings([]);
      const workflow = await importFromFile(file);
      setValidationWarnings(validateWorkflow(workflow));
      setImportedWorkflow(workflow);
    } catch {
      setError("Failed to import from file. Please check the file format.");
    }
  }, [importFromFile, setError, validateWorkflow]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("Clipboard is empty");
        return;
      }

      try {
        JSON.parse(text);
      } catch {
        setError("Clipboard does not contain valid JSON");
        return;
      }

      setValidationWarnings([]);
      const workflow = await importFromClipboard(text);
      setValidationWarnings(validateWorkflow(workflow));
      setImportedWorkflow(workflow);
    } catch {
      setError("Failed to import from clipboard");
    }
  }, [importFromClipboard, setError, validateWorkflow]);

  const handleConfirmImport = useCallback(() => {
    if (importedWorkflow) {
      onImport(importedWorkflow);
      handleClose();
    }
  }, [importedWorkflow, onImport, handleClose]);

  const handleClose = useCallback(() => {
    setUrlInput("");
    setImportedWorkflow(null);
    setValidationWarnings([]);
    setError(null);
    setActiveTab(0);
    onClose();
  }, [onClose, setError]);

  const validateWorkflow = useCallback((workflow: ShareableWorkflow): string[] => {
    const warnings: string[] = [];

    if (!workflow.metadata.name) {
      warnings.push("Workflow is missing a name");
    }

    if (!workflow.metadata.description) {
      warnings.push("Workflow is missing a description");
    }

    if (!workflow.graph.nodes || workflow.graph.nodes.length === 0) {
      warnings.push("Workflow has no nodes");
    }

    if (workflow.compatibility) {
      if (workflow.compatibility.requiredNodes.length > 10) {
        warnings.push("Workflow requires many node types");
      }
    }

    return warnings;
  }, []);

  const handleTabChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setImportedWorkflow(null);
    setValidationWarnings([]);
    setError(null);
  }, [setError]);

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
        <CloudDownloadIcon color="primary" />
        Import Workflow
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          Experimental
        </Typography>
        <Button onClick={handleClose} size="small">
          <CloseIcon />
        </Button>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
            <Tab icon={<LinkIcon />} label="From URL" iconPosition="start" />
            <Tab icon={<FileOpenIcon />} label="From File" iconPosition="start" />
            <Tab icon={<ContentPasteIcon />} label="From Clipboard" iconPosition="start" />
          </Tabs>

          <TabPanel value={activeTab} index={0}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Import a workflow from a shareable URL. The URL should point to a
                NodeTool workflow JSON file or a shareable workflow link.
              </Typography>
              <TextField
                label="Workflow URL"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/workflow.json or share URL"
                fullWidth
                disabled={isLoading}
              />
              <Button
                variant="contained"
                onClick={handleImportFromUrl}
                disabled={isLoading || !urlInput.trim()}
                startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
              >
                {isLoading ? "Importing..." : "Import from URL"}
              </Button>
            </Box>
          </TabPanel>

          <TabPanel value={activeTab} index={1}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Select a JSON file containing a NodeTool workflow. The file should
                be exported using the Workflow Export feature or be in the correct format.
              </Typography>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                style={{ display: "none" }}
                id="workflow-file-input"
              />
              <label htmlFor="workflow-file-input">
                <Button
                  variant="contained"
                  component="span"
                  disabled={isLoading}
                  startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <FileOpenIcon />}
                >
                  {isLoading ? "Importing..." : "Select File"}
                </Button>
              </label>
            </Box>
          </TabPanel>

          <TabPanel value={activeTab} index={2}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Import a workflow from the clipboard. Copy a workflow JSON to your
                clipboard first, then click the button below to import it.
              </Typography>
              <Button
                variant="contained"
                onClick={handlePaste}
                disabled={isLoading}
                startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <ContentPasteIcon />}
              >
                {isLoading ? "Importing..." : "Import from Clipboard"}
              </Button>
            </Box>
          </TabPanel>

          {importedWorkflow && (
            <Paper variant="outlined" sx={{ mt: 2 }}>
              <Box sx={{ p: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="subtitle1" fontWeight="medium">
                    Workflow Imported Successfully
                  </Typography>
                </Box>

                <Typography variant="body2" fontWeight="medium">
                  {importedWorkflow.metadata.name || "Untitled Workflow"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {importedWorkflow.metadata.description || "No description"}
                </Typography>

                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                  <Chip
                    label={`v${importedWorkflow.metadata.version || "1.0.0"}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  {importedWorkflow.metadata.category && (
                    <Chip
                      label={importedWorkflow.metadata.category}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  <Chip
                    label={`${importedWorkflow.graph.nodes?.length || 0} nodes`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${importedWorkflow.graph.edges?.length || 0} connections`}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                {importedWorkflow.metadata.tags && importedWorkflow.metadata.tags.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Tags:
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                      {importedWorkflow.metadata.tags.map((tag) => (
                        <Chip key={tag} label={tag} size="small" />
                      ))}
                    </Box>
                  </Box>
                )}

                {validationWarnings.length > 0 ? (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <Typography variant="subtitle2">Validation Warnings:</Typography>
                    <List dense disablePadding>
                      {validationWarnings.map((warning, i) => (
                        <ListItem key={i} disableGutters sx={{ py: 0 }}>
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <WarningIcon fontSize="small" color="warning" />
                          </ListItemIcon>
                          <ListItemText
                            primary={warning}
                            primaryTypographyProps={{ variant: "caption" }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Alert>
                ) : null}
              </Box>
            </Paper>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={handleConfirmImport}
          disabled={!importedWorkflow || isLoading}
        >
          Import Workflow
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkflowImportDialog;
