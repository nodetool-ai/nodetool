import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { BORDER_RADIUS } from "../components/ui_primitives/tokens";

const RadiusScale = () => (
  <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 720 }}>
    {Object.entries(BORDER_RADIUS).map(([token, value]) => (
      <Box
        key={token}
        sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
      >
        <Box
          sx={{
            width: 88,
            height: 88,
            borderRadius: value,
            backgroundColor: "var(--palette-primary-main)",
            border: "1px solid var(--palette-divider)"
          }}
        />
        <Box sx={{ fontFamily: "var(--fontFamily2)", fontSize: "var(--fontSizeSmall)" }}>
          {token}
        </Box>
        <Box
          sx={{
            fontFamily: "var(--fontFamily2)",
            fontSize: "var(--fontSizeSmaller)",
            opacity: 0.6
          }}
        >
          {value}
        </Box>
      </Box>
    ))}
  </Box>
);

const meta = {
  title: "Design Tokens/Border Radius",
  component: RadiusScale,
  parameters: { layout: "padded" }
} satisfies Meta<typeof RadiusScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {};
