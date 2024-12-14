/** @jsxImportSource @emotion/react */
import React, {
  useState,
  useCallback,
  ReactNode,
  useMemo,
  useEffect
} from "react";
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
  FormControlLabel,
  Tooltip,
  Checkbox,
  Button
} from "@mui/material";
import Fuse from "fuse.js";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { overviewContents, Section } from "./OverviewContent";
import { css } from "@emotion/react";
import { useSettingsStore } from "../../../stores/SettingsStore";
import WhatsNew from "./WhatsNew";
import useRemoteSettingsStore from "../../../stores/RemoteSettingStore";
import RemoteSettingsMenu from "../../menus/RemoteSettingsMenu";
import ThemeNodetool from "../../themes/ThemeNodetool";
import RecommendedModels from "../../hugging_face/RecommendedModels";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../../hugging_face/DownloadProgress";
import ModelDownloadList from "../../hugging_face/ModelDownloadList";

enum TabValue {
  Overview = 0,
  WhatsNew = 1,
  Links = 2,
  Setup = 3
}

interface TabPanelProps {
  children: React.ReactNode;
  value: TabValue;
  index: TabValue;
}

const welcomeStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "#222",
      padding: "0 2em",
      borderRadius: ".5em",
      position: "fixed",
      width: "100vw",
      height: "100vh",
      top: "0",
      left: "0",
      overflowY: "hidden",
      border: `8px solid ${theme.palette.c_gray0}`,
      display: "flex",
      flexDirection: "column"
    },
    ".panel-title": {
      paddingLeft: "0",
      margin: 0,
      color: theme.palette.c_white,
      marginBottom: "1em"
    },
    ".summary": {
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSizeBigger,
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray1
    },
    ".content": {
      padding: "1em",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSizeBig
    },

    ".content ul": {
      marginLeft: "0",
      paddingLeft: "1em"
    },
    ".content ul li": {
      listStyleType: "square",
      marginLeft: "0",
      marginBottom: 0,
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1
    },
    ".search": {
      marginBottom: "1em"
    },
    ".MuiAccordion-root": {
      background: "transparent",
      color: theme.palette.c_white,
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
      marginBottom: "1em",
      "&:before": {
        display: "none"
      }
    },
    ".MuiAccordionSummary-content.Mui-expanded": {
      margin: "0"
    },
    ".MuiAccordionSummary-root": {
      minHeight: "48px"
    },
    ".MuiAccordionSummary-content": {
      margin: ".5em 0"
    },
    ".MuiTypography-root": {
      fontFamily: theme.fontFamily
    },
    ".MuiListItemText-primary": {
      fontWeight: "bold"
    },
    "ul, ol": {
      fontFamily: theme.fontFamily1,
      paddingLeft: ".5em",
      margin: ".5em 0",
      "& li": {
        marginBottom: "0.5em"
      }
    },
    ".highlight": {
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black
    },
    ".tab-content": {
      marginTop: "1em"
    },
    ".link": {
      color: theme.palette.c_gray6,
      display: "inline-block",
      padding: "4px 8px",
      textDecoration: "none",
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "4px",
      transition: "all 0.2s"
    },
    ".link:hover": {
      color: theme.palette.c_black,
      backgroundColor: theme.palette.c_hl1
    },

    ".link-body": {
      fontSize: theme.fontSizeNormal,
      backgroundColor: "transparent",
      color: theme.palette.c_gray6,
      marginTop: ".25em",
      marginBottom: "2em",
      display: "block"
    },

    ".header-container": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".header": {
      position: "sticky",
      top: 0,
      backgroundColor: "#222",
      zIndex: 1,
      padding: "1.5em 0em 0 0em",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1em"
    },
    ".header-right": {
      display: "flex",
      alignItems: "center",
      gap: "1em"
    },
    ".show-on-startup-toggle": {
      marginTop: "-1em"
    },
    ".content-area": {
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 100px)",
      gap: "2em"
    },
    ".tabs-and-search": {
      position: "sticky",
      top: 0,
      backgroundColor: "#222",
      zIndex: 1,
      padding: "0",
      borderBottom: `1px solid ${theme.palette.c_gray3}`
    },
    ".overview button": {
      marginBottom: "1.5em",
      fontSize: theme.fontSizeNormal,
      padding: "1em 2em",
      transition: "all 0.2s"
    },
    ".overview button:hover:not(.Mui-selected)": {
      color: theme.palette.c_gray6
    },
    ".fake-button": {
      color: "#fff",
      backgroundColor: theme.palette.c_gray2,
      textTransform: "uppercase",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      padding: "0 .5em",
      margin: "0 .2em"
    },
    ".setup-tab h4, .setup-tab h5": {
      fontFamily: theme.fontFamily,
      marginBottom: "1em"
    },
    ".setup-tab .MuiListItemText-primary": {
      fontWeight: "bold",
      color: theme.palette.c_hl3
    },
    ".setup-tab .MuiListItemText-secondary": {
      color: theme.palette.c_white
    },
    ".remote-settings-container": {
      backgroundColor: theme.palette.c_gray1,
      padding: "1.5em",
      borderRadius: "8px"
    },
    ul: {
      paddingLeft: "1.5em"
    },
    "ul li, ol li": {
      margin: 0,
      listStyleType: "square"
    },
    ".start-button": {
      backgroundColor: theme.palette.c_hl1,
      color: theme.palette.c_black,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeBig,
      outline: `1px solid ${theme.palette.c_hl1}`,
      flexGrow: 1,
      margin: "0",
      padding: "0.5em 8em",
      marginTop: "-.5em",
      borderRadius: ".2em",
      transition: "all 0.4s",
      "&:hover": {
        outline: `2px solid ${theme.palette.c_gray0}`,
        boxShadow: `inset 0 0 .2em 0 ${theme.palette.c_gray0}`,
        opacity: 0.9,
        color: theme.palette.c_black
      }
    },
    // ".MuiTabs-root": {
    //   marginBottom: "1.5em",
    //   "& .MuiTab-root": {
    //     fontSize: theme.fontSizeBig,
    //     padding: "1em 2em",
    //     transition: "all 0.2s"
    //   }
    // },
    ".setup-list-item": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start"
    },
    ".setup-list-title": {
      fontWeight: "bold",
      paddingTop: ".5em",
      color: theme.palette.c_hl1
    },
    ".setup-list-content": {
      marginTop: ".25em"
    },
    ".setup-list-secondary": {
      "& ul": {
        marginTop: "1em"
      },
      "& li": {
        marginBottom: "0.5em"
      }
    },
    ".setup-description": {
      marginTop: "2em",
      "& p": {
        marginTop: "1em"
      }
    }
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

