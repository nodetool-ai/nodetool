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
import { useSettingsStore } from "../../../stores/SettingsStore";
import welcomeStyles from "./Welcome.styles";
import WhatsNew from "./WhatsNew";
import useRemoteSettingsStore from "../../../stores/RemoteSettingStore";
import RemoteSettingsMenu from "../../menus/RemoteSettingsMenu";
import ThemeNodetool from "../../themes/ThemeNodetool";
import { UnifiedModel } from "../../../stores/ApiTypes";
import ModelDownloadList from "../../hugging_face/ModelDownloadList";
import { DEFAULT_MODEL } from "../../../config/constants";
import { useNavigate } from "react-router-dom";
import SettingsMenu from "../../menus/SettingsMenu";
import { IconForType } from "../../../config/data_types";

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
    name: "Realistic Vision V5.1",
    type: "hf.stable_diffusion",
    repo_id: "SG161222/Realistic_Vision_V5.1_noVAE",
    path: "Realistic_Vision_V5.1_fp16-no-ema.safetensors"
  },
  {
    id: "ai-forever/Real-ESRGAN",
    name: "Real ESRGAN",
    type: "hf.real_esrgan",
    repo_id: "ai-forever/Real-ESRGAN",
    path: "RealESRGAN_x2.pth"
  },
  {
    id: DEFAULT_MODEL,
    name: "Llama 3.2 3B",
    type: "llama_model",
    repo_id: DEFAULT_MODEL
  },
  {
    id: "deepseek-r1:7b",
    name: "DeepSeek R1 7B",
    type: "llama_model",
    repo_id: "deepseek-r1:7b"
  },
  {
    id: "llama3.2-vision:11b",
    name: "Llama 3.2 - Vision 11B",
    type: "llama_model",
    repo_id: "llama3.2-vision:11b"
  },
  {
    id: "nomic-embed-text",
    name: "Nomic Embed Text",
    type: "llama_model",
    repo_id: "nomic-embed-text:latest"
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

const Welcome = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [tabValue, setTabValue] = useState<TabValue>(TabValue.Overview);
  const sections: Section[] = overviewContents.map((section) => ({
    ...section,
    originalContent: section.content
  }));
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
              navigate("/editor/start");
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
                          Download HuggingFace or Ollama models and run them
                          locally.
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
                          In the editor view, use the{" "}
                          <span
                            style={{
                              alignItems: "center",
                              display: "inline-block"
                            }}
                          >
                            <IconForType
                              iconName="model"
                              showTooltip={false}
                              containerStyle={{
                                display: "inline-block",
                                width: "18px",
                                height: "18px",
                                marginRight: "4px"
                              }}
                              bgStyle={{
                                display: "inline-block",
                                fontSize: "10px",
                                backgroundColor: "transparent",
                                width: "18px",
                                height: "18px"
                              }}
                            />
                          </span>{" "}
                          <span className="fake-button">Models</span> button in
                          the top-right corner to manage all your models.
                        </Typography>
                      </li>
                    </ul>
                  </Box>
                  <Typography variant="subtitle1" className="setup-list-title">
                    2. Use Remote Models, like OpenAI or Anthropic, configure
                    them in the Settings.
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
                  <Box
                    sx={{
                      mt: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 1
                    }}
                  >
                    <Typography variant="body1">
                      You can enter your API keys in the
                    </Typography>
                    <SettingsMenu buttonText="Settings Menu" />
                    <Typography variant="body1">
                      in the top-right corner.
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    flex: 1.6,
                    backgroundColor: theme.palette.c_gray1,
                    padding: "20px",
                    borderRadius: "20px"
                  }}
                >
                  <Typography variant="h2">Local Models</Typography>
                  <p>
                    To run many of the examples, we recommend the following
                    models, all of which should work on M1 Macs or smaller
                    NVIDIA GPUs.
                  </p>
                  <ul>
                    <li>
                      <Typography variant="body1">
                        <b>Realistic Vision V6</b> - A realistic image
                        generation model.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Real ESRGAN</b> - To enable high-quality image
                        scaling.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Llama 3.2 3B</b> - The Llama 3.2 instruction-tuned
                        text only models are optimized for multilingual dialogue
                        use cases, including agentic retrieval and summarization
                        tasks.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>DeepSeek R1 7B</b> - DeepSeek-R1 is a family of open
                        reasoning models with performance approaching that of
                        leading models, such as O3 and Gemini 2.5 Pro.
                        <br />
                        Note:This smaller, distilled version exhibits lower
                        performance.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Llama 3.2 - Vision</b> - The Llama 3.2-Vision
                        instruction-tuned models are optimized for visual
                        recognition, image reasoning, captioning, and answering
                        general questions about an image.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Nomic Embed Text</b> - A text embedding model that
                        can be used to generate embeddings for text.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Whisper</b> - A multilingual speech recognition
                        model.
                      </Typography>
                    </li>
                    <li>
                      <Typography variant="body1">
                        <b>Llama 3.2 - Vision</b> - A vision model to analyze
                        images.
                      </Typography>
                    </li>
                  </ul>

                  <ModelDownloadList models={recommendedModels} />
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
