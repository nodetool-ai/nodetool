/** @jsxImportSource @emotion/react */
/**
 * Studio home: the three entry cards Studio offers (PRD § 6.1, D24 — Image
 * and Workflow are workspace flows), the two blank starting points for people
 * who would rather write first, and the projects that came out of them. Linked
 * documents share a card — the script, the board it links, and the timeline
 * either produced are one project, not three rows (see
 * {@link groupLinkedProjects}).
 *
 * The Storyboard card creates a board at stage `idea` and opens it; the flow
 * itself lives on the board page, which resumes from the stage the document
 * carries. Models are the curated Studio ones stamped on there, so nothing
 * here asks for a model.
 */

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import TheatersRoundedIcon from "@mui/icons-material/TheatersRounded";
import RecordVoiceOverRoundedIcon from "@mui/icons-material/RecordVoiceOverRounded";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import {
  BORDER_RADIUS,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../components/ui_primitives";
import { OptionCardGrid } from "../components/setup/OptionCardGrid";
import { STUDIO_ENTRY_CARDS } from "../components/setup/entryCards";
import { newStoryboardSetupDocument } from "../components/setup/storyboard/useStoryboardSetupFlow";
import { useCreateStoryboard } from "../hooks/storyboard/useStoryboards";
import { useCreateScript } from "../hooks/script/useScripts";
import StudioShell from "./StudioShell";
import { useStudioProjects } from "./useStudioProjects";
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

  const { projects } = useStudioProjects();

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

  // The Storyboard entry card: a board at stage `idea`, opened straight away.
  // The board page renders the flow from that stage and stamps the curated
  // Studio models, so there is no model picker here (D24).
  const startStoryboardFlow = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating("storyboard");
    createStoryboard
      .mutateAsync({
        name: "Untitled storyboard",
        projectId: creationProjectId(),
        document: newStoryboardSetupDocument("")
      })
      .then((created) => navigate(`/studio/storyboard/${created.id}`))
      .finally(() => {
        creatingRef.current = false;
        setCreating(null);
      });
  }, [createStoryboard, navigate]);

  const handleEntryCard = useCallback(
    (id: string) => {
      if (id === "storyboard") {
        startStoryboardFlow();
      }
    },
    [startStoryboardFlow]
  );

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
            Pick where to start. Each one takes a sentence and returns a
            document you can keep editing.
          </Text>
        </FlexColumn>

        <FlexColumn gap={SPACING.md} sx={{ width: "100%", maxWidth: 720 }}>
          <OptionCardGrid
            label="What are you making?"
            options={STUDIO_ENTRY_CARDS}
            onSelect={handleEntryCard}
            minColumnWidth={200}
          />
          <FlexRow align="center" gap={SPACING.sm} wrap>
            <Text size="smaller" color="secondary" sx={{ flex: 1 }}>
              or start blank:
            </Text>
            <BlankStart
              icon={<TheatersRoundedIcon />}
              label="New storyboard"
              busy={creating === "storyboard"}
              disabled={creating !== null}
              onStart={startStoryboard}
            />
            <BlankStart
              icon={<RecordVoiceOverRoundedIcon />}
              label="New script"
              busy={creating === "script"}
              disabled={creating !== null}
              onStart={startScript}
            />
          </FlexRow>
        </FlexColumn>

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
