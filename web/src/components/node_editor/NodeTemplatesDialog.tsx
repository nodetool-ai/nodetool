/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Chip,
  TextField
} from "@mui/material";
import GridOnIcon from "@mui/icons-material/GridOn";
import DescriptionIcon from "@mui/icons-material/Description";
import ImageIcon from "@mui/icons-material/Image";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import VideocamIcon from "@mui/icons-material/Videocam";
import PsychologyIcon from "@mui/icons-material/Psychology";
import StorageIcon from "@mui/icons-material/Storage";
import { CloseButton } from "../ui_primitives/CloseButton";
import useNodeTemplatesStore, { TemplateCategory } from "../../stores/NodeTemplatesStore";
import { useInsertNodeTemplate } from "../../hooks/useInsertNodeTemplate";

const styles = (theme: Theme) =>
  css({
    "&.templates-dialog-container": {
      position: "fixed",
      top: "60px",
      right: "20px",
      width: "400px",
      maxHeight: "500px",
      zIndex: 20000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: "fadeIn 0.15s ease-out forwards",
      overflow: "hidden"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "translateY(-10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    },
    "& .dialog-header": {
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .header-icon": {
      marginRight: "12px",
      color: theme.vars.palette.primary.main
    },
    "& .header-title": {
      flex: 1,
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .dialog-content": {
      display: "flex",
      flexDirection: "column",
      padding: "12px 16px"
    },
    "& .search-field": {
      marginBottom: "12px"
    },
    "& .category-chips": {
      display: "flex",
      gap: "6px",
      flexWrap: "wrap",
      marginBottom: "12px"
    },
    "& .category-chip": {
      fontSize: "11px",
      height: "24px",
      transition: "all 0.15s ease"
    },
    "& .category-chip.MuiChip-filled": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText
    },
    "& .results-count": {
      padding: "8px 0",
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .results-list": {
      flex: 1,
      overflowY: "auto",
      padding: 0,
      margin: 0,
      listStyle: "none",
      maxHeight: "300px"
    },
    "& .result-item": {
      padding: 0,
      margin: 0
    },
    "& .result-button": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      padding: "12px 16px",
      minHeight: "64px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.action.selected,
        borderLeft: `3px solid ${theme.vars.palette.primary.main}`
      }
    },
    "& .result-header": {
      display: "flex",
      alignItems: "center",
      width: "100%",
      marginBottom: "4px"
    },
    "& .result-name": {
      flex: 1,
      fontSize: "14px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },
    "& .result-category": {
      fontSize: "10px",
      marginLeft: "8px",
      padding: "2px 6px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.action.disabledBackground,
      color: theme.vars.palette.text.secondary
    },
    "& .result-description": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      lineHeight: "1.4"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "32px",
      marginBottom: "8px",
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "13px"
    }
  });

const CATEGORIES: readonly TemplateCategory[] = [
  "All",
  "Text",
  "Image",
  "Audio",
  "Video",
  "Logic",
  "Data"
] as const;

const getCategoryIcon = (category: TemplateCategory) => {
  switch (category) {
    case "Text":
      return <DescriptionIcon fontSize="small" />;
    case "Image":
      return <ImageIcon fontSize="small" />;
    case "Audio":
      return <MusicNoteIcon fontSize="small" />;
    case "Video":
      return <VideocamIcon fontSize="small" />;
    case "Logic":
      return <PsychologyIcon fontSize="small" />;
    case "Data":
      return <StorageIcon fontSize="small" />;
    default:
      return <GridOnIcon fontSize="small" />;
  }
};

