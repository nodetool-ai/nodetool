import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { SPACING } from "../components/ui_primitives/spacing";

/** The canonical 4px-grid spacing steps (plus the 2px micro step). */
const CANONICAL = [
  "none",
  "micro",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "xxl",
  "xxxl"
] as const;

const SpacingScale = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, maxWidth: 640 }}>
    {CANONICAL.map((token) => {
      const units = SPACING[token];
      const px = units * 4;
      return (
        <Box key={token} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 120,
              fontFamily: "var(--fontFamily2)",
              fontSize: "var(--fontSizeSmall)"
            }}
          >
            {token}
          </Box>
          <Box
            sx={{
              width: 64,
              fontFamily: "var(--fontFamily2)",
              fontSize: "var(--fontSizeSmaller)",
              opacity: 0.6
            }}
          >
            {px}px
          </Box>
          <Box
            sx={{
              height: 16,
              width: `${px}px`,
              minWidth: 2,
              backgroundColor: "var(--palette-primary-main)",
              borderRadius: "var(--rounded-xs)"
            }}
          />
        </Box>
      );
    })}
  </Box>
);

const meta = {
  title: "Design Tokens/Spacing",
  component: SpacingScale,
  parameters: { layout: "padded" }
} satisfies Meta<typeof SpacingScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {};
