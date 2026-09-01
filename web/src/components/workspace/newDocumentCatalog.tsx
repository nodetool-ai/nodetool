/**
 * The "new blank document" catalog: one list of creators, two renderings —
 * the `+ New` popover and the strip at the foot of the new-project surface.
 *
 * Each entry either creates its document straight away or names a submenu the
 * caller renders (text templates, storyboard examples), so both surfaces offer
 * the same set without either owning the creators.
 */

import { useCallback, useState, type ReactNode } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { useCreateTimeline } from "../../hooks/useTimelineSequence";
import {
  useCreateStoryboard,
  useInstallExampleStoryboard
} from "../../hooks/storyboard/useStoryboards";
import { useCreateApplication } from "../../hooks/useApplications";
import { useCreateScript } from "../../hooks/script/useScripts";
import { useCreateJsScript } from "../../hooks/jsScript/useJsScripts";
import { useCreateSkill } from "../../hooks/skills/useSkills";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import {
  creationProjectId,
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { newDocumentId } from "../../lib/newDocumentId";

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

/** The blank canvas a "New SVG" tab starts from. */
const BLANK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" ' +
  'width="512" height="512">\n</svg>\n';

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

export interface TextFileTemplate {
  label: string;
  filename: string;
  mimeType: string;
  content: string;
}

export const TEXT_FILE_TEMPLATES: readonly TextFileTemplate[] = [
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

/** Entries whose second choice the caller renders. */
export type NewDocumentSubmenu = "texts" | "storyboards";

export interface NewDocumentEntry {
  key: string;
  /** The document, named — what the grid shows. */
  label: string;
  /** The same as an action — what the menu shows. */
  menuLabel: string;
  /** The tab this opens; the grid draws its glyph and color from the type. */
  type: WorkspaceTabType;
  icon: ReactNode;
  /** Set when the entry opens a submenu instead of creating immediately. */
  submenu?: NewDocumentSubmenu;
  create?: () => Promise<void>;
}

interface NewDocumentCatalogOptions {
  /**
   * The project created documents belong to. Defaults to whichever project is
   * open, so the `+ New` menu keeps filing into it; the new-project surface
   * passes the loose bucket, because its strip promises a loose tab.
   */
  projectId?: string;
}

export interface NewDocumentCatalog {
  entries: readonly NewDocumentEntry[];
  createTextFile: (template: TextFileTemplate) => Promise<void>;
  createBlankStoryboard: () => Promise<void>;
  installStoryboardExample: (slug: string, name: string) => Promise<void>;
  /** Label of the creator in flight, if any — callers disable while it runs. */
  creating: string | null;
}

/**
 * The creators behind every "New X", each reporting failure as a toast rather
 * than a dead click. `onCreated` lets a caller close its own menu when one
 * succeeds.
 */
export const useNewDocumentCatalog = (
  options: NewDocumentCatalogOptions = {},
  onCreated?: () => void
): NewDocumentCatalog => {
  const [creating, setCreating] = useState<string | null>(null);

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const createNew = useWorkflowManager((state) => state.createNew);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const createAsset = useAssetStore((state) => state.createAsset);
  const createTimeline = useCreateTimeline();
  const createStoryboard = useCreateStoryboard();
  const installExampleStoryboard = useInstallExampleStoryboard();
  const createApplication = useCreateApplication();
  const createScript = useCreateScript();
  const createJsScript = useCreateJsScript();
  const createSkill = useCreateSkill();

  const { projectId } = options;
  // Read at click time, not at render: a project opened after this mounted is
  // still the one a new document belongs to.
  const targetProject = useCallback(
    () => projectId ?? creationProjectId(),
    [projectId]
  );

  const runCreate = useCallback(
    async (label: string, create: () => Promise<void>) => {
      setCreating(label);
      try {
        await create();
        onCreated?.();
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not create ${label}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        });
      } finally {
        setCreating(null);
      }
    },
    [addNotification, onCreated]
  );

  const createWorkflow = useCallback(
    () =>
      runCreate("workflow", async () => {
        const workflow = await createNew();
        openTab({
          type: "workflow",
          ref: workflow.id,
          mode: "edit",
          title: workflow.name
        });
      }),
    [runCreate, createNew, openTab]
  );

  const createChat = useCallback(
    () =>
      runCreate("chat", async () => {
        const threadId = await createNewThread();
        openTab({
          type: "chat",
          ref: threadId,
          mode: "view",
          title: "New chat"
        });
      }),
    [runCreate, createNewThread, openTab]
  );

  const createTextFile = useCallback(
    (template: TextFileTemplate) =>
      runCreate("text file", async () => {
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
      }),
    [runCreate, createAsset, openTab]
  );

  const createImage = useCallback(
    () =>
      runCreate("image", async () => {
        const asset = await createAsset(await createBlankImageFile());
        openTab({
          type: "image",
          ref: asset.id,
          mode: "edit",
          title: asset.name || "Untitled image"
        });
      }),
    [runCreate, createAsset, openTab]
  );

  const createSvg = useCallback(
    () =>
      runCreate("SVG", async () => {
        const asset = await createAsset(
          new File([BLANK_SVG], "Untitled.svg", { type: "image/svg+xml" })
        );
        openTab({
          type: "svg",
          ref: asset.id,
          mode: "edit",
          title: asset.name || "Untitled.svg"
        });
      }),
    [runCreate, createAsset, openTab]
  );

  const createVideo = useCallback(
    () =>
      runCreate("video", async () => {
        const sequence = await createTimeline.mutateAsync({
          name: "Untitled video",
          projectId: targetProject()
        });
        openTab({
          type: "timeline",
          ref: sequence.id,
          mode: "edit",
          title: sequence.name || "Untitled video",
          projectId: sequence.projectId
        });
      }),
    [runCreate, createTimeline, openTab, targetProject]
  );

  const createBlankStoryboard = useCallback(
    () =>
      runCreate("storyboard", async () => {
        const created = await createStoryboard.mutateAsync({
          name: "Untitled storyboard",
          projectId: targetProject()
        });
        openTab({
          type: "storyboard",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runCreate, createStoryboard, openTab, targetProject]
  );

  const installStoryboardExample = useCallback(
    (slug: string, name: string) =>
      runCreate(name, async () => {
        const created = await installExampleStoryboard.mutateAsync({
          slug,
          projectId: targetProject()
        });
        openTab({
          type: "storyboard",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runCreate, installExampleStoryboard, openTab, targetProject]
  );

  const createApp = useCallback(
    () =>
      runCreate("app", async () => {
        const created = await createApplication.mutateAsync({
          name: "Untitled app",
          description: "",
          projectId: targetProject()
        });
        openTab({
          type: "application",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runCreate, createApplication, openTab, targetProject]
  );

  const createScriptDocument = useCallback(
    () =>
      runCreate("script", async () => {
        const created = await createScript.mutateAsync({
          name: "Untitled script",
          projectId: targetProject()
        });
        openTab({
          type: "script",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runCreate, createScript, openTab, targetProject]
  );

  const createJsScriptDocument = useCallback(
    () =>
      runCreate("JS script", async () => {
        const created = await createJsScript.mutateAsync({
          name: "Untitled JS script",
          projectId: targetProject()
        });
        openTab({
          type: "jsscript",
          ref: created.id,
          mode: "edit",
          title: created.name,
          projectId: created.projectId
        });
      }),
    [runCreate, createJsScript, openTab, targetProject]
  );

  const createSkillDocument = useCallback(
    () =>
      runCreate("skill", async () => {
        const created = await createSkill.mutateAsync({
          id: newDocumentId(),
          name: `skill-${Date.now().toString(36)}`,
          description: "A reusable skill for the NodeTool agent.",
          content:
            "# New skill\n\nDescribe what this skill does and when the agent should use it."
        });
        openTab({
          type: "skill",
          ref: created.id,
          mode: "edit",
          title: created.name || "Untitled skill"
        });
      }),
    [runCreate, createSkill, openTab]
  );

  const createModel = useCallback(
    () =>
      runCreate("3D model", async () => {
        const asset = await createAsset(await createBlankModelFile());
        openTab({
          type: "model3d",
          ref: asset.id,
          mode: "edit",
          title: asset.name || "Untitled model"
        });
      }),
    [runCreate, createAsset, openTab]
  );

  const entries: NewDocumentEntry[] = [
    {
      key: "workflow",
      label: "Workflow",
      menuLabel: "New workflow",
      type: "workflow",
      icon: <AddRoundedIcon fontSize="small" />,
      create: createWorkflow
    },
    {
      key: "chat",
      label: "Chat",
      menuLabel: "New chat",
      type: "chat",
      icon: <ForumOutlinedIcon fontSize="small" />,
      create: createChat
    },
    {
      key: "text",
      label: "Text",
      menuLabel: "New text file…",
      type: "text",
      icon: <ArticleOutlinedIcon fontSize="small" />,
      submenu: "texts"
    },
    {
      key: "image",
      label: "Image",
      menuLabel: "New image",
      type: "image",
      icon: <ImageOutlinedIcon fontSize="small" />,
      create: createImage
    },
    {
      key: "svg",
      label: "SVG",
      menuLabel: "New SVG",
      type: "svg",
      icon: <CategoryOutlinedIcon fontSize="small" />,
      create: createSvg
    },
    {
      key: "video",
      label: "Video",
      menuLabel: "New video",
      type: "timeline",
      icon: <MovieOutlinedIcon fontSize="small" />,
      create: createVideo
    },
    {
      key: "storyboard",
      label: "Storyboard",
      menuLabel: "New storyboard…",
      type: "storyboard",
      icon: <DashboardOutlinedIcon fontSize="small" />,
      submenu: "storyboards"
    },
    {
      key: "app",
      label: "App",
      menuLabel: "New app",
      type: "application",
      icon: <DashboardCustomizeOutlinedIcon fontSize="small" />,
      create: createApp
    },
    {
      key: "script",
      label: "Script",
      menuLabel: "New script",
      type: "script",
      icon: <RecordVoiceOverOutlinedIcon fontSize="small" />,
      create: createScriptDocument
    },
    {
      key: "jsscript",
      label: "JS script",
      menuLabel: "New JS script",
      type: "jsscript",
      icon: <DataObjectOutlinedIcon fontSize="small" />,
      create: createJsScriptDocument
    },
    {
      key: "skill",
      label: "Skill",
      menuLabel: "New skill",
      type: "skill",
      icon: <AutoAwesomeOutlinedIcon fontSize="small" />,
      create: createSkillDocument
    },
    {
      key: "model3d",
      label: "3D model",
      menuLabel: "New 3D model",
      type: "model3d",
      icon: <ViewInArOutlinedIcon fontSize="small" />,
      create: createModel
    }
  ];

  return {
    entries,
    createTextFile,
    createBlankStoryboard,
    installStoryboardExample,
    creating
  };
};
