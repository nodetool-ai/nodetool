/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, ReactNode, useMemo } from "react";
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  InputAdornment,
  Box,
  FormControlLabel,
  Tooltip,
  Checkbox,
  Button,
} from "@mui/material";
import Fuse from "fuse.js";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { overviewContents, Section } from "../content/Welcome/OverviewContent";
import { useSettingsStore } from "../../stores/SettingsStore";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";

const extractText = (node: ReactNode): string => {
  if (typeof node === "string") {return node;}
  if (React.isValidElement(node)) {
    return React.Children.toArray(node.props.children)
      .map(extractText)
      .join(" ");
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join(" ");
  }
  return "";
};

const panelStyles = (theme: any) =>
  css({
    "&": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: "0.75em"
    },
    ".panel-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "0.75em",
      paddingBottom: "0.5em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".tabs-and-search": {
      marginBottom: "0.75em"
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".quick-start": {
      borderRadius: "8px",
      padding: "0.75em",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      marginBottom: "1em"
    },
    ".quick-start-grid": {
      marginTop: "0.5em"
    },
    ".quick-card": {
      borderRadius: "6px",
      transition: "transform .15s ease, border-color .15s ease",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: "var(--palette-primary-main)"
      }
    },
    ".quick-card .MuiCardContent-root": {
      padding: "0.75em"
    },
    ".quick-card-icon": {
      fontSize: "20px",
      color: "var(--palette-primary-main)"
    },
    ".quick-card-title": {
      marginTop: "4px",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      fontWeight: 500
    },
    ".quick-card-desc": {
      opacity: 0.85,
      marginTop: "2px",
      fontSize: "0.85em",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical" as unknown as undefined,
      overflow: "hidden"
    },
    ".MuiAccordion-root": {
      color: theme.vars.palette.grey[0],
      borderBottom: `1px solid ${theme.vars.palette.grey[500]}`,
      backgroundColor: theme.vars.palette.c_editor_bg_color,
      marginBottom: "0.5em",
      "&:before": {
        display: "none"
      }
    },
    ".MuiAccordionSummary-root": {
      minHeight: "40px",
      padding: "0 0.5em"
    },
    ".MuiAccordionDetails-root": {
      padding: "0.75em"
    },
    ".highlight": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      padding: "0 2px"
    }
  });

const WelcomePanel: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  
  const sections: Section[] = [
    ...overviewContents
  ].map((section) => ({
    ...section,
    originalContent: section.content
  }));
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const theme = useTheme();

  const handleToggleWelcomeOnStartup = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    updateSettings({ showWelcomeOnStartup: event.target.checked });
  };

  const highlightText = (text: string, term: string) => {
    if (!term) {return text;}
    const parts = text.split(new RegExp(`(${term})`, "gi"));
    return parts.map((part, index) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <span key={index} className="highlight">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const performSearch = useCallback(
    (searchTerm: string) => {
      if (searchTerm.length > 1) {
        const fuseOptions = {
          keys: [
            { name: "title", weight: 0.4 },
            { name: "content", weight: 0.6 }
          ],
          includeMatches: true,
          ignoreLocation: true,
          threshold: 0.2,
          distance: 100,
          shouldSort: true,
          includeScore: true,
          minMatchCharLength: 2,
          useExtendedSearch: true,
          tokenize: true,
          matchAllTokens: false
        };

        const entries = sections.map((section) => ({
          ...section,
          content: extractText(section.content)
        }));

        const fuse = new Fuse(entries, fuseOptions);
        const filteredData = fuse
          .search(searchTerm)
          .map((result) => result.item);

        return filteredData;
      }
      return searchTerm.length === 0 ? sections : [];
    },
    [sections]
  );

  const filteredSections = useMemo(
    () => performSearch(searchTerm),
    [performSearch, searchTerm]
  );

  const renderContent = (content: ReactNode): ReactNode => {
    if (typeof content === "string") {
      return highlightText(content, searchTerm);
    }
    if (React.isValidElement(content)) {
      return React.cloneElement(
        content,
        {},
        React.Children.map(content.props.children, (child) =>
          typeof child === "string"
            ? highlightText(child, searchTerm)
            : renderContent(child)
        )
      );
    }
    if (Array.isArray(content)) {
      return content.map((item, index) => (
        <React.Fragment key={index}>{renderContent(item)}</React.Fragment>
      ));
    }
    return content;
  };

  return (
    <Box css={panelStyles(theme)} className="welcome-panel-container">
      <div className="panel-header">
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          Welcome to NodeTool
        </Typography>
        <Tooltip
          title="You can always open this panel from the Add Panel menu."
          arrow
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.showWelcomeOnStartup}
                onChange={handleToggleWelcomeOnStartup}
                name="showWelcomeOnStartup"
                size="small"
              />
            }
            label="Show on Startup"
            sx={{ margin: 0 }}
          />
        </Tooltip>
      </div>

      <div className="tabs-and-search">
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder="Search help and tips"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
      </div>

      <div className="scrollable-content">
        {(() => {
          const list = searchTerm === "" ? sections : filteredSections;
          if (!list || list.length === 0) {
            return (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  No results. Try different keywords or clear the search.
                </Typography>
                <Button
                  size="small"
                  onClick={() => setSearchTerm("")}
                  sx={{ mt: 1 }}
                >
                  Clear search
                </Button>
              </Box>
            );
          }
          return list.map((section, index) => (
            <Accordion
              key={section.id}
              defaultExpanded={index === 0 && searchTerm === ""}
              className="welcome-accordion"
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{ minHeight: "auto" }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {highlightText(section.title, searchTerm)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" sx={{ fontSize: "0.9em" }}>
                  {renderContent(section.originalContent)}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ));
        })()}
      </div>
    </Box>
  );
};

export default WelcomePanel;
