/** @jsxImportSource @emotion/react */
/**
 * Studio home: two creation paths and the recent projects that came out of
 * them. A storyboard project starts visual (shots → stills → clips); a script
 * project starts spoken (lines → voices → takes). Both end in the timeline
 * editor, which is the one finishing surface the product has.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import TheatersRoundedIcon from "@mui/icons-material/TheatersRounded";
import RecordVoiceOverRoundedIcon from "@mui/icons-material/RecordVoiceOverRounded";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import {
  BORDER_RADIUS,
  Card,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../components/ui_primitives";
import { useCreateStoryboard, useStoryboards } from "../hooks/storyboard/useStoryboards";
import { useCreateScript, useScripts } from "../hooks/script/useScripts";
import { useTimelines } from "../hooks/useTimelineSequence";
import StudioShell from "./StudioShell";

type ProjectKind = "storyboard" | "script" | "timeline";

interface RecentProject {
  kind: ProjectKind;
  id: string;
  name: string;
  updatedAt: string;
}

const KIND_LABEL = {
  storyboard: "Storyboard",
  script: "Script",
  timeline: "Video"
} satisfies Record<ProjectKind, string>;

const KIND_ICON = {
  storyboard: <TheatersRoundedIcon fontSize="small" />,
  script: <RecordVoiceOverRoundedIcon fontSize="small" />,
  timeline: <MovieRoundedIcon fontSize="small" />
} satisfies Record<ProjectKind, React.ReactNode>;

const projectRoute = (p: RecentProject) => `/studio/${p.kind}/${p.id}`;

const PathCard = ({
  icon,
  title,
  description,
  cta,
  busy,
  disabled,
  onStart
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) => (
  <Card
    variant="outlined"
    padding="comfortable"
    sx={{ flex: 1, minWidth: 260, maxWidth: 420 }}
  >
    <FlexColumn gap={SPACING.md} align="flex-start">
      {icon}
      <Text size="big" weight={600}>
        {title}
      </Text>
      <Text size="small" color="secondary">
        {description}
      </Text>
      <EditorButton variant="contained" onClick={onStart} disabled={disabled}>
        {busy ? "Creating…" : cta}
      </EditorButton>
    </FlexColumn>
  </Card>
);

const StudioHome = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const createStoryboard = useCreateStoryboard();
  const createScript = useCreateScript();
  const [creating, setCreating] = useState<ProjectKind | null>(null);

  const storyboards = useStoryboards();
  const scripts = useScripts();
  // No project filter: storyboards and scripts list all the user's documents,
  // so the merged recent list scopes timelines the same way.
  const timelines = useTimelines();

  const recent = useMemo<RecentProject[]>(() => {
    const rows: RecentProject[] = [
      ...(storyboards.data ?? []).map((s) => ({
        kind: "storyboard" as const,
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt
      })),
      ...(scripts.data ?? []).map((s) => ({
        kind: "script" as const,
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt
      })),
      ...(timelines.data ?? []).map((t) => ({
        kind: "timeline" as const,
        id: t.id,
        name: t.name,
        updatedAt: t.updatedAt
      }))
    ];
    return rows
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12);
  }, [storyboards.data, scripts.data, timelines.data]);

  // One creation at a time: both cards disable while either runs, and the
  // handlers guard on a ref as well so a double-activation can't create two
  // projects or race the navigation.
  const creatingRef = useRef(false);
  const startStoryboard = useCallback(() => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating("storyboard");
    createStoryboard
      .mutateAsync({ name: "Untitled storyboard", projectId: "default" })
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
      .mutateAsync({ name: "Untitled script", projectId: "default" })
      .then((created) => navigate(`/studio/script/${created.id}`))
      .finally(() => {
        creatingRef.current = false;
        setCreating(null);
      });
  }, [createScript, navigate]);

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
            Pick a starting point — the agent handles the models, you direct.
          </Text>
        </FlexColumn>

        <FlexRow gap={SPACING.lg} wrap justify="center" fullWidth>
          <PathCard
            icon={<TheatersRoundedIcon />}
            title="Start with a storyboard"
            description="Describe your idea. The director agent breaks it into shots, renders stills, animates them into clips, and cuts them together."
            cta="New storyboard"
            busy={creating === "storyboard"}
            disabled={creating !== null}
            onStart={startStoryboard}
          />
          <PathCard
            icon={<RecordVoiceOverRoundedIcon />}
            title="Start with a script"
            description="Write or generate a script, cast a voice for every speaker, and turn the voiced lines into a video with captions."
            cta="New script"
            busy={creating === "script"}
            disabled={creating !== null}
            onStart={startScript}
          />
        </FlexRow>

        {recent.length > 0 && (
          <FlexColumn gap={SPACING.sm} sx={{ width: "100%", maxWidth: 880 }}>
            <Text size="small" weight={600} color="secondary">
              Recent projects
            </Text>
            {recent.map((p) => (
              <FlexRow
                key={`${p.kind}:${p.id}`}
                component="button"
                align="center"
                gap={SPACING.md}
                onClick={() => navigate(projectRoute(p))}
                sx={{
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  background: "none",
                  border: `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: BORDER_RADIUS.md,
                  px: SPACING.md,
                  py: SPACING.sm,
                  color: "inherit",
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.hover
                  }
                }}
              >
                {KIND_ICON[p.kind]}
                <Text size="normal" truncate sx={{ flex: 1 }}>
                  {p.name}
                </Text>
                <Chip compact label={KIND_LABEL[p.kind]} />
                <Text size="smaller" color="secondary">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </Text>
              </FlexRow>
            ))}
          </FlexColumn>
        )}
      </FlexColumn>
    </StudioShell>
  );
};

export default StudioHome;
