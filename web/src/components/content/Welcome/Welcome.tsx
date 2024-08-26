/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, ReactNode, useMemo } from "react";
import {
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Box,
  Link,
  Switch,
  FormControlLabel,
  Tooltip,
} from "@mui/material";
import Fuse from "fuse.js";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import CloseButton from "../../buttons/CloseButton";
import { overviewContents, Section } from "./OverviewContent";
import { css } from "@emotion/react";
import { useSettingsStore } from "../../../stores/SettingsStore";
import WhatsNew from "./WhatsNew";

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

const welcomeStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "#222",
      padding: "2em",
      borderRadius: "1em",
      position: "fixed",
      width: "50vw",
      minWidth: "600px",
      maxWidth: "90vw",
      height: "85vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      overflowY: "auto",
      border: `2px solid ${theme.palette.c_gray3}`,
    },
    ".panel-title": {
      paddingLeft: "0",
      margin: 0,
      color: theme.palette.c_white,
      marginBottom: "1em",
    },
    ".summary": {
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSizeBigger,
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray1,
    },
    ".content": {
      padding: "1em",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSizeBigger,
    },

    ".content ul": {
      marginLeft: "0",
      paddingLeft: "1em",
    },
    ".content ul li": {
      listStyleType: "square",
      marginLeft: "0",
      marginBottom: 0,
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
    },
    ".search": {
      marginBottom: "1em",
    },
    ".MuiAccordion-root": {
      background: "transparent",
      color: theme.palette.c_white,
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
    },
    ".MuiAccordionSummary-content.Mui-expanded": {
      margin: "0",
    },
    ".MuiAccordionSummary-root": {
      minHeight: "48px",
    },
    ".MuiAccordionSummary-content": {
      margin: "12px 0",
    },
    ".MuiTypography-root": {
      fontFamily: theme.fontFamily,
    },
    "ul, ol": {
      fontFamily: theme.fontFamily1,
      paddingLeft: "1.5em",
      marginTop: "0.5em",
    },
    li: {
      marginBottom: "0.5em",
    },
    ".highlight": {
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black,
    },
    ".tab-content": {
      marginTop: "1em",
    },
    ".link": {
      color: theme.palette.c_attention,
      display: "block",
      marginBottom: "1em",
      textDecoration: "none",
    },
    ".link .body": {
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_gray6,
      margin: 0,
    },
    ".header-container": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1em",
    },
  });

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`overview-tabpanel-${index}`}
      aria-labelledby={`overview-tab-${index}`}
    >
      {value === index && <Box className="tab-content">{children}</Box>}
    </div>
  );
}

const extractText = (node: ReactNode): string => {
  if (typeof node === "string") return node;
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

const Welcome = ({ handleClose }: { handleClose: () => void }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [tabValue, setTabValue] = useState(0);
  const sections: Section[] = overviewContents.map((section) => ({
    ...section,
    originalContent: section.content,
  }));
  const { settings, updateSettings } = useSettingsStore();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const highlightText = (text: string, term: string) => {
    if (!term) return text;
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
            { name: "content", weight: 0.6 },
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
          matchAllTokens: false,
        };

        const entries = sections.map((section) => ({
          ...section,
          content: extractText(section.content),
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

  const handleToggleWelcomeOnStartup = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    updateSettings({ showWelcomeOnStartup: event.target.checked });
  };

  return (
    <div css={welcomeStyles}>
      <CloseButton onClick={handleClose} />
      <div className="header-container">
        <Typography className="panel-title" variant="h2">
          NODETOOL
        </Typography>
        <Tooltip
          title="You can always open this screen from the Nodetool logo in the top left."
          arrow
        >
          <FormControlLabel
            control={
              <Switch
                checked={settings.showWelcomeOnStartup}
                onChange={handleToggleWelcomeOnStartup}
                name="showWelcomeOnStartup"
              />
            }
            label="Show on Startup"
          />
        </Tooltip>
      </div>

      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        aria-label="overview tabs"
      >
        <Tab label="Overview" id="tab-0" aria-controls="tabpanel-0" />
        <Tab label="Whats New" id="tab-1" aria-controls="tabpanel-1" />
        <Tab label="Links" id="tab-2" aria-controls="tabpanel-2" />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <TextField
          className="search"
          fullWidth
          variant="outlined"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {(searchTerm === "" ? sections : filteredSections).map((section) => (
          <Accordion key={section.id}>
            <AccordionSummary
              className="summary"
              expandIcon={<ExpandMoreIcon />}
            >
              <Typography>
                {highlightText(section.title, searchTerm)}
              </Typography>
            </AccordionSummary>
            <AccordionDetails className="content">
              {renderContent(section.originalContent)}
            </AccordionDetails>
          </Accordion>
        ))}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <WhatsNew />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Typography variant="h5" color="#999">
          Links
        </Typography>
        <Link
          href="https://forum.nodetool.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="link"
        >
          Forum
          <div className="body">
            Go to the NodeTool forum for help and advice or share what you made.
          </div>
        </Link>
        <Link
          href="https://github.com/nodetool-ai/nodetool"
          target="_blank"
          rel="noopener noreferrer"
          className="link"
        >
          GitHub
          <div className="body">
            Want to run Nodetool locally or contribute to its development?
            <br />
            Nodetool is open-source and available on GitHub.
            <br />
            You can customize it, add new nodes, or integrate it into your own
            AI workflows.
            <br />
            Check out the repository for installation instructions and
            documentation.
            <br />
            Let us know what you build!
          </div>
        </Link>
      </TabPanel>
    </div>
  );
};

export default Welcome;
