/**
 * "What do you want to make?" — the surface a project is started from.
 *
 * The prompt goes to the project's own agent, which builds the documents. The
 * box takes the chat composer's triggers: `/` completes a skill and `@` picks
 * an asset or a library entity, so the opening turn is written the same way
 * every other turn is. A starter is one of the user's skills — their own or one
 * NodeTool ships — and the prompt is the one record of which was picked: a
 * pill writes `/<name>` into the prompt, `/` completes it, and a hand-typed one
 * counts the same, so the pills light up from the text and can never disagree
 * with what the agent is handed. The picked skill is stored as the project's
 * kind, which is what its spend history is read back by. Blank documents keep
 * their place at the foot of the view, opening loose tabs the way the `+ New`
 * menu always did.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { isModelSelected, type Entity } from "@nodetool-ai/protocol";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  Chip,
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
  Tooltip,
  TYPOGRAPHY
} from "../ui_primitives";
import type { Asset, MessageContent } from "../../stores/ApiTypes";
import { useFileHandling } from "../chat/hooks/useFileHandling";
import { useTextareaAssetMention } from "../chat/composer/useTextareaAssetMention";
import { useTextareaSkillMention } from "../chat/composer/useTextareaSkillMention";
import { assetToUri } from "../node_types/editing/promptComposer/promptTokens";
import { useEntities } from "../../serverState/useEntities";
import { useNotificationStore } from "../../stores/NotificationStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
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
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import { openPageTab } from "../workspace/openPageTab";
import { clearProjectFirstTurn, stageProjectFirstTurn } from "./projectAgent";
import { PROJECT_COLOR } from "./projectIdentity";
import {
  composeFirstTurn,
  estimateFromHistory,
  formatEstimate,
  invokedStarter,
  projectNameFromPrompt,
  rankStarters,
  starterLabel,
  toggleStarterInPrompt,
  VISIBLE_STARTERS
} from "./projectStarters";
import { useSkills } from "../../hooks/skills/useSkills";

/** Width of the centered column, per the new-project mockup. */
const COLUMN_WIDTH = 860;

/** A starter pill at rest: outlined, quiet, the project's colour on hover. */
const starterPillSx = {
  borderRadius: BORDER_RADIUS.pill,
  color: "text.secondary",
  "&:hover": { borderColor: PROJECT_COLOR, color: "text.primary" }
} as const;

/** The picked starter: drawn in the project colour on a tint of it. */
const activeStarterPillSx = {
  color: PROJECT_COLOR,
  borderColor: PROJECT_COLOR,
  backgroundColor: "rgba(var(--palette-info-lightChannel) / 0.12)",
  "&:hover": { backgroundColor: "rgba(var(--palette-info-lightChannel) / 0.2)" }
} as const;

interface SubmenuAnchor {
  kind: NewDocumentSubmenu;
  element: HTMLElement;
}


