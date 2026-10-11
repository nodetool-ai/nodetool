/**
 * Dialog previews for /preview/dialog-*.
 *
 * Each preview opens one real dialog with sample data and no-op handlers, so a
 * single navigation captures it in both color schemes without a UI trigger.
 */

import React, { Suspense, useEffect } from "react";

import { useAssetGridStore } from "../../stores/AssetGridStore";
import useLogsStore from "../../stores/LogStore";
import type { Asset } from "../../stores/ApiTypes";
import { Box } from "../ui_primitives";

const AssetRenameConfirmation = React.lazy(
  () => import("../assets/AssetRenameConfirmation")
);
const AssetDeleteConfirmation = React.lazy(
  () => import("../assets/AssetDeleteConfirmation")
);
const AddDynamicOutputDialog = React.lazy(
  () => import("../node/AddDynamicOutputDialog")
);
const BugReportDialog = React.lazy(() => import("../support/BugReportDialog"));
const Help = React.lazy(() => import("../content/Help/Help"));
const ExportVideoDialog = React.lazy(
  () => import("../timeline/ExportVideoDialog")
);
const TimelineShortcutsDialog = React.lazy(
  () => import("../timeline/TimelineShortcutsDialog")
);
const NewProjectDialog = React.lazy(() => import("../projects/NewProjectDialog"));
const ShareWorkflowDialog = React.lazy(
  () => import("../workflows/ShareWorkflowDialog")
);
const JsScriptRunDialog = React.lazy(
  () => import("../jsScript/JsScriptRunDialog")
);
const ModelShortcutsDialog = React.lazy(
  () => import("../model_editor/ShortcutsDialog")
);
const NodeLogsDialog = React.lazy(() =>
  import("../node/NodeLogs").then((m) => ({ default: m.NodeLogsDialog }))
);

const noop = (): void => undefined;

const SAMPLE_ASSET = {
  id: "preview-asset",
  user_id: "1",
  workflow_id: null,
  parent_id: "1",
  name: "sunset-over-the-bay.png",
  content_type: "image/png",
  metadata: null,
  created_at: "2024-09-01T09:00:00Z",
  get_url: null,
  thumb_url: null,
  duration: null,
  size: 1024
} as unknown as Asset;

const SAMPLE_LOG_WORKFLOW = "preview-workflow";
const SAMPLE_LOG_NODE = "preview-node";

const DialogFrame: React.FC<{ preview: string; children: React.ReactNode }> = ({
  preview,
  children
}) => (
  <Box
    data-preview={preview}
    sx={{ width: "100%", height: "100vh", bgcolor: "background.default" }}
  >
    <Suspense fallback={null}>{children}</Suspense>
  </Box>
);

const PreviewRenameAsset: React.FC = () => {
  useEffect(() => {
    const store = useAssetGridStore.getState();
    store.setSelectedAssets([SAMPLE_ASSET]);
    store.setRenameDialogOpen(true);
  }, []);
  return (
    <DialogFrame preview="dialog-rename-asset">
      <AssetRenameConfirmation assets={[SAMPLE_ASSET.id]} />
    </DialogFrame>
  );
};

const PreviewDeleteAssets: React.FC = () => {
  useEffect(() => {
    const store = useAssetGridStore.getState();
    store.setSelectedAssets([SAMPLE_ASSET]);
    store.setDeleteDialogOpen(true);
  }, []);
  return (
    <DialogFrame preview="dialog-delete-assets">
      <AssetDeleteConfirmation assets={[SAMPLE_ASSET.id]} />
    </DialogFrame>
  );
};

const PreviewAddOutput: React.FC = () => (
  <DialogFrame preview="dialog-add-output">
    <AddDynamicOutputDialog open onClose={noop} onAdd={noop} />
  </DialogFrame>
);

const PreviewBugReport: React.FC = () => (
  <DialogFrame preview="dialog-bug-report">
    <BugReportDialog
      context={{
        source: "node-error",
        summary: "Image generation failed",
        errorText: "Provider returned 429: rate limit exceeded"
      }}
      onClose={noop}
    />
  </DialogFrame>
);

