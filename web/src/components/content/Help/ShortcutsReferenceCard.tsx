/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { css } from "@emotion/react";
import {
  Box,
  Button,
  Typography,
  ToggleButtonGroup,
  ToggleButton
} from "@mui/material";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  getShortcutTooltip,
  type Shortcut
} from "../../../config/shortcuts";
import PrintIcon from "@mui/icons-material/Print";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { isMac } from "../../../utils/platform";

interface ShortcutsReferenceCardProps {
  onClose?: () => void;
}

/**
 * ShortcutsReferenceCard Component
 *
 * Provides a printable, well-formatted reference card for all keyboard shortcuts.
 * Features:
 * - Categorized shortcuts display
 * - OS-specific toggle (macOS/Windows)
 * - Print/PDF export functionality via native browser print
 * - Optimized layout for both screen and print media
 *
 * @example
 * ```tsx
 * <ShortcutsReferenceCard onClose={() => setShowCard(false)} />
 * ```
 */
const ShortcutsReferenceCard: React.FC<ShortcutsReferenceCardProps> = ({
  onClose
}) => {
  const theme = useTheme();
  const [os, setOs] = useState<"mac" | "win">(isMac() ? "mac" : "win");
  const [selectedCategories, setSelectedCategories] = useState<
    readonly ("all" | Shortcut["category"])[]
  >(["all"]);

  const handleCategoryToggle = (
    _: React.MouseEvent<HTMLElement>,
    newCategories: readonly ("all" | Shortcut["category"])[]
  ) => {
    if (newCategories.length) {
      setSelectedCategories(newCategories);
    }
  };

  const filteredShortcuts = NODE_EDITOR_SHORTCUTS.filter((shortcut) => {
    if (selectedCategories.includes("all")) {
      return true;
    }
    return selectedCategories.includes(shortcut.category);
  });

  const handlePrint = () => {
    window.print();
    onClose?.();
  };

  const categories = Object.keys(SHORTCUT_CATEGORIES) as Array<
    keyof typeof SHORTCUT_CATEGORIES
  >;

  const shortcutsByCategory = categories.reduce((acc, category) => {
    const categoryShortcuts = filteredShortcuts.filter(
      (s) => s.category === category
    );
    if (categoryShortcuts.length > 0) {
      acc[category] = categoryShortcuts;
    }
    return acc;
  }, {} as Record<string, Shortcut[]>);

  const referenceCardStyles = (theme: Theme) =>
    css({
      ".reference-card": {
        padding: "2rem",
        backgroundColor: theme.vars.palette.background.paper,
        maxHeight: "70vh",
        overflowY: "auto",
        "&::-webkit-scrollbar": {
          width: "8px"
        },
        "&::-webkit-scrollbar-track": {
          background: theme.vars.palette.background.default
        },
        "&::-webkit-scrollbar-thumb": {
          background: theme.vars.palette.grey[500],
          borderRadius: "4px"
        },
        "&::-webkit-scrollbar-thumb:hover": {
          background: theme.vars.palette.grey[400]
        }
      },
      ".header": {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
        gap: "1rem"
      },
      ".title-section": {
        flex: 1,
        minWidth: "200px"
      },
      ".controls": {
        display: "flex",
        gap: "1rem",
        alignItems: "center",
        flexWrap: "wrap"
      },
      ".category-section": {
        marginBottom: "2rem",
        pageBreakInside: "avoid"
      },
      ".category-title": {
        fontSize: "1.5rem",
        fontWeight: 600,
        marginBottom: "1rem",
        color: theme.vars.palette.primary.main,
        borderBottom: `2px solid ${theme.vars.palette.divider}`,
        paddingBottom: "0.5rem",
        pageBreakAfter: "avoid"
      },
      ".shortcut-item": {
        display: "flex",
        alignItems: "center",
        padding: "0.5rem 0",
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        pageBreakInside: "avoid",
        "&:last-child": {
          borderBottom: "none"
        }
      },
      ".shortcut-title": {
        flex: "0 0 180px",
        fontSize: "0.95rem",
        fontWeight: 500,
        color: theme.vars.palette.text.primary
      },
      ".shortcut-keys": {
        flex: "0 0 200px",
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        fontSize: "0.85rem",
        color: theme.vars.palette.text.secondary
      },
      ".shortcut-description": {
        flex: 1,
        fontSize: "0.85rem",
        color: theme.vars.palette.text.secondary,
        fontStyle: "italic"
      },
      ".no-shortcuts": {
        textAlign: "center",
        padding: "3rem",
        color: theme.vars.palette.text.secondary,
        fontSize: "1rem"
      },
      ".kbd": {
        display: "inline-block",
        padding: "0.25rem 0.5rem",
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: "4px",
        backgroundColor: theme.vars.palette.background.default,
        fontFamily: "monospace",
        fontSize: "0.8rem",
        fontWeight: 600
      },
      "@media print": {
        ".reference-card": {
          maxHeight: "none",
          overflow: "visible",
          padding: "1rem",
          backgroundColor: "#ffffff"
        },
        ".header": {
          marginBottom: "1rem",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact"
        },
        ".controls": {
          display: "none"
        },
        ".category-section": {
          marginBottom: "1.5rem",
          pageBreakInside: "avoid"
        },
        ".category-title": {
          fontSize: "1.25rem",
          color: "#000000",
          borderBottom: "2px solid #000000",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
          pageBreakAfter: "avoid"
        },
        ".shortcut-item": {
          borderBottom: "1px solid #cccccc"
        },
        ".shortcut-title": {
          color: "#000000"
        },
        ".shortcut-description": {
          color: "#333333"
        },
        ".kbd": {
          border: "1px solid #000000",
          backgroundColor: "#f5f5f5",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact"
        },
        ".no-shortcuts": {
          display: "none"
        }
      }
    });

  return (
    <Box css={referenceCardStyles(theme)}>
      <div className="reference-card">
        <div className="header">
          <div className="title-section">
            <Typography variant="h4" gutterBottom>
              NodeTool Keyboard Shortcuts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Quick reference guide for all keyboard shortcuts
            </Typography>
          </div>
          <div className="controls">
            <ToggleButtonGroup
              value={os}
              exclusive
              onChange={(_, value) => value && setOs(value)}
              size="small"
              aria-label="Operating System"
            >
              <ToggleButton value="mac">macOS</ToggleButton>
              <ToggleButton value="win">Windows/Linux</ToggleButton>
            </ToggleButtonGroup>

            <ToggleButtonGroup
              value={selectedCategories}
              onChange={handleCategoryToggle}
              size="small"
              aria-label="Filter by category"
            >
              <ToggleButton value="all">All</ToggleButton>
              {categories.map((cat) => (
                <ToggleButton key={cat} value={cat}>
                  {SHORTCUT_CATEGORIES[cat]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={handlePrint}
              size="small"
              aria-label="Print reference card"
            >
              Print / PDF
            </Button>
          </div>
        </div>

        {Object.keys(shortcutsByCategory).length === 0 ? (
          <Typography className="no-shortcuts">
            No shortcuts match the selected categories.
          </Typography>
        ) : (
          <>
            {Object.entries(shortcutsByCategory).map(([category, shortcuts]) => (
              <div key={category} className="category-section">
                <Typography className="category-title">
                  {SHORTCUT_CATEGORIES[category as keyof typeof SHORTCUT_CATEGORIES]}
                </Typography>
                {shortcuts.map((shortcut) => (
                  <div key={shortcut.slug} className="shortcut-item">
                    <Typography className="shortcut-title">
                      {shortcut.title}
                    </Typography>
                    <Box className="shortcut-keys">
                      {getShortcutTooltip(shortcut.slug, os, "combo")}
                    </Box>
                    {shortcut.description && (
                      <Typography className="shortcut-description">
                        {shortcut.description}
                      </Typography>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </Box>
  );
};

export default ShortcutsReferenceCard;
