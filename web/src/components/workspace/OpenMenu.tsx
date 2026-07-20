import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

import {
  Popover,
  MenuItemPrimitive,
  TextInput,
  FlexColumn,
  FlexRow,
  Caption,
  LoadingSpinner
} from "../ui_primitives";
import { trpcClient } from "../../trpc/client";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { useCreateTimeline } from "../../hooks/useTimelineSequence";
import { useCreateStoryboard } from "../../hooks/storyboard/useStoryboards";
import { useCreateScript } from "../../hooks/script/useScripts";
import { useAssetStore } from "../../stores/AssetStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { assetTabType } from "./assetTabType";
import type {
  WorkflowList,
  AssetWithPath,
  Thread
} from "../../stores/ApiTypes";

/** Render a blank white PNG to seed a "New image" canvas asset. */
const createBlankImageFile = (): Promise<File> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas 2D context unavailable"));
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to render blank image"));
        return;
      }
      resolve(new File([blob], "Untitled.png", { type: "image/png" }));
    }, "image/png");
  });

/**
 * Build a starter `.glb` (a single box, like a default cube) to seed a
 * "New 3D model" tab. Three.js is imported lazily so its weight only loads when
 * the user actually creates a model.
 */
const createBlankModelFile = async (): Promise<File> => {
  const [THREE, { createPrimitive }, { exportSceneToGlb }] = await Promise.all([
    import("three"),
    import("../model_editor/objectFactory"),
    import("../model_editor/exportGltf")
  ]);
  const scene = new THREE.Scene();
  const box = createPrimitive("box");
  box.name = "Box";
  scene.add(box);
  const blob = await exportSceneToGlb(scene);
  return new File([blob], "Untitled.glb", { type: "model/gltf-binary" });
};

interface OpenMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

type MenuView = "root" | "texts" | "workflows" | "assets" | "chats";

interface TextFileTemplate {
  label: string;
  filename: string;
  mimeType: string;
  content: string;
}

const TEXT_FILE_TEMPLATES: readonly TextFileTemplate[] = [
  {
    label: "Markdown (.md)",
    filename: "Untitled.md",
    mimeType: "text/markdown",
    content: "# Untitled\n"
  },
  {
    label: "JSON (.json)",
    filename: "Untitled.json",
    mimeType: "application/json",
    content: "{}\n"
  },
  {
    label: "YAML (.yaml)",
    filename: "Untitled.yaml",
    mimeType: "application/x-yaml",
    content: "---\n"
  },
  {
    label: "CSV (.csv)",
    filename: "Untitled.csv",
    mimeType: "text/csv",
    content: "Column 1\n"
  },
  {
    label: "TSV (.tsv)",
    filename: "Untitled.tsv",
    mimeType: "text/tab-separated-values",
    content: "Column 1\n"
  },
  {
    label: "Plain text (.txt)",
    filename: "Untitled.txt",
    mimeType: "text/plain",
    content: ""
  }
];

/**
 * The `[+]` menu for the workspace tab bar: create a new workflow, or open an
 * existing workflow or asset as a tab. A lightweight stand-in for the deferred
 * home/launcher screen — the only way to open existing documents until then.
 */
