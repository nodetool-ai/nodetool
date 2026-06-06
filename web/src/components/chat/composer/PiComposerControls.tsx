/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { useShallow } from "zustand/react/shallow";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import MediaControlChip from "./MediaControlChip";
import MediaOptionMenu, { type MediaOption } from "./MediaOptionMenu";
import { trpcClient } from "../../../trpc/client";
import { isProduction } from "../../../lib/env";
import { getIsElectronDetails } from "../../../utils/browser";
import type { WorkspaceResponse } from "../../../stores/ApiTypes";

/**
 * Pi is workspace-aware (it runs a coding agent in a directory), so its
 * controls — and the Pi mode itself — are only offered where workspaces are
 * reachable: the desktop app, or dev. This mirrors the old AgentPanel gating.
 */
export const piModeAvailable =
  getIsElectronDetails().isElectron || !isProduction;

const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
};

/**
 * Workspace + model pickers shown in the composer chip row when the unified
 * chat is in Pi mode. State lives in GlobalChatStore's pi slice so the panel
 * and the global chat share the same selection.
 */
const PiComposerControls: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const {
    piModel,
    piModels,
    piModelsLoading,
    piWorkspaceId,
    piWorkspacePath,
    setPiModel,
    setPiWorkspace,
    loadPiModels
  } = useGlobalChatStore(
    useShallow((s) => ({
      piModel: s.piModel,
      piModels: s.piModels,
      piModelsLoading: s.piModelsLoading,
      piWorkspaceId: s.piWorkspaceId,
      piWorkspacePath: s.piWorkspacePath,
      setPiModel: s.setPiModel,
      setPiWorkspace: s.setPiWorkspace,
      loadPiModels: s.loadPiModels
    }))
  );

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
    enabled: piModeAvailable
  });

  const [modelAnchor, setModelAnchor] = useState<HTMLButtonElement | null>(null);
  const [workspaceAnchor, setWorkspaceAnchor] =
    useState<HTMLButtonElement | null>(null);

  // Default to the user's default workspace once the list arrives.
  useEffect(() => {
    if (!workspaces || piWorkspaceId) {
      return;
    }
    const def = workspaces.find((w) => w.is_default) ?? workspaces[0];
    if (def) {
      setPiWorkspace(def.id, def.path);
    }
  }, [workspaces, piWorkspaceId, setPiWorkspace]);

  // The pi model catalog depends on the workspace; reload when it changes.
  useEffect(() => {
    void loadPiModels();
  }, [piWorkspacePath, loadPiModels]);

  const modelOptions = useMemo<MediaOption<string>[]>(
    () =>
      piModels.map((m) => ({
        id: m.id,
        label: m.label,
        icon: <SmartToyOutlinedIcon fontSize="small" />
      })),
    [piModels]
  );

  const workspaceOptions = useMemo<MediaOption<string>[]>(
    () =>
      (workspaces ?? []).map((w) => ({
        id: w.id,
        label: w.path,
        icon: <FolderOutlinedIcon fontSize="small" />
      })),
    [workspaces]
  );

  const workspaceLabel =
    workspaces?.find((w) => w.id === piWorkspaceId)?.path?.split("/").pop() ||
    "Workspace";
  const modelLabel =
    piModels.find((m) => m.id === piModel)?.label ||
    (piModelsLoading ? "Loading…" : piModel || "Select model");

  return (
    <>
      <MediaControlChip
        icon={<FolderOutlinedIcon fontSize="small" />}
        label={workspaceLabel}
        active={!!workspaceAnchor}
        onClick={(e) => setWorkspaceAnchor(e.currentTarget)}
        showChevron={false}
        truncate
        disabled={disabled}
      />
      <MediaOptionMenu
        anchorEl={workspaceAnchor}
        open={!!workspaceAnchor}
        onClose={() => setWorkspaceAnchor(null)}
        header="Workspace"
        value={piWorkspaceId ?? ""}
        options={workspaceOptions}
        onChange={(id) => {
          const w = workspaces?.find((x) => x.id === id);
          setPiWorkspace(w?.id ?? null, w?.path ?? null);
        }}
      />

      <MediaControlChip
        icon={<SmartToyOutlinedIcon fontSize="small" />}
        label={modelLabel}
        active={!!modelAnchor}
        onClick={(e) => setModelAnchor(e.currentTarget)}
        showChevron={false}
        truncate
        disabled={disabled}
      />
      <MediaOptionMenu
        anchorEl={modelAnchor}
        open={!!modelAnchor}
        onClose={() => setModelAnchor(null)}
        header="Pi Model"
        value={piModel}
        options={modelOptions}
        onChange={(id) => setPiModel(id)}
      />
    </>
  );
};

export default PiComposerControls;
