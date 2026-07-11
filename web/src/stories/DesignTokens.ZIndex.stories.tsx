import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { Z_INDEX } from "../components/ui_primitives/tokens";

const ZIndexScale = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 480 }}>
    {Object.entries(Z_INDEX).map(([token, value]) => (
      <Box
        key={token}
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 2,
          py: 1.5,
          borderRadius: "var(--rounded-md)",
          backgroundColor: "var(--palette-background-paper)",
          border: "1px solid var(--palette-divider)"
        }}
      >
        <Box sx={{ fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmall)" }}>
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
  title: "Design Tokens/Z-Index",
  component: ZIndexScale,
  parameters: { layout: "padded" }
} satisfies Meta<typeof ZIndexScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Layers: Story = {};
