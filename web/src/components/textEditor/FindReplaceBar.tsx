/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ReplaceIcon from "@mui/icons-material/FindReplace";
import {
  CloseButton,
  TextInput,
  Toolbar,
  ToolbarGroup,
  ToolbarIconButton,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";

const MAX_SEARCH_LENGTH = 1000;

const isValidInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SEARCH_LENGTH;
};

interface FindReplaceBarProps {
  onFind?: (searchTerm: string) => void;
  onReplace?: (
    searchTerm: string,
    replaceTerm: string,
    replaceAll?: boolean
  ) => void;
  onClose?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  currentMatch?: number;
  totalMatches?: number;
  isVisible?: boolean;
}

const FIELD_SX = { width: "16em" };

const styles = (theme: Theme) =>
  // Only the fields inside: the bar's surface, rule and layout are Toolbar's.
  css({
    ".match-info": {
      ...TYPOGRAPHY.mono.caption,
      color: theme.vars.palette.text.disabled,
      minWidth: "4em",
      textAlign: "center",
      "&.has-matches": { color: theme.vars.palette.text.primary }
    }
  });

const FindReplaceBar = ({
  onFind,
  onReplace,
  onClose,
  onNext,
  onPrevious,
  currentMatch = 0,
  totalMatches = 0,
  isVisible = true
}: FindReplaceBarProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, MAX_SEARCH_LENGTH);
      setSearchTerm(value);
    },
    []
  );

  const handleReplaceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, MAX_SEARCH_LENGTH);
      setReplaceTerm(value);
    },
    []
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isValidInput(searchTerm) && onFind) {
        onFind(searchTerm);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, onFind]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        onPrevious?.();
      } else {
        onNext?.();
      }
    } else if (e.key === "Escape") {
      onClose?.();
    }
  };

  const handleReplace = useCallback(() => {
    if (onReplace && isValidInput(searchTerm)) {
      onReplace(searchTerm, replaceTerm, false);
    }
  }, [onReplace, searchTerm, replaceTerm]);

  const handleReplaceAll = useCallback(() => {
    if (onReplace && isValidInput(searchTerm)) {
      onReplace(searchTerm, replaceTerm, true);
    }
  }, [onReplace, searchTerm, replaceTerm]);

  const handleToggleReplace = useCallback(() => {
    setShowReplace(!showReplace);
  }, [showReplace]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  if (!isVisible) {
    return null;
  }

  const isValidSearch = isValidInput(searchTerm);

  return (
    <Toolbar
      className="find-replace-bar"
      role="toolbar"
      aria-label={t("screen_scripts_text.textEditor.findReplace")}
      density="compact"
      css={styles(theme)}
      sx={{ flexWrap: "wrap", py: SPACING.xs, pl: SPACING.xl }}
    >
      <ToolbarGroup className="search-group">
        <TextInput
          className="search-input"
          size="small"
          compact
          fullWidth={false}
          sx={FIELD_SX}
          placeholder={t("screen_scripts_text.textEditor.find")}
          value={searchTerm}
          onChange={handleSearchChange}
          onKeyDown={handleKeyDown}
          autoFocus
          slotProps={{
            htmlInput: {
              "aria-label": t("screen_scripts_text.textEditor.searchText"),
              maxLength: MAX_SEARCH_LENGTH
            }
          }}
        />

        <div className={`match-info${totalMatches > 0 ? " has-matches" : ""}`}>
          {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : "0/0"}
        </div>

        <ToolbarIconButton
          icon={<KeyboardArrowUpIcon fontSize="small" />}
          tooltip={t("screen_scripts_text.textEditor.previousMatch")}
          onClick={onPrevious}
          disabled={totalMatches === 0}
          className="toolbar-button"
        />

        <ToolbarIconButton
          icon={<KeyboardArrowDownIcon fontSize="small" />}
          tooltip={t("screen_scripts_text.textEditor.nextMatch")}
          onClick={onNext}
          disabled={totalMatches === 0}
          className="toolbar-button"
        />

        <ToolbarIconButton
          icon={<ReplaceIcon fontSize="small" />}
          tooltip={t("screen_scripts_text.textEditor.toggleReplace")}
          onClick={handleToggleReplace}
          className="toolbar-button"
        />
      </ToolbarGroup>

      {showReplace && (
        <ToolbarGroup className="search-group">
          <TextInput
            className="replace-input"
            size="small"
            compact
            fullWidth={false}
            sx={FIELD_SX}
            placeholder={t("screen_scripts_text.textEditor.replaceWith")}
            value={replaceTerm}
            onChange={handleReplaceChange}
            onKeyDown={handleKeyDown}
            slotProps={{
              htmlInput: {
                "aria-label": t("screen_scripts_text.textEditor.replaceText"),
                maxLength: MAX_SEARCH_LENGTH
              }
            }}
          />

          <span>
            <ToolbarIconButton
              icon={
                <span style={TYPOGRAPHY.sans.label}>
                  {t("i18n-next113.textEditor.replace")}
                </span>
              }
              tooltip={t("screen_scripts_text.textEditor.replace")}
              onClick={handleReplace}
              disabled={!isValidSearch || totalMatches === 0}
              className="toolbar-button"
            />
          </span>

          <span>
            <ToolbarIconButton
              icon={
                <span style={TYPOGRAPHY.sans.label}>
                  {t("i18n-next113.textEditor.all")}
                </span>
              }
              tooltip={t("screen_scripts_text.textEditor.replaceAll")}
              onClick={handleReplaceAll}
              disabled={!isValidSearch || totalMatches === 0}
              className="toolbar-button"
            />
          </span>
        </ToolbarGroup>
      )}

      <CloseButton
        onClick={handleClose}
        buttonSize="small"
        tooltip={t("screen_scripts_text.textEditor.closeFindReplace")}
        className="toolbar-button"
      />
    </Toolbar>
  );
};

export default memo(FindReplaceBar);
