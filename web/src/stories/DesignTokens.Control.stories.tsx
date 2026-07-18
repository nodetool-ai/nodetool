import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, FlexColumn, FlexRow } from "../components/ui_primitives";
import { CONTROL } from "../components/ui_primitives/tokens";

const HEIGHT_ROLES: Record<keyof typeof CONTROL.height, string> = {
  xs: "toolbar buttons",
  sm: "node-canvas controls",
  md: "inspector controls",
  lg: "form controls",
  xl: "touch targets"
};

const ControlScale = () => (
  <FlexColumn gap={4} sx={{ maxWidth: 720 }}>
    <FlexRow gap={3} align="flex-end" wrap>
      {Object.entries(CONTROL.height).map(([token, height]) => (
        <FlexColumn key={token} gap={1} align="center">
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
        </FlexColumn>
      ))}
    </FlexRow>
    <FlexRow gap={3} wrap>
      {Object.entries(CONTROL.paddingX).map(([token, padding]) => (
        <FlexColumn key={token} gap={1} align="center">
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
        </FlexColumn>
      ))}
    </FlexRow>
  </FlexColumn>
);

const meta = {
  title: "Design Tokens/Control",
  component: ControlScale,
  parameters: { layout: "padded" }
} satisfies Meta<typeof ControlScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {};
