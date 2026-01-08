/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import {
  Box,
  Card,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Divider,
  Button,
  useTheme,
} from "@mui/material";
import {
  PushPin as PinIcon,
  PushPinOutlined as PinOutlineIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  History as HistoryIcon,
  Star as StarIcon,
} from "@mui/icons-material";
import { css } from "@emotion/react";
import useRecentTemplates from "../../hooks/useRecentTemplates";
import { RecentTemplate } from "../../stores/RecentTemplatesStore";

interface RecentTemplatesPanelProps {
  onSelectTemplate?: (template: RecentTemplate) => void;
  maxDisplay?: number;
  showCategories?: boolean;
}

const RecentTemplatesPanel: React.FC<RecentTemplatesPanelProps> = ({
  onSelectTemplate,
  maxDisplay = 6,
  showCategories = true,
}) => {
  const theme = useTheme();
  const {
    recentTemplates,
    pinnedTemplateIds,
    addTemplate,
    removeTemplate,
    pinTemplate,
    unpinTemplate,
    clearRecentTemplates,
    getPopularTemplates,
    getPinnedTemplates,
    isPinned,
  } = useRecentTemplates();

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<RecentTemplate | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, template: RecentTemplate) => {
    setMenuAnchor(event.currentTarget);
    setSelectedTemplate(template);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedTemplate(null);
  };

  const handlePinToggle = () => {
    if (selectedTemplate) {
      if (isPinned(selectedTemplate.id)) {
        unpinTemplate(selectedTemplate.id);
      } else {
        pinTemplate(selectedTemplate.id);
      }
    }
    handleMenuClose();
  };

  const handleRemove = () => {
    if (selectedTemplate) {
      removeTemplate(selectedTemplate.id);
    }
    handleMenuClose();
  };

  const handleSelectTemplate = (template: RecentTemplate) => {
    addTemplate(template);
    onSelectTemplate?.(template);
  };

  const handleClearAll = () => {
    clearRecentTemplates();
  };

  const pinnedTemplates = getPinnedTemplates();
  const popularTemplates = getPopularTemplates(maxDisplay);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      image: theme.vars.palette.primary.main,
      text: theme.vars.palette.secondary.main,
      audio: theme.vars.palette.warning.main,
      video: theme.vars.palette.error.main,
      data: theme.vars.palette.success.main,
      workflow: theme.vars.palette.info.main,
    };
    return colors[category.toLowerCase()] || theme.vars.palette.grey[500];
  };

  const styles = {
    container: css`
      width: 100%;
      max-width: 400px;
      background: ${theme.vars.palette.background.paper};
      border-radius: ${theme.shape.borderRadius}px;
    `,
    header: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: ${theme.spacing(1, 2)};
      border-bottom: 1px solid ${theme.vars.palette.divider};
    `,
    title: css`
      display: flex;
      align-items: center;
      gap: ${theme.spacing(1)};
      font-weight: 600;
    `,
    section: css`
      padding: ${theme.spacing(1, 2)};
    `,
    sectionTitle: css`
      display: flex;
      align-items: center;
      gap: ${theme.spacing(0.5)};
      font-size: 0.75rem;
      font-weight: 600;
      color: ${theme.vars.palette.text.secondary};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: ${theme.spacing(1)};
    `,
    templateCard: css`
      display: flex;
      align-items: center;
      gap: ${theme.spacing(1.5)};
      padding: ${theme.spacing(1)};
      border-radius: ${theme.shape.borderRadius}px;
      transition: background-color 0.2s;
      cursor: pointer;
      border: 1px solid transparent;

      &:hover {
        background-color: ${theme.vars.palette.action.hover};
      }

      &:hover .template-actions {
        opacity: 1;
      }
    `,
    templateIcon: css`
      width: 40px;
      height: 40px;
      border-radius: ${theme.shape.borderRadius}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${theme.vars.palette.action.selected};
      font-size: 1.2rem;
    `,
    templateInfo: css`
      flex: 1;
      min-width: 0;
    `,
    templateName: css`
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `,
    templateMeta: css`
      font-size: 0.75rem;
      color: ${theme.vars.palette.text.secondary};
      display: flex;
      align-items: center;
      gap: ${theme.spacing(1)};
    `,
    templateActions: css`
      opacity: 0;
      transition: opacity 0.2s;
    `,
    emptyState: css`
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: ${theme.spacing(4)};
      color: ${theme.vars.palette.text.secondary};
      text-align: center;
    `,
    chip: css`
      font-size: 0.65rem;
      height: 20px;
    `,
  };

  if (recentTemplates.length === 0) {
    return (
      <Card css={styles.container}>
        <Box css={styles.header}>
          <Box css={styles.title}>
            <HistoryIcon fontSize="small" />
            <Typography variant="subtitle1">Recent Templates</Typography>
          </Box>
        </Box>
        <Box css={styles.emptyState}>
          <HistoryIcon sx={{ fontSize: 48, opacity: 0.5, mb: 1 }} />
          <Typography variant="body2">No recent templates yet</Typography>
          <Typography variant="caption" color="text.secondary">
            Templates you use will appear here for quick access
          </Typography>
        </Box>
      </Card>
    );
  }

  return (
    <Card css={styles.container}>
      <Box css={styles.header}>
        <Box css={styles.title}>
          <HistoryIcon fontSize="small" />
          <Typography variant="subtitle1">Recent Templates</Typography>
        </Box>
        <Button
          size="small"
          variant="text"
          onClick={handleClearAll}
          sx={{ fontSize: "0.75rem" }}
        >
          Clear All
        </Button>
      </Box>

      {pinnedTemplates.length > 0 && (
        <Box css={styles.section}>
          <Box css={styles.sectionTitle}>
            <StarIcon sx={{ fontSize: 14 }} />
            Pinned
          </Box>
          {pinnedTemplates.slice(0, maxDisplay).map((template) => (
            <Box
              key={template.id}
              css={styles.templateCard}
              onClick={() => handleSelectTemplate(template)}
            >
              <Box css={styles.templateIcon}>
                {template.thumbnail || "📁"}
              </Box>
              <Box css={styles.templateInfo}>
                <Typography css={styles.templateName} variant="body2">
                  {template.name}
                </Typography>
                <Box css={styles.templateMeta}>
                  {showCategories && (
                    <Chip
                      label={template.category}
                      size="small"
                      css={styles.chip}
                      sx={{
                        backgroundColor: `${getCategoryColor(template.category)}20`,
                        color: getCategoryColor(template.category),
                      }}
                    />
                  )}
                  <Typography variant="caption">
                    {template.useCount} uses
                  </Typography>
                </Box>
              </Box>
              <Box className="template-actions" css={styles.templateActions}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    pinTemplate(template.id);
                  }}
                >
                  <PinIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, template)}
                >
                  <MoreIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 1 }} />

      <Box css={styles.section}>
        <Box css={styles.sectionTitle}>
          <HistoryIcon sx={{ fontSize: 14 }} />
          Recent
        </Box>
        {popularTemplates
          .filter((t) => !pinnedTemplateIds.includes(t.id))
          .slice(0, maxDisplay)
          .map((template) => (
            <Box
              key={template.id}
              css={styles.templateCard}
              onClick={() => handleSelectTemplate(template)}
            >
              <Box css={styles.templateIcon}>
                {template.thumbnail || "📁"}
              </Box>
              <Box css={styles.templateInfo}>
                <Typography css={styles.templateName} variant="body2">
                  {template.name}
                </Typography>
                <Box css={styles.templateMeta}>
                  {showCategories && (
                    <Chip
                      label={template.category}
                      size="small"
                      css={styles.chip}
                      sx={{
                        backgroundColor: `${getCategoryColor(template.category)}20`,
                        color: getCategoryColor(template.category),
                      }}
                    />
                  )}
                  <Typography variant="caption">
                    {template.useCount} uses
                  </Typography>
                </Box>
              </Box>
              <Box className="template-actions" css={styles.templateActions}>
                <Tooltip title="Pin to top">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      pinTemplate(template.id);
                    }}
                  >
                    <PinOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, template)}
                >
                  <MoreIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handlePinToggle}>
          <ListItemIcon>
            {selectedTemplate && isPinned(selectedTemplate.id) ? (
              <PinOutlineIcon fontSize="small" />
            ) : (
              <PinIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>
            {selectedTemplate && isPinned(selectedTemplate.id)
              ? "Unpin"
              : "Pin to top"}
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleRemove} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Remove from list</ListItemText>
        </MenuItem>
      </Menu>
    </Card>
  );
};

export default RecentTemplatesPanel;
