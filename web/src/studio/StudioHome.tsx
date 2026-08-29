/** @jsxImportSource @emotion/react */
/**
 * Studio home: one prompt that lands on a linked script + storyboard, the two
 * blank starting points for people who would rather write first, and the
 * projects that came out of them. Linked documents share a card — the script,
 * the board it links, and the timeline either produced are one project, not
 * three rows (see {@link groupLinkedProjects}).
 */

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import TheatersRoundedIcon from "@mui/icons-material/TheatersRounded";
import RecordVoiceOverRoundedIcon from "@mui/icons-material/RecordVoiceOverRounded";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import {
  BORDER_RADIUS,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text,
  TextInput
} from "../components/ui_primitives";
import { useCreateStoryboard } from "../hooks/storyboard/useStoryboards";
import { useCreateScript } from "../hooks/script/useScripts";
import StudioShell from "./StudioShell";
import { useStudioProjects } from "./useStudioProjects";
import { useStudioPromptStart } from "./useStudioPromptStart";
import type {
  StudioDocument,
  StudioDocumentKind,
  StudioProject
} from "./groupLinkedProjects";
import { creationProjectId } from "../stores/WorkspaceTabsStore";

const KIND_LABEL = {
  storyboard: "Storyboard",
  script: "Script",
  timeline: "Video"
} satisfies Record<StudioDocumentKind, string>;

const KIND_ICON = {
  storyboard: <TheatersRoundedIcon fontSize="small" />,
  script: <RecordVoiceOverRoundedIcon fontSize="small" />,
  timeline: <MovieRoundedIcon fontSize="small" />
} satisfies Record<StudioDocumentKind, React.ReactNode>;

const documentRoute = (document: StudioDocument) =>
  `/studio/${document.kind}/${document.id}`;

const PROMPT_STAGE_LABEL = {
  idle: "Make it",
  directing: "Directing…",
  writing: "Writing the script…"
} as const;

const ProjectCard = ({
  project,
  onOpen
}: {
  project: StudioProject;
  onOpen: (document: StudioDocument) => void;
}) => {
  const theme = useTheme();
  return (
    <FlexColumn
      gap={SPACING.sm}
      data-testid="studio-project-card"
      sx={{
        width: "100%",
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: BORDER_RADIUS.md,
        px: SPACING.md,
        py: SPACING.sm
      }}
    >
      <FlexRow align="center" gap={SPACING.md}>
        <Text size="normal" truncate sx={{ flex: 1 }}>
          {project.name}
        </Text>
        <Text size="smaller" color="secondary">
          {new Date(project.updatedAt).toLocaleDateString()}
        </Text>
      </FlexRow>
      <FlexRow align="center" gap={SPACING.sm} wrap>
        {project.documents.map((document) => (
          <FlexRow
            key={`${document.kind}:${document.id}`}
            component="button"
            align="center"
            gap={SPACING.xs}
            onClick={() => onOpen(document)}
            sx={{
              cursor: "pointer",
              background: "none",
              border: `1px solid ${theme.vars.palette.divider}`,
              borderRadius: BORDER_RADIUS.pill,
              px: SPACING.sm,
              py: SPACING.xs,
              color: "inherit",
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover
              }
            }}
          >
            {KIND_ICON[document.kind]}
            <Text size="smaller">{KIND_LABEL[document.kind]}</Text>
          </FlexRow>
        ))}
      </FlexRow>
    </FlexColumn>
  );
};

const BlankStart = ({
  icon,
  label,
  busy,
  disabled,
  onStart
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) => (
  <EditorButton variant="text" startIcon={icon} onClick={onStart} disabled={disabled}>
    {busy ? "Creating…" : label}
  </EditorButton>
);

const StudioHome = () => {
  const navigate = useNavigate();
  const createStoryboard = useCreateStoryboard();
  const createScript = useCreateScript();
  const [creating, setCreating] = useState<StudioDocumentKind | null>(null);
  const [prompt, setPrompt] = useState("");

  const { projects } = useStudioProjects();
  const { start, stage, busy, error: promptError } = useStudioPromptStart();

  const makeIt = useCallback(() => {
    if (busy) return;
    void start(prompt)
      .then(({ boardId }) => navigate(`/studio/storyboard/${boardId}`))
      .catch(() => {
        // Surfaced through promptError; the prompt stays for a second try.
      });
  }, [busy, navigate, prompt, start]);

  // One creation at a time: the blank starts disable while either runs, and
  // the handlers guard on a ref as well so a double-activation can't create
  // two projects or race the navigation.
  const creatingRef = useRef(false);
  const startStoryboard = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating("storyboard");
    createStoryboard
      .mutateAsync({ name: "Untitled storyboard", projectId: creationProjectId() })
      .then((created) => navigate(`/studio/storyboard/${created.id}`))
      .finally(() => {
        creatingRef.current = false;
        setCreating(null);
      });
  }, [createStoryboard, navigate]);

  const startScript = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating("script");
    createScript
      .mutateAsync({ name: "Untitled script", projectId: creationProjectId() })
      .then((created) => navigate(`/studio/script/${created.id}`))
      .finally(() => {
        creatingRef.current = false;
        setCreating(null);
      });
  }, [createScript, navigate]);

  const openDocument = useCallback(
    (document: StudioDocument) => navigate(documentRoute(document)),
    [navigate]
  );

  return (
    <StudioShell showBack={false}>
      <FlexColumn
        align="center"
        gap={SPACING.xl}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: SPACING.xl }}
      >
        <FlexColumn align="center" gap={SPACING.sm} sx={{ pt: SPACING.xl }}>
          <Text size="giant" weight={600}>
            Make a video
          </Text>
          <Text size="normal" color="secondary">
            Describe it once — the agent directs the shots and writes the
            script, linked to each other.
          </Text>
        </FlexColumn>

        <Card
          variant="outlined"
          padding="comfortable"
          sx={{ width: "100%", maxWidth: 720 }}
        >
          <FlexColumn gap={SPACING.md} align="stretch">
            <TextInput
              label="What is the video about?"
              placeholder="A 30-second explainer about how tides work, calm narration over close-up ocean shots."
              multiline
              rows={3}
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
            />
            {promptError && (
              <Text size="small" color="error">
                {promptError}
              </Text>
            )}
            <FlexRow align="center" gap={SPACING.sm} wrap>
              <EditorButton
                variant="contained"
                onClick={makeIt}
                disabled={busy || prompt.trim().length === 0}
              >
                {PROMPT_STAGE_LABEL[stage]}
              </EditorButton>
              <Text size="smaller" color="secondary" sx={{ flex: 1 }}>
                or start blank:
              </Text>
              <BlankStart
                icon={<TheatersRoundedIcon />}
                label="New storyboard"
                busy={creating === "storyboard"}
                disabled={busy || creating !== null}
                onStart={startStoryboard}
              />
              <BlankStart
                icon={<RecordVoiceOverRoundedIcon />}
                label="New script"
                busy={creating === "script"}
                disabled={busy || creating !== null}
                onStart={startScript}
              />
            </FlexRow>
          </FlexColumn>
        </Card>

        {projects.length > 0 && (
          <FlexColumn gap={SPACING.sm} sx={{ width: "100%", maxWidth: 880 }}>
            <Text size="small" weight={600} color="secondary">
              Recent projects
            </Text>
            {projects.slice(0, 12).map((project) => (
              <ProjectCard
                key={project.key}
                project={project}
                onOpen={openDocument}
              />
            ))}
          </FlexColumn>
        )}
      </FlexColumn>
    </StudioShell>
  );
};

export default StudioHome;
