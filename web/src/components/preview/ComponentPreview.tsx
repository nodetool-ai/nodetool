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
import { useParams, Link } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import {
  Text,
  Caption,
  LoadingSpinner,
  Surface,
  Box,
  FlexColumn,
  FlexRow,
  Panel,
  TextInput,
  SelectField,
  MOTION,
  BORDER_RADIUS
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

const CostsDashboard = React.lazy(() => import("../costs/CostsDashboard"));
const ModelListIndex = React.lazy(
  () => import("../hugging_face/model_list/ModelListIndex")
);
const AssetExplorer = React.lazy(() => import("../assets/AssetExplorer"));
const Portal = React.lazy(() => import("../portal/Portal"));
const ConfirmDialog = React.lazy(() => import("../dialogs/ConfirmDialog"));
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

interface PreviewEntry {
  id: string;
  label: string;
  description: string;
  viewport?: { width: number; height: number };
}

const PREVIEWS: PreviewEntry[] = [
  {
    id: "app-header",
    label: "App Header",
    description: "The global navigation header bar",
    viewport: { width: 1920, height: 80 }
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Main dashboard / portal page",
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: "costs",
    label: "Costs Dashboard",
    description: "Spend analytics: stat cards, stacked bar chart and table",
    viewport: { width: 1500, height: 1080 }
  },
  {
    id: "models",
    label: "Models Manager",
    description: "Model list and download manager",
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: "model-onboarding",
    label: "Model Onboarding",
    description: "Hardware-aware 'Get Started' guide for local models",
    viewport: { width: 1440, height: 1080 }
  },
  {
    id: "assets",
    label: "Asset Explorer",
    description: "Asset browser and file manager",
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: "confirm-dialog",
    label: "Confirm Dialog",
    description: "Generic confirm prompt"
  },
  {
    id: "color-picker",
    label: "Color Picker Modal",
    description: "Rich color picker with harmony, swatches and gradient"
  },
  {
    id: "text-editor",
    label: "Text / Code Editor Modal",
    description: "Expanded editor for long string properties"
  },
  {
    id: "dataframe-editor",
    label: "DataFrame Editor Modal",
    description: "Spreadsheet-style editor for tabular properties"
  },
  {
    id: "image-compare",
    label: "Image Compare",
    description: "Side-by-side comparison of two images"
  },
  {
    id: "recommended-models",
    label: "Recommended Models",
    description: "Recommended-models picker shown for missing models"
  },
  {
    id: "delete-model",
    label: "Delete Model Confirmation",
    description: "Safety prompt before removing a model"
  },
  {
    id: "download-manager",
    label: "Download Manager",
    description: "Track, retry and pause model downloads"
  },
  {
    id: "node-readme",
    label: "Node README / Help",
    description: "In-app documentation for a single node"
  },
  {
    id: "workflow-form",
    label: "Workflow Form",
    description: "Edit workflow metadata"
  },
  {
    id: "workflow-delete",
    label: "Workflow Delete Confirmation",
    description: "Safe-delete prompt for workflows"
  }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FullscreenBox: React.FC<{
  preview: string;
  children: React.ReactNode;
}> = ({ preview, children }) => (
  <Box
    data-preview={preview}
    sx={{ width: "100%", minHeight: "100vh" }}
  >
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
  description:
    "Generate a short illustrated story from a topic and a style.",
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

const PreviewDashboard: React.FC = () => (
  <FullscreenBox preview="dashboard">
    <Portal />
  </FullscreenBox>
);

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
        p: 4,
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

const PreviewConfirmDialog: React.FC = () => (
  <Box data-preview="confirm-dialog" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={null}>
      <ConfirmDialog
        open
        onClose={() => undefined}
        onConfirm={() => undefined}
        title="Delete this workflow?"
        content="This action cannot be undone. The workflow and its run history will be removed from the workspace."
        confirmText="Delete"
        cancelText="Cancel"
      />
    </Suspense>
  </Box>
);

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

const PreviewImageCompare: React.FC = () => (
  <Box
    data-preview="image-compare"
    sx={{ width: "100%", height: "100vh", position: "relative" }}
  >
    <Suspense fallback={<LoadingSpinner />}>
      <ImageComparer
        imageA={SAMPLE_IMAGE_A}
        imageB={SAMPLE_IMAGE_B}
        labelA="Before"
        labelB="After"
      />
    </Suspense>
  </Box>
);

const PreviewRecommendedModels: React.FC = () => {
  const theme = useTheme();
  return (
    <Box
      data-preview="recommended-models"
      sx={{
        width: "100%",
        minHeight: "100vh",
        p: 4,
        bgcolor: theme.palette.background.paper
      }}
    >
      <Text size="big" weight={600} sx={{ mb: 1, display: "block" }}>
        Recommended Models
      </Text>
      <Text size="small" color="secondary" sx={{ mb: 3, display: "block" }}>
        These models are recommended for the selected node.
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
    <Box data-preview="download-manager" sx={{ width: "100%", height: "100vh" }}>
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
        p: 4,
        bgcolor: theme.palette.background.default
      }}
    >
      <Box
        sx={{
          maxWidth: 720,
          mx: "auto",
          bgcolor: theme.palette.background.paper,
          borderRadius: BORDER_RADIUS.xs,
          border: `1px solid ${theme.palette.divider}`,
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

const FORM_CONTROL_OPTIONS = [
  { value: "widescreen", label: "16:9 — Widescreen" },
  { value: "square", label: "1:1 — Square" }
] as const;

// The CONTROL height contract, side by side: a TextInput and a SelectField at
// each size (and each Select variant) must render at exactly the same height.
// The visual suite measures what jsdom cannot.
const PreviewFormControls: React.FC = () => (
  <Box data-preview="form-controls" sx={{ width: 560, p: 4 }}>
    <Panel padding="normal">
      <FlexColumn gap={3}>
        <FlexRow gap={2} align="flex-end">
          <TextInput label="Medium text" placeholder="36px" />
          <SelectField
            label="Medium outlined"
            variant="outlined"
            value="widescreen"
            onChange={() => undefined}
            options={FORM_CONTROL_OPTIONS}
          />
          <SelectField
            label="Medium standard"
            variant="standard"
            value="widescreen"
            onChange={() => undefined}
            options={FORM_CONTROL_OPTIONS}
          />
        </FlexRow>
        <FlexRow gap={2} align="flex-end">
          <TextInput label="Small text" placeholder="28px" compact />
          <SelectField
            label="Small outlined"
            variant="outlined"
            size="small"
            value="square"
            onChange={() => undefined}
            options={FORM_CONTROL_OPTIONS}
          />
          <SelectField
            label="Small standard"
            variant="standard"
            size="small"
            value="square"
            onChange={() => undefined}
            options={FORM_CONTROL_OPTIONS}
          />
        </FlexRow>
      </FlexColumn>
    </Panel>
  </Box>
);

// ─── Preview index page ────────────────────────────────────────────────────────

const PreviewIndex: React.FC = () => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 4,
        bgcolor: theme.palette.background.default,
        minHeight: "100vh"
      }}
    >
      <Text size="big" weight={600} sx={{ mb: 1, display: "block" }}>
        Component Previews
      </Text>
      <Text size="small" color="secondary" sx={{ mb: 4, display: "block" }}>
        Isolated component views for documentation screenshots. Navigate to{" "}
        <code>/preview/:id</code> to render a component in isolation.
      </Text>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 2
        }}
      >
        {PREVIEWS.map((p) => (
          <Link
            key={p.id}
            to={`/preview/${p.id}`}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <Surface
              elevation={0}
              sx={{
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                  boxShadow: `0 0 0 2px ${theme.palette.primary.main}22`
                },
                transition: `${MOTION.border}, ${MOTION.shadow}`
              }}
            >
              <Text size="normal" weight={600} sx={{ mb: 0.5, display: "block" }}>
                {p.label}
              </Text>
              <Text size="small" color="secondary" sx={{ mb: 1, display: "block" }}>
                {p.description}
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

      <Box sx={{ mt: 6 }}>
        <Text size="small" color="secondary">
          <strong>Playwright screenshot usage:</strong>
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
  dashboard: PreviewDashboard,
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
  "form-controls": PreviewFormControls
};

const ComponentPreview: React.FC = () => {
  const { component } = useParams<{ component?: string }>();
  const theme = useTheme();

  if (!component) {
    return <PreviewIndex />;
  }

  const PreviewComponent = COMPONENT_MAP[component];

  if (!PreviewComponent) {
    return (
      <Box
        sx={{
          p: 4,
          bgcolor: theme.palette.background.default,
          minHeight: "100vh"
        }}
      >
        <Text size="normal" weight={600} color="error" sx={{ mb: 2, display: "block" }}>
          Unknown preview: &ldquo;{component}&rdquo;
        </Text>
        <Link to="/preview" style={{ textDecoration: "none" }}>
          <Text size="small" color="primary">
            ← Back to preview index
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
        bgcolor: theme.palette.background.default
      }}
    >
      <PreviewComponent />
    </Box>
  );
};

export default ComponentPreview;
