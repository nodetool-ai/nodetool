/**
 * TemplatesPanel
 *
 * Panel component for browsing and managing workflow node templates.
 * Displays templates grouped by category with search functionality.
 */

import React, { useState, useCallback, useMemo, memo } from "react";
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";
import {
  Search,
  ExpandMore,
  Add,
  MoreVert,
  Download,
  Upload,
  Delete,
  Edit,
  ContentCopy
} from "@mui/icons-material";
import {
  useNodeTemplatesStore
} from "../../stores/NodeTemplatesStore";
import type { TemplateCategory } from "../../stores/NodeTemplatesStore";
import SaveTemplateDialog from "./SaveTemplateDialog";

/**
 * Template category display configuration
 */
const CATEGORY_CONFIG: Record<
  TemplateCategory,
  { label: string; color: string; icon: string }
> = {
  common: { label: "Common", color: "#2196F3", icon: "⭐" },
  "image-processing": { label: "Image Processing", color: "#9C27B0", icon: "🖼️" },
  audio: { label: "Audio", color: "#FF5722", icon: "🔊" },
  video: { label: "Video", color: "#E91E63", icon: "🎬" },
  text: { label: "Text", color: "#4CAF50", icon: "📝" },
  data: { label: "Data", color: "#FF9800", icon: "📊" },
  "ai-models": { label: "AI Models", color: "#673AB7", icon: "🤖" },
  custom: { label: "Custom", color: "#607D8B", icon: "🔧" }
} as const;

interface TemplatesPanelProps {
  onInsertTemplate: (templateId: string) => void;
  onSaveTemplate?: (options: {
    name: string;
    description: string;
    category: TemplateCategory;
  }) => void;
  selectedNodeCount?: number;
}

/**
 * Panel for browsing and managing workflow templates.
 *
 * Features:
 * - Search templates by name
 * - Group by category
 * - Insert templates into workflow
 * - Edit/delete templates
 * - Export/import templates
 *
 * @example
 * ```typescript
 * <TemplatesPanel
 *   onInsertTemplate={(id) => insertTemplate(id, position)}
 *   onSaveTemplate={(options) => saveAsTemplate(options)}
 *   selectedNodeCount={3}
 * />
 * ```
 */
