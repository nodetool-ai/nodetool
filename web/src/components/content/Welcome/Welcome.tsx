/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, ReactNode, useMemo, memo } from "react";
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
  Button,
  Grid,
  Card,
  CardActionArea,
  CardContent
} from "@mui/material";
import Chip from "@mui/material/Chip";
import DownloadIcon from "@mui/icons-material/Download";
import Fuse from "fuse.js";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import WidgetsIcon from "@mui/icons-material/Widgets";
import { overviewContents, Section } from "./OverviewContent";
import { useSettingsStore } from "../../../stores/SettingsStore";
import welcomeStyles from "./Welcome.styles";
import { useTheme } from "@mui/material/styles";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { DEFAULT_MODEL } from "../../../config/constants";
import { useNavigate } from "react-router-dom";
import { IconForType } from "../../../config/data_types";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import FolderIcon from "@mui/icons-material/Folder";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../../hugging_face/DownloadProgress";

enum TabValue {
  Overview = 0,
  Setup = 1
}

interface TabPanelProps {
  children: React.ReactNode;
  value: TabValue;
  index: TabValue;
}

const TabPanel = React.memo(function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`overview-tabpanel-${index}`}
      aria-labelledby={`overview-tab-${index}`}
      className="welcome-tab-panel"
    >
      {value === index && <Box className="tab-content">{children}</Box>}
    </div>
  );
});

