/** @jsxImportSource @emotion/react */
/**
 * CodePanel — the timeline editor's "Code" tab.
 *
 * A timeline can carry the sandbox-timeline JS script that baked its scenes
 * (`trpc.timeline.code.*`, see `serverState/useTimelineCode.ts`). This panel
 * shows that source, lets it be edited and rebaked, and lists each scene the
 * code produced with a badge for the ones edited on the timeline since the
 * last bake.
 *
 * A scene edited on the timeline conflicts with a rebake that would overwrite
 * it — `set`/`rebake` keep the edited scene and report it as a conflict
 * instead of silently discarding the edit. The conflict list offers, per
 * scene: overwrite it from code (force-rebake just that scene) or detach it
 * (drop it from code's control so it never conflicts again).
 *
 * A timeline with no embedded code shows a short empty state instead of an
 * editor — this panel edits existing authoring code, it does not write a
 * timeline's first script.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  AlertBanner,
  Caption,
  Chip,
  ConflictBanner,
  type ConflictBannerConflict,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import PanelToolbar from "../panels/PanelToolbar";
import { useMonacoEditor } from "../../hooks/editor/useMonacoEditor";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import {
  useTimelineUIStore,
  useTimelineUIStoreApi
} from "../../stores/timeline/TimelineUIStore";
import {
  useTimelineCode,
  type TimelineCodeBakeResult,
  type TimelineCodeScene
} from "../../serverState/useTimelineCode";
import { notifyMutationError } from "../../utils/notifyMutationError";

const editorBoxStyles = (theme: Theme) =>
  css({
    flex: 1,
    minHeight: 0,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden"
  });

const sceneRowStyles = (theme: Theme) =>
  css({
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    }
  });

const SceneRow: React.FC<{
  scene: TimelineCodeScene;
  onSelect: (groupId: string) => void;
}> = memo(({ scene, onSelect }) => {
  const theme = useTheme();
  const handleClick = useCallback(() => onSelect(scene.groupId), [onSelect, scene.groupId]);
  return (
    <FlexRow
      css={sceneRowStyles(theme)}
      align="center"
      justify="space-between"
      gap={1}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Select scene ${scene.name} on the timeline`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <Text size="small" noWrap>
        {scene.name}
      </Text>
      {scene.edited && <Chip label="Edited" compact color="warning" size="small" />}
    </FlexRow>
  );
});
SceneRow.displayName = "SceneRow";

const emptyBakeResult: TimelineCodeBakeResult = {
  timeline_id: "",
  errors: [],
  warnings: [],
  conflicts: [],
  scenes: []
};

export const CodePanel: React.FC = memo(() => {
  const theme = useTheme();
  const sequenceId = useTimelineStore((s) => s.sequenceId);
  const clips = useTimelineStore((s) => s.clips);
  const uiStoreApi = useTimelineUIStoreApi();
  const setCodePanelDirty = useTimelineUIStore((s) => s.setCodePanelDirty);

  const {
    data,
    isLoading,
    error,
    setCode,
    isSettingCode,
    rebake,
    detachScenes,
    isDetaching
  } = useTimelineCode(sequenceId);

  const baselineCode = data?.code ?? "";
  const hasCode = baselineCode.length > 0;

  const [draftCode, setDraftCode] = useState(baselineCode);
  const [dirty, setDirty] = useState(false);
  const [bakeResult, setBakeResult] = useState<TimelineCodeBakeResult>(emptyBakeResult);
  // The latest draft, read after a bake resolves, so edits made while the
  // request was pending are not lost.
  const draftRef = useRef(draftCode);
  // The code a bake wrote. The draft stays dirty until the refetch returns it.
  const [writtenCode, setWrittenCode] = useState<string | null>(null);

  // A fresh fetch (first load, or a bake made elsewhere) replaces the draft —
  // but never while mid-edit, or a background refetch would clobber typing.
  useEffect(() => {
    if (writtenCode !== null) {
      if (baselineCode !== writtenCode) return;
      setWrittenCode(null);
      setDirty(draftRef.current !== baselineCode);
      return;
    }
    if (!dirty) {
      draftRef.current = baselineCode;
      setDraftCode(baselineCode);
    }
  }, [baselineCode, dirty, writtenCode]);

  // `setPanelTab` guards a switch away from a dirty Code tab (window.confirm);
  // this is the flag it reads. Cleared on unmount too, so leaving by any
  // other route (closing the workspace tab) doesn't leave it stuck.
  useEffect(() => {
    setCodePanelDirty(dirty);
    return () => setCodePanelDirty(false);
  }, [dirty, setCodePanelDirty]);

  const { MonacoEditor, monacoLoadError, isMonacoLoading, loadMonacoIfNeeded } =
    useMonacoEditor();
  useEffect(() => {
    if (hasCode) void loadMonacoIfNeeded();
  }, [hasCode, loadMonacoIfNeeded]);

  const handleChange = useCallback(
    (next?: string) => {
      const value = next ?? "";
      draftRef.current = value;
      setDraftCode(value);
      setDirty(value !== baselineCode);
    },
    [baselineCode]
  );

  const scenes = data?.scenes ?? bakeResult.scenes;

  const handleRebake = useCallback(async () => {
    if (!sequenceId) return;
    const sent = draftCode;
    try {
      const result = await setCode({ code: sent });
      setBakeResult(result);
      // A bake that returns errors wrote nothing. Keep the draft to fix it.
      if (result.errors.length === 0) setWrittenCode(sent);
    } catch (err) {
      notifyMutationError("rebake the timeline from its code", err);
    }
  }, [sequenceId, draftCode, setCode]);

  const handleOverwriteScene = useCallback(
    async (scene: string) => {
      try {
        const result = await rebake({ force: [scene] });
        setBakeResult(result);
      } catch (err) {
        notifyMutationError("overwrite that scene from the code", err);
      }
    },
    [rebake]
  );

  const handleDetachScene = useCallback(
    async (scene: string) => {
      try {
        await detachScenes([scene]);
        setBakeResult((current) => ({
          ...current,
          conflicts: current.conflicts.filter((c) => c.scene !== scene)
        }));
      } catch (err) {
        notifyMutationError("detach that scene from the code", err);
      }
    },
    [detachScenes]
  );

  const handleSelectScene = useCallback(
    (groupId: string) => {
      const clip = clips.find((c) => c.id === groupId);
      if (!clip) return;
      uiStoreApi.getState().selectClip(groupId);
      uiStoreApi.getState().revealAt(clip.startMs);
    },
    [clips, uiStoreApi]
  );

  const conflictRows: ConflictBannerConflict[] = useMemo(
    () =>
      bakeResult.conflicts.map((conflict) => ({
        unitId: conflict.scene,
        label: `Scene "${conflict.scene}" was edited in the editor since the last bake — kept. (${conflict.reason})`
      })),
    [bakeResult.conflicts]
  );

  const toolbarActions = useMemo(
    () =>
      hasCode ? (
        <EditorButton
          density="compact"
          variant="contained"
          onClick={handleRebake}
          disabled={!sequenceId || isSettingCode || !dirty}
        >
          {isSettingCode ? "Rebaking…" : "Rebake"}
        </EditorButton>
      ) : null,
    [hasCode, handleRebake, sequenceId, isSettingCode, dirty]
  );

  if (isLoading) {
    return (
      <FlexColumn align="center" justify="center" fullHeight sx={{ flex: 1 }}>
        <LoadingSpinner size="small" text="Loading code…" />
      </FlexColumn>
    );
  }

  if (error) {
    return (
      <FlexColumn gap={0.5} sx={{ p: SPACING.md }}>
        <Text color="error">Failed to load the timeline's code</Text>
        <Caption size="smaller" color="secondary">
          {error instanceof Error ? error.message : String(error)}
        </Caption>
      </FlexColumn>
    );
  }

  if (!hasCode) {
    return (
      <FlexColumn align="center" justify="center" fullHeight sx={{ flex: 1, px: 2 }}>
        <EmptyState
          title="No code"
          description="This timeline wasn't built from code, so there is nothing to edit here."
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn fullWidth fullHeight sx={{ minHeight: 0, overflow: "hidden" }}>
      <PanelToolbar
        title="Code"
        count={scenes.length || undefined}
        actions={toolbarActions}
      />
      <ScrollArea sx={{ flex: "0 0 auto", maxHeight: "40%" }}>
        {bakeResult.errors.length > 0 && (
          <AlertBanner severity="error" compact sx={{ m: SPACING.sm }}>
            {bakeResult.errors.join("\n")}
          </AlertBanner>
        )}
        {bakeResult.warnings.length > 0 && (
          <AlertBanner severity="warning" compact sx={{ m: SPACING.sm }}>
            {bakeResult.warnings.join("\n")}
          </AlertBanner>
        )}
        {conflictRows.length > 0 && (
          <ConflictBanner
            sx={{ m: SPACING.sm }}
            conflicts={conflictRows}
            acceptLabel="Overwrite with code"
            discardLabel="Detach"
            onAccept={handleOverwriteScene}
            onDiscard={handleDetachScene}
          />
        )}
        {scenes.length > 0 && (
          <FlexColumn fullWidth>
            {scenes.map((scene) => (
              <SceneRow key={scene.groupId} scene={scene} onSelect={handleSelectScene} />
            ))}
          </FlexColumn>
        )}
      </ScrollArea>
      <FlexColumn css={editorBoxStyles(theme)} sx={{ m: SPACING.sm }}>
        {MonacoEditor ? (
          <MonacoEditor
            value={draftCode}
            onChange={handleChange}
            language="javascript"
            theme="vs-dark"
            width="100%"
            height="100%"
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              readOnly: isSettingCode || isDetaching
            }}
          />
        ) : monacoLoadError ? (
          <Text size="small" color="error">
            {monacoLoadError}
          </Text>
        ) : isMonacoLoading ? (
          <LoadingSpinner />
        ) : null}
      </FlexColumn>
    </FlexColumn>
  );
});

CodePanel.displayName = "CodePanel";

export default CodePanel;