const NewProjectSurface = () => {
  const [prompt, setPrompt] = useState("");
  // The starter row folds past `VISIBLE_STARTERS` until asked to show the rest.
  const [showAllStarters, setShowAllStarters] = useState(false);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [entityAnchor, setEntityAnchor] = useState<HTMLElement | null>(null);
  const [submenu, setSubmenu] = useState<SubmenuAnchor | null>(null);
  const [starting, setStarting] = useState(false);
  // The model the project agent will run on, picked here — the prompt box has
  // no model chip, so this menu is the only place to pick one before Start.
  const [modelAnchor, setModelAnchor] = useState<HTMLElement | null>(null);
  // A start requested before a provider was configured, resumed once one is.
  const [pendingStart, setPendingStart] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes once a pill has rewritten the prompt: back in the
  // box, at the end, so the user keeps typing without a click.
  const pendingCaretRef = useRef<number | null>(null);

  const { droppedFiles, addFiles, addDroppedFiles, removeFile, getFileContents } =
    useFileHandling();
  const { data: entities } = useEntities();
  // Both the user's own skills and the ones NodeTool ships: either is a
  // starter, and either is invoked the same way.
  const { data: skills } = useSkills({ includeSystem: true });
  const summaries = useProjectSummaries();
  const createProject = useCreateProject();
  const openProject = useOpenProject();
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const hasConfiguredProvider = useHasConfiguredProvider();
  const selectedModel = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore(
    (state) => state.setSelectedModel
  );
  const { handleCreateNewWorkflow } = useWorkflowActions();
  // The checklist retires once the getting-started steps are done or
  // dismissed; veterans get the plain project surface.
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

  const starters = useMemo(
    () => rankStarters(skills ?? [], summaries.data ?? []),
    [skills, summaries.data]
  );

  // Read off the prompt, so a `/name` typed by hand lights its pill and a
  // deleted one goes dark. A skill the catalog no longer carries is no
  // starter at all, rather than a `/name` the agent would fail to resolve.
  const starter = useMemo(
    () => invokedStarter(prompt, starters),
    [prompt, starters]
  );

  // The folded row still shows the picked starter, wherever it ranks, so the
  // pill that is lit is never one that is hidden.
  const visibleStarters = useMemo(() => {
    if (showAllStarters || starters.length <= VISIBLE_STARTERS) {
      return starters;
    }
    const head = starters.slice(0, VISIBLE_STARTERS);
    return starter && !head.includes(starter) ? [...head, starter] : head;
  }, [showAllStarters, starter, starters]);
  const hiddenStarterCount = starters.length - visibleStarters.length;

  const handleToggleStarter = useCallback(
    (name: string) => {
      const next = toggleStarterInPrompt(
        prompt,
        starter?.name ?? null,
        starter?.name === name ? null : name
      );
      pendingCaretRef.current = next.length;
      setPrompt(next);
    },
    [prompt, starter]
  );

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }
    pendingCaretRef.current = null;
    const element = promptRef.current;
    if (element) {
      element.focus();
      element.setSelectionRange(caret, caret);
    }
  }, [prompt]);

  const estimate = useMemo(
    () => estimateFromHistory(summaries.data ?? [], starter?.name ?? ""),
    [starter, summaries.data]
  );

  const toggleEntity = useCallback((entity: Entity) => {
    setEntityIds((ids) =>
      ids.includes(entity.id)
        ? ids.filter((id) => id !== entity.id)
        : [...ids, entity.id]
    );
  }, []);

  // The prompt box carries the composer's own triggers: `@` picks an asset or
  // a library entity, `/` picks the skill to start from. A picked asset is
  // attached as an `asset://` reference the way a dropped file is; a picked
  // entity is written inline as its `entity://<id>` token, which the server
  // resolves per turn.
  const handleSelectAsset = useCallback(
    (asset: Asset) => {
      addDroppedFiles([
        {
          id: "",
          dataUri: asset.thumb_url || asset.get_url || "",
          type: asset.content_type || "application/octet-stream",
          name: asset.name || asset.id,
          assetUri: assetToUri(asset)
        }
      ]);
    },
    [addDroppedFiles]
  );

  const { mentionMenu, handleKeyDown: handleMentionKeyDown } =
    useTextareaAssetMention({
      textareaRef: promptRef,
      value: prompt,
      setValue: setPrompt,
      onSelectAsset: handleSelectAsset,
      includeEntities: true
    });

  // A skill picked from `/` is written into the prompt as `/name`, which is
  // all it takes to make it the starter: the pills and the project's kind
  // both read the prompt.
  const { skillMenu, handleKeyDown: handleSkillKeyDown } =
    useTextareaSkillMention({
      textareaRef: promptRef,
      value: prompt,
      setValue: setPrompt
    });

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
    // A configured provider is not a picked model: the chat's model selection
    // starts on the "empty" sentinel, and a send with it never leaves the
    // client. Open this surface's own model menu rather than point at a
    // composer that is not on this screen.
    if (!isModelSelected(selectedModel)) {
      setModelAnchor(modelButtonRef.current);
      addNotification({
        type: "error",
        alert: true,
        content:
          "No model selected. Pick a language model here before starting the project."
      });
      return;
    }
    setStarting(true);
    try {
      const project = await createProject.mutateAsync({
        name: projectNameFromPrompt(text, starter),
        // The starter's own name, so a later project of the same starter reads
        // its spend history back.
        kind: starter?.name ?? ""
      });
      const content: MessageContent[] = [
        {
          type: "text",
          text: composeFirstTurn({
            prompt: text,
            starter,
            entityNames: selectedEntities.map((entity) => entity.name)
          })
        },
        ...getFileContents()
      ];
      stageProjectFirstTurn(project.id, content);
      // Closing this tab is what makes the staged turn unreachable — the panel
      // that sends it only mounts inside the project group. If the group did
      // not open (the fetch failed, or a newer project was requested since),
      // keep the tab, with the prompt still in its state, and drop the stage
      // so no orphan sits in the module map.
      const opened = await openProject(project);
      if (!opened) {
        clearProjectFirstTurn(project.id);
        return;
      }
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
    selectedModel,
    starter,
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

  // The handler rides the field wrapper, where MUI puts unknown props, and the
  // keydown reaches it by bubbling from the textarea. Both pickers only read
  // `key` and call `preventDefault`, so the retype is safe. Enter keeps its
  // newline — a project brief runs to more than one line — and Ctrl/⌘+Enter
  // starts, the way a multi-line composer submits everywhere else.
  const handlePromptKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keyEvent = event as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
      if (handleSkillKeyDown(keyEvent)) {
        return;
      }
      if (handleMentionKeyDown(keyEvent)) {
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleStart();
      }
    },
    [handleMentionKeyDown, handleSkillKeyDown, handleStart]
  );

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
              inputRef={promptRef}
              placeholder="A 30-second launch spot for our desk lamp — warm, minimal, night-time mood. Type / for a skill, @ for an asset or entity. Ctrl+Enter starts."
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handlePromptKeyDown}
            />
            {mentionMenu}
            {skillMenu}

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
              <EditorButton
                ref={modelButtonRef}
                variant="outlined"
                density="compact"
                onClick={(event) => setModelAnchor(event.currentTarget)}
              >
                {isModelSelected(selectedModel)
                  ? `Model · ${selectedModel?.name || selectedModel?.id}`
                  : "Select a model"}
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

          {starters.length > 0 && (
            <FlexColumn gap={SPACING.md} align="center">
              <FlexRow
                justify="center"
                gap={SPACING.sm}
                wrap
                role="group"
                aria-label="Start from a skill"
              >
                {visibleStarters.map((entry) => {
                  const active = entry.name === starter?.name;
                  return (
                    <Tooltip
                      key={entry.name}
                      title={entry.description}
                      placement="bottom"
                      // Described by, not named by: the pill's name stays the
                      // skill's label.
                      describeChild
                    >
                      <Chip
                        clickable
                        variant="outlined"
                        label={starterLabel(entry.name)}
                        aria-pressed={active}
                        onClick={() => handleToggleStarter(entry.name)}
                        sx={{
                          ...starterPillSx,
                          ...(active && activeStarterPillSx)
                        }}
                      />
                    </Tooltip>
                  );
                })}
                {(hiddenStarterCount > 0 || showAllStarters) && (
                  <Chip
                    clickable
                    variant="outlined"
                    aria-expanded={showAllStarters}
                    label={
                      showAllStarters
                        ? "Show fewer"
                        : `${hiddenStarterCount} more`
                    }
                    onClick={() => setShowAllStarters((shown) => !shown)}
                    sx={{ ...starterPillSx, borderStyle: "dashed" }}
                  />
                )}
              </FlexRow>
              {starter ? (
                <Caption
                  color="secondary"
                  sx={{ maxWidth: "620px", textAlign: "center" }}
                >
                  {starter.description}
                </Caption>
              ) : (
                <Caption color="muted">
                  Pick a skill to start from, or just describe what you want.
                </Caption>
              )}
            </FlexColumn>
          )}

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

      <LanguageModelMenuDialog
        open={modelAnchor !== null}
        anchorEl={modelAnchor}
        onClose={() => setModelAnchor(null)}
        onModelChange={(model) => {
          setSelectedModel(model);
          setModelAnchor(null);
        }}
        requireToolSupport
      />

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