const recommendedModels: UnifiedModel[] = [
  {
    id: "SG161222/Realistic_Vision_V5.1_noVAE",
    name: "Realistic Vision V6",
    type: "hf.stable_diffusion",
    repo_id: "SG161222/Realistic_Vision_V5.1_noVAE",
    path: "Realistic_Vision_V5.1_fp16-no-ema.safetensors"
  },
  {
    id: "stabilityai/sd-x2-latent-upscaler",
    name: "SD XL Latent Upscaler",
    type: "hf.stable_diffusion",
    repo_id: "stabilityai/sd-x2-latent-upscaler",
    allow_patterns: ["**/*.json", "**/*.txt", "**/*.json"]
  },
  {
    id: "qwen2.5:1.5b",
    name: "Qwen 2.5 - 0.5B",
    type: "llama_model",
    repo_id: "qwen2.5:1.5b"
  },
  {
    id: "openai/whisper-small",
    name: "whisper-small",
    type: "hf.automatic_speech_recognition",
    repo_id: "openai/whisper-small",
    allow_patterns: ["model.safetensors", "*.json", "*.txt"]
  }
];

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
  const [tabValue, setTabValue] = useState<TabValue>(TabValue.Overview);
  const sections: Section[] = overviewContents.map((section) => ({
    ...section,
    originalContent: section.content
  }));
  const { downloads } = useModelDownloadStore();
  const { settings, updateSettings } = useSettingsStore();
  const { secrets } = useRemoteSettingsStore();

  const hasSetupKeys = useMemo(() => {
    return !!(
      secrets.OPENAI_API_KEY &&
      secrets.REPLICATE_API_TOKEN &&
      secrets.ANTHROPIC_API_KEY
    );
  }, [secrets]);

  const theme = ThemeNodetool;

  useEffect(() => {
    if (!hasSetupKeys) {
      setTabValue(TabValue.Setup);
    }
  }, [hasSetupKeys]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: TabValue) => {
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

  const handleToggleWelcomeOnStartup = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    updateSettings({ showWelcomeOnStartup: event.target.checked });
  };

  return (
    <div css={welcomeStyles}>
      <div className="header">
        <Typography className="panel-title" variant="h2">
          NODETOOL
        </Typography>

        <div className="header-right">
          <div className="show-on-startup-toggle">
            <Tooltip
              title="You can always open this screen from the Nodetool logo in the top left."
              arrow
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.showWelcomeOnStartup}
                    onChange={handleToggleWelcomeOnStartup}
                    name="showWelcomeOnStartup"
                  />
                }
                label="Show on Startup"
              />
            </Tooltip>
          </div>
          <Button
            onClick={() => {
              handleClose();
            }}
            className="start-button"
          >
            START
          </Button>
        </div>
      </div>

      <div className="content-area">
        <div className="tabs-and-search">
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            aria-label="overview tabs"
            className="overview tabs"
          >
            <Tab label="Overview" id="tab-0" aria-controls="tabpanel-0" />
            <Tab label="Whats New" id="tab-1" aria-controls="tabpanel-1" />
            <Tab label="Links" id="tab-2" aria-controls="tabpanel-2" />
            <Tab label="Setup" id="tab-3" aria-controls="tabpanel-3" />
          </Tabs>

          {tabValue === TabValue.Overview && (
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
                )
              }}
            />
          )}
        </div>

        <div className="scrollable-content" style={{ overflowY: "auto" }}>
          <TabPanel value={tabValue} index={TabValue.Overview}>
            {(searchTerm === "" ? sections : filteredSections).map(
              (section, index) => (
                <Accordion key={section.id} defaultExpanded={index === 0}>
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
              )
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={TabValue.WhatsNew}>
            <WhatsNew />
          </TabPanel>

          <TabPanel value={tabValue} index={TabValue.Links}>
            <Link
              href="https://forum.nodetool.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Forum
            </Link>
            <div className="link-body">
              Go to the NodeTool forum for help and advice or share what you
              made.
            </div>
            <Link
              href="https://github.com/nodetool-ai/nodetool"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              GitHub
            </Link>
            <div className="link-body">
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
          </TabPanel>

          <TabPanel value={tabValue} index={TabValue.Setup}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "2em" }}>
              <Box
                sx={{
                  display: "flex",
                  gap: "2em"
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    backgroundColor: theme.palette.c_gray1,
                    padding: "20px",
                    borderRadius: "20px"
                  }}
                >
                  <Typography variant="h2" sx={{ mb: 2 }}>
                    How to Use Models
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    You can use both local and remote AI models in Nodetool:
                  </Typography>
                  <Typography variant="subtitle1" className="setup-list-title">
                    1. Use Local Models
                  </Typography>
                  <Box className="setup-list-content">
                    <ul>
                      <li>
                        <Typography variant="body2">
                          Download from Hugging Face and run models locally.
                        </Typography>
                      </li>
                      <li>
                        <Typography variant="body2">
                          Look for the{" "}
                          <span className="fake-button">
                            Recommended Models
                          </span>{" "}
                          button on compatible nodes.
                        </Typography>
                      </li>
                      <li>
                        <Typography variant="body2">
                          Use the <span className="fake-button">Models</span>{" "}
                          button in the top panel to manage all models.
                        </Typography>
                      </li>
                    </ul>
                  </Box>
                  <Typography variant="subtitle1" className="setup-list-title">
                    2. Use Remote Models
                  </Typography>
                  <Box className="setup-list-content">
                    <ul>
                      <li>
                        <Typography variant="body2">
                          Set up API keys to access cloud-based AI models.
                        </Typography>
                      </li>
                      <li>
                        <Typography variant="body2">
                          Ideal for more powerful models or when local resources
                          are limited.
                        </Typography>
                      </li>
                    </ul>
                  </Box>
                  <Typography variant="body1" sx={{ mt: 2 }}>
                    Choose the option that best suits your needs and project
                    requirements.
                  </Typography>
                  <Typography variant="body1" sx={{ mt: 1 }}>
                    You can enter your API keys now or access them later via the{" "}
                    <span className="fake-button">Settings</span> menu.
                  </Typography>
                </Box>

                {/* RECOMMENDED MODELS */}
                <Box
                  sx={{
                    flex: 1,
                    backgroundColor: theme.palette.c_gray1,
                    padding: "20px",
                    borderRadius: "20px"
                  }}
                >
                  <Typography variant="h2">Local Models</Typography>
                  <p>
                    We recommend the following models for you to run examples on
                    your own GPU.
                  </p>
                  <ul>
                    <li>
                      <Typography variant="body1">
                        <b>Realistc Vision V6</b> - A realistic image generation
                        model.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>SD XL Latent Upscaler</b> - To enable high-quality
                        image scaling.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Qwen 2.5</b> - A multilingual large language model.
                      </Typography>
                    </li>
                  </ul>

                  <ModelDownloadList models={recommendedModels} />
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    backgroundColor: theme.palette.c_gray0,
                    p: 4,
                    borderRadius: ".2em"
                  }}
                >
                  <RemoteSettingsMenu enableCollapse={false} />
                </Box>
              </Box>
            </Box>
          </TabPanel>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
