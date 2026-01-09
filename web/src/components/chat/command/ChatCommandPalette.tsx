/** @jsxImportSource @emotion/react */
import React, { useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Paper, Typography } from "@mui/material";
import { useChatCommandStore, COMMAND_CATEGORIES } from "../../../stores/ChatCommandStore";

const paletteStyles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    maxHeight: "300px",
    overflow: "hidden",
    marginBottom: "8px",
    zIndex: 10000,
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: "12px",
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0,0,0,0.08)",
    border: `1px solid ${theme.vars.palette.divider}`,
    backdropFilter: "blur(12px)",
    animation: "fadeInUp 0.15s ease-out forwards",
    "@keyframes fadeInUp": {
      "0%": { opacity: 0, transform: "translateY(10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
    }
  });

const commandListStyles = css({
  maxHeight: "240px",
  overflowY: "auto",
  padding: "8px 4px"
});

const categoryHeaderStyles = css({
  padding: "4px 12px",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "inherit",
  opacity: 0.7
});

const commandItemStyles = (selected: boolean, theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    backgroundColor: selected
      ? theme.vars.palette.primary.main + "15"
      : "transparent",
    borderRadius: "8px",
    margin: "2px 4px",
    transition: "all 0.1s ease",
    "&:hover": {
      backgroundColor: selected
        ? theme.vars.palette.primary.main + "20"
        : theme.vars.palette.action.hover
    },
    "&:focus": {
      outline: "none",
      backgroundColor: theme.vars.palette.primary.main + "15"
    }
  });

const commandIconStyles = css({
  width: "24px",
  height: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
  flexShrink: 0
});

const commandInfoStyles = css({
  flex: 1,
  minWidth: 0
});

const commandNameStyles = css({
  fontSize: "13px",
  fontWeight: 500,
  color: "inherit"
});

const commandDescriptionStyles = css({
  fontSize: "11px",
  opacity: 0.7,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis"
});

const commandUsageStyles = css({
  fontSize: "11px",
  fontFamily: "monospace",
  opacity: 0.5,
  flexShrink: 0
});

const searchInputStyles = (theme: Theme) =>
  css({
    width: "100%",
    padding: "12px 12px 8px 12px",
    border: "none",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: "transparent",
    fontSize: "14px",
    color: theme.vars.palette.text.primary,
    "&:focus": {
      outline: "none"
    },
    "&::placeholder": {
      color: theme.vars.palette.text.secondary,
      opacity: 0.6
    }
  });

const footerStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 12px",
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    fontSize: "10px",
    opacity: 0.6,
    backgroundColor: theme.vars.palette.background.default,
    "& kbd": {
      padding: "2px 4px",
      borderRadius: "3px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      fontFamily: "inherit"
    }
  });

interface ChatCommandPaletteProps {
  onSelectCommand: (command: string, args: string) => void;
  onClose: () => void;
}

const ChatCommandPalette: React.FC<ChatCommandPaletteProps> = ({
  onSelectCommand,
  onClose
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen,
    searchTerm,
    filteredCommands,
    selectedIndex,
    setSearchTerm,
    moveSelectionUp,
    moveSelectionDown,
    closePalette
  } = useChatCommandStore();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) {
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelectionUp();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelectionDown();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          const args = searchTerm.replace(`/${command.name}`, "").trim();
          onSelectCommand(command.name, args);
          closePalette();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchTerm, filteredCommands, selectedIndex, moveSelectionUp, moveSelectionDown, onSelectCommand, closePalette, onClose]);

  if (!isOpen) {
    return null;
  }

  const groupedCommands = filteredCommands.reduce(
    (acc, command) => {
      const category = COMMAND_CATEGORIES[command.category];
      if (!acc[command.category]) {
        acc[command.category] = {
          category,
          commands: []
        };
      }
      acc[command.category].commands.push(command);
      return acc;
    },
    {} as Record<string, { category: typeof COMMAND_CATEGORIES[keyof typeof COMMAND_CATEGORIES]; commands: typeof filteredCommands }>
  );

  return (
    <Paper ref={containerRef} css={paletteStyles(theme)}>
      <Box sx={{ padding: "12px 12px 8px 12px", borderBottom: `1px solid ${theme.vars.palette.divider}` }}>
        <input
          ref={inputRef}
          type="text"
          css={searchInputStyles(theme)}
          placeholder="Search commands..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>
      <Box css={commandListStyles}>
        {Object.values(groupedCommands).map(({ category, commands }) => (
          <Box key={category.id}>
            <Box css={categoryHeaderStyles}>{category.icon} {category.name}</Box>
            {commands.map((command) => {
              const globalIndex = filteredCommands.indexOf(command);
              const isSelected = globalIndex === selectedIndex;

              return (
                <Box
                  key={command.id}
                  css={commandItemStyles(isSelected, theme)}
                  onClick={() => {
                    onSelectCommand(command.name, searchTerm.replace(`/${command.name}`, "").trim());
                    closePalette();
                  }}
                  onMouseEnter={() => useChatCommandStore.getState().setSelectedIndex(globalIndex)}
                >
                  <Box css={commandIconStyles}>{COMMAND_CATEGORIES[command.category].icon}</Box>
                  <Box css={commandInfoStyles}>
                    <Typography css={commandNameStyles} component="span">
                      /{command.name}
                    </Typography>
                    <Typography css={commandDescriptionStyles} component="div">
                      {command.description}
                    </Typography>
                  </Box>
                  <Typography css={commandUsageStyles} component="span">
                    {command.usage}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        ))}
        {filteredCommands.length === 0 && (
          <Box sx={{ padding: "20px", textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">No commands found</Typography>
          </Box>
        )}
      </Box>
      <Box css={footerStyles(theme)}>
        <Box>
          <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select
        </Box>
        <Box>
          <kbd>Esc</kbd> to close
        </Box>
      </Box>
    </Paper>
  );
};

export default ChatCommandPalette;
