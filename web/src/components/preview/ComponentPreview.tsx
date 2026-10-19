/** @jsxImportSource @emotion/react */
/**
 * ComponentPreview - Isolated component viewer for documentation screenshots.
 *
 * Available at /preview/:component (localhost only)
 *
 * Renders individual UI components in isolation so Playwright can capture
 * zoomed-in, focused screenshots for documentation without needing the full
 * application context. Each preview pre-opens any dialog/modal that would
 * normally need a UI trigger so a single navigation produces a clean capture.
 */

import React, { Suspense, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import {
  Text,
  Caption,
  LoadingSpinner,
  Surface,
  Box,
  FlexColumn,
  Code,
  FlexRow,
  Panel,
  TextInput,
  SelectField,
  MOTION,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import {
  DataframeRef,
  NodeMetadata,
  UnifiedModel,
  Workflow
} from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useModelManagerStore } from "../../stores/ModelManagerStore";
import { useSystemStatsStore } from "../../stores/systemStatsHandler";
import { useProviderOnboardingStore } from "../../stores/ProviderOnboardingStore";
import { DIALOG_PREVIEWS } from "./DialogPreviews";
import PreviewProgressStates from "./ProgressPreviews";
import PreviewModelPicker from "./ModelPickerPreview";

const CostsDashboard = React.lazy(() => import("../costs/CostsDashboard"));
const ModelListIndex = React.lazy(
  () => import("../hugging_face/model_list/ModelListIndex")
);
const AssetExplorer = React.lazy(() => import("../assets/AssetExplorer"));
const ConfirmDialog = React.lazy(
  () => import("../ui_primitives/ConfirmDialog")
);
const ColorPickerModal = React.lazy(
  () => import("../color_picker/ColorPickerModal")
);
const TextEditorModal = React.lazy(
  () => import("../properties/TextEditorModal")
);
const DataframeEditorModal = React.lazy(
  () => import("../properties/DataframeEditorModal")
);
const ImageComparer = React.lazy(() => import("../widgets/ImageComparer"));
const RecommendedModels = React.lazy(
  () => import("../hugging_face/RecommendedModels")
);
const ModelOnboarding = React.lazy(
  () => import("../hugging_face/onboarding/ModelOnboarding")
);
const DeleteModelDialog = React.lazy(
  () => import("../hugging_face/model_list/DeleteModelDialog")
);
const DownloadManagerDialog = React.lazy(
  () => import("../hugging_face/DownloadManagerDialog")
);
const NodeInfo = React.lazy(() => import("../node_menu/NodeInfo"));
const WorkflowFormModal = React.lazy(
  () => import("../workflows/WorkflowFormModal")
);
const WorkflowDeleteDialog = React.lazy(
  () => import("../workflows/WorkflowDeleteDialog")
);
const ProviderOnboardingDialog = React.lazy(
  () => import("../provider_onboarding/ProviderOnboardingDialog")
);

interface PreviewEntry {
  id: string;
  labelKey: string;
  descriptionKey: string;
  viewport?: { width: number; height: number };
}

const PREVIEWS: PreviewEntry[] = [
  {
    id: "app-header",
    labelKey: "entries.appHeader.label",
    descriptionKey: "entries.appHeader.description",
    viewport: { width: 1920, height: 80 }
  },
  {
    id: "costs",
    labelKey: "entries.costs.label",
    descriptionKey: "entries.costs.description",
    viewport: { width: 1500, height: 1080 }
  },
  {
    id: "models",
    labelKey: "entries.models.label",
    descriptionKey: "entries.models.description",
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: "model-onboarding",
    labelKey: "entries.modelOnboarding.label",
    descriptionKey: "entries.modelOnboarding.description",
    viewport: { width: 1440, height: 1080 }
  },
  {
    id: "assets",
    labelKey: "entries.assets.label",
    descriptionKey: "entries.assets.description",
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: "confirm-dialog",
    labelKey: "entries.confirmDialog.label",
    descriptionKey: "entries.confirmDialog.description"
  },
  {
    id: "color-picker",
    labelKey: "entries.colorPicker.label",
    descriptionKey: "entries.colorPicker.description"
  },
  {
    id: "text-editor",
    labelKey: "entries.textEditor.label",
    descriptionKey: "entries.textEditor.description"
  },
  {
    id: "dataframe-editor",
    labelKey: "entries.dataframeEditor.label",
    descriptionKey: "entries.dataframeEditor.description"
  },
  {
    id: "image-compare",
    labelKey: "entries.imageCompare.label",
    descriptionKey: "entries.imageCompare.description"
  },
  {
    id: "recommended-models",
    labelKey: "entries.recommendedModels.label",
    descriptionKey: "entries.recommendedModels.description"
  },
  {
    id: "delete-model",
    labelKey: "entries.deleteModel.label",
    descriptionKey: "entries.deleteModel.description"
  },
  {
    id: "download-manager",
    labelKey: "entries.downloadManager.label",
    descriptionKey: "entries.downloadManager.description"
  },
  {
    id: "node-readme",
    labelKey: "entries.nodeReadme.label",
    descriptionKey: "entries.nodeReadme.description"
  },
  {
    id: "workflow-form",
    labelKey: "entries.workflowForm.label",
    descriptionKey: "entries.workflowForm.description"
  },
  {
    id: "workflow-delete",
    labelKey: "entries.workflowDelete.label",
    descriptionKey: "entries.workflowDelete.description"
  },
  {
    id: "provider-onboarding",
    labelKey: "entries.providerOnboarding.label",
    descriptionKey: "entries.providerOnboarding.description",
    viewport: { width: 900, height: 1200 }
  },
  {
    id: "progress-states",
    labelKey: "entries.progressStates.label",
    descriptionKey: "entries.progressStates.description",
    viewport: { width: 1440, height: 1100 }
  },
  {
    id: "model-picker",
    labelKey: "entries.modelPicker.label",
    descriptionKey: "entries.modelPicker.description",
    viewport: { width: 760, height: 720 }
  },
  {
    id: "form-controls",
    labelKey: "entries.formControls.label",
    descriptionKey: "entries.formControls.description"
  },
  ...Object.keys(DIALOG_PREVIEWS).map((id) => ({
    id,
    labelKey: `dialogEntries.${id}`,
    descriptionKey: "entries.dialog.description"
  }))
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FullscreenBox: React.FC<{
  preview: string;
  children: React.ReactNode;
}> = ({ preview, children }) => (
  <Box data-preview={preview} sx={{ width: "100%", minHeight: "100vh" }}>
    <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
  </Box>
);

// A UnifiedModel stub used by the recommended-models preview so we don't depend
// on a backend-supplied list.
const SAMPLE_RECOMMENDED_MODELS: UnifiedModel[] = [
  {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL Base",
    type: "hf.stable_diffusion_xl",
    repo_id: "stabilityai/stable-diffusion-xl-base-1.0",
    description:
      "High-resolution latent text-to-image diffusion model from Stability AI.",
    pipeline_tag: "text-to-image",
    tags: ["stable-diffusion", "text-to-image"],
    downloads: 12_000_000,
    likes: 4500,
    size_on_disk: 6_900_000_000
  },
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1 Schnell",
    type: "hf.flux",
    repo_id: "black-forest-labs/FLUX.1-schnell",
    description:
      "Fast 12B-parameter rectified flow transformer for state-of-the-art image generation.",
    pipeline_tag: "text-to-image",
    tags: ["flux", "text-to-image"],
    downloads: 1_200_000,
    likes: 3200,
    size_on_disk: 24_000_000_000
  },
  {
    id: "openai/whisper-large-v3",
    name: "Whisper Large v3",
    type: "hf.whisper",
    repo_id: "openai/whisper-large-v3",
    description:
      "OpenAI's robust multilingual speech-to-text model. Trained on 5M hours.",
    pipeline_tag: "automatic-speech-recognition",
    tags: ["asr", "speech-to-text"],
    downloads: 8_500_000,
    likes: 2900,
    size_on_disk: 3_100_000_000
  }
];

const SAMPLE_NODE_README: NodeMetadata = {
  title: "Generate Image (Stable Diffusion)",
  description:
    "Generate an image from a text prompt using a Stable Diffusion pipeline.\n\nUse keys: prompt | text | image\n\nThis node loads a Stable Diffusion checkpoint and renders an image at the requested resolution. Adjust the guidance scale to trade prompt fidelity for diversity, and the number of inference steps to trade latency for quality.\n\nUse cases:\n- Concept art and storyboarding\n- Product mock-ups and ad creatives\n- Style exploration",
  namespace: "nodetool.image.generate",
  node_type: "nodetool.image.generate.GenerateImage",
  layout: "default",
  properties: [
    {
      name: "prompt",
      type: { type: "str", optional: false, type_args: [] },
      default: "A cinematic photo of a cat astronaut on the moon",
      title: "Prompt",
      description: "The text description of the image to generate.",
      required: false
    },
    {
      name: "negative_prompt",
      type: { type: "str", optional: false, type_args: [] },
      default: "blurry, low quality",
      title: "Negative prompt",
      description: "Concepts to discourage from the generated image.",
      required: false
    },
    {
      name: "steps",
      type: { type: "int", optional: false, type_args: [] },
      default: 30,
      title: "Steps",
      description: "Number of denoising steps. Higher = better but slower.",
      required: false
    },
    {
      name: "guidance_scale",
      type: { type: "float", optional: false, type_args: [] },
      default: 7.5,
      title: "Guidance scale",
      description: "Strength of prompt conditioning.",
      required: false
    }
  ],
  outputs: [
    {
      name: "image",
      type: { type: "image", optional: false, type_args: [] },
      stream: false
    }
  ],
  recommended_models: SAMPLE_RECOMMENDED_MODELS,
  inline_fields: ["prompt", "steps"],
  required_settings: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false
};

const SAMPLE_DATAFRAME: DataframeRef = {
  type: "dataframe",
  uri: "",
  columns: [
    { name: "id", data_type: "int", description: "Row id" },
    { name: "product", data_type: "string", description: "Product name" },
    { name: "category", data_type: "string", description: "Category" },
    { name: "price", data_type: "float", description: "Price (USD)" },
    { name: "in_stock", data_type: "bool", description: "Availability" }
  ],
  data: [
    [1, "Hooded Sweatshirt", "Apparel", 49.99, true],
    [2, "Wireless Headphones", "Electronics", 129.0, true],
    [3, "Ceramic Mug", "Home", 14.5, false],
    [4, "Notebook (A5)", "Stationery", 8.75, true],
    [5, "Yoga Mat", "Fitness", 35.0, true],
    [6, "Espresso Machine", "Kitchen", 219.0, false],
    [7, "Bluetooth Speaker", "Electronics", 89.99, true],
    [8, "Travel Backpack", "Apparel", 75.5, true]
  ]
};

const SAMPLE_PROMPT = `You are a senior copywriter at {{ company }}.

Write a {{ tone }} product description for {{ product_name }}, aimed at {{ audience }}.
Keep it under {{ max_words }} words and lead with the single most compelling benefit.

Highlight these points:
- {benefit_1}
- {benefit_2}

End with a clear, friendly call to action.`;

const SAMPLE_WORKFLOW: Workflow = {
  id: "wf-preview-stub",
  user_id: "1",
  name: "Story Generator",
  description: "Generate a short illustrated story from a topic and a style.",
  tags: ["agent", "text"],
  thumbnail: null,
  thumbnail_url: null,
  graph: { nodes: [], edges: [] },
  settings: null,
  package_name: null,
  path: null,
  run_mode: "workflow",
  workspace_id: null,
  html_app: null,
  access: "private",
  created_at: "2024-09-01T09:00:00Z",
  updated_at: "2024-09-15T14:33:00Z"
};

// Two public placeholder images keep the comparer working without backend
// assets — chosen for visual contrast so the slider position is obvious.
const SAMPLE_IMAGE_A =
  "https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=900&q=80&auto=format&fit=crop";
const SAMPLE_IMAGE_B =
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&q=80&auto=format&fit=crop";

// ─── Individual preview renderers ─────────────────────────────────────────────

const PreviewCosts: React.FC = () => (
  <Box data-preview="costs" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<LoadingSpinner />}>
      <CostsDashboard />
    </Suspense>
  </Box>
);