interface NodeTemplatesDialogProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NodeTemplatesDialog: React.FC<NodeTemplatesDialogProps> = memo(
  ({ workflowId: _workflowId, open, onOpenChange }: NodeTemplatesDialogProps) => {
    const theme = useTheme();
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { insertTemplate } = useInsertNodeTemplate();

    const searchTerm = useNodeTemplatesStore((state) => state.searchTerm);
    const selectedCategory = useNodeTemplatesStore((state) => state.selectedCategory);
    const filteredTemplates = useNodeTemplatesStore((state) => state.filteredTemplates);
    const selectedIndex = useNodeTemplatesStore((state) => state.selectedIndex);
    const setSearchTerm = useNodeTemplatesStore((state) => state.setSearchTerm);
    const setSelectedCategory = useNodeTemplatesStore((state) => state.setSelectedCategory);
    const setSelectedIndex = useNodeTemplatesStore((state) => state.setSelectedIndex);
    const moveSelectionUp = useNodeTemplatesStore((state) => state.moveSelectionUp);
    const moveSelectionDown = useNodeTemplatesStore((state) => state.moveSelectionDown);
    const getSelectedTemplate = useNodeTemplatesStore((state) => state.getSelectedTemplate);

    const handleClose = useCallback(() => {
      onOpenChange(false);
      // Reset search and category when closing
      setSearchTerm("");
      setSelectedCategory("All");
    }, [onOpenChange, setSearchTerm, setSelectedCategory]);

    useEffect(() => {
      if (open) {
        // Reset selection when opening
        setSelectedIndex(0);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [open, setSelectedIndex]);

    // Click outside to close
    useEffect(() => {
      if (!open) {
        return;
      }

      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          handleClose();
        }
      };

      let isMounted = true;

      // Delay adding the listener to avoid immediately closing on the same click that opened
      const timeoutId = setTimeout(() => {
        if (isMounted) {
          document.addEventListener("mousedown", handleClickOutside);
        }
      }, 100);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [open, handleClose]);

    useEffect(() => {
      if (!open) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          handleClose();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          const template = getSelectedTemplate();
          if (template) {
            insertTemplate({
              template,
              position: { x: 100, y: 100 }
            });
            handleClose();
          }
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSelectionDown();
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSelectionUp();
          return;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      open,
      handleClose,
      moveSelectionUp,
      moveSelectionDown,
      getSelectedTemplate,
      insertTemplate
    ]);

    const handleInputChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value);
      },
      [setSearchTerm]
    );

    const handleCategoryClick = useCallback(
      (category: TemplateCategory) => () => {
        setSelectedCategory(category);
      },
      [setSelectedCategory]
    );

    const handleResultClick = useCallback(
      (index: number) => (_event: React.MouseEvent) => {
        setSelectedIndex(index);
        const template = filteredTemplates[index];
        if (template) {
          insertTemplate({
            template,
            position: { x: 100, y: 100 }
          });
          handleClose();
        }
      },
      [filteredTemplates, insertTemplate, handleClose, setSelectedIndex]
    );

    if (!open) {
      return null;
    }

    return (
      <Box
        ref={containerRef}
        className="templates-dialog-container"
        css={styles(theme)}
      >
        <Box className="dialog-header">
          <GridOnIcon className="header-icon" fontSize="small" />
          <Typography className="header-title">Node Templates</Typography>
          <CloseButton
            onClick={handleClose}
            tooltip="Close (Escape)"
            buttonSize="small"
            nodrag={false}
          />
        </Box>

        <Box className="dialog-content">
          <TextField
            ref={inputRef}
            className="search-field"
            fullWidth
            size="small"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={handleInputChange}
            autoComplete="off"
          />

          <Box className="category-chips">
            {CATEGORIES.map((category) => (
              <Chip
                key={category}
                className="category-chip"
                label={category}
                onClick={handleCategoryClick(category)}
                variant={selectedCategory === category ? "filled" : "outlined"}
                size="small"
                icon={getCategoryIcon(category)}
              />
            ))}
          </Box>

          <Box className="results-count">
            {filteredTemplates.length > 0 ? (
              <>
                {filteredTemplates.length} template
                {filteredTemplates.length !== 1 ? "s" : ""} available
              </>
            ) : searchTerm ? (
              <>No templates found</>
            ) : (
              <>Select a template to insert</>
            )}
          </Box>

          {filteredTemplates.length > 0 ? (
            <List className="results-list">
              {filteredTemplates.map((template, index) => (
                <ListItem
                  key={template.id}
                  className="result-item"
                  disablePadding
                >
                  <ListItemButton
                    className={`result-button ${
                      index === selectedIndex ? "selected" : ""
                    }`}
                    onClick={handleResultClick(index)}
                  >
                    <Box className="result-header">
                      <Typography className="result-name">
                        {template.name}
                      </Typography>
                      <Typography className="result-category">
                        {template.category}
                      </Typography>
                    </Box>
                    <Typography className="result-description">
                      {template.description}
                    </Typography>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          ) : searchTerm ? (
            <Box className="empty-state">
              <GridOnIcon className="empty-icon" />
              <Typography className="empty-text">
                No matching templates
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Box>
    );
  }
);

NodeTemplatesDialog.displayName = "NodeTemplatesDialog";

export { NodeTemplatesDialog };
export default NodeTemplatesDialog;
