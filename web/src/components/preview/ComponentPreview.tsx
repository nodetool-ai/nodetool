/** @jsxImportSource @emotion/react */
/**
 * ComponentPreview - Isolated component viewer for documentation screenshots.
 *
 * Available at /preview/:component (localhost only)
 *
 * Renders individual UI components in isolation so Playwright can capture
 * zoomed-in, focused screenshots for documentation without needing the full
 * application context.
 *
 * Usage:
 *   /preview                  - Shows the index of all available previews
 *   /preview/app-header       - The application header bar
 *   /preview/node-menu        - The node search / add-node popup
 *   /preview/chat-composer    - The chat input composer
 *   /preview/model-card       - A single model card
 *   /preview/dashboard-card   - A workflow dashboard card
 *   /preview/settings         - The settings dialog
 */

import React, { Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Text, Caption, LoadingSpinner, Surface } from "../ui_primitives";

const AppHeader = React.lazy(() => import("../panels/AppHeader"));
const ModelListIndex = React.lazy(
  () => import("../hugging_face/model_list/ModelListIndex")
);
const AssetExplorer = React.lazy(() => import("../assets/AssetExplorer"));
const Portal = React.lazy(() => import("../portal/Portal"));
const ChartRenderer = React.lazy(() => import("../node/output/ChartRenderer"));

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
    id: "models",
    label: "Models Manager",
    description: "Model list and download manager",
    viewport: { width: 1920, height: 1080 }
  },
  {
    id: "chart-renderer",
    label: "Chart Renderer",
    description: "Chart.js output renderer with sample line, bar, scatter charts",
    viewport: { width: 1200, height: 900 }
  }
];

// ─── Individual preview renderers ─────────────────────────────────────────────

const PreviewAppHeader: React.FC = () => {
  const theme = useTheme();
  return (
    <Box
      data-preview="app-header"
      sx={{ width: "100%", bgcolor: theme.palette.background.default }}
    >
      <Suspense fallback={<LoadingSpinner size="small" />}>
        <AppHeader />
      </Suspense>
    </Box>
  );
};

const PreviewDashboard: React.FC = () => (
  <Box data-preview="dashboard" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<LoadingSpinner />}>
      <Portal />
    </Suspense>
  </Box>
);

const PreviewModels: React.FC = () => (
  <Box data-preview="models" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<LoadingSpinner />}>
      <ModelListIndex />
    </Suspense>
  </Box>
);

const PreviewAssets: React.FC = () => (
  <Box data-preview="assets" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<LoadingSpinner />}>
      <AssetExplorer />
    </Suspense>
  </Box>
);

// ─── Sample chart configs ──────────────────────────────────────────────────────

const LINE_CONFIG = {
  title: "Monthly Revenue",
  x_label: "Month",
  y_label: "Revenue ($)",
  legend: true,
  data: {
    series: [
      {
        type: "line",
        label: "Product A",
        x: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        y: [12000, 19000, 14000, 22000, 18000, 25000]
      },
      {
        type: "line",
        label: "Product B",
        x: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        y: [8000, 11000, 9500, 14000, 13000, 17000]
      }
    ]
  }
};

const BAR_CONFIG = {
  title: "Quarterly Sales by Region",
  x_label: "Quarter",
  y_label: "Units Sold",
  legend: true,
  data: {
    series: [
      {
        type: "bar",
        label: "North",
        x: ["Q1", "Q2", "Q3", "Q4"],
        y: [340, 420, 390, 510]
      },
      {
        type: "bar",
        label: "South",
        x: ["Q1", "Q2", "Q3", "Q4"],
        y: [280, 310, 350, 400]
      },
      {
        type: "bar",
        label: "West",
        x: ["Q1", "Q2", "Q3", "Q4"],
        y: [190, 240, 210, 280]
      }
    ]
  }
};

const PIE_CONFIG = {
  title: "Market Share",
  legend: true,
  data: {
    series: [
      {
        type: "pie",
        labels: ["Alpha", "Beta", "Gamma", "Delta", "Other"],
        values: [38, 27, 18, 11, 6]
      }
    ]
  }
};

const MIXED_CONFIG = {
  title: "Visitors vs Conversions",
  x_label: "Week",
  y_label: "Count",
  legend: true,
  data: {
    series: [
      {
        type: "bar",
        label: "Visitors",
        x: ["W1", "W2", "W3", "W4", "W5", "W6"],
        y: [1200, 1500, 1350, 1700, 1600, 1900]
      },
      {
        type: "line",
        label: "Conversions",
        x: ["W1", "W2", "W3", "W4", "W5", "W6"],
        y: [84, 110, 95, 130, 122, 148]
      }
    ]
  }
};

const PreviewChartRenderer: React.FC = () => {
  const theme = useTheme();
  const configs = [
    { key: "line", config: LINE_CONFIG },
    { key: "bar", config: BAR_CONFIG },
    { key: "pie", config: PIE_CONFIG },
    { key: "mixed", config: MIXED_CONFIG }
  ];
  return (
    <Box
      data-preview="chart-renderer"
      sx={{
        p: 3,
        bgcolor: theme.palette.background.default,
        minHeight: "100vh"
      }}
    >
      <Text size="big" weight={700} sx={{ mb: 3 }}>
        Chart Renderer — Chart.js Output
      </Text>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 3
        }}
      >
        {configs.map(({ key, config }) => (
          <Box
            key={key}
            sx={{
              height: 320,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: theme.palette.background.paper,
              p: 1
            }}
          >
            <Suspense fallback={<LoadingSpinner size="small" />}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ChartRenderer config={config as any} />
            </Suspense>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

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
      <Text size="big" weight={700} sx={{ mb: 1 }}>
        Component Previews
      </Text>
      <Text size="small" color="secondary" sx={{ mb: 4 }}>
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
                transition: "border-color 0.15s, box-shadow 0.15s"
              }}
            >
              <Text size="normal" weight={600} sx={{ mb: 0.5 }}>
                {p.label}
              </Text>
              <Text size="small" color="secondary" sx={{ mb: 1 }}>
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
  "app-header": PreviewAppHeader,
  dashboard: PreviewDashboard,
  models: PreviewModels,
  assets: PreviewAssets,
  "chart-renderer": PreviewChartRenderer
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
        <Text size="normal" weight={600} color="error" sx={{ mb: 2 }}>
          Unknown preview: &ldquo;{component}&rdquo;
        </Text>
        <Link to="/preview" style={{ color: theme.palette.primary.main, textDecoration: "none" }}>
          <Text size="small">
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