const PreviewModels: React.FC = () => (
  <FullscreenBox preview="models">
    <ModelListIndex />
  </FullscreenBox>
);

const PreviewModelOnboarding: React.FC = () => {
  const theme = useTheme();
  const setSource = useModelManagerStore((s) => s.setSource);
  const setStats = useSystemStatsStore((s) => s.setStats);
  useEffect(() => {
    // Drive the manager to the "Get Started" tab and seed plausible hardware so
    // the hardware card and fit badges render without a live backend.
    setSource("onboarding");
    setStats({
      cpu_percent: 12,
      memory_percent: 38,
      memory_total_gb: 32,
      memory_used_gb: 12,
      vram_total_gb: 16,
      vram_used_gb: 3,
      vram_percent: 18
    });
  }, [setSource, setStats]);
  return (
    <Box
      data-preview="model-onboarding"
      sx={{
        width: "100%",
        minHeight: "100vh",
        p: SPACING.xl,
        bgcolor: theme.vars.palette.background.default,
        color: theme.vars.palette.text.primary
      }}
    >
      <Suspense fallback={<LoadingSpinner />}>
        <ModelOnboarding onDownload={() => undefined} />
      </Suspense>
    </Box>
  );
};

const PreviewAssets: React.FC = () => (
  <FullscreenBox preview="assets">
    <AssetExplorer />
  </FullscreenBox>
);

