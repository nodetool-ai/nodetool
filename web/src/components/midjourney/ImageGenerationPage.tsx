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
import { Theme, useTheme, alpha } from "@mui/material/styles";
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
import { useWorkflowRunner } from "../../../../apps/src/stores/WorkflowRunner";
import { createWorkflowRunnerStore } from "../../stores/WorkflowRunner";

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

  const borderColor = theme.vars.palette.grey[800];

  return css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
    padding: theme.spacing(12, 18, 4),
    gap: theme.spacing(3),
    backgroundColor: theme.vars.palette.background.default,
    overflow: "hidden",

    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(4, 2.5, 3)
    },

    ".glass-card": {
      position: "relative",
      borderRadius: doubledRadius,
      border: `1px solid ${borderColor}`,
      backgroundColor: theme.vars.palette.grey[900],
      backdropFilter: "blur(14px)",
      boxShadow: `0 24px 60px -28px ${theme.vars.palette.grey[900]}`,
      overflow: "hidden"
    },

    ".hero": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(3),
      padding: theme.spacing(4),
      isolation: "isolate"
    },

    ".hero::after": {
      content: "''",
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      pointerEvents: "none",
      border: `1px solid ${alpha(
        theme.palette.grey[100],
        theme.palette.mode === "dark" ? 0.04 : 0.1
      )}`,
      mixBlendMode: theme.palette.mode === "dark" ? "screen" : "multiply",
      opacity: 0.6
    },

    ".hero-copy": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".hero-eyebrow": {
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem"
    },

    ".hero-title": {
      fontSize: "clamp(2.4rem, 4vw, 3rem)",
      fontWeight: 600,
      letterSpacing: "-0.02em"
    },

    ".hero-subtitle": {
      padding: theme.spacing(0, 0, 2),
      color: theme.vars.palette.text.secondary
    },

    ".hero-controls": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(2),
      alignItems: "center"
    },

    ".hero-status": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      flexWrap: "wrap",
      color: theme.vars.palette.text.secondary
    },

    ".hero-status .MuiLinearProgress-root": {
      flex: 1,
      minWidth: 220,
      maxWidth: 320,
      height: 6,
      borderRadius: 99,
      backgroundColor:
        theme.palette.mode === "dark"
          ? alpha(theme.palette.grey[100], 0.08)
          : alpha(theme.palette.grey[400], 0.2)
    },

    ".hero-status .MuiLinearProgress-bar": {
      borderRadius: 99
    },

    ".alert-stack": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5)
    },

    ".notifications": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".content-grid": {
      display: "grid",
      gap: theme.spacing(3),
      alignItems: "stretch",
      gridTemplateColumns: "minmax(0, 1fr)",

      [theme.breakpoints.up("lg")]: {
        gridTemplateColumns: "minmax(0, 2.25fr) minmax(0, 1fr)"
      }
    },

    ".gallery-shell": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(3),
      minHeight: 420,
      gap: theme.spacing(2)
    },

    ".gallery-heading": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1)
    },

    ".gallery-title": {
      fontWeight: 600
    },

    ".image-grid": {
      flex: 1,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: theme.spacing(2),
      overflowY: "auto",
      paddingRight: theme.spacing(0.75),
      paddingBottom: theme.spacing(1.5)
    },

    ".image-cell": {
      position: "relative",
      borderRadius: doubledRadius,
      border: `1px solid ${borderColor}`,
      backgroundColor: theme.vars.palette.background.paper,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 200,
      overflow: "hidden",
      transition: "transform 120ms ease, box-shadow 180ms ease"
    },

    ".image-cell::after": {
      content: "''",
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      border: `1px solid ${alpha(
        theme.palette.grey[100],
        theme.palette.mode === "dark" ? 0.04 : 0.1
      )}`,
      pointerEvents: "none"
    },

    ".image-cell:hover": {
      transform: "translateY(-2px)",
      boxShadow: `0 16px 36px -20px ${theme.vars.palette.grey[900]}`
    },

    ".image-cell img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    },

    ".image-placeholder": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(1.5),
      textAlign: "center",
      borderRadius: doubledRadius,
      border: `1px dashed ${borderColor}`,
      background:
        theme.palette.mode === "dark"
          ? alpha(theme.palette.grey[900], 0.6)
          : alpha(theme.palette.grey[100], 0.75),
      color: theme.vars.palette.text.secondary,
      padding: theme.spacing(6)
    },

    ".composer-card": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2.5),
      padding: theme.spacing(3)
    },

    ".composer-card header": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.75)
    },

    ".composer-shell": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2)
    },

    ".composer-shell textarea": {
      color: theme.vars.palette.text.primary,
      backgroundColor:
        theme.palette.mode === "dark"
          ? alpha(theme.palette.grey[900], 0.65)
          : alpha(theme.palette.grey[100], 0.95),
      borderRadius: theme.shape.borderRadius,
      border: `1px solid ${borderColor}`,
      padding: theme.spacing(1.75, 2),
      resize: "none",
      fontSize: "1rem",
      lineHeight: 1.55,
      transition: "border-color 160ms ease, box-shadow 200ms ease"
    },

    ".composer-shell textarea:focus": {
      borderColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 4px ${alpha(
        theme.palette.primary.main,
        theme.palette.mode === "dark" ? 0.16 : 0.22
      )}`,
      outline: "none"
    },

    ".composer-shell textarea::placeholder": {
      color: theme.vars.palette.text.secondary
    },

    ".composer-actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: theme.spacing(2),
      alignItems: "center"
    },

    ".generate-button": {
      padding: theme.spacing(1.25, 2.5),
      fontWeight: 600
    },

    ".refresh-button": {
      borderColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.main
    },

    ".refresh-button:hover": {
      borderColor: theme.vars.palette.primary.light
    },

    ".empty-eyebrow": {
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase"
    }
  });
};

const loadImageWorkflows = async (): Promise<Workflow[]> => {
  const { data, error } = await client.GET("/api/workflows/image-generation");

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
  } = useQuery<Workflow[], Error>({
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

  const [results, setResults] = useState<any[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const runnerStore = useMemo(() => {
    return createWorkflowRunnerStore();
  }, []);

  const {
    run: runWorkflow,
    state: runnerState,
    statusMessage,
    notifications
  } = useMemo(() => {
    const store = runnerStore;
    const state = store.getState();

    return {
      run: state.run,
      state: state.state,
      statusMessage: state.statusMessage,
      notifications: state.notifications
    };
  }, [runnerStore]);

  const imageResults: ImageResult[] = useMemo(() => {
    return results && results.length > 0
      ? (results
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
          .filter(Boolean) as ImageResult[])
      : [];
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
      const blob = new Blob([data.buffer as ArrayBuffer], {
        type: "image/png"
      });
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
    if (!selectedWorkflow) {
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    setSubmitError(null);

    try {
      await runWorkflow(selectedWorkflow.id, { prompt: trimmed });
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
  }, [prompt, runWorkflow, selectedWorkflow]);

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

  const handleWorkflowChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedWorkflowId(event.target.value);
    },
    []
  );

  return (
    <Box css={styles} component="section">
      <header className="hero glass-card">
        <div className="hero-copy">
          <Typography className="hero-subtitle" variant="body1">
            Pick an image-capable workflow, describe your vision, and capture
            the outputs in a tiled gallery.
          </Typography>
        </div>

        <div className="hero-controls">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="workflow-select-label">Workflow</InputLabel>
            <Select
              labelId="workflow-select-label"
              label="Workflow"
              value={selectedWorkflowId}
              onChange={handleWorkflowChange}
              disabled={
                workflowsLoading || !workflows || workflows.length === 0
              }
            >
              {workflows?.map((workflow) => (
                <MenuItem value={workflow.id} key={workflow.id}>
                  {workflow.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            type="button"
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            disabled={workflowsLoading}
            className="refresh-button"
          >
            Refresh
          </Button>
        </div>

        <div className="hero-status">
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
              sx={{
                backgroundColor: "transparent",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: (theme: Theme) =>
                    theme.vars.palette.c_highlight
                }
              }}
            />
          )}
        </div>
      </header>

      {(workflowsLoadFailed && workflowsError) ||
      submitError ||
      (notifications?.length ?? 0) > 0 ? (
        <div className="alert-stack">
          {workflowsLoadFailed && workflowsError && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            >
              {workflowsError.message}
            </Alert>
          )}
          {submitError && <Alert severity="error">{submitError}</Alert>}
          {(notifications?.length ?? 0) > 0 && (
            <div className="notifications">
              {notifications?.map((notification) => (
                <Alert
                  key={notification.id}
                  severity={notification.type === "error" ? "error" : "info"}
                >
                  {notification.content}
                </Alert>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="content-grid">
        <section className="gallery-shell glass-card">
          <div className="gallery-heading">
            <Typography className="gallery-title" variant="h6">
              Output Gallery
            </Typography>
            {imageSources.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {imageSources.length}{" "}
                {imageSources.length === 1 ? "image" : "images"}
              </Typography>
            )}
          </div>

          {imageSources.length > 0 ? (
            <div className="image-grid">
              {imageSources
                ? imageSources.map((image) => (
                    <div className="image-cell" key={image.id}>
                      <img src={image.url} alt="Generated artwork" draggable />
                    </div>
                  ))
                : null}
            </div>
          ) : (
            <div className="image-placeholder">
              <Typography className="empty-eyebrow" variant="overline">
                Awaiting Inspiration
              </Typography>
              <Typography variant="h6" component="p">
                Generated images will appear here
              </Typography>
              <Typography variant="body2">
                Use the prompt composer below to get started.
              </Typography>
            </div>
          )}
        </section>

        <form
          className="composer-card glass-card"
          onSubmit={handleSubmitEvent}
          autoComplete="off"
        >
          <header>
            <Typography variant="h6">Prompt Composer</Typography>
            <Typography variant="body2" color="text.secondary">
              Describe the scene, camera, and mood details. Press Enter to send
              or Shift+Enter for new lines.
            </Typography>
          </header>

          <div className="composer-shell">
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

          <div className="composer-actions">
            <Tooltip
              title={
                isSubmitDisabled
                  ? "Enter a prompt to generate"
                  : "Generate images"
              }
            >
              <span>
                <Button
                  color="primary"
                  variant="contained"
                  type="submit"
                  endIcon={<SendIcon />}
                  disabled={isSubmitDisabled}
                  className="generate-button"
                >
                  Generate
                </Button>
              </span>
            </Tooltip>
          </div>
        </form>
      </div>

      {!workflowsLoading &&
        !workflowsLoadFailed &&
        (!workflows || workflows.length === 0) && (
          <Alert
            severity="info"
            sx={{ alignSelf: "flex-start", maxWidth: 480 }}
          >
            No workflows with string prompts and image outputs were found.
            Refresh once you have created one, or adjust your workflow
            configuration.
          </Alert>
        )}
    </Box>
  );
};

export default ImageGenerationPage;
