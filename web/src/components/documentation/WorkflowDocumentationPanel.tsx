/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useMemo, useState } from "react";
import { Box, Button, IconButton, Tab, Tabs, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import LexicalPlugins from "../textEditor/LexicalEditor";
import { EditorState } from "lexical";
import {
  $convertToMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import useWorkflowDocumentationStore from "../../stores/WorkflowDocumentationStore";
import { EditorUiProvider } from "../editor_ui";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    backgroundColor: theme.vars.palette.background.default,
    ".documentation-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.5rem",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".documentation-title": {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem"
    },
    ".documentation-content": {
      flex: 1,
      overflow: "auto",
      padding: "1rem"
    },
    ".tab-content": {
      height: "calc(100% - 48px)",
      overflow: "auto"
    },
    ".editor-container": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      minHeight: "150px",
      backgroundColor: theme.vars.palette.background.paper,
      "& .editor-input": {
        minHeight: "120px",
        padding: "0.75rem"
      }
    },
    ".section-title": {
      marginBottom: "0.5rem",
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall
    },
    ".markdown-preview": {
      whiteSpace: "pre-wrap",
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      fontSize: theme.fontSizeSmall,
      padding: "0.75rem",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      minHeight: "150px"
    }
  });

const initialConfig = {
  namespace: "WorkflowDocumentation",
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode
  ],
  theme: {
    text: {
      large: "font-size-large",
      bold: "editor-text-bold",
      italic: "editor-text-italic",
      underline: "editor-text-underline",
      strikethrough: "editor-text-strikethrough",
      code: "editor-text-code"
    },
    link: "editor-link",
    code: "editor-code",
    heading: {
      h1: "editor-heading-h1",
      h2: "editor-heading-h2",
      h3: "editor-heading-h3",
      h4: "editor-heading-h4",
      h5: "editor-heading-h5",
      h6: "editor-heading-h6"
    },
    list: {
      ul: "editor-list-ul",
      ol: "editor-list-ol",
      listitem: "editor-listitem"
    },
    quote: "editor-quote"
  }
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`doc-tabpanel-${index}`}
      aria-labelledby={`doc-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ height: "100%" }}>{children}</Box>}
    </div>
  );
}

const DocumentationEditor = ({
  label,
  editorState,
  onChange,
  placeholder
}: {
  label: string;
  editorState: EditorState | null;
  onChange: (state: EditorState) => void;
  placeholder?: string;
}) => {
  const config = useMemo(() => {
    const cfg: any = { ...initialConfig };
    
    if (editorState && typeof editorState === "object" && "root" in editorState) {
      cfg.editorState = JSON.stringify(editorState);
    }
    
    return cfg;
  }, [editorState]);

  const handleChange = useCallback(
    (state: EditorState) => {
      onChange(state);
    },
    [onChange]
  );

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5, color: "text.secondary" }}>
        {label}
      </Typography>
      <Box
        className="editor-container"
        sx={{
          "& .format-toolbar-container": {
            display: "none"
          }
        }}
      >
        <LexicalComposer initialConfig={config}>
          <LexicalPlugins
            onChange={handleChange}
            placeholder={placeholder}
          />
        </LexicalComposer>
      </Box>
    </Box>
  );
};

const WorkflowDocumentationPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const theme = useTheme();
  const stylesMemo = useMemo(() => styles(theme), [theme]);
  
  const [tabValue, setTabValue] = useState(0);
  const [isPreview, setIsPreview] = useState(false);
  
  const {
    documentation,
    setDescription,
    setInputs,
    setOutputs,
    setNotes
  } = useWorkflowDocumentationStore();

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  }, []);

  const getMarkdownContent = useCallback((editorState: EditorState | null): string => {
    if (!editorState || typeof editorState !== "object" || !("root" in editorState)) {
      return "";
    }
    let markdown = "";
    try {
      const editorStateObj = editorState as EditorState;
      editorStateObj.read(() => {
        markdown = $convertToMarkdownString(TRANSFORMERS);
      });
    } catch {
      markdown = "";
    }
    return markdown;
  }, []);

  const descriptionMarkdown = useMemo(
    () => getMarkdownContent(documentation.description),
    [documentation.description, getMarkdownContent]
  );
  
  const inputsMarkdown = useMemo(
    () => getMarkdownContent(documentation.inputs),
    [documentation.inputs, getMarkdownContent]
  );
  
  const outputsMarkdown = useMemo(
    () => getMarkdownContent(documentation.outputs),
    [documentation.outputs, getMarkdownContent]
  );
  
  const notesMarkdown = useMemo(
    () => getMarkdownContent(documentation.notes),
    [documentation.notes, getMarkdownContent]
  );

  const handleExportMarkdown = useCallback(() => {
    const fullMarkdown = `# Workflow Documentation

## Description
${descriptionMarkdown || "*No description provided*"}

## Inputs
${inputsMarkdown || "*No inputs documented*"}

## Outputs
${outputsMarkdown || "*No outputs documented*"}

## Notes
${notesMarkdown || "*No notes added*"}
`;
    
    const blob = new Blob([fullMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow-documentation.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [descriptionMarkdown, inputsMarkdown, outputsMarkdown, notesMarkdown]);

  return (
    <EditorUiProvider scope="documentation">
      <Box css={stylesMemo} className="documentation-panel">
        <Box className="documentation-header">
          <Box className="documentation-title">
            <Typography variant="h6">Workflow Documentation</Typography>
          </Box>
          <Box>
            <IconButton
              size="small"
              onClick={handleExportMarkdown}
              title="Export as Markdown"
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={onClose}
              aria-label="Close documentation"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Box className="documentation-content">
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{ mb: 2 }}
          >
            <Tab label="Description" />
            <Tab label="I/O" />
            <Tab label="Notes" />
          </Tabs>

          <TabPanel value={tabValue} index={0}>
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                <Button
                  size="small"
                  startIcon={isPreview ? <EditIcon fontSize="small" /> : undefined}
                  onClick={() => setIsPreview(!isPreview)}
                >
                  {isPreview ? "Edit" : "Preview"}
                </Button>
              </Box>
              {isPreview ? (
                <Box
                  className="markdown-preview"
                  sx={{ flex: 1, overflow: "auto" }}
                >
                  {descriptionMarkdown || (
                    <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                      No description yet. Click Edit to add documentation.
                    </Typography>
                  )}
                </Box>
              ) : (
                <DocumentationEditor
                  label="Workflow Description"
                  editorState={documentation.description}
                  onChange={setDescription}
                  placeholder="Describe what this workflow does..."
                />
              )}
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                <Button
                  size="small"
                  startIcon={isPreview ? <EditIcon fontSize="small" /> : undefined}
                  onClick={() => setIsPreview(!isPreview)}
                >
                  {isPreview ? "Edit" : "Preview"}
                </Button>
              </Box>
              {isPreview ? (
                <Box sx={{ flex: 1, overflow: "auto" }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
                    Inputs
                  </Typography>
                  <Box className="markdown-preview" sx={{ mb: 2 }}>
                    {inputsMarkdown || (
                      <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                        No inputs documented
                      </Typography>
                    )}
                  </Box>
                  
                  <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
                    Outputs
                  </Typography>
                  <Box className="markdown-preview">
                    {outputsMarkdown || (
                      <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                        No outputs documented
                      </Typography>
                    )}
                  </Box>
                </Box>
              ) : (
                <Box sx={{ flex: 1, overflow: "auto" }}>
                  <DocumentationEditor
                    label="Inputs"
                    editorState={documentation.inputs}
                    onChange={setInputs}
                    placeholder="Document the inputs required by this workflow..."
                  />
                  <DocumentationEditor
                    label="Outputs"
                    editorState={documentation.outputs}
                    onChange={setOutputs}
                    placeholder="Document the outputs produced by this workflow..."
                  />
                </Box>
              )}
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                <Button
                  size="small"
                  startIcon={isPreview ? <EditIcon fontSize="small" /> : undefined}
                  onClick={() => setIsPreview(!isPreview)}
                >
                  {isPreview ? "Edit" : "Preview"}
                </Button>
              </Box>
              {isPreview ? (
                <Box className="markdown-preview" sx={{ flex: 1, overflow: "auto" }}>
                  {notesMarkdown || (
                    <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                      No notes yet. Click Edit to add notes.
                    </Typography>
                  )}
                </Box>
              ) : (
                <DocumentationEditor
                  label="Notes & Instructions"
                  editorState={documentation.notes}
                  onChange={setNotes}
                  placeholder="Add any additional notes, instructions, or tips for using this workflow..."
                />
              )}
            </Box>
          </TabPanel>
        </Box>
      </Box>
    </EditorUiProvider>
  );
};

export default WorkflowDocumentationPanel;