const PreviewConfirmDialog: React.FC = () => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_14" });
  return (
    <Box data-preview="confirm-dialog" sx={{ width: "100%", height: "100vh" }}>
      <Suspense fallback={null}>
        <ConfirmDialog
          open
          onClose={() => undefined}
          onConfirm={() => undefined}
          title={t("confirmDialog.title")}
          content={t("confirmDialog.content")}
          confirmText={t("confirmDialog.delete")}
          cancelText={t("confirmDialog.cancel")}
          destructive
        />
      </Suspense>
    </Box>
  );
};

const PreviewColorPicker: React.FC = () => (
  <Box data-preview="color-picker" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <ColorPickerModal
        color="#7c5cff"
        alpha={1}
        onChange={() => undefined}
        onClose={() => undefined}
      />
    </Suspense>
  </Box>
);

const PreviewTextEditor: React.FC = () => (
  <Box data-preview="text-editor" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <TextEditorModal
        value={SAMPLE_PROMPT}
        onChange={() => undefined}
        onClose={() => undefined}
        propertyName="prompt"
        propertyDescription="Instruction prompt sent to the language model"
        propertyType="str"
        nodeType="nodetool.text.TextGeneration"
        language="plaintext"
      />
    </Suspense>
  </Box>
);

const PreviewDataframeEditor: React.FC = () => (
  <Box data-preview="dataframe-editor" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <DataframeEditorModal
        value={SAMPLE_DATAFRAME}
        onChange={() => undefined}
        onClose={() => undefined}
        propertyName="catalog"
        propertyDescription="Sample product catalog"
      />
    </Suspense>
  </Box>
);