const TemplatesPanel: React.FC<TemplatesPanelProps> = memo(({
  onInsertTemplate,
  onSaveTemplate,
  selectedNodeCount = 0
}) => {
  const templates = useNodeTemplatesStore((state) => state.templates);
  const deleteTemplate = useNodeTemplatesStore((state) => state.deleteTemplate);
  const exportTemplate = useNodeTemplatesStore((state) => state.exportTemplate);
  const importTemplate = useNodeTemplatesStore((state) => state.importTemplate);
  const updateTemplate = useNodeTemplatesStore((state) => state.updateTemplate);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<TemplateCategory>>(
    new Set(["common"])
  );
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<TemplateCategory>("common");

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    const grouped: Record<TemplateCategory, typeof templates> = {
      common: [],
      "image-processing": [],
      audio: [],
      video: [],
      text: [],
      data: [],
      "ai-models": [],
      custom: []
    };

    for (const template of templates) {
      if (grouped[template.category]) {
        grouped[template.category].push(template);
      }
    }

    return grouped;
  }, [templates]);

  // Filter templates by search query
  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    if (!query) {
      return Object.entries(templatesByCategory).filter(([_, cats]) => cats.length > 0);
    }

    return Object.entries(templatesByCategory).filter(([, cats]) =>
      cats.some(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      )
    );
  }, [templatesByCategory, searchQuery]);

  const toggleCategory = useCallback((category: TemplateCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>, templateId: string) => {
      event.stopPropagation();
      setMenuAnchor(event.currentTarget);
      setSelectedTemplate(templateId);
    },
    []
  );

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    setSelectedTemplate(null);
  }, []);

  const handleInsert = useCallback(
    (templateId: string) => {
      onInsertTemplate(templateId);
    },
    [onInsertTemplate]
  );

  const handleExport = useCallback(() => {
    if (selectedTemplate) {
      const json = exportTemplate(selectedTemplate);
      if (json) {
        // Create download link
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `template-${selectedTemplate}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
    handleMenuClose();
  }, [selectedTemplate, exportTemplate, handleMenuClose]);

  const handleDelete = useCallback(() => {
    if (selectedTemplate) {
      deleteTemplate(selectedTemplate);
    }
    handleMenuClose();
  }, [selectedTemplate, deleteTemplate, handleMenuClose]);

  const handleEditOpen = useCallback(() => {
    const template = templates.find((t) => t.id === selectedTemplate);
    if (template) {
      setEditName(template.name);
      setEditDescription(template.description);
      setEditCategory(template.category);
      setEditDialogOpen(true);
    }
    handleMenuClose();
  }, [selectedTemplate, templates, handleMenuClose]);

  const handleEditSave = useCallback(() => {
    if (selectedTemplate && editName.trim()) {
      updateTemplate(selectedTemplate, {
        name: editName.trim(),
        description: editDescription.trim(),
        category: editCategory
      });
      setEditDialogOpen(false);
    }
  }, [selectedTemplate, editName, editDescription, editCategory, updateTemplate]);

  const handleImport = useCallback(() => {
    setImportDialogOpen(true);
    handleMenuClose();
  }, [handleMenuClose]);

  const handleImportConfirm = useCallback(() => {
    setImportError("");
    if (!importText.trim()) {
      setImportError("Please paste template JSON");
      return;
    }

    const success = importTemplate(importText);
    if (success) {
      setImportDialogOpen(false);
      setImportText("");
    } else {
      setImportError("Invalid template format. Please check the JSON.");
    }
  }, [importText, importTemplate]);

  const handleCopyToClipboard = useCallback(() => {
    if (selectedTemplate) {
      const json = exportTemplate(selectedTemplate);
      if (json) {
        navigator.clipboard.writeText(json);
      }
    }
    handleMenuClose();
  }, [selectedTemplate, exportTemplate, handleMenuClose]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--palette-background-default)",
        color: "var(--palette-text-primary)"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          gap: 1.5
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6">Templates</Typography>
          <IconButton size="small" onClick={handleImport}>
            <Upload fontSize="small" />
          </IconButton>
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              )
            }
          }}
        />

        {/* Save button */}
        {onSaveTemplate && selectedNodeCount > 0 && (
          <Button
            fullWidth
            variant="contained"
            startIcon={<Add />}
            onClick={() => setSaveDialogOpen(true)}
          >
            Save {selectedNodeCount} Node{selectedNodeCount !== 1 ? "s" : ""} as Template
          </Button>
        )}
      </Box>

      {/* Template list */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        {filteredCategories.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--palette-text-secondary)",
              gap: 1
            }}
          >
            <Typography variant="body2">
              {searchQuery ? "No templates found" : "No templates yet"}
            </Typography>
            <Typography variant="caption">
              {searchQuery
                ? "Try a different search term"
                : "Select nodes and save them as a template"}
            </Typography>
          </Box>
        ) : (
          filteredCategories.map(([category, categoryTemplates]) => {
            const config = CATEGORY_CONFIG[category as TemplateCategory];
            const isExpanded = expandedCategories.has(category as TemplateCategory);

            // Further filter by search
            const filteredTemplates = searchQuery
              ? categoryTemplates.filter(
                  (t) =>
                    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    t.description.toLowerCase().includes(searchQuery.toLowerCase())
                )
              : categoryTemplates;

            return (
              <Accordion
                key={category}
                expanded={isExpanded}
                onChange={() => toggleCategory(category as TemplateCategory)}
                sx={{
                  mb: 1,
                  backgroundColor: "var(--palette-background-paper)",
                  "&:before": { display: "none" }
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMore />}
                  sx={{
                    "& .MuiAccordionSummary-content": {
                      gap: 1
                    }
                  }}
                >
                  <Typography sx={{ fontSize: "1.25rem" }}>{config.icon}</Typography>
                  <Typography variant="subtitle2">{config.label}</Typography>
                  <Chip
                    size="small"
                    label={filteredTemplates.length}
                    sx={{ ml: "auto" }}
                  />
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0, display: "flex", flexDirection: "column" }}>
                  {filteredTemplates.map((template) => (
                    <Box
                      key={template.id}
                      sx={{
                        p: 1.5,
                        borderBottom: 1,
                        borderColor: "divider",
                        "&:last-child": { borderBottom: "none" },
                        "&:hover": {
                          backgroundColor: "var(--palette-action-hover)"
                        }
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 1
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            fontWeight="medium"
                            sx={{ mb: 0.25 }}
                          >
                            {template.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="var(--palette-text-secondary)"
                            sx={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {template.description || "No description"}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="var(--palette-text-disabled)"
                            sx={{ mt: 0.5, display: "block" }}
                          >
                            {template.nodes.length} node{template.nodes.length !== 1 ? "s" : ""}
                          </Typography>
                        </Box>

                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleInsert(template.id)}
                            sx={{ minWidth: 60 }}
                          >
                            Insert
                          </Button>
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, template.id)}
                          >
                            <MoreVert fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Box>

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            backgroundColor: "var(--palette-background-paper)",
            backgroundImage: "none"
          }
        }}
      >
        <MenuItem onClick={handleCopyToClipboard}>
          <ContentCopy fontSize="small" sx={{ mr: 1 }} />
          Copy JSON
        </MenuItem>
        <MenuItem onClick={handleExport}>
          <Download fontSize="small" sx={{ mr: 1 }} />
          Export
        </MenuItem>
        <MenuItem onClick={handleEditOpen}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: "var(--palette-error-main)" }}>
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Save dialog */}
      {onSaveTemplate && (
        <SaveTemplateDialog
          open={saveDialogOpen}
          onClose={() => setSaveDialogOpen(false)}
          onSave={onSaveTemplate}
          nodeCount={selectedNodeCount}
        />
      )}

      {/* Import dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => {
          setImportDialogOpen(false);
          setImportText("");
          setImportError("");
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Import Template</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={8}
            placeholder="Paste template JSON here..."
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError("");
            }}
            error={Boolean(importError)}
            helperText={importError}
            sx={{
              mt: 1,
              fontFamily: "monospace",
              fontSize: "0.75rem"
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportDialogOpen(false);
              setImportText("");
              setImportError("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleImportConfirm} variant="contained">
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Template</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          <TextField
            fullWidth
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained" disabled={!editName.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

TemplatesPanel.displayName = "TemplatesPanel";

export default TemplatesPanel;