const OpenMenu = ({ anchorEl, open, onClose }: OpenMenuProps) => {
  const [view, setView] = useState<MenuView>("root");
  const [assetQuery, setAssetQuery] = useState("");
  const [wfFilter, setWfFilter] = useState("");
  const [chatFilter, setChatFilter] = useState("");

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const createNew = useWorkflowManager((state) => state.createNew);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const createAsset = useAssetStore((state) => state.createAsset);
  const createTimeline = useCreateTimeline();
  const createStoryboard = useCreateStoryboard();
  const createScript = useCreateScript();
  const { searchAssets } = useAssetSearch();

  const close = useCallback(() => {
    setView("root");
    setAssetQuery("");
    setWfFilter("");
    setChatFilter("");
    onClose();
  }, [onClose]);

  const handleNew = useCallback(async () => {
    const workflow = await createNew();
    openTab({
      type: "workflow",
      ref: workflow.id,
      mode: "edit",
      title: workflow.name
    });
    close();
  }, [createNew, openTab, close]);

  const handleNewImage = useCallback(async () => {
    try {
      const asset = await createAsset(await createBlankImageFile());
      openTab({
        type: "image",
        ref: asset.id,
        mode: "edit",
        title: asset.name || "Untitled image"
      });
      close();
    } catch (error) {
      console.error("Failed to create image", error);
    }
  }, [createAsset, openTab, close]);

  const handleNewText = useCallback(
    async (template: TextFileTemplate) => {
      try {
        const asset = await createAsset(
          new File([template.content], template.filename, {
            type: template.mimeType
          })
        );
        openTab({
          type: "text",
          ref: asset.id,
          mode: "edit",
          title: asset.name || template.filename
        });
        close();
      } catch (error) {
        console.error("Failed to create text file", error);
      }
    },
    [createAsset, openTab, close]
  );

  const handleNewVideo = useCallback(async () => {
    try {
      const sequence = await createTimeline.mutateAsync({
        name: "Untitled video",
        projectId: "default"
      });
      openTab({
        type: "timeline",
        ref: sequence.id,
        mode: "edit",
        title: sequence.name || "Untitled video"
      });
      close();
    } catch (error) {
      console.error("Failed to create video", error);
    }
  }, [createTimeline, openTab, close]);

  const handleNewStoryboard = useCallback(async () => {
    try {
      const created = await createStoryboard.mutateAsync({
        name: "Untitled storyboard",
        projectId: "default"
      });
      openTab({
        type: "storyboard",
        ref: created.id,
        mode: "edit",
        title: created.name
      });
      close();
    } catch (error) {
      console.error("Failed to create storyboard", error);
    }
  }, [createStoryboard, openTab, close]);

  const handleNewScript = useCallback(async () => {
    try {
      const created = await createScript.mutateAsync({
        name: "Untitled script",
        projectId: "default"
      });
      openTab({
        type: "script",
        ref: created.id,
        mode: "edit",
        title: created.name
      });
      close();
    } catch (error) {
      console.error("Failed to create script", error);
    }
  }, [createScript, openTab, close]);

  const handleNewChat = useCallback(async () => {
    try {
      const threadId = await createNewThread();
      openTab({
        type: "chat",
        ref: threadId,
        mode: "view",
        title: "New chat"
      });
      close();
    } catch (error) {
      console.error("Failed to create chat", error);
    }
  }, [createNewThread, openTab, close]);

  const handleNewModel = useCallback(async () => {
    try {
      const asset = await createAsset(await createBlankModelFile());
      openTab({
        type: "model3d",
        ref: asset.id,
        mode: "edit",
        title: asset.name || "Untitled model"
      });
      close();
    } catch (error) {
      console.error("Failed to create 3D model", error);
    }
  }, [createAsset, openTab, close]);

  const { data: workflowList, isLoading: workflowsLoading } =
    useQuery<WorkflowList>({
      queryKey: ["open-menu", "workflows"],
      queryFn: () =>
        trpcClient.workflows.list.query({
          cursor: "",
          limit: 200
        }) as unknown as Promise<WorkflowList>,
      enabled: open && view === "workflows",
      staleTime: 30_000
    });

  const workflows = useMemo(() => {
    const all = workflowList?.workflows ?? [];
    const needle = wfFilter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((w) => w.name.toLowerCase().includes(needle));
  }, [workflowList, wfFilter]);

  const { data: threadList, isLoading: threadsLoading } = useQuery({
    queryKey: ["open-menu", "threads"],
    queryFn: () => trpcClient.threads.list.query({ limit: 100 }),
    enabled: open && view === "chats",
    staleTime: 30_000
  });

  const chatThreads = useMemo(() => {
    const all: Thread[] = threadList?.threads ?? [];
    const needle = chatFilter.trim().toLowerCase();
    const filtered = needle
      ? all.filter((t) => (t.title ?? "").toLowerCase().includes(needle))
      : all;
    return [...filtered].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
    );
  }, [threadList, chatFilter]);

  const openChat = useCallback(
    (thread: Thread) => {
      openTab({
        type: "chat",
        ref: thread.id,
        mode: "view",
        title: thread.title || "Untitled chat"
      });
      close();
    },
    [openTab, close]
  );

  const trimmedAssetQuery = assetQuery.trim();
  const { data: assetResult, isFetching: assetsFetching } = useQuery({
    queryKey: ["open-menu", "assets", trimmedAssetQuery],
    queryFn: () => searchAssets(trimmedAssetQuery, undefined, 100),
    enabled: open && view === "assets" && trimmedAssetQuery.length >= 2,
    staleTime: 15_000
  });

  const openableAssets = useMemo(() => {
    const assets = assetResult?.assets ?? [];
    return assets
      .map((asset) => ({ asset, type: assetTabType(asset) }))
      .filter(
        (entry): entry is { asset: AssetWithPath; type: WorkspaceTabType } =>
          entry.type !== null
      );
  }, [assetResult]);

  const openWorkflow = useCallback(
    (id: string, name: string) => {
      openTab({ type: "workflow", ref: id, mode: "edit", title: name });
      close();
    },
    [openTab, close]
  );

  const openAsset = useCallback(
    (asset: AssetWithPath, type: WorkspaceTabType) => {
      openTab({
        type,
        ref: asset.id,
        mode: "view",
        title: asset.name || "Untitled"
      });
      close();
    },
    [openTab, close]
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={close}
      placement="bottom-left"
      maxWidth={340}
      maxHeight="70vh"
    >
      <FlexColumn sx={{ width: 320, py: 0.5 }}>
        {view === "root" && (
          <>
            <MenuItemPrimitive
              label="New workflow"
              icon={<AddRoundedIcon fontSize="small" />}
              onClick={() => void handleNew()}
            />
            <MenuItemPrimitive
              label="New text file…"
              icon={<ArticleOutlinedIcon fontSize="small" />}
              hasSubmenu
              onClick={() => setView("texts")}
            />
            <MenuItemPrimitive
              label="New image"
              icon={<ImageOutlinedIcon fontSize="small" />}
              onClick={() => void handleNewImage()}
            />
            <MenuItemPrimitive
              label="New video"
              icon={<MovieOutlinedIcon fontSize="small" />}
              onClick={() => void handleNewVideo()}
            />
            <MenuItemPrimitive
              label="New storyboard"
              icon={<DashboardOutlinedIcon fontSize="small" />}
              onClick={() => void handleNewStoryboard()}
            />
            <MenuItemPrimitive
              label="New script"
              icon={<RecordVoiceOverOutlinedIcon fontSize="small" />}
              onClick={() => void handleNewScript()}
            />
            <MenuItemPrimitive
              label="New 3D model"
              icon={<ViewInArOutlinedIcon fontSize="small" />}
              onClick={() => void handleNewModel()}
            />
            <MenuItemPrimitive
              label="New chat"
              icon={<ForumOutlinedIcon fontSize="small" />}
              onClick={() => void handleNewChat()}
              dividerAfter
            />
            <MenuItemPrimitive
              label="Open workflow…"
              hasSubmenu
              onClick={() => setView("workflows")}
            />
            <MenuItemPrimitive
              label="Open asset…"
              hasSubmenu
              onClick={() => setView("assets")}
            />
            <MenuItemPrimitive
              label="Open chat…"
              hasSubmenu
              onClick={() => setView("chats")}
            />
          </>
        )}

        {view === "texts" && (
          <>
            <MenuItemPrimitive
              label="Back"
              icon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => setView("root")}
              dividerAfter
            />
            {TEXT_FILE_TEMPLATES.map((template) => (
              <MenuItemPrimitive
                key={template.filename}
                label={template.label}
                onClick={() => void handleNewText(template)}
              />
            ))}
          </>
        )}

        {view === "workflows" && (
          <>
            <MenuItemPrimitive
              label="Back"
              icon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => setView("root")}
              dividerAfter
            />
            <FlexRow sx={{ px: 1, py: 0.5 }}>
              <TextInput
                autoFocus
                fullWidth
                placeholder="Filter workflows"
                value={wfFilter}
                onChange={(e) => setWfFilter(e.target.value)}
              />
            </FlexRow>
            {workflowsLoading && (
              <FlexRow justify="center" sx={{ py: 2 }}>
                <LoadingSpinner />
              </FlexRow>
            )}
            {!workflowsLoading && workflows.length === 0 && (
              <Caption color="secondary" sx={{ px: 2, py: 1.5 }}>
                No workflows found.
              </Caption>
            )}
            {workflows.map((w) => (
              <MenuItemPrimitive
                key={w.id}
                label={w.name || "Untitled"}
                onClick={() => openWorkflow(w.id, w.name || "Untitled")}
              />
            ))}
          </>
        )}

        {view === "chats" && (
          <>
            <MenuItemPrimitive
              label="Back"
              icon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => setView("root")}
              dividerAfter
            />
            <FlexRow sx={{ px: 1, py: 0.5 }}>
              <TextInput
                autoFocus
                fullWidth
                placeholder="Filter chats"
                value={chatFilter}
                onChange={(e) => setChatFilter(e.target.value)}
              />
            </FlexRow>
            {threadsLoading && (
              <FlexRow justify="center" sx={{ py: 2 }}>
                <LoadingSpinner />
              </FlexRow>
            )}
            {!threadsLoading && chatThreads.length === 0 && (
              <Caption color="secondary" sx={{ px: 2, py: 1.5 }}>
                No chats found.
              </Caption>
            )}
            {chatThreads.map((thread) => (
              <MenuItemPrimitive
                key={thread.id}
                label={thread.title || "Untitled chat"}
                onClick={() => openChat(thread)}
              />
            ))}
          </>
        )}

        {view === "assets" && (
          <>
            <MenuItemPrimitive
              label="Back"
              icon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => setView("root")}
              dividerAfter
            />
            <FlexRow sx={{ px: 1, py: 0.5 }}>
              <TextInput
                autoFocus
                fullWidth
                placeholder="Search assets (2+ chars)"
                value={assetQuery}
                onChange={(e) => setAssetQuery(e.target.value)}
              />
            </FlexRow>
            {trimmedAssetQuery.length < 2 && (
              <Caption color="secondary" sx={{ px: 2, py: 1.5 }}>
                Type at least 2 characters to search.
              </Caption>
            )}
            {trimmedAssetQuery.length >= 2 && assetsFetching && (
              <FlexRow justify="center" sx={{ py: 2 }}>
                <LoadingSpinner />
              </FlexRow>
            )}
            {trimmedAssetQuery.length >= 2 &&
              !assetsFetching &&
              openableAssets.length === 0 && (
                <Caption color="secondary" sx={{ px: 2, py: 1.5 }}>
                  No openable assets match.
                </Caption>
              )}
            {openableAssets.map(({ asset, type }) => (
              <MenuItemPrimitive
                key={asset.id}
                label={asset.name || "Untitled"}
                secondary={type}
                onClick={() => openAsset(asset, type)}
              />
            ))}
          </>
        )}
      </FlexColumn>
    </Popover>
  );
};

export default OpenMenu;