const PreviewImageCompare: React.FC = () => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_14" });
  return (
    <Box
      data-preview="image-compare"
      sx={{ width: "100%", height: "100vh", position: "relative" }}
    >
      <Suspense fallback={<LoadingSpinner />}>
        <ImageComparer
          imageA={SAMPLE_IMAGE_A}
          imageB={SAMPLE_IMAGE_B}
          labelA={t("imageCompare.before")}
          labelB={t("imageCompare.after")}
        />
      </Suspense>
    </Box>
  );
};

const PreviewRecommendedModels: React.FC = () => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_14" });
  const theme = useTheme();
  return (
    <Box
      data-preview="recommended-models"
      sx={{
        width: "100%",
        minHeight: "100vh",
        p: SPACING.xl,
        bgcolor: theme.vars.palette.background.paper
      }}
    >
      <Text size="big" weight={600} sx={{ mb: SPACING.xs, display: "block" }}>
        {t("recommendedModels.title")}
      </Text>
      <Text
        size="small"
        color="secondary"
        sx={{ mb: SPACING.lg, display: "block" }}
      >
        {t("recommendedModels.description")}
      </Text>
      <Suspense fallback={<LoadingSpinner />}>
        <RecommendedModels
          recommendedModels={SAMPLE_RECOMMENDED_MODELS}
          startDownload={() => undefined}
        />
      </Suspense>
    </Box>
  );
};

const PreviewDeleteModel: React.FC = () => (
  <Box data-preview="delete-model" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <DeleteModelDialog
        modelId="stabilityai/stable-diffusion-xl-base-1.0"
        onClose={() => undefined}
      />
    </Suspense>
  </Box>
);

