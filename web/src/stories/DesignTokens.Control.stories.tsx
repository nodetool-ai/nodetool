import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { CONTROL } from "../components/ui_primitives/tokens";

const HEIGHT_ROLES: Record<keyof typeof CONTROL.height, string> = {
  xs: "toolbar buttons",
  sm: "node-canvas controls",
  md: "inspector controls",
  lg: "form controls",
  xl: "touch targets"
};

const ControlScale = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 720 }}>
    <Box sx={{ display: "flex", gap: 3, alignItems: "flex-end", flexWrap: "wrap" }}>
      {Object.entries(CONTROL.height).map(([token, height]) => (
        <Box
          key={token}
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
        >
          <Box
            sx={{
              width: 120,
              height,
              borderRadius: CONTROL.radius,
              backgroundColor: "var(--palette-Paper-overlay)",
              border: "1px solid var(--palette-divider)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--fontFamily2)",
              fontSize: "var(--fontSizeSmall)"
            }}
          >
            {height}px
          </Box>
          <Box sx={{ fontFamily: "var(--fontFamily2)", fontSize: "var(--fontSizeSmall)" }}>
            {token}
          </Box>
          <Box
            sx={{
              fontFamily: "var(--fontFamily2)",
              fontSize: "var(--fontSizeSmaller)",
              opacity: 0.6,
              textAlign: "center"
            }}
          >
            {HEIGHT_ROLES[token as keyof typeof CONTROL.height]}
          </Box>
        </Box>
      ))}
    </Box>
    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {Object.entries(CONTROL.paddingX).map(([token, padding]) => (
        <Box
          key={token}
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
        >
          <Box
            sx={{
              height: CONTROL.height.lg,
              borderRadius: CONTROL.radius,
              border: "1px solid var(--palette-divider)",
              display: "flex",
              alignItems: "center",
              paddingLeft: `${padding}px`,
              paddingRight: `${padding}px`,
              fontFamily: "var(--fontFamily2)",
              fontSize: "var(--fontSizeSmall)"
            }}
          >
            <Box sx={{ backgroundColor: "var(--palette-primary-main)", opacity: 0.3 }}>
              paddingX {padding}px
            </Box>
          </Box>
          <Box sx={{ fontFamily: "var(--fontFamily2)", fontSize: "var(--fontSizeSmall)" }}>
            {token}
          </Box>
        </Box>
      ))}
    </Box>
  </Box>
);

const meta = {
  title: "Design Tokens/Control",
  component: ControlScale,
  parameters: { layout: "padded" }
} satisfies Meta<typeof ControlScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {};
