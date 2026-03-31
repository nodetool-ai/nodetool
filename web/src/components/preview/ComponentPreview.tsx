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
import { Box, Typography, Paper, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";

const AppHeader = React.lazy(() => import("../panels/AppHeader"));
const ModelListIndex = React.lazy(
  () => import("../hugging_face/model_list/ModelListIndex")
);
const AssetExplorer = React.lazy(() => import("../assets/AssetExplorer"));
const Portal = React.lazy(() => import("../portal/Portal"));

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
    id: "assets",
    label: "Asset Explorer",
    description: "Asset browser and file manager",
    viewport: { width: 1920, height: 1080 }
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
      <Suspense fallback={<CircularProgress size={20} />}>
        <AppHeader />
      </Suspense>
    </Box>
  );
};

const PreviewDashboard: React.FC = () => (
  <Box data-preview="dashboard" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<CircularProgress />}>
      <Portal />
    </Suspense>
  </Box>
);

const PreviewModels: React.FC = () => (
  <Box data-preview="models" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<CircularProgress />}>
      <ModelListIndex />
    </Suspense>
  </Box>
);

const PreviewAssets: React.FC = () => (
  <Box data-preview="assets" sx={{ width: "100%", height: "100vh" }}>
    <Suspense fallback={<CircularProgress />}>
      <AssetExplorer />
    </Suspense>
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
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
        Component Previews
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Isolated component views for documentation screenshots. Navigate to{" "}
        <code>/preview/:id</code> to render a component in isolation.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 2
        }}
      >
        {PREVIEWS.map((p) => (
          <Paper
            key={p.id}
            component={Link}
            to={`/preview/${p.id}`}
            sx={{
              p: 3,
              textDecoration: "none",
              color: "text.primary",
              border: `1px solid ${theme.palette.divider}`,
              "&:hover": {
                borderColor: theme.palette.primary.main,
                boxShadow: `0 0 0 2px ${theme.palette.primary.main}22`
              },
              transition: "border-color 0.15s, box-shadow 0.15s"
            }}
          >
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              {p.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {p.description}
            </Typography>
            {p.viewport && (
              <Typography variant="caption" color="text.disabled">
                {p.viewport.width} × {p.viewport.height}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>

      <Box sx={{ mt: 6 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Playwright screenshot usage:</strong>
          <br />
          <code>
            npx playwright test tests/benchmarks/screenshots.spec.ts
            --project=chromium
          </code>
        </Typography>
      </Box>
    </Box>
  );
};

// ─── Router component ──────────────────────────────────────────────────────────

const COMPONENT_MAP: Record<string, React.FC> = {
  "app-header": PreviewAppHeader,
  dashboard: PreviewDashboard,
  models: PreviewModels,
  assets: PreviewAssets
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
        <Typography variant="h5" color="error" sx={{ mb: 2 }}>
          Unknown preview: &ldquo;{component}&rdquo;
        </Typography>
        <Typography
          component={Link}
          to="/preview"
          sx={{ color: theme.palette.primary.main }}
        >
          ← Back to preview index
        </Typography>
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
