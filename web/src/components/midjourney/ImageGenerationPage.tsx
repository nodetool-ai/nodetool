/** @jsxImportSource @emotion/react */
import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { Theme, useTheme } from "@mui/material/styles";
import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  SelectChangeEvent,
  Tooltip,
  Typography
} from "@mui/material";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SendIcon from "@mui/icons-material/Send";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { Workflow } from "../../stores/ApiTypes";
import { MessageInput } from "../chat/composer/MessageInput";
import { createErrorMessage } from "../../utils/errorHandling";
import { useWorkflowRunner as useMiniWorkflowRunner } from "../../../../apps/src/stores/WorkflowRunner";

interface SchemaLike {
  type?: string | string[];
  format?: string;
  contentMediaType?: string;
  contentType?: string;
  anyOf?: unknown[];
  oneOf?: unknown[];
  allOf?: unknown[];
  properties?: Record<string, unknown> | undefined;
  items?: unknown | unknown[];
  [key: string]: unknown;
}

type WorkflowWithSchemas = Workflow & {
  input_schema?: unknown;
  output_schema?: unknown;
};

type ImageWorkflow = WorkflowWithSchemas & {
  parsedInputSchema: SchemaLike | null;
  parsedOutputSchema: SchemaLike | null;
  stringInputs: string[];
  hasImageOutput: boolean;
};

type ImageResult = {
  id: string;
  data: string | Uint8Array | undefined;
};

type ImageSource = {
  id: string;
  url: string;
};

const pageStyles = (theme: Theme) => {
  const doubledRadius =
    typeof theme.shape.borderRadius === "number"
      ? theme.shape.borderRadius * 2
      : 16;

  return css({
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "100%",
    padding: "60px 20px 20px 60px",
    gap: theme.spacing(2),
    backgroundColor: theme.vars.palette.background.default,
    color: theme.vars.palette.text.primary,
    overflow: "hidden",

    ".header": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".controls": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(2),
      alignItems: "center"
    },

    ".status-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      color: theme.vars.palette.text.secondary,
      flexWrap: "wrap"
    },

    ".notifications": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".image-grid": {
      flex: 1,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: theme.spacing(2),
      overflowY: "auto",
      paddingRight: theme.spacing(0.5),
      paddingBottom: theme.spacing(1.5)
    },

    ".image-cell": {
      position: "relative",
      borderRadius: doubledRadius,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 220,
      overflow: "hidden"
    },

    ".image-cell img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    },

    ".image-placeholder": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(1.5),
      textAlign: "center",
      background: theme.vars.palette.background.paper,
      borderRadius: doubledRadius,
      border: `1px dashed ${theme.vars.palette.divider}`,
      padding: theme.spacing(6)
    },

    ".composer-container": {
      marginTop: "auto"
    },

    ".composer-shell": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      borderRadius: doubledRadius,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      padding: theme.spacing(1.5)
    },

    ".composer-shell textarea": {
      color: theme.vars.palette.text.primary
    }
  });
};

const loadImageWorkflows = async (): Promise<ImageWorkflow[]> => {
  const { data, error } = await client.GET("/api/workflows/image-generation/", {
    params: {
      query: {
        limit: 200,
      }
    }
  });

  if (error) {
    throw createErrorMessage(error, "Failed to load workflows");
  }

  return data.workflows;
};

