/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { Theme } from "@mui/material/styles";
import SaveIcon from "@mui/icons-material/Save";

import { trpc, trpcClient } from "../../trpc/client";
import type { SkillResponse } from "@nodetool-ai/protocol/api-schemas/skills.js";
import { useSkill, useUpdateSkill } from "../../hooks/skills/useSkills";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { notifyMutationError } from "../../utils/notifyMutationError";
import ReportBugButton from "../support/ReportBugButton";
import ErrorBanner from "../support/ErrorBanner";
import MonacoPane from "../workspace/MonacoPane";
import EditorToolbar from "../textEditor/EditorToolbar";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  TextInput,
  FormField,
  SPACING,
  StatusDot,
  getSpacingPx
} from "../ui_primitives";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import type * as monaco from "monaco-editor";
import {
  preserveEditAfterSubmit,
  shouldApplyServerSkill
} from "./skillEditorState";

interface SkillEditorPaneProps {
  skillId: string;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.background.default,
    ".editor-toolbar-row": {
      flex: "0 0 auto",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".meta-row": {
      padding: getSpacingPx(SPACING.lg),
      gap: getSpacingPx(SPACING.lg),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".editor-host": {
      flex: 1,
      minHeight: 0,
      position: "relative"
    }
  });

const SkillEditorPane = ({ skillId, readOnly = false }: SkillEditorPaneProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const editorStyles = styles(theme);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  const { data: skill, isLoading, error } = useSkill(skillId);
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [savedName, setSavedName] = useState("");
  const [savedDescription, setSavedDescription] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const initializedSkillIdRef = useRef<string | null>(null);
  const saveSnapshotRef = useRef<{
    name: string;
    description: string;
    content: string;
    baseUpdatedAt: string;
  } | null>(null);
  const latestDraftRef = useRef({ name, description, content });
  const latestBaselineRef = useRef({
    name: savedName,
    description: savedDescription,
    content: savedContent,
    updatedAt: baseUpdatedAt
  });
  const savePromiseRef = useRef<Promise<SkillResponse> | null>(null);
  const mountedRef = useRef(true);
  const flushContextRef = useRef({ skillId, utils });

  useEffect(() => {
    latestDraftRef.current = { name, description, content };
  }, [name, description, content]);
  useEffect(() => {
    latestBaselineRef.current = {
      name: savedName,
      description: savedDescription,
      content: savedContent,
      updatedAt: baseUpdatedAt
    };
  }, [savedName, savedDescription, savedContent, baseUpdatedAt]);
  useEffect(() => {
    flushContextRef.current = { skillId, utils };
  }, [skillId, utils]);

  const [wordWrap, setWordWrap] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [autosavePaused, setAutosavePaused] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Seed from server. Refetches must not replace a local draft, including the
  // cache update returned by a save that was followed by another edit.
  useEffect(() => {
    if (!skill) return;
    const hasLocalChanges =
      name !== savedName ||
      description !== savedDescription ||
      content !== savedContent;
    if (
      !shouldApplyServerSkill({
        initializedSkillId: initializedSkillIdRef.current,
        incomingSkillId: skill.id,
        hasLocalChanges,
        incomingUpdatedAt: skill.updatedAt,
        baseUpdatedAt
      })
    ) {
      return;
    }
    setName(skill.name);
    setDescription(skill.description ?? "");
    setContent(skill.content ?? "");
    setSavedName(skill.name);
    setSavedDescription(skill.description ?? "");
    setSavedContent(skill.content ?? "");
    setBaseUpdatedAt(skill.updatedAt);
    initializedSkillIdRef.current = skill.id;
    setTabTitle(skillId, "skill", skill.name || t("screen_remaining.skills.untitled"));
  }, [
    skill,
    skillId,
    setTabTitle,
    name,
    savedName,
    description,
    savedDescription,
    content,
    savedContent,
    baseUpdatedAt,
    t
  ]);

  // Keep tab title in sync with local name edits (optimistic)
  useEffect(() => {
    if (name) setTabTitle(skillId, "skill", name);
  }, [name, skillId, setTabTitle]);

  const isDirty =
    name !== savedName ||
    description !== savedDescription ||
    content !== savedContent;

  const updateMutation = useUpdateSkill();
  const handleSaveSuccess = useCallback(
    (updated: typeof skill) => {
      if (!updated) return;
      latestBaselineRef.current = {
        name: updated.name,
        description: updated.description ?? "",
        content: updated.content ?? "",
        updatedAt: updated.updatedAt
      };
      const snapshot = saveSnapshotRef.current;
      if (snapshot) {
        setName((current) =>
          preserveEditAfterSubmit(current, snapshot.name, updated.name)
        );
        setDescription((current) =>
          preserveEditAfterSubmit(
            current,
            snapshot.description,
            updated.description
          )
        );
        setContent((current) =>
          preserveEditAfterSubmit(current, snapshot.content, updated.content)
        );
      }
      setSavedName(updated.name);
      setSavedDescription(updated.description ?? "");
      setSavedContent(updated.content ?? "");
      setBaseUpdatedAt(updated.updatedAt);
      if (mountedRef.current) setAutosavePaused(false);
      utils.skills.get.setData({ id: skillId }, updated);
      saveSnapshotRef.current = null;
    },
    [skillId, utils.skills.get]
  );

  const handleSaveError = useCallback((err: unknown) => {
    if (mountedRef.current) setAutosavePaused(true);
    notifyMutationError(t("screen_remaining.skills.saveAction"), err);
  }, [t]);

  const handleSave = useCallback(() => {
    if (!isDirty || updateMutation.isPending || !baseUpdatedAt) return;
    const patch: { name?: string; description?: string; content?: string } = {};
    const submittedName = name.trim();
    if (name !== savedName) patch.name = submittedName;
    if (description !== savedDescription) patch.description = description;
    if (content !== savedContent) patch.content = content;
    if (Object.keys(patch).length === 0) return;
    if (submittedName !== name) {
      latestDraftRef.current = {
        ...latestDraftRef.current,
        name: submittedName
      };
      if (mountedRef.current) setName(submittedName);
    }
    saveSnapshotRef.current = {
      name: submittedName,
      description,
      content,
      baseUpdatedAt
    };
    const savePromise = updateMutation.mutateAsync({
        id: skillId,
        baseUpdatedAt,
        ...patch
      });
    savePromiseRef.current = savePromise;
    void savePromise
      .then(handleSaveSuccess)
      .catch(handleSaveError)
      .finally(() => {
        if (savePromiseRef.current === savePromise) {
          savePromiseRef.current = null;
        }
      });
  }, [
    isDirty,
    updateMutation,
    baseUpdatedAt,
    name,
    savedName,
    description,
    savedDescription,
    content,
    savedContent,
    skillId,
    handleSaveSuccess,
    handleSaveError
  ]);

  // Autosave debounce 750ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush the latest draft when its tab closes. If a save is already running,
  // wait for its revision before sending the edits made while it was in flight.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const flush = async (): Promise<void> => {
        let baseline: Pick<
          SkillResponse,
          "name" | "description" | "content" | "updatedAt"
        > = {
          name: latestBaselineRef.current.name,
          description: latestBaselineRef.current.description,
          content: latestBaselineRef.current.content,
          updatedAt: latestBaselineRef.current.updatedAt ?? ""
        };
        try {
          const { skillId: currentSkillId, utils: currentUtils } =
            flushContextRef.current;
          const pending = savePromiseRef.current;
          if (pending) {
            try {
              baseline = await pending;
            } catch (pendingError) {
              // Retry only when the failed request left the server revision
              // unchanged. A newer revision is a CAS conflict and must not be
              // overwritten by rebasing the closing tab's draft onto it.
              const refreshed = await trpcClient.skills.get.query({
                id: currentSkillId
              });
              if (refreshed.updatedAt !== baseline.updatedAt) {
                throw pendingError;
              }
              baseline = refreshed;
            }
          }
          if (!baseline.updatedAt) return;

          const draft = latestDraftRef.current;
          const canonicalName = draft.name.trim();
          const patch: {
            name?: string;
            description?: string;
            content?: string;
          } = {};
          if (canonicalName !== baseline.name) patch.name = canonicalName;
          if (draft.description !== baseline.description) {
            patch.description = draft.description;
          }
          if (draft.content !== baseline.content) patch.content = draft.content;
          if (Object.keys(patch).length === 0) return;

          const updated = await trpcClient.skills.update.mutate({
            id: currentSkillId,
            baseUpdatedAt: baseline.updatedAt,
            ...patch
          });
          currentUtils.skills.get.setData({ id: currentSkillId }, updated);
          void currentUtils.skills.list.invalidate();
        } catch (saveError) {
          notifyMutationError(t("screen_remaining.skills.saveAction"), saveError);
        }
      };
      void flush();
    };
  }, [t]);

  useEffect(() => {
    if (!isDirty || readOnly || !baseUpdatedAt || autosavePaused) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleSave();
    }, 750);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, readOnly, baseUpdatedAt, autosavePaused, handleSave]);

  const { MonacoEditor, monacoLoadError, isMonacoLoading, loadMonacoIfNeeded } =
    useMonacoEditor();
  useEffect(() => {
    void loadMonacoIfNeeded();
  }, [loadMonacoIfNeeded]);

  const updateHistoryState = useCallback(() => {
    const model = editorRef.current?.getModel();
    const alt = model?.getAlternativeVersionId() ?? 1;
    const ver = model?.getVersionId() ?? 1;
    setCanUndo(alt < ver);
    setCanRedo(alt > ver);
  }, []);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      updateHistoryState();
      editor.onDidChangeModelContent(updateHistoryState);
    },
    [updateHistoryState]
  );

  const handleUndo = useCallback(() => {
    editorRef.current?.trigger("toolbar", "undo", null);
    updateHistoryState();
  }, [updateHistoryState]);
  const handleRedo = useCallback(() => {
    editorRef.current?.trigger("toolbar", "redo", null);
    updateHistoryState();
  }, [updateHistoryState]);
  const handleToggleWordWrap = useCallback(() => {
    setWordWrap((current) => !current);
  }, []);
  const handleNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.currentTarget.value);
  }, []);
  const handleDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setDescription(event.currentTarget.value);
    },
    []
  );
  const handleContentChange = useCallback((value: string | undefined) => {
    setContent(value ?? "");
  }, []);
  const handleManualSave = useCallback(() => {
    setAutosavePaused(false);
    handleSave();
  }, [handleSave]);

  if (error) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <ErrorBanner
          report={{
            source: "panel-crash",
            summary: t("screen_remaining.skills.editorLoadError"),
            errorText: error.message,
            stackTrace: error instanceof Error ? error.stack : undefined
          }}
        >
          {t("screen_remaining.skills.couldNotLoad")}
        </ErrorBanner>
      </FlexColumn>
    );
  }
  if (isLoading || !skill) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn fullWidth fullHeight gap={SPACING.none} css={editorStyles}>
      <FlexRow className="editor-toolbar-row" align="center" justify="space-between">
        <EditorToolbar
          onUndo={handleUndo}
          onRedo={handleRedo}
          onToggleWordWrap={handleToggleWordWrap}
          canUndo={canUndo}
          canRedo={canRedo}
          wordWrapEnabled={wordWrap}
        />
        <FlexRow align="center" gap={SPACING.micro} sx={{ px: SPACING.xs }}>
          {isDirty && (
            <StatusDot tone="warning" size="medium" label={t("screen_remaining.skills.unsavedChanges")} />
          )}
          {updateMutation.error && (
            <ReportBugButton
              context={{
                source: "panel-crash",
            summary: t("screen_remaining.skills.saveError"),
                errorText: updateMutation.error.message
              }}
            />
          )}
          <EditorButton
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            disabled={!isDirty || readOnly}
            loading={updateMutation.isPending}
            onClick={handleManualSave}
          >
            {updateMutation.isPending ? t("screen_remaining.skills.saving") : t("common.save")}
          </EditorButton>
        </FlexRow>
      </FlexRow>

      <FlexColumn className="meta-row">
        <FormField label={t("screen_remaining.skills.name")} required>
          <TextInput
            value={name}
            onChange={handleNameChange}
            placeholder="my-skill"
            disabled={readOnly}
            fullWidth
          />
        </FormField>
        <FormField
          label={t("screen_remaining.skills.description")}
          helperText={t("screen_remaining.skills.descriptionHelp")}
        >
          <TextInput
            value={description}
            onChange={handleDescriptionChange}
            placeholder={t("screen_remaining.skills.descriptionPlaceholder")}
            disabled={readOnly}
            fullWidth
          />
        </FormField>
      </FlexColumn>

      <div className="editor-host">
        {MonacoEditor ? (
          <MonacoPane
            value={content}
            language="markdown"
            readOnly={readOnly}
            wordWrap={wordWrap}
            onChange={handleContentChange}
            onSave={handleSave}
            onEditorMount={handleEditorMount}
          />
        ) : monacoLoadError ? (
          <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.md }}>
            <ErrorBanner
              report={{
                source: "panel-crash",
                summary: t("screen_remaining.skills.editorStartError"),
                errorText: monacoLoadError
              }}
            >
              {monacoLoadError}
            </ErrorBanner>
          </FlexColumn>
        ) : isMonacoLoading ? (
          <FlexColumn fullWidth fullHeight sx={{ alignItems: "center", justifyContent: "center" }}>
            <LoadingSpinner />
          </FlexColumn>
        ) : (
          <FlexColumn
            fullWidth
            fullHeight
            sx={{ p: SPACING.md, overflow: "auto" }}
          >
            <Caption>{content}</Caption>
          </FlexColumn>
        )}
      </div>
    </FlexColumn>
  );
};

export default SkillEditorPane;
