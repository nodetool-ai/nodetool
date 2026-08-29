/**
 * "What do you want to make?" — the surface a project is started from.
 *
 * The prompt goes to the project's own agent, which builds the documents; the
 * shape shortcut says what chain to expect and is stored as the project's
 * kind. Blank documents keep their place at the foot of the view, opening
 * loose tabs the way the `+ New` menu always did.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  CloseButton,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  MenuItemPrimitive,
  Popover,
  ResponsiveImage,
  ScrollArea,
  SPACING,
  Text,
  TextInput,
  TYPOGRAPHY
} from "../ui_primitives";
import type { MessageContent } from "../../stores/ApiTypes";
import { useFileHandling } from "../chat/hooks/useFileHandling";
import { useEntities } from "../../serverState/useEntities";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  PROJECT_NEW_REF,
  LOOSE_PROJECT_ID,
  tabId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import {
  useCreateProject,
  useOpenProject,
  useProjectSummaries
} from "../../hooks/useProjects";
import { TYPE_COLOR, TYPE_GLYPH } from "../workspace/tabTypeIdentity";
import {
  TEXT_FILE_TEMPLATES,
  useNewDocumentCatalog,
  type NewDocumentSubmenu
} from "../workspace/newDocumentCatalog";
import { useExampleStoryboards } from "../../hooks/storyboard/useStoryboards";
import { useHasConfiguredProvider } from "../../hooks/useHasConfiguredProvider";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import useOnboardingStore, {
  isOnboardingFinished
} from "../../stores/OnboardingStore";
import GettingStartedChecklist from "../onboarding/GettingStartedChecklist";
import { openPageTab } from "../workspace/openPageTab";
import { stageProjectFirstTurn } from "./projectAgent";
import { PROJECT_COLOR } from "./projectIdentity";
import {
  DEFAULT_SHAPE_ID,
  PROJECT_SHAPES,
  composeFirstTurn,
  estimateFromHistory,
  formatEstimate,
  projectNameFromPrompt,
  shapeById
} from "./projectShapes";

/** Width of the centered column, per the new-project mockup. */
const COLUMN_WIDTH = 860;

interface SubmenuAnchor {
  kind: NewDocumentSubmenu;
  element: HTMLElement;
}