const PreviewDownloadManager: React.FC = () => {
  const openDialog = useModelDownloadStore((s) => s.openDialog);
  useEffect(() => {
    openDialog();
  }, [openDialog]);
  return (
    <Box
      data-preview="download-manager"
      sx={{ width: "100%", height: "100vh" }}
    >
      <Suspense fallback={null}>
        <DownloadManagerDialog />
      </Suspense>
    </Box>
  );
};

const PreviewNodeReadme: React.FC = () => {
  const theme = useTheme();
  // Prefer real metadata from the store if it has loaded — otherwise fall back
  // to the bundled sample so the preview always renders meaningful content.
  const metadata = useMetadataStore((s) => s.metadata);
  const sample = useMemo(() => {
    const candidate =
      metadata?.["nodetool.agents.Agent"] ??
      metadata?.["nodetool.input.StringInput"] ??
      Object.values(metadata ?? {})[0];
    return candidate ?? SAMPLE_NODE_README;
  }, [metadata]);

  return (
    <Box
      data-preview="node-readme"
      sx={{
        width: "100%",
        minHeight: "100vh",
        p: SPACING.xl,
        bgcolor: theme.vars.palette.background.default
      }}
    >
      <Box
        sx={{
          maxWidth: 720,
          mx: "auto",
          bgcolor: theme.vars.palette.background.paper,
          borderRadius: BORDER_RADIUS.xs,
          border: `1px solid ${theme.vars.palette.divider}`,
          overflow: "hidden"
        }}
      >
        <Suspense fallback={<LoadingSpinner />}>
          <NodeInfo nodeMetadata={sample} showConnections={true} />
        </Suspense>
      </Box>
    </Box>
  );
};

const PreviewWorkflowForm: React.FC = () => (
  <Box data-preview="workflow-form" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <WorkflowFormModal
        open
        onClose={() => undefined}
        workflow={SAMPLE_WORKFLOW}
        availableTags={["agent", "image", "audio", "rag", "demo"]}
      />
    </Suspense>
  </Box>
);

const PreviewWorkflowDelete: React.FC = () => (
  <Box data-preview="workflow-delete" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <WorkflowDeleteDialog
        open
        onClose={() => undefined}
        workflowsToDelete={[SAMPLE_WORKFLOW]}
      />
    </Suspense>
  </Box>
);

const PreviewProviderOnboarding: React.FC = () => {
  const show = useProviderOnboardingStore((s) => s.show);
  useEffect(() => {
    show({ capability: "generate_message" });
  }, [show]);
  return (
    <Box
      data-preview="provider-onboarding"
      sx={{ width: "100%", height: "100vh" }}
    >
      <Suspense fallback={null}>
        <ProviderOnboardingDialog />
      </Suspense>
    </Box>
  );
};

// The CONTROL height contract, side by side: a TextInput and a SelectField at
// each size (and each Select variant) must render at exactly the same height.
// The visual suite measures what jsdom cannot.
const PreviewFormControls: React.FC = () => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_14" });
  const options = [
    { value: "widescreen", label: t("formControls.widescreen") },
    { value: "square", label: t("formControls.square") }
  ];
  return (
    <Box data-preview="form-controls" sx={{ width: 560, p: SPACING.xl }}>
      <Panel padding="normal">
        <FlexColumn gap={SPACING.lg}>
          <FlexRow gap={SPACING.md} align="flex-end">
            <TextInput
              label={t("formControls.mediumText")}
              placeholder="36px"
            />
            <SelectField
              label={t("formControls.mediumOutlined")}
              variant="outlined"
              value="widescreen"
              onChange={() => undefined}
              options={options}
            />
            <SelectField
              label={t("formControls.mediumStandard")}
              variant="standard"
              value="widescreen"
              onChange={() => undefined}
              options={options}
            />
          </FlexRow>
          <FlexRow gap={SPACING.md} align="flex-end">
            <TextInput
              label={t("formControls.smallText")}
              placeholder="28px"
              compact
            />
            <SelectField
              label={t("formControls.smallOutlined")}
              variant="outlined"
              size="small"
              value="square"
              onChange={() => undefined}
              options={options}
            />
            <SelectField
              label={t("formControls.smallStandard")}
              variant="standard"
              size="small"
              value="square"
              onChange={() => undefined}
              options={options}
            />
          </FlexRow>
        </FlexColumn>
      </Panel>
    </Box>
  );
};

// ─── Preview index page ────────────────────────────────────────────────────────

