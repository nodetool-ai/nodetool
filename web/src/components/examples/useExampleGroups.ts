import { useCallback, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import AppsIcon from "@mui/icons-material/Apps";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import type { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { usePanelStore } from "../../stores/PanelStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import {
  useExampleStoryboards,
  useInstallExampleStoryboard
} from "../../hooks/storyboard/useStoryboards";
import {
  useExampleTimelines,
  useInstallExampleTimeline
} from "../../hooks/useTimelineSequence";
import {
  useExampleGames,
  useInstallExampleGame
} from "../../hooks/useExampleGames";
import { useAddExampleModelAsset } from "../../hooks/useAddExampleModelAsset";
import { trpc } from "../../trpc/client";
import type { DragData } from "../../lib/dragdrop";
import { BASE_URL } from "../../stores/BASE_URL";
import { listExampleApps } from "../../utils/exampleApps";
import {
  EXAMPLE_MODEL_PACKS,
  exampleModelQueryKeys,
  fetchExampleModelCatalog,
  type ExampleModel
} from "../../utils/exampleModels";
import {
  EXAMPLE_SKETCHES,
  exampleSketchUrl,
  type ExampleSketch
} from "../../utils/exampleSketches";
import { installExampleSketch } from "../../utils/installExampleSketch";
import { notifyMutationError } from "../../utils/notifyMutationError";
import { EXAMPLE_APPS_QUERY_KEY } from "../portal/DashboardExampleApps";

export type ExampleKind =
  | "workflows"
  | "apps"
  | "storyboards"
  | "timelines"
  | "sketches"
  | "models"
  | "games";

export interface ExampleEntry {
  /** Unique across every group. */
  readonly key: string;
  readonly name: string;
  readonly secondary: string;
  /** Media locator of the preview image the Examples page shows, if any. */
  readonly thumbnail?: string;
  /** Present on examples that drop targets accept. */
  readonly drag?: DragData;
}

export interface ExampleGroup {
  readonly kind: ExampleKind;
  readonly label: string;
  readonly icon: ElementType<{ className?: string }>;
  /** Where the group's rows can be dropped, when they can. */
  readonly dropHint?: string;
  readonly entries: readonly ExampleEntry[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly retry: () => void;
}

export interface ExampleGroups {
  readonly groups: readonly ExampleGroup[];
  /** Key of the example being copied into the project, if any. */
  readonly openingKey: string | null;
  readonly open: (key: string) => void;
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const NO_RETRY = (): void => undefined;

/** Server gallery paths are relative to the API, like on the Examples page. */
const serverImage = (url: string | null | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  return url.startsWith("http") ? url : `${BASE_URL}${url}`;
};

/**
 * Every kind of shipped example, as rows for the Examples panel. Opening a row
 * does what its card on the Examples page does: workflows, sketches,
 * storyboards, timelines, models and games are copied into the current
 * project and opened, and apps open in their own tab.
 */
export const useExampleGroups = (): ExampleGroups => {
  const navigate = useNavigate();
  const location = useLocation();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const utils = trpc.useUtils();

  // Every surface opens in a workspace tab; leave the panel to the document.
  const showTab = useCallback(
    (tab: Parameters<typeof openTab>[0]) => {
      openTab(tab);
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );

  const loadTemplates = useWorkflowManager((state) => state.loadTemplates);
  const templates = useQuery<WorkflowList>({
    queryKey: ["templates"],
    queryFn: loadTemplates
  });
  const { handleExampleClick, loadingExampleId } = useWorkflowActions();

  const apps = useQuery({
    queryKey: EXAMPLE_APPS_QUERY_KEY,
    queryFn: listExampleApps,
    staleTime: Infinity
  });

  const storyboards = useExampleStoryboards();
  const installStoryboard = useInstallExampleStoryboard();
  const timelines = useExampleTimelines();
  const installTimeline = useInstallExampleTimeline();
  const games = useExampleGames();
  const installGame = useInstallExampleGame();

  const catalogs = useQueries({
    queries: EXAMPLE_MODEL_PACKS.map(({ slug }) => ({
      queryKey: exampleModelQueryKeys.catalog(slug),
      queryFn: () => fetchExampleModelCatalog(slug),
      staleTime: Infinity
    }))
  });
  const addExampleModelAsset = useAddExampleModelAsset();
  const installModel = useMutation({
    retry: false,
    mutationFn: async (model: ExampleModel) => {
      const projectId = creationProjectId();
      const asset = await addExampleModelAsset(model, projectId);
      return { asset, projectId };
    },
    onSuccess: ({ asset, projectId }, model) =>
      showTab({
        type: "model3d",
        ref: asset.id,
        mode: "edit",
        title: asset.name || model.name,
        projectId
      }),
    onError: (error) => notifyMutationError("add the example model", error)
  });

  const installSketch = useMutation({
    retry: false,
    mutationFn: (example: ExampleSketch) =>
      installExampleSketch(example, creationProjectId()),
    onSuccess: (created) => {
      utils.sketch.get.setData({ id: created.id }, created);
      void utils.sketch.list.invalidate();
      showTab({
        type: "sketch",
        ref: created.id,
        mode: "edit",
        title: created.name,
        projectId: created.projectId
      });
    },
    onError: (error) => notifyMutationError("add the example sketch", error)
  });

  // One copy at a time, like the Examples page.
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const busy =
    openingKey !== null ||
    loadingExampleId !== null ||
    installStoryboard.isPending ||
    installTimeline.isPending ||
    installGame.isPending ||
    installModel.isPending ||
    installSketch.isPending;

  const workflowList = templates.data?.workflows;
  const modelsByKey = useMemo(() => {
    const map = new Map<string, ExampleModel & { pack: string }>();
    catalogs.forEach((catalog, index) => {
      const pack = EXAMPLE_MODEL_PACKS[index];
      for (const model of catalog.data?.models ?? []) {
        map.set(`models:${pack.slug}/${model.slug}`, {
          ...model,
          pack: pack.label
        });
      }
    });
    return map;
  }, [catalogs]);

  const groups = useMemo((): ExampleGroup[] => {
    const modelsLoading = catalogs.some((catalog) => catalog.isPending);
    const modelsFailed = catalogs.some((catalog) => catalog.isError);
    return [
      {
        kind: "workflows",
        label: "Workflows",
        icon: AccountTreeOutlinedIcon,
        dropHint: "Drag onto the workflow canvas to add its nodes.",
        entries: (workflowList ?? []).map((workflow: Workflow) => ({
          key: `workflows:${workflow.id}`,
          name: workflow.name,
          secondary:
            workflow.description || plural(workflow.graph.nodes.length, "node"),
          thumbnail: serverImage(workflow.thumbnail_url),
          drag: {
            type: "example-workflow",
            payload: { name: workflow.name, graph: workflow.graph }
          }
        })),
        isLoading: templates.isPending,
        isError: templates.isError,
        retry: () => void templates.refetch()
      },
      {
        kind: "apps",
        label: "Apps",
        icon: AppsIcon,
        entries: (apps.data ?? []).map((app) => ({
          key: `apps:${app.slug}`,
          name: app.name,
          secondary: app.description,
          thumbnail: serverImage(app.thumbnailUrl)
        })),
        isLoading: apps.isPending,
        isError: apps.isError,
        retry: () => void apps.refetch()
      },
      {
        kind: "storyboards",
        label: "Storyboards",
        icon: DashboardOutlinedIcon,
        dropHint: "Drag onto the workflow canvas to add a copy as a node.",
        entries: (storyboards.data ?? []).map((storyboard) => ({
          key: `storyboards:${storyboard.slug}`,
          name: storyboard.name,
          secondary: plural(storyboard.shotCount, "shot"),
          thumbnail: serverImage(storyboard.thumbnailUrl),
          drag: {
            type: "example-storyboard",
            payload: { slug: storyboard.slug, name: storyboard.name }
          }
        })),
        isLoading: storyboards.isPending,
        isError: storyboards.isError,
        retry: () => void storyboards.refetch()
      },
      {
        kind: "timelines",
        label: "Timelines",
        icon: MovieOutlinedIcon,
        dropHint: "Drag onto the workflow canvas to add a copy as a node.",
        entries: (timelines.data ?? []).map((timeline) => ({
          key: `timelines:${timeline.slug}`,
          name: timeline.name,
          secondary: `${Math.round(timeline.durationMs / 1000)} seconds · ${plural(timeline.clipCount, "clip")}`,
          thumbnail: timeline.posterUri,
          drag: {
            type: "example-timeline",
            payload: { slug: timeline.slug, name: timeline.name }
          }
        })),
        isLoading: timelines.isPending,
        isError: timelines.isError,
        retry: () => void timelines.refetch()
      },
      {
        kind: "sketches",
        label: "Sketches",
        icon: BrushOutlinedIcon,
        dropHint: "Drag onto the workflow canvas to add a copy as a node.",
        entries: EXAMPLE_SKETCHES.map((sketch) => ({
          key: `sketches:${sketch.slug}`,
          name: sketch.name,
          secondary: `${sketch.category} · ${plural(sketch.layers.length, "layer")}`,
          thumbnail: exampleSketchUrl(sketch.slug, "preview"),
          drag: {
            type: "example-sketch",
            payload: { slug: sketch.slug, name: sketch.name }
          }
        })),
        isLoading: false,
        isError: false,
        retry: NO_RETRY
      },
      {
        kind: "models",
        label: "3D models",
        icon: ViewInArOutlinedIcon,
        dropHint:
          "Drag onto a 3D model input, an open 3D model or the workflow canvas.",
        entries: Array.from(modelsByKey, ([key, model]) => {
          const { pack, ...exampleModel } = model;
          return {
            key,
            name: model.name,
            secondary: `${pack} · ${model.triangles.toLocaleString()} triangles`,
            drag: { type: "example-model", payload: exampleModel }
          };
        }),
        isLoading: modelsLoading && modelsByKey.size === 0,
        isError: modelsFailed && modelsByKey.size === 0,
        retry: () => catalogs.forEach((catalog) => void catalog.refetch())
      },
      {
        kind: "games",
        label: "Games",
        icon: SportsEsportsOutlinedIcon,
        entries: (games.data ?? []).map((game) => ({
          key: `games:${game.slug}`,
          name: game.name,
          secondary: game.description,
          thumbnail: game.posterUri
        })),
        isLoading: games.isPending,
        isError: games.isError,
        retry: () => void games.refetch()
      }
    ];
  }, [
    workflowList,
    templates,
    apps,
    storyboards,
    timelines,
    games,
    catalogs,
    modelsByKey
  ]);

  const open = useCallback(
    (key: string) => {
      if (busy) {
        return;
      }
      const separator = key.indexOf(":");
      const kind = key.slice(0, separator) as ExampleKind;
      const ref = key.slice(separator + 1);
      const projectId = creationProjectId();
      const settle = { onSettled: () => setOpeningKey(null) };
      switch (kind) {
        case "workflows": {
          const workflow = workflowList?.find((entry) => entry.id === ref);
          if (workflow) {
            void handleExampleClick(workflow);
          }
          return;
        }
        case "apps": {
          const app = apps.data?.find((entry) => entry.slug === ref);
          if (app) {
            showTab({
              type: "example-app",
              ref: app.slug,
              mode: "view",
              title: app.name
            });
          }
          return;
        }
        case "storyboards":
          setOpeningKey(key);
          installStoryboard.mutate(
            { slug: ref, projectId },
            {
              ...settle,
              onSuccess: (created) =>
                showTab({
                  type: "storyboard",
                  ref: created.id,
                  mode: "edit",
                  title: created.name,
                  projectId: created.projectId
                }),
              onError: (error) =>
                notifyMutationError("add the example storyboard", error)
            }
          );
          return;
        case "timelines":
          setOpeningKey(key);
          installTimeline.mutate(
            { slug: ref, projectId },
            {
              ...settle,
              onSuccess: (created) =>
                showTab({
                  type: "timeline",
                  ref: created.id,
                  mode: "view",
                  title: created.name,
                  projectId: created.projectId
                }),
              onError: (error) =>
                notifyMutationError("add the example timeline", error)
            }
          );
          return;
        case "games":
          setOpeningKey(key);
          installGame.mutate(
            { slug: ref, projectId },
            {
              ...settle,
              onSuccess: (created) =>
                showTab({
                  type: "game",
                  ref: created.game.id,
                  mode: "view",
                  title: created.game.name,
                  projectId: created.game.projectId
                }),
              onError: (error) =>
                notifyMutationError("add the example game", error)
            }
          );
          return;
        case "sketches": {
          const sketch = EXAMPLE_SKETCHES.find((entry) => entry.slug === ref);
          if (sketch) {
            setOpeningKey(key);
            installSketch.mutate(sketch, settle);
          }
          return;
        }
        case "models": {
          const model = modelsByKey.get(key);
          if (model) {
            const { pack: _pack, ...exampleModel } = model;
            setOpeningKey(key);
            installModel.mutate(exampleModel, settle);
          }
          return;
        }
      }
    },
    [
      busy,
      workflowList,
      handleExampleClick,
      apps.data,
      showTab,
      installStoryboard,
      installTimeline,
      installGame,
      installSketch,
      installModel,
      modelsByKey
    ]
  );

  return {
    groups,
    openingKey:
      openingKey ?? (loadingExampleId ? `workflows:${loadingExampleId}` : null),
    open
  };
};