const InlineModelDownload: React.FC<{
  model: UnifiedModel;
  label?: React.ReactNode;
  isDefault?: boolean;
  tooltip?: string;
}> = ({ model, label, isDefault, tooltip }) => {
  const { startDownload, downloads } = useModelDownloadStore((state) => ({
    startDownload: state.startDownload,
    downloads: state.downloads
  }));
  const downloadKey = model.repo_id || model.id;
  const inProgress = !!downloads[downloadKey];
  if (inProgress) {
    return (
      <Box
        component="span"
        sx={{ ml: 1, display: "inline-flex", verticalAlign: "middle" }}
        className="inline-download-progress"
      >
        <DownloadProgress name={downloadKey} minimal />
      </Box>
    );
  }
  const button = (
    <Button
      size="small"
      variant={isDefault ? "contained" : "outlined"}
      color={isDefault ? "primary" : "inherit"}
      startIcon={<DownloadIcon fontSize="small" />}
      aria-label={`Download ${model.repo_id || model.id}`}
      sx={{ ml: 1, verticalAlign: "middle" }}
      className={`model-download-button ${isDefault ? "default-model" : ""}`}
      onClick={() =>
        startDownload(
          model.repo_id || "",
          model.type || "hf.model",
          model.path ?? null,
          model.allow_patterns ?? null,
          model.ignore_patterns ?? null
        )
      }
    >
      {label ?? "Download"}
    </Button>
  );
  return tooltip ? (
    <Tooltip title={tooltip} arrow>
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
};

interface FeaturedModel extends UnifiedModel {
  displayName?: string;
  note?: string;
  vision?: boolean;
  reasoning?: boolean;
  base?: string;
  variants?: string[];
  defaultVariant?: string;
}

const recommendedModels: FeaturedModel[] = [
  {
    id: DEFAULT_MODEL,
    name: "GPT - OSS",
    displayName: "GPT - OSS",
    type: "llama_model",
    repo_id: DEFAULT_MODEL,
    base: "gpt-oss",
    variants: ["20b", "120b"],
    defaultVariant: "20b",
    description:
      "Open‑weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.",
    note: "We strongly recommend this model to enable agentic workflows.",
    reasoning: true,
    vision: false,
    downloaded: false
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3 4B",
    displayName: "Gemma 3",
    type: "llama_model",
    repo_id: "gemma3:4b",
    base: "gemma3",
    variants: ["1b", "4b", "12b", "27b"],
    defaultVariant: "4b",
    description:
      "Lightweight, multimodal (text, images, short video), long 128K context, designed for single‑GPU/TPU. Ideal for on‑device apps, multimodal QA/summarization, and multilingual use.",
    reasoning: true,
    vision: true,
    downloaded: false
  },
  {
    id: "deepseek-r1:7b",
    name: "DeepSeek R1 7B",
    displayName: "R1 Distilled",
    type: "llama_model",
    repo_id: "deepseek-r1:7b",
    base: "deepseek-r1",
    variants: ["1.5b", "7b", "8b", "14b", "32b"],
    defaultVariant: "7b",
    description:
      "Compact models distilled from DeepSeek‑R1 with strong math and logic performance in smaller footprints. Great when compute is limited but reasoning quality matters; permissive MIT license.",
    reasoning: true,
    vision: false,
    downloaded: false
  },
  {
    id: "qwen3:4b",
    name: "Qwen 3 4B",
    displayName: "Qwen 3",
    type: "llama_model",
    repo_id: "qwen3:4b",
    base: "qwen3",
    variants: ["0.6b", "1.7b", "4b", "8b", "14b", "30b", "32b"],
    defaultVariant: "4b",
    description:
      "Hybrid reasoning (thinking and fast modes), strong multilingual support. Best for balanced reasoning + speed, agentic workflows, and multilingual apps.",
    reasoning: true,
    vision: false,
    downloaded: false
  },
  {
    id: "nomic-embed-text",
    name: "Nomic Embed Text",
    displayName: "Nomic Embed Text",
    type: "llama_model",
    repo_id: "nomic-embed-text:latest",
    base: "nomic-embed-text",
    variants: ["latest"],
    defaultVariant: "latest",
    description: "Embeddings model for retrieval and semantic search.",
    reasoning: false,
    vision: false,
    downloaded: false
  }
];

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

const Welcome = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const theme = useTheme();
  const [tabValue, setTabValue] = useState<TabValue>(TabValue.Overview);

  // Memoize sections array - overviewContents is static, so this should be stable
  const sections = useMemo(
    (): Section[] =>
      overviewContents.map((section) => ({
        ...section,
        originalContent: section.content
      })),
    []
  );

  // Memoize search entries with extracted text
  // This is expensive (extracts text from all sections) and should only run when sections change
  const searchEntries = useMemo(() => {
    return sections.map((section) => ({
      ...section,
      content: extractText(section.content)
    }));
  }, [sections]);

  // Memoize Fuse instance - only recreate when searchEntries change
  // Fuse indexing is O(n) and should not happen on every keystroke
  const fuseOptions = useMemo(
    () => ({
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
    }),
    []
  );

  const fuse = useMemo(
    () => new Fuse(searchEntries, fuseOptions),
    [searchEntries, fuseOptions]
  );

  // Memoize static styles to prevent recreation on every render
  const headerLeftStyle = useMemo(() => ({ display: "flex", alignItems: "center" }), []);
  const logoStyle = useMemo(() => ({
    width: "28px",
    height: "28px",
    marginRight: "1em"
  }), []);
  const subtitleStyle = useMemo(() => ({ marginLeft: "1em" }), []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: TabValue) => {
    setTabValue(newValue);
  };

  const highlightText = useCallback((text: string, term: string) => {
    if (!term) {return text;}
    // Memoize regex to avoid recreating on every render
    const splitRegex = new RegExp(`(${term})`, "gi");
    const parts = text.split(splitRegex);
    return parts.map((part, index) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <span key={`${index}-${part}`} className="highlight">
          {part}
        </span>
      ) : (
        part
      )
    );
  }, []);

  const performSearch = useCallback(
    (searchTerm: string) => {
      if (searchTerm.length > 1) {
        // Use the memoized Fuse instance for efficient search
        const filteredData = fuse.search(searchTerm).map((result) => result.item);
        return filteredData;
      }
      return searchTerm.length === 0 ? sections : [];
    },
    [fuse, sections]
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

  // Featured local models to display in the setup section
  const featuredLocalModelIds = [
    DEFAULT_MODEL,
    "qwen3:4b",
    "deepseek-r1:7b",
    "gemma3:4b"
  ];
  const featuredModels = recommendedModels.filter((m) =>
    featuredLocalModelIds.includes(m.id)
  );

  return (
    <div css={welcomeStyles(theme)} className="welcome-container">
      <div className="header">
        <Box
          className="header-left"
          style={headerLeftStyle}
        >
          <img
            className="logo-image"
            src="/logo.png"
            alt="NodeTool"
            style={logoStyle}
          />
          <Typography className="panel-title" variant="h2">
            NodeTool
          </Typography>
          <Typography
            variant="subtitle1"
            className="subtitle"
            style={subtitleStyle}
          >
            Open-Source Visual Agent Builder
          </Typography>
        </Box>

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
                    className="welcome-startup-checkbox"
                  />
                }
                label="Show on Startup"
                className="welcome-startup-label"
              />
            </Tooltip>
          </div>
          <Button
            onClick={() => {
              navigate("/dashboard");
            }}
            className="start-button"
          >
            Open Dashboard
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
            <Tab
              label="Overview"
              id="tab-0"
              aria-controls="tabpanel-0"
              className="welcome-tab"
            />
            <Tab
              label="Setup"
              id="tab-1"
              aria-controls="tabpanel-1"
              className="welcome-tab"
            />
          </Tabs>

          {tabValue === TabValue.Overview && (
            <TextField
              className="search welcome-search"
              fullWidth
              variant="outlined"
              placeholder="Search help and tips"
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
            {searchTerm === "" && (
              <Box className="quick-start">
                <Typography
                  variant="h3"
                  sx={{ mb: 1 }}
                  className="quick-start-title"
                >
                  Quick Start
                </Typography>
                <Grid container spacing={2} className="quick-start-grid">
                  <Grid
                    sx={{
                      gridColumn: { xs: "span 12", sm: "span 4", md: "span 2" }
                    }}
                    className="quick-start-grid-item"
                  >
                    <Card className="quick-card" elevation={0}>
                      <CardActionArea
                        onClick={() => navigate("/editor")}
                        className="quick-card-action"
                      >
                        <CardContent className="quick-card-content">
                          <AddCircleOutlineIcon className="quick-card-icon" />
                          <Typography className="quick-card-title">
                            Create Workflow
                          </Typography>
                          <Typography className="quick-card-desc">
                            Start a new canvas and design a workflow from
                            scratch.
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                  <Grid
                    sx={{
                      gridColumn: { xs: "span 12", sm: "span 6", md: "span 3" }
                    }}
                    className="quick-start-grid-item"
                  >
                    <Card className="quick-card" elevation={0}>
                      <CardActionArea
                        onClick={() => navigate("/templates")}
                        className="quick-card-action"
                      >
                        <CardContent className="quick-card-content">
                          <LibraryBooksIcon className="quick-card-icon" />
                          <Typography className="quick-card-title">
                            Browse Templates
                          </Typography>
                          <Typography className="quick-card-desc">
                            Explore ready-made workflows to learn and remix.
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                  <Grid
                    sx={{
                      gridColumn: { xs: "span 12", sm: "span 6", md: "span 3" }
                    }}
                    className="quick-start-grid-item"
                  >
                    <Card className="quick-card" elevation={0}>
                      <CardActionArea
                        onClick={() => navigate("/chat")}
                        className="quick-card-action"
                      >
                        <CardContent className="quick-card-content">
                          <ChatBubbleOutlineIcon className="quick-card-icon" />
                          <Typography className="quick-card-title">
                            Open Chat
                          </Typography>
                          <Typography className="quick-card-desc">
                            Chat globally and trigger workflows from anywhere.
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                  <Grid
                    sx={{
                      gridColumn: { xs: "span 12", sm: "span 6", md: "span 3" }
                    }}
                    className="quick-start-grid-item"
                  >
                    <Card className="quick-card" elevation={0}>
                      <CardActionArea
                        onClick={() => navigate("/assets")}
                        className="quick-card-action"
                      >
                        <CardContent className="quick-card-content">
                          <FolderIcon className="quick-card-icon" />
                          <Typography className="quick-card-title">
                            Open Assets
                          </Typography>
                          <Typography className="quick-card-desc">
                            Manage and import your media and data files.
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            )}
            {(() => {
              const list = searchTerm === "" ? sections : filteredSections;
              if (!list || list.length === 0) {
                return (
                  <Box sx={{ mt: 3 }} className="no-search-results">
                    <Typography
                      variant="body1"
                      sx={{ opacity: 0.8 }}
                      className="no-results-text"
                    >
                      No results. Try different keywords or clear the search.
                    </Typography>
                    <Box sx={{ mt: 1 }} className="clear-search-container">
                      <Button
                        size="small"
                        onClick={() => setSearchTerm("")}
                        className="clear-search-button"
                      >
                        Clear search
                      </Button>
                    </Box>
                  </Box>
                );
              }
              return list.map((section, index) => (
                <Accordion
                  key={section.id}
                  defaultExpanded={index === 0}
                  className="welcome-accordion"
                >
                  <AccordionSummary
                    className="summary welcome-accordion-summary"
                    expandIcon={<ExpandMoreIcon />}
                  >
                    <Typography className="welcome-accordion-title">
                      {highlightText(section.title, searchTerm)}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails className="content welcome-accordion-content">
                    {renderContent(section.originalContent)}
                  </AccordionDetails>
                </Accordion>
              ));
            })()}
          </TabPanel>

          <TabPanel value={tabValue} index={TabValue.Setup}>
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: "2em" }}
              className="setup-container"
            >
              <Box
                sx={{
                  display: "flex",
                  gap: "2em"
                }}
                className="setup-content"
              >
                <Box
                  sx={{
                    flex: 1,
                    padding: "20px",
                    border: `1px solid ${theme.vars.palette.grey[600]}`,
                    borderRadius: "20px"
                  }}
                  className="setup-instructions"
                >
                  <Typography
                    variant="h2"
                    sx={{ mb: 2 }}
                    className="setup-title"
                  >
                    How to Use Models
                  </Typography>
                  <Typography
                    variant="body1"
                    gutterBottom
                    className="setup-description"
                  >
                    NodeTool works with both local and remote models. Start with
                    local for privacy and low latency, then add cloud providers
                    when you need extra capability.
                  </Typography>

                  <Typography variant="subtitle1" className="setup-list-title">
                    1. Local models (recommended to start)
                  </Typography>
                  <Box className="setup-list-content">
                    <ol className="step-list">
                      <li className="setup-step">
                        Open the <span className="fake-button">Models</span>{" "}
                        manager in the editor&apos;s top‑right (
                        <span
                          style={{
                            display: "inline-block",
                            verticalAlign: "middle"
                          }}
                          className="model-icon-container"
                        >
                          <IconForType
                            iconName="model"
                            showTooltip={false}
                            containerStyle={{
                              display: "inline-block",
                              width: 18,
                              height: 18
                            }}
                            bgStyle={{
                              display: "inline-block",
                              width: 18,
                              height: 18
                            }}
                          />
                        </span>
                        ).
                      </li>
                      <li className="setup-step">
                        Download a model. We recommend <b>GPT - OSS</b> for
                        agentic workflows (fast setup); other good choices are{" "}
                        <b>Qwen 3</b>, <b>R1 Distilled</b>, and <b>Gemma 3</b>.
                      </li>
                      <li className="setup-step">
                        Ensure you have free disk space (20GB+ recommended).
                      </li>
                      <li className="setup-step">
                        Use the{" "}
                        <span className="fake-button">Recommended Models</span>{" "}
                        button on compatible nodes to pick the right model.
                      </li>
                    </ol>
                    <Box className="callout" sx={{ mt: 1 }}>
                      <Typography variant="body2" className="callout-text">
                        Your data stays local unless you explicitly use cloud
                        providers.
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="subtitle1" className="setup-list-title">
                    2. Remote models
                  </Typography>
                  <Box className="setup-list-content">
                    <ol className="step-list">
                      <li className="setup-step">
                        Open the{" "}
                        <SettingsIcon
                          sx={{ verticalAlign: "middle", fontSize: "inherit" }}
                        />
                        <b> Settings</b> menu (top‑right).
                      </li>
                      <li className="setup-step">
                        Add your API keys (OpenAI, Anthropic, Hugging Face,
                        Gemini, etc.).
                      </li>
                      <li className="setup-step">
                        Install optional packs like{" "}
                        <Link
                          href="https://replicate.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="setup-link"
                        >
                          Replicate
                        </Link>
                        ,{" "}
                        <Link
                          href="https://fal.ai/"
                          target="_blank"
                          rel="noreferrer"
                          className="setup-link"
                        >
                          Fal.ai
                        </Link>
                        , or{" "}
                        <Link
                          href="https://elevenlabs.io/"
                          target="_blank"
                          rel="noreferrer"
                          className="setup-link"
                        >
                          ElevenLabs
                        </Link>{" "}
                        from the{" "}
                        <WidgetsIcon
                          sx={{ verticalAlign: "middle", fontSize: "inherit" }}
                        />
                        <b> Packs</b> menu in the left panel.
                      </li>
                    </ol>
                    <Box className="callout" sx={{ mt: 1 }}>
                      <Typography variant="body2" className="callout-text">
                        Cloud is optional. You control exactly what leaves your
                        machine.
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="subtitle1" className="setup-list-title">
                    3. Test your setup
                  </Typography>
                  <Box
                    className="setup-list-content"
                    sx={{ display: "flex", gap: 1 }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate("/templates")}
                      className="setup-test-button"
                    >
                      Open Templates
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate("/chat")}
                      className="setup-test-button"
                    >
                      Open Chat
                    </Button>
                  </Box>
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    padding: "20px",
                    border: `1px solid ${theme.vars.palette.grey[600]}`,
                    borderRadius: "20px"
                  }}
                  className="local-models-container"
                >
                  <Box className="local-models">
                    <Typography variant="h2" className="section-title">
                      Local Models
                    </Typography>
                    <Typography variant="body1" className="section-subtitle">
                      Run powerful open models locally. Start small and scale up
                      depending on your GPU/CPU and latency needs.
                    </Typography>
                    <Box className="callout" sx={{ mt: 1 }}>
                      <Typography variant="body2" className="callout-text">
                        Tip: Use smaller models for prototyping and larger ones
                        when you need more context or reasoning.
                      </Typography>
                    </Box>

                    <Typography variant="h3" className="models-heading">
                      Popular local models
                    </Typography>

                    <ul className="local-models-list">
                      {featuredModels.map((model) => (
                        <li
                          key={model.id}
                          style={{ listStyle: "none" }}
                          className="local-model-list-item"
                        >
                          <div className="local-model-item">
                            <div className="local-model-header">
                              <div className="local-model-title">
                                <Typography
                                  variant="h4"
                                  className="model-display-name"
                                >
                                  {(model as FeaturedModel).displayName ||
                                    model.name}
                                </Typography>
                              </div>
                              <div className="local-model-actions">
                                <Box
                                  sx={{
                                    display: "flex",
                                    gap: 1,
                                    flexWrap: "wrap"
                                  }}
                                  className="model-variant-buttons"
                                >
                                  {((model as FeaturedModel).variants &&
                                  (model as FeaturedModel).variants!.length > 0
                                    ? (model as FeaturedModel).variants!
                                    : [model.id.split(":")[1] || "latest"]
                                  ).map((variant) => {
                                    const base =
                                      (model as FeaturedModel).base ||
                                      (model.id.includes(":")
                                        ? model.id.split(":")[0]
                                        : model.id);
                                    const variantModel: UnifiedModel = {
                                      ...model,
                                      id: `${base}:${variant}`,
                                      repo_id: `${base}:${variant}`
                                    };
                                    const defaultVariant =
                                      (model as FeaturedModel).defaultVariant ||
                                      (model.id.includes(":")
                                        ? model.id.split(":")[1]
                                        : "");
                                    const isDefault =
                                      variant.toLowerCase() ===
                                      (defaultVariant || "").toLowerCase();
                                    return (
                                      <InlineModelDownload
                                        key={`${model.id}-${variant}`}
                                        model={variantModel}
                                        isDefault={isDefault}
                                        label={`${variant.toUpperCase()}`}
                                        tooltip={`Download ${base}:${variant}`}
                                      />
                                    );
                                  })}
                                </Box>
                              </div>
                            </div>
                            <div className="local-model-desc">
                              {model.description && (
                                <Typography
                                  variant="body1"
                                  className="model-description"
                                >
                                  {model.description}
                                </Typography>
                              )}
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 1,
                                  flexWrap: "wrap",
                                  mt: 1
                                }}
                                className="model-capabilities"
                              >
                                {((model as FeaturedModel).reasoning ??
                                  false) && (
                                  <Chip
                                    size="small"
                                    label="Reasoning"
                                    color="primary"
                                    variant="outlined"
                                    className="capability-chip reasoning-chip"
                                  />
                                )}
                                {((model as FeaturedModel).vision ?? false) && (
                                  <Chip
                                    size="small"
                                    label="Vision"
                                    color="secondary"
                                    variant="outlined"
                                    className="capability-chip vision-chip"
                                  />
                                )}
                              </Box>
                              {(model as FeaturedModel).note && (
                                <Typography
                                  variant="body2"
                                  className="model-note"
                                >
                                  {(model as FeaturedModel).note}
                                </Typography>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Box>
                </Box>
              </Box>
            </Box>
          </TabPanel>
        </div>
      </div>
    </div>
  );
};

export default memo(Welcome);