const ImageGenerationPage: React.FC = () => {
  const theme = useTheme();
  const styles = pageStyles(theme);
  const [prompt, setPrompt] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | "">("");
  const [selectedInputKey, setSelectedInputKey] = useState<string | "">("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    data: workflows,
    isLoading: workflowsLoading,
    isError: workflowsLoadFailed,
    error: workflowsError,
    refetch
  } = useQuery<ImageWorkflow[], Error>({
    queryKey: ["image-workflows"],
    queryFn: loadImageWorkflows,
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (workflows && workflows.length > 0) {
      setSelectedWorkflowId((current) => {
        if (current && workflows.some((workflow) => workflow.id === current)) {
          return current;
        }
        return workflows[0].id;
      });
    }
  }, [workflows]);

  const selectedWorkflow = useMemo(() => {
    if (!workflows || workflows.length === 0 || !selectedWorkflowId) {
      return undefined;
    }
    return workflows.find((workflow) => workflow.id === selectedWorkflowId);
  }, [selectedWorkflowId, workflows]);

  useEffect(() => {
    if (!selectedWorkflow) {
      setSelectedInputKey("");
      return;
    }
    setSelectedInputKey((current) => {
      if (
        current &&
        selectedWorkflow.stringInputs &&
        selectedWorkflow.stringInputs.includes(current)
      ) {
        return current;
      }
      return selectedWorkflow.stringInputs[0] || "";
    });
  }, [selectedWorkflow]);

  const runWorkflow = useMiniWorkflowRunner((state) => state.run);
  const runnerState = useMiniWorkflowRunner((state) => state.state);
  const results = useMiniWorkflowRunner((state) => state.results);
  const progress = useMiniWorkflowRunner((state) => state.progress);
  const statusMessage = useMiniWorkflowRunner((state) => state.statusMessage);
  const notifications = useMiniWorkflowRunner((state) => state.notifications);

  const imageResults: ImageResult[] = useMemo(() => {
    return results
      .map((result, index) => {
        if (
          result &&
          typeof result === "object" &&
          "type" in result &&
          (result as { type?: string }).type === "image"
        ) {
          const typed = result as {
            type: string;
            data?: Uint8Array;
            uri?: string;
          };
          return {
            id: `${index}`,
            data: typed.uri ?? (typed.data as Uint8Array | undefined)
          };
        }
        return null;
      })
      .filter(Boolean) as ImageResult[];
  }, [results]);

  const [imageSources, setImageSources] = useState<ImageSource[]>([]);

  useEffect(() => {
    const createdUrls: string[] = [];
    const sources = imageResults.map((result, index) => {
      const key = `${result.id}-${index}`;
      const { data } = result;
      if (!data) {
        return null;
      }
      if (typeof data === "string") {
        if (data.startsWith("data:") || data.startsWith("http")) {
          return { id: key, url: data } as ImageSource;
        }
        return { id: key, url: `data:image/png;base64,${data}` } as ImageSource;
      }
      const blob = new Blob([data], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      createdUrls.push(url);
      return { id: key, url } as ImageSource;
    });

    setImageSources(sources.filter(Boolean) as ImageSource[]);

    return () => {
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageResults]);

  const isSubmitDisabled =
    !selectedWorkflow ||
    !selectedInputKey ||
    prompt.trim().length === 0 ||
    runnerState === "running" ||
    runnerState === "connecting";

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedWorkflow || !selectedInputKey) {
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    setSubmitError(null);

    try {
      await runWorkflow(selectedWorkflow.id, { [selectedInputKey]: trimmed });
      setPrompt("");
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    } catch (error) {
      console.error("Failed to run workflow", error);
      setSubmitError(
        error instanceof Error ? error.message : "Failed to run workflow"
      );
    }
  }, [prompt, runWorkflow, selectedInputKey, selectedWorkflow]);

  const handleSubmitEvent = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void handleSubmit();
    },
    [handleSubmit]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleWorkflowChange = useCallback((event: SelectChangeEvent<string>) => {
    setSelectedWorkflowId(event.target.value);
  }, []);

  const handleInputKeyChange = useCallback((event: SelectChangeEvent<string>) => {
    setSelectedInputKey(event.target.value);
  }, []);

  return (
    <Box css={styles} component="section">
      <header className="header">
        <Typography variant="h4" component="h1">
          Midjourney-Style Image Generation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pick an image-capable workflow, describe your vision, and capture the
          outputs in a tiled gallery.
        </Typography>
        <div className="controls">
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="workflow-select-label">Workflow</InputLabel>
            <Select
              labelId="workflow-select-label"
              label="Workflow"
              value={selectedWorkflowId}
              onChange={handleWorkflowChange}
              disabled={workflowsLoading || !workflows || workflows.length === 0}
            >
              {workflows?.map((workflow) => (
                <MenuItem value={workflow.id} key={workflow.id}>
                  {workflow.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="input-select-label">Prompt Input</InputLabel>
            <Select
              labelId="input-select-label"
              label="Prompt Input"
              value={selectedInputKey}
              onChange={handleInputKeyChange}
              disabled={!selectedWorkflow}
            >
              {selectedWorkflow?.stringInputs.map((inputKey) => (
                <MenuItem value={inputKey} key={inputKey}>
                  {inputKey}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        <div className="status-row">
          {workflowsLoading && (
            <>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading workflows…</Typography>
            </>
          )}
          {runnerState === "running" && (
            <>
              <CircularProgress size={18} />
              <Typography variant="body2">
                {statusMessage || "Generating images…"}
              </Typography>
            </>
          )}
          {runnerState === "idle" && statusMessage && (
            <Typography variant="body2" color="text.secondary">
              {statusMessage}
            </Typography>
          )}
          {progress && progress.total > 0 && (
            <LinearProgress
              variant="determinate"
              value={(progress.current / progress.total) * 100}
              sx={{ flex: 1, maxWidth: 240 }}
            />
          )}
        </div>
        {workflowsLoadFailed && workflowsError && (
          <Alert
            severity="error"
            sx={{ width: "fit-content" }}
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            {workflowsError.message}
          </Alert>
        )}
        {submitError && (
          <Alert severity="error" sx={{ width: "fit-content" }}>
            {submitError}
          </Alert>
        )}
        {notifications.length > 0 && (
          <div className="notifications">
            {notifications.map((notification) => (
              <Alert
                key={notification.id}
                severity={notification.type === "error" ? "error" : "info"}
              >
                {notification.content}
              </Alert>
            ))}
          </div>
        )}
      </header>

      {imageSources.length > 0 ? (
        <div className="image-grid">
          {imageSources.map((image) => (
            <div className="image-cell" key={image.id}>
              <img src={image.url} alt="Generated artwork" draggable />
            </div>
          ))}
        </div>
      ) : (
        <div className="image-placeholder">
          <Typography variant="h6" component="p">
            Generated images will appear here
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use the prompt composer below to get started.
          </Typography>
        </div>
      )}

      <form
        className="composer-container"
        onSubmit={handleSubmitEvent}
        autoComplete="off"
      >
        <div className="composer-shell">
          <div style={{ flex: 1 }}>
            <MessageInput
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              disabled={!selectedWorkflow}
              placeholder={
                selectedWorkflow
                  ? "Describe the scene you want to generate…"
                  : "Select a workflow to start generating images"
              }
            />
          </div>
          <Tooltip title={isSubmitDisabled ? "Enter a prompt to generate" : "Generate"}>
            <span>
              <IconButton
                color="primary"
                type="submit"
                disabled={isSubmitDisabled}
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      </form>

      {!workflowsLoading &&
        !workflowsLoadFailed &&
        (!workflows || workflows.length === 0) && (
        <Alert severity="info">
          No workflows with string prompts and image outputs were found.
          Refresh once you have created one, or adjust your workflow
          configuration.
        </Alert>
        )}

      {workflowsLoadFailed && !workflowsLoading && (
        <Tooltip title="Retry loading workflows">
          <IconButton onClick={() => refetch()} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default ImageGenerationPage;