const PreviewIndex: React.FC = () => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_14" });
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: SPACING.xl,
        bgcolor: theme.vars.palette.background.default,
        minHeight: "100vh"
      }}
    >
      <Text size="big" weight={600} sx={{ mb: SPACING.xs, display: "block" }}>
        {t("index.title")}
      </Text>
      <Text
        size="small"
        color="secondary"
        sx={{ mb: SPACING.xl, display: "block" }}
      >
        {t("index.description")} <Code>/preview/:id</Code>{" "}
        {t("index.routeHelp")}
      </Text>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: SPACING.md
        }}
      >
        {PREVIEWS.map((p) => (
          <Link
            key={p.id}
            to={`/preview/${p.id}`}
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "block"
            }}
          >
            <Surface
              elevation={0}
              sx={{
                p: SPACING.lg,
                border: `1px solid ${theme.vars.palette.divider}`,
                "&:hover": {
                  borderColor: theme.vars.palette.primary.main,
                  boxShadow: `0 0 0 2px rgb(${theme.vars.palette.primary.mainChannel} / 0.13)`
                },
                transition: `${MOTION.border}, ${MOTION.shadow}`
              }}
            >
              <Text
                size="normal"
                weight={600}
                sx={{ mb: SPACING.micro, display: "block" }}
              >
                {t(p.labelKey)}
              </Text>
              <Text
                size="small"
                color="secondary"
                sx={{ mb: SPACING.xs, display: "block" }}
              >
                {t(p.descriptionKey)}
              </Text>
              {p.viewport && (
                <Caption sx={{ color: "text.disabled" }}>
                  {p.viewport.width} × {p.viewport.height}
                </Caption>
              )}
            </Surface>
          </Link>
        ))}
      </Box>

      <Box sx={{ mt: SPACING.xxl }}>
        <Text size="small" color="secondary">
          <strong>{t("index.playwrightUsage")}</strong>
          <br />
          <code>
            npx playwright test tests/benchmarks/screenshots.spec.ts
            --project=chromium
          </code>
        </Text>
      </Box>
    </Box>
  );
};

// ─── Router component ──────────────────────────────────────────────────────────

const COMPONENT_MAP: Record<string, React.FC> = {
  costs: PreviewCosts,
  models: PreviewModels,
  "model-onboarding": PreviewModelOnboarding,
  assets: PreviewAssets,
  "confirm-dialog": PreviewConfirmDialog,
  "color-picker": PreviewColorPicker,
  "text-editor": PreviewTextEditor,
  "dataframe-editor": PreviewDataframeEditor,
  "image-compare": PreviewImageCompare,
  "recommended-models": PreviewRecommendedModels,
  "delete-model": PreviewDeleteModel,
  "download-manager": PreviewDownloadManager,
  "node-readme": PreviewNodeReadme,
  "workflow-form": PreviewWorkflowForm,
  "workflow-delete": PreviewWorkflowDelete,
  "provider-onboarding": PreviewProviderOnboarding,
  "form-controls": PreviewFormControls,
  "progress-states": PreviewProgressStates,
  "model-picker": PreviewModelPicker,
  ...Object.fromEntries(
    Object.entries(DIALOG_PREVIEWS).map(([id, { component }]) => [
      id,
      component
    ])
  )
};

const ComponentPreview: React.FC = () => {
  const { component } = useParams<{ component?: string }>();
  const { t } = useTranslation("translation", { keyPrefix: "batch2_14" });
  const theme = useTheme();

  if (!component) {
    return <PreviewIndex />;
  }

  const PreviewComponent = COMPONENT_MAP[component];

  if (!PreviewComponent) {
    return (
      <Box
        sx={{
          p: SPACING.xl,
          bgcolor: theme.vars.palette.background.default,
          minHeight: "100vh"
        }}
      >
        <Text
          size="normal"
          weight={600}
          color="error"
          sx={{ mb: SPACING.md, display: "block" }}
        >
          {t("unknownPreview", { component })}
        </Text>
        <Link to="/preview" style={{ textDecoration: "none" }}>
          <Text size="small" color="primary">
            {t("backToIndex")}
          </Text>
        </Link>
      </Box>
    );
  }

  return (
    <Box
      data-preview-root
      sx={{
        width: "100%",
        minHeight: "100vh",
        bgcolor: theme.vars.palette.background.default
      }}
    >
      <PreviewComponent />
    </Box>
  );
};

export default ComponentPreview;