const NewProjectSurface = () => {
  const [prompt, setPrompt] = useState("");
  const [shapeId, setShapeId] = useState(DEFAULT_SHAPE_ID);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [entityAnchor, setEntityAnchor] = useState<HTMLElement | null>(null);
  const [submenu, setSubmenu] = useState<SubmenuAnchor | null>(null);
  const [starting, setStarting] = useState(false);
  // A start requested before a provider was configured, resumed once one is.
  const [pendingStart, setPendingStart] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  const shape = shapeById(shapeId);
  const { droppedFiles, addFiles, removeFile, getFileContents } =
    useFileHandling();
  const { data: entities } = useEntities();
  const summaries = useProjectSummaries();
  const createProject = useCreateProject();
  const openProject = useOpenProject();
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const hasConfiguredProvider = useHasConfiguredProvider();
  const { handleCreateNewWorkflow } = useWorkflowActions();
  // Starter cards and the checklist retire together once the getting-started
  // steps are done or dismissed; veterans get the plain project surface.
  const showOnboarding = useOnboardingStore(
    (state) =>
      !isOnboardingFinished({
        completedSteps: state.completedSteps,
        dismissed: state.dismissed
      })
  );

  // Blank documents opened from here are loose, as the strip promises — the
  // project being described does not exist yet.
  const {
    entries,
    createTextFile,
    createBlankStoryboard,
    installStoryboardExample,
    creating
  } = useNewDocumentCatalog({ projectId: LOOSE_PROJECT_ID }, () =>
    setSubmenu(null)
  );
  const { data: exampleData, isLoading: examplesLoading } =
    useExampleStoryboards(submenu?.kind === "storyboards");

  const selectedEntities = useMemo(
    () => (entities ?? []).filter((entity) => entityIds.includes(entity.id)),
    [entities, entityIds]
  );

  const estimate = useMemo(
    () => estimateFromHistory(summaries.data ?? [], shape.kind),
    [summaries.data, shape.kind]
  );

  const toggleEntity = useCallback((entity: Entity) => {
    setEntityIds((ids) =>
      ids.includes(entity.id)
        ? ids.filter((id) => id !== entity.id)
        : [...ids, entity.id]
    );
  }, []);

  const handleRefImages = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) {
        addFiles(files);
      }
      // Clear the input so picking the same file twice still registers.
      event.target.value = "";
    },
    [addFiles]
  );

  const handleStart = useCallback(async () => {
    const text = prompt.trim();
    if (text.length === 0 || starting) {
      return;
    }
    // The project agent's first turn needs a model; route key-less users
    // through provider onboarding first and resume the start once connected.
    if (!hasConfiguredProvider) {
      setPendingStart(true);
      openProviderOnboarding({
        capability: "generate_message",
        reason: "Almost there — the project agent needs a model to run."
      });
      return;
    }
    setStarting(true);
    try {
      const project = await createProject.mutateAsync({
        name: projectNameFromPrompt(text, shape),
        kind: shape.kind
      });
      const content: MessageContent[] = [
        {
          type: "text",
          text: composeFirstTurn({
            prompt: text,
            shape,
            entityNames: selectedEntities.map((entity) => entity.name)
          })
        },
        ...getFileContents()
      ];
      stageProjectFirstTurn(project.id, content);
      await openProject(project);
      closeTab(tabId("project-new", PROJECT_NEW_REF));
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not start the project: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    } finally {
      setStarting(false);
    }
  }, [
    addNotification,
    closeTab,
    createProject,
    getFileContents,
    hasConfiguredProvider,
    openProject,
    prompt,
    selectedEntities,
    shape,
    starting
  ]);

  // A start that was parked on provider onboarding resumes on its own once a
  // provider is connected, so the user finishes the thing they asked for.
  const resumeProject = useRef(handleStart);
  resumeProject.current = handleStart;
  useEffect(() => {
    if (!pendingStart || !hasConfiguredProvider) {
      return;
    }
    setPendingStart(false);
    void resumeProject.current();
  }, [pendingStart, hasConfiguredProvider]);

  const handleConnectProvider = useCallback(() => {
    openProviderOnboarding();
  }, []);

  const handleOpenTemplates = useCallback(() => {
    openPageTab("examples");
  }, []);

  const handleOpenTutorials = useCallback(() => {
    openPageTab("tutorials");
  }, []);

  return (
    <ScrollArea fullHeight>
      <FlexColumn align="center" sx={{ minHeight: "100%", px: SPACING.xl }}>
        <FlexColumn
          gap={SPACING.xl}
          sx={{ width: "100%", maxWidth: `${COLUMN_WIDTH}px`, pt: SPACING.xxxl }}
        >
          <FlexColumn gap={SPACING.md} align="center">
            <Text size="big">What do you want to make?</Text>
            <Caption
              color="secondary"
              sx={{ maxWidth: "560px", textAlign: "center" }}
            >
              An agent plans the documents — a board, a script, a cut — and
              builds them while you watch. Everything it makes stays editable.
            </Caption>
          </FlexColumn>

          <FlexColumn
            gap={SPACING.lg}
            sx={{
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "primary.main",
              borderRadius: BORDER_RADIUS.lg,
              p: SPACING.xl
            }}
          >
            <TextInput
              value={prompt}
              autoFocus
              multiline
              rows={3}
              label="Project prompt"
              hideLabel
              placeholder="A 30-second launch spot for our desk lamp — warm, minimal, night-time mood"
              onChange={(event) => setPrompt(event.target.value)}
            />

            {droppedFiles.length > 0 && (
              <FlexRow gap={SPACING.md} wrap>
                {droppedFiles.map((file) => (
                  <Box key={file.id} sx={{ position: "relative" }}>
                    <ResponsiveImage
                      locator={file.dataUri}
                      alt={file.name}
                      fit="cover"
                      borderRadius={BORDER_RADIUS.sm}
                      showErrorFallback
                      sx={{ width: "48px", height: "48px" }}
                    />
                    <CloseButton
                      onClick={() => removeFile(file.id)}
                      tooltip={`Remove ${file.name}`}
                      buttonSize="small"
                      iconVariant="clear"
                      sx={{ position: "absolute", top: -6, right: -6 }}
                    />
                  </Box>
                ))}
              </FlexRow>
            )}

            <FlexRow align="center" gap={SPACING.md} wrap>
              <EditorButton
                variant="outlined"
                density="compact"
                onClick={() => refInputRef.current?.click()}
              >
                {`Ref images · ${droppedFiles.length}`}
              </EditorButton>
              <input
                ref={refInputRef}
                type="file"
                accept="image/*"
                multiple
                aria-label="Reference images"
                onChange={handleRefImages}
                style={{ display: "none" }}
              />
              <EditorButton
                variant="outlined"
                density="compact"
                onClick={(event) => setEntityAnchor(event.currentTarget)}
              >
                {selectedEntities.length === 0
                  ? "Entities · none"
                  : `Entities · ${selectedEntities
                      .map((entity) => entity.name)
                      .join(", ")}`}
              </EditorButton>
              <Box sx={{ flex: 1 }} />
              {estimate && (
                <Box component="span" sx={{ ...TYPOGRAPHY.mono.caption }}>
                  {formatEstimate(estimate)}
                </Box>
              )}
              <EditorButton
                variant="contained"
                color="primary"
                density="normal"
                disabled={prompt.trim().length === 0 || starting}
                onClick={() => void handleStart()}
              >
                Start
              </EditorButton>
            </FlexRow>
          </FlexColumn>

          <FlexRow justify="center" gap={SPACING.md} wrap>
            {PROJECT_SHAPES.map((entry) => {
              const active = entry.id === shapeId;
              return (
                <Box
                  key={entry.id}
                  component="button"
                  type="button"
                  aria-pressed={active}
                  onClick={() => setShapeId(entry.id)}
                  sx={{
                    height: "28px",
                    px: SPACING.lg,
                    cursor: "pointer",
                    borderRadius: BORDER_RADIUS.pill,
                    border: "1px solid",
                    borderColor: active ? PROJECT_COLOR : "divider",
                    color: active ? PROJECT_COLOR : "text.secondary",
                    bgcolor: "transparent",
                    ...TYPOGRAPHY.sans.body
                  }}
                >
                  {entry.label}
                </Box>
              );
            })}
          </FlexRow>

          <FlexRow justify="center" align="center" gap={SPACING.md} wrap>
            <Caption color="muted">
              {shape.chain.length === 0
                ? `${shape.label} starts bare — ask the agent for what you need`
                : `${shape.label} sets up`}
            </Caption>
            {shape.chain.map((step, index) => (
              <FlexRow key={step.type} align="center" gap={SPACING.md}>
                {index > 0 && <Caption color="muted">→</Caption>}
                <Box
                  component="span"
                  aria-hidden
                  sx={{ color: TYPE_COLOR[step.type] }}
                >
                  {TYPE_GLYPH[step.type]}
                </Box>
                <Caption color="secondary">{step.label}</Caption>
              </FlexRow>
            ))}
          </FlexRow>

          {showOnboarding && (
            <Box sx={{ pt: SPACING.lg }}>
              <GettingStartedChecklist
                hasConfiguredProvider={hasConfiguredProvider}
                onConnectProvider={handleConnectProvider}
                onOpenTemplates={handleOpenTemplates}
                onCreateWorkflow={() => void handleCreateNewWorkflow()}
              />
            </Box>
          )}

          <FlexRow justify="center" align="center" gap={SPACING.md}>
            <Caption color="muted">Not sure where to begin?</Caption>
            <EditorButton
              variant="outlined"
              density="compact"
              onClick={handleOpenTemplates}
            >
              Browse examples
            </EditorButton>
            <EditorButton
              variant="outlined"
              density="compact"
              onClick={handleOpenTutorials}
            >
              Tutorials
            </EditorButton>
          </FlexRow>
        </FlexColumn>

        <Box sx={{ flex: 1, minHeight: SPACING.xxxl }} />

        <FlexColumn
          gap={SPACING.md}
          sx={{
            width: "100%",
            maxWidth: `${COLUMN_WIDTH}px`,
            pb: SPACING.xxl
          }}
        >
          <Divider />
          <FlexRow align="baseline" gap={SPACING.md}>
            <Caption
              color="muted"
              sx={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Blank document
            </Caption>
            <Caption color="muted">
              — opens as a loose tab, outside any project
            </Caption>
          </FlexRow>
          <Box
            sx={{
              display: "grid",
              gap: SPACING.sm,
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                sm: "repeat(3, minmax(0, 1fr))",
                md: "repeat(6, minmax(0, 1fr))"
              }
            }}
          >
            {entries.map((entry) => (
              <Box
                key={entry.key}
                component="button"
                type="button"
                disabled={creating !== null}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) =>
                  entry.submenu
                    ? setSubmenu({
                        kind: entry.submenu,
                        element: event.currentTarget
                      })
                    : void entry.create?.()
                }
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: (theme) => theme.spacing(SPACING.md),
                  height: "32px",
                  px: SPACING.md,
                  cursor: "pointer",
                  border: "none",
                  bgcolor: "transparent",
                  borderRadius: BORDER_RADIUS.md,
                  color: "text.primary",
                  "&:hover": { bgcolor: "action.hover" }
                }}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={{ color: TYPE_COLOR[entry.type] }}
                >
                  {TYPE_GLYPH[entry.type]}
                </Box>
                <Label>
                  {entry.submenu ? `${entry.label} ▸` : entry.label}
                </Label>
              </Box>
            ))}
          </Box>
        </FlexColumn>
      </FlexColumn>

      <Popover
        open={entityAnchor !== null}
        anchorEl={entityAnchor}
        onClose={() => setEntityAnchor(null)}
        placement="bottom-left"
        maxWidth={320}
        maxHeight="50vh"
      >
        <FlexColumn sx={{ width: 300, py: 0.5 }}>
          {(entities ?? []).length === 0 ? (
            <Caption color="secondary" sx={{ px: 2, py: 1.5 }}>
              The entity library is empty.
            </Caption>
          ) : (
            (entities ?? []).map((entity) => (
              <MenuItemPrimitive
                key={entity.id}
                label={entity.name}
                secondary={entity.kind}
                compact
                selected={entityIds.includes(entity.id)}
                onClick={() => toggleEntity(entity)}
              />
            ))
          )}
        </FlexColumn>
      </Popover>

      <Popover
        open={submenu !== null}
        anchorEl={submenu?.element ?? null}
        onClose={() => setSubmenu(null)}
        placement="top-left"
        maxWidth={340}
        maxHeight="50vh"
      >
        <FlexColumn sx={{ width: 320, py: 0.5 }}>
          {submenu?.kind === "texts" &&
            TEXT_FILE_TEMPLATES.map((template) => (
              <MenuItemPrimitive
                key={template.filename}
                label={template.label}
                compact
                disabled={creating !== null}
                onClick={() => void createTextFile(template)}
              />
            ))}
          {submenu?.kind === "storyboards" && (
            <>
              <MenuItemPrimitive
                label="Blank storyboard"
                compact
                dividerAfter
                disabled={creating !== null}
                onClick={() => void createBlankStoryboard()}
              />
              {!examplesLoading &&
                (exampleData ?? []).map((example) => (
                  <MenuItemPrimitive
                    key={example.slug}
                    label={example.name}
                    secondary={`${example.shotCount} shot${
                      example.shotCount === 1 ? "" : "s"
                    }, already rendered`}
                    compact
                    disabled={creating !== null}
                    onClick={() =>
                      void installStoryboardExample(example.slug, example.name)
                    }
                  />
                ))}
            </>
          )}
        </FlexColumn>
      </Popover>
    </ScrollArea>
  );
};

export default NewProjectSurface;
