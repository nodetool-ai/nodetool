import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { MOTION } from "../components/ui_primitives/tokens";

/**
 * Motion timing tokens. Snapshots freeze animation by default (see the Motion
 * toolbar), so this page documents the durations rather than animating them.
 */
const MotionTokens = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 640 }}>
    {Object.entries(MOTION).map(([token, value]) => (
      <Box
        key={token}
        sx={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: 2,
          py: 1,
          borderBottom: "1px solid var(--palette-divider)"
        }}
      >
        <Box sx={{ fontFamily: "var(--fontFamily2)", fontSize: "var(--fontSizeSmall)" }}>
          {token}
        </Box>
        <Box
          sx={{
            fontFamily: "var(--fontFamily2)",
            fontSize: "var(--fontSizeSmall)",
            opacity: 0.7
          }}
        >
          {value}
        </Box>
      </Box>
    ))}
  </Box>
);

const meta = {
  title: "Design Tokens/Motion",
  component: MotionTokens,
  parameters: { layout: "padded" }
} satisfies Meta<typeof MotionTokens>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Timings: Story = {};