const PreviewHelp: React.FC = () => (
  <DialogFrame preview="dialog-help">
    <Help open handleClose={noop} />
  </DialogFrame>
);

const PreviewExportVideo: React.FC = () => (
  <DialogFrame preview="dialog-export-video">
    <ExportVideoDialog open onClose={noop} onExport={noop} />
  </DialogFrame>
);

const PreviewTimelineShortcuts: React.FC = () => (
  <DialogFrame preview="dialog-timeline-shortcuts">
    <TimelineShortcutsDialog open onClose={noop} />
  </DialogFrame>
);

const PreviewNewProject: React.FC = () => (
  <DialogFrame preview="dialog-new-project">
    <NewProjectDialog open onClose={noop} />
  </DialogFrame>
);

const PreviewShareWorkflow: React.FC = () => (
  <DialogFrame preview="dialog-share-workflow">
    <ShareWorkflowDialog
      open
      onClose={noop}
      workflowId="wf-preview-stub"
      workflowName="Product photo pipeline"
    />
  </DialogFrame>
);

const PreviewRunJsScript: React.FC = () => (
  <DialogFrame preview="dialog-run-js-script">
    <JsScriptRunDialog
      open
      inputs={[
        { name: "prompt", type: "str" },
        { name: "count", type: "int" }
      ]}
      onClose={noop}
      onRun={noop}
    />
  </DialogFrame>
);

const PreviewModelShortcuts: React.FC = () => (
  <DialogFrame preview="dialog-model-shortcuts">
    <ModelShortcutsDialog open onClose={noop} />
  </DialogFrame>
);

const PreviewNodeLogs: React.FC = () => {
  useEffect(() => {
    const { appendLog } = useLogsStore.getState();
    const base = {
      workflowId: SAMPLE_LOG_WORKFLOW,
      workflowName: "Product photo pipeline",
      nodeId: SAMPLE_LOG_NODE,
      nodeName: "Generate image"
    };
    appendLog({
      ...base,
      content: "Requesting 4 images at 1024×1024",
      severity: "info",
      timestamp: 1725181200000
    });
    appendLog({
      ...base,
      content: "Provider is slow to respond, retrying",
      severity: "warning",
      timestamp: 1725181205000
    });
    appendLog({
      ...base,
      content: "Received 4 images",
      severity: "info",
      timestamp: 1725181212000
    });
  }, []);
  return (
    <DialogFrame preview="dialog-node-logs">
      <NodeLogsDialog
        id={SAMPLE_LOG_NODE}
        workflowId={SAMPLE_LOG_WORKFLOW}
        open
        onClose={noop}
      />
    </DialogFrame>
  );
};

export const DIALOG_PREVIEWS: Record<
  string,
  { label: string; component: React.FC }
> = {
  "dialog-rename-asset": { label: "Rename asset", component: PreviewRenameAsset },
  "dialog-delete-assets": {
    label: "Delete assets",
    component: PreviewDeleteAssets
  },
  "dialog-add-output": { label: "Add output", component: PreviewAddOutput },
  "dialog-bug-report": { label: "Report a bug", component: PreviewBugReport },
  "dialog-help": { label: "Help", component: PreviewHelp },
  "dialog-export-video": {
    label: "Export video",
    component: PreviewExportVideo
  },
  "dialog-timeline-shortcuts": {
    label: "Timeline shortcuts",
    component: PreviewTimelineShortcuts
  },
  "dialog-new-project": { label: "New project", component: PreviewNewProject },
  "dialog-share-workflow": {
    label: "Share workflow",
    component: PreviewShareWorkflow
  },
  "dialog-run-js-script": {
    label: "Run script with inputs",
    component: PreviewRunJsScript
  },
  "dialog-model-shortcuts": {
    label: "3D editor shortcuts",
    component: PreviewModelShortcuts
  },
  "dialog-node-logs": { label: "Node logs", component: PreviewNodeLogs }
};
