/**
 * TemplateBrowser Component
 *
 * Panel for browsing, searching, and inserting node templates.
 */

import React, { useCallback, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Button,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
  CircularProgress
} from "@mui/material";
import {
  Close as CloseIcon,
  Search as SearchIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Star as StarIcon,
  Category as CategoryIcon
} from "@mui/icons-material";
import { useNodeSelectionTemplate } from "../../hooks/useNodeSelectionTemplate";
import { NodeTemplate } from "../../stores/NodeSelectionTemplateStore";
import { Node, Edge } from "@xyflow/react";

interface TemplateBrowserProps {
  onInsertTemplate: (nodes: Node[], edges: Edge[], offset: { x: number; y: number }) => void;
  onClose: () => void;
}

const formatUsageCount = (count: number): string => {
  if (count === 0) return "Never used";
  if (count === 1) return "Used once";
  return `Used ${count} times`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const TemplateListItem: React.FC<{
  template: NodeTemplate;
  onSelect: () => void;
  onInsert: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isSelected: boolean;
}> = ({ template, onSelect, onInsert, onDuplicate, onDelete, isSelected }) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  return (
    <>
      <ListItem
        disablePadding
        secondaryAction={
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Tooltip title="Insert template">
              <IconButton edge="end" size="small" onClick={onInsert}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton edge="end" size="small" onClick={handleMenuOpen}>
              <MoreIcon fontSize="small" />
            </IconButton>
          </Box>
        }
        sx={{
          bgcolor: isSelected ? "action.selected" : "transparent",
          "&:hover": {
            bgcolor: isSelected ? "action.selected" : "action.hover"
          }
        }}
      >
        <ListItemButton onClick={onSelect} dense>
          <ListItemAvatar>
            <Avatar
              sx={{
                bgcolor: "primary.main",
                width: 36,
                height: 36,
                fontSize: "0.875rem"
              }}
            >
              {template.name.charAt(0).toUpperCase()}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" fontWeight="medium" noWrap>
                  {template.name}
                </Typography>
                <Chip
                  label={template.category}
                  size="small"
                  sx={{ height: 20, fontSize: "0.7rem" }}
                />
              </Box>
            }
            secondary={
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ maxWidth: 200 }}
                >
                  {template.description || "No description"}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {template.nodes.length} nodes • {formatDate(template.updatedAt)} •{" "}
                  {formatUsageCount(template.usageCount)}
                </Typography>
              </Box>
            }
          />
        </ListItemButton>
      </ListItem>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem onClick={() => { handleMenuClose(); onDuplicate(); }}>
          <CopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem onClick={handleMenuClose}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => { handleMenuClose(); onDelete(); }}
          sx={{ color: "error.main" }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </>
  );
};

export const TemplateBrowser: React.FC<TemplateBrowserProps> = ({
  onInsertTemplate,
  onClose
}) => {
  const {
    searchTemplates,
    searchQuery,
    setSearchQuery,
    selectedTemplateId,
    setSelectedTemplateId,
    prepareTemplateForInsertion,
    duplicateTemplate,
    deleteTemplate,
    categories,
    getTemplatesByCategory
  } = useNodeSelectionTemplate();

  const [activeCategory, setActiveCategory] = React.useState("all");

  const filteredTemplates = useMemo(() => {
    const categoryTemplates =
      activeCategory === "all" ? getTemplatesByCategory(activeCategory) : getTemplatesByCategory(activeCategory);
    if (!searchQuery.trim()) {
      return categoryTemplates;
    }
    return searchTemplates(searchQuery).filter(
      (t) => activeCategory === "all" || t.category === activeCategory
    );
  }, [activeCategory, searchQuery, searchTemplates, getTemplatesByCategory]);

  const handleSelect = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(selectedTemplateId === templateId ? null : templateId);
    },
    [selectedTemplateId, setSelectedTemplateId]
  );

  const handleInsert = useCallback(
    (templateId: string) => {
      const result = prepareTemplateForInsertion(templateId);
      if (result) {
        onInsertTemplate(result.nodes, result.edges, result.offset);
      }
    },
    [prepareTemplateForInsertion, onInsertTemplate]
  );

  const handleDuplicate = useCallback(
    (templateId: string) => {
      const newId = duplicateTemplate(templateId);
      if (newId) {
        setSelectedTemplateId(newId);
      }
    },
    [duplicateTemplate, setSelectedTemplateId]
  );

  const handleDelete = useCallback(
    (templateId: string) => {
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
      deleteTemplate(templateId);
    },
    [selectedTemplateId, setSelectedTemplateId, deleteTemplate]
  );

  return (
    <Paper
      elevation={3}
      sx={{
        width: 320,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StarIcon color="primary" />
          <Typography variant="h6">Templates</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            )
          }}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          overflowX: "auto"
        }}
      >
        <Chip
          label="All"
          onClick={() => setActiveCategory("all")}
          color={activeCategory === "all" ? "primary" : "default"}
          variant={activeCategory === "all" ? "filled" : "outlined"}
          size="small"
        />
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            label={cat.name}
            onClick={() => setActiveCategory(cat.id)}
            color={activeCategory === cat.id ? "primary" : "default"}
            variant={activeCategory === cat.id ? "filled" : "outlined"}
            size="small"
            icon={cat.icon ? <CategoryIcon /> : undefined}
          />
        ))}
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {filteredTemplates.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              {searchQuery ? "No templates found" : "No templates saved yet"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Select nodes and save them as a template to get started
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 1 }}>
            {filteredTemplates.map((template) => (
              <TemplateListItem
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                onSelect={() => handleSelect(template.id)}
                onInsert={() => handleInsert(template.id)}
                onDuplicate={() => handleDuplicate(template.id)}
                onDelete={() => handleDelete(template.id)}
              />
            ))}
          </List>
        )}
      </Box>

      <Box
        sx={{
          p: 1.5,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {filteredTemplates.length} template(s)
        </Typography>
      </Box>
    </Paper>
  );
};

export default TemplateBrowser;
